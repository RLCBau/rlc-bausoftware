export type RlcTechnicalRuleSource = {
  ruleId: string;
  standard: string;
  edition: string;
  section?: string;
  description: string;
};

export type RlcTrenchRuleInput = {
  application:
    | "KABEL"
    | "ABWASSER"
    | "ROHRLEITUNG"
    | "FERNWAERME"
    | "UNKNOWN";
  lengthM?: number;
  depthM?: number;
  nominalDiameterMm?: number;
  outsideDiameterM?: number;
  explicitWidthM?: number;

  // Geometrie / Sicherung des Grabens.
  // Für DIN EN 1610 erforderlich, da die Mindestbreite
  // von der Ausführung des Grabens abhängen kann.
  trenchSupport?: "VERBAUT" | "UNVERBAUT" | "UNKNOWN";
  slopeAngleDeg?: number;

  // Mengenmodell Abwasser.
  // Nur explizite Projektwerte verwenden, keine erfundenen Standardwerte.
  beddingThicknessM?: number;
  embedmentHeightM?: number;
};

export type RlcTrenchRuleResult = {
  widthM: number | null;

  // Bruttovolumen des geometrischen Grabens.
  excavationM3: number | null;

  // Optionale abgeleitete Teilmengen.
  pipeVolumeM3?: number | null;
  beddingVolumeM3?: number | null;
  embedmentVolumeM3?: number | null;
  netBackfillM3?: number | null;

  source: RlcTechnicalRuleSource | null;
  status: "resolved" | "missing_input" | "rule_not_available";
  assumptions: string[];
  questions: string[];
};
