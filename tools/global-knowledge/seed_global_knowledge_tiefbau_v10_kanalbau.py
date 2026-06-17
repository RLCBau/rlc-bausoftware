import json
import urllib.request

API_URL = "http://localhost:4000/api/global-knowledge/import"
rows=[]

def add(short,long,unit,gewerk,cat,pmin,pavg,pmax,ctx=False):
    rows.append({
        "shortText":short,
        "longText":long,
        "unit":unit,
        "gewerk":gewerk,
        "category":cat,
        "priceMin":round(float(pmin),2),
        "priceAvg":round(float(pavg),2),
        "priceMax":round(float(pmax),2),
        "confidence":0.32,
        "sampleCount":1,
        "isContextSensitive":ctx,
        "needsReview":True
    })

def p(avg):
    return avg*0.55, avg, avg*2.1

materials = {
    "KG":1.0,
    "PP":1.15,
    "PVC-U":1.05,
    "Steinzeug":1.45,
    "Beton":1.35,
    "GFK":1.65
}

dns = {
    100:55,125:62,150:75,200:105,250:145,300:190,
    400:290,500:390,600:520,700:650,800:780,
    900:960,1000:1150,1200:1550
}

# Rohre nach Material/DN/Tiefe
for mat,mf in materials.items():
    for dn,base in dns.items():
        for tiefe,tf in [
            ("bis 1,25 m",1.0),
            ("bis 1,75 m",1.25),
            ("bis 2,50 m",1.65),
            ("über 2,50 m",2.2),
        ]:
            avg=base*mf*tf
            add(
                f"{mat} Kanalrohr DN{dn} verlegen {tiefe}",
                f"{mat} Kanalrohr DN{dn} bei Grabentiefe {tiefe} liefern, verlegen, ausrichten und anschließen.",
                "m","Kanalbau",f"Kanalrohr {mat}",*p(avg)
            )

# Schächte
for dn,base in [
    (600,1600),(800,2100),(1000,2800),(1200,3900),(1500,6200),(2000,9800)
]:
    for tiefe,tf in [
        ("bis 1,50 m",1.0),
        ("bis 2,50 m",1.35),
        ("bis 4,00 m",1.9),
        ("über 4,00 m",2.8),
    ]:
        avg=base*tf
        add(
            f"Kontrollschacht DN{dn} herstellen {tiefe}",
            f"Kontrollschacht DN{dn} {tiefe} liefern, versetzen, anschließen und verfüllen.",
            "St","Kanalbau","Schacht",*p(avg)
        )

# Schachtbauteile
for item,base in [
    ("Schachtunterteil liefern und setzen",1500),
    ("Schachtring DN1000 setzen",420),
    ("Schachtring DN1200 setzen",620),
    ("Konus DN1000 setzen",650),
    ("Ausgleichsring setzen",120),
    ("Steigeisen einbauen",35),
    ("Gerinne im Schacht herstellen",480),
    ("Schachtfutter einbauen",180),
    ("Schachtdichtung einbauen",95),
]:
    add(item,item,"St","Kanalbau","Schachtbauteile",*p(base))

# Anschlüsse
for dn,base in [(100,280),(125,340),(150,420),(200,650),(250,850),(300,1050)]:
    for typ,tf in [
        ("Hausanschluss",1.0),
        ("Seitenzulauf",0.85),
        ("Anschluss an Bestand",1.6),
        ("Kernbohrung Anschluss",1.2),
    ]:
        avg=base*tf
        add(
            f"{typ} Kanal DN{dn} herstellen",
            f"{typ} Kanal DN{dn} herstellen inkl. Abdichtung und Nebenarbeiten.",
            "St","Kanalbau","Anschluss",*p(avg),ctx=("Bestand" in typ)
        )

# Prüfungen / Reinigung / Sanierung
for item,unit,base,ctx in [
    ("Kanal TV-Inspektion", "m", 4.5, False),
    ("Kanal spülen", "m", 3.8, False),
    ("Kanal reinigen stark verschmutzt", "m", 8.5, False),
    ("Dichtheitsprüfung Kanalhaltung", "Psch", 1500, True),
    ("Dichtheitsprüfung Schacht", "St", 280, True),
    ("Haltungsprotokoll erstellen", "St", 85, False),
    ("Kanalortung durchführen", "m", 2.8, False),
    ("Kurzliner DN150 einbauen", "St", 850, True),
    ("Kurzliner DN200 einbauen", "St", 1150, True),
    ("Schachtsanierung mineralisch", "m²", 180, True),
]:
    add(item,item,unit,"Kanalbau","Prüfung/Sanierung",*p(base),ctx)

payload={"sourceName":"rlc-global-tiefbau-seed-v10-kanalbau","sourceType":"manual-seed-v10","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r:
    print(r.read().decode())
print("ROWS_SENT=",len(rows))
