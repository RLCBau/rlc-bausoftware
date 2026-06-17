import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]
def add(s,l,u,g,c,a,b,d,ctx=False,conf=0.32):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":conf,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})
def p(x): return x*0.55,x,x*2.1

dns=[25,32,40,50,63,80,100,125,150,200,250,300,400,500,600]
base={25:28,32:32,40:38,50:45,63:55,80:65,100:85,125:110,150:135,200:210,250:310,300:420,400:680,500:980,600:1350}
for mat,mf in [("PE-HD",1.0),("GGG",1.55),("PVC-U",0.95),("Stahl",1.75),("Edelstahl",2.4)]:
  for dn in dns:
    for tiefe,tf in [("bis 1,20 m",1.0),("bis 1,50 m",1.2),("bis 2,00 m",1.55),("über 2,00 m",2.1)]:
      avg=base[dn]*mf*tf
      add(f"{mat} Wasserleitung DN{dn} verlegen {tiefe}",f"{mat} Wasserleitung DN{dn} {tiefe} liefern, verlegen, verbinden und prüfen.","m","Wasserbau","Wasserleitung",*p(avg),tiefe=="über 2,00 m")
for dn in dns:
  for typ,tf in [("Absperrschieber",1.0),("Einbaugarnitur",0.35),("Straßenkappe",0.25),("Hydrant",2.1),("Druckprüfung",1.5),("Spülung",0.7),("Desinfektion",0.9),("Bestandsanschluss",2.0)]:
    avg=base[dn]*tf*8
    add(f"Wasser {typ} DN{dn}",f"Wasser {typ} DN{dn} liefern, montieren bzw. durchführen.","St" if typ not in ["Druckprüfung","Spülung","Desinfektion"] else "Psch","Wasserbau","Armatur/Prüfung",*p(avg),typ in ["Druckprüfung","Bestandsanschluss"])
payload={"sourceName":"rlc-global-tiefbau-seed-v26-wasser-voll","sourceType":"manual-seed-v26","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
