# Monitoring and Observability Guide

## Overview
Comprehensive guide for monitoring the AI Concierge healthcare communication platform using the enhanced observability stack.

## Monitoring Endpoints

### Health Checks
```bash
# Overall system health
curl -s https://your-domain.com/monitoring/health

# Expected response for healthy system:
{
  "overall": "healthy",
  "checks": [
    {
      "service": "database",
      "status": "healthy",
      "responseTime": 45,
      "lastChecked": "2024-01-15T10:30:00.000Z"
    },
    {
      "service": "openai",
      "status": "healthy",
      "responseTime": 120,
      "lastChecked": "2024-01-15T10:30:00.000Z"
    },
    {
      "service": "queue",
      "status": "healthy",
      "responseTime": 15,
      "lastChecked": "2024-01-15T10:30:00.000Z"
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "abc123",
  "environment": "production"
}
```

### Business Metrics
```bash
# Prometheus-compatible metrics
curl -s https://your-domain.com/monitoring/metrics

# Example output:
# HELP ai_concierge_active_users Number of active users in last 24 hours
# TYPE ai_concierge_active_users gauge
ai_concierge_active_users{environment="production"} 42 1705312200000

# HELP ai_concierge_drafts_generated Total drafts generated in last 24 hours
# TYPE ai_concierge_drafts_generated counter
ai_concierge_drafts_generated{environment="production"} 156 1705312200000
```

### Alert Status
```bash
# Current alert status
curl -s https://your-domain.com/monitoring/alerts

# Response includes active alerts and thresholds
{
  "status": "warning",
  "activeAlerts": 1,
  "alerts": [
    {
      "level": "warning",
      "message": "Elevated response time: 1200ms"
    }
  ],
  "thresholds": {
    "errorRate": { "warning": 5, "critical": 10 },
    "responseTime": { "warning": 1000, "critical": 2000 }
  }
}
```

## Key Performance Indicators (KPIs)

### System Health KPIs
- **Uptime**: Target 99.9%
- **Error Rate**: < 1%
- **Response Time**: < 500ms (95th percentile)
- **Database Response**: < 100ms

### Business KPIs
- **Draft Generation Success Rate**: > 95%
- **Message Finalization Rate**: > 90%
- **User Authentication Success**: > 99%
- **Queue Processing Time**: < 30 seconds

### Security KPIs
- **Failed Authentication Attempts**: Monitor for patterns
- **Unauthorized Access Attempts**: Alert on > 5/hour
- **Data Access Auditing**: 100% coverage

## Alerting Configuration

### Critical Alerts (P0)
- System health: `unhealthy`
- Error rate: > 10%
- Response time: > 2000ms
- Database connectivity: Failed
- Authentication system: Down

### Warning Alerts (P1)
- System health: `degraded`
- Error rate: > 5%
- Response time: > 1000ms
- OpenAI API: Slow responses
- Queue processing: Delayed

### Information Alerts (P2)
- High resource usage
- Slow query performance
- Unusual traffic patterns

## Sentry Integration

### Error Tracking
```bash
# Check Sentry integration status
curl -s https://your-domain.com/monitoring/sentry

# Sentry dashboard features:
# - Real-time error tracking
# - Performance monitoring
# - Release health
# - User feedback
```

### Custom Tags
- `service`: ai-concierge
- `component`: worker
- `endpoint_category`: api, debug, monitoring, auth
- `environment`: production, staging, local
- `feature_flags`: enabled features

### Performance Monitoring
- **Custom spans** for database operations
- **Business transaction tracking**
- **User journey monitoring**
- **API endpoint performance**

## Log Analysis

### Structured Logging
```bash
# Test logging framework
curl -s https://your-domain.com/debug/logging-test

# Log levels:
# - DEBUG: Development debugging
# - INFO: General information
# - WARN: Warning conditions
# - ERROR: Error conditions
# - CRITICAL: Critical errors
```

### Log Categories
- **Performance**: Operation timing and performance metrics
- **Audit**: User actions and system changes
- **Security**: Authentication and authorization events
- **Business**: Key business metrics and events

### Log Correlation
- **Request ID**: Traces requests across services
- **User Context**: User ID, role, email (masked)
- **Operation Context**: Operation type, duration
- **Error Context**: Stack traces, error codes

## Performance Monitoring

### Response Time Tracking
```bash
# Performance dashboard
curl -s https://your-domain.com/monitoring/performance

{
  "averageResponseTime": 150,
  "p95ResponseTime": 300,
  "requestsPerMinute": 45,
  "errorRate": 0.5,
  "slowestEndpoints": [
    {
      "endpoint": "/api/generate-draft",
      "avgTime": 850,
      "count": 12
    }
  ]
}
```

### Server-Timing Headers
Every response includes performance timing:
```
Server-Timing: total;dur=150, worker;dur=145, env="production", version="abc123"
```

## Business Intelligence Dashboard

### Healthcare-Specific Metrics
- **Patient Communication Volume**: Messages per day
- **Provider Response Times**: Time to respond to messages
- **Compliance Metrics**: Audit trail completeness
- **AI Usage**: OpenAI API calls and costs

### Operational Metrics
- **User Engagement**: Login frequency, feature usage
- **System Resource Usage**: Database queries, memory usage
- **Delivery Success Rates**: Email/SMS delivery statistics
- **Queue Processing**: Job completion rates and times

## Troubleshooting Guide

### High Error Rate
1. Check Sentry for error patterns
2. Review recent deployments
3. Verify external service health (OpenAI, Email providers)
4. Check database connectivity and performance

### Slow Response Times
1. Analyze Server-Timing headers
2. Check database query performance
3. Review OpenAI API latency
4. Verify Cloudflare Workers performance

### Authentication Issues
1. Verify Cloudflare Access configuration
2. Check JWT validation logic
3. Review user role assignments
4. Test RBAC middleware

### Queue Processing Delays
1. Check queue depth and processing rate
2. Verify job processor health
3. Review worker resource allocation
4. Check external service dependencies

## Compliance and Auditing

### HIPAA Compliance Monitoring
- **Access Logging**: All PHI access logged
- **Data Sanitization**: PII/PHI removed from logs
- **Audit Trail**: Complete audit trail maintenance
- **Security Events**: Authentication failures tracked

### Audit Reports
- **Monthly**: System health and performance summary
- **Quarterly**: Security and compliance review
- **Annual**: Complete system audit and assessment

## Maintenance Windows

### Scheduled Maintenance
- **Database maintenance**: Monthly, 2 AM UTC Sunday
- **System updates**: Bi-weekly, as needed
- **Performance optimization**: Quarterly

### Emergency Maintenance
- **Critical security patches**: As needed
- **Database corruption**: Immediate response
- **Service outages**: Immediate response

## Contact Information

### Monitoring Team
- **Primary**: [monitoring-team@company.com]
- **Secondary**: [ops-team@company.com]
- **Emergency**: [emergency-contact]

### Escalation
- **Level 1**: Monitoring Engineer
- **Level 2**: Senior SRE + Database Admin
- **Level 3**: Engineering Manager
- **Level 4**: CTO + Compliance Officer
