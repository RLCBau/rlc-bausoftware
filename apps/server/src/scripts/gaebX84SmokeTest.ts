import { writeFileSync } from "fs";
import { buildGaebX84Xml } from "../gaeb/gaebXml33";

const xml = buildGaebX84Xml({
  rows: [
    { posNr: "007", kurztext: "Baustellendokumentation", langtext: "Baustellendokumentation im Naturschutzgebiet.", einheit: "Psch", menge: 1, preis: 1600, gesamt: 1600 },
    { posNr: "012", kurztext: "Grenzsteine", langtext: "Grenzsteine aufnehmen und sichern.", einheit: "St", menge: 50, preis: 36.29, gesamt: 1814.5 },
    { posNr: "NA.01", kurztext: "Plattenverlegung", langtext: "Platten fachgerecht verlegen.", einheit: "m²", menge: 2.27, preis: 0, gesamt: 0 },
  ],
  project: { code: "BA-2026-028", name: "Neues Projekt" },
  company: { name: "LoCurto", address: "Hochlalterstraß 5, 64837 Bi", email: "test@example.com", phone: "+4915228422084" },
  createdAt: new Date("2026-10-05T10:00:00Z"),
});
if (xml.includes("<QU>")) throw new Error("QU darf im X84-Item nicht exportiert werden");
if (!xml.includes("Baustellendokumentation im Naturschutzgebiet.")) throw new Error("Langtext fehlt im X84-Smoke-Test");
if (!xml.includes("Grenzsteine")) throw new Error("Kurztext fehlt im X84-Smoke-Test");
writeFileSync("/tmp/rlc-gaeb-x84-smoke.x84", xml, "utf8");
console.log("/tmp/rlc-gaeb-x84-smoke.x84");
