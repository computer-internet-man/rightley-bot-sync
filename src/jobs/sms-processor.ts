import { drizzleDb, messageQueue } from '@/db';
import { eq } from 'drizzle-orm';
import { deliveryManager } from '@/providers/delivery';
import * as Sentry from '@sentry/cloudflare';
import type { SMSJob } from '@/lib/queue-producer';

export interface SMSProcessingResult {
  success: boolean;
  messageId: string;
  status: 'sent' | 'failed';
  externalId?: string;
  error?: string;
  retryAfter?: number;
}

export class SMSProcessor {
  /**
   * Process an SMS delivery job
   */
  static async processSMSJob(job: SMSJob, env: any): Promise<SMSProcessingResult> {
    console.log('[SMS_PROCESSOR] Processing SMS job:', {
      messageId: job.messageId,
      recipient: job.recipient,
      priority: job.priority
    });

    try {
      // Find the message queue entry
      const [queueEntry] = await drizzleDb
        .select()
        .from(messageQueue)
        .where(eq(messageQueue.id, job.messageId))
        .limit(1);

      if (!queueEntry) {
        throw new Error(`Message queue entry not found: ${job.messageId}`);
      }

      // Check if message is in correct state for processing
      if (queueEntry.status !== 'queued' && queueEntry.status !== 'processing') {
        console.warn('[SMS_PROCESSOR] Message not in processable state:', {
          messageId: job.messageId,
          currentStatus: queueEntry.status
        });
        return {
          success: false,
          messageId: job.messageId,
          status: 'failed',
          error: `Message in invalid state: ${queueEntry.status}`
        };
      }

      // Update status to processing
      await drizzleDb
        .update(messageQueue)
        .set({
          status: 'processing',
          updatedAt: new Date()
        })
        .where(eq(messageQueue.id, job.messageId));

      // Send SMS through delivery provider
      const deliveryResult = await deliveryManager.send({
        to: job.recipient,
        subject: '', // SMS doesn't use subject
        content: job.content,
        messageId: job.messageId,
        priority: job.priority,
        deliveryMethod: 'sms',
        metadata: {
          ...job.metadata,
          queueProcessedAt: new Date().toISOString(),
          attemptNumber: queueEntry.attempts + 1
        }
      });

      if (deliveryResult.success) {
        // Update queue entry to sent status
        await drizzleDb
          .update(messageQueue)
          .set({
            status: 'sent',
            updatedAt: new Date(),
            lastAttemptAt: new Date(),
            externalId: deliveryResult.externalId,
            attempts: queueEntry.attempts + 1
          })
          .where(eq(messageQueue.id, job.messageId));

        // Log successful processing
        Sentry.addBreadcrumb({
          category: 'sms',
          message: 'SMS sent successfully via queue',
          level: 'info',
          data: {
            messageId: job.messageId,
            recipient: job.recipient,
            externalId: deliveryResult.externalId,
            priority: job.priority
          }
        });

        console.log('[SMS_PROCESSOR] SMS sent successfully:', {
          messageId: job.messageId,
          externalId: deliveryResult.externalId
        });

        return {
          success: true,
          messageId: job.messageId,
          status: 'sent',
          externalId: deliveryResult.externalId
        };

      } else {
        // Handle delivery failure
        const shouldRetry = this.shouldRetrySMS(queueEntry.attempts + 1, deliveryResult.error);
        const nextRetryAt = shouldRetry ? this.calculateNextRetry(queueEntry.attempts + 1) : null;

        // Update error log
        const errorLog = queueEntry.errorLog ? JSON.parse(queueEntry.errorLog) : [];
        errorLog.push({
          timestamp: new Date().toISOString(),
          error: deliveryResult.error || 'SMS delivery failed',
          attemptNumber: queueEntry.attempts + 1,
          provider: deliveryResult.provider || 'unknown'
        });

        await drizzleDb
          .update(messageQueue)
          .set({
            status: shouldRetry ? 'queued' : 'failed',
            updatedAt: new Date(),
            lastAttemptAt: new Date(),
            attempts: queueEntry.attempts + 1,
            nextRetryAt,
            errorLog: JSON.stringify(errorLog)
          })
          .where(eq(messageQueue.id, job.messageId));

        // Log failure
        Sentry.addBreadcrumb({
          category: 'sms',
          message: shouldRetry ? 'SMS delivery failed, will retry' : 'SMS delivery failed permanently',
          level: shouldRetry ? 'warning' : 'error',
          data: {
            messageId: job.messageId,
            error: deliveryResult.error,
            attempts: queueEntry.attempts + 1,
            willRetry: shouldRetry
          }
        });

        console.error('[SMS_PROCESSOR] SMS delivery failed:', {
          messageId: job.messageId,
          error: deliveryResult.error,
          attempts: queueEntry.attempts + 1,
          willRetry: shouldRetry
        });

        return {
          success: false,
          messageId: job.messageId,
          status: 'failed',
          error: deliveryResult.error,
          retryAfter: shouldRetry ? this.getRetryDelay(queueEntry.attempts + 1) : undefined
        };
      }

    } catch (error) {
      console.error('[SMS_PROCESSOR] Unexpected error processing SMS job:', error);

      // Update message status to failed
      try {
        await drizzleDb
          .update(messageQueue)
          .set({
            status: 'failed',
            updatedAt: new Date(),
            lastAttemptAt: new Date(),
            errorLog: JSON.stringify([{
              timestamp: new Date().toISOString(),
              error: error instanceof Error ? error.message : 'Unknown error',
              type: 'processing_error'
            }])
          })
          .where(eq(messageQueue.id, job.messageId));
      } catch (updateError) {
        console.error('[SMS_PROCESSOR] Failed to update queue entry after error:', updateError);
      }

      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: { 
          component: 'sms-processor',
          messageId: job.messageId 
        },
        extra: { job }
      });

      return {
        success: false,
        messageId: job.messageId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Determine if SMS should be retried based on attempt count and error type
   */
  private static shouldRetrySMS(attemptCount: number, error?: string): boolean {
    // Max 3 retry attempts
    if (attemptCount >= 3) {
      return false;
    }

    // Don't retry certain permanent failures
    if (error) {
      const lowerError = error.toLowerCase();
      if (lowerError.includes('invalid number') || 
          lowerError.includes('blocked') || 
          lowerError.includes('unsubscribed') ||
          lowerError.includes('carrier rejected')) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  private static calculateNextRetry(attemptCount: number): Date {
    // Exponential backoff: 2^attempt minutes
    const delayMinutes = Math.pow(2, attemptCount);
    const nextRetry = new Date();
    nextRetry.setMinutes(nextRetry.getMinutes() + delayMinutes);
    return nextRetry;
  }

  /**
   * Get retry delay in seconds for queue reprocessing
   */
  private static getRetryDelay(attemptCount: number): number {
    // Exponential backoff in seconds
    return Math.pow(2, attemptCount) * 60; // 2^attempt minutes in seconds
  }
}
