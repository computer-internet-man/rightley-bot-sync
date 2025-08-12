#!/bin/bash

set -euo pipefail

# Deploy to Staging Environment
# This script handles staging deployment with proper validation and rollback

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="staging"
WORKER_NAME="ai-concierge-mvp-staging"
DB_NAME="concierge_staging"
STAGING_URL="https://ai-concierge-mvp-staging.your-subdomain.workers.dev"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if wrangler is installed
    if ! command -v wrangler &> /dev/null; then
        log_error "Wrangler CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if logged in to Cloudflare
    if ! wrangler whoami &> /dev/null; then
        log_error "Not logged in to Cloudflare. Please run 'wrangler login' first."
        exit 1
    fi
    
    # Check if required environment variables are set
    if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
        log_warning "CLOUDFLARE_API_TOKEN not set, using wrangler login credentials"
    fi
    
    log_success "Prerequisites check passed"
}

prepare_build() {
    log_info "Preparing build for staging..."
    
    cd "$PROJECT_ROOT"
    
    # Install dependencies
    log_info "Installing dependencies..."
    pnpm install --frozen-lockfile
    
    # Generate Drizzle migrations
    log_info "Generating database migrations..."
    pnpm dlx drizzle-kit generate
    
    # Generate Prisma client
    log_info "Generating Prisma client..."
    pnpm generate
    
    # Type check
    log_info "Running type check..."
    pnpm types
    
    # Run tests
    log_info "Running tests..."
    pnpm test:unit
    
    # Build application
    log_info "Building application..."
    RWSDK_DEPLOY=1 pnpm build
    
    log_success "Build preparation completed"
}

backup_current_deployment() {
    log_info "Creating backup of current staging deployment..."
    
    # Get current deployment info
    CURRENT_DEPLOYMENT=$(wrangler deployments list --name "$WORKER_NAME" --json 2>/dev/null | jq -r '.[0].id // empty' || echo "")
    
    if [[ -n "$CURRENT_DEPLOYMENT" ]]; then
        echo "$CURRENT_DEPLOYMENT" > /tmp/staging_backup_deployment_id
        log_success "Current deployment ID saved: $CURRENT_DEPLOYMENT"
    else
        log_warning "No existing deployment found to backup"
    fi
}

deploy_database() {
    log_info "Deploying database migrations to staging..."
    
    # Apply migrations to staging database
    if ! wrangler d1 migrations apply "$DB_NAME" --remote; then
        log_error "Database migration failed"
        return 1
    fi
    
    log_success "Database migrations applied successfully"
}

deploy_worker() {
    log_info "Deploying worker to staging..."
    
    # Deploy to staging environment
    if ! wrangler deploy --env "$ENVIRONMENT"; then
        log_error "Worker deployment failed"
        return 1
    fi
    
    log_success "Worker deployed successfully"
}

wait_for_deployment() {
    log_info "Waiting for deployment to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s "$STAGING_URL/health" > /dev/null; then
            log_success "Deployment is ready!"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts: Deployment not ready yet, waiting 10 seconds..."
        sleep 10
        ((attempt++))
    done
    
    log_error "Deployment failed to become ready within timeout"
    return 1
}

run_smoke_tests() {
    log_info "Running smoke tests against staging..."
    
    # Health check
    if ! curl -f -s "$STAGING_URL/health" > /dev/null; then
        log_error "Health check failed"
        return 1
    fi
    log_success "Health check passed"
    
    # Basic page load test
    if ! curl -f -s "$STAGING_URL/" > /dev/null; then
        log_error "Homepage load test failed"
        return 1
    fi
    log_success "Homepage load test passed"
    
    # API endpoint test
    if ! curl -f -s -H "Content-Type: application/json" "$STAGING_URL/api/messages" > /dev/null; then
        log_error "API endpoint test failed"
        return 1
    fi
    log_success "API endpoint test passed"
    
    # Database connectivity test
    if ! curl -f -s "$STAGING_URL/debug/db-status" > /dev/null; then
        log_warning "Database connectivity test failed (might be disabled in staging)"
    else
        log_success "Database connectivity test passed"
    fi
    
    log_success "All smoke tests passed"
}

rollback_deployment() {
    log_error "Rolling back staging deployment..."
    
    if [[ -f /tmp/staging_backup_deployment_id ]]; then
        local backup_id
        backup_id=$(cat /tmp/staging_backup_deployment_id)
        
        if [[ -n "$backup_id" ]]; then
            log_info "Rolling back to deployment: $backup_id"
            if wrangler rollback --name "$WORKER_NAME" --deployment-id "$backup_id"; then
                log_success "Rollback completed successfully"
            else
                log_error "Rollback failed"
            fi
        else
            log_error "No backup deployment ID found"
        fi
    else
        log_error "No backup file found, cannot rollback"
    fi
}

upload_source_maps() {
    if [[ -n "${SENTRY_AUTH_TOKEN:-}" ]]; then
        log_info "Uploading source maps to Sentry..."
        
        if [[ -f "$SCRIPT_DIR/upload-sourcemaps.sh" ]]; then
            "$SCRIPT_DIR/upload-sourcemaps.sh" "$ENVIRONMENT" "${SENTRY_RELEASE:-$(date +%Y%m%d-%H%M%S)}"
        else
            log_warning "Source map upload script not found"
        fi
    else
        log_warning "Sentry auth token not configured, skipping source map upload"
    fi
}

cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f /tmp/staging_backup_deployment_id
}

main() {
    log_info "Starting staging deployment..."
    
    # Set up cleanup trap
    trap cleanup EXIT
    
    # Run deployment steps
    check_prerequisites
    prepare_build
    backup_current_deployment
    
    # Deploy database first
    if ! deploy_database; then
        log_error "Database deployment failed, aborting"
        exit 1
    fi
    
    # Deploy worker
    if ! deploy_worker; then
        log_error "Worker deployment failed, attempting rollback"
        rollback_deployment
        exit 1
    fi
    
    # Wait for deployment to be ready
    if ! wait_for_deployment; then
        log_error "Deployment readiness check failed, attempting rollback"
        rollback_deployment
        exit 1
    fi
    
    # Run smoke tests
    if ! run_smoke_tests; then
        log_error "Smoke tests failed, attempting rollback"
        rollback_deployment
        exit 1
    fi
    
    # Upload source maps
    upload_source_maps
    
    log_success "Staging deployment completed successfully!"
    log_info "Staging URL: $STAGING_URL"
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
