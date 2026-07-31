RLC CAD V1 - Real Engine Foundation

Implementato:
- Import DXF reale in geometria RLC interna.
- LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, POINT, TEXT e MTEXT.
- Layer, coordinate, lunghezze e superfici.
- Generazione automatica di:
  data/projects/<projectId>/bricscad/takeoff.json
- Correzione frontend: prima upload, poi import; non si ferma più dopo il solo upload.
- Caricamento immediato delle geometrie importate nel CAD.
- Cache locale solo come fallback visivo; file autorevole sul server.

Installazione Ubuntu:
  unzip RLC_CAD_V1_REAL_ENGINE.zip
  cd RLC_CAD_V1_REAL_ENGINE
  sudo ./INSTALL_RLC_CAD_V1.sh /opt/rlc-bausoftware

Poi ricostruire/riavviare server e web secondo la configurazione esistente.

Limite dichiarato:
- DWG richiede ancora un convertitore server-side DWG->DXF. Nessuna dipendenza operativa da BricsCAD è stata aggiunta.
