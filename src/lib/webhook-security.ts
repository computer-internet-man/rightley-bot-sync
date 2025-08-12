import * as Sentry from '@sentry/cloudflare';

// Webhook signature verification for external providers
export interface WebhookSignature {
  algorithm: 'sha256';
  signature: string;
  timestamp?: string;
}

// Rate limiting for webhook endpoints
export interface RateLimitState {
  requests: number;
  resetTime: number;
  blocked: boolean;
}

// Webhook security configuration
export interface WebhookSecurityConfig {
  secret: string;
  toleranceSeconds: number; // How old webhooks can be
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  trustedIPs?: string[];
  requiredHeaders?: Record<string, string>;
}

/**
 * Parse webhook signature from headers
 */
export function parseWebhookSignature(signatureHeader: string): WebhookSignature | null {
  if (!signatureHeader) {
    return null;
  }

  // Support multiple signature formats:
  // - "sha256=abc123" (GitHub/SendGrid style)
  // - "t=1234567890,v1=abc123" (Stripe style with timestamp)
  
  if (signatureHeader.startsWith('sha256=')) {
    return {
      algorithm: 'sha256',
      signature: signatureHeader.substring(7)
    };
  }

  if (signatureHeader.includes('t=') && signatureHeader.includes('v1=')) {
    const parts = signatureHeader.split(',');
    let timestamp: string | undefined;
    let signature: string | undefined;

    for (const part of parts) {
      if (part.startsWith('t=')) {
        timestamp = part.substring(2);
      } else if (part.startsWith('v1=')) {
        signature = part.substring(3);
      }
    }

    if (signature) {
      return {
        algorithm: 'sha256',
        signature,
        timestamp
      };
    }
  }

  return null;
}

/**
 * Generate HMAC-SHA256 signature for webhook verification
 */
export async function generateWebhookSignature(
  payload: string,
  secret: string,
  timestamp?: string
): Promise<string> {
  // Create the signing string
  const signingString = timestamp ? `${timestamp}.${payload}` : payload;
  
  // Convert secret to ArrayBuffer
  const encoder = new TextEncoder();
  const secretBuffer = encoder.encode(secret);
  
  // Import the secret as a signing key
  const signingKey = await crypto.subtle.importKey(
    'raw',
    secretBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Sign the payload
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    signingKey,
    encoder.encode(signingString)
  );
  
  // Convert to hex string
  const signatureArray = new Uint8Array(signatureBuffer);
  const signatureHex = Array.from(signatureArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return signatureHex;
}

/**
 * Verify webhook signature matches expected value
 */
export async function verifyWebhookSignature(
  payload: string,
  providedSignature: WebhookSignature,
  secret: string,
  config: WebhookSecurityConfig
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Check timestamp if provided (prevent replay attacks)
    if (providedSignature.timestamp) {
      const webhookTime = parseInt(providedSignature.timestamp) * 1000; // Convert to milliseconds
      const currentTime = Date.now();
      const tolerance = config.toleranceSeconds * 1000;
      
      if (Math.abs(currentTime - webhookTime) > tolerance) {
        return {
          valid: false,
          error: `Webhook timestamp too old. Current: ${currentTime}, Webhook: ${webhookTime}, Tolerance: ${tolerance}ms`
        };
      }
    }

    // Generate expected signature
    const expectedSignature = await generateWebhookSignature(
      payload,
      secret,
      providedSignature.timestamp
    );

    // Compare signatures using timing-safe comparison
    const providedHex = providedSignature.signature.toLowerCase();
    const expectedHex = expectedSignature.toLowerCase();

    if (providedHex.length !== expectedHex.length) {
      return {
        valid: false,
        error: 'Signature length mismatch'
      };
    }

    // Timing-safe comparison
    let isValid = true;
    for (let i = 0; i < providedHex.length; i++) {
      if (providedHex[i] !== expectedHex[i]) {
        isValid = false;
      }
    }

    if (!isValid) {
      return {
        valid: false,
        error: 'Signature verification failed'
      };
    }

    Sentry.addBreadcrumb({
      category: 'webhook',
      message: 'Webhook signature verified successfully',
      level: 'info',
      data: {
        hasTimestamp: !!providedSignature.timestamp,
        signatureLength: providedSignature.signature.length
      }
    });

    return { valid: true };

  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: 'webhook-security' },
      extra: {
        hasTimestamp: !!providedSignature.timestamp,
        signatureLength: providedSignature.signature?.length
      }
    });

    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Signature verification error'
    };
  }
}

