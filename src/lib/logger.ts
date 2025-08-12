/**
 * Structured Logging Framework
 * Provides consistent, contextual logging with Sentry integration
 */

import { env } from "cloudflare:workers";

export interface LogContext {
  requestId?: string;
  userId?: string;
  email?: string;
  role?: string;
  operation?: string;
  duration?: number;
  endpoint?: string;
  httpMethod?: string;
  statusCode?: number;
  userAgent?: string;
  ipAddress?: string;
  errorCode?: string;
  correlationId?: string;
  [key: string]: any;
}

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: LogContext;
  environment: string;
  version?: string;
}

class Logger {
  private environment: string;
  private version?: string;
  private minLogLevel: LogLevel;

  constructor() {
    this.environment = env?.ENVIRONMENT || 'development';
    this.version = env?.CF_VERSION_METADATA?.id;
    // Set minimum log level based on environment
    this.minLogLevel = this.environment === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLogLevel;
  }

  private formatLogEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      context: context ? this.sanitizeContext(context) : undefined,
      environment: this.environment,
      version: this.version
    };
  }

  private sanitizeContext(context: LogContext): LogContext {
    // Remove sensitive information from logs
    const sanitized = { ...context };
    
    // Remove potential PHI/PII
    delete sanitized.patientData;
    delete sanitized.medicalInfo;
    delete sanitized.personalInfo;
    delete sanitized.ssn;
    delete sanitized.dob;
    delete sanitized.phoneNumber;
    
    // Mask sensitive fields
    if (sanitized.email) {
      sanitized.email = this.maskEmail(sanitized.email);
    }
    
    return sanitized;
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (local.length <= 3) {
      return `${local[0]}***@${domain}`;
    }
    return `${local.substring(0, 2)}***${local.slice(-1)}@${domain}`;
  }

  private output(entry: LogEntry): void {
    const formatted = JSON.stringify(entry);
    
    switch (entry.level) {
      case 'DEBUG':
      case 'INFO':
        console.log(formatted);
        break;
      case 'WARN':
        console.warn(formatted);
        break;
      case 'ERROR':
      case 'CRITICAL':
        console.error(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const entry = this.formatLogEntry(LogLevel.DEBUG, message, context);
    this.output(entry);
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry = this.formatLogEntry(LogLevel.INFO, message, context);
    this.output(entry);
  }

  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const entry = this.formatLogEntry(LogLevel.WARN, message, context);
    this.output(entry);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const errorContext = {
      ...context,
      errorMessage: error?.message,
      errorStack: error?.stack,
      errorName: error?.name
    };
    
    const entry = this.formatLogEntry(LogLevel.ERROR, message, errorContext);
    this.output(entry);
  }

  critical(message: string, error?: Error, context?: LogContext): void {
    const errorContext = {
      ...context,
      errorMessage: error?.message,
      errorStack: error?.stack,
      errorName: error?.name
    };
    
    const entry = this.formatLogEntry(LogLevel.CRITICAL, message, errorContext);
    this.output(entry);
  }

  performance(operation: string, duration: number, context?: LogContext): void {
    this.info(`Performance: ${operation}`, {
      ...context,
      operation,
      duration,
      performanceMetric: true
    });
  }

  audit(action: string, context?: LogContext): void {
    this.info(`Audit: ${action}`, {
      ...context,
      action,
      auditLog: true
    });
  }

  security(event: string, context?: LogContext): void {
    this.warn(`Security: ${event}`, {
      ...context,
      event,
      securityEvent: true
    });
  }

  business(metric: string, value: number, context?: LogContext): void {
    this.info(`Business Metric: ${metric}`, {
      ...context,
      metric,
      value,
      businessMetric: true
    });
  }

  // Request correlation helper
  withRequest(requestId: string, userId?: string, email?: string, role?: string) {
    const baseContext: LogContext = {
      requestId,
      userId,
      email: email ? this.maskEmail(email) : undefined,
      role
    };

    return {
      debug: (message: string, context?: LogContext) => 
        this.debug(message, { ...baseContext, ...context }),
      info: (message: string, context?: LogContext) => 
        this.info(message, { ...baseContext, ...context }),
      warn: (message: string, context?: LogContext) => 
        this.warn(message, { ...baseContext, ...context }),
      error: (message: string, error?: Error, context?: LogContext) => 
        this.error(message, error, { ...baseContext, ...context }),
      critical: (message: string, error?: Error, context?: LogContext) => 
        this.critical(message, error, { ...baseContext, ...context }),
      performance: (operation: string, duration: number, context?: LogContext) => 
        this.performance(operation, duration, { ...baseContext, ...context }),
      audit: (action: string, context?: LogContext) => 
        this.audit(action, { ...baseContext, ...context }),
      security: (event: string, context?: LogContext) => 
        this.security(event, { ...baseContext, ...context }),
      business: (metric: string, value: number, context?: LogContext) => 
        this.business(metric, value, { ...baseContext, ...context })
    };
  }
}

