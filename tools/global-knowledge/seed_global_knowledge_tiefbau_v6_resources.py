import json
import urllib.request

API_URL = "http://localhost:4000/api/global-knowledge/import"

rows = []

def add(short, long, unit, gewerk, cat, pmin, pavg, pmax, ctx=False, conf=0.32):
    rows.append({
        "shortText": short,
        "longText": long,
        "unit": unit,
        "gewerk": gewerk,
        "category": cat,
        "priceMin": round(float(pmin), 2),
        "priceAvg": round(float(pavg), 2),
        "priceMax": round(float(pmax), 2),
        "confidence": conf,
        "sampleCount": 1,
        "isContextSensitive": ctx,
        "needsReview": True
    })

def price(avg, low=0.65, high=1.8):
    return avg * low, avg, avg * high

# Personal
for role, avg in [
    ("Facharbeiter Tiefbau",58),
    ("Bauhelfer Tiefbau",42),
    ("Vorarbeiter Tiefbau",68),
    ("Polier Tiefbau",78),
    ("Rohrleitungsbauer",64),
    ("Kanalbauer",62),
    ("Asphaltbauer",60),
    ("Pflasterer",58),
    ("Maschinist Bagger",66),
    ("LKW Fahrer",58),
    ("Vermesser",75),
    ("Bauleiter",95),
]:
    add(
        f"{role} Arbeitsstunde",
        f"{role} als kalkulatorischer Stundenansatz inkl. Lohnnebenkosten.",
        "h",
        "Ressourcen",
        "Personal",
        *price(avg),
        False,
        0.38
    )

# Kolonnen
for name, avg in [
    ("Tiefbaukolonne 2 Mann",115),
    ("Tiefbaukolonne 3 Mann",170),
    ("Tiefbaukolonne 4 Mann",225),
    ("Rohrleitungsbaukolonne 3 Mann",190),
    ("Kanalbaukolonne 3 Mann",185),
    ("Glasfaserkolonne 2 Mann",120),
    ("Kabelbaukolonne 3 Mann",175),
    ("Pflasterkolonne 3 Mann",165),
    ("Asphaltkolonne Kleinfläche",210),
    ("Vermessungstrupp 2 Mann",145),
]:
    add(
        f"{name} vorhalten",
        f"{name} als kalkulatorischer Stundenansatz inkl. Werkzeug und Kleinmaterial.",
        "h",
        "Ressourcen",
        "Kolonne",
        *price(avg),
        False,
        0.38
    )

# Maschinen klein/mittel/groß
machines = [
    ("Minibagger 1,5 t",45),
    ("Minibagger 2,5 t",55),
    ("Kompaktbagger 5 t",72),
    ("Mobilbagger 12 t",95),
    ("Mobilbagger 16 t",115),
    ("Kettenbagger 20 t",135),
    ("Kettenbagger 30 t",175),
    ("Radlader klein",85),
    ("Radlader mittel",105),
    ("Radlader groß",145),
    ("Dumper klein",55),
    ("Dumper groß",95),
    ("Walze klein",45),
    ("Walze mittel",75),
    ("Rüttelplatte",18),
    ("Stampfer",16),
    ("Asphaltschneider",28),
    ("Kernbohrgerät",38),
    ("Kompressor",35),
    ("Stromaggregat",28),
]
for machine, avg in machines:
    add(
        f"{machine} Einsatzstunde",
        f"{machine} als kalkulatorischer Maschinenstundensatz inkl. Betriebskosten.",
        "h",
        "Ressourcen",
        "Maschinen",
        *price(avg),
        False,
        0.38
    )
    add(
        f"{machine} Tagessatz",
        f"{machine} als kalkulatorischer Tagessatz inkl. Vorhaltung.",
        "Tag",
        "Ressourcen",
        "Maschinen",
        avg*4.5,
        avg*7.5,
        avg*11,
        False,
        0.35
    )

# LKW / Transportgeräte
for item, avg in [
    ("LKW 3-Achser",85),
    ("LKW 4-Achser",98),
    ("Sattelkipper",115),
    ("Tieflader Transport",140),
    ("Kleintransporter",45),
    ("Anhänger Maschinentransport",35),
    ("Saugbagger",260),
    ("Kehrmaschine",130),
]:
    add(
        f"{item} Einsatzstunde",
        f"{item} als kalkulatorischer Stundensatz inkl. Fahrer und Betrieb.",
        "h",
        "Transport",
        "Fahrzeuge",
        *price(avg),
        False,
        0.38
    )

# Gerätekombinationen / Leistungsansätze
for short, unit, avg in [
    ("Rohrgraben mit Minibagger herstellen", "m", 42),
    ("Rohrgraben mit Mobilbagger herstellen", "m", 55),
    ("Kabelgraben Glasfaser herstellen", "m", 38),
    ("Grabenverfüllung mit Verdichtung herstellen", "m", 28),
    ("Pflasterfläche mit Kolonne wiederherstellen", "m²", 58),
    ("Asphaltkleinfläche mit Kolonne wiederherstellen", "m²", 78),
    ("Kabelschutzrohr mit Kolonne verlegen", "m", 28),
    ("Speedpipe mit Kolonne verlegen", "m", 18),
    ("Wasserleitung mit Rohrbaukolonne verlegen", "m", 95),
    ("Kanalrohr mit Kanalbaukolonne verlegen", "m", 115),
]:
    add(
        short,
        short + " als kombinierter Leistungsansatz aus Personal, Gerät und Nebenleistungen.",
        unit,
        "Ressourcen",
        "Leistungsansatz",
        *price(avg, 0.55, 2.0),
        False,
        0.34
    )

# Zuschläge
for short, unit, avg in [
    ("Zuschlag Nachtarbeit", "%", 25),
    ("Zuschlag Wochenendarbeit", "%", 50),
    ("Zuschlag beengte Verhältnisse", "%", 20),
    ("Zuschlag innerstädtische Lage", "%", 15),
    ("Zuschlag alpine Lage", "%", 25),
    ("Zuschlag Winterbau", "%", 18),
    ("Zuschlag Handschachtung Bestand", "%", 35),
    ("Zuschlag geringe Mengen", "%", 20),
    ("Zuschlag kurze Bauzeit", "%", 15),
    ("Zuschlag hohe Verkehrsbelastung", "%", 25),
]:
    add(
        short,
        short + " als kontextabhängiger kalkulatorischer Zuschlag.",
        unit,
        "Kalkulation",
        "Zuschläge",
        avg*0.5,
        avg,
        avg*2.0,
        True,
        0.25
    )

payload = {
    "sourceName": "rlc-global-tiefbau-seed-v6-resources",
    "sourceType": "manual-seed-v6",
    "notes": "RLC Global Knowledge Seed V6 Ressourcen, Personal, Maschinen, Kolonnen, Leistungsansätze.",
    "rows": rows
}

req = urllib.request.Request(
    API_URL,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST"
)

with urllib.request.urlopen(req) as res:
    print(res.read().decode("utf-8"))

print("ROWS_SENT=", len(rows))
