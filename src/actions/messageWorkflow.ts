import { setupDb, drizzleDb, auditLogs, messageQueue } from '@/db';
import type { User } from '@/db';
import { hasRole } from '@/lib/auth';
import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { env } from 'cloudflare:workers';

export interface MessageFinalizationRequest {
  auditLogId: string;
  finalMessage: string;
  recipientEmail?: string;
  recipientPhone?: string;
  deliveryMethod: 'email' | 'sms' | 'portal';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  scheduledFor?: Date;
}

export interface MessageReviewRequest {
  auditLogId: string;
  action: 'approve' | 'reject';
  reviewNotes?: string;
  finalMessage?: string; // In case reviewer edits before approving
}

export interface MessageWorkflowResponse {
  success: boolean;
  message?: string;
  error?: string;
  auditLog?: any;
  nextStep?: 'sent' | 'pending_review' | 'queued_for_delivery';
}

/**
 * Get the client IP address and user agent for audit logging
 */
function getClientInfo(request?: any): { ipAddress?: string; userAgent?: string } {
  if (!request) return {};
  
  return {
    ipAddress: request.headers?.['cf-connecting-ip'] || 
               request.headers?.['x-forwarded-for']?.split(',')[0] || 
               request.headers?.['x-real-ip'] ||
               '127.0.0.1',
    userAgent: request.headers?.['user-agent'] || 'Unknown'
  };
}

/**
 * Queue message for async delivery
 */
