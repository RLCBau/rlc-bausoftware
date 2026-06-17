import json, urllib.request

API_URL="http://localhost:4000/api/global-knowledge/import"
rows=[]

def add(short,long,unit,gewerk,cat,pmin,pavg,pmax,ctx=False,conf=0.32):
    rows.append({
        "shortText":short,
        "longText":long,
        "unit":unit,
        "gewerk":gewerk,
        "category":cat,
        "priceMin":round(float(pmin),2),
        "priceAvg":round(float(pavg),2),
        "priceMax":round(float(pmax),2),
        "confidence":conf,
        "sampleCount":1,
        "isContextSensitive":ctx,
        "needsReview":True
    })

def p(avg,low=0.55,high=2.1):
    return avg*low,avg,avg*high

# Bordsteine
bords=[
("Tiefbord",1.0),
("Hochbord",1.1),
("Rundbord",1.15),
("Flachbord",0.95),
("Busbord",1.8),
("Granitbord",2.2),
("Natursteinbord",2.4),
("Kasseler Sonderbord",2.0)
]

sizes=[
("8/20",18),
("10/25",22),
("12/25",26),
("15/30",34),
("18/30",42)
]

works=[
("liefern und setzen",1.0),
("aufnehmen",0.45),
("wieder setzen",0.75),
("schneiden",0.55),
("ausrichten",0.35)
]

for bord,bf in bords:
    for size,base in sizes:
        for work,wf in works:
            add(
                f"{bord} {size} {work}",
                f"{bord} {size} {work} inkl. Bettung, Rückenstütze und Nebenleistungen.",
                "m",
                "Straßenbau",
                "Bordsteine",
                *p(base*bf*wf)
            )

# Leistensteine
leisten=[
("Leistenstein Beton",16),
("Leistenstein Granit",28),
("Leistenstein Naturstein",32),
("Leistenstein Sonderform",48)
]

for name,base in leisten:
    for work,wf in works:
        add(
            f"{name} {work}",
            f"{name} {work}.",
            "m",
            "Straßenbau",
            "Leistensteine",
            *p(base*wf)
        )

# Pflasterarten
pflaster=[
("Betonrechteckpflaster",65),
("Doppel-T Pflaster",72),
("Verbundpflaster",74),
("Ökopflaster",82),
("Drainpflaster",88),
("Klinkerpflaster",92),
("Granitpflaster Kleinpflaster",125),
("Granitpflaster Großpflaster",155),
("Mosaikpflaster",110),
("Natursteinpflaster",145)
]

formate=[
("10x10",0.85),
("20x10",1.0),
("20x20",1.1),
("30x20",1.25),
("40x40",1.4),
("60x40",1.55)
]

arbeiten=[
("liefern und verlegen",1.0),
("aufnehmen",0.35),
("wiederherstellen",0.8),
("schneiden",0.45),
("anpassen",0.5)
]

for pfl,base in pflaster:
    for fmt,ff in formate:
        for arb,af in arbeiten:
            add(
                f"{pfl} {fmt} {arb}",
                f"{pfl} Format {fmt} {arb}.",
                "m²",
                "Straßenbau",
                "Pflaster",
                *p(base*ff*af)
            )

payload={
    "sourceName":"rlc-global-tiefbau-seed-v21-pflaster-bordsteine",
    "sourceType":"manual-seed-v21",
    "rows":rows
}

req=urllib.request.Request(
    API_URL,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type":"application/json"},
    method="POST"
)

with urllib.request.urlopen(req) as r:
    print(r.read().decode())

print("ROWS_SENT=",len(rows))
