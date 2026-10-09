export {};
const {
  retrieveSoftwareIntelligence
} = require("./repositoryKnowledge");

const tests = [
  "Welche Rechte kann ich einem Nutzer geben?",
  "Wie wird ein Mobile-Lizenzcode einer Firma zugeordnet?",
  "Was passiert mit einem Regiebericht nach dem Einreichen?",
  "Wie funktioniert Eingang / Prüfung in Mobile?",
  "Wo finde ich Lieferscheine auf Mobile und was passiert nach der Freigabe?",
  "Wie arbeitet die KI-Kalkulation ohne X84?",
  "Was macht Construction Intelligence konkret?",
  "Wie funktioniert Soll-Ist zwischen Aufmaß und LV?",
  "Was kann ich im Super-Admin bei einer Firma ändern?",
  "Wie funktioniert Cloud für eine Firma?"
];

for (const q of tests) {
  console.log("\n==================================================");
  console.log("FRAGE:", q);

  const r = retrieveSoftwareIntelligence(q, { limit: 5 });

  for (const m of r.matches) {
    console.log(
      `\nSCORE ${m.score} | ${m.platform} | ${m.area}` +
      `\nKIND: ${m.kind || "-"}` +
      `\nFILE: ${m.file}` +
      `\nTITLE: ${m.title}` +
      `\nUI: ${(m.uiRoutes || []).join(", ")}` +
      `\nAPI: ${(m.apiRoutes || []).slice(0, 8).join(", ")}`
    );
  }
}
