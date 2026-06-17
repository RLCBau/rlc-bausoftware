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

def p(avg, low=0.55, high=2.1):
    return avg*low, avg, avg*high

# Gasleitungen
gas_materials = {
    "PE-HD Gasleitung":1.0,
    "Stahl Gasleitung":1.8,
}
dns = {
    25:35,32:42,40:50,50:65,63:78,80:95,
    100:135,150:220,200:360,250:520,300:780
}

for mat,mf in gas_materials.items():
    for dn,base in dns.items():
        for tiefe,tf in [
            ("bis 1,20 m",1.0),
            ("bis 1,50 m",1.2),
            ("bis 2,00 m",1.55),
            ("über 2,00 m",2.1),
        ]:
            avg=base*mf*tf
            add(
                f"{mat} DN{dn} verlegen {tiefe}",
                f"{mat} DN{dn} bei Tiefe {tiefe} liefern, verlegen, verbinden und prüfen.",
                "m","Gasleitungsbau","Gasleitung",*p(avg),True
            )

# Gas Armaturen / Anschlüsse
for item,unit,base in [
    ("Gashausanschluss herstellen","St",3800),
    ("Gasanschluss an Bestand herstellen","St",1400),
    ("Gasleitung Druckprüfung","Psch",1800),
    ("Gasleitung spülen","Psch",950),
    ("Gasabsperrschieber einbauen","St",850),
    ("Gasschieberkappe setzen","St",180),
    ("Gaswarnband verlegen","m",3.5),
    ("Gasleitung außer Betrieb nehmen","Psch",1600),
    ("Gasleitung in Betrieb nehmen","Psch",1800),
]:
    add(item,item + " inkl. Nebenleistungen und Dokumentation.","St" if unit=="St" else unit,"Gasleitungsbau","Armaturen/Prüfung",*p(base),True)

# Fernwärme
fw_systems = {
    "KMR Fernwärmerohr":1.0,
    "Flexibles Fernwärmerohr":0.85,
    "Stahlmantelrohr":1.8,
}
fw_dns = {
    25:120,32:145,40:175,50:220,65:310,80:420,
    100:580,125:760,150:980,200:1450,250:2100,300:2900
}

for mat,mf in fw_systems.items():
    for dn,base in fw_dns.items():
        avg=base*mf
        add(
            f"{mat} DN{dn} verlegen",
            f"{mat} DN{dn} liefern, verlegen, verbinden und dämmen.",
            "m","Fernwärmebau","Fernwärmeleitung",*p(avg),True
        )

# Fernwärme Formstücke
for dn,base in fw_dns.items():
    for typ,tf in [
        ("Bogen",1.0),
        ("T-Stück",1.45),
        ("Reduzierung",1.1),
        ("Muffe",0.8),
        ("Endabschluss",0.65),
        ("Absperrarmatur",2.2),
    ]:
        avg=base*tf
        add(
            f"Fernwärme {typ} DN{dn} montieren",
            f"Fernwärme {typ} DN{dn} liefern, montieren, dämmen und dokumentieren.",
            "St","Fernwärmebau","Formstücke/Armaturen",*p(avg),True
        )

# Industrie / Medienleitungen
media = {
    "Druckluftleitung":1.0,
    "Prozesswasserleitung":1.15,
    "Kühlwasserleitung":1.2,
    "Abwasser-Druckleitung":1.25,
    "Chemikalienleitung":2.2,
}
for med,mf in media.items():
    for dn,base in [(25,75),(40,110),(50,145),(80,230),(100,320),(150,520),(200,850)]:
        avg=base*mf
        add(
            f"{med} DN{dn} verlegen",
            f"{med} DN{dn} liefern, verlegen, verbinden und prüfen.",
            "m","Industrieleitungsbau","Medienleitung",*p(avg),True
        )

payload={"sourceName":"rlc-global-tiefbau-seed-v12-gas-fernwaerme","sourceType":"manual-seed-v12","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r:
    print(r.read().decode())
print("ROWS_SENT=",len(rows))
