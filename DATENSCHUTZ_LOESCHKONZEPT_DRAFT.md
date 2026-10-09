# RLC Datenschutz — Löschkonzept (technical implementation checkpoint)

Status: **draft / requires legal and operational approval**. No automatic deletion of real tenants is authorized by this document.

## Scope and decision process
1. Identify the controller (Bauunternehmen vs. RLC), subject and legal basis. Verify identity and tenant.
2. Locate records in Prisma, company/project directories, MinIO and any external processors. Include JSON fields, images, worker records and exports.
3. Classify each record separately: erase, anonymize, restrict/retain, or request further review. Do not derive deadlines simply from file creation dates.
4. Verify legal holds, contract disputes, HGB/AO/GoBD requirements and employment rules where applicable.
5. Require recorded approval and evidence for each action. Never automatically delete fiscal records, construction proofs or audit trails just because a user account is removed.
6. Prevent restoration of deleted personal information from older backups: maintain an erasure ledger and replay valid deletion decisions after restore before reopening access.
7. Track backups and object versions until their approved expiry. Verification must cover database, files, object storage and snapshots; a DB row deletion alone is not sufficient.
8. Review relevant AVV, TOMs, VVT, privacy notice, subprocessors and required communications to data subjects.

## Implemented controls
- Self-service ACCESS / ERASURE requests and status tracking.
- Company-bound identity checks and admin RBAC.
- Conservative assessment endpoint listing linked database records and storage review flags.
- Test-only erasure endpoint restricted to synthetic company codes and example.invalid accounts.
- Completed-request evidence locking and explicit retention documentation.

## Not completed
- Full scanning of personally identifiable data in unstructured files, MinIO version history, structured JSON, exports and media.
- Defined and signed-off retention periods for each record family.
- Real tenant executable erasure/anonymization with rollback-safe orchestration and audit.
- Backup inventory, expiration tests, encrypted snapshot management and restore-replay verification.
- Processor deletion confirmations and end-to-end mobile-device erasure testing.

## Release gate
DO NOT enable real-tenant automated erasure until all above items have verified evidence and authorized sign-off. Run synthetic two-company and retained-document tests after any future change.
