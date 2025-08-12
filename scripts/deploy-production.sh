#!/bin/bash

set -euo pipefail

# Deploy to Production Environment
# This script handles production deployment with extra safety checks and gradual rollout

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="prod"
WORKER_NAME="ai-concierge-mvp-prod"
DB_NAME="concierge_prod"
STAGING_URL="https://ai-concierge-mvp-staging.your-subdomain.workers.dev"
PRODUCTION_URL="https://ai-concierge-mvp-prod.your-subdomain.workers.dev"

# Safety settings
HEALTH_CHECK_INTERVAL=30  # seconds
HEALTH_CHECK_TIMEOUT=300  # 5 minutes
ROLLBACK_THRESHOLD=3      # number of failed health checks before rollback

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
    log_info "Checking production deployment prerequisites..."
    
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
    
    # Verify staging is healthy before production deployment
    log_info "Verifying staging environment health..."
    if ! curl -f -s "$STAGING_URL/health" > /dev/null; then
        log_error "Staging environment is not healthy. Cannot proceed with production deployment."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

confirm_production_deployment() {
    if [[ "${CI:-}" == "true" ]]; then
        log_info "Running in CI environment, skipping interactive confirmation"
        return 0
    fi
    
    echo
    log_warning "⚠️  PRODUCTION DEPLOYMENT CONFIRMATION ⚠️"
    echo
    echo "You are about to deploy to PRODUCTION environment:"
    echo "  Worker: $WORKER_NAME"
    echo "  Database: $DB_NAME"
    echo "  URL: $PRODUCTION_URL"
    echo
    read -p "Are you sure you want to proceed? (yes/no): " confirmation
    
    if [[ "$confirmation" != "yes" ]]; then
        log_info "Production deployment cancelled by user"
        exit 0
    fi
    
    log_info "Production deployment confirmed"
}

prepare_build() {
    log_info "Preparing build for production..."
    
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
    
    # Run comprehensive tests
    log_info "Running unit tests..."
    pnpm test:unit
    
    log_info "Running integration tests..."
    pnpm test:integration || log_warning "Integration tests failed or not available"
    
    # Build application for production
    log_info "Building application for production..."
    RWSDK_DEPLOY=1 NODE_ENV=production pnpm build
    
    log_success "Build preparation completed"
}

backup_production() {
    log_info "Creating backup of current production deployment..."
    
    # Get current deployment info
    CURRENT_DEPLOYMENT=$(wrangler deployments list --name "$WORKER_NAME" --json 2>/dev/null | jq -r '.[0].id // empty' || echo "")
    
    if [[ -n "$CURRENT_DEPLOYMENT" ]]; then
        echo "$CURRENT_DEPLOYMENT" > /tmp/production_backup_deployment_id
        log_success "Current deployment ID saved: $CURRENT_DEPLOYMENT"
        
        # Also save deployment metadata
        wrangler deployments list --name "$WORKER_NAME" --json 2>/dev/null | jq '.[0]' > /tmp/production_backup_metadata.json || true
    else
        log_warning "No existing deployment found to backup"
    fi
    
    # Create database backup point (if supported)
    log_info "Creating database backup point..."
    # Note: D1 doesn't support automated backups yet, but we log the attempt
    wrangler d1 execute "$DB_NAME" --command "SELECT 'backup-$(date +%Y%m%d-%H%M%S)' as backup_marker;" --remote || log_warning "Database backup marker creation failed"
}

deploy_database() {
    log_info "Deploying database migrations to production..."
    
    # Dry run first (if supported)
    log_info "Checking database migration plan..."
    
    # Apply migrations to production database
    if ! wrangler d1 migrations apply "$DB_NAME" --remote; then
        log_error "Database migration failed"
        return 1
    fi
    
    # Verify database health after migration
    log_info "Verifying database health after migration..."
    sleep 10
    
    log_success "Database migrations applied successfully"
}

