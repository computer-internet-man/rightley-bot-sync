# Environment Configuration Setup

## Overview
This project uses Cloudflare's multi-environment pattern with wrangler.jsonc to manage different deployment targets.

## Environment Structure
- **local**: Default development environment (uses existing local database)
- **dev**: Development deployment on Cloudflare
- **staging**: Staging environment for testing
- **prod**: Production environment

## Required Setup Commands

### 1. Create D1 Databases for Each Environment

**Dev Environment:**
```bash
wrangler d1 create concierge_dev
```
Expected output:
```
✅ Successfully created DB 'concierge_dev'!

Add the following to your wrangler.toml:
[[d1_databases]]
binding = "DB"
database_name = "concierge_dev"
database_id = "<DEV_DATABASE_ID>"
```

**Staging Environment:**
```bash
wrangler d1 create concierge_staging
```
Expected output:
```
✅ Successfully created DB 'concierge_staging'!

Add the following to your wrangler.toml:
[[d1_databases]]
binding = "DB"
database_name = "concierge_staging"
database_id = "<STAGING_DATABASE_ID>"
```

**Production Environment:**
```bash
wrangler d1 create concierge_prod
```
Expected output:
```
✅ Successfully created DB 'concierge_prod'!

Add the following to your wrangler.toml:
[[d1_databases]]
binding = "DB"
database_name = "concierge_prod"
database_id = "<PROD_DATABASE_ID>"
```

### 2. Update wrangler.jsonc with Database IDs

After creating each database, replace the placeholder database IDs in wrangler.jsonc:
- Replace `__REPLACE_WITH_DEV_DB_ID__` with the dev database ID
- Replace `__REPLACE_WITH_STAGING_DB_ID__` with the staging database ID  
- Replace `__REPLACE_WITH_PROD_DB_ID__` with the prod database ID

### 3. Set Cloudflare Secrets

**OpenAI API Key (required for all environments):**
```bash
# For dev environment
wrangler secret put OPENAI_API_KEY --env dev

# For staging environment  
wrangler secret put OPENAI_API_KEY --env staging

# For production environment
wrangler secret put OPENAI_API_KEY --env prod
```

**Sentry DSN (optional but recommended for monitoring):**
```bash
# For dev environment
wrangler secret put SENTRY_DSN --env dev

# For staging environment
wrangler secret put SENTRY_DSN --env staging

# For production environment
wrangler secret put SENTRY_DSN --env prod
```

## Environment Usage

### Local Development
```bash
CLOUDFLARE_ENV=local pnpm dev
```
- Uses local SQLite database
- Environment variable: `ENVIRONMENT=local`

### Development Deployment
```bash
wrangler deploy --env dev
```
- Deploys to `ai-concierge-mvp-dev.workers.dev`
- Uses `concierge_dev` D1 database
- Environment variable: `ENVIRONMENT=dev`

### Staging Deployment
```bash
wrangler deploy --env staging
```
- Deploys to `ai-concierge-mvp-staging.workers.dev`
- Uses `concierge_staging` D1 database
- Environment variable: `ENVIRONMENT=staging`

### Production Deployment
```bash
wrangler deploy --env prod
```
- Deploys to `ai-concierge-mvp-prod.workers.dev`
- Uses `concierge_prod` D1 database
- Environment variable: `ENVIRONMENT=prod`

## Verification

### Check Environment Variable
Visit `/debug/env` in your browser to verify the environment is correctly set:
- Local: Should show `"local"`
- Dev: Should show `"dev"`
- Staging: Should show `"staging"`  
- Prod: Should show `"prod"`

### Database Migration Commands
```bash
# Local database
wrangler d1 migrations apply DB --local

# Dev environment
wrangler d1 migrations apply DB --env dev

# Staging environment
wrangler d1 migrations apply DB --env staging

# Production environment
wrangler d1 migrations apply DB --env prod
```

## Notes
- Local environment preserves existing functionality and database
- Secrets are environment-specific and must be set for each target
- Cloudflare Access variables are optional for dev/staging but required for production
- Environment selection uses the `--env` flag for Wrangler commands
