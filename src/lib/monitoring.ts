/**
 * Monitoring and Health Check Utilities
 * Provides comprehensive system health monitoring and metrics collection
 */

import { env } from "cloudflare:workers";
import { db } from "@/db";
import { logger, type LogContext, PerformanceTracker, type PerformanceMetric } from "./logger";

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  lastChecked: string;
  error?: string;
  details?: Record<string, any>;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheckResult[];
  timestamp: string;
  version?: string;
  environment: string;
}

export interface BusinessMetrics {
  activeUsers: number;
  draftsGenerated: number;
  messagesFinalized: number;
  errorRate: number;
  averageResponseTime: number;
  timestamp: string;
}

export interface SystemMetrics {
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  memoryUsage?: number;
  cpuUsage?: number;
  timestamp: string;
}

export interface DetailedPerformanceMetrics {
  summary: {
    totalRequests: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
  };
  categoryBreakdown: Record<string, {
    totalTime: number;
    count: number;
    avgTime: number;
    slowestOperation: string;
  }>;
  slowestOperations: Array<{
    operation: string;
    avgDuration: number;
    count: number;
    category: string;
  }>;
  recentMetrics: PerformanceMetric[];
  alerts: Array<{
    level: 'warning' | 'critical';
    message: string;
    metric: string;
    value: number;
    threshold: number;
  }>;
  resourceUsage: {
    memoryPressure: 'low' | 'medium' | 'high';
    databaseConnections: number;
    queueDepth: number;
  };
  timestamp: string;
}

class MonitoringService {
  private healthChecks: Map<string, HealthCheckResult> = new Map();
  private metrics: Map<string, any> = new Map();

  // Database health check
  async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Simple connectivity test
      await db.user.findFirst({
        select: { id: true }
      });
      
      const responseTime = Date.now() - startTime;
      
      const result: HealthCheckResult = {
        service: 'database',
        status: responseTime < 1000 ? 'healthy' : 'degraded',
        responseTime,
        lastChecked: new Date().toISOString(),
        details: {
          connectionPool: 'active',
          queryTime: responseTime
        }
      };
      
