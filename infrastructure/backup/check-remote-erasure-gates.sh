#!/usr/bin/env bash
# Dynamic backup, storage and restoration audit; read-only, fail closed.
set -Eeuo pipefail
base="$(cd "$(dirname "$0")" && pwd)"
installed=/usr/local/sbin/rlc-backup
[[ -r "$installed" ]] || { echo "BLOCK backup_service_script_missing"; exit 2; }
grep -q 'openssl enc -aes-256-cbc' "$installed" && echo "PASS backup_encryption_configured" || { echo "BLOCK encryption_missing"; exit 2; }
grep -q 'umask 077' "$installed" && echo "PASS private_backup_umask" || { echo "BLOCK unsafe_backup_umask"; exit 2; }
bash "$base/classify-remote-backups.sh"
bash "$base/inventory-remote-backups.sh"
systemctl is-active --quiet rlc-remote-backup-retention.timer || { echo "BLOCK remote_retention_timer_inactive"; exit 2; }
echo "PASS remote_retention_timer_active"
systemctl is-active --quiet rlc-erasure-ledger-sync.path || { echo "BLOCK erasure_reference_watcher_inactive"; exit 2; }
echo "PASS erasure_reference_watcher_active"
source /etc/rlc-backup.env
[[ -r /var/lib/rlc-recovery/erasure-ledger.jsonl && -r /var/lib/rlc-recovery/erasure-ledger.sha256 ]] || { echo "BLOCK external_erasure_reference_missing"; exit 2; }
expected="$(tr -d '[:space:]' < /var/lib/rlc-recovery/erasure-ledger.sha256)"
actual="$(sha256sum /var/lib/rlc-recovery/erasure-ledger.jsonl | cut -d ' ' -f 1)"
[[ "$expected" == "$actual" ]] || { echo "BLOCK erasure_reference_corrupted"; exit 2; }
cmp /var/lib/rlc-recovery/erasure-ledger.jsonl /opt/rlc-bausoftware/apps/server/data/privacy-erasure-ledger.jsonl >/dev/null || { echo "BLOCK erasure_ledger_divergence"; exit 2; }
echo "PASS monotonic_erasure_reference"
docker inspect rlc-server --format '{{.State.Health.Status}}' | grep -q '^healthy$' || { echo "BLOCK application_unhealthy"; exit 2; }
docker exec rlc-server node -r ts-node/register/transpile-only src/scripts/checkRestoreGate.ts
docker exec -i rlc-server node - <<'NODE'
const {S3Client,ListObjectVersionsCommand}=require("@aws-sdk/client-s3");
const e=process.env;
if(e.RLC_ENFORCE_RESTORE_GATE!=="1") {console.error("BLOCK server_startup_gate_not_enabled");process.exit(2)}
const client=new S3Client({endpoint:e.S3_ENDPOINT,region:e.S3_REGION||"eu-central-1",forcePathStyle:true,credentials:{accessKeyId:e.S3_ACCESS_KEY,secretAccessKey:e.S3_SECRET_KEY}});
client.send(new ListObjectVersionsCommand({Bucket:e.S3_BUCKET,MaxKeys:1})).then(()=>console.log("PASS s3_object_versions_readable")).catch(()=>{console.error("BLOCK s3_object_version_listing_failed");process.exitCode=2});
NODE
export SSHPASS="$(cat "$STORAGEBOX_PASSWORD_FILE")"
offsite="$(printf 'ls -1 backups/rlc-erasure-ledger\n' | sshpass -e sftp -q -P 23 -oBatchMode=no -b - "$STORAGEBOX_USER@$STORAGEBOX_HOST" 2>/dev/null)" || { echo "BLOCK offsite_erasure_backup_unavailable"; exit 2; }
printf '%s\n' "$offsite" | grep -qE '^backups/rlc-erasure-ledger/[0-9]{8}T[0-9]{6}\.[0-9]+Z?-[a-f0-9]{64}\.enc$' || { echo "BLOCK encrypted_offsite_erasure_ledger_missing"; exit 2; }
echo "PASS encrypted_offsite_erasure_ledger_present"
echo "ALL_TECHNICAL_GATES_PASS"
