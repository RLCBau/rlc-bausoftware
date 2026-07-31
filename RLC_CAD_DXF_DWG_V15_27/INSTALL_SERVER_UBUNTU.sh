#!/usr/bin/env bash
set -Eeuo pipefail

RLC_ROOT="${1:-/opt/rlc-bausoftware}"
PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_ROOT="$RLC_ROOT/.rlc-backups/dxf_dwg_v15_27_$STAMP"

log() { printf '\n[ RLC CAD DXF/DWG ] %s\n' "$1"; }

install_file() {
  local relative="$1"
  local source="$PACKAGE_ROOT/$relative"
  local target="$RLC_ROOT/$relative"
  local backup="$BACKUP_ROOT/$relative"
  test -f "$source" || { echo "Payload fehlt: $source" >&2; exit 1; }
  if test -f "$target"; then
    mkdir -p "$(dirname "$backup")"
    cp -a "$target" "$backup"
  fi
  mkdir -p "$(dirname "$target")"
  cp -a "$source" "$target"
  printf 'Installiert: %s\n' "$relative"
}

log "Backup und Installation"
install_file "apps/server/src/parsers/dxf.ts"
install_file "apps/server/src/parsers/dxf.engine.ts"
install_file "apps/server/src/routes/cad-import.ts"
install_file "apps/server/src/services/cad-converter.service.ts"

log "Konverterstatus"
if command -v dwg2dxf >/dev/null 2>&1; then
  echo "dwg2dxf: $(command -v dwg2dxf)"
else
  echo "Hinweis: dwg2dxf fehlt. DWG funktioniert erst nach Installation eines Konverters"
  echo "oder mit RLC_CAD_CONVERTER_COMMAND='{input} ... {output}'."
fi

log "Container neu starten"
cd "$RLC_ROOT"
docker compose restart server
docker compose ps server

echo ""
echo "RLC CAD DXF/DWG V15.27 Server installiert."
echo "Backup: $BACKUP_ROOT"
echo "Wichtig: Der Container muss apps/server/src als Volume verwenden."
