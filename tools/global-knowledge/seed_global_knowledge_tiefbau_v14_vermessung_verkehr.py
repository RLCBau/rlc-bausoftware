import json
import urllib.request

API_URL = "http://localhost:4000/api/global-knowledge/import"
rows=[]

def add(short,long,unit,gewerk,cat,pmin,pavg,pmax,ctx=True):
    rows.append({
        "shortText":short,
        "longText":long,
        "unit":unit,
        "gewerk":gewerk,
        "category":cat,
        "priceMin":round(float(pmin),2),
        "priceAvg":round(float(pavg),2),
        "priceMax":round(float(pmax),2),
        "confidence":0.25 if ctx else 0.32,
        "sampleCount":1,
        "isContextSensitive":ctx,
        "needsReview":True
    })

def p(avg, low=0.45, high=3.0):
    return avg*low, avg, avg*high

# Vermessung
for item,unit,base in [
    ("Absteckung Leitungstrasse","m",2.5),
    ("Absteckung Achse","m",2.8),
    ("Absteckung Schacht","St",65),
    ("Höhenkontrolle durchführen","Psch",750),
    ("Bestandsvermessung Leitung","m",2.8),
    ("Bestandsvermessung Oberfläche","m²",0.65),
    ("GNSS Aufnahme durchführen","h",95),
    ("Tachymeteraufnahme durchführen","h",110),
    ("DGM Geländeaufnahme","Psch",2800),
    ("Querprofile aufnehmen","St",85),
    ("Längsprofil erstellen","Psch",1200),
    ("Massenermittlung aus Vermessung","Psch",1800),
]:
    add(item,item+" abhängig von Genauigkeit, Gelände, Datenformat und Projektumfang.",unit,"Vermessung","Context Sensitive",*p(base))

# Dokumentation / As-Built
for item,unit,base in [
    ("As-Built Plan DWG erstellen","Psch",2800),
    ("As-Built Plan PDF erstellen","Psch",1500),
    ("Bestandsplan fortschreiben","Psch",1800),
    ("Leitungsdokumentation GIS erstellen","Psch",3200),
    ("Fotodokumentation erstellen","Psch",850),
    ("Regiebericht prüfen und archivieren","St",35),
    ("Lieferschein prüfen und archivieren","St",25),
    ("Revisionsunterlagen zusammenstellen","Psch",2500),
    ("Prüfprotokolle zusammenstellen","Psch",950),
    ("Abrechnungsdokumentation erstellen","Psch",2200),
]:
    add(item,item+" inkl. Prüfung, Aufbereitung und Übergabe.",unit,"Dokumentation","Context Sensitive",*p(base))

# Verkehrssicherung RSA
for item,unit,base in [
    ("Verkehrssicherung innerorts herstellen","Psch",8500),
    ("Verkehrssicherung außerorts herstellen","Psch",12000),
    ("Verkehrssicherung halbseitige Sperrung","Psch",9500),
    ("Verkehrssicherung Vollsperrung","Psch",18000),
    ("Verkehrssicherung Gehweg","Psch",3500),
    ("Fußgängernotweg herstellen","m",45),
    ("Radwegprovisorium herstellen","m",55),
    ("Umleitungsbeschilderung herstellen","Psch",6500),
    ("Ampelanlage vorhalten","Tag",120),
    ("Verkehrssicherung Kontrolle","Tag",180),
    ("Verkehrsrechtliche Anordnung bearbeiten","Psch",1200),
]:
    add(item,item+" nach RSA und behördlicher Anordnung.",unit,"Verkehrssicherung","Context Sensitive",*p(base,0.35,4.0))

# Einzelteile Verkehrssicherung
for item,unit,base in [
    ("Leitbake aufstellen","St",18),
    ("Absperrschranke aufstellen","St",45),
    ("Verkehrszeichen aufstellen","St",65),
    ("Warnleuchte montieren","St",12),
    ("Bauzaun stellen","m",18),
    ("Bauzaun vorhalten","m/Wo",2.5),
    ("Schrammbord mobil aufstellen","m",35),
    ("Fahrbahnplatte verlegen","m²",95),
    ("Stahlplatte Fahrbahn verlegen","m²",145),
    ("Schutzgeländer aufstellen","m",32),
]:
    add(item,item+" inkl. Lieferung, Aufstellung und Rückbau.",unit,"Verkehrssicherung","Ausstattung",*p(base,0.55,2.2),False)

payload={"sourceName":"rlc-global-tiefbau-seed-v14-vermessung-verkehr","sourceType":"manual-seed-v14","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r:
    print(r.read().decode())
print("ROWS_SENT=",len(rows))
