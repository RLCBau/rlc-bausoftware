import json, urllib.request

API_URL="http://localhost:4000/api/global-knowledge/import"
rows=[]

def add(short,long,unit,gewerk,cat,pmin,pavg,pmax,ctx=False,conf=0.32):
    rows.append({
        "shortText":short,"longText":long,"unit":unit,"gewerk":gewerk,"category":cat,
        "priceMin":round(float(pmin),2),"priceAvg":round(float(pavg),2),"priceMax":round(float(pmax),2),
        "confidence":conf,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True
    })

def p(avg,low=0.55,high=2.1):
    return avg*low,avg,avg*high

# Speedpipe / Microduct Varianten
verbands=[
("1x7",6),("2x7",8),("4x7",10),("7x7",11),("12x7",15),("24x7",24),("50x7",48),("72x7",68),("96x7",92),
("1x10",7),("2x10",9),("4x10",11),("7x10",12),("12x10",18),("24x10",26),("50x10",52),("72x10",78),
("1x12",8),("4x12",13),("7x12",14),("12x12",21),("24x12",30),("50x12",60),
("1x14",9),("4x14",15),("7x14",16),("12x14",24),("24x14",34),("50x14",68)
]
lagen=[("offener Graben",1.0),("Schutzrohr",1.25),("Bestandstrasse",1.45),("Hausanschlussgraben",1.35),("innerorts",1.25),("außerorts",0.9)]
for vb,base in verbands:
    for lage,f in lagen:
        add(f"Speedpipe Verband {vb} verlegen {lage}",f"Speedpipe/Mikrorohrverband {vb} in {lage} liefern und verlegen.","m","Glasfaser","Speedpipe",*p(base*f))

# LWL Kabel
fasern=[12,24,48,72,96,144,192,288]
for faser in fasern:
    base=1.4+faser/100
    for art,fac in [("einblasen",1.0),("einziehen",1.8),("in Bestandsrohr einziehen",2.2),("in Schutzrohr einblasen",1.3)]:
        add(f"LWL Kabel {faser} Fasern {art}",f"LWL Kabel {faser} Fasern {art} inkl. Nebenleistungen.","m","Glasfaser","LWL Kabel",*p(base*fac))

# Spleißen / Muffen / Messung
for faser in fasern:
    add(f"LWL Spleiß {faser} Fasern herstellen",f"LWL Spleißarbeiten für {faser} Fasern inkl. Prüfung.","St","Glasfaser","Spleiß",*p(12+faser*0.18))
    add(f"LWL Muffe {faser} Fasern setzen",f"LWL Muffe für {faser} Fasern setzen, spleißen und dokumentieren.","St","Glasfaser","Muffe",*p(350+faser*2.2))
    add(f"OTDR Messung {faser} Fasern durchführen",f"OTDR Messung für {faser} Fasern inkl. Messprotokoll.","St","Glasfaser","Messung",*p(80+faser*0.8),True)

# NVT / POP / Verteiler
for typ,base in [("NVT klein",1800),("NVT mittel",3200),("NVT groß",5200),("POP klein",12000),("POP mittel",25000),("POP groß",48000),("KVz Glasfaser",2800)]:
    for arbeit,fac in [("liefern und setzen",1.0),("anschließen",0.35),("in Betrieb nehmen",0.25),("dokumentieren",0.12)]:
        add(f"{typ} {arbeit}",f"{typ} {arbeit} inkl. Nebenleistungen.","St","Glasfaser","Netzverteiler",*p(base*fac),arbeit in ["in Betrieb nehmen","dokumentieren"])

# FTTH Hausanschlüsse
for typ,base in [("EFH",950),("DHH",1200),("MFH bis 4 WE",2200),("MFH bis 8 WE",3600),("Gewerbe",4500)]:
    for länge,fac in [("bis 5 m",0.75),("bis 10 m",1.0),("bis 20 m",1.6),("bis 30 m",2.2),("über 30 m",3.0)]:
        add(f"FTTH Hausanschluss {typ} {länge} herstellen",f"FTTH Hausanschluss {typ} {länge} herstellen inkl. Einführung und Dokumentation.","St","Glasfaser","Hausanschluss",*p(base*fac),True)

# Zubehör
for item,unit,base in [
("Dichtkappe Mikrorohr montieren","St",6),("Doppelsteckmuffe montieren","St",8),("Einzelzugabdichtung montieren","St",12),
("Gasblocker montieren","St",18),("Mikrorohr kalibrieren","m",0.25),("Speedpipe Druckprüfung","m",0.45),
("Rohrende abdichten","St",9),("Kabelmarkierung herstellen","St",4),("Trassenwarnband Glasfaser verlegen","m",3.5),
("Kabelabdeckhaube Glasfaser verlegen","m",9),("Rohrschutzmatte Glasfaser verlegen","m",22)
]:
    add(item,item+" inkl. Nebenleistungen.",unit,"Glasfaser","Zubehör",*p(base))

payload={"sourceName":"rlc-global-tiefbau-seed-v15-glasfaser","sourceType":"manual-seed-v15","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
