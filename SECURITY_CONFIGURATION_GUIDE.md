# AI Concierge MVP - Security Configuration Guide

## Overview

This guide provides comprehensive security configuration instructions for the AI Concierge MVP production deployment. The application handles sensitive healthcare-related data and requires robust security measures.

## Security Architecture

### Security Layers
1. **Edge Security** - Cloudflare's global network protection
2. **Application Security** - RedwoodSDK built-in security features
3. **Authentication** - Cloudflare Access with multi-factor authentication
4. **Authorization** - Role-based access control (RBAC)
5. **Data Security** - Encryption in transit and at rest
6. **Audit & Monitoring** - Comprehensive logging and alerting

## Authentication Configuration

### Cloudflare Access Setup

#### 1. Create Access Application
```bash
# Navigate to Cloudflare Dashboard > Zero Trust > Access > Applications
# Click "Add an application" > "Self-hosted"
```

#### 2. Application Configuration
- **Application name**: AI Concierge MVP
- **Session duration**: 8 hours (recommended for healthcare applications)
- **Application domain**: your-domain.com or *.workers.dev
- **Path**: / (protect entire application)

#### 3. Identity Providers
Recommended providers for healthcare environments:
- **Azure AD** (Enterprise)
- **Google Workspace** (Small-medium organizations)
- **SAML** (Enterprise with existing SSO)
- **One-time PIN** (Guest access)

#### 4. Access Policies

**Policy 1: Admin Access**
```yaml
Name: Admin Full Access
Action: Allow
Include:
  - Emails: admin@yourorg.com
  - Groups: AI-Concierge-Admins
Additional verification: 
  - Require: Azure AD device certificate
  - Session duration: 4 hours
```

**Policy 2: Doctor Access**
```yaml
Name: Doctor Access
Action: Allow
Include:
  - Groups: AI-Concierge-Doctors
  - Email domain: yourmedicalorg.com
Additional verification:
  - Require: Hard key (YubiKey recommended)
  - Session duration: 8 hours
```

**Policy 3: Staff/Reviewer Access**
```yaml
Name: Staff Access
Action: Allow
Include:
  - Groups: AI-Concierge-Staff
  - Groups: AI-Concierge-Reviewers
Additional verification:
  - Require: Multi-factor authentication
  - Session duration: 8 hours
```

**Policy 4: Auditor Access**
```yaml
Name: Auditor Read-Only Access
Action: Allow
Include:
  - Groups: AI-Concierge-Auditors
Additional verification:
  - Require: Multi-factor authentication
  - Session duration: 4 hours
```

## Authorization Configuration

### Role-Based Access Control (RBAC)

#### Role Definitions
```typescript
enum UserRole {
  STAFF = 'staff',           // Basic patient data access
  REVIEWER = 'reviewer',     // Message review capabilities
  DOCTOR = 'doctor',         // Full patient data and message generation
  ADMIN = 'admin',           // System administration
  AUDITOR = 'auditor'        // Read-only audit access
}
```

#### Permission Matrix
| Resource | Staff | Reviewer | Doctor | Admin | Auditor |
|----------|--------|----------|---------|--------|---------|
| Patient Briefs | Read | Read | Full | Full | Read |
| AI Messages | - | Review | Generate | Full | Read |
| User Management | - | - | - | Full | Read |
| Audit Logs | Own | Related | Related | Full | Full |
| System Config | - | - | - | Full | Read |
| Data Export | - | - | Own | Full | Full |

#### JWT Token Validation
```typescript
// Cloudflare Access JWT validation
const validateAccessToken = async (request: Request) => {
  const token = request.headers.get('cf-access-jwt-assertion');
  const domain = env.CLOUDFLARE_ACCESS_DOMAIN;
  const audience = env.CLOUDFLARE_ACCESS_AUD;
  
  // Verify JWT signature and claims
  const verified = await verifyJWT(token, domain, audience);
  return verified;
};
```

## Data Security

### Encryption Standards

#### In Transit
- **TLS 1.3** minimum for all communications
- **HSTS** headers enforced
- **Certificate pinning** for API communications

#### At Rest
- **D1 Database**: Encrypted by default with AES-256
- **R2 Storage**: Server-side encryption enabled
- **Cloudflare KV**: Encrypted by default

### Data Classification
```typescript
enum DataClassification {
  PUBLIC = 'public',           // Marketing materials
  INTERNAL = 'internal',       // Internal docs
  CONFIDENTIAL = 'confidential', // Patient data
  RESTRICTED = 'restricted'    // Audit logs, admin data
}
```

### Data Handling Rules
- **Patient data**: CONFIDENTIAL - Encrypt in transit and at rest
- **Audit logs**: RESTRICTED - Access logging required
- **AI-generated content**: CONFIDENTIAL - Treat as patient data
- **User credentials**: RESTRICTED - Never log or store

## Input Validation and Sanitization

### API Input Validation
```typescript
// Input validation schema
const patientBriefSchema = {
  patientName: {
    type: 'string',
    maxLength: 100,
    pattern: /^[a-zA-Z\s\-'\.]+$/,
    required: true
  },
  medicalHistory: {
    type: 'string',
    maxLength: 5000,
    sanitize: true,
    required: true
  }
};
```

### XSS Protection
- **Content Security Policy** (CSP) headers
- **HTML entity encoding** for all user input
- **DOM purification** for rich text content

### SQL Injection Prevention
- **Parameterized queries** only (Prisma ORM)
- **Input type validation** before database operations
- **Stored procedure** usage where applicable

## Content Security Policy (CSP)

### CSP Configuration
```typescript
const cspHeader = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self' https://api.openai.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');
```

