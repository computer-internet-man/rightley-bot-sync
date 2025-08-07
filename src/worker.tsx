import { defineApp, ErrorResponse } from "rwsdk/worker";
import { route, render, prefix } from "rwsdk/router";
import { Document } from "@/app/Document";
import { Home } from "@/app/pages/Home";
import { AdminDashboard } from "@/app/pages/AdminDashboard";
import { DoctorPortal } from "@/app/pages/DoctorPortal";
import LoginPage from "@/app/pages/LoginPage";
import DraftWorkflowPage from "@/app/pages/DraftWorkflowPage";
import DoctorSettingsPage from "@/app/pages/doctor/SettingsPage";
import PatientBriefsPage from "@/app/pages/admin/PatientBriefsPage";
import AuditLogPage from "@/app/pages/admin/AuditLogPage";
import { setCommonHeaders } from "@/app/headers";
import { userRoutes } from "@/app/pages/user/routes";
import { validateCloudflareAccessJWT, findOrCreateUser } from "@/lib/auth";
import { requireAuth, requireAdmin, requireDoctor, requireStaff, requireAuditor } from "@/middleware/requireRole";
import { type User, db, setupDb } from "@/db";
import { env } from "cloudflare:workers";
import { generateDraftAction, type DraftRequest } from "@/actions/generateDraft";
import { MessageReviewPage } from "@/app/pages/MessageReviewPage";

export type AppContext = {
  user: User | null;
};