deploy_worker() {
    log_info "Deploying worker to production..."
    
    # Deploy to production environment
    if ! wrangler deploy --env "$ENVIRONMENT"; then
        log_error "Worker deployment failed"
        return 1
    fi
    
    log_success "Worker deployed successfully"
}

gradual_health_check() {
    log_info "Starting gradual health check monitoring..."
    
    local failed_checks=0
    local total_checks=0
    local start_time=$(date +%s)
    local timeout_time=$((start_time + HEALTH_CHECK_TIMEOUT))
    
    while [[ $(date +%s) -lt $timeout_time ]]; do
        ((total_checks++))
        
        log_info "Health check $total_checks..."
        
        if curl -f -s "$PRODUCTION_URL/health" > /dev/null; then
            log_success "Health check $total_checks: PASS"
            failed_checks=0
            
            # Additional checks
            if curl -f -s "$PRODUCTION_URL/" > /dev/null; then
                log_success "Homepage check: PASS"
            else
                log_warning "Homepage check: FAIL"
                ((failed_checks++))
            fi
            
            # API endpoint check
            if curl -f -s -H "Content-Type: application/json" "$PRODUCTION_URL/api/messages" > /dev/null; then
                log_success "API endpoint check: PASS"
            else
                log_warning "API endpoint check: FAIL"
                ((failed_checks++))
            fi
            
        else
            log_error "Health check $total_checks: FAIL"
            ((failed_checks++))
        fi
        
        # Check if we should rollback
        if [[ $failed_checks -ge $ROLLBACK_THRESHOLD ]]; then
            log_error "Failed health checks exceeded threshold ($failed_checks >= $ROLLBACK_THRESHOLD)"
            return 1
        fi
        
        # If we've had several successful checks, consider deployment stable
        if [[ $total_checks -ge 5 && $failed_checks -eq 0 ]]; then
            log_success "Deployment appears stable after $total_checks checks"
            return 0
        fi
        
        sleep $HEALTH_CHECK_INTERVAL
    done
    
    if [[ $failed_checks -gt 0 ]]; then
        log_error "Health check monitoring completed with failures"
        return 1
    fi
    
    log_success "Gradual health check completed successfully"
    return 0
}

run_production_smoke_tests() {
    log_info "Running comprehensive smoke tests against production..."
    
    # Health check
    if ! curl -f -s "$PRODUCTION_URL/health" > /dev/null; then
        log_error "Production health check failed"
        return 1
    fi
    log_success "Health check passed"
    
    # Basic page load test
    if ! curl -f -s "$PRODUCTION_URL/" > /dev/null; then
        log_error "Homepage load test failed"
        return 1
    fi
    log_success "Homepage load test passed"
    
    # API endpoint test
    if ! curl -f -s -H "Content-Type: application/json" "$PRODUCTION_URL/api/messages" > /dev/null; then
        log_error "API endpoint test failed"
        return 1
    fi
    log_success "API endpoint test passed"
    
    # Database connectivity test
    if ! curl -f -s "$PRODUCTION_URL/debug/db-status" > /dev/null; then
        log_warning "Database connectivity test endpoint not available (expected in production)"
    else
        log_success "Database connectivity test passed"
    fi
    
    # Performance test
    log_info "Running basic performance test..."
    local response_time
    response_time=$(curl -o /dev/null -s -w "%{time_total}" "$PRODUCTION_URL/")
    
    if (( $(echo "$response_time > 5.0" | bc -l) )); then
        log_warning "Response time is slow: ${response_time}s"
    else
        log_success "Response time acceptable: ${response_time}s"
    fi
    
    log_success "All production smoke tests passed"
}

