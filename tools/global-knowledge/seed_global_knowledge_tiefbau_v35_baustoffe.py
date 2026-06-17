import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=False):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":0.32,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})
def p(x): return x*0.55,x,x*2.1

materials=[
("Sand 0/2",28),("Sand 0/4",32),("Sand 0/8",35),("Brechsand",38),
("Kies 0/16",36),("Kies 0/32",38),("Kies 8/16",42),("Kies 16/32",45),
("Schotter 0/32",42),("Schotter 0/45",46),("Schotter 0/56",49),
("Frostschutz 0/32",45),("Frostschutz 0/45",48),("Mineralbeton",52),
("RC Material 0/32",30),("RC Material 0/45",34),("Splitt 2/5",42),
("Splitt 5/8",45),("Splitt 8/11",48),("Lava",55),("Flüssigboden",95),
("Bettungsmaterial",42),("Verfüllmaterial",38),("Bodenaustauschmaterial",55),
("Oberboden",14),("Mutterboden",16)
]

works=[
("liefern",1.0),("liefern und einbauen",1.35),("einbauen",0.55),
("lagenweise einbauen",0.75),("verdichten",0.35),("profilgerecht einbauen",0.8),
("laden",0.25),("lagern",0.2),("umladen",0.3),("transportieren",0.55)
]

for mat,base in materials:
  for work,fac in works:
    add(f"{mat} {work}",f"{mat} {work} inkl. Nebenleistungen.","m³","Baustoffe","Schüttgüter/Recycling",*p(base*fac),work=="transportieren")

for bk,base in [("BK1",18),("BK2",28),("BK3",36),("BK4",42),("BK5",55),("BK6",78),("BK7",120)]:
  for work,fac in [("lösen",0.55),("laden",0.35),("fördern",0.4),("seitlich lagern",0.25),("abfahren",0.75),("entsorgen",1.2)]:
    add(f"Bodenklasse {bk} {work}",f"Bodenklasse {bk} {work} inkl. Nebenleistungen.","m³","Erdbau","Bodenklassen",*p(base*fac),work in ["abfahren","entsorgen"])

payload={"sourceName":"rlc-global-tiefbau-seed-v35-baustoffe","sourceType":"manual-seed-v35","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
