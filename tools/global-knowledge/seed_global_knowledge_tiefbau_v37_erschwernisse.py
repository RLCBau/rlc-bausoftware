import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=True):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":0.25,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})
def p(x): return x*0.4,x,x*4.0

items=[
("Handschachtung",145),("Arbeiten unter Verkehr",95),("Nachtarbeit",120),
("Wochenendarbeit",160),("Arbeiten im Bestand",85),("Arbeiten in Engstellen",110),
("Arbeiten im Wurzelbereich",95),("Arbeiten im Gleisbereich",220),
("Arbeiten an Gewässern",180),("Arbeiten im Schutzgebiet",160),
("Kampfmittelverdacht",250),("Altlastenverdacht",280),("Grundwassererschwernis",190),
("Wasserhaltung Erschwernis",220),("Fels lösen Erschwernis",260),
("Leitungsbestand unbekannt",140),("beengte Bauweise",130),("Anwohnerkoordination",75)
]

for name,base in items:
  for stufe,fac in [("leicht",0.7),("mittel",1.0),("schwer",1.8),("extrem",3.0)]:
    add(f"Erschwernis {name} {stufe}",f"Erschwernis {name} {stufe}; kalkulatorisch abhängig von Dauer, Risiko, Ort und Nachweis.","h","Erschwernisse","Sonderleistung",*p(base*fac))

payload={"sourceName":"rlc-global-tiefbau-seed-v37-erschwernisse","sourceType":"manual-seed-v37","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
