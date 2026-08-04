from pathlib import Path

index = Path("apps/server/src/index.ts")
source = index.read_text(encoding="utf-8")
imp = 'import buchhaltungLiveRoutes from "./routes/buchhaltung.live";'
if imp not in source:
    anchor = 'import buchhaltungRoutes from "./routes/buchhaltung";'
    if anchor not in source: raise SystemExit("Import-Anker nicht gefunden. Keine Änderung ausgeführt.")
    source = source.replace(anchor, anchor + "\n" + imp, 1)
mount = 'app.use("/api/projects", buchhaltungLiveRoutes);'
if mount not in source:
    anchor = '/* Prima projectsRoutes, poi lvRoutes'
    if anchor not in source: raise SystemExit("Route-Anker nicht gefunden. Keine Änderung ausgeführt.")
    source = source.replace(anchor, mount + "\n\n" + anchor, 1)
index.write_text(source, encoding="utf-8")
print("OK: persistente Buchhaltungs-API aktiviert.")
