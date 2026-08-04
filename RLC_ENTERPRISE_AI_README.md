# RLC Enterprise AI

This package adds a private-server runtime shared by RLC Web and RLC Mobile.

## Operating modes

| Mode | Primary | Fallback | Data path |
| --- | --- | --- | --- |
| `HYBRID` | Existing OpenAI model from `apps/server/.env` | Local Ollama | Mobile/Web → RLC Server → selected provider |
| `LOCAL` | Local Ollama | none | Data remains on the private server |
| `OPENAI` | Existing OpenAI model from `apps/server/.env` | none | Mobile/Web → RLC Server → OpenAI |

Construction Intelligence V2 remains authoritative for prices, calculations,
Urkalkulation and guardrails in every mode. The language model does not replace
those controls.

## Local Windows laptop copy

`scripts/laptop-ai.ps1` creates a second, isolated `LOCAL` instance by combining
the base Compose file with the Enterprise and Laptop overlays. The laptop
container has no OpenAI key and therefore cannot generate API usage. Production
data is copied later from a consistent Hetzner backup; live two-way database
replication is intentionally not enabled. See `RLC_KI_LOCALE_LAPTOP.md`.

## Install on Ubuntu / Hetzner

From the repository root:

```bash
sudo bash scripts/install-enterprise-ai.sh \
  --api-url https://rlc.customer-domain.de \
  --server-name "RLC Kundenserver" \
  --company-code "KUNDE"
```

The script creates `.env.enterprise` with private file permissions, generates a
server ID and pairing secret, starts Ollama only on the internal Docker network,
downloads the local model and rebuilds the RLC server.

The existing OpenAI key remains in `apps/server/.env`. Never copy real keys into
`.env.enterprise.example` or commit `.env.enterprise`.
The same file remains the only source for `OPENAI_MODEL`; installing this
overlay does not upgrade the model or alter API pricing.

## Generate a Mobile pairing QR

```bash
sudo bash scripts/create-enterprise-pairing.sh
```

The QR expires after 10 minutes. In RLC Mobile select `Server verbinden`, then
`Privater Kundenserver`, and scan it. Mobile verifies the signed token against
that server before saving the address.

## Verify runtime

```bash
docker compose --env-file .env.enterprise \
  -f docker-compose.yml -f docker-compose.enterprise.yml \
  exec -T server npm run ai:smoke
```

To test the real fallback, temporarily select `RLC_AI_MODE=LOCAL` in
`.env.enterprise`, recreate the server container and run the smoke test. Return
to `HYBRID` after the test.

## Security boundaries

- Use HTTPS with a valid certificate for every customer server.
- Never publish Ollama port `11434`.
- A login token is removed when Mobile switches to a different verified server.
- The server generates signed, expiring pairing QR codes.
- Vision/OCR routes remain separate: `LOCAL` mode refuses unsupported
  multimodal requests instead of silently sending them elsewhere.
