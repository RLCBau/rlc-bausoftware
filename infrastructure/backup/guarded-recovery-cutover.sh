#!/usr/bin/env bash
# One-command guarded recovery cutover. Reference hash must be held outside restored data.
set -Eeuo pipefail
umask 077
[[ $# -gt 0 ]] || { echo "BLOCK missing_cutover_command"; exit 64; }
ref="${RLC_ERASURE_LEDGER_REFERENCE_FILE:-/var/lib/rlc-recovery/erasure-ledger.sha256}"
[[ -r "$ref" ]] || { echo "BLOCK external_reference_missing"; exit 2; }
hash="$(tr -d '[:space:]' < "$ref")"
[[ "$hash" =~ ^[a-fA-F0-9]{64}$ ]] || { echo "BLOCK external_reference_invalid"; exit 2; }
export RLC_ERASURE_LEDGER_SHA256="$hash"
export RLC_RESTORE_TARGET_CONTAINER="${RLC_RESTORE_TARGET_CONTAINER:-rlc-server}"
exec bash /opt/rlc-bausoftware/infrastructure/backup/restore-cutover-gate.sh "$@"
