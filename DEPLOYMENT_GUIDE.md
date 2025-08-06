# AI Concierge MVP - Production Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the AI Concierge MVP to Cloudflare Workers production environment. The application is built with RedwoodSDK and utilizes Cloudflare's edge infrastructure for optimal performance.

## Prerequisites

- Cloudflare account with Workers Paid plan ($5/month minimum for D1 database)
- Node.js 18+ and pnpm installed
- Wrangler CLI authenticated with your Cloudflare account
- OpenAI API key for AI message generation

## Architecture Overview

The AI Concierge MVP uses:
- **Cloudflare Workers** - Main application hosting with global edge distribution
- **D1 Database** - SQLite database for patient data, audit logs, and user management
- **Cloudflare Access** - Authentication and authorization (optional but recommended)
- **R2 Storage** - For audit log exports and file storage
- **Workers Analytics** - Performance monitoring and usage tracking

## Step 1: Local Development Environment Verification

### 1.1 Verify Dependencies

```bash
# Install dependencies
pnpm install

# Generate Prisma client and types
pnpm run generate
```

### 1.2 Database Setup

```bash
# Apply database migrations
pnpm run migrate:dev

# Seed development data
pnpm run seed
```

### 1.3 Development Server Test

```bash
# Start development server
pnpm run dev
```

Visit `http://localhost:5173` to verify the application loads correctly.

### 1.4 Environment Variables

Create `.dev.vars` file with required environment variables:

```bash
# OpenAI API Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here

# Database URL (auto-configured by Cloudflare)
DATABASE_URL="file:./dev.db"

# WebAuthn Configuration
WEBAUTHN_APP_NAME="AI Concierge MVP"

# Cloudflare Access (optional for development)
CLOUDFLARE_ACCESS_DOMAIN=""
CLOUDFLARE_ACCESS_AUD=""
```

## Step 2: Cloudflare Infrastructure Setup

### 2.1 Create D1 Database

```bash
# Create production database
wrangler d1 create ai-concierge-db

# Note the database_id returned by the command above
```

### 2.2 Update wrangler.jsonc Configuration

Edit `wrangler.jsonc` with your specific values:

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ai-concierge-mvp",
  "main": "src/worker.tsx",
  "compatibility_date": "2024-09-23",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "binding": "ASSETS"
  },
  "observability": {
    "enabled": true
  },
  "vars": {
    "CLOUDFLARE_ACCESS_DOMAIN": "your-domain.cloudflareaccess.com",
    "CLOUDFLARE_ACCESS_AUD": "your-access-audience-tag"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "ai-concierge-db",
      "database_id": "your-d1-database-id-here"
    }
  ]
}
```

### 2.3 Configure Production Environment Variables

Set secrets using Wrangler:

```bash
# Set OpenAI API key
wrangler secret put OPENAI_API_KEY

# Set WebAuthn app name
wrangler secret put WEBAUTHN_APP_NAME
```

When prompted, enter the respective values.

### 2.4 Apply Database Migrations to Production

```bash
# Deploy migrations to production D1 database
pnpm run migrate:prd
```

## Step 3: Cloudflare Access Setup (Recommended)

### 3.1 Enable Cloudflare Access

1. Go to Cloudflare Dashboard > Zero Trust > Access
2. Create a new application for your domain
3. Configure authentication providers (Google, Azure AD, etc.)
4. Set up access policies for different user roles

### 3.2 Get Access Configuration

1. Navigate to your Access application settings
2. Copy the "Audience (AUD) Tag"
3. Note your Access domain (e.g., `yourteam.cloudflareaccess.com`)

### 3.3 Update Environment Variables

```bash
# Set Cloudflare Access domain
wrangler secret put CLOUDFLARE_ACCESS_DOMAIN

# Set Cloudflare Access audience
wrangler secret put CLOUDFLARE_ACCESS_AUD
```

## Step 4: Production Deployment

### 4.1 Build and Deploy

```bash
# Clean previous builds
pnpm run clean

# Deploy to production
pnpm run release
```

This command will:
1. Generate Prisma client
2. Build production assets
3. Deploy to Cloudflare Workers

### 4.2 Verify Deployment

Check the deployment URL provided by Wrangler output. Your application should be accessible at:
`https://ai-concierge-mvp.your-subdomain.workers.dev`

### 4.3 Custom Domain Setup (Optional)

1. Go to Cloudflare Dashboard > Workers & Pages
2. Select your worker
3. Go to Settings > Triggers
4. Add custom domain and configure DNS

## Step 5: Production Configuration

### 5.1 Seed Production Data

Create a production seed script or manually add initial data:

