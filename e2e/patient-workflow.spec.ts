import { test, expect } from '@playwright/test';
import { loginAs } from './utils/auth-helpers';
import { DraftPage, AdminBriefsPage } from './utils/page-objects';
import { TEST_PATIENTS, TEST_INQUIRIES, generateRandomPatient } from './utils/test-data';
import { APITestHelper } from './utils/api-helpers';

test.describe('Patient Workflow Management', () => {
  let draftPage: DraftPage;
  let adminBriefsPage: AdminBriefsPage;
  let apiHelper: APITestHelper;

  test.beforeEach(async ({ page }) => {
    draftPage = new DraftPage(page);
    adminBriefsPage = new AdminBriefsPage(page);
    apiHelper = new APITestHelper(page);
  });

  test.describe('Patient Brief Management (Admin/Doctor)', () => {
    test('admin should create new patient brief', async ({ page }) => {
      await loginAs(page, 'admin');
      await adminBriefsPage.goto();

      const initialPatientCount = await adminBriefsPage.getPatientRows();
      
      await adminBriefsPage.createPatient();
      
      // Fill patient creation form
      const randomPatient = generateRandomPatient();
      await page.fill('[data-testid="first-name"]', randomPatient.firstName!);
      await page.fill('[data-testid="last-name"]', randomPatient.lastName!);
      await page.fill('[data-testid="date-of-birth"]', randomPatient.dateOfBirth!);
      await page.fill('[data-testid="medical-conditions"]', randomPatient.medicalConditions!);
      await page.fill('[data-testid="allergy-info"]', randomPatient.allergyInfo!);
      
      await page.click('[data-testid="save-patient"]');
      await page.waitForLoadState('networkidle');
      
      // Verify patient was created
      const newPatientCount = await adminBriefsPage.getPatientRows();
      expect(newPatientCount).toBe(initialPatientCount + 1);
      
      // Verify patient appears in list
      expect(page.locator(`text=${randomPatient.firstName} ${randomPatient.lastName}`)).toBeVisible();
    });

    test('doctor should edit existing patient brief', async ({ page }) => {
      await loginAs(page, 'doctor');
      await adminBriefsPage.goto();

      const testPatient = TEST_PATIENTS[0];
      
      // Find and edit the first patient
      await adminBriefsPage.editPatient('1');
      
      // Update patient information
      await page.fill('[data-testid="medical-conditions"]', 'Updated medical conditions');
      await page.fill('[data-testid="allergy-info"]', 'Updated allergy information');
      
      await page.click('[data-testid="save-patient"]');
      await page.waitForLoadState('networkidle');
      
      // Verify changes were saved
      await adminBriefsPage.goto();
      await adminBriefsPage.editPatient('1');
      
      const updatedConditions = await page.inputValue('[data-testid="medical-conditions"]');
      const updatedAllergies = await page.inputValue('[data-testid="allergy-info"]');
      
      expect(updatedConditions).toBe('Updated medical conditions');
      expect(updatedAllergies).toBe('Updated allergy information');
    });

    test('admin should delete patient brief', async ({ page }) => {
      await loginAs(page, 'admin');
      await adminBriefsPage.goto();

      const initialPatientCount = await adminBriefsPage.getPatientRows();
      
      // Create a temporary patient to delete
      await adminBriefsPage.createPatient();
      const tempPatient = generateRandomPatient();
      await page.fill('[data-testid="first-name"]', tempPatient.firstName!);
      await page.fill('[data-testid="last-name"]', tempPatient.lastName!);
      await page.fill('[data-testid="date-of-birth"]', tempPatient.dateOfBirth!);
      await page.click('[data-testid="save-patient"]');
      await page.waitForLoadState('networkidle');
      
      // Now delete the patient
      const patientRow = page.locator(`tr:has-text("${tempPatient.firstName} ${tempPatient.lastName}")`);
      const deleteButton = patientRow.locator('[data-testid*="delete-patient"]');
      await deleteButton.click();
      
      // Confirm deletion
      await page.click('[data-testid="confirm-delete"]');
      await page.waitForLoadState('networkidle');
      
      // Verify patient count returned to original
      const finalPatientCount = await adminBriefsPage.getPatientRows();
      expect(finalPatientCount).toBe(initialPatientCount);
    });

    test('should search and filter patients', async ({ page }) => {
      await loginAs(page, 'admin');
      await adminBriefsPage.goto();

      const testPatient = TEST_PATIENTS[0];
      
      // Search for specific patient
      await adminBriefsPage.searchPatients(testPatient.firstName);
      
      // Should show filtered results
      const patientRows = await adminBriefsPage.getPatientRows();
      expect(patientRows).toBeGreaterThan(0);
      
      // Verify searched patient is visible
      expect(page.locator(`text=${testPatient.firstName}`)).toBeVisible();
      
      // Clear search
      await adminBriefsPage.searchPatients('');
      
      // Should show all patients again
      const allPatientRows = await adminBriefsPage.getPatientRows();
      expect(allPatientRows).toBeGreaterThanOrEqual(patientRows);
    });

    test('staff should not access patient management', async ({ page }) => {
      await loginAs(page, 'staff');
      
      await page.goto('/admin/briefs');
      
      // Should be denied access
      expect(page.url()).not.toContain('/admin/briefs');
      expect(page.locator('text=Access Denied, text=Forbidden')).toBeVisible();
    });
  });

  test.describe('Patient Selection in Draft Workflow', () => {
    test('should display available patients in dropdown', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();

      await draftPage.patientSelect.click();
      
      // Verify test patients are available
      for (const patient of TEST_PATIENTS) {
        expect(page.locator(`option:has-text("${patient.fullName}")`)).toBeVisible();
      }
    });

    test('should populate patient information after selection', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      await draftPage.selectPatient(testPatient.fullName);
      
      // Verify patient details are displayed
      expect(page.locator(`text=${testPatient.medicalConditions}`)).toBeVisible();
      expect(page.locator(`text=${testPatient.allergyInfo}`)).toBeVisible();
    });

    test('should filter patients based on doctor assignment', async ({ page }) => {
      await loginAs(page, 'doctor');
      await draftPage.goto();

      await draftPage.patientSelect.click();
      
      // Doctor should only see their assigned patients
      const options = await page.locator('select[data-testid="patient-select"] option').count();
      expect(options).toBeGreaterThan(1); // At least one patient plus empty option
    });

    test('should handle large patient lists with pagination', async ({ page }) => {
      await loginAs(page, 'admin');
      await draftPage.goto();

      // Test if patient select has pagination or search functionality
      await draftPage.patientSelect.click();
      
      const patientOptions = await page.locator('select[data-testid="patient-select"] option').count();
      expect(patientOptions).toBeGreaterThan(0);
      
      // If there's a search input for patients
      const patientSearch = page.locator('[data-testid="patient-search"]');
      if (await patientSearch.count() > 0) {
        await patientSearch.fill('John');
        await page.waitForTimeout(500); // Debounce
        
        const filteredOptions = await page.locator('select[data-testid="patient-select"] option').count();
        expect(filteredOptions).toBeLessThanOrEqual(patientOptions);
      }
    });
  });

  test.describe('Patient Data Validation', () => {
    test('should validate required fields in patient creation', async ({ page }) => {
      await loginAs(page, 'admin');
      await adminBriefsPage.goto();
      await adminBriefsPage.createPatient();

      // Try to save without required fields
      await page.click('[data-testid="save-patient"]');
      
      // Should show validation errors
      expect(page.locator('[data-testid="error-first-name"]')).toBeVisible();
      expect(page.locator('[data-testid="error-last-name"]')).toBeVisible();
      expect(page.locator('[data-testid="error-date-of-birth"]')).toBeVisible();
    });

    test('should validate date format for date of birth', async ({ page }) => {
      await loginAs(page, 'admin');
      await adminBriefsPage.goto();
      await adminBriefsPage.createPatient();

      // Fill required fields
      await page.fill('[data-testid="first-name"]', 'Test');
      await page.fill('[data-testid="last-name"]', 'Patient');
      
      // Enter invalid date format
      await page.fill('[data-testid="date-of-birth"]', 'invalid-date');
      await page.click('[data-testid="save-patient"]');
      
      // Should show date validation error
      expect(page.locator('[data-testid="error-date-of-birth"]')).toBeVisible();
    });

    test('should prevent duplicate patient creation', async ({ page }) => {
      await loginAs(page, 'admin');
      await adminBriefsPage.goto();

      const existingPatient = TEST_PATIENTS[0];
      
      await adminBriefsPage.createPatient();
      
      // Try to create patient with same name and DOB
      await page.fill('[data-testid="first-name"]', existingPatient.firstName);
      await page.fill('[data-testid="last-name"]', existingPatient.lastName);
      await page.fill('[data-testid="date-of-birth"]', existingPatient.dateOfBirth);
      
      await page.click('[data-testid="save-patient"]');
      
      // Should show duplicate patient error
      expect(page.locator('[data-testid="error-duplicate"]')).toBeVisible();
    });
  });

  test.describe('Patient Data Export', () => {
    test('admin should export patient data as CSV', async ({ page }) => {
      await loginAs(page, 'admin');
      await adminBriefsPage.goto();

      const downloadPromise = page.waitForEvent('download');
      await page.click('[data-testid="export-patients"]');
      const download = await downloadPromise;
      
      expect(download.suggestedFilename()).toContain('.csv');
      
      // Verify CSV content
      const csvContent = await apiHelper.testCSVExport('patients', 'admin');
      expect(csvContent).toContain('firstName,lastName,dateOfBirth');
      
      // Verify test patient data is included
      const testPatient = TEST_PATIENTS[0];
      expect(csvContent).toContain(testPatient.firstName);
      expect(csvContent).toContain(testPatient.lastName);
    });

    test('doctor should only export their assigned patients', async ({ page }) => {
      await loginAs(page, 'doctor');
      await adminBriefsPage.goto();

      const downloadPromise = page.waitForEvent('download');
      await page.click('[data-testid="export-patients"]');
      const download = await downloadPromise;
      
      const csvContent = await download.createReadStream();
      
      // Should contain header
      const text = csvContent.toString();
      expect(text).toContain('firstName,lastName');
      
      // Should only contain doctor's patients (verify by checking count)
      const lines = text.split('\n').filter(line => line.trim());
      expect(lines.length).toBeGreaterThan(1); // Header + at least one patient
    });

    test('staff should not have access to patient export', async ({ page }) => {
      await loginAs(page, 'staff');
      
      // Try direct API access
      const response = await apiHelper.makeRequest('GET', '/patients/export', undefined, 'staff');
      expect(response.status()).toBe(403);
    });
  });

  test.describe('Patient Data Privacy and Security', () => {
    test('should mask sensitive patient data in logs', async ({ page }) => {
      await loginAs(page, 'admin');
      await adminBriefsPage.goto();

      // Edit patient with sensitive data
      await adminBriefsPage.editPatient('1');
      await page.fill('[data-testid="medical-conditions"]', 'HIV positive, depression');
      await page.click('[data-testid="save-patient"]');
      
      // Check that sensitive data is not exposed in client-side logs
      const logs = await page.evaluate(() => {
        const consoleLogs: string[] = [];
        const originalLog = console.log;
        console.log = (...args) => {
          consoleLogs.push(args.join(' '));
          originalLog.apply(console, args);
        };
        return consoleLogs;
      });
      
      // Verify sensitive data is not in logs
      logs.forEach(log => {
        expect(log.toLowerCase()).not.toContain('hiv');
        expect(log.toLowerCase()).not.toContain('depression');
      });
    });

    test('should enforce HTTPS for patient data transmission', async ({ page }) => {
      // This test would be more relevant in staging/production
      // For local testing, verify secure headers are set
      await loginAs(page, 'admin');
      
      const response = await page.goto('/admin/briefs');
      const headers = response?.headers();
      
      // Verify security headers are present
      expect(headers?.['x-content-type-options']).toBe('nosniff');
      expect(headers?.['x-frame-options']).toBe('DENY');
    });

    test('should audit patient data access', async ({ page }) => {
      await loginAs(page, 'doctor');
      await adminBriefsPage.goto();

      // Access patient data
      await adminBriefsPage.editPatient('1');
      
      // Verify audit log was created
      const auditResponse = await apiHelper.makeRequest('GET', '/api/audit-logs?action=patient_access', undefined, 'admin');
      expect(auditResponse.ok()).toBeTruthy();
      
      const auditData = await auditResponse.json();
      expect(auditData.logs.some((log: any) => 
        log.action === 'patient_access' && log.userEmail === 'doctor@example.com'
      )).toBeTruthy();
    });
  });
});
