import { describe, it, expect, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { TEST_USERS, createTestJWT } from '../utils/test-auth';
import { 
  expectResponseOk, 
  expectJsonResponse,
  expectCsvResponse,
  waitForQueueProcessing
} from '../utils/test-helpers';

describe('Export Integration Tests', () => {
  let userToken: string;
  let adminToken: string;
  let viewerToken: string;

  beforeEach(async () => {
    userToken = await createTestJWT(TEST_USERS.user);
    adminToken = await createTestJWT(TEST_USERS.admin);
    viewerToken = await createTestJWT(TEST_USERS.viewer);
  });

  describe('Audit Logs Export', () => {
    beforeEach(async () => {
      // Generate some audit activity for testing
      await SELF.fetch('http://localhost/patients/patient-1', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      await SELF.fetch('http://localhost/patients/patient-2', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      const messageResponse = await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          content: 'Test message for audit',
          status: 'draft'
        })
      });

      // Wait for audit logs to be processed
      await waitForQueueProcessing(200);
    });

    it('should export audit logs as CSV with all required fields', async () => {
      const response = await SELF.fetch('http://localhost/audit-logs/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${viewerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv'
        })
      });

      expectResponseOk(response);
      const csvContent = await expectCsvResponse(response);
      
      // Verify CSV structure
      const lines = csvContent.trim().split('\n');
      expect(lines.length).toBeGreaterThan(1); // Header + at least one data row
      
      const header = lines[0];
      expect(header).toContain('timestamp');
      expect(header).toContain('userId');
      expect(header).toContain('action');
      expect(header).toContain('details');
      expect(header).toContain('userEmail');
      expect(header).toContain('userRole');

      // Verify data rows
      const dataLines = lines.slice(1);
      expect(dataLines.length).toBeGreaterThan(0);
      
      // Check first data row format
      const firstRow = dataLines[0].split(',');
      expect(firstRow.length).toBe(6); // 6 columns as per header
      
      // Timestamp should be valid ISO date
      const timestamp = firstRow[0];
      expect(new Date(timestamp).toString()).not.toBe('Invalid Date');
      
      // User ID should match one of our test users
      const userId = firstRow[1];
      expect(Object.values(TEST_USERS).map(u => u.id)).toContain(userId);
    });

    it('should support date range filtering in exports', async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const tomorrow = new Date(Date.now() + 86400000).toISOString();

      const response = await SELF.fetch('http://localhost/audit-logs/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${viewerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv',
          dateRange: {
            start: yesterday,
            end: tomorrow
          }
        })
      });

      expectResponseOk(response);
      const csvContent = await expectCsvResponse(response);
      
      const lines = csvContent.trim().split('\n');
      const dataLines = lines.slice(1);
      
      // All data should be within the specified range
      for (const line of dataLines) {
        const timestamp = line.split(',')[0];
        const logDate = new Date(timestamp);
        
        expect(logDate.getTime()).toBeGreaterThanOrEqual(new Date(yesterday).getTime());
        expect(logDate.getTime()).toBeLessThanOrEqual(new Date(tomorrow).getTime());
      }
    });

    it('should support user filtering in exports', async () => {
      const response = await SELF.fetch('http://localhost/audit-logs/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv',
          filters: {
            userId: TEST_USERS.user.id
          }
        })
      });

      expectResponseOk(response);
      const csvContent = await expectCsvResponse(response);
      
      const lines = csvContent.trim().split('\n');
      const dataLines = lines.slice(1);
      
      // All data should be for the specified user
      for (const line of dataLines) {
        const userId = line.split(',')[1];
        expect(userId).toBe(TEST_USERS.user.id);
      }
    });

    it('should support action type filtering in exports', async () => {
      const response = await SELF.fetch('http://localhost/audit-logs/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv',
          filters: {
            action: 'patient_viewed'
          }
        })
      });

      expectResponseOk(response);
      const csvContent = await expectCsvResponse(response);
      
      const lines = csvContent.trim().split('\n');
      const dataLines = lines.slice(1);
      
      // All data should be for the specified action
      for (const line of dataLines) {
        const action = line.split(',')[2];
        expect(action).toBe('patient_viewed');
      }
    });

    it('should handle large exports with pagination', async () => {
      // First, generate a lot of audit activity
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          SELF.fetch(`http://localhost/patients/patient-${(i % 2) + 1}`, {
            headers: { 'Authorization': `Bearer ${userToken}` }
          })
        );
      }
      
      await Promise.all(promises);
      await waitForQueueProcessing(500);

      const response = await SELF.fetch('http://localhost/audit-logs/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv',
          pagination: {
            limit: 100,
            offset: 0
          }
        })
      });

      expectResponseOk(response);
      const csvContent = await expectCsvResponse(response);
      
      const lines = csvContent.trim().split('\n');
      expect(lines.length).toBeGreaterThan(20); // Should have many records
      
      // Verify all lines have proper CSV format
      for (let i = 1; i < lines.length; i++) {
        const fields = lines[i].split(',');
        expect(fields.length).toBe(6);
      }
    });

    it('should properly escape CSV special characters', async () => {
      // Create a message with special characters that need CSV escaping
      await SELF.fetch('http://localhost/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: 'patient-1',
          content: 'Message with "quotes", commas, and\nnewlines',
          status: 'draft'
        })
      });

      await waitForQueueProcessing();

      const response = await SELF.fetch('http://localhost/audit-logs/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${viewerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv'
        })
      });

      expectResponseOk(response);
      const csvContent = await expectCsvResponse(response);
      
      // Content should be properly escaped and parseable
      const lines = csvContent.trim().split('\n');
      expect(lines.length).toBeGreaterThan(1);
      
      // Find line with special characters
      const specialCharLine = lines.find(line => 
        line.includes('quotes') && line.includes('commas')
      );
      
      if (specialCharLine) {
        // Should be properly quoted if it contains special characters
        expect(specialCharLine).toMatch(/".*quotes.*commas.*"/);
      }
    });

    it('should include proper CSV headers for download', async () => {
      const response = await SELF.fetch('http://localhost/audit-logs/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${viewerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv'
        })
      });

      expectResponseOk(response);
      
      // Check response headers
      expect(response.headers.get('content-type')).toContain('text/csv');
      expect(response.headers.get('content-disposition')).toContain('attachment');
      expect(response.headers.get('content-disposition')).toContain('filename=');
      
      // Filename should include timestamp
      const contentDisposition = response.headers.get('content-disposition');
      expect(contentDisposition).toMatch(/filename="?audit-logs-\d{4}-\d{2}-\d{2}/);
    });

    it('should log export activity for audit trail', async () => {
      const exportResponse = await SELF.fetch('http://localhost/audit-logs/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${viewerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv'
        })
      });

      expectResponseOk(exportResponse);

      // Wait for export audit log to be processed
      await waitForQueueProcessing();

      // Check that export was logged
      const auditResponse = await SELF.fetch('http://localhost/audit-logs', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      expectResponseOk(auditResponse);
      const auditData = await expectJsonResponse(auditResponse);
      
      const exportLog = auditData.logs.find((log: any) => 
        log.action === 'audit_exported' && 
        log.userId === TEST_USERS.viewer.id
      );
      
      expect(exportLog).toBeTruthy();
      expect(exportLog.details).toContain('csv');
    });

    it('should handle empty result sets gracefully', async () => {
      // Request export with date range that has no data
      const futureDate = new Date(Date.now() + 86400000 * 7).toISOString(); // 7 days from now
      const farFutureDate = new Date(Date.now() + 86400000 * 14).toISOString(); // 14 days from now

      const response = await SELF.fetch('http://localhost/audit-logs/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${viewerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv',
          dateRange: {
            start: futureDate,
            end: farFutureDate
          }
        })
      });

      expectResponseOk(response);
      const csvContent = await expectCsvResponse(response);
      
      // Should have header row but no data rows
      const lines = csvContent.trim().split('\n');
      expect(lines.length).toBe(1); // Only header
      expect(lines[0]).toContain('timestamp,userId,action,details');
    });

    it('should handle concurrent export requests', async () => {
      // Start multiple export requests simultaneously
      const exportPromises = Array.from({ length: 5 }, (_, i) =>
        SELF.fetch('http://localhost/audit-logs/export', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${viewerToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            format: 'csv',
            filters: {
              action: 'patient_viewed'
            },
            requestId: `concurrent-${i}`
          })
        })
      );

      const responses = await Promise.all(exportPromises);
      
      // All requests should succeed
      responses.forEach(response => {
        expectResponseOk(response);
        expect(response.headers.get('content-type')).toContain('text/csv');
      });

      // All should return valid CSV content
      const csvContents = await Promise.all(
        responses.map(response => response.text())
      );

      csvContents.forEach(csvContent => {
        const lines = csvContent.trim().split('\n');
        expect(lines.length).toBeGreaterThanOrEqual(1); // At least header
        expect(lines[0]).toContain('timestamp,userId,action,details');
      });
    });
  });

  describe('Messages Export', () => {
    beforeEach(async () => {
      // Create some test messages
      for (let i = 1; i <= 3; i++) {
        await SELF.fetch('http://localhost/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            patientId: `patient-${i}`,
            content: `Export test message ${i}`,
            status: i === 1 ? 'draft' : i === 2 ? 'sent' : 'delivered'
          })
        });
      }
    });

    it('should export messages as CSV', async () => {
      const response = await SELF.fetch('http://localhost/messages/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv'
        })
      });

      expectResponseOk(response);
      const csvContent = await expectCsvResponse(response);
      
      const lines = csvContent.trim().split('\n');
      expect(lines.length).toBeGreaterThan(1);
      
      const header = lines[0];
      expect(header).toContain('id');
      expect(header).toContain('patientId');
      expect(header).toContain('content');
      expect(header).toContain('status');
      expect(header).toContain('createdAt');
      expect(header).toContain('createdBy');
    });

    it('should filter messages by status in export', async () => {
      const response = await SELF.fetch('http://localhost/messages/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv',
          filters: {
            status: 'sent'
          }
        })
      });

      expectResponseOk(response);
      const csvContent = await expectCsvResponse(response);
      
      const lines = csvContent.trim().split('\n');
      if (lines.length > 1) {
        const dataLines = lines.slice(1);
        const statusColumnIndex = lines[0].split(',').indexOf('status');
        
        for (const line of dataLines) {
          const fields = line.split(',');
          expect(fields[statusColumnIndex]).toBe('sent');
        }
      }
    });

    it('should filter messages by patient in export', async () => {
      const response = await SELF.fetch('http://localhost/messages/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv',
          filters: {
            patientId: 'patient-1'
          }
        })
      });

      expectResponseOk(response);
      const csvContent = await expectCsvResponse(response);
      
      const lines = csvContent.trim().split('\n');
      if (lines.length > 1) {
        const dataLines = lines.slice(1);
        const patientIdColumnIndex = lines[0].split(',').indexOf('patientId');
        
        for (const line of dataLines) {
          const fields = line.split(',');
          expect(fields[patientIdColumnIndex]).toBe('patient-1');
        }
      }
    });

    it('should require admin role for message export', async () => {
      const response = await SELF.fetch('http://localhost/messages/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv'
        })
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Patients Export', () => {
    it('should export patients as CSV for admin users', async () => {
      const response = await SELF.fetch('http://localhost/patients/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv'
        })
      });

      expectResponseOk(response);
      const csvContent = await expectCsvResponse(response);
      
      const lines = csvContent.trim().split('\n');
      expect(lines.length).toBeGreaterThan(1);
      
      const header = lines[0];
      expect(header).toContain('id');
      expect(header).toContain('name');
      expect(header).toContain('age');
      expect(header).toContain('medicalHistory');
      expect(header).toContain('currentCondition');
      expect(header).toContain('createdAt');
    });

    it('should require admin role for patient export', async () => {
      const response = await SELF.fetch('http://localhost/patients/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv'
        })
      });

      expect(response.status).toBe(403);
    });

    it('should filter patients by condition in export', async () => {
      const response = await SELF.fetch('http://localhost/patients/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          format: 'csv',
          filters: {
            currentCondition: 'stable'
          }
        })
      });

      expectResponseOk(response);
      const csvContent = await expectCsvResponse(response);
      
      const lines = csvContent.trim().split('\n');
      if (lines.length > 1) {
        const dataLines = lines.slice(1);
        const conditionColumnIndex = lines[0].split(',').indexOf('currentCondition');
        
        for (const line of dataLines) {
          const fields = line.split(',');
          expect(fields[conditionColumnIndex].toLowerCase()).toContain('stable');
        }
      }
    });
  });
});
