import json, urllib.request

API_URL="http://localhost:4000/api/global-knowledge/import"
rows=[]

def add(short,long,unit,gewerk,cat,pmin,pavg,pmax,ctx=False,conf=0.32):
    rows.append({
        "shortText":short,"longText":long,"unit":unit,"gewerk":gewerk,"category":cat,
        "priceMin":round(float(pmin),2),"priceAvg":round(float(pavg),2),"priceMax":round(float(pmax),2),
        "confidence":conf,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True
    })

def p(avg,low=0.55,high=2.1): return avg*low,avg,avg*high

# Standardschächte nach Material / DN / Tiefe
materials=[("Beton",1.0),("PP",0.75),("PE",0.9),("GFK",1.35)]
dns=[(400,950),(600,1400),(800,2100),(1000,2800),(1200,3900),(1500,6200),(2000,9800),(2500,14500)]
depths=[("bis 1,50 m",1.0),("bis 2,50 m",1.35),("bis 4,00 m",1.9),("über 4,00 m",2.8)]

for mat,mf in materials:
    for dn,base in dns:
        for depth,df in depths:
            avg=base*mf*df
            add(f"{mat} Schacht DN{dn} herstellen {depth}",f"{mat} Schacht DN{dn} {depth} liefern, versetzen, anschließen und verfüllen.","St","Schachtbau","Standardschacht",*p(avg),depth=="über 4,00 m")

# Schachttypen
types=[
("Kontrollschacht",1.0),("Revisionsschacht",0.85),("Drosselschacht",1.8),("Pumpenschacht",2.4),
("Regenwasserschacht",1.15),("Schmutzwasserschacht",1.2),("Kabelzugschacht",0.75),("Sonderschacht",2.8)
]
for typ,tf in types:
    for dn,base in dns:
        if dn < 600 and typ in ["Drosselschacht","Pumpenschacht","Sonderschacht"]: continue
        avg=base*tf
        add(f"{typ} DN{dn} setzen",f"{typ} DN{dn} liefern, setzen, anschließen und betriebsfertig herstellen.","St","Schachtbau","Schachttyp",*p(avg),tf>=1.8)

# Schachtbauteile
parts=[
("Schachtunterteil",1500),("Schachtring 250 mm",220),("Schachtring 500 mm",420),("Schachtring 1000 mm",780),
("Konus",650),("Abdeckplatte",580),("Ausgleichsring",120),("Steigeisen",35),
("Schachtfutter",180),("Dichtung",95),("Gerinne herstellen",480),("Berme herstellen",260)
]
for part,base in parts:
    for dn,fac in [(600,0.75),(800,0.9),(1000,1.0),(1200,1.25),(1500,1.65),(2000,2.4)]:
        add(f"{part} DN{dn} einbauen",f"{part} DN{dn} liefern und einbauen.","St","Schachtbau","Schachtbauteile",*p(base*fac))

# Abdeckungen / Aufsätze
classes=[("A15",180),("B125",460),("C250",650),("D400",850),("E600",1200),("F900",1600)]
forms=[("rund",1.0),("eckig",1.15),("tagwasserdicht",1.35),("verschraubt",1.25),("belüftet",1.1)]
for cls,base in classes:
    for form,ff in forms:
        add(f"Schachtabdeckung {cls} {form} einbauen",f"Schachtabdeckung Klasse {cls} {form} liefern, höhengerecht einbauen und befestigen.","St","Schachtbau","Schachtabdeckung",*p(base*ff))

# Anschlüsse / Einbindungen
for dn,base in [(50,65),(75,85),(100,120),(125,150),(150,180),(200,260),(250,340),(300,420),(400,680),(500,920),(600,1250)]:
    for typ,tf in [("Rohreinführung",1.0),("Kernbohrung",1.3),("Schachtdichtung",0.8),("Anschluss an Schacht",1.6),("Blindverschluss",0.55)]:
        add(f"{typ} DN{dn} am Schacht herstellen",f"{typ} DN{dn} am Schacht herstellen inkl. Abdichtung.","St","Schachtbau","Anschluss",*p(base*tf),typ=="Anschluss an Schacht")

payload={"sourceName":"rlc-global-tiefbau-seed-v17-schachtbau","sourceType":"manual-seed-v17","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
