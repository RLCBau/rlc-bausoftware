import json
import urllib.request

API_URL = "http://localhost:4000/api/global-knowledge/import"
rows=[]

def add(short,long,unit,gewerk,cat,pmin,pavg,pmax,ctx=True):
    rows.append({
        "shortText":short,
        "longText":long,
        "unit":unit,
        "gewerk":gewerk,
        "category":cat,
        "priceMin":round(float(pmin),2),
        "priceAvg":round(float(pavg),2),
        "priceMax":round(float(pmax),2),
        "confidence":0.25 if ctx else 0.32,
        "sampleCount":1,
        "isContextSensitive":ctx,
        "needsReview":True
    })

def p(avg, low=0.45, high=3.0):
    return avg*low, avg, avg*high

# Verbau
for typ,base in [
    ("Leichtverbau",65),
    ("Schwerer Grabenverbau",95),
    ("Gleitschienenverbau",145),
    ("Dielenkammerverbau",120),
    ("Spundwandverbau",240),
    ("Trägerbohlwand",310),
    ("Berliner Verbau",380),
]:
    for tiefe,tf in [
        ("bis 1,50 m",1.0),
        ("bis 2,50 m",1.4),
        ("bis 4,00 m",2.0),
        ("über 4,00 m",3.0),
    ]:
        avg=base*tf
        add(
            f"{typ} {tiefe} herstellen",
            f"{typ} {tiefe} herstellen, vorhalten und zurückbauen.",
            "m²","Spezialtiefbau","Verbau",*p(avg)
        )

# Spundwand / Rammarbeiten
for item,unit,base in [
    ("Spundbohlen liefern und einbringen","m²",240),
    ("Spundbohlen ziehen","m²",85),
    ("Rammgerät mobilisieren","Psch",4500),
    ("Rüttler vorhalten","Tag",850),
    ("Rammprotokoll erstellen","St",120),
    ("Kopfbalken Spundwand herstellen","m",280),
    ("Aussteifung Spundwand herstellen","m",420),
]:
    add(item,item + " abhängig von Boden, Tiefe, Dauer und Gerät.",unit,"Spezialtiefbau","Spundwand",*p(base))

# Wasserhaltung
for item,unit,base in [
    ("Offene Wasserhaltung herstellen","Psch",8500),
    ("Offene Wasserhaltung betreiben","Tag",450),
    ("Grundwasserabsenkung herstellen","Psch",25000),
    ("Grundwasserabsenkung betreiben","Tag",1200),
    ("Filterbrunnen herstellen","St",5500),
    ("Vakuumlanzen setzen","St",480),
    ("Pumpensumpf herstellen","St",950),
    ("Tauchpumpe vorhalten","Tag",45),
    ("Schmutzwasserpumpe vorhalten","Tag",65),
    ("Sedimentationsanlage vorhalten","Tag",180),
    ("Ableitungsleitung Wasserhaltung herstellen","m",18),
    ("Einleitgenehmigung Wasserhaltung bearbeiten","Psch",1800),
]:
    add(item,item + " abhängig von Grundwasserstand, Dauer, Genehmigung und Ableitweg.",unit,"Wasserhaltung","Context Sensitive",*p(base,0.35,5.0))

# Horizontalbohrung / HDD
for da,base in [
    (40,75),(63,95),(90,120),(110,145),(125,165),
    (160,220),(180,260),(225,340),(280,460),(315,620),(400,950)
]:
    for boden,tf in [
        ("Bodenklasse leicht",0.85),
        ("Bodenklasse mittel",1.0),
        ("Bodenklasse schwer",1.45),
        ("Felsanteil",2.2),
    ]:
        avg=base*tf
        add(
            f"Horizontalbohrung DA{da} {boden}",
            f"Horizontalbohrung DA{da} im Spülbohrverfahren, {boden}, inkl. Pilotbohrung und Einzug.",
            "m","Spezialtiefbau","Horizontalbohrung",*p(avg,0.45,3.0)
        )

# HDD Nebenleistungen
for item,unit,base in [
    ("Startgrube HDD herstellen","St",2500),
    ("Zielgrube HDD herstellen","St",2200),
    ("Pilotbohrung herstellen","m",85),
    ("Aufweitbohrung herstellen","m",140),
    ("Bohrspülung bereitstellen","t",55),
    ("Bohrspülung entsorgen","t",95),
    ("Bohrprotokoll HDD erstellen","St",120),
    ("Ortung Horizontalbohrung durchführen","m",8),
    ("Stillstandszeit HDD Gerät","h",630),
    ("HDD Gerät mobilisieren","Psch",6500),
]:
    add(item,item + " abhängig von Boden, Trasse, Genehmigung und Gerät.",unit,"Spezialtiefbau","HDD Nebenleistung",*p(base,0.45,3.5))

# Kampfmittel / Altlasten / Beweissicherung
for item,unit,base in [
    ("Kampfmittelsondierung Fläche","m²",3.5),
    ("Kampfmittelsondierung Trasse","m",8.5),
    ("Kampfmitteltechnische Baubegleitung","Tag",950),
    ("Freimessung Kampfmittel durchführen","Psch",3500),
    ("Altlastenerkundung durchführen","Psch",6500),
    ("Bodenprobe entnehmen","St",180),
    ("Deklarationsanalyse Boden","St",420),
    ("Beweissicherung Gebäude durchführen","Psch",3500),
    ("Erschütterungsmessung durchführen","Tag",780),
]:
    add(item,item + " abhängig von Auflagen, Risiko, Behörden und Untersuchungsumfang.",unit,"Kampfmittel / Altlasten","Context Sensitive",*p(base,0.4,4.0))

payload={"sourceName":"rlc-global-tiefbau-seed-v13-spezialtiefbau","sourceType":"manual-seed-v13","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r:
    print(r.read().decode())
print("ROWS_SENT=",len(rows))
