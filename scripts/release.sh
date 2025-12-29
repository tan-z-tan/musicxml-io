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

# ============================================
# Pre-flight checks (authentication validation)
# ============================================
info "Running pre-flight checks..."

# Check npm authentication
info "Checking npm authentication..."
if ! npm whoami &> /dev/null; then
    error "npm authentication failed. Please run 'npm login' first."
fi
NPM_USER=$(npm whoami)
success "npm authenticated as: $NPM_USER"

# Check gh CLI authentication
info "Checking GitHub CLI authentication..."
if ! command -v gh &> /dev/null; then
    warning "gh CLI not found. GitHub Release will be skipped."
    GH_AVAILABLE=false
else
    if ! gh auth status &> /dev/null; then
        error "GitHub CLI not authenticated. Please run 'gh auth login' first."
    fi
    GH_AVAILABLE=true
    success "GitHub CLI authenticated"
fi

# Check npm publish access (dry-run to verify permissions)
info "Verifying npm publish permissions..."
PACKAGE_NAME=$(node -p "require('./package.json').name")
if npm access list collaborators "$PACKAGE_NAME" 2>/dev/null | grep -q "$NPM_USER"; then
    success "npm publish access verified for $PACKAGE_NAME"
else
    # If package doesn't exist yet or access check fails, try a different approach
    # Just warn but don't fail - the actual publish will fail if there's an issue
    warning "Could not verify npm publish access (this is OK for new packages)"
fi

success "All pre-flight checks passed!"
echo ""

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

    # 13. Create GitHub Release
    if [[ "$GH_AVAILABLE" == "true" ]]; then
        info "Creating GitHub Release..."

        # Get previous tag for changelog
        PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")

        if [[ -n "$PREV_TAG" ]]; then
            # Generate release notes from commits since last tag
            RELEASE_NOTES=$(git log "${PREV_TAG}..HEAD" --pretty=format:"- %s" --no-merges | grep -v "chore: release")
        else
            RELEASE_NOTES="Initial release"
        fi

        # Create GitHub release with auto-generated notes
        gh release create "$NEW_VERSION" \
            --title "Release ${NEW_VERSION}" \
            --notes "$RELEASE_NOTES" \
            && success "GitHub Release created" \
            || warning "Failed to create GitHub Release (you can create it manually)"
    else
        warning "GitHub Release skipped (gh CLI not available or not authenticated)"
        echo "  Install gh: https://cli.github.com/"
        echo "  Then run: gh release create $NEW_VERSION --title \"Release ${NEW_VERSION}\" --generate-notes"
    fi

    echo ""
    echo "=========================================="
    echo "  Release Complete: ${NEW_VERSION}"
    echo "  https://www.npmjs.com/package/musicxml-io"
    echo "  https://github.com/tan-z-tan/musicxml-io/releases/tag/${NEW_VERSION}"
    echo "=========================================="
else
    info "Please push and publish manually:"
    echo "  git push origin $CURRENT_BRANCH"
    echo "  git push origin $NEW_VERSION"
    echo "  npm publish"
    echo "  gh release create $NEW_VERSION --generate-notes"
fi
