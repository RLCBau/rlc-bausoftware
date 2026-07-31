RLC CAD Server Multi Drawing V1

Adds:
- GET  /api/cad/drawings
- GET  /api/cad/list
- GET  /api/cad/files
- GET  /api/cad/load?projectId=...&drawingId=...
- GET  /api/cad/drawings/:drawingId?projectId=...
- POST /api/cad/save
- POST /api/cad/save-as

Storage:
data/projects/<projectId>/cad/drawings/index.json
data/projects/<projectId>/cad/drawings/<drawingId>.json

The existing cad.json is migrated automatically as the first drawing.
cad.json remains as a compatibility copy of the active drawing.
