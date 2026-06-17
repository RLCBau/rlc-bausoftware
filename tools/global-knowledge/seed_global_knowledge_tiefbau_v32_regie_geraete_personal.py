import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=False):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":0.32,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})
def p(x): return x*0.65,x,x*1.9

personal=[("Bauhelfer",42),("Facharbeiter",58),("Vorarbeiter",68),("Polier",78),("Maschinist",66),("LKW Fahrer",58),("Rohrleitungsbauer",64),("Kanalbauer",62),("Pflasterer",58),("Vermesser",75),("Bauleiter",95)]
for name,base in personal:
  for zus,fac in [("normal",1.0),("Nacht",1.35),("Samstag",1.5),("Sonntag",1.9),("Erschwernis",1.25)]:
    add(f"{name} Regiestunde {zus}",f"{name} Regiestunde {zus} inkl. Lohnnebenkosten.","h","Regie","Personal",*p(base*fac),zus!="normal")

geraete=[("Rüttelplatte",18),("Stampfer",16),("Minibagger 2t",55),("Bagger 5t",72),("Mobilbagger 16t",115),("Kettenbagger 25t",155),("Radlader",105),("Walze",75),("LKW 4-Achser",98),("Sattelkipper",115),("Tieflader",140),("Saugbagger",260),("Kehrmaschine",130)]
for name,base in geraete:
  add(f"{name} Regiestunde",f"{name} Regiestunde inkl. Betriebskosten.","h","Regie","Geräte",*p(base))
  add(f"{name} Tagessatz",f"{name} Tagessatz inkl. Vorhaltung.","Tag","Regie","Geräte",base*4.5,base*7.5,base*12)

kolonnen=[("Tiefbaukolonne 2 Mann",115),("Tiefbaukolonne 3 Mann",170),("Tiefbaukolonne 4 Mann",225),("Rohrbaukolonne",190),("Kanalbaukolonne",185),("Pflasterkolonne",165),("Glasfaserkolonne",120)]
for name,base in kolonnen:
  for zus,fac in [("normal",1.0),("mit Bagger",1.55),("mit LKW",1.7),("Nacht",1.35),("Wochenende",1.8)]:
    add(f"{name} Regie {zus}",f"{name} Regie {zus}.","h","Regie","Kolonne",*p(base*fac),zus!="normal")

payload={"sourceName":"rlc-global-tiefbau-seed-v32-regie-geraete-personal","sourceType":"manual-seed-v32","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
