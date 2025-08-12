#!/usr/bin/env node

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testEndpoint(name, url, options = {}) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (response.ok && data.success !== false) {
      log(colors.green, `✓ ${name} - Success`);
      return { success: true, data };
    } else {
      log(colors.red, `✗ ${name} - Failed: ${data.error || 'Unknown error'}`);
      return { success: false, data };
    }
  } catch (error) {
    log(colors.red, `✗ ${name} - Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testOpenAIIntegration() {
  log(colors.blue, '\n🤖 OpenAI Integration Test Suite\n');

  const baseUrl = 'http://localhost:5173';
  
  // Test 1: OpenAI Configuration
  log(colors.yellow, '1. Testing OpenAI Configuration...');
  const configResult = await testEndpoint(
    'OpenAI Config', 
    `${baseUrl}/debug/openai-config`
  );

  // Test 2: OpenAI Stub Mode
  log(colors.yellow, '\n2. Testing OpenAI Stub Mode...');
  const stubResult = await testEndpoint(
    'OpenAI Stub Test', 
    `${baseUrl}/debug/openai-stub`
  );

  // Test 3: Usage Statistics
  log(colors.yellow, '\n3. Testing Usage Statistics...');
  const usageResult = await testEndpoint(
    'Usage Statistics', 
    `${baseUrl}/debug/openai-usage`
  );

  // Test 4: API Draft Generation with Stub
  log(colors.yellow, '\n4. Testing API Draft Generation (Stub Mode)...');
  const draftResult = await testEndpoint(
    'Draft Generation API', 
    `${baseUrl}/api/generate-draft`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        patientInquiry: "I'm experiencing side effects from my medication",
        patientId: "550e8400-e29b-41d4-a716-446655440100",
        userId: "550e8400-e29b-41d4-a716-446655440000"
      })
    }
  );

  // Test 5: Different inquiry types
  log(colors.yellow, '\n5. Testing Different Inquiry Types...');
  
  const inquiryTypes = [
    "I need to schedule an appointment",
    "Can you refill my prescription?", 
    "I have questions about my diabetes management"
  ];

  for (const inquiry of inquiryTypes) {
    const result = await testEndpoint(
      `Draft for: "${inquiry.substring(0, 30)}..."`,
      `${baseUrl}/api/generate-draft`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientInquiry: inquiry,
          patientId: "550e8400-e29b-41d4-a716-446655440100",
          userId: "550e8400-e29b-41d4-a716-446655440000"
        })
      }
    );
    
    if (result.success && result.data.draft) {
      log(colors.green, `  Word count: ${result.data.wordCount || 'N/A'}`);
      log(colors.green, `  Model: ${result.data.model || 'N/A'}`);
      log(colors.green, `  Stubbed: ${result.data.isStubbed ? 'Yes' : 'No'}`);
    }
  }

  // Test 6: Rate Limiting (multiple rapid requests)
  log(colors.yellow, '\n6. Testing Rate Limiting...');
  const rapidRequests = [];
  for (let i = 0; i < 5; i++) {
    rapidRequests.push(
      testEndpoint(
        `Rapid Request ${i + 1}`,
        `${baseUrl}/api/generate-draft`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            patientInquiry: `Test request ${i + 1} for rate limiting`,
            patientId: "550e8400-e29b-41d4-a716-446655440100",
            userId: "550e8400-e29b-41d4-a716-446655440000"
          })
        }
      )
    );
  }

  const rapidResults = await Promise.all(rapidRequests);
  const successfulRapidRequests = rapidResults.filter(r => r.success).length;
  log(colors.green, `  Successful rapid requests: ${successfulRapidRequests}/5`);

  // Summary
  log(colors.blue, '\n📊 Test Summary:');
  const allTests = [
    configResult,
    stubResult, 
    usageResult,
    draftResult,
    ...rapidResults
  ];
  
  const successfulTests = allTests.filter(r => r.success).length;
  const totalTests = allTests.length;
  
  log(colors.green, `✓ Successful: ${successfulTests}/${totalTests}`);
  log(colors.red, `✗ Failed: ${totalTests - successfulTests}/${totalTests}`);
  
  if (successfulTests === totalTests) {
    log(colors.green, '\n🎉 All tests passed! OpenAI integration is working correctly.');
  } else if (successfulTests > totalTests * 0.7) {
    log(colors.yellow, '\n⚠️  Most tests passed. Check failed tests above.');
  } else {
    log(colors.red, '\n❌ Many tests failed. OpenAI integration needs attention.');
  }

  // Show sample generated draft
  if (draftResult.success && draftResult.data.draft) {
    log(colors.blue, '\n📝 Sample Generated Draft:');
    console.log('---');
    console.log(draftResult.data.draft.substring(0, 300) + '...');
    console.log('---');
  }
}

// Run the tests
testOpenAIIntegration().catch(console.error);
