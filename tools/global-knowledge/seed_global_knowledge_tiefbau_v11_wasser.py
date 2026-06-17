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

materials={
    "PE-HD":1.0,
    "GGG":1.55,
    "PVC-U":0.95,
    "Stahl":1.75,
    "Edelstahl":2.4
}

dns={
    25:28,32:32,40:38,50:45,63:55,80:65,
    100:85,125:110,150:135,200:210,
    250:310,300:420,400:680,500:980,600:1350
}

# Wasserleitungen
for mat,mf in materials.items():
    for dn,base in dns.items():
        for tiefe,tf in [
            ("bis 1,20 m",1.0),
            ("bis 1,50 m",1.2),
            ("bis 2,00 m",1.55),
            ("über 2,00 m",2.1),
        ]:
            avg=base*mf*tf
            add(
                f"{mat} Wasserleitung DN{dn} verlegen {tiefe}",
                f"{mat} Wasserleitung DN{dn} bei Tiefe {tiefe} liefern, verlegen, verbinden und prüfen.",
                "m","Wasserbau",f"Wasserleitung {mat}",*p(avg)
            )

# Armaturen
for dn,base in [
    (25,180),(32,220),(40,260),(50,320),(63,380),(80,520),
    (100,650),(125,780),(150,950),(200,1450),(250,2200),
    (300,3200),(400,5200),(500,7800),(600,11000)
]:
    for typ,tf in [
        ("Absperrschieber",1.0),
        ("Einbaugarnitur",0.35),
        ("Straßenkappe",0.25),
        ("Rückflussverhinderer",1.25),
        ("Be- und Entlüftungsventil",1.6),
        ("Druckminderer",1.8),
        ("Schmutzfänger",1.15),
    ]:
        avg=base*tf
        add(
            f"{typ} DN{dn} einbauen",
            f"{typ} DN{dn} liefern, montieren und betriebsfertig einbauen.",
            "St","Wasserbau","Armaturen",*p(avg)
        )

# Hydranten
for typ,base in [
    ("Unterflurhydrant",1480),
    ("Überflurhydrant",2200),
    ("Hydrantenfußkrümmer",420),
    ("Hydrantenschild setzen",95),
]:
    for dn,tf in [(80,1.0),(100,1.15),(150,1.45)]:
        avg=base*tf
        add(
            f"{typ} DN{dn} einbauen",
            f"{typ} DN{dn} liefern und einbauen.",
            "St","Wasserbau","Hydranten",*p(avg)
        )

# Hausanschlüsse Wasser
for dn,base in [(25,1800),(32,2400),(40,3100),(50,3800),(63,5200)]:
    for length,lf in [
        ("bis 5 m",0.75),
        ("bis 10 m",1.0),
        ("bis 20 m",1.6),
        ("bis 30 m",2.2),
        ("über 30 m",3.0),
    ]:
        avg=base*lf
        add(
            f"Hausanschluss Wasser DN{dn} herstellen {length}",
            f"Hausanschluss Wasser DN{dn} herstellen, Länge {length}, inkl. Anschluss an Bestand und Wiederherstellung.",
            "St","Wasserbau","Hausanschluss",*p(avg),True
        )

# Prüfungen / Spülung / Desinfektion
for dn,base in [
    (50,850),(80,1050),(100,1400),(150,1800),(200,2400),
    (250,3200),(300,4200),(400,6500),(500,8500),(600,11000)
]:
    for typ,tf in [
        ("Druckprüfung Wasserleitung",1.0),
        ("Spülung Wasserleitung",0.45),
        ("Desinfektion Wasserleitung",0.65),
        ("Probenahme Trinkwasser",0.25),
        ("Prüfprotokoll Wasserleitung",0.18),
    ]:
        avg=base*tf
        add(
            f"{typ} DN{dn}",
            f"{typ} DN{dn} durchführen inkl. Dokumentation.",
            "Psch","Wasserbau","Prüfung",*p(avg),True
        )

# Provisorien / Bestand
for item,unit,base in [
    ("Anschluss an Bestandsleitung Wasser herstellen","St",950),
    ("Bestandsleitung Wasser freilegen","m",65),
    ("Bestandsleitung Wasser sichern","m",45),
    ("Provisorische Wasserleitung herstellen","Psch",4500),
    ("Notversorgung Wasser herstellen","Psch",6500),
    ("Wasserleitung außer Betrieb nehmen","Psch",1200),
    ("Wasserleitung in Betrieb nehmen","Psch",1400),
    ("Rohrbruchstelle sichern","Psch",3200),
]:
    add(
        item,
        item + " abhängig von Bestand, Risiko, Dauer und örtlichen Bedingungen.",
        unit,"Wasserbau","Bestand/Provisorium",*p(base, ),True
    )

payload={"sourceName":"rlc-global-tiefbau-seed-v11-wasser","sourceType":"manual-seed-v11","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r:
    print(r.read().decode())
print("ROWS_SENT=",len(rows))
