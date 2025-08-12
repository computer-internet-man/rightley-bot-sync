import * as Sentry from '@sentry/cloudflare';
import worker from './worker.tsx';
import { env } from 'cloudflare:workers';
import { PerformanceTracker, generateRequestId } from './lib/logger';

// Enhanced Sentry configuration with custom tags and performance monitoring
export default {
  async fetch(request: Request, environment: any, context: ExecutionContext): Promise<Response> {
    // Initialize Sentry only if DSN is provided
    if (environment.SENTRY_DSN) {
      Sentry.init({
        dsn: environment.SENTRY_DSN,
        environment: environment.ENVIRONMENT || 'local',
        tracesSampleRate: environment.ENVIRONMENT === 'prod' ? 0.1 : 1.0,
        release: environment.CF_VERSION_METADATA?.id || 'dev',
        beforeSend: (event) => {
          // In development, log errors to console as well
          if (environment.ENVIRONMENT === 'local') {
            console.log('[SENTRY] Capturing error:', event.exception);
          }
          
          // Add custom tags for enhanced observability
          event.tags = {
            ...event.tags,
            worker_version: environment.CF_VERSION_METADATA?.id || 'dev',
            deployment_environment: environment.ENVIRONMENT || 'local',
            cf_region: environment.CF_RAY?.split('-')[1] || 'unknown',
            feature_flags: environment.FEATURE_FLAGS || 'none'
          };
          
          // Remove sensitive data from event
          if (event.extra) {
            delete event.extra.authToken;
            delete event.extra.apiKey;
            delete event.extra.patientData;
            delete event.extra.medicalInfo;
          }
          
          return event;
        },
        integrations: [
          Sentry.cloudflareIntegration(),
        ],
        // Enhanced performance monitoring
        beforeSendTransaction: (event) => {
          // Add business context to performance events
          event.tags = {
            ...event.tags,
            endpoint_category: getEndpointCategory(event.transaction || ''),
            is_authenticated: event.contexts?.user?.id ? 'true' : 'false'
          };
          return event;
        }
      });

      // Set global tags
      Sentry.setTag('service', 'ai-concierge');
      Sentry.setTag('component', 'worker');
    }

    // Wrap the main worker handler with Sentry instrumentation
    return Sentry.withSentry(
      environment,
      request,
      context,
      async () => {
        const startTime = Date.now();
        const url = new URL(request.url);
        const requestId = generateRequestId();
        const performanceTracker = PerformanceTracker.getInstance();
        
        // Start comprehensive performance tracking
        const requestTimerId = performanceTracker.startTimer('http_request', 'middleware', { 
          requestId,
          endpoint: url.pathname,
          httpMethod: request.method 
        });
        
        // Create custom span for request processing
        const span = Sentry.getActiveSpan();
        if (span) {
          span.setAttributes({
            'http.method': request.method,
            'http.url': url.pathname,
            'http.route': getRoutePattern(url.pathname),
            'user.authenticated': false, // Will be updated if auth is found
            'request.id': requestId
          });
        }
        
        try {
          // Track memory usage at request start (if available)
          const memoryUsage = (performance as any)?.memory?.usedJSHeapSize;
          
          const response = await worker.fetch(request, environment, context);
          
          // End performance tracking
          const totalDuration = Date.now() - startTime;
          performanceTracker.endTimer(requestTimerId, { 
            statusCode: response.status,
            responseSize: response.headers.get('content-length') || '0',
            memoryDelta: memoryUsage ? ((performance as any)?.memory?.usedJSHeapSize - memoryUsage) : undefined
          });
          
          // Generate comprehensive Server-Timing headers
          const performanceTimings = performanceTracker.generateServerTimingHeader(requestId);
          const baseTimings = [
            `total;dur=${totalDuration}`,
            `worker;dur=${totalDuration}`,
            `env="${environment.ENVIRONMENT || 'local'}"`,
            `version="${environment.CF_VERSION_METADATA?.id || 'dev'}"`,
            `request_id="${requestId}"`
          ];
          
          const allTimings = performanceTimings 
            ? `${baseTimings.join(', ')}, ${performanceTimings}`
            : baseTimings.join(', ');
          
          response.headers.set('Server-Timing', allTimings);
          
          // Add performance context to response headers for debugging
          if (url.searchParams.has('debug')) {
            response.headers.set('X-Performance-Request-ID', requestId);
            response.headers.set('X-Performance-Total-Duration', totalDuration.toString());
          }
          
          // Update span with response info
          if (span) {
            span.setAttributes({
              'http.status_code': response.status,
              'http.response_size': response.headers.get('content-length') || '0',
              'performance.total_duration': totalDuration
            });
          }
          
          // Track business metrics with enhanced context
          if (environment.SENTRY_DSN) {
            trackBusinessMetrics(url.pathname, response.status, totalDuration, {
              requestId,
              memoryUsage,
              performanceMetrics: performanceTracker.getMetrics(requestId).length
            });
          }
          
          // Clean up request-specific metrics after response
          context.waitUntil(new Promise(resolve => {
            setTimeout(() => {
              performanceTracker.clearMetrics(requestId);
              resolve(void 0);
            }, 60000); // Clean up after 1 minute
          }));
          
          return response;
        } catch (error) {
          // End performance tracking for failed requests
          performanceTracker.endTimer(requestTimerId, { 
            error: (error as Error).message,
            errorType: (error as Error).name
          });
          
          // Enhanced error capture with context
          if (environment.SENTRY_DSN) {
            Sentry.withScope((scope) => {
              scope.setTag('endpoint', url.pathname);
              scope.setTag('method', request.method);
              scope.setTag('request_id', requestId);
              scope.setLevel('error');
              scope.setContext('request', {
                url: url.pathname,
                method: request.method,
                userAgent: request.headers.get('user-agent'),
                timestamp: new Date().toISOString(),
                requestId
              });
              scope.setContext('performance', {
                totalDuration: Date.now() - startTime,
                metrics: performanceTracker.getMetrics(requestId)
              });
              Sentry.captureException(error);
            });
          }
          throw error;
        }
      }
    );
  },

  async queue(batch: MessageBatch, environment: any, context: ExecutionContext): Promise<void> {
    if (environment.SENTRY_DSN) {
      Sentry.init({
        dsn: environment.SENTRY_DSN,
        environment: environment.ENVIRONMENT || 'local',
        tracesSampleRate: 1.0,
        release: environment.CF_VERSION_METADATA?.id || 'dev',
      });
    }

    return Sentry.withSentry(
      environment,
      {} as Request, // Queue handlers don't have request objects
      context,
      async () => {
        if (worker.queue) {
          return worker.queue(batch, environment, context);
        }
      }
    );
  },

  async scheduled(event: ScheduledEvent, environment: any, context: ExecutionContext): Promise<void> {
    if (environment.SENTRY_DSN) {
      Sentry.init({
        dsn: environment.SENTRY_DSN,
        environment: environment.ENVIRONMENT || 'local',
        tracesSampleRate: 1.0,
        release: environment.CF_VERSION_METADATA?.id || 'dev',
      });
    }

    return Sentry.withSentry(
      environment,
      {} as Request, // Scheduled handlers don't have request objects
      context,
      async () => {
        if (worker.scheduled) {
          return worker.scheduled(event, environment, context);
        }
      }
    );
  },
};

