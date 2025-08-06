import { validateCloudflareAccessJWT, findOrCreateUser } from "@/lib/auth";

// Test script to verify JWT validation works
async function testJWTValidation() {
  console.log("Testing JWT validation...");

  // Create a mock JWT for development testing
  const mockJWTPayload = {
    email: "doctor@example.com",
    sub: "test-user-123",
    iss: "test-issuer",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  // Base64 encode the payload (simplified mock JWT)
  const mockJWT = "header." + btoa(JSON.stringify(mockJWTPayload)) + ".signature";

  // Create a mock request with the JWT header
  const mockRequest = new Request("http://localhost:8787", {
    headers: {
      "Cf-Access-Jwt-Assertion": mockJWT,
    },
  });

  try {
    const jwtUser = await validateCloudflareAccessJWT(mockRequest);
    console.log("JWT validation result:", jwtUser);

    if (jwtUser) {
      console.log("✅ JWT validation successful");
      console.log("User email:", jwtUser.email);
    } else {
      console.log("❌ JWT validation failed");
    }
  } catch (error) {
    console.error("❌ JWT validation error:", error);
  }

  // Test request without JWT
  const requestWithoutJWT = new Request("http://localhost:8787");
  const noJWTResult = await validateCloudflareAccessJWT(requestWithoutJWT);
  console.log("Request without JWT result:", noJWTResult);
  
  if (noJWTResult === null) {
    console.log("✅ Correctly rejected request without JWT");
  } else {
    console.log("❌ Should have rejected request without JWT");
  }
}

// Export the test function for manual execution
export { testJWTValidation };
