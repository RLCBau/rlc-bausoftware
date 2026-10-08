#!/usr/bin/env bash
# Read-only classification of Storage Box backups by filename, not cryptographic verification.
set -Eeuo pipefail
umask 077
source /etc/rlc-backup.env
export SSHPASS="$(cat "$STORAGEBOX_PASSWORD_FILE")"
listing="$(printf 'ls -1 backups/rlc\n' | sshpass -e sftp -P 23 -oBatchMode=no -b - "$STORAGEBOX_USER@$STORAGEBOX_HOST" 2>/dev/null)"
count=0; legacy=0
while IFS= read -r dir; do
  [[ "$dir" =~ ^backups/rlc/[0-9]{8}T[0-9]{6}Z$ ]] || continue
  ((count+=1))
  files="$(printf 'ls -1 %s\n' "$dir" | sshpass -e sftp -P 23 -oBatchMode=no -b - "$STORAGEBOX_USER@$STORAGEBOX_HOST" 2>/dev/null)"
  if printf '%s\n' "$files" | grep -Eq '(/postgresql\.dump|/rlc-system\.tar\.gz)$'; then
    ((legacy+=1))
    echo "BLOCK legacy_plaintext_named_archive ${dir##*/}"
  else
    echo "CHECK encrypted_extension_archive ${dir##*/}"
  fi
done <<< "$listing"
echo "INSPECTED=$count LEGACY=$legacy"
(( legacy == 0 )) || exit 1
