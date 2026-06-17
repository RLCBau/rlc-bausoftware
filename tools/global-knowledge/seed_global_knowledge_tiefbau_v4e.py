import json
import urllib.request

API_URL = "http://localhost:4000/api/global-knowledge/import"

rows = []

def add(short, long, unit, gewerk, cat, pmin, pavg, pmax, ctx=False):
    rows.append({
        "shortText": short,
        "longText": long,
        "unit": unit,
        "gewerk": gewerk,
        "category": cat,
        "priceMin": pmin,
        "priceAvg": pavg,
        "priceMax": pmax,
        "confidence": 0.32 if ctx else 0.35,
        "sampleCount": 1,
        "isContextSensitive": ctx,
        "needsReview": True
    })

# Entsorgung Boden
for klasse, avg in [
    ("Z0",18), ("Z1.1",32), ("Z1.2",48),
    ("Z2",85), ("DK0",95), ("DKI",130), ("DKII",190)
]:
    add(
        f"Boden entsorgen {klasse}",
        f"Boden Materialklasse {klasse} laden, transportieren und entsorgen.",
        "t",
        "Entsorgung",
        "Bodenentsorgung",
        avg*0.55,
        avg,
        avg*2.2,
        True
    )

# Entsorgung Asphalt / Bauschutt
for item, avg in [
    ("Asphalt teerfrei entsorgen",35),
    ("Asphalt teerhaltig entsorgen",110),
    ("Betonaufbruch entsorgen",42),
    ("Bauschutt entsorgen",48),
    ("Gemischte Bauabfälle entsorgen",160),
    ("Wurzelstöcke entsorgen",95),
    ("Grünschnitt entsorgen",45),
    ("Altrohr PE entsorgen",60),
    ("Altrohr GGG entsorgen",80),
    ("Kontaminiertes Material entsorgen",220),
]:
    add(item, item + " inkl. Laden, Transport, Nachweisführung und Entsorgungsgebühr.", "t", "Entsorgung", "Abfall", avg*0.55, avg, avg*2.5, True)

# Transport
for item, unit, avg in [
    ("LKW Transport Bodenmaterial","t",18),
    ("LKW Transport Asphalt","t",20),
    ("LKW Transport Schüttgut","t",16),
    ("Kippgebühr Boden","t",28),
    ("Kippgebühr Bauschutt","t",35),
    ("Zwischenlager Material herstellen","Psch",2500),
    ("Material umlagern auf Baustelle","m³",12),
    ("Container stellen und abholen","St",280),
]:
    add(item, item + " inkl. Nebenleistungen.", unit, "Transport", "Transport/Deponie", avg*0.55, avg, avg*2.0, "Zwischenlager" in item)

# Wasserhaltung
for item, unit, avg in [
    ("Offene Wasserhaltung herstellen","Psch",8500),
    ("Grundwasserhaltung herstellen","Psch",25000),
    ("Pumpensumpf herstellen","St",950),
    ("Tauchpumpe vorhalten","Tag",45),
    ("Schmutzwasserpumpe vorhalten","Tag",65),
    ("Ableitung Wasser herstellen","m",18),
    ("Sedimentationsbecken herstellen","St",3500),
    ("Einleitgenehmigung Wasserhaltung","Psch",1800),
    ("Wasserhaltung betreiben","Tag",450),
    ("Filterbrunnen herstellen","St",5500),
]:
    add(item, item + " abhängig von Grundwasser, Dauer, Genehmigung und Ableitweg.", unit, "Wasserhaltung", "Context Sensitive", avg*0.25, avg, avg*5.0, True)

