import { describe, it, expect, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { TEST_USERS, createTestJWT } from '../utils/test-auth';
import { 
  expectResponseOk, 
  expectJsonResponse,
  expectValidMessage,
  expectValidPatient,
  expectValidUser,
  assertUnauthorized,
  assertForbidden,
  assertNotFound,
  assertBadRequest,
  assertMethodNotAllowed
} from '../utils/test-helpers';

describe('API Integration Tests', () => {
  let userToken: string;
  let adminToken: string;
  let viewerToken: string;

  beforeEach(async () => {
    userToken = await createTestJWT(TEST_USERS.user);
    adminToken = await createTestJWT(TEST_USERS.admin);
    viewerToken = await createTestJWT(TEST_USERS.viewer);
  });

  describe('Patients API', () => {
    describe('GET /patients', () => {
      it('should return list of patients for authenticated users', async () => {
        const response = await SELF.fetch('http://localhost/patients', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        
        expect(data.patients).toBeDefined();
        expect(Array.isArray(data.patients)).toBe(true);
        
        if (data.patients.length > 0) {
          expectValidPatient(data.patients[0]);
        }
      });

      it('should require authentication', async () => {
        const response = await SELF.fetch('http://localhost/patients');
        assertUnauthorized(response);
      });

      it('should support pagination', async () => {
        const response = await SELF.fetch('http://localhost/patients?page=1&limit=2', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        
        expect(data.patients).toBeDefined();
        expect(data.pagination).toBeDefined();
        expect(data.pagination.page).toBe(1);
        expect(data.pagination.limit).toBe(2);
      });

      it('should support filtering', async () => {
        const response = await SELF.fetch('http://localhost/patients?condition=stable', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        
        if (data.patients.length > 0) {
          data.patients.forEach((patient: any) => {
            expect(patient.currentCondition.toLowerCase()).toContain('stable');
          });
        }
      });
    });

    describe('GET /patients/:id', () => {
      it('should return specific patient details', async () => {
        const response = await SELF.fetch('http://localhost/patients/patient-1', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        
        expectValidPatient(data.patient);
        expect(data.patient.id).toBe('patient-1');
      });

      it('should return 404 for non-existent patient', async () => {
        const response = await SELF.fetch('http://localhost/patients/non-existent', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        assertNotFound(response);
      });

      it('should include related messages when requested', async () => {
        const response = await SELF.fetch('http://localhost/patients/patient-1?include=messages', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        
        expect(data.patient).toBeDefined();
        expect(data.messages).toBeDefined();
        expect(Array.isArray(data.messages)).toBe(true);
      });
    });

    describe('POST /patients', () => {
      it('should allow admin to create new patients', async () => {
        const newPatient = {
          name: 'New Test Patient',
          age: 35,
          medicalHistory: 'Test history',
          currentCondition: 'Stable'
        };

        const response = await SELF.fetch('http://localhost/patients', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(newPatient)
        });

        expectResponseOk(response, 201);
        const data = await expectJsonResponse(response);
        
        expectValidPatient(data.patient);
        expect(data.patient.name).toBe(newPatient.name);
        expect(data.patient.age).toBe(newPatient.age);
      });

      it('should deny non-admin users from creating patients', async () => {
        const response = await SELF.fetch('http://localhost/patients', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'Test Patient',
            age: 30
          })
        });

        assertForbidden(response);
      });

      it('should validate required fields', async () => {
        const response = await SELF.fetch('http://localhost/patients', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            // Missing required fields
            age: 30
          })
        });

        assertBadRequest(response);
        const data = await response.json();
        expect(data.error).toContain('name');
      });
    });

    describe('PUT /patients/:id', () => {
      it('should allow admin to update patients', async () => {
        const updates = {
          currentCondition: 'Improving',
          medicalHistory: 'Updated medical history'
        };

        const response = await SELF.fetch('http://localhost/patients/patient-1', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updates)
        });

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        
        expect(data.patient.currentCondition).toBe('Improving');
        expect(data.patient.medicalHistory).toBe('Updated medical history');
      });

      it('should deny non-admin users from updating patients', async () => {
        const response = await SELF.fetch('http://localhost/patients/patient-1', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            currentCondition: 'Updated'
          })
        });

        assertForbidden(response);
      });
    });

    describe('DELETE /patients/:id', () => {
      it('should allow admin to delete patients', async () => {
        // First create a patient to delete
        const createResponse = await SELF.fetch('http://localhost/patients', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'Patient to Delete',
            age: 25,
            medicalHistory: 'None',
            currentCondition: 'Healthy'
          })
        });

        expectResponseOk(createResponse, 201);
        const createData = await createResponse.json();
        const patientId = createData.patient.id;

        // Now delete the patient
        const response = await SELF.fetch(`http://localhost/patients/${patientId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        });

        expectResponseOk(response, 204);

        // Verify patient is deleted
        const getResponse = await SELF.fetch(`http://localhost/patients/${patientId}`, {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        assertNotFound(getResponse);
      });

      it('should deny non-admin users from deleting patients', async () => {
        const response = await SELF.fetch('http://localhost/patients/patient-1', {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${userToken}`
          }
        });

        assertForbidden(response);
      });
    });
  });

  describe('Messages API', () => {
    describe('GET /messages', () => {
      it('should return messages for authenticated users', async () => {
        const response = await SELF.fetch('http://localhost/messages', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        
        expect(data.messages).toBeDefined();
        expect(Array.isArray(data.messages)).toBe(true);
        
        if (data.messages.length > 0) {
          expectValidMessage(data.messages[0]);
        }
      });

      it('should filter messages by patient', async () => {
        const response = await SELF.fetch('http://localhost/messages?patientId=patient-1', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        
        data.messages.forEach((message: any) => {
          expect(message.patientId).toBe('patient-1');
        });
      });

      it('should filter messages by status', async () => {
        const response = await SELF.fetch('http://localhost/messages?status=draft', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        
        data.messages.forEach((message: any) => {
          expect(message.status).toBe('draft');
        });
      });
    });

    describe('POST /messages', () => {
      it('should allow users to create messages', async () => {
        const newMessage = {
          patientId: 'patient-1',
          content: 'New test message',
          status: 'draft'
        };

        const response = await SELF.fetch('http://localhost/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(newMessage)
        });

        expectResponseOk(response, 201);
        const data = await expectJsonResponse(response);
        
        expectValidMessage(data.message);
        expect(data.message.content).toBe(newMessage.content);
        expect(data.message.patientId).toBe(newMessage.patientId);
        expect(data.message.createdBy).toBe(TEST_USERS.user.id);
      });

      it('should deny viewers from creating messages', async () => {
        const response = await SELF.fetch('http://localhost/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${viewerToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            patientId: 'patient-1',
            content: 'Test message'
          })
        });

        assertForbidden(response);
      });

      it('should validate message content', async () => {
        const response = await SELF.fetch('http://localhost/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            patientId: 'patient-1',
            content: ''  // Empty content
          })
        });

        assertBadRequest(response);
        const data = await response.json();
        expect(data.error).toContain('content');
      });
    });

    describe('PUT /messages/:id', () => {
      it('should allow message creator to edit their own messages', async () => {
        // First create a message
        const createResponse = await SELF.fetch('http://localhost/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            patientId: 'patient-1',
            content: 'Original content',
            status: 'draft'
          })
        });

        expectResponseOk(createResponse, 201);
        const createData = await createResponse.json();
        const messageId = createData.message.id;

        // Now edit the message
        const updateResponse = await SELF.fetch(`http://localhost/messages/${messageId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            content: 'Updated content',
            status: 'pending'
          })
        });

        expectResponseOk(updateResponse);
        const updateData = await updateResponse.json();
        
        expect(updateData.message.content).toBe('Updated content');
        expect(updateData.message.status).toBe('pending');
      });

      it('should deny users from editing messages they did not create', async () => {
        // Try to edit message-1 (created by test setup, not the current user)
        const response = await SELF.fetch('http://localhost/messages/message-1', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            content: 'Unauthorized edit'
          })
        });

        assertForbidden(response);
      });

      it('should allow admin to edit any message', async () => {
        const response = await SELF.fetch('http://localhost/messages/message-1', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            content: 'Admin updated content'
          })
        });

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        expect(data.message.content).toBe('Admin updated content');
      });
    });

    describe('POST /messages/:id/send', () => {
      it('should allow sending approved messages', async () => {
        const response = await SELF.fetch('http://localhost/messages/message-1/send', {
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

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        
        expect(data.success).toBe(true);
        expect(data.messageId).toBeTruthy();
        expect(data.provider).toBe('test-provider');
      });

      it('should deny sending draft messages', async () => {
        // First create a draft message
        const createResponse = await SELF.fetch('http://localhost/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            patientId: 'patient-1',
            content: 'Draft message',
            status: 'draft'
          })
        });

        const createData = await createResponse.json();
        const messageId = createData.message.id;

        // Try to send the draft
        const response = await SELF.fetch(`http://localhost/messages/${messageId}/send`, {
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

        assertBadRequest(response);
        const data = await response.json();
        expect(data.error).toContain('draft');
      });
    });
  });

  describe('Users API', () => {
    describe('GET /users', () => {
      it('should allow admin to list users', async () => {
        const response = await SELF.fetch('http://localhost/users', {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        
        expect(data.users).toBeDefined();
        expect(Array.isArray(data.users)).toBe(true);
        
        if (data.users.length > 0) {
          expectValidUser(data.users[0]);
        }
      });

      it('should deny non-admin users from listing users', async () => {
        const response = await SELF.fetch('http://localhost/users', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        assertForbidden(response);
      });
    });

    describe('GET /me', () => {
      it('should return current user information', async () => {
        const response = await SELF.fetch('http://localhost/me', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        
        expectValidUser(data.user);
        expect(data.user.id).toBe(TEST_USERS.user.id);
        expect(data.user.email).toBe(TEST_USERS.user.email);
        expect(data.user.role).toBe(TEST_USERS.user.role);
      });

      it('should require authentication', async () => {
        const response = await SELF.fetch('http://localhost/me');
        assertUnauthorized(response);
      });
    });
  });

  describe('Audit Logs API', () => {
    describe('GET /audit-logs', () => {
      it('should allow admin to view audit logs', async () => {
        const response = await SELF.fetch('http://localhost/audit-logs', {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        
        expect(data.logs).toBeDefined();
        expect(Array.isArray(data.logs)).toBe(true);
        
        if (data.logs.length > 0) {
          expectValidAuditLog(data.logs[0]);
        }
      });

      it('should deny non-admin users from viewing audit logs', async () => {
        const response = await SELF.fetch('http://localhost/audit-logs', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        assertForbidden(response);
      });

      it('should support date range filtering', async () => {
        const startDate = new Date(Date.now() - 86400000).toISOString(); // 24 hours ago
        const endDate = new Date().toISOString();

        const response = await SELF.fetch(`http://localhost/audit-logs?start=${startDate}&end=${endDate}`, {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        expectResponseOk(response);
        const data = await expectJsonResponse(response);
        
        data.logs.forEach((log: any) => {
          const logTime = new Date(log.timestamp);
          expect(logTime.getTime()).toBeGreaterThanOrEqual(new Date(startDate).getTime());
          expect(logTime.getTime()).toBeLessThanOrEqual(new Date(endDate).getTime());
        });
      });
    });

    describe('GET /audit-logs/export', () => {
      it('should allow viewer to export audit logs', async () => {
        const response = await SELF.fetch('http://localhost/audit-logs/export', {
          headers: { 'Authorization': `Bearer ${viewerToken}` }
        });

        expectResponseOk(response);
        expect(response.headers.get('content-type')).toContain('text/csv');
        expect(response.headers.get('content-disposition')).toContain('attachment');
        
        const csvContent = await response.text();
        expect(csvContent).toContain('timestamp,userId,action,details');
      });

      it('should deny regular users from exporting audit logs', async () => {
        const response = await SELF.fetch('http://localhost/audit-logs/export', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });

        assertForbidden(response);
      });
    });
  });

  describe('Unsupported Methods', () => {
    it('should return 405 for unsupported HTTP methods', async () => {
      const response = await SELF.fetch('http://localhost/patients', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      assertMethodNotAllowed(response);
    });
  });

  describe('Content Type Validation', () => {
    it('should require JSON content type for POST requests', async () => {
      const response = await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'text/plain'
        },
        body: 'Not JSON'
      });

      assertBadRequest(response);
      const data = await response.json();
      expect(data.error).toContain('JSON');
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: '{ invalid json'
      });

      assertBadRequest(response);
      const data = await response.json();
      expect(data.error).toContain('JSON');
    });
  });
});
