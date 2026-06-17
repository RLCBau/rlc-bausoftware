import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]
def add(s,l,u,g,c,a,b,d,ctx=True):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":0.25,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})
def p(x): return x*0.45,x,x*3.0

dns=[25,32,40,50,63,80,100,125,150,200,250,300,400]
base={25:35,32:42,40:50,50:65,63:78,80:95,100:135,125:175,150:220,200:360,250:520,300:780,400:1250}
for mat,mf in [("PE-HD Gasleitung",1.0),("Stahl Gasleitung",1.8),("Guss Gasleitung",1.6)]:
  for dn in dns:
    for tiefe,tf in [("bis 1,20 m",1.0),("bis 1,50 m",1.2),("bis 2,00 m",1.55),("über 2,00 m",2.1)]:
      avg=base[dn]*mf*tf
      add(f"{mat} DN{dn} verlegen {tiefe}",f"{mat} DN{dn} bei Tiefe {tiefe} liefern, verlegen, verbinden und prüfen.","m","Gasleitungsbau","Gasleitung",*p(avg))
for dn in dns:
  for typ,tf in [("Absperrarmatur",1.0),("Schieberkappe",0.25),("Hausanschluss",2.8),("Druckprüfung",1.6),("Anschluss Bestand",2.2),("Außerbetriebnahme",1.2)]:
    avg=base[dn]*tf*8
    add(f"Gas {typ} DN{dn}",f"Gas {typ} DN{dn} inkl. Nebenleistungen und Dokumentation.","St" if typ not in ["Druckprüfung","Außerbetriebnahme"] else "Psch","Gasleitungsbau","Armatur/Anschluss",*p(avg))
payload={"sourceName":"rlc-global-tiefbau-seed-v25-gas-voll","sourceType":"manual-seed-v25","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
