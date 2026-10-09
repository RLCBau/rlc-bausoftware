#!/usr/bin/env bash
# Recovery cutover wrapper: a failed/missing erasure check NEVER runs the cutover command.
# Invoke only after restoring the DB, before exposing any restored service.
set -Eeuo pipefail
if [[ "$#" -lt 1 ]]; then
  echo "USAGE: restore-cutover-gate.sh <cutover-command> [args...]" >&2
  exit 64
fi
if [[ "${RLC_RESTORE_GATE_TEST_MODE:-}" == "1" ]]; then
  # Only permitted for standalone tests, not production cutover.
  [[ "${RLC_ALLOW_TEST_GATE:-}" == "yes" ]] || { echo "BLOCK test_override_forbidden"; exit 2; }
  [[ "${RLC_PRODUCTION_CUTOVER:-}" != "1" ]] || { echo "BLOCK production_test_override"; exit 2; }
  "${RLC_GATE_TEST_COMMAND:?}"
else
  target="${RLC_RESTORE_TARGET_CONTAINER:-}"
  [[ "$target" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]+$ ]] || { echo "BLOCK restore_target_not_explicit"; exit 2; }
  expected="${RLC_ERASURE_LEDGER_SHA256:-}"
  [[ "$expected" =~ ^[a-fA-F0-9]{64}$ ]] || { echo "BLOCK external_ledger_digest_required"; exit 2; }
  actual="$(docker exec "$target" sha256sum /app/data/privacy-erasure-ledger.jsonl 2>/dev/null | cut -d " " -f 1)" || { echo "BLOCK erasure_ledger_missing"; exit 2; }
  [[ "$actual" == "$expected" ]] || { echo "BLOCK erasure_ledger_digest_mismatch"; exit 2; }
  docker exec "$target" node -r ts-node/register/transpile-only src/scripts/checkRestoreGate.ts
fi
echo "RESTORE_GATE_PASSED_STARTING_CUTOVER"
exec "$@"
