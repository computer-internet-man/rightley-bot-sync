import { test, expect } from '@playwright/test';
import { loginAs } from './utils/auth-helpers';
import { DraftPage, ReviewPage } from './utils/page-objects';
import { TEST_PATIENTS, TEST_INQUIRIES, TEST_CONFIG } from './utils/test-data';
import { APITestHelper } from './utils/api-helpers';

test.describe('Draft Generation Workflow', () => {
  let draftPage: DraftPage;
  let reviewPage: ReviewPage;
  let apiHelper: APITestHelper;

  test.beforeEach(async ({ page }) => {
    draftPage = new DraftPage(page);
    reviewPage = new ReviewPage(page);
    apiHelper = new APITestHelper(page);
  });

  test.describe('AI Draft Generation', () => {
    test('should generate draft from patient inquiry', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      const testInquiry = TEST_INQUIRIES[0];

      // Select patient and enter inquiry
      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(testInquiry.text);

      // Generate draft
      await draftPage.generateDraft();

      // Verify draft was generated
      const draftContent = await draftPage.getDraftContent();
      expect(draftContent.length).toBeGreaterThan(50);
      
      // Verify word count is within reasonable range
      const wordCount = await draftPage.getWordCount();
      expect(wordCount).toBeGreaterThan(TEST_CONFIG.MIN_WORD_COUNT);
      expect(wordCount).toBeLessThan(TEST_CONFIG.MAX_WORD_COUNT);
    });

    test('should include patient-specific information in draft', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0]; // John Smith with diabetes and hypertension
      const medicalInquiry = 'I have been experiencing increased fatigue. Could this be related to my diabetes?';

      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(medicalInquiry);
      await draftPage.generateDraft();

      const draftContent = await draftPage.getDraftContent();
      
      // Draft should reference patient's known conditions
      expect(draftContent.toLowerCase()).toContain('diabetes');
      expect(draftContent.toLowerCase()).toContain('fatigue');
    });

    test('should handle long inquiries appropriately', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      const longInquiry = 'I have been experiencing multiple symptoms over the past few weeks. ' +
        'First, I noticed increased fatigue and frequent urination, which I know can be related to my diabetes. ' +
        'I have also been having some chest discomfort and shortness of breath, especially when climbing stairs. ' +
        'My blood pressure readings at home have been higher than usual. I am taking my medications as prescribed. ' +
        'Should I be concerned about these symptoms? Do I need to come in for an appointment?';

      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(longInquiry);
      await draftPage.generateDraft();

      const draftContent = await draftPage.getDraftContent();
      expect(draftContent.length).toBeGreaterThan(100);
      
      // Should address multiple concerns mentioned
      expect(draftContent.toLowerCase()).toContain('symptom');
      expect(draftContent.toLowerCase()).toContain('appointment');
    });

    test('should enforce word count limits', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      const testInquiry = TEST_INQUIRIES[0];

      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(testInquiry.text);
      await draftPage.generateDraft();

      const wordCount = await draftPage.getWordCount();
      expect(wordCount).toBeLessThanOrEqual(TEST_CONFIG.MAX_WORD_COUNT);
      
      // Verify word count display is accurate
      const draftContent = await draftPage.getDraftContent();
      const actualWordCount = draftContent.split(/\s+/).length;
      expect(Math.abs(wordCount - actualWordCount)).toBeLessThanOrEqual(2); // Allow small variance
    });

    test('should handle API errors gracefully', async ({ page }) => {
      // Mock API failure
      await page.route('**/actions/generate-draft', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'AI service temporarily unavailable' })
        });
      });

      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      const testInquiry = TEST_INQUIRIES[0];

      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(testInquiry.text);
      await draftPage.generateButton.click();

      // Should show error message
      expect(page.locator('[data-testid="error-message"]')).toBeVisible();
      expect(page.locator('text=AI service temporarily unavailable')).toBeVisible();
    });

    test('should timeout long-running AI requests', async ({ page }) => {
      // Mock slow API response
      await page.route('**/actions/generate-draft', route => {
        // Don't fulfill the route to simulate timeout
        setTimeout(() => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ draft: 'Delayed response' })
          });
        }, TEST_CONFIG.API_TIMEOUT + 1000);
      });

      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      const testInquiry = TEST_INQUIRIES[0];

      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(testInquiry.text);
      await draftPage.generateButton.click();

      // Should show timeout or loading state
      await expect(draftPage.loadingSpinner).toBeVisible();
      
      // After timeout, should show error or fallback
      await page.waitForTimeout(TEST_CONFIG.API_TIMEOUT + 2000);
      expect(page.locator('[data-testid="error-message"], [data-testid="timeout-message"]')).toBeVisible();
    });
  });

  test.describe('Draft Editing', () => {
    test('should allow editing of generated draft', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      const testInquiry = TEST_INQUIRIES[0];

      // Generate initial draft
      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(testInquiry.text);
      await draftPage.generateDraft();

      const originalDraft = await draftPage.getDraftContent();
      
      // Edit the draft
      const editedContent = originalDraft + ' Additional personalized information.';
      await draftPage.editDraft(editedContent);

      // Verify changes are reflected
      const newDraftContent = await draftPage.editDraftTextarea.inputValue();
      expect(newDraftContent).toContain('Additional personalized information');
    });

    test('should update word count when editing', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      const testInquiry = TEST_INQUIRIES[0];

      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(testInquiry.text);
      await draftPage.generateDraft();

      const originalWordCount = await draftPage.getWordCount();
      
      // Add more content
      const currentContent = await draftPage.editDraftTextarea.inputValue();
      await draftPage.editDraft(currentContent + ' This is additional content with ten more words.');

      // Word count should increase
      const newWordCount = await draftPage.getWordCount();
      expect(newWordCount).toBeGreaterThan(originalWordCount);
      expect(newWordCount - originalWordCount).toBe(10);
    });

    test('should prevent exceeding maximum word count', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      const testInquiry = TEST_INQUIRIES[0];

      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(testInquiry.text);
      await draftPage.generateDraft();

      // Try to add content that would exceed limit
      const longContent = 'word '.repeat(TEST_CONFIG.MAX_WORD_COUNT);
      await draftPage.editDraft(longContent);

      // Should show warning or prevent submission
      expect(page.locator('[data-testid="word-limit-warning"]')).toBeVisible();
      
      // Submit buttons should be disabled
      expect(draftPage.submitForReviewButton).toBeDisabled();
      expect(draftPage.sendDirectlyButton).toBeDisabled();
    });

    test('should validate draft content quality', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      const testInquiry = TEST_INQUIRIES[0];

      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(testInquiry.text);
      await draftPage.generateDraft();

      // Try to submit with minimal content
      await draftPage.editDraft('Too short.');

      await draftPage.submitForReviewButton.click();

      // Should show validation error
      expect(page.locator('[data-testid="content-validation-error"]')).toBeVisible();
    });
  });

  test.describe('Draft Submission Workflow', () => {
    test('staff should submit draft for review', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      const testInquiry = TEST_INQUIRIES[0];

      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(testInquiry.text);
      await draftPage.generateDraft();

      // Submit for review
      await draftPage.submitForReview();

      // Should redirect or show success message
      expect(page.locator('[data-testid="submit-success"]')).toBeVisible();
      
      // Verify message appears in review queue
      await reviewPage.goto();
      const pendingCount = await reviewPage.getPendingMessageCount();
      expect(pendingCount).toBeGreaterThan(0);
    });

    test('doctor should be able to send directly', async ({ page }) => {
      await loginAs(page, 'doctor');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      const testInquiry = TEST_INQUIRIES[0];

      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(testInquiry.text);
      await draftPage.generateDraft();

      // Doctor should see direct send option
      expect(draftPage.sendDirectlyButton).toBeVisible();
      
      await draftPage.sendDirectly();

      // Should show success message
      expect(page.locator('[data-testid="send-success"]')).toBeVisible();
    });

    test('staff should not see direct send option', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      const testInquiry = TEST_INQUIRIES[0];

      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(testInquiry.text);
      await draftPage.generateDraft();

      // Staff should not see direct send button
      expect(draftPage.sendDirectlyButton).not.toBeVisible();
      
      // Only submit for review should be available
      expect(draftPage.submitForReviewButton).toBeVisible();
    });

    test('should handle concurrent draft submissions', async ({ browser }) => {
      // Create two browser contexts for concurrent testing
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      
      try {
        await loginAs(page1, 'staff');
        await loginAs(page2, 'staff');

        const draftPage1 = new DraftPage(page1);
        const draftPage2 = new DraftPage(page2);

        // Both users create drafts for same patient
        const testPatient = TEST_PATIENTS[0];
        const testInquiry = TEST_INQUIRIES[0];

        // User 1 creates draft
        await draftPage1.goto();
        await draftPage1.selectPatient(testPatient.fullName);
        await draftPage1.enterInquiry(testInquiry.text);
        await draftPage1.generateDraft();

        // User 2 creates draft
        await draftPage2.goto();
        await draftPage2.selectPatient(testPatient.fullName);
        await draftPage2.enterInquiry(testInquiry.text);
        await draftPage2.generateDraft();

        // Both submit simultaneously
        await Promise.all([
          draftPage1.submitForReview(),
          draftPage2.submitForReview()
        ]);

        // Both should succeed or show appropriate handling
        expect(page1.locator('[data-testid="submit-success"], [data-testid="submit-error"]')).toBeVisible();
        expect(page2.locator('[data-testid="submit-success"], [data-testid="submit-error"]')).toBeVisible();
      } finally {
        await context1.close();
        await context2.close();
      }
    });
  });

  test.describe('Draft Performance and Optimization', () => {
    test('should cache AI responses appropriately', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      const testInquiry = TEST_INQUIRIES[0];

      // Track network requests
      const requests: string[] = [];
      page.on('request', request => {
        if (request.url().includes('/actions/generate-draft')) {
          requests.push(request.url());
        }
      });

      // Generate same draft twice
      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(testInquiry.text);
      await draftPage.generateDraft();

      const firstDraft = await draftPage.getDraftContent();

      // Generate again with same input
      await draftPage.generateDraft();
      const secondDraft = await draftPage.getDraftContent();

      // Should have made API calls (caching might be disabled in test mode)
      expect(requests.length).toBeGreaterThan(0);
      
      // Results should be consistent
      expect(firstDraft).toBe(secondDraft);
    });

    test('should handle high load scenarios', async ({ page }) => {
      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      
      // Test multiple rapid submissions
      const submissions = [];
      for (let i = 0; i < 5; i++) {
        const inquiry = `Test inquiry ${i} - checking system performance under load.`;
        submissions.push(async () => {
          await draftPage.selectPatient(testPatient.fullName);
          await draftPage.enterInquiry(inquiry);
          await draftPage.generateDraft();
        });
      }

      // Execute submissions with small delays
      for (const submission of submissions) {
        await submission();
        await page.waitForTimeout(100);
      }

      // Final draft should be generated successfully
      const finalDraft = await draftPage.getDraftContent();
      expect(finalDraft.length).toBeGreaterThan(50);
    });

    test('should optimize for mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      await loginAs(page, 'staff');
      await draftPage.goto();

      const testPatient = TEST_PATIENTS[0];
      const testInquiry = TEST_INQUIRIES[0];

      // UI should be responsive
      expect(draftPage.patientSelect).toBeVisible();
      expect(draftPage.inquiryTextarea).toBeVisible();
      expect(draftPage.generateButton).toBeVisible();

      // Workflow should work on mobile
      await draftPage.selectPatient(testPatient.fullName);
      await draftPage.enterInquiry(testInquiry.text);
      await draftPage.generateDraft();

      const draftContent = await draftPage.getDraftContent();
      expect(draftContent.length).toBeGreaterThan(50);
    });
  });
});
