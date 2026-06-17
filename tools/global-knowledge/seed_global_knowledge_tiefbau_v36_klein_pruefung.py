import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=False):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":0.32,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})
def p(x): return x*0.55,x,x*2.1

items=[
("Asphalt schneiden","m",9),("Beton schneiden","m",18),("Pflaster schneiden","m",12),
("Kernbohrung DN50","St",85),("Kernbohrung DN100","St",145),("Kernbohrung DN150","St",220),("Kernbohrung DN200","St",320),
("Suchschlitz herstellen","m",55),("Leitung orten","m",3.5),("Kabelortung durchführen","m",2.8),
("Bestandsaufnahme durchführen","Psch",850),("Fotodokumentation erstellen","Psch",850),
("GPS Aufnahme durchführen","h",95),("Tachymeter Aufnahme durchführen","h",110),
("Verdichtungsprüfung","St",180),("Lastplattendruckversuch","St",320),
("Dichtheitsprüfung Kanal","Psch",1500),("Druckprüfung Wasserleitung","Psch",1800),
("TV Untersuchung Kanal","m",4.5),("Kanal reinigen","m",3.8),("Leitung spülen","m",12),
("Baustromanschluss herstellen","Psch",1800),("Bauwasseranschluss herstellen","Psch",1600),
("Verkehrsrechtliche Anordnung bearbeiten","Psch",1200),("Genehmigung einholen","Psch",950),
("Aufmaß erstellen","Psch",450),("Abrechnungsunterlagen erstellen","Psch",950),
("Übergabeunterlagen erstellen","Psch",1250),("Bestandsplan erstellen","Psch",1800)
]

for name,u,base in items:
  for umfang,fac in [("klein",0.7),("normal",1.0),("groß",1.8)]:
    add(f"{name} {umfang}",f"{name} {umfang} inkl. Nebenleistungen und Dokumentation.",u,"Nebenleistungen","Prüfung/Dokumentation/Kleinposition",*p(base*fac),u=="Psch" and base>900)

payload={"sourceName":"rlc-global-tiefbau-seed-v36-klein-pruefung","sourceType":"manual-seed-v36","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
