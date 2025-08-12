import { Page, Locator } from '@playwright/test';

/**
 * Page Object Models for consistent UI interaction
 * Encapsulates page-specific logic and element selectors
 */

export class BasePage {
  constructor(protected page: Page) {}

  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  async getTitle() {
    return await this.page.title();
  }
}

export class LoginPage extends BasePage {
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.loginButton = page.locator('[data-testid="login-button"]');
    this.errorMessage = page.locator('[data-testid="error-message"]');
  }

  async goto() {
    await this.page.goto('/login');
    await this.waitForPageLoad();
  }

  async clickLogin() {
    await this.loginButton.click();
    await this.waitForPageLoad();
  }
}

export class DraftPage extends BasePage {
  readonly patientSelect: Locator;
  readonly inquiryTextarea: Locator;
  readonly generateButton: Locator;
  readonly draftContent: Locator;
  readonly editDraftTextarea: Locator;
  readonly submitForReviewButton: Locator;
  readonly sendDirectlyButton: Locator;
  readonly wordCountDisplay: Locator;
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    super(page);
    this.patientSelect = page.locator('[data-testid="patient-select"]');
    this.inquiryTextarea = page.locator('[data-testid="inquiry-textarea"]');
    this.generateButton = page.locator('[data-testid="generate-button"]');
    this.draftContent = page.locator('[data-testid="draft-content"]');
    this.editDraftTextarea = page.locator('[data-testid="edit-draft-textarea"]');
    this.submitForReviewButton = page.locator('[data-testid="submit-review-button"]');
    this.sendDirectlyButton = page.locator('[data-testid="send-direct-button"]');
    this.wordCountDisplay = page.locator('[data-testid="word-count"]');
    this.loadingSpinner = page.locator('[data-testid="loading-spinner"]');
  }

  async goto() {
    await this.page.goto('/draft');
    await this.waitForPageLoad();
  }

  async selectPatient(patientName: string) {
    await this.patientSelect.click();
    await this.page.locator(`option:has-text("${patientName}")`).click();
  }

  async enterInquiry(inquiry: string) {
    await this.inquiryTextarea.fill(inquiry);
  }

  async generateDraft() {
    await this.generateButton.click();
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 30000 });
  }

  async editDraft(newContent: string) {
    await this.editDraftTextarea.fill(newContent);
  }

  async submitForReview() {
    await this.submitForReviewButton.click();
    await this.waitForPageLoad();
  }

  async sendDirectly() {
    await this.sendDirectlyButton.click();
    await this.waitForPageLoad();
  }

  async getWordCount(): Promise<number> {
    const text = await this.wordCountDisplay.textContent();
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  async getDraftContent(): Promise<string> {
    return await this.draftContent.textContent() || '';
  }
}

export class AdminBriefsPage extends BasePage {
  readonly createPatientButton: Locator;
  readonly patientTable: Locator;
  readonly searchInput: Locator;
  readonly editButton: (id: string) => Locator;
  readonly deleteButton: (id: string) => Locator;

  constructor(page: Page) {
    super(page);
    this.createPatientButton = page.locator('[data-testid="create-patient-button"]');
    this.patientTable = page.locator('[data-testid="patient-table"]');
    this.searchInput = page.locator('[data-testid="search-input"]');
    this.editButton = (id: string) => page.locator(`[data-testid="edit-patient-${id}"]`);
    this.deleteButton = (id: string) => page.locator(`[data-testid="delete-patient-${id}"]`);
  }

  async goto() {
    await this.page.goto('/admin/briefs');
    await this.waitForPageLoad();
  }

  async createPatient() {
    await this.createPatientButton.click();
    await this.waitForPageLoad();
  }

  async searchPatients(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(500); // Debounce
  }

  async editPatient(id: string) {
    await this.editButton(id).click();
    await this.waitForPageLoad();
  }

