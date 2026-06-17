import json, urllib.request

API_URL="http://localhost:4000/api/global-knowledge/import"
rows=[]

def add(short,long,unit,gewerk,cat,pmin,pavg,pmax,ctx=True,conf=0.25):
    rows.append({
        "shortText":short,"longText":long,"unit":unit,"gewerk":gewerk,"category":cat,
        "priceMin":round(float(pmin),2),"priceAvg":round(float(pavg),2),"priceMax":round(float(pmax),2),
        "confidence":conf,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True
    })

def p(avg,low=0.45,high=3.0): return avg*low,avg,avg*high

systems=[("KMR Fernwärmerohr",1.0),("Flexibles Fernwärmerohr",0.85),("Stahlmantelrohr",1.8),("Doppelrohr Fernwärme",1.35)]
dns=[25,32,40,50,65,80,100,125,150,200,250,300,400]
base={25:120,32:145,40:175,50:220,65:310,80:420,100:580,125:760,150:980,200:1450,250:2100,300:2900,400:4800}

for sys,sf in systems:
    for dn in dns:
        for tiefe,tf in [("bis 1,20 m",1.0),("bis 1,80 m",1.3),("bis 2,50 m",1.8),("über 2,50 m",2.4)]:
            avg=base[dn]*sf*tf
            add(f"{sys} DN{dn} verlegen {tiefe}",f"{sys} DN{dn} bei Tiefe {tiefe} liefern, verlegen, verbinden, dämmen und prüfen.","m","Fernwärmebau","Fernwärmeleitung",*p(avg))

for dn in dns:
    b=base[dn]
    for typ,tf in [("Bogen",1.0),("T-Stück",1.45),("Reduzierung",1.1),("Muffe",0.8),("Endabschluss",0.65),("Absperrarmatur",2.2),("Festpunkt",1.8),("Kompensator",2.4)]:
        add(f"Fernwärme {typ} DN{dn} montieren",f"Fernwärme {typ} DN{dn} liefern, montieren, dämmen und dokumentieren.","St","Fernwärmebau","Formstücke/Armaturen",*p(b*tf))

for item,unit,avg in [
("Fernwärme Hausanschluss herstellen","St",8500),("Fernwärme Anschluss an Bestand","St",4200),
("Fernwärme Druckprüfung","Psch",2500),("Fernwärme Spülung","Psch",1800),
("Fernwärme Schweißnahtprüfung","St",220),("Fernwärme Muffenmontage dokumentieren","St",95),
("Leckwarnsystem Fernwärme prüfen","Psch",950),("Provisorische Fernwärmeleitung herstellen","Psch",12000)
]:
    add(item,item+" abhängig von Bestand, Netzbetreiber, Dauer und Dokumentation.",unit,"Fernwärmebau","Prüfung/Anschluss",*p(avg))

payload={"sourceName":"rlc-global-tiefbau-seed-v24-fernwaerme-voll","sourceType":"manual-seed-v24","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
