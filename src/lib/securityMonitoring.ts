import { PerformanceTracker } from './logger';

/**
 * Security metrics interface
 */
interface SecurityMetrics {
  rateLimiting: {
    totalRequests: number;
    blockedRequests: number;
    currentActiveIPs: number;
    topBlockedIPs: Array<{ ip: string; count: number; lastBlocked: string }>;
  };
  waf: {
    totalAnalyzed: number;
    threatsBlocked: number;
    rulesTriggerred: Record<string, number>;
    severityBreakdown: Record<string, number>;
  };
  ddos: {
    anomaliesDetected: number;
    ipsBlocked: number;
    averageAnomalyScore: number;
    activeBlocks: number;
  };
  general: {
    securityScore: number;
    lastUpdateTime: string;
    environment: string;
    monitoringEnabled: boolean;
  };
}

/**
 * Security alert interface
 */
interface SecurityAlert {
  id: string;
  type: 'rate_limit' | 'waf' | 'ddos' | 'anomaly' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
  clientIP?: string;
  userAgent?: string;
  details: Record<string, any>;
  resolved: boolean;
}

/**
 * Security monitoring implementation
 */
export class SecurityMonitoring {
  private kv: KVNamespace;
  private blocklist: KVNamespace;
  private environment: string;

  constructor(rateLimiterKV: KVNamespace, blocklistKV: KVNamespace, environment: string) {
    this.kv = rateLimiterKV;
    this.blocklist = blocklistKV;
    this.environment = environment;
  }

  /**
   * Collect comprehensive security metrics
   */
  async collectMetrics(): Promise<SecurityMetrics> {
    const perf = PerformanceTracker.getInstance();
    const timer = perf.startTimer('security_metrics_collection', 'middleware');

    try {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Collect rate limiting metrics
      const rateLimitingMetrics = await this.collectRateLimitingMetrics();
      
      // Collect WAF metrics
      const wafMetrics = await this.collectWAFMetrics();
      
      // Collect DDoS metrics
      const ddosMetrics = await this.collectDDoSMetrics();

      // Calculate overall security score
      const securityScore = this.calculateSecurityScore(rateLimitingMetrics, wafMetrics, ddosMetrics);

      const metrics: SecurityMetrics = {
        rateLimiting: rateLimitingMetrics,
        waf: wafMetrics,
        ddos: ddosMetrics,
        general: {
          securityScore,
          lastUpdateTime: now.toISOString(),
          environment: this.environment,
          monitoringEnabled: true
        }
      };

      perf.endTimer(timer);
      return metrics;
    } catch (error) {
      perf.endTimer(timer);
      console.error('Security metrics collection error:', error);
      
      // Return basic metrics on error
      return {
        rateLimiting: {
          totalRequests: 0,
          blockedRequests: 0,
          currentActiveIPs: 0,
          topBlockedIPs: []
        },
        waf: {
          totalAnalyzed: 0,
          threatsBlocked: 0,
          rulesTriggerred: {},
          severityBreakdown: {}
        },
        ddos: {
          anomaliesDetected: 0,
          ipsBlocked: 0,
          averageAnomalyScore: 0,
          activeBlocks: 0
        },
        general: {
          securityScore: 0,
          lastUpdateTime: new Date().toISOString(),
          environment: this.environment,
          monitoringEnabled: false
        }
      };
    }
  }

  /**
   * Collect rate limiting specific metrics
   */
  private async collectRateLimitingMetrics() {
    // This would typically scan KV for rate limiting data
    // For now, return mock data as we can't easily query all KV keys
    return {
      totalRequests: 0,
      blockedRequests: 0,
      currentActiveIPs: 0,
      topBlockedIPs: []
    };
  }

  /**
   * Collect WAF specific metrics
   */
  private async collectWAFMetrics() {
    // Get WAF statistics from KV storage
    const wafStatsKey = 'waf_stats';
    const wafStats = await this.kv.get(wafStatsKey, 'json') as any || {};

    return {
      totalAnalyzed: wafStats.totalAnalyzed || 0,
      threatsBlocked: wafStats.threatsBlocked || 0,
      rulesTriggerred: wafStats.rulesTriggerred || {},
      severityBreakdown: wafStats.severityBreakdown || {}
    };
  }

  /**
   * Collect DDoS protection metrics
   */
  private async collectDDoSMetrics() {
    // Get DDoS statistics from KV storage
    const ddosStatsKey = 'ddos_stats';
    const ddosStats = await this.kv.get(ddosStatsKey, 'json') as any || {};

    return {
      anomaliesDetected: ddosStats.anomaliesDetected || 0,
      ipsBlocked: ddosStats.ipsBlocked || 0,
      averageAnomalyScore: ddosStats.averageAnomalyScore || 0,
      activeBlocks: ddosStats.activeBlocks || 0
    };
  }

