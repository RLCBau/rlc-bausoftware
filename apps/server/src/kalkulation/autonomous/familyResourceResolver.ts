import {
  detectRlcConstructionFamilies,
  type RlcConstructionFamilyId,
} from "../domain/constructionFamilyRegistry";
import type { RlcAutonomousCalcInput } from "./types";

export type RlcResourceProfile = {
  family: RlcConstructionFamilyId;
  trade: string;
  moduleId: string;
  confidence: number;
};

const FAMILY_RESOURCE_MODULES: Partial<
  Record<RlcConstructionFamilyId, { trade: string; moduleId: string }>
> = {
  ERDARBEITEN: {
    trade: "Erdarbeiten",
    moduleId: "TIEFBAU_RESOURCES",
  },
  KANALBAU: {
    trade: "Kanalbau",
    moduleId: "TIEFBAU_RESOURCES",
  },
  KABELBAU: {
    trade: "Kabelbau",
    moduleId: "TIEFBAU_RESOURCES",
  },
  STRASSENBAU: {
    trade: "Straßenbau",
    moduleId: "TIEFBAU_RESOURCES",
  },
  BETON_STAHLBETON: {
    trade: "Beton-/Stahlbetonarbeiten",
    moduleId: "BETON_RESOURCES",
  },
  MAUERWERK: {
    trade: "Mauerarbeiten",
    moduleId: "MAUERWERK_RESOURCES",
  },
  HOLZBAU: {
    trade: "Holzbau",
    moduleId: "HOLZBAU_RESOURCES",
  },
  TROCKENBAU: {
    trade: "Trockenbau",
    moduleId: "TROCKENBAU_RESOURCES",
  },
  DACH: {
    trade: "Dacharbeiten",
    moduleId: "DACH_RESOURCES",
  },
  FASSADE: {
    trade: "Fassadenarbeiten",
    moduleId: "FASSADE_RESOURCES",
  },
  ELEKTRO: {
    trade: "Elektroarbeiten",
    moduleId: "ELEKTRO_RESOURCES",
  },
  SHK: {
    trade: "SHK",
    moduleId: "SHK_RESOURCES",
  },
  LANDSCHAFTSBAU: {
    trade: "Landschaftsbau",
    moduleId: "GALABAU_RESOURCES",
  },
  ABBRUCH: {
    trade: "Abbrucharbeiten",
    moduleId: "ABBRUCH_RESOURCES",
  },
};

export function resolveRlcResourceProfile(
  row: RlcAutonomousCalcInput
): RlcResourceProfile | null {
  const text = [
    row.kurztext,
    row.langtext,
  ]
    .filter(Boolean)
    .join(" ");

  const families = detectRlcConstructionFamilies(text);

  for (const detected of families) {
    const route = FAMILY_RESOURCE_MODULES[detected.id];
    if (!route) continue;

    return {
      family: detected.id,
      trade: route.trade,
      moduleId: route.moduleId,
      confidence: 0.85,
    };
  }

  return null;
}
