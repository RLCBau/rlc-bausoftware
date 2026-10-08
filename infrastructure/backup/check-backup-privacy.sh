#!/usr/bin/env bash
# Read-only GDPR backup permissions inventory. Do not print backup contents.
set -Eeuo pipefail
ROOT="${1:-/opt/rlc-bausoftware}"
failed=0
for dir in "$ROOT/backups" "$ROOT/.rlc-backups" "$ROOT/apps/server/data/companies" "$ROOT/apps/server/data/global-audit"; do
  if [[ ! -d "$dir" ]]; then echo "NOT_FOUND $dir"; continue; fi
  if find "$dir" -type f -perm /077 -print -quit | grep -q .; then
    echo "FAIL insecure_files $dir"
    failed=1
  else
    echo "PASS private_files $dir"
  fi
  if find "$dir" -type d -perm /077 -print -quit | grep -q .; then
    echo "FAIL insecure_directories $dir"
    failed=1
  else
    echo "PASS private_directories $dir"
  fi
done
echo "REMOTE_BACKUP_RETENTION_NOT_VERIFIED"
echo "S3_OBJECT_VERSIONS_NOT_VERIFIED"
exit "$failed"
