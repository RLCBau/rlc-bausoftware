import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=False,conf=0.32):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":conf,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})
def p(x,lo=0.55,hi=2.1): return x*lo,x,x*hi

# Fachkräfte / Personal
personal=[
("Bauhelfer",42),("Facharbeiter Tiefbau",58),("Vorarbeiter",68),("Polier",78),
("Rohrleitungsbauer",64),("Kanalbauer",62),("Straßenbauer",60),("Pflasterer",58),
("Asphaltbauer",60),("Maschinist",66),("LKW Fahrer",58),("Saugbaggerfahrer",72),
("Vermessungstechniker",75),("Bauleiter",95),("SiGeKo",90),("Schweißfachkraft",82),
("Elektrofachkraft",78),("Glasfasermonteur",68),("Spleißtechniker",82),("Kampfmittelaufsicht",110)
]
for name,base in personal:
  for art,fac in [("Regiestunde",1),("Nachtarbeit",1.35),("Wochenende",1.7),("Erschwernis",1.25)]:
    add(f"{name} {art}",f"{name} {art} inkl. Lohnnebenkosten.","h","Personal/Fachkräfte","Regie/Personal",*p(base*fac),art!="Regiestunde")

# Maschinen / Geräte
geraete=[
("Minibagger 1,5t",45),("Minibagger 2,5t",55),("Kompaktbagger 5t",72),("Mobilbagger 12t",95),
("Mobilbagger 16t",115),("Kettenbagger 20t",135),("Kettenbagger 30t",175),("Radlader klein",85),
("Radlader mittel",105),("Radlader groß",145),("Dumper",75),("Walze",75),("Rüttelplatte",18),
("Stampfer",16),("Grabenwalze",55),("Asphaltschneider",28),("Kernbohrgerät",38),
("Kompressor",35),("Stromaggregat",28),("Pumpenanlage",65),("Schmutzwasserpumpe",55),
("Saugbagger",260),("Kehrmaschine",130),("Fräse klein",95),("Asphaltfertiger klein",180),
("Tieflader",140),("LKW 3-Achser",85),("LKW 4-Achser",98),("Sattelkipper",115)
]
for name,base in geraete:
  add(f"{name} Einsatzstunde",f"{name} Einsatzstunde inkl. Betriebskosten.","h","Geräte/Maschinen","Maschinensatz",*p(base))
  add(f"{name} Tagessatz",f"{name} Tagessatz inkl. Vorhaltung.","Tag","Geräte/Maschinen","Maschinensatz",base*4.5,base*7.5,base*12)

# Kolonnen / Leistungsansätze
kolonnen=[
("Tiefbaukolonne 2 Mann",115),("Tiefbaukolonne 3 Mann",170),("Tiefbaukolonne 4 Mann",225),
("Rohrbaukolonne",190),("Kanalbaukolonne",185),("Asphaltkolonne",210),
("Pflasterkolonne",165),("Glasfaserkolonne",120),("Kabelbaukolonne",175),
("Vermessungstrupp",145),("Sanierungskolonne Kanal",210)
]
for name,base in kolonnen:
  for zus,fac in [("normal",1),("mit Bagger",1.55),("mit LKW",1.75),("beengte Lage",1.45),("unter Verkehr",1.8)]:
    add(f"{name} {zus}",f"{name} {zus} als kombinierter Leistungsansatz.","h","Kolonnen","Leistungsansatz",*p(base*fac),zus!="normal")

# Noch fehlende Tiefbau-Nebenleistungen
items=[
("Baustraße herstellen","m²",45),("Baustraße zurückbauen","m²",18),("Bauzaun mit Sichtschutz stellen","m",28),
("Baustellenbeleuchtung herstellen","Psch",1800),("Winterdienst Baustelle","Tag",450),
("Wassergebundene Decke herstellen","m²",45),("Schachtdeckel provisorisch sichern","St",180),
("Stahlplatte über Fahrbahn verlegen","m²",145),("Mobile Überfahrt herstellen","St",2800),
("Fußgängerbrücke provisorisch","St",3200),("Rohrprovisorium herstellen","Psch",2500),
("Notöffnung Graben herstellen","Psch",1800),("Reparaturstelle sichern","St",650),
("Bodenprobe entnehmen","St",180),("Laboranalyse Boden","St",420),
("Materialprobe Asphalt","St",380),("Eigenüberwachung durchführen","Psch",950),
("Fremdüberwachung durchführen","Psch",1800),("Abnahme mit Netzbetreiber","Psch",550),
("Mängelbeseitigung klein","Psch",850),("Mängelbeseitigung groß","Psch",2500)
]
for s,u,b in items:
  for stufe,fac in [("klein",0.75),("normal",1),("groß",1.8)]:
    add(f"{s} {stufe}",f"{s} {stufe} inkl. Nebenleistungen und Dokumentation.",u,"Tiefbau Nebenleistungen","Abschluss/Sonderleistung",*p(b*fac),u=="Psch" and b>1000)

payload={"sourceName":"rlc-global-tiefbau-seed-v41-abschluss","sourceType":"manual-seed-v41","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
