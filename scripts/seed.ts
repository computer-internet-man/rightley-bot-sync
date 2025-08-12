import { setupDrizzleDb } from '@/db/client';
import { users, patientBriefs, doctorSettings, auditLogs } from '@/db/schema';
import Database from 'better-sqlite3';

const env = {
  DB: new Database('./dev.db') as unknown as D1Database,
} as Env;

const db = setupDrizzleDb(env);

console.log('🌱 Seeding database with Drizzle...');

// Clear existing data
console.log('🗑️ Clearing existing data...');
await db.delete(auditLogs);
await db.delete(patientBriefs);  
await db.delete(doctorSettings);
await db.delete(users);

// Create users
console.log('👥 Creating users...');

const userData = [
  {
    id: '550e8400-e29b-41d4-a716-446655440000',
    username: 'admin',
    email: 'admin@example.com',
    role: 'admin',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440001', 
    username: 'dr.smith',
    email: 'dr.smith@example.com',
    role: 'doctor',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    username: 'staff1',
    email: 'staff1@example.com', 
    role: 'staff',
  },
];

for (const user of userData) {
  await db.insert(users).values(user);
  console.log(`✅ Created user: ${user.username}`);
}

// Create John Doe patient brief
console.log('📋 Creating patient brief...');

const johnDoeBrief = {
  id: '550e8400-e29b-41d4-a716-446655440100',
  patientName: 'John Doe',
  briefText: 'Patient presents with chest pain and shortness of breath. Initial workup suggests possible cardiac involvement.',
  medicalHistory: 'Hypertension, diabetes mellitus type 2, previous myocardial infarction in 2019',
  currentMedications: 'Lisinopril 10mg daily, Metformin 1000mg twice daily, Aspirin 81mg daily',
  allergies: 'Penicillin (rash), Sulfa drugs (severe allergic reaction)',
  doctorNotes: 'Patient stable, continue current medications. Follow up in 2 weeks.',
  doctorId: '550e8400-e29b-41d4-a716-446655440001', // dr.smith
};

await db.insert(patientBriefs).values(johnDoeBrief);
console.log('✅ Created John Doe patient brief');

// Create doctor settings
console.log('⚙️ Creating doctor settings...');

const drSmithSettings = {
  id: '550e8400-e29b-41d4-a716-446655440200',
  doctorId: '550e8400-e29b-41d4-a716-446655440001', // dr.smith
  communicationTone: 'professional',
  signOff: 'Dr. Smith, Internal Medicine',
  maxWords: 200,
  readingLevel: 'high school',
  specialtyFocus: 'cardiology',
};

await db.insert(doctorSettings).values(drSmithSettings);
console.log('✅ Created Dr. Smith settings');

// Create sample audit logs
console.log('📊 Creating audit logs...');

const auditLogData = [
  {
    id: '550e8400-e29b-41d4-a716-446655440300',
    userId: '550e8400-e29b-41d4-a716-446655440001', // dr.smith
    patientName: 'John Doe',
    patientId: '550e8400-e29b-41d4-a716-446655440100',
    requestText: 'Generate follow-up message for patient post cardiac evaluation',
    generatedDraft: 'Dear John, Your recent cardiac evaluation shows stable results. Please continue your current medications and schedule a follow-up appointment in two weeks.',
    finalMessage: 'Dear John, Your recent cardiac evaluation shows stable results. Please continue your current medications and schedule a follow-up appointment in two weeks. Best regards, Dr. Smith',
    actionType: 'draft_generated',
    deliveryStatus: 'pending',
    aiModelUsed: 'gpt-4',
    tokensConsumed: 150,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440301',
    userId: '550e8400-e29b-41d4-a716-446655440001', // dr.smith  
    patientName: 'John Doe',
    patientId: '550e8400-e29b-41d4-a716-446655440100',
    requestText: 'Send medication reminder to patient',
    generatedDraft: 'Reminder: Please take your medications as prescribed and monitor your blood pressure daily.',
    finalMessage: 'Reminder: Please take your medications as prescribed and monitor your blood pressure daily. Contact us if you have concerns.',
    actionType: 'sent',
    deliveryStatus: 'delivered',
    aiModelUsed: 'gpt-4',
    tokensConsumed: 120,
    deliveredAt: new Date(),
  },
];

for (const log of auditLogData) {
  await db.insert(auditLogs).values(log);
}

console.log('✅ Created audit logs');

console.log('🎉 Database seeded successfully with Drizzle!');

// Verify data
const userCount = await db.select().from(users);
const briefCount = await db.select().from(patientBriefs);
const settingsCount = await db.select().from(doctorSettings);
const auditCount = await db.select().from(auditLogs);

console.log(`📊 Verification:`);
console.log(`  Users: ${userCount.length}`);
console.log(`  Patient Briefs: ${briefCount.length}`);
console.log(`  Doctor Settings: ${settingsCount.length}`);
console.log(`  Audit Logs: ${auditCount.length}`);
