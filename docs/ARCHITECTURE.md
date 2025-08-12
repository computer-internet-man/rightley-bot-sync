# RedwoodSDK Cloudflare Architecture Documentation

## Table of Contents
- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Component Architecture](#component-architecture)
- [Security Architecture](#security-architecture)
- [Data Flow](#data-flow)
- [Infrastructure](#infrastructure)
- [Performance & Monitoring](#performance--monitoring)
- [Technology Stack](#technology-stack)

## Overview

The RedwoodSDK Cloudflare Starter is a production-ready, edge-native healthcare communication platform built on Cloudflare's serverless infrastructure. The system provides secure, HIPAA-compliant patient communication workflows with sub-50ms response times globally.

### Key Features
- **Edge-Native SSR**: Server-side rendering at the edge with React Server Components
- **Zero-Trust Security**: Cloudflare Access SSO with RBAC and comprehensive security policies
- **Healthcare Compliance**: HIPAA-compliant audit trails and data handling
- **Global Scale**: Sub-50ms response times via Cloudflare's global network
- **Async Processing**: Queue-based message delivery with retry mechanisms
- **Comprehensive Monitoring**: Performance tracking, error monitoring, and observability

## System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        Browser[Web Browser]
        Mobile[Mobile App]
    end

    subgraph "Edge Network"
        CF[Cloudflare Edge]
        WAF[Web Application Firewall]
        DDoS[DDoS Protection]
        RateLimit[Rate Limiting]
    end

    subgraph "Worker Runtime"
        Worker[Cloudflare Worker]
        Auth[Authentication Layer]
        Security[Security Gateway]
        Router[Request Router]
    end

    subgraph "Data Layer"
        D1[(D1 SQLite Database)]
        KV[KV Storage]
        R2[R2 Object Storage]
    end

    subgraph "Processing Layer"
        Queue[Message Queue]
        Jobs[Background Jobs]
        Cron[Scheduled Tasks]
    end

    subgraph "External Services"
        Sentry[Sentry Monitoring]
        SendGrid[SendGrid Email]
        Twilio[Twilio SMS]
        OpenAI[OpenAI API]
    end

    Browser --> CF
    Mobile --> CF
    CF --> WAF
    WAF --> DDoS
    DDoS --> RateLimit
    RateLimit --> Worker

    Worker --> Auth
    Auth --> Security
    Security --> Router
    
    Router --> D1
    Router --> KV
    Router --> R2
    Router --> Queue

    Queue --> Jobs
    Jobs --> SendGrid
    Jobs --> Twilio
    Jobs --> Sentry

    Worker --> OpenAI
    Worker --> Sentry
    
    Cron --> Worker
```

## Component Architecture

```mermaid
graph TB
    subgraph "Presentation Layer"
        SSR[Server-Side Rendering]
        RSC[React Server Components]
        Pages[Page Components]
        UI[UI Components]
    end

    subgraph "Application Layer"
        MW[Middleware Stack]
        Auth[Authentication]
        RBAC[Role-Based Access]
        Routes[API Routes]
        Actions[Server Actions]
    end

    subgraph "Business Logic"
        PatientMgmt[Patient Management]
        MessageFlow[Message Workflows]
        DoctorPortal[Doctor Portal]
        AdminDash[Admin Dashboard]
        AuditSys[Audit System]
    end

    subgraph "Data Access Layer"
        ORM[Drizzle ORM]
        Schema[Database Schema]
        Migrations[Migration System]
        Queries[Query Builders]
    end

    subgraph "Infrastructure Layer"
        Queue[Queue Producer/Consumer]
        Jobs[Job Processors]
        Monitor[Monitoring]
        Logger[Logging System]
    end

    SSR --> MW
    RSC --> MW
    Pages --> MW
    UI --> MW

    MW --> Auth
    MW --> RBAC
    MW --> Routes
    MW --> Actions

    Routes --> PatientMgmt
    Routes --> MessageFlow
    Routes --> DoctorPortal
    Routes --> AdminDash
    Routes --> AuditSys

    PatientMgmt --> ORM
    MessageFlow --> ORM
    DoctorPortal --> ORM
    AdminDash --> ORM
    AuditSys --> ORM

    ORM --> Schema
    ORM --> Migrations
    ORM --> Queries

    MessageFlow --> Queue
    Queue --> Jobs
    Jobs --> Monitor
    Jobs --> Logger
```

## Security Architecture

```mermaid
graph TB
    subgraph "Network Security"
        CF_WAF[Cloudflare WAF]
        DDoS_Prot[DDoS Protection]
        GeoBlock[Geo-Blocking]
        IPFilter[IP Filtering]
    end

    subgraph "Application Security"
        CF_Access[Cloudflare Access SSO]
        JWT_Valid[JWT Validation]
        RBAC_Layer[RBAC Middleware]
        Rate_Limit[Rate Limiting]
    end

    subgraph "Data Security"
        Encryption[Data Encryption]
        Audit_Trail[Audit Logging]
        PII_Handling[PII Protection]
        HIPAA_Comp[HIPAA Compliance]
    end

    subgraph "Security Headers"
        CSP[Content Security Policy]
        HSTS[HTTP Strict Transport]
        Frame_Opts[X-Frame-Options]
        XSS_Prot[XSS Protection]
    end

    subgraph "Monitoring & Response"
        Security_Mon[Security Monitoring]
        Threat_Detect[Threat Detection]
        Incident_Resp[Incident Response]
        Sentry_Sec[Sentry Security Events]
    end

    CF_WAF --> CF_Access
    DDoS_Prot --> CF_Access
    GeoBlock --> CF_Access
    IPFilter --> CF_Access

    CF_Access --> JWT_Valid
    JWT_Valid --> RBAC_Layer
    RBAC_Layer --> Rate_Limit

    Rate_Limit --> Encryption
    Encryption --> Audit_Trail
    Audit_Trail --> PII_Handling
    PII_Handling --> HIPAA_Comp

    HIPAA_Comp --> CSP
    CSP --> HSTS
    HSTS --> Frame_Opts
    Frame_Opts --> XSS_Prot

    XSS_Prot --> Security_Mon
    Security_Mon --> Threat_Detect
    Threat_Detect --> Incident_Resp
    Incident_Resp --> Sentry_Sec
```

## Data Flow

### Authentication Flow
```mermaid
sequenceDiagram
    participant U as User
    participant CF as Cloudflare Access
    participant W as Worker
    participant D as D1 Database
    participant S as Sentry

    U->>CF: Login Request
    CF->>CF: SSO Authentication
    CF->>W: JWT Token
    W->>W: Validate JWT
    W->>D: Find/Create User
    D->>W: User Record
    W->>S: Log Auth Event
    W->>U: Authenticated Session
```

### Message Workflow
```mermaid
sequenceDiagram
    participant D as Doctor
    participant W as Worker
    participant AI as OpenAI
    participant Q as Message Queue
    participant P as Provider (Email/SMS)
    participant DB as D1 Database
    participant S as Sentry

    D->>W: Create Patient Brief
    W->>DB: Store Brief
    W->>AI: Generate Draft
    AI->>W: Draft Content
    W->>D: Review Draft
    D->>W: Approve Message
    W->>Q: Enqueue Delivery
    Q->>P: Send Message
    P->>W: Delivery Webhook
    W->>DB: Update Status
    W->>S: Log Completion
```

### Audit Trail Flow
```mermaid
sequenceDiagram
    participant U as User
    participant W as Worker
    participant A as Audit Middleware
    participant DB as D1 Database
    participant S as Sentry

    U->>W: Perform Action
    W->>A: Trigger Audit
    A->>A: Capture Context
    A->>DB: Store Audit Log
    A->>S: Send Metrics
    W->>U: Action Response
    
    Note over A,DB: All CRUD operations logged
    Note over A,S: Security events monitored
```

## Infrastructure

### Cloudflare Services Integration
```mermaid
graph LR
    subgraph "Cloudflare Platform"
        Workers[Workers Runtime]
        D1[D1 Database]
        KV[KV Storage]
        R2[R2 Storage]
        Queues[Queues]
        Access[Access SSO]
        WAF[Web Application Firewall]
        Analytics[Analytics]
    end

    subgraph "External Integrations"
        Sentry[Sentry.io]
        SendGrid[SendGrid]
        Twilio[Twilio]
        OpenAI[OpenAI]
    end

    Workers --> D1
    Workers --> KV
    Workers --> R2
    Workers --> Queues
    Workers --> Access
    Workers --> WAF
    Workers --> Analytics

    Workers --> Sentry
    Workers --> SendGrid
    Workers --> Twilio
    Workers --> OpenAI
```

### Environment Architecture
```mermaid
graph TB
    subgraph "Development"
        Dev_Worker[Local Worker]
        Dev_D1[Local D1]
        Dev_Queue[Local Queue]
    end

    subgraph "Staging"
        Stage_Worker[Staging Worker]
        Stage_D1[Staging D1]
        Stage_Queue[Staging Queue]
    end

    subgraph "Production"
        Prod_Worker[Production Worker]
        Prod_D1[Production D1]
        Prod_Queue[Production Queue]
        Prod_CDN[Global CDN]
    end

    Dev_Worker --> Stage_Worker
    Stage_Worker --> Prod_Worker
    
    Dev_D1 --> Stage_D1
    Stage_D1 --> Prod_D1
    
    Dev_Queue --> Stage_Queue
    Stage_Queue --> Prod_Queue
```

## Performance & Monitoring

### Performance Architecture
```mermaid
graph TB
    subgraph "Performance Tracking"
        ServerTiming[Server-Timing Headers]
        WebVitals[Core Web Vitals]
        CustomMetrics[Custom Metrics]
        PerformanceAPI[Performance API]
    end

    subgraph "Monitoring Stack"
        Sentry[Sentry Performance]
        CloudflareAnalytics[CF Analytics]
        WorkerAnalytics[Worker Analytics]
        D1Analytics[D1 Insights]
    end

    subgraph "Alerting"
        ErrorAlerts[Error Rate Alerts]
        LatencyAlerts[Latency Alerts]
        SecurityAlerts[Security Alerts]
        UptimeAlerts[Uptime Alerts]
    end

    ServerTiming --> Sentry
    WebVitals --> Sentry
    CustomMetrics --> Sentry
    PerformanceAPI --> Sentry

    Sentry --> ErrorAlerts
    CloudflareAnalytics --> LatencyAlerts
    WorkerAnalytics --> SecurityAlerts
    D1Analytics --> UptimeAlerts
```

## Technology Stack

### Core Technologies
- **Runtime**: Cloudflare Workers (V8 JavaScript/TypeScript)
- **Framework**: RedwoodSDK (Server-Side Rendering)
- **Frontend**: React 18 + Server Components
- **Database**: Cloudflare D1 (SQLite) with Drizzle ORM
- **Authentication**: Cloudflare Access (Zero Trust SSO)
- **Queue System**: Cloudflare Queues
- **Storage**: Cloudflare KV + R2

### Development Tools
- **Build System**: Vite + Wrangler
- **Type Safety**: TypeScript + Strict Mode
- **Testing**: Vitest (Unit) + Playwright (E2E)
- **Development**: Dev Containers + Hot Reload
- **CI/CD**: GitHub Actions + Wrangler Deploy

### External Integrations
- **Monitoring**: Sentry.io (Errors + Performance)
- **Email**: SendGrid API
- **SMS**: Twilio API
- **AI**: OpenAI GPT-4 API
- **Analytics**: Cloudflare Analytics

### Security & Compliance
- **Security Headers**: CSP, HSTS, Frame Options
- **Rate Limiting**: KV-based with sliding windows
- **Audit Logging**: Comprehensive CRUD tracking
- **HIPAA Compliance**: Encrypted data handling
- **WAF Protection**: Cloudflare managed rules

## Key Performance Metrics

| Metric | Target | Monitoring |
|--------|--------|------------|
| First Response Time | < 50ms | Server-Timing headers |
| Database Query Time | < 10ms | D1 performance tracking |
| Queue Processing | < 5s | Sentry job monitoring |
| Error Rate | < 0.1% | Sentry error tracking |
| Uptime | > 99.9% | Cloudflare Analytics |
| Security Score | > 95% | Custom security metrics |

## Deployment Environments

| Environment | Purpose | Configuration |
|-------------|---------|---------------|
| **Local** | Development | Local D1, stub APIs, debug logging |
| **Dev** | Integration testing | Shared D1, real APIs, detailed logging |
| **Staging** | Pre-production | Production-like, reduced logging |
| **Production** | Live system | Optimized performance, minimal logging |

## Next Steps

For detailed implementation guides, see:
- [API Documentation](./API.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Operations Manual](./OPERATIONS.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [Security Procedures](./SECURITY.md)
