import { prisma } from "../../lib/prisma";

const db = prisma as any;

type CostGroup =
  | "MATERIAL"
  | "LABOR"
  | "MACHINE"
  | "TRANSPORT"
  | "SUBCONTRACTOR"
  | "DISPOSAL";

function n(value: unknown, fallback = 0): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function norm(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTerms(values: unknown[]): string[] {
  return [
    ...new Set(
      values
        .flatMap((value) => norm(value).split(" "))
        .filter((value) => value.length >= 3)
    ),
  ];
}

function includesTerm(text: string, term: string): boolean {
  return text.includes(norm(term));
}

function isRoadAsphaltEvent(event: any): boolean {
  const text = norm([
    event?.title,
    ...(event?.marketImpact?.materials || []),
    ...(event?.marketImpact?.trades || []),
    ...(event?.marketImpact?.lvTerms || []),
  ].join(" "));

  return /asphalt|bitumen|strassenbau|strasse|fahrbahn/.test(text);
}

function isPipeCoatingContext(entry: any): boolean {
  const text = norm([
    entry?.shortText,
    entry?.longText,
    entry?.trade,
    entry?.serviceType,
  ].join(" "));

  const pipeTerms =
    /ggg rohr|kanalrohr|rohre|rohrleitung|gusseisen|duktil|steckmuffe|dn [0-9]+/;

  const coatingTerms =
    /bitumendeckbeschichtung|bitumenbeschichtung|beschichtung/;

  return pipeTerms.test(text) && coatingTerms.test(text);
}

function hasPrimaryAsphaltContext(entry: any): boolean {
  const shortText = norm(entry?.shortText);
  const longText = norm(entry?.longText);
  const trade = norm(entry?.trade);

  const strongTerms =
    /asphalt|asphalttrag|asphaltbinder|asphaltdeck|schichtenverbund|anspruh|bindemittel|fahrbahn|strassenbau|strassenaufbruch|frase|fugenband/;

  return (
    strongTerms.test(shortText) ||
    strongTerms.test(trade) ||
    strongTerms.test(longText)
  );
}

function detectCostGroup(event: any): CostGroup {
  const text = norm(
    [
      event?.title,
      ...(event?.marketImpact?.materials || []),
      ...(event?.marketImpact?.trades || []),
      ...(event?.marketImpact?.lvTerms || []),
    ].join(" ")
  );

  if (
    /lohn|loehne|tarif|personal|arbeitslohn|stundenlohn|mindestlohn/.test(text)
  ) {
    return "LABOR";
  }

  if (
    /diesel|kraftstoff|transport|fracht|logistik|lieferkosten/.test(text)
  ) {
    return "TRANSPORT";
  }

  if (
    /maschine|geraet|bagger|lkw|radlader|energiepreis|strompreis/.test(text)
  ) {
    return "MACHINE";
  }

  if (/nachunternehmer|fremdleistung|subunternehmer/.test(text)) {
    return "SUBCONTRACTOR";
  }

  if (/entsorgung|deponie|abfall|recycling/.test(text)) {
    return "DISPOSAL";
  }

  return "MATERIAL";
}

function resolveChangePct(event: any): {
  minPct: number | null;
  maxPct: number | null;
  appliedPct: number | null;
  direction: string;
} {
  const impact = event?.marketImpact || {};
  const min = Number.isFinite(Number(impact.estimatedChangeMinPct))
    ? Number(impact.estimatedChangeMinPct)
    : null;
  const max = Number.isFinite(Number(impact.estimatedChangeMaxPct))
    ? Number(impact.estimatedChangeMaxPct)
    : null;

  let appliedPct: number | null = null;

  if (min != null && max != null) {
    appliedPct = (min + max) / 2;
  } else if (max != null) {
    appliedPct = max;
  } else if (min != null) {
    appliedPct = min;
  }

  const direction = String(impact.direction || "UNKNOWN").toUpperCase();

  if (appliedPct != null) {
    appliedPct = Math.abs(appliedPct);

    if (direction === "DOWN") {
      appliedPct *= -1;
    }
  }

  return {
    minPct: min,
    maxPct: max,
    appliedPct,
    direction,
  };
}

function costForGroup(entry: any, group: CostGroup): number {
  switch (group) {
    case "LABOR":
      return n(entry.laborCost);
    case "MACHINE":
      return n(entry.machineCost);
    case "TRANSPORT":
      return n(entry.transportCost);
    case "SUBCONTRACTOR":
      return n(entry.subcontractorCost);
    case "DISPOSAL":
      return n(entry.disposalCost);
    default:
      return n(entry.materialCost);
  }
}

function calculateMatchScore(entry: any, event: any): {
  score: number;
  reasons: string[];
  matchedTerms: string[];
} {
  const positionText = norm(
    [
      entry.positionNumber,
      entry.shortText,
      entry.longText,
      entry.trade,
      entry.serviceType,
      entry.constructionMethod,
      entry.soilClass,
      JSON.stringify(entry.tags || []),
      JSON.stringify(entry.resources || []),
      JSON.stringify(entry.parameters || {}),
    ].join(" ")
  );

  /*
   * Bitumen kann auch nur eine Rohrbeschichtung sein.
   * Solche Positionen dürfen bei Asphalt-/Straßenbauereignissen
   * nicht als Preiswirkung erkannt werden.
   */
  if (
    isRoadAsphaltEvent(event) &&
    isPipeCoatingContext(entry)
  ) {
    return {
      score: 0,
      reasons: ["Bitumen nur als Rohrbeschichtung erkannt"],
      matchedTerms: [],
    };
  }

  const materials = event?.marketImpact?.materials || [];
  const trades = event?.marketImpact?.trades || [];
  const lvTerms = event?.marketImpact?.lvTerms || [];

  const materialTerms = uniqueTerms(materials);
  const tradeTerms = uniqueTerms(trades);
  const technicalTerms = uniqueTerms(lvTerms);

  const matchedMaterials = materialTerms.filter((term) =>
    includesTerm(positionText, term)
  );
  const matchedTrades = tradeTerms.filter((term) =>
    includesTerm(positionText, term)
  );
  const matchedTechnical = technicalTerms.filter((term) =>
    includesTerm(positionText, term)
  );

  let score = 0;
  const reasons: string[] = [];

  if (
    isRoadAsphaltEvent(event) &&
    !hasPrimaryAsphaltContext(entry)
  ) {
    return {
      score: 0,
      reasons: ["Kein primärer Asphalt- oder Straßenbaukontext"],
      matchedTerms: [],
    };
  }

  if (materialTerms.length) {
    const ratio = matchedMaterials.length / materialTerms.length;
    score += ratio * 0.55;

    if (matchedMaterials.length) {
      reasons.push(`Material: ${matchedMaterials.join(", ")}`);
    }
  }

  if (tradeTerms.length) {
    const ratio = matchedTrades.length / tradeTerms.length;
    score += ratio * 0.25;

    if (matchedTrades.length) {
      reasons.push(`Gewerk: ${matchedTrades.join(", ")}`);
    }
  }

  if (technicalTerms.length) {
    const ratio = matchedTechnical.length / technicalTerms.length;
    score += ratio * 0.2;

    if (matchedTechnical.length) {
      reasons.push(`LV-Begriff: ${matchedTechnical.join(", ")}`);
    }
  }

  /*
   * Bei reinen Lohnereignissen darf das Gewerk den Hauptbezug liefern,
   * weil kein konkretes Material vorhanden sein muss.
   */
  const costGroup = detectCostGroup(event);

  if (
    costGroup === "LABOR" &&
    matchedTrades.length > 0 &&
    n(entry.laborCost) > 0
  ) {
    score = Math.max(score, 0.72);
    reasons.push("Lohnkosten in der Urkalkulation vorhanden");
  }

  /*
   * Positionen ohne Kostenaufschlüsselung bleiben sichtbar.
   * Sie dürfen jedoch nicht automatisch neu kalkuliert werden.
   */
  if (costForGroup(entry, costGroup) <= 0 && score > 0) {
    reasons.push("Betroffener Kostenanteil fehlt in der Urkalkulation");
  }

  return {
    score: Math.min(round2(score), 1),
    reasons,
    matchedTerms: [
      ...matchedMaterials,
      ...matchedTrades,
      ...matchedTechnical,
    ],
  };
}

function buildPositionImpact(
  entry: any,
  event: any,
  appliedPct: number,
  costGroup: CostGroup,
  match: ReturnType<typeof calculateMatchScore>
) {
  const currentUnitPrice = n(entry.unitPriceNet);
  const affectedCost = costForGroup(entry, costGroup);
  const quantity = n(entry.quantity);

  const calculationAvailable = affectedCost > 0;

  const affectedCostDelta = calculationAvailable
    ? round2(affectedCost * (appliedPct / 100))
    : 0;

  const suggestedUnitPrice = calculationAvailable
    ? round2(Math.max(0, currentUnitPrice + affectedCostDelta))
    : currentUnitPrice;

  const unitPriceDelta = round2(suggestedUnitPrice - currentUnitPrice);
  const totalDelta = round2(unitPriceDelta * quantity);

  return {
    id: entry.id,
    projectId: entry.projectId || null,
    projectCode: entry.projectCode || null,
    projectName: entry.projectName || null,
    positionNumber: entry.positionNumber || null,
    shortText: entry.shortText,
    unit: entry.unit || null,
    quantity,

    matchScore: match.score,
    matchReasons: match.reasons,
    matchedTerms: match.matchedTerms,

    impactStatus: calculationAvailable
      ? "CALCULATED"
      : "COST_BREAKDOWN_MISSING",
    calculationAvailable,
    affectedCostGroup: costGroup,
    affectedCost,
    affectedSharePct:
      currentUnitPrice > 0
        ? round2((affectedCost / currentUnitPrice) * 100)
        : 0,

    currentCosts: {
      materialCost: round2(n(entry.materialCost)),
      laborCost: round2(n(entry.laborCost)),
      machineCost: round2(n(entry.machineCost)),
      transportCost: round2(n(entry.transportCost)),
      subcontractorCost: round2(n(entry.subcontractorCost)),
      disposalCost: round2(n(entry.disposalCost)),
      overheadCost: round2(n(entry.overheadCost)),
      riskCost: round2(n(entry.riskCost)),
      profitCost: round2(n(entry.profitCost)),
    },

    currentUnitPrice: round2(currentUnitPrice),
    marketChangePct: round2(appliedPct),
    affectedCostDelta,
    suggestedUnitPrice,
    unitPriceDelta,
    unitPriceDeltaPct:
      currentUnitPrice > 0
        ? round2((unitPriceDelta / currentUnitPrice) * 100)
        : 0,
    currentTotal: round2(currentUnitPrice * quantity),
    suggestedTotal: round2(suggestedUnitPrice * quantity),
    totalDelta,
  };
}

export async function analyzeMarketCandidateImpact(
  candidateId: string,
  companyId: string
) {
  if (!candidateId) {
    throw new Error("MARKET_CANDIDATE_ID_REQUIRED");
  }

  if (!companyId) {
    throw new Error("COMPANY_ID_REQUIRED");
  }

  const candidate = await db.marketIntelligenceCandidate.findUnique({
    where: { id: candidateId },
    include: { event: true },
  });

  if (!candidate) {
    throw new Error("MARKET_CANDIDATE_NOT_FOUND");
  }

  if (candidate.type !== "PRICE_SUGGESTION") {
    throw new Error("MARKET_CANDIDATE_NOT_PRICE_SUGGESTION");
  }

  const event = candidate.event;
  const change = resolveChangePct(event);

  if (change.appliedPct == null || change.appliedPct === 0) {
    const result = {
      version: "1.0",
      status: "NO_QUANTIFIED_CHANGE",
      analyzedAt: new Date().toISOString(),
      candidateId,
      companyId,
      direction: change.direction,
      minChangePct: change.minPct,
      maxChangePct: change.maxPct,
      appliedChangePct: null,
      affectedCostGroup: detectCostGroup(event),
      affectedPositions: [],
      summary: {
        positions: 0,
        projects: 0,
        currentTotal: 0,
        suggestedTotal: 0,
        estimatedDelta: 0,
        averageIncreasePct: 0,
      },
      note:
        "Das Marktereignis enthält noch keine belastbare prozentuale Preisänderung. Es wurden keine Preise geschätzt oder geändert.",
    };

    const oldData =
      candidate.proposedData &&
      typeof candidate.proposedData === "object" &&
      !Array.isArray(candidate.proposedData)
        ? candidate.proposedData
        : {};

    await db.marketIntelligenceCandidate.update({
      where: { id: candidateId },
      data: {
        proposedData: {
          ...oldData,
          impactAnalysis: result,
        },
      },
    });

    return result;
  }

  const entries = await db.kalkulationsDbEntry.findMany({
    where: {
      companyId,
      unitPriceNet: { gt: 0 },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 10000,
  });

  const costGroup = detectCostGroup(event);

  const affectedPositions = entries
    .map((entry: any) => ({
      entry,
      match: calculateMatchScore(entry, event),
    }))
    .filter(({ match }: any) => match.score >= 0.45)
    .map(({ entry, match }: any) =>
      buildPositionImpact(
        entry,
        event,
        change.appliedPct as number,
        costGroup,
        match
      )
    )
    .sort(
      (left: any, right: any) =>
        right.matchScore - left.matchScore ||
        Math.abs(right.totalDelta) - Math.abs(left.totalDelta)
    )
    .slice(0, 500);

  const currentTotal = round2(
    affectedPositions.reduce(
      (sum: number, position: any) => sum + position.currentTotal,
      0
    )
  );

  const suggestedTotal = round2(
    affectedPositions.reduce(
      (sum: number, position: any) => sum + position.suggestedTotal,
      0
    )
  );

  const estimatedDelta = round2(suggestedTotal - currentTotal);

  const projectIds = new Set(
    affectedPositions
      .map((position: any) => position.projectId)
      .filter(Boolean)
  );

  const result = {
    version: "1.0",
    status: affectedPositions.length ? "ANALYZED" : "NO_MATCHES",
    analyzedAt: new Date().toISOString(),
    candidateId,
    companyId,

    event: {
      id: event.id,
      title: event.title,
      sourceName: event.sourceName,
      publishedAt: event.publishedAt,
      materials: event.marketImpact?.materials || [],
      trades: event.marketImpact?.trades || [],
      lvTerms: event.marketImpact?.lvTerms || [],
    },

    direction: change.direction,
    minChangePct: change.minPct,
    maxChangePct: change.maxPct,
    appliedChangePct: round2(change.appliedPct),
    affectedCostGroup: costGroup,

    affectedPositions,

    summary: {
      positions: affectedPositions.length,
      calculablePositions: affectedPositions.filter(
        (position: any) => position.calculationAvailable
      ).length,
      missingCostBreakdown: affectedPositions.filter(
        (position: any) => !position.calculationAvailable
      ).length,
      projects: projectIds.size,
      currentTotal,
      suggestedTotal,
      estimatedDelta,
      averageIncreasePct:
        currentTotal > 0
          ? round2((estimatedDelta / currentTotal) * 100)
          : 0,
    },

    safety: {
      databasePricesChanged: false,
      recipesChanged: false,
      automaticApplication: false,
      approvalRequired: true,
    },
  };

  const oldData =
    candidate.proposedData &&
    typeof candidate.proposedData === "object" &&
    !Array.isArray(candidate.proposedData)
      ? candidate.proposedData
      : {};

  await db.marketIntelligenceCandidate.update({
    where: { id: candidateId },
    data: {
      proposedData: {
        ...oldData,
        impactAnalysis: result,
      },
    },
  });

  await db.marketIntelligenceReview.create({
    data: {
      candidateId,
      action: "IMPACT_ANALYSIS",
      note: `${affectedPositions.length} betroffene Positionen analysiert; keine Preise geändert.`,
      userId: null,
    },
  });

  return result;
}
