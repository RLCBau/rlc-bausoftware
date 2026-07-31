#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/opt/rlc-bausoftware}"
PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP="$ROOT/backups/rlc-cad-v1-$STAMP"

[ -d "$ROOT/apps/server" ] || { echo "Server non trovato: $ROOT/apps/server"; exit 1; }
[ -d "$ROOT/apps/web" ] || { echo "Web non trovato: $ROOT/apps/web"; exit 1; }

mkdir -p "$BACKUP/apps/server/src/parsers" "$BACKUP/apps/server/src/routes" "$BACKUP/apps/web/src/pages/cad"
cp "$ROOT/apps/server/src/parsers/dxf.ts" "$BACKUP/apps/server/src/parsers/dxf.ts" 2>/dev/null || true
cp "$ROOT/apps/server/src/routes/bricscad.ts" "$BACKUP/apps/server/src/routes/bricscad.ts" 2>/dev/null || true
cp "$ROOT/apps/web/src/pages/cad/CADViewer.tsx" "$BACKUP/apps/web/src/pages/cad/CADViewer.tsx" 2>/dev/null || true

install -m 0644 "$PATCH_DIR/apps/server/src/parsers/dxf.ts" "$ROOT/apps/server/src/parsers/dxf.ts"
install -m 0644 "$PATCH_DIR/apps/server/src/routes/bricscad.ts" "$ROOT/apps/server/src/routes/bricscad.ts"
install -m 0644 "$PATCH_DIR/apps/web/src/pages/cad/CADViewer.tsx" "$ROOT/apps/web/src/pages/cad/CADViewer.tsx"

echo "Patch installata. Backup: $BACKUP"
echo "Riavvia il server Docker e ricompila il web secondo il tuo deployment attuale."
