#!/usr/bin/env bash
# Upload encrypted erasure ledger snapshot to independent Hetzner Storage Box.
set -Eeuo pipefail
umask 077
source /etc/rlc-backup.env
src=/var/lib/rlc-recovery/erasure-ledger.jsonl
ref=/var/lib/rlc-recovery/erasure-ledger.sha256
[[ -r "$src" && -r "$ref" ]] || { echo "BLOCK local_erasure_reference_unavailable"; exit 2; }
expected="$(tr -d '[:space:]' < "$ref")"
actual="$(sha256sum "$src" | cut -d ' ' -f1)"
[[ "$expected" == "$actual" ]] || { echo "BLOCK erasure_reference_mismatch"; exit 2; }
dir="$(mktemp -d /tmp/rlc-offsite-erasure.XXXXXXXX)"
trap 'rm -rf "$dir"' EXIT
stamp="$(date -u +%Y%m%dT%H%M%S.%NZ)"
name="$stamp-$actual"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass file:"$BACKUP_ENCRYPTION_KEY_FILE" -in "$src" -out "$dir/$name.enc"
sha256sum "$dir/$name.enc" | awk '{print $1}' > "$dir/$name.sha256"
export SSHPASS="$(cat "$STORAGEBOX_PASSWORD_FILE")"
remote="$STORAGEBOX_USER@$STORAGEBOX_HOST"
sshpass -e ssh -p 23 -oBatchMode=no "$remote" "mkdir -p backups/rlc-erasure-ledger" >/dev/null 2>&1
printf 'put %s/%s.enc backups/rlc-erasure-ledger/%s.enc\nput %s/%s.sha256 backups/rlc-erasure-ledger/%s.sha256\n' "$dir" "$name" "$name" "$dir" "$name" "$name" | sshpass -e sftp -q -P 23 -oBatchMode=no -b - "$remote" >/dev/null
echo "OFFSITE_ERASURE_SNAPSHOT_ENCRYPTED_AND_UPLOADED"
