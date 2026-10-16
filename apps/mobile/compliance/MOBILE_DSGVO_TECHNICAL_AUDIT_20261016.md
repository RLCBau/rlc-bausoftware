# RLC Mobile – DSGVO / Deutschland Technical Audit

Stand: 16.10.2026

## Scope
RLC Mobile (Expo/React Native), 82 TS/TSX files, 53,155 lines. Source of truth: laptop/TestFlight copy. Target: Android/iOS, NUR_APP and SERVER_SYNC.

## Legal baseline
- DSGVO Art. 5, 6, 13, 25, 28, 30, 32.
- BDSG §26 for employee data.
- TDDDG §25 for storage/access on terminal devices.
- DDG §5 for provider information.
- BetrVG §87(1) Nr. 2, 6 and 7 where a works council exists.
- BAG 1 ABR 22/21: employers require a system recording beginning/end of daily working time.
- GoBD / HGB / AO and German e-invoice rules where accounting documents are involved.

Official references:
- https://eur-lex.europa.eu/eli/reg/2016/679/oj
- https://www.gesetze-im-internet.de/bdsg_2018/__26.html
- https://www.gesetze-im-internet.de/ddg/__5.html
- https://www.gesetze-im-internet.de/tdddg/__25.html
- https://www.gesetze-im-internet.de/betrvg/__87.html
- https://www.bundesarbeitsgericht.de/entscheidung/1-abr-22-21/

## Technical findings

### PASS / hardened
- Production API default is HTTPS: https://api.rlcbausoftware.com.
- Private server profiles require HTTPS outside localhost/development.
- Changing server identity clears the SERVER_SYNC session token.
- Auth tokens are stored in Expo SecureStore when available; plaintext AsyncStorage copies are removed after successful migration.
- Local password verifier moved from legacy weak/unsalted client hashes in AsyncStorage to a salted verifier in SecureStore; legacy accounts migrate on login.
- Removed the hard-coded offline test admin code and the former NUR_APP path that accepted any non-empty admin code; offline admin code is now verified in SecureStore.
- Legal/privacy access is available before login from StartScreen.
- Authenticated GDPR self-service for ACCESS and ERASURE is integrated with /api/privacy-rights/self-service; server-side retention assessment prevents automatic destruction of retained fiscal/construction records.
- Camera and location permissions now contain purpose-specific German text.
- Camera audio permission disabled; the app does not need microphone access.
- No background location API was found.
- Location is requested only when a user creates a time event.
- Navigation audit: no undeclared route references.
- Live API health check: HTTP 200 on 16.10.2026.
- No production arbitrary API URL override; unrestricted override remains development-only.

### Release conditions / open risks
1. GPS employee time tracking
   - Precise location is stored with START/PAUSE/END events.
   - Customer/employer must document necessity and legal basis under BDSG §26.
   - Where applicable, Betriebsrat co-determination must be completed before deployment.
   - Do not use employee consent as the default legal basis where dependency makes consent non-voluntary.
   - A company-level policy/feature flag for GPS should be considered for customers who only need time recording.

2. Dependency risk
   - npm audit after safe non-breaking fixes reports 40 findings (15 moderate, 25 high).
   - Do not run npm audit fix --force blindly because the proposed resolution includes breaking Expo/React-Native downgrades/upgrades.
   - The xlsx package reports known high vulnerabilities with no npm fix. Current mobile use writes XLSX exports; it does not parse untrusted XLSX via SheetJS in the audited source. Replace package before future untrusted XLSX parsing.
   - Expo Doctor passes 17/18 checks; the remaining metadata warning is @react-native-ml-kit/text-recognition being untested on React Native New Architecture. Physical-device OCR testing is mandatory before release.

3. Logging
   - High-volume/sensitive PDF and Rechnung debug logs are now gated behind __DEV__.
   - Lower-volume console logging remains in 19 files and must not be used to emit credentials, full documents or personal data in production.

4. E-Rechnung / accounting
   - Mobile PDF export alone is not a substitute for a structured E-Rechnung where German law requires one.
   - Final invoice workflow must continue through server/web XRechnung/ZUGFeRD-capable pipeline and preserve the structured original.
   - Mobile must not present a local PDF as the sole fiscal original for transactions requiring structured E-Rechnung.

5. Organisational evidence
   - AVV, VVT, TOM documentation, retention/deletion concept, incident process and subprocessor list remain organisational deliverables.
   - Technical implementation alone cannot prove organisational DSGVO compliance.

## Release verdict
Technical status: CONDITIONAL PASS.
Store release is technically viable after completing the listed release conditions and store privacy declarations. This document is a technical compliance audit, not a substitute for individual legal advice.
