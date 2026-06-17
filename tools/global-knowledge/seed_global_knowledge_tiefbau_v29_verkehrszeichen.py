import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=False):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":0.32,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})

def p(x): return x*0.55,x,x*2.1

for typ,b in [
("Verkehrszeichen klein",120),("Verkehrszeichen mittel",180),("Verkehrszeichen groß",320),
("Zusatzzeichen",95),("Wegweiser klein",450),("Wegweiser groß",950),
("Baustellenschild",180),("Vorwegweiser",1250)
]:
  for arb,f in [("liefern und montieren",1.0),("demontieren",0.25),("umsetzen",0.55),("reinigen",0.12)]:
    add(f"{typ} {arb}",f"{typ} {arb} inkl. Befestigungsmaterial.","St","Straßenausstattung","Verkehrszeichen",*p(b*f))

for typ,b in [
("Rohrpfosten",95),("Vierkantpfosten",120),("Schildermast",180),
("Fundament Verkehrszeichen",160),("Anfahrschutz",280),("Poller",145),
("Absperrpfosten",165),("Sperrpfosten herausnehmbar",240)
]:
  for arb,f in [("setzen",1.0),("aufnehmen",0.25),("ersetzen",1.15)]:
    add(f"{typ} {arb}",f"{typ} {arb} inkl. Nebenleistungen.","St","Straßenausstattung","Pfosten/Fundamente",*p(b*f))

for typ,b in [
("Leitpfosten",95),("Schutzplanke",85),("Geländer",145),("Fußgängergeländer",165),
("Schrammbord",95),("Fahrradbügel",180),("Baumschutzbügel",220)
]:
  unit="m" if typ in ["Schutzplanke","Geländer","Fußgängergeländer","Schrammbord"] else "St"
  for arb,f in [("liefern und montieren",1.0),("demontieren",0.25),("instandsetzen",0.45)]:
    add(f"{typ} {arb}",f"{typ} {arb} inkl. Nebenleistungen.",unit,"Straßenausstattung","Schutz/Ausstattung",*p(b*f))

payload={"sourceName":"rlc-global-tiefbau-seed-v29-verkehrszeichen","sourceType":"manual-seed-v29","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
