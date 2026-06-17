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

def price(avg, low=0.55, high=2.0):
    return avg * low, avg, avg * high

# Baustelleneinrichtung / Räumen
for item, unit, avg in [
    ("Baustelle einrichten klein", "Psch", 4500),
    ("Baustelle einrichten mittel", "Psch", 15000),
    ("Baustelle einrichten groß", "Psch", 45000),
    ("Baustelle räumen klein", "Psch", 2500),
    ("Baustelle räumen mittel", "Psch", 7500),
    ("Baustelle räumen groß", "Psch", 18000),
    ("Baucontainer aufstellen", "St", 950),
    ("Baucontainer vorhalten", "Monat", 380),
    ("Materiallager einrichten", "Psch", 2500),
    ("Baustromanschluss herstellen", "Psch", 1800),
    ("Bauwasseranschluss herstellen", "Psch", 1600),
]:
    add(item, item + " abhängig von Bauzeit, Logistik und Projektgröße.", unit, "Baustelleneinrichtung", "Context Sensitive", avg*0.35, avg, avg*4.0, True, 0.25)

# Stundenlohnarbeiten / Regie
for role, avg in [
    ("Facharbeiter Regiestunde",58),
    ("Bauhelfer Regiestunde",42),
    ("Vorarbeiter Regiestunde",68),
    ("Polier Regiestunde",78),
    ("Maschinist Regiestunde",66),
    ("LKW Fahrer Regiestunde",58),
    ("Vermesser Regiestunde",75),
]:
    add(role, role + " für Abrechnung nach Aufwand.", "h", "Regie", "Stundenlohn", *price(avg,0.7,1.6), False, 0.35)

# Nachweise / Dokumentation
for item, avg in [
    ("Regiebericht erstellen",45),
    ("Lieferschein erfassen",18),
    ("Fotodokumentation erstellen",850),
    ("Aufmaßblatt erstellen",65),
    ("Massenaufstellung erstellen",450),
    ("Abrechnungsunterlage erstellen",950),
    ("Bestandsplan fortführen",1800),
    ("Revisionsunterlagen erstellen",2500),
    ("Prüfprotokoll erstellen",120),
]:
    add(item, item + " inkl. Zusammenstellung und Übergabe.", "Psch" if avg > 200 else "St", "Abrechnung / Dokumentation", "Dokumentation", avg*0.5, avg, avg*2.0, avg > 500, 0.3)

# LV-typische Zuschläge / Nebenleistungen
for item, unit, avg in [
    ("Kleinmengen Zuschlag", "%", 15),
    ("Mindermengenzuschlag", "%", 18),
    ("Mehrmengenausgleich", "%", 8),
    ("Erschwerniszuschlag Bestand", "%", 25),
    ("Erschwerniszuschlag Verkehr", "%", 20),
    ("Zuschlag beengte Bauweise", "%", 22),
    ("Zuschlag Handschachtung", "%", 35),
    ("Zuschlag Winterbau", "%", 18),
    ("Zuschlag Nachtarbeit", "%", 25),
    ("Zuschlag Wochenende", "%", 50),
]:
    add(item, item + " als LV-Zuschlagsposition.", unit, "Kalkulation", "Zuschläge", avg*0.5, avg, avg*2.0, True, 0.25)

# Aufmaß / Mengenermittlung
for item, unit, avg in [
    ("Aufmaß Rohrgraben", "m", 1.2),
    ("Aufmaß Oberfläche", "m²", 0.8),
    ("Aufmaß Asphalt", "m²", 0.9),
    ("Aufmaß Pflaster", "m²", 0.9),
    ("Aufmaß Schacht", "St", 12),
    ("Aufmaß Hausanschluss", "St", 25),
    ("Aufmaß Leitungszone", "m³", 1.5),
    ("Aufmaß Entsorgung", "t", 0.8),
]:
    add(item, item + " für Mengenermittlung und Abrechnung.", unit, "Abrechnung", "Aufmaß", avg*0.5, avg, avg*2.0, False, 0.32)

# Prüfungen / Qualität
for item, unit, avg in [
    ("Verdichtungsprüfung durchführen", "St", 180),
    ("Lastplattendruckversuch durchführen", "St", 320),
    ("Dichtheitsprüfung Kanal", "Psch", 1500),
    ("Druckprüfung Wasserleitung", "Psch", 1800),
    ("Spülprotokoll Wasserleitung", "Psch", 650),
    ("Desinfektionsnachweis Wasserleitung", "Psch", 950),
    ("Kabelmessung Niederspannung", "Psch", 750),
    ("Kabelmessung Mittelspannung", "Psch", 1800),
    ("OTDR Messung Glasfaser", "St", 120),
    ("Bohrprotokoll HDD", "St", 120),
]:
    add(item, item + " inkl. Protokollierung und Übergabe.", unit, "Prüfung / Qualität", "Prüfung", avg*0.5, avg, avg*2.0, True, 0.3)

# Provisorien
for item, unit, avg in [
    ("Provisorische Zufahrt herstellen", "Psch", 3500),
    ("Provisorischer Gehweg herstellen", "m", 45),
    ("Provisorische Fahrbahn herstellen", "m²", 95),
    ("Provisorische Wasserleitung herstellen", "Psch", 4500),
    ("Provisorische Stromversorgung herstellen", "Psch", 3500),
    ("Provisorische Verkehrsführung herstellen", "Psch", 12000),
    ("Behelfsbrücke herstellen", "Psch", 18000),
]:
    add(item, item + " abhängig von Bauzeit, Verkehr und örtlichen Bedingungen.", unit, "Provisorien", "Context Sensitive", avg*0.35, avg, avg*4.0, True, 0.25)

# Abrechnungseinheiten häufig
for item, unit, avg in [
    ("Mehr- oder Minderpreis Rohr DN100", "m", 18),
    ("Mehr- oder Minderpreis Rohr DN150", "m", 32),
    ("Mehr- oder Minderpreis Rohr DN200", "m", 55),
    ("Mehr- oder Minderpreis Schacht klein", "St", 380),
    ("Mehr- oder Minderpreis Schacht groß", "St", 950),
    ("Zulage Leitungskreuzung", "St", 280),
    ("Zulage Kabelquerung", "St", 220),
    ("Zulage Baumwurzelbereich", "m", 38),
    ("Zulage Fels lösen", "m³", 95),
    ("Zulage Grundwasser", "m", 45),
]:
    add(item, item + " als LV-/Abrechnungsposition.", unit, "Abrechnung", "Zulagen", avg*0.55, avg, avg*2.2, "Grundwasser" in item or "Fels" in item, 0.32)

payload = {
    "sourceName": "rlc-global-tiefbau-seed-v8-lv-abrechnung",
    "sourceType": "manual-seed-v8",
    "notes": "RLC Global Knowledge Seed V8 LV-Logik, Abrechnung, Regie und Dokumentation.",
    "rows": rows
}

req = urllib.request.Request(
    API_URL,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type":"application/json"},
    method="POST"
)

with urllib.request.urlopen(req) as res:
    print(res.read().decode("utf-8"))

print("ROWS_SENT=", len(rows))
