#!/usr/bin/env bash
set -e

echo "🔍 Running validator dev checks..."

echo ""
echo "📦 Checking package structure..."
if [ ! -f "package.json" ]; then
  echo "❌ Not in validator package directory"
  exit 1
fi

echo ""
echo "🎨 Linting..."
pnpm lint

echo ""
echo "🔧 Type checking..."
pnpm type-check

echo ""
echo "🧪 Running tests..."
pnpm test

echo ""
echo "📦 Testing build..."
pnpm build

echo ""
echo "✅ All checks passed!"