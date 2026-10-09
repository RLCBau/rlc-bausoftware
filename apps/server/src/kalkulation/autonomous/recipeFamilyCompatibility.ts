import { resolveRlcResourceProfile } from "./familyResourceResolver";
import type { RlcAutonomousCalcInput } from "./types";

export type RlcRecipeCompatibilityResult = {
  compatible: boolean;
  inputFamily?: string;
  recipeFamily?: string;
  reason: string;
};

export function validateRecipeFamilyCompatibility(
  row: RlcAutonomousCalcInput,
  recipe: Record<string, any> | null | undefined
): RlcRecipeCompatibilityResult {
  if (!recipe) {
    return {
      compatible: false,
      reason: "Kein Recipe-Kandidat vorhanden.",
    };
  }

  const inputProfile = resolveRlcResourceProfile(row);

  const recipeProfile = resolveRlcResourceProfile({
    kurztext: [
      recipe.gewerk,
      recipe.leistungsart,
      recipe.bauverfahren,
    ]
      .filter(Boolean)
      .join(" "),
    langtext: "",
  });

  // Kann die Eingangsposition keiner Familie sicher zugeordnet werden,
  // entscheidet dieser Guard nicht gegen bestehende Legacy-Rezepte.
  if (!inputProfile) {
    return {
      compatible: true,
      recipeFamily: recipeProfile?.family,
      reason: "Eingangsfamilie nicht eindeutig; Legacy-Rezept bleibt zulässig.",
    };
  }

  // Für eine erkannte Eingangsfamilie muss auch das Recipe
  // fachlich einer Familie zugeordnet werden können.
  if (!recipeProfile) {
    return {
      compatible: false,
      inputFamily: inputProfile.family,
      reason: "Recipe-Kandidat besitzt keine kompatibel erkennbare Baufamilie.",
    };
  }

  const compatible = inputProfile.family === recipeProfile.family;

  return {
    compatible,
    inputFamily: inputProfile.family,
    recipeFamily: recipeProfile.family,
    reason: compatible
      ? "Eingangsposition und Recipe gehören zur gleichen Baufamilie."
      : `Familienkonflikt: ${inputProfile.family} != ${recipeProfile.family}.`,
  };
}
