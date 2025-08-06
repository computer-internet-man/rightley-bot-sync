#!/usr/bin/env node

/**
 * Simple test script to verify role-based access control
 * This simulates different users with different roles accessing the application
 */

console.log('🧪 Testing Role-Based Access Control\n');

// Mock JWT payloads for different user roles
const testUsers = {
  staff: {
    email: 'staff@clinic.com',
    role: 'staff',
    sub: 'staff-user-123'
  },
  reviewer: {
    email: 'reviewer@clinic.com', 
    role: 'reviewer',
    sub: 'reviewer-user-123'
  },
  doctor: {
    email: 'doctor@clinic.com',
    role: 'doctor', 
    sub: 'doctor-user-123'
  },
  auditor: {
    email: 'auditor@clinic.com',
    role: 'auditor',
    sub: 'auditor-user-123'
  },
  admin: {
    email: 'admin@clinic.com',
    role: 'admin',
    sub: 'admin-user-123'
  }
};

// Routes to test access for each role
const testRoutes = [
  { path: '/login', description: 'Login page (public)', allowedRoles: ['all'] },
  { path: '/draft', description: 'Draft workflow', allowedRoles: ['staff', 'reviewer', 'doctor', 'admin'] },
  { path: '/doctor/settings', description: 'Doctor settings', allowedRoles: ['doctor'] },
  { path: '/admin/briefs', description: 'Patient briefs', allowedRoles: ['doctor', 'admin'] },
  { path: '/admin/audit', description: 'Audit logs', allowedRoles: ['auditor', 'admin'] }
];

async function testRoleAccess(userType, route) {
  const user = testUsers[userType];
  const mockJWT = btoa(JSON.stringify(user)); // Base64 encode the payload
  
  try {
    const response = await fetch(`http://localhost:5173${route.path}`, {
      headers: {
        'Cf-Access-Jwt-Assertion': mockJWT
      }
    });
    
    const shouldHaveAccess = route.allowedRoles.includes('all') || route.allowedRoles.includes(userType);
    const hasAccess = response.status === 200;
    
    const status = hasAccess === shouldHaveAccess ? '✅' : '❌';
    const accessText = hasAccess ? 'ALLOWED' : 'DENIED';
    
    console.log(`${status} ${userType.padEnd(8)} → ${route.path.padEnd(18)} | ${accessText.padEnd(7)} | ${route.description}`);
    
    return hasAccess === shouldHaveAccess;
  } catch (error) {
    console.log(`❌ ${userType.padEnd(8)} → ${route.path.padEnd(18)} | ERROR   | ${error.message}`);
    return false;
  }
}

async function runTests() {
  let passed = 0;
  let total = 0;
  
  console.log('User     | Route              | Access  | Description');
  console.log('---------|--------------------|---------|---------------------------------');
  
  for (const route of testRoutes) {
    for (const userType of Object.keys(testUsers)) {
      const result = await testRoleAccess(userType, route);
      if (result) passed++;
      total++;
    }
    console.log(''); // Add spacing between route groups
  }
  
  console.log(`\n🎯 Test Results: ${passed}/${total} passed (${Math.round(passed/total*100)}%)`);
  
  if (passed === total) {
    console.log('🎉 All role-based access controls working correctly!');
  } else {
    console.log('⚠️  Some access control issues detected. Please review the implementation.');
  }
}

// Check if server is running first
async function checkServer() {
  try {
    const response = await fetch('http://localhost:5173/');
    return response.status;
  } catch (error) {
    console.log('❌ Development server not running. Please start with: pnpm run dev');
    console.log('   Then run this test script again.\n');
    process.exit(1);
  }
}

// Main execution
(async () => {
  await checkServer();
  console.log('✅ Development server is running\n');
  await runTests();
})();
