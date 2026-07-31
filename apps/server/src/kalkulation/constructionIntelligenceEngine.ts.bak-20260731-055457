/**
 * RLC Construction Intelligence Engine
 *
 * Additive orchestrator for the Kalkulation pipeline.
 * It does not replace existing route logic yet. Every stage is isolated,
 * timed and protected so that one optional intelligence source cannot
 * interrupt the complete calculation.
 */

import { performance } from "node:perf_hooks";
import { calcRecipeKalkulationRow } from "./kalkulationsRecipeEngine";
import {
  resolveRlcAutonomousCalculation,
  mapAutonomousResultToKiRow,
} from "./autonomous/rlcAutonomousKalkulator";
import { resolveRlcKnowledgeHub } from "./knowledgeHub";

export type ConstructionIntelligenceInput = {
  row: Record<string, any>;
  context?: Record<string, any>;
  candidates?: Record<string, any>[];
  companyId?: string;
  projectKey?: string;
};

export type ConstructionStage =
  | "recipe"
  | "autonomous-urkalkulation"
  | "knowledge-hub"
  | "final-selection";

export type ConstructionStageTrace = {
  stage: ConstructionStage;
  ok: boolean;
  durationMs: number;
  source?: string;
  ep?: number;
  message?: string;
};

export type ConstructionIntelligenceResult = {
  ok: boolean;
  result: Record<string, any> | null;
  alternatives: Record<string, any>[];
  trace: ConstructionStageTrace[];
  confidence: number;
  requiresReview: boolean;
  engine: "rlc-construction-intelligence-v1";
};

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function unitPrice(row: Record<string, any> | null | undefined): number {
  if (!row) return 0;
  return numeric(
    row.rlcKiUnitPrice ??
      row.finalUnitPrice ??
      row.suggestedUnitPrice ??
      row.unitPrice ??
      row.ep
  );
}

function sourceOf(row: Record<string, any> | null | undefined): string {
  return text(row?.source || row?.calculationSource || "unknown");
}

function confidenceOf(row: Record<string, any> | null | undefined): number {
  if (!row) return 0;

  const raw = numeric(
    row.confidence ??
      row.calculationConfidence ??
      row.externalKnowledgeConfidence
  );

  if (raw > 1) return Math.max(0, Math.min(1, raw / 100));
  if (raw > 0) return Math.max(0, Math.min(1, raw));

  const source = sourceOf(row).toLowerCase();
  if (source.includes("database")) return 0.86;
  if (source.includes("technical-parser")) return 0.82;
  if (source.includes("recipe")) return 0.78;
  if (source.includes("autonomous")) return 0.72;
  if (source.includes("openai")) return 0.62;
  if (source.includes("rule-engine")) return 0.48;
  return 0.4;
}

function requiresReview(row: Record<string, any> | null | undefined): boolean {
  if (!row) return true;

  const source = sourceOf(row).toLowerCase();
  const warning = text(row.warning || row.warnings || row.aiWarning).toLowerCase();
  const confidence = confidenceOf(row);

  return (
    confidence < 0.7 ||
    source.includes("rule-engine") ||
    source.includes("blocked") ||
    warning.includes("prüfpflicht") ||
    warning.includes("niedrig") ||
    warning.includes("outlier")
  );
}

function scoreCandidate(row: Record<string, any>): number {
  const ep = unitPrice(row);
  if (ep <= 0) return -100;

  let score = confidenceOf(row) * 100;
  const source = sourceOf(row).toLowerCase();

  if (source.includes("technical-parser")) score += 16;
  if (source.includes("database")) score += 14;
  if (source.includes("recipe")) score += 10;
  if (source.includes("autonomous")) score += 8;
  if (source.includes("rule-engine")) score -= 20;
  if (source.includes("blocked")) score -= 35;
  if (requiresReview(row)) score -= 8;

  return score;
}

async function runStage<T>(
  stage: ConstructionStage,
  trace: ConstructionStageTrace[],
  action: () => Promise<T>
): Promise<T | null> {
  const started = performance.now();

  try {
    const value = await action();
    const candidate = value as any;

    trace.push({
      stage,
      ok: true,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
      source: candidate ? sourceOf(candidate) : undefined,
      ep: candidate ? unitPrice(candidate) : undefined,
    });

    return value;
  } catch (error: any) {
    trace.push({
      stage,
      ok: false,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
      message: text(error?.message || error),
    });

    return null;
  }
}


