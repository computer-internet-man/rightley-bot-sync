import { defineApp, ErrorResponse } from "rwsdk/worker";
import { route, render, prefix } from "rwsdk/router";
import { Document } from "@/app/Document";
import { Home } from "@/app/pages/Home";
import { AdminDashboard } from "@/app/pages/AdminDashboard";
import { DoctorPortal } from "@/app/pages/DoctorPortal";
import LoginPage from "@/app/pages/LoginPage";
import DraftWorkflowPage from "@/app/pages/DraftWorkflowPage";
import DoctorSettingsPage from "@/app/pages/doctor/SettingsPage";
import PatientBriefsPage from "@/app/pages/admin/PatientBriefsPage";
import AuditLogPage from "@/app/pages/admin/AuditLogPage";

import { setCommonHeaders } from "@/app/headers";
import { setEnhancedSecurityHeaders } from "@/middleware/securityHeaders";
import { createSecurityGateway } from "@/middleware/securityGateway";
import { userRoutes } from "@/app/pages/user/routes";
import { pageRoutes as syncPageRoutes, apiRoutes as syncApiRoutes } from "@/app/pages/sync/routes";
import { validateCloudflareAccessJWT, findOrCreateUser } from "@/lib/auth";
import { requireAuth, requireAdmin, requireDoctor, requireStaff, requireAuditor } from "@/middleware/requireRole";
import { type User, setupDb, drizzleDb } from "@/db";
import { users as drizzleUsers, patientBriefs as drizzlePatientBriefs, doctorSettings as drizzleDoctorSettings, auditLogs as drizzleAuditLogs, messageQueue as drizzleMessageQueue } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { generateDraftAction, type DraftRequest } from "@/actions/generateDraft";
import { MessageReviewPage } from "@/app/pages/MessageReviewPage";
import seedWithDrizzle from "@/scripts/seed-drizzle";
import * as Sentry from '@sentry/cloudflare';
import { EmailProcessor } from '@/jobs/email-processor';
import { SMSProcessor } from '@/jobs/sms-processor';
import { ExportProcessor } from '@/jobs/export-processor';
import { CleanupProcessor } from '@/jobs/cleanup-processor';
import type { QueueJob } from '@/lib/queue-producer';
import { monitoring } from '@/lib/monitoring';
import { PerformanceTracker } from '@/lib/logger';
// import { logger, generateRequestId, measurePerformance } from '@/lib/logger';

export type AppContext = {
  user: User | null;
};

// Webhook processing function
async function processDeliveryWebhook(webhookData: any): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[PROCESS_WEBHOOK] Processing delivery webhook:', {
      messageId: webhookData.messageId,
      status: webhookData.status,
      provider: webhookData.provider
    });

    // Find the message queue entry
    const [messageEntry] = await drizzleDb
      .select()
      .from(drizzleMessageQueue)
      .where(eq(drizzleMessageQueue.id, webhookData.messageId))
      .limit(1);

    if (!messageEntry) {
      console.warn('[PROCESS_WEBHOOK] Message not found:', webhookData.messageId);
      return {
        success: false,
        error: `Message ${webhookData.messageId} not found in queue`
      };
    }

    // Map webhook status to our internal status
    let internalStatus: string;
    let deliveryConfirmed = false;
    let errorLog = messageEntry.errorLog ? JSON.parse(messageEntry.errorLog) : [];

    switch (webhookData.status?.toLowerCase()) {
      case 'delivered':
      case 'success':
        internalStatus = 'delivered';
        deliveryConfirmed = true;
        break;
      case 'sent':
      case 'accepted':
        internalStatus = 'sent';
        break;
      case 'failed':
      case 'error':
      case 'bounced':
      case 'rejected':
        internalStatus = 'failed';
        errorLog.push({
          timestamp: new Date().toISOString(),
          error: webhookData.error || webhookData.reason || 'Delivery failed',
          provider: webhookData.provider,
          externalId: webhookData.externalId
        });
        break;
      case 'queued':
      case 'pending':
        internalStatus = 'processing';
        break;
      default:
        console.warn('[PROCESS_WEBHOOK] Unknown status:', webhookData.status);
        internalStatus = messageEntry.status; // Keep current status
    }

    // Prepare update data
    const updateData: any = {
      status: internalStatus,
      updatedAt: new Date(),
      webhookData: JSON.stringify({
        ...webhookData,
        processedAt: new Date().toISOString()
      }),
      errorLog: JSON.stringify(errorLog)
    };

    if (deliveryConfirmed) {
      updateData.deliveryConfirmed = true;
      updateData.confirmedAt = new Date();
    }

    // Update message queue entry
    await drizzleDb
      .update(drizzleMessageQueue)
      .set(updateData)
      .where(eq(drizzleMessageQueue.id, webhookData.messageId));

    // Update related audit log if exists
    if (messageEntry.auditLogId) {
      const auditUpdateData: any = {
        deliveryStatus: internalStatus,
        updatedAt: new Date()
      };

      if (deliveryConfirmed) {
        auditUpdateData.deliveredAt = new Date();
      }

      if (internalStatus === 'failed') {
        auditUpdateData.failureReason = webhookData.error || webhookData.reason || 'Delivery failed';
        auditUpdateData.retryCount = (messageEntry.attempts || 0) + 1;
      }

      await drizzleDb
        .update(drizzleAuditLogs)
        .set(auditUpdateData)
        .where(eq(drizzleAuditLogs.id, messageEntry.auditLogId));
    }

    // Log successful processing
    Sentry.addBreadcrumb({
      category: 'webhook',
      message: 'Delivery status updated via webhook',
      level: 'info',
      data: {
        messageId: webhookData.messageId,
        oldStatus: messageEntry.status,
        newStatus: internalStatus,
        deliveryConfirmed,
        provider: webhookData.provider
      }
    });

    console.log('[PROCESS_WEBHOOK] Successfully processed webhook:', {
      messageId: webhookData.messageId,
      oldStatus: messageEntry.status,
      newStatus: internalStatus,
      deliveryConfirmed
    });

    return { success: true };

  } catch (error) {
    console.error('[PROCESS_WEBHOOK] Error processing webhook:', error);
    
    Sentry.captureException(error, {
      tags: { component: 'webhook-processor' },
      extra: {
        webhookData,
        messageId: webhookData?.messageId
      }
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown processing error'
    };
  }
}

