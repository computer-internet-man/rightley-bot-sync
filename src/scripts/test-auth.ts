import { defineScript } from "rwsdk/worker";
import { validateCloudflareAccessJWT, findOrCreateUser, hasRole } from "@/lib/auth";
import { db, setupDb } from "@/db";
import { env } from "cloudflare:workers";

export default defineScript(async () => {
  await setupDb(env);
  
  console.log("🧪 Testing JWT Authentication and Role-Based Access Control");
  console.log("================================================================");

  // Test 1: JWT validation with valid mock token
  console.log("\n📝 Test 1: JWT validation with valid mock token");
  const mockJWTPayload = {
    email: "alice@clinic.com",
    sub: "test-user-123",
    iss: "test-issuer",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const mockJWT = "header." + btoa(JSON.stringify(mockJWTPayload)) + ".signature";
  
  const mockRequest = new Request("http://localhost:8787", {
    headers: { "Cf-Access-Jwt-Assertion": mockJWT },
  });

  const jwtUser = await validateCloudflareAccessJWT(mockRequest);
  if (jwtUser && jwtUser.email === "alice@clinic.com") {
    console.log("✅ JWT validation successful for alice@clinic.com");
  } else {
    console.log("❌ JWT validation failed");
    return;
  }

  // Test 2: Find or create user from JWT
  console.log("\n📝 Test 2: Find or create user from JWT");
  const user = await findOrCreateUser(jwtUser);
  if (user && user.email === "alice@clinic.com") {
    console.log(`✅ User found/created: ${user.email} with role: ${user.role}`);
  } else {
    console.log("❌ User creation/lookup failed");
    return;
  }

  // Test 3: Role hierarchy checks
  console.log("\n📝 Test 3: Role hierarchy checks");
  
  // Test with different user roles
  const testCases = [
    { userRole: "staff", requiredRole: "staff", shouldPass: true },
    { userRole: "staff", requiredRole: "doctor", shouldPass: false },
    { userRole: "doctor", requiredRole: "staff", shouldPass: true },
    { userRole: "admin", requiredRole: "doctor", shouldPass: true },
    { userRole: "admin", requiredRole: "auditor", shouldPass: true },
    { userRole: "reviewer", requiredRole: "admin", shouldPass: false },
  ];

  for (const testCase of testCases) {
    const testUser = { role: testCase.userRole };
    const result = hasRole(testUser, testCase.requiredRole as any);
    const status = result === testCase.shouldPass ? "✅" : "❌";
    console.log(`${status} ${testCase.userRole} accessing ${testCase.requiredRole}-only resource: ${result ? "ALLOWED" : "DENIED"}`);
  }

  // Test 4: Request without JWT
  console.log("\n📝 Test 4: Request without JWT header");
  const requestWithoutJWT = new Request("http://localhost:8787");
  const noJWTResult = await validateCloudflareAccessJWT(requestWithoutJWT);
  if (noJWTResult === null) {
    console.log("✅ Correctly rejected request without JWT");
  } else {
    console.log("❌ Should have rejected request without JWT");
  }

  // Test 5: Check seeded users
  console.log("\n📝 Test 5: Verify seeded users exist with correct roles");
  const seededUsers = await db.user.findMany({
    select: { email: true, role: true, username: true }
  });

  const expectedRoles = ["staff", "reviewer", "doctor", "admin", "auditor"];
  for (const role of expectedRoles) {
    const userWithRole = seededUsers.find(u => u.role === role);
    if (userWithRole) {
      console.log(`✅ Found ${role} user: ${userWithRole.email}`);
    } else {
      console.log(`❌ Missing ${role} user`);
    }
  }

  console.log("\n🎉 Authentication and Role-Based Access Control tests completed!");
  console.log(`📊 Found ${seededUsers.length} total users in database`);
});
