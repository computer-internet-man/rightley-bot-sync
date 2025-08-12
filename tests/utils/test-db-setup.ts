import { drizzle } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/d1/migrator';
import { sql } from 'drizzle-orm';
import * as schema from '../../src/db/schema';

let testDb: D1Database;
let db: ReturnType<typeof drizzle>;

export async function setupTestDb() {
  // Get the test D1 database from the global environment
  testDb = (globalThis as any).cloudflare?.env?.DB;
  
  if (!testDb) {
    // Gracefully skip if not in Workers environment
    console.warn('D1 database not available - skipping database-dependent test setup');
    return;
  }

  db = drizzle(testDb, { schema });

  // Run migrations
  try {
    await migrate(db, { migrationsFolder: './drizzle/migrations' });
  } catch (error) {
    console.warn('Migration warning (may be expected in tests):', error);
  }

  // Seed test data
  await seedTestData();
}

export async function cleanupTestDb() {
  if (!db) return;

  // Clean up all tables
  try {
    await db.delete(schema.messageQueue);
    await db.delete(schema.auditLogs);
    await db.delete(schema.doctorSettings);
    await db.delete(schema.patientBriefs);
    await db.delete(schema.users);
  } catch (error) {
    console.warn('Cleanup warning:', error);
  }
}

export async function seedTestData() {
  if (!db) return;

  // Insert test users
  await db.insert(schema.users).values([
    {
      id: 'test-admin-1',
      username: 'admin',
      email: 'admin@test.com',
      role: 'admin'
    },
    {
      id: 'test-user-1', 
      username: 'testuser',
      email: 'user@test.com',
      role: 'doctor'
    },
    {
      id: 'test-viewer-1',
      username: 'viewer',
      email: 'viewer@test.com', 
      role: 'auditor'
    }
  ]);

  // Insert test patient briefs
  await db.insert(schema.patientBriefs).values([
    {
      id: 'patient-1',
      patientName: 'John Test',
      briefText: 'Patient inquiry about medication timing',
      medicalHistory: 'Diabetes, Hypertension',
      currentMedications: 'Metformin, Lisinopril',
      allergies: 'None known',
      doctorNotes: 'Stable condition, good compliance',
      patientInquiry: 'When should I take my medication?',
      doctorId: 'test-user-1'
    },
    {
      id: 'patient-2',
      patientName: 'Jane Test',
      briefText: 'Follow-up on asthma symptoms',
      medicalHistory: 'Asthma',
      currentMedications: 'Albuterol inhaler',
      allergies: 'Pollen',
      doctorNotes: 'Well controlled asthma',
      patientInquiry: 'Should I use my inhaler before exercise?',
      doctorId: 'test-user-1'
    }
  ]);
}

export function getTestDb() {
  return db;
}

export function getTestEnv() {
  return (globalThis as any).cloudflare?.env || {};
}
