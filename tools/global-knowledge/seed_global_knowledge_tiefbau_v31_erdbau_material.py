import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=False):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":0.32,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})

def p(x): return x*0.55,x,x*2.1

materials=[
("Oberboden",14),("Mutterboden",16),("Auffüllmaterial",28),("Frostschutz 0/32",45),
("Frostschutz 0/45",48),("Schotter 0/32",42),("Schotter 0/45",46),
("Kies 0/16",36),("Kies 0/32",38),("Sand 0/4",32),("Brechsand",38),
("Splitt 2/5",42),("Recyclingmaterial",30),("Flüssigboden",95),
("Bodenaustauschmaterial",55)
]

arbeiten=[
("auskoffern",1.0),("laden",0.35),("seitlich lagern",0.25),("aufnehmen",0.45),
("liefern und einbauen",1.35),("auffüllen",0.85),("profilgerecht einbauen",1.0),
("lagenweise verdichten",0.55),("abfahren zur Kippe",0.75),("auf Kippe fahren",0.85),
("entsorgen",1.25),("umladen",0.35),("umlagern auf Baustelle",0.3)
]

for mat,base in materials:
  for arb,fac in arbeiten:
    ctx = arb in ["abfahren zur Kippe","auf Kippe fahren","entsorgen"]
    add(
      f"{mat} {arb}",
      f"{mat} {arb} inkl. Nebenleistungen, Transportanteil soweit erforderlich.",
      "m³",
      "Erdbau",
      "Auskofferung/Auffüllung/Materialbewegung",
      *p(base*fac),
      ctx
    )

# Transport nach Entfernung
for mat,base in [("Boden",18),("Aushub",18),("Asphaltaufbruch",28),("Bauschutt",32),("Schotter",20),("Oberboden",16)]:
  for km,fac in [("bis 5 km",0.8),("bis 10 km",1.0),("bis 20 km",1.45),("bis 50 km",2.4),("über 50 km",3.5)]:
    add(
      f"{mat} transportieren {km}",
      f"{mat} laden, transportieren und abkippen, Entfernung {km}.",
      "t",
      "Transport",
      "Kippe/Transport",
      *p(base*fac),
      True
    )

# Deponie / Kippgebühren
for klasse,base in [
("Z0",18),("Z1.1",32),("Z1.2",48),("Z2",85),
("DK0",95),("DKI",130),("DKII",190),("teerhaltig",160),("gefährlicher Abfall",260)
]:
  add(
    f"Kippgebühr Boden {klasse}",
    f"Kippgebühr / Deponiegebühr für Boden {klasse} inkl. Nachweisführung.",
    "t",
    "Entsorgung",
    "Kippgebühr/Deponie",
    *p(base),
    True
  )

payload={"sourceName":"rlc-global-tiefbau-seed-v31-erdbau-material","sourceType":"manual-seed-v31","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
