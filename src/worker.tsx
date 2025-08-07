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
  async ({ ctx, request, headers }) => {
    console.log("[MIDDLEWARE] Processing request:", request.method, request.url);
    await setupDb(env);

    // For development, always create an admin user
    console.log("[AUTH] Development mode - creating default admin user");
    const devJWT = {
      email: "admin@example.com",
      sub: "dev-admin-123",
      iss: "dev-issuer",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 // 24 hours
    };
    ctx.user = await findOrCreateUser(devJWT, "admin");
    // Ensure development user has admin role
    if (ctx.user && ctx.user.role !== "admin") {
      ctx.user = await db.user.update({
        where: { id: ctx.user.id },
        data: { role: "admin" }
      });
    }
    console.log("[AUTH] Development user created:", ctx.user?.email, "role:", ctx.user?.role);
  },
  
  // Simple test route first
  route("/test", () => {
    console.log("[ROUTE] Test route accessed");
    return new Response("Test route works!");
  }),
  
  render(Document, [
    // Public routes
    route("/", () => {
      console.log("[ROUTE] Root route accessed");
      return new Response("Hello, World! Development server is working!");
    }),
    
    route("/draft", [
      requireStaff(),
      DraftWorkflowPage,
    ]),
  ]),
  
  /*
  // API routes (outside Document wrapper for JSON responses)
  route("/api/generate-draft", [
    requireStaff(),
    async ({ request, ctx }) => {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
          status: 405,
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
        console.error('API Error:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid request format' 
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  ]),

  // Include message workflow API routes
  prefix("/api/message-workflow", [
    requireStaff(),
    ({ ctx, request }) => import("@/routes/api/message-workflow").then(m => m.POST(request, env, ctx))
  ]),
  
  // Include audit log API routes
  prefix("/api/audit-logs", [
    requireStaff(),
    ({ ctx, request }) => import("@/routes/api/audit-logs").then(m => 
      request.method === 'GET' ? m.GET(request, env, ctx) : m.POST(request, env, ctx)
    )
  ]),
  
  // Include audit export API routes
  prefix("/api/audit-export", [
    requireAuditor(),
    ({ ctx, request }) => import("@/routes/api/audit-export").then(m => m.POST(request, env, ctx))
  ]),
  */
  
  /* OLD ROUTES - COMMENTED OUT
  render(Document, [
    // Public routes
    route("/", () => {
      console.log("[ROUTE] Root route accessed");
      return new Response("Hello, World! Development server is working!");
    }),
    route("/login", LoginPage),
    
    route("/unauthorized", () => {
      return new Response(`
        <html>
          <head><title>Unauthorized</title></head>
          <body style="padding: 2rem; text-align: center; font-family: Arial, sans-serif;">
            <h1>Unauthorized Access</h1>
            <p>This application requires authentication through Cloudflare Access.</p>
            <p>Please contact your administrator to gain access.</p>
          </body>
        </html>
      `, {
        headers: { "Content-Type": "text/html" },
      });
    }),

    // Role-protected routes
    route("/draft", [
      requireStaff(),
      DraftWorkflowPage,
    ]),
    
    route("/doctor/settings", [
      requireDoctor(),
      DoctorSettingsPage,
    ]),
    
    route("/admin/briefs", [
      requireDoctor(),
      PatientBriefsPage,
    ]),
    
    route("/admin/audit", [
      requireAuditor(),
      AuditLogPage,
    ]),
    
    route("/review", [
      requireAuth(),
      MessageReviewPage,
    ]),

    // Legacy protected routes
    route("/protected", [
      requireAuth(),
      Home,
    ]),
    route("/admin", [
      requireAdmin(),
      AdminDashboard,
    ]),
    route("/doctor", [
      requireDoctor(),
      DoctorPortal,
    ]),
    prefix("/user", userRoutes),
  ]),
  */
]);
