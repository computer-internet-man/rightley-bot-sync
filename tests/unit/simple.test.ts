import { describe, it, expect } from 'vitest';

describe('Simple Test', () => {
  it('should verify basic testing setup works', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle async operations', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });

  it('should work with environment variables', () => {
    // This should be available from vitest config
    const testEnv = process.env.NODE_ENV || 'test';
    expect(typeof testEnv).toBe('string');
  });
});
