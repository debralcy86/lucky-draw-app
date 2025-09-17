#!/usr/bin/env bash
# cleanup_duplicates.sh — run from repo root: /Users/debrasmacbook/MyProject
set -euo pipefail

ROOT="/Users/debrasmacbook/MyProject"

echo "==> Removing duplicate/legacy API files…"
rm -f "$ROOT/projects/api/handlers/bet.mjs"
rm -f "$ROOT/projects/api/handlers/draw-scheduler.mjs"
rm -f "$ROOT/projects/api/handlers/withdraw-request.mjs"
rm -f "$ROOT/projects/api/wallet.mjs"

echo "==> Updating local server to use handlers/data-balance.mjs instead of wallet.mjs…"
cp "$ROOT/projects/api/server.mjs" "$ROOT/projects/api/server.mjs.bak"

# Replace import path ./wallet.mjs -> ./handlers/data-balance.mjs
# macOS BSD sed: use -i '' for in-place
sed -i '' "s#\\./wallet\\.mjs#./handlers/data-balance.mjs#g" "$ROOT/projects/api/server.mjs"

echo "==> (Optional) Ensure /api/data-balance endpoint exists in server.mjs"
# Add a minimal route if not present (idempotent append based on a marker)
if ! grep -q "/api/data-balance" "$ROOT/projects/api/server.mjs"; then
  awk '1; /return withdrawCreate\(req, res\);/ && done==0 { print "\n    // Explicit data-balance endpoint (parity with new handler)\n    if (url.pathname === '\''/api/data-balance'\'') {\n      const { default: handler } = await import('\''./handlers/data-balance.mjs'\'');\n      return handler(req, res);\n    }\n"; done=1 }' "$ROOT/projects/api/server.mjs" > "$ROOT/projects/api/server.mjs.tmp"
  mv "$ROOT/projects/api/server.mjs.tmp" "$ROOT/projects/api/server.mjs"
fi

echo "==> (Optional) Update README test examples to /api/data-balance"
if [ -f "$ROOT/projects/README.md" ]; then
  cp "$ROOT/projects/README.md" "$ROOT/projects/README.md.bak"
  sed -i '' "s#/api/wallet#/api/data-balance#g" "$ROOT/projects/README.md" || true
fi

echo "==> (Optional) Update bootstrap script to use /api/data-balance"
if [ -f "$ROOT/scripts/bootstrap.sh" ]; then
  cp "$ROOT/scripts/bootstrap.sh" "$ROOT/scripts/bootstrap.sh.bak"
  sed -i '' "s#/api/wallet\\?userId=#/api/data-balance?userId=#g" "$ROOT/scripts/bootstrap.sh" || true
  sed -i '' "s#/api/wallet#/api/data-balance#g" "$ROOT/scripts/bootstrap.sh" || true
fi

echo "==> Done."
echo "Backups created:"
echo "  $ROOT/projects/api/server.mjs.bak"
[ -f "$ROOT/projects/README.md.bak" ] && echo "  $ROOT/projects/README.md.bak"
[ -f "$ROOT/scripts/bootstrap.sh.bak" ] && echo "  $ROOT/scripts/bootstrap.sh.bak"
echo "Removed files:"
echo "  $ROOT/projects/api/handlers/bet.mjs"
echo "  $ROOT/projects/api/handlers/draw-scheduler.mjs"
echo "  $ROOT/projects/api/handlers/withdraw-request.mjs"
echo "  $ROOT/projects/api/wallet.mjs"

