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

def price(avg, low=0.55, high=2.1):
    return avg * low, avg, avg * high

# 1) Kanalrohre DN100-DN1200
kanal_materials = {
    "KG": 1.0,
    "PP": 1.15,
    "PVC": 1.05,
    "Steinzeug": 1.45,
    "Beton": 1.35,
    "GFK": 1.65,
}
dn_prices_kanal = {
    100: 55, 125: 62, 150: 75, 200: 105, 250: 145,
    300: 190, 400: 290, 500: 390, 600: 520,
    800: 780, 1000: 1150, 1200: 1550,
}
for mat, factor in kanal_materials.items():
    for dn, base in dn_prices_kanal.items():
        avg = base * factor
        add(
            f"{mat} Kanalrohr DN{dn} verlegen",
            f"{mat} Kanalrohr DN{dn} liefern, im Rohrgraben verlegen, ausrichten, verbinden und anschließen.",
            "m", "Kanalbau", f"Kanalrohr {mat}", *price(avg)
        )

# 2) Wasserleitungen DN25-DN600
wasser_materials = {
    "PE-HD": 1.0,
    "GGG": 1.55,
    "Stahl": 1.75,
    "PVC-U": 0.95,
    "Edelstahl": 2.4,
}
dn_prices_wasser = {
    25: 28, 32: 32, 40: 38, 50: 45, 63: 55, 80: 65,
    100: 85, 125: 110, 150: 135, 200: 210, 250: 310,
    300: 420, 400: 680, 500: 980, 600: 1350,
}
for mat, factor in wasser_materials.items():
    for dn, base in dn_prices_wasser.items():
        avg = base * factor
        add(
            f"{mat} Wasserleitung DN{dn} verlegen",
            f"{mat} Wasserleitung DN{dn} liefern, verlegen, verbinden, prüfen und betriebsfertig herstellen.",
            "m", "Wasserbau", f"Wasserleitung {mat}", *price(avg)
        )

# 3) Kabelschutzrohre / Leerrohre
schutzrohre = {
    "PE-HD Kabelschutzrohr": 1.0,
    "PVC Kabelschutzrohr": 0.85,
    "PP Kabelschutzrohr": 0.95,
    "Stahl Schutzrohr": 2.4,
}
dn_prices_kabel = {
    32: 10, 40: 14, 50: 18, 63: 22, 75: 24,
    90: 28, 100: 32, 110: 36, 125: 46, 160: 58,
    200: 88, 250: 135, 300: 190,
}
for mat, factor in schutzrohre.items():
    for dn, base in dn_prices_kabel.items():
        avg = base * factor
        add(
            f"{mat} DN{dn} verlegen",
            f"{mat} DN{dn} liefern und im vorbereiteten Rohrgraben verlegen.",
            "m", "Kabelbau", "Kabelschutzrohr", *price(avg)
        )

# 4) Speedpipe / Mikrorohr Varianten
verbands = [
    ("1x7", 6), ("2x7", 8), ("4x7", 10), ("7x7", 11),
    ("7x10", 12), ("12x10", 18), ("24x10", 26), ("50x10", 52),
    ("7x12", 14), ("12x12", 21), ("24x12", 30),
    ("7x14", 16), ("12x14", 24), ("24x14", 34), ("50x14", 68),
    ("72x7", 68), ("96x7", 92),
]
for verband, avg in verbands:
    for lage, f in [("im offenen Graben", 1.0), ("in Schutzrohr", 1.25), ("im Bestand", 1.45)]:
        add(
            f"Speedpipe Verband {verband} verlegen {lage}",
            f"Speedpipe / Mikrorohrverband {verband} {lage} liefern und verlegen.",
            "m", "Glasfaser", "Speedpipe", *price(avg*f)
        )

