import { RouteMiddleware } from "rwsdk/router";
import { IS_DEV } from "rwsdk/constants";

/**
 * Enhanced security headers middleware with comprehensive protection
 */
export const setEnhancedSecurityHeaders =
  (env?: any): RouteMiddleware =>
  ({ headers, rw: { nonce } }) => {
    // Strict Transport Security (HSTS) - Force HTTPS
    if (!IS_DEV) {
      headers.set(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload"
      );
    }

    // Content Type Options - Prevent MIME sniffing
    headers.set("X-Content-Type-Options", "nosniff");

    // Frame Options - Prevent clickjacking
    headers.set("X-Frame-Options", "DENY");

    // XSS Protection (legacy but still useful for older browsers)
    headers.set("X-XSS-Protection", "1; mode=block");

    // Referrer Policy - Control referrer information
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    // Download Options - Prevent automatic file execution
    headers.set("X-Download-Options", "noopen");

    // Content Type Options for IE
    headers.set("X-Permitted-Cross-Domain-Policies", "none");

    // Enhanced Permissions Policy with stricter controls
    headers.set(
      "Permissions-Policy",
      [
        "geolocation=()",
        "microphone=()",
        "camera=()",
        "payment=()",
        "usb=()",
        "magnetometer=()",
        "gyroscope=()",
        "speaker=()",
        "vibrate=()",
        "fullscreen=(self)",
        "sync-xhr=()"
      ].join(", ")
    );

    // Enhanced Content Security Policy
    const cspParts = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "media-src 'self'",
      "frame-src https://challenges.cloudflare.com",
      "worker-src 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests"
    ];

    // Add CSP reporting if environment variable is set
    if (env?.CSP_REPORT_URI) {
      cspParts.push(`report-uri ${env.CSP_REPORT_URI}`);
    }

    headers.set("Content-Security-Policy", cspParts.join("; "));

    // Security monitoring headers
    headers.set("X-Security-Framework", "RedwoodSDK-WAF");
    headers.set("X-Security-Version", "1.0");

    // Rate limiting headers (if available from previous middleware)
    const rateLimitHeaders = (globalThis as any).rateLimitHeaders;
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        headers.set(key, value as string);
      });
    }

    // Development-only headers
    if (IS_DEV) {
      headers.set("X-Development-Mode", "true");
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
  };

/**
 * Security violation reporting middleware
 */
export const createCSPReportMiddleware = (env: any) => {
  return async function cspReportMiddleware(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    
    if (url.pathname === '/security/csp-report' && request.method === 'POST') {
      try {
        const report = await request.json();
        
        // Log CSP violation to Sentry
        if (typeof Sentry !== 'undefined') {
          console.warn('CSP Violation Report', {
            level: 'warning',
            tags: {
              security_event: 'csp_violation',
              document_uri: report['csp-report']?.['document-uri'],
              blocked_uri: report['csp-report']?.['blocked-uri']
            },
            extra: {
              report: report['csp-report'],
              user_agent: request.headers.get('User-Agent'),
              client_ip: request.headers.get('CF-Connecting-IP')
            }
          });
        }

        console.log('CSP Violation:', JSON.stringify(report, null, 2));

        return new Response('Report received', {
          status: 204,
          headers: {
            'Content-Type': 'text/plain'
          }
        });
      } catch (error) {
        console.error('CSP report parsing error:', error);
        return new Response('Invalid report format', {
          status: 400,
          headers: {
            'Content-Type': 'text/plain'
          }
        });
      }
    }

    return null; // Not a CSP report, continue
  };
};

/**
 * Security headers validation middleware for debugging
 */
export const createSecurityValidationMiddleware = () => {
  return async function securityValidationMiddleware(
    request: Request,
    response?: Response
  ): Promise<Response | null> {
    const url = new URL(request.url);
    
    if (url.pathname === '/debug/security-headers' && request.method === 'GET') {
      if (!response) {
        return new Response('Security headers debug endpoint', {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }

      // Extract and analyze security headers
      const securityHeaders = {
        'strict-transport-security': response.headers.get('Strict-Transport-Security'),
        'content-security-policy': response.headers.get('Content-Security-Policy'),
        'x-frame-options': response.headers.get('X-Frame-Options'),
        'x-content-type-options': response.headers.get('X-Content-Type-Options'),
        'x-xss-protection': response.headers.get('X-XSS-Protection'),
        'referrer-policy': response.headers.get('Referrer-Policy'),
        'permissions-policy': response.headers.get('Permissions-Policy')
      };

      const analysis = {
        headers: securityHeaders,
        security_score: calculateSecurityScore(securityHeaders),
        recommendations: getSecurityRecommendations(securityHeaders)
      };

      return new Response(JSON.stringify(analysis, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    return null;
  };
};

function calculateSecurityScore(headers: Record<string, string | null>): number {
  let score = 0;
  const maxScore = 100;

  // HSTS: 20 points
  if (headers['strict-transport-security']) score += 20;

  // CSP: 25 points
  if (headers['content-security-policy']) {
    score += 15;
    // Bonus for strict CSP
    if (headers['content-security-policy'].includes("'unsafe-inline'") === false) {
      score += 10;
    }
  }

  // Frame protection: 15 points
  if (headers['x-frame-options']) score += 15;

  // Content type protection: 10 points
  if (headers['x-content-type-options']) score += 10;

  // XSS protection: 10 points
  if (headers['x-xss-protection']) score += 10;

  // Referrer policy: 10 points
  if (headers['referrer-policy']) score += 10;

  // Permissions policy: 10 points
  if (headers['permissions-policy']) score += 10;

  return Math.min(score, maxScore);
}

function getSecurityRecommendations(headers: Record<string, string | null>): string[] {
  const recommendations: string[] = [];

  if (!headers['strict-transport-security']) {
    recommendations.push('Add HSTS header for HTTPS enforcement');
  }

  if (!headers['content-security-policy']) {
    recommendations.push('Implement Content Security Policy');
  } else if (headers['content-security-policy'].includes("'unsafe-inline'")) {
    recommendations.push('Remove unsafe-inline from CSP for better security');
  }

  if (!headers['x-frame-options']) {
    recommendations.push('Add X-Frame-Options header to prevent clickjacking');
  }

  if (!headers['x-content-type-options']) {
    recommendations.push('Add X-Content-Type-Options header to prevent MIME sniffing');
  }

  if (!headers['permissions-policy']) {
    recommendations.push('Implement Permissions Policy for feature control');
  }

  return recommendations;
}
