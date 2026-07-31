#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(sys.argv[1]).resolve()
SERVER = ROOT / "apps/server/src"
WEB = ROOT / "apps/web/src"

route_old = SERVER / "routes/bricscad.ts"
route_new = SERVER / "routes/cad-import.ts"
service_old = SERVER / "services/bricscad.service.ts"
service_new = SERVER / "services/cad-import.service.ts"

if not route_old.exists() and not route_new.exists():
    raise SystemExit(f"Route CAD non trovata: {route_old}")
if not service_old.exists() and not service_new.exists():
    raise SystemExit(f"Service CAD non trovato: {service_old}")

if route_old.exists():
    shutil.move(str(route_old), str(route_new))
if service_old.exists():
    shutil.move(str(service_old), str(service_new))

# Precise renames first, then terminology cleanup only in active source files.
replacements = [
    ("/api/bricscad/", "/api/cad/"),
    ("/api/bricscad", "/api/cad"),
    ("./routes/bricscad", "./routes/cad-import"),
    ("../routes/bricscad", "../routes/cad-import"),
    ("routes/bricscad", "routes/cad-import"),
    ("./services/bricscad.service", "./services/cad-import.service"),
    ("../services/bricscad.service", "../services/cad-import.service"),
    ("services/bricscad.service", "services/cad-import.service"),
    ("bricscadRoutes", "cadImportRoutes"),
    ("bricscadRouter", "cadImportRouter"),
    ("BricscadPaths", "CadImportPaths"),
    ("getBricscadPaths", "getCadImportPaths"),
    ("bricscadDir", "cadDir"),
]

source_files = []
for root in (SERVER, WEB):
    if not root.exists():
        continue
    for p in root.rglob('*'):
        if p.is_file() and p.suffix.lower() in {'.ts', '.tsx', '.js', '.jsx'}:
            source_files.append(p)

for path in source_files:
    raw = path.read_text(encoding='utf-8')
    updated = raw
    for old, new in replacements:
        updated = updated.replace(old, new)

    # Rename mounted route literals and project data directory literals.
    updated = re.sub(r'(["\'])/bricscad([/"\'])', r'\1/cad\2', updated)
    if path in {route_new, service_new}:
        updated = updated.replace('BricsCAD', 'RLC CAD')
        updated = updated.replace('Bricscad', 'CadImport')
        updated = re.sub(r'(["\'])bricscad(["\'])', r'\1cad\2', updated)
        updated = updated.replace('bricscad/', 'cad/')
        updated = updated.replace('/bricscad/', '/cad/')
        updated = updated.replace('BricsCAD öffnen', 'RLC CAD öffnen')

    if updated != raw:
        path.write_text(updated, encoding='utf-8')

# Final hard checks.
remaining = []
for path in source_files:
    if not path.exists():
        continue
    raw = path.read_text(encoding='utf-8')
    if '/api/bricscad' in raw or 'routes/bricscad' in raw or 'services/bricscad.service' in raw:
        remaining.append(str(path))
if remaining:
    raise SystemExit('Riferimenti API/import BricsCAD ancora presenti:\n' + '\n'.join(remaining))

print(f"Route:   {route_new}")
print(f"Service: {service_new}")
print("Riferimenti sorgente aggiornati: OK")
