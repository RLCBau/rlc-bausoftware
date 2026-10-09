# DSGVO final verification checkpoint — 2026-10-09

## Remote backups
- Hetzner Storage Box SFTP listing: 6 backup directories.
- 2 dated 2026-07-31 are older than the configured **local** 14-day retention window.
- Those 2 contain filenames `postgresql.dump` and `rlc-system.tar.gz` without `.enc`. **Encryption not proven**; do not claim definitely plaintext without reading and validating their contents.
- No remote backup was deleted. Legal retention decision, independent backup certification and safe disposal are pending.

## MinIO object recovery
- Previously confirmed: encrypted archive integrity, successful extract, and isolated MinIO service health PASS.
- New 2026-10-09 test: isolated MinIO with recovered backup exposed only on host loopback; AWS S3 SDK `ListBuckets` failed XML deserialization: `Invalid character '#' in entity name`.
- **Per-object download and version listing not verified.** Isolated container and temporary files were removed.
- Production service remained healthy.

## Restore cutover controls
- `guarded-recovery-cutover.sh` and `restore-cutover-gate.sh` tested with missing reference, mismatched digest and matching digest.
- Search of current systemd service definitions and `/usr/local/sbin` did **not** find an installed recovery service invoking the guarded wrapper. It is therefore **not globally enforced**.
- External hash currently exists on the same host (`/var/lib/rlc-recovery`), not proven immutable/off-site.
- This ledger records synthetic test erasure events; it does **not** establish an exhaustive erasure tombstone store.

## Release status
**BLOCKED**. Do not activate automatic real-tenant erasure or claim end-to-end GDPR conformity. Requires S3 interoperability/root-cause correction, restore automation integration, off-site immutable erasure references, retention disposition review, and legal approvals.
