import fs from "fs";
import { parseGaebXmlImport } from "../routes/projectLv";
import { buildGaebX84Xml, buildGaebX85X87Xml } from "../gaeb/gaebXml33";
import { buildGaebX31Xml } from "../gaeb/gaebX31";
import { evaluateReb23003Positions } from "../reb/reb23003";

const ROOT = process.env.GAEB_BVBS_FIXTURES || "/tmp/gaeb-bvbs";
const paths = {
  x83: `${ROOT}/bau_x83/Pruefdatei GAEB DA XML 3.3 - Bauausfuehrung - V 04 04 2024.x83`,
  x84: `${ROOT}/bau_x84/BVBS_Pruefdatei GAEB DA XML 3.3 - Bauausfuehrung - V 11 06 2021.x84`,
  x31: `${ROOT}/menge_x31/Pruefdatei GAEB DA XML 3.3 - Mengenermittlung - V 11 06 2021.x31`,
  x86: `${ROOT}/menge_x86/Pruefdatei GAEB DA XML 3.3 - Mengenermittlung - V 11 06 2021.x86`,
  image: `${ROOT}/musterzeichnung/Musterzeichnung.jpg`,
};

let fails = 0;

function ok(cond: unknown, label: string) {
  if (cond) console.log("OK  ", label);
  else {
    fails++;
    console.error("FAIL", label);
  }
}

function near(a: unknown, b: number, eps = 0.0005) {
  return Math.abs(Number(a) - b) <= eps;
}

function mkRow(
  marker: string,
  label: string,
  factor: string,
  fn: string,
  expr: string,
  addr: string
) {
  const left = (
    " ".repeat(12) +
    (marker || " ") +
    String(label || "").slice(0, 9).padEnd(9, " ") +
    " " +
    String(factor || "").padStart(6, " ").slice(-6) +
    String(fn).padStart(2, "0") +
    String(expr).slice(0, 38).padEnd(38, " ")
  ).slice(0, 69).padEnd(69, " ");
  return (left + String(addr).padEnd(11, " ")).slice(0, 80).padEnd(80, " ");
}

function mkComment(text: string, addr: string) {
  return (
    (" ".repeat(12) + "*" + text).slice(0, 69).padEnd(69, " ") +
    String(addr).padEnd(11, " ")
  ).slice(0, 80).padEnd(80, " ");
}

