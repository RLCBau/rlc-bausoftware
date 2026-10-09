#!/usr/bin/env bash
# Remote backup expiry: preserves legal holds and at least three latest snapshots.
set -Eeuo pipefail
umask 077
source /etc/rlc-backup.env
days="${REMOTE_RETENTION_DAYS:-90}"
[[ "$days" =~ ^[0-9]+$ ]] && ((days>=30 && days<=3650)) || { echo "BLOCK invalid_retention"; exit 2; }
export SSHPASS="$(cat "$STORAGEBOX_PASSWORD_FILE")"
remote="$STORAGEBOX_USER@$STORAGEBOX_HOST"
listing="$(printf 'ls -1 backups/rlc\n' | sshpass -e sftp -q -P 23 -oBatchMode=no -b - "$remote" 2>/dev/null)" || { echo "BLOCK remote_unreachable"; exit 2; }
mapfile -t snaps < <(printf '%s\n' "$listing" | grep -E '^backups/rlc/[0-9]{8}T[0-9]{6}Z$' | sort)
(( ${#snaps[@]} >= 3 )) || { echo "BLOCK insufficient_snapshots"; exit 2; }
now="$(date -u +%s)"
remaining="${#snaps[@]}"
removed=0
for entry in "${snaps[@]}"; do
  stamp="${entry##*/}"
  epoch="$(date -u -d "${stamp:0:4}-${stamp:4:2}-${stamp:6:2} ${stamp:9:2}:${stamp:11:2}:${stamp:13:2}" +%s)"
  ((now-epoch>days*86400)) || continue
  ((remaining>3)) || { echo "HOLD last_three_snapshots"; continue; }
  listing="$(printf 'ls -1 backups/rlc/%s\n' "$stamp" | sshpass -e sftp -q -P 23 -oBatchMode=no -b - "$remote" 2>/dev/null)" || { echo "BLOCK remote_snapshot_listing"; exit 2; }
  mapfile -t names < <(printf '%s\n' "$listing" | sed -n "s@^backups/rlc/$stamp/@@p")
  ((${#names[@]}>0)) || { echo "BLOCK empty_snapshot"; exit 2; }
  held=0
  for name in "${names[@]}"; do
    if [[ "$name" == "LEGAL_HOLD" || "$name" == "DO_NOT_DELETE" ]]; then held=1; break; fi
    [[ "$name" == "CIPHERTEXT_SHA256SUMS" || "$name" =~ ^[A-Za-z0-9_.-]+\.enc$ ]] || { echo "BLOCK unexpected_backup_file"; exit 2; }
  done
  ((held==0)) || { echo "HOLD legal_hold $stamp"; continue; }
  if [[ "${RLC_REMOTE_RETENTION_DRY_RUN:-1}" != "0" ]]; then echo "DRY_RUN old_snapshot $stamp"; continue; fi
  batch="$(mktemp)"
  for name in "${names[@]}"; do printf 'rm backups/rlc/%s/%s\n' "$stamp" "$name" >> "$batch"; done
  printf 'rmdir backups/rlc/%s\n' "$stamp" >> "$batch"
  if ! sshpass -e sftp -q -P 23 -oBatchMode=no -b "$batch" "$remote" >/dev/null 2>&1; then rm -f "$batch"; echo "BLOCK deletion_failed $stamp"; exit 2; fi
  rm -f "$batch"
  ((removed+=1)); ((remaining-=1))
  echo "EXPIRED_BACKUP_REMOVED $stamp"
done
echo "REMOTE_RETENTION_PASS days=$days remaining=$remaining removed=$removed"
