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
        "confidence": 0.35,
        "sampleCount": 1,
        "isContextSensitive": ctx,
        "needsReview": True
    })

# Speedpipe / Mikrorohre
for verband, avg in [
    ("1x7",6), ("2x7",8), ("4x7",10),
    ("7x10",12), ("12x10",18), ("24x10",26),
    ("7x14",16), ("12x14",24), ("24x14",34),
    ("50x7",48), ("72x7",68)
]:
    add(
        f"Speedpipe Verband {verband} verlegen",
        f"Speedpipe / Mikrorohrverband {verband} liefern und im vorbereiteten Graben verlegen.",
        "m",
        "Glasfaser",
        "Speedpipe",
        avg*0.6,
        avg,
        avg*1.9
    )

# LWL / Glasfaser
for item, unit, avg in [
    ("LWL Kabel einblasen","m",1.8),
    ("LWL Kabel einziehen","m",3.5),
    ("LWL Hausanschluss herstellen","St",950),
    ("LWL Muffe setzen","St",450),
    ("LWL Abschlussdose montieren","St",180),
    ("LWL Patchfeld montieren","St",350),
    ("LWL Spleiß herstellen","St",18),
    ("LWL Messprotokoll erstellen","St",35),
    ("OTDR Messung durchführen","St",120),
    ("Einblasversuch durchführen","Psch",650),
]:
    add(item, item + " inkl. Nebenleistungen.", unit, "Glasfaser", "LWL", avg*0.55, avg, avg*2.0, ctx=("Hausanschluss" in item))

# Kabelschutzrohre
for dia, avg in [
    ("DN40",14), ("DN50",18), ("DN63",22), ("DN75",24),
    ("DN90",28), ("DN100",32), ("DN110",36), ("DN125",46),
    ("DN160",58), ("DN200",88)
]:
    add(
        f"Kabelschutzrohr {dia} verlegen",
        f"Kabelschutzrohr {dia} liefern und im Rohrgraben verlegen.",
        "m",
        "Kabelbau",
        "Kabelschutzrohr",
        avg*0.6,
        avg,
        avg*1.9
    )

# Stromkabel
for typ, avg in [
    ("Niederspannungskabel verlegen",18),
    ("Mittelspannungskabel verlegen",42),
    ("Straßenbeleuchtungskabel verlegen",16),
    ("Hausanschlusskabel verlegen",22),
    ("Erdungskabel verlegen",12),
    ("Kabel in Schutzrohr einziehen",14),
    ("Kabelgraben Sandbett herstellen",18),
    ("Kabelabdeckplatten verlegen",11),
    ("Kabelwarnband verlegen",3.5),
    ("Kabelschutzmatte verlegen",22),
]:
    add(typ, typ + " inkl. Nebenleistungen.", "m", "Strom / Kabelbau", "Kabelverlegung", avg*0.6, avg, avg*1.9)

# Kabelmuffen / Zubehör
for item, avg in [
    ("Niederspannungsmuffe montieren",380),
    ("Mittelspannungsmuffe montieren",1250),
    ("Endverschluss Niederspannung montieren",220),
    ("Endverschluss Mittelspannung montieren",950),
    ("Kabelverteilerschrank setzen",2200),
    ("Hausanschlusssäule setzen",850),
    ("Kabelzugschacht Strom setzen",1600),
    ("Erdungsband einbauen",9),
    ("Potentialausgleich herstellen",280),
    ("Kabelkennzeichnung herstellen",4),
]:
    add(item, item + " inkl. Lieferung und Montage.", "St" if "einbauen" not in item else "m", "Strom / Kabelbau", "Muffen/Zubehör", avg*0.55, avg, avg*2.0)

# Schutz / Prüfung / Dokumentation
for item, unit, avg, ctx in [
    ("Kabelprüfung Niederspannung durchführen","Psch",750,True),
    ("Kabelprüfung Mittelspannung durchführen","Psch",1800,True),
    ("Kabellage einmessen","m",2.5,True),
    ("Kabeltrasse dokumentieren","Psch",950,True),
    ("Bestandskabel freilegen","m",65,True),
    ("Suchschachtung Kabelbestand","m³",145,True),
    ("Provisorische Kabelsicherung herstellen","m",35,True),
    ("Kabelumlegung provisorisch herstellen","Psch",4500,True),
]:
    add(item, item + " abhängig von Bestand, Risiko und Projektbedingungen.", unit, "Strom / Kabelbau", "Prüfung/Sicherung", avg*0.55, avg, avg*2.5, ctx)

payload = {
    "sourceName": "rlc-global-tiefbau-seed-v4c",
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