# 5) Formstücke / Bogen / T-Stück / Reduzierung / Muffen
form_mats = ["PE-HD", "GGG", "PVC", "PP", "Stahl", "Edelstahl"]
dn_form = {
    25: 35, 32: 42, 40: 50, 50: 65, 63: 75, 80: 95,
    100: 135, 125: 180, 150: 220, 200: 360,
    250: 520, 300: 780, 400: 1250, 500: 1850, 600: 2600,
}
for mat in form_mats:
    mat_factor = {"PE-HD":1.0,"GGG":1.35,"PVC":0.85,"PP":0.9,"Stahl":1.5,"Edelstahl":2.4}[mat]
    for dn, base in dn_form.items():
        avg = base * mat_factor
        for typ, f in [("Bogen",1.0),("T-Stück",1.35),("Reduzierung",0.9),("Muffe",0.75),("Endkappe",0.55)]:
            add(
                f"{mat} {typ} DN{dn} montieren",
                f"{mat} {typ} DN{dn} liefern, montieren und verbinden.",
                "St", "Rohrleitungsbau", typ, *price(avg*f)
            )

# 6) Flansche PN10/16/25/40
for pn, pf in [("PN10",1.0),("PN16",1.18),("PN25",1.45),("PN40",1.9)]:
    for dn, base in dn_form.items():
        avg = base * pf * 1.15
        add(
            f"Losflansch {pn} DN{dn} montieren",
            f"Losflansch {pn} DN{dn} liefern und montieren.",
            "St", "Rohrleitungsbau", "Flansch", *price(avg)
        )

# 7) Schächte
schacht_types = [
    ("Kabelzugschacht PP", 1200),
    ("Kabelzugschacht Beton", 1800),
    ("Revisionsschacht Kunststoff", 1700),
    ("Revisionsschacht Beton", 2600),
    ("Kontrollschacht Beton", 2800),
    ("Pumpenschacht", 5200),
    ("Wasserzählerschacht", 3800),
]
sizes = [("klein",0.75),("mittel",1.0),("groß",1.6),("extra groß",2.4)]
for typ, base in schacht_types:
    for size, f in sizes:
        add(
            f"{typ} {size} setzen",
            f"{typ} {size} liefern, Baugrube herstellen, versetzen, anschließen und verfüllen.",
            "St", "Schachtbau", "Schacht", *price(base*f)
        )

# 8) Schachtabdeckungen
for klasse, base in [("A15",180),("B125",460),("C250",650),("D400",850),("F900",1600)]:
    for form, f in [("rund",1.0),("eckig",1.15),("tagwasserdicht",1.35),("verriegelbar",1.25)]:
        add(
            f"Schachtabdeckung Klasse {klasse} {form} einbauen",
            f"Schachtabdeckung Klasse {klasse} {form} liefern, höhengerecht einbauen und befestigen.",
            "St", "Schachtbau", "Schachtabdeckung", *price(base*f)
        )

# 9) Erdarbeiten / Bodenklassen
for bkl, base in [("BK2",28),("BK3",36),("BK4",42),("BK5",55),("BK6",78),("BK7",120)]:
    for tiefe, f in [("bis 0,60 m",0.8),("bis 1,20 m",1.0),("bis 2,00 m",1.35),("über 2,00 m",1.8)]:
        add(
            f"Grabenaushub {bkl} {tiefe}",
            f"Grabenaushub {bkl} {tiefe} lösen, laden, seitlich lagern oder abfahren.",
            "m³", "Tiefbau", "Grabenaushub", *price(base*f)
        )

for item, unit, base in [
    ("Oberboden abtragen","m³",14), ("Oberboden andecken","m³",12),
    ("Planum herstellen","m²",8), ("Planum nachverdichten","m²",5),
    ("Frostschutzschicht herstellen","m²",45), ("Schottertragschicht herstellen","m²",52),
    ("Kiestragschicht herstellen","m²",42), ("Geotextil verlegen","m²",7),
    ("Geogitter verlegen","m²",12), ("Trennlage herstellen","m²",5),
    ("Sandbett herstellen","m³",38), ("Rohrumhüllung Sand herstellen","m³",47),
]:
    add(item, item + " inkl. Material, Einbau und Verdichtung.", unit, "Tiefbau", "Erdarbeiten", *price(base))

