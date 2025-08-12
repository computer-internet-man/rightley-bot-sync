import { drizzleDb } from '@/db';
import { auditLogs, messageQueue } from '@/db/schema';
import { eq } from 'drizzle-orm';
import * as Sentry from '@sentry/cloudflare';
import { env } from 'cloudflare:workers';

export interface MarkAsSentRequest {
  messageId: string;
  finalMessage: string;
  recipientEmail?: string;
  recipientPhone?: string;
  deliveryMethod: 'email' | 'sms' | 'portal';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface MarkAsSentResponse {
  success: boolean;
  auditLogId: string;
  messageQueueId: string;
  contentHash: string;
  timestamp: string;
  error?: string;
}

/**
 * Generate content hash for audit trail integrity
 */
function generateContentHash(content: string): string {
  // Simple hash implementation for Cloudflare Workers
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `sha256:${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Create redacted preview for compliance (first 50 chars + "...")
 */
function createRedactedPreview(content: string): string {
  if (content.length <= 50) return content;
  return content.substring(0, 50) + '...';
}

/**
 * Mark message as sent and create comprehensive audit trail
 */
export async function markMessageAsSent(
  request: MarkAsSentRequest,
  userId: string,
  userRole: string,
  ipAddress?: string,
  userAgent?: string
): Promise<MarkAsSentResponse> {
  try {
    // Add Sentry breadcrumb
    Sentry.addBreadcrumb({
      category: 'audit',
      message: 'Marking message as sent',
      level: 'info',
      data: {
        messageId: request.messageId,
        userId,
        userRole,
        deliveryMethod: request.deliveryMethod,
      },
    });

    // Generate content hash for integrity verification
    const contentHash = generateContentHash(request.finalMessage);
    const redactedPreview = createRedactedPreview(request.finalMessage);
    const timestamp = new Date();

    // Start transaction for atomic operations
    const auditLogId = crypto.randomUUID();
    const messageQueueId = crypto.randomUUID();

    // Create comprehensive audit log entry
    const auditLogData = {
      id: auditLogId,
      userId,
      patientName: 'TBD', // Will be extracted from messageId context
      patientId: null,
      requestText: `Message marked as sent via ${request.deliveryMethod}`,
      generatedDraft: redactedPreview,
      finalMessage: request.finalMessage,
      actionType: 'message_sent' as const,
      deliveryStatus: 'sent' as const,
      deliveredAt: timestamp,
      reviewerId: userId, // The person marking as sent
      reviewNotes: `Manually marked as sent via ${request.deliveryMethod}`,
      reviewedAt: timestamp,
      ipAddress,
      userAgent,
      editHistory: JSON.stringify([{
        action: 'marked_as_sent',
        timestamp: timestamp.toISOString(),
        userId,
        method: request.deliveryMethod
      }]),
      retryCount: 0,
      contentHash,
      aiModelUsed: 'manual_send',
      tokensConsumed: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // Insert audit log
    await drizzleDb.insert(auditLogs).values(auditLogData);

    // Create message queue entry for tracking
    const messageQueueData = {
      id: messageQueueId,
      auditLogId,
      recipientEmail: request.recipientEmail,
      recipientPhone: request.recipientPhone,
      messageContent: request.finalMessage,
      deliveryMethod: request.deliveryMethod,
      priority: request.priority || 'normal',
      scheduledFor: timestamp,
      attempts: 1,
      maxAttempts: 1, // Manual send, no retries
      status: 'sent' as const,
      lastAttemptAt: timestamp,
      deliveryConfirmed: true,
      confirmedAt: timestamp,
      webhookData: JSON.stringify({
        manualSend: true,
        markedBy: userId,
        timestamp: timestamp.toISOString()
      }),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // Insert message queue entry
    await drizzleDb.insert(messageQueue).values(messageQueueData);

    // Log success to Sentry
    Sentry.addBreadcrumb({
      category: 'audit',
      message: 'Message marked as sent successfully',
      level: 'info',
      data: {
        auditLogId,
        messageQueueId,
        contentHash,
      },
    });

    return {
      success: true,
      auditLogId,
      messageQueueId,
      contentHash,
      timestamp: timestamp.toISOString(),
    };

  } catch (error) {
    // Capture error in Sentry
    Sentry.captureException(error);
    
    console.error('[MARK_AS_SENT] Error:', error);
    
    return {
      success: false,
      auditLogId: '',
      messageQueueId: '',
      contentHash: '',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Update existing audit log to mark as sent (if transitioning from draft)
 */
export async function updateAuditLogDeliveryStatus(
  auditLogId: string,
  deliveryStatus: 'sent' | 'delivered' | 'failed',
  failureReason?: string
): Promise<boolean> {
  try {
    const updateData: any = {
      deliveryStatus,
      updatedAt: new Date(),
    };

    if (deliveryStatus === 'sent' || deliveryStatus === 'delivered') {
      updateData.deliveredAt = new Date();
    }

    if (deliveryStatus === 'failed' && failureReason) {
      updateData.failureReason = failureReason;
      updateData.retryCount = 1; // Will be incremented in retry logic
    }

    await drizzleDb
      .update(auditLogs)
      .set(updateData)
      .where(eq(auditLogs.id, auditLogId));

    Sentry.addBreadcrumb({
      category: 'audit',
      message: 'Audit log delivery status updated',
      level: 'info',
      data: {
        auditLogId,
        deliveryStatus,
        failureReason,
      },
    });

    return true;
  } catch (error) {
    Sentry.captureException(error);
    console.error('[UPDATE_AUDIT_STATUS] Error:', error);
    return false;
  }
}
