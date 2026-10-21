/* RLC Mobile XLSX regression: run with node audit/test-offer-workbook.cjs */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { unzipSync, strFromU8 } = require("fflate");

const sourcePath = path.resolve(__dirname, "../src/lib/offerWorkbook.ts");
const content = fs.readFileSync(sourcePath, "utf8");
const javascript = ts.transpileModule(content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const loaded = new Module(sourcePath, module);
loaded.filename = sourcePath;
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
loaded._compile(javascript, sourcePath);

const workbook = loaded.exports.createOfferWorkbookBase64(
  [{ Position: "01.001", Text: '=HYPERLINK("https://example.invalid")', Menge: 2.5, EP: 98.75 },
   { Position: "01.002", Text: "Kanal & Pflaster <Bau>", Menge: 10, EP: 35 }],
  [{ Feld: "MwSt %", Wert: 19 }, { Feld: "Anmerkung", Wert: "Kontrolle" }]
);
const files = unzipSync(Uint8Array.from(Buffer.from(workbook, "base64")));
assert.deepEqual(
  ["xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"].every(k => !!files[k]),
  true
);
const wb = strFromU8(files["xl/workbook.xml"]);
const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
assert.match(wb, /Positionen/);
assert.match(wb, /Zusammenfassung/);
assert.match(sheet, /<v>2.5<\/v>/);
assert.match(sheet, /<v>98.75<\/v>/);
assert.match(sheet, /t="inlineStr"/);
assert.match(sheet, /&amp;/);
assert.match(sheet, /&lt;Bau&gt;/);
assert.match(sheet, /=HYPERLINK/);
assert.doesNotMatch(sheet, /<f>/);
const bad = loaded.exports.createOfferWorkbookBase64([{ Text: "a\u0000b\u0001c" }], []);
const badSheet = strFromU8(unzipSync(Uint8Array.from(Buffer.from(bad, "base64")))["xl/worksheets/sheet1.xml"]);
assert.match(badSheet, /abc/);
assert.doesNotMatch(badSheet, /\u0000|\u0001/);
assert.throws(() => loaded.exports.createOfferWorkbookBase64(Array(50001).fill({}), []), /50.000/);
console.log("PASS Mobile XLSX: OOXML, 2 sheets, numeric cells, escaping, formula injection, limits");
