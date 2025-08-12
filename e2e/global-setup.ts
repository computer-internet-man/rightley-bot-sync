import { chromium, FullConfig } from '@playwright/test';

/**
 * Global setup for Playwright tests
 * Ensures database is seeded and application is ready for testing
 */
async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Wait for the application to be ready
    const baseURL = config.webServer?.port 
      ? `http://localhost:${config.webServer.port}` 
      : config.use?.baseURL || 'http://localhost:5173';
    
    console.log('🔧 Setting up test environment...');
    
    // Health check - wait for server to be ready
    await page.goto(`${baseURL}/debug/health`);
    await page.waitForLoadState('networkidle');
    
    // Verify database is seeded
    const response = await page.goto(`${baseURL}/debug/seed-status`);
    if (response?.status() !== 200) {
      console.log('⚠️  Database not seeded, triggering seed...');
      await page.goto(`${baseURL}/debug/seed`);
      await page.waitForLoadState('networkidle');
    }
    
    console.log('✅ Test environment ready');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
