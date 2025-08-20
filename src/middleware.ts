import { defineApp } from "rwsdk/router";

// App-level middleware for security headers, CORS, and session loading
function setSecurityHeaders() {
  return async function ({ response }: { response: Response }) {
    const headers = new Headers(response.headers);
    headers.set("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    
    // CORS for /api/sync/* routes
    const corsOrigins = ["http://localhost:5173", "https://rightley-bot-sync.pages.dev"];
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  };
}

function loadSession() {
  return async function ({ request, ctx }: { request: Request; ctx: any }) {
    try {
      // Mock session loading - replace with real session logic
      const authHeader = request.headers.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        ctx.user = { id: "mock-user-123" };
      }
    } catch (error) {
      console.error("Session loading error:", error);
      // Fail open for now - no user in ctx
    }
  };
}

export const middleware = [
  setSecurityHeaders(),
  loadSession(),
];
