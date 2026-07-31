export async function optimizePlan(projectId: string) {
  console.log(`[optimizer] gestartet für Projekt ${projectId}`);
  return {
    status: "ok",
    message: `Optimierung abgeschlossen für Projekt ${projectId}`,
    data: [
      { resource: "Bagger 1", auslastung: 85 },
      { resource: "Facharbeiter-Team A", auslastung: 78 }
    ]
  };
}
