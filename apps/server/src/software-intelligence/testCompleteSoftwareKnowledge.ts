import { retrieveSoftwareIntelligence } from "./repositoryKnowledge";

type Platform = "WEB" | "MOBILE" | "SERVER";

type Test = {
  platform: Platform;
  q: string;
  expected?: string[];
};

const tests: Test[] = [

  // WEB / START / PROJEKTE
  { platform: "WEB", q: "Wie öffne oder erstelle ich ein Projekt?", expected: ["project", "start"] },
  { platform: "WEB", q: "Wo finde ich die Projektübersicht?", expected: ["projekt", "project"] },

  // KALKULATION
  { platform: "WEB", q: "Wie funktioniert die KI-Kalkulation?", expected: ["kalkulationMitKI"] },
  { platform: "WEB", q: "Wie importiere ich eine GAEB-Datei?", expected: ["gaeb"] },
  { platform: "WEB", q: "Wie erstelle ich ein Angebot?", expected: ["angebot"] },
  { platform: "WEB", q: "Wo finde ich Nachträge?", expected: ["nachtraege"] },
  { platform: "WEB", q: "Wie funktioniert die Kalkulationsdatenbank?", expected: ["kalkulationsDatenbank"] },
  { platform: "WEB", q: "Wie funktioniert der Versionsvergleich?", expected: ["Versionsvergleich"] },
  { platform: "WEB", q: "Wie verwalte ich Preise?", expected: ["preise"] },
  { platform: "WEB", q: "Wie funktionieren Rezepte in der Kalkulation?", expected: ["Recipes"] },

  // MENGENERMITTLUNG
  { platform: "WEB", q: "Wo finde ich den Aufmaßeditor?", expected: ["AufmassEditor"] },
  { platform: "WEB", q: "Wie funktioniert Soll-Ist im Aufmaß?", expected: ["SollIst", "AufmassEditor"] },
  { platform: "WEB", q: "Wo finde ich Regieberichte?", expected: ["Regieberichte"] },
  { platform: "WEB", q: "Wo finde ich Lieferscheine?", expected: ["lieferscheine"] },
  { platform: "WEB", q: "Wie funktioniert die automatische Mengenermittlung?", expected: ["AutoKI"] },

  // CAD
  { platform: "WEB", q: "Wo finde ich CAD?", expected: ["CADViewer"] },
  { platform: "WEB", q: "Wie öffne ich DWG oder DXF?", expected: ["CADViewer"] },
  { platform: "WEB", q: "Wie funktioniert As-Built?", expected: ["asbuild"] },

  // BÜRO / VERWALTUNG
  { platform: "WEB", q: "Wo finde ich die Lizenzverwaltung?", expected: ["Nutzerverwaltung"] },
  { platform: "WEB", q: "Wie verwalte ich Nutzer und Rechte?", expected: ["Nutzerverwaltung"] },
  { platform: "WEB", q: "Wie verwalte ich Mitarbeiter?", expected: ["personalverwaltung", "Nutzerverwaltung"] },
  { platform: "WEB", q: "Wie verwalte ich Maschinen?", expected: ["maschinenverwaltung"] },
  { platform: "WEB", q: "Wie verwalte ich Material?", expected: ["materialverwaltung"] },
  { platform: "WEB", q: "Wo finde ich Tagesberichte?", expected: ["Tagesberichte"] },
  { platform: "WEB", q: "Wo finde ich das Bautagebuch?", expected: ["Bautagebuch"] },

  // BUCHHALTUNG
  { platform: "WEB", q: "Wo finde ich Rechnungen?", expected: ["rechnungen"] },
  { platform: "WEB", q: "Wo finde ich Eingangsrechnungen?", expected: ["eingang"] },
  { platform: "WEB", q: "Wie funktionieren Abschlagsrechnungen?", expected: ["Abschlagsrechnungen"] },
  { platform: "WEB", q: "Wie funktioniert das Mahnwesen?", expected: ["mahnwesen"] },

  // SUPPORT / AUTH
  { platform: "WEB", q: "Wie funktioniert der RLC Support?", expected: ["support"] },
  { platform: "WEB", q: "Wie melde ich mich an?", expected: ["Login"] },
  { platform: "WEB", q: "Wie kann ich mein Passwort anzeigen?", expected: ["Login"] },

  // SUPER ADMIN / PLATFORM
  { platform: "WEB", q: "Wo verwaltet der RLC Super-Admin alle Firmen?", expected: ["PlatformAdmin"] },
  { platform: "WEB", q: "Wie bearbeitet der Super-Admin Firmendaten?", expected: ["PlatformAdmin"] },
  { platform: "WEB", q: "Wie legt der Super-Admin Web-Lizenzen fest?", expected: ["PlatformAdmin"] },
  { platform: "WEB", q: "Wie erstellt der Super-Admin Mobile-Lizenzcodes?", expected: ["PlatformAdmin"] },
  { platform: "WEB", q: "Wie aktiviert der Super-Admin Cloud für eine Firma?", expected: ["PlatformAdmin"] },
  { platform: "WEB", q: "Wo sieht der Super-Admin Benutzer und Projekte einer Firma?", expected: ["PlatformAdmin"] },

  // MOBILE
  { platform: "MOBILE", q: "Wie funktioniert der Regiebericht auf Mobile?", expected: ["RegieScreen"] },
  { platform: "MOBILE", q: "Wie erfasse ich Arbeitszeiten?", expected: ["ArbeitszeitenScreen"] },
  { platform: "MOBILE", q: "Wie bearbeite ich Lieferscheine?", expected: ["LieferscheinScreen"] },
  { platform: "MOBILE", q: "Wie erfasse ich Fotos und Notizen?", expected: ["PhotosNotesScreen"] },
  { platform: "MOBILE", q: "Wie funktioniert die Mengenermittlung?", expected: ["MengenListScreen", "MengenEditorScreen"] },
  { platform: "MOBILE", q: "Wie sehe ich die Kalkulation?", expected: ["KalkulationScreen", "KalkulationOutlierScreen"] },
  { platform: "MOBILE", q: "Wie funktioniert der Outlier Report?", expected: ["KalkulationOutlierScreen"] },
  { platform: "MOBILE", q: "Wie funktioniert die Eingangsprüfung?", expected: ["EingangPruefungScreen"] },
  { platform: "MOBILE", q: "Wie funktioniert der Bautagesbericht?", expected: ["BautagebuchScreen", "Tagesbericht"] },
  { platform: "MOBILE", q: "Wie funktioniert die Projektübersicht auf Mobile?", expected: ["ProjectHomeScreen"] },
  { platform: "MOBILE", q: "Wie synchronisiert Mobile mit dem Server?", expected: ["ServerSetupScreen", "serverProfile", "sync"] },

  // SERVER
  { platform: "SERVER", q: "Wie funktioniert die Regiebericht API?", expected: ["routes/regie"] },
  { platform: "SERVER", q: "Wie funktioniert die Lizenzprüfung?", expected: ["routes/license", "middleware/license", "lib/license"] },
  { platform: "SERVER", q: "Wie funktioniert die Projekt API?", expected: ["routes/projects", "projectLv"] },
  { platform: "SERVER", q: "Wie funktioniert Construction Intelligence?", expected: ["constructionIntelligenceEngine"] },
  { platform: "SERVER", q: "Wie funktioniert der Mailversand?", expected: ["mail.routes", "mailer"] },
  { platform: "SERVER", q: "Wie funktioniert der Support Chat Backend?", expected: ["support.chat"] },
  { platform: "SERVER", q: "Wie werden Mobile-Lizenzen serverseitig verwaltet?", expected: ["company.mobile-licenses"] },
  { platform: "SERVER", q: "Wie funktioniert Platform Admin serverseitig?", expected: ["platform.admin"] }
];

