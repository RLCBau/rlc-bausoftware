# MinIO encrypted backup isolated boot test — 2026-10-09

- Input: encrypted MinIO backup from Hetzner Storage Box, dated 2026-10-08.
- Decryption: AES-256-CBC with configured PBKDF2 parameters.
- Extracted into restricted temporary host directory.
- Started locally installed MinIO image with bind-mounted extracted backup in a disposable container, Docker `--network none`, no production volumes.
- Health probe from inside isolated container: `/minio/health/live` returned success.
- Files in extracted storage in final test: 151 (includes metadata).
- Cleanup: temporary container and extracted archive removed.
- Production `rlc-server` remained healthy.

**Limitation:** HTTP health proves MinIO started on recovered storage, but per-bucket listing, historical object-version retrieval and checksum verification via S3 have not yet been completed. Do not equate this test with a fully validated object recovery or DSGVO compliance.

**Restore guard:** `infrastructure/backup/guarded-recovery-cutover.sh` reads an external ledger reference and blocks cutover on mismatch. Reference currently resides on same host, not in independent immutable storage; full recovery automation is still unverified.
