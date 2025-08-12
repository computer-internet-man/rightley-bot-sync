import { env } from "cloudflare:workers";
import * as Sentry from '@sentry/cloudflare';

// Queue job types
export interface EmailJob {
  type: 'email_send';
  messageId: string;
  recipient: string;
  subject: string;
  content: string;
  priority: 'high' | 'normal' | 'low';
  metadata?: Record<string, any>;
}

export interface SMSJob {
  type: 'sms_send';
  messageId: string;
  recipient: string;
  content: string;
  priority: 'high' | 'normal' | 'low';
  metadata?: Record<string, any>;
}

export interface ExportJob {
  type: 'export_generation';
  exportId: string;
  filters: any;
  userId: string;
  format: 'csv' | 'json';
  metadata?: Record<string, any>;
}

export interface CleanupJob {
  type: 'cleanup';
  target: 'audit_logs' | 'message_queue' | 'temp_files';
  olderThan: string; // ISO date string
  metadata?: Record<string, any>;
}

export type QueueJob = EmailJob | SMSJob | ExportJob | CleanupJob;

// Priority levels for delay calculation
const PRIORITY_DELAYS = {
  high: 0,      // Process immediately
  normal: 1000, // 1 second delay
  low: 5000     // 5 second delay
};

export class QueueProducer {
  private queue: Queue<QueueJob>;

  constructor(env: any) {
    this.queue = env.MESSAGE_QUEUE;
  }

  /**
   * Enqueue a single job
   */
  async enqueueJob(job: QueueJob, options?: {
    delay?: number;
    deduplicationId?: string;
  }): Promise<void> {
    try {
      const delay = options?.delay ?? PRIORITY_DELAYS[job.priority] ?? 0;
      
      await this.queue.send(job, {
        contentType: 'json',
        delaySeconds: Math.floor(delay / 1000),
        deduplicationId: options?.deduplicationId
      });

      // Log successful enqueue
      Sentry.addBreadcrumb({
        category: 'queue',
        message: `Job enqueued: ${job.type}`,
        level: 'info',
        data: {
          jobType: job.type,
          messageId: 'messageId' in job ? job.messageId : undefined,
          priority: job.priority,
          delay
        }
      });

      console.log('[QUEUE_PRODUCER] Job enqueued:', {
        type: job.type,
        messageId: 'messageId' in job ? job.messageId : undefined,
        priority: job.priority,
        delay
      });

    } catch (error) {
      console.error('[QUEUE_PRODUCER] Failed to enqueue job:', error);
      
      Sentry.captureException(error, {
        tags: { 
          component: 'queue-producer',
          jobType: job.type 
        },
        extra: {
          job,
          options
        }
      });

      throw error;
    }
  }

  /**
   * Enqueue multiple jobs in a batch
   */
  async enqueueBatch(jobs: QueueJob[], options?: {
    delay?: number;
  }): Promise<void> {
    try {
      const delay = options?.delay ?? 0;
      
      const messages = jobs.map(job => ({
        body: job,
        contentType: 'json' as const,
        delaySeconds: Math.floor(delay / 1000)
      }));

      await this.queue.sendBatch(messages);

      // Log successful batch enqueue
      Sentry.addBreadcrumb({
        category: 'queue',
        message: `Batch jobs enqueued: ${jobs.length}`,
        level: 'info',
        data: {
          jobCount: jobs.length,
          jobTypes: jobs.map(j => j.type),
          delay
        }
      });

      console.log('[QUEUE_PRODUCER] Batch jobs enqueued:', {
        count: jobs.length,
        types: jobs.map(j => j.type),
        delay
      });

    } catch (error) {
      console.error('[QUEUE_PRODUCER] Failed to enqueue batch:', error);
      
      Sentry.captureException(error, {
        tags: { 
          component: 'queue-producer' 
        },
        extra: {
          jobCount: jobs.length,
          jobs,
          options
        }
      });

      throw error;
    }
  }

  /**
   * Enqueue an email delivery job
   */
  async enqueueEmail(params: {
    messageId: string;
    recipient: string;
    subject: string;
    content: string;
    priority?: 'high' | 'normal' | 'low';
    metadata?: Record<string, any>;
  }): Promise<void> {
    const job: EmailJob = {
      type: 'email_send',
      messageId: params.messageId,
      recipient: params.recipient,
      subject: params.subject,
      content: params.content,
      priority: params.priority ?? 'normal',
      metadata: params.metadata
    };

    await this.enqueueJob(job);
  }

  /**
   * Enqueue an SMS delivery job
   */
  async enqueueSMS(params: {
    messageId: string;
    recipient: string;
    content: string;
    priority?: 'high' | 'normal' | 'low';
    metadata?: Record<string, any>;
  }): Promise<void> {
    const job: SMSJob = {
      type: 'sms_send',
      messageId: params.messageId,
      recipient: params.recipient,
      content: params.content,
      priority: params.priority ?? 'normal',
      metadata: params.metadata
    };

    await this.enqueueJob(job);
  }

  /**
   * Enqueue an export generation job
   */
  async enqueueExport(params: {
    exportId: string;
    filters: any;
    userId: string;
    format?: 'csv' | 'json';
    metadata?: Record<string, any>;
  }): Promise<void> {
    const job: ExportJob = {
      type: 'export_generation',
      exportId: params.exportId,
      filters: params.filters,
      userId: params.userId,
      format: params.format ?? 'csv',
      priority: 'low', // Export jobs are always low priority
      metadata: params.metadata
    };

    await this.enqueueJob(job);
  }

  /**
   * Enqueue a cleanup job
   */
  async enqueueCleanup(params: {
    target: 'audit_logs' | 'message_queue' | 'temp_files';
    olderThan: Date;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const job: CleanupJob = {
      type: 'cleanup',
      target: params.target,
      olderThan: params.olderThan.toISOString(),
      priority: 'low', // Cleanup jobs are always low priority
      metadata: params.metadata
    };

    // Schedule cleanup jobs with a delay to avoid peak hours
    await this.enqueueJob(job, { delay: 60000 }); // 1 minute delay
  }

  /**
   * Enqueue a "send later" job
   */
  async enqueueSendLater(
    job: EmailJob | SMSJob, 
    sendAt: Date
  ): Promise<void> {
    const delay = sendAt.getTime() - Date.now();
    
    if (delay <= 0) {
      // Send immediately if time has passed
      await this.enqueueJob(job);
    } else {
      // Schedule for future delivery
      await this.enqueueJob(job, { delay });
    }
  }
}

/**
 * Create a queue producer instance
 */
export function createQueueProducer(env: any): QueueProducer {
  return new QueueProducer(env);
}
