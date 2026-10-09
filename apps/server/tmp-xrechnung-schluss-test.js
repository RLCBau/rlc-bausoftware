const fs = require("fs");
const { buildXRechnungUbl, runKositXRechnungValidator } = require("./src/services/xrechnung");
const xml = buildXRechnungUbl({
  number: "R-TEST-SCHLUSS-001",
  issueDate: "07.10.2026",
  dueDate: "21.10.2026",
  deliveryDate: "07.10.2026",
  buyerReference: "TEST-ENDRECHNUNG",
  currency: "EUR",
  vatRate: 19,
  taxTreatment: "STANDARD",
  netAmount: 1000,
  prepaidAmount: 595,
  supportingDocument: {
    id: "ENDRECHNUNG-TEILENTGELTE",
    description: "Absetzung der vereinnahmten Teilentgelte und darauf entfallenden Steuerbeträge gemäß § 14 Abs. 5 UStG – siehe beigefügte Schlussrechnung",
    filename: "R-TEST-SCHLUSS-001.pdf",
    contentBase64: Buffer.from("%PDF-1.4\n%%EOF", "utf8").toString("base64")
  },
  seller: {
    name: "Test Lieferant GmbH",
    street: "Teststrasse 1",
    postalCode: "10115",
    city: "Berlin",
    country: "DE",
    email: "seller@example.invalid",
    vatId: "DE111111111",
    iban: "DE02120300000000202051",
    bic: "BYLADEM1001",
    contactName: "Test Kontakt",
    phone: "+49 30 123456"
  },
  buyer: {
    name: "Test Bau GmbH",
    street: "Musterweg 5",
    postalCode: "50667",
    city: "Koeln",
    country: "DE",
    email: "buyer@example.invalid",
    vatId: "DE222222222"
  },
  lines: [{ pos: "0010", text: "Gesamtbauleistung", unit: "m", qty: 10, unitPrice: 100, total: 1000 }],
  note: "Absetzung vereinnahmter Teilentgelte siehe Anlage R-TEST-SCHLUSS-001.pdf."
});
const out = "/tmp/rlc-xrechnung-schluss.xml";
fs.writeFileSync(out, xml, "utf8");
const result = runKositXRechnungValidator(out);
console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exit(2);
