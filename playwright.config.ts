import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for end-to-end testing
 * Supports local development, preview deployments, and staging environments
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Default timeout for each action
    actionTimeout: 10000,
    // Global test timeout
    timeout: 30000,
    // Extra HTTP headers to be sent with every request
    extraHTTPHeaders: {
      // Enable AI stubbing for tests to avoid API costs
      'X-Test-Mode': '1'
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile testing
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  // Run setup before each test project
  globalSetup: './e2e/global-setup.ts',
  // Shared timeout for all tests
  timeout: 60000,
  // Configure test output directory
  outputDir: 'test-results/',
  // Configure webserver for local testing
  webServer: {
    command: 'pnpm dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: 'test',
      AI_STUB: '1', // Enable AI stubbing for testing
      CLOUDFLARE_ENV: 'local'
    }
  }
});
