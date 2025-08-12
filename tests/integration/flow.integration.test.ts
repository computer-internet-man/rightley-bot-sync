import { describe, it, expect, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { TEST_USERS, createTestJWT } from '../utils/test-auth';
import { 
  expectResponseOk, 
  expectJsonResponse, 
  expectValidMessage, 
  expectValidAuditLog,
  waitForQueueProcessing
} from '../utils/test-helpers';

describe('Full Workflow Integration', () => {
  let userToken: string;
  let adminToken: string;

  beforeEach(async () => {
    userToken = await createTestJWT(TEST_USERS.user);
    adminToken = await createTestJWT(TEST_USERS.admin);
  });

  describe('Patient Care Message Workflow', () => {
    it('should complete full workflow: select patient → generate draft → send → track delivery', async () => {
      // Step 1: List patients
      const patientsResponse = await SELF.fetch('http://localhost/patients', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      
      expectResponseOk(patientsResponse);
      const patientsData = await expectJsonResponse(patientsResponse);
      expect(patientsData.patients.length).toBeGreaterThan(0);
      
      const patient = patientsData.patients[0];
      expect(patient.id).toBeTruthy();

      // Step 2: Generate draft message
      const draftResponse = await SELF.fetch('http://localhost/actions/generate-draft', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: patient.id,
          context: 'medication reminder',
          includeHistory: true
        })
      });

      expectResponseOk(draftResponse);
      const draftData = await expectJsonResponse(draftResponse);
      expect(draftData.content).toBeTruthy();

      // Step 3: Create message with generated content
      const messageResponse = await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: patient.id,
          content: draftData.content,
          status: 'draft'
        })
      });

      expectResponseOk(messageResponse, 201);
      const messageData = await expectJsonResponse(messageResponse);
      expectValidMessage(messageData.message);
      
      const messageId = messageData.message.id;

      // Step 4: Send message
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
      const sendData = await expectJsonResponse(sendResponse);
      expect(sendData.success).toBe(true);
      expect(sendData.messageId).toBeTruthy();

      // Step 5: Wait for queue processing
      await waitForQueueProcessing(200);

      // Step 6: Check delivery status
      const statusResponse = await SELF.fetch(`http://localhost/messages/${messageId}/delivery-status`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      expectResponseOk(statusResponse);
      const statusData = await expectJsonResponse(statusResponse);
      expect(statusData.deliveries).toBeDefined();
      expect(statusData.deliveries.length).toBeGreaterThan(0);

      // Step 7: Verify audit trail
      const auditResponse = await SELF.fetch('http://localhost/audit-logs', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expectResponseOk(auditResponse);
      const auditData = await expectJsonResponse(auditResponse);
      
      const userAuditLogs = auditData.logs.filter((log: any) => 
        log.userId === TEST_USERS.user.id
      );

      expect(userAuditLogs.length).toBeGreaterThan(0);
      
      // Should have logs for: draft generation, message creation, message send
      const actions = userAuditLogs.map((log: any) => log.action);
      expect(actions).toContain('draft_generated');
      expect(actions).toContain('message_created');
      expect(actions).toContain('message_sent');
    });

    it('should handle workflow with message editing and approval', async () => {
      // Create initial draft
      const messageResponse = await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          content: 'Initial draft content',
          status: 'draft'
        })
      });

      expectResponseOk(messageResponse, 201);
      const messageData = await expectJsonResponse(messageResponse);
      const messageId = messageData.message.id;

      // Edit message
      const editResponse = await SELF.fetch(`http://localhost/messages/${messageId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: 'Edited message content',
          status: 'pending'
        })
      });

      expectResponseOk(editResponse);
      const editData = await expectJsonResponse(editResponse);
      expect(editData.message.content).toBe('Edited message content');
      expect(editData.message.status).toBe('pending');

      // Admin approval
      const approveResponse = await SELF.fetch(`http://localhost/messages/${messageId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          approved: true,
          notes: 'Approved for sending'
        })
      });

      expectResponseOk(approveResponse);
      const approveData = await expectJsonResponse(approveResponse);
      expect(approveData.message.status).toBe('approved');

      // Verify approval audit log
      const auditResponse = await SELF.fetch('http://localhost/audit-logs', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expectResponseOk(auditResponse);
      const auditData = await expectJsonResponse(auditResponse);
      
      const approvalLog = auditData.logs.find((log: any) => 
        log.action === 'message_approved' && 
        log.userId === TEST_USERS.admin.id
      );
      
      expect(approvalLog).toBeTruthy();
      expect(approvalLog.details).toContain(messageId);
    });

    it('should handle failed delivery with retry mechanism', async () => {
      // Create and send message with failing provider
      const messageResponse = await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          content: 'Message with failing delivery',
          status: 'approved'
        })
      });

      expectResponseOk(messageResponse, 201);
      const messageData = await expectJsonResponse(messageResponse);
      const messageId = messageData.message.id;

      // Attempt send with failing provider
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

      expect(sendResponse.status).toBe(500);

      // Retry with working provider
      const retryResponse = await SELF.fetch(`http://localhost/messages/${messageId}/retry-delivery`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'test-provider'
        })
      });

      expectResponseOk(retryResponse);
      const retryData = await expectJsonResponse(retryResponse);
      expect(retryData.retryQueued).toBe(true);

      // Wait for processing
      await waitForQueueProcessing();

      // Check delivery status shows retry attempt
      const statusResponse = await SELF.fetch(`http://localhost/messages/${messageId}/delivery-status`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      expectResponseOk(statusResponse);
      const statusData = await expectJsonResponse(statusResponse);
      expect(statusData.deliveries.length).toBeGreaterThan(0);
      
      const delivery = statusData.deliveries[0];
      expect(delivery.attempts).toBeGreaterThan(1);
    });
  });

  describe('Batch Operations Workflow', () => {
    it('should handle bulk message creation and delivery', async () => {
      // Create multiple messages
      const messageIds: string[] = [];
      
      for (let i = 1; i <= 3; i++) {
        const response = await SELF.fetch('http://localhost/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            patientId: `patient-${i}`,
            content: `Bulk message ${i}`,
            status: 'approved'
          })
        });

        expectResponseOk(response, 201);
        const data = await expectJsonResponse(response);
        messageIds.push(data.message.id);
      }

      // Bulk send operation
      const bulkSendResponse = await SELF.fetch('http://localhost/messages/bulk-send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messageIds,
          provider: 'test-provider',
          destinations: ['+1111111111', '+2222222222', '+3333333333']
        })
      });

      expectResponseOk(bulkSendResponse);
      const bulkData = await expectJsonResponse(bulkSendResponse);
      expect(bulkData.queued).toBe(true);
      expect(bulkData.count).toBe(3);

      // Wait for processing
      await waitForQueueProcessing(300);

      // Verify all messages were processed
      for (const messageId of messageIds) {
        const statusResponse = await SELF.fetch(`http://localhost/messages/${messageId}/delivery-status`, {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        expectResponseOk(statusResponse);
        const statusData = await expectJsonResponse(statusResponse);
        expect(statusData.deliveries.length).toBeGreaterThan(0);
      }
    });

    it('should handle bulk audit export workflow', async () => {
      // Generate some audit activity
      await SELF.fetch('http://localhost/patients/patient-1', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      await SELF.fetch('http://localhost/patients/patient-2', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      // Wait for audit logs to be created
      await waitForQueueProcessing();

      // Export audit logs as CSV
      const exportResponse = await SELF.fetch('http://localhost/audit-logs/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv',
          dateRange: {
            start: new Date(Date.now() - 86400000).toISOString(), // Last 24 hours
            end: new Date().toISOString()
          }
        })
      });

      expectResponseOk(exportResponse);
      expect(exportResponse.headers.get('content-type')).toContain('text/csv');
      
      const csvContent = await exportResponse.text();
      expect(csvContent).toContain('timestamp,userId,action,details');
      expect(csvContent.split('\n').length).toBeGreaterThan(1);

      // Verify export was logged
      const auditResponse = await SELF.fetch('http://localhost/audit-logs', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expectResponseOk(auditResponse);
      const auditData = await expectJsonResponse(auditResponse);
      
      const exportLog = auditData.logs.find((log: any) => 
        log.action === 'audit_exported' && 
        log.userId === TEST_USERS.admin.id
      );
      
      expect(exportLog).toBeTruthy();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should gracefully handle database failures', async () => {
      // Simulate database error
      const response = await SELF.fetch('http://localhost/patients', {
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'X-Test-DB-Error': 'connection_failed'
        }
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBeTruthy();
      expect(data.error).not.toContain('database'); // Should not expose internal details
    });

    it('should handle OpenAI service failures', async () => {
      const response = await SELF.fetch('http://localhost/actions/generate-draft', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          context: 'test',
          _test_openai_error: true
        })
      });

      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.error).toContain('service unavailable');
    });

    it('should handle queue service failures', async () => {
      const response = await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json',
          'X-Test-Queue-Error': 'queue_unavailable'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          content: 'Test message',
          scheduleDelivery: true
        })
      });

      // Message should be created but delivery queue should fail gracefully
      expectResponseOk(response, 201);
      const data = await expectJsonResponse(response);
      expect(data.message).toBeTruthy();
      expect(data.queueError).toBeTruthy();
    });
  });
});
