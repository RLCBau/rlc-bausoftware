import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=False):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":0.32,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})

def p(x): return x*0.55,x,x*2.1

for typ,b in [("Lichtmast 4 m",650),("Lichtmast 6 m",850),("Lichtmast 8 m",1200),("Lichtmast 10 m",1650),("Auslegermast",2100)]:
  for arb,f in [("liefern und setzen",1.0),("demontieren",0.25),("umsetzen",0.65),("Fundament herstellen",0.45)]:
    add(f"{typ} {arb}",f"{typ} {arb} inkl. Nebenleistungen.","St","Straßenbeleuchtung","Lichtmast",*p(b*f))

for typ,b in [("LED Leuchte klein",380),("LED Leuchte mittel",650),("LED Leuchte groß",950),("Mastaufsatzleuchte",520),("Auslegerleuchte",780)]:
  for arb,f in [("montieren",1.0),("demontieren",0.25),("anschließen",0.35),("prüfen",0.18)]:
    add(f"{typ} {arb}",f"{typ} {arb} inkl. Anschluss und Nebenleistungen.","St","Straßenbeleuchtung","Leuchten",*p(b*f))

for item,u,b in [
("Kabel Straßenbeleuchtung verlegen","m",16),("Leerrohr Straßenbeleuchtung DN50 verlegen","m",18),
("Fundament Lichtmast herstellen","St",420),("Erdung Lichtmast herstellen","St",180),
("Verteilerschrank Beleuchtung setzen","St",2200),("Beleuchtungskabel prüfen","Psch",750),
("Lichtpunkt einmessen","St",45),("Bestandsleuchte sichern","St",180)
]:
  add(item,item+" inkl. Nebenleistungen.",u,"Straßenbeleuchtung","Kabel/Fundament/Prüfung",*p(b),item in ["Beleuchtungskabel prüfen","Bestandsleuchte sichern"])

payload={"sourceName":"rlc-global-tiefbau-seed-v28-strassenbeleuchtung","sourceType":"manual-seed-v28","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
