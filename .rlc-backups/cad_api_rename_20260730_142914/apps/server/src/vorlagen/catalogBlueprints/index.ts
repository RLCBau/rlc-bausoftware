import { COMMERCIAL_BLUEPRINTS } from "./commercial";
import { MANAGEMENT_BLUEPRINTS } from "./management";
import { SITE_OPERATION_BLUEPRINTS } from "./siteOperations";
import { TRADE_BLUEPRINTS } from "./trades";
import type { VorlageBlueprint, VorlageLayout } from "./types";

export type { VorlageBlueprint, VorlageLayout } from "./types";

export const VORLAGEN_BLUEPRINTS: VorlageBlueprint[] = [
  ...SITE_OPERATION_BLUEPRINTS,
  ...COMMERCIAL_BLUEPRINTS,
  ...MANAGEMENT_BLUEPRINTS,
  ...TRADE_BLUEPRINTS,
];

export const VORLAGEN_BLUEPRINTS_BY_KEY = new Map(
  VORLAGEN_BLUEPRINTS.map((blueprint) => [
    `${blueprint.categoryKey}\u0000${blueprint.title}`,
    blueprint,
  ])
);

export const VORLAGE_LAYOUT_LABELS: Record<VorlageLayout, string> = {
  BRIEF: "Fach- und Geschäftsschreiben",
  CHECKLISTE: "Prüfcheckliste",
  FORMULAR: "Fachformular",
  NACHWEIS: "prüffähiger Nachweis",
  PLAN: "Fach- und Maßnahmenplan",
  PROTOKOLL: "Fachprotokoll",
  REGISTER: "fortschreibbares Register",
  BERICHT: "Fach- und Statusbericht",
  VERTRAG: "Vereinbarung / Vertragsdokument",
  UNTERWEISUNG: "Unterweisungsnachweis",
};

if (VORLAGEN_BLUEPRINTS_BY_KEY.size !== VORLAGEN_BLUEPRINTS.length) {
  throw new Error("Vorlagen-Blueprints enthalten doppelte Kategorie-/Titel-Kombinationen.");
}
