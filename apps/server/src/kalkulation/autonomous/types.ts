export type RlcRiskLevel = "low" | "medium" | "high";

export type RlcAutonomousProjectContext = {
  projectCode?: string;
  projectType: string;
  trade: string;
  difficulty: RlcRiskLevel;
  logisticsRisk: RlcRiskLevel;
  trafficRisk: RlcRiskLevel;
  durationRisk: RlcRiskLevel;
  marketFactor: number;
  distanceFactor: number;
  bgkRate?: number;
  profitRate?: number;
  confidence: number;
  warnings: string[];
};

export type RlcAutonomousCostLine = {
  id: string;
  group:
    | "Lohn"
    | "Material"
    | "Maschinen"
    | "Entsorgung"
    | "Nachunternehmer"
    | "Gemeinkosten"
    | "Risiko"
    | "Gewinn";
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
  note?: string;
  provenance?: { origin: "rlc_v2_family_catalog"; family: string; evidenceStatus: "source_note_unverified" | "catalog_rate_unverified" };
};

export type RlcAutonomousCalcInput = {
  posNr?: string;
  kurztext?: string;
  langtext?: string;
  einheit?: string;
  menge?: number;
  projectCode?: string;
};

export type RlcAutonomousCalcResult = {
  unitPrice: number;
  total: number;
  confidence: number;
  riskLevel: RlcRiskLevel;
  source: string;
  calculationStatus: "ok" | "warning" | "needs_review";
  trade: string;
  bauverfahren: string;
  leistungsart: string;
  costLines: RlcAutonomousCostLine[];
  warnings: string[];
  aiReason: string;
};
