# Installazione RLC Enterprise AI

Questo pacchetto aggiorna il server RLC e il Mobile con:

- il modello OpenAI economico già presente in `apps/server/.env`, senza
  sostituirlo e senza aumento automatico dei costi API;
- Ollama `qwen3.5:2b-q4_K_M` come fallback locale automatico ottimizzato per
  RAM limitata;
- modalità `HYBRID`, `LOCAL` e `OPENAI`;
- collegamento Mobile a un server privato tramite QR firmato e temporaneo;
- indirizzo server dinamico per login, API, download, PDF e importazione LV;
- Construction Intelligence V2 invariata come autorità per prezzi e guardrail.

## 1. Copia dei sorgenti

Estrarre il contenuto dello ZIP nella radice del progetto:

```text
C:\RLC\rlc-app
```

Il pacchetto non contiene e non sostituisce alcun `.env` reale.

## 2. Controllo sul laptop

```powershell
Set-Location C:\RLC\rlc-app\apps\server
npm install
npm run build

Set-Location C:\RLC\rlc-app\apps\mobile
npm install
npx tsc --noEmit
npx expo config --type public
```

## 2A. Copia RLC KI locale sul laptop (opzionale)

La copia locale e indipendente da Hetzner e non chiama OpenAI:

```powershell
Set-Location C:\RLC\rlc-app
powershell -ExecutionPolicy Bypass -File .\scripts\laptop-ai.ps1 -Action install
```

I dettagli su dati, backup e collegamento Mobile sono in
`RLC_KI_LOCALE_LAPTOP.md`.

## 3. Installazione sul server Ubuntu/Hetzner

Dopo aver trasferito o pubblicato i sorgenti aggiornati:

```bash
cd /opt/rlc-bausoftware

sudo bash scripts/install-enterprise-ai.sh \
  --api-url https://api.rlcbausoftware.com \
  --server-name "RLC Hetzner" \
  --company-code "RLC"
```

Lo script:

1. crea `.env.enterprise` con permessi privati;
2. genera ID server e segreto di pairing;
3. avvia Ollama solo nella rete Docker interna;
4. scarica il modello locale;
5. ricompila il server;
6. esegue il test RLC KI.

La chiave OpenAI resta esclusivamente in `apps/server/.env`.
Anche `OPENAI_MODEL` resta esclusivamente in quel file. Se la variabile non è
presente, il fallback compatibile del codice è `gpt-4o-mini`.

## 4. QR per il Mobile

```bash
cd /opt/rlc-bausoftware
sudo bash scripts/create-enterprise-pairing.sh
```

Viene creato `rlc-server-pairing.svg`, valido per 10 minuti. Nel Mobile aprire
`Server verbinden` → `Privater Kundenserver` e scansionarlo.

## 5. Nuova build Mobile

La schermata QR richiede una nuova build TestFlight/App Store:

```powershell
Set-Location C:\RLC\rlc-app\apps\mobile
npx eas-cli build --platform ios --profile production --clear-cache
```

Dopo la build:

```powershell
npx eas-cli submit --platform ios --latest
```

## Nota di sicurezza preesistente

Il `docker-compose.yml` di base recuperato contiene ancora credenziali DB/MinIO
inline. Questa patch non le modifica automaticamente, perché una rotazione non
coordinata fermerebbe il server esistente. Prima di distribuire l'intero stack a
clienti esterni, tali credenziali devono essere ruotate e spostate in un archivio
segreti o in file ambiente protetti.