async function main() {
  for (const [key, file] of Object.entries(paths)) {
    if (!fs.existsSync(file)) throw new Error(`Fixture fehlt: ${key} ${file}`);
  }

  const x83: any = await parseGaebXmlImport(fs.readFileSync(paths.x83, "utf8"));
  const x84: any = await parseGaebXmlImport(fs.readFileSync(paths.x84, "utf8"));
  const x31: any = await parseGaebXmlImport(fs.readFileSync(paths.x31, "utf8"));
  const x86: any = await parseGaebXmlImport(fs.readFileSync(paths.x86, "utf8"));

  // Bauausführung Prüfkatalog 1.x
  ok(x83.items.length === 28, "Bauausführung 1.x: X83 28 Positionen inkl. Zuschlagsposition");
  for (const pos of [
    "001.001.0010",
    "001.001.0010.1",
    "001.001.0010.A",
    "002.001.0030",
    "999.999.9999.z",
  ]) {
    ok(x83.items.some((r: any) => r.pos === pos), `Bauausführung: OZ ${pos}`);
  }
  ok(x83.items.some((r: any) => r.gaebItemKind === "MarkupItem"), "Bauausführung: Zuschlagsposition/MarkupItem");
  ok(x83.items.some((r: any) => Array.isArray(r.gaebImages) && r.gaebImages.length > 0), "Bauausführung: Grafik im Langtext");
  ok(x83.items.some((r: any) => Array.isArray(r.gaebTextComplements) && r.gaebTextComplements.length > 0), "Bauausführung: Bieter-Textergänzungen");
  ok(x83.items.some((r: any) => Array.isArray(r.gaebSubDescriptions) && r.gaebSubDescriptions.length > 0), "Bauausführung: Leit-/Unterbeschreibung");
  ok(Array.isArray(x83.gaebRemarks) && x83.gaebRemarks.length === 4, "Bauausführung 1.21: 4 Hinweistexte/Remarks");
  ok(
    String(x83.gaebRemarks?.[x83.gaebRemarks.length - 1]?.text || "").includes("GAEB-Zertifizierung im Bereich Bauausführung beendet"),
    "Bauausführung 1.21: letzter Hinweistext bleibt erhalten"
  );

  // X83 -> X84 roundtrip with official reference prices.
  const priceMap = new Map(x84.items.map((r: any) => [r.pos, r]));
  const x84Rows = x83.items.map((r: any) => {
    const ref: any = priceMap.get(r.pos) || {};
    return {
      posNr: r.pos,
      kurztext: r.text,
      langtext: r.langtext,
      einheit: r.unit,
      menge: r.quantity,
      preis: ref.ep ?? (r.gaebItemKind === "MarkupItem" ? 10 : 1),
      gesamt: r.gaebItemKind === "MarkupItem" ? 0 : ref.total,
      gaebItemKind: r.gaebItemKind,
      gaebMarkupType: r.gaebMarkupType,
      gaebAlnGroupNo: r.gaebAlnGroupNo,
      gaebAlnSerNo: r.gaebAlnSerNo,
      gaebProvis: r.gaebProvis,
      gaebProvisAccpt: r.gaebProvisAccpt,
      gaebTextComplements: r.gaebTextComplements,
      gaebSubDescriptions: r.gaebSubDescriptions,
      gaebImages: r.gaebImages,
    };
  });

  const out84 = buildGaebX84Xml({
    rows: x84Rows,
    project: { code: "BVBS-4711", name: "BVBS GAEB Muster" },
    company: { name: "RLC Test GmbH", address: "Musterstraße 1, 83435 Bad Reichenhall" },
    createdAt: new Date("2024-04-04T11:11:00Z"),
  });
  fs.writeFileSync(`${ROOT}/rlc-pruefkatalog-roundtrip.x84`, out84);

  ok(out84.includes("<ProgSystem>RLC Bausoftware 1.0.0</ProgSystem>"), "Bauausführung 2.3: ProgSystem enthält Name + Version");
  ok(out84.includes("<Total>2000000.00</Total>"), "Bauausführung: Projektsumme 2.000.000,00 EUR");
  ok(out84.includes("<ITMarkup>850000.00</ITMarkup><Markup>10.00</Markup><IT>85000.00</IT>"), "Bauausführung: Zuschlagsposition 10% = 85.000,00 EUR");
  ok((out84.match(/<BoQBkdn>/g) || []).length === 4, "Bauausführung 2.5: LVGliederung 3/3/4/Index");
  ok((out84.match(/<TextComplement/g) || []).length >= 2, "Bauausführung: Bieter-Textergänzungen X84");
  ok((out84.match(/<SubDescr>/g) || []).length >= 2, "Bauausführung: Unterbeschreibungen X84");

  // Mengenermittlung Prüfkatalog 1.x / 2.1 - 2.3
  ok(x86.items.length === 20, "Mengenermittlung 1.x: X86 20 Positionen");
  ok(x86.gaebBoQBreakdown?.map((x: any) => x.length).join("/") === "3/3/4/1", "Mengenermittlung: X86 LVGliederung 3/3/4/Index");
  ok(x31.items.length === 20, "Mengenermittlung 2.1: X31 20 Positionen");
  ok(fs.statSync(paths.image).size > 10000, "Mengenermittlung 2.3: Musterzeichnung vorhanden");

  const baseRows = x31.items.map((r: any) => ({
    pos: r.pos,
    qTakeoffRows: [...(r.gaebQTakeoffRows || [])],
  }));
  const baseEval = evaluateReb23003Positions(baseRows);

  const expectedBase: Record<string, number> = {
    "001.001.0010": 0.25,
    "001.001.0010.1": 0.1,
    "001.001.0010.A": 0,
    "001.002.0010": 666.259,
    "001.002.0020": 11867.781,
    "001.002.0030": 3136,
    "001.002.0040": 1733.5,
    "001.002.0050": 1656.133,
    "001.003.0010": 1653.87,
    "001.003.0020": 13.886,
    "001.003.0030": 0,
    "001.003.0040": 0,
    "001.004.0010": 0,
    "001.004.0020": 0,
    "001.004.0030": 0,
    "002.001.0010": 166.964,
    "002.001.0020": 65.691,
    "999.999.9999": 24,
    "999.999.9999.y": 4,
    "999.999.9999.z": 1,
  };

  for (const [pos, expected] of Object.entries(expectedBase)) {
    const result = baseEval.get(pos);
    ok(result && result.errors.length === 0 && near(result.total, expected), `Mengenermittlung 2.2: ${pos} = ${expected}`);
  }

  // Prüfkatalog 2.4 - 2.6 exact additions from BVBS result PDF.
  const modifiedRows = baseRows.map((r: any) => ({ pos: r.pos, qTakeoffRows: [...r.qTakeoffRows] }));
  const p0010 = modifiedRows.find((r: any) => r.pos === "001.002.0010");
  p0010.qTakeoffRows.push(mkRow("", "neu", "", "04", "14500 6000 3000", "0003D0"));

  const p0030 = modifiedRows.find((r: any) => r.pos === "001.002.0030");
  p0030.qTakeoffRows.push(mkComment("Berechnung von Teilflächen", "0004O0"));
  p0030.qTakeoffRows.push(mkRow("", "neu", "999", "91", "0004P0=", "0004O5"));
  p0030.qTakeoffRows.push(mkRow("H", "neu", "", "04", "155000 99000", "0004P0"));

  const modifiedEval = evaluateReb23003Positions(modifiedRows);
  ok(near(modifiedEval.get("001.002.0010")?.total, 927.259), "Mengenermittlung 2.4: Formel 04 -> 927,259");
  ok(near(modifiedEval.get("001.002.0030")?.total, 18481), "Mengenermittlung 2.5/2.6: H + Faktor 999 + Formel 91 -> 18.481,000");
  ok(modifiedEval.get("001.002.0030")?.errors.length === 0, "Mengenermittlung 2.5/2.6: keine REB-Rechenfehler");

  // X31 roundtrip / checker prerequisites.
  const out31_21 = buildGaebX31Xml({
    rows: x31.items.map((r: any) => ({ pos: r.pos, qTakeoffRows: r.gaebQTakeoffRows || [] })),
    project: { code: "BVBS-4711", name: "BVBS GAEB Musterdatei 3.3" },
    versDate: "2021-05",
    createdAt: new Date("2021-06-11T10:56:02Z"),
    awardNo: "BVBS-4711",
    dpNo: "A-2021-10",
  });
  fs.writeFileSync(`${ROOT}/rlc-pruefkatalog-2021.x31`, out31_21);
  ok(out31_21.includes("<Version>3.3</Version>"), "Mengenermittlung 2.10: Version 3.3");
  ok(out31_21.includes("<VersDate>2021-05</VersDate>"), "Mengenermittlung 2.10: VersDate 2021-05");
  ok(out31_21.includes("<ProgSystem>RLC Bausoftware 1.0.0</ProgSystem>"), "Mengenermittlung 2.10: ProgSystem Name + Version");
  ok((out31_21.match(/<QTakeoff /g) || []).length === 105, "Mengenermittlung 2.8: 105 QTakeoff-Zeilen re-exportiert");

  // Other GAEB XML phases currently supported by RLC.
  const simpleRows: any[] = [
    { posNr: "001.001.0010", kurztext: "Test", langtext: "Lang", einheit: "m", menge: 2, preis: 3.5 },
    { posNr: "001.001.0010.A", kurztext: "Test A", langtext: "Lang A", einheit: "m", menge: 1, preis: 5 },
  ];
  for (const format of ["X85", "X86", "X87"] as const) {
    const xml = buildGaebX85X87Xml({
      format,
      rows: simpleRows,
      project: { code: "TEST", name: "Test" },
      company: { name: "RLC Test GmbH", address: "Musterstraße 1, 83435 Bad Reichenhall" },
      owner: { name: "AG Test", street: "Hauptstraße 1", pcode: "83435", city: "Bad Reichenhall" },
    });
    fs.writeFileSync(`${ROOT}/rlc-pruefkatalog-${format.toLowerCase()}.${format.toLowerCase()}`, xml);
    ok(xml.includes(`<DP>${format.slice(1)}</DP>`), `${format}: richtige Datenphase`);
  }

  if (fails) {
    console.error(`\nBVBS PRÜFKATALOG: ${fails} FAIL`);
    process.exit(1);
  }
  console.log("\nBVBS PRÜFKATALOG: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
