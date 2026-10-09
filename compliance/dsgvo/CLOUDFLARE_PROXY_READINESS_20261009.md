# Cloudflare Proxy Readiness – 09.10.2026

Audit without configuration changes.

## Verified
- Root, www, app, api: DNS only. Staging: Cloudflare proxy (account screenshots).
- Cloudflare Full (strict). Minimum TLS changed by account owner to TLS 1.2; independent dashboard API verification pending.
- Origin Nginx: TLS 1.2/1.3, valid certificates, HTTP→HTTPS redirect, WebSocket Upgrade, proxy read timeout 300s.
- Nginx API client_max_body_size: 128M.
- GAEB collection upload in apps/server/src/routes/projectLv.ts: 120 MiB.
- Direct file upload in apps/server/src/routes/files.ts: 100 MiB.
- Cloudflare Free per-request maximum: 100 MB decimal, including request overhead. Files near that threshold may fail.

## Decision
Keep api.rlcbausoftware.com DNS only. No proxy changes in production. A proxied API would reject some otherwise accepted uploads with HTTP 413.

## Before enabling proxy
1. Implement chunked/resumable upload with validated reassembly, or a separately secured DNS-only upload endpoint.
2. Test real workflows with synthetic 99 MB, 101 MB and 120 MiB multipart files; WebSocket reconnect, CORS, cookies and auth.
3. Test WAF and cache rules: never cache authenticated/API/DSAR responses.
4. Review trusted proxy handling for client IP and rate limiting.
5. Prepare DNS rollback. Do not lock the origin firewall to Cloudflare addresses while DNS-only services remain.
6. Review HSTS carefully; not enabled in this audit.

Sources:
https://developers.cloudflare.com/cache/concepts/default-cache-behavior/
https://developers.cloudflare.com/network/websockets/
