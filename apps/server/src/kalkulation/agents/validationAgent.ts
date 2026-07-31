import type {
  KalkulationAgentContext,
  KalkulationAgentReport,
  LvAnalysisOutput,
  ValidationAgentOutput,
} from "./types";

export function runValidationAgent(
  context: KalkulationAgentContext,
  lv: LvAnalysisOutput
): KalkulationAgentReport<ValidationAgentOutput> {
  const qtyValid =
    typeof context.row.menge === "number" &&
    Number.isFinite(context.row.menge) &&
    context.row.menge > 0;

  const unitValid = Boolean(String(context.row.einheit || "").trim());
  const textValid = lv.normalizedText.length >= 5;
  const positionValid = Boolean(
    String(context.row.posNr || context.row.kurztext || "").trim()
  );

  const checks = {
    qtyValid,
    unitValid,
    textValid,
    positionValid,
  };

  const warnings: string[] = [];
  if (!qtyValid) warnings.push("Menge fehlt, ist null oder ist ungültig.");
  if (!unitValid) warnings.push("Einheit fehlt.");
  if (!textValid) warnings.push("Positionstext ist zu kurz.");
  if (!positionValid) warnings.push("Positionsnummer oder Kurztext fehlt.");

  const valid = Object.values(checks).every(Boolean);
  const reviewRequired = !valid || lv.complexity === "high";
  const confidence = valid ? 0.95 : 0.72;

  return {
    agent: "validation",
    confidence,
    warnings,
    findings: [
      {
        code: "INPUT_VALIDATION",
        severity: valid ? "info" : "critical",
        message: valid
          ? "Eingabedaten vollständig und plausibel."
          : warnings.join(" "),
        confidence,
        data: checks,
      },
    ],
    output: {
      valid,
      reviewRequired,
      checks,
    },
  };
}
