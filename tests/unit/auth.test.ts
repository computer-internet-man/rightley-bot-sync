import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { SignJWT, jwtVerify } from 'jose';
import { createMockEnv } from '../utils/mock-env';
import { TEST_USERS, createTestJWT } from '../utils/test-auth';
import { 
  expectResponseOk, 
  expectJsonResponse, 
  assertUnauthorized, 
  assertForbidden 
} from '../utils/test-helpers';

describe('Authentication & Authorization', () => {
  let env: any;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
  });

  describe('JWT Token Validation', () => {
    it('should accept valid JWT tokens', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/patients', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expectResponseOk(response);
    });

    it('should reject requests without tokens', async () => {
      const response = await SELF.fetch('http://localhost/patients');
      assertUnauthorized(response);
    });

    it('should reject invalid JWT tokens', async () => {
      const response = await SELF.fetch('http://localhost/patients', {
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      });

      assertUnauthorized(response);
    });

    it('should reject expired JWT tokens', async () => {
      // Create an expired token
      const expiredToken = await new SignJWT({
        sub: TEST_USERS.user.id,
        email: TEST_USERS.user.email,
        role: TEST_USERS.user.role,
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600  // 1 hour ago (expired)
      })
        .setProtectedHeader({ alg: 'HS256' })
        .sign(new TextEncoder().encode('test-secret-key-for-testing-only'));

      const response = await SELF.fetch('http://localhost/patients', {
        headers: {
          'Authorization': `Bearer ${expiredToken}`
        }
      });

      assertUnauthorized(response);
    });

    it('should extract user information from valid tokens', async () => {
      const token = await createTestJWT(TEST_USERS.admin);
      
      const response = await SELF.fetch('http://localhost/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expectResponseOk(response);
      const userData = await expectJsonResponse(response);
      
      expect(userData.id).toBe(TEST_USERS.admin.id);
      expect(userData.email).toBe(TEST_USERS.admin.email);
      expect(userData.role).toBe(TEST_USERS.admin.role);
    });
  });

  describe('Role-Based Access Control (RBAC)', () => {
    describe('Admin Role', () => {
      it('should allow admin to access all endpoints', async () => {
        const token = await createTestJWT(TEST_USERS.admin);
        const endpoints = [
          '/patients',
          '/messages',
          '/audit-logs',
          '/users'
        ];

        for (const endpoint of endpoints) {
          const response = await SELF.fetch(`http://localhost${endpoint}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          expectResponseOk(response);
        }
      });

      it('should allow admin to create and modify resources', async () => {
        const token = await createTestJWT(TEST_USERS.admin);
        
        // Create patient
        const createResponse = await SELF.fetch('http://localhost/patients', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'Test Patient',
            age: 30,
            medicalHistory: 'None',
            currentCondition: 'Healthy'
          })
        });

        expectResponseOk(createResponse, 201);
      });

      it('should allow admin to delete resources', async () => {
        const token = await createTestJWT(TEST_USERS.admin);
        
        const response = await SELF.fetch('http://localhost/messages/message-1', {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        expectResponseOk(response, 204);
      });
    });

    describe('User Role', () => {
      it('should allow user to access patients and messages', async () => {
        const token = await createTestJWT(TEST_USERS.user);
        
        const patientsResponse = await SELF.fetch('http://localhost/patients', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        expectResponseOk(patientsResponse);

        const messagesResponse = await SELF.fetch('http://localhost/messages', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        expectResponseOk(messagesResponse);
      });

      it('should allow user to create messages', async () => {
        const token = await createTestJWT(TEST_USERS.user);
        
        const response = await SELF.fetch('http://localhost/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            patientId: 'patient-1',
            content: 'Test message'
          })
        });

        expectResponseOk(response, 201);
      });

      it('should deny user access to admin endpoints', async () => {
        const token = await createTestJWT(TEST_USERS.user);
        
        const usersResponse = await SELF.fetch('http://localhost/users', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        assertForbidden(usersResponse);

        const auditResponse = await SELF.fetch('http://localhost/audit-logs', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        assertForbidden(auditResponse);
      });

      it('should deny user from deleting resources', async () => {
        const token = await createTestJWT(TEST_USERS.user);
        
        const response = await SELF.fetch('http://localhost/messages/message-1', {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        assertForbidden(response);
      });
    });

    describe('Viewer Role', () => {
      it('should allow viewer to read patients and messages', async () => {
        const token = await createTestJWT(TEST_USERS.viewer);
        
        const patientsResponse = await SELF.fetch('http://localhost/patients', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        expectResponseOk(patientsResponse);

        const messagesResponse = await SELF.fetch('http://localhost/messages', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        expectResponseOk(messagesResponse);
      });

      it('should deny viewer from creating resources', async () => {
        const token = await createTestJWT(TEST_USERS.viewer);
        
        const response = await SELF.fetch('http://localhost/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            patientId: 'patient-1',
            content: 'Test message'
          })
        });

        assertForbidden(response);
      });

      it('should deny viewer from generating drafts', async () => {
        const token = await createTestJWT(TEST_USERS.viewer);
        
        const response = await SELF.fetch('http://localhost/actions/generate-draft', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            patientId: 'patient-1',
            context: 'test'
          })
        });

        assertForbidden(response);
      });

      it('should allow viewer to export audit logs', async () => {
        const token = await createTestJWT(TEST_USERS.viewer);
        
        const response = await SELF.fetch('http://localhost/audit-logs/export', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        expectResponseOk(response);
      });
    });
  });

  describe('User Context', () => {
    it('should track user actions in audit logs', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      // Perform an action
      await SELF.fetch('http://localhost/patients/patient-1', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      // Check audit log (admin token needed to view logs)
      const adminToken = await createTestJWT(TEST_USERS.admin);
      const auditResponse = await SELF.fetch('http://localhost/audit-logs', {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      expectResponseOk(auditResponse);
      const auditData = await auditResponse.json();
      
      const userAction = auditData.logs.find((log: any) => 
        log.userId === TEST_USERS.user.id && 
        log.action === 'patient_viewed'
      );
      
      expect(userAction).toBeTruthy();
    });

    it('should filter resources by user permissions', async () => {
      const token = await createTestJWT(TEST_USERS.user);
      
      const response = await SELF.fetch('http://localhost/messages', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expectResponseOk(response);
      const data = await response.json();
      
      // Users should only see their own messages or public ones
      expect(data.messages).toBeDefined();
      expect(Array.isArray(data.messages)).toBe(true);
    });
  });
});
