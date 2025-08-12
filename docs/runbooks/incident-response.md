# Incident Response Runbook

## Overview
This document provides step-by-step procedures for responding to incidents in the AI Concierge healthcare communication platform.

## Severity Levels

### P0 - Critical (Service Down)
- Complete service outage
- Data loss or corruption
- Security breach
- **Response Time**: Immediate

### P1 - High (Major Feature Impacted)
- Key features unavailable
- Performance severely degraded
- Authentication issues
- **Response Time**: 15 minutes

### P2 - Medium (Minor Impact)
- Non-critical features affected
- Moderate performance issues
- **Response Time**: 2 hours

### P3 - Low (Monitoring/Alerts)
- Monitoring alerts
- Resource warnings
- **Response Time**: Next business day

## Incident Response Process

### 1. Incident Detection
**Sources:**
- Monitoring alerts (`/monitoring/alerts`)
- User reports
- Automated health checks (`/monitoring/health`)
- Sentry error notifications

**Initial Assessment:**
```bash
# Check system health
curl -s https://your-domain.com/monitoring/health | jq

# Check active alerts
curl -s https://your-domain.com/monitoring/alerts | jq

# Check Sentry for recent errors
curl -s https://your-domain.com/monitoring/sentry | jq
```

### 2. Immediate Response (First 5 Minutes)

1. **Acknowledge the incident** in monitoring system
2. **Assess severity** using the criteria above
3. **Check service status**:
   ```bash
   # Database health
   wrangler tail --format=pretty
   
   # Recent logs
   curl -s https://your-domain.com/debug/audit-trail
   ```

4. **Notify stakeholders** based on severity

### 3. Investigation

#### Database Issues
```bash
# Check database connectivity
curl -s https://your-domain.com/debug/db

# Check recent database operations
curl -s https://your-domain.com/debug/audit-trail

# Verify schema integrity
wrangler d1 execute concierge_dev --command="PRAGMA integrity_check;"
```

#### Authentication/Authorization Issues
```bash
# Test authentication
curl -s https://your-domain.com/debug/auth

# Check user role permissions
curl -s https://your-domain.com/debug/rbac
```

#### OpenAI Integration Issues
```bash
# Check OpenAI status
curl -s https://your-domain.com/debug/openai-config

# Test OpenAI connectivity
curl -s https://your-domain.com/debug/openai-stub
```

#### Queue Processing Issues
```bash
# Check queue status
curl -s https://your-domain.com/debug/queue-status

# Test queue functionality
curl -s https://your-domain.com/debug/enqueue-test
```

### 4. Resolution

#### Common Fixes

**High Error Rate:**
1. Check recent deployments
2. Review Sentry errors for patterns
3. Consider rollback if deployment-related

**Slow Response Times:**
1. Check database query performance
2. Review OpenAI API latency
3. Verify Cloudflare Workers performance

**Authentication Failures:**
1. Verify JWT configuration
2. Check Cloudflare Access settings
3. Validate user permissions

### 5. Communication

#### Stakeholder Matrix
- **P0/P1**: Immediate notification to all stakeholders
- **P2**: Update within 2 hours
- **P3**: Include in next status report

#### Communication Channels
- Slack: `#incidents`
- Email: `ops-team@company.com`
- Dashboard: Update status page

### 6. Post-Incident

1. **Document timeline** and actions taken
2. **Conduct post-mortem** for P0/P1 incidents
3. **Update runbooks** based on learnings
4. **Implement preventive measures**

## Emergency Contacts

- **On-call Engineer**: [Contact Info]
- **Database Admin**: [Contact Info]
- **Security Team**: [Contact Info]
- **Management**: [Contact Info]

## Escalation Matrix

1. **Level 1**: On-call Engineer
2. **Level 2**: Senior Engineer + Database Admin
3. **Level 3**: Engineering Manager + Security Team
4. **Level 4**: CTO + Compliance Officer

## Quick Reference Commands

```bash
# Service health overview
curl -s https://your-domain.com/monitoring/health

# Current alerts
curl -s https://your-domain.com/monitoring/alerts

# Performance metrics
curl -s https://your-domain.com/monitoring/performance

# Live logs
wrangler tail --format=pretty

# Database emergency access
wrangler d1 execute concierge_dev --command="SELECT COUNT(*) FROM users;"

# Force deployment rollback
git revert <commit-hash> && git push origin main
```

## Recovery Procedures

### Database Recovery
1. Stop all write operations
2. Restore from backup
3. Verify data integrity
4. Resume operations

### Security Incident
1. Isolate affected systems
2. Preserve evidence
3. Notify security team
4. Follow security incident protocol

### Data Loss
1. Assess scope of loss
2. Notify compliance team
3. Restore from backups
4. Document incident for auditing
