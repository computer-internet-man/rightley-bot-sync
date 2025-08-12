import { test, expect } from '@playwright/test';
import { loginAs } from './utils/auth-helpers';

test.describe('Smoke Tests - Basic Functionality', () => {
  test('application should load and be accessible', async ({ page }) => {
    await page.goto('/');
    
    // Should load without errors
    expect(page.url()).toContain('/');
    
    // Should have proper title
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('login page should be accessible', async ({ page }) => {
    await page.goto('/login');
    
    // Should show login page
    expect(page.url()).toContain('/login');
    expect(page.locator('text=Login, text=Sign In')).toBeVisible();
  });

  test('authentication should work for all user roles', async ({ page }) => {
    const roles = ['staff', 'reviewer', 'doctor', 'auditor', 'admin'];
    
    for (const role of roles) {
      await loginAs(page, role as any);
      
      // Should be authenticated
      await page.goto('/');
      expect(page.url()).not.toContain('/login');
      
      // Should show user info or dashboard
      expect(page.locator('[data-testid="user-info"], [data-testid="dashboard"]')).toBeVisible();
    }
  });

  test('basic navigation should work', async ({ page }) => {
    await loginAs(page, 'admin');
    
    const routes = ['/draft', '/admin/briefs', '/admin/audit'];
    
    for (const route of routes) {
      await page.goto(route);
      expect(page.url()).toContain(route);
      
      // Should not show error page
      expect(page.locator('text=Error, text=404')).not.toBeVisible();
    }
  });

  test('API endpoints should be responsive', async ({ page }) => {
    await loginAs(page, 'admin');
    
    // Test health endpoint
    const healthResponse = await page.request.get('/debug/health');
    expect(healthResponse.status()).toBe(200);
    
    // Test patients endpoint
    const patientsResponse = await page.request.get('/patients');
    expect(patientsResponse.status()).toBeLessThan(400);
  });

  test('database should be accessible', async ({ page }) => {
    await loginAs(page, 'admin');
    
    // Test database connectivity through API
    const response = await page.request.get('/debug/db-status');
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.connected).toBeTruthy();
  });

  test('basic draft workflow should function', async ({ page }) => {
    await loginAs(page, 'staff');
    await page.goto('/draft');
    
    // Should show draft form
    expect(page.locator('[data-testid="patient-select"]')).toBeVisible();
    expect(page.locator('[data-testid="inquiry-textarea"]')).toBeVisible();
    expect(page.locator('[data-testid="generate-button"]')).toBeVisible();
  });
});
