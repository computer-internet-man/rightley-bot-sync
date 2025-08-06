import { jwtVerify, createRemoteJWKSet } from "jose";
import { db } from "@/db";

export type UserRole = "staff" | "doctor" | "admin" | "reviewer" | "auditor";

export interface JWTUser {
  email: string;
  sub: string;
  iss: string;
  iat: number;
  exp: number;
  [key: string]: any;
}

export async function validateCloudflareAccessJWT(request: Request): Promise<JWTUser | null> {
  try {
    // Extract JWT from Cloudflare Access header
    const jwtHeader = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!jwtHeader) {
      return null;
    }

    // Check if we're in development mode (NODE_ENV=development or missing CLOUDFLARE_ACCESS_DOMAIN)
    const accessDomain = process.env.CLOUDFLARE_ACCESS_DOMAIN;
    const isDev = process.env.NODE_ENV === "development" || !accessDomain;
    
    if (isDev) {
      // Mock JWT validation for development
      try {
        const payload = JSON.parse(atob(jwtHeader.split('.')[1]));
        return {
          email: payload.email || "dev@example.com",
          sub: payload.sub || "dev-user",
          iss: payload.iss || "dev-issuer",
          iat: payload.iat || Math.floor(Date.now() / 1000),
          exp: payload.exp || Math.floor(Date.now() / 1000) + 3600,
          ...payload
        };
      } catch {
        return null;
      }
    }

    // Production JWT validation
    const jwks = createRemoteJWKSet(new URL(`${accessDomain}/cdn-cgi/access/certs`));
    
    const { payload } = await jwtVerify(jwtHeader, jwks, {
      issuer: `${accessDomain}/cdn-cgi/access`,
      audience: process.env.CLOUDFLARE_ACCESS_AUD,
    });

    return payload as JWTUser;
  } catch (error) {
    console.error("JWT validation failed:", error);
    return null;
  }
}

export async function findOrCreateUser(jwtUser: JWTUser, defaultRole: UserRole = "staff") {
  try {
    // Try to find existing user by email
    let user = await db.user.findUnique({
      where: { email: jwtUser.email }
    });

    if (!user) {
      // Create new user with email from JWT
      user = await db.user.create({
        data: {
          email: jwtUser.email,
          username: jwtUser.email, // Use email as username for now
          role: defaultRole,
        }
      });
    }

    return user;
  } catch (error) {
    console.error("Error finding or creating user:", error);
    return null;
  }
}

export async function getUser(request: Request, env: any): Promise<any | null> {
  const jwtUser = await validateCloudflareAccessJWT(request);
  if (jwtUser) {
    return await findOrCreateUser(jwtUser);
  }
  return null;
}

export function hasRole(user: { role: string }, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    staff: 1,
    reviewer: 2,
    doctor: 3,
    auditor: 4,
    admin: 5,
  };

  const userRoleLevel = roleHierarchy[user.role as UserRole] || 0;
  const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

  return userRoleLevel >= requiredRoleLevel;
}
