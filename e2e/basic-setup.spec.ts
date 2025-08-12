import { test, expect } from '@playwright/test';

test.describe('Basic Playwright Setup Verification', () => {
  test('should load the application home page', async ({ page }) => {
    await page.goto('/');
    
    // Basic check that the page loads without major errors
    expect(page.url()).toContain('localhost:5173');
    
    // Check that the page has a title (any title is fine)
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('should be able to navigate to different pages', async ({ page }) => {
    // Test basic navigation
    await page.goto('/');
    expect(page.url()).toContain('/');
    
    // Try accessing a few routes (they may redirect but shouldn't 500)
    const routes = ['/login', '/draft', '/admin'];
    
    for (const route of routes) {
      const response = await page.goto(route);
      // Should not be a server error (200, 302, 401, 403 are all fine)
      expect(response?.status()).toBeLessThan(500);
    }
  });

  test('should handle authentication headers correctly', async ({ page }) => {
    // Set test authentication headers
    await page.context().setExtraHTTPHeaders({
      'Cf-Access-Jwt-Assertion': 'test-jwt-token',
      'X-Forwarded-Email': 'test@example.com',
      'X-Forwarded-User': 'Test User',
      'X-Test-User-Role': 'admin'
    });
    
    // Try to access a protected route
    const response = await page.goto('/draft');
    
    // Should not be a server error
    expect(response?.status()).toBeLessThan(500);
  });

  test('should serve static assets correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check that CSS and JS are loaded (no 404s for main assets)
    const responses: number[] = [];
    
    page.on('response', response => {
      if (response.url().includes('.css') || response.url().includes('.js')) {
        responses.push(response.status());
      }
    });
    
    // Wait for the page to load completely
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    
    // Most asset requests should be successful
    const failedAssets = responses.filter(status => status >= 400);
    expect(failedAssets.length).toBeLessThan(responses.length / 2); // Less than half should fail
  });

  test('API structure should be accessible', async ({ page }) => {
    // Test that API endpoints exist (even if they require auth)
    const apiEndpoints = [
      '/patients',
      '/api/audit-logs',
      '/actions/generate-draft'
    ];
    
    for (const endpoint of apiEndpoints) {
      const response = await page.request.get(endpoint);
      // 401/403 (auth required) is fine, 404 (not found) is not
      expect(response.status()).not.toBe(404);
    }
  });
});
