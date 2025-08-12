import { createRateLimitMiddleware } from './rateLimiter';
import { createWAFMiddleware } from './waf';
import { createDDoSMiddleware } from './ddosProtection';
import { createSecurityMonitoringMiddleware } from '../lib/securityMonitoring';
import { createCSPReportMiddleware, createSecurityValidationMiddleware } from './securityHeaders';
import { PerformanceTracker } from '../lib/logger';

/**
 * Security Gateway - Comprehensive security middleware orchestrator
 */
export class SecurityGateway {
  private rateLimitMiddleware: Function;
  private wafMiddleware: Function;
  private ddosMiddleware: Function;
  private cspReportMiddleware: Function;
  private securityValidationMiddleware: Function;
  private monitoringMiddleware: any;
  private env: any;

  constructor(env: any) {
    this.env = env;
    this.rateLimitMiddleware = createRateLimitMiddleware(env);
    this.wafMiddleware = createWAFMiddleware(env);
    this.ddosMiddleware = createDDoSMiddleware(env);
    this.cspReportMiddleware = createCSPReportMiddleware(env);
    this.securityValidationMiddleware = createSecurityValidationMiddleware();
    this.monitoringMiddleware = createSecurityMonitoringMiddleware(env);
  }

  /**
   * Main security gateway middleware function
   */
  async processRequest(
    request: Request,
    user?: { id: string; role: string }
  ): Promise<Response | null> {
    const perf = PerformanceTracker.getInstance();
    const timer = perf.startTimer('security_gateway', 'middleware');

    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

      // Handle security monitoring endpoints first
      if (path.startsWith('/debug/security') || path.startsWith('/monitoring/security')) {
        perf.endTimer(timer);
        return await this.monitoringMiddleware.handleDebugSecurity(request);
      }

      // Handle CSP violation reports
      if (path === '/security/csp-report' && method === 'POST') {
        perf.endTimer(timer);
        return await this.cspReportMiddleware(request);
      }

      // Handle security headers validation
      const validationResponse = await this.securityValidationMiddleware(request);
      if (validationResponse) {
        perf.endTimer(timer);
        return validationResponse;
      }

      // Skip security checks for certain paths (like health checks)
      const skipPaths = ['/health', '/ping', '/favicon.ico', '/_next/', '/assets/'];
      if (skipPaths.some(skipPath => path.startsWith(skipPath))) {
        perf.endTimer(timer);
        return null;
      }

      // Phase 1: WAF Analysis (first line of defense)
      console.log(`🛡️ Security Gateway: Analyzing request ${method} ${path} from ${clientIP}`);
      
      const wafResult = await this.wafMiddleware(request);
      if (wafResult) {
        await this.logSecurityEvent('waf_block', {
          path,
          method,
          clientIP,
          reason: 'WAF blocked request'
        });
        perf.endTimer(timer);
        return wafResult;
      }

      // Phase 2: Rate Limiting (prevent abuse)
      const rateLimitResult = await this.rateLimitMiddleware(request, user);
      if (rateLimitResult) {
        await this.logSecurityEvent('rate_limit_exceeded', {
          path,
          method,
          clientIP,
          user_id: user?.id,
          reason: 'Rate limit exceeded'
        });
        perf.endTimer(timer);
        return rateLimitResult;
      }

      // Phase 3: DDoS Protection (pattern analysis)
      const ddosResult = await this.ddosMiddleware(request, user);
      if (ddosResult) {
        await this.logSecurityEvent('ddos_block', {
          path,
          method,
          clientIP,
          user_id: user?.id,
          reason: 'DDoS protection triggered'
        });
        perf.endTimer(timer);
        return ddosResult;
      }

      // All security checks passed
      console.log(`✅ Security Gateway: Request allowed ${method} ${path} from ${clientIP}`);
      
      // Log successful request for monitoring
      await this.logSecurityEvent('request_allowed', {
        path,
        method,
        clientIP,
        user_id: user?.id,
        user_role: user?.role
      });

      perf.endTimer(timer);
      return null; // Allow request to continue

    } catch (error) {
      perf.endTimer(timer);
      console.error('Security Gateway error:', error);
      
      // Log error but allow request to continue (fail-open for availability)
      await this.logSecurityEvent('security_error', {
        error: error.message,
        path: url.pathname,
        method: request.method,
        clientIP: request.headers.get('CF-Connecting-IP')
      });
      
      return null;
    }
  }

  /**
   * Post-process response to add security headers and monitoring
   */
  async processResponse(
    request: Request,
    response: Response,
    user?: { id: string; role: string }
  ): Promise<Response> {
    try {
      // Extract timing information for anomaly detection
      const responseTime = (request as any).responseTime || 0;
      const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

      // Update DDoS monitoring with response time
      if (responseTime > 0) {
        // This would be used by the DDoS middleware for pattern analysis
        (request as any).responseTime = responseTime;
      }

      // Add rate limiting headers if available
      const rateLimitHeaders = (request as any).rateLimitHeaders;
      if (rateLimitHeaders) {
        const newHeaders = new Headers(response.headers);
        Object.entries(rateLimitHeaders).forEach(([key, value]) => {
          newHeaders.set(key, value as string);
        });
        
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders
        });
      }

      return response;
    } catch (error) {
      console.error('Security Gateway response processing error:', error);
      return response; // Return original response on error
    }
  }

  /**
   * Log security events for monitoring and alerting
   */
  private async logSecurityEvent(eventType: string, data: any): Promise<void> {
    try {
      // Update security statistics
      await this.monitoringMiddleware.monitoring.updateSecurityStats('waf', {
        totalAnalyzed: 1,
        lastEventTime: new Date().toISOString()
      });

      // Log to Sentry for critical events
      const criticalEvents = ['waf_block', 'ddos_block', 'security_error'];
      if (criticalEvents.includes(eventType) && typeof Sentry !== 'undefined') {
        console.warn(`Security Gateway: ${eventType}`, {
          level: 'warning',
          tags: {
            security_event: eventType,
            environment: this.env.ENVIRONMENT
          },
          extra: data
        });
      }

      // Create security alert for high-severity events
      if (['waf_block', 'ddos_block'].includes(eventType)) {
        await this.monitoringMiddleware.monitoring.recordAlert({
          type: eventType.includes('waf') ? 'waf' : 'ddos',
          severity: 'medium',
          message: `Security event: ${eventType}`,
          clientIP: data.clientIP,
          userAgent: data.userAgent,
          details: data
        });
      }

    } catch (error) {
      console.error('Error logging security event:', error);
    }
  }

  /**
   * Get security gateway status
   */
  async getStatus(): Promise<{
    enabled: boolean;
    components: Record<string, boolean>;
    environment: string;
    lastCheck: string;
  }> {
    return {
      enabled: true,
      components: {
        rateLimiting: this.env.SECURITY_RATE_LIMIT_IP !== undefined,
        waf: this.env.SECURITY_ENABLE_WAF === 'true',
        ddosProtection: this.env.SECURITY_DDOS_THRESHOLD !== undefined,
        monitoring: true,
        securityHeaders: true
      },
      environment: this.env.ENVIRONMENT || 'unknown',
      lastCheck: new Date().toISOString()
    };
  }
}

/**
 * Security Gateway middleware factory function
 */
export function createSecurityGateway(env: any) {
  const gateway = new SecurityGateway(env);

  return {
    gateway,
    
    /**
     * Pre-request middleware
     */
    async beforeRequest(
      request: Request,
      user?: { id: string; role: string }
    ): Promise<Response | null> {
      return await gateway.processRequest(request, user);
    },

    /**
     * Post-response middleware
     */
    async afterResponse(
      request: Request,
      response: Response,
      user?: { id: string; role: string }
    ): Promise<Response> {
      return await gateway.processResponse(request, response, user);
    },

    /**
     * Status endpoint
     */
    async getStatus(): Promise<any> {
      return await gateway.getStatus();
    }
  };
}

/**
 * Helper function to apply security gateway to a request
 */
export async function applySecurityGateway(
  request: Request,
  env: any,
  user?: { id: string; role: string }
): Promise<Response | null> {
  const { beforeRequest } = createSecurityGateway(env);
  return await beforeRequest(request, user);
}
