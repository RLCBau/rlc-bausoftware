#!/usr/bin/env bash
set -Eeuo pipefail
root=/opt/rlc-bausoftware/.rlc-backups
[[ -d "$root" ]] || { echo "BLOCK backup_directory_missing"; exit 2; }
find "$root" -type d ! -perm 700 -exec chmod 700 {} +
find "$root" -type f ! -perm 600 -exec chmod 600 {} +
if find "$root" -type d -perm /077 -print -quit | grep -q . || find "$root" -type f -perm /077 -print -quit | grep -q .; then
 echo "BLOCK backup_permissions"; exit 2
fi
echo "PASS backup_permissions_restricted"
