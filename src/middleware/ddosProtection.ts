import { PerformanceTracker } from '../lib/logger';

/**
 * DDoS protection configuration
 */
interface DDoSConfig {
  enabled: boolean;
  thresholdRequests: number;     // Requests per minute to trigger DDoS detection
  anomalyThreshold: number;      // Anomaly score threshold (0-100)
  blockDurationMinutes: number;  // How long to block suspicious IPs
  monitoringWindowMinutes: number; // Time window for analysis
}

/**
 * Request pattern analysis interface
 */
interface RequestPattern {
  timestamp: number;
  path: string;
  method: string;
  userAgent: string;
  responseTime: number;
  statusCode: number;
}

/**
 * Anomaly detection result
 */
interface AnomalyResult {
  score: number;          // Anomaly score (0-100)
  reasons: string[];      // Reasons for anomaly detection
  shouldBlock: boolean;   // Whether to block the request
  confidence: number;     // Confidence level (0-1)
}

/**
 * DDoS Protection and Anomaly Detection implementation
 */
export class DDoSProtection {
  private config: DDoSConfig;
  private kv: KVNamespace;
  private blocklist: KVNamespace;

  constructor(config: DDoSConfig, rateLimiterKV: KVNamespace, blocklistKV: KVNamespace) {
    this.config = config;
    this.kv = rateLimiterKV;
    this.blocklist = blocklistKV;
  }

  /**
   * Analyze request patterns for anomalies
   */
  async analyzeRequestPattern(
    clientIP: string,
    request: Request,
    responseTime?: number
  ): Promise<AnomalyResult> {
    if (!this.config.enabled) {
      return {
        score: 0,
        reasons: [],
        shouldBlock: false,
        confidence: 0
      };
    }

    const perf = PerformanceTracker.getInstance();
    const timer = perf.startTimer('ddos_analysis', 'middleware');

    try {
      const url = new URL(request.url);
      const userAgent = request.headers.get('User-Agent') || '';
      const now = Date.now();

      // Get recent request history
      const historyKey = `ddos_history:${clientIP}`;
      const historyData = await this.kv.get(historyKey, 'json') as {
        patterns: RequestPattern[];
        lastUpdate: number;
      } | null;

      const existingPatterns = historyData?.patterns || [];
      const windowMs = this.config.monitoringWindowMinutes * 60 * 1000;
      const windowStart = now - windowMs;

      // Filter patterns within the monitoring window
      const recentPatterns = existingPatterns.filter(p => p.timestamp > windowStart);

      // Add current request pattern
      const currentPattern: RequestPattern = {
        timestamp: now,
        path: url.pathname,
        method: request.method,
        userAgent,
        responseTime: responseTime || 0,
        statusCode: 200 // Will be updated later if needed
      };

      recentPatterns.push(currentPattern);

      // Perform anomaly analysis
      const anomalyResult = this.detectAnomalies(recentPatterns, clientIP);

      // Update request history
      await this.kv.put(historyKey, JSON.stringify({
        patterns: recentPatterns.slice(-100), // Keep last 100 requests
        lastUpdate: now
      }), {
        expirationTtl: Math.ceil(windowMs / 1000) + 300 // TTL with buffer
      });

      perf.endTimer(timer);
      return anomalyResult;

    } catch (error) {
      perf.endTimer(timer);
      console.error('DDoS analysis error:', error);
      return {
        score: 0,
        reasons: ['Analysis error'],
        shouldBlock: false,
        confidence: 0
      };
    }
  }

