import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=False):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":0.32,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})
def p(x): return x*0.55,x,x*2.1

families=[
("Leerrohr Mehrfachbelegung prüfen","m","Kabelbau","Prüfung",3),
("Trassenband mit Ortungsdraht verlegen","m","Kabelbau","Warnband",5),
("Kabelmarker passiv setzen","St","Kabelbau","Marker",38),
("RFID Marker Leitung setzen","St","Kabelbau","Marker",65),
("Schutzrohrendverschluss gasdicht montieren","St","Kabelbau","Abdichtung",42),
("Brandschott Leitungsdurchführung herstellen","St","Gebäudeeinführung","Brandschutz",180),
("Mauerdurchführung druckwasserdicht herstellen","St","Gebäudeeinführung","Dichtung",320),
("Ringraumdichtung montieren","St","Gebäudeeinführung","Dichtung",160),
("Straßenkappe höhengerecht regulieren","St","Wasserbau","Kappen",180),
("Schiebergestänge verlängern","St","Wasserbau","Armaturen",145),
("Hydrantenschild setzen","St","Wasserbau","Beschilderung",95),
("Kanaldeckel ausbetonieren","St","Kanalbau","Schacht",240),
("Schachtkrone sanieren","St","Kanalbau","Schacht",650),
("Schachtfuge abdichten","m","Kanalbau","Sanierung",75),
("Gerinne nachprofilieren","St","Kanalbau","Schacht",480),
("Drosselorgan einbauen","St","Kanalbau","Drossel",1250),
("Rückstauklappe einbauen","St","Kanalbau","Armatur",620),
("Drainagekontrollschacht setzen","St","Drainage","Schacht",850),
("Sickerpackung herstellen","m³","Drainage","Versickerung",70),
("Filterschicht herstellen","m³","Drainage","Filter",65),
("Wurzelschutzbahn verlegen","m²","Landschaftsbau","Wurzelschutz",18),
("Baumschutzzaun stellen","m","Landschaftsbau","Baumschutz",22),
("Stammschutz herstellen","St","Landschaftsbau","Baumschutz",85),
("Handaushub im Wurzelbereich","m³","Erdbau","Baumschutz",185),
("Geogitter bewehrt einbauen","m²","Erdbau","Geokunststoff",16),
("Erosionsschutzmatte verlegen","m²","Erdbau","Erosionsschutz",14),
("Böschungssicherung Kokosmatte","m²","Erdbau","Böschung",18),
("Gabione liefern und setzen","m³","Landschaftsbau","Gabione",280),
("Winkelstützwand setzen","m","Straßenbau","Stützwand",420),
("L-Steine setzen","m","Straßenbau","Stützwand",380),
("Blockstufen setzen","m","Straßenbau","Treppen",260),
("Tastbord setzen","m","Barrierefreiheit","Bord",95),
("Blindenleitplatte verlegen","m²","Barrierefreiheit","Leitsystem",145),
("Noppenplatte verlegen","m²","Barrierefreiheit","Leitsystem",135),
("Rippenplatte verlegen","m²","Barrierefreiheit","Leitsystem",135),
("Bordabsenkung herstellen","St","Barrierefreiheit","Bord",850),
("Querungsstelle barrierefrei herstellen","St","Barrierefreiheit","Querung",2200),
("Buskapstein setzen","m","Haltestellenbau","Bord",180),
("Haltestellenbord setzen","m","Haltestellenbau","Bord",165),
("Wartefläche Haltestelle herstellen","m²","Haltestellenbau","Oberfläche",95),
("Fahrradständer setzen","St","Ausstattung","Fahrrad",180),
("Sitzbank aufstellen","St","Ausstattung","Möblierung",950),
("Abfallbehälter setzen","St","Ausstattung","Möblierung",420),
("Poller herausnehmbar setzen","St","Ausstattung","Poller",260),
("Sperrpfosten elektrisch setzen","St","Ausstattung","Poller",1450),
("Baustellenrampe herstellen","St","Provisorien","Rampe",1800),
("Stahlplatte über Graben verlegen","m²","Provisorien","Abdeckung",145),
("Fußgängerbrücke provisorisch herstellen","St","Provisorien","Brücke",3200),
("Behelfsüberfahrt herstellen","St","Provisorien","Überfahrt",2800),
("Baugrubenabdeckung herstellen","m²","Provisorien","Abdeckung",95)
]

for s,u,g,c,b in families:
  for stufe,fac in [("klein",0.7),("normal",1.0),("groß",1.8),("erschwert",2.6)]:
    add(f"{s} {stufe}",f"{s} {stufe} inkl. Nebenleistungen.",u,g,c,*p(b*fac),ctx=stufe=="erschwert")

payload={"sourceName":"rlc-global-tiefbau-seed-v38-unique-lv","sourceType":"manual-seed-v38","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
