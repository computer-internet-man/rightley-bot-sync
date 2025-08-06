import { setupDb, db } from '@/db';
import type { User } from '@/db';
import { hasRole } from '@/lib/auth';
import crypto from 'crypto';

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
    const existingLog = await db.auditLog.findUnique({
      where: { id: request.auditLogId },
      include: { user: true }
    });
    
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
    const updatedLog = await db.auditLog.update({
      where: { id: request.auditLogId },
      data: {
        finalMessage: request.finalMessage,
        actionType: 'submitted_for_review',
        deliveryStatus: 'pending_review',
        contentHash: generateContentHash(request.finalMessage),
        editHistory: JSON.stringify(editHistory),
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
        updatedAt: new Date()
      }
    });
    
    // Create message queue entry
    await db.messageQueue.create({
      data: {
        auditLogId: request.auditLogId,
        recipientEmail: request.recipientEmail,
        recipientPhone: request.recipientPhone,
        messageContent: request.finalMessage,
        deliveryMethod: request.deliveryMethod,
        priority: request.priority || 'normal',
        scheduledFor: request.scheduledFor,
        status: 'pending_review'
      }
    });
    
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
    
    // Get existing audit log and message queue
    const existingLog = await db.auditLog.findUnique({
      where: { id: request.auditLogId },
      include: { 
        user: true,
        messageQueue: true
      }
    });
    
    if (!existingLog) {
      return { success: false, error: 'Message not found' };
    }
    
    if (existingLog.actionType !== 'submitted_for_review') {
      return { success: false, error: 'Message is not in review status' };
    }
    
    // Create edit history if message was modified during review
    let editHistory = existingLog.editHistory ? JSON.parse(existingLog.editHistory) : [];
    const finalMessage = request.finalMessage || existingLog.finalMessage;
    
    if (request.finalMessage && request.finalMessage !== existingLog.finalMessage) {
      const editEntry = createEditEntry(existingLog.finalMessage, request.finalMessage, user.id);
      editHistory.push(JSON.parse(editEntry));
    }
    
    if (request.action === 'approve') {
      // Approve and queue for delivery
      const updatedLog = await db.auditLog.update({
        where: { id: request.auditLogId },
        data: {
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
        }
      });
      
      // Update message queue
      if (existingLog.messageQueue) {
        await db.messageQueue.update({
          where: { id: existingLog.messageQueue.id },
          data: {
            messageContent: finalMessage,
            status: 'queued',
            updatedAt: new Date()
          }
        });
      }
      
      return {
        success: true,
        message: 'Message approved and queued for delivery',
        auditLog: updatedLog,
        nextStep: 'queued_for_delivery'
      };
      
    } else {
      // Reject message
      const updatedLog = await db.auditLog.update({
        where: { id: request.auditLogId },
        data: {
          actionType: 'reviewed',
          deliveryStatus: 'rejected',
          reviewerId: user.id,
          reviewNotes: request.reviewNotes,
          reviewedAt: new Date(),
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
          updatedAt: new Date()
        }
      });
      
      // Update message queue
      if (existingLog.messageQueue) {
        await db.messageQueue.update({
          where: { id: existingLog.messageQueue.id },
          data: {
            status: 'cancelled',
            updatedAt: new Date()
          }
        });
      }
      
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
    const existingLog = await db.auditLog.findUnique({
      where: { id: request.auditLogId },
      include: { user: true }
    });
    
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
    const updatedLog = await db.auditLog.update({
      where: { id: request.auditLogId },
      data: {
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
      }
    });
    
    // Create or update message queue entry
    const existingQueue = await db.messageQueue.findUnique({
      where: { auditLogId: request.auditLogId }
    });
    
    if (existingQueue) {
      await db.messageQueue.update({
        where: { id: existingQueue.id },
        data: {
          recipientEmail: request.recipientEmail,
          recipientPhone: request.recipientPhone,
          messageContent: request.finalMessage,
          deliveryMethod: request.deliveryMethod,
          priority: request.priority || 'normal',
          scheduledFor: request.scheduledFor,
          status: 'queued',
          updatedAt: new Date()
        }
      });
    } else {
      await db.messageQueue.create({
        data: {
          auditLogId: request.auditLogId,
          recipientEmail: request.recipientEmail,
          recipientPhone: request.recipientPhone,
          messageContent: request.finalMessage,
          deliveryMethod: request.deliveryMethod,
          priority: request.priority || 'normal',
          scheduledFor: request.scheduledFor,
          status: 'queued'
        }
      });
    }
    
    return {
      success: true,
      message: 'Message sent and queued for delivery',
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
    
    const pendingMessages = await db.auditLog.findMany({
      where: {
        actionType: 'submitted_for_review',
        deliveryStatus: 'pending_review'
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true
          }
        },
        messageQueue: true
      },
      orderBy: {
        createdAt: 'asc' // FIFO queue
      }
    });
    
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
      updateData.retryCount = { increment: 1 };
      updateData.lastRetryAt = new Date();
    }
    
    // Update audit log
    const updatedLog = await db.auditLog.update({
      where: { id: auditLogId },
      data: updateData
    });
    
    // Update message queue
    const messageQueue = await db.messageQueue.findUnique({
      where: { auditLogId }
    });
    
    if (messageQueue) {
      const queueUpdateData: any = {
        status: status,
        updatedAt: new Date()
      };
      
      if (status === 'delivered') {
        queueUpdateData.deliveryConfirmed = true;
        queueUpdateData.confirmedAt = new Date();
      } else {
        queueUpdateData.attempts = { increment: 1 };
        queueUpdateData.lastAttemptAt = new Date();
        queueUpdateData.errorLog = JSON.stringify([
          ...(messageQueue.errorLog ? JSON.parse(messageQueue.errorLog) : []),
          {
            timestamp: new Date().toISOString(),
            error: failureReason,
            attempt: messageQueue.attempts + 1
          }
        ]);
        
        // Schedule retry if under max attempts
        if (messageQueue.attempts < messageQueue.maxAttempts - 1) {
          queueUpdateData.status = 'retry_scheduled';
          queueUpdateData.nextRetryAt = new Date(Date.now() + (15 * 60 * 1000)); // 15 minutes
        }
      }
      
      if (webhookData) {
        queueUpdateData.webhookData = JSON.stringify(webhookData);
      }
      
      await db.messageQueue.update({
        where: { id: messageQueue.id },
        data: queueUpdateData
      });
    }
    
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