  /**
   * Detect anomalies in request patterns
   */
  private detectAnomalies(patterns: RequestPattern[], clientIP: string): AnomalyResult {
    const reasons: string[] = [];
    let score = 0;
    const now = Date.now();
    const lastMinute = now - 60000;
    const last5Minutes = now - 300000;

    // 1. High request frequency analysis
    const recentRequests = patterns.filter(p => p.timestamp > lastMinute);
    const frequencyScore = Math.min((recentRequests.length / this.config.thresholdRequests) * 100, 100);
    
    if (frequencyScore > 70) {
      score += frequencyScore * 0.4; // 40% weight
      reasons.push(`High request frequency: ${recentRequests.length} req/min`);
    }

    // 2. Request pattern uniformity (bot-like behavior)
    const pathFrequency = this.analyzePathFrequency(patterns);
    const uniformityScore = this.calculateUniformityScore(pathFrequency);
    
    if (uniformityScore > 80) {
      score += uniformityScore * 0.2; // 20% weight
      reasons.push('Highly uniform request patterns detected');
    }

    // 3. User-Agent consistency
    const userAgents = [...new Set(patterns.map(p => p.userAgent))];
    if (userAgents.length === 1 && patterns.length > 10) {
      score += 15;
      reasons.push('Consistent User-Agent across many requests');
    }

    // 4. Response time patterns (looking for automated behavior)
    const responseTimes = patterns.filter(p => p.responseTime > 0).map(p => p.responseTime);
    if (responseTimes.length > 5) {
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const variance = responseTimes.reduce((acc, time) => acc + Math.pow(time - avgResponseTime, 2), 0) / responseTimes.length;
      
      if (variance < 10 && responseTimes.length > 10) {
        score += 10;
        reasons.push('Unnaturally consistent response times');
      }
    }

    // 5. Burst detection
    const burstScore = this.detectRequestBursts(patterns);
    if (burstScore > 50) {
      score += burstScore * 0.2; // 20% weight
      reasons.push('Request burst pattern detected');
    }

    // 6. Method distribution analysis
    const methodCounts = patterns.reduce((acc, p) => {
      acc[p.method] = (acc[p.method] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Suspicious if only GET requests or unusual method distribution
    if (methodCounts.GET && methodCounts.GET === patterns.length && patterns.length > 20) {
      score += 10;
      reasons.push('Only GET requests detected');
    }

    // 7. Error rate analysis
    const errorRequests = patterns.filter(p => p.statusCode >= 400);
    const errorRate = errorRequests.length / patterns.length;
    
    if (errorRate > 0.5 && patterns.length > 10) {
      score += 20;
      reasons.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
    }

    // Calculate final score and decision
    const finalScore = Math.min(score, 100);
    const shouldBlock = finalScore >= this.config.anomalyThreshold;
    const confidence = Math.min(finalScore / 100, 1);

    return {
      score: finalScore,
      reasons,
      shouldBlock,
      confidence
    };
  }

  /**
   * Analyze path access frequency
   */
  private analyzePathFrequency(patterns: RequestPattern[]): Record<string, number> {
    return patterns.reduce((acc, pattern) => {
      acc[pattern.path] = (acc[pattern.path] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Calculate uniformity score for request patterns
   */
  private calculateUniformityScore(pathFrequency: Record<string, number>): number {
    const paths = Object.keys(pathFrequency);
    const counts = Object.values(pathFrequency);
    
    if (paths.length <= 1) return 100; // Single path = very uniform
    
    const total = counts.reduce((a, b) => a + b, 0);
    const average = total / paths.length;
    const variance = counts.reduce((acc, count) => acc + Math.pow(count - average, 2), 0) / paths.length;
    
    // Lower variance = higher uniformity
    const uniformityScore = Math.max(0, 100 - (variance / average) * 10);
    return Math.min(uniformityScore, 100);
  }

  /**
   * Detect request bursts (sudden spikes in activity)
   */
  private detectRequestBursts(patterns: RequestPattern[]): number {
    if (patterns.length < 10) return 0;

    const now = Date.now();
    const intervals = [10000, 30000, 60000]; // 10s, 30s, 1min intervals
    let maxBurstScore = 0;

    for (const interval of intervals) {
      const windowStart = now - interval;
      const requestsInWindow = patterns.filter(p => p.timestamp > windowStart).length;
      const expectedRate = patterns.length / (5 * 60); // Expected per second over 5 minutes
      const actualRate = requestsInWindow / (interval / 1000);
      
      if (actualRate > expectedRate * 3) { // 3x normal rate
        const burstScore = Math.min((actualRate / expectedRate) * 20, 100);
        maxBurstScore = Math.max(maxBurstScore, burstScore);
      }
    }

    return maxBurstScore;
  }

  /**
   * Block IP address for DDoS protection
   */
  async blockIP(ip: string, reason: string, anomalyScore: number): Promise<void> {
    const key = `ddos_block:${ip}`;
    const blockData = {
      reason,
      anomalyScore,
      blockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.config.blockDurationMinutes * 60 * 1000).toISOString()
    };

    await this.blocklist.put(key, JSON.stringify(blockData), {
      expirationTtl: this.config.blockDurationMinutes * 60
    });
  }

  /**
   * Check if IP is blocked for DDoS
   */
  async isBlocked(ip: string): Promise<boolean> {
    const key = `ddos_block:${ip}`;
    const blocked = await this.blocklist.get(key);
    return blocked !== null;
  }

  /**
   * Get block information for IP
   */
  async getBlockInfo(ip: string): Promise<any> {
    const key = `ddos_block:${ip}`;
    const blockData = await this.blocklist.get(key, 'json');
    return blockData;
  }
}

/**
 * DDoS protection middleware factory
 */
export function createDDoSMiddleware(env: any) {
  const config: DDoSConfig = {
    enabled: env.SECURITY_ENABLE_WAF === 'true',
    thresholdRequests: parseInt(env.SECURITY_DDOS_THRESHOLD || '1000'),
    anomalyThreshold: parseInt(env.SECURITY_ANOMALY_THRESHOLD || '50'),
    blockDurationMinutes: 15,
    monitoringWindowMinutes: 5
  };

  const ddosProtection = new DDoSProtection(config, env.RATE_LIMITER, env.SECURITY_BLOCKLIST);

  return async function ddosMiddleware(
    request: Request,
    user?: { id: string; role: string }
  ): Promise<Response | null> {
    const perf = PerformanceTracker.getInstance();
    const timer = perf.startTimer('ddos_middleware', 'middleware');

    try {
      const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

      // Skip DDoS protection for admin users
      if (user?.role === 'admin') {
        perf.endTimer(timer);
        return null;
      }

      // Check if IP is already blocked
      if (await ddosProtection.isBlocked(clientIP)) {
        const blockInfo = await ddosProtection.getBlockInfo(clientIP);
        
        perf.endTimer(timer);
        return new Response('IP temporarily blocked due to suspicious activity', {
          status: 429,
          headers: {
            'Content-Type': 'text/plain',
            'Retry-After': (config.blockDurationMinutes * 60).toString(),
            'X-Block-Reason': blockInfo?.reason || 'DDoS protection',
            'X-Block-Score': blockInfo?.anomalyScore?.toString() || '0'
          }
        });
      }

      // Analyze request pattern
      const anomalyResult = await ddosProtection.analyzeRequestPattern(clientIP, request);

      // Log anomalies to Sentry
      if (anomalyResult.score > 30) { // Log medium and high anomalies
        if (typeof Sentry !== 'undefined') {
          console.warn('DDoS anomaly detected', {
            level: anomalyResult.shouldBlock ? 'error' : 'warning',
            tags: {
              security_event: 'ddos_anomaly',
              client_ip: clientIP,
              anomaly_score: anomalyResult.score.toString(),
              blocked: anomalyResult.shouldBlock.toString()
            },
            extra: {
              reasons: anomalyResult.reasons,
              confidence: anomalyResult.confidence,
              url: request.url,
              method: request.method,
              user_agent: request.headers.get('User-Agent')
            }
          });
        }
      }

      // Block if anomaly threshold exceeded
      if (anomalyResult.shouldBlock) {
        await ddosProtection.blockIP(
          clientIP, 
          `Anomaly detection: ${anomalyResult.reasons.join(', ')}`,
          anomalyResult.score
        );

        perf.endTimer(timer);
        return new Response('Request blocked due to suspicious activity', {
          status: 429,
          headers: {
            'Content-Type': 'text/plain',
            'Retry-After': (config.blockDurationMinutes * 60).toString(),
            'X-Anomaly-Score': anomalyResult.score.toString(),
            'X-Anomaly-Reasons': anomalyResult.reasons.join(', ')
          }
        });
      }

      perf.endTimer(timer);

      // Store anomaly result for monitoring
      (request as any).anomalyResult = anomalyResult;
      
      return null; // Allow request to continue
    } catch (error) {
      perf.endTimer(timer);
      console.error('DDoS middleware error:', error);
      return null; // On error, allow request to continue
    }
  };
}
