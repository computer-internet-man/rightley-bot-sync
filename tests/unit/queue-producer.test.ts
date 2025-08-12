import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { createMockEnv } from '../utils/mock-env';
import { TEST_USERS, createTestJWT } from '../utils/test-auth';
import { expectResponseOk, expectJsonResponse } from '../utils/test-helpers';

describe('Queue Producer', () => {
  let env: any;
  let mockQueue: any;

  beforeEach(() => {
    mockQueue = {
      send: vi.fn().mockResolvedValue(undefined),
      sendBatch: vi.fn().mockResolvedValue(undefined)
    };
    
    env = createMockEnv({
      MESSAGE_QUEUE: mockQueue
    });
    
    vi.clearAllMocks();
  });

  describe('Message Delivery Jobs', () => {
    it('should enqueue single message delivery job', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/debug/enqueue-test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'message_delivery',
          messageId: 'message-1',
          provider: 'test-provider',
          destination: '+1234567890'
        })
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data.queued).toBe(true);
      expect(data.jobId).toBeTruthy();
      
      // Verify queue was called
      expect(mockQueue.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'message_delivery',
          messageId: 'message-1',
          provider: 'test-provider',
          destination: '+1234567890'
        })
      );
    });

    it('should enqueue batch of message delivery jobs', async () => {
      const token = await createTestJWT(TEST_USERS.admin);
      
      const response = await SELF.fetch('http://localhost/debug/enqueue-batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jobs: [
            {
              type: 'message_delivery',
              messageId: 'message-1',
              provider: 'test-provider',
              destination: '+1234567890'
            },
            {
              type: 'message_delivery',
              messageId: 'message-2',
              provider: 'test-provider',
              destination: '+0987654321'
            }
          ]
        })
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data.queued).toBe(true);
      expect(data.count).toBe(2);
      
      // Verify batch queue was called
      expect(mockQueue.sendBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'message_delivery',
            messageId: 'message-1'
          }),
          expect.objectContaining({
            type: 'message_delivery',
            messageId: 'message-2'
          })
        ])
      );
    });

    it('should handle queue failures gracefully', async () => {
      mockQueue.send.mockRejectedValue(new Error('Queue unavailable'));
      
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/debug/enqueue-test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'message_delivery',
          messageId: 'message-1'
        })
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain('queue');
    });

    it('should validate job parameters', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/debug/enqueue-test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // Missing required fields
          type: 'message_delivery'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('required');
    });
  });

  describe('Audit Log Jobs', () => {
    it('should enqueue audit log creation', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/debug/enqueue-audit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: 'test-user-1',
          action: 'message_created',
          details: { messageId: 'message-1' }
        })
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data.queued).toBe(true);
      
      // Verify audit job was queued
      expect(mockQueue.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'audit_log',
          userId: 'test-user-1',
          action: 'message_created',
          details: expect.objectContaining({
            messageId: 'message-1'
          })
        })
      );
    });

    it('should automatically queue audit logs for tracked actions', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      // Perform a tracked action (creating a message)
      const response = await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          content: 'Test message'
        })
      });

      expectResponseOk(response, 201);
      
      // Verify audit log was automatically queued
      expect(mockQueue.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'audit_log',
          userId: 'test-user-1',
          action: 'message_created'
        })
      );
    });
  });

  describe('Notification Jobs', () => {
    it('should enqueue notification jobs', async () => {
      const token = await createTestJWT(TEST_USERS.admin);
      
      const response = await SELF.fetch('http://localhost/debug/enqueue-notification', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'system_notification',
          recipients: ['admin@test.com'],
          subject: 'System Alert',
          message: 'Test notification'
        })
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data.queued).toBe(true);
      
      // Verify notification job was queued
      expect(mockQueue.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'system_notification',
          recipients: ['admin@test.com'],
          subject: 'System Alert',
          message: 'Test notification'
        })
      );
    });

    it('should enqueue delivery status notifications', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/messages/message-1/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'test-provider',
          destination: '+1234567890',
          notifyOnDelivery: true
        })
      });

      expectResponseOk(response);
      
      // Verify both delivery and notification jobs were queued
      expect(mockQueue.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'message_delivery'
        })
      );
      
      expect(mockQueue.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'delivery_notification'
        })
      );
    });
  });

  describe('Queue Status and Monitoring', () => {
    it('should provide queue status information', async () => {
      const token = await createTestJWT(TEST_USERS.admin);
      
      const response = await SELF.fetch('http://localhost/debug/queue-status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data.queue).toBeDefined();
      expect(data.queue.name).toBe('MESSAGE_QUEUE');
      expect(data.queue.status).toBeDefined();
    });

    it('should track job counts and metrics', async () => {
      const token = await createTestJWT(TEST_USERS.admin);
      
      // Enqueue several jobs
      await SELF.fetch('http://localhost/debug/enqueue-test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'message_delivery',
          messageId: 'message-1'
        })
      });

      const response = await SELF.fetch('http://localhost/debug/queue-metrics', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expectResponseOk(response);
      const data = await expectJsonResponse(response);
      
      expect(data.metrics).toBeDefined();
      expect(data.metrics.totalJobs).toBeDefined();
      expect(data.metrics.jobTypes).toBeDefined();
    });

    it('should require admin access for queue monitoring', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/debug/queue-status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Job Priority and Scheduling', () => {
    it('should support job priority levels', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/debug/enqueue-priority', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'urgent_delivery',
          messageId: 'urgent-message-1',
          priority: 'high'
        })
      });

      expectResponseOk(response);
      
      // Verify high priority job was queued
      expect(mockQueue.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'urgent_delivery',
          priority: 'high'
        })
      );
    });

    it('should support delayed job execution', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const futureTime = new Date(Date.now() + 3600000); // 1 hour from now
      
      const response = await SELF.fetch('http://localhost/debug/enqueue-delayed', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'scheduled_delivery',
          messageId: 'scheduled-message-1',
          scheduledFor: futureTime.toISOString()
        })
      });

      expectResponseOk(response);
      
      // Verify scheduled job was queued
      expect(mockQueue.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'scheduled_delivery',
          scheduledFor: futureTime.toISOString()
        })
      );
    });
  });
});
