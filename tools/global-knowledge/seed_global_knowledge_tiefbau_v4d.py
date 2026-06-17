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

# Schächte
for typ, avg in [
    ("Kabelzugschacht PP klein setzen",950),
    ("Kabelzugschacht PP mittel setzen",1400),
    ("Kabelzugschacht PP groß setzen",2200),
    ("Kabelzugschacht Beton klein setzen",1600),
    ("Kabelzugschacht Beton mittel setzen",2400),
    ("Kabelzugschacht Beton groß setzen",3800),
    ("Revisionsschacht Kunststoff setzen",1800),
    ("Revisionsschacht Beton setzen",2600),
    ("Kontrollschacht DN1000 setzen",2800),
    ("Pumpenschacht setzen",5200),
]:
    add(typ, typ + " inkl. Lieferung, Baugrube, Versetzen und Anschlussarbeiten.", "St", "Schachtbau", "Schächte", avg*0.55, avg, avg*2.0)

# Schachtabdeckungen
for klasse, avg in [
    ("A15",180), ("B125",460), ("C250",650), ("D400",850), ("F900",1600)
]:
    add(
        f"Schachtabdeckung Klasse {klasse} liefern und einbauen",
        f"Schachtabdeckung Klasse {klasse} liefern, höhengerecht einbauen und befestigen.",
        "St",
        "Schachtbau",
        "Schachtabdeckung",
        avg*0.55,
        avg,
        avg*2.0
    )

# Rohreinführungen / Dichtungen
for dn, avg in [
    ("DN50",65), ("DN75",85), ("DN100",120),
    ("DN150",180), ("DN200",260), ("DN300",420)
]:
    add(f"Rohreinführung {dn} herstellen", f"Rohreinführung {dn} in Schacht herstellen und abdichten.", "St", "Schachtbau", "Rohreinführung", avg*0.55, avg, avg*2.0)
    add(f"Schachtdichtung {dn} montieren", f"Schachtdichtung {dn} liefern und fachgerecht montieren.", "St", "Schachtbau", "Dichtung", avg*0.55, avg*0.8, avg*1.8)

# Armaturen Wasser
for dn, avg in [
    ("DN50",420), ("DN80",520), ("DN100",650),
    ("DN150",950), ("DN200",1450), ("DN250",2200), ("DN300",3200)
]:
    add(f"Absperrschieber {dn} einbauen", f"Absperrschieber {dn} liefern, einbauen und betriebsfertig anschließen.", "St", "Wasserbau", "Armaturen", avg*0.55, avg, avg*2.0)
    add(f"Einbaugarnitur {dn} montieren", f"Einbaugarnitur {dn} liefern und montieren.", "St", "Wasserbau", "Armaturen", avg*0.55, avg*0.35, avg*1.4)
    add(f"Straßenkappe {dn} setzen", f"Straßenkappe {dn} liefern, setzen und höhengerecht anpassen.", "St", "Wasserbau", "Armaturen", avg*0.20, avg*0.30, avg*0.75)

# Hydranten / Sonderarmaturen
for item, avg in [
    ("Unterflurhydrant liefern und einbauen",1480),
    ("Überflurhydrant liefern und einbauen",2200),
    ("Be- und Entlüftungsventil einbauen",1650),
    ("Druckminderer einbauen",2400),
    ("Wasserzählerschacht einbauen",3800),
    ("Provisorische Wasserleitung herstellen",4500),
    ("Notversorgung Wasser herstellen",6500),
]:
    add(item, item + " inkl. Nebenleistungen.", "St" if "einbauen" in item else "Psch", "Wasserbau", "Sonderarmaturen", avg*0.5, avg, avg*2.2, ctx=("Provisorische" in item or "Notversorgung" in item))

# Formstücke
for mat in ["PE-HD", "GGG", "PVC", "PP", "Stahl"]:
    for dn, avg in [
        ("DN50",65), ("DN80",95), ("DN100",135),
        ("DN150",220), ("DN200",360), ("DN250",520), ("DN300",780)
    ]:
        add(f"{mat} Bogen {dn} montieren", f"{mat} Bogen {dn} liefern und montieren.", "St", "Rohrleitungsbau", "Bogen", avg*0.55, avg, avg*2.0)
        add(f"{mat} T-Stück {dn} montieren", f"{mat} T-Stück {dn} liefern und montieren.", "St", "Rohrleitungsbau", "T-Stück", avg*0.65, avg*1.35, avg*2.4)
        add(f"{mat} Reduzierung {dn} montieren", f"{mat} Reduzierung {dn} liefern und montieren.", "St", "Rohrleitungsbau", "Reduzierung", avg*0.50, avg*0.9, avg*1.8)

# Flansche / Muffen
for pn in ["PN10", "PN16", "PN25"]:
    for dn, avg in [
        ("DN50",120), ("DN80",180), ("DN100",260),
        ("DN150",390), ("DN200",650), ("DN250",950), ("DN300",1400)
    ]:
        add(f"Losflansch {pn} {dn} montieren", f"Losflansch {pn} {dn} liefern und montieren.", "St", "Rohrleitungsbau", "Flansch", avg*0.55, avg, avg*2.0)

for dn, avg in [
    ("DN50",45), ("DN80",65), ("DN100",95),
    ("DN150",145), ("DN200",220), ("DN250",340), ("DN300",520)
]:
    add(f"PE-HD Muffe {dn} montieren", f"PE-HD Muffe {dn} liefern und montieren.", "St", "Rohrleitungsbau", "Muffe", avg*0.55, avg, avg*2.0)
    add(f"PE-HD Endkappe {dn} montieren", f"PE-HD Endkappe {dn} liefern und montieren.", "St", "Rohrleitungsbau", "Endkappe", avg*0.45, avg*0.65, avg*1.5)

# Übergänge
for item, avg in [
    ("Übergang PE-HD auf GGG DN80 herstellen",360),
    ("Übergang PE-HD auf GGG DN100 herstellen",420),
    ("Übergang PE-HD auf GGG DN150 herstellen",650),
    ("Übergang PE-HD auf Stahl DN100 herstellen",380),
    ("Übergang PE-HD auf Stahl DN150 herstellen",590),
    ("Übergang PVC auf PP DN150 herstellen",180),
    ("Übergang KG auf PP DN150 herstellen",160),
    ("Übergang Altbestand auf Neubauleitung herstellen",950),
]:
    add(item, item + " inkl. Anpassung und Dichtung.", "St", "Rohrleitungsbau", "Übergang", avg*0.55, avg, avg*2.2, ctx=("Altbestand" in item))

payload = {
    "sourceName": "rlc-global-tiefbau-seed-v4d",
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
