import { Page, APIRequestContext } from '@playwright/test';
import { TEST_USERS } from './auth-helpers';

/**
 * API testing utilities for Playwright e2e tests
 * Provides helpers for testing API endpoints within browser context
 */

export class APITestHelper {
  constructor(private page: Page) {}

  /**
   * Make authenticated API request
   */
  async makeRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any,
    userRole?: keyof typeof TEST_USERS
  ) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Test-Mode': '1'
    };

    if (userRole) {
      const user = TEST_USERS[userRole];
      headers['Cf-Access-Jwt-Assertion'] = user.jwt;
      headers['X-Forwarded-Email'] = user.email;
      headers['X-Forwarded-User'] = user.name;
      headers['X-Test-User-Role'] = user.role;
    }

    const response = await this.page.request[method.toLowerCase() as 'get'](endpoint, {
      data: data ? JSON.stringify(data) : undefined,
      headers
    });

    return response;
  }

  /**
   * Test API endpoint accessibility by role
   */
  async testEndpointAccess(endpoint: string, allowedRoles: string[]) {
    const results: Record<string, { status: number; allowed: boolean }> = {};

    for (const [roleName, user] of Object.entries(TEST_USERS)) {
      const response = await this.makeRequest('GET', endpoint, undefined, roleName as keyof typeof TEST_USERS);
      const status = response.status();
      const allowed = allowedRoles.includes(user.role);

      results[roleName] = { status, allowed };

      // Verify expected access control
      if (allowed && status >= 400) {
        throw new Error(`Role ${roleName} should have access to ${endpoint} but got ${status}`);
      }
      if (!allowed && status < 400) {
        throw new Error(`Role ${roleName} should NOT have access to ${endpoint} but got ${status}`);
      }
    }

    return results;
  }

  /**
   * Test draft generation API
   */
  async testDraftGeneration(patientId: number, inquiry: string, userRole: keyof typeof TEST_USERS = 'staff') {
    const response = await this.makeRequest('POST', '/actions/generate-draft', {
      patientId,
      inquiry
    }, userRole);

    if (!response.ok()) {
      throw new Error(`Draft generation failed: ${response.status()}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Test message workflow submission
   */
  async testMessageSubmission(messageData: any, userRole: keyof typeof TEST_USERS = 'staff') {
    const response = await this.makeRequest('POST', '/api/message-workflow/submit-for-review', 
      messageData, userRole);

    if (!response.ok()) {
      throw new Error(`Message submission failed: ${response.status()}`);
    }

    return await response.json();
  }

  /**
   * Test audit log creation
   */
  async testAuditLogCreation(action: string, details: any, userRole: keyof typeof TEST_USERS = 'admin') {
    const response = await this.makeRequest('POST', '/api/audit-logs', {
      action,
      details,
      timestamp: new Date().toISOString()
    }, userRole);

    if (!response.ok()) {
      throw new Error(`Audit log creation failed: ${response.status()}`);
    }

    return await response.json();
  }

  /**
   * Test patient management APIs
   */
  async testPatientCRUD(userRole: keyof typeof TEST_USERS = 'admin') {
    // Test create patient
    const createResponse = await this.makeRequest('POST', '/patients', {
      firstName: 'Test',
      lastName: 'Patient',
      dateOfBirth: '1990-01-01',
      medicalConditions: 'Test condition'
    }, userRole);

    if (!createResponse.ok()) {
      throw new Error(`Patient creation failed: ${createResponse.status()}`);
    }

    const patient = await createResponse.json();

    // Test read patient
    const readResponse = await this.makeRequest('GET', `/patients/${patient.id}`, undefined, userRole);
    
    if (!readResponse.ok()) {
      throw new Error(`Patient read failed: ${readResponse.status()}`);
    }

    // Test update patient
    const updateResponse = await this.makeRequest('PUT', `/patients/${patient.id}`, {
      firstName: 'Updated',
      lastName: 'Patient'
    }, userRole);

    if (!updateResponse.ok()) {
      throw new Error(`Patient update failed: ${updateResponse.status()}`);
    }

    // Test delete patient
    const deleteResponse = await this.makeRequest('DELETE', `/patients/${patient.id}`, undefined, userRole);

    if (!deleteResponse.ok()) {
      throw new Error(`Patient deletion failed: ${deleteResponse.status()}`);
    }

    return patient;
  }

  /**
   * Test CSV export functionality
   */
  async testCSVExport(exportType: 'audit' | 'patients', userRole: keyof typeof TEST_USERS = 'admin') {
    const endpoint = exportType === 'audit' ? '/api/audit-export/export' : '/patients/export';
    
    const response = await this.makeRequest('POST', endpoint, {
      format: 'csv',
      dateFrom: '2024-01-01',
      dateTo: new Date().toISOString().split('T')[0]
    }, userRole);

    if (!response.ok()) {
      throw new Error(`CSV export failed: ${response.status()}`);
    }

    // Check content type
    const contentType = response.headers()['content-type'];
    if (!contentType?.includes('text/csv')) {
      throw new Error(`Expected CSV content type, got ${contentType}`);
    }

    return await response.text();
  }

  /**
   * Test rate limiting
   */
  async testRateLimit(endpoint: string, userRole: keyof typeof TEST_USERS = 'staff') {
    const requests = [];
    
    // Make multiple rapid requests
    for (let i = 0; i < 10; i++) {
      requests.push(this.makeRequest('GET', endpoint, undefined, userRole));
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.some(response => response.status() === 429);

    return {
      totalRequests: responses.length,
      rateLimited,
      responses: responses.map(r => ({ status: r.status() }))
    };
  }

  /**
   * Test error handling
   */
  async testErrorHandling() {
    const tests = [
      // Test invalid endpoint
      { endpoint: '/api/invalid-endpoint', expectedStatus: 404 },
      // Test malformed JSON
      { endpoint: '/api/message-workflow/submit-for-review', data: 'invalid-json', expectedStatus: 400 },
      // Test missing required fields
      { endpoint: '/actions/generate-draft', data: {}, expectedStatus: 400 }
    ];

    const results = [];

    for (const test of tests) {
      try {
        const response = await this.makeRequest('POST', test.endpoint, test.data);
        results.push({
          test: test.endpoint,
          status: response.status(),
          expected: test.expectedStatus,
          passed: response.status() === test.expectedStatus
        });
      } catch (error) {
        results.push({
          test: test.endpoint,
          error: error.message,
          passed: false
        });
      }
    }

    return results;
  }

  /**
   * Verify API response structure
   */
  verifyResponseStructure(data: any, expectedFields: string[]): boolean {
    for (const field of expectedFields) {
      if (!(field in data)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    return true;
  }

  /**
   * Test pagination
   */
  async testPagination(endpoint: string, userRole: keyof typeof TEST_USERS = 'admin') {
    // Test first page
    const page1 = await this.makeRequest('GET', `${endpoint}?page=1&limit=2`, undefined, userRole);
    if (!page1.ok()) {
      throw new Error(`Pagination test failed: ${page1.status()}`);
    }

    const page1Data = await page1.json();

    // Test second page
    const page2 = await this.makeRequest('GET', `${endpoint}?page=2&limit=2`, undefined, userRole);
    if (!page2.ok()) {
      throw new Error(`Pagination test failed: ${page2.status()}`);
    }

    const page2Data = await page2.json();

    return {
      page1: page1Data,
      page2: page2Data,
      totalItems: page1Data.total || 0,
      itemsPerPage: page1Data.items?.length || 0
    };
  }
}

/**
 * Mock API responses for testing
 */
export const APIMocks = {
  /**
   * Mock AI draft generation
   */
  mockDraftGeneration: {
    success: {
      draft: 'This is a mocked draft response for testing purposes.',
      wordCount: 10,
      generatedAt: new Date().toISOString()
    },
    error: {
      error: 'AI service temporarily unavailable',
      code: 'AI_SERVICE_ERROR'
    }
  },

  /**
   * Mock patient data
   */
  mockPatient: {
    id: 999,
    firstName: 'Mock',
    lastName: 'Patient',
    dateOfBirth: '1990-01-01',
    medicalConditions: 'Test condition',
    createdAt: new Date().toISOString()
  },

  /**
   * Mock audit log entry
   */
  mockAuditLog: {
    id: 999,
    action: 'test_action',
    userEmail: 'test@example.com',
    timestamp: new Date().toISOString(),
    details: { test: true }
  }
};
