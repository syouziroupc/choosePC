#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/.cloudflare-deploy-src"
rm -rf "$WORK"
mkdir -p "$WORK"

git -C "$ROOT" fetch --depth=1 origin cloudflare-production
git -C "$ROOT" archive FETCH_HEAD | tar -x -C "$WORK"

cd "$WORK"
npm ci
npm run validate:knowledge
npm run typecheck
npm test
npm run build

test -f dist/client/index.html
test -f dist/choosepc/wrangler.json

npx wrangler deploy
