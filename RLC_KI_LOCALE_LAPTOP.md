# RLC KI locale sul laptop

La copia laptop e una seconda istanza separata da Hetzner:

- usa Construction Intelligence V2 del progetto locale;
- usa Ollama `qwen3.5:2b-q4_K_M` senza costi API;
- forza `RLC_AI_MODE=LOCAL` e svuota `OPENAI_API_KEY` nel container locale;
- non modifica il server Hetzner;
- non sincronizza automaticamente dati in entrambe le direzioni.

## Requisiti

- Windows 10/11;
- Docker Desktop con Docker Compose v2;
- almeno 8 GB RAM; il modello Ollama quantizzato occupa circa 1,9 GB su disco;
- repository completo in `C:\RLC\rlc-app`.

## Installazione

Dalla radice del progetto:

```powershell
Set-Location C:\RLC\rlc-app
powershell -ExecutionPolicy Bypass -File .\scripts\laptop-ai.ps1 -Action install
```

Lo script avvia lo stack locale tramite `docker-compose.yml`, aggiunge Ollama
con gli overlay Enterprise/Laptop e conclude con il test `RLC KI OK`.

Comandi successivi:

```powershell
.\scripts\laptop-ai.ps1 -Action status
.\scripts\laptop-ai.ps1 -Action test
.\scripts\laptop-ai.ps1 -Action stop
.\scripts\laptop-ai.ps1 -Action start
```

`stop` non elimina database, progetti o volumi.

## Dati e backup

All'inizio il laptop usa il proprio database e i propri file locali. Per avere
anche la conoscenza e i progetti di produzione, occorre ripristinare sul laptop
una copia consistente del backup PostgreSQL e dell'archivio RLC creati su
Hetzner. Il ripristino deve essere unidirezionale **Hetzner → laptop**; non va
attivata una replica bidirezionale, per evitare conflitti e corruzione dei dati.

Il ripristino dei dati viene eseguito soltanto dopo il test della KI locale e
dopo aver verificato i nomi reali dei servizi nel `docker-compose.yml`.

## Mobile

`http://127.0.0.1:4000` vale solo sul laptop. Un iPhone non puo usare questo
indirizzo per raggiungere il PC. Se in seguito si vuole collegare anche il
Mobile alla copia locale, il laptop deve avere un indirizzo HTTPS raggiungibile
e il relativo QR firmato. Non viene aperta automaticamente alcuna porta LAN.
