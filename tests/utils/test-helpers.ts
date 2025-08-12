import { expect } from 'vitest';

export function expectResponseOk(response: Response, expectedStatus = 200) {
  expect(response.status).toBe(expectedStatus);
  expect(response.ok).toBe(true);
}

export function expectResponseError(response: Response, expectedStatus: number) {
  expect(response.status).toBe(expectedStatus);
  expect(response.ok).toBe(false);
}

export async function expectJsonResponse(response: Response, expectedData?: any) {
  expect(response.headers.get('content-type')).toContain('application/json');
  const data = await response.json();
  
  if (expectedData) {
    expect(data).toMatchObject(expectedData);
  }
  
  return data;
}

export async function expectCsvResponse(response: Response) {
  expect(response.headers.get('content-type')).toContain('text/csv');
  expect(response.headers.get('content-disposition')).toContain('attachment');
  return await response.text();
}

export function expectValidAuditLog(auditLog: any) {
  expect(auditLog).toHaveProperty('id');
  expect(auditLog).toHaveProperty('userId');
  expect(auditLog).toHaveProperty('action');
  expect(auditLog).toHaveProperty('timestamp');
  expect(auditLog.timestamp).toBeInstanceOf(Date);
}

export function expectValidMessage(message: any) {
  expect(message).toHaveProperty('id');
  expect(message).toHaveProperty('patientId');
  expect(message).toHaveProperty('content');
  expect(message).toHaveProperty('status');
  expect(message).toHaveProperty('createdAt');
  expect(['draft', 'pending', 'sent', 'delivered', 'failed']).toContain(message.status);
}

export function expectValidPatient(patient: any) {
  expect(patient).toHaveProperty('id');
  expect(patient).toHaveProperty('name');
  expect(patient).toHaveProperty('age');
  expect(patient).toHaveProperty('medicalHistory');
  expect(patient).toHaveProperty('currentCondition');
}

export function expectValidUser(user: any) {
  expect(user).toHaveProperty('id');
  expect(user).toHaveProperty('email');
  expect(user).toHaveProperty('role');
  expect(['admin', 'user', 'viewer']).toContain(user.role);
}

export async function waitForQueueProcessing(ms = 100) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createTestPatient(overrides: any = {}) {
  return {
    id: `test-patient-${Date.now()}`,
    name: 'Test Patient',
    age: 45,
    medicalHistory: 'Test medical history',
    currentCondition: 'Stable',
    ...overrides
  };
}

export function createTestMessage(overrides: any = {}) {
  return {
    id: `test-message-${Date.now()}`,
    patientId: 'patient-1',
    content: 'Test message content',
    status: 'draft' as const,
    createdBy: 'test-user-1',
    ...overrides
  };
}

// Assertion helpers for common patterns
export function assertUnauthorized(response: Response) {
  expect(response.status).toBe(401);
}

export function assertForbidden(response: Response) {
  expect(response.status).toBe(403);
}

export function assertNotFound(response: Response) {
  expect(response.status).toBe(404);
}

export function assertBadRequest(response: Response) {
  expect(response.status).toBe(400);
}

export function assertMethodNotAllowed(response: Response) {
  expect(response.status).toBe(405);
}
