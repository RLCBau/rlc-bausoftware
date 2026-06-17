import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=True):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":0.25,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})
def p(x): return x*0.45,x,x*3.0

sparten=[("Wasser",3500),("Abwasser",4200),("Regenwasser",3600),("Strom",2800),("Gas",3800),("Glasfaser",950),("Fernwärme",8500)]
laengen=[("bis 5 m",0.75),("bis 10 m",1.0),("bis 20 m",1.6),("bis 30 m",2.2),("über 30 m",3.0)]
oberf=[("Grünfläche",0.8),("Pflaster",1.1),("Asphalt",1.35),("Straße",1.7),("Bestand eng",2.1)]

for sparte,base in sparten:
  for lg,lf in laengen:
    for ob,of in oberf:
      avg=base*lf*of
      add(f"Hausanschluss {sparte} herstellen {lg} {ob}",f"Hausanschluss {sparte} {lg}, Oberfläche {ob}, inkl. Anschluss an Bestand, Graben, Verlegung und Wiederherstellung.","St","Hausanschlüsse",sparte,*p(avg))

for sparte,base in sparten:
  for item,fac in [("Kernbohrung herstellen",0.18),("Gebäudeeinführung herstellen",0.28),("Bestandsanschluss herstellen",0.35),("Provisorium herstellen",0.45),("Druckprüfung durchführen",0.25),("Dokumentation erstellen",0.12)]:
    add(f"Hausanschluss {sparte} {item}",f"Hausanschluss {sparte} {item} inkl. Nebenleistungen.","St","Hausanschlüsse","Nebenleistung",*p(base*fac))

payload={"sourceName":"rlc-global-tiefbau-seed-v31-hausanschluesse","sourceType":"manual-seed-v31","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
