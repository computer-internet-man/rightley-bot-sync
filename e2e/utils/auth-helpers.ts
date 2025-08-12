import { Page, BrowserContext } from '@playwright/test';

/**
 * Authentication utilities for Playwright tests
 * Handles Cloudflare Access JWT injection and role-based testing
 */

export interface TestUser {
  email: string;
  role: 'staff' | 'reviewer' | 'doctor' | 'auditor' | 'admin';
  jwt: string;
  name: string;
}

// Test users for different roles (matching seed data)
export const TEST_USERS: Record<string, TestUser> = {
  staff: {
    email: 'staff@example.com',
    role: 'staff',
    name: 'Test Staff',
    jwt: 'test-jwt-staff'
  },
  reviewer: {
    email: 'reviewer@example.com',
    role: 'reviewer',
    name: 'Test Reviewer',
    jwt: 'test-jwt-reviewer'
  },
  doctor: {
    email: 'doctor@example.com',
    role: 'doctor',
    name: 'Dr. Test',
    jwt: 'test-jwt-doctor'
  },
  auditor: {
    email: 'auditor@example.com',
    role: 'auditor',
    name: 'Test Auditor',
    jwt: 'test-jwt-auditor'
  },
  admin: {
    email: 'admin@example.com',
    role: 'admin',
    name: 'Test Admin',
    jwt: 'test-jwt-admin'
  }
};

/**
 * Set authentication headers for Cloudflare Access
 */
export async function setAuthHeaders(context: BrowserContext, user: TestUser) {
  await context.setExtraHTTPHeaders({
    'Cf-Access-Jwt-Assertion': user.jwt,
    'X-Forwarded-Email': user.email,
    'X-Forwarded-User': user.name,
    'X-Test-User-Role': user.role
  });
}

/**
 * Login as a specific user role
 */
export async function loginAs(page: Page, userRole: keyof typeof TEST_USERS) {
  const user = TEST_USERS[userRole];
  
  // Set auth headers on the page context
  await page.context().setExtraHTTPHeaders({
    'Cf-Access-Jwt-Assertion': user.jwt,
    'X-Forwarded-Email': user.email,
    'X-Forwarded-User': user.name,
    'X-Test-User-Role': user.role
  });
  
  // Navigate to home page to trigger authentication
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  return user;
}

/**
 * Assert user is authenticated and has correct role
 */
export async function assertAuthenticated(page: Page, expectedRole: string) {
  // Check for user info in the page (assumes there's a user indicator)
  const userInfo = page.locator('[data-testid="user-info"]');
  if (await userInfo.count() > 0) {
    const role = await userInfo.getAttribute('data-role');
    if (role !== expectedRole) {
      throw new Error(`Expected role ${expectedRole}, but got ${role}`);
    }
  }
}

/**
 * Assert page requires authentication (shows 401 or redirects to login)
 */
export async function assertRequiresAuth(page: Page) {
  const response = await page.goto(page.url());
  if (response?.status() === 401 || page.url().includes('/login')) {
    return; // Expected behavior
  }
  throw new Error('Page should require authentication but did not');
}

/**
 * Assert access denied (403 Forbidden)
 */
export async function assertAccessDenied(page: Page) {
  const response = await page.goto(page.url());
  if (response?.status() === 403) {
    return; // Expected behavior
  }
  
  // Check for access denied message in content
  const accessDenied = page.locator('text=Access Denied, text=Forbidden, text=403');
  if (await accessDenied.count() > 0) {
    return; // Expected behavior
  }
  
  throw new Error('Expected access denied but page was accessible');
}

/**
 * Logout current user
 */
export async function logout(page: Page) {
  // Clear auth headers
  await page.context().setExtraHTTPHeaders({});
  
  // Navigate to logout endpoint
  await page.goto('/user/logout');
  await page.waitForLoadState('networkidle');
}

/**
 * Get current user info from page
 */
export async function getCurrentUser(page: Page): Promise<TestUser | null> {
  try {
    const userInfo = page.locator('[data-testid="user-info"]');
    if (await userInfo.count() === 0) {
      return null;
    }
    
    const email = await userInfo.getAttribute('data-email');
    const role = await userInfo.getAttribute('data-role') as TestUser['role'];
    const name = await userInfo.getAttribute('data-name');
    
    if (!email || !role || !name) {
      return null;
    }
    
    return {
      email,
      role,
      name,
      jwt: `test-jwt-${role}`
    };
  } catch {
    return null;
  }
}
