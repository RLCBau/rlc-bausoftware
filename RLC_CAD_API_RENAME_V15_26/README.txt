RLC CAD API Rename V15.26

Migrazione reale:
- /api/bricscad/* -> /api/cad/*
- routes/bricscad.ts -> routes/cad-import.ts
- services/bricscad.service.ts -> services/cad-import.service.ts
- data/projects/<id>/bricscad -> data/projects/<id>/cad
- CADViewer aggiornato
- build server + web
- docker compose rebuild server
- rollback automatico in caso di errore

Installazione Ubuntu:
chmod +x INSTALL_UBUNTU.sh
sudo ./INSTALL_UBUNTU.sh /opt/rlc-bausoftware
