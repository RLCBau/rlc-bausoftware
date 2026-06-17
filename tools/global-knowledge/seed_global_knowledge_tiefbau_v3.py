import json
import urllib.request

API_URL = "http://localhost:4000/api/global-knowledge/import"

rows = []

def add(short, long, unit, gewerk, cat, pmin, pavg, pmax, conf=0.38, ctx=False):
    rows.append({
        "shortText": short,
        "longText": long,
        "unit": unit,
        "gewerk": gewerk,
        "category": cat,
        "priceMin": pmin,
        "priceAvg": pavg,
        "priceMax": pmax,
        "confidence": conf,
        "sampleCount": 1,
        "isContextSensitive": ctx,
        "needsReview": True
    })

# Glasfaser / Speedpipe
for dn, avg in [("7x10",12),("12x10",18),("24x10",26),("7x14",16),("12x14",24),("24x14",34)]:
    add(f"Speedpipe Verband {dn} verlegen", f"Speedpipe/Mikrorohrverband {dn} im vorbereiteten Graben verlegen.", "m", "Glasfaser", "Speedpipe", avg*0.65, avg, avg*1.7)

for dia, avg in [("DN50",18),("DN75",24),("DN100",32),("DN110",36),("DN160",58)]:
    add(f"Kabelschutzrohr {dia} verlegen", f"Kabelschutzrohr {dia} liefern und im Rohrgraben verlegen.", "m", "Kabelbau", "Kabelschutzrohr", avg*0.6, avg, avg*1.8)

for item, avg in [
    ("Trassenwarnband verlegen",3.5),
    ("Kabelabdeckhaube verlegen",9),
    ("Rohrschutzmatte verlegen",22),
    ("Sandbett für Kabel herstellen",18),
    ("Kabel einziehen in Schutzrohr",12),
    ("Mikrorohr kalibrieren",0.25),
    ("Speedpipe Druckprüfung",0.45),
    ("Dichtkappe Mikrorohr montieren",6),
    ("Doppelsteckmuffe Mikrorohr montieren",8),
    ("Einzelzugabdichtung montieren",12),
]:
    add(item, item + " inkl. Nebenleistungen.", "m" if "verlegen" in item or "einziehen" in item or "kalibrieren" in item or "Druckprüfung" in item else "St", "Glasfaser", "Zubehör", avg*0.6, avg, avg*1.8)

# Erdarbeiten
for unit, avg in [("m³",42),("m",55)]:
    add("Rohrgrabenaushub Bodenklasse 3-5", "Rohr-/Kabelgrabenaushub Bodenklasse 3-5 herstellen, laden, verfüllen und verdichten.", unit, "Tiefbau", "Grabenaushub", avg*0.65, avg, avg*1.7)

for bkl, avg in [("Bodenklasse 2",28),("Bodenklasse 3",36),("Bodenklasse 4",42),("Bodenklasse 5",55),("Bodenklasse 6",78),("Bodenklasse 7",120)]:
    add(f"Grabenaushub {bkl}", f"Grabenaushub {bkl} herstellen, laden und seitlich lagern.", "m³", "Tiefbau", "Grabenaushub", avg*0.65, avg, avg*1.8)

for item, avg in [
    ("Verfüllung mit geeignetem Material",38),
    ("Verdichtung Rohrgraben lagenweise",12),
    ("Frostschutzmaterial liefern und einbauen",45),
    ("Kiestragschicht herstellen",38),
    ("Planum herstellen",8),
    ("Oberboden abtragen",14),
    ("Oberboden andecken",12),
    ("Humusierung herstellen",9),
    ("Handschachtung im Leitungsbereich",145),
    ("Suchschlitz herstellen",55),
]:
    add(item, item + " inkl. fachgerechter Ausführung.", "m³" if "Material" in item or "Oberboden" in item or "Handschachtung" in item else "m²" if "Planum" in item or "Humusierung" in item else "m", "Tiefbau", "Erdarbeiten", avg*0.6, avg, avg*1.8, ctx=("Handschachtung" in item or "Suchschlitz" in item))

# Asphalt / Pflaster
for item, unit, avg in [
    ("Asphalt schneiden","m",9),
    ("Asphalt aufnehmen und entsorgen","m²",32),
    ("Asphalttragschicht herstellen","m²",48),
    ("Asphaltbinderschicht herstellen","m²",42),
    ("Asphaltdeckschicht herstellen","m²",38),
    ("Asphaltkleinfläche wiederherstellen","m²",75),
    ("Pflaster aufnehmen und lagern","m²",18),
    ("Pflaster wiederherstellen","m²",52),
    ("Betonpflaster liefern und verlegen","m²",68),
    ("Bordstein aufnehmen","m",22),
    ("Bordstein setzen","m",75),
    ("Rinnenstein setzen","m",65),
]:
    add(item, item + " inkl. Nebenarbeiten.", unit, "Straßenbau", "Oberfläche", avg*0.6, avg, avg*1.8)