```bash
# Run production seed (if needed)
wrangler dev --remote
# Then access the seeding endpoint or run seed script
```

### 5.2 Configure User Roles

Initial admin user should be configured through Cloudflare Access groups:

1. Create Access groups for each role (staff, reviewer, doctor, admin, auditor)
2. Assign users to appropriate groups
3. Configure application policies based on group membership

### 5.3 Monitoring Setup

1. Enable Workers Analytics in Cloudflare Dashboard
2. Set up alerting for error rates and latency
3. Monitor D1 database usage and performance

## Step 6: Security Configuration

### 6.1 Content Security Policy

The application includes CSP headers. Review and adjust in `src/app/Document.tsx` if needed.

### 6.2 CORS Configuration

CORS is configured for the application domain. Update if using custom domains.

### 6.3 Rate Limiting

Consider implementing Cloudflare Rate Limiting rules for:
- API endpoints
- Authentication attempts
- File uploads

### 6.4 Access Policies

Recommended Access policies:
- **Staff/Reviewer**: Read access to patient briefs and message queue
- **Doctor**: Full access to patient data and message generation
- **Admin**: User management and system configuration
- **Auditor**: Read-only access to audit logs and export functionality

## Step 7: Testing Production Deployment

### 7.1 Smoke Tests

Test the following critical functions:

1. **Authentication**: Verify login with Cloudflare Access
2. **Role Access**: Test each user role can access appropriate features
3. **Message Generation**: Create and generate AI messages
4. **Audit Logging**: Verify all actions are logged
5. **Data Export**: Test audit log export functionality

### 7.2 Performance Testing

1. Test response times from different global locations
2. Verify D1 database query performance
3. Monitor cold start times

### 7.3 Security Testing

1. Verify access controls work correctly
2. Test XSS and CSRF protections
3. Validate input sanitization

## Step 8: Maintenance and Monitoring

### 8.1 Regular Maintenance

- Monitor Cloudflare Analytics dashboard
- Review D1 database usage and optimize queries
- Update dependencies regularly
- Review and rotate API keys

### 8.2 Backup Strategy

- D1 databases are automatically backed up by Cloudflare
- Export audit logs regularly for compliance
- Maintain configuration backups

### 8.3 Scaling Considerations

- Workers automatically scale based on traffic
- D1 database has read replica support for high traffic
- Consider implementing caching for frequently accessed data

## Troubleshooting

### Common Issues

1. **Build Failures**: Ensure all dependencies are installed and Prisma is generated
2. **Database Connection**: Verify D1 database ID matches wrangler.jsonc
3. **Authentication Issues**: Check Cloudflare Access configuration
4. **API Errors**: Verify OpenAI API key is correctly set

### Debug Mode

Enable debug mode for troubleshooting:

```bash
# Run in debug mode
wrangler dev --remote --debug
```

### Logs and Monitoring

- View real-time logs: `wrangler tail`
- Check Workers Analytics for performance metrics
- Monitor D1 database metrics in Cloudflare Dashboard

## Rollback Procedures

### Quick Rollback

If issues occur, rollback to previous version:

```bash
# List previous deployments
wrangler deployments list

# Rollback to specific deployment
wrangler rollback [deployment-id]
```

### Database Rollback

1. Identify problematic migration
2. Create rollback migration
3. Deploy rollback migration
4. Redeploy application

## Support and Documentation

- **RedwoodSDK Documentation**: https://redwoodjs.com/docs
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **D1 Database**: https://developers.cloudflare.com/d1/
- **Cloudflare Access**: https://developers.cloudflare.com/cloudflare-one/applications/

---

## Deployment Checklist

- [ ] Local development environment verified
- [ ] D1 database created and configured
- [ ] wrangler.jsonc updated with correct values
- [ ] Environment variables and secrets configured
- [ ] Database migrations applied to production
- [ ] Cloudflare Access configured (if using)
- [ ] Application deployed successfully
- [ ] Custom domain configured (if applicable)
- [ ] Production data seeded
- [ ] User roles and access policies configured
- [ ] Monitoring and analytics enabled
- [ ] Security configuration reviewed
- [ ] Smoke tests passed
- [ ] Performance testing completed
- [ ] Documentation updated

## Estimated Deployment Time

- Initial setup: 30-45 minutes
- Cloudflare Access configuration: 15-20 minutes
- Testing and verification: 20-30 minutes
- **Total: 1-2 hours**

## Cost Estimate

- Cloudflare Workers Paid Plan: $5/month
- Additional requests: $0.50 per million requests
- D1 Database: First 25 million reads free, then $0.001 per 1000 reads
- R2 Storage: $0.015 per GB/month

Estimated monthly cost for moderate usage: $5-15/month
