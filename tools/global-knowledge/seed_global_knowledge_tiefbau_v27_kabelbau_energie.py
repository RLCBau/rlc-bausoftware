import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=False):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":0.32,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})

def p(x): return x*0.55,x,x*2.1

dns=[40,50,63,75,90,110,125,160,200,250,300]
base={40:14,50:18,63:22,75:24,90:28,110:36,125:46,160:58,200:88,250:135,300:190}

for mat,mf in [("PE-HD",1.0),("PVC",0.85),("PP",0.95),("Stahl",2.4)]:
  for dn in dns:
    for lage,lf in [("offener Graben",1.0),("Straßenquerung",1.45),("Bestandstrasse",1.35),("Hausanschluss",1.25)]:
      avg=base[dn]*mf*lf
      add(f"{mat} Kabelschutzrohr Energie DN{dn} {lage} verlegen",f"{mat} Kabelschutzrohr DN{dn} für Energie {lage} liefern und verlegen.","m","Kabelbau Energie","Kabelschutzrohr",*p(avg),lage!="offener Graben")

for typ,b in [("Niederspannungskabel",18),("Mittelspannungskabel",42),("Hausanschlusskabel",22),("Straßenbeleuchtungskabel",16),("Erdungskabel",12)]:
  for lage,lf in [("im Graben",1.0),("im Schutzrohr",1.25),("in Bestandstrasse",1.55),("innerorts",1.35),("außerorts",0.9)]:
    add(f"{typ} {lage} verlegen",f"{typ} {lage} verlegen inkl. Nebenleistungen.","m","Kabelbau Energie","Kabelverlegung",*p(b*lf),lage!="im Graben")

for ebene,b in [("Niederspannung",380),("Mittelspannung",1250)]:
  for item,f in [("Muffe montieren",1.0),("Endverschluss montieren",0.75),("Kabelprüfung durchführen",1.5),("Kabelmessung dokumentieren",0.25),("Fehlerortung durchführen",2.2)]:
    add(f"{ebene} {item}",f"{ebene} {item} inkl. Prüfung und Dokumentation.","St" if "montieren" in item else "Psch","Kabelbau Energie","Muffen/Prüfung",*p(b*f),True)

for item,u,b in [
("Kabelverteilerschrank klein setzen","St",1800),("Kabelverteilerschrank groß setzen","St",3200),
("Trafostation Fundament herstellen","St",8500),("Trafostation setzen","St",28000),
("Kabelzugschacht Energie klein setzen","St",1400),("Kabelzugschacht Energie mittel setzen","St",2200),("Kabelzugschacht Energie groß setzen","St",3600),
("Hausanschlusssäule setzen","St",850),("Zählersäule setzen","St",1200)
]:
  add(item,item+" inkl. Tiefbau und Nebenleistungen.",u,"Kabelbau Energie","Station/Schacht/Verteiler",*p(b),True if "Trafostation" in item else False)

payload={"sourceName":"rlc-global-tiefbau-seed-v27-kabelbau-energie","sourceType":"manual-seed-v27","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
