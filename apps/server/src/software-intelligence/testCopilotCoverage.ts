export {};

const { retrieveSoftwareIntelligence } = require("./repositoryKnowledge");

type TestCase = {
  name: string;
  query: string;
  expectedAny: string[];
};

const cases: TestCase[] = [
  {
    name: "Nutzerrechte",
    query: "Welche Rechte kann ich einem Nutzer geben?",
    expectedAny: ["nutzerverwaltung"],
  },
  {
    name: "Mobile-Lizenz einer Firma",
    query: "Wie wird ein Mobile-Lizenzcode einer Firma zugeordnet?",
    expectedAny: ["company.mobile-licenses", "nutzerverwaltung", "platform.admin"],
  },
  {
    name: "Cloud-Firma",
    query: "Wie funktioniert Cloud für eine Firma?",
    expectedAny: ["platformadmin", "platform.admin"],
  },
  {
    name: "Regiebericht",
    query: "Was passiert mit einem Regiebericht nach dem Einreichen?",
    expectedAny: ["regieberichte", "regiescreen", "routes/regie"],
  },
  {
    name: "Mobile Eingang-Prüfung",
    query: "Wie funktioniert Eingang und Prüfung in Mobile?",
    expectedAny: ["eingangpruefung"],
  },
  {
    name: "Lieferscheine",
    query: "Wo finde ich Lieferscheine auf Mobile und was passiert nach der Freigabe?",
    expectedAny: ["lieferschein"],
  },
  {
    name: "KI ohne X84",
    query: "Wie arbeitet die KI-Kalkulation ohne X84?",
    expectedAny: ["autonomousurkalkulation", "rlcautonomouskalkulator"],
  },
  {
    name: "Construction Intelligence",
    query: "Was macht Construction Intelligence konkret?",
    expectedAny: ["constructionintelligence"],
  },
  {
    name: "Markt-Intelligenz",
    query: "Wie werden Marktpreise und Baupreisquellen überwacht?",
    expectedAny: ["marketintelligence", "internetintelligence"],
  },
  {
    name: "Aufmaß Soll-Ist",
    query: "Wie funktioniert Soll-Ist zwischen Aufmaß und LV?",
    expectedAny: ["sollist", "aufmasseditor"],
  },
  {
    name: "CAD DWG DXF",
    query: "Wie importiere ich DWG oder DXF und arbeite mit Layern im CAD?",
    expectedAny: ["cad"],
  },
  {
    name: "GAEB",
    query: "Wie importiere ich eine GAEB X83 Datei und erstelle ein Angebot?",
    expectedAny: ["gaeb", "angebot"],
  },
  {
    name: "Angebote",
    query: "Wie erstelle und bearbeite ich ein Angebot?",
    expectedAny: ["angebot"],
  },
  {
    name: "Rechnungen",
    query: "Wie erstelle ich eine Abschlagsrechnung oder Schlussrechnung?",
    expectedAny: ["rechnung", "abschlag"],
  },
  {
    name: "Bautagebuch",
    query: "Wie erstelle ich ein Bautagebuch mit Bildern und PDF?",
    expectedAny: ["bautagebuch", "tagesbericht"],
  },
  {
    name: "Fotos",
    query: "Wie lade ich Baustellenfotos hoch und gebe sie frei?",
    expectedAny: ["foto"],
  },
  {
    name: "GPS As-Built",
    query: "Wie nutze ich GPS und As-Built im Projekt?",
    expectedAny: ["gps", "asbuild"],
  },
  {
    name: "Projektverwaltung",
    query: "Wie lege ich ein Projekt an und verwalte es?",
    expectedAny: ["project", "projekt"],
  },
  {
    name: "Super-Admin",
    query: "Was kann ich im Super-Admin bei einer Firma ändern?",
    expectedAny: ["platformadmin", "platform.admin"],
  },
];

const forbidden = [
  "testchunkrelevance",
  "testdeepknowledge",
  "testcopilotcoverage",
  "repositoryknowledge.ts",
  "buildsoftwareintelligenceindex.ts",
];

let passed = 0;
let failed = 0;

console.log("\n=== RLC COPILOT FULL COVERAGE ===\n");

for (const testCase of cases) {
  const result: any = retrieveSoftwareIntelligence(testCase.query, {});
  const matches: any[] = Array.isArray(result?.matches) ? result.matches : [];

  const files = matches.map((match) => String(match.file || "").toLowerCase());
  const topFiles = files.slice(0, 5);
  const hasExpected = topFiles.some((file) =>
    testCase.expectedAny.some((expected) => file.includes(expected))
  );
  const hasForbidden = files.some((file) =>
    forbidden.some((blocked) => file.includes(blocked))
  );

  const ok = matches.length > 0 && hasExpected && !hasForbidden;

  console.log(`${ok ? "PASS" : "FAIL"} | ${testCase.name}`);
  console.log(`  Frage: ${testCase.query}`);
  console.log(`  Top:   ${topFiles.join(" | ") || "KEINE QUELLE"}`);

  if (ok) {
    passed += 1;
  } else {
    failed += 1;

    if (!hasExpected) {
      console.log(
        `  Erwartet: ${testCase.expectedAny.join(" oder ")}`
      );
    }

    if (hasForbidden) {
      console.log("  Fehler: technische oder Test-Quelle gefunden");
    }
  }

  console.log("");
}

console.log("==================================");
console.log(`ERGEBNIS: ${passed}/${cases.length} bestanden, ${failed} fehlgeschlagen`);

if (failed > 0) {
  process.exitCode = 1;
}