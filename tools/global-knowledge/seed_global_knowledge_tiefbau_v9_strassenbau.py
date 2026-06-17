import json
import urllib.request

API_URL = "http://localhost:4000/api/global-knowledge/import"

rows = []

def add(short,long,unit,gewerk,cat,pmin,pavg,pmax,ctx=False):
    rows.append({
        "shortText": short,
        "longText": long,
        "unit": unit,
        "gewerk": gewerk,
        "category": cat,
        "priceMin": round(float(pmin),2),
        "priceAvg": round(float(pavg),2),
        "priceMax": round(float(pmax),2),
        "confidence": 0.32,
        "sampleCount": 1,
        "isContextSensitive": ctx,
        "needsReview": True
    })

def p(avg):
    return avg*0.55, avg, avg*2.1

# Asphalt
for schicht, base in [
    ("AC 8 DN",38),
    ("AC 11 DN",42),
    ("AC 16 BN",52),
    ("AC 22 TN",68),
    ("AC 32 TN",82),
]:
    for dicke,f in [
        ("4 cm",0.8),
        ("6 cm",1.0),
        ("8 cm",1.25),
        ("10 cm",1.5),
        ("12 cm",1.8),
    ]:
        avg=base*f
        add(
            f"Asphalt {schicht} {dicke} herstellen",
            f"Asphalt {schicht} {dicke} liefern und einbauen.",
            "m²",
            "Straßenbau",
            "Asphalt",
            *p(avg)
        )

# Bordsteine
for typ,b in [
    ("Tiefbord",28),
    ("Hochbord",36),
    ("Rundbord",42),
    ("Flachbord",26),
    ("Kasseler Bord",58),
]:
    for breite,f in [
        ("8 cm",0.9),
        ("10 cm",1.0),
        ("12 cm",1.15),
        ("15 cm",1.35),
        ("18 cm",1.6),
    ]:
        avg=b*f
        add(
            f"{typ} {breite} setzen",
            f"{typ} {breite} liefern und setzen.",
            "m",
            "Straßenbau",
            "Bordsteine",
            *p(avg)
        )

# Pflaster
for material,b in [
    ("Betonpflaster",32),
    ("Natursteinpflaster",68),
    ("Granitpflaster",92),
    ("Klinkerpflaster",58),
]:
    for format,f in [
        ("10x10",0.9),
        ("15x15",1.0),
        ("20x10",1.1),
        ("20x20",1.2),
        ("30x20",1.35),
    ]:
        avg=b*f
        add(
            f"{material} {format} verlegen",
            f"{material} Format {format} liefern und verlegen.",
            "m²",
            "Straßenbau",
            "Pflaster",
            *p(avg)
        )

# Markierung
for typ,avg in [
    ("Fahrbahnmarkierung herstellen",12),
    ("Leitlinie herstellen",9),
    ("Sperrfläche markieren",18),
    ("Zebrastreifen markieren",28),
    ("Pfeilmarkierung herstellen",22),
    ("Parkplatzmarkierung herstellen",16),
]:
    add(
        typ,
        typ,
        "m",
        "Straßenbau",
        "Markierung",
        *p(avg)
    )

# Fräsen
for tiefe,f in [
    ("2 cm",0.7),
    ("4 cm",1.0),
    ("6 cm",1.3),
    ("8 cm",1.7),
    ("10 cm",2.2),
]:
    avg=12*f
    add(
        f"Asphalt fräsen {tiefe}",
        f"Asphalt fräsen {tiefe}.",
        "m²",
        "Straßenbau",
        "Fräsen",
        *p(avg)
    )

payload = {
    "sourceName":"rlc-global-tiefbau-seed-v9-strassenbau",
    "sourceType":"manual-seed-v9",
    "rows":rows
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
