CREATE TABLE `AuditLog` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`patientName` text NOT NULL,
	`patientId` text,
	`requestText` text NOT NULL,
	`generatedDraft` text NOT NULL,
	`finalMessage` text NOT NULL,
	`actionType` text NOT NULL,
	`deliveryStatus` text DEFAULT 'pending' NOT NULL,
	`deliveredAt` integer,
	`reviewerId` text,
	`reviewNotes` text,
	`reviewedAt` integer,
	`ipAddress` text,
	`userAgent` text,
	`editHistory` text,
	`retryCount` integer DEFAULT 0 NOT NULL,
	`lastRetryAt` integer,
	`failureReason` text,
	`contentHash` text,
	`aiModelUsed` text,
	`tokensConsumed` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `AuditLog_userId_idx` ON `AuditLog` (`userId`);--> statement-breakpoint
CREATE INDEX `AuditLog_createdAt_idx` ON `AuditLog` (`createdAt`);--> statement-breakpoint
CREATE INDEX `AuditLog_actionType_idx` ON `AuditLog` (`actionType`);--> statement-breakpoint
CREATE INDEX `AuditLog_deliveryStatus_idx` ON `AuditLog` (`deliveryStatus`);--> statement-breakpoint
CREATE INDEX `AuditLog_patientId_idx` ON `AuditLog` (`patientId`);--> statement-breakpoint
CREATE INDEX `AuditLog_reviewerId_idx` ON `AuditLog` (`reviewerId`);--> statement-breakpoint
CREATE TABLE `DoctorSettings` (
	`id` text PRIMARY KEY NOT NULL,
	`doctorId` text NOT NULL,
	`communicationTone` text NOT NULL,
	`signOff` text NOT NULL,
	`maxWords` integer NOT NULL,
	`readingLevel` text,
	`specialtyFocus` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`doctorId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `DoctorSettings_doctorId_unique` ON `DoctorSettings` (`doctorId`);--> statement-breakpoint
CREATE INDEX `DoctorSettings_doctorId_idx` ON `DoctorSettings` (`doctorId`);--> statement-breakpoint
CREATE TABLE `MessageQueue` (
	`id` text PRIMARY KEY NOT NULL,
	`auditLogId` text NOT NULL,
	`recipientEmail` text,
	`recipientPhone` text,
	`messageContent` text NOT NULL,
	`deliveryMethod` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`scheduledFor` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`maxAttempts` integer DEFAULT 3 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`lastAttemptAt` integer,
	`nextRetryAt` integer,
	`errorLog` text,
	`deliveryConfirmed` integer DEFAULT false NOT NULL,
	`confirmedAt` integer,
	`webhookData` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`auditLogId`) REFERENCES `AuditLog`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `MessageQueue_auditLogId_unique` ON `MessageQueue` (`auditLogId`);--> statement-breakpoint
CREATE INDEX `MessageQueue_status_idx` ON `MessageQueue` (`status`);--> statement-breakpoint
CREATE INDEX `MessageQueue_scheduledFor_idx` ON `MessageQueue` (`scheduledFor`);--> statement-breakpoint
CREATE INDEX `MessageQueue_nextRetryAt_idx` ON `MessageQueue` (`nextRetryAt`);--> statement-breakpoint
CREATE INDEX `MessageQueue_priority_idx` ON `MessageQueue` (`priority`);--> statement-breakpoint
CREATE TABLE `PatientBrief` (
	`id` text PRIMARY KEY NOT NULL,
	`patientName` text NOT NULL,
	`briefText` text NOT NULL,
	`medicalHistory` text NOT NULL,
	`currentMedications` text NOT NULL,
	`allergies` text NOT NULL,
	`doctorNotes` text,
	`patientInquiry` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`doctorId` text NOT NULL,
	FOREIGN KEY (`doctorId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `PatientBrief_doctorId_idx` ON `PatientBrief` (`doctorId`);--> statement-breakpoint
CREATE TABLE `User` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `User_username_unique` ON `User` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `User_email_unique` ON `User` (`email`);