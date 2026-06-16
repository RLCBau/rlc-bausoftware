import json
import urllib.request

API_URL = "http://localhost:4000/api/global-knowledge/import"

rows = [
    # Tiefbau / Erdarbeiten
    {"shortText":"Oberboden abtragen","longText":"Oberboden lösen, laden, seitlich lagern oder abfahren.","unit":"m³","gewerk":"Tiefbau","category":"Erdarbeiten","priceMin":8,"priceAvg":14,"priceMax":24,"confidence":0.35,"sampleCount":1,"needsReview":True},
    {"shortText":"Grabenaushub herstellen","longText":"Leitungsgraben herstellen inkl. Aushub und Laden.","unit":"m³","gewerk":"Tiefbau","category":"Grabenaushub","priceMin":28,"priceAvg":42,"priceMax":70,"confidence":0.40,"sampleCount":1,"needsReview":True},
    {"shortText":"Rohrgraben herstellen","longText":"Rohrgraben für Leitungsverlegung herstellen inkl. Aushub und Verfüllung.","unit":"m","gewerk":"Tiefbau","category":"Rohrgraben","priceMin":35,"priceAvg":45,"priceMax":65,"confidence":0.45,"sampleCount":1,"needsReview":True},
    {"shortText":"Handschachtung herstellen","longText":"Handschachtung im Bereich von Bestandsleitungen oder beengten Verhältnissen.","unit":"m³","gewerk":"Tiefbau","category":"Handschachtung","priceMin":95,"priceAvg":145,"priceMax":240,"confidence":0.35,"sampleCount":1,"isContextSensitive":True,"needsReview":True},
    {"shortText":"Verfüllung mit geeignetem Material","longText":"Grabenverfüllung lagenweise einbauen und verdichten.","unit":"m³","gewerk":"Tiefbau","category":"Verfüllung","priceMin":22,"priceAvg":38,"priceMax":62,"confidence":0.40,"sampleCount":1,"needsReview":True},
    {"shortText":"Frostschutzschicht herstellen","longText":"Frostschutzmaterial liefern, einbauen und verdichten.","unit":"m²","gewerk":"Straßenbau","category":"Tragschicht","priceMin":18,"priceAvg":32,"priceMax":55,"confidence":0.40,"sampleCount":1,"needsReview":True},
    {"shortText":"Schottertragschicht herstellen","longText":"Schottertragschicht liefern, profilgerecht einbauen und verdichten.","unit":"m²","gewerk":"Straßenbau","category":"Tragschicht","priceMin":20,"priceAvg":35,"priceMax":60,"confidence":0.40,"sampleCount":1,"needsReview":True},

    # Leitungsbau
    {"shortText":"Kabelschutzrohr verlegen","longText":"Kabelschutzrohr im vorbereiteten Rohrgraben verlegen.","unit":"m","gewerk":"Kabelbau","category":"Kabelschutzrohr","priceMin":18,"priceAvg":28,"priceMax":40,"confidence":0.45,"sampleCount":1,"needsReview":True},
    {"shortText":"Speedpipe verlegen","longText":"Speedpipe / Mikrorohrverband im Graben verlegen.","unit":"m","gewerk":"Glasfaser","category":"Speedpipe","priceMin":8,"priceAvg":16,"priceMax":30,"confidence":0.35,"sampleCount":1,"needsReview":True},
    {"shortText":"PE-HD Rohr verlegen","longText":"PE-HD Rohr liefern, verlegen und ausrichten.","unit":"m","gewerk":"Rohrleitungsbau","category":"PE-HD Rohr","priceMin":25,"priceAvg":45,"priceMax":85,"confidence":0.35,"sampleCount":1,"needsReview":True},
    {"shortText":"Rohrschutzmatte verlegen","longText":"Rohrschutzmatte über Leitungen liefern und fachgerecht einbauen.","unit":"m","gewerk":"Tiefbau","category":"Rohrschutz","priceMin":16,"priceAvg":22,"priceMax":32,"confidence":0.50,"sampleCount":1,"needsReview":True},
    {"shortText":"Trassenwarnband verlegen","longText":"Warnband über Leitungstrasse einbauen.","unit":"m","gewerk":"Tiefbau","category":"Warnband","priceMin":1.5,"priceAvg":3.5,"priceMax":7,"confidence":0.40,"sampleCount":1,"needsReview":True},

    # Oberfläche
    {"shortText":"Asphalt schneiden","longText":"Asphaltfläche geradlinig schneiden.","unit":"m","gewerk":"Straßenbau","category":"Asphalt","priceMin":5,"priceAvg":9,"priceMax":16,"confidence":0.45,"sampleCount":1,"needsReview":True},
    {"shortText":"Asphalt aufnehmen und entsorgen","longText":"Asphaltbefestigung aufnehmen, laden und entsorgen.","unit":"m²","gewerk":"Straßenbau","category":"Asphalt","priceMin":18,"priceAvg":32,"priceMax":55,"confidence":0.40,"sampleCount":1,"needsReview":True},
    {"shortText":"Asphalttragschicht herstellen","longText":"Asphalttragschicht liefern und einbauen.","unit":"m²","gewerk":"Straßenbau","category":"Asphalt","priceMin":28,"priceAvg":48,"priceMax":85,"confidence":0.35,"sampleCount":1,"needsReview":True},
    {"shortText":"Asphaltdeckschicht herstellen","longText":"Asphaltdeckschicht liefern und einbauen.","unit":"m²","gewerk":"Straßenbau","category":"Asphalt","priceMin":22,"priceAvg":38,"priceMax":70,"confidence":0.35,"sampleCount":1,"needsReview":True},
    {"shortText":"Pflaster aufnehmen und wiederherstellen","longText":"Pflaster aufnehmen, zwischenlagern und wieder einbauen.","unit":"m²","gewerk":"Straßenbau","category":"Pflaster","priceMin":35,"priceAvg":60,"priceMax":95,"confidence":0.35,"sampleCount":1,"needsReview":True},
    {"shortText":"Bordstein setzen","longText":"Bordstein liefern und in Betonbettung setzen.","unit":"m","gewerk":"Straßenbau","category":"Bordstein","priceMin":45,"priceAvg":75,"priceMax":120,"confidence":0.35,"sampleCount":1,"needsReview":True},

    # Schächte / Anschlüsse
    {"shortText":"Suchschlitz herstellen","longText":"Suchschlitz zur Erkundung vorhandener Leitungen herstellen und wieder verfüllen.","unit":"m","gewerk":"Tiefbau","category":"Bestandserkundung","priceMin":35,"priceAvg":55,"priceMax":95,"confidence":0.45,"sampleCount":1,"needsReview":True},
    {"shortText":"Kernbohrung herstellen","longText":"Kernbohrung in Beton/Mauerwerk herstellen.","unit":"St","gewerk":"Rohrleitungsbau","category":"Anschluss","priceMin":120,"priceAvg":250,"priceMax":550,"confidence":0.35,"sampleCount":1,"needsReview":True},
    {"shortText":"Hausanschluss herstellen","longText":"Hausanschlussleitung herstellen inkl. Anschluss an Bestand.","unit":"St","gewerk":"Hausanschluss","category":"Context Sensitive","priceMin":1200,"priceAvg":3500,"priceMax":9000,"confidence":0.25,"sampleCount":1,"isContextSensitive":True,"needsReview":True},
    {"shortText":"Schachtabdeckung anpassen","longText":"Schachtabdeckung aufnehmen, höhenmäßig anpassen und wieder einbauen.","unit":"St","gewerk":"Straßenbau","category":"Schacht","priceMin":180,"priceAvg":380,"priceMax":850,"confidence":0.35,"sampleCount":1,"needsReview":True},

    # Dokumentation / Vermessung / Sicherung
    {"shortText":"Bestandsvermessung durchführen","longText":"Bestandsvermessung der ausgeführten Leitungen und Oberflächen.","unit":"Psch","gewerk":"Vermessung","category":"Context Sensitive","priceMin":800,"priceAvg":2500,"priceMax":12000,"confidence":0.25,"sampleCount":1,"isContextSensitive":True,"needsReview":True},
    {"shortText":"As-Built Dokumentation erstellen","longText":"Dokumentation der ausgeführten Leistungen mit Plänen und Nachweisen.","unit":"Psch","gewerk":"Dokumentation","category":"Context Sensitive","priceMin":1000,"priceAvg":3500,"priceMax":18000,"confidence":0.25,"sampleCount":1,"isContextSensitive":True,"needsReview":True},
    {"shortText":"Verkehrssicherung nach RSA herstellen","longText":"Verkehrssicherung inkl. Beschilderung, Absperrung, Kontrolle, Unterhaltung und Rückbau.","unit":"Psch","gewerk":"Verkehrssicherung","category":"Context Sensitive","priceMin":3000,"priceAvg":18000,"priceMax":90000,"confidence":0.25,"sampleCount":1,"isContextSensitive":True,"needsReview":True},
    {"shortText":"Baustelleneinrichtung herstellen und vorhalten","longText":"Baustelleneinrichtung herstellen, vorhalten, betreiben und räumen.","unit":"Psch","gewerk":"Baustelleneinrichtung","category":"Context Sensitive","priceMin":5000,"priceAvg":25000,"priceMax":120000,"confidence":0.25,"sampleCount":1,"isContextSensitive":True,"needsReview":True},
]

payload = {
    "sourceName": "rlc-global-tiefbau-seed-v2",
    "sourceType": "manual-seed",
    "notes": "Initial extended Tiefbau/Leitungsbau Global Knowledge seed. Vergleichswerte, keine finalen Kalkulationspreise.",
    "rows": rows
}

req = urllib.request.Request(
    API_URL,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)

with urllib.request.urlopen(req) as res:
    print(res.read().decode("utf-8"))
