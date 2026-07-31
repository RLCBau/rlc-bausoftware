const jwt = require("jsonwebtoken");

const companyId =
  process.env.DEV_COMPANY_ID ||
  "4fdd084a-f544-4c37-a5e6-0d922acef28d";

const secret = process.env.JWT_SECRET;

if (!secret) {
  console.error("JWT_SECRET fehlt im Container.");
  process.exit(1);
}

const options = {
  algorithm: "HS256",
  expiresIn: "2h",
};

if (process.env.JWT_ISS) options.issuer = process.env.JWT_ISS;
if (process.env.JWT_AUD) options.audience = process.env.JWT_AUD;

const token = jwt.sign(
  {
    sub: "dev-test-user",
    role: "ADMIN",
    companyId,
    company: companyId,
    companyRole: "ADMIN",
    mode: "SERVER_SYNC",
    emailVerified: true,
  },
  secret,
  options
);

const payload = {
  projectCode: "TEST-CONTEXT",
  useOpenAI: false,
  forceRecalculate: true,
  rows: [
    {
      id: "test-baustelleneinrichtung",
      posNr: "001",
      kurztext: "Baustelleneinrichtung",
      langtext:
        "Baustelleneinrichtung für Gesamtbaustelle inkl. Vorhaltung, Container, Geräte, Logistik und Baustellengemeinkosten",
      einheit: "Psch",
      menge: 1,
      projectDurationDays: 730,
      projectDistanceKm: 80
    }
  ]
};

fetch("http://localhost:4000/api/kalkulation/ki/suggest-batch", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(payload),
})
  .then(async (r) => {
    const text = await r.text();
    console.log("STATUS:", r.status);
    console.log(text.slice(0, 12000));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