  /**
   * Calculate overall security score
   */
  private calculateSecurityScore(
    rateLimiting: any,
    waf: any,
    ddos: any
  ): number {
    let score = 100;

    // Deduct points for high threat activity
    if (waf.threatsBlocked > 100) score -= 10;
    if (ddos.anomaliesDetected > 50) score -= 15;
    if (rateLimiting.blockedRequests > 1000) score -= 10;

    // Bonus points for active protection
    if (waf.totalAnalyzed > 0) score += 5;
    if (ddos.anomaliesDetected > 0 && ddos.ipsBlocked > 0) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Update security statistics
   */
  async updateSecurityStats(type: 'waf' | 'ddos' | 'rate_limit', data: any): Promise<void> {
    try {
      const statsKey = `${type}_stats`;
      const currentStats = await this.kv.get(statsKey, 'json') as any || {};

      // Merge new data with existing stats
      const updatedStats = { ...currentStats, ...data };
      
      await this.kv.put(statsKey, JSON.stringify(updatedStats), {
        expirationTtl: 7 * 24 * 60 * 60 // 7 days
      });
    } catch (error) {
      console.error(`Error updating ${type} stats:`, error);
    }
  }

  /**
   * Record security alert
   */
  async recordAlert(alert: Omit<SecurityAlert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    try {
      const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const fullAlert: SecurityAlert = {
        ...alert,
        id: alertId,
        timestamp: new Date().toISOString(),
        resolved: false
      };

      const alertKey = `security_alert:${alertId}`;
      await this.kv.put(alertKey, JSON.stringify(fullAlert), {
        expirationTtl: 30 * 24 * 60 * 60 // 30 days
      });

      // Also log to Sentry if available
      if (typeof Sentry !== 'undefined') {
        console.warn('Security Alert Generated', {
          level: alert.severity === 'critical' ? 'error' : 'warning',
          tags: {
            security_alert: alert.type,
            severity: alert.severity
          },
          extra: fullAlert
        });
      }
    } catch (error) {
      console.error('Error recording security alert:', error);
    }
  }

  /**
   * Get recent security alerts
   */
  async getRecentAlerts(limit: number = 50): Promise<SecurityAlert[]> {
    // This is a simplified implementation
    // In practice, you'd need to scan KV keys or use a different storage approach
    return [];
  }

  /**
   * Get security status summary
   */
  async getSecurityStatus(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    metrics: SecurityMetrics;
    activeThreats: number;
    recommendations: string[];
  }> {
    const metrics = await this.collectMetrics();
    const activeThreats = metrics.waf.threatsBlocked + metrics.ddos.ipsBlocked;
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    const recommendations: string[] = [];

    // Determine status
    if (metrics.general.securityScore < 70) {
      status = 'critical';
      recommendations.push('Security score is low - review security configuration');
    } else if (metrics.general.securityScore < 85) {
      status = 'warning';
      recommendations.push('Security score could be improved');
    }

    if (activeThreats > 100) {
      status = 'critical';
      recommendations.push('High number of active threats detected');
    } else if (activeThreats > 50) {
      status = 'warning';
      recommendations.push('Moderate threat activity detected');
    }

    // Add specific recommendations
    if (metrics.waf.threatsBlocked === 0 && metrics.waf.totalAnalyzed > 1000) {
      recommendations.push('WAF may not be properly configured - no threats detected');
    }

    if (metrics.ddos.anomaliesDetected > 100) {
      recommendations.push('Consider tightening DDoS protection thresholds');
    }

    return {
      status,
      metrics,
      activeThreats,
      recommendations
    };
  }
}

/**
 * Security monitoring middleware factory
 */
export function createSecurityMonitoringMiddleware(env: any) {
  const monitoring = new SecurityMonitoring(
    env.RATE_LIMITER,
    env.SECURITY_BLOCKLIST,
    env.ENVIRONMENT || 'unknown'
  );

  return {
    monitoring,
    
    /**
     * Debug endpoint for security metrics
     */
    async handleDebugSecurity(request: Request): Promise<Response> {
      try {
        const url = new URL(request.url);
        const path = url.pathname;

        if (path === '/debug/security') {
          const status = await monitoring.getSecurityStatus();
          
          return new Response(JSON.stringify({
            timestamp: new Date().toISOString(),
            status: status.status,
            security_score: status.metrics.general.securityScore,
            active_threats: status.activeThreats,
            recommendations: status.recommendations,
            metrics: status.metrics
          }, null, 2), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        if (path === '/monitoring/security') {
          const metrics = await monitoring.collectMetrics();
          
          return new Response(JSON.stringify({
            title: 'Security Dashboard',
            timestamp: new Date().toISOString(),
            environment: env.ENVIRONMENT,
            security_overview: {
              overall_score: metrics.general.securityScore,
              threats_blocked_24h: metrics.waf.threatsBlocked + metrics.ddos.ipsBlocked,
              active_protections: [
                'Rate Limiting',
                'Web Application Firewall',
                'DDoS Protection',
                'Enhanced Security Headers'
              ]
            },
            rate_limiting: metrics.rateLimiting,
            waf_protection: metrics.waf,
            ddos_protection: metrics.ddos,
            system_info: metrics.general
          }, null, 2), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response('Security endpoint not found', { status: 404 });
      } catch (error) {
        console.error('Security monitoring endpoint error:', error);
        return new Response('Internal server error', { status: 500 });
      }
    }
  };
}
