#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${STORAGEBOX_HOST:?Missing STORAGEBOX_HOST}"
: "${STORAGEBOX_USER:?Missing STORAGEBOX_USER}"
: "${STORAGEBOX_PASSWORD_FILE:?Missing STORAGEBOX_PASSWORD_FILE}"

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/rlc}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$BACKUP_ROOT/$STAMP"
REMOTE_DIR="backups/rlc/$STAMP"
mkdir -p "$WORK"

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

# Consistent PostgreSQL logical backup from the running Docker container.
docker exec rlc-postgres pg_dump -U user -d rlc -Fc > "$WORK/postgresql.dump"

# Configuration/code backup; secrets remain protected by file permissions.
tar -C /opt -czf "$WORK/rlc-config.tar.gz" \
  --exclude='rlc-bausoftware/apps/server/node_modules' \
  --exclude='rlc-bausoftware/apps/server/dist' \
  --exclude='rlc-bausoftware/data/projects' \
  rlc-bausoftware/docker-compose.yml \
  rlc-bausoftware/apps/server/.env \
  rlc-bausoftware/apps/server/prisma

sha256sum "$WORK"/* > "$WORK/SHA256SUMS"

PASS="$(cat "$STORAGEBOX_PASSWORD_FILE")"
export SSHPASS="$PASS"
sshpass -e ssh -p 23 -o StrictHostKeyChecking=accept-new \
  "$STORAGEBOX_USER@$STORAGEBOX_HOST" "mkdir -p '$REMOTE_DIR'"
sshpass -e scp -P 23 -o StrictHostKeyChecking=accept-new \
  "$WORK"/* "$STORAGEBOX_USER@$STORAGEBOX_HOST:$REMOTE_DIR/"

# Local cleanup only. Remote retention is managed separately/snapshots.
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENTION_DAYS" -exec rm -rf {} +
logger -t rlc-backup "RLC backup uploaded: $REMOTE_DIR"
