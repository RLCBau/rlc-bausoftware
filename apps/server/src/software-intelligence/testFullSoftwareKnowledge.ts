import { retrieveSoftwareIntelligence } from "./repositoryKnowledge";

const tests = [
  ["WEB", "Wo finde ich die Lizenzverwaltung?"],
  ["WEB", "Wie verwalte ich Nutzer und Rechte?"],
  ["WEB", "Wo finde ich den Aufmaßeditor?"],
  ["WEB", "Wie funktioniert die KI-Kalkulation?"],
  ["WEB", "Wie importiere ich eine GAEB-Datei?"],
  ["WEB", "Wo finde ich Nachträge?"],
  ["WEB", "Wie erstelle ich ein Angebot?"],
  ["WEB", "Wie funktioniert die Kalkulationsdatenbank?"],
  ["WEB", "Wo finde ich CAD und den DWG/DXF Viewer?"],
  ["WEB", "Wie funktioniert Soll-Ist im Aufmaß?"],
  ["WEB", "Wo finde ich Regieberichte?"],
  ["WEB", "Wo finde ich Buchhaltung und Rechnungen?"],
  ["WEB", "Wie verwalte ich Mitarbeiter?"],
  ["WEB", "Wie verwalte ich Maschinen und Material?"],
  ["WEB", "Wie funktioniert der RLC Support?"],

  ["MOBILE", "Wie funktioniert der Regiebericht auf Mobile?"],
  ["MOBILE", "Wie erfasse ich Arbeitszeiten?"],
  ["MOBILE", "Wie bearbeite ich Lieferscheine?"],
  ["MOBILE", "Wie erfasse ich Fotos und Notizen?"],
  ["MOBILE", "Wie funktioniert die Mengenermittlung?"],
  ["MOBILE", "Wie sehe ich die Kalkulation?"],
  ["MOBILE", "Wie funktioniert der Outlier Report?"],
  ["MOBILE", "Wie funktioniert die Eingangsprüfung?"],
  ["MOBILE", "Wie funktioniert der Bautagesbericht?"],
  ["MOBILE", "Wie synchronisiert Mobile mit dem Server?"],

  ["SERVER", "Wie funktioniert die Regiebericht API?"],
  ["SERVER", "Wie funktioniert die Lizenzprüfung?"],
  ["SERVER", "Wie funktioniert die Projekt API?"],
  ["SERVER", "Wie funktioniert Construction Intelligence?"],
  ["SERVER", "Wie funktioniert der Mailversand?"],
  ["SERVER", "Wie funktioniert der Support Chat Backend?"]
] as const;

let empty = 0;

for (const [platform, question] of tests) {
  const result = retrieveSoftwareIntelligence(question, {
    platform,
    limit: 3
  });

  console.log("\n==================================================");
  console.log(`${platform} | ${question}`);

  if (!result.matches.length) {
    console.log("!!! KEIN TREFFER !!!");
    empty++;
    continue;
  }

  result.matches.forEach((m, i) => {
    console.log(
      `${i + 1}. SCORE ${m.score} | ${m.area}\n   ${m.file}`
    );
  });
}

console.log("\n==================================================");
console.log(`TESTS: ${tests.length}`);
console.log(`OHNE TREFFER: ${empty}`);
console.log(empty === 0 ? "=== RETRIEVAL COVERAGE OK ===" : "=== RETRIEVAL COVERAGE PRÜFEN ===");
