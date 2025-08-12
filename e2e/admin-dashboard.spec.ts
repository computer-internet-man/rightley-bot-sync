import { test, expect } from '@playwright/test';
import { loginAs } from './utils/auth-helpers';
import { AdminBriefsPage, AuditLogsPage, DoctorSettingsPage } from './utils/page-objects';
import { APITestHelper } from './utils/api-helpers';
import { generateRandomPatient, TestDataHelpers } from './utils/test-data';

test.describe('Admin Dashboard and Management', () => {
  let adminBriefsPage: AdminBriefsPage;
  let auditLogsPage: AuditLogsPage;
  let doctorSettingsPage: DoctorSettingsPage;
  let apiHelper: APITestHelper;

  test.beforeEach(async ({ page }) => {
    adminBriefsPage = new AdminBriefsPage(page);
    auditLogsPage = new AuditLogsPage(page);
    doctorSettingsPage = new DoctorSettingsPage(page);
    apiHelper = new APITestHelper(page);
  });

  test.describe('Admin User Management', () => {
    test('admin should access all management features', async ({ page }) => {
      await loginAs(page, 'admin');
      
      // Should access all admin routes
      const adminRoutes = ['/admin/briefs', '/admin/audit', '/doctor/settings'];
      
      for (const route of adminRoutes) {
        await page.goto(route);
        expect(page.url()).toContain(route);
        
        // Should not see access denied
        expect(page.locator('text=Access Denied, text=Forbidden')).not.toBeVisible();
      }
    });

    test('admin should create and manage user accounts', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/users');
      
      // Create new user
      await page.click('[data-testid="create-user"]');
      
      const newUser = {
        email: `testuser${Date.now()}@example.com`,
        name: 'Test User',
        role: 'staff'
      };
      
      await page.fill('[data-testid="user-email"]', newUser.email);
      await page.fill('[data-testid="user-name"]', newUser.name);
      await page.selectOption('[data-testid="user-role"]', newUser.role);
      
      await page.click('[data-testid="save-user"]');
      await page.waitForLoadState('networkidle');
      
      // Verify user was created
      expect(page.locator(`text=${newUser.email}`)).toBeVisible();
      
      // Edit user
      await page.click(`[data-testid="edit-user-${newUser.email}"]`);
      await page.selectOption('[data-testid="user-role"]', 'reviewer');
      await page.click('[data-testid="save-user"]');
      
      // Verify role was updated
      expect(page.locator(`text=reviewer`)).toBeVisible();
      
      // Delete user
      await page.click(`[data-testid="delete-user-${newUser.email}"]`);
      await page.click('[data-testid="confirm-delete"]');
      
      // Verify user was deleted
      expect(page.locator(`text=${newUser.email}`)).not.toBeVisible();
    });

    test('admin should manage system settings', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/settings');
      
      // Configure system settings
      await page.fill('[data-testid="system-name"]', 'Healthcare Communication Platform');
      await page.selectOption('[data-testid="default-word-limit"]', '250');
      await page.check('[data-testid="enable-ai-stub"]');
      
      await page.click('[data-testid="save-settings"]');
      
      // Verify settings were saved
      expect(page.locator('[data-testid="settings-saved"]')).toBeVisible();
    });

    test('admin should view system statistics', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/dashboard');
      
      // Should display key metrics
      expect(page.locator('[data-testid="total-users"]')).toBeVisible();
      expect(page.locator('[data-testid="total-patients"]')).toBeVisible();
      expect(page.locator('[data-testid="messages-sent"]')).toBeVisible();
      expect(page.locator('[data-testid="pending-reviews"]')).toBeVisible();
      
      // Statistics should have valid numbers
      const totalUsers = await page.textContent('[data-testid="total-users"]');
      expect(parseInt(totalUsers || '0')).toBeGreaterThan(0);
    });

    test('admin should export system reports', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/reports');
      
      // Generate system usage report
      const downloadPromise = page.waitForEvent('download');
      await page.click('[data-testid="export-usage-report"]');
      const download = await downloadPromise;
      
      expect(download.suggestedFilename()).toMatch(/usage.*\.pdf$/);
      
      // Generate user activity report
      const csvDownloadPromise = page.waitForEvent('download');
      await page.click('[data-testid="export-activity-csv"]');
      const csvDownload = await csvDownloadPromise;
      
      expect(csvDownload.suggestedFilename()).toMatch(/activity.*\.csv$/);
    });
  });

  test.describe('System Configuration', () => {
    test('admin should configure AI settings', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/ai-config');
      
      // Configure AI parameters
      await page.fill('[data-testid="max-tokens"]', '300');
      await page.fill('[data-testid="temperature"]', '0.7');
      await page.selectOption('[data-testid="model-version"]', 'gpt-4');
      
      // Test AI connection
      await page.click('[data-testid="test-ai-connection"]');
      
      // Should show connection status
      expect(page.locator('[data-testid="connection-status"]')).toBeVisible();
      
      await page.click('[data-testid="save-ai-config"]');
      
      // Verify configuration was saved
      expect(page.locator('[data-testid="config-saved"]')).toBeVisible();
    });

    test('admin should configure security settings', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/security');
      
      // Configure session timeout
      await page.fill('[data-testid="session-timeout"]', '480'); // 8 hours
      
      // Configure password policy
      await page.check('[data-testid="require-mfa"]');
      await page.selectOption('[data-testid="password-strength"]', 'strong');
      
      // Configure audit settings
      await page.fill('[data-testid="audit-retention-days"]', '2555'); // 7 years
      await page.check('[data-testid="enable-audit-alerts"]');
      
      await page.click('[data-testid="save-security-settings"]');
      
      // Verify settings were saved
      expect(page.locator('[data-testid="security-settings-saved"]')).toBeVisible();
    });

    test('admin should configure notification settings', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/notifications');
      
      // Configure email notifications
      await page.fill('[data-testid="smtp-server"]', 'smtp.example.com');
      await page.fill('[data-testid="smtp-port"]', '587');
      await page.check('[data-testid="enable-ssl"]');
      
      // Test email configuration
      await page.click('[data-testid="test-email"]');
      
      // Should show test result
      expect(page.locator('[data-testid="email-test-result"]')).toBeVisible();
      
      await page.click('[data-testid="save-notification-settings"]');
      
      // Verify settings were saved
      expect(page.locator('[data-testid="notification-settings-saved"]')).toBeVisible();
    });
  });

  test.describe('System Monitoring', () => {
    test('admin should monitor system health', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/monitoring');
      
      // Should show system health indicators
      expect(page.locator('[data-testid="database-status"]')).toBeVisible();
      expect(page.locator('[data-testid="ai-service-status"]')).toBeVisible();
      expect(page.locator('[data-testid="queue-status"]')).toBeVisible();
      
      // Status should be healthy (green)
      const dbStatus = page.locator('[data-testid="database-status"]');
      expect(dbStatus).toHaveClass(/healthy|green|success/);
    });

    test('admin should view performance metrics', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/performance');
      
      // Should show performance charts
      expect(page.locator('[data-testid="response-time-chart"]')).toBeVisible();
      expect(page.locator('[data-testid="error-rate-chart"]')).toBeVisible();
      expect(page.locator('[data-testid="throughput-chart"]')).toBeVisible();
      
      // Should show current metrics
      expect(page.locator('[data-testid="avg-response-time"]')).toBeVisible();
      expect(page.locator('[data-testid="error-rate"]')).toBeVisible();
    });

    test('admin should receive system alerts', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/alerts');
      
      // Should show alerts dashboard
      expect(page.locator('[data-testid="alerts-list"]')).toBeVisible();
      
      // Test alert creation (simulate)
      await page.click('[data-testid="create-test-alert"]');
      
      // Should see new alert
      expect(page.locator('[data-testid="alert-item"]').first()).toBeVisible();
      
      // Acknowledge alert
      await page.click('[data-testid="acknowledge-alert"]');
      
      // Alert should be marked as acknowledged
      expect(page.locator('[data-testid="alert-acknowledged"]')).toBeVisible();
    });
  });

  test.describe('Data Management', () => {
    test('admin should backup system data', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/backup');
      
      // Initiate backup
      await page.click('[data-testid="start-backup"]');
      
      // Should show backup progress
      expect(page.locator('[data-testid="backup-progress"]')).toBeVisible();
      
      // Wait for backup completion (or mock it)
      await page.waitForSelector('[data-testid="backup-complete"]', { timeout: 30000 });
      
      // Should show backup download link
      expect(page.locator('[data-testid="download-backup"]')).toBeVisible();
    });

    test('admin should restore from backup', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/restore');
      
      // Upload backup file (mock)
      await page.setInputFiles('[data-testid="backup-file"]', {
        name: 'test-backup.sql',
        mimeType: 'application/sql',
        buffer: Buffer.from('-- Test backup content')
      });
      
      // Validate backup
      await page.click('[data-testid="validate-backup"]');
      
      // Should show validation result
      expect(page.locator('[data-testid="validation-result"]')).toBeVisible();
      
      // Initiate restore (with confirmation)
      await page.click('[data-testid="start-restore"]');
      await page.click('[data-testid="confirm-restore"]');
      
      // Should show restore progress
      expect(page.locator('[data-testid="restore-progress"]')).toBeVisible();
    });

    test('admin should manage data retention', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/data-retention');
      
      // Configure retention policies
      await page.fill('[data-testid="audit-retention-days"]', '2555'); // 7 years for HIPAA
      await page.fill('[data-testid="message-retention-days"]', '2555');
      await page.fill('[data-testid="patient-retention-days"]', '3650'); // 10 years
      
      // Run retention cleanup
      await page.click('[data-testid="run-cleanup"]');
      
      // Should show cleanup results
      expect(page.locator('[data-testid="cleanup-results"]')).toBeVisible();
      
      await page.click('[data-testid="save-retention-policy"]');
      
      // Verify policy was saved
      expect(page.locator('[data-testid="retention-policy-saved"]')).toBeVisible();
    });
  });

  test.describe('Integration Management', () => {
    test('admin should configure external integrations', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/integrations');
      
      // Configure EHR integration
      await page.fill('[data-testid="ehr-endpoint"]', 'https://ehr.example.com/api');
      await page.fill('[data-testid="ehr-api-key"]', 'test-api-key');
      
      // Test EHR connection
      await page.click('[data-testid="test-ehr-connection"]');
      
      // Should show connection status
      expect(page.locator('[data-testid="ehr-connection-status"]')).toBeVisible();
      
      // Configure SMS provider
      await page.fill('[data-testid="sms-provider"]', 'twilio');
      await page.fill('[data-testid="sms-api-key"]', 'test-sms-key');
      
      await page.click('[data-testid="save-integrations"]');
      
      // Verify integrations were saved
      expect(page.locator('[data-testid="integrations-saved"]')).toBeVisible();
    });

    test('admin should manage API access', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/api-access');
      
      // Create API key
      await page.click('[data-testid="create-api-key"]');
      await page.fill('[data-testid="api-key-name"]', 'Test Integration');
      await page.selectOption('[data-testid="api-key-scope"]', 'read-only');
      
      await page.click('[data-testid="generate-api-key"]');
      
      // Should show generated API key
      expect(page.locator('[data-testid="generated-api-key"]')).toBeVisible();
      
      // Revoke API key
      await page.click('[data-testid="revoke-api-key"]');
      await page.click('[data-testid="confirm-revoke"]');
      
      // Key should be marked as revoked
      expect(page.locator('[data-testid="api-key-revoked"]')).toBeVisible();
    });
  });

  test.describe('Compliance and Audit Management', () => {
    test('admin should generate compliance reports', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/compliance');
      
      // Generate HIPAA compliance report
      const downloadPromise = page.waitForEvent('download');
      await page.click('[data-testid="generate-hipaa-report"]');
      const download = await downloadPromise;
      
      expect(download.suggestedFilename()).toMatch(/hipaa.*\.pdf$/);
      
      // Generate SOC 2 report
      const soc2DownloadPromise = page.waitForEvent('download');
      await page.click('[data-testid="generate-soc2-report"]');
      const soc2Download = await soc2DownloadPromise;
      
      expect(soc2Download.suggestedFilename()).toMatch(/soc2.*\.pdf$/);
    });

    test('admin should configure audit alerts', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/audit-alerts');
      
      // Configure failed login alert
      await page.fill('[data-testid="failed-login-threshold"]', '5');
      await page.check('[data-testid="enable-failed-login-alert"]');
      
      // Configure data access alert
      await page.check('[data-testid="enable-unusual-access-alert"]');
      await page.fill('[data-testid="access-threshold"]', '100');
      
      await page.click('[data-testid="save-audit-alerts"]');
      
      // Verify alerts were configured
      expect(page.locator('[data-testid="audit-alerts-saved"]')).toBeVisible();
    });

    test('admin should review security incidents', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/security-incidents');
      
      // Should show incidents dashboard
      expect(page.locator('[data-testid="incidents-list"]')).toBeVisible();
      
      // Review incident details
      if (await page.locator('[data-testid="incident-item"]').count() > 0) {
        await page.click('[data-testid="incident-item"]').first();
        
        // Should show incident details
        expect(page.locator('[data-testid="incident-details"]')).toBeVisible();
        
        // Mark as reviewed
        await page.click('[data-testid="mark-reviewed"]');
        
        // Should update incident status
        expect(page.locator('[data-testid="incident-reviewed"]')).toBeVisible();
      }
    });
  });

  test.describe('Access Control Verification', () => {
    test('non-admin users should not access admin features', async ({ page }) => {
      const nonAdminRoles = ['staff', 'reviewer', 'doctor', 'auditor'];
      
      for (const role of nonAdminRoles) {
        await loginAs(page, role as any);
        
        const restrictedRoutes = ['/admin/users', '/admin/settings', '/admin/monitoring'];
        
        for (const route of restrictedRoutes) {
          await page.goto(route);
          
          // Should be denied or redirected
          if (role !== 'auditor' || !route.includes('audit')) {
            expect(page.locator('text=Access Denied, text=Forbidden')).toBeVisible();
          }
        }
      }
    });

    test('should enforce admin-only API endpoints', async ({ page }) => {
      const adminOnlyEndpoints = [
        '/api/users',
        '/api/system/settings',
        '/api/system/backup',
        '/api/system/restore'
      ];
      
      const nonAdminRoles = ['staff', 'reviewer', 'doctor'];
      
      for (const role of nonAdminRoles) {
        for (const endpoint of adminOnlyEndpoints) {
          const response = await apiHelper.makeRequest('GET', endpoint, undefined, role as any);
          expect(response.status()).toBe(403);
        }
      }
    });
  });
});
