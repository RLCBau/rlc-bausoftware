#!/usr/bin/env bash
# Read-only Storage Box backup age inventory. No deletion, no secret output.
set -Eeuo pipefail
umask 077
envfile="${1:-/etc/rlc-backup.env}"
[[ -r "$envfile" ]] || { echo "BLOCK backup_config_unavailable"; exit 2; }
set -a
source "$envfile"
set +a
: "${STORAGEBOX_HOST:?}" "${STORAGEBOX_USER:?}" "${STORAGEBOX_PASSWORD_FILE:?}"
[[ -r "$STORAGEBOX_PASSWORD_FILE" ]] || { echo "BLOCK storagebox_credential_unavailable"; exit 2; }
export SSHPASS="$(cat "$STORAGEBOX_PASSWORD_FILE")"
output="$(sshpass -e ssh -p 23 -o BatchMode=no -o ConnectTimeout=12 -o StrictHostKeyChecking=accept-new "$STORAGEBOX_USER@$STORAGEBOX_HOST" 'find backups/rlc -mindepth 1 -maxdepth 1 -type d -print' 2>/dev/null)" || { echo "BLOCK remote_listing_failed"; exit 2; }
today="$(date -u +%s)"
retention="${RETENTION_DAYS:-14}"
total=0
overdue=0
while IFS= read -r entry; do
  [[ -n "$entry" ]] || continue
  stamp="${entry##*/}"
  [[ "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || { echo "BLOCK unexpected_backup_name"; exit 2; }
  epoch="$(date -u -d "${stamp:0:4}-${stamp:4:2}-${stamp:6:2} ${stamp:9:2}:${stamp:11:2}:${stamp:13:2}" +%s)"
  ((total+=1))
  if (( today-epoch > retention*86400 )); then ((overdue+=1)); fi
done <<< "$output"
echo "REMOTE_BACKUP_COUNT=$total"
echo "OLDER_THAN_${retention}_DAYS=$overdue"
if (( overdue > 0 )); then echo "BLOCK remote_retention_not_enforced"; exit 1; fi
echo "PASS no_overdue_backup_directories_observed"
echo "NOTE remote_snapshot_retention_and_restore_still_unverified"
