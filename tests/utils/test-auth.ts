import { SignJWT } from 'jose';

const TEST_JWT_SECRET = new TextEncoder().encode('test-secret-key-for-testing-only');

export interface TestUser {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
}

export const TEST_USERS: Record<string, TestUser> = {
  admin: {
    id: 'test-admin-1',
    email: 'admin@test.com',
    role: 'admin'
  },
  user: {
    id: 'test-user-1',
    email: 'user@test.com', 
    role: 'user'
  },
  viewer: {
    id: 'test-viewer-1',
    email: 'viewer@test.com',
    role: 'viewer'
  }
};

export async function createTestJWT(user: TestUser): Promise<string> {
  return await new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(TEST_JWT_SECRET);
}

export function createAuthHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

export async function createTestRequest(
  url: string,
  options: RequestInit = {},
  user?: TestUser
): Promise<Request> {
  const headers = new Headers(options.headers);
  
  if (user) {
    const token = await createTestJWT(user);
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (!headers.has('Content-Type') && options.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  return new Request(url, {
    ...options,
    headers
  });
}

export async function makeAuthenticatedRequest(
  worker: any,
  path: string,
  options: RequestInit = {},
  user: TestUser = TEST_USERS.user
): Promise<Response> {
  const request = await createTestRequest(`http://localhost${path}`, options, user);
  return await worker.fetch(request);
}