let passed = 0;
let failed = 0;
let empty = 0;

for (const test of tests) {
  const result = retrieveSoftwareIntelligence(test.q, {
    platform: test.platform,
    limit: 5
  });

  const first = result.matches[0];
  const haystack = first
    ? `${first.file} ${first.title} ${first.area}`.toLowerCase()
    : "";

  const expected = test.expected || [];

  const ok =
    !!first &&
    (
      expected.length === 0 ||
      expected.some(x =>
        haystack.includes(x.toLowerCase())
      )
    );

  if (!first) empty++;

  if (ok) passed++;
  else failed++;

  console.log("\n==================================================");
  console.log(`${ok ? "PASS" : "FAIL"} | ${test.platform} | ${test.q}`);

  result.matches.slice(0, 5).forEach((m, i) => {
    console.log(
      `${i + 1}. SCORE ${m.score} | ${m.area} | ${m.kind}\n   ${m.file}`
    );
  });

  if (!ok) {
    console.log(
      "ERWARTET:",
      expected.join(" | ")
    );
  }
}

console.log("\n==================================================");
console.log("RLC SOFTWARE INTELLIGENCE COMPLETE TEST");
console.log("TESTS:", tests.length);
console.log("PASS:", passed);
console.log("FAIL:", failed);
console.log("OHNE TREFFER:", empty);
console.log(
  failed === 0 && empty === 0
    ? "=== COMPLETE KNOWLEDGE TEST OK ==="
    : "=== COMPLETE KNOWLEDGE TEST NICHT OK ==="
);
