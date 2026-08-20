export {};
const {
  retrieveSoftwareIntelligence
} = require("./repositoryKnowledge");

const tests = [
  "Wie wird ein Mobile-Lizenzcode einer Firma zugeordnet?",
  "Wie arbeitet die KI-Kalkulation ohne X84?",
  "Wie funktioniert Cloud für eine Firma?"
];

for (const q of tests) {
  console.log("\n==================================================");
  console.log("FRAGE:", q);

  const r = retrieveSoftwareIntelligence(q, { limit: 8 });

  for (const m of r.matches) {
    console.log(
      `SCORE ${m.score} | ${m.platform} | ${m.kind} | ${m.area}\n` +
      `${m.file}\n` +
      `TITLE: ${m.title}\n`
    );
  }
}
