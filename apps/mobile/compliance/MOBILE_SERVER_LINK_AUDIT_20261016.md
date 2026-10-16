# RLC Mobile – Server Link Audit

Stand: 16.10.2026

## Live production checks
Base URL: https://api.rlcbausoftware.com

| Mobile function | Route | Live unauthenticated result | Interpretation |
|---|---|---:|---|
| Health | /api/health | 200 | API reachable |
| Server identity | /api/enterprise/identity | 200 | pairing identity reachable |
| Regie Inbox | /api/regie/inbox/read | 401 | route exists and is protected |
| Foto upload | /api/fotos/inbox/upload | 401 | route exists and is protected |
| Arbeitszeiten submit | /api/inbox/BA-TEST/ARBEITSZEIT/submit | 401 | generic inbox route exists and is protected |
| DSGVO self service | /api/privacy-rights/self-service | 401 | route exists and is protected |

## Static server verification
- /api/enterprise -> enterprise router; /identity and /pairing/verify exist.
- /api/fotos -> authenticated/company/subscription protected; /inbox/upload exists.
- /api/regie -> authenticated/company/subscription/server-license protected; /inbox/read exists.
- /api/inbox -> authenticated/company/subscription/server-license protected; /:projectKey/:type/submit exists and includes ARBEITSZEIT.
- /api/privacy-rights -> authenticated/company protected; /self-service supports ACCESS, ERASURE, RECTIFICATION, PORTABILITY, RESTRICTION, OBJECTION.

## Mobile hardening applied
- Server auth token consumers migrated to getServerToken() / SecureStore path.
- Switching verified server identity logs out SERVER_SYNC token.
- Non-development private server URLs require HTTPS.
- DSGVO ACCESS and ERASURE requests are now initiated from the in-app legal screen.
- Fiscal/accounting erasure is not automatic; server records the request and requires retention assessment.

## Remaining end-to-end tests
- Authenticated upload/read/approve/reject with both synthetic test companies.
- Offline queue -> reconnect -> submit -> Inbox -> approval -> final document.
- Authenticated DSGVO request creation and administrative completion.
- Private server QR pairing against a second isolated server profile.