// Enhanced Performance Tracking System
export interface PerformanceMetric {
  operation: string;
  duration: number;
  startTime: number;
  endTime: number;
  category: 'database' | 'ai_api' | 'rendering' | 'middleware' | 'cache' | 'external_api' | 'auth' | 'queue';
  details?: Record<string, any>;
}

export class PerformanceTracker {
  private static instance: PerformanceTracker;
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private activeTimers: Map<string, { startTime: number; operation: string; category: PerformanceMetric['category']; context?: LogContext }> = new Map();
  
  static getInstance(): PerformanceTracker {
    if (!PerformanceTracker.instance) {
      PerformanceTracker.instance = new PerformanceTracker();
    }
    return PerformanceTracker.instance;
  }

  startTimer(operation: string, category: PerformanceMetric['category'], context?: LogContext): string {
    const timerId = crypto.randomUUID();
    this.activeTimers.set(timerId, {
      startTime: Date.now(),
      operation,
      category,
      context
    });
    return timerId;
  }

  endTimer(timerId: string, details?: Record<string, any>): PerformanceMetric | null {
    const timer = this.activeTimers.get(timerId);
    if (!timer) {
      logger.warn('Performance timer not found', { timerId });
      return null;
    }

    const endTime = Date.now();
    const duration = endTime - timer.startTime;
    
    const metric: PerformanceMetric = {
      operation: timer.operation,
      duration,
      startTime: timer.startTime,
      endTime,
      category: timer.category,
      details
    };

    // Store metric for request-scoped collection
    const requestId = timer.context?.requestId || 'global';
    if (!this.metrics.has(requestId)) {
      this.metrics.set(requestId, []);
    }
    this.metrics.get(requestId)!.push(metric);

    // Log performance metric
    logger.performance(timer.operation, duration, {
      ...timer.context,
      category: timer.category,
      ...details
    });

    this.activeTimers.delete(timerId);
    return metric;
  }

  getMetrics(requestId?: string): PerformanceMetric[] {
    if (requestId) {
      return this.metrics.get(requestId) || [];
    }
    
    // Return all metrics from last 5 minutes for global view
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const allMetrics: PerformanceMetric[] = [];
    
    for (const metrics of this.metrics.values()) {
      allMetrics.push(...metrics.filter(m => m.endTime > fiveMinutesAgo));
    }
    
    return allMetrics;
  }

  generateServerTimingHeader(requestId: string): string {
    const metrics = this.getMetrics(requestId);
    const timings: string[] = [];

    // Aggregate by category
    const categories = new Map<string, { total: number; count: number; operations: string[] }>();
    
    for (const metric of metrics) {
      if (!categories.has(metric.category)) {
        categories.set(metric.category, { total: 0, count: 0, operations: [] });
      }
      const cat = categories.get(metric.category)!;
      cat.total += metric.duration;
      cat.count += 1;
      cat.operations.push(metric.operation);
    }

    // Generate Server-Timing entries
    for (const [category, data] of categories) {
      timings.push(`${category};dur=${data.total};desc="${data.count} operations"`);
    }

    // Add individual slow operations (>100ms)
    const slowOps = metrics.filter(m => m.duration > 100);
    for (const op of slowOps) {
      const safeName = op.operation.replace(/[^a-zA-Z0-9_-]/g, '_');
      timings.push(`${safeName};dur=${op.duration}`);
    }

    return timings.join(', ');
  }

