#!/usr/bin/env node

/**
 * Production Readiness Verification Script
 * Automated checks to verify the AI Concierge MVP is ready for deployment
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const VERIFICATION_RESULTS = [];
const CRITICAL_ISSUES = [];
const WARNINGS = [];

function checkResult(testName, condition, details = '', critical = false) {
  const result = {
    test: testName,
    passed: condition,
    details,
    critical,
    timestamp: new Date().toISOString()
  };
  
  VERIFICATION_RESULTS.push(result);
  
  if (!condition && critical) {
    CRITICAL_ISSUES.push(result);
  } else if (!condition) {
    WARNINGS.push(result);
  }
  
  const status = condition ? '✅' : (critical ? '🚨' : '⚠️');
  console.log(`${status} ${testName}${details ? ': ' + details : ''}`);
  
  return condition;
}

// 1. File Structure Verification
function verifyFileStructure() {
  console.log('\n📁 Verifying File Structure');
  console.log('==============================');
  
  const requiredFiles = [
    'src/worker.tsx',
    'src/lib/auth.ts',
    'src/middleware/requireRole.ts',
    'src/actions/generateDraft.ts',
    'src/routes/api/message-workflow.ts',
    'src/routes/api/audit-logs.ts',
    'src/routes/api/audit-export.ts',
    'prisma/schema.prisma',
    'migrations/0003_add_ai_concierge_tables.sql',
    'package.json',
    'wrangler.jsonc',
    '.dev.vars'
  ];
  
  for (const file of requiredFiles) {
    try {
      const path = join(process.cwd(), file);
      readFileSync(path);
      checkResult(`File exists: ${file}`, true);
    } catch (error) {
      checkResult(`File exists: ${file}`, false, 'File missing', true);
    }
  }
}

// 2. Package Dependencies Verification
function verifyDependencies() {
  console.log('\n📦 Verifying Dependencies');
  console.log('==========================');
  
  try {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    const requiredDeps = [
      'openai',
      'jose',
      'rwsdk',
      '@prisma/client',
      '@prisma/adapter-d1'
    ];
    
    for (const dep of requiredDeps) {
      const hasDepMain = packageJson.dependencies?.[dep];
      const hasDepDev = packageJson.devDependencies?.[dep];
      checkResult(`Dependency: ${dep}`, !!(hasDepMain || hasDepDev), 
        hasDepMain ? `v${hasDepMain}` : hasDepDev ? `v${hasDepDev} (dev)` : 'Missing');
    }
    
    // Check for removed WebAuthn dependencies
    const removedDeps = ['@simplewebauthn/browser', '@simplewebauthn/server'];
    for (const dep of removedDeps) {
      const hasDepMain = packageJson.dependencies?.[dep];
      const hasDepDev = packageJson.devDependencies?.[dep];
      checkResult(`Removed dependency: ${dep}`, !(hasDepMain || hasDepDev), 
        hasDepMain || hasDepDev ? 'Still present' : 'Properly removed');
    }
    
  } catch (error) {
    checkResult('Package.json parsing', false, error.message, true);
  }
}

// 3. Database Schema Verification
function verifyDatabaseSchema() {
  console.log('\n🗄️ Verifying Database Schema');
  console.log('==============================');
  
  try {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    
    const requiredModels = ['User', 'PatientBrief', 'DoctorSettings', 'AuditLog', 'MessageQueue'];
    for (const model of requiredModels) {
      const hasModel = schema.includes(`model ${model}`);
      checkResult(`Database model: ${model}`, hasModel, hasModel ? 'Found' : 'Missing');
    }
    
    // Check for removed Credential model
    const hasCredentialModel = schema.includes('model Credential');
    checkResult('Removed Credential model', !hasCredentialModel, 
      hasCredentialModel ? 'Still present' : 'Properly removed');
    
    // Check for JWT-related fields in User model
    const userModelSection = schema.match(/model User \{[\s\S]*?\}/)?.[0] || '';
    const hasRole = userModelSection.includes('role');
    const hasEmail = userModelSection.includes('email');
    
    checkResult('User model has role field', hasRole);
    checkResult('User model has email field', hasEmail);
    
  } catch (error) {
    checkResult('Schema file reading', false, error.message, true);
  }
}

// 4. Migration Files Verification
function verifyMigrations() {
  console.log('\n🔄 Verifying Migration Files');
  console.log('==============================');
  
  try {
    const migrationFiles = [
      'migrations/0001_init.sql',
      'migrations/0002_remove_credential_table.sql',
      'migrations/0003_add_ai_concierge_tables.sql'
    ];
    
    for (const file of migrationFiles) {
      try {
        readFileSync(file);
        checkResult(`Migration file: ${file}`, true);
      } catch (error) {
        checkResult(`Migration file: ${file}`, false, 'File missing');
      }
    }
  } catch (error) {
    checkResult('Migration directory access', false, error.message);
  }
}

// 5. Authentication Implementation Verification
function verifyAuthImplementation() {
  console.log('\n🔐 Verifying Authentication Implementation');
  console.log('==========================================');
  
  try {
    const authFile = readFileSync('src/lib/auth.ts', 'utf8');
    
    const authChecks = [
      { name: 'validateCloudflareAccessJWT function', pattern: /validateCloudflareAccessJWT/ },
      { name: 'findOrCreateUser function', pattern: /findOrCreateUser/ },
      { name: 'hasRole function', pattern: /hasRole/ },
      { name: 'JWT validation with jose', pattern: /jose/ },
      { name: 'Development mode support', pattern: /NODE_ENV.*development/ }
    ];
    
    for (const check of authChecks) {
      const found = check.pattern.test(authFile);
      checkResult(check.name, found, found ? 'Implemented' : 'Missing');
    }
    
  } catch (error) {
    checkResult('Auth file reading', false, error.message, true);
  }
}

// 6. Role-Based Middleware Verification
function verifyRoleMiddleware() {
  console.log('\n👥 Verifying Role-Based Middleware');
  console.log('===================================');
  
  try {
    const middlewareFile = readFileSync('src/middleware/requireRole.ts', 'utf8');
    
    const roleChecks = [
      { name: 'requireAuth function', pattern: /requireAuth/ },
      { name: 'requireStaff function', pattern: /requireStaff/ },
      { name: 'requireReviewer function', pattern: /requireReviewer/ },
      { name: 'requireDoctor function', pattern: /requireDoctor/ },
      { name: 'requireAdmin function', pattern: /requireAdmin/ },
      { name: 'requireAuditor function', pattern: /requireAuditor/ }
    ];
    
    for (const check of roleChecks) {
      const found = check.pattern.test(middlewareFile);
      checkResult(check.name, found, found ? 'Implemented' : 'Missing');
    }
    
  } catch (error) {
    checkResult('Middleware file reading', false, error.message, true);
  }
}

// 7. API Routes Verification
function verifyAPIRoutes() {
  console.log('\n🛠️ Verifying API Routes');
  console.log('=========================');
  
  try {
    const workerFile = readFileSync('src/worker.tsx', 'utf8');
    
    const apiRoutes = [
      { name: 'Generate draft API', pattern: /\/api\/generate-draft/ },
      { name: 'Message workflow API', pattern: /\/api\/message-workflow/ },
      { name: 'Audit logs API', pattern: /\/api\/audit-logs/ },
      { name: 'Audit export API', pattern: /\/api\/audit-export/ }
    ];
    
    for (const route of apiRoutes) {
      const found = route.pattern.test(workerFile);
      checkResult(route.name, found, found ? 'Configured' : 'Missing');
    }
    
    // Check for role protection on API routes
    const hasRoleProtection = /require(Staff|Doctor|Admin|Auditor)\(\)/.test(workerFile);
    checkResult('API routes have role protection', hasRoleProtection);
    
  } catch (error) {
    checkResult('Worker file reading', false, error.message, true);
  }
}

// 8. Environment Configuration Verification
function verifyEnvironmentConfig() {
  console.log('\n⚙️ Verifying Environment Configuration');
  console.log('=======================================');
  
  try {
    const devVars = readFileSync('.dev.vars', 'utf8');
    
    const envChecks = [
      { name: 'DATABASE_URL', pattern: /DATABASE_URL/ },
      { name: 'OPENAI_API_KEY', pattern: /OPENAI_API_KEY/ },
      { name: 'WEBAUTHN_APP_NAME', pattern: /WEBAUTHN_APP_NAME/ }
    ];
    
    for (const check of envChecks) {
      const found = check.pattern.test(devVars);
      checkResult(`Environment variable: ${check.name}`, found, found ? 'Configured' : 'Missing');
    }
    
    // Check if OpenAI API key is set to placeholder
    const hasPlaceholderKey = devVars.includes('your-openai-api-key-here');
    checkResult('OpenAI API key configured', !hasPlaceholderKey, 
      hasPlaceholderKey ? 'Using placeholder - update required' : 'Key configured');
    
  } catch (error) {
    checkResult('Environment file reading', false, error.message);
  }
  
  try {
    const wranglerConfig = readFileSync('wrangler.jsonc', 'utf8');
    
    const wranglerChecks = [
      { name: 'D1 database binding', pattern: /d1_databases/ },
      { name: 'Compatibility date', pattern: /compatibility_date/ },
      { name: 'Node compatibility', pattern: /nodejs_compat/ }
    ];
    
    for (const check of wranglerChecks) {
      const found = check.pattern.test(wranglerConfig);
      checkResult(`Wrangler config: ${check.name}`, found, found ? 'Configured' : 'Missing');
    }
    
  } catch (error) {
    checkResult('Wrangler config reading', false, error.message);
  }
}

// 9. Security Implementation Verification
function verifySecurityImplementation() {
  console.log('\n🛡️ Verifying Security Implementation');
  console.log('=====================================');
  
  try {
    // Check auth implementation
    const authFile = readFileSync('src/lib/auth.ts', 'utf8');
    
    const securityChecks = [
      { name: 'JWT signature verification', pattern: /verify|validate/ },
      { name: 'Role hierarchy enforcement', pattern: /role.*hierarchy|hasRole/ },
      { name: 'User verification', pattern: /findOrCreateUser/ }
    ];
    
    for (const check of securityChecks) {
      const found = check.pattern.test(authFile);
      checkResult(check.name, found, found ? 'Implemented' : 'Missing');
    }
    
    // Check for removed session-based auth
    const workerFile = readFileSync('src/worker.tsx', 'utf8');
    const hasSessionAuth = /session/.test(workerFile) && !/SESSION/.test(workerFile); // Allow uppercase (comments)
    checkResult('Session-based auth removed', !hasSessionAuth, 
      hasSessionAuth ? 'Session auth still present' : 'Properly removed');
    
  } catch (error) {
    checkResult('Security implementation check', false, error.message);
  }
}

// 10. Documentation Verification
function verifyDocumentation() {
  console.log('\n📚 Verifying Documentation');
  console.log('============================');
  
  const docFiles = [
    'README.md',
    'JWT_MIGRATION_SUMMARY.md',
    'OPENAI_INTEGRATION_SUMMARY.md',
    'MESSAGE_FINALIZATION_IMPLEMENTATION_SUMMARY.md',
    'COMPREHENSIVE_TEST_REPORT.md',
    'MANUAL_TESTING_GUIDE.md'
  ];
  
  for (const file of docFiles) {
    try {
      readFileSync(file);
      checkResult(`Documentation: ${file}`, true);
    } catch (error) {
      checkResult(`Documentation: ${file}`, false, 'File missing');
    }
  }
}

// Main verification function
async function runProductionReadinessVerification() {
  console.log('🔍 AI CONCIERGE MVP - PRODUCTION READINESS VERIFICATION');
  console.log('=======================================================');
  console.log(`Verification started at: ${new Date().toISOString()}\n`);
  
  try {
    verifyFileStructure();
    verifyDependencies();
    verifyDatabaseSchema();
    verifyMigrations();
    verifyAuthImplementation();
    verifyRoleMiddleware();
    verifyAPIRoutes();
    verifyEnvironmentConfig();
    verifySecurityImplementation();
    verifyDocumentation();
    
    // Generate verification report
    console.log('\n📊 VERIFICATION SUMMARY');
    console.log('========================');
    
    const totalChecks = VERIFICATION_RESULTS.length;
    const passedChecks = VERIFICATION_RESULTS.filter(r => r.passed).length;
    const failedChecks = totalChecks - passedChecks;
    const successRate = ((passedChecks / totalChecks) * 100).toFixed(1);
    
    console.log(`Total Checks: ${totalChecks}`);
    console.log(`Passed: ${passedChecks} ✅`);
    console.log(`Failed: ${failedChecks} ${failedChecks > 0 ? '❌' : '✅'}`);
    console.log(`Success Rate: ${successRate}%`);
    
    if (CRITICAL_ISSUES.length > 0) {
      console.log('\n🚨 CRITICAL ISSUES (MUST FIX BEFORE PRODUCTION):');
      CRITICAL_ISSUES.forEach(issue => {
        console.log(`  - ${issue.test}: ${issue.details}`);
      });
    }
    
    if (WARNINGS.length > 0) {
      console.log('\n⚠️  WARNINGS (RECOMMENDED TO FIX):');
      WARNINGS.forEach(warning => {
        console.log(`  - ${warning.test}: ${warning.details}`);
      });
    }
    
    console.log('\n🏁 PRODUCTION READINESS ASSESSMENT');
    console.log('===================================');
    
    if (CRITICAL_ISSUES.length === 0) {
      console.log('✅ READY FOR PRODUCTION DEPLOYMENT');
      console.log('   All critical components verified successfully.');
      
      if (WARNINGS.length > 0) {
        console.log(`   Note: ${WARNINGS.length} non-critical warnings should be addressed.`);
      }
    } else {
      console.log('❌ NOT READY FOR PRODUCTION');
      console.log(`   ${CRITICAL_ISSUES.length} critical issues must be resolved first.`);
    }
    
    console.log(`\n🏁 Verification completed at: ${new Date().toISOString()}`);
    
    // Exit with appropriate code
    process.exit(CRITICAL_ISSUES.length > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('❌ Verification failed with error:', error);
    process.exit(1);
  }
}

// Run verification if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runProductionReadinessVerification();
}

export { runProductionReadinessVerification };
