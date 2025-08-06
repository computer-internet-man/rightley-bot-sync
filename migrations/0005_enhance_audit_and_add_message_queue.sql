-- CreateTable
CREATE TABLE "MessageQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditLogId" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "recipientPhone" TEXT,
    "messageContent" TEXT NOT NULL,
    "deliveryMethod" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "scheduledFor" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "lastAttemptAt" DATETIME,
    "nextRetryAt" DATETIME,
    "errorLog" TEXT,
    "deliveryConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" DATETIME,
    "webhookData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MessageQueue_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "AuditLog" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientId" TEXT,
    "requestText" TEXT NOT NULL,
    "generatedDraft" TEXT NOT NULL,
    "finalMessage" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
    "deliveredAt" DATETIME,
    "reviewerId" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" DATETIME,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "editHistory" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetryAt" DATETIME,
    "failureReason" TEXT,
    "contentHash" TEXT,
    "aiModelUsed" TEXT,
    "tokensConsumed" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("actionType", "createdAt", "deliveredAt", "deliveryStatus", "finalMessage", "generatedDraft", "id", "patientName", "requestText", "userId", "updatedAt") SELECT "actionType", "createdAt", "deliveredAt", "deliveryStatus", "finalMessage", "generatedDraft", "id", "patientName", "requestText", "userId", "createdAt" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_actionType_idx" ON "AuditLog"("actionType");
CREATE INDEX "AuditLog_deliveryStatus_idx" ON "AuditLog"("deliveryStatus");
CREATE INDEX "AuditLog_patientId_idx" ON "AuditLog"("patientId");
CREATE INDEX "AuditLog_reviewerId_idx" ON "AuditLog"("reviewerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "MessageQueue_auditLogId_key" ON "MessageQueue"("auditLogId");

-- CreateIndex
CREATE INDEX "MessageQueue_status_idx" ON "MessageQueue"("status");

-- CreateIndex
CREATE INDEX "MessageQueue_scheduledFor_idx" ON "MessageQueue"("scheduledFor");

-- CreateIndex
CREATE INDEX "MessageQueue_nextRetryAt_idx" ON "MessageQueue"("nextRetryAt");

-- CreateIndex
CREATE INDEX "MessageQueue_priority_idx" ON "MessageQueue"("priority");
