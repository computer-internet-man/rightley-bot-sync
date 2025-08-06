-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "requestText" TEXT NOT NULL,
    "generatedDraft" TEXT NOT NULL,
    "finalMessage" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Clear existing data since we need to restructure with foreign keys  
-- INSERT INTO "new_AuditLog" ("deliveredAt", "deliveryStatus", "id", "requestText") SELECT "deliveredAt", "deliveryStatus", "id", "requestText" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE TABLE "new_DoctorSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "doctorId" TEXT NOT NULL,
    "communicationTone" TEXT NOT NULL,
    "signOff" TEXT NOT NULL,
    "maxWords" INTEGER NOT NULL,
    "readingLevel" TEXT,
    "specialtyFocus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DoctorSettings_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Clear existing data since we need to restructure with foreign keys
-- INSERT INTO "new_DoctorSettings" ("id", "maxWords", "readingLevel", "signOff", "updatedAt") SELECT "id", "maxWords", "readingLevel", "signOff", "updatedAt" FROM "DoctorSettings";
DROP TABLE "DoctorSettings";
ALTER TABLE "new_DoctorSettings" RENAME TO "DoctorSettings";
CREATE UNIQUE INDEX "DoctorSettings_doctorId_key" ON "DoctorSettings"("doctorId");
CREATE INDEX "DoctorSettings_doctorId_idx" ON "DoctorSettings"("doctorId");
CREATE TABLE "new_PatientBrief" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientName" TEXT NOT NULL,
    "briefText" TEXT NOT NULL,
    "medicalHistory" TEXT NOT NULL,
    "currentMedications" TEXT NOT NULL,
    "allergies" TEXT NOT NULL,
    "doctorNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "doctorId" TEXT NOT NULL,
    CONSTRAINT "PatientBrief_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Clear existing data since we need to restructure with foreign keys
-- INSERT INTO "new_PatientBrief" ("allergies", "updatedAt") SELECT "allergies", "updatedAt" FROM "PatientBrief";
DROP TABLE "PatientBrief";
ALTER TABLE "new_PatientBrief" RENAME TO "PatientBrief";
CREATE INDEX "PatientBrief_doctorId_idx" ON "PatientBrief"("doctorId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "role", "username") SELECT "createdAt", "email", "id", "role", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