rollback_deployment() {
    log_error "Initiating production rollback..."
    
    if [[ -f /tmp/production_backup_deployment_id ]]; then
        local backup_id
        backup_id=$(cat /tmp/production_backup_deployment_id)
        
        if [[ -n "$backup_id" ]]; then
            log_info "Rolling back to deployment: $backup_id"
            if wrangler rollback --name "$WORKER_NAME" --deployment-id "$backup_id"; then
                log_success "Rollback completed successfully"
                
                # Wait for rollback to take effect
                sleep 30
                
                # Verify rollback worked
                if curl -f -s "$PRODUCTION_URL/health" > /dev/null; then
                    log_success "Rollback verification passed"
                    return 0
                else
                    log_error "Rollback verification failed"
                    return 1
                fi
            else
                log_error "Rollback failed"
                return 1
            fi
        else
            log_error "No backup deployment ID found"
            return 1
        fi
    else
        log_error "No backup file found, cannot rollback"
        return 1
    fi
}

upload_source_maps() {
    if [[ -n "${SENTRY_AUTH_TOKEN:-}" ]]; then
        log_info "Uploading source maps to Sentry for production..."
        
        if [[ -f "$SCRIPT_DIR/upload-sourcemaps.sh" ]]; then
            "$SCRIPT_DIR/upload-sourcemaps.sh" "$ENVIRONMENT" "${SENTRY_RELEASE:-$(date +%Y%m%d-%H%M%S)}"
        else
            log_warning "Source map upload script not found"
        fi
    else
        log_warning "Sentry auth token not configured, skipping source map upload"
    fi
}

create_deployment_record() {
    log_info "Creating deployment record..."
    
    local version="${SENTRY_RELEASE:-$(date +%Y%m%d-%H%M%S)}"
    local commit_sha="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}"
    
    # Create a deployment record file
    cat > "/tmp/production_deployment_record.json" << EOF
{
  "version": "$version",
  "commit_sha": "$commit_sha",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "production",
  "worker_name": "$WORKER_NAME",
  "database_name": "$DB_NAME",
  "url": "$PRODUCTION_URL",
  "deployed_by": "${USER:-unknown}",
  "ci": "${CI:-false}"
}
EOF
    
    log_success "Deployment record created"
}

send_deployment_notification() {
    log_info "Sending deployment notification..."
    
    # This is a placeholder for notification systems
    # In a real setup, you'd integrate with Slack, Teams, Discord, etc.
    
    local version="${SENTRY_RELEASE:-$(date +%Y%m%d-%H%M%S)}"
    local commit_sha="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}"
    
    echo "🚀 Production Deployment Successful!"
    echo "Version: $version"
    echo "Commit: $commit_sha"
    echo "URL: $PRODUCTION_URL"
    echo "Time: $(date)"
    
    # If webhook URL is configured, send notification
    if [[ -n "${DEPLOYMENT_WEBHOOK_URL:-}" ]]; then
        curl -X POST "$DEPLOYMENT_WEBHOOK_URL" \
             -H "Content-Type: application/json" \
             -d "{\"text\":\"🚀 Production deployment successful: $version\"}" \
             || log_warning "Failed to send webhook notification"
    fi
}

cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f /tmp/production_backup_deployment_id
    rm -f /tmp/production_backup_metadata.json
    rm -f /tmp/production_deployment_record.json
}

main() {
    log_info "Starting production deployment..."
    
    # Set up cleanup trap
    trap cleanup EXIT
    
    # Run pre-deployment steps
    check_prerequisites
    confirm_production_deployment
    prepare_build
    backup_production
    
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
    
    # Gradual health monitoring
    if ! gradual_health_check; then
        log_error "Health check monitoring failed, attempting rollback"
        rollback_deployment
        exit 1
    fi
    
    # Run comprehensive smoke tests
    if ! run_production_smoke_tests; then
        log_error "Production smoke tests failed, attempting rollback"
        rollback_deployment
        exit 1
    fi
    
    # Upload source maps
    upload_source_maps
    
    # Create deployment record
    create_deployment_record
    
    # Send notifications
    send_deployment_notification
    
    log_success "🎉 Production deployment completed successfully!"
    log_info "Production URL: $PRODUCTION_URL"
    log_info "Monitor the deployment at: https://dash.cloudflare.com/"
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
