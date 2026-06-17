import json, urllib.request

API_URL="http://localhost:4000/api/global-knowledge/import"
rows=[]

def add(short,long,unit,gewerk,cat,pmin,pavg,pmax,ctx=False,conf=0.32):
    rows.append({
        "shortText":short,"longText":long,"unit":unit,"gewerk":gewerk,"category":cat,
        "priceMin":round(float(pmin),2),"priceAvg":round(float(pavg),2),"priceMax":round(float(pmax),2),
        "confidence":conf,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True
    })

def p(avg,low=0.55,high=2.1): return avg*low,avg,avg*high

# Tragschichten / Unterbau
materials=[
("Frostschutzschicht",45),("Schottertragschicht",52),("Kiestragschicht",42),
("HGT hydraulisch gebundene Tragschicht",68),("RC-Tragschicht",38),
("Bituminöse Tragschicht",72),("Drainbetontragschicht",95)
]
thicks=[("10 cm",0.6),("15 cm",0.8),("20 cm",1.0),("25 cm",1.25),("30 cm",1.5),("40 cm",2.0),("50 cm",2.5)]
for mat,base in materials:
    for thick,tf in thicks:
        add(f"{mat} {thick} herstellen",f"{mat} {thick} liefern, einbauen, profilieren und verdichten.","m²","Straßenbau","Tragschicht",*p(base*tf))

# Fräsen / Rückbau
for item,base in [
("Asphalt fräsen",12),("Asphalt schneiden",9),("Asphalt aufbrechen",24),
("Betonfläche aufbrechen",38),("Pflaster aufnehmen",18),
("Bordstein aufnehmen",22),("Rinne aufnehmen",18),("Schutzplanke demontieren",28)
]:
    for umfang,fac in [("kleine Mengen",1.8),("normal",1.0),("große Mengen",0.8)]:
        add(f"{item} {umfang}",f"{item} {umfang} inkl. Laden und Nebenleistungen.","m²" if "fläche" in item.lower() or "pflaster" in item.lower() or "asphalt" in item.lower() else "m","Straßenbau","Rückbau",*p(base*fac))

# Markierung
for mark,base in [
("Leitlinie",9),("Fahrstreifenbegrenzung",11),("Sperrfläche",18),
("Zebrastreifen",28),("Pfeilmarkierung",22),("Parkplatzmarkierung",16),
("Busspurmarkierung",20),("Radwegmarkierung",14),("Haltelinie",12)
]:
    for mat,fac in [("Farbe",1.0),("Kaltplastik",1.8),("Thermoplastik",2.2),("Agglomerat",2.6)]:
        add(f"{mark} {mat} herstellen",f"{mark} aus {mat} herstellen.","m","Straßenbau","Markierung",*p(base*fac))

# Ausstattung
for item,unit,base in [
("Verkehrszeichen liefern und montieren","St",180),("Rohrpfosten setzen","St",95),
("Leitpfosten setzen","St",95),("Poller setzen","St",145),
("Absperrpfosten setzen","St",165),("Schutzplanke montieren","m",85),
("Geländer montieren","m",145),("Anfahrschutz montieren","St",280),
("Baumschutzbügel setzen","St",220),("Fahrradbügel setzen","St",180)
]:
    add(item,item+" inkl. Fundament und Nebenarbeiten.",unit,"Straßenbau","Ausstattung",*p(base))

payload={"sourceName":"rlc-global-tiefbau-seed-v19-strassenbau-detail","sourceType":"manual-seed-v19","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
