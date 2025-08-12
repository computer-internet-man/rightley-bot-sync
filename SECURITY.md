# Security Gates Implementation

This document describes the comprehensive security implementation for the RedwoodSDK Cloudflare application.

## Overview

The security gates provide multi-layered protection including:

- **Rate Limiting**: IP and user-based limits with sliding window algorithm
- **Web Application Firewall (WAF)**: Detection and blocking of common attacks
- **DDoS Protection**: Anomaly detection and automatic blocking
- **Enhanced Security Headers**: Comprehensive HTTP security headers
- **Security Monitoring**: Real-time metrics and alerting

## Architecture

```
Request → Security Gateway → [Rate Limiter] → [WAF] → [DDoS Protection] → Application
                                ↓
                          Security Monitoring & Logging
```

## Components

### 1. Rate Limiting (`src/middleware/rateLimiter.ts`)

- **IP-based limiting**: 100 requests/minute per IP (configurable)
- **User-based limiting**: 500 requests/minute per authenticated user
- **Sliding window algorithm**: More accurate than fixed windows
- **Burst allowance**: 50% above base limit for brief spikes
- **Admin bypass**: Admin users skip rate limiting

**Configuration:**
```env
SECURITY_RATE_LIMIT_IP=100
SECURITY_RATE_LIMIT_USER=500
```

### 2. Web Application Firewall (`src/middleware/waf.ts`)

Protects against:
- **SQL Injection**: UNION, comments, dangerous functions
- **XSS Attacks**: Script tags, javascript: protocol, event handlers
- **Path Traversal**: Directory traversal attempts
- **Command Injection**: Shell metacharacters and system commands
- **Bot Detection**: Suspicious User-Agent patterns
- **Geo-blocking**: Country-based restrictions (optional)

**Configuration:**
```env
SECURITY_ENABLE_WAF=true
SECURITY_ENABLE_GEO_BLOCKING=false
SECURITY_BLOCKED_COUNTRIES=CN,RU
```

### 3. DDoS Protection (`src/middleware/ddosProtection.ts`)

Features:
- **Request pattern analysis**: Detects automated behavior
- **Anomaly scoring**: 0-100 scale with configurable threshold
- **Burst detection**: Identifies sudden traffic spikes
- **Automatic blocking**: Temporary IP blocks for high anomaly scores
- **Behavior analysis**: User-Agent consistency, response time patterns

**Configuration:**
```env
SECURITY_DDOS_THRESHOLD=1000
SECURITY_ANOMALY_THRESHOLD=50
```

### 4. Enhanced Security Headers (`src/middleware/securityHeaders.ts`)

Implements:
- **HSTS**: Force HTTPS with 2-year max-age
- **CSP**: Strict Content Security Policy with nonce support
- **Frame Protection**: Prevent clickjacking
- **Content Type Protection**: Prevent MIME sniffing
- **Referrer Policy**: Control referrer information
- **Permissions Policy**: Restrict browser features

### 5. Security Monitoring (`src/lib/securityMonitoring.ts`)

Provides:
- **Real-time metrics**: Rate limiting, WAF blocks, DDoS events
- **Security scoring**: Overall security posture (0-100)
- **Alert system**: Automated security alerts via Sentry
- **Dashboard endpoints**: `/debug/security` and `/monitoring/security`

## KV Namespaces

The security system uses Cloudflare KV for storage:

- **RATE_LIMITER**: Stores rate limiting counters and request history
- **SECURITY_BLOCKLIST**: Maintains blocked IPs and security violations

## Usage

### Development Commands

```bash
# Run comprehensive security verification
npm run security:verify

# Check security status
npm run security:test

# View security monitoring dashboard
npm run security:monitor

# Check security headers
npm run security:headers
```

### Manual Testing

```bash
# Test rate limiting
for i in {1..10}; do curl http://localhost:5173/test; done

# Test SQL injection detection
curl "http://localhost:5173/test?id=1' OR 1=1--"

# Test XSS detection
curl -X POST http://localhost:5173/test -d "comment=<script>alert(1)</script>"

# Test bot detection
curl http://localhost:5173/test -H "User-Agent: sqlmap/1.0"

# Test security monitoring
curl http://localhost:5173/debug/security | jq
curl http://localhost:5173/monitoring/security | jq
```

## Security Endpoints

- `GET /debug/security` - Security metrics and status
- `GET /monitoring/security` - Comprehensive security dashboard
- `GET /debug/security-headers` - Security headers analysis
- `POST /security/csp-report` - CSP violation reporting

## Configuration

All security features can be configured via environment variables:

```env
# Rate Limiting
SECURITY_RATE_LIMIT_IP=100
SECURITY_RATE_LIMIT_USER=500

# WAF
SECURITY_ENABLE_WAF=true
SECURITY_ENABLE_GEO_BLOCKING=false
SECURITY_BLOCKED_COUNTRIES=

# DDoS Protection
SECURITY_DDOS_THRESHOLD=1000
SECURITY_ANOMALY_THRESHOLD=50
```

## Integration with Existing Systems

### Sentry Integration
- Security events are logged to Sentry with appropriate severity levels
- User context and request details are included
- Breadcrumbs track security middleware execution

### Performance Monitoring
- Security checks are instrumented with performance tracking
- Server-Timing headers include security processing times
- Security overhead is monitored and optimized

### Authentication System
- Integrates with existing Cloudflare Access authentication
- Role-based bypass mechanisms (admin users skip rate limiting)
- User context is passed through security layers

## Security Considerations

1. **Fail-open strategy**: On errors, requests are allowed to ensure availability
2. **Performance impact**: Security checks add <10ms to request processing
3. **False positives**: WAF rules are tuned to minimize legitimate request blocking
4. **Monitoring**: All security events are logged for analysis and tuning

## Maintenance

### Regular Tasks
- Review security metrics weekly
- Tune WAF rules based on false positive reports
- Update rate limiting thresholds based on usage patterns
- Monitor security alerts and investigate anomalies

### Updates
- Security rules are code-based and version controlled
- Configuration changes can be deployed via environment variables
- New attack patterns can be added to WAF rules

## Emergency Response

In case of an active attack:

1. **Immediate blocking**: Add IPs to blocklist via KV
2. **Rate limit adjustment**: Lower thresholds temporarily
3. **WAF tuning**: Enable stricter rules if needed
4. **Monitoring**: Use security dashboard to track attack patterns

```bash
# Emergency rate limit reduction
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/{account}/storage/kv/namespaces/{namespace}/values/emergency_rate_limit" \
  -H "Authorization: Bearer {token}" \
  -d "10"
```

## Performance Impact

Security gates are designed for minimal performance impact:

- **Rate limiting**: ~2ms per request
- **WAF analysis**: ~3-5ms per request  
- **DDoS detection**: ~1-2ms per request
- **Total overhead**: <10ms for most requests

## Compliance

This implementation helps meet various security standards:

- **OWASP Top 10**: Protection against major web vulnerabilities
- **SOC 2**: Security monitoring and logging requirements
- **PCI DSS**: If handling payment data (additional configuration needed)
- **GDPR**: Privacy controls and data protection headers
