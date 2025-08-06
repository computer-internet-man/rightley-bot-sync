import { type UserRole, hasRole } from "@/lib/auth";
import { type AppContext } from "@/worker";

export function requireRole(role: UserRole) {
  return ({ ctx }: { ctx: AppContext }) => {
    if (!ctx.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/unauthorized" },
      });
    }

    if (!hasRole(ctx.user, role)) {
      return new Response("Forbidden: Insufficient role permissions", {
        status: 403,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // If user has required role, continue to next middleware/handler
    return undefined;
  };
}

export function requireAuth() {
  return ({ ctx }: { ctx: AppContext }) => {
    if (!ctx.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/unauthorized" },
      });
    }

    return undefined;
  };
}

// Convenience functions for common role checks
export const requireStaff = () => requireRole("staff");
export const requireReviewer = () => requireRole("reviewer");
export const requireDoctor = () => requireRole("doctor");
export const requireAuditor = () => requireRole("auditor");
export const requireAdmin = () => requireRole("admin");
