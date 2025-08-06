#!/usr/bin/env node

/**
 * Comprehensive End-to-End Test Suite for AI Concierge MVP
 * Tests all workflows, role-based access, API endpoints, and security
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5173';
const TEST_RESULTS = [];

// Test user tokens for different roles
const TEST_USERS = {
  staff: { email: 'alice@clinic.com', role: 'staff' },
  reviewer: { email: 'carol@clinic.com', role: 'reviewer' },
  doctor: { email: 'smith@clinic.com', role: 'doctor' },
  admin: { email: 'jane@clinic.com', role: 'admin' },
  auditor: { email: 'mike@clinic.com', role: 'auditor' }
};

// Create mock JWT tokens for testing
function createMockJWT(email) {
  const payload = { email };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `header.${encoded}.signature`;
}

// Helper function to make authenticated requests
async function authenticatedRequest(userType, endpoint, options = {}) {
  const user = TEST_USERS[userType];
  const token = createMockJWT(user.email);
  
  const defaultOptions = {
    headers: {
      'Cf-Access-Jwt-Assertion': token,
      'Content-Type': 'application/json',
      ...options.headers
    }
  };

  return fetch(`${BASE_URL}${endpoint}`, { ...defaultOptions, ...options });
}

// Test result tracking
function logTest(testName, success, details = '') {
  const result = { testName, success, details, timestamp: new Date().toISOString() };
  TEST_RESULTS.push(result);
  
  const status = success ? '✅' : '❌';
  console.log(`${status} ${testName}${details ? ': ' + details : ''}`);
  
  return success;
}

// Security test helper
async function testUnauthorizedAccess(endpoint, method = 'GET') {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, { method });
    const isUnauthorized = response.status === 401 || response.status === 403;
    return logTest(`Unauthorized access blocked for ${endpoint}`, isUnauthorized, 
      `Status: ${response.status}`);
  } catch (error) {
    return logTest(`Unauthorized access test for ${endpoint}`, false, error.message);
  }
}

// Role-based access test helper
async function testRoleAccess(userType, endpoint, shouldHaveAccess, method = 'GET') {
  try {
    const response = await authenticatedRequest(userType, endpoint, { method });
    const hasAccess = response.status < 400;
    const testPassed = hasAccess === shouldHaveAccess;
    
    return logTest(
      `${userType.toUpperCase()} access to ${endpoint}`, 
      testPassed,
      `Expected: ${shouldHaveAccess ? 'ALLOWED' : 'DENIED'}, Got: ${hasAccess ? 'ALLOWED' : 'DENIED'} (${response.status})`
    );
  } catch (error) {
    return logTest(`Role access test ${userType} -> ${endpoint}`, false, error.message);
  }
}

// 1. Test Complete Workflow Functions
async function testCompleteWorkflows() {
  console.log('\n🔄 Testing Complete User Workflows');
  console.log('=====================================');

  // Test Staff Workflow: Login → Select Patient → Generate Draft → Edit → Submit for Review
  console.log('\n📝 Testing Staff Workflow');
  
  // 1. Access draft page
  let success = await testRoleAccess('staff', '/draft', true);
  
  // 2. Test draft generation API
  if (success) {
    try {
      const draftResponse = await authenticatedRequest('staff', '/api/generate-draft', {
        method: 'POST',
        body: JSON.stringify({
          patientId: 'sample-patient-id',
          requestText: 'Patient asking about medication side effects'
        })
      });
      
      success = logTest('Staff draft generation', draftResponse.ok, 
        `Status: ${draftResponse.status}`);
      
      if (draftResponse.ok) {
        const draftData = await draftResponse.json();
        logTest('Draft response contains message', !!draftData.message);
      }
    } catch (error) {
      logTest('Staff draft generation', false, error.message);
    }
  }

  // 3. Test message workflow submission
  if (success) {
    try {
      const submitResponse = await authenticatedRequest('staff', '/api/message-workflow/submit-for-review', {
        method: 'POST',
        body: JSON.stringify({
          patientId: 'sample-patient-id',
          messageContent: 'Test message for review',
          requestText: 'Original patient request'
        })
      });
      
      logTest('Staff message submission for review', submitResponse.ok, 
        `Status: ${submitResponse.status}`);
    } catch (error) {
      logTest('Staff message submission', false, error.message);
    }
  }

  // Test Reviewer Workflow: Review Queue → Approve/Reject → Send Message
  console.log('\n👥 Testing Reviewer Workflow');
  
  await testRoleAccess('reviewer', '/review', true);
  
  try {
    const pendingResponse = await authenticatedRequest('reviewer', '/api/message-workflow/pending-review');
    logTest('Reviewer can access pending reviews', pendingResponse.ok, 
      `Status: ${pendingResponse.status}`);
  } catch (error) {
    logTest('Reviewer pending reviews access', false, error.message);
  }

  // Test Doctor Workflow: Login → Manage Settings → Create Patient Briefs → Generate/Send Directly
  console.log('\n👨‍⚕️ Testing Doctor Workflow');
  
  await testRoleAccess('doctor', '/doctor/settings', true);
  await testRoleAccess('doctor', '/admin/briefs', true);
  
  try {
    const directSendResponse = await authenticatedRequest('doctor', '/api/message-workflow/send-directly', {
      method: 'POST',
      body: JSON.stringify({
        patientId: 'sample-patient-id',
        messageContent: 'Direct message from doctor',
        requestText: 'Doctor consultation'
      })
    });
    
    logTest('Doctor direct message sending', directSendResponse.ok, 
      `Status: ${directSendResponse.status}`);
  } catch (error) {
    logTest('Doctor direct sending', false, error.message);
  }

  // Test Admin Workflow: Manage All Data → View Audit Logs → Export Compliance Reports
  console.log('\n👑 Testing Admin Workflow');
  
  await testRoleAccess('admin', '/admin', true);
  await testRoleAccess('admin', '/admin/audit', true);
  await testRoleAccess('admin', '/admin/briefs', true);

  // Test Auditor Workflow: Access Audit Logs → Generate Reports → Review Compliance Data
  console.log('\n🔍 Testing Auditor Workflow');
  
  await testRoleAccess('auditor', '/admin/audit', true);
  
  try {
    const auditResponse = await authenticatedRequest('auditor', '/api/audit-logs');
    logTest('Auditor can access audit logs', auditResponse.ok, 
      `Status: ${auditResponse.status}`);
    
    const exportResponse = await authenticatedRequest('auditor', '/api/audit-export/export', {
      method: 'POST',
      body: JSON.stringify({
        format: 'csv',
        includeContent: true
      })
    });
    
    logTest('Auditor can export audit data', exportResponse.ok, 
      `Status: ${exportResponse.status}`);
  } catch (error) {
    logTest('Auditor workflow', false, error.message);
  }
}

// 2. Test Role-Based Access Control
async function testRoleBasedAccess() {
  console.log('\n🔐 Testing Role-Based Access Control');
  console.log('=====================================');

  const accessTests = [
    // Staff permissions
    { user: 'staff', endpoint: '/draft', allowed: true },
    { user: 'staff', endpoint: '/doctor/settings', allowed: false },
    { user: 'staff', endpoint: '/admin', allowed: false },
    { user: 'staff', endpoint: '/admin/audit', allowed: false },

    // Reviewer permissions
    { user: 'reviewer', endpoint: '/review', allowed: true },
    { user: 'reviewer', endpoint: '/draft', allowed: true }, // Reviewer > Staff
    { user: 'reviewer', endpoint: '/admin', allowed: false },

    // Doctor permissions
    { user: 'doctor', endpoint: '/doctor/settings', allowed: true },
    { user: 'doctor', endpoint: '/admin/briefs', allowed: true },
    { user: 'doctor', endpoint: '/draft', allowed: true }, // Doctor > Staff
    { user: 'doctor', endpoint: '/admin', allowed: false },

    // Admin permissions
    { user: 'admin', endpoint: '/admin', allowed: true },
    { user: 'admin', endpoint: '/admin/audit', allowed: true },
    { user: 'admin', endpoint: '/doctor/settings', allowed: true },
    { user: 'admin', endpoint: '/draft', allowed: true },

    // Auditor permissions
    { user: 'auditor', endpoint: '/admin/audit', allowed: true },
    { user: 'auditor', endpoint: '/admin', allowed: false },
    { user: 'auditor', endpoint: '/draft', allowed: true }, // Auditor > Staff
  ];

  for (const test of accessTests) {
    await testRoleAccess(test.user, test.endpoint, test.allowed);
  }
}

// 3. Test API Security
async function testAPISecurity() {
  console.log('\n🛡️ Testing API Security');
  console.log('=========================');

  // Test unauthorized access to all API endpoints
  const apiEndpoints = [
    '/api/generate-draft',
    '/api/message-workflow/submit-for-review',
    '/api/message-workflow/review',
    '/api/message-workflow/send-directly',
    '/api/message-workflow/pending-review',
    '/api/audit-logs',
    '/api/audit-export/export'
  ];

  for (const endpoint of apiEndpoints) {
    await testUnauthorizedAccess(endpoint, 'POST');
    await testUnauthorizedAccess(endpoint, 'GET');
  }

  // Test role-specific API access
  const apiAccessTests = [
    { user: 'staff', endpoint: '/api/generate-draft', allowed: true, method: 'POST' },
    { user: 'staff', endpoint: '/api/audit-export/export', allowed: false, method: 'POST' },
    { user: 'auditor', endpoint: '/api/audit-export/export', allowed: true, method: 'POST' },
    { user: 'doctor', endpoint: '/api/message-workflow/send-directly', allowed: true, method: 'POST' },
    { user: 'staff', endpoint: '/api/message-workflow/send-directly', allowed: false, method: 'POST' },
  ];

  for (const test of apiAccessTests) {
    await testRoleAccess(test.user, test.endpoint, test.allowed, test.method);
  }
}

// 4. Test Input Validation and Error Handling
async function testInputValidationAndErrorHandling() {
  console.log('\n🔍 Testing Input Validation and Error Handling');
  console.log('===============================================');

  // Test invalid input to draft generation
  try {
    const invalidDraftResponse = await authenticatedRequest('staff', '/api/generate-draft', {
      method: 'POST',
      body: JSON.stringify({
        // Missing required fields
      })
    });
    
    logTest('Invalid input rejected for draft generation', 
      !invalidDraftResponse.ok, 
      `Status: ${invalidDraftResponse.status}`);
  } catch (error) {
    logTest('Draft generation error handling', true, 'Request properly rejected');
  }

  // Test invalid input to message workflow
  try {
    const invalidSubmissionResponse = await authenticatedRequest('staff', '/api/message-workflow/submit-for-review', {
      method: 'POST',
      body: JSON.stringify({
        patientId: '', // Invalid empty ID
        messageContent: '', // Invalid empty content
      })
    });
    
    logTest('Invalid message submission rejected', 
      !invalidSubmissionResponse.ok, 
      `Status: ${invalidSubmissionResponse.status}`);
  } catch (error) {
    logTest('Message workflow error handling', true, 'Request properly rejected');
  }

  // Test malformed JSON
  try {
    const malformedResponse = await authenticatedRequest('staff', '/api/generate-draft', {
      method: 'POST',
      body: 'invalid json'
    });
    
    logTest('Malformed JSON rejected', 
      !malformedResponse.ok, 
      `Status: ${malformedResponse.status}`);
  } catch (error) {
    logTest('Malformed JSON handling', true, 'Request properly rejected');
  }
}

// 5. Test Database Operations and Data Integrity
async function testDatabaseOperations() {
  console.log('\n💾 Testing Database Operations and Data Integrity');
  console.log('=================================================');

  // Test audit log creation and retrieval
  try {
    const auditLogResponse = await authenticatedRequest('auditor', '/api/audit-logs');
    const success = auditLogResponse.ok;
    
    logTest('Audit log retrieval', success, `Status: ${auditLogResponse.status}`);
    
    if (success) {
      const auditData = await auditLogResponse.json();
      logTest('Audit log data structure', Array.isArray(auditData.logs), 
        `Data type: ${typeof auditData}`);
    }
  } catch (error) {
    logTest('Database audit log test', false, error.message);
  }

  // Test data export integrity
  try {
    const exportResponse = await authenticatedRequest('auditor', '/api/audit-export/export', {
      method: 'POST',
      body: JSON.stringify({
        format: 'json',
        includeContent: true,
        startDate: '2024-01-01',
        endDate: '2025-12-31'
      })
    });
    
    logTest('Data export functionality', exportResponse.ok, 
      `Status: ${exportResponse.status}`);
  } catch (error) {
    logTest('Data export test', false, error.message);
  }
}

// 6. Test Performance and Load Handling
async function testPerformance() {
  console.log('\n⚡ Testing Performance and Load Handling');
  console.log('========================================');

  // Test concurrent requests
  const concurrentPromises = Array.from({ length: 5 }, (_, i) => 
    authenticatedRequest('staff', '/api/audit-logs').then(response => ({
      index: i,
      success: response.ok,
      status: response.status,
      time: Date.now()
    }))
  );

  try {
    const startTime = Date.now();
    const results = await Promise.all(concurrentPromises);
    const endTime = Date.now();
    
    const allSuccessful = results.every(r => r.success);
    const totalTime = endTime - startTime;
    
    logTest('Concurrent request handling', allSuccessful, 
      `${results.length} requests in ${totalTime}ms`);
    
    logTest('Performance under load', totalTime < 5000, 
      `Response time: ${totalTime}ms`);
  } catch (error) {
    logTest('Concurrent request test', false, error.message);
  }

  // Test large data handling
  try {
    const largeDataResponse = await authenticatedRequest('auditor', '/api/audit-logs?limit=100');
    logTest('Large data set handling', largeDataResponse.ok, 
      `Status: ${largeDataResponse.status}`);
  } catch (error) {
    logTest('Large data test', false, error.message);
  }
}

// Main test execution
async function runComprehensiveTests() {
  console.log('🧪 AI CONCIERGE MVP - COMPREHENSIVE TEST SUITE');
  console.log('==============================================');
  console.log(`Testing application at: ${BASE_URL}`);
  console.log(`Test started at: ${new Date().toISOString()}\n`);

  // Wait for server to be ready
  console.log('⏳ Checking if server is ready...');
  try {
    const healthCheck = await fetch(BASE_URL);
    if (!healthCheck.ok) {
      console.log('❌ Server not responding. Make sure to run: pnpm run dev');
      process.exit(1);
    }
    console.log('✅ Server is ready\n');
  } catch (error) {
    console.log('❌ Cannot connect to server. Make sure to run: pnpm run dev');
    console.log(`Error: ${error.message}`);
    process.exit(1);
  }

  try {
    await testCompleteWorkflows();
    await testRoleBasedAccess();
    await testAPISecurity();
    await testInputValidationAndErrorHandling();
    await testDatabaseOperations();
    await testPerformance();

    // Generate test report
    console.log('\n📊 TEST SUMMARY');
    console.log('================');
    
    const totalTests = TEST_RESULTS.length;
    const passedTests = TEST_RESULTS.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = ((passedTests / totalTests) * 100).toFixed(1);

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${successRate}%`);

    if (failedTests > 0) {
      console.log('\n❌ FAILED TESTS:');
      TEST_RESULTS.filter(r => !r.success).forEach(test => {
        console.log(`  - ${test.testName}: ${test.details}`);
      });
    }

    console.log(`\n🏁 Testing completed at: ${new Date().toISOString()}`);
    
    // Exit with error code if any tests failed
    process.exit(failedTests > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('❌ Test suite failed with error:', error);
    process.exit(1);
  }
}

// Export for potential external use
export { runComprehensiveTests, TEST_USERS, createMockJWT };

// Run tests if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runComprehensiveTests();
}
