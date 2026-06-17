import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=False):
    rows.append({
        "shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,
        "priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),
        "confidence":0.32,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True
    })

def p(x): return x*0.55,x,x*2.1

operators=[
("Telekom",1.0),("Vodafone",1.05),("Bayernwerk",1.15),("Stadtwerke",1.1),
("Netzbetreiber Strom",1.2),("Netzbetreiber Glasfaser",1.0),("Kabelnetzbetreiber",1.05)
]

works=[
("Trasse öffnen",45,"m"),("Trasse schließen",38,"m"),("Kabelgraben herstellen",55,"m"),
("Rohrverband einbauen",28,"m"),("Bestandsrohr prüfen",6,"m"),("Bestandsrohr reinigen",8,"m"),
("Kalibrierung durchführen",0.35,"m"),("Druckprüfung durchführen",0.55,"m"),
("Kabel einziehen",12,"m"),("Kabel einblasen",2.5,"m"),
("Kabelschacht öffnen und schließen",85,"St"),("Kabelschacht reinigen",120,"St"),
("Kabelschacht einmessen",45,"St"),("Netzverteiler anschließen",950,"St"),
("Hausanschluss herstellen",1200,"St"),("Gebäudeeinführung herstellen",320,"St"),
("Bestandsleitung sichern",55,"m"),("Leitungskreuzung sichern",280,"St"),
("Provisorium herstellen",1800,"Psch"),("Dokumentation erstellen",650,"Psch")
]

surfaces=[("Grünfläche",0.85),("Gehweg",1.0),("Pflaster",1.2),("Asphalt",1.45),("Straße",1.8),("Bestand eng",2.2)]

for op,of in operators:
  for work,base,unit in works:
    for surf,sf in surfaces:
      avg=base*of*sf
      add(
        f"{op} {work} {surf}",
        f"{op}: {work} in Oberfläche {surf} inkl. Nebenleistungen, Dokumentation und Übergabe.",
        unit,"Netzbetreiber Tiefbau",op,*p(avg),ctx=surf in ["Straße","Bestand eng"] or unit=="Psch"
      )

# Bayernwerk / Strom spezifisch
strom=[
("NS Kabel freilegen",65,"m"),("MS Kabel freilegen",95,"m"),
("NS Kabel sichern",55,"m"),("MS Kabel sichern",85,"m"),
("Kabelmuffengrube NS herstellen",950,"St"),("Kabelmuffengrube MS herstellen",1800,"St"),
("Trafostation Zuwegung herstellen",3500,"Psch"),("Kabelmerkstein setzen",85,"St"),
("Erdungsband nach Netzbetreiber verlegen",12,"m"),("Potentialausgleich herstellen",280,"St")
]
for name,base,unit in strom:
  for stufe,fac in [("normal",1.0),("innerorts",1.3),("unter Verkehr",1.8),("Bestand kritisch",2.4)]:
    add(
      f"Bayernwerk {name} {stufe}",
      f"Bayernwerk / Stromnetz: {name} {stufe} inkl. Sicherung, Abstimmung und Dokumentation.",
      unit,"Bayernwerk / Strom","Stromnetz Sonderleistung",*p(base*fac),ctx=stufe!="normal"
    )

# Telekom/Vodafone Kabelnetz spezifisch
kabel=[
("Koaxialkabel freilegen",55,"m"),("Koaxialkabel sichern",45,"m"),
("BK-Kabel einziehen",9,"m"),("BK-Hausanschluss herstellen",950,"St"),
("Multimediadose Zuleitung vorbereiten",180,"St"),("Kabelnetz Übergabepunkt setzen",650,"St"),
("Kabelzug über Bestandsschacht",320,"St"),("Schutzrohr für BK-Kabel verlegen",24,"m")
]
for op in ["Vodafone","Telekom","Kabelnetzbetreiber"]:
  for name,base,unit in kabel:
    for stufe,fac in [("normal",1.0),("erschwert",1.6),("Bestand",1.9)]:
      add(
        f"{op} {name} {stufe}",
        f"{op}: {name} {stufe} inkl. Prüfung und Dokumentation.",
        unit,"Kabelnetz / Telekommunikation","BK/Koax/Bestand",*p(base*fac),ctx=stufe!="normal"
      )

# Abstimmung / Sperrungen / Termine
admin=[
("Netzbetreiber Abstimmung durchführen",450),
("Einweisung Netzbetreiber vor Ort",350),
("Abnahmetermin Netzbetreiber begleiten",550),
("Sperrtermin koordinieren",650),
("Schalttermin Strom begleiten",850),
("Kabelsuchdienst beauftragen",380),
("Leitungsauskunft einholen",180),
("Trassenfreigabe dokumentieren",420)
]
for name,base in admin:
  for umfang,fac in [("klein",0.7),("normal",1.0),("groß",1.8)]:
    add(
      f"{name} {umfang}",
      f"{name} {umfang} inkl. Schriftverkehr, Nachweisen und Dokumentation.",
      "Psch","Netzbetreiber Koordination","Abstimmung/Genehmigung",*p(base*fac),ctx=True
    )

payload={"sourceName":"rlc-global-tiefbau-seed-v40-netzbetreiber","sourceType":"manual-seed-v40","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