### Security Headers
```typescript
const securityHeaders = {
  'Content-Security-Policy': cspHeader,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};
```

## Rate Limiting and DDoS Protection

### Cloudflare Rate Limiting Rules

#### API Protection
```yaml
Rule 1: API Rate Limiting
- Match: hostname eq "your-domain.com" and uri.path matches "^/api/"
- Rate: 100 requests per minute per IP
- Action: Block for 5 minutes

Rule 2: Authentication Rate Limiting  
- Match: uri.path matches "^/auth/"
- Rate: 10 requests per minute per IP
- Action: Block for 10 minutes

Rule 3: Export Rate Limiting
- Match: uri.path matches "^/api/audit-export"
- Rate: 5 requests per hour per user
- Action: Block for 1 hour
```

#### Application-Level Rate Limiting
```typescript
const rateLimiter = {
  api: { requests: 100, window: 60000 }, // 100 req/min
  auth: { requests: 10, window: 60000 }, // 10 req/min
  export: { requests: 5, window: 3600000 } // 5 req/hour
};
```

## Audit and Logging

### Audit Requirements
- **All user actions** logged with timestamp, user ID, and action details
- **Authentication events** (login, logout, failures)
- **Data access events** (patient data views, exports)
- **Administrative actions** (user management, configuration changes)
- **Security events** (failed authorization, suspicious activity)

### Log Format
```typescript
interface AuditLog {
  timestamp: Date;
  userId: string;
  userRole: UserRole;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress: string;
  userAgent: string;
  outcome: 'success' | 'failure';
  additionalData?: Record<string, any>;
}
```

### Log Retention
- **Audit logs**: 7 years (healthcare compliance)
- **Access logs**: 1 year
- **Error logs**: 90 days
- **Performance logs**: 30 days

## Vulnerability Management

### Regular Security Tasks

#### Weekly
- [ ] Review access logs for anomalies
- [ ] Check for failed authentication attempts
- [ ] Monitor error rates and patterns

#### Monthly
- [ ] Update dependencies (npm audit)
- [ ] Review and rotate API keys
- [ ] Analyze security metrics
- [ ] Test backup and recovery procedures

#### Quarterly
- [ ] Security assessment and penetration testing
- [ ] Access control review
- [ ] Incident response plan testing
- [ ] Security training for team

### Dependency Security
```bash
# Regular security audits
npm audit --audit-level moderate
pnpm audit --audit-level moderate

# Update vulnerable dependencies
npm audit fix
pnpm audit --fix
```

## Incident Response

### Security Incident Classification

#### Severity Levels
- **Critical**: Data breach, system compromise
- **High**: Unauthorized access, service disruption
- **Medium**: Failed security controls, policy violations
- **Low**: Security tool alerts, minor policy deviations

#### Response Procedures

**Critical Incident Response:**
1. **Immediate** (0-15 minutes)
   - Isolate affected systems
   - Preserve evidence
   - Notify security team

2. **Short-term** (15-60 minutes)
   - Assess scope and impact
   - Implement containment measures
   - Notify stakeholders

3. **Medium-term** (1-24 hours)
   - Eradicate threats
   - Restore services
   - Monitor for reoccurrence

4. **Long-term** (1-7 days)
   - Post-incident analysis
   - Update security measures
   - Documentation and reporting

## Compliance Considerations

### Healthcare Data Protection
- **HIPAA** compliance considerations for patient data
- **Data minimization** - collect only necessary information
- **Purpose limitation** - use data only for intended purposes
- **Storage limitation** - retain data only as long as necessary

### Privacy by Design
- **Default privacy settings**
- **Explicit consent** for data processing
- **Data subject rights** (access, rectification, erasure)
- **Privacy impact assessments**

## Emergency Procedures

### Security Breach Response
```bash
# Immediate actions for suspected breach
1. Isolate affected worker
wrangler delete [worker-name] --force

2. Rotate all secrets
wrangler secret put OPENAI_API_KEY
wrangler secret put WEBAUTHN_APP_NAME

3. Review audit logs
wrangler tail --search "error\|fail\|breach"

4. Notify incident response team
# Follow established communication protocols
```

### Recovery Procedures
1. **Verify threat elimination**
2. **Restore from clean backup**
3. **Update security configurations**
4. **Implement additional monitoring**
5. **Conduct post-incident review**

## Configuration Checklist

### Pre-Deployment Security Review
- [ ] **Cloudflare Access** configured with appropriate policies
- [ ] **CSP headers** properly configured
- [ ] **Rate limiting** rules active
- [ ] **Audit logging** enabled and tested
- [ ] **Input validation** implemented
- [ ] **Error handling** doesn't expose sensitive information
- [ ] **Secrets management** properly configured
- [ ] **Database permissions** appropriately restricted

### Post-Deployment Security Verification
- [ ] **Penetration testing** completed
- [ ] **Security headers** verified in production
- [ ] **Access controls** tested with different user roles
- [ ] **Audit logs** capturing all required events
- [ ] **Monitoring and alerting** functional
- [ ] **Backup and recovery** procedures tested
- [ ] **Incident response** plan validated

---

## Security Contacts

### Internal Security Team
- **Security Officer**: [Contact Information]
- **DevOps Lead**: [Contact Information]
- **Compliance Officer**: [Contact Information]

### External Security Support
- **Cloudflare Security**: Available 24/7 for Enterprise customers
- **Security Consultant**: [If applicable]
- **Legal Counsel**: [For compliance issues]

---

**Document Classification**: CONFIDENTIAL  
**Last Updated**: January 8, 2025  
**Review Cycle**: Monthly  
**Document Owner**: Security Team
