import Database from "better-sqlite3";

const db = new Database("./dev.db");

console.log("🌱 Starting seed process...");

// Clear existing data
db.exec(`
  DELETE FROM AuditLog;
  DELETE FROM PatientBrief;
  DELETE FROM DoctorSettings;
  DELETE FROM User;
`);

// Create test users with different roles
const users = [
  { id: "user-staff-1", username: "staff_alice", email: "alice@clinic.com", role: "staff" },
  { id: "user-staff-2", username: "staff_bob", email: "bob@clinic.com", role: "staff" },
  { id: "user-reviewer-1", username: "reviewer_carol", email: "carol@clinic.com", role: "reviewer" },
  { id: "user-doctor-1", username: "dr_smith", email: "smith@clinic.com", role: "doctor" },
  { id: "user-admin-1", username: "admin_jane", email: "jane@clinic.com", role: "admin" },
  { id: "user-auditor-1", username: "auditor_mike", email: "mike@clinic.com", role: "auditor" },
];

const insertUser = db.prepare(`
  INSERT INTO User (id, username, email, role, createdAt) 
  VALUES (?, ?, ?, ?, datetime('now'))
`);

for (const user of users) {
  insertUser.run(user.id, user.username, user.email, user.role);
}

// Create sample patients
const patients = [
  {
    patientId: "patient-001",
    fullName: "John Doe",
    dob: "1985-03-15T00:00:00.000Z",
    sexAtBirth: "Male",
    problemList: "Hypertension, Type 2 Diabetes",
    activeMeds: "Metformin 500mg BID, Lisinopril 10mg daily",
    allergies: "Penicillin",
    lastVisit: "2024-07-15T00:00:00.000Z",
    preferences: "Prefers morning appointments",
    summaryBlob: "48-year-old male with well-controlled diabetes and hypertension. Last A1C 6.8%. BP stable on current regimen.",
  },
  {
    patientId: "patient-002", 
    fullName: "Sarah Johnson",
    dob: "1990-11-22T00:00:00.000Z",
    sexAtBirth: "Female",
    problemList: "Asthma, Anxiety",
    activeMeds: "Albuterol inhaler PRN, Sertraline 50mg daily",
    allergies: "NKDA",
    lastVisit: "2024-07-28T00:00:00.000Z",
    preferences: "Telehealth preferred",
    summaryBlob: "33-year-old female with mild persistent asthma and generalized anxiety disorder. Symptoms well-controlled on current medications.",
  },
  {
    patientId: "patient-003",
    fullName: "Robert Wilson", 
    dob: "1965-08-10T00:00:00.000Z",
    sexAtBirth: "Male",
    problemList: "COPD, Depression",
    activeMeds: "Spiriva 18mcg daily, Bupropion 150mg BID",
    allergies: "Sulfa drugs",
    lastVisit: "2024-06-30T00:00:00.000Z",
    preferences: "Spanish interpreter needed",
    summaryBlob: "58-year-old male with moderate COPD and major depressive disorder. Recent spirometry shows stable lung function.",
  },
];

const insertPatient = db.prepare(`
  INSERT INTO PatientBrief (patientId, fullName, dob, sexAtBirth, problemList, activeMeds, allergies, lastVisit, preferences, summaryBlob, updatedAt) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);

for (const patient of patients) {
  insertPatient.run(
    patient.patientId,
    patient.fullName,
    patient.dob,
    patient.sexAtBirth,
    patient.problemList,
    patient.activeMeds,
    patient.allergies,
    patient.lastVisit,
    patient.preferences,
    patient.summaryBlob
  );
}

// Create doctor settings
const insertDoctorSettings = db.prepare(`
  INSERT INTO DoctorSettings (id, tone, signOff, maxWords, readingLevel, disclaimer, updatedAt) 
  VALUES (1, ?, ?, ?, ?, ?, datetime('now'))
`);

insertDoctorSettings.run(
  "professional and caring",
  "Best regards,\\nDr. Smith\\nFamily Medicine Clinic",
  150,
  "8th grade",
  "This message is for informational purposes only. Please contact the clinic if you have urgent concerns."
);

db.close();

console.log("🌱 Finished seeding with AI Concierge data");
console.log("✅ Created 6 test users (staff, reviewer, doctor, admin, auditor)");
console.log("✅ Created 3 sample patients"); 
console.log("✅ Created doctor settings");
