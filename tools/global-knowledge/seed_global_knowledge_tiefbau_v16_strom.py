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

# Kabelschutzrohre Strom
for mat,mf in [("PE-HD",1.0),("PVC",0.85),("PP",0.95),("Stahl",2.4)]:
    for dn,base in [(40,14),(50,18),(63,22),(75,24),(90,28),(110,36),(125,46),(160,58),(200,88),(250,135),(300,190)]:
        for lage,lf in [("offener Graben",1.0),("Straßenquerung",1.45),("Bestandstrasse",1.35)]:
            add(f"{mat} Kabelschutzrohr Strom DN{dn} {lage} verlegen",f"{mat} Kabelschutzrohr DN{dn} für Stromtrasse {lage} liefern und verlegen.","m","Stromtrassenbau","Kabelschutzrohr",*p(base*mf*lf))

# Stromkabel
for typ,base in [("Niederspannungskabel",18),("Mittelspannungskabel",42),("Straßenbeleuchtungskabel",16),("Hausanschlusskabel Strom",22),("Erdungskabel",12)]:
    for lage,lf in [("im Graben",1.0),("im Schutzrohr",1.25),("Bestand",1.55),("innerorts",1.35)]:
        add(f"{typ} {lage} verlegen",f"{typ} {lage} verlegen inkl. Nebenleistungen.","m","Stromtrassenbau","Kabelverlegung",*p(base*lf))

# Muffen / Endverschlüsse
for ebene,base in [("Niederspannung",380),("Mittelspannung",1250)]:
    for item,fac in [("Muffe montieren",1.0),("Endverschluss montieren",0.75),("Kabelprüfung durchführen",1.5),("Kabelmessung dokumentieren",0.25)]:
        add(f"{ebene} {item}",f"{ebene} {item} inkl. Prüfung und Dokumentation.","St" if "Muffe" in item or "Endverschluss" in item else "Psch","Stromtrassenbau","Muffen/Prüfung",*p(base*fac),True)

# Trafostationen / Verteiler / Schächte
for item,unit,base in [
("Kabelverteilerschrank klein setzen","St",1800),("Kabelverteilerschrank groß setzen","St",3200),
("Trafostation Fundament herstellen","St",8500),("Trafostation setzen","St",28000),
("Kabelzugschacht Strom klein setzen","St",1400),("Kabelzugschacht Strom mittel setzen","St",2200),("Kabelzugschacht Strom groß setzen","St",3600),
("Hausanschlusssäule setzen","St",850),("Zählersäule setzen","St",1200),("Straßenbeleuchtungsmast setzen","St",950)
]:
    add(item,item+" inkl. Tiefbau und Nebenleistungen.",unit,"Stromtrassenbau","Station/Schacht/Verteiler",*p(base),True if "Trafostation" in item else False)

# Erdung / Schutz
for item,unit,base in [
("Erdungsband verlegen","m",9),("Potentialausgleich herstellen","St",280),("Erdungsstab setzen","St",95),
("Kabelabdeckplatten verlegen","m",11),("Kabelwarnband verlegen","m",3.5),("Kabelschutzmatte verlegen","m",22),
("Kabeltrasse einmessen","m",2.5),("Kabeltrasse dokumentieren","Psch",950)
]:
    add(item,item+" inkl. Nebenleistungen.",unit,"Stromtrassenbau","Schutz/Dokumentation",*p(base),item.endswith("dokumentieren"))

payload={"sourceName":"rlc-global-tiefbau-seed-v16-strom","sourceType":"manual-seed-v16","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
