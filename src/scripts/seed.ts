import { defineScript } from "rwsdk/worker";
import { db, setupDb } from "@/db";
import { env } from "cloudflare:workers";

export default defineScript(async () => {
  await setupDb(env);

  // Clear existing data
  try {
    await db.auditLog.deleteMany();
    await db.patientBrief.deleteMany();
    await db.doctorSettings.deleteMany();
    await db.user.deleteMany();
  } catch (error) {
    // Tables might not exist yet, which is fine
    console.log("Note: Some tables might not exist yet, continuing with seed...");
  }

  // Create test users with different roles
  const users = [
    { id: "user-staff-1", username: "staff_alice", email: "alice@clinic.com", role: "staff" },
    { id: "user-staff-2", username: "staff_bob", email: "bob@clinic.com", role: "staff" },
    { id: "user-reviewer-1", username: "reviewer_carol", email: "carol@clinic.com", role: "reviewer" },
    { id: "user-doctor-1", username: "dr_smith", email: "smith@clinic.com", role: "doctor" },
    { id: "user-admin-1", username: "admin_jane", email: "jane@clinic.com", role: "admin" },
    { id: "user-auditor-1", username: "auditor_mike", email: "mike@clinic.com", role: "auditor" },
  ];

  for (const user of users) {
    await db.user.create({ data: user });
  }

  // Create sample patient briefs (linking to doctor)
  const doctorId = "user-doctor-1";
  
  const patientBriefs = [
    {
      patientName: "John Doe",
      briefText: "48-year-old male patient with diabetes and hypertension, well-controlled",
      medicalHistory: "Type 2 Diabetes (diagnosed 2018), Hypertension (diagnosed 2020)",
      currentMedications: "Metformin 500mg BID, Lisinopril 10mg daily",
      allergies: "Penicillin",
      doctorNotes: "Patient is compliant with medications. Last A1C 6.8%. BP stable on current regimen. Prefers morning appointments.",
      doctorId,
    },
    {
      patientName: "Sarah Johnson",
      briefText: "33-year-old female with mild persistent asthma and anxiety",
      medicalHistory: "Asthma (diagnosed childhood), Generalized Anxiety Disorder (diagnosed 2022)",
      currentMedications: "Albuterol inhaler PRN, Sertraline 50mg daily",
      allergies: "NKDA",
      doctorNotes: "Symptoms well-controlled on current medications. Prefers telehealth appointments.",
      doctorId,
    },
    {
      patientName: "Robert Wilson",
      briefText: "58-year-old male with COPD and depression",
      medicalHistory: "COPD (diagnosed 2019), Major Depressive Disorder (diagnosed 2021)",
      currentMedications: "Spiriva 18mcg daily, Bupropion 150mg BID",
      allergies: "Sulfa drugs",
      doctorNotes: "Recent spirometry shows stable lung function. Spanish interpreter needed for appointments.",
      doctorId,
    },
  ];

  for (const brief of patientBriefs) {
    await db.patientBrief.create({ data: brief });
  }

  // Create doctor settings
  await db.doctorSettings.create({
    data: {
      doctorId,
      communicationTone: "professional and caring",
      signOff: "Best regards,\nDr. Smith\nFamily Medicine Clinic",
      maxWords: 150,
      readingLevel: "8th grade",
      specialtyFocus: "Family Medicine",
    },
  });

  // Create sample audit log entries
  const auditLogs = [
    {
      userId: "user-staff-1",
      patientName: "John Doe",
      requestText: "Patient asking about diabetes medication refill",
      generatedDraft: "Hello Mr. Doe, I can help you with your medication refill. Your Metformin prescription is due for renewal.",
      finalMessage: "Hello Mr. Doe, I can help you with your medication refill. Your Metformin prescription is due for renewal. Please call us at (555) 123-4567 to schedule a brief appointment.",
      actionType: "medication_inquiry",
      deliveryStatus: "delivered",
      deliveredAt: new Date("2024-08-01T10:30:00Z"),
    },
    {
      userId: "user-staff-2", 
      patientName: "Sarah Johnson",
      requestText: "Patient reporting anxiety symptoms worsening",
      generatedDraft: "Hi Sarah, I understand you're experiencing increased anxiety. This is something we should address promptly.",
      finalMessage: "Hi Sarah, I understand you're experiencing increased anxiety. This is something we should address promptly. Dr. Smith would like to see you this week. Please call to schedule an appointment.",
      actionType: "symptom_report",
      deliveryStatus: "delivered",
      deliveredAt: new Date("2024-08-02T14:15:00Z"),
    },
    {
      userId: "user-staff-1",
      patientName: "Robert Wilson", 
      requestText: "Patient asking about breathing exercise recommendations",
      generatedDraft: "Hola Sr. Wilson, tengo algunas recomendaciones de ejercicios de respiración que pueden ayudar con su COPD.",
      finalMessage: "Hola Sr. Wilson, tengo algunas recomendaciones de ejercicios de respiración que pueden ayudar con su COPD. Vamos a programar una cita para mostrarle las técnicas correctas.",
      actionType: "education_request",
      deliveryStatus: "pending",
    },
  ];

  for (const log of auditLogs) {
    await db.auditLog.create({ data: log });
  }

  console.log("🌱 Finished seeding with AI Concierge data");
  console.log("✅ Created 6 test users (staff, reviewer, doctor, admin, auditor)");
  console.log("✅ Created 3 sample patient briefs"); 
  console.log("✅ Created doctor settings");
  console.log("✅ Created 3 sample audit log entries");
});
