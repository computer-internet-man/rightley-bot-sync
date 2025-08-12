import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SELF } from 'cloudflare:test';
import { createMockEnv } from '../utils/mock-env';
import { TEST_USERS, createTestJWT } from '../utils/test-auth';
import { 
  expectResponseOk, 
  expectJsonResponse,
  waitForQueueProcessing
} from '../utils/test-helpers';

describe('Queue Integration Tests', () => {
  let env: any;
  let userToken: string;
  let adminToken: string;

  beforeEach(async () => {
    env = createMockEnv();
    userToken = await createTestJWT(TEST_USERS.user);
    adminToken = await createTestJWT(TEST_USERS.admin);
    vi.clearAllMocks();
  });

  describe('Message Delivery Queue', () => {
    it('should process message delivery jobs end-to-end', async () => {
      // Create a message
      const messageResponse = await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          content: 'Test message for queue processing',
          status: 'approved'
        })
      });

      expectResponseOk(messageResponse, 201);
      const messageData = await messageResponse.json();
      const messageId = messageData.message.id;

      // Send the message (should enqueue delivery job)
      const sendResponse = await SELF.fetch(`http://localhost/messages/${messageId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'test-provider',
          destination: '+1234567890'
        })
      });

      expectResponseOk(sendResponse);
      const sendData = await sendResponse.json();
      expect(sendData.success).toBe(true);

      // Verify job was queued
      const queueStatusResponse = await SELF.fetch('http://localhost/debug/queue-status', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expectResponseOk(queueStatusResponse);
      const queueData = await queueStatusResponse.json();
      expect(queueData.queue.jobsQueued).toBeGreaterThan(0);

      // Process the queue (simulate consumer)
      const processResponse = await SELF.fetch('http://localhost/debug/process-queue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          batchSize: 10
        })
      });

      expectResponseOk(processResponse);
      const processData = await processResponse.json();
      expect(processData.processed).toBeGreaterThan(0);

      // Check delivery status was updated
      const statusResponse = await SELF.fetch(`http://localhost/messages/${messageId}/delivery-status`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      expectResponseOk(statusResponse);
      const statusData = await statusResponse.json();
      expect(statusData.deliveries).toBeDefined();
      expect(statusData.deliveries.length).toBeGreaterThan(0);
      
      const delivery = statusData.deliveries[0];
      expect(delivery.status).toBe('delivered');
      expect(delivery.provider).toBe('test-provider');
    });

    it('should handle batch message delivery', async () => {
      // Create multiple messages
      const messageIds: string[] = [];
      
      for (let i = 1; i <= 5; i++) {
        const response = await SELF.fetch('http://localhost/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            patientId: `patient-${i % 2 + 1}`, // Alternate between patient-1 and patient-2
            content: `Batch message ${i}`,
            status: 'approved'
          })
        });

        expectResponseOk(response, 201);
        const data = await response.json();
        messageIds.push(data.message.id);
      }

      // Send all messages in batch
      const batchSendResponse = await SELF.fetch('http://localhost/messages/bulk-send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messageIds,
          provider: 'test-provider',
          destinations: messageIds.map((_, i) => `+123456789${i}`)
        })
      });

      expectResponseOk(batchSendResponse);
      const batchData = await batchSendResponse.json();
      expect(batchData.queued).toBe(true);
      expect(batchData.count).toBe(5);

      // Process the batch
      const processResponse = await SELF.fetch('http://localhost/debug/process-queue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          batchSize: 10
        })
      });

      expectResponseOk(processResponse);
      const processData = await processResponse.json();
      expect(processData.processed).toBe(5);

      // Verify all messages were delivered
      for (const messageId of messageIds) {
        const statusResponse = await SELF.fetch(`http://localhost/messages/${messageId}/delivery-status`, {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        expectResponseOk(statusResponse);
        const statusData = await statusResponse.json();
        expect(statusData.deliveries.length).toBeGreaterThan(0);
        expect(statusData.deliveries[0].status).toBe('delivered');
      }
    });

    it('should handle delivery failures and retries', async () => {
      // Create a message
      const messageResponse = await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          content: 'Message that will fail delivery',
          status: 'approved'
        })
      });

      expectResponseOk(messageResponse, 201);
      const messageData = await messageResponse.json();
      const messageId = messageData.message.id;

      // Send with failing provider
      const sendResponse = await SELF.fetch(`http://localhost/messages/${messageId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'failing-provider',
          destination: '+1234567890',
          _test_failure: true
        })
      });

      // Should fail immediately for invalid provider
      expect(sendResponse.status).toBe(500);

      // Queue a retry with valid provider
      const retryResponse = await SELF.fetch(`http://localhost/messages/${messageId}/retry-delivery`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'test-provider',
          destination: '+1234567890'
        })
      });

      expectResponseOk(retryResponse);
      const retryData = await retryResponse.json();
      expect(retryData.retryQueued).toBe(true);

      // Process the retry
      const processResponse = await SELF.fetch('http://localhost/debug/process-queue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });

      expectResponseOk(processResponse);

      // Check that retry succeeded
      const statusResponse = await SELF.fetch(`http://localhost/messages/${messageId}/delivery-status`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      expectResponseOk(statusResponse);
      const statusData = await statusResponse.json();
      expect(statusData.deliveries.length).toBeGreaterThan(0);
      
      const delivery = statusData.deliveries[0];
      expect(delivery.attempts).toBeGreaterThanOrEqual(1);
      expect(delivery.status).toBe('delivered');
    });

    it('should handle maximum retry limits', async () => {
      // Create a message
      const messageResponse = await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          content: 'Message that will exceed retry limit',
          status: 'approved'
        })
      });

      expectResponseOk(messageResponse, 201);
      const messageData = await messageResponse.json();
      const messageId = messageData.message.id;

      // Simulate multiple failed retries
      for (let i = 1; i <= 5; i++) {
        const retryResponse = await SELF.fetch(`http://localhost/messages/${messageId}/retry-delivery`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            provider: 'test-provider',
            destination: '+1234567890',
            _test_retry_count: i
          })
        });

        if (i <= 3) {
          expectResponseOk(retryResponse);
        } else {
          // Should reject after max retries
          expect(retryResponse.status).toBe(400);
          const errorData = await retryResponse.json();
          expect(errorData.error).toContain('maximum retry attempts');
          break;
        }
      }
    });
  });

  describe('Audit Log Queue', () => {
    it('should process audit log creation jobs', async () => {
      // Perform an auditable action
      const patientResponse = await SELF.fetch('http://localhost/patients/patient-1', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      expectResponseOk(patientResponse);

      // Wait for audit log to be processed
      await waitForQueueProcessing();

      // Process audit queue
      const processResponse = await SELF.fetch('http://localhost/debug/process-audit-queue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      expectResponseOk(processResponse);
      const processData = await processResponse.json();
      expect(processData.processed).toBeGreaterThan(0);

      // Verify audit log was created
      const auditResponse = await SELF.fetch('http://localhost/audit-logs', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expectResponseOk(auditResponse);
      const auditData = await auditResponse.json();
      
      const userAuditLog = auditData.logs.find((log: any) => 
        log.userId === TEST_USERS.user.id && 
        log.action === 'patient_viewed'
      );
      
      expect(userAuditLog).toBeTruthy();
      expect(userAuditLog.details).toContain('patient-1');
    });

    it('should batch process multiple audit logs', async () => {
      // Perform multiple auditable actions
      const actions = [
        () => SELF.fetch('http://localhost/patients/patient-1', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        }),
        () => SELF.fetch('http://localhost/patients/patient-2', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        }),
        () => SELF.fetch('http://localhost/messages', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        })
      ];

      // Execute actions in parallel
      await Promise.all(actions.map(action => action()));

      // Wait for jobs to be queued
      await waitForQueueProcessing();

      // Process audit queue
      const processResponse = await SELF.fetch('http://localhost/debug/process-audit-queue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          batchSize: 10
        })
      });

      expectResponseOk(processResponse);
      const processData = await processResponse.json();
      expect(processData.processed).toBeGreaterThanOrEqual(3);

      // Verify all audit logs were created
      const auditResponse = await SELF.fetch('http://localhost/audit-logs', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expectResponseOk(auditResponse);
      const auditData = await auditResponse.json();
      
      const userAuditLogs = auditData.logs.filter((log: any) => 
        log.userId === TEST_USERS.user.id
      );
      
      expect(userAuditLogs.length).toBeGreaterThanOrEqual(3);
      
      const actions_logged = userAuditLogs.map((log: any) => log.action);
      expect(actions_logged).toContain('patient_viewed');
      expect(actions_logged).toContain('messages_viewed');
    });
  });

  describe('Notification Queue', () => {
    it('should process notification jobs', async () => {
      // Queue a notification
      const notificationResponse = await SELF.fetch('http://localhost/debug/enqueue-notification', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'system_notification',
          recipients: ['admin@test.com'],
          subject: 'Test Notification',
          message: 'This is a test notification'
        })
      });

      expectResponseOk(notificationResponse);

      // Process notification queue
      const processResponse = await SELF.fetch('http://localhost/debug/process-notification-queue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      expectResponseOk(processResponse);
      const processData = await processResponse.json();
      expect(processData.processed).toBeGreaterThan(0);
      expect(processData.notifications).toBeDefined();
      
      const notification = processData.notifications[0];
      expect(notification.recipients).toContain('admin@test.com');
      expect(notification.subject).toBe('Test Notification');
    });

    it('should handle delivery status notifications', async () => {
      // Create and send a message with notification enabled
      const messageResponse = await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          content: 'Message with delivery notification',
          status: 'approved'
        })
      });

      expectResponseOk(messageResponse, 201);
      const messageData = await messageResponse.json();
      const messageId = messageData.message.id;

      // Send with notification enabled
      const sendResponse = await SELF.fetch(`http://localhost/messages/${messageId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'test-provider',
          destination: '+1234567890',
          notifyOnDelivery: true
        })
      });

      expectResponseOk(sendResponse);

      // Process both delivery and notification queues
      await SELF.fetch('http://localhost/debug/process-queue', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      await SELF.fetch('http://localhost/debug/process-notification-queue', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      // Verify notification was sent
      const notificationStatusResponse = await SELF.fetch('http://localhost/debug/notification-status', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expectResponseOk(notificationStatusResponse);
      const notificationData = await notificationStatusResponse.json();
      
      const deliveryNotification = notificationData.notifications.find((n: any) =>
        n.type === 'delivery_status' && n.messageId === messageId
      );
      
      expect(deliveryNotification).toBeTruthy();
      expect(deliveryNotification.status).toBe('sent');
    });
  });

  describe('Queue Monitoring and Health', () => {
    it('should provide queue health metrics', async () => {
      // Generate some queue activity
      await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          content: 'Queue health test message',
          status: 'approved'
        })
      });

      // Check queue health
      const healthResponse = await SELF.fetch('http://localhost/debug/queue-health', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expectResponseOk(healthResponse);
      const healthData = await healthResponse.json();
      
      expect(healthData.queues).toBeDefined();
      expect(healthData.queues.MESSAGE_QUEUE).toBeDefined();
      expect(healthData.queues.MESSAGE_QUEUE.status).toBe('healthy');
      expect(healthData.queues.MESSAGE_QUEUE.metrics).toBeDefined();
      
      const metrics = healthData.queues.MESSAGE_QUEUE.metrics;
      expect(metrics.totalProcessed).toBeDefined();
      expect(metrics.totalFailed).toBeDefined();
      expect(metrics.averageProcessingTime).toBeDefined();
    });

    it('should detect queue failures and alert', async () => {
      // Simulate queue failure
      const failureResponse = await SELF.fetch('http://localhost/debug/simulate-queue-failure', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          queue: 'MESSAGE_QUEUE',
          failureType: 'connection_timeout'
        })
      });

      expectResponseOk(failureResponse);

      // Check queue health after failure
      const healthResponse = await SELF.fetch('http://localhost/debug/queue-health', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expectResponseOk(healthResponse);
      const healthData = await healthResponse.json();
      
      expect(healthData.queues.MESSAGE_QUEUE.status).toBe('unhealthy');
      expect(healthData.queues.MESSAGE_QUEUE.lastError).toBeTruthy();
      expect(healthData.alerts).toBeDefined();
      expect(healthData.alerts.length).toBeGreaterThan(0);
    });

    it('should handle queue congestion monitoring', async () => {
      // Enqueue many jobs to create congestion
      const jobs = Array.from({ length: 20 }, (_, i) => ({
        type: 'message_delivery',
        messageId: `bulk-message-${i}`,
        provider: 'test-provider',
        destination: `+123456789${i}`
      }));

      const batchResponse = await SELF.fetch('http://localhost/debug/enqueue-batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jobs })
      });

      expectResponseOk(batchResponse);

      // Check congestion metrics
      const metricsResponse = await SELF.fetch('http://localhost/debug/queue-metrics', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expectResponseOk(metricsResponse);
      const metricsData = await metricsResponse.json();
      
      expect(metricsData.metrics.queueDepth).toBeGreaterThan(10);
      expect(metricsData.metrics.congestionLevel).toBeDefined();
      
      if (metricsData.metrics.queueDepth > 15) {
        expect(metricsData.metrics.congestionLevel).toBe('high');
        expect(metricsData.recommendations).toContain('increase processing capacity');
      }
    });
  });

  describe('Queue Error Recovery', () => {
    it('should recover from temporary queue failures', async () => {
      // Simulate temporary failure
      const failureResponse = await SELF.fetch('http://localhost/debug/simulate-queue-failure', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          queue: 'MESSAGE_QUEUE',
          failureType: 'temporary_network_error',
          duration: 1000 // 1 second
        })
      });

      expectResponseOk(failureResponse);

      // Wait for recovery
      await waitForQueueProcessing(1500);

      // Check recovery
      const healthResponse = await SELF.fetch('http://localhost/debug/queue-health', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expectResponseOk(healthResponse);
      const healthData = await healthResponse.json();
      
      expect(healthData.queues.MESSAGE_QUEUE.status).toBe('healthy');
      expect(healthData.queues.MESSAGE_QUEUE.recoveredAt).toBeTruthy();
    });

    it('should handle dead letter queue processing', async () => {
      // Create a job that will fail permanently
      const poisonJobResponse = await SELF.fetch('http://localhost/debug/enqueue-poison-job', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'message_delivery',
          messageId: 'poison-message',
          provider: 'permanently-failing-provider'
        })
      });

      expectResponseOk(poisonJobResponse);

      // Process the job (should fail and move to DLQ)
      const processResponse = await SELF.fetch('http://localhost/debug/process-queue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          maxRetries: 3
        })
      });

      expectResponseOk(processResponse);

      // Check dead letter queue
      const dlqResponse = await SELF.fetch('http://localhost/debug/dead-letter-queue', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expectResponseOk(dlqResponse);
      const dlqData = await dlqResponse.json();
      
      expect(dlqData.jobs).toBeDefined();
      expect(dlqData.jobs.length).toBeGreaterThan(0);
      
      const poisonJob = dlqData.jobs.find((job: any) => 
        job.messageId === 'poison-message'
      );
      
      expect(poisonJob).toBeTruthy();
      expect(poisonJob.attempts).toBeGreaterThanOrEqual(3);
      expect(poisonJob.status).toBe('failed');
    });
  });
});
