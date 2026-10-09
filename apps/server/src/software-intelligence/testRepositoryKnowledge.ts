import { retrieveSoftwareIntelligence } from "./repositoryKnowledge";

const tests = [
  {
    q: "Wo finde ich die Lizenzverwaltung?",
    options: { platform: "WEB" as const, limit: 5 }
  },
  {
    q: "Wie funktioniert der Regiebericht auf Mobile?",
    options: { platform: "MOBILE" as const, limit: 5 }
  },
  {
    q: "Wo finde ich den Aufmaßeditor?",
    options: { platform: "WEB" as const, limit: 5 }
  },
  {
    q: "Wie funktioniert die KI-Kalkulation?",
    options: { platform: "WEB" as const, limit: 5 }
  }
];

for (const test of tests) {
  console.log("\n========================================");
  console.log("FRAGE:", test.q);

  const r = retrieveSoftwareIntelligence(
    test.q,
    test.options
  );

  for (const m of r.matches) {
    console.log(
      `\nSCORE ${m.score} | ${m.platform} | ${m.area}\n${m.file}\n${(m.routes || []).join(", ")}`
    );
  }
}
