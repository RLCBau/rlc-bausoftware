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

# Asphaltflächen
layers=[("AC 5 D",34),("AC 8 D",38),("AC 11 D",42),("AC 16 B",52),("AC 22 T",68),("AC 32 T",82),("Gussasphalt",95),("Kaltasphalt",75)]
thicks=[("2 cm",0.55),("4 cm",0.8),("6 cm",1.0),("8 cm",1.25),("10 cm",1.5),("12 cm",1.8),("15 cm",2.2)]
areas=[("Kleinfläche",1.8),("Normalfläche",1.0),("Handeinbau",1.6),("Maschineneinbau",0.85)]
for layer,base in layers:
    for thick,tf in thicks:
        for area,af in areas:
            avg=base*tf*af
            add(f"Asphalt {layer} {thick} {area} herstellen",f"Asphalt {layer} {thick} {area} liefern und einbauen.","m²","Oberflächenbau","Asphalt",*p(avg))

# Pflaster / Platten
materials=[("Betonpflaster",68),("Natursteinpflaster",110),("Granitpflaster",125),("Klinkerpflaster",88),("Ökopflaster",82),("Plattenbelag Beton",65),("Natursteinplatten",145)]
formats=[("10x10",0.9),("20x10",1.0),("20x20",1.1),("30x20",1.25),("40x40",1.35),("60x40",1.55)]
works=[("aufnehmen",0.3),("wiederherstellen",0.85),("liefern und verlegen",1.0),("schneiden und anpassen",0.45)]
for mat,base in materials:
    for fmt,ff in formats:
        for work,wf in works:
            avg=base*ff*wf
            add(f"{mat} {fmt} {work}",f"{mat} {fmt} {work} inkl. Nebenleistungen.","m²","Oberflächenbau","Pflaster/Platten",*p(avg))

# Grünflächen / Bankett / Wege
for item,unit,base in [
("Grünfläche wiederherstellen","m²",12),("Rasen ansäen","m²",6),("Rollrasen verlegen","m²",18),
("Oberboden andecken","m³",12),("Bankett herstellen","m",28),("Kiesweg wiederherstellen","m²",32),
("Schotterweg wiederherstellen","m²",38),("wassergebundene Decke herstellen","m²",45),
("Mulde profilieren","m",18),("Böschung ansäen","m²",8)
]:
    add(item,item+" inkl. Nebenleistungen.",unit,"Oberflächenbau","Grünflächen/Wege",*p(base))

# Rinnen / Entwässerung Oberfläche
for item,unit,base in [
("Entwässerungsrinne Beton setzen","m",75),("Entwässerungsrinne Polymerbeton setzen","m",95),
("Kastenrinne setzen","m",125),("Muldenrinne herstellen","m",95),("Rinnenplatte verlegen","m",58),
("Straßeneinlauf anpassen","St",280),("Straßeneinlauf setzen","St",850),("Sinkkasten reinigen","St",65)
]:
    add(item,item+" inkl. Einbau und Anschluss.",unit,"Oberflächenbau","Rinnen/Entwässerung",*p(base))

payload={"sourceName":"rlc-global-tiefbau-seed-v18-oberflaechen","sourceType":"manual-seed-v18","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
