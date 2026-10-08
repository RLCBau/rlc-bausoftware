#!/usr/bin/env bash
# GDPR backup and object-store gate; read-only, fails closed.
set -Eeuo pipefail
installed="${1:-/usr/local/sbin/rlc-backup}"
fail=0
if [[ ! -r "$installed" ]]; then echo "FAIL installed_backup_script_missing"; exit 1; fi
if grep -q 'openssl enc -aes-256-cbc' "$installed"; then echo "PASS backup_encryption_configured"; else echo "FAIL backup_encryption_missing"; fail=1; fi
if grep -q 'umask 077' "$installed"; then echo "PASS restrictive_creation_umask"; else echo "FAIL restrictive_creation_umask_missing"; fail=1; fi
if grep -Eq 'Remote retention is managed separately|Remote retention|remote retention' "$installed" || ! grep -Eq '(ssh|sftp|rclone).* (rm|delete|purge)' "$installed"; then
  echo "BLOCK remote_retention_expiry_unverified"
  fail=1
fi
echo "BLOCK object_storage_versioning_unverified"
echo "BLOCK restore_erasure_replay_unverified"
exit 1
