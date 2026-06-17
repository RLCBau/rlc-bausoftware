import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=False):
    rows.append({
        "shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,
        "priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),
        "confidence":0.32,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True
    })

def p(x): return x*0.55,x,x*2.1

dns=[25,32,40,50,63,80,100,125,150,200,250,300,400,500,600]
base={25:35,32:42,40:50,50:65,63:75,80:95,100:135,125:180,150:220,200:360,250:520,300:780,400:1250,500:1850,600:2600}

parts=[
("Schieberkreuz",2.8),("Flanschadapter",1.4),("Multifunktionskupplung",1.6),
("Reparaturkupplung",1.5),("Überschiebmuffe",1.2),("Rohrkupplung zugfest",1.35),
("Rohrkupplung nicht zugfest",1.05),("Passstück",1.25),("Ausbaustück",1.8),
("Kompensator",2.2),("Druckreduzierstück",2.4),("Entleerungsventil",1.5),
("Be- und Entlüftungsgarnitur",2.0),("Anbohrarmatur",1.25),
("Hausanschlussarmatur",1.45),("Absperrklappe",2.1),("Rückflussverhinderer",1.9),
("Schmutzfänger",1.7),("Wasserzählerstrecke",2.5),("Messstrecke",2.3)
]

for dn in dns:
  for part,fac in parts:
    avg=base[dn]*fac
    add(
      f"{part} DN{dn} montieren",
      f"{part} DN{dn} liefern, montieren, abdichten und prüfen.",
      "St","Rohrleitungsbau","Armaturen/Sonderteile",
      *p(avg),
      ctx=part in ["Druckreduzierstück","Messstrecke","Wasserzählerstrecke"]
    )

materials=[("PE-HD",1.0),("GGG",1.35),("Stahl",1.55),("Edelstahl",2.2),("PVC",0.85),("PP",0.9)]
works=[("schweißen",1.2),("flanschen",1.0),("klemmen",0.85),("abdichten",0.65),("prüfen",0.45)]

for mat,mf in materials:
  for dn in dns:
    for work,wf in works:
      avg=base[dn]*mf*wf
      add(
        f"{mat} Rohrverbindung DN{dn} {work}",
        f"{mat} Rohrverbindung DN{dn} {work} inkl. Nebenleistungen.",
        "St","Rohrleitungsbau","Rohrverbindungen",
        *p(avg)
      )

payload={"sourceName":"rlc-global-tiefbau-seed-v39-rohr-spezial","sourceType":"manual-seed-v39","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
