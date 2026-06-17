import json
import urllib.request

API_URL = "http://localhost:4000/api/global-knowledge/import"

rows = []

def add(short, long, unit, gewerk, cat, pmin, pavg, pmax, ctx=False, conf=0.32):
    rows.append({
        "shortText": short,
        "longText": long,
        "unit": unit,
        "gewerk": gewerk,
        "category": cat,
        "priceMin": round(float(pmin), 2),
        "priceAvg": round(float(pavg), 2),
        "priceMax": round(float(pmax), 2),
        "confidence": conf,
        "sampleCount": 1,
        "isContextSensitive": ctx,
        "needsReview": True
    })

def price(avg, low=0.55, high=2.0):
    return avg * low, avg, avg * high

# Erdarbeiten nach Tiefe/Breite/Bodenklasse
depths = [
    ("bis 0,60 m", 0.75),
    ("bis 1,00 m", 0.9),
    ("bis 1,25 m", 1.0),
    ("bis 1,50 m", 1.15),
    ("bis 2,00 m", 1.4),
    ("über 2,00 m", 1.85),
]

widths = [
    ("Grabenbreite 0,30 m", 0.75),
    ("Grabenbreite 0,40 m", 0.9),
    ("Grabenbreite 0,60 m", 1.0),
    ("Grabenbreite 0,80 m", 1.25),
    ("Grabenbreite 1,00 m", 1.5),
]

boden = [
    ("BK2", 28),
    ("BK3", 36),
    ("BK4", 42),
    ("BK5", 55),
    ("BK6", 78),
    ("BK7", 120),
]

for bkl, base in boden:
    for depth, df in depths:
        for width, wf in widths:
            avg = base * df * wf
            add(
                f"Rohrgrabenaushub {bkl} {depth} {width}",
                f"Rohrgrabenaushub {bkl}, {depth}, {width}, lösen, laden, seitlich lagern, verfüllen und verdichten.",
                "m³",
                "Tiefbau",
                "Rohrgrabenaushub",
                *price(avg)
            )

# Leitungszonen / Bettung / Umhüllung
for material, base in [
    ("Sand 0/4",38),
    ("Brechsand",42),
    ("Kies 0/16",36),
    ("Frostschutzmaterial",45),
    ("Recyclingmaterial",32),
    ("Flüssigboden",95),
]:
    for layer, f in [
        ("Bettung 10 cm",0.65),
        ("Bettung 15 cm",0.85),
        ("Bettung 20 cm",1.0),
        ("Rohrumhüllung 10 cm",0.75),
        ("Rohrumhüllung 20 cm",1.15),
        ("Leitungszone vollständig",1.35),
    ]:
        avg = base * f
        add(
            f"{layer} aus {material} herstellen",
            f"{layer} aus {material} liefern, einbauen und verdichten.",
            "m³",
            "Tiefbau",
            "Leitungszone",
            *price(avg)
        )

# Oberflächenwiederherstellung nach Typ
surfaces = [
    ("Grünfläche",18),
    ("Kiesweg",32),
    ("Schotterweg",38),
    ("Asphaltstraße",85),
    ("Gehweg Pflaster",62),
    ("Natursteinpflaster",110),
    ("Betonfläche",95),
    ("Bankett",28),
]
for surf, base in surfaces:
    for width, wf in [("0,30 m",0.6),("0,50 m",0.8),("1,00 m",1.0),("2,00 m",1.6)]:
        add(
            f"Oberfläche {surf} wiederherstellen Breite {width}",
            f"Oberfläche {surf} nach Leitungsbau wiederherstellen, Breite {width}.",
            "m",
            "Tiefbau / Oberfläche",
            "Oberflächenwiederherstellung",
            *price(base*wf)
        )

# Leitungen allgemein nach Einbautiefe
for typ, base in [
    ("Speedpipe",18),
    ("Kabelschutzrohr DN50",22),
    ("Kabelschutzrohr DN110",38),
    ("PE-HD Rohr DN50",45),
    ("PE-HD Rohr DN100",85),
    ("Wasserleitung DN150",135),
    ("Kanalrohr DN150",75),
    ("Kanalrohr DN300",190),
]:
    for depth, df in depths:
        avg = base * df
        add(
            f"{typ} verlegen {depth}",
            f"{typ} liefern und verlegen bei Einbautiefe {depth}.",
            "m",
            "Leitungsbau",
            "Leitungsverlegung",
            *price(avg)
        )

# Hausanschluss-Varianten
for sparte, base in [
    ("Glasfaser",950),
    ("Strom",1450),
    ("Wasser",3500),
    ("Kanal",4200),
    ("Gas",3800),
]:
    for length, lf in [("bis 5 m",0.75),("bis 10 m",1.0),("bis 20 m",1.6),("über 20 m",2.3)]:
        add(
            f"Hausanschluss {sparte} herstellen {length}",
            f"Hausanschluss {sparte} herstellen, Länge {length}, inkl. Anschluss an Bestand und Wiederherstellung.",
            "St",
            "Hausanschluss",
            sparte,
            base*0.55*lf,
            base*lf,
            base*2.0*lf,
            True,
            0.25
        )

# Bestandsleitungen / Sicherung
for item, unit, avg in [
    ("Bestandsleitung freilegen", "m", 65),
    ("Bestandsleitung sichern", "m", 45),
    ("Bestandskabel unterfangen", "m", 55),
    ("Kreuzung Versorgungsleitung herstellen", "St", 280),
    ("Kreuzung Kabeltrasse herstellen", "St", 220),
    ("Kreuzung Kanal herstellen", "St", 450),
    ("Handschachtung im Kreuzungsbereich", "m³", 145),
    ("Leitung provisorisch aufhängen", "m", 65),
]:
    add(
        item,
        item + " unter erschwerten Bedingungen im Bestand.",
        unit,
        "Tiefbau / Bestand",
        "Bestandssicherung",
        *price(avg, 0.55, 2.5),
        True,
        0.25
    )

payload = {
    "sourceName": "rlc-global-tiefbau-seed-v7-erd-leitung",
    "sourceType": "manual-seed-v7",
    "notes": "RLC Global Knowledge Seed V7 Erdarbeiten und Leitungsbau Varianten.",
    "rows": rows
}

req = urllib.request.Request(
    API_URL,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type":"application/json"},
    method="POST"
)

with urllib.request.urlopen(req) as res:
    print(res.read().decode("utf-8"))

print("ROWS_SENT=", len(rows))
