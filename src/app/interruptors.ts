import type { IncomingRequestContext } from "rwsdk/router";

// Simple auth gate
export async function requireAuth({ ctx }: { ctx: IncomingRequestContext }) {
  if (!ctx?.user) {
    return new Response(null, { status: 302, headers: { Location: "/user/login" } });
  }
}

// Basic IP/user-limited rate limiter (demo-safe)
const buckets = new Map<string, { tokens: number; ts: number }>();
export async function apiRateLimit({ request }: { request: Request }) {
  const key = new URL(request.url).pathname + "::" + (request.headers.get("CF-Connecting-IP") ?? "anon");
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: 10, ts: now };
  const refill = Math.floor((now - bucket.ts) / 1000); // +1 token/sec
  bucket.tokens = Math.min(10, bucket.tokens + refill);
  bucket.ts = now;
  if (bucket.tokens <= 0) return Response.json({ error: "Too Many Requests" }, { status: 429 });
  bucket.tokens--;
  buckets.set(key, bucket);
}

export async function logRequests({ request }: { request: Request }) {
  const started = Date.now();
  return (res: Response) => {
    console.log(`${request.method} ${request.url} → ${res.status} in ${Date.now() - started}ms`);
  };
}
