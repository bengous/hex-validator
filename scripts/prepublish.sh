#!/usr/bin/env bash
set -e

echo "📦 Pre-publish checks for hex-validator"

# Run all checks
pnpm check

# Verify build succeeds
pnpm clean
pnpm build

# Check dist/ contents
if [ ! -d "dist" ]; then
  echo "❌ dist/ directory not created"
  exit 1
fi

if [ ! -f "dist/index.js" ]; then
  echo "❌ dist/index.js not found"
  exit 1
fi

if [ ! -f "dist/index.d.ts" ]; then
  echo "❌ dist/index.d.ts not found"
  exit 1
fi

# Test packing
echo ""
echo "📦 Testing package creation..."
PACK_OUTPUT=$(pnpm pack --dry-run 2>&1)

echo "$PACK_OUTPUT"

# Check if configs are included
if ! echo "$PACK_OUTPUT" | grep -q "configs/"; then
  echo "⚠️  Warning: configs/ might not be included in package"
fi

echo ""
echo "✅ Pre-publish checks passed!"
echo ""
echo "To publish:"
echo "  pnpm publish --access public"