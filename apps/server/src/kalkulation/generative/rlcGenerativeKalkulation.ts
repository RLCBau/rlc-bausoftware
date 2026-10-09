import { generateRlcLvFromText } from "./rlcLvGenerator";
import type { RlcAutonomousCalcInput } from "../autonomous/types";
import { resolveRlcPrice } from "../priceResolver/rlcPriceResolver";
import { calcRecipeKalkulationRow } from "../kalkulationsRecipeEngine";

export type RlcGenerativeKalkulationInput = {
  text: string;
  companyId: string;
  projectCode?: string;
};

export async function runRlcGenerativeKalkulation(
  input: RlcGenerativeKalkulationInput
) {
  const generated = await generateRlcLvFromText(input);
  const allRows: RlcAutonomousCalcInput[] = generated.rows;

  const rows = await Promise.all(
    allRows.map(async (row) => {
      const qty = Number(row.menge || 0);
      const technicalEvidence =
        generated.technicalEvidenceByPos[String(row.posNr || "")] || [];

      if (!(qty > 0)) {
        return {
          input: row,
          resolved: null,
          calculated: null,
          priceResolution: null,
          unresolvedReason: "MENGE_FEHLT",
          technicalEvidence,
        };
      }

      /*
       * Price Resolver = reine Preis-/Marktevidenz.
       * Er erzeugt keine künstliche Urkalkulation.
       */
      const priceResolution = await resolveRlcPrice({
        companyId: input.companyId,
        kurztext: String(row.kurztext || ""),
        langtext: String(row.langtext || ""),
        einheit: String(row.einheit || ""),
        targetDate: new Date(),
      });

      /*
       * EIN zentraler Urkalkulationsmotor für alle Gewerke.
       */
      const recipeResult = await calcRecipeKalkulationRow(
        {
          posNr: row.posNr,
          kurztext: row.kurztext,
          langtext: row.langtext,
          einheit: row.einheit,
          menge: qty,
        },
        {
          companyId: input.companyId,
          projectCode: input.projectCode,
        }
      );

      const recipeResolved =
        recipeResult?.source === "recipe" &&
        recipeResult?.resourceResolutionStatus === "RESOLVED" &&
        Number(recipeResult?.finalUnitPrice || 0) > 0;

      const calculated = recipeResolved
        ? {
            ...recipeResult,
            totalNet:
              Math.round(
                (qty * Number(recipeResult.finalUnitPrice) +
                  Number.EPSILON) *
                  100
              ) / 100,
          }
        : null;

      return {
        input: row,
        resolved: recipeResult,
        calculated,
        priceResolution,
        unresolvedReason: calculated
          ? undefined
          : recipeResult?.resourceResolutionStatus === "PARTIAL"
            ? "URKALKULATION_RESSOURCEN_FEHLEN"
            : priceResolution.status === "RESOLVED"
              ? "PREIS_EVIDENZ_OHNE_URKALKULATION"
              : "KEINE_KOMPATIBLE_PREIS_ODER_RESSOURCENQUELLE",
        technicalEvidence,
      };
    })
  );

  const calculatedCount = rows.filter((r) => !!r.calculated).length;

  const reviewCount = rows.filter(
    (r) =>
      r.resolved?.resourceResolutionStatus === "PARTIAL" ||
      r.calculated?.calculationStatus === "needs_review"
  ).length;

  const totalNet = rows.reduce(
    (sum, r) => sum + Number(r.calculated?.totalNet || 0),
    0
  );

  return {
    ok: true,
    projectCode: input.projectCode,
    projectType: generated.projectType,
    trade: generated.trade,
    assumptions: generated.assumptions,
    questions: generated.questions,
    generatedCount: generated.rows.length,
    calculatedCount,
    reviewCount,
    totalNet: Math.round((totalNet + Number.EPSILON) * 100) / 100,
    rows,
  };
}
