import json, urllib.request
API_URL="http://localhost:4000/api/global-knowledge/import"; rows=[]

def add(s,l,u,g,c,a,b,d,ctx=True):
    rows.append({"shortText":s,"longText":l,"unit":u,"gewerk":g,"category":c,"priceMin":round(a,2),"priceAvg":round(b,2),"priceMax":round(d,2),"confidence":0.25,"sampleCount":1,"isContextSensitive":ctx,"needsReview":True})
def p(x): return x*0.4,x,x*4.0

items=[("Nachtrag technische Klärung",850),("Nachtrag Planänderung",1800),("Nachtrag Bauablaufstörung",3500),("Nachtrag Wartezeit Kolonne",180),("Nachtrag Stillstand Gerät",250),("Nachtrag zusätzliche Anfahrt",650),("Nachtrag Umplanung Trasse",4500),("Nachtrag Bestandskonflikt",2800),("Nachtrag Leitungskreuzung",950),("Nachtrag Handschachtung",145)]
for name,base in items:
  for umfang,fac in [("klein",0.7),("mittel",1.0),("groß",2.2),("kritisch",4.0)]:
    add(f"{name} {umfang}",f"{name} {umfang} abhängig von Ursache, Dauer, Nachweis und Projektumständen.","Psch" if base>500 else "h","Nachträge","Sonderleistung",*p(base*fac))

logistik=[("Baustellenzufahrt herstellen",3500),("Materiallager herstellen",2500),("Umlagerung Material",850),("Zwischenlager einrichten",4200),("Container umsetzen",380),("Maschinentransport",950),("Kolonnenwechsel organisieren",650),("Lieferverzug kompensieren",1800),("Engstelle sichern",1200),("Anwohnerinformation durchführen",450)]
for name,base in logistik:
  add(name,name+" inkl. Organisation, Nebenleistungen und Dokumentation.","Psch","Baustellenlogistik","Logistik",*p(base))

payload={"sourceName":"rlc-global-tiefbau-seed-v33-nachtraege-logistik","sourceType":"manual-seed-v33","rows":rows}
req=urllib.request.Request(API_URL,data=json.dumps(payload).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
with urllib.request.urlopen(req) as r: print(r.read().decode())
print("ROWS_SENT=",len(rows))