# 10) Asphalt / Pflaster / Bord / Rinne
asphalt = [
    ("Asphaltdeckschicht AC 5 D",36),("Asphaltdeckschicht AC 8 D",38),
    ("Asphaltdeckschicht AC 11 D",42),("Asphaltbinderschicht AC 16 B",48),
    ("Asphalttragschicht AC 22 T",58),("Asphalttragschicht AC 32 T",68),
    ("Gussasphalt herstellen",95),("Kaltasphalt einbauen",75),
]
for typ, base in asphalt:
    for area, f in [("Kleinfläche",1.8),("Normalfläche",1.0),("Handeinbau",1.6)]:
        add(f"{typ} {area}", f"{typ} {area} liefern und einbauen.", "m²", "Straßenbau", "Asphalt", *price(base*f))

for typ, base in [
    ("Betonpflaster",68),("Natursteinpflaster",110),("Kleinpflaster",120),
    ("Mosaikpflaster",145),("Ökopflaster",82),("Verbundpflaster",68)
]:
    for work, f in [("aufnehmen",0.3),("wiederherstellen",0.85),("liefern und verlegen",1.0)]:
        add(f"{typ} {work}", f"{typ} {work} inkl. Nebenarbeiten.", "m²", "Straßenbau", "Pflaster", *price(base*f))

for typ, base in [("Hochbord",75),("Tiefbord",65),("Rundbord",72),("Übergangsstein",95),("Rinnenstein",65)]:
    for work, f in [("aufnehmen",0.35),("setzen",1.0),("liefern und setzen",1.25)]:
        add(f"{typ} {work}", f"{typ} {work} inkl. Fundament und Rückenstütze.", "m", "Straßenbau", "Bord/Rinne", *price(base*f))

# 11) Entsorgung / Transport
for klasse, base in [
    ("Z0",18),("Z1.1",32),("Z1.2",48),("Z2",85),
    ("DK0",95),("DKI",130),("DKII",190),("gefährlicher Abfall",260)
]:
    add(f"Boden entsorgen {klasse}", f"Boden {klasse} laden, transportieren, entsorgen und Nachweis führen.", "t", "Entsorgung", "Bodenentsorgung", *price(base,0.55,2.4), True)

for item, base in [
    ("Asphalt teerfrei entsorgen",35),("Asphalt teerhaltig entsorgen",110),
    ("Betonaufbruch entsorgen",42),("Bauschutt entsorgen",48),
    ("Gemischte Bauabfälle entsorgen",160),("Altrohr PE entsorgen",60),
    ("Altrohr GGG entsorgen",80),("Kontaminiertes Material entsorgen",220)
]:
    add(item, item + " inkl. Laden, Transport und Gebühren.", "t", "Entsorgung", "Abfall", *price(base,0.55,2.5), True)

# 12) Context-sensitive Spezial
context_items = [
    ("Baustelleneinrichtung herstellen und vorhalten","Psch",25000),
    ("Verkehrssicherung nach RSA herstellen","Psch",18000),
    ("Offene Wasserhaltung herstellen","Psch",8500),
    ("Grundwasserhaltung herstellen","Psch",25000),
    ("Kampfmittelsondierung durchführen","Psch",8500),
    ("Altlastenerkundung durchführen","Psch",6500),
    ("Bestandsvermessung durchführen","Psch",2500),
    ("As-Built Dokumentation erstellen","Psch",3500),
    ("Bauleitung Koordination","Psch",5000),
    ("Stillstandszeit Gerät","h",250),
    ("Wartezeit Kolonne","h",180),
    ("Kabelumlegung provisorisch herstellen","Psch",4500),
    ("Notversorgung Wasser herstellen","Psch",6500),
    ("Provisorische Verkehrsführung herstellen","Psch",12000),
]
for short, unit, base in context_items:
    add(short, short + " abhängig von Dauer, Entfernung, Projektgröße, Risiko und Logistik.", unit, "Tiefbau", "Context Sensitive", base*0.25, base, base*5.0, True, 0.25)

payload = {
    "sourceName": "rlc-global-tiefbau-seed-v5-massive",
    "sourceType": "manual-seed-v5",
    "notes": "Massiver strukturierter RLC Global Knowledge Seed V5.",
    "rows": rows
}

req = urllib.request.Request(
    API_URL,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST"
)

with urllib.request.urlopen(req) as res:
    print(res.read().decode("utf-8"))

print("ROWS_SENT=", len(rows))
