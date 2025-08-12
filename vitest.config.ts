import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  resolve: {
    conditions: ['react-server']
  },
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // D1 database setup for testing
          d1Databases: ['DB'],
          // Queue setup for testing
          queueProducers: ['MESSAGE_QUEUE'],
          // Environment variables for testing
          bindings: {
            AI_STUB: '1',
            SENTRY_DSN: 'test://test@test.ingest.sentry.io/test',
            OPENAI_API_KEY: 'sk-test-key-for-testing',
            JWT_SECRET: 'test-secret-key-for-testing-only',
            ENVIRONMENT: 'test'
          }
        }
      }
    },
    // Test file patterns
    include: ['tests/**/*.test.ts'],
    // Setup files
    setupFiles: ['./tests/setup.ts'],
    // Test timeout
    testTimeout: 30000,
    // Coverage settings (disabled for Workers environment due to node:inspector issues)
    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'scripts/',
        '**/*.test.ts',
        '**/*.config.*'
      ]
    },
    // Environment isolation
    isolate: true,
    // Concurrent test execution
    maxConcurrency: 4
  }
});
