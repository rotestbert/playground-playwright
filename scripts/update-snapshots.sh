#!/usr/bin/env bash
# scripts/update-snapshots.sh
# ─────────────────────────────────────────────────────────────────────────────
# Updates visual regression baseline screenshots.
#
# Run this whenever an intentional UI change has been made and the new
# appearance should become the accepted baseline.
#
# Usage:
#   ./scripts/update-snapshots.sh                          # update all baselines
#   ./scripts/update-snapshots.sh --grep "Home Page"       # update specific page
#   ./scripts/update-snapshots.sh --grep "desktop"         # update one viewport
#
# All extra arguments are forwarded to `playwright test`, so any Playwright
# CLI flag works (--headed, --workers, --timeout, etc.).
#
# After running, review the diff and commit the updated PNGs:
#   git diff --stat tests/visual/__snapshots__
#   git add tests/visual/__snapshots__
#   git commit -m "chore(visual): update baselines after <description of change>"
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SNAPSHOT_DIR="tests/visual/__snapshots__"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Visual Regression — Baseline Update"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $# -gt 0 ]; then
  echo "  Extra args passed to playwright: $*"
  echo ""
fi

npx playwright test --project=visual --update-snapshots "$@"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Baselines updated in: ${SNAPSHOT_DIR}/"
echo ""
echo "  Next steps:"
echo "    1. Review changes:  git diff --stat ${SNAPSHOT_DIR}"
echo "    2. Inspect PNGs:    open ${SNAPSHOT_DIR}  (or use your IDE)"
echo "    3. Stage & commit:"
echo "         git add ${SNAPSHOT_DIR}"
echo "         git commit -m \"chore(visual): update baselines\""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
