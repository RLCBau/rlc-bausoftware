# RLC Bausoftware — DSGVO / BDSG / procedure compliance gap audit
Date: 2026-10-09. Scope: code and available documentation, Ubuntu server. Status: OPEN, NOT a legal certification.

## Roles and data flows
RLC is normally a processor (Art. 28) for personal data stored by client construction companies, but controller for its own customer relationships, billing, support, marketing, website analytics and personnel. Actual role must be documented per processing purpose. Joint controller status must be evaluated where purposes are jointly determined.

## Matrix (proof required to close each item)
| Obligation | Evidence reviewed | Status | Closure requirement |
|---|---|---|---|
| Art. 5/6 principles and lawful basis | Code-level privacy request workflow | OPEN | Purpose-by-purpose lawful basis; data minimisation, mapping of personal data, retention and access |
| Arts. 12–22 data subject rights | apps/server/src/routes/privacyCompliance.ts; synthetic tests | PARTIAL | End-to-end responses, deadlines, identity verification, correction/portability/restriction/objection, exports and independent recipients; documented exception handling |
| Arts. 13/14 transparency | Site text previously updated, legal approval not evidenced | OPEN | Final reviewed notice: controller identity, purposes, lawful basis, receivers, transfers, retention, rights and contacts |
| Arts. 24/25 accountability and privacy by design | Tenant RBAC and application hardening tests | PARTIAL | Risk register, design review, defaults, periodic permission tests and evidence |
| Art. 28 AVV + subprocessors | No signed master AVV or current subprocessor approval register in inspected files | OPEN | Signed AVV, instructions, subprocessor list, change notification, audits and return/deletion clauses |
| Art. 30 VVT | No approved VVT identified in inspected files | OPEN | Controller/processor processing inventories with owners, recipients, safeguards, retention and transfer destinations |
| Art. 32 TOM | Backup encryption, restore tests, authentication and tenant isolation evidence | PARTIAL | Signed TOM matrix, penetration test scope, incident response, recovery tests and third-party audits |
| Arts. 33/34 data breaches | No signed incident response plan identified | OPEN | Incident runbook; controller notification without undue delay; authority notification when required, generally within 72 h of awareness, affected persons at high risk |
| Art. 35 DPIA/DSFA | No documented screening for AI, GPS, employee monitoring or profiling | OPEN | Per-feature DPIA threshold screening and full assessment if high risk; consult supervisory authority if required |
| Arts. 37–39 DPO | Organisation staffing and processing risks not established | OPEN | Document DPO assessment including BDSG §38 threshold and Art. 37 cases; publish details where mandatory |
| Arts. 44–49 international transfers | S3 provider / possible KI external processing | OPEN | Destination review, SCCs/adequacy where applicable, transfer impact assessments if needed |
| Storage limitation / erasure | Draft DATENSCHUTZ_LOESCHKONZEPT_DRAFT.md; ledger and startup gate | PARTIAL | Approved deletion matrix; tenant file/MinIO version scan, mobile offline copies, processor confirmations; demonstrated safe real-tenant workflow |
| Commercial website | No complete cookie/consent tracking inventory evidenced | OPEN | ePrivacy/TDDDG consent review for non-essential tracking, compliant notice and preference records |
| Employment/field operations | GPS, photos, Arbeitszeit and employee records are part of product | OPEN | BDSG §26 where applicable, employment lawful basis and access; employee monitoring proportionality and works council rights where applicable |
| Legal retention HGB/AO/GoBD | Draft explicitly requires review | OPEN | Expert-approved category-specific tax, accounting and building-document retention, legal holds and disposal decisions |

## Operational procedures to approve and train
1. Intake of GDPR requests: ticket, identity, controller vs processor, statutory deadline, exception and response proof.
2. Breach response: triage, contain, preserve evidence, assess rights risk, notify controller immediately, authority within 72 hours if applicable, notify affected persons when required, postmortem.
3. Processing register maintenance and privacy-impact screening on each release touching data, AI, GPS, photography or employee records.
4. AVV/Subprocessor procurement: signed terms prior to processing; EU/third-country destinations, transfer safeguards, security and annual reassessment.
5. Deletion/retention: legal hold check, all data stores incl. old versions and clients, approval, execution and attestation; prevent resurrection after restore.
6. Backup restoration: restore to isolated environment; cryptographic checks; mandatory erasure ledger reconciliation before API starts; audit cutover.
7. Security: access review, least privilege, incident exercises, supplier assessment, key rotation, vulnerability and patch management; evidence retained.

## Decisions and information required from accountable organisation
- Legal name/address of RLC controller, privacy contact, DPO if designated.
- RLC employees regularly processing personal data, business activities and potential high-risk processing.
- Customer AVV, agreements and signed vendor subprocessors (Hetzner, Cloudflare, OpenAI if relevant, WordPress providers, SMTP, analytics).
- Hosting locations, subprocessor international transfers, website cookie inventories, support access and logs.
- Final approved retention/legal hold matrix for each type of Bau, HR and fiscal record.
- Responsible persons, incident contacts, approved procedures, training records, signed change-management evidence.

## Release judgement
The inspected implementation supports some technical measures, but **does not establish complete conformity**. Prior to pilot onboarding with real customer/employee personal data, execute evidence collection and independent professional review. Do not automatically delete real tenant records solely on the basis of this report.

Official guidance:
https://www.edpb.europa.eu/sme/learn-the-basics/data-controller-or-data-processor_en
https://www.gesetze-im-internet.de/bdsg_2018/__38.html
https://www.lda.bayern.de/de/muster.html
https://datenschutz.sachsen-anhalt.de/informationen/datenschutz-grundverordnung/checkliste-tom