/**
 * Simple rate limiting for webhook endpoints
 * In production, this would be replaced with Cloudflare Workers KV or Durable Objects
 */
export class WebhookRateLimiter {
  private static instances = new Map<string, WebhookRateLimiter>();
  private requestCounts = new Map<string, RateLimitState>();

  static getInstance(identifier: string): WebhookRateLimiter {
    if (!this.instances.has(identifier)) {
      this.instances.set(identifier, new WebhookRateLimiter());
    }
    return this.instances.get(identifier)!;
  }

  isAllowed(clientId: string, config: WebhookSecurityConfig): { allowed: boolean; resetTime?: number } {
    const now = Date.now();
    const minuteKey = `${clientId}:${Math.floor(now / 60000)}`;
    const hourKey = `${clientId}:${Math.floor(now / 3600000)}`;

    // Check minute limit
    const minuteState = this.requestCounts.get(minuteKey) || {
      requests: 0,
      resetTime: Math.floor(now / 60000) * 60000 + 60000,
      blocked: false
    };

    // Check hour limit
    const hourState = this.requestCounts.get(hourKey) || {
      requests: 0,
      resetTime: Math.floor(now / 3600000) * 3600000 + 3600000,
      blocked: false
    };

    // Clean up expired entries
    this.cleanup(now);

    // Check if already blocked
    if (minuteState.blocked || hourState.blocked) {
      return {
        allowed: false,
        resetTime: Math.min(minuteState.resetTime, hourState.resetTime)
      };
    }

    // Check limits
    if (minuteState.requests >= config.rateLimitPerMinute) {
      minuteState.blocked = true;
      this.requestCounts.set(minuteKey, minuteState);
      
      Sentry.addBreadcrumb({
        category: 'webhook',
        message: 'Rate limit exceeded (minute)',
        level: 'warning',
        data: {
          clientId,
          requests: minuteState.requests,
          limit: config.rateLimitPerMinute
        }
      });

      return {
        allowed: false,
        resetTime: minuteState.resetTime
      };
    }

    if (hourState.requests >= config.rateLimitPerHour) {
      hourState.blocked = true;
      this.requestCounts.set(hourKey, hourState);
      
      Sentry.addBreadcrumb({
        category: 'webhook',
        message: 'Rate limit exceeded (hour)',
        level: 'warning',
        data: {
          clientId,
          requests: hourState.requests,
          limit: config.rateLimitPerHour
        }
      });

      return {
        allowed: false,
        resetTime: hourState.resetTime
      };
    }

    // Increment counters
    minuteState.requests++;
    hourState.requests++;
    this.requestCounts.set(minuteKey, minuteState);
    this.requestCounts.set(hourKey, hourState);

    return { allowed: true };
  }

  private cleanup(now: number): void {
    // Remove entries older than 1 hour
    const cutoff = now - 3600000;
    
    for (const [key, state] of this.requestCounts) {
      if (state.resetTime < cutoff) {
        this.requestCounts.delete(key);
      }
    }
  }

  getStats(clientId: string): { minuteRequests: number; hourRequests: number } {
    const now = Date.now();
    const minuteKey = `${clientId}:${Math.floor(now / 60000)}`;
    const hourKey = `${clientId}:${Math.floor(now / 3600000)}`;

    const minuteState = this.requestCounts.get(minuteKey);
    const hourState = this.requestCounts.get(hourKey);

    return {
      minuteRequests: minuteState?.requests || 0,
      hourRequests: hourState?.requests || 0
    };
  }
}

/**
 * Validate client IP against trusted IP list
 */
export function validateClientIP(clientIP: string, trustedIPs?: string[]): boolean {
  if (!trustedIPs || trustedIPs.length === 0) {
    return true; // No IP restrictions
  }

  // Simple IP validation - in production, would support CIDR ranges
  return trustedIPs.includes(clientIP);
}