// Helper functions for enhanced observability
function getEndpointCategory(path: string): string {
  if (path.startsWith('/api/')) return 'api';
  if (path.startsWith('/debug/')) return 'debug';
  if (path.startsWith('/monitoring/')) return 'monitoring';
  if (path.startsWith('/auth/')) return 'auth';
  if (path.includes('draft')) return 'draft';
  if (path.includes('message')) return 'message';
  return 'static';
}

function getRoutePattern(path: string): string {
  // Convert dynamic routes to patterns for better grouping
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/user\/[^\/]+/g, '/user/:id');
}

function trackBusinessMetrics(path: string, statusCode: number, duration: number, context?: {
  requestId?: string;
  memoryUsage?: number;
  performanceMetrics?: number;
}): void {
  // Track key business events in Sentry
  const category = getEndpointCategory(path);
  
  if (category === 'draft' && statusCode === 200) {
    Sentry.addBreadcrumb({
      message: 'Draft generated successfully',
      category: 'business.draft',
      level: 'info',
      data: { 
        duration, 
        ...context,
        performance_category: 'ai_api'
      }
    });
  }
  
  if (category === 'message' && statusCode === 200) {
    Sentry.addBreadcrumb({
      message: 'Message processed successfully',
      category: 'business.message',
      level: 'info',
      data: { 
        duration, 
        ...context,
        performance_category: 'database'
      }
    });
  }
  
  if (statusCode >= 500) {
    Sentry.addBreadcrumb({
      message: 'Server error occurred',
      category: 'error.server',
      level: 'error',
      data: { 
        path, 
        statusCode, 
        duration, 
        ...context,
        performance_impact: duration > 2000 ? 'high' : 'normal'
      }
    });
  }
  
  // Track performance alerts
  if (duration > 2000) {
    Sentry.addBreadcrumb({
      message: 'Slow request detected',
      category: 'performance.slow_request',
      level: 'warning',
      data: {
        path,
        duration,
        statusCode,
        threshold_exceeded: '2000ms',
        ...context
      }
    });
  }
  
  // Track memory pressure if available
  if (context?.memoryUsage && context.memoryUsage > 50 * 1024 * 1024) { // 50MB
    Sentry.addBreadcrumb({
      message: 'High memory usage detected',
      category: 'performance.memory',
      level: 'warning',
      data: {
        memoryUsage: context.memoryUsage,
        path,
        ...context
      }
    });
  }
}
