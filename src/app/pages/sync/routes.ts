import { route } from "rwsdk/router";
import { requireAuth, apiRateLimit, logRequests } from "@/app/interruptors";
import SyncPage from "./SyncPage";

// Page route - returns JSX component
export const pageRoutes = [
  route("/", [requireAuth, SyncPage]),
];

// API routes - return JSON responses  
export const apiRoutes = [
  route("/api/athena", [requireAuth, apiRateLimit, logRequests, async function() {
    const data = await import("@/app/pages/sync/mocks/athena.sample.json");
    return Response.json(data.default);
  }]),
  route("/api/freed", [requireAuth, apiRateLimit, logRequests, async function() {
    const data = await import("@/app/pages/sync/mocks/freed.sample.json");
    return Response.json(data.default);
  }]),
  route("/api/spruce", [requireAuth, apiRateLimit, logRequests, async function() {
    const data = await import("@/app/pages/sync/mocks/spruce.sample.json");
    return Response.json(data.default);
  }]),
  route("/api/gmail", [requireAuth, apiRateLimit, logRequests, async function() {
    const data = await import("@/app/pages/sync/mocks/gmail.sample.json");
    return Response.json(data.default);
  }]),
  route("/api/todoist", [requireAuth, apiRateLimit, logRequests, async function() {
    const data = await import("@/app/pages/sync/mocks/todoist.sample.json");
    return Response.json(data.default);
  }]),
];
