import json, urllib.request

API_URL="http://localhost:4000/api/global-knowledge/import"
rows=[]

def add(short,long,unit,gewerk,cat,pmin,pavg,pmax,ctx=False):
    rows.append({
        "shortText":short,"longText":long,"unit":unit,"gewerk":gewerk,"category":cat,
        "priceMin":round(float(pmin),2),"priceAvg":round(float(pavg),2),"priceMax":round(float(pmax),2),
        "confidence":0.32,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True
    })

def p(avg): return avg*0.55,avg,avg*2.1

# Rinnensteine / Muldenrinnen
for typ,base in [
("Rinnenstein Beton",58),("Rinnenstein Granit",95),("Muldenrinne Beton",85),
("Muldenrinne Naturstein",130),("Kastenrinne Beton",125),("Polymerbetonrinne",145)
]:
    for breite,f in [("10 cm",0.8),("15 cm",1.0),("20 cm",1.25),("30 cm",1.6),("50 cm",2.2)]:
        for arbeit,af in [("liefern und setzen",1.0),("aufnehmen",0.35),("wieder setzen",0.75),("anschließen",0.45)]:
            add(f"{typ} {breite} {arbeit}",f"{typ} {breite} {arbeit} inkl. Fundament und Nebenleistungen.","m","Straßenentwässerung","Rinnen",*p(base*f*af))

# Sinkkästen / Einläufe
for typ,base in [
("Straßeneinlauf 300x500",650),("Straßeneinlauf 500x500",850),
("Hofablauf klein",280),("Hofablauf groß",480),
("Sinkkasten B125",520),("Sinkkasten D400",890),
("Punktablauf",420),("Linienablauf",780)
]:
    for arbeit,af in [("liefern und einbauen",1.0),("anpassen",0.35),("reinigen",0.12),("an Bestand anschließen",0.65)]:
        add(f"{typ} {arbeit}",f"{typ} {arbeit} inkl. Anschlussleitung und Nebenarbeiten.","St","Straßenentwässerung","Einläufe/Sinkkästen",*p(base*af),ctx=("Bestand" in arbeit))

# Anschlussleitungen
for mat,mf in [("KG",1.0),("PP",1.15),("PVC",1.05),("Beton",1.35)]:
    for dn,base in [(100,55),(125,62),(150,75),(200,105),(250,145),(300,190)]:
        add(f"Anschlussleitung Entwässerung {mat} DN{dn} verlegen",f"Anschlussleitung {mat} DN{dn} für Straßenentwässerung liefern und verlegen.","m","Straßenentwässerung","Anschlussleitung",*p(base*mf))

# Rigolen / Versickerung
for item,unit,base in [
("Rigole herstellen","m³",180),("Sickerschacht herstellen","St",2800),
("Muldenversickerung herstellen","m²",45),("Retentionsbox einbauen","m³",220),
("Drainagerohr DN100 verlegen","m",28),("Drainagerohr DN150 verlegen","m",38),
("Filtervlies verlegen","m²",7),("Kiespackung Drainage herstellen","m³",55)
]:
    add(item,item+" inkl. Material, Einbau und Nebenleistungen.",unit,"Straßenentwässerung","Versickerung/Drainage",*p(base),ctx=("Rigole" in item or "Sickerschacht" in item))

payload={"sourceName":"rlc-global-tiefbau-seed-v22-entwaesserung","sourceType":"manual-seed-v22","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
