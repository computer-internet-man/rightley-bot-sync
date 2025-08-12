import { vi } from 'vitest';

export function createMockEnv(overrides: Record<string, any> = {}) {
  const mockQueue = {
    send: vi.fn().mockResolvedValue(undefined),
    sendBatch: vi.fn().mockResolvedValue(undefined)
  };

  const mockSentry = {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
    setUser: vi.fn(),
    setTag: vi.fn(),
    setContext: vi.fn()
  };

  return {
    // Database
    DB: overrides.DB || globalThis.cloudflare?.env?.DB,
    
    // Queue
    MESSAGE_QUEUE: overrides.MESSAGE_QUEUE || mockQueue,
    
    // KV Store
    SESSION_STORE: overrides.SESSION_STORE || {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn()
    },
    
    // Environment variables
    AI_STUB: overrides.AI_STUB || '1',
    SENTRY_DSN: overrides.SENTRY_DSN || 'test://test@test.ingest.sentry.io/test',
    OPENAI_API_KEY: overrides.OPENAI_API_KEY || 'sk-test-key-for-testing-only',
    JWT_SECRET: overrides.JWT_SECRET || 'test-secret-key-for-testing-only',
    CLOUDFLARE_ENV: overrides.CLOUDFLARE_ENV || 'test',
    
    // Sentry mock
    Sentry: mockSentry,
    
    // Other mocks
    ...overrides
  };
}

export function mockOpenAI() {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'This is a test-generated draft message for patient care.'
            }
          }]
        })
      }
    }
  };
}

export function mockDeliveryProvider() {
  return {
    sendMessage: vi.fn().mockResolvedValue({
      success: true,
      messageId: 'test-message-id',
      timestamp: new Date().toISOString()
    }),
    getDeliveryStatus: vi.fn().mockResolvedValue({
      status: 'delivered',
      timestamp: new Date().toISOString()
    })
  };
}
