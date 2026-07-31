import type {
  RlcAutonomousCalcInput,
  RlcAutonomousProjectContext,
  RlcRiskLevel,
} from "../autonomous/types";

export type KalkulationAgentName =
  | "lv-analysis"
  | "material"
  | "labor"
  | "equipment"
  | "risk"
  | "validation";

export type AgentFindingSeverity = "info" | "warning" | "critical";

export type KalkulationAgentFinding = {
  code: string;
  severity: AgentFindingSeverity;
  message: string;
  confidence: number;
  data?: Record<string, unknown>;
};

export type KalkulationAgentReport<T = Record<string, unknown>> = {
  agent: KalkulationAgentName;
  confidence: number;
  findings: KalkulationAgentFinding[];
  warnings: string[];
  output: T;
};

export type KalkulationAgentContext = {
  row: RlcAutonomousCalcInput;
  allRows: RlcAutonomousCalcInput[];
  projectContext: RlcAutonomousProjectContext;
};

export type LvAnalysisOutput = {
  normalizedText: string;
  trade: string;
  bauverfahren: string;
  category: string;
  complexity: RlcRiskLevel;
  keywords: string[];
};

export type ResourceAgentOutput = {
  relevant: boolean;
  resourceType: "material" | "labor" | "equipment";
  assumptions: string[];
  keywords: string[];
};

export type RiskAgentOutput = {
  riskLevel: RlcRiskLevel;
  riskScore: number;
  reasons: string[];
};

export type ValidationAgentOutput = {
  valid: boolean;
  reviewRequired: boolean;
  checks: Record<string, boolean>;
};

export type KalkulationAgentsResult = {
  reports: KalkulationAgentReport[];
  confidence: number;
  warnings: string[];
  summary: {
    trade: string;
    bauverfahren: string;
    category: string;
    complexity: RlcRiskLevel;
    riskLevel: RlcRiskLevel;
    reviewRequired: boolean;
  };
};
