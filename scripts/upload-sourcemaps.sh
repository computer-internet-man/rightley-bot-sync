#!/bin/bash

set -euo pipefail

# Upload source maps to Sentry for error tracking
# Usage: ./upload-sourcemaps.sh [environment] [release]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ENVIRONMENT=${1:-${ENVIRONMENT:-production}}
RELEASE=${2:-${SENTRY_RELEASE:-$(date +%Y%m%d-%H%M%S)}}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

log_info "Uploading source maps to Sentry..."
log_info "Environment: $ENVIRONMENT"
log_info "Release: $RELEASE"

# Change to project root
cd "$PROJECT_ROOT"

# Check if Sentry is configured
if [[ -z "${SENTRY_DSN:-}" ]]; then
    log_warning "SENTRY_DSN not set, skipping source map upload"
    exit 0
fi

# Check required environment variables
if [[ -z "${SENTRY_AUTH_TOKEN:-}" ]]; then
    log_error "SENTRY_AUTH_TOKEN environment variable is required"
    exit 1
fi

if [[ -z "${SENTRY_ORG:-}" ]]; then
    log_error "SENTRY_ORG environment variable is required"
    exit 1
fi

if [[ -z "${SENTRY_PROJECT:-}" ]]; then
    log_error "SENTRY_PROJECT environment variable is required"
    exit 1
fi

# Check if Sentry CLI is available
if ! command -v sentry-cli &> /dev/null; then
    log_info "Installing Sentry CLI..."
    if command -v npm &> /dev/null; then
        npm install -g @sentry/cli
    elif command -v pnpm &> /dev/null; then
        pnpm add -g @sentry/cli
    else
        log_error "Neither npm nor pnpm found. Cannot install Sentry CLI"
        exit 1
    fi
fi

# Verify Sentry CLI is working
if ! sentry-cli --version &> /dev/null; then
    log_error "Sentry CLI installation failed or not working"
    exit 1
fi

# Create release
log_info "Creating Sentry release: $RELEASE"
if ! sentry-cli releases new "$RELEASE"; then
    log_error "Failed to create Sentry release"
    exit 1
fi

# Upload source maps
log_info "Uploading source maps..."
if [[ -d "dist" ]]; then
    # Find all .js.map and .ts.map files
    mapfiles=$(find dist -name "*.map" -type f 2>/dev/null || true)
    
    if [[ -n "$mapfiles" ]]; then
        log_info "Found source map files:"
        echo "$mapfiles"
        
        # Upload source maps with proper URL prefixes
        if ! sentry-cli releases files "$RELEASE" upload-sourcemaps dist/ \
            --url-prefix "~/" \
            --validate \
            --strip-common-prefix; then
            log_error "Failed to upload source maps"
            exit 1
        fi
        
        log_success "Source maps uploaded successfully"
    else
        log_warning "No source map files found in dist directory"
    fi
else
    log_warning "dist directory not found, skipping source map upload"
fi

# Set commits if in git repository
if git rev-parse --git-dir > /dev/null 2>&1; then
    log_info "Setting commits for release..."
    if ! sentry-cli releases set-commits "$RELEASE" --auto; then
        log_warning "Failed to set commits (this is not critical)"
    else
        log_success "Commits set for release"
    fi
else
    log_warning "Not in a git repository, skipping commit association"
fi

# Finalize release
log_info "Finalizing release..."
if ! sentry-cli releases finalize "$RELEASE"; then
    log_warning "Failed to finalize release (this is not critical)"
else
    log_success "Release finalized"
fi

# Create deployment
log_info "Creating deployment in Sentry..."
if ! sentry-cli releases deploys "$RELEASE" new -e "$ENVIRONMENT"; then
    log_warning "Failed to create deployment (this is not critical)"
else
    log_success "Deployment created in Sentry"
fi

# Add additional metadata
log_info "Adding release metadata..."

# Get current commit info if available
if git rev-parse --git-dir > /dev/null 2>&1; then
    COMMIT_SHA=$(git rev-parse HEAD)
    COMMIT_MESSAGE=$(git log -1 --pretty=%B)
    COMMIT_AUTHOR=$(git log -1 --pretty=%an)
    
    # Set release metadata
    sentry-cli releases set-commits "$RELEASE" --commit "$COMMIT_SHA" || log_warning "Failed to set specific commit"
    
    log_info "Release metadata:"
    log_info "  Commit: $COMMIT_SHA"
    log_info "  Author: $COMMIT_AUTHOR"
    log_info "  Message: $COMMIT_MESSAGE"
fi

# Add environment-specific tags
case "$ENVIRONMENT" in
    "prod"|"production")
        ENV_TAG="production"
        ;;
    "staging"|"stage")
        ENV_TAG="staging"
        ;;
    "dev"|"development")
        ENV_TAG="development"
        ;;
    *)
        ENV_TAG="$ENVIRONMENT"
        ;;
esac

log_info "Environment tag: $ENV_TAG"

log_success "Source maps uploaded successfully to Sentry!"
log_info "Release: $RELEASE"
log_info "Environment: $ENV_TAG"
log_info "Sentry dashboard: https://sentry.io/organizations/${SENTRY_ORG}/projects/${SENTRY_PROJECT}/releases/${RELEASE}/"