# Wasser / Rohrleitungsbau
for mat in ["PE-HD", "GGG", "PVC", "PP"]:
    for dn, avg in [("DN50",45),("DN80",65),("DN100",85),("DN150",135),("DN200",210)]:
        add(f"{mat} Rohr {dn} verlegen", f"{mat} Rohr {dn} liefern, verlegen und verbinden.", "m", "Rohrleitungsbau", mat, avg*0.55, avg, avg*1.9)

for item, avg in [
    ("Absperrschieber DN100 einbauen",650),
    ("Hydrant einbauen",1480),
    ("Hausanschluss Wasser herstellen",3500),
    ("Druckprüfung Wasserleitung",1800),
    ("Spülung und Desinfektion Wasserleitung",38),
    ("Anschluss an Bestandsleitung herstellen",950),
]:
    add(item, item + " inkl. Material, Montage und Nebenleistungen.", "St" if "einbauen" in item or "Hausanschluss" in item or "Anschluss" in item else "Psch" if "Druckprüfung" in item else "m", "Wasserbau", "Wasserleitung", avg*0.55, avg, avg*2.0, ctx=("Hausanschluss" in item or "Bestandsleitung" in item))

# Kanal
for dn, avg in [("DN100",55),("DN150",75),("DN200",105),("DN250",145),("DN300",190),("DN400",290)]:
    add(f"KG Rohr {dn} verlegen", f"KG/Kanalrohr {dn} liefern, verlegen, ausrichten und anschließen.", "m", "Kanalbau", "Kanalrohr", avg*0.6, avg, avg*1.8)

for item, avg in [
    ("Revisionsschacht herstellen",2200),
    ("Schachtabdeckung anpassen",380),
    ("Schachtabdeckung Klasse D liefern",850),
    ("Anschluss an bestehenden Schacht",990),
    ("Kanal Dichtheitsprüfung",1500),
    ("Kanal TV-Inspektion",4.5),
]:
    add(item, item + " inkl. Nebenleistungen.", "St" if "Schacht" in item or "Schachtabdeckung" in item else "Psch" if "Dichtheitsprüfung" in item else "m", "Kanalbau", "Schacht/Kanalprüfung", avg*0.55, avg, avg*2.0, ctx=("bestehenden" in item))

# Schächte / Formstücke / Armaturen
for item, unit, avg in [
    ("Kabelzugschacht PP liefern und setzen","St",1400),
    ("Kabelzugschacht Beton liefern und setzen","St",1800),
    ("Schachtabdeckung B125 montieren","St",460),
    ("Schachtabdeckung D400 montieren","St",850),
    ("PE-HD Formstück DN90 montieren","St",85),
    ("Losflansch PN16 DN100 montieren","St",220),
    ("Losflansch PN16 DN150 montieren","St",360),
    ("Muffe PE-HD DN100 montieren","St",95),
    ("Endkappe PE-HD montieren","St",45),
]:
    add(item, item + " inkl. Lieferung und Montage.", unit, "Rohrleitungsbau", "Formstücke/Schacht", avg*0.55, avg, avg*1.9)

# Entsorgung
for item, avg in [
    ("Boden entsorgen Z0",18),
    ("Boden entsorgen Z1.1",32),
    ("Boden entsorgen Z1.2",48),
    ("Boden entsorgen Z2",85),
    ("Asphalt teerfrei entsorgen",35),
    ("Asphalt teerhaltig entsorgen",110),
    ("Bauschutt entsorgen",42),
]:
    add(item, item + " inkl. Laden, Transport und Entsorgungsgebühr.", "t", "Entsorgung", "Entsorgung", avg*0.55, avg, avg*2.2, ctx=True)

# Context-sensitive
for item, unit, avg in [
    ("Baustelleneinrichtung herstellen und vorhalten","Psch",25000),
    ("Verkehrssicherung nach RSA herstellen","Psch",18000),
    ("Wasserhaltung Baugrube herstellen","Psch",15000),
    ("Kampfmittelsondierung durchführen","Psch",8500),
    ("Bestandsvermessung durchführen","Psch",2500),
    ("As-Built Dokumentation erstellen","Psch",3500),
    ("Bauleitung Koordination","Psch",5000),
    ("Stillstandszeit Gerät","h",250),
    ("Wartezeit Kolonne","h",180),
]:
    add(item, item + " abhängig von Dauer, Entfernung, Projektgröße und Logistik.", unit, "Tiefbau", "Context Sensitive", avg*0.25, avg, avg*5, 0.25, True)

payload = {
    "sourceName": "rlc-global-tiefbau-seed-v3",
    "sourceType": "manual-seed-v3",
    "notes": "Großer strukturierter RLC Global Knowledge Seed V3 für Tiefbau/Leitungsbau.",
    "rows": rows
}

req = urllib.request.Request(
    API_URL,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)

with urllib.request.urlopen(req) as res:
    print(res.read().decode("utf-8"))

print("ROWS_SENT=", len(rows))
