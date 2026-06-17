import json
import urllib.request

API_URL = "http://localhost:4000/api/global-knowledge/import"

rows = []

def add(short, long, unit, gewerk, cat, pmin, pavg, pmax):
    rows.append({
        "shortText": short,
        "longText": long,
        "unit": unit,
        "gewerk": gewerk,
        "category": cat,
        "priceMin": pmin,
        "priceAvg": pavg,
        "priceMax": pmax,
        "confidence": 0.35,
        "sampleCount": 1,
        "needsReview": True
    })

# Asphalt
for typ, avg in [
    ("Asphaltdeckschicht AC 8 D N",38),
    ("Asphaltdeckschicht AC 11 D N",42),
    ("Asphaltbinderschicht AC 16 B N",48),
    ("Asphalttragschicht AC 22 T N",58),
    ("Asphalttragschicht AC 32 T N",68),
    ("Gussasphalt herstellen",95),
    ("Kaltasphalt einbauen",75),
    ("Asphalt angleichen",28),
    ("Asphaltfuge herstellen",14),
    ("Asphalt anschneiden",9),
]:
    add(
        typ,
        f"{typ} liefern und fachgerecht einbauen.",
        "m²" if "Fuge" not in typ and "anschneiden" not in typ else "m",
        "Straßenbau",
        "Asphalt",
        avg*0.6,
        avg,
        avg*1.8
    )

# Pflaster
for typ, avg in [
    ("Betonpflaster aufnehmen",18),
    ("Betonpflaster wiederherstellen",52),
    ("Natursteinpflaster aufnehmen",26),
    ("Natursteinpflaster wiederherstellen",95),
    ("Kleinpflaster herstellen",110),
    ("Mosaikpflaster herstellen",145),
    ("Verbundpflaster liefern und verlegen",68),
    ("Ökopflaster liefern und verlegen",82),
    ("Pflasterbett herstellen",22),
    ("Pflasterfläche abrütteln",8),
]:
    add(
        typ,
        f"{typ} inkl. Unterbau und Anpassungsarbeiten.",
        "m²",
        "Straßenbau",
        "Pflaster",
        avg*0.6,
        avg,
        avg*1.8
    )

# Bordsteine / Rinnen
for typ, avg in [
    ("Hochbord setzen",75),
    ("Tiefbord setzen",65),
    ("Rundbord setzen",72),
    ("Übergangsstein setzen",95),
    ("Rinnenplatte verlegen",58),
    ("2-zeilige Rinne herstellen",68),
    ("3-zeilige Rinne herstellen",82),
    ("Muldenrinne herstellen",95),
    ("Bordstein aufnehmen",22),
    ("Rinne aufnehmen",18),
]:
    add(
        typ,
        f"{typ} inkl. Fundament und Rückenstütze.",
        "m",
        "Straßenbau",
        "Bord/Rinne",
        avg*0.6,
        avg,
        avg*1.8
    )

# Unterbau
for typ, avg in [
    ("Frostschutzschicht herstellen",45),
    ("Schottertragschicht herstellen",52),
    ("Kiestragschicht herstellen",42),
    ("Planum herstellen",8),
    ("Planum nachverdichten",5),
    ("Bodenstabilisierung mit Kalk",18),
    ("Bodenstabilisierung mit Zement",24),
    ("Geotextil verlegen",7),
    ("Geogitter verlegen",12),
    ("Trennlage herstellen",5),
]:
    add(
        typ,
        f"{typ} inkl. Material und Verdichtung.",
        "m²",
        "Straßenbau",
        "Unterbau",
        avg*0.6,
        avg,
        avg*1.8
    )

# Markierung / Ausstattung
for typ, avg in [
    ("Fahrbahnmarkierung herstellen",12),
    ("Sperrfläche markieren",18),
    ("Leitpfosten setzen",95),
    ("Verkehrsschild montieren",180),
    ("Schutzplanke montieren",85),
    ("Poller setzen",145),
    ("Absperrpfosten setzen",165),
    ("Straßeneinlauf anpassen",280),
    ("Straßenkappe anpassen",180),
    ("Schachtdeckel angleichen",320),
]:
    add(
        typ,
        f"{typ} inkl. Nebenleistungen.",
        "m" if "Markierung" in typ or "Schutzplanke" in typ else "St",
        "Straßenbau",
        "Ausstattung",
        avg*0.6,
        avg,
        avg*1.8
    )

payload = {
    "sourceName": "rlc-global-tiefbau-seed-v4a",
    "sourceType": "manual-seed-v4",
    "rows": rows
}

req = urllib.request.Request(
    API_URL,
    data=json.dumps(payload).encode(),
    headers={"Content-Type":"application/json"},
    method="POST"
)

with urllib.request.urlopen(req) as r:
    print(r.read().decode())

print("ROWS_SENT=", len(rows))