export type ExistingCalculationTraceInput = {
  startedAtMs?: number;
  stages?: Array<{
    stage: string;
    ok: boolean;
    durationMs?: number;
    message?: string;
  }>;
};

export function annotateExistingCalculation(
  result: Record<string, any> | null | undefined,
  traceInput: ExistingCalculationTraceInput = {}
): Record<string, any> | null {
  if (!result) return null;

  const originalEp = unitPrice(result);
  const originalSource = sourceOf(result);
  const confidence = confidenceOf(result);
  const review = requiresReview(result);
  const totalDurationMs =
    typeof traceInput.startedAtMs === "number"
      ? Math.max(0, Math.round((performance.now() - traceInput.startedAtMs) * 100) / 100)
      : undefined;

  const annotated = {
    ...result,
    constructionIntelligence: {
      engine: "rlc-construction-intelligence-v1",
      mode: "existing-pipeline-observer",
      confidence,
      requiresReview: review,
      finalSource: originalSource,
      finalEp: originalEp,
      totalDurationMs,
      trace: Array.isArray(traceInput.stages) ? traceInput.stages : [],
      priceModified: false,
    },
  };

  if (unitPrice(annotated) !== originalEp || sourceOf(annotated) !== originalSource) {
    throw new Error("Construction Intelligence observer changed EP or source");
  }

  return annotated;
}

export async function runConstructionIntelligence(
  input: ConstructionIntelligenceInput
): Promise<ConstructionIntelligenceResult> {
  const row = input.row || {};
  const trace: ConstructionStageTrace[] = [];
  const alternatives: Record<string, any>[] = [];

  const recipe = await runStage("recipe", trace, async () => {
    return await calcRecipeKalkulationRow(row as any);
  });

  if (recipe && unitPrice(recipe as any) > 0) {
    alternatives.push(recipe as any);
  }

  const autonomous = await runStage(
    "autonomous-urkalkulation",
    trace,
    async () => {
      const resolved = resolveRlcAutonomousCalculation(
        row as any,
        [row as any],
        input.context as any
      );

      return mapAutonomousResultToKiRow(row as any, resolved as any);
    }
  );

  if (autonomous && unitPrice(autonomous as any) > 0) {
    alternatives.push(autonomous as any);
  }

  const knowledge = await runStage("knowledge-hub", trace, async () => {
    return resolveRlcKnowledgeHub({
      kurztext: text(row.kurztext),
      langtext: text(row.langtext),
      einheit: text(row.einheit || row.unit),
      menge: numeric(row.menge ?? row.quantity),
      family: text(
        row.rlcFamily || row.family || row.gewerk || row.leistungsart
      ),
    } as any);
  });

  if ((knowledge as any)?.hasExternalKnowledge) {
    for (const candidate of alternatives) {
      candidate.externalKnowledge = (knowledge as any).externalMatches || [];
      candidate.externalKnowledgeConfidence = numeric(
        (knowledge as any).externalKnowledgeConfidence
      );
      candidate.aiReason = [
        text(candidate.aiReason),
        ...(((knowledge as any).technicalNotes || []) as string[]),
      ]
        .filter(Boolean)
        .join(" ");
    }
  }

  const finalResult =
    (await runStage("final-selection", trace, async () => {
      return [...alternatives].sort(
        (a, b) => scoreCandidate(b) - scoreCandidate(a)
      )[0] || null;
    })) || null;

  const confidence = confidenceOf(finalResult as any);
  const review = requiresReview(finalResult as any);

  if (finalResult) {
    (finalResult as any).constructionIntelligence = {
      engine: "rlc-construction-intelligence-v1",
      confidence,
      requiresReview: review,
      alternatives: alternatives.map((candidate) => ({
        source: sourceOf(candidate),
        ep: unitPrice(candidate),
        confidence: confidenceOf(candidate),
      })),
      trace,
    };
  }

  return {
    ok: Boolean(finalResult),
    result: finalResult as any,
    alternatives,
    trace,
    confidence,
    requiresReview: review,
    engine: "rlc-construction-intelligence-v1",
  };
}
