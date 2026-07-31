#!/usr/bin/env bash
set -euo pipefail

RLC_ROOT="/opt/rlc-bausoftware"
RUN_CHECKS=0
REBUILD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rlc-root)
      RLC_ROOT="${2:?Missing value for --rlc-root}"
      shift 2
      ;;
    --run-checks)
      RUN_CHECKS=1
      shift
      ;;
    --rebuild)
      REBUILD=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/payload/apps/server/src/routes/cad.ts"

if [[ -f "$RLC_ROOT/apps/server/src/routes/cad.ts" ]]; then
  TARGET="$RLC_ROOT/apps/server/src/routes/cad.ts"
elif [[ -f "$RLC_ROOT/src/routes/cad.ts" ]]; then
  TARGET="$RLC_ROOT/src/routes/cad.ts"
else
  echo "cad.ts not found under $RLC_ROOT" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP="${TARGET}.backup_${STAMP}"

echo "RLC root : $RLC_ROOT"
echo "Target   : $TARGET"
echo "Backup   : $BACKUP"

cp -a "$TARGET" "$BACKUP"
cp -a "$SOURCE" "$TARGET"

echo "Installed multi-drawing CAD route."

cd "$RLC_ROOT"

if [[ "$RUN_CHECKS" -eq 1 ]]; then
  echo "Running server TypeScript/build check..."
  if docker compose exec -T server sh -lc 'if [ -f package.json ]; then npm run build; else exit 1; fi'; then
    echo "Container build check passed."
  else
    echo "Container build check failed. Restoring backup..." >&2
    cp -a "$BACKUP" "$TARGET"
    exit 1
  fi
fi

if [[ "$REBUILD" -eq 1 ]]; then
  echo "Rebuilding and restarting server..."
  docker compose build server
  docker compose up -d server
else
  echo
  echo "Source installed. Apply it with:"
  echo "  cd \"$RLC_ROOT\""
  echo "  docker compose build server"
  echo "  docker compose up -d server"
fi

echo
echo "Backup retained at:"
echo "  $BACKUP"