      logger.debug('Database health check completed', {
        responseTime,
        status: result.status
      });
      
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Database health check failed', error as Error, {
        responseTime
      });
      
      return {
        service: 'database',
        status: 'unhealthy',
        responseTime,
        lastChecked: new Date().toISOString(),
        error: (error as Error).message
      };
    }
  }

  // OpenAI API health check
  async checkOpenAI(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      if (!env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }

      // Simple ping to OpenAI models endpoint
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        method: 'GET'
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return {
          service: 'openai',
          status: responseTime < 2000 ? 'healthy' : 'degraded',
          responseTime,
          lastChecked: new Date().toISOString(),
          details: {
            httpStatus: response.status,
            apiReachable: true
          }
        };
      } else {
        throw new Error(`OpenAI API returned ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('OpenAI health check failed', error as Error, {
        responseTime
      });
      
      return {
        service: 'openai',
        status: 'unhealthy',
        responseTime,
        lastChecked: new Date().toISOString(),
        error: (error as Error).message
      };
    }
  }

  // Queue health check (mock - would integrate with actual queue service)
  async checkQueue(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Mock queue health check - in real implementation would check Cloudflare Queues
      // For now, just simulate a health check
      const responseTime = Date.now() - startTime;
      
      return {
        service: 'queue',
        status: 'healthy',
        responseTime,
        lastChecked: new Date().toISOString(),
        details: {
          queueDepth: 0,
          processingRate: 'normal'
        }
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        service: 'queue',
        status: 'unhealthy',
        responseTime,
        lastChecked: new Date().toISOString(),
        error: (error as Error).message
      };
    }
  }

  // Comprehensive system health check
  async getSystemHealth(): Promise<SystemHealth> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkOpenAI(),
      this.checkQueue()
    ]);

    // Determine overall health
    const unhealthyCount = checks.filter(check => check.status === 'unhealthy').length;
    const degradedCount = checks.filter(check => check.status === 'degraded').length;

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount > 0) {
      overall = 'unhealthy';
    } else if (degradedCount > 0) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    const systemHealth: SystemHealth = {
      overall,
      checks,
      timestamp: new Date().toISOString(),
      version: env?.CF_VERSION_METADATA?.id,
      environment: env?.ENVIRONMENT || 'development'
    };

    logger.info('System health check completed', {
      overall,
      unhealthyServices: unhealthyCount,
      degradedServices: degradedCount
    });

    return systemHealth;
  }

  // Get business metrics
  async getBusinessMetrics(): Promise<BusinessMetrics> {
    try {
      // Query business metrics from database
      const [activeUsers, draftsGenerated, messagesFinalized] = await Promise.all([
        // Active users in last 24 hours
        db.user.count({
          where: {
            lastActiveAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
          }
        }),
        
        // Drafts generated in last 24 hours
        db.draftMessage.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
          }
        }),
        
        // Messages finalized in last 24 hours
        db.finalizedMessage.count({
          where: {
            finalizedAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
          }
        })
      ]);

      // Calculate error rate from recent audit logs
      const recentErrors = await db.auditLog.count({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          },
          event: {
            contains: 'error'
          }
        }
      });

      const totalEvents = await db.auditLog.count({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      });

      const errorRate = totalEvents > 0 ? (recentErrors / totalEvents) * 100 : 0;

      const metrics: BusinessMetrics = {
        activeUsers,
        draftsGenerated,
        messagesFinalized,
        errorRate,
        averageResponseTime: 150, // Would calculate from actual performance logs
        timestamp: new Date().toISOString()
      };

      logger.business('Business metrics collected', 0, {
        activeUsers,
        draftsGenerated,
        messagesFinalized,
        errorRate
      });

      return metrics;
    } catch (error) {
      logger.error('Failed to collect business metrics', error as Error);
      
      return {
        activeUsers: 0,
        draftsGenerated: 0,
        messagesFinalized: 0,
        errorRate: 100,
        averageResponseTime: 0,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Generate Prometheus-compatible metrics
  generatePrometheusMetrics(businessMetrics: BusinessMetrics): string {
    const timestamp = Date.now();
    
    return `
# HELP ai_concierge_active_users Number of active users in last 24 hours
# TYPE ai_concierge_active_users gauge
ai_concierge_active_users{environment="${env?.ENVIRONMENT || 'development'}"} ${businessMetrics.activeUsers} ${timestamp}

# HELP ai_concierge_drafts_generated Total drafts generated in last 24 hours
# TYPE ai_concierge_drafts_generated counter
ai_concierge_drafts_generated{environment="${env?.ENVIRONMENT || 'development'}"} ${businessMetrics.draftsGenerated} ${timestamp}

# HELP ai_concierge_messages_finalized Total messages finalized in last 24 hours
# TYPE ai_concierge_messages_finalized counter
ai_concierge_messages_finalized{environment="${env?.ENVIRONMENT || 'development'}"} ${businessMetrics.messagesFinalized} ${timestamp}

# HELP ai_concierge_error_rate Error rate percentage in last 24 hours
# TYPE ai_concierge_error_rate gauge
ai_concierge_error_rate{environment="${env?.ENVIRONMENT || 'development'}"} ${businessMetrics.errorRate} ${timestamp}

# HELP ai_concierge_response_time_avg Average response time in milliseconds
# TYPE ai_concierge_response_time_avg gauge
ai_concierge_response_time_avg{environment="${env?.ENVIRONMENT || 'development'}"} ${businessMetrics.averageResponseTime} ${timestamp}
    `.trim();
  }

  // Alert configuration and thresholds
  checkAlerts(health: SystemHealth, metrics: BusinessMetrics): Array<{
    level: 'warning' | 'critical';
    message: string;
    service?: string;
  }> {
    const alerts = [];

    // Health-based alerts
    health.checks.forEach(check => {
      if (check.status === 'unhealthy') {
        alerts.push({
          level: 'critical' as const,
          message: `Service ${check.service} is unhealthy: ${check.error || 'Unknown error'}`,
          service: check.service
        });
      } else if (check.status === 'degraded') {
        alerts.push({
          level: 'warning' as const,
          message: `Service ${check.service} is degraded (response time: ${check.responseTime}ms)`,
          service: check.service
        });
      }
    });

    // Business metrics alerts
    if (metrics.errorRate > 10) {
      alerts.push({
        level: 'critical' as const,
        message: `High error rate detected: ${metrics.errorRate.toFixed(2)}%`
      });
    } else if (metrics.errorRate > 5) {
      alerts.push({
        level: 'warning' as const,
        message: `Elevated error rate: ${metrics.errorRate.toFixed(2)}%`
      });
    }

    if (metrics.averageResponseTime > 2000) {
      alerts.push({
        level: 'critical' as const,
        message: `High response time: ${metrics.averageResponseTime}ms`
      });
    } else if (metrics.averageResponseTime > 1000) {
      alerts.push({
        level: 'warning' as const,
        message: `Elevated response time: ${metrics.averageResponseTime}ms`
      });
    }

    return alerts;
  }

  // Get detailed performance metrics
  async getDetailedPerformanceMetrics(): Promise<DetailedPerformanceMetrics> {
    const performanceTracker = PerformanceTracker.getInstance();
    const summary = performanceTracker.getPerformanceSummary();
    const recentMetrics = performanceTracker.getMetrics();
    
    // Calculate additional percentiles
    const durations = recentMetrics.map(m => m.duration).sort((a, b) => a - b);
    const p99Index = Math.floor(durations.length * 0.99);
    const p99ResponseTime = durations.length > 0 ? durations[p99Index] || 0 : 0;
    
    // Enhanced category breakdown with slowest operations
    const enhancedCategoryBreakdown: Record<string, {
      totalTime: number;
      count: number;
      avgTime: number;
      slowestOperation: string;
    }> = {};
    
    for (const [category, stats] of Object.entries(summary.categoryBreakdown)) {
      const categoryMetrics = recentMetrics.filter(m => m.category === category);
      const slowestOp = categoryMetrics.reduce((slowest, current) => 
        current.duration > slowest.duration ? current : slowest, 
        categoryMetrics[0] || { operation: 'none', duration: 0 }
      );
      
      enhancedCategoryBreakdown[category] = {
        ...stats,
        slowestOperation: slowestOp.operation
      };
    }

    // Enhanced slowest operations with category info
    const enhancedSlowestOps = summary.slowestOperations.map(op => {
      const metric = recentMetrics.find(m => m.operation === op.operation);
      return {
        ...op,
        category: metric?.category || 'unknown'
      };
    });

    // Performance alerts
    const alerts: Array<{
      level: 'warning' | 'critical';
      message: string;
      metric: string;
      value: number;
      threshold: number;
    }> = [];

    // Response time alerts
    if (summary.averageResponseTime > 2000) {
      alerts.push({
        level: 'critical',
        message: 'Average response time exceeds 2 seconds',
        metric: 'averageResponseTime',
        value: summary.averageResponseTime,
        threshold: 2000
      });
    } else if (summary.averageResponseTime > 1000) {
      alerts.push({
        level: 'warning',
        message: 'Average response time exceeds 1 second',
        metric: 'averageResponseTime',
        value: summary.averageResponseTime,
        threshold: 1000
      });
    }

    // P95 alerts
    if (summary.p95ResponseTime > 5000) {
      alerts.push({
        level: 'critical',
        message: 'P95 response time exceeds 5 seconds',
        metric: 'p95ResponseTime',
        value: summary.p95ResponseTime,
        threshold: 5000
      });
    }

    // Database performance alerts
    const dbMetrics = recentMetrics.filter(m => m.category === 'database');
    const avgDbTime = dbMetrics.length > 0 
      ? dbMetrics.reduce((sum, m) => sum + m.duration, 0) / dbMetrics.length 
      : 0;
    
    if (avgDbTime > 500) {
      alerts.push({
        level: 'warning',
        message: 'Database queries are slow',
        metric: 'databaseResponseTime',
        value: avgDbTime,
        threshold: 500
      });
    }

    // AI API performance alerts
    const aiMetrics = recentMetrics.filter(m => m.category === 'ai_api');
    const avgAiTime = aiMetrics.length > 0 
      ? aiMetrics.reduce((sum, m) => sum + m.duration, 0) / aiMetrics.length 
      : 0;
    
    if (avgAiTime > 3000) {
      alerts.push({
        level: 'warning',
        message: 'AI API calls are slow',
        metric: 'aiApiResponseTime',
        value: avgAiTime,
        threshold: 3000
      });
    }

    // Mock resource usage data (would be real in production)
    const resourceUsage = {
      memoryPressure: this.calculateMemoryPressure(recentMetrics),
      databaseConnections: await this.getDatabaseConnectionCount(),
      queueDepth: 0 // Would integrate with Cloudflare Queues API
    };

    return {
      summary: {
        ...summary,
        p99ResponseTime,
        errorRate: 0 // Would calculate from actual error metrics
      },
      categoryBreakdown: enhancedCategoryBreakdown,
      slowestOperations: enhancedSlowestOps,
      recentMetrics: recentMetrics.slice(-50), // Last 50 metrics
      alerts,
      resourceUsage,
      timestamp: new Date().toISOString()
    };
  }

  private calculateMemoryPressure(metrics: PerformanceMetric[]): 'low' | 'medium' | 'high' {
    // Calculate based on metric details that include memory deltas
    const memoryMetrics = metrics
      .map(m => m.details?.memoryDelta)
      .filter(delta => typeof delta === 'number') as number[];
    
    if (memoryMetrics.length === 0) return 'low';
    
    const avgMemoryDelta = memoryMetrics.reduce((sum, delta) => sum + delta, 0) / memoryMetrics.length;
    
    if (avgMemoryDelta > 10 * 1024 * 1024) return 'high'; // 10MB average delta
    if (avgMemoryDelta > 5 * 1024 * 1024) return 'medium'; // 5MB average delta
    return 'low';
  }

  private async getDatabaseConnectionCount(): Promise<number> {
    try {
      // Mock implementation - would use actual connection pool metrics
      return 5; // Active connections
    } catch {
      return 0;
    }
  }

  // OpenAI API quota and performance tracking
  async getOpenAIMetrics(): Promise<{
    quotaUsage: { used: number; limit: number; resetTime: string };
    averageResponseTime: number;
    errorRate: number;
    requestsLast24h: number;
    recentErrors: Array<{ timestamp: string; error: string; endpoint: string }>;
  }> {
    const performanceTracker = PerformanceTracker.getInstance();
    const aiMetrics = performanceTracker.getMetrics().filter(m => m.category === 'ai_api');
    
    const last24h = Date.now() - (24 * 60 * 60 * 1000);
    const recent24hMetrics = aiMetrics.filter(m => m.startTime > last24h);
    
    const avgResponseTime = recent24hMetrics.length > 0
      ? recent24hMetrics.reduce((sum, m) => sum + m.duration, 0) / recent24hMetrics.length
      : 0;

    // Mock data - would integrate with OpenAI usage API
    return {
      quotaUsage: {
        used: 1250,
        limit: 10000,
        resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      },
      averageResponseTime: avgResponseTime,
      errorRate: 0.02, // 2% error rate
      requestsLast24h: recent24hMetrics.length,
      recentErrors: []
    };
  }
}

// Singleton monitoring service
export const monitoring = new MonitoringService();

// Request performance tracking
export class RequestTracker {
  private startTime: number;
  private requestId: string;
  private endpoint: string;
  private method: string;

  constructor(requestId: string, endpoint: string, method: string) {
    this.startTime = Date.now();
    this.requestId = requestId;
    this.endpoint = endpoint;
    this.method = method;
  }

  finish(statusCode: number, userId?: string): void {
    const duration = Date.now() - this.startTime;
    
    logger.performance('HTTP Request', duration, {
      requestId: this.requestId,
      endpoint: this.endpoint,
      httpMethod: this.method,
      statusCode,
      userId
    });

    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        requestId: this.requestId,
        endpoint: this.endpoint,
        duration,
        statusCode
      });
    }
  }
}