export async function queueMessageForDelivery(
  messageQueueId: string,
  user: User,
  environment: any = env
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get message queue entry
    const [queueEntry] = await drizzleDb
      .select()
      .from(messageQueue)
      .where(eq(messageQueue.id, messageQueueId))
      .limit(1);

    if (!queueEntry) {
      return { success: false, error: 'Message queue entry not found' };
    }

    // Only queue messages that are in 'queued' status
    if (queueEntry.status !== 'queued') {
      return { 
        success: false, 
        error: `Message not in queueable state: ${queueEntry.status}` 
      };
    }

    // Import queue producer
    const { createQueueProducer } = await import('@/lib/queue-producer');
    
    if (!environment.MESSAGE_QUEUE) {
      // Fallback to direct delivery if queue not available
      console.warn('[QUEUE_MESSAGE] Queue not available, skipping queue processing');
      return { success: true };
    }

    const queueProducer = createQueueProducer(environment);

    // Determine delivery method and enqueue appropriate job
    switch (queueEntry.deliveryMethod) {
      case 'email':
        if (!queueEntry.recipientEmail) {
          return { success: false, error: 'Email address required for email delivery' };
        }

        await queueProducer.enqueueEmail({
          messageId: queueEntry.id,
          recipient: queueEntry.recipientEmail,
          subject: `Medical Communication - ${new Date().toLocaleDateString()}`,
          content: queueEntry.messageContent,
          priority: queueEntry.priority as 'high' | 'normal' | 'low',
          metadata: {
            auditLogId: queueEntry.auditLogId,
            userId: user.id,
            userRole: user.role,
            queuedAt: new Date().toISOString()
          }
        });
        break;

      case 'sms':
        if (!queueEntry.recipientPhone) {
          return { success: false, error: 'Phone number required for SMS delivery' };
        }

        await queueProducer.enqueueSMS({
          messageId: queueEntry.id,
          recipient: queueEntry.recipientPhone,
          content: queueEntry.messageContent,
          priority: queueEntry.priority as 'high' | 'normal' | 'low',
          metadata: {
            auditLogId: queueEntry.auditLogId,
            userId: user.id,
            userRole: user.role,
            queuedAt: new Date().toISOString()
          }
        });
        break;

      case 'portal':
        // Portal delivery doesn't need external queue processing
        // Just mark as sent since it's internal
        await drizzleDb
          .update(messageQueue)
          .set({
            status: 'sent',
            updatedAt: new Date(),
            lastAttemptAt: new Date(),
            attempts: queueEntry.attempts + 1
          })
          .where(eq(messageQueue.id, queueEntry.id));
        break;

      default:
        return { 
          success: false, 
          error: `Unsupported delivery method: ${queueEntry.deliveryMethod}` 
        };
    }

    console.log('[QUEUE_MESSAGE] Message queued for delivery:', {
      messageId: queueEntry.id,
      deliveryMethod: queueEntry.deliveryMethod,
      priority: queueEntry.priority,
      userId: user.id
    });

    return { success: true };

  } catch (error) {
    console.error('[QUEUE_MESSAGE] Failed to queue message for delivery:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Generate content hash for data integrity verification
 */
function generateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Create edit history entry
 */
function createEditEntry(originalContent: string, newContent: string, userId: string): string {
  const editEntry = {
    timestamp: new Date().toISOString(),
    userId,
    changes: {
      wordCount: {
        before: originalContent.trim().split(/\s+/).length,
        after: newContent.trim().split(/\s+/).length
      },
      characterCount: {
        before: originalContent.length,
        after: newContent.length
      },
      contentHash: {
        before: generateContentHash(originalContent),
        after: generateContentHash(newContent)
      }
    }
  };
  
  return JSON.stringify(editEntry);
}

/**
 * Submit message for review (Staff role workflow)
 */
export async function submitMessageForReview(
  request: MessageFinalizationRequest,
  user: User,
  env: any,
  requestInfo?: any
): Promise<MessageWorkflowResponse> {
  try {
    await setupDb(env);
    
    // Only staff can submit for review (higher roles can send directly)
    if (!hasRole(user, 'staff')) {
      return { success: false, error: 'Insufficient permissions' };
    }
    
    const clientInfo = getClientInfo(requestInfo);
    
    // Get existing audit log
    const [existingLog] = await drizzleDb
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, request.auditLogId))
      .limit(1);
    
    if (!existingLog) {
      return { success: false, error: 'Message draft not found' };
    }
    
    if (existingLog.userId !== user.id) {
      return { success: false, error: 'You can only submit your own drafts' };
    }
    
    if (existingLog.actionType !== 'draft_generated' && existingLog.actionType !== 'draft_edited') {
      return { success: false, error: 'Message has already been submitted or processed' };
    }
    
    // Create edit history if message was modified
    let editHistory = existingLog.editHistory ? JSON.parse(existingLog.editHistory) : [];
    if (request.finalMessage !== existingLog.generatedDraft) {
      const editEntry = createEditEntry(existingLog.generatedDraft, request.finalMessage, user.id);
      editHistory.push(JSON.parse(editEntry));
    }
    
    // Update audit log for submission
    await drizzleDb
      .update(auditLogs)
      .set({
        finalMessage: request.finalMessage,
        actionType: 'submitted_for_review',
        deliveryStatus: 'pending_review',
        contentHash: generateContentHash(request.finalMessage),
        editHistory: JSON.stringify(editHistory),
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
        updatedAt: new Date()
      })
      .where(eq(auditLogs.id, request.auditLogId));
    
    // Create message queue entry
    await drizzleDb
      .insert(messageQueue)
      .values({
        auditLogId: request.auditLogId,
        recipientEmail: request.recipientEmail,
        recipientPhone: request.recipientPhone,
        messageContent: request.finalMessage,
        deliveryMethod: request.deliveryMethod,
        priority: request.priority || 'normal',
        scheduledFor: request.scheduledFor,
        status: 'pending_review'
      });
    
    // Get updated log for response
    const [updatedLog] = await drizzleDb
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, request.auditLogId))
      .limit(1);
    
    return {
      success: true,
      message: 'Message submitted for review successfully',
      auditLog: updatedLog,
      nextStep: 'pending_review'
    };
    
  } catch (error) {
    console.error('Error submitting message for review:', error);
    return { success: false, error: 'Failed to submit message for review' };
  }
}

/**
 * Review and approve/reject message (Reviewer/Doctor/Admin workflow)
 */
