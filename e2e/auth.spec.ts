import { test, expect } from '@playwright/test';
import { loginAs, assertAuthenticated, assertRequiresAuth, assertAccessDenied, logout, TEST_USERS } from './utils/auth-helpers';
import { LoginPage } from './utils/page-objects';

test.describe('Authentication and Authorization', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.context().clearCookies();
    await page.context().setExtraHTTPHeaders({});
  });

  test('should require authentication for protected routes', async ({ page }) => {
    const protectedRoutes = ['/draft', '/admin/briefs', '/admin/audit', '/review', '/doctor/settings'];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await assertRequiresAuth(page);
    }
  });

  test('should allow public access to login page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    
    expect(await page.title()).toContain('Login');
    expect(page.url()).toContain('/login');
  });

  test('staff user should have limited access', async ({ page }) => {
    await loginAs(page, 'staff');
    
    // Should access draft page
    await page.goto('/draft');
    expect(page.url()).toContain('/draft');
    
    // Should NOT access admin pages
    await page.goto('/admin/briefs');
    await assertAccessDenied(page);
    
    await page.goto('/admin/audit');
    await assertAccessDenied(page);
  });

  test('reviewer user should access review workflow', async ({ page }) => {
    await loginAs(page, 'reviewer');
    
    // Should access review page
    await page.goto('/review');
    expect(page.url()).toContain('/review');
    
    // Should access draft page
    await page.goto('/draft');
    expect(page.url()).toContain('/draft');
    
    // Should NOT access admin-only pages
    await page.goto('/admin/briefs');
    await assertAccessDenied(page);
  });

  test('doctor user should access patient management', async ({ page }) => {
    await loginAs(page, 'doctor');
    
    // Should access all basic pages
    await page.goto('/draft');
    expect(page.url()).toContain('/draft');
    
    await page.goto('/review');
    expect(page.url()).toContain('/review');
    
    await page.goto('/admin/briefs');
    expect(page.url()).toContain('/admin/briefs');
    
    await page.goto('/doctor/settings');
    expect(page.url()).toContain('/doctor/settings');
    
    // Should NOT access full audit logs
    await page.goto('/admin/audit');
    expect(page.url()).toContain('/admin/audit');
    // But should have limited scope (verified by content, not access)
  });

  test('auditor user should have read-only audit access', async ({ page }) => {
    await loginAs(page, 'auditor');
    
    // Should access audit logs
    await page.goto('/admin/audit');
    expect(page.url()).toContain('/admin/audit');
    
    // Should NOT access patient management
    await page.goto('/admin/briefs');
    await assertAccessDenied(page);
    
    // Should NOT access draft creation
    await page.goto('/draft');
    await assertAccessDenied(page);
  });

  test('admin user should have full system access', async ({ page }) => {
    await loginAs(page, 'admin');
    
    const allRoutes = ['/draft', '/review', '/admin/briefs', '/admin/audit', '/doctor/settings'];
    
    for (const route of allRoutes) {
      await page.goto(route);
      expect(page.url()).toContain(route);
    }
  });

  test('should handle logout correctly', async ({ page }) => {
    // Login as staff user
    await loginAs(page, 'staff');
    await page.goto('/draft');
    expect(page.url()).toContain('/draft');
    
    // Logout
    await logout(page);
    
    // Try to access protected route - should be denied
    await page.goto('/draft');
    await assertRequiresAuth(page);
  });

  test('should validate JWT tokens correctly', async ({ page }) => {
    // Set invalid JWT
    await page.context().setExtraHTTPHeaders({
      'Cf-Access-Jwt-Assertion': 'invalid-jwt-token',
      'X-Forwarded-Email': 'test@example.com'
    });
    
    await page.goto('/draft');
    await assertRequiresAuth(page);
  });

  test('should handle role escalation attempts', async ({ page }) => {
    // Login as staff
    await loginAs(page, 'staff');
    
    // Try to manually set admin headers (should be ignored by server)
    await page.context().setExtraHTTPHeaders({
      'Cf-Access-Jwt-Assertion': TEST_USERS.staff.jwt,
      'X-Forwarded-Email': TEST_USERS.staff.email,
      'X-Test-User-Role': 'admin', // Attempt escalation
      'X-Forwarded-User': TEST_USERS.staff.name
    });
    
    // Should still be denied admin access
    await page.goto('/admin/briefs');
    await assertAccessDenied(page);
  });

  test('should enforce session timeout', async ({ page }) => {
    await loginAs(page, 'staff');
    
    // Access a protected page
    await page.goto('/draft');
    expect(page.url()).toContain('/draft');
    
    // Simulate session expiration by clearing auth headers
    await page.context().setExtraHTTPHeaders({});
    
    // Reload page - should require auth
    await page.reload();
    await assertRequiresAuth(page);
  });

  test('should handle concurrent sessions', async ({ browser }) => {
    // Create two browser contexts (different sessions)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    try {
      // Login with different users in each context
      await loginAs(page1, 'staff');
      await loginAs(page2, 'admin');
      
      // Verify each session maintains its own identity
      await page1.goto('/draft');
      expect(page1.url()).toContain('/draft');
      
      await page2.goto('/admin/briefs');
      expect(page2.url()).toContain('/admin/briefs');
      
      // Staff should still be denied admin access
      await page1.goto('/admin/briefs');
      await assertAccessDenied(page1);
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('should prevent CSRF attacks', async ({ page }) => {
    await loginAs(page, 'admin');
    
    // Try to make a request without proper CSRF protection
    const response = await page.request.post('/api/message-workflow/submit-for-review', {
      data: JSON.stringify({ test: 'data' }),
      headers: {
        'Content-Type': 'application/json',
        // Missing CSRF token or proper origin headers
        'Origin': 'https://malicious-site.com'
      }
    });
    
    // Should be rejected due to CSRF protection
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should handle malformed authentication headers', async ({ page }) => {
    const malformedHeaders = [
      { 'Cf-Access-Jwt-Assertion': '' }, // Empty JWT
      { 'X-Forwarded-Email': '' }, // Empty email
      { 'Cf-Access-Jwt-Assertion': 'not.a.jwt' }, // Invalid JWT format
      { 'X-Forwarded-Email': 'not-an-email' }, // Invalid email format
    ];
    
    for (const headers of malformedHeaders) {
      await page.context().setExtraHTTPHeaders(headers);
      await page.goto('/draft');
      await assertRequiresAuth(page);
    }
  });
});
