import json, urllib.request

API_URL="http://localhost:4000/api/global-knowledge/import"
rows=[]

def add(short,long,unit,gewerk,cat,pmin,pavg,pmax,ctx=True,conf=0.25):
    rows.append({
        "shortText":short,"longText":long,"unit":unit,"gewerk":gewerk,"category":cat,
        "priceMin":round(float(pmin),2),"priceAvg":round(float(pavg),2),"priceMax":round(float(pmax),2),
        "confidence":conf,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True
    })

def p(avg,low=0.4,high=4.0): return avg*low,avg,avg*high

# HDD nach DA/Länge/Boden
for da,base in [(40,75),(63,95),(90,120),(110,145),(125,165),(160,220),(180,260),(225,340),(280,460),(315,620),(400,950),(500,1350)]:
    for length,lf in [("bis 25 m",1.25),("bis 50 m",1.0),("bis 100 m",0.9),("über 100 m",0.85)]:
        for soil,sf in [("leicht",0.85),("mittel",1.0),("schwer",1.45),("felsig",2.4)]:
            avg=base*lf*sf
            add(f"HDD Horizontalbohrung DA{da} {length} Boden {soil}",f"HDD Horizontalbohrung DA{da}, Länge {length}, Boden {soil}, inkl. Pilotbohrung, Aufweitung und Einzug.","m","Spezialtiefbau","HDD",*p(avg))

# Verbau Kombi
for typ,base in [("Leichtverbau",65),("Gleitschienenverbau",145),("Spundwand",240),("Trägerbohlwand",310),("Berliner Verbau",380)]:
    for tiefe,tf in [("1,5 m",1.0),("2,5 m",1.4),("4,0 m",2.0),("6,0 m",3.2)]:
        for dauer,df in [("kurz",0.8),("normal",1.0),("lang",1.4)]:
            add(f"{typ} Tiefe {tiefe} Vorhaltung {dauer}",f"{typ} Tiefe {tiefe}, Vorhaltung {dauer}, herstellen, vorhalten und zurückbauen.","m²","Spezialtiefbau","Verbau",*p(base*tf*df))

# Wasserhaltung Detail
for system,base in [("offene Wasserhaltung",8500),("Grundwasserabsenkung",25000),("Vakuumlanzenanlage",18000),("Filterbrunnenanlage",32000)]:
    for dauer,df in [("bis 1 Woche",0.6),("bis 1 Monat",1.0),("bis 3 Monate",2.2),("über 3 Monate",4.5)]:
        add(f"{system} {dauer}",f"{system} {dauer} herstellen, betreiben und zurückbauen.","Psch","Wasserhaltung","Context Sensitive",*p(base*df,0.3,5.0))

# Bodenverbesserung / Injektion
for item,unit,base in [
("Bodeninjektion durchführen","m³",280),("Zementinjektion durchführen","m³",240),
("Düsenstrahlverfahren herstellen","m³",420),("Bodenvereisung herstellen","Psch",45000),
("Rüttelstopfverdichtung durchführen","m",180),("Tiefenverdichtung durchführen","m²",95),
("Pfahlgründung Mikropfähle herstellen","m",220),("Bohrpfahl herstellen","m",650)
]:
    add(item,item+" abhängig von Baugrund, Statik und Ausführung.",unit,"Spezialtiefbau","Bodenverbesserung/Gründung",*p(base))

payload={"sourceName":"rlc-global-tiefbau-seed-v20-spezial-detail","sourceType":"manual-seed-v20","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