export default defineApp([
  setCommonHeaders(),
  
  // Authentication middleware - sets up user context for all routes
  async ({ ctx, request, headers }) => {
    console.log("[AUTH MIDDLEWARE] Processing request:", request.method, new URL(request.url).pathname);
    await setupDb(env);

    // For development, always create an admin user
    const devJWT = {
      email: "admin@example.com",
      sub: "dev-admin-123",
      iss: "dev-issuer",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 // 24 hours
    };
    
    try {
      ctx.user = await findOrCreateUser(devJWT, "admin");
      // Ensure development user has admin role
      if (ctx.user && ctx.user.role !== "admin") {
        ctx.user = await db.user.update({
          where: { id: ctx.user.id },
          data: { role: "admin" }
        });
      }
      console.log("[AUTH MIDDLEWARE] User set:", ctx.user?.email, "role:", ctx.user?.role);
    } catch (error) {
      console.error("[AUTH MIDDLEWARE] Error setting up user:", error);
      ctx.user = null;
    }
  },
  
  // Test route for debugging
  route("/test", ({ ctx }) => {
    console.log("[TEST ROUTE] User:", ctx.user?.email);
    return new Response(`Test route works! User: ${ctx.user?.email} (${ctx.user?.role})`);
  }),

  // Test John Doe workflow route
  route("/test-john-doe", async ({ ctx }) => {
    if (!ctx.user) {
      return new Response("No user authenticated", { status: 401 });
    }

    try {
      // 1. Check if John Doe exists
      const johnDoe = await db.patientBrief.findFirst({
        where: { patientName: "John Doe" }
      });

      if (!johnDoe) {
        return new Response("John Doe not found in database", { status: 404 });
      }

      // 2. Test generating a draft for John Doe
      const testRequest = {
        patientInquiry: "Patient asking about diabetes medication refill",
        patientId: johnDoe.id,
        userId: ctx.user.id
      };

      console.log("[TEST] About to call generateDraftAction with:", testRequest);
      const draftResult = await generateDraftAction(testRequest, env);
      console.log("[TEST] generateDraftAction result:", draftResult);

      // 3. If successful, create an audit log entry
      if (draftResult.success && draftResult.draft) {
        const auditEntry = await db.auditLog.create({
          data: {
            userId: ctx.user.id,
            patientName: johnDoe.patientName,
            requestText: testRequest.patientInquiry,
            generatedDraft: draftResult.draft,
            finalMessage: draftResult.draft,
            actionType: 'draft_generated',
            deliveryStatus: 'draft'
          }
        });

        return new Response(JSON.stringify({
          success: true,
          message: "John Doe workflow test completed successfully",
          patientFound: true,
          draftGenerated: true,
          auditLogCreated: true,
          details: {
            patient: {
              id: johnDoe.id,
              name: johnDoe.patientName,
              briefText: johnDoe.briefText,
              medicalHistory: johnDoe.medicalHistory,
              currentMedications: johnDoe.currentMedications
            },
            draftGenerated: draftResult.draft,
            auditLogId: auditEntry.id
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          message: "Draft generation failed",
          patientFound: true,
          draftGenerated: false,
          error: draftResult.error || "Unknown error"
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      console.error("[TEST JOHN DOE] Error:", error);
      return new Response(JSON.stringify({
        success: false,
        message: "Test failed with error",
        error: error.message
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // API routes - these must come BEFORE the Document wrapper to avoid conflicts
  route("/api/generate-draft", async ({ request, ctx }) => {
    console.log("[API] Generate draft called");
    
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const requestData = await request.json() as DraftRequest;
      
      // Validate required fields
      if (!requestData.patientInquiry || !requestData.patientId || !requestData.userId) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: patientInquiry, patientId, userId' 
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Ensure user ID matches authenticated user
      if (ctx.user?.id !== requestData.userId) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'User ID mismatch' 
        }), { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const result = await generateDraftAction(requestData, env);
      
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[API] Draft generation error:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid request format' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Audit logs API
  route("/api/audit-logs", async ({ request, ctx }) => {
    console.log("[API] Audit logs called");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'GET') {
      // Simple mock response for now
      return new Response(JSON.stringify({ 
        success: true, 
        logs: [],
        total: 0 
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (request.method === 'POST') {
      // Create audit log entry
      try {
        const data = await request.json();
        // Mock successful response
        return new Response(JSON.stringify({ 
          success: true, 
          auditLog: { id: "mock-audit-" + Date.now() }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid request' 
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }),

  // Message workflow API
  route("/api/message-workflow", async ({ request, ctx }) => {
    console.log("[API] Message workflow called");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'POST') {
      try {
        const data = await request.json();
        // Mock successful response
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Workflow completed successfully'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid request' 
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }),
  
  // Document-wrapped routes - these handle HTML rendering
  render(Document, [
    // Public routes
    route("/", ({ ctx }) => {
      console.log("[ROOT ROUTE] User:", ctx.user?.email);
      return (
        <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
          <h1>AI Concierge MVP</h1>
          <p>Welcome! You are logged in as: <strong>{ctx.user?.email}</strong> ({ctx.user?.role})</p>
          <nav style={{ margin: "2rem 0" }}>
            <a href="/draft" style={{ marginRight: "1rem", padding: "0.5rem 1rem", background: "#3b82f6", color: "white", textDecoration: "none", borderRadius: "0.25rem" }}>Draft Workflow</a>
            <a href="/admin/briefs" style={{ marginRight: "1rem", padding: "0.5rem 1rem", background: "#10b981", color: "white", textDecoration: "none", borderRadius: "0.25rem" }}>Patient Briefs</a>
            <a href="/admin/audit" style={{ marginRight: "1rem", padding: "0.5rem 1rem", background: "#f59e0b", color: "white", textDecoration: "none", borderRadius: "0.25rem" }}>Audit Logs</a>
          </nav>
          <p>John Doe patient data should be accessible from the Patient Briefs and Draft Workflow pages.</p>
        </div>
      );
    }),

    route("/login", LoginPage),
    
    route("/unauthorized", () => {
      return (
        <div style={{ padding: "2rem", textAlign: "center", fontFamily: "Arial, sans-serif" }}>
          <h1>Unauthorized Access</h1>
          <p>This application requires authentication through Cloudflare Access.</p>
          <p>Please contact your administrator to gain access.</p>
        </div>
      );
    }),

    // Application routes - using the actual React components
    route("/draft", DraftWorkflowPage),
    
    route("/admin/briefs", PatientBriefsPage),
    
    route("/admin/audit", AuditLogPage),

    // Legacy routes for compatibility
    route("/protected", ({ ctx }) => {
      return new Response(`Protected route works! User: ${ctx.user?.email}`);
    }),
    
    route("/admin", ({ ctx }) => {
      return new Response(`Admin route works! User: ${ctx.user?.email}`);
    }),
    
    route("/doctor", ({ ctx }) => {
      return new Response(`Doctor route works! User: ${ctx.user?.email}`);
    }),
  ])
]);
