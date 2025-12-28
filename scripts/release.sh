#!/bin/bash

# npm module release script
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

# Validate version type
VERSION_TYPE=${1:-patch}
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    error "Invalid version type: $VERSION_TYPE (must be one of: patch, minor, major)"
fi

info "Starting release process (${VERSION_TYPE})"

# 1. Check if working directory is clean
info "Checking git status..."
if [[ -n $(git status --porcelain) ]]; then
    error "You have uncommitted changes. Please commit or stash them first."
fi
success "Git working directory is clean"

# 2. Check if on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" && "$CURRENT_BRANCH" != "master" ]]; then
    warning "Currently on '$CURRENT_BRANCH' branch. It's recommended to release from main branch."
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        error "Release aborted"
    fi
fi

# 3. Pull latest changes
info "Fetching latest changes..."
git pull origin "$CURRENT_BRANCH" || warning "Failed to pull from remote (might be offline)"

# 4. Install dependencies
info "Installing dependencies..."
npm ci
success "Dependencies installed"

# 5. Run type check
info "Running type check..."
npm run typecheck
success "Type check passed"

# 6. Run tests
info "Running tests..."
npm run test
success "All tests passed"

# 7. Build
info "Building..."
npm run build
success "Build completed"

# 8. Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
info "Current version: $CURRENT_VERSION"

# 9. Bump version
info "Bumping version (${VERSION_TYPE})..."
NEW_VERSION=$(npm version "$VERSION_TYPE" --no-git-tag-version)
success "New version: $NEW_VERSION"

# 10. Commit changes
info "Committing changes..."
git add package.json package-lock.json
git commit -m "chore: release ${NEW_VERSION}"

# 11. Create tag
info "Creating git tag..."
git tag -a "$NEW_VERSION" -m "Release ${NEW_VERSION}"
success "Tag ${NEW_VERSION} created"

# 12. Push confirmation
echo ""
echo "=========================================="
echo "  Release Ready"
echo "=========================================="
echo ""
echo "  Version: $CURRENT_VERSION → $NEW_VERSION"
echo ""
echo "  Next steps:"
echo "    1. git push origin $CURRENT_BRANCH"
echo "    2. git push origin $NEW_VERSION"
echo "    3. npm publish"
echo ""
read -p "Push and publish to npm now? (y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    info "Pushing to remote..."
    git push origin "$CURRENT_BRANCH"
    git push origin "$NEW_VERSION"
    success "Push completed"

    info "Publishing to npm..."
    npm publish
    success "Published to npm! 🎉"

    echo ""
    echo "=========================================="
    echo "  Release Complete: ${NEW_VERSION}"
    echo "  https://www.npmjs.com/package/musicxml-io"
    echo "=========================================="
else
    info "Please push and publish manually:"
    echo "  git push origin $CURRENT_BRANCH"
    echo "  git push origin $NEW_VERSION"
    echo "  npm publish"
fi
