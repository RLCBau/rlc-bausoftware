# RLC Mobile – Release Checklist Deutschland

Stand: 16.10.2026

## Code / Security
- [x] TestFlight/Laptop source identified as reference.
- [x] Ubuntu mobile tree aligned to reference baseline.
- [x] GitHub sync branch created.
- [x] TypeScript build passes.
- [x] Production API uses HTTPS.
- [x] Private server pairing enforces HTTPS outside development.
- [x] SecureStore used for auth token.
- [x] Local password verifier hardened and migrated.
- [x] RECORD_AUDIO removed from generated Android permissions.
- [x] High-volume PDF/Rechnung debug logging gated to __DEV__.
- [ ] Review remaining low-volume production console logs (19 files).
- [ ] Resolve/accept documented remaining dependency advisories (npm audit: 40 = 15 moderate, 25 high).
- [ ] Replace SheetJS xlsx before introducing untrusted XLSX parsing.

## Datenschutz / Arbeitsrecht
- [x] Datenschutz/Impressum accessible before login.
- [x] Camera/location purpose strings present.
- [x] No background location found.
- [ ] Customer-facing GPS/employee-data deployment note included in contract/onboarding.
- [ ] BDSG §26 necessity assessment per customer use case.
- [ ] Betriebsrat approval/works agreement where applicable.
- [x] VVT technical working draft created for RLC Mobile.
- [x] TOM technical working draft created for RLC Mobile.
- [ ] AVV/subprocessor list checked.
- [ ] Retention/deletion concept approved.
- [x] Mobile ACCESS/ERASURE request path wired to server self-service.
- [ ] Authenticated end-to-end data subject request/deletion procedure tested and organisationally approved.

## Accounting
- [ ] Confirm mobile invoice actions always hand final fiscal issuance to the compliant server pipeline where E-Rechnung is required.
- [ ] Preserve structured E-Rechnung original and audit trail.
- [ ] Confirm GoBD retention/WORM responsibilities on server/storage.

## Store
- [ ] Apple App Privacy labels completed using APP_STORE_PRIVACY_MATRIX_DE.md.
- [ ] Google Play Data Safety completed.
- [ ] Privacy Policy URL entered in both stores.
- [ ] Account deletion path tested if store account-deletion rules apply.
- [ ] Production EAS build performed from audited commit.
- [ ] Physical-device OCR test for @react-native-ml-kit/text-recognition / New Architecture warning.
- [ ] Smoke test on physical iOS and Android device.
