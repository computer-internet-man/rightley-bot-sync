-- Add missing tables for AI Concierge MVP

-- Add email and role columns to User table if they don't exist
-- Note: SQLite doesn't support IF NOT EXISTS for columns, so we'll check if they exist first
ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "role" TEXT;

-- Create unique index for email
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateTable PatientBrief
CREATE TABLE "PatientBrief" (
    "patientId" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "dob" DATETIME NOT NULL,
    "sexAtBirth" TEXT NOT NULL,
    "problemList" TEXT NOT NULL,
    "activeMeds" TEXT NOT NULL,
    "allergies" TEXT NOT NULL,
    "lastVisit" DATETIME,
    "preferences" TEXT,
    "summaryBlob" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable DoctorSettings
CREATE TABLE "DoctorSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "tone" TEXT NOT NULL,
    "signOff" TEXT NOT NULL,
    "maxWords" INTEGER NOT NULL,
    "readingLevel" TEXT,
    "disclaimer" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable AuditLog
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "requestText" TEXT NOT NULL,
    "draftAi" TEXT NOT NULL,
    "finalText" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "providerMsgId" TEXT,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
    "deliveredAt" DATETIME,
    CONSTRAINT "AuditLog_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
