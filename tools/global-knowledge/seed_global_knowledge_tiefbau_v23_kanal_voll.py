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

materials=[
("KG",1.0),("PP",1.15),("PVC-U",1.05),("PE-HD",1.25),
("Steinzeug",1.45),("Beton",1.35),("Stahlbeton",1.65),("GFK",1.8)
]

dns=[100,125,150,200,250,300,400,500,600,700,800,900,1000,1200,1400,1600]
base_map={100:55,125:62,150:75,200:105,250:145,300:190,400:290,500:390,600:520,700:650,800:780,900:960,1000:1150,1200:1550,1400:2100,1600:2800}

depths=[("bis 1,25 m",1.0),("bis 1,75 m",1.25),("bis 2,50 m",1.65),("bis 3,50 m",2.2),("über 3,50 m",3.0)]
systems=[("Schmutzwasser",1.05),("Regenwasser",1.0),("Mischwasser",1.15),("Drainagekanal",0.85)]

for mat,mf in materials:
    for dn in dns:
        base=base_map[dn]*mf
        for system,sf in systems:
            for depth,df in depths:
                add(
                    f"{system} {mat} Rohr DN{dn} verlegen {depth}",
                    f"{system} {mat} Rohr DN{dn} bei Tiefe {depth} liefern, verlegen, ausrichten und anschließen.",
                    "m","Kanalbau",f"{system} {mat}",*p(base*sf*df),ctx=depth=="über 3,50 m"
                )

# Schächte / Sonderbauwerke
for typ,tf in [
("Revisionsschacht",0.85),("Kontrollschacht",1.0),("Absturzschacht",1.65),
("Drosselschacht",1.9),("Trennbauwerk",2.8),("Regenrückhalteschacht",2.4),
("Pumpenschacht",2.6),("Sonderschacht",3.2)
]:
    for dn,base in [(600,1600),(800,2100),(1000,2800),(1200,3900),(1500,6200),(2000,9800),(2500,14500)]:
        for depth,df in [("bis 1,50 m",1.0),("bis 2,50 m",1.35),("bis 4,00 m",1.9),("über 4,00 m",2.8)]:
            add(
                f"{typ} DN{dn} herstellen {depth}",
                f"{typ} DN{dn} {depth} liefern, versetzen, anschließen und verfüllen.",
                "St","Kanalbau","Schacht/Sonderbauwerk",*p(base*tf*df),ctx=tf>=1.65 or depth=="über 4,00 m"
            )

# Anschlüsse / Formstücke
for dn in [100,125,150,200,250,300,400,500,600]:
    base=base_map.get(dn,300)
    for typ,tf in [
        ("Abzweig",1.0),("Bogen",0.75),("Übergang",0.9),("Reduzierung",0.85),
        ("Sattelstück",0.65),("Anschluss an Bestand",1.8),("Blindverschluss",0.45)
    ]:
        add(
            f"Kanal {typ} DN{dn} herstellen",
            f"Kanal {typ} DN{dn} liefern, montieren und abdichten.",
            "St","Kanalbau","Formstück/Anschluss",*p(base*tf),ctx="Bestand" in typ
        )

# Prüfung / Reinigung / Sanierung
for item,unit,base,ctx in [
("Kanal TV-Inspektion","m",4.5,False),("Kanal reinigen","m",3.8,False),
("Kanal Hochdruckreinigung","m",8.5,False),("Kanal Dichtheitsprüfung Haltung","Psch",1500,True),
("Schacht Dichtheitsprüfung","St",280,True),("Kurzliner DN150 einbauen","St",850,True),
("Kurzliner DN200 einbauen","St",1150,True),("Inliner Sanierung DN200","m",180,True),
("Inliner Sanierung DN300","m",260,True),("Schachtsanierung mineralisch","m²",180,True),
("Wurzeleinwuchs fräsen","St",380,True),("Kanalortung durchführen","m",2.8,False)
]:
    add(item,item+" inkl. Dokumentation und Nebenleistungen.",unit,"Kanalbau","Prüfung/Sanierung",*p(base),ctx)

payload={"sourceName":"rlc-global-tiefbau-seed-v23-kanal-voll","sourceType":"manual-seed-v23","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
