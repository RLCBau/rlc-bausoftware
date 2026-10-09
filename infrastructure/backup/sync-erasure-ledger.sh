#!/usr/bin/env bash
# Monotonic local erasure reference synchronizer.
# Never accept a truncated or rewritten ledger (such as one restored from an old backup).
set -Eeuo pipefail
umask 077
source_file="${RLC_LEDGER_SOURCE:-/opt/rlc-bausoftware/apps/server/data/privacy-erasure-ledger.jsonl}"
root="${RLC_RECOVERY_DIR:-/var/lib/rlc-recovery}"
snapshot="$root/erasure-ledger.jsonl"
hashfile="$root/erasure-ledger.sha256"
[[ -f "$source_file" ]] || { echo "BLOCK ledger_missing"; exit 2; }
install -d -m 750 "$root"
if [[ -f "$snapshot" ]]; then
  old="$(wc -c < "$snapshot")"
  new="$(wc -c < "$source_file")"
  ((new >= old)) || { echo "BLOCK ledger_truncated"; exit 2; }
  cmp -n "$old" "$snapshot" "$source_file" >/dev/null || { echo "BLOCK ledger_rewritten"; exit 2; }
fi
tmp="$(mktemp "$root/.erasure-ledger.XXXXXXXX")"
trap 'rm -f "$tmp"' EXIT
cp -- "$source_file" "$tmp"
chmod 640 "$tmp"
chgrp 1000 "$tmp"
mv -f "$tmp" "$snapshot"
trap - EXIT
tmp_hash="$(mktemp "$root/.erasure-digest.XXXXXXXX")"
sha256sum "$snapshot" | cut -d ' ' -f1 > "$tmp_hash"
chmod 640 "$tmp_hash"
chgrp 1000 "$tmp_hash"
mv -f "$tmp_hash" "$hashfile"
echo "ERASURE_LEDGER_REFERENCE_SYNC_PASS bytes=$(wc -c < "$snapshot")"
