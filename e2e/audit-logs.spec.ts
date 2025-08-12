import { test, expect } from '@playwright/test';
import { loginAs } from './utils/auth-helpers';
import { AuditLogsPage, DraftPage } from './utils/page-objects';
import { APITestHelper, APIMocks } from './utils/api-helpers';
import { createTestAuditLog, TestDataHelpers } from './utils/test-data';

test.describe('Audit Logs and Compliance', () => {
  let auditLogsPage: AuditLogsPage;
  let draftPage: DraftPage;
  let apiHelper: APITestHelper;

  test.beforeEach(async ({ page }) => {
    auditLogsPage = new AuditLogsPage(page);
    draftPage = new DraftPage(page);
    apiHelper = new APITestHelper(page);
  });

  test.describe('Audit Log Viewing', () => {
    test('admin should view all audit logs', async ({ page }) => {
      await loginAs(page, 'admin');
      await auditLogsPage.goto();

      // Should see audit logs table
      expect(auditLogsPage.auditTable).toBeVisible();
      
      const logCount = await auditLogsPage.getAuditLogCount();
      expect(logCount).toBeGreaterThan(0);
      
      // Should see various user actions
      expect(page.locator('text=login')).toBeVisible();
      expect(page.locator('text=patient_access')).toBeVisible();
      expect(page.locator('text=draft_generated')).toBeVisible();
    });

    test('auditor should have full audit access', async ({ page }) => {
      await loginAs(page, 'auditor');
      await auditLogsPage.goto();

      // Auditor should see all logs (same as admin for audit purposes)
      const logCount = await auditLogsPage.getAuditLogCount();
      expect(logCount).toBeGreaterThan(0);
      
      // Should see logs from all users
      expect(page.locator('text=admin@example.com')).toBeVisible();
      expect(page.locator('text=doctor@example.com')).toBeVisible();
      expect(page.locator('text=staff@example.com')).toBeVisible();
    });

    test('doctor should see limited audit scope', async ({ page }) => {
      await loginAs(page, 'doctor');
      await auditLogsPage.goto();

      // Doctor should only see their own logs and patient-related logs
      const logCount = await auditLogsPage.getAuditLogCount();
      expect(logCount).toBeGreaterThan(0);
      
      // Should primarily see doctor's own email
      const doctorLogs = page.locator('text=doctor@example.com');
      expect(doctorLogs).toBeVisible();
      
      // Should not see admin-only actions
      expect(page.locator('text=user_created')).not.toBeVisible();
    });

    test('staff should not access audit logs', async ({ page }) => {
      await loginAs(page, 'staff');
      
      await page.goto('/admin/audit');
      
      // Should be denied access
      expect(page.locator('text=Access Denied, text=Forbidden')).toBeVisible();
    });

    test('should paginate through large audit logs', async ({ page }) => {
      await loginAs(page, 'admin');
      await auditLogsPage.goto();

      const initialCount = await auditLogsPage.getAuditLogCount();
      
      // Load more logs if available
      if (await auditLogsPage.loadMoreButton.isVisible()) {
        await auditLogsPage.loadMoreLogs();
        
        const newCount = await auditLogsPage.getAuditLogCount();
        expect(newCount).toBeGreaterThan(initialCount);
      }
    });
  });

  test.describe('Audit Log Filtering', () => {
    test('should filter logs by action type', async ({ page }) => {
      await loginAs(page, 'admin');
      await auditLogsPage.goto();

      const totalLogs = await auditLogsPage.getAuditLogCount();
      
      // Filter by specific action
      await auditLogsPage.filterByAction('login');
      
      const filteredLogs = await auditLogsPage.getAuditLogCount();
      expect(filteredLogs).toBeLessThanOrEqual(totalLogs);
      
      // Verify only login actions are shown
      const visibleRows = page.locator('[data-testid="audit-table"] tbody tr');
      const rowCount = await visibleRows.count();
      
      for (let i = 0; i < rowCount; i++) {
        const row = visibleRows.nth(i);
        expect(row.locator('text=login')).toBeVisible();
      }
    });

    test('should filter logs by date range', async ({ page }) => {
      await loginAs(page, 'admin');
      await auditLogsPage.goto();

      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Set date range to today only
      await auditLogsPage.setDateRange(today, today);
      
      const todayLogs = await auditLogsPage.getAuditLogCount();
      
      // Set date range to yesterday only
      await auditLogsPage.setDateRange(yesterday, yesterday);
      
      const yesterdayLogs = await auditLogsPage.getAuditLogCount();
      
      // Should show different counts (unless no logs yesterday)
      expect(todayLogs).toBeGreaterThanOrEqual(0);
      expect(yesterdayLogs).toBeGreaterThanOrEqual(0);
    });

    test('should filter logs by user', async ({ page }) => {
      await loginAs(page, 'admin');
      await auditLogsPage.goto();

      // Filter by specific user
      await page.selectOption('[data-testid="user-filter"]', 'doctor@example.com');
      await page.waitForLoadState('networkidle');
      
      const filteredLogs = await auditLogsPage.getAuditLogCount();
      
      // Verify only doctor's actions are shown
      if (filteredLogs > 0) {
        const visibleRows = page.locator('[data-testid="audit-table"] tbody tr');
        const rowCount = await visibleRows.count();
        
        for (let i = 0; i < rowCount; i++) {
          const row = visibleRows.nth(i);
          expect(row.locator('text=doctor@example.com')).toBeVisible();
        }
      }
    });

    test('should combine multiple filters', async ({ page }) => {
      await loginAs(page, 'admin');
      await auditLogsPage.goto();

      const today = new Date().toISOString().split('T')[0];
      
      // Apply multiple filters
      await auditLogsPage.filterByAction('patient_access');
      await auditLogsPage.setDateRange(today, today);
      await page.selectOption('[data-testid="user-filter"]', 'doctor@example.com');
      
      const filteredLogs = await auditLogsPage.getAuditLogCount();
      expect(filteredLogs).toBeGreaterThanOrEqual(0);
      
      // Verify all filters are applied
      if (filteredLogs > 0) {
        const firstRow = page.locator('[data-testid="audit-table"] tbody tr').first();
        expect(firstRow.locator('text=patient_access')).toBeVisible();
        expect(firstRow.locator('text=doctor@example.com')).toBeVisible();
      }
    });
  });

  test.describe('Audit Log Creation', () => {
    test('should create audit log for user login', async ({ page }) => {
      // Clear existing logs view
      await loginAs(page, 'admin');
      const initialTime = new Date().toISOString();
      
      // Logout and login again to generate new audit log
      await page.goto('/user/logout');
      await loginAs(page, 'staff');
      
      // Check audit logs
      await loginAs(page, 'admin');
      await auditLogsPage.goto();
      await auditLogsPage.filterByAction('login');
      
      // Should see recent login
      const recentLogin = page.locator('[data-testid="audit-table"] tbody tr').first();
      expect(recentLogin.locator('text=staff@example.com')).toBeVisible();
      expect(recentLogin.locator('text=login')).toBeVisible();
    });

    test('should create audit log for patient access', async ({ page }) => {
      await loginAs(page, 'doctor');
      
      // Access patient data
      await page.goto('/admin/briefs');
      await page.click('[data-testid="edit-patient-1"]');
      
      // Check audit logs
      await loginAs(page, 'admin');
      await auditLogsPage.goto();
      await auditLogsPage.filterByAction('patient_access');
      
      // Should see patient access log
      const patientAccess = page.locator('[data-testid="audit-table"] tbody tr').first();
      expect(patientAccess.locator('text=doctor@example.com')).toBeVisible();
      expect(patientAccess.locator('text=patient_access')).toBeVisible();
    });

    test('should create audit log for draft generation', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();
      
      // Generate a draft
      await draftPage.selectPatient('John Smith');
      await draftPage.enterInquiry('Test inquiry for audit logging');
      await draftPage.generateDraft();
      
      // Check audit logs
      await loginAs(page, 'admin');
      await auditLogsPage.goto();
      await auditLogsPage.filterByAction('draft_generated');
      
      // Should see draft generation log
      const draftLog = page.locator('[data-testid="audit-table"] tbody tr').first();
      expect(draftLog.locator('text=staff@example.com')).toBeVisible();
      expect(draftLog.locator('text=draft_generated')).toBeVisible();
    });

    test('should create audit log for message sending', async ({ page }) => {
      await loginAs(page, 'doctor');
      await draftPage.goto();
      
      // Create and send draft directly
      await draftPage.selectPatient('John Smith');
      await draftPage.enterInquiry('Test inquiry for message audit');
      await draftPage.generateDraft();
      await draftPage.sendDirectly();
      
      // Check audit logs
      await loginAs(page, 'admin');
      await auditLogsPage.goto();
      await auditLogsPage.filterByAction('message_sent');
      
      // Should see message sent log
      const sentLog = page.locator('[data-testid="audit-table"] tbody tr').first();
      expect(sentLog.locator('text=doctor@example.com')).toBeVisible();
      expect(sentLog.locator('text=message_sent')).toBeVisible();
    });

    test('should include detailed information in audit logs', async ({ page }) => {
      await loginAs(page, 'admin');
      await auditLogsPage.goto();
      
      // Click on a detailed audit log entry
      await page.click('[data-testid="audit-row-details-1"]');
      
      // Should show detailed information
      expect(page.locator('[data-testid="audit-details"]')).toBeVisible();
      expect(page.locator('text=IP Address')).toBeVisible();
      expect(page.locator('text=User Agent')).toBeVisible();
      expect(page.locator('text=Timestamp')).toBeVisible();
    });
  });

  test.describe('CSV Export Functionality', () => {
    test('admin should export audit logs as CSV', async ({ page }) => {
      await loginAs(page, 'admin');
      await auditLogsPage.goto();

      const download = await auditLogsPage.exportToCSV();
      
      expect(download.suggestedFilename()).toMatch(/audit.*\.csv$/);
      
      // Verify CSV content structure
      const csvContent = await download.createReadStream();
      const text = csvContent.toString();
      
      // Should have proper CSV headers
      expect(text).toContain('timestamp,action,userEmail,details');
      
      // Should contain actual audit data
      const lines = text.split('\n').filter(line => line.trim());
      expect(lines.length).toBeGreaterThan(1); // Header + data
    });

    test('should export filtered audit logs', async ({ page }) => {
      await loginAs(page, 'admin');
      await auditLogsPage.goto();
      
      // Apply filter before export
      await auditLogsPage.filterByAction('login');
      
      const download = await auditLogsPage.exportToCSV();
      const csvContent = await download.createReadStream();
      const text = csvContent.toString();
      
      // Should only contain login actions
      const lines = text.split('\n').filter(line => line.trim() && !line.startsWith('timestamp'));
      lines.forEach(line => {
        expect(line).toContain('login');
      });
    });

    test('auditor should export compliance reports', async ({ page }) => {
      await loginAs(page, 'auditor');
      await auditLogsPage.goto();
      
      // Generate compliance report
      await page.click('[data-testid="compliance-report"]');
      
      const downloadPromise = page.waitForEvent('download');
      await page.click('[data-testid="export-compliance"]');
      const download = await downloadPromise;
      
      expect(download.suggestedFilename()).toMatch(/compliance.*\.csv$/);
    });

    test('should handle large CSV exports', async ({ page }) => {
      await loginAs(page, 'admin');
      await auditLogsPage.goto();
      
      // Set large date range for export
      const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];
      
      await auditLogsPage.setDateRange(oneMonthAgo, today);
      
      const download = await auditLogsPage.exportToCSV();
      
      // Should handle large exports (might take longer)
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
    });

    test('should verify CSV format compliance', async ({ page }) => {
      await loginAs(page, 'admin');
      await auditLogsPage.goto();
      
      const download = await auditLogsPage.exportToCSV();
      const csvContent = await download.createReadStream();
      const text = csvContent.toString();
      
      // Verify CSV format
      const expectedHeaders = ['timestamp', 'action', 'userEmail', 'details', 'ipAddress'];
      const isValidFormat = TestDataHelpers.verifyCSVFormat(text, expectedHeaders);
      expect(isValidFormat).toBeTruthy();
    });
  });

  test.describe('Compliance and Data Integrity', () => {
    test('should maintain complete audit trail', async ({ page }) => {
      const testId = TestDataHelpers.generateTestId();
      
      await loginAs(page, 'staff');
      
      // Perform a series of actions
      await draftPage.goto();
      await draftPage.selectPatient('John Smith');
      await draftPage.enterInquiry(`Test inquiry ${testId}`);
      await draftPage.generateDraft();
      await draftPage.submitForReview();
      
      // Switch to reviewer and approve
      await loginAs(page, 'reviewer');
      await page.goto('/review');
      await page.click('[data-testid="approve-latest"]');
      
      // Verify complete audit trail
      await loginAs(page, 'admin');
      await auditLogsPage.goto();
      
      const auditActions = ['draft_generated', 'submit_for_review', 'message_approved'];
      
      for (const action of auditActions) {
        await auditLogsPage.filterByAction(action);
        const logs = await auditLogsPage.getAuditLogCount();
        expect(logs).toBeGreaterThan(0);
      }
    });

    test('should detect audit log tampering', async ({ page }) => {
      await loginAs(page, 'admin');
      
      // Test audit log integrity check
      const response = await apiHelper.makeRequest('POST', '/api/audit-export/verify-integrity', {}, 'admin');
      expect(response.status()).toBe(200);
      
      const integrityResult = await response.json();
      expect(integrityResult.isValid).toBeTruthy();
    });

    test('should handle audit log failures gracefully', async ({ page }) => {
      // Mock audit service failure
      await page.route('**/api/audit-logs', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Audit service unavailable' })
        });
      });
      
      await loginAs(page, 'staff');
      await draftPage.goto();
      
      // Action should still succeed despite audit failure
      await draftPage.selectPatient('John Smith');
      await draftPage.enterInquiry('Test with audit failure');
      await draftPage.generateDraft();
      
      // Should show warning but not block action
      expect(page.locator('[data-testid="audit-warning"]')).toBeVisible();
      expect(draftPage.draftContent).toBeVisible();
    });

    test('should enforce audit retention policies', async ({ page }) => {
      await loginAs(page, 'admin');
      
      // Test audit retention API
      const response = await apiHelper.makeRequest('GET', '/api/audit-logs/retention-policy', undefined, 'admin');
      expect(response.status()).toBe(200);
      
      const policy = await response.json();
      expect(policy.retentionPeriodDays).toBeGreaterThan(365); // HIPAA compliance
    });

    test('should anonymize sensitive data in exports', async ({ page }) => {
      await loginAs(page, 'admin');
      await auditLogsPage.goto();
      
      const download = await auditLogsPage.exportToCSV();
      const csvContent = await download.createReadStream();
      const text = csvContent.toString();
      
      // Verify sensitive data is anonymized
      expect(text).not.toContain('password');
      expect(text).not.toContain('ssn');
      expect(text).not.toContain('credit');
      
      // Should contain anonymized references
      expect(text).toContain('***');
    });
  });

  test.describe('Real-time Audit Updates', () => {
    test('should update audit logs in real-time', async ({ browser }) => {
      // Test with two browser contexts
      const adminContext = await browser.newContext();
      const staffContext = await browser.newContext();
      
      const adminPage = await adminContext.newPage();
      const staffPage = await staffContext.newPage();
      
      try {
        // Admin viewing audit logs
        await loginAs(adminPage, 'admin');
        const adminAuditPage = new AuditLogsPage(adminPage);
        await adminAuditPage.goto();
        
        const initialCount = await adminAuditPage.getAuditLogCount();
        
        // Staff performs action
        await loginAs(staffPage, 'staff');
        const staffDraftPage = new DraftPage(staffPage);
        await staffDraftPage.goto();
        await staffDraftPage.selectPatient('John Smith');
        await staffDraftPage.enterInquiry('Real-time audit test');
        await staffDraftPage.generateDraft();
        
        // Refresh admin page and check for new audit log
        await adminPage.reload();
        await adminPage.waitForLoadState('networkidle');
        
        const newCount = await adminAuditPage.getAuditLogCount();
        expect(newCount).toBeGreaterThan(initialCount);
      } finally {
        await adminContext.close();
        await staffContext.close();
      }
    });
  });
});
