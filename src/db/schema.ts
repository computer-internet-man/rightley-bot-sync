import { sql } from 'drizzle-orm';
import { text, integer, sqliteTable, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('User', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  role: text('role').notNull(), // staff, reviewer, doctor, admin, auditor
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$default(() => new Date()),
});

export const patientBriefs = sqliteTable('PatientBrief', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  patientName: text('patientName').notNull(),
  briefText: text('briefText').notNull(),
  medicalHistory: text('medicalHistory').notNull(),
  currentMedications: text('currentMedications').notNull(),
  allergies: text('allergies').notNull(),
  doctorNotes: text('doctorNotes'),
  patientInquiry: text('patientInquiry'), // Store patient inquiry text from draft workflow
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$default(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().$default(() => new Date()),
  doctorId: text('doctorId').notNull().references(() => users.id),
}, (table) => ({
  doctorIdIdx: index('PatientBrief_doctorId_idx').on(table.doctorId),
}));

export const doctorSettings = sqliteTable('DoctorSettings', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  doctorId: text('doctorId').notNull().unique().references(() => users.id),
  communicationTone: text('communicationTone').notNull(),
  signOff: text('signOff').notNull(),
  maxWords: integer('maxWords').notNull(),
  readingLevel: text('readingLevel'),
  specialtyFocus: text('specialtyFocus'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$default(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().$default(() => new Date()),
}, (table) => ({
  doctorIdIdx: index('DoctorSettings_doctorId_idx').on(table.doctorId),
}));

export const auditLogs = sqliteTable('AuditLog', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  userId: text('userId').notNull().references(() => users.id),
  patientName: text('patientName').notNull(),
  patientId: text('patientId'), // Reference to patient brief
  requestText: text('requestText').notNull(),
  generatedDraft: text('generatedDraft').notNull(),
  finalMessage: text('finalMessage').notNull(),
  actionType: text('actionType').notNull(), // draft_generated, draft_edited, submitted_for_review, reviewed, sent, delivery_confirmed, delivery_failed
  deliveryStatus: text('deliveryStatus').notNull().default('pending'), // pending, sent, delivered, failed, retry_scheduled
  deliveredAt: integer('deliveredAt', { mode: 'timestamp' }),
  reviewerId: text('reviewerId'), // ID of reviewer who approved/rejected
  reviewNotes: text('reviewNotes'), // Notes from reviewer
  reviewedAt: integer('reviewedAt', { mode: 'timestamp' }),
  ipAddress: text('ipAddress'), // For security logging
  userAgent: text('userAgent'), // For security logging
  editHistory: text('editHistory'), // JSON array of edits with timestamps
  retryCount: integer('retryCount').notNull().default(0),
  lastRetryAt: integer('lastRetryAt', { mode: 'timestamp' }),
  failureReason: text('failureReason'), // Error message for failed deliveries
  contentHash: text('contentHash'), // For data integrity verification
  aiModelUsed: text('aiModelUsed'), // OpenAI model version used
  tokensConsumed: integer('tokensConsumed'), // API usage tracking
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$default(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().$default(() => new Date()),
}, (table) => ({
  userIdIdx: index('AuditLog_userId_idx').on(table.userId),
  createdAtIdx: index('AuditLog_createdAt_idx').on(table.createdAt),
  actionTypeIdx: index('AuditLog_actionType_idx').on(table.actionType),
  deliveryStatusIdx: index('AuditLog_deliveryStatus_idx').on(table.deliveryStatus),
  patientIdIdx: index('AuditLog_patientId_idx').on(table.patientId),
  reviewerIdIdx: index('AuditLog_reviewerId_idx').on(table.reviewerId),
}));

export const messageQueue = sqliteTable('MessageQueue', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()),
  auditLogId: text('auditLogId').notNull().unique().references(() => auditLogs.id),
  recipientEmail: text('recipientEmail'),
  recipientPhone: text('recipientPhone'),
  messageContent: text('messageContent').notNull(),
  deliveryMethod: text('deliveryMethod').notNull(), // email, sms, portal
  priority: text('priority').notNull().default('normal'), // low, normal, high, urgent
  scheduledFor: integer('scheduledFor', { mode: 'timestamp' }),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('maxAttempts').notNull().default(3),
  status: text('status').notNull().default('queued'), // queued, processing, sent, delivered, failed, cancelled
  lastAttemptAt: integer('lastAttemptAt', { mode: 'timestamp' }),
  nextRetryAt: integer('nextRetryAt', { mode: 'timestamp' }),
  errorLog: text('errorLog'), // JSON array of error messages
  deliveryConfirmed: integer('deliveryConfirmed', { mode: 'boolean' }).notNull().default(false),
  confirmedAt: integer('confirmedAt', { mode: 'timestamp' }),
  webhookData: text('webhookData'), // Store webhook response data
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$default(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().$default(() => new Date()),
}, (table) => ({
  statusIdx: index('MessageQueue_status_idx').on(table.status),
  scheduledForIdx: index('MessageQueue_scheduledFor_idx').on(table.scheduledFor),
  nextRetryAtIdx: index('MessageQueue_nextRetryAt_idx').on(table.nextRetryAt),
  priorityIdx: index('MessageQueue_priority_idx').on(table.priority),
}));

// Export types for use in application code
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type PatientBrief = typeof patientBriefs.$inferSelect;
export type NewPatientBrief = typeof patientBriefs.$inferInsert;
export type DoctorSettings = typeof doctorSettings.$inferSelect;
export type NewDoctorSettings = typeof doctorSettings.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type MessageQueue = typeof messageQueue.$inferSelect;
export type NewMessageQueue = typeof messageQueue.$inferInsert;
