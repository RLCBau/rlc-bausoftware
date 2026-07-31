#!/usr/bin/env bash
set -Eeuo pipefail

RLC_ROOT="${1:-/opt/rlc-bausoftware}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_ROOT="$RLC_ROOT/.rlc-backups/cad_api_rename_$STAMP"

log() { printf '\n[ RLC CAD ] %s\n' "$*"; }
fail() { printf '\n[ RLC CAD ] FEHLER: %s\n' "$*" >&2; exit 1; }

[[ -d "$RLC_ROOT/apps/server/src" ]] || fail "Server source non trovato in $RLC_ROOT"
[[ -d "$RLC_ROOT/apps/web/src" ]] || fail "Web source non trovato in $RLC_ROOT"
[[ -f "$SCRIPT_DIR/apps/web/src/pages/cad/CADViewer.tsx" ]] || fail "Payload CADViewer.tsx mancante"

log "Backup sorgenti"
mkdir -p "$BACKUP_ROOT/apps/server" "$BACKUP_ROOT/apps/web"
cp -a "$RLC_ROOT/apps/server/src" "$BACKUP_ROOT/apps/server/src"
cp -a "$RLC_ROOT/apps/web/src" "$BACKUP_ROOT/apps/web/src"

rollback() {
  local code=$?
  if [[ $code -ne 0 ]]; then
    printf '\n[ RLC CAD ] Ripristino backup...\n' >&2
    rm -rf "$RLC_ROOT/apps/server/src" "$RLC_ROOT/apps/web/src"
    cp -a "$BACKUP_ROOT/apps/server/src" "$RLC_ROOT/apps/server/src"
    cp -a "$BACKUP_ROOT/apps/web/src" "$RLC_ROOT/apps/web/src"
    printf '[ RLC CAD ] Backup ripristinato: %s\n' "$BACKUP_ROOT" >&2
  fi
  exit $code
}
trap rollback ERR

log "Installazione CADViewer V15.26"
cp -f "$SCRIPT_DIR/apps/web/src/pages/cad/CADViewer.tsx" \
  "$RLC_ROOT/apps/web/src/pages/cad/CADViewer.tsx"

grep -q "RLC_CAD_API_RENAME_V15_26" \
  "$RLC_ROOT/apps/web/src/pages/cad/CADViewer.tsx" \
  || fail "Marker V15.26 non trovato"

log "Rinomina route e service"
python3 "$SCRIPT_DIR/migrate_rlc_cad_names.py" "$RLC_ROOT"

log "Migrazione cartelle progetto bricscad -> cad"
PROJECTS_ROOT="$RLC_ROOT/data/projects"
if [[ -d "$PROJECTS_ROOT" ]]; then
  while IFS= read -r -d '' old_dir; do
    project_dir="$(dirname "$old_dir")"
    new_dir="$project_dir/cad"
    if [[ ! -e "$new_dir" ]]; then
      mv "$old_dir" "$new_dir"
      printf 'Migrato: %s -> %s\n' "$old_dir" "$new_dir"
    else
      cp -a "$old_dir"/. "$new_dir"/
      mv "$old_dir" "$old_dir.migrated_$STAMP"
      printf 'Unito:   %s -> %s\n' "$old_dir" "$new_dir"
    fi
  done < <(find "$PROJECTS_ROOT" -mindepth 2 -maxdepth 2 -type d -name bricscad -print0)
fi

log "Controllo riferimenti residui"
if grep -RniE '/api/bricscad|routes/bricscad|services/bricscad\.service' \
  "$RLC_ROOT/apps/server/src" "$RLC_ROOT/apps/web/src" \
  --exclude="*.save" --exclude="*.bak*" \
  --exclude-dir=node_modules --exclude-dir=dist; then
  fail "Sono rimasti riferimenti BricsCAD attivi"
fi

log "Build server/web"
echo "[ RLC CAD ] Build locale saltata: deployment Docker"

log "Ricostruzione container server"
(
  cd "$RLC_ROOT"
  docker compose build server
  docker compose up -d server
  docker compose ps server
)

trap - ERR
log "Migrazione completata"
printf '\nNuove API: /api/cad/*\n'
printf 'Nuova route: apps/server/src/routes/cad-import.ts\n'
printf 'Nuovo service: apps/server/src/services/cad-import.service.ts\n'
printf 'Backup: %s\n' "$BACKUP_ROOT"