export async function reviewMessage(
  request: MessageReviewRequest,
  user: User,
  env: any,
  requestInfo?: any
): Promise<MessageWorkflowResponse> {
  try {
    await setupDb(env);
    
    // Only reviewers and above can review messages
    if (!hasRole(user, 'reviewer')) {
      return { success: false, error: 'Insufficient permissions to review messages' };
    }
    
    const clientInfo = getClientInfo(requestInfo);
    
    // Get existing audit log
    const [existingLog] = await drizzleDb
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, request.auditLogId))
      .limit(1);
    
    if (!existingLog) {
      return { success: false, error: 'Message not found' };
    }
    
    if (existingLog.actionType !== 'submitted_for_review') {
      return { success: false, error: 'Message is not in review status' };
    }
    
    // Get corresponding message queue entry
    const [queueEntry] = await drizzleDb
      .select()
      .from(messageQueue)
      .where(eq(messageQueue.auditLogId, request.auditLogId))
      .limit(1);
    
    // Create edit history if message was modified during review
    let editHistory = existingLog.editHistory ? JSON.parse(existingLog.editHistory) : [];
    const finalMessage = request.finalMessage || existingLog.finalMessage;
    
    if (request.finalMessage && request.finalMessage !== existingLog.finalMessage) {
      const editEntry = createEditEntry(existingLog.finalMessage, request.finalMessage, user.id);
      editHistory.push(JSON.parse(editEntry));
    }
    
    if (request.action === 'approve') {
      // Approve and queue for delivery
      await drizzleDb
        .update(auditLogs)
        .set({
          finalMessage,
          actionType: 'reviewed',
          deliveryStatus: 'approved',
          reviewerId: user.id,
          reviewNotes: request.reviewNotes,
          reviewedAt: new Date(),
          contentHash: generateContentHash(finalMessage),
          editHistory: JSON.stringify(editHistory),
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
          updatedAt: new Date()
        })
        .where(eq(auditLogs.id, request.auditLogId));
      
      // Update message queue
      if (queueEntry) {
        await drizzleDb
          .update(messageQueue)
          .set({
            messageContent: finalMessage,
            status: 'queued',
            updatedAt: new Date()
          })
          .where(eq(messageQueue.id, queueEntry.id));
        
        // Queue message for async delivery
        const queueResult = await queueMessageForDelivery(queueEntry.id, user);
        if (!queueResult.success) {
          console.warn('[REVIEW_MESSAGE] Failed to queue for delivery:', queueResult.error);
          // Continue anyway - the message is still approved and queued
        } else {
          console.log('[REVIEW_MESSAGE] Message successfully queued for async delivery:', queueEntry.id);
        }
      }
      
      const [updatedLog] = await drizzleDb
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.id, request.auditLogId))
        .limit(1);
      
      return {
        success: true,
        message: 'Message approved and queued for delivery',
        auditLog: updatedLog,
        nextStep: 'queued_for_delivery'
      };
      
    } else {
      // Reject message
      await drizzleDb
        .update(auditLogs)
        .set({
          actionType: 'reviewed',
          deliveryStatus: 'rejected',
          reviewerId: user.id,
          reviewNotes: request.reviewNotes,
          reviewedAt: new Date(),
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
          updatedAt: new Date()
        })
        .where(eq(auditLogs.id, request.auditLogId));
      
      // Update message queue
      if (queueEntry) {
        await drizzleDb
          .update(messageQueue)
          .set({
            status: 'cancelled',
            updatedAt: new Date()
          })
          .where(eq(messageQueue.id, queueEntry.id));
      }
      
      const [updatedLog] = await drizzleDb
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.id, request.auditLogId))
        .limit(1);
      
      return {
        success: true,
        message: 'Message rejected and returned to staff',
        auditLog: updatedLog,
        nextStep: 'sent' // Workflow ends here
      };
    }
    
  } catch (error) {
    console.error('Error reviewing message:', error);
    return { success: false, error: 'Failed to review message' };
  }
}

/**
 * Send message directly (Reviewer/Doctor/Admin workflow)
 */
