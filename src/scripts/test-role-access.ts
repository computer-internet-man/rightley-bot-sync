import { db, setupDb } from '@/db';
import { PatientService } from '@/lib/services/patientService';
import { DoctorService } from '@/lib/services/doctorService';
import { AuditService } from '@/lib/services/auditService';
import { env } from 'cloudflare:workers';

// Test role-based access control for services
export async function testRoleAccess() {
  console.log('🧪 Testing Role-Based Access Control for Services');
  console.log('================================================================\n');

  try {
    // Setup database connection
    await setupDb(env);

    // Get test users with different roles
    const users = await db.user.findMany({
      orderBy: { email: 'asc' }
    });

    const staffUser = users.find(u => u.role === 'staff');
    const reviewerUser = users.find(u => u.role === 'reviewer');
    const doctorUser = users.find(u => u.role === 'doctor');
    const auditorUser = users.find(u => u.role === 'auditor');
    const adminUser = users.find(u => u.role === 'admin');

    if (!staffUser || !doctorUser || !auditorUser || !adminUser) {
      throw new Error('Missing required test users. Please run seed script first.');
    }

    console.log('📝 Test 1: Patient Brief Access Control');
    console.log('----------------------------------------');

    // Test staff access to patient briefs
    try {
      const staffBriefs = await PatientService.getPatientBriefs(staffUser);
      console.log(`✅ Staff can access patient briefs: ${staffBriefs.length} briefs`);
    } catch (error) {
      console.log(`❌ Staff patient brief access failed: ${error.message}`);
    }

    // Test doctor access to patient briefs
    try {
      const doctorBriefs = await PatientService.getPatientBriefs(doctorUser);
      console.log(`✅ Doctor can access patient briefs: ${doctorBriefs.length} briefs`);
    } catch (error) {
      console.log(`❌ Doctor patient brief access failed: ${error.message}`);
    }

    // Test staff trying to create patient brief (should fail)
    try {
      await PatientService.createPatientBrief({
        patientName: 'Test Patient',
        briefText: 'Test brief',
        doctorId: doctorUser.id
      }, staffUser);
      console.log(`❌ Staff should not be able to create patient briefs`);
    } catch (error) {
      console.log(`✅ Staff correctly denied patient brief creation: ${error.message}`);
    }

    // Test doctor creating patient brief (should succeed)
    try {
      const newBrief = await PatientService.createPatientBrief({
        patientName: 'Test Patient from Script',
        briefText: 'This is a test patient brief created by the test script',
        medicalHistory: 'No significant medical history',
        currentMedications: 'None',
        allergies: 'NKDA',
        doctorNotes: 'Test notes',
        doctorId: doctorUser.id
      }, doctorUser);
      console.log(`✅ Doctor successfully created patient brief: ${newBrief.id}`);
    } catch (error) {
      console.log(`❌ Doctor patient brief creation failed: ${error.message}`);
    }

    console.log('\n📝 Test 2: Doctor Settings Access Control');
    console.log('------------------------------------------');

    // Test doctor accessing their own settings
    try {
      const doctorSettings = await DoctorService.getDoctorSettings(doctorUser.id, doctorUser);
      console.log(`✅ Doctor can access own settings: ${doctorSettings ? 'Found' : 'Not found'}`);
    } catch (error) {
      console.log(`❌ Doctor settings access failed: ${error.message}`);
    }

    // Test staff trying to access doctor settings (should fail)
    try {
      await DoctorService.getDoctorSettings(doctorUser.id, staffUser);
      console.log(`❌ Staff should not access doctor settings`);
    } catch (error) {
      console.log(`✅ Staff correctly denied doctor settings access: ${error.message}`);
    }

    // Test admin accessing doctor settings (should succeed)
    try {
      const adminAccessSettings = await DoctorService.getDoctorSettings(doctorUser.id, adminUser);
      console.log(`✅ Admin can access doctor settings: ${adminAccessSettings ? 'Found' : 'Not found'}`);
    } catch (error) {
      console.log(`❌ Admin doctor settings access failed: ${error.message}`);
    }

    // Test doctor updating their settings
    try {
      const updatedSettings = await DoctorService.upsertDoctorSettings(doctorUser.id, {
        communicationTone: 'professional',
        signOff: 'Best regards, Dr. Test',
        maxWords: 200,
        readingLevel: 'middle',
        specialtyFocus: 'general'
      }, doctorUser);
      console.log(`✅ Doctor successfully updated settings: ${updatedSettings.id}`);
    } catch (error) {
      console.log(`❌ Doctor settings update failed: ${error.message}`);
    }

    console.log('\n📝 Test 3: Audit Log Access Control');
    console.log('------------------------------------');

    // Test staff accessing their own audit logs
    try {
      const staffLogs = await AuditService.getAuditLogs({}, { page: 1, limit: 10 }, staffUser);
      console.log(`✅ Staff can access own audit logs: ${staffLogs.logs.length} logs`);
    } catch (error) {
      console.log(`❌ Staff audit log access failed: ${error.message}`);
    }

    // Test auditor accessing all audit logs
    try {
      const auditorLogs = await AuditService.getAuditLogs({}, { page: 1, limit: 10 }, auditorUser);
      console.log(`✅ Auditor can access all audit logs: ${auditorLogs.logs.length} logs`);
    } catch (error) {
      console.log(`❌ Auditor audit log access failed: ${error.message}`);
    }

    // Test staff trying to access audit statistics (should fail)
    try {
      await AuditService.getAuditStats(undefined, staffUser);
      console.log(`❌ Staff should not access audit statistics`);
    } catch (error) {
      console.log(`✅ Staff correctly denied audit statistics access: ${error.message}`);
    }

    // Test auditor accessing audit statistics (should succeed)
    try {
      const auditStats = await AuditService.getAuditStats(undefined, auditorUser);
      console.log(`✅ Auditor can access audit statistics: ${auditStats.totalLogs} total logs, ${auditStats.successRate}% success rate`);
    } catch (error) {
      console.log(`❌ Auditor audit statistics access failed: ${error.message}`);
    }

    // Test creating audit log
    try {
      const newAuditLog = await AuditService.createAuditLog({
        patientName: 'Test Patient',
        requestText: 'Patient inquiry about medication',
        generatedDraft: 'AI generated response',
        finalMessage: 'Final message sent',
        actionType: 'patient_communication',
        deliveryStatus: 'delivered'
      }, staffUser);
      console.log(`✅ Staff successfully created audit log: ${newAuditLog.id}`);
    } catch (error) {
      console.log(`❌ Staff audit log creation failed: ${error.message}`);
    }

    console.log('\n📝 Test 4: Cross-Role Access Attempts');
    console.log('--------------------------------------');

    // Test reviewer trying to access audit statistics (should fail)
    if (reviewerUser) {
      try {
        await AuditService.getAuditStats(undefined, reviewerUser);
        console.log(`❌ Reviewer should not access audit statistics`);
      } catch (error) {
        console.log(`✅ Reviewer correctly denied audit statistics: ${error.message}`);
      }
    }

    // Test admin accessing everything (should succeed)
    try {
      const [adminBriefs, adminStats, adminDoctors] = await Promise.all([
        PatientService.getPatientBriefs(adminUser),
        AuditService.getAuditStats(undefined, adminUser),
        DoctorService.getAllDoctors(adminUser)
      ]);
      console.log(`✅ Admin has full access: ${adminBriefs.length} briefs, ${adminStats.totalLogs} audit logs, ${adminDoctors.length} doctors`);
    } catch (error) {
      console.log(`❌ Admin full access failed: ${error.message}`);
    }

    console.log('\n🎉 Role-Based Access Control testing completed!');
    console.log(`📊 Total users tested: ${users.length}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (import.meta.main) {
  testRoleAccess();
}
