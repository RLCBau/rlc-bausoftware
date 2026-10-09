const fs = require("fs");
const path = require("path");
const { createSelfBillingGutschrift } = require("./src/services/pdf/selfBillingGutschrift");
(async () => {
  const out = "/tmp/rlc-gutschrift-test";
  fs.rmSync(out, { recursive: true, force: true });
  const result = await createSelfBillingGutschrift({
    outputDir: out,
    projectId: "TEST",
    projectName: "Testprojekt",
    number: "GS-2026-001",
    issueDate: "2026-10-07",
    dueDate: "2026-10-21",
    serviceDate: "2026-10-06",
    serviceDescription: "Bauleistung Test",
    netAmount: 1000,
    vatRate: 19,
    supplier: {
      name: "Test Lieferant GmbH",
      street: "Musterweg 5",
      postalCode: "50667",
      city: "Koeln",
      country: "DE",
      email: "seller@example.invalid",
      vatId: "DE111111111",
      iban: "DE02120300000000202051",
      bic: "BYLADEM1001",
      phone: "+49 221 123456",
      contactName: "Test Lieferant"
    },
    buyerCompany: {
      name: "Test Bau GmbH",
      legalName: "Test Bau GmbH",
      street: "Teststrasse 1",
      postalCode: "10115",
      city: "Berlin",
      country: "DE",
      email: "buyer@example.invalid",
      vatId: "DE222222222",
      phone: "+49 30 123456"
    },
    buyerReference: "SELF-BILL-TEST"
  });
  console.log(JSON.stringify({
    validation: result.validation,
    pdf: fs.existsSync(result.pdfPath),
    xml: fs.existsSync(result.xmlPath),
    report: !!result.reportPath && fs.existsSync(result.reportPath),
  }, null, 2));
  if (!result.validation.valid) process.exit(2);
})().catch(e => { console.error(e); process.exit(1); });