export async function sendMessageDirectly(
  request: MessageFinalizationRequest,
  user: User,
  env: any,
  requestInfo?: any
): Promise<MessageWorkflowResponse> {
  try {
    await setupDb(env);
    
    // Only reviewers and above can send directly
    if (!hasRole(user, 'reviewer')) {
      return { success: false, error: 'Insufficient permissions to send messages directly' };
    }
    
    const clientInfo = getClientInfo(requestInfo);
    
    // Get existing audit log
    const [existingLog] = await drizzleDb
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, request.auditLogId))
      .limit(1);
    
    if (!existingLog) {
      return { success: false, error: 'Message draft not found' };
    }
    
    // Reviewers+ can send any draft, or their own drafts
    if (!hasRole(user, 'reviewer') && existingLog.userId !== user.id) {
      return { success: false, error: 'Insufficient permissions' };
    }
    
    if (!['draft_generated', 'draft_edited', 'submitted_for_review'].includes(existingLog.actionType)) {
      return { success: false, error: 'Message has already been processed' };
    }
    
    // Create edit history if message was modified
    let editHistory = existingLog.editHistory ? JSON.parse(existingLog.editHistory) : [];
    if (request.finalMessage !== existingLog.generatedDraft) {
      const editEntry = createEditEntry(
        existingLog.finalMessage || existingLog.generatedDraft, 
        request.finalMessage, 
        user.id
      );
      editHistory.push(JSON.parse(editEntry));
    }
    
    // Update audit log for direct send
    await drizzleDb
      .update(auditLogs)
      .set({
        finalMessage: request.finalMessage,
        actionType: 'sent',
        deliveryStatus: 'approved',
        reviewerId: user.id, // Reviewer who sent it
        reviewedAt: new Date(),
        contentHash: generateContentHash(request.finalMessage),
        editHistory: JSON.stringify(editHistory),
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
        updatedAt: new Date()
      })
      .where(eq(auditLogs.id, request.auditLogId));
    
    // Check if message queue entry exists
    const [existingQueue] = await drizzleDb
      .select()
      .from(messageQueue)
      .where(eq(messageQueue.auditLogId, request.auditLogId))
      .limit(1);
    
    let queueEntryId: string;
    
    if (existingQueue) {
      await drizzleDb
        .update(messageQueue)
        .set({
          recipientEmail: request.recipientEmail,
          recipientPhone: request.recipientPhone,
          messageContent: request.finalMessage,
          deliveryMethod: request.deliveryMethod,
          priority: request.priority || 'normal',
          scheduledFor: request.scheduledFor,
          status: 'queued',
          updatedAt: new Date()
        })
        .where(eq(messageQueue.id, existingQueue.id));
      queueEntryId = existingQueue.id;
    } else {
      const newQueueEntry = {
        auditLogId: request.auditLogId,
        recipientEmail: request.recipientEmail,
        recipientPhone: request.recipientPhone,
        messageContent: request.finalMessage,
        deliveryMethod: request.deliveryMethod,
        priority: request.priority || 'normal',
        scheduledFor: request.scheduledFor,
        status: 'queued'
      };
      
      const [inserted] = await drizzleDb
        .insert(messageQueue)
        .values(newQueueEntry)
        .returning({ id: messageQueue.id });
      
      queueEntryId = inserted.id;
    }
    
    // Queue message for async delivery, handling scheduled delivery
    if (request.scheduledFor && request.scheduledFor > new Date()) {
      // For scheduled delivery, use "send later" functionality
      const { createQueueProducer } = await import('@/lib/queue-producer');
      
      if (env.MESSAGE_QUEUE) {
        const queueProducer = createQueueProducer(env);
        
        if (request.deliveryMethod === 'email' && request.recipientEmail) {
          await queueProducer.enqueueSendLater({
            type: 'email_send',
            messageId: queueEntryId,
            recipient: request.recipientEmail,
            subject: `Medical Communication - ${new Date().toLocaleDateString()}`,
            content: request.finalMessage,
            priority: (request.priority || 'normal') as 'high' | 'normal' | 'low',
            metadata: {
              auditLogId: request.auditLogId,
              userId: user.id,
              userRole: user.role,
              scheduledSend: true
            }
          }, request.scheduledFor);
        } else if (request.deliveryMethod === 'sms' && request.recipientPhone) {
          await queueProducer.enqueueSendLater({
            type: 'sms_send',
            messageId: queueEntryId,
            recipient: request.recipientPhone,
            content: request.finalMessage,
            priority: (request.priority || 'normal') as 'high' | 'normal' | 'low',
            metadata: {
              auditLogId: request.auditLogId,
              userId: user.id,
              userRole: user.role,
              scheduledSend: true
            }
          }, request.scheduledFor);
        }
        
        console.log('[SEND_MESSAGE_DIRECTLY] Message scheduled for future delivery:', {
          messageId: queueEntryId,
          scheduledFor: request.scheduledFor,
          deliveryMethod: request.deliveryMethod
        });
      }
    } else {
      // Queue for immediate delivery
      const queueResult = await queueMessageForDelivery(queueEntryId, user, env);
      if (!queueResult.success) {
        console.warn('[SEND_MESSAGE_DIRECTLY] Failed to queue for delivery:', queueResult.error);
        // Continue anyway - the message is still approved and queued
      } else {
        console.log('[SEND_MESSAGE_DIRECTLY] Message successfully queued for immediate delivery:', queueEntryId);
      }
    }
    
    const [updatedLog] = await drizzleDb
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, request.auditLogId))
      .limit(1);
    
    return {
      success: true,
      message: request.scheduledFor && request.scheduledFor > new Date() 
        ? `Message scheduled for delivery at ${request.scheduledFor.toLocaleString()}`
        : 'Message sent and queued for delivery',
      auditLog: updatedLog,
      nextStep: 'queued_for_delivery'
    };
    
  } catch (error) {
    console.error('Error sending message directly:', error);
    return { success: false, error: 'Failed to send message' };
  }
}

