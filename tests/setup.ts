import { beforeEach, afterEach } from 'vitest';
import { cleanupTestDb, setupTestDb } from './utils/test-db-setup';

// Global test setup
beforeEach(async () => {
  try {
    await setupTestDb();
  } catch (error) {
    console.warn('Test DB setup skipped (not in Workers environment):', error.message);
  }
});

// Global test cleanup
afterEach(async () => {
  try {
    await cleanupTestDb();
  } catch (error) {
    // Cleanup may fail if setup was skipped
  }
});

// Mock console methods to reduce noise in tests
const originalConsole = console;
globalThis.console = {
  ...originalConsole,
  log: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  error: originalConsole.error // Keep errors for debugging
};
