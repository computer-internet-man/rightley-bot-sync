import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { createMockEnv, mockDeliveryProvider } from '../utils/mock-env';
import { TEST_USERS, createTestJWT } from '../utils/test-auth';
import { expectResponseOk, expectJsonResponse } from '../utils/test-helpers';

describe('Delivery Providers', () => {
  let env: any;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
  });

  describe('Provider Interface', () => {
    it('should send message through configured provider', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/messages/message-1/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'test-provider',
          destination: '+1234567890'
        })
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data.success).toBe(true);
      expect(data.messageId).toBeTruthy();
      expect(data.provider).toBe('test-provider');
    });

    it('should handle provider failures gracefully', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/messages/message-1/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'failing-provider',
          destination: '+1234567890',
          _test_failure: true
        })
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain('delivery failed');
    });

    it('should validate destination format', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/messages/message-1/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'test-provider',
          destination: 'invalid-destination'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('destination');
    });

    it('should track delivery status', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      // Send message
      const sendResponse = await SELF.fetch('http://localhost/messages/message-1/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'test-provider',
          destination: '+1234567890'
        })
      });

      expectResponseOk(sendResponse);
      const sendData = await sendResponse.json();

      // Check delivery status
      const statusResponse = await SELF.fetch(`http://localhost/messages/message-1/delivery-status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expectResponseOk(statusResponse);
      const statusData = await statusResponse.json();
      
      expect(statusData.deliveries).toBeDefined();
      expect(Array.isArray(statusData.deliveries)).toBe(true);
      
      const delivery = statusData.deliveries.find((d: any) => 
        d.messageId === sendData.messageId
      );
      expect(delivery).toBeTruthy();
      expect(delivery.status).toBeTruthy();
    });
  });

  describe('Provider Configuration', () => {
    it('should list available providers', async () => {
      const token = await createTestJWT(TEST_USERS.admin);
      
      const response = await SELF.fetch('http://localhost/delivery-providers', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data.providers).toBeDefined();
      expect(Array.isArray(data.providers)).toBe(true);
      expect(data.providers.length).toBeGreaterThan(0);
      
      const provider = data.providers[0];
      expect(provider).toHaveProperty('name');
      expect(provider).toHaveProperty('type');
      expect(provider).toHaveProperty('enabled');
    });

    it('should allow admin to configure providers', async () => {
      const token = await createTestJWT(TEST_USERS.admin);
      
      const response = await SELF.fetch('http://localhost/delivery-providers/test-provider', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: true,
          config: {
            apiKey: 'test-api-key',
            endpoint: 'https://api.test-provider.com'
          }
        })
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data.success).toBe(true);
      expect(data.provider).toBe('test-provider');
    });

    it('should deny non-admin users from configuring providers', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/delivery-providers/test-provider', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: false
        })
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Message Delivery Queue', () => {
    it('should enqueue messages for delivery', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          content: 'Test message for delivery',
          scheduleDelivery: true,
          destination: '+1234567890'
        })
      });

      expectResponseOk(response, 201);
      const data = await expectJsonResponse(response);
      
      expect(data.message).toBeDefined();
      expect(data.message.status).toBe('pending');
      expect(data.queuedForDelivery).toBe(true);
    });

    it('should process delivery queue', async () => {
      // This would typically be triggered by the queue consumer
      const response = await SELF.fetch('http://localhost/debug/process-delivery-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          _test_mode: true
        })
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data.processed).toBeDefined();
      expect(typeof data.processed).toBe('number');
    });

    it('should retry failed deliveries', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/messages/message-1/retry-delivery', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'test-provider'
        })
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data.retryQueued).toBe(true);
      expect(data.attemptNumber).toBeGreaterThan(1);
    });

    it('should limit retry attempts', async () => {
      const token = await createTestJWT(TEST_USERS.admin);
      
      // Simulate a message with max retries reached
      const response = await SELF.fetch('http://localhost/messages/message-failed/retry-delivery', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'test-provider',
          _test_max_retries: true
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('maximum retry attempts');
    });
  });

  describe('Webhook Security', () => {
    it('should verify webhook signatures', async () => {
      const response = await SELF.fetch('http://localhost/webhooks/delivery-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Provider-Signature': 'valid-signature'
        },
        body: JSON.stringify({
          messageId: 'test-message-id',
          status: 'delivered',
          timestamp: new Date().toISOString()
        })
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data.processed).toBe(true);
    });

    it('should reject webhooks with invalid signatures', async () => {
      const response = await SELF.fetch('http://localhost/webhooks/delivery-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Provider-Signature': 'invalid-signature'
        },
        body: JSON.stringify({
          messageId: 'test-message-id',
          status: 'delivered'
        })
      });

      expect(response.status).toBe(401);
    });

    it('should reject webhooks without signatures', async () => {
      const response = await SELF.fetch('http://localhost/webhooks/delivery-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messageId: 'test-message-id',
          status: 'delivered'
        })
      });

      expect(response.status).toBe(401);
    });
  });
});