  clearMetrics(requestId: string): void {
    this.metrics.delete(requestId);
  }

  getPerformanceSummary(): {
    totalRequests: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    slowestOperations: Array<{ operation: string; avgDuration: number; count: number }>;
    categoryBreakdown: Record<string, { totalTime: number; count: number; avgTime: number }>;
  } {
    const allMetrics = this.getMetrics();
    
    const operationStats = new Map<string, { durations: number[]; count: number }>();
    const categoryStats = new Map<string, { totalTime: number; count: number }>();
    
    for (const metric of allMetrics) {
      // Operation stats
      if (!operationStats.has(metric.operation)) {
        operationStats.set(metric.operation, { durations: [], count: 0 });
      }
      operationStats.get(metric.operation)!.durations.push(metric.duration);
      operationStats.get(metric.operation)!.count += 1;
      
      // Category stats
      if (!categoryStats.has(metric.category)) {
        categoryStats.set(metric.category, { totalTime: 0, count: 0 });
      }
      const catStat = categoryStats.get(metric.category)!;
      catStat.totalTime += metric.duration;
      catStat.count += 1;
    }

    // Calculate response times for requests
    const requestMetrics = new Map<string, number>();
    for (const [requestId, metrics] of this.metrics) {
      const totalTime = metrics.reduce((sum, m) => sum + m.duration, 0);
      requestMetrics.set(requestId, totalTime);
    }

    const responseTimes = Array.from(requestMetrics.values());
    responseTimes.sort((a, b) => a - b);
    
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0;
    
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p95ResponseTime = responseTimes.length > 0 ? responseTimes[p95Index] || 0 : 0;

    // Slowest operations
    const slowestOperations = Array.from(operationStats.entries())
      .map(([operation, stats]) => ({
        operation,
        avgDuration: stats.durations.reduce((sum, d) => sum + d, 0) / stats.durations.length,
        count: stats.count
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);

    // Category breakdown
    const categoryBreakdown: Record<string, { totalTime: number; count: number; avgTime: number }> = {};
    for (const [category, stats] of categoryStats) {
      categoryBreakdown[category] = {
        totalTime: stats.totalTime,
        count: stats.count,
        avgTime: stats.totalTime / stats.count
      };
    }

    return {
      totalRequests: requestMetrics.size,
      averageResponseTime,
      p95ResponseTime,
      slowestOperations,
      categoryBreakdown
    };
  }
}

// Legacy Performance Timer for backward compatibility
export class PerformanceTimer {
  private startTime: number;
  private operation: string;
  private logger: Logger;
  private context?: LogContext;
  private timerId?: string;
  private category: PerformanceMetric['category'];

  constructor(operation: string, logger: Logger, context?: LogContext, category: PerformanceMetric['category'] = 'middleware') {
    this.operation = operation;
    this.logger = logger;
    this.context = context;
    this.category = category;
    this.startTime = Date.now();
    
    // Register with global tracker
    this.timerId = PerformanceTracker.getInstance().startTimer(operation, category, context);
  }

  end(additionalContext?: LogContext): number {
    const duration = Date.now() - this.startTime;
    
    // End the global tracker timer
    if (this.timerId) {
      PerformanceTracker.getInstance().endTimer(this.timerId, additionalContext);
    }
    
    this.logger.performance(this.operation, duration, {
      ...this.context,
      ...additionalContext
    });
    return duration;
  }
}

// Singleton logger instance
export const logger = new Logger();

// Performance helper
export function measurePerformance(operation: string, context?: LogContext): PerformanceTimer {
  return new PerformanceTimer(operation, logger, context);
}

// Request ID generator
export function generateRequestId(): string {
  return crypto.randomUUID();
}
