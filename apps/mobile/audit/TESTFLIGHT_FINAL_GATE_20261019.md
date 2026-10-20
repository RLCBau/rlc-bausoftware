# RLC Mobile — TestFlight Release Gate — 19.10.2026

## Verified (PASS)
- Mobile automated tests: 22/22.
- Mobile/backend integration and PostgreSQL test scripts: 11/11 (test harnesses, including mocks).
- Expo Doctor: 18/18.
- Mobile and backend TypeScript: 0 compiler errors.
- Static navigation: 39 registered screens/routes, 137 literal navigate/replace/push targets, 0 missing static route names.
- Public API health: HTTP 200, PostgreSQL workflow release gate PASS.
- Privacy and Impressum URLs published and reachable.

## Not verified — Release blockers for a definitive acceptance
- Full end-to-end Mobile -> authenticated public API -> PostgreSQL/DMS -> Web -> Mobile for every screen/action, including Regie, LS, photos, Tagesbericht, admin and offline re-sync.
- Real iPhone TestFlight installation, iOS permissions, camera/photo/GPS, airplane mode, crashes, PDF sharing and device upgrade.
- Real DMS archiving (workflow suite substitutes a DMS stub).
- Account erasure: in-app GDPR ERASURE request exists; Apple account-deletion compliance requires functional/contractual verification if account creation is supported.
- GDPR/AVV legal signoff: see compliance/dsgvo/AVV_FREIGABE_UND_NACHWEISPRUEFUNG_20261016.md; provider AVV, TOM/VVT, AI, transfers, DSFA determination and deletion policy remain unapproved.
- App Store Connect privacy labels, TestFlight reviewer account, cryptography/export answers and signing build upload not verified.

## Decision
INTERNAL AUTOMATED QA PASS. FINAL PRODUCT AND LEGAL ACCEPTANCE NOT YET CERTIFIED.
Eligible to *prepare* a TestFlight internal beta build, subject to Apple signing/build and outstanding high-risk checks; not eligible to claim 100% operational/legal conformity.