/**
 * Get messages pending review for reviewers
 */
export async function getPendingReviewMessages(
  user: User,
  env: any
): Promise<{ success: boolean; messages?: any[]; error?: string }> {
  try {
    await setupDb(env);
    
    if (!hasRole(user, 'reviewer')) {
      return { success: false, error: 'Insufficient permissions' };
    }
    
    const pendingMessages = await drizzleDb
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        patientName: auditLogs.patientName,
        patientId: auditLogs.patientId,
        requestText: auditLogs.requestText,
        generatedDraft: auditLogs.generatedDraft,
        finalMessage: auditLogs.finalMessage,
        actionType: auditLogs.actionType,
        deliveryStatus: auditLogs.deliveryStatus,
        createdAt: auditLogs.createdAt,
        updatedAt: auditLogs.updatedAt,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.actionType, 'submitted_for_review'),
          eq(auditLogs.deliveryStatus, 'pending_review')
        )
      )
      .orderBy(auditLogs.createdAt); // FIFO queue
    
    return {
      success: true,
      messages: pendingMessages
    };
    
  } catch (error) {
    console.error('Error fetching pending review messages:', error);
    return { success: false, error: 'Failed to fetch pending messages' };
  }
}

/**
 * Update delivery status (for webhook callbacks)
 */
export async function updateDeliveryStatus(
  auditLogId: string,
  status: 'delivered' | 'failed',
  failureReason?: string,
  webhookData?: any,
  env?: any
): Promise<MessageWorkflowResponse> {
  try {
    if (env) await setupDb(env);
    
    const updateData: any = {
      deliveryStatus: status,
      updatedAt: new Date()
    };
    
    if (status === 'delivered') {
      updateData.deliveredAt = new Date();
      updateData.actionType = 'delivery_confirmed';
    } else {
      updateData.actionType = 'delivery_failed';
      updateData.failureReason = failureReason;
      updateData.lastRetryAt = new Date();
    }
    
    // Update audit log
    await drizzleDb
      .update(auditLogs)
      .set(updateData)
      .where(eq(auditLogs.id, auditLogId));
    
    // Get message queue entry
    const [queueEntry] = await drizzleDb
      .select()
      .from(messageQueue)
      .where(eq(messageQueue.auditLogId, auditLogId))
      .limit(1);
    
    if (queueEntry) {
      const queueUpdateData: any = {
        status: status,
        updatedAt: new Date()
      };
      
      if (status === 'delivered') {
        queueUpdateData.deliveryConfirmed = true;
        queueUpdateData.confirmedAt = new Date();
      } else {
        queueUpdateData.lastAttemptAt = new Date();
        
        const errorLog = queueEntry.errorLog ? JSON.parse(queueEntry.errorLog) : [];
        errorLog.push({
          timestamp: new Date().toISOString(),
          error: failureReason,
          attempt: queueEntry.attempts + 1
        });
        queueUpdateData.errorLog = JSON.stringify(errorLog);
        
        // Schedule retry if under max attempts
        if (queueEntry.attempts < queueEntry.maxAttempts - 1) {
          queueUpdateData.status = 'retry_scheduled';
          queueUpdateData.nextRetryAt = new Date(Date.now() + (15 * 60 * 1000)); // 15 minutes
        }
      }
      
      if (webhookData) {
        queueUpdateData.webhookData = JSON.stringify(webhookData);
      }
      
      await drizzleDb
        .update(messageQueue)
        .set(queueUpdateData)
        .where(eq(messageQueue.id, queueEntry.id));
    }
    
    const [updatedLog] = await drizzleDb
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, auditLogId))
      .limit(1);
    
    return {
      success: true,
      message: `Delivery status updated to ${status}`,
      auditLog: updatedLog
    };
    
  } catch (error) {
    console.error('Error updating delivery status:', error);
    return { success: false, error: 'Failed to update delivery status' };
  }
}
