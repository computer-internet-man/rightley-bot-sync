# Troubleshooting Guide

## Table of Contents
- [Quick Reference](#quick-reference)
- [Common Issues](#common-issues)
- [Application Errors](#application-errors)
- [Database Issues](#database-issues)
- [Authentication Problems](#authentication-problems)
- [Performance Issues](#performance-issues)
- [Queue Problems](#queue-problems)
- [Security Issues](#security-issues)
- [Deployment Problems](#deployment-problems)
- [External Service Issues](#external-service-issues)
- [Debug Tools](#debug-tools)
- [Emergency Procedures](#emergency-procedures)

## Quick Reference

### Emergency Contacts
- **Primary On-Call**: +1-555-ON-CALL
- **Engineering Team**: engineering@yourcompany.com
- **Cloudflare Support**: Critical tickets via dashboard

### Critical Commands
```bash
# Health check
curl -f https://ai-concierge-mvp-prod.your-subdomain.workers.dev/health

# View logs
wrangler tail --env prod

# Rollback deployment
wrangler rollback <deployment-id> --env prod

# Check performance
curl -w "@curl-format.txt" https://ai-concierge-mvp-prod.your-subdomain.workers.dev/
```

### Status Indicators

| Component | Healthy | Warning | Critical |
|-----------|---------|---------|----------|
| Response Time | <50ms | 50-200ms | >200ms |
| Error Rate | <0.1% | 0.1-1% | >1% |
| Queue Processing | <5s | 5-30s | >30s |
| Database Queries | <10ms | 10-50ms | >50ms |

## Common Issues

### Issue: "Service Unavailable" Error (500)

**Symptoms:**
- Users receiving 500 errors
- Health check failing
- High error rate in logs

**Diagnosis:**
```bash
# Check service status
curl -f https://ai-concierge-mvp-prod.your-subdomain.workers.dev/health

# Review error logs
wrangler tail --env prod --grep "ERROR"

# Check Cloudflare status
# Visit status.cloudflare.com
```

**Resolution:**
```bash
# Quick fix: Rollback to previous version
wrangler deployments list --env prod
wrangler rollback <previous-deployment-id> --env prod

# If rollback doesn't help, check external dependencies
curl -f "https://api.openai.com/v1/models"
curl -f "https://api.sendgrid.com/v3/user/profile"
```

**Prevention:**
- Implement circuit breakers for external services
- Add comprehensive health checks
- Monitor deployment success rates

---

### Issue: Slow Response Times

**Symptoms:**
- Response times >200ms
- User complaints about slowness
- Timeout errors

**Diagnosis:**
```bash
# Check performance metrics
curl -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/performance

# Analyze Server-Timing headers
curl -I "https://ai-concierge-mvp-prod.your-subdomain.workers.dev/api/generate-draft" \
     -H "Authorization: Bearer <token>"

# Check database performance
wrangler d1 execute concierge_prod --remote --command "
  SELECT COUNT(*) FROM audit_logs WHERE created_at > datetime('now', '-1 hour');"
```

**Resolution:**
```bash
# Check for database locks
wrangler d1 execute concierge_prod --remote --command "PRAGMA busy_timeout = 5000;"

# Clear potential cache issues
wrangler kv:key delete "cache:slow-query" --namespace-id <KV_ID>

# Restart worker (redeploy)
wrangler deploy --env prod
```

**Prevention:**
- Add database indexes for common queries
- Implement query timeout limits
- Use caching for expensive operations

---

### Issue: Authentication Failures

**Symptoms:**
- Users unable to log in
- "Unauthorized" errors
- JWT validation failures

**Diagnosis:**
```bash
# Check authentication logs
wrangler tail --env prod --grep "AUTH"

# Test JWT validation
curl -H "Authorization: Bearer <test-token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/env

# Verify Cloudflare Access configuration
# Check Cloudflare Zero Trust dashboard
```

**Resolution:**
```bash
# Verify Cloudflare Access settings
wrangler secret list --env prod | grep CLOUDFLARE_ACCESS

# Test with known good token
# Generate token from Cloudflare Access dashboard

# Check issuer/audience configuration
curl -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/auth-config
```

**Prevention:**
- Monitor JWT token expiration
- Implement token refresh mechanisms
- Add authentication health checks

## Application Errors

### Error Code: AUTH_001 - Invalid JWT Token

**Error Message:** "JWT token validation failed"

**Cause:** Token expired, invalid signature, or wrong audience

**Resolution:**
```bash
# Check token expiration
echo "<jwt-token>" | base64 -d | jq '.exp'

# Verify audience/issuer
wrangler secret get CLOUDFLARE_ACCESS_AUD --env prod
wrangler secret get CLOUDFLARE_ACCESS_DOMAIN --env prod

# Generate new token from Cloudflare Access
```

---

### Error Code: DB_001 - Database Connection Failed

**Error Message:** "Failed to connect to database"

**Cause:** Database binding misconfigured or D1 service issue

**Resolution:**
```bash
# Check database binding
wrangler d1 list

# Test connection
wrangler d1 execute concierge_prod --remote --command "SELECT 1;"

# Verify wrangler.jsonc configuration
grep -A 5 "d1_databases" wrangler.jsonc
```

---

### Error Code: QUEUE_001 - Queue Processing Failed

**Error Message:** "Failed to process queue message"

**Cause:** Queue consumer error or external service failure

**Resolution:**
```bash
# Check queue status
curl -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/queue-status

# Review dead letter queue
wrangler queue consumer dlq --batch-size 1

# Check external service status
curl -f "https://api.sendgrid.com/v3/user/profile"
curl -f "https://api.twilio.com/2010-04-01/Accounts/<SID>.json"
```

---

### Error Code: RATE_001 - Rate Limit Exceeded

**Error Message:** "Rate limit exceeded for user/IP"

**Cause:** User or IP exceeded configured rate limits

**Resolution:**
```bash
# Check rate limit status
wrangler kv:key get "rate_limit:user:<user-id>" --namespace-id <RATE_LIMITER_ID>
wrangler kv:key get "rate_limit:ip:<ip-address>" --namespace-id <RATE_LIMITER_ID>

# Reset rate limit for legitimate user
wrangler kv:key delete "rate_limit:user:<user-id>" --namespace-id <RATE_LIMITER_ID>

# Adjust rate limits if needed
wrangler secret put SECURITY_RATE_LIMIT_USER --env prod
```

## Database Issues

### Issue: Database Query Timeouts

**Symptoms:**
- Database queries timing out
- "Database is locked" errors
- Slow response times

**Diagnosis:**
```bash
# Check for long-running queries
wrangler d1 execute concierge_prod --remote --command "
  SELECT name FROM sqlite_master WHERE type='table';"

# Check database size
wrangler d1 execute concierge_prod --remote --command "
  SELECT page_count * page_size / 1024 / 1024 as size_mb 
  FROM pragma_page_count(), pragma_page_size();"

# Look for lock contention
wrangler tail --env prod --grep "database is locked"
```

**Resolution:**
```bash
# Analyze slow queries
wrangler d1 execute concierge_prod --remote --command "ANALYZE;"

# Add missing indexes
wrangler d1 execute concierge_prod --remote --command "
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);"

# Optimize queries
wrangler d1 execute concierge_prod --remote --command "
  EXPLAIN QUERY PLAN SELECT * FROM audit_logs 
  WHERE created_at > datetime('now', '-1 day');"
```

---

### Issue: Database Migration Failures

**Symptoms:**
- Migration commands failing
- Schema version mismatches
- Application startup errors

**Diagnosis:**
```bash
# Check migration status
wrangler d1 migrations list concierge_prod

# Verify schema
wrangler d1 execute concierge_prod --remote --command ".schema"

# Check for partial migrations
wrangler tail --env prod --grep "MIGRATION"
```

**Resolution:**
```bash
# Rollback to known good migration
wrangler d1 migrations apply concierge_prod --to <previous-migration>

# Manually fix migration issues
wrangler d1 execute concierge_prod --remote --command "
  -- Fix any schema inconsistencies
  DROP TABLE IF EXISTS temp_migration_table;"

# Reapply migrations
wrangler d1 migrations apply concierge_prod --remote
```

---

### Issue: Data Integrity Problems

**Symptoms:**
- Inconsistent data
- Foreign key constraint errors
- Missing records

**Diagnosis:**
```bash
# Check database integrity
wrangler d1 execute concierge_prod --remote --command "PRAGMA integrity_check;"

# Find orphaned records
wrangler d1 execute concierge_prod --remote --command "
  SELECT COUNT(*) FROM patient_briefs 
  WHERE doctor_id NOT IN (SELECT id FROM users);"

# Check for duplicate records
wrangler d1 execute concierge_prod --remote --command "
  SELECT email, COUNT(*) FROM users 
  GROUP BY email HAVING COUNT(*) > 1;"
```

**Resolution:**
```bash
# Clean orphaned records
wrangler d1 execute concierge_prod --remote --command "
  DELETE FROM patient_briefs 
  WHERE doctor_id NOT IN (SELECT id FROM users);"

# Remove duplicates (keep newest)
wrangler d1 execute concierge_prod --remote --command "
  DELETE FROM users WHERE id NOT IN (
    SELECT MIN(id) FROM users GROUP BY email
  );"

# Update statistics
wrangler d1 execute concierge_prod --remote --command "ANALYZE;"
```

## Authentication Problems

### Issue: Cloudflare Access Integration Broken

**Symptoms:**
- All users getting 401 errors
- JWT validation always failing
- Unable to access any authenticated endpoints

**Diagnosis:**
```bash
# Check Cloudflare Access configuration
wrangler secret list --env prod | grep CLOUDFLARE_ACCESS

# Test with curl and valid token
curl -H "Authorization: Bearer <known-good-token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/env

# Check Access application configuration
# Visit Cloudflare Zero Trust dashboard
```

**Resolution:**
```bash
# Verify audience and domain settings
wrangler secret get CLOUDFLARE_ACCESS_AUD --env prod
wrangler secret get CLOUDFLARE_ACCESS_DOMAIN --env prod

# Update if necessary
wrangler secret put CLOUDFLARE_ACCESS_AUD --env prod
wrangler secret put CLOUDFLARE_ACCESS_DOMAIN --env prod

# Test authentication endpoint
curl -H "Authorization: Bearer <test-token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/test
```

---

### Issue: Role-Based Access Control Errors

**Symptoms:**
- Users with correct roles getting 403 errors
- Permission denied for valid operations
- Inconsistent access control

**Diagnosis:**
```bash
# Check user role in database
wrangler d1 execute concierge_prod --remote --command "
  SELECT email, role, created_at FROM users 
  WHERE email = 'user@example.com';"

# Review authentication logs
wrangler tail --env prod --grep "RBAC\|ROLE"

# Test role assignment
curl -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/user-info
```

**Resolution:**
```bash
# Update user role
wrangler d1 execute concierge_prod --remote --command "
  UPDATE users SET role = 'doctor' 
  WHERE email = 'user@example.com';"

# Clear role cache (if applicable)
wrangler kv:key delete "role_cache:user@example.com" --namespace-id <KV_ID>

# Verify role update
curl -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/user-info
```

## Performance Issues

### Issue: High Memory Usage

**Symptoms:**
- OutOfMemory errors in logs
- Worker restarts
- Slow response times

**Diagnosis:**
```bash
# Monitor memory usage
wrangler tail --env prod --grep "memory\|OutOfMemory"

# Check bundle size
du -sh dist/
ls -la dist/ | grep -E '\\.js$'

# Analyze heap usage
curl -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/memory
```

**Resolution:**
```bash
# Identify memory leaks
wrangler tail --env prod --grep "MEMORY_LEAK"

# Optimize bundle size
pnpm build --analyze
npx bundle-analyzer dist/

# Implement memory optimizations
# - Lazy load large modules
# - Clear caches regularly
# - Optimize data structures
```

---

### Issue: Database Performance Degradation

**Symptoms:**
- Slow database queries
- Query timeouts
- High database CPU usage

**Diagnosis:**
```bash
# Identify slow queries
wrangler d1 execute concierge_prod --remote --command "
  EXPLAIN QUERY PLAN SELECT * FROM audit_logs 
  WHERE created_at > datetime('now', '-1 day')
  ORDER BY created_at DESC LIMIT 100;"

# Check index usage
wrangler d1 execute concierge_prod --remote --command "
  SELECT name, sql FROM sqlite_master 
  WHERE type = 'index';"

# Monitor query patterns
wrangler tail --env prod --grep "DB_QUERY"
```

**Resolution:**
```bash
# Add missing indexes
wrangler d1 execute concierge_prod --remote --command "
  CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created 
  ON audit_logs(user_id, created_at);
  
  CREATE INDEX IF NOT EXISTS idx_patient_briefs_doctor_updated
  ON patient_briefs(doctor_id, updated_at);"

# Optimize query patterns
# - Use LIMIT clauses
# - Avoid SELECT *
# - Use prepared statements

# Analyze and vacuum
wrangler d1 execute concierge_prod --remote --command "ANALYZE; VACUUM;"
```

## Queue Problems

### Issue: Messages Stuck in Queue

**Symptoms:**
- Messages not being delivered
- High pending job count
- Queue processing stopped

**Diagnosis:**
```bash
# Check queue status
curl -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/queue-status

# Monitor queue logs
wrangler tail --env prod --grep "QUEUE"

# Check dead letter queue
wrangler queue consumer dlq --batch-size 5
```

**Resolution:**
```bash
# Restart queue processing
wrangler dev --env prod --test-scheduled

# Clear stuck jobs from dead letter queue
wrangler queue consumer dlq --purge

# Check external service connectivity
curl -f "https://api.sendgrid.com/v3/user/profile"
curl -f "https://api.twilio.com/2010-04-01/Accounts/<SID>.json"

# Manually process stuck jobs
curl -X POST -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/api/enqueue-job \
     -d '{"type": "retry_failed_jobs"}'
```

---

### Issue: High Queue Processing Errors

**Symptoms:**
- Many failed jobs in logs
- External service errors
- Jobs moving to dead letter queue

**Diagnosis:**
```bash
# Check error patterns
wrangler tail --env prod --grep "JOB_FAILED"

# Review external service errors
wrangler tail --env prod --grep "SENDGRID_ERROR\|TWILIO_ERROR"

# Check API key validity
curl -H "Authorization: Bearer <sendgrid-key>" \
     "https://api.sendgrid.com/v3/user/profile"
```

**Resolution:**
```bash
# Update API keys if expired
wrangler secret put SENDGRID_API_KEY --env prod
wrangler secret put TWILIO_AUTH_TOKEN --env prod

# Implement retry logic with exponential backoff
# Update queue consumer configuration

# Monitor external service status
# Check status pages for SendGrid, Twilio, etc.
```

## Security Issues

### Issue: Suspicious Traffic Patterns

**Symptoms:**
- High rate of failed authentication attempts
- Unusual traffic patterns
- Security alerts triggered

**Diagnosis:**
```bash
# Check authentication failures
curl -H "Authorization: Bearer <token>" \
     "https://ai-concierge-mvp-prod.your-subdomain.workers.dev/api/audit-logs?actionType=auth_failure&limit=100"

# Monitor IP addresses
wrangler tail --env prod --grep "SECURITY_ALERT"

# Check rate limiting violations
wrangler kv:key list --namespace-id <RATE_LIMITER_ID> --prefix "blocked:"
```

**Resolution:**
```bash
# Block suspicious IP addresses
wrangler kv:key put "blocked:192.168.1.100" "true" \
       --namespace-id <SECURITY_BLOCKLIST_ID> \
       --ttl 86400

# Increase security measures temporarily
wrangler secret put SECURITY_DDOS_THRESHOLD "500" --env prod
wrangler secret put SECURITY_RATE_LIMIT_IP "50" --env prod

# Review and update WAF rules
# Go to Cloudflare Dashboard → Security → WAF
```

---

### Issue: Data Breach Suspected

**Symptoms:**
- Unusual data access patterns
- Security monitoring alerts
- Unauthorized access attempts

**Immediate Response:**
```bash
# Rotate all secrets immediately
wrangler secret put WEBHOOK_SECRET --env prod
wrangler secret put OPENAI_API_KEY --env prod
wrangler secret put SENDGRID_API_KEY --env prod

# Enable emergency security mode
wrangler kv:key put "emergency_mode" "true" \
       --namespace-id <SECURITY_BLOCKLIST_ID>

# Generate incident report
curl -H "Authorization: Bearer <token>" \
     "https://ai-concierge-mvp-prod.your-subdomain.workers.dev/api/audit-export/security-incident" \
     -o security-incident-$(date +%Y%m%d).json
```

## Deployment Problems

### Issue: Deployment Failures

**Symptoms:**
- Wrangler deploy command failing
- Build errors
- Configuration issues

**Diagnosis:**
```bash
# Check build process
pnpm build

# Verify wrangler configuration
wrangler whoami
wrangler deployments list --env prod

# Check for configuration errors
npx wrangler validate wrangler.jsonc
```

**Resolution:**
```bash
# Clear build cache
rm -rf dist/ .wrangler/
pnpm install --frozen-lockfile
pnpm build

# Fix configuration issues
# Verify database IDs in wrangler.jsonc
# Check secret configuration

# Deploy with verbose logging
wrangler deploy --env prod --verbose
```

---

### Issue: Failed Database Migrations

**Symptoms:**
- Application won't start after deployment
- Database schema errors
- Migration command failures

**Diagnosis:**
```bash
# Check migration status
wrangler d1 migrations list concierge_prod

# Review migration logs
wrangler tail --env prod --grep "MIGRATION"

# Check schema consistency
wrangler d1 execute concierge_prod --remote --command ".schema"
```

**Resolution:**
```bash
# Rollback to previous migration
wrangler d1 migrations apply concierge_prod --to <previous-migration>

# Fix migration issues manually
wrangler d1 execute concierge_prod --remote --command "
  -- Manual schema fixes if needed
  ALTER TABLE users ADD COLUMN missing_column TEXT;"

# Reapply migrations
wrangler d1 migrations apply concierge_prod --remote
```

## External Service Issues

### Issue: OpenAI API Failures

**Symptoms:**
- Draft generation failures
- API timeout errors
- Rate limit errors from OpenAI

**Diagnosis:**
```bash
# Check OpenAI API status
curl -H "Authorization: Bearer <openai-key>" \
     "https://api.openai.com/v1/models"

# Review API usage
curl -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/openai-usage

# Check rate limits
wrangler tail --env prod --grep "OPENAI_RATE_LIMIT"
```

**Resolution:**
```bash
# Switch to stub mode temporarily
wrangler secret put AI_STUB "1" --env prod

# Update API key if expired
wrangler secret put OPENAI_API_KEY --env prod

# Implement fallback mechanisms
# Use cached responses or alternative providers
```

---

### Issue: Email/SMS Delivery Failures

**Symptoms:**
- Messages not being delivered
- Provider API errors
- Webhook failures

**Diagnosis:**
```bash
# Check provider status
curl -H "Authorization: Bearer <sendgrid-key>" \
     "https://api.sendgrid.com/v3/user/profile"

curl -u "<twilio-sid>:<twilio-token>" \
     "https://api.twilio.com/2010-04-01/Accounts/<SID>.json"

# Review delivery logs
wrangler tail --env prod --grep "DELIVERY_FAILED"

# Check webhook processing
curl -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/webhook-status
```

**Resolution:**
```bash
# Switch to backup provider
wrangler secret put DELIVERY_PROVIDER "backup" --env prod

# Update provider credentials
wrangler secret put SENDGRID_API_KEY --env prod
wrangler secret put TWILIO_AUTH_TOKEN --env prod

# Retry failed deliveries
curl -X POST -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/api/retry-failed-deliveries
```

## Debug Tools

### Built-in Debug Endpoints

```bash
# Environment status
curl -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/env

# Performance metrics
curl -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/performance

# Queue status
curl -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/queue-status

# Database health
curl -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/db-health

# Security metrics
curl -H "Authorization: Bearer <token>" \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/debug/security-metrics
```

### Log Analysis Tools

```bash
# Real-time log monitoring
wrangler tail --env prod

# Search logs by pattern
wrangler tail --env prod --grep "ERROR|WARN"

# Filter by time range
wrangler tail --env prod --since 1h

# Export logs for analysis
wrangler tail --env prod --since 24h > debug-logs.txt
```

### Database Debug Queries

```sql
-- Check table sizes
SELECT name, 
       (SELECT COUNT(*) FROM name) as row_count
FROM sqlite_master 
WHERE type='table'
ORDER BY row_count DESC;

-- Find slow queries
EXPLAIN QUERY PLAN 
SELECT * FROM audit_logs 
WHERE created_at > datetime('now', '-1 day')
ORDER BY created_at DESC 
LIMIT 100;

-- Check index usage
SELECT name, sql 
FROM sqlite_master 
WHERE type = 'index' 
AND tbl_name = 'audit_logs';

-- Database integrity check
PRAGMA integrity_check;

-- Database statistics
ANALYZE;
```

### Performance Testing

```bash
# Load testing with curl
for i in {1..100}; do
  curl -w "%{time_total}\n" -o /dev/null -s \
       https://ai-concierge-mvp-prod.your-subdomain.workers.dev/health
done | sort -n

# API response time testing
curl -w "@curl-format.txt" -s \
     https://ai-concierge-mvp-prod.your-subdomain.workers.dev/api/generate-draft \
     -H "Authorization: Bearer <token>" \
     -d '{"patientInquiry": "test", "patientId": "test", "userId": "test"}'

# Database performance testing
time wrangler d1 execute concierge_prod --remote --command "
  SELECT COUNT(*) FROM audit_logs 
  WHERE created_at > datetime('now', '-1 day');"
```

## Emergency Procedures

### Service Outage Response

**Immediate Actions (0-5 minutes):**
```bash
# 1. Verify outage
curl -f https://ai-concierge-mvp-prod.your-subdomain.workers.dev/health

# 2. Check Cloudflare status
# Visit status.cloudflare.com

# 3. Initiate communication
# Post to status page / notify team

# 4. Begin investigation
wrangler tail --env prod --grep "ERROR|CRITICAL"
```

**Recovery Actions (5-30 minutes):**
```bash
# 1. Attempt quick fixes
wrangler deploy --env prod  # Redeploy current version

# 2. Rollback if needed
wrangler rollback <previous-deployment> --env prod

# 3. Check external dependencies
curl -f "https://api.openai.com/v1/models"
curl -f "https://api.sendgrid.com/v3/user/profile"

# 4. Monitor recovery
watch -n 5 "curl -f https://ai-concierge-mvp-prod.your-subdomain.workers.dev/health"
```

### Security Incident Response

**Immediate Actions:**
```bash
# 1. Block suspicious traffic
wrangler kv:key put "emergency_block:enabled" "true" \
       --namespace-id <SECURITY_BLOCKLIST_ID>

# 2. Rotate critical secrets
wrangler secret put WEBHOOK_SECRET --env prod
wrangler secret put OPENAI_API_KEY --env prod

# 3. Enable maximum security
wrangler secret put SECURITY_DDOS_THRESHOLD "100" --env prod
wrangler secret put SECURITY_RATE_LIMIT_IP "10" --env prod

# 4. Generate incident report
curl -H "Authorization: Bearer <token>" \
     "https://ai-concierge-mvp-prod.your-subdomain.workers.dev/api/audit-export/security-incident"
```

### Data Recovery Procedures

**Database Recovery:**
```bash
# 1. Stop all write operations
wrangler kv:key put "maintenance_mode" "true" \
       --namespace-id <SECURITY_BLOCKLIST_ID>

# 2. Create emergency backup
wrangler d1 export concierge_prod --output "emergency-backup-$(date +%Y%m%d-%H%M%S).sql"

# 3. Restore from backup
wrangler d1 import concierge_prod latest-backup.sql

# 4. Verify data integrity
wrangler d1 execute concierge_prod --remote --command "PRAGMA integrity_check;"

# 5. Resume operations
wrangler kv:key delete "maintenance_mode" --namespace-id <SECURITY_BLOCKLIST_ID>
```

---

**Remember:** When in doubt, prioritize service stability and user safety. Don't hesitate to rollback or enable maintenance mode while investigating issues. Document all actions taken during incidents for post-mortem analysis.

For additional support, escalate to the engineering team at engineering@yourcompany.com or call the on-call number: +1-555-ON-CALL.