  async deletePatient(id: string) {
    await this.deleteButton(id).click();
    // Handle confirmation dialog
    await this.page.locator('[data-testid="confirm-delete"]').click();
    await this.waitForPageLoad();
  }

  async getPatientRows() {
    return await this.patientTable.locator('tbody tr').count();
  }
}

export class AuditLogsPage extends BasePage {
  readonly filterSelect: Locator;
  readonly dateFromInput: Locator;
  readonly dateToInput: Locator;
  readonly exportButton: Locator;
  readonly auditTable: Locator;
  readonly loadMoreButton: Locator;

  constructor(page: Page) {
    super(page);
    this.filterSelect = page.locator('[data-testid="audit-filter"]');
    this.dateFromInput = page.locator('[data-testid="date-from"]');
    this.dateToInput = page.locator('[data-testid="date-to"]');
    this.exportButton = page.locator('[data-testid="export-button"]');
    this.auditTable = page.locator('[data-testid="audit-table"]');
    this.loadMoreButton = page.locator('[data-testid="load-more"]');
  }

  async goto() {
    await this.page.goto('/admin/audit');
    await this.waitForPageLoad();
  }

  async filterByAction(action: string) {
    await this.filterSelect.selectOption(action);
    await this.waitForPageLoad();
  }

  async setDateRange(from: string, to: string) {
    await this.dateFromInput.fill(from);
    await this.dateToInput.fill(to);
    await this.page.keyboard.press('Enter');
    await this.waitForPageLoad();
  }

  async exportToCSV() {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportButton.click();
    const download = await downloadPromise;
    return download;
  }

  async getAuditLogCount(): Promise<number> {
    return await this.auditTable.locator('tbody tr').count();
  }

  async loadMoreLogs() {
    if (await this.loadMoreButton.isVisible()) {
      await this.loadMoreButton.click();
      await this.waitForPageLoad();
    }
  }
}

export class ReviewPage extends BasePage {
  readonly pendingMessages: Locator;
  readonly approveButton: (id: string) => Locator;
  readonly rejectButton: (id: string) => Locator;
  readonly messageContent: (id: string) => Locator;

  constructor(page: Page) {
    super(page);
    this.pendingMessages = page.locator('[data-testid="pending-messages"]');
    this.approveButton = (id: string) => page.locator(`[data-testid="approve-${id}"]`);
    this.rejectButton = (id: string) => page.locator(`[data-testid="reject-${id}"]`);
    this.messageContent = (id: string) => page.locator(`[data-testid="message-${id}"]`);
  }

  async goto() {
    await this.page.goto('/review');
    await this.waitForPageLoad();
  }

  async approveMessage(id: string) {
    await this.approveButton(id).click();
    await this.waitForPageLoad();
  }

  async rejectMessage(id: string) {
    await this.rejectButton(id).click();
    await this.waitForPageLoad();
  }

  async getPendingMessageCount(): Promise<number> {
    return await this.pendingMessages.locator('.message-item').count();
  }

  async getMessageContent(id: string): Promise<string> {
    return await this.messageContent(id).textContent() || '';
  }
}

export class DoctorSettingsPage extends BasePage {
  readonly preferredChannelSelect: Locator;
  readonly notificationToggle: Locator;
  readonly saveButton: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.preferredChannelSelect = page.locator('[data-testid="preferred-channel"]');
    this.notificationToggle = page.locator('[data-testid="notification-toggle"]');
    this.saveButton = page.locator('[data-testid="save-settings"]');
    this.successMessage = page.locator('[data-testid="success-message"]');
  }

  async goto() {
    await this.page.goto('/doctor/settings');
    await this.waitForPageLoad();
  }

  async setPreferredChannel(channel: string) {
    await this.preferredChannelSelect.selectOption(channel);
  }

  async toggleNotifications() {
    await this.notificationToggle.click();
  }

  async saveSettings() {
    await this.saveButton.click();
    await this.successMessage.waitFor({ state: 'visible' });
  }
}