# Spezialtiefbau / HDD
for item, unit, avg in [
    ("Horizontalbohrung DA63 herstellen","m",95),
    ("Horizontalbohrung DA110 herstellen","m",145),
    ("Horizontalbohrung DA160 herstellen","m",220),
    ("Horizontalbohrung DA225 herstellen","m",340),
    ("Startgrube Horizontalbohrung herstellen","St",2500),
    ("Zielgrube Horizontalbohrung herstellen","St",2200),
    ("Pilotbohrung herstellen","m",85),
    ("Aufweitbohrung herstellen","m",140),
    ("Bohrspülung entsorgen","t",95),
    ("Bohrprotokoll erstellen","St",120),
    ("Stillstandszeit HDD Gerät","h",630),
]:
    add(item, item + " abhängig von Boden, Länge, Trasse und Risiko.", unit, "Spezialtiefbau", "Horizontalbohrung", avg*0.45, avg, avg*2.5, True)

# Kampfmittel / Altlasten
for item, unit, avg in [
    ("Kampfmittelsondierung Fläche","m²",3.5),
    ("Kampfmittelsondierung Trasse","m",8.5),
    ("Kampfmitteltechnische Baubegleitung","Tag",950),
    ("Altlastenerkundung durchführen","Psch",6500),
    ("Bodenprobe entnehmen","St",180),
    ("Deklarationsanalyse Boden","St",420),
    ("Beweissicherung durchführen","Psch",3500),
    ("Sicherheitskoordination Altlasten","Psch",4200),
]:
    add(item, item + " abhängig von Auflage, Behörde, Risiko und Untersuchungsumfang.", unit, "Kampfmittel / Altlasten", "Context Sensitive", avg*0.4, avg, avg*3.5, True)

# Verbau / Baugrube
for item, unit, avg in [
    ("Grabenverbau herstellen","m²",85),
    ("Leichtverbau einsetzen","m²",65),
    ("Spundwand herstellen","m²",240),
    ("Baugrube sichern","Psch",4500),
    ("Böschung herstellen","m²",18),
    ("Böschung sichern","m²",38),
    ("Bauzaun stellen","m",18),
    ("Bauzaun vorhalten","m/Wo",2.5),
]:
    add(item, item + " abhängig von Tiefe, Boden, Dauer und Sicherheitsanforderung.", unit, "Spezialtiefbau", "Verbau/Sicherung", avg*0.55, avg, avg*2.5, True)

# Verkehrssicherung / RSA
for item, unit, avg in [
    ("Verkehrssicherung innerorts herstellen","Psch",8500),
    ("Verkehrssicherung außerorts herstellen","Psch",12000),
    ("Ampelanlage vorhalten","Tag",120),
    ("Beschilderung aufstellen","St",65),
    ("Absperrschranke aufstellen","St",45),
    ("Leitbake aufstellen","St",18),
    ("Verkehrssicherung Kontrolle","Tag",180),
    ("Umleitungsbeschilderung herstellen","Psch",6500),
    ("Fußgängernotweg herstellen","m",45),
    ("Fahrbahnprovisorium herstellen","m²",95),
]:
    add(item, item + " nach RSA und verkehrsrechtlicher Anordnung.", unit, "Verkehrssicherung", "Context Sensitive", avg*0.35, avg, avg*4.0, True)

# Dokumentation / Vermessung
for item, unit, avg in [
    ("Bestandsvermessung Leitungen","m",2.8),
    ("As-Built Plan erstellen","Psch",2500),
    ("Fotodokumentation erstellen","Psch",850),
    ("Absteckung Trasse durchführen","m",2.5),
    ("Achsen abstecken","Psch",950),
    ("Höhenkontrolle durchführen","Psch",750),
    ("DGM Aufnahme durchführen","Psch",2800),
    ("Leitungsdokumentation GIS","Psch",3200),
]:
    add(item, item + " abhängig von Projektumfang, Genauigkeit und Datenformat.", unit, "Vermessung / Dokumentation", "Context Sensitive", avg*0.45, avg, avg*3.0, True)

payload = {
    "sourceName": "rlc-global-tiefbau-seed-v4e",
    "sourceType": "manual-seed-v4",
    "rows": rows
}

req = urllib.request.Request(
    API_URL,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type":"application/json"},
    method="POST"
)

with urllib.request.urlopen(req) as r:
    print(r.read().decode())

print("ROWS_SENT=", len(rows))
