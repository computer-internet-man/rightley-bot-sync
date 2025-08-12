# CI/CD Setup Guide

This document provides instructions for setting up the complete CI/CD pipeline for the AI Concierge MVP.

## Overview

The CI/CD pipeline includes:
- **PR Workflow**: Testing and preview deployments for pull requests
- **Release Workflow**: Staging and production deployments
- **Cleanup Workflow**: Automatic cleanup of preview resources
- **Source Map Upload**: Error tracking with Sentry integration

## Required Secrets

Configure these secrets in your GitHub repository settings:

### Cloudflare Integration
```
CLOUDFLARE_API_TOKEN=your_api_token_here
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
```

### Sentry Integration (Optional)
```
SENTRY_AUTH_TOKEN=your_sentry_auth_token
SENTRY_ORG=your_sentry_org
SENTRY_PROJECT=your_sentry_project
```

### Notification Integration (Optional)
```
DEPLOYMENT_WEBHOOK_URL=your_slack_or_teams_webhook_url
```

## Environment Setup

### 1. Create GitHub Environments

1. Go to your repository settings → Environments
2. Create "staging" environment:
   - No protection rules (automatic deployment)
   - Add environment secrets (staging values)
3. Create "production" environment:
   - Require reviewers (1-2 team members)
   - Add branch protection (main branch only)
   - Add environment secrets (production values)

### 2. Configure Database IDs

Update [`wrangler.jsonc`](../wrangler.jsonc) with your actual D1 database IDs:

```bash
# Create staging database
wrangler d1 create concierge_staging
# Copy the database_id and update wrangler.jsonc

# Create production database  
wrangler d1 create concierge_prod
# Copy the database_id and update wrangler.jsonc
```

### 3. Setup Branch Protection

1. Go to repository settings → Branches
2. Add rule for `main` branch:
   - Require pull request reviews
   - Require status checks (CI workflow)
   - Require up-to-date branches
   - Restrict pushes

## Workflow Details

### PR Workflow (`.github/workflows/ci.yml`)

**Triggers**: Pull request opened/updated
**Purpose**: Test changes and deploy preview

**Steps**:
1. Install dependencies and run tests
2. Deploy preview environment to Cloudflare
3. Run Playwright e2e tests against preview
4. Comment on PR with results and preview URL
5. Upload test artifacts

**Environment**: `dev` (temporary preview deployment)

### Release Workflow (`.github/workflows/release.yml`)

**Triggers**: 
- Push to main (staging deployment)
- Manual dispatch (production deployment)

**Staging Deployment**:
1. Run full test suite
2. Deploy to staging environment
3. Run smoke tests
4. Upload source maps to Sentry

**Production Deployment**:
1. Require manual approval
2. Create production backup
3. Deploy with health monitoring
4. Automatic rollback on failure
5. Create GitHub release

### Cleanup Workflow (`.github/workflows/cleanup.yml`)

**Triggers**:
- PR closed (immediate cleanup)
- Daily schedule (cleanup stale resources)

**Actions**:
- Delete preview Workers
- Delete preview D1 databases
- Clean up old artifacts
- Update PR comments

## Deployment Commands

### Manual Deployment Scripts

```bash
# Deploy to staging
./scripts/deploy-staging.sh

# Deploy to production (with confirmation)
./scripts/deploy-production.sh

# Upload source maps
./scripts/upload-sourcemaps.sh production v1.0.0
```

### CI/CD Integration

The scripts are designed to work in both CI and local environments:

```bash
# CI environment detection
if [[ "${CI:-}" == "true" ]]; then
  # Skip interactive prompts
  # Use environment variables for configuration
fi
```

## Monitoring and Alerting

### Health Checks

All deployments include comprehensive health checks:
- Basic connectivity (`/health` endpoint)
- Database connectivity
- API endpoint functionality
- Performance benchmarks

### Error Tracking

Source maps are automatically uploaded to Sentry for:
- Real-time error monitoring
- Performance tracking
- Release health monitoring

### Deployment Notifications

Configure webhook notifications for:
- Successful deployments
- Failed deployments
- Rollback events

## Security Considerations

### Secret Management
- Use GitHub encrypted secrets
- Rotate API tokens regularly
- Separate secrets per environment

### Access Control
- Require code reviews for production
- Use CODEOWNERS for sensitive files
- Implement branch protection rules

### Database Safety
- Backup before production deployments
- Test migrations in staging first
- Monitor performance after deployment

## Troubleshooting

### Common Issues

1. **Deployment Fails**
   - Check Cloudflare API token permissions
   - Verify database IDs in wrangler.jsonc
   - Review deployment logs

2. **Preview URLs Not Working**
   - Ensure DNS propagation (wait 1-2 minutes)
   - Check Worker deployment status
   - Verify D1 database bindings

3. **Tests Failing**
   - Check Playwright base URL configuration
   - Verify test data seeding
   - Review test artifacts in GitHub

### Debug Commands

```bash
# Check Wrangler authentication
wrangler whoami

# List deployments
wrangler deployments list

# View Worker logs
wrangler tail

# Check D1 databases
wrangler d1 list
```

## Local Development

### Prerequisites
```bash
# Install dependencies
pnpm install

# Setup environment
cp .env.example .env

# Generate database schema
pnpm dlx drizzle-kit generate
```

### Testing Workflows Locally

```bash
# Test deployment scripts
./scripts/deploy-staging.sh

# Test source map upload
./scripts/upload-sourcemaps.sh development test-release

# Run full test suite
pnpm test:unit
pnpm e2e
```

## Customization

### Adding New Environments

1. Add environment to `wrangler.jsonc`
2. Create GitHub environment
3. Update workflow files
4. Add deployment script

### Modifying Deployment Strategy

1. Update workflow conditions
2. Modify health check thresholds
3. Adjust rollback triggers
4. Configure notification rules

### Integration with Other Tools

The pipeline can be extended to integrate with:
- Performance monitoring tools
- Security scanning tools
- Code quality tools
- Additional notification channels

## Support

For issues with the CI/CD pipeline:
1. Check workflow run logs in GitHub Actions
2. Review deployment status in Cloudflare dashboard
3. Monitor error rates in Sentry
4. Consult this documentation for troubleshooting steps
