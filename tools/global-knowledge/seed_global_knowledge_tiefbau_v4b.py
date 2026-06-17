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

# Kanalrohre
for mat in ["KG", "PP", "PVC", "Steinzeug", "Beton"]:
    for dn, avg in [
        ("DN100",55), ("DN150",75), ("DN200",105),
        ("DN250",145), ("DN300",190), ("DN400",290), ("DN500",390)
    ]:
        add(
            f"{mat} Kanalrohr {dn} verlegen",
            f"{mat} Kanalrohr {dn} liefern, verlegen, ausrichten und anschließen.",
            "m",
            "Kanalbau",
            f"Kanalrohr {mat}",
            avg*0.6,
            avg,
            avg*1.9
        )

# Kanal Schächte / Prüfung
for item, unit, avg, ctx in [
    ("Kontrollschacht DN1000 herstellen","St",2600,False),
    ("Revisionsschacht DN600 herstellen","St",1800,False),
    ("Fertigteilschacht setzen","St",3200,False),
    ("Schachtunterteil liefern und setzen","St",1500,False),
    ("Schachtring setzen","St",420,False),
    ("Konus setzen","St",650,False),
    ("Schachtabdeckung Klasse B125 liefern und einbauen","St",460,False),
    ("Schachtabdeckung Klasse D400 liefern und einbauen","St",850,False),
    ("Schacht an Bestand anschließen","St",990,True),
    ("Kanalanschluss an Bestand herstellen","St",1250,True),
    ("Kanal Dichtheitsprüfung durchführen","Psch",1500,True),
    ("Kanal TV-Inspektion durchführen","m",4.5,False),
    ("Kanal spülen","m",3.8,False),
    ("Kanalhaltung reinigen","m",5.5,False),
]:
    add(item, item + " inkl. Nebenleistungen.", unit, "Kanalbau", "Schacht/Prüfung", avg*0.55, avg, avg*2.0, ctx)

# Wasserleitungen
for mat in ["PE-HD", "GGG", "Stahl", "PVC-U"]:
    for dn, avg in [
        ("DN50",45), ("DN80",65), ("DN100",85),
        ("DN150",135), ("DN200",210), ("DN250",310), ("DN300",420)
    ]:
        add(
            f"{mat} Wasserleitung {dn} verlegen",
            f"{mat} Wasserleitung {dn} liefern, verlegen, verbinden und betriebsfertig herstellen.",
            "m",
            "Wasserbau",
            f"Wasserleitung {mat}",
            avg*0.55,
            avg,
            avg*2.0
        )

# Wasser Armaturen
for item, unit, avg, ctx in [
    ("Absperrschieber DN80 einbauen","St",520,False),
    ("Absperrschieber DN100 einbauen","St",650,False),
    ("Absperrschieber DN150 einbauen","St",950,False),
    ("Absperrschieber DN200 einbauen","St",1450,False),
    ("Unterflurhydrant einbauen","St",1480,False),
    ("Überflurhydrant einbauen","St",2200,False),
    ("Hausanschluss Wasser herstellen","St",3500,True),
    ("Anbohrschelle montieren","St",180,False),
    ("Wasserzählerbügel montieren","St",250,False),
    ("Druckprüfung Wasserleitung","Psch",1800,True),
    ("Spülung Wasserleitung","m",12,False),
    ("Desinfektion Wasserleitung","m",18,False),
    ("Anschluss an Bestandsleitung Wasser","St",950,True),
]:
    add(item, item + " inkl. Material, Montage und Nebenleistungen.", unit, "Wasserbau", "Armaturen/Prüfung", avg*0.55, avg, avg*2.0, ctx)

# Rohrleitungsbau Formstücke
for mat in ["PE-HD", "GGG", "PVC", "Stahl"]:
    for dn, avg in [
        ("DN50",65), ("DN80",95), ("DN100",135),
        ("DN150",220), ("DN200",360), ("DN250",520)
    ]:
        add(
            f"{mat} Formstück {dn} montieren",
            f"{mat} Formstück {dn} liefern, montieren und verbinden.",
            "St",
            "Rohrleitungsbau",
            "Formstücke",
            avg*0.55,
            avg,
            avg*2.0
        )

# Flansche / Muffen / Übergänge
for item, avg in [
    ("Losflansch PN10 DN80 montieren",180),
    ("Losflansch PN10 DN100 montieren",220),
    ("Losflansch PN10 DN150 montieren",340),
    ("Losflansch PN16 DN80 montieren",210),
    ("Losflansch PN16 DN100 montieren",260),
    ("Losflansch PN16 DN150 montieren",390),
    ("Übergang PE-HD auf GGG DN100 herstellen",420),
    ("Übergang PE-HD auf Stahl DN100 herstellen",380),
    ("Muffe PE-HD DN100 montieren",95),
    ("Muffe PE-HD DN150 montieren",145),
    ("Endkappe PE-HD DN100 montieren",45),
    ("Endkappe PE-HD DN150 montieren",75),
]:
    add(item, item + " inkl. Lieferung und Montage.", "St", "Rohrleitungsbau", "Flansche/Muffen", avg*0.55, avg, avg*2.0)

payload = {
    "sourceName": "rlc-global-tiefbau-seed-v4b",
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
