import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { createMockEnv, mockOpenAI } from '../utils/mock-env';
import { TEST_USERS, createTestJWT } from '../utils/test-auth';
import { expectResponseOk, expectJsonResponse, assertUnauthorized } from '../utils/test-helpers';

describe('Draft Generation', () => {
  let env: any;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
  });

  describe('POST /actions/generate-draft', () => {
    it('should generate draft with OpenAI in stub mode', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/actions/generate-draft', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          context: 'medication reminder'
        })
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data).toHaveProperty('content');
      expect(data.content).toBeTruthy();
      expect(typeof data.content).toBe('string');
    });

    it('should require authentication', async () => {
      const response = await SELF.fetch('http://localhost/actions/generate-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          context: 'medication reminder'
        })
      });

      assertUnauthorized(response);
    });

    it('should validate required fields', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/actions/generate-draft', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // Missing patientId and context
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('required');
    });

    it('should handle OpenAI rate limits gracefully', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      // Mock OpenAI to throw rate limit error
      const mockOpenAIError = {
        error: {
          type: 'rate_limit_exceeded',
          message: 'Rate limit exceeded'
        }
      };

      const response = await SELF.fetch('http://localhost/actions/generate-draft', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          context: 'medication reminder',
          _test_error: 'rate_limit' // Test flag to simulate error
        })
      });

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.error).toContain('rate limit');
    });

    it('should include patient context in generation', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/actions/generate-draft', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          context: 'diabetes management',
          includeHistory: true
        })
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data.content).toBeTruthy();
      // In stub mode, we should get a generic response
      expect(data.content).toContain('patient');
    });

    it('should respect user role permissions', async () => {
      const token = await createTestJWT(TEST_USERS.viewer);
      
      const response = await SELF.fetch('http://localhost/actions/generate-draft', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          context: 'medication reminder'
        })
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain('permission');
    });

    it('should log draft generation for audit', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/actions/generate-draft', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          context: 'medication reminder'
        })
      });

      expectResponseOk(response);
      
      // Check that audit log was created
      const auditResponse = await SELF.fetch('http://localhost/audit-logs', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      expectResponseOk(auditResponse);
      const auditData = await auditResponse.json();
      
      const draftLog = auditData.logs.find((log: any) => 
        log.action === 'draft_generated' && 
        log.userId === TEST_USERS.user.id
      );
      
      expect(draftLog).toBeTruthy();
    });
  });

  describe('Draft generation with real OpenAI (when API key available)', () => {
    it('should work with real OpenAI API when not in stub mode', async () => {
      // Skip if no real API key or in CI
      if (env.AI_STUB === '1' || !process.env.OPENAI_API_KEY?.startsWith('sk-')) {
        return;
      }

      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/actions/generate-draft', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          context: 'medication reminder',
          _test_real_api: true
        })
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data.content).toBeTruthy();
      expect(data.content.length).toBeGreaterThan(10);
      expect(data.usage).toBeDefined();
    });
  });
});
