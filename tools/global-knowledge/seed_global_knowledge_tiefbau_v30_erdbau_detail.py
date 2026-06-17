import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=False):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":0.32,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})

def p(x): return x*0.55,x,x*2.1

boden=[("BK2",28),("BK3",36),("BK4",42),("BK5",55),("BK6",78),("BK7",120)]
tiefen=[("bis 1 m",0.9),("bis 2 m",1.3),("bis 3 m",1.8),("bis 5 m",2.6)]
arbeiten=[("lösen",0.45),("laden",0.25),("transportieren",0.35),("seitlich lagern",0.2),("verfüllen",0.45),("verdichten",0.35),("komplett herstellen",1.0)]

for bk,b in boden:
  for tiefe,tf in tiefen:
    for arb,af in arbeiten:
      avg=b*tf*af
      add(f"Erdbau {bk} {tiefe} {arb}",f"Erdbau {bk} {tiefe} {arb} inkl. Nebenleistungen.","m³","Erdbau","Bodenbewegung",*p(avg),tiefe in ["bis 5 m"])

for item,u,b in [
("Baugrube herstellen", "m³", 65),("Baugrube verfüllen", "m³", 42),
("Böschung herstellen", "m²", 18),("Böschung sichern", "m²", 38),
("Planum herstellen", "m²", 8),("Planum nachverdichten", "m²", 5),
("Oberboden abtragen", "m³", 14),("Oberboden andecken", "m³", 12),
("Humusierung herstellen", "m²", 9),("Geotextil verlegen", "m²", 7),
("Geogitter verlegen", "m²", 12),("Bodenaustausch durchführen", "m³", 58)
]:
  add(item,item+" inkl. Nebenleistungen.",u,"Erdbau","Baugrube/Fläche",*p(b))

payload={"sourceName":"rlc-global-tiefbau-seed-v30-erdbau-detail","sourceType":"manual-seed-v30","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
