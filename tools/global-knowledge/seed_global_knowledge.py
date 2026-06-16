import json
import urllib.request

API_URL = "http://localhost:4000/api/global-knowledge/import"

rows = [
    {
        "shortText": "Rohrgraben herstellen",
        "longText": "Rohrgraben für Leitungsverlegung herstellen inkl. Aushub, Verfüllung und Verdichtung.",
        "unit": "m",
        "gewerk": "Tiefbau",
        "category": "Rohrgraben",
        "priceMin": 35,
        "priceAvg": 45,
        "priceMax": 65,
        "confidence": 0.45,
        "sampleCount": 1,
        "needsReview": True
    },
    {
        "shortText": "Kabelschutzrohr verlegen",
        "longText": "Kabelschutzrohr im vorbereiteten Rohrgraben verlegen.",
        "unit": "m",
        "gewerk": "Kabelbau",
        "category": "Kabelschutzrohr",
        "priceMin": 18,
        "priceAvg": 28,
        "priceMax": 40,
        "confidence": 0.45,
        "sampleCount": 1,
        "needsReview": True
    },
    {
        "shortText": "Rohrschutzmatte verlegen",
        "longText": "Rohrschutzmatte über Leitungen liefern und fachgerecht einbauen.",
        "unit": "m",
        "gewerk": "Tiefbau",
        "category": "Rohrschutz",
        "priceMin": 16,
        "priceAvg": 22,
        "priceMax": 32,
        "confidence": 0.50,
        "sampleCount": 1,
        "needsReview": True
    },
    {
        "shortText": "Baustelleneinrichtung herstellen und vorhalten",
        "longText": "Baustelleneinrichtung herstellen, vorhalten, betreiben und räumen.",
        "unit": "Psch",
        "gewerk": "Baustelleneinrichtung",
        "category": "Context Sensitive",
        "priceMin": 5000,
        "priceAvg": 25000,
        "priceMax": 120000,
        "confidence": 0.25,
        "sampleCount": 1,
        "isContextSensitive": True,
        "needsReview": True
    },
    {
        "shortText": "Verkehrssicherung nach RSA herstellen",
        "longText": "Verkehrssicherung inkl. Beschilderung, Absperrung, Kontrolle, Unterhaltung und Rückbau.",
        "unit": "Psch",
        "gewerk": "Verkehrssicherung",
        "category": "Context Sensitive",
        "priceMin": 3000,
        "priceAvg": 18000,
        "priceMax": 90000,
        "confidence": 0.25,
        "sampleCount": 1,
        "isContextSensitive": True,
        "needsReview": True
    }
]

payload = {
    "sourceName": "rlc-global-seed-v1",
    "sourceType": "manual-seed",
    "notes": "Initial RLC Global Knowledge seed",
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
