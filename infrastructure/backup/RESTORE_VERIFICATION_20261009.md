# RLC Datenschutz – Isolated restore verification (2026-10-09)

All checks were performed on Ubuntu against an encrypted Hetzner Storage Box backup dated **2026-10-08**, without replacing production PostgreSQL or MinIO data.

## PostgreSQL
- Ciphertext SHA-256 manifest verification: PASS.
- Decryption with configured AES-256-CBC/PBKDF2: PASS.
- Full `pg_restore` into a network-isolated temporary PostgreSQL 16 container: PASS.
- Tables recovered: 92; restored database size: approximately 149 MB.
- Temporary container and archive: removed.

## MinIO backup
- Ciphertext SHA-256 manifest verification: PASS.
- AES-256-CBC/PBKDF2 decryption: PASS.
- `tar` listing: 379 entries.
- Extraction into temporary directory: PASS; 177 files, 202 directories, approximately 175 MB.
- `.minio.sys` metadata directory present.
- Temporary directory and archive: removed.
- **Not tested:** serving recovered objects through a temporary MinIO instance, per-object version integrity and bucket policy behavior.

## Remaining release blockers
1. Two legacy Storage Box backups dated 2026-07-31 contain files named `postgresql.dump` and `rlc-system.tar.gz` without encryption extensions. Treat them as **potentially unencrypted** until independently confirmed and handled.
2. Storage Box remote retention: two backups older than 14 days. No remote deletion performed.
3. S3 object version listing: not yet verified.
4. Erasure ledger and mandatory post-restore replay are not implemented. **Never expose restored data until deletion decisions have been re-applied and audited.**
5. End-to-end MinIO object retrieval restore and legal retention approval outstanding.

The existence of these backup tests is not evidence of overall DSGVO compliance.