/**
 * Validate required headers are present
 */
export function validateRequiredHeaders(
  headers: Headers,
  requiredHeaders?: Record<string, string>
): { valid: boolean; missingHeaders: string[] } {
  if (!requiredHeaders || Object.keys(requiredHeaders).length === 0) {
    return { valid: true, missingHeaders: [] };
  }

  const missingHeaders: string[] = [];

  for (const [headerName, expectedValue] of Object.entries(requiredHeaders)) {
    const actualValue = headers.get(headerName);
    
    if (!actualValue) {
      missingHeaders.push(headerName);
    } else if (expectedValue !== '*' && actualValue !== expectedValue) {
      missingHeaders.push(`${headerName} (expected: ${expectedValue}, got: ${actualValue})`);
    }
  }

  return {
    valid: missingHeaders.length === 0,
    missingHeaders
  };
}

/**
 * Comprehensive webhook security validation
 */
export async function validateWebhookSecurity(
  request: Request,
  payload: string,
  config: WebhookSecurityConfig
): Promise<{
  valid: boolean;
  error?: string;
  rateLimit?: {
    allowed: boolean;
    resetTime?: number;
    minuteRequests?: number;
    hourRequests?: number;
  };
}> {
  try {
    // Extract client information
    const clientIP = request.headers.get('CF-Connecting-IP') || 
                    request.headers.get('X-Forwarded-For') || 
                    'unknown';
    
    // 1. Validate client IP
    if (!validateClientIP(clientIP, config.trustedIPs)) {
      return {
        valid: false,
        error: `IP address ${clientIP} not in trusted list`
      };
    }

    // 2. Validate required headers
    const headerValidation = validateRequiredHeaders(request.headers, config.requiredHeaders);
    if (!headerValidation.valid) {
      return {
        valid: false,
        error: `Missing required headers: ${headerValidation.missingHeaders.join(', ')}`
      };
    }

    // 3. Check rate limiting
    const rateLimiter = WebhookRateLimiter.getInstance('webhook');
    const rateLimitResult = rateLimiter.isAllowed(clientIP, config);
    const stats = rateLimiter.getStats(clientIP);

    if (!rateLimitResult.allowed) {
      return {
        valid: false,
        error: 'Rate limit exceeded',
        rateLimit: {
          allowed: false,
          resetTime: rateLimitResult.resetTime,
          minuteRequests: stats.minuteRequests,
          hourRequests: stats.hourRequests
        }
      };
    }

    // 4. Verify webhook signature
    const signatureHeader = request.headers.get('X-Webhook-Signature') || 
                           request.headers.get('X-Signature') ||
                           request.headers.get('Signature');

    if (!signatureHeader) {
      return {
        valid: false,
        error: 'Missing webhook signature header',
        rateLimit: {
          allowed: true,
          minuteRequests: stats.minuteRequests,
          hourRequests: stats.hourRequests
        }
      };
    }

    const signature = parseWebhookSignature(signatureHeader);
    if (!signature) {
      return {
        valid: false,
        error: 'Invalid signature format',
        rateLimit: {
          allowed: true,
          minuteRequests: stats.minuteRequests,
          hourRequests: stats.hourRequests
        }
      };
    }

    const signatureResult = await verifyWebhookSignature(payload, signature, config.secret, config);
    if (!signatureResult.valid) {
      return {
        valid: false,
        error: signatureResult.error,
        rateLimit: {
          allowed: true,
          minuteRequests: stats.minuteRequests,
          hourRequests: stats.hourRequests
        }
      };
    }

    // All validations passed
    Sentry.addBreadcrumb({
      category: 'webhook',
      message: 'Webhook security validation passed',
      level: 'info',
      data: {
        clientIP,
        hasSignature: !!signatureHeader,
        rateLimitStats: stats
      }
    });

    return {
      valid: true,
      rateLimit: {
        allowed: true,
        minuteRequests: stats.minuteRequests,
        hourRequests: stats.hourRequests
      }
    };

  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: 'webhook-security' },
      extra: {
        url: request.url,
        method: request.method,
        payloadLength: payload.length
      }
    });

    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Security validation error'
    };
  }
}