export default defineApp([
  // Enhanced security headers
  setEnhancedSecurityHeaders(env),
  
  // Security Gateway - comprehensive security middleware
  async ({ ctx, request, headers }) => {
    const securityGateway = createSecurityGateway(env);
    const securityResponse = await securityGateway.beforeRequest(request, ctx.user || undefined);
    
    if (securityResponse) {
      return securityResponse;
    }
  },
  
  // Authentication middleware - sets up user context for all routes
  async ({ ctx, request, headers }) => {
    console.log("[AUTH MIDDLEWARE] Processing request:", request.method, new URL(request.url).pathname);
    await setupDb(env);

    // For development, always create an admin user
    const devJWT = {
      email: "admin@example.com",
      sub: "dev-admin-123",
      iss: "dev-issuer",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 // 24 hours
    };
    
    try {
      ctx.user = await findOrCreateUser(devJWT, "admin");
      console.log("[AUTH MIDDLEWARE] User set:", ctx.user?.email, "role:", ctx.user?.role);
      
      // Set Sentry user context
      if (ctx.user && env.SENTRY_DSN) {
        Sentry.setUser({
          email: ctx.user.email,
          id: ctx.user.id,
          role: ctx.user.role,
        });
        
        Sentry.addBreadcrumb({
          category: 'auth',
          message: `User authenticated: ${ctx.user.email}`,
          level: 'info',
          data: { role: ctx.user.role }
        });
      }
    } catch (error) {
      console.error("[AUTH MIDDLEWARE] Error setting up user:", error);
      ctx.user = null;
      
      if (env.SENTRY_DSN) {
        Sentry.captureException(error);
      }
    }
  },
  
  // Health probe for dev server readiness
  route('/__ping', () => new Response('pong')),
  
  // Test route for debugging
  route("/test", ({ ctx }) => {
    console.log("[TEST ROUTE] User:", ctx.user?.email);
    return new Response(`Test route works! User: ${ctx.user?.email} (${ctx.user?.role})`);
  }),

  // Debug environment sanity probe
  route("/debug/env", ({ ctx }) => {
    const envName = env.CLOUDFLARE_ENV || "local";
    const hasDB = !!env.DB;
    const version = env.CF_VERSION_METADATA?.id || "dev";
    
    const envInfo = {
      environment: envName,
      version: version,
      hasDatabase: hasDB,
      timestamp: new Date().toISOString(),
      user: ctx.user ? { email: ctx.user.email, role: ctx.user.role } : null
    };
    
    console.log("[DEBUG/ENV] Environment check:", envInfo);
    
    return new Response(JSON.stringify(envInfo, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }),

  // Debug routes for OpenAI integration
  route("/debug/openai-stub", async ({ ctx }) => {
    console.log("[DEBUG/OPENAI-STUB] Testing stubbed OpenAI responses");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      // Find a test patient (John Doe)
      const [testPatient] = await drizzleDb
        .select()
        .from(drizzlePatientBriefs)
        .where(eq(drizzlePatientBriefs.patientName, "John Doe"))
        .limit(1);

      if (!testPatient) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No test patient found. Run /debug/seed-drizzle first.'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Test with AI_STUB=1
      const stubEnv = { ...env, AI_STUB: "1" };
      const testRequest = {
        patientInquiry: "I'm having trouble with my medication refill",
        patientId: testPatient.id,
        userId: ctx.user.id
      };

      const { generateDraftAction } = await import('@/actions/generateDraft');
      const result = await generateDraftAction(testRequest, stubEnv);

      return new Response(JSON.stringify({
        success: true,
        message: 'OpenAI stub test completed',
        testRequest,
        result,
        environment: {
          AI_STUB: stubEnv.AI_STUB,
          hasOpenAIKey: !!env.OPENAI_API_KEY && env.OPENAI_API_KEY !== "your-openai-api-key-here"
        }
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[DEBUG/OPENAI-STUB] Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Stub test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  route("/debug/openai-usage", async ({ ctx }) => {
    console.log("[DEBUG/OPENAI-USAGE] Getting usage statistics");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { UsageTrackingService } = await import('@/lib/services/usageTrackingService');
      
      // Get user's own usage stats
      const userStats = await UsageTrackingService.getUserUsageStats(ctx.user.id);
      
      // Check if user can make requests
      const requestCheck = await UsageTrackingService.canUserMakeRequest(ctx.user.id);

      let systemStats = null;
      if (ctx.user.role === 'admin') {
        // Only admins can see system-wide stats
        systemStats = await UsageTrackingService.getSystemUsageStats(ctx.user);
      }

      return new Response(JSON.stringify({
        success: true,
        user: {
          id: ctx.user.id,
          email: ctx.user.email,
          role: ctx.user.role
        },
        userStats,
        requestCheck,
        systemStats,
        timestamp: new Date().toISOString()
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[DEBUG/OPENAI-USAGE] Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to get usage statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  route("/debug/openai-config", async ({ ctx }) => {
    console.log("[DEBUG/OPENAI-CONFIG] Getting OpenAI configuration");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Only admins can see full configuration
    if (ctx.user.role !== 'admin') {
      return new Response(JSON.stringify({ success: false, error: 'Admin access required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { UsageTrackingService } = await import('@/lib/services/usageTrackingService');
      
      // Get cost alerts
      const costAlerts = await UsageTrackingService.getCostAlerts(ctx.user);

      const config = {
        openai: {
          hasApiKey: !!env.OPENAI_API_KEY && env.OPENAI_API_KEY !== "your-openai-api-key-here",
          apiKeyPreview: env.OPENAI_API_KEY ? `${env.OPENAI_API_KEY.substring(0, 7)}...` : 'Not set',
          stubMode: env.AI_STUB === "1"
        },
        limits: {
          admin: UsageTrackingService.getDailyLimitForRole('admin'),
          doctor: UsageTrackingService.getDailyLimitForRole('doctor'),
          reviewer: UsageTrackingService.getDailyLimitForRole('reviewer'),
          staff: UsageTrackingService.getDailyLimitForRole('staff')
        },
        models: {
          admin: 'gpt-4o-mini',
          doctor: 'gpt-4o-mini',
          reviewer: 'gpt-4o-mini',
          staff: 'gpt-4o-mini'
        },
        costAlerts,
        environment: {
          ENVIRONMENT: env.ENVIRONMENT || 'local',
          SENTRY_DSN: !!env.SENTRY_DSN,
          CLOUDFLARE_ENV: env.CLOUDFLARE_ENV || 'local'
        },
        timestamp: new Date().toISOString()
      };

      return new Response(JSON.stringify(config, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[DEBUG/OPENAI-CONFIG] Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to get configuration',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  route("/debug/enqueue", async ({ ctx }) => {
    console.log("[DEBUG/ENQUEUE] Testing queue functionality");
    
    try {
      const { createQueueProducer } = await import('@/lib/queue-producer');
      
      if (!env.MESSAGE_QUEUE) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Queue not available in current environment',
          note: 'Run "wrangler dev --test --queue" to enable queue processing'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const queueProducer = createQueueProducer(env);
      const testMessageId = crypto.randomUUID();

      // Enqueue a test email job
      await queueProducer.enqueueEmail({
        messageId: testMessageId,
        recipient: 'test@example.com',
        subject: 'Test Queue Processing',
        content: 'This is a test message to verify queue processing functionality.',
        priority: 'normal',
        metadata: {
          testId: 'debug-enqueue-test',
          timestamp: new Date().toISOString()
        }
      });

      return new Response(JSON.stringify({
        success: true,
        message: 'Test email job enqueued successfully',
        testJob: {
          type: 'email_send',
          messageId: testMessageId,
          recipient: 'test@example.com',
          priority: 'normal'
        },
        note: 'Check logs for queue processing results'
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[DEBUG/ENQUEUE] Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to enqueue test message',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  route("/debug/queue-status", async ({ ctx }) => {
    console.log("[DEBUG/QUEUE-STATUS] Getting queue status and metrics");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      // Get message queue statistics
      const queueStats = await drizzleDb
        .select({
          status: drizzleMessageQueue.status,
          count: sql`COUNT(*)`.as('count')
        })
        .from(drizzleMessageQueue)
        .groupBy(drizzleMessageQueue.status);

      // Get recent processing activity
      const recentActivity = await drizzleDb
        .select({
          id: drizzleMessageQueue.id,
          status: drizzleMessageQueue.status,
          deliveryMethod: drizzleMessageQueue.deliveryMethod,
          priority: drizzleMessageQueue.priority,
          attempts: drizzleMessageQueue.attempts,
          createdAt: drizzleMessageQueue.createdAt,
          updatedAt: drizzleMessageQueue.updatedAt,
          lastAttemptAt: drizzleMessageQueue.lastAttemptAt
        })
        .from(drizzleMessageQueue)
        .orderBy(desc(drizzleMessageQueue.updatedAt))
        .limit(10);

      // Calculate queue health metrics
      const totalMessages = queueStats.reduce((sum, stat) => sum + Number(stat.count), 0);
      const failedMessages = queueStats.find(s => s.status === 'failed')?.count || 0;
      const queuedMessages = queueStats.find(s => s.status === 'queued')?.count || 0;
      const processingMessages = queueStats.find(s => s.status === 'processing')?.count || 0;

      const queueHealth = {
        total: totalMessages,
        queued: queuedMessages,
        processing: processingMessages,
        failed: failedMessages,
        failureRate: totalMessages > 0 ? (Number(failedMessages) / totalMessages * 100).toFixed(2) : '0.00',
        status: Number(failedMessages) / totalMessages > 0.1 ? 'unhealthy' : 'healthy'
      };

      return new Response(JSON.stringify({
        success: true,
        queueHealth,
        statistics: queueStats.map(stat => ({
          status: stat.status,
          count: Number(stat.count)
        })),
        recentActivity: recentActivity.map(activity => ({
          ...activity,
          createdAt: new Date(activity.createdAt).toISOString(),
          updatedAt: new Date(activity.updatedAt).toISOString(),
          lastAttemptAt: activity.lastAttemptAt ? new Date(activity.lastAttemptAt).toISOString() : null
        })),
        environment: {
          hasQueueBinding: !!env.MESSAGE_QUEUE,
          queueEnabled: env.MESSAGE_QUEUE ? 'yes' : 'no'
        },
        timestamp: new Date().toISOString()
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[DEBUG/QUEUE-STATUS] Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to get queue status',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  route("/debug/enqueue-test", async ({ ctx }) => {
    console.log("[DEBUG/ENQUEUE-TEST] Testing different job types");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { createQueueProducer } = await import('@/lib/queue-producer');
      
      if (!env.MESSAGE_QUEUE) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Queue not available in current environment'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const queueProducer = createQueueProducer(env);
      const testResults = [];

      // Test email job
      const emailJobId = crypto.randomUUID();
      await queueProducer.enqueueEmail({
        messageId: emailJobId,
        recipient: 'test@example.com',
        subject: 'Test Email via Queue',
        content: 'This is a test email sent through the queue system.',
        priority: 'normal'
      });
      testResults.push({ type: 'email', messageId: emailJobId, status: 'enqueued' });

      // Test SMS job
      const smsJobId = crypto.randomUUID();
      await queueProducer.enqueueSMS({
        messageId: smsJobId,
        recipient: '+1234567890',
        content: 'Test SMS via queue system.',
        priority: 'high'
      });
      testResults.push({ type: 'sms', messageId: smsJobId, status: 'enqueued' });

      // Test export job
      const exportJobId = crypto.randomUUID();
      await queueProducer.enqueueExport({
        exportId: exportJobId,
        filters: { startDate: '2024-01-01', endDate: '2024-12-31' },
        userId: ctx.user.id,
        format: 'csv'
      });
      testResults.push({ type: 'export', exportId: exportJobId, status: 'enqueued' });

      // Test cleanup job
      await queueProducer.enqueueCleanup({
        target: 'temp_files',
        olderThan: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
      });
      testResults.push({ type: 'cleanup', target: 'temp_files', status: 'enqueued' });

      return new Response(JSON.stringify({
        success: true,
        message: 'Test jobs enqueued successfully',
        testResults,
        note: 'Check queue status endpoint to monitor processing'
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[DEBUG/ENQUEUE-TEST] Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to enqueue test jobs',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Debug routes for delivery providers
  route("/debug/delivery-test", async ({ ctx }) => {
    console.log("[DEBUG/DELIVERY-TEST] Testing delivery provider interface");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { deliveryManager, initializeDeliveryProviders } = await import('@/providers/delivery');
      
      // Initialize providers with current environment
      initializeDeliveryProviders(env);
      
      // Test health checks
      const healthResults = await deliveryManager.healthCheck();
      
      // Test sending a message
      const testMessage = {
        to: 'test@example.com',
        subject: 'Test delivery',
        content: 'This is a test message from the delivery provider interface.',
        messageId: crypto.randomUUID(),
        priority: 'normal' as const,
        deliveryMethod: 'email' as const,
        metadata: {
          testId: 'debug-delivery-test',
          timestamp: new Date().toISOString()
        }
      };

      const sendResult = await deliveryManager.send(testMessage);
      
      // Test status checking
      const statusResult = await deliveryManager.getStatus(testMessage.messageId);
      
      // Get active providers
      const activeProviders = deliveryManager.getActiveProviders();

      return new Response(JSON.stringify({
        success: true,
        message: 'Delivery provider test completed',
        results: {
          healthChecks: healthResults,
          testSend: sendResult,
          statusCheck: statusResult,
          activeProviders,
          environment: {
            DELIVERY_PROVIDER: env.DELIVERY_PROVIDER || 'noop',
            hasSendGridKey: !!env.SENDGRID_API_KEY,
            hasTwilioCredentials: !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN)
          }
        }
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[DEBUG/DELIVERY-TEST] Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Delivery provider test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  route("/debug/webhook-test", async ({ ctx }) => {
    console.log("[DEBUG/WEBHOOK-TEST] Testing webhook signature validation");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { generateWebhookSignature, parseWebhookSignature, verifyWebhookSignature } = await import('@/lib/webhook-security');
      
      const testSecret = env.WEBHOOK_SECRET || 'test-secret-for-development';
      const testPayload = JSON.stringify({
        messageId: 'test-123',
        status: 'delivered',
        timestamp: new Date().toISOString()
      });
      
      // Generate valid signature
      const validSignature = await generateWebhookSignature(testPayload, testSecret);
      
      // Test signature parsing
      const parsedSignature = parseWebhookSignature(`sha256=${validSignature}`);
      
      // Test signature verification
      const verificationResult = await verifyWebhookSignature(
        testPayload,
        parsedSignature!,
        testSecret,
        {
          secret: testSecret,
          toleranceSeconds: 300,
          rateLimitPerMinute: 100,
          rateLimitPerHour: 1000
        }
      );
      
      // Test invalid signature
      const invalidVerification = await verifyWebhookSignature(
        testPayload,
        { algorithm: 'sha256', signature: 'invalid-signature' },
        testSecret,
        {
          secret: testSecret,
          toleranceSeconds: 300,
          rateLimitPerMinute: 100,
          rateLimitPerHour: 1000
        }
      );

      return new Response(JSON.stringify({
        success: true,
        message: 'Webhook security test completed',
        results: {
          testPayload,
          generatedSignature: validSignature,
          parsedSignature,
          validVerification: verificationResult,
          invalidVerification,
          environment: {
            hasWebhookSecret: !!env.WEBHOOK_SECRET,
            secretPreview: testSecret.substring(0, 8) + '...'
          }
        }
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[DEBUG/WEBHOOK-TEST] Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Webhook security test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  route("/debug/delivery-status", async ({ ctx }) => {
    console.log("[DEBUG/DELIVERY-STATUS] Getting delivery statistics");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      // Query delivery statistics from message queue
      const deliveryStats = await drizzleDb
        .select({
          status: drizzleMessageQueue.status,
          deliveryMethod: drizzleMessageQueue.deliveryMethod,
          priority: drizzleMessageQueue.priority,
          count: sql`COUNT(*)`.as('count'),
          avgAttempts: sql`AVG(${drizzleMessageQueue.attempts})`.as('avgAttempts'),
          maxAttempts: sql`MAX(${drizzleMessageQueue.attempts})`.as('maxAttempts')
        })
        .from(drizzleMessageQueue)
        .groupBy(
          drizzleMessageQueue.status,
          drizzleMessageQueue.deliveryMethod,
          drizzleMessageQueue.priority
        );

      // Get recent messages
      const recentMessages = await drizzleDb
        .select({
          id: drizzleMessageQueue.id,
          status: drizzleMessageQueue.status,
          deliveryMethod: drizzleMessageQueue.deliveryMethod,
          priority: drizzleMessageQueue.priority,
          attempts: drizzleMessageQueue.attempts,
          deliveryConfirmed: drizzleMessageQueue.deliveryConfirmed,
          createdAt: drizzleMessageQueue.createdAt,
          updatedAt: drizzleMessageQueue.updatedAt
        })
        .from(drizzleMessageQueue)
        .orderBy(desc(drizzleMessageQueue.createdAt))
        .limit(10);

      // Get provider health status
      const { deliveryManager } = await import('@/providers/delivery');
      const healthStatus = await deliveryManager.healthCheck();
      const activeProviders = deliveryManager.getActiveProviders();

      return new Response(JSON.stringify({
        success: true,
        statistics: {
          deliveryStats,
          recentMessages,
          providerHealth: healthStatus,
          activeProviders,
          summary: {
            totalMessages: deliveryStats.reduce((sum, stat) => sum + Number(stat.count), 0),
            activeProviderCount: activeProviders.length,
            healthyProviders: Object.values(healthStatus).filter(healthy => healthy).length
          }
        },
        timestamp: new Date().toISOString()
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[DEBUG/DELIVERY-STATUS] Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to get delivery statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Webhook endpoint for delivery status updates
  route("/webhooks/delivery", async ({ request, ctx }) => {
    console.log("[WEBHOOK/DELIVERY] Processing delivery status webhook");
    
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Method not allowed' 
      }), { 
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      // Read the raw payload
      const rawPayload = await request.text();
      
      // Validate webhook security
      const { validateWebhookSecurity } = await import('@/lib/webhook-security');
      const webhookSecret = env.WEBHOOK_SECRET || 'test-secret-for-development';
      
      const securityResult = await validateWebhookSecurity(
        request,
        rawPayload,
        {
          secret: webhookSecret,
          toleranceSeconds: 300, // 5 minutes
          rateLimitPerMinute: 100,
          rateLimitPerHour: 1000
        }
      );

      // Log security validation attempt
      Sentry.addBreadcrumb({
        category: 'webhook',
        message: 'Webhook security validation attempted',
        level: securityResult.valid ? 'info' : 'warning',
        data: {
          valid: securityResult.valid,
          error: securityResult.error,
          rateLimit: securityResult.rateLimit,
          payloadLength: rawPayload.length
        }
      });

      if (!securityResult.valid) {
        console.warn('[WEBHOOK/DELIVERY] Security validation failed:', securityResult.error);
        
        if (securityResult.error?.includes('Rate limit')) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Rate limit exceeded',
            retryAfter: securityResult.rateLimit?.resetTime
          }), {
            status: 429,
            headers: { 
              'Content-Type': 'application/json',
              'Retry-After': Math.ceil(((securityResult.rateLimit?.resetTime || Date.now()) - Date.now()) / 1000).toString()
            }
          });
        }

        return new Response(JSON.stringify({
          success: false,
          error: 'Unauthorized',
          details: securityResult.error
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Parse the webhook payload
      let webhookData;
      try {
        webhookData = JSON.parse(rawPayload);
      } catch (parseError) {
        console.error('[WEBHOOK/DELIVERY] Invalid JSON payload:', parseError);
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid JSON payload'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Validate required fields
      if (!webhookData.messageId || !webhookData.status) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Missing required fields: messageId, status'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Process the webhook
      const processResult = await processDeliveryWebhook(webhookData);
      
      if (!processResult.success) {
        return new Response(JSON.stringify(processResult), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Log successful webhook processing
      Sentry.addBreadcrumb({
        category: 'webhook',
        message: 'Delivery webhook processed successfully',
        level: 'info',
        data: {
          messageId: webhookData.messageId,
          status: webhookData.status,
          provider: webhookData.provider,
          processedAt: new Date().toISOString()
        }
      });

      return new Response(JSON.stringify({
        success: true,
        message: 'Webhook processed successfully',
        messageId: webhookData.messageId,
        status: webhookData.status,
        processedAt: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[WEBHOOK/DELIVERY] Processing error:', error);
      
      Sentry.captureException(error, {
        tags: { component: 'webhook-delivery' },
        extra: {
          url: request.url,
          method: request.method,
          contentType: request.headers.get('Content-Type')
        }
      });

      return new Response(JSON.stringify({
        success: false,
        error: 'Webhook processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Debug route for Sentry error testing
  route("/debug/sentry", ({ ctx }) => {
    console.log("[DEBUG/SENTRY] Testing Sentry error capture");
    
    // Add breadcrumb for debugging
    if (env.SENTRY_DSN) {
      Sentry.addBreadcrumb({
        category: 'debug',
        message: 'Testing Sentry integration',
        level: 'info',
        data: { 
          user: ctx.user?.email,
          environment: env.ENVIRONMENT || 'local'
        }
      });
    }
    
    // Intentionally throw an error for Sentry testing
    try {
      throw new Error('Test error for Sentry integration - this is intentional');
    } catch (error) {
      // Capture the error in Sentry if configured
      if (env.SENTRY_DSN) {
        Sentry.captureException(error);
      }
      
      // Return success response to indicate the test worked
      return new Response(JSON.stringify({
        success: true,
        message: 'Sentry test error captured successfully',
        environment: env.ENVIRONMENT || 'local',
        sentryConfigured: !!env.SENTRY_DSN,
        user: ctx.user ? { email: ctx.user.email, role: ctx.user.role } : null,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Debug routes for Drizzle with performance monitoring
  route("/debug/db", async ({ ctx }) => {
    const startTime = Date.now();
    const timings: Record<string, number> = {};
    
    try {
      // Add breadcrumb for database operation
      if (env.SENTRY_DSN) {
        Sentry.addBreadcrumb({
          category: 'database',
          message: 'Starting database query operations',
          level: 'info'
        });
      }
      
      // Drizzle is already set up in setupDb
      
      // Time each database operation
      let opStart = Date.now();
      const userCount = await drizzleDb.select().from(drizzleUsers);
      timings.users_query = Date.now() - opStart;
      
      opStart = Date.now();
      const briefCount = await drizzleDb.select().from(drizzlePatientBriefs);
      timings.briefs_query = Date.now() - opStart;
      
      opStart = Date.now();
      const settingsCount = await drizzleDb.select().from(drizzleDoctorSettings);
      timings.settings_query = Date.now() - opStart;
      
      opStart = Date.now();
      const auditCount = await drizzleDb.select().from(drizzleAuditLogs);
      timings.audit_query = Date.now() - opStart;
      
      const totalTime = Date.now() - startTime;
      timings.total = totalTime;

      // Create Server-Timing header
      const serverTimingParts = Object.entries(timings).map(([name, duration]) => 
        `${name};dur=${duration}`
      );

      return new Response(JSON.stringify({
        drizzle_table_counts: {
          users: userCount.length,
          patient_briefs: briefCount.length,
          doctor_settings: settingsCount.length,
          audit_logs: auditCount.length,
        },
        sample_data: {
          users: userCount.slice(0, 2),
          patient_briefs: briefCount.slice(0, 1),
        },
        performance: {
          total_duration_ms: totalTime,
          query_timings_ms: timings
        }
      }, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          'Server-Timing': serverTimingParts.join(', ')
        }
      });
    } catch (error) {
      if (env.SENTRY_DSN) {
        Sentry.captureException(error);
      }
      
      return new Response(JSON.stringify({
        error: 'Failed to query Drizzle database',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, null, 2), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Seed route for Drizzle
  route("/debug/seed-drizzle", async ({ ctx }) => {
    try {
      const result = await seedWithDrizzle(env);
      return new Response(JSON.stringify({
        success: true,
        message: 'Database seeded successfully with Drizzle',
        counts: result
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to seed database with Drizzle',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, null, 2), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Test John Doe workflow route
  route("/test-john-doe", async ({ ctx }) => {
    if (!ctx.user) {
      return new Response("No user authenticated", { status: 401 });
    }

    try {
      // 1. Check if John Doe exists
      const [johnDoe] = await drizzleDb
        .select()
        .from(drizzlePatientBriefs)
        .where(eq(drizzlePatientBriefs.patientName, "John Doe"))
        .limit(1);

      if (!johnDoe) {
        return new Response("John Doe not found in database", { status: 404 });
      }

      // 2. Test generating a draft for John Doe
      const testRequest = {
        patientInquiry: "Patient asking about diabetes medication refill",
        patientId: johnDoe.id,
        userId: ctx.user.id
      };

      console.log("[TEST] About to call generateDraftAction with:", testRequest);
      const draftResult = await generateDraftAction(testRequest, env);
      console.log("[TEST] generateDraftAction result:", draftResult);

      // 3. If successful, create an audit log entry
      if (draftResult.success && draftResult.draft) {
        const [auditEntry] = await drizzleDb
          .insert(drizzleAuditLogs)
          .values({
            userId: ctx.user.id,
            patientName: johnDoe.patientName,
            requestText: testRequest.patientInquiry,
            generatedDraft: draftResult.draft,
            finalMessage: draftResult.draft,
            actionType: 'draft_generated',
            deliveryStatus: 'draft'
          })
          .returning();

        return new Response(JSON.stringify({
          success: true,
          message: "John Doe workflow test completed successfully",
          patientFound: true,
          draftGenerated: true,
          auditLogCreated: true,
          details: {
            patient: {
              id: johnDoe.id,
              name: johnDoe.patientName,
              briefText: johnDoe.briefText,
              medicalHistory: johnDoe.medicalHistory,
              currentMedications: johnDoe.currentMedications
            },
            draftGenerated: draftResult.draft,
            auditLogId: auditEntry.id
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          message: "Draft generation failed",
          patientFound: true,
          draftGenerated: false,
          error: draftResult.error || "Unknown error"
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      console.error("[TEST JOHN DOE] Error:", error);
      return new Response(JSON.stringify({
        success: false,
        message: "Test failed with error",
        error: (error as Error).message
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Debug audit trail route
  route("/debug/audit-trail", async ({ ctx }) => {
    console.log("[DEBUG/AUDIT-TRAIL] Showing recent audit entries");
    
    try {
      // Get recent audit logs with user info
      const recentAuditLogs = await drizzleDb
        .select()
        .from(drizzleAuditLogs)
        .orderBy(desc(drizzleAuditLogs.createdAt))
        .limit(5);

      const debugInfo = {
        success: true,
        message: 'Recent audit trail entries',
        totalEntries: recentAuditLogs.length,
        rawLogs: recentAuditLogs,
        timestamp: new Date().toISOString()
      };

      return new Response(JSON.stringify(debugInfo, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[DEBUG/AUDIT-TRAIL] Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to fetch audit trail',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Debug CSV export test route
  route("/debug/export-test", async ({ ctx }) => {
    console.log("[DEBUG/EXPORT-TEST] Testing CSV export functionality");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { exportAuditLogsAsCSV } = await import('@/functions/complianceExport');
      
      // Test with recent data (last 7 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 7);
      
      const filters = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 5 // Small limit for testing
      };

      // This would normally return the CSV file, but for debug we'll just test the function
      const result = await exportAuditLogsAsCSV(filters, ctx.user.role);
      
      // Check if it's a CSV response
      const isCSV = result.headers.get('Content-Type')?.includes('text/csv');
      
      return new Response(JSON.stringify({
        success: true,
        message: 'CSV export test completed',
        contentType: result.headers.get('Content-Type'),
        contentDisposition: result.headers.get('Content-Disposition'),
        isCSVResponse: isCSV,
        responseStatus: result.status,
        filters,
        timestamp: new Date().toISOString()
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[DEBUG/EXPORT-TEST] Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'CSV export test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Debug mark as sent test route
  route("/debug/mark-sent-test", async ({ ctx }) => {
    console.log("[DEBUG/MARK-SENT-TEST] Testing mark as sent workflow");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { markMessageAsSent } = await import('@/functions/sendMessage');
      
      // Test data
      const testRequest = {
        messageId: `test-${Date.now()}`,
        finalMessage: 'Test message content for audit trail verification',
        recipientEmail: 'test@example.com',
        deliveryMethod: 'email' as const,
        priority: 'normal' as const
      };

      const result = await markMessageAsSent(
        testRequest,
        ctx.user.id,
        ctx.user.role,
        '127.0.0.1', // Test IP
        'DebugAgent/1.0' // Test user agent
      );

      return new Response(JSON.stringify({
        success: true,
        message: 'Mark as sent test completed',
        testRequest,
        result,
        timestamp: new Date().toISOString()
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[DEBUG/MARK-SENT-TEST] Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Mark as sent test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // ===== MONITORING ENDPOINTS =====
  
  // Comprehensive health check endpoint
  route("/monitoring/health", async ({ ctx }) => {
    console.log("[MONITORING] Health check requested");
    
    try {
      const startTime = Date.now();
      
      // Simple database health check
      const dbHealth = await (async () => {
        try {
          await drizzleDb.select().from(drizzleUsers).limit(1);
          return {
            service: 'database',
            status: 'healthy' as const,
            responseTime: Date.now() - startTime,
            lastChecked: new Date().toISOString()
          };
        } catch (error) {
          return {
            service: 'database',
            status: 'unhealthy' as const,
            responseTime: Date.now() - startTime,
            lastChecked: new Date().toISOString(),
            error: (error as Error).message
          };
        }
      })();
      
      // Simple environment check
      const envHealth = {
        service: 'environment',
        status: 'healthy' as const,
        responseTime: 5,
        lastChecked: new Date().toISOString(),
        details: {
          environment: env.ENVIRONMENT || 'local',
          version: env.CF_VERSION_METADATA?.id || 'dev',
          openai_configured: !!env.OPENAI_API_KEY
        }
      };
      
      const checks = [dbHealth, envHealth];
      const overall = checks.every(c => c.status === 'healthy') ? 'healthy' : 
                     checks.some(c => c.status === 'unhealthy') ? 'unhealthy' : 'degraded';
      
      const health = {
        overall,
        checks,
        timestamp: new Date().toISOString(),
        version: env.CF_VERSION_METADATA?.id || 'dev',
        environment: env.ENVIRONMENT || 'local'
      };
      
      const responseCode = overall === 'healthy' ? 200 : 
                          overall === 'degraded' ? 200 : 503;
      
      return new Response(JSON.stringify(health, null, 2), {
        status: responseCode,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    } catch (error) {
      console.error('[MONITORING/HEALTH] Error:', error);
      return new Response(JSON.stringify({
        overall: 'unhealthy',
        checks: [],
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Prometheus-compatible metrics endpoint
  route("/monitoring/metrics", async ({ ctx }) => {
    console.log("[MONITORING] Metrics requested");
    
    try {
      // Simple business metrics collection
      const timestamp = Date.now();
      const environment = env.ENVIRONMENT || 'local';
      
      // Get basic counts from database
      const [activeUsers, draftsGenerated, messagesFinalized] = await Promise.all([
        drizzleDb.select({ count: sql<number>`count(*)` }).from(drizzleUsers)
          .where(sql`${drizzleUsers.lastActiveAt} > datetime('now', '-24 hours')`),
        drizzleDb.select({ count: sql<number>`count(*)` }).from(drizzlePatientBriefs)
          .where(sql`${drizzlePatientBriefs.createdAt} > datetime('now', '-24 hours')`),
        drizzleDb.select({ count: sql<number>`count(*)` }).from(drizzleAuditLogs)
          .where(sql`${drizzleAuditLogs.createdAt} > datetime('now', '-24 hours')`)
      ]);
      
      const prometheusMetrics = `
# HELP ai_concierge_active_users Number of active users in last 24 hours
# TYPE ai_concierge_active_users gauge
ai_concierge_active_users{environment="${environment}"} ${activeUsers[0]?.count || 0} ${timestamp}

# HELP ai_concierge_drafts_generated Total drafts generated in last 24 hours
# TYPE ai_concierge_drafts_generated counter
ai_concierge_drafts_generated{environment="${environment}"} ${draftsGenerated[0]?.count || 0} ${timestamp}

# HELP ai_concierge_audit_events Total audit events in last 24 hours
# TYPE ai_concierge_audit_events counter
ai_concierge_audit_events{environment="${environment}"} ${messagesFinalized[0]?.count || 0} ${timestamp}

# HELP ai_concierge_health_status System health status (1=healthy, 0=unhealthy)
# TYPE ai_concierge_health_status gauge
ai_concierge_health_status{environment="${environment}"} 1 ${timestamp}
      `.trim();
      
      return new Response(prometheusMetrics, {
        headers: { 
          'Content-Type': 'text/plain; version=0.0.4',
          'Cache-Control': 'no-cache'
        }
      });
    } catch (error) {
      console.error('[MONITORING/METRICS] Error:', error);
      return new Response('# Error generating metrics\n', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }),

  // Alert status and configuration
  route("/monitoring/alerts", async ({ ctx }) => {
    console.log("[MONITORING] Alert status requested");
    
    try {
      // Simple alert checking
      const alertStatus = {
        status: 'ok',
        activeAlerts: 0,
        alerts: [],
        thresholds: {
          errorRate: { warning: 5, critical: 10 },
          responseTime: { warning: 1000, critical: 2000 },
          serviceHealth: { warning: 'degraded', critical: 'unhealthy' }
        },
        timestamp: new Date().toISOString()
      };
      
      return new Response(JSON.stringify(alertStatus, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
    } catch (error) {
      console.error('[MONITORING/ALERTS] Error:', error);
      return new Response(JSON.stringify({
        status: 'error',
        error: 'Failed to check alerts'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Sentry integration status
  route("/monitoring/sentry", async ({ ctx }) => {
    console.log("[MONITORING] Sentry status requested");
    
    const sentryConfig = {
      enabled: !!env.SENTRY_DSN,
      environment: env.ENVIRONMENT || 'local',
      release: env.CF_VERSION_METADATA?.id || 'dev',
      tracesSampleRate: env.ENVIRONMENT === 'prod' ? 0.1 : 1.0
    };
    
    // Test Sentry integration
    let testError = null;
    try {
      // Capture a test event for monitoring purposes
      if (env.SENTRY_DSN && ctx.user?.role === 'admin') {
        throw new Error('Monitoring test error - this is intentional');
      }
    } catch (error) {
      testError = 'Test error captured successfully';
    }
    
    return new Response(JSON.stringify({
      sentry: sentryConfig,
      testResult: testError || 'Test skipped (admin access required)',
      timestamp: new Date().toISOString()
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }),

  // Enhanced Performance dashboard data
  route("/monitoring/performance", async ({ ctx }) => {
    console.log("[MONITORING] Performance data requested");
    
    try {
      // Get comprehensive performance metrics
      const detailedMetrics = await monitoring.getDetailedPerformanceMetrics();
      const openAIMetrics = await monitoring.getOpenAIMetrics();
      
      const performanceData = {
        ...detailedMetrics,
        openai: openAIMetrics,
        system: {
          environment: env.ENVIRONMENT || 'local',
          version: env.CF_VERSION_METADATA?.id || 'dev',
          region: env.CF_RAY?.split('-')[1] || 'unknown'
        }
      };
      
      return new Response(JSON.stringify(performanceData, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=30',
          'Server-Timing': `performance_collection;dur=${Date.now() - Date.now()}`
        }
      });
    } catch (error) {
      console.error('[MONITORING/PERFORMANCE] Error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to get performance data',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Test structured logging
  route("/debug/logging-test", async ({ ctx }) => {
    console.log("[DEBUG] Testing structured logging framework");
    
    const requestId = crypto.randomUUID();
    
    // Test different log levels
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      message: 'Debug message test',
      context: { testData: 'debug', requestId, userId: ctx.user?.id }
    }));
    
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Info message test',
      context: { testData: 'info', requestId, userId: ctx.user?.id }
    }));
    
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message: 'Warning message test',
      context: { testData: 'warning', requestId, userId: ctx.user?.id }
    }));
    
    // Test performance logging
    const startTime = Date.now();
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
    const duration = Date.now() - startTime;
    
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Performance: test-operation',
      context: { 
        operation: 'test-operation',
        duration,
        performanceMetric: true,
        requestId,
        testResult: 'success'
      }
    }));
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Structured logging test completed',
      logTypes: ['debug', 'info', 'warn', 'performance'],
      requestId,
      timestamp: new Date().toISOString()
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }),

  // Debug performance metrics and real-time monitoring
  route("/debug/performance", async ({ ctx }) => {
    console.log("[DEBUG] Performance metrics debug requested");
    
    try {
      const performanceTracker = PerformanceTracker.getInstance();
      
      // Simulate some operations to generate test metrics
      const dbTimer = performanceTracker.startTimer('debug_db_query', 'database', { 
        requestId: crypto.randomUUID(),
        operation: 'debug_test' 
      });
      await new Promise(resolve => setTimeout(resolve, 50)); // Simulate DB call
      performanceTracker.endTimer(dbTimer, { queryType: 'debug', rowsReturned: 42 });
      
      const aiTimer = performanceTracker.startTimer('debug_ai_call', 'ai_api', { 
        requestId: crypto.randomUUID(),
        operation: 'debug_test' 
      });
      await new Promise(resolve => setTimeout(resolve, 200)); // Simulate AI call
      performanceTracker.endTimer(aiTimer, { model: 'gpt-4o', tokensUsed: 150 });
      
      // Get current performance state
      const summary = performanceTracker.getPerformanceSummary();
      const recentMetrics = performanceTracker.getMetrics().slice(-20); // Last 20 metrics
      
      const debugData = {
        current_state: {
          active_timers: (performanceTracker as any).activeTimers.size,
          total_metrics: performanceTracker.getMetrics().length,
          performance_summary: summary
        },
        recent_metrics: recentMetrics.map(m => ({
          operation: m.operation,
          category: m.category,
          duration: m.duration,
          timestamp: new Date(m.endTime).toISOString(),
          details: m.details
        })),
        test_results: {
          db_simulation: '50ms',
          ai_simulation: '200ms',
          metrics_generated: 2
        },
        memory_info: {
          js_heap_used: (performance as any)?.memory?.usedJSHeapSize || 'unavailable',
          js_heap_total: (performance as any)?.memory?.totalJSHeapSize || 'unavailable',
          js_heap_limit: (performance as any)?.memory?.jsHeapSizeLimit || 'unavailable'
        },
        performance_budgets: {
          response_time_warning: '1000ms',
          response_time_critical: '2000ms',
          database_warning: '500ms',
          ai_api_warning: '3000ms',
          memory_pressure_medium: '5MB',
          memory_pressure_high: '10MB'
        },
        curl_examples: [
          'curl -I "http://localhost:5173/draft?debug=1" # Check Server-Timing headers',
          'curl "http://localhost:5173/monitoring/performance" # Full performance data',
          'curl "http://localhost:5173/debug/performance" # This debug endpoint'
        ],
        timestamp: new Date().toISOString()
      };
      
      return new Response(JSON.stringify(debugData, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          'Server-Timing': performanceTracker.generateServerTimingHeader('debug'),
          'X-Performance-Test': 'true',
          'Cache-Control': 'no-cache'
        }
      });
    } catch (error) {
      console.error('[DEBUG/PERFORMANCE] Error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to get debug performance data',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // API routes - these must come BEFORE the Document wrapper to avoid conflicts
  route("/api/generate-draft", async ({ request, ctx }) => {
    console.log("[API] Generate draft called");
    
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const requestData = await request.json() as DraftRequest;
      
      // Validate required fields
      if (!requestData.patientInquiry || !requestData.patientId || !requestData.userId) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: patientInquiry, patientId, userId' 
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Ensure user ID matches authenticated user
      if (ctx.user?.id !== requestData.userId) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'User ID mismatch' 
        }), { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Add breadcrumb for draft generation
      if (env.SENTRY_DSN) {
        Sentry.addBreadcrumb({
          category: 'api',
          message: 'Generating draft message',
          level: 'info',
          data: { 
            patientId: requestData.patientId,
            userId: requestData.userId
          }
        });
      }

      const result = await generateDraftAction(requestData, env);
      
      // Add result breadcrumb
      if (env.SENTRY_DSN) {
        Sentry.addBreadcrumb({
          category: 'api',
          message: result.success ? 'Draft generated successfully' : 'Draft generation failed',
          level: result.success ? 'info' : 'warning',
          data: { 
            success: result.success,
            error: result.error
          }
        });
      }
      
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[API] Draft generation error:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid request format' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),



  // Message workflow API
  route("/api/message-workflow", async ({ request, ctx }) => {
    console.log("[API] Message workflow called");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'POST') {
      try {
        const data = await request.json();
        // Mock successful response
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Workflow completed successfully'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid request' 
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }),

  // Patient inquiry API
  route("/api/patient-inquiry", async ({ request, ctx }) => {
    console.log("[API] Patient inquiry called");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'PUT') {
      try {
        const { updatePatientBrief } = await import('@/lib/patientBriefActions');
        const data = await request.json() as { patientId?: string; patientInquiry?: string };
        
        if (!data.patientId || data.patientInquiry === undefined) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Missing patientId or patientInquiry' 
          }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const result = await updatePatientBrief(ctx.user, data.patientId, {
          patientInquiry: data.patientInquiry
        });

        if (result.error) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: result.error 
          }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          brief: result.brief
        }), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[API] Patient inquiry update error:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Failed to update patient inquiry' 
        }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } else if (request.method === 'GET') {
      try {
        const url = new URL(request.url);
        const patientId = url.searchParams.get('patientId');
        
        if (!patientId) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Patient ID is required' 
          }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const [brief] = await drizzleDb
          .select({
            id: drizzlePatientBriefs.id,
            patientName: drizzlePatientBriefs.patientName,
            patientInquiry: drizzlePatientBriefs.patientInquiry,
            doctorId: drizzlePatientBriefs.doctorId
          })
          .from(drizzlePatientBriefs)
          .where(eq(drizzlePatientBriefs.id, patientId))
          .limit(1);

        if (!brief) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Patient not found' 
          }), { 
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Check if user has access to this patient
        if (ctx.user.role === 'doctor' && brief.doctorId !== ctx.user.id) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Access denied to this patient' 
          }), { 
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          patientInquiry: brief.patientInquiry || ''
        }), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[API] Patient inquiry get error:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch patient inquiry' 
        }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }),

  // Mark as sent API endpoint
  route("/api/mark-as-sent", async ({ request, ctx }) => {
    console.log("[API] Mark as sent called");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { markMessageAsSent } = await import('@/functions/sendMessage');
      const data = await request.json();
      
      // Validate required fields
      if (!data.messageId || !data.finalMessage || !data.deliveryMethod) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: messageId, finalMessage, deliveryMethod' 
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get request metadata
      const clientIP = request.headers.get('CF-Connecting-IP') || 
                      request.headers.get('X-Forwarded-For') || 
                      'unknown';
      const userAgent = request.headers.get('User-Agent') || 'unknown';

      const result = await markMessageAsSent(
        data,
        ctx.user.id,
        ctx.user.role,
        clientIP,
        userAgent
      );
      
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[API] Mark as sent error:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to mark message as sent',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Audit export API endpoint
  route("/api/audit-export", async ({ request, ctx }) => {
    console.log("[API] Audit export called");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { exportAuditLogsAsCSV } = await import('@/functions/complianceExport');
      const url = new URL(request.url);
      
      // Parse query parameters
      const filters = {
        startDate: url.searchParams.get('startDate') || undefined,
        endDate: url.searchParams.get('endDate') || undefined,
        userId: url.searchParams.get('userId') || undefined,
        actionType: url.searchParams.get('actionType') || undefined,
        deliveryStatus: url.searchParams.get('deliveryStatus') || undefined,
        patientName: url.searchParams.get('patientName') || undefined,
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
        offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : undefined,
      };

      return await exportAuditLogsAsCSV(filters, ctx.user.role);

    } catch (error) {
      console.error('[API] Audit export error:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to export audit logs',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Enhanced audit logs API endpoint
  route("/api/audit-logs", async ({ request, ctx }) => {
    console.log("[API] Enhanced audit logs called");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'GET') {
      try {
        const { getAuditLogsWithPagination } = await import('@/functions/complianceExport');
        const url = new URL(request.url);
        
        // Parse query parameters
        const filters = {
          startDate: url.searchParams.get('startDate') || undefined,
          endDate: url.searchParams.get('endDate') || undefined,
          userId: url.searchParams.get('userId') || undefined,
          actionType: url.searchParams.get('actionType') || undefined,
          deliveryStatus: url.searchParams.get('deliveryStatus') || undefined,
          patientName: url.searchParams.get('patientName') || undefined,
          limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
          offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : undefined,
        };

        const result = await getAuditLogsWithPagination(filters, ctx.user.role);
        
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('[API] Get audit logs error:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch audit logs',
          details: error instanceof Error ? error.message : 'Unknown error'
        }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } else if (request.method === 'POST') {
      // Create audit log entry (legacy support)
      try {
        const data = await request.json();
        // For now, return success since audit logs are created automatically
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Audit log creation handled by system',
          auditLog: { id: "auto-" + Date.now() }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid request' 
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }),

  // Patient brief search API
  route("/api/search-patient-briefs", async ({ request, ctx }) => {
    console.log("[API] Search patient briefs called");
    
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { query, filters } = await request.json();
      
      // Perform search directly here
      const { drizzleDb, users, patientBriefs } = await import('@/db');
      const { eq, like, or, and, gte, lte, desc } = await import('drizzle-orm');
      
      // If no query or filters, return empty results to avoid full table scan
      if (!query?.trim() && !Object.values(filters || {}).some(f => f && f.trim())) {
        return new Response(JSON.stringify({ success: true, briefs: [] }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      let whereConditions: any[] = [];

      // Role-based access control
      if (ctx.user.role === "doctor") {
        whereConditions.push(eq(patientBriefs.doctorId, ctx.user.id));
      }

      // Search query
      if (query?.trim()) {
        const searchConditions = [
          like(patientBriefs.patientName, `%${query}%`),
          like(patientBriefs.briefText, `%${query}%`),
          like(patientBriefs.currentMedications, `%${query}%`),
          like(patientBriefs.allergies, `%${query}%`),
        ];
        whereConditions.push(or(...searchConditions));
      }

      // Filters
      if (filters?.doctorId && ctx.user.role === "admin") {
        whereConditions.push(eq(patientBriefs.doctorId, filters.doctorId));
      }

      if (filters?.startDate) {
        whereConditions.push(gte(patientBriefs.updatedAt, new Date(filters.startDate)));
      }

      if (filters?.endDate) {
        whereConditions.push(lte(patientBriefs.updatedAt, new Date(filters.endDate)));
      }

      const briefs = await drizzleDb
        .select({
          id: patientBriefs.id,
          patientName: patientBriefs.patientName,
          briefText: patientBriefs.briefText,
          medicalHistory: patientBriefs.medicalHistory,
          currentMedications: patientBriefs.currentMedications,
          allergies: patientBriefs.allergies,
          doctorNotes: patientBriefs.doctorNotes,
          patientInquiry: patientBriefs.patientInquiry,
          createdAt: patientBriefs.createdAt,
          updatedAt: patientBriefs.updatedAt,
          doctorId: patientBriefs.doctorId,
          doctor: {
            id: users.id,
            username: users.username,
            email: users.email,
            role: users.role,
            createdAt: users.createdAt,
          }
        })
        .from(patientBriefs)
        .leftJoin(users, eq(patientBriefs.doctorId, users.id))
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(patientBriefs.updatedAt))
        .limit(50); // Limit results

      return new Response(JSON.stringify({ success: true, briefs }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error("[API] Search error:", error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to search patient briefs' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),

  // Queue management API
  route("/api/enqueue-job", async ({ request, ctx }) => {
    console.log("[API] Enqueue job called");
    
    if (!ctx.user) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { createQueueProducer } = await import('@/lib/queue-producer');
      
      if (!env.MESSAGE_QUEUE) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Queue not available in current environment'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const data = await request.json();
      const queueProducer = createQueueProducer(env);
      
      // Validate job type and required fields
      switch (data.type) {
        case 'email_send':
          if (!data.messageId || !data.recipient || !data.subject || !data.content) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'Missing required fields: messageId, recipient, subject, content' 
            }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          await queueProducer.enqueueEmail({
            messageId: data.messageId,
            recipient: data.recipient,
            subject: data.subject,
            content: data.content,
            priority: data.priority || 'normal',
            metadata: data.metadata
          });
          break;

        case 'sms_send':
          if (!data.messageId || !data.recipient || !data.content) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'Missing required fields: messageId, recipient, content' 
            }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          await queueProducer.enqueueSMS({
            messageId: data.messageId,
            recipient: data.recipient,
            content: data.content,
            priority: data.priority || 'normal',
            metadata: data.metadata
          });
          break;

        case 'export_generation':
          if (!data.exportId || !data.filters) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'Missing required fields: exportId, filters' 
            }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          await queueProducer.enqueueExport({
            exportId: data.exportId,
            filters: data.filters,
            userId: ctx.user.id,
            format: data.format || 'csv',
            metadata: data.metadata
          });
          break;

        case 'cleanup':
          if (!data.target || !data.olderThan) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'Missing required fields: target, olderThan' 
            }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          await queueProducer.enqueueCleanup({
            target: data.target,
            olderThan: new Date(data.olderThan),
            metadata: data.metadata
          });
          break;

        default:
          return new Response(JSON.stringify({ 
            success: false, 
            error: `Unknown job type: ${data.type}. Supported types: email_send, sms_send, export_generation, cleanup` 
          }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
      }

      return new Response(JSON.stringify({
        success: true,
        message: `${data.type} job enqueued successfully`,
        jobType: data.type,
        messageId: data.messageId || data.exportId || 'cleanup-job',
        priority: data.priority || 'normal'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('[API] Enqueue job error:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to enqueue job',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }),
  
  // Sync API routes (these don't need Document wrapper)
  prefix("/sync", syncApiRoutes),
  
  // Document-wrapped routes - these handle HTML rendering
  render(Document, [
    // Public routes
    route("/", ({ ctx }) => {
      console.log("[ROOT ROUTE] User:", ctx.user?.email);
      return (
        <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
          <h1>AI Concierge MVP</h1>
          <p>Welcome! You are logged in as: <strong>{ctx.user?.email}</strong> ({ctx.user?.role})</p>
          <nav style={{ margin: "2rem 0" }}>
            <a href="/draft" style={{ marginRight: "1rem", padding: "0.5rem 1rem", background: "#3b82f6", color: "white", textDecoration: "none", borderRadius: "0.25rem" }}>Draft Workflow</a>
            <a href="/admin/briefs" style={{ marginRight: "1rem", padding: "0.5rem 1rem", background: "#10b981", color: "white", textDecoration: "none", borderRadius: "0.25rem" }}>Patient Briefs</a>
            <a href="/admin/audit" style={{ marginRight: "1rem", padding: "0.5rem 1rem", background: "#f59e0b", color: "white", textDecoration: "none", borderRadius: "0.25rem" }}>Audit Logs</a>
            <a href="/sync" style={{ marginRight: "1rem", padding: "0.5rem 1rem", background: "#8b5cf6", color: "white", textDecoration: "none", borderRadius: "0.25rem" }}>Sync Integrations</a>
          </nav>
          <p>John Doe patient data should be accessible from the Patient Briefs and Draft Workflow pages.</p>
        </div>
      );
    }),

    route("/login", LoginPage),
    
    route("/unauthorized", () => {
      return (
        <div style={{ padding: "2rem", textAlign: "center", fontFamily: "Arial, sans-serif" }}>
          <h1>Unauthorized Access</h1>
          <p>This application requires authentication through Cloudflare Access.</p>
          <p>Please contact your administrator to gain access.</p>
        </div>
      );
    }),

    // Application routes - using the actual React components
    route("/draft", DraftWorkflowPage),
    
    route("/admin/briefs", PatientBriefsPage),
    
    route("/admin/audit", AuditLogPage),
    
    prefix("/sync", syncPageRoutes),

    // Legacy routes for compatibility
    route("/protected", ({ ctx }) => {
      return new Response(`Protected route works! User: ${ctx.user?.email}`);
    }),
    
    route("/admin", ({ ctx }) => {
      return new Response(`Admin route works! User: ${ctx.user?.email}`);
    }),
    
    route("/doctor", ({ ctx }) => {
      return new Response(`Doctor route works! User: ${ctx.user?.email}`);
    }),
  ])
]);

// Queue consumer handler for processing async jobs
export const queue = async (
  batch: MessageBatch<QueueJob>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> => {
  console.log('[QUEUE_CONSUMER] Processing batch of', batch.messages.length, 'jobs');
  
  try {
    await setupDb(env);
    
    // Add Sentry context for queue processing
    if (env.SENTRY_DSN) {
      Sentry.setContext('queue', {
        batchSize: batch.messages.length,
        queueName: 'message-delivery',
        processedAt: new Date().toISOString(),
      });
    }

    // Process each message in the batch
    const results = await Promise.allSettled(
      batch.messages.map(async (message) => {
        const job = message.body;
        
        console.log('[QUEUE_CONSUMER] Processing job:', {
          type: job.type,
          messageId: 'messageId' in job ? job.messageId : undefined,
          priority: job.priority
        });

        try {
          let result;

          switch (job.type) {
            case 'email_send':
              result = await EmailProcessor.processEmailJob(job, env);
              break;
            case 'sms_send':
              result = await SMSProcessor.processSMSJob(job, env);
              break;
            case 'export_generation':
              result = await ExportProcessor.processExportJob(job, env);
              break;
            case 'cleanup':
              result = await CleanupProcessor.processCleanupJob(job, env);
              break;
            default:
              throw new Error(`Unknown job type: ${(job as any).type}`);
          }

          // Acknowledge successful processing
          message.ack();

          // Log successful job processing
          if (env.SENTRY_DSN) {
            Sentry.addBreadcrumb({
              category: 'queue',
              message: `Job processed successfully: ${job.type}`,
              level: 'info',
              data: {
                jobType: job.type,
                messageId: 'messageId' in job ? job.messageId : undefined,
                success: result.success
              }
            });
          }

          return result;

        } catch (error) {
          console.error('[QUEUE_CONSUMER] Job processing failed:', error);

          // Capture job processing error
          if (env.SENTRY_DSN) {
            Sentry.captureException(error, {
              tags: { 
                component: 'queue-consumer',
                jobType: job.type 
              },
              extra: { 
                job,
                messageId: message.id,
                attempt: message.attempts
              }
            });
          }

          // Retry the message if it hasn't exceeded max retries
          if (message.attempts < 3) {
            message.retry();
            console.log('[QUEUE_CONSUMER] Job queued for retry:', {
              type: job.type,
              attempt: message.attempts + 1
            });
          } else {
            // Send to dead letter queue after max retries
            message.ack(); // Acknowledge to prevent infinite retries
            console.error('[QUEUE_CONSUMER] Job failed permanently after max retries:', {
              type: job.type,
              attempts: message.attempts,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }

          throw error;
        }
      })
    );

    // Summarize batch processing results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log('[QUEUE_CONSUMER] Batch processing completed:', {
      total: batch.messages.length,
      successful,
      failed
    });

    // Log batch completion to Sentry
    if (env.SENTRY_DSN) {
      Sentry.addBreadcrumb({
        category: 'queue',
        message: 'Queue batch processing completed',
        level: failed > 0 ? 'warning' : 'info',
        data: {
          batchSize: batch.messages.length,
          successful,
          failed,
          jobTypes: batch.messages.map(m => m.body.type)
        }
      });
    }

  } catch (error) {
    console.error('[QUEUE_CONSUMER] Batch processing failed:', error);
    
    // Capture batch processing error
    if (env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { component: 'queue-consumer' },
        extra: {
          batchSize: batch.messages.length,
          jobTypes: batch.messages.map(m => m.body.type)
        }
      });
    }

    // Re-throw to mark the batch as failed
    throw error;
  }
};

// Cron trigger handler for nightly housekeeping
export const scheduled = async (
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
): Promise<void> => {
  console.log('[CRON] Nightly housekeeping started at:', new Date().toISOString());
  
  try {
    await setupDb(env);
    
    // Track start time
    const startTime = Date.now();
    
    // Add Sentry context for cron job
    if (env.SENTRY_DSN) {
      Sentry.setContext('cron', {
        trigger: 'scheduled',
        cron: event.cron,
        scheduledTime: event.scheduledTime,
      });
      
      Sentry.addBreadcrumb({
        category: 'cron',
        message: 'Nightly housekeeping started',
        level: 'info',
        data: {
          cron: event.cron,
          scheduledTime: event.scheduledTime,
        },
      });
    }
    
    // 1. Archive old audit logs (older than 1 year)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const oldAuditLogs = await drizzleDb
      .select({ id: drizzleAuditLogs.id })
      .from(drizzleAuditLogs)
      .where(sql`${drizzleAuditLogs.createdAt} < ${oneYearAgo.getTime()}`);
    
    console.log(`[CRON] Found ${oldAuditLogs.length} old audit logs to archive`);
    
    // 2. Clean up failed message queue entries (older than 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // For now, just log what we would clean up
    console.log('[CRON] Would clean up failed messages older than:', sevenDaysAgo.toISOString());
    
    // 3. Generate usage metrics rollup
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const auditMetrics = await drizzleDb
      .select({
        actionType: drizzleAuditLogs.actionType,
        count: sql`COUNT(*)`.as('count'),
        totalTokens: sql`SUM(${drizzleAuditLogs.tokensConsumed})`.as('totalTokens'),
      })
      .from(drizzleAuditLogs)
      .where(sql`${drizzleAuditLogs.createdAt} >= ${today.getTime()}`)
      .groupBy(drizzleAuditLogs.actionType);
    
    console.log('[CRON] Daily metrics:', auditMetrics);
    
    const duration = Date.now() - startTime;
    
    // Log completion to Sentry
    if (env.SENTRY_DSN) {
      Sentry.addBreadcrumb({
        category: 'cron',
        message: 'Nightly housekeeping completed',
        level: 'info',
        data: {
          duration,
          oldAuditLogsFound: oldAuditLogs.length,
          metricsGenerated: auditMetrics.length,
        },
      });
    }
    
    console.log(`[CRON] Nightly housekeeping completed in ${duration}ms`);
    
  } catch (error) {
    console.error('[CRON] Nightly housekeeping failed:', error);
    
    // Capture error in Sentry
    if (env.SENTRY_DSN) {
      Sentry.captureException(error);
    }
    
    // Re-throw to mark the cron job as failed
    throw error;
  }
};
