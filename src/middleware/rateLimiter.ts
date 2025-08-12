import { PerformanceTracker } from '../lib/logger';

/**
 * Rate limiting configuration interface
 */
interface RateLimitConfig {
  ipLimit: number;           // Requests per minute per IP
  userLimit: number;         // Requests per minute per authenticated user
  windowMinutes: number;     // Time window for rate limiting
  burstMultiplier: number;   // Allow burst requests up to this multiplier
}

/**
 * Rate limit result interface
 */
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  identifier: string;
  limit: number;
}

/**
 * Rate limiting implementation using sliding window with KV storage
 */
export class RateLimiter {
  private kv: KVNamespace;
  private config: RateLimitConfig;

  constructor(kv: KVNamespace, config: RateLimitConfig) {
    this.kv = kv;
    this.config = config;
  }

  /**
   * Check rate limit for an identifier (IP or user)
   */
  async checkRateLimit(
    identifier: string,
    limit: number,
    isUser = false
  ): Promise<RateLimitResult> {
    const perf = PerformanceTracker.getInstance();
    const timer = perf.startTimer('rate_limit_check', 'middleware');

    try {
      const now = Date.now();
      const windowMs = this.config.windowMinutes * 60 * 1000;
      const windowStart = now - windowMs;
      
      // Get current request history from KV
      const key = `rate_limit:${identifier}`;
      const currentData = await this.kv.get(key, 'json') as {
        requests: number[];
        firstRequest: number;
      } | null;

      // Filter requests within the current window (sliding window)
      const existingRequests = currentData?.requests || [];
      const validRequests = existingRequests.filter(timestamp => timestamp > windowStart);
      
      // Calculate burst allowance (allow brief spikes)
      const burstLimit = Math.floor(limit * this.config.burstMultiplier);
      const currentCount = validRequests.length;
      
      // Check if request is allowed
      const allowed = currentCount < burstLimit;
      
      if (allowed) {
        // Add current request to the list
        validRequests.push(now);
        
        // Store updated request history with TTL
        await this.kv.put(key, JSON.stringify({
          requests: validRequests.slice(-burstLimit), // Keep only recent requests
          firstRequest: validRequests[0] || now
        }), {
          expirationTtl: Math.ceil(windowMs / 1000) + 60 // TTL slightly longer than window
        });
      }

      // Calculate reset time (next minute boundary)
      const resetTime = Math.ceil(now / 60000) * 60000;
      
      perf.endTimer(timer);
      
      return {
        allowed,
        remaining: Math.max(0, burstLimit - currentCount - (allowed ? 1 : 0)),
        resetTime,
        identifier,
        limit: burstLimit
      };
    } catch (error) {
      perf.endTimer(timer);
      // On error, allow the request but log the issue
      console.error('Rate limiter error:', error);
      return {
        allowed: true,
        remaining: limit,
        resetTime: Date.now() + 60000,
        identifier,
        limit
      };
    }
  }

  /**
   * Get rate limit for IP address
   */
  async checkIPRateLimit(ip: string): Promise<RateLimitResult> {
    return this.checkRateLimit(`ip:${ip}`, this.config.ipLimit, false);
  }

  /**
   * Get rate limit for authenticated user
   */
  async checkUserRateLimit(userId: string): Promise<RateLimitResult> {
    return this.checkRateLimit(`user:${userId}`, this.config.userLimit, true);
  }

  /**
   * Check if identifier is temporarily blocked for DDoS protection
   */
  async isBlocked(identifier: string): Promise<boolean> {
    const key = `blocked:${identifier}`;
    const blocked = await this.kv.get(key);
    return blocked !== null;
  }

  /**
   * Temporarily block an identifier (for DDoS protection)
   */
  async blockIdentifier(identifier: string, durationMinutes = 15): Promise<void> {
    const key = `blocked:${identifier}`;
    await this.kv.put(key, 'blocked', {
      expirationTtl: durationMinutes * 60
    });
  }
}

/**
 * Rate limiting middleware factory
 */
export function createRateLimitMiddleware(env: any) {
  const config: RateLimitConfig = {
    ipLimit: parseInt(env.SECURITY_RATE_LIMIT_IP || '100'),
    userLimit: parseInt(env.SECURITY_RATE_LIMIT_USER || '500'),
    windowMinutes: 1,
    burstMultiplier: 1.5 // Allow 50% burst above base limit
  };

  const rateLimiter = new RateLimiter(env.RATE_LIMITER, config);

  return async function rateLimitMiddleware(
    request: Request,
    user?: { id: string; role: string }
  ): Promise<Response | null> {
    const perf = PerformanceTracker.getInstance();
    const timer = perf.startTimer('rate_limit_middleware', 'middleware');

    try {
      // Get client IP
      const clientIP = request.headers.get('CF-Connecting-IP') || 
                      request.headers.get('X-Forwarded-For') || 
                      'unknown';

      // Admin users bypass rate limiting
      if (user?.role === 'admin') {
        perf.endTimer(timer);
        return null;
      }

      // Check if IP is blocked
      if (await rateLimiter.isBlocked(`ip:${clientIP}`)) {
        perf.endTimer(timer);
        return new Response('IP temporarily blocked due to suspicious activity', {
          status: 429,
          headers: {
            'Content-Type': 'text/plain',
            'Retry-After': '900' // 15 minutes
          }
        });
      }

      // Check IP-based rate limit
      const ipResult = await rateLimiter.checkIPRateLimit(clientIP);
      
      // Check user-based rate limit if authenticated
      let userResult: RateLimitResult | null = null;
      if (user?.id) {
        userResult = await rateLimiter.checkUserRateLimit(user.id);
      }

      // Determine which limit is more restrictive
      const activeResult = userResult && userResult.remaining < ipResult.remaining 
        ? userResult 
        : ipResult;

      // Add rate limit headers
      const headers = new Headers();
      headers.set('X-RateLimit-Limit', activeResult.limit.toString());
      headers.set('X-RateLimit-Remaining', activeResult.remaining.toString());
      headers.set('X-RateLimit-Reset', Math.floor(activeResult.resetTime / 1000).toString());
      headers.set('X-RateLimit-Policy', `${config.ipLimit} req/min per IP, ${config.userLimit} req/min per user`);

      if (!activeResult.allowed) {
        // Log rate limit violation to Sentry
        if (typeof Sentry !== 'undefined') {
          console.warn('Rate limit exceeded', {
            level: 'warning',
            tags: {
              security_event: 'rate_limit_exceeded',
              client_ip: clientIP,
              user_id: user?.id || 'anonymous'
            },
            extra: {
              limit: activeResult.limit,
              remaining: activeResult.remaining,
              identifier: activeResult.identifier
            }
          });
        }

        perf.endTimer(timer);
        return new Response('Rate limit exceeded', {
          status: 429,
          headers: {
            ...Object.fromEntries(headers.entries()),
            'Content-Type': 'text/plain',
            'Retry-After': '60'
          }
        });
      }

      perf.endTimer(timer);

      // Store headers for later use
      (request as any).rateLimitHeaders = Object.fromEntries(headers.entries());
      
      return null; // Allow request to continue
    } catch (error) {
      perf.endTimer(timer);
      console.error('Rate limit middleware error:', error);
      return null; // On error, allow request to continue
    }
  };
}
