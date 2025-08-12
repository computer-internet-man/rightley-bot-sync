/**
 * Test data utilities for end-to-end testing
 * Provides consistent test data and helpers for test scenarios
 */

export interface TestPatient {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: string;
  medicalConditions: string;
  medications: string[];
  allergyInfo: string;
}

export interface TestInquiry {
  text: string;
  expectedDraftLength: number;
  category: 'medical' | 'appointment' | 'general';
}

export interface TestMessage {
  patientId: number;
  inquiry: string;
  draft: string;
  status: 'draft' | 'pending_review' | 'approved' | 'sent' | 'rejected';
}

// Test patients (matching seed data)
export const TEST_PATIENTS: TestPatient[] = [
  {
    id: 1,
    firstName: 'John',
    lastName: 'Smith',
    fullName: 'John Smith',
    dateOfBirth: '1985-03-15',
    medicalConditions: 'Hypertension, Type 2 Diabetes',
    medications: ['Metformin 500mg', 'Lisinopril 10mg'],
    allergyInfo: 'Penicillin'
  },
  {
    id: 2,
    firstName: 'Sarah',
    lastName: 'Johnson',
    fullName: 'Sarah Johnson',
    dateOfBirth: '1992-07-22',
    medicalConditions: 'Asthma',
    medications: ['Albuterol inhaler'],
    allergyInfo: 'None known'
  },
  {
    id: 3,
    firstName: 'Michael',
    lastName: 'Brown',
    fullName: 'Michael Brown',
    dateOfBirth: '1978-11-08',
    medicalConditions: 'Chronic back pain, Arthritis',
    medications: ['Ibuprofen 400mg', 'Physical therapy'],
    allergyInfo: 'Shellfish'
  }
];

// Sample inquiries for testing
export const TEST_INQUIRIES: TestInquiry[] = [
  {
    text: 'I have been experiencing increased fatigue and frequent urination. Should I be concerned about my diabetes management?',
    expectedDraftLength: 200,
    category: 'medical'
  },
  {
    text: 'Can I schedule an appointment for next week? I need to discuss my medication dosage.',
    expectedDraftLength: 150,
    category: 'appointment'
  },
  {
    text: 'What should I do if I miss a dose of my blood pressure medication?',
    expectedDraftLength: 180,
    category: 'medical'
  },
  {
    text: 'I would like to request a copy of my recent lab results.',
    expectedDraftLength: 100,
    category: 'general'
  }
];

// Test scenarios for workflow testing
export const TEST_SCENARIOS = {
  FULL_WORKFLOW: {
    patient: TEST_PATIENTS[0],
    inquiry: TEST_INQUIRIES[0],
    expectedSteps: ['select_patient', 'enter_inquiry', 'generate_draft', 'edit_draft', 'submit_review', 'approve', 'send']
  },
  DIRECT_SEND: {
    patient: TEST_PATIENTS[1],
    inquiry: TEST_INQUIRIES[1],
    expectedSteps: ['select_patient', 'enter_inquiry', 'generate_draft', 'send_direct']
  },
  REJECTION_FLOW: {
    patient: TEST_PATIENTS[2],
    inquiry: TEST_INQUIRIES[2],
    expectedSteps: ['select_patient', 'enter_inquiry', 'generate_draft', 'submit_review', 'reject', 'edit_draft', 'resubmit']
  }
};

/**
 * Generate test audit log entry
 */
export function createTestAuditLog(action: string, userEmail: string, details?: any) {
  return {
    action,
    userEmail,
    timestamp: new Date().toISOString(),
    details: details || {},
    ipAddress: '127.0.0.1',
    userAgent: 'Playwright Test'
  };
}

/**
 * Generate random patient data for testing
 */
export function generateRandomPatient(): Partial<TestPatient> {
  const firstNames = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank'];
  const lastNames = ['Anderson', 'Wilson', 'Davis', 'Miller', 'Taylor', 'Moore'];
  
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    dateOfBirth: '1990-01-01',
    medicalConditions: 'Test condition',
    medications: ['Test medication'],
    allergyInfo: 'No known allergies'
  };
}

/**
 * Wait for element with retry logic
 */
export async function waitForElement(page: any, selector: string, timeout = 10000) {
  const element = page.locator(selector);
  await element.waitFor({ state: 'visible', timeout });
  return element;
}

/**
 * Wait for API request to complete
 */
export async function waitForAPIRequest(page: any, urlPattern: string) {
  return await page.waitForRequest(request => 
    request.url().includes(urlPattern) && request.method() === 'POST'
  );
}

/**
 * Get current timestamp for test isolation
 */
export function getTestTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Test data cleanup helpers
 */
export const TestDataHelpers = {
  /**
   * Create unique test identifier
   */
  generateTestId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Wait for async operation to complete
   */
  async waitForOperation(operation: () => Promise<boolean>, timeout = 10000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await operation()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  },

  /**
   * Verify CSV file format
   */
  verifyCSVFormat(csvContent: string, expectedHeaders: string[]): boolean {
    const lines = csvContent.split('\n');
    if (lines.length < 2) return false;
    
    const headers = lines[0].split(',').map(h => h.trim());
    return expectedHeaders.every(header => headers.includes(header));
  },

  /**
   * Generate test message with specific properties
   */
  createTestMessage(patientId: number, status: TestMessage['status']): TestMessage {
    return {
      patientId,
      inquiry: `Test inquiry for patient ${patientId}`,
      draft: `Test draft response for patient ${patientId}`,
      status
    };
  }
};

/**
 * Environment-specific test configuration
 */
export const TEST_CONFIG = {
  API_TIMEOUT: 30000,
  PAGE_LOAD_TIMEOUT: 10000,
  ELEMENT_WAIT_TIMEOUT: 5000,
  MAX_WORD_COUNT: 300,
  MIN_WORD_COUNT: 50,
  RETRY_ATTEMPTS: 3
};
