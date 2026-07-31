import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

function companyIdFromReq(req: Express.Request): string {
  return String(
    (req.auth as any)?.companyId ||
      (req.auth as any)?.company ||
      process.env.DEV_COMPANY_ID ||
      ""
  ).trim();
}

function n(value: any, fallback = 0): number {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function s(value: any): string {
  return String(value ?? "").trim();
}

async function resolveProject(companyId: string, projectKey?: string) {
  const key = s(projectKey);
  if (!key) return null;

  return prisma.project.findFirst({
    where: {
      companyId,
      OR: [{ id: key }, { code: key }, { number: key }],
    },
    select: {
      id: true,
      code: true,
      name: true,
      number: true,
    },
  });
}

function normalizeRiskLevel(value: any): string {
  const v = s(value).toLowerCase();
  if (v === "low" || v === "niedrig") return "niedrig";
  if (v === "high" || v === "hoch") return "hoch";
  if (v === "critical" || v === "kritisch") return "kritisch";
  return "mittel";
}


function normGlobal(value: any): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:|]+$/g, "")
    .trim();
}

function normGlobalUnit(value: any): string {
  const u = String(value || "").trim();
  if (u.toLowerCase() === "m2") return "m²";
  if (u.toLowerCase() === "m3") return "m³";
  return u;
}

function globalKnowledgeKeyOf(row: any): string {
  return [
    normGlobal(row.shortText),
    normGlobalUnit(row.unit).toLowerCase(),
    normGlobal(row.trade),
    normGlobal(row.serviceType),
    normGlobal(row.constructionMethod),
    normGlobal(row.soilClass),
  ].join("||");
}

function globalMedian(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function globalRound2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function globalPlausibleRange(unit: string) {
  const u = normGlobalUnit(unit);
  if (u === "m") return { min: 0.5, max: 1500 };
  if (u === "m²") return { min: 0.5, max: 1500 };
  if (u === "m³") return { min: 1, max: 2500 };
  if (u === "h") return { min: 20, max: 350 };
  if (u === "St") return { min: 1, max: 25000 };
  if (u === "Psch") return { min: 1, max: 100000 };
  return { min: 0.5, max: 50000 };
}

function globalQualityConfidence(args: {
  prices: number[];
  companyCount: number;
  unit: string;
}): number {
  const { prices, companyCount, unit } = args;
  if (!prices.length) return 0.2;

  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const range = globalPlausibleRange(unit);

  let confidence = 0.55;

  confidence += Math.min(prices.length, 10) * 0.03;
  confidence += Math.min(companyCount, 5) * 0.04;

  if (prices.length < 2) confidence -= 0.12;
  if (companyCount < 2) confidence -= 0.08;
  if (avg < range.min) confidence -= 0.25;
  if (max > range.max) confidence -= 0.25;
  if (min <= 0) confidence -= 0.3;

  return Math.max(0.2, Math.min(0.95, globalRound2(confidence)));
}

function isApprovedForGlobalKnowledge(row: any): boolean {
  const value =
    row?.approvedForGlobalKnowledge ??
    row?.parameters?.approvedForGlobalKnowledge ??
    row?.parameter?.approvedForGlobalKnowledge ??
    false;

  return value === true || value === "true" || value === 1 || value === "1";
}

async function refreshGlobalPriceKnowledgeForEntry(entryId: string): Promise<boolean> {
  const anchor = await prisma.kalkulationsDbEntry.findUnique({
    where: { id: entryId },
  });

  if (!anchor || !anchor.shortText || Number(anchor.unitPriceNet || 0) <= 0) {
    return false;
  }

  const normalizedKey = globalKnowledgeKeyOf(anchor);
  if (!normalizedKey || normalizedKey.startsWith("||")) return false;

  /*
   * V49 Global Learning Bridge:
   * Recalculate only the affected global group.
   * No client/project names are copied. Global Knowledge stores only anonymized aggregates.
   */
  const allRows = await prisma.kalkulationsDbEntry.findMany({
    where: {
      unitPriceNet: { gt: 0 },
      shortText: { not: "" },
    },
    orderBy: { updatedAt: "desc" },
  });

  const group = allRows.filter((row) => globalKnowledgeKeyOf(row) === normalizedKey);
  if (!group.length) return false;

  const prices = group
    .map((row) => Number(row.unitPriceNet || 0))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (!prices.length) return false;

  const newest = group[0];
  const companies = new Set(group.map((row) => row.companyId).filter(Boolean));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const medianPrice = globalMedian(prices);
  const unit = normGlobalUnit(newest.unit);

  await prisma.rlcGlobalPriceKnowledge.upsert({
    where: { normalizedKey },
    create: {
      normalizedKey,
      positionNumber: newest.positionNumber || null,
      shortText: newest.shortText || "",
      unit,
      trade: newest.trade || null,
      serviceType: newest.serviceType || null,
      constructionMethod: newest.constructionMethod || null,
      soilClass: newest.soilClass || null,
      minPrice: globalRound2(minPrice),
      avgPrice: globalRound2(avgPrice),
      maxPrice: globalRound2(maxPrice),
      medianPrice: globalRound2(medianPrice),
      sampleCount: prices.length,
      sourceCompanyCount: companies.size,
      country: "DE",
      priceYear: new Date().getFullYear(),
      confidence: globalQualityConfidence({
        prices,
        companyCount: companies.size,
        unit,
      }),
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
    update: {
      positionNumber: newest.positionNumber || null,
      shortText: newest.shortText || "",
      unit,
      trade: newest.trade || null,
      serviceType: newest.serviceType || null,
      constructionMethod: newest.constructionMethod || null,
      soilClass: newest.soilClass || null,
      minPrice: globalRound2(minPrice),
      avgPrice: globalRound2(avgPrice),
      maxPrice: globalRound2(maxPrice),
      medianPrice: globalRound2(medianPrice),
      sampleCount: prices.length,
      sourceCompanyCount: companies.size,
      country: "DE",
      priceYear: new Date().getFullYear(),
      confidence: globalQualityConfidence({
        prices,
        companyCount: companies.size,
        unit,
      }),
      lastSeenAt: new Date(),
    },
  });

  return true;
}


function mapEntry(row: any) {
  return {
    id: row.id,
    quelle: row.source,
    projektId: row.projectId,
    projektCode: row.projectCode,
    projektName: row.projectName,
    posNr: row.positionNumber,
    kurztext: row.shortText,
    langtext: row.longText || "",
    einheit: row.unit,
    menge: row.quantity,

    parameter: {
      ...(row.parameters || {}),
      gewerk: row.trade || "",
      leistungsart: row.serviceType || "",
      bauverfahren: row.constructionMethod || "",
      bodenklasse: row.soilClass || "",
      menge: row.quantity,
      einheit: row.unit,
    },

    ressourcen: row.resources || [],

    kosten: {
      material: row.materialCost,
      lohn: row.laborCost,
      maschinen: row.machineCost,
      fremdleistung: row.subcontractorCost,
      entsorgung: row.disposalCost,
      transport: row.transportCost,
      gemeinkosten: row.overheadCost,
      risiko: row.riskCost,
      gewinn: row.profitCost,
      epNetto: row.unitPriceNet,
      gpNetto: row.totalNet,
    },

    risiko: row.riskLevel,
    confidence: row.confidence,
    kiHinweis: row.aiNote || "",
    kalkulatorNotiz: row.calculatorNote || "",
    tags: row.tags || [],
    verwendungen: row.useCount,
    letzterEinsatz: row.lastUsedAt ? row.lastUsedAt.toISOString() : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ================= KALKULATIONSDATENBANK ================= */

router.get("/datenbank/count", async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "NO_COMPANY" });

    const count = await prisma.kalkulationsDbEntry.count({
      where: { companyId },
    });

    return res.json({ ok: true, count });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "COUNT_FAILED" });
  }
});

router.get("/datenbank", async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "NO_COMPANY" });

    const q = s(req.query.q).toLowerCase();
    const projectKey = s(req.query.projectKey);
    const limit = Math.min(Math.max(n(req.query.limit, 200), 1), 1000);
    const offset = Math.max(n(req.query.offset, 0), 0);

    const project = await resolveProject(companyId, projectKey);

    const where: any = { companyId };

    if (projectKey && project?.id) {
      where.OR = [
        { projectId: project.id },
        { projectCode: project.code },
        { projectCode: project.number },
        { projectCode: projectKey },
      ];
    }

    if (q) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { positionNumber: { contains: q, mode: "insensitive" } },
            { shortText: { contains: q, mode: "insensitive" } },
            { longText: { contains: q, mode: "insensitive" } },
            { trade: { contains: q, mode: "insensitive" } },
            { serviceType: { contains: q, mode: "insensitive" } },
            { constructionMethod: { contains: q, mode: "insensitive" } },
          ],
        },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.kalkulationsDbEntry.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.kalkulationsDbEntry.count({ where }),
    ]);

    return res.json({
      ok: true,
      count: rows.length,
      total,
      limit,
      offset,
      hasNext: offset + rows.length < total,
      hasPrev: offset > 0,
      rows: rows.map(mapEntry),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "LIST_FAILED" });
  }
});


router.get("/global-price-knowledge/search", async (req, res) => {
  try {
    const q = s(req.query.q).toLowerCase();
    const unit = s(req.query.unit);
    const minConfidence = Math.max(0, Math.min(n(req.query.minConfidence, 0.4), 0.95));
    const limit = Math.min(Math.max(n(req.query.limit, 20), 1), 100);

    const where: any = {
      confidence: { gte: minConfidence },
    };

    if (unit) {
      where.unit = unit;
    }

    if (q) {
      where.OR = [
        { shortText: { contains: q, mode: "insensitive" } },
        { trade: { contains: q, mode: "insensitive" } },
        { serviceType: { contains: q, mode: "insensitive" } },
        { constructionMethod: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.rlcGlobalPriceKnowledge.findMany({
      where,
      orderBy: [
        { confidence: "desc" },
        { sampleCount: "desc" },
        { updatedAt: "desc" },
      ],
      take: limit,
    });

    return res.json({
      ok: true,
      count: rows.length,
      minConfidence,
      rows,
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: e?.message || "GLOBAL_PRICE_KNOWLEDGE_SEARCH_FAILED",
    });
  }
});

router.post("/datenbank/bulk-upsert", async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "NO_COMPANY" });

    const rows = Array.isArray(req.body?.rows)
      ? req.body.rows
      : Array.isArray(req.body?.items)
        ? req.body.items
        : [];
    const projectKey = s(req.body?.projectKey);
    const project = await resolveProject(companyId, projectKey);

    let saved = 0;

    for (const r of rows) {
      const posNr = s(r.posNr || r.positionNumber);
      const kurztext = s(r.kurztext || r.shortText);
      const einheit = s(r.einheit || r.unit);

      if (!posNr && !kurztext) continue;

      const menge = n(r.menge ?? r.quantity);


      const ep = n(


        r.finalUnitPrice ??


          r.preis ??


          r.unitPriceNet ??


          r.kosten?.epNetto ??


          r.costs?.epNetto


      );


      const gp = n(


        r.totalNet ??


          r.gesamt ??


          r.kosten?.gpNetto ??


          r.costs?.gpNetto,


        menge * ep


      );


      const incomingSource = s(r.quelle || r.source || "ki") || "ki";

      /*
       * Keine Datenbank-Lerneinträge ohne echten EP.
       * EP 0 erzeugt nur schlechte Treffer und überschreibt KI-Learning.
       */
      if (ep <= 0) continue;

        const existing = await prisma.kalkulationsDbEntry.findFirst({
          where: {
            companyId,
            positionNumber: posNr,
            shortText: kurztext,
            unit: einheit,
          },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            useCount: true,
            source: true,
            unitPriceNet: true,
            parameters: true,
          },
        });

      const data = {
        companyId,
        projectId: project?.id || null,
        source: incomingSource,
        projectCode: s(r.projektCode || r.projectCode || project?.code || projectKey),
        projectName: s(r.projektName || r.projectName || project?.name),

        positionNumber: posNr,
        shortText: kurztext,
        longText: s(r.langtext || r.longText),
        unit: einheit,
        quantity: menge,

        materialCost: n(r.materialCost ?? r.kosten?.material),
        laborCost: n(r.laborCost ?? r.kosten?.lohn),
        machineCost: n(r.machineCost ?? r.kosten?.maschinen),
        subcontractorCost: n(r.subcontractorCost ?? r.kosten?.fremdleistung),
        disposalCost: n(r.disposalCost ?? r.kosten?.entsorgung),
        transportCost: n(r.transportCost ?? r.kosten?.transport),
        overheadCost: n(r.overheadCost ?? r.kosten?.gemeinkosten),
        riskCost: n(r.riskCost ?? r.kosten?.risiko),
        profitCost: n(r.profitCost ?? r.kosten?.gewinn),

        unitPriceNet: ep,
        totalNet: gp,

        trade: s(r.gewerk || r.parameter?.gewerk),
        serviceType: s(r.leistungsart || r.parameter?.leistungsart),
        constructionMethod: s(r.bauverfahren || r.parameter?.bauverfahren),
        soilClass: s(r.bodenklasse || r.parameter?.bodenklasse),

        riskLevel: normalizeRiskLevel(r.riskLevel || r.risiko),
        confidence: n(r.confidence, 0.75),

        parameters: r.parameter || r.parameters || {},
        resources: r.ressourcen || r.resources || [],
        tags: Array.isArray(r.tags) ? r.tags : [],

        aiNote: s(r.aiReason || r.kiHinweis),
        calculatorNote: s(r.kalkulatorNotiz || r.calculatorNote),
      };

      let savedEntryId = "";

      if (existing) {
        const existingQualityStatus = s((existing.parameters as any)?.qualityGateStatus);
        const incomingEp = n(ep);
        const existingEp = n(existing.unitPriceNet);

        /*
         * KI-Learning / geprüfte Daten dürfen nicht durch spätere Frontend-Bulk-Upserts
         * mit EP 0 überschrieben werden.
         */
        if (
          incomingEp <= 0 &&
          (existingEp > 0 ||
            existing.source === "ki-learning" ||
            existingQualityStatus === "KI-Vorschlag" ||
            existingQualityStatus === "Geprüft" ||
            existingQualityStatus === "Freigegeben")
        ) {
          saved += 1;
          continue;
        }

        const updated = await prisma.kalkulationsDbEntry.update({
          where: { id: existing.id },
          data,
          select: { id: true },
        });
        savedEntryId = updated.id;
      } else {
        if (ep <= 0) continue;
        const created = await prisma.kalkulationsDbEntry.create({
          data,
          select: { id: true },
        });
        savedEntryId = created.id;
      }

      if (savedEntryId && isApprovedForGlobalKnowledge(r)) {
        await refreshGlobalPriceKnowledgeForEntry(savedEntryId);
      }

      saved += 1;
    }

    return res.json({ ok: true, saved });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "UPSERT_FAILED" });
  }
});


const QUALITY_GATE_STATUSES = [
  "KI-Vorschlag",
  "Geprüft",
  "Freigegeben",
  "Gesperrt",
  "Nicht verwenden",
];

function normalizeQualityGateStatus(value: any): string {
  const v = s(value);

  if (QUALITY_GATE_STATUSES.includes(v)) return v;

  const low = v.toLowerCase();
  if (low === "ki-vorschlag" || low === "vorschlag") return "KI-Vorschlag";
  if (low === "geprüft" || low === "geprueft" || low === "checked") return "Geprüft";
  if (low === "freigegeben" || low === "approved") return "Freigegeben";
  if (low === "gesperrt" || low === "locked") return "Gesperrt";
  if (low === "nicht verwenden" || low === "blocked" || low === "ignore") return "Nicht verwenden";

  return "";
}

router.patch("/datenbank/:id/quality-gate", async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "NO_COMPANY" });

    const id = s(req.params.id);
    const status = normalizeQualityGateStatus(req.body?.status);
    const note = s(req.body?.note || req.body?.calculatorNote);

    if (!status) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_QUALITY_GATE_STATUS",
        allowed: QUALITY_GATE_STATUSES,
      });
    }

    const row = await prisma.kalkulationsDbEntry.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        parameters: true,
        calculatorNote: true,
      },
    });

    if (!row) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const parameters = {
      ...((row.parameters as any) || {}),
      qualityGateStatus: status,
      qualityGateUpdatedAt: new Date().toISOString(),
      ...(note ? { qualityGateNote: note } : {}),
    };

    const updated = await prisma.kalkulationsDbEntry.update({
      where: { id },
      data: {
        parameters,
        calculatorNote: note || row.calculatorNote || "",
      },
    });

    return res.json({
      ok: true,
      id: updated.id,
      qualityGateStatus: status,
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: e?.message || "QUALITY_GATE_UPDATE_FAILED",
    });
  }
});

router.post("/datenbank/:id/used", async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    const id = s(req.params.id);

    const row = await prisma.kalkulationsDbEntry.findFirst({
      where: { id, companyId },
      select: { id: true, useCount: true },
    });

    if (!row) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    await prisma.kalkulationsDbEntry.update({
      where: { id },
      data: {
        useCount: row.useCount + 1,
        lastUsedAt: new Date(),
      },
    });

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "MARK_USED_FAILED" });
  }
});

router.delete("/datenbank/:id", async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    const id = s(req.params.id);

    const row = await prisma.kalkulationsDbEntry.findFirst({
      where: { id, companyId },
      select: { id: true },
    });

    if (!row) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    await prisma.kalkulationsDbEntry.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "DELETE_FAILED" });
  }
});

/* ================= RECIPES DB ================= */

router.get("/recipes-db", async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "NO_COMPANY" });

    const rows = await prisma.companyRecipeDb.findMany({
      where: { companyId },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });

    return res.json({ ok: true, rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "RECIPES_LIST_FAILED" });
  }
});

router.post("/recipes-db/upsert", async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "NO_COMPANY" });

    const recipe = req.body?.recipe || req.body;
    const signature = s(recipe.signature);
    if (!signature) {
      return res.status(400).json({ ok: false, error: "SIGNATURE_REQUIRED" });
    }

    const project = await resolveProject(companyId, s(req.body?.projectKey));

    const saved = await prisma.companyRecipeDb.upsert({
      where: {
        companyId_signature: {
          companyId,
          signature,
        },
      },
      update: {
        projectId: project?.id || null,
        title: s(recipe.title || signature),
        sourcePosNr: s(recipe.sourcePosNr),
        sourceText: s(recipe.sourceText),
        unit: s(recipe.unit),
        context: recipe.context || {},
        lines: recipe.lines || [],
      },
      create: {
        companyId,
        projectId: project?.id || null,
        signature,
        title: s(recipe.title || signature),
        sourcePosNr: s(recipe.sourcePosNr),
        sourceText: s(recipe.sourceText),
        unit: s(recipe.unit),
        context: recipe.context || {},
        lines: recipe.lines || [],
      },
    });

    return res.json({ ok: true, recipe: saved });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "RECIPE_UPSERT_FAILED" });
  }
});

router.delete("/recipes-db/:id", async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    const id = s(req.params.id);

    const row = await prisma.companyRecipeDb.findFirst({
      where: { id, companyId },
      select: { id: true },
    });

    if (!row) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    await prisma.companyRecipeDb.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "RECIPE_DELETE_FAILED" });
  }
});


/* ================= PREISDATENBANK IMPORT CSV ================= */

function csvSplitLine(line: string, delimiter = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"' && quoted && next === '"') {
      cur += '"';
      i++;
      continue;
    }

    if (ch === '"') {
      quoted = !quoted;
      continue;
    }

    if (ch === delimiter && !quoted) {
      out.push(cur.trim());
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur.trim());
  return out;
}

function csvNumber(value: any, fallback = 0): number {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;

  const cleaned = raw
    .replace(/€/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const x = Number(cleaned);
  return Number.isFinite(x) ? x : fallback;
}

function pick(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const v = row[key.toLowerCase()];
    if (v !== undefined && String(v).trim()) return String(v).trim();
  }
  return "";
}

function parsePriceCsv(csvText: string) {
  const lines = String(csvText || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = csvSplitLine(lines[0], delimiter).map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];

  for (const line of lines.slice(1)) {
    const cols = csvSplitLine(line, delimiter);
    const obj: Record<string, string> = {};

    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? "";
    });

    rows.push(obj);
  }

  return rows;
}

router.post("/datenbank/import-csv", async (req, res) => {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "NO_COMPANY" });

    const csvText = s(req.body?.csvText || req.body?.csv || req.body?.text);
    if (!csvText) return res.status(400).json({ ok: false, error: "NO_CSV_TEXT" });

    const source = s(req.body?.source || req.body?.quelle || "company") || "company";
    const projectKey = s(req.body?.projectKey);
    const project = await resolveProject(companyId, projectKey);

    const parsed = parsePriceCsv(csvText);

    let saved = 0;
    let skipped = 0;

    for (const r of parsed) {
      const posNr = pick(r, ["posnr", "pos", "positionsnummer", "positionnumber", "position"]);
      const kurztext = pick(r, ["kurztext", "shorttext", "bezeichnung", "leistung", "title", "name"]);
      const langtext = pick(r, ["langtext", "longtext", "beschreibung", "description"]);
      const einheit = pick(r, ["einheit", "me", "unit", "eh"]);
      const gewerk = pick(r, ["gewerk", "trade", "lb", "leistungsbereich"]);
      const leistungsart = pick(r, ["leistungsart", "servicetype", "art"]);
      const bauverfahren = pick(r, ["bauverfahren", "constructionmethod", "verfahren"]);
      const sourceVersion = pick(r, ["version", "sourceversion", "stand"]);
      const region = pick(r, ["region", "ort", "bundesland"]);
      const tagsRaw = pick(r, ["tags", "tag"]);

      const ep = csvNumber(
        pick(r, [
          "preis",
          "ep",
          "einheitspreis",
          "unitprice",
          "unitpricenet",
          "preisnetto",
          "mittelpreis",
          "price",
        ])
      );

      const menge = csvNumber(pick(r, ["menge", "quantity", "qty"]), 1);
      const gp = csvNumber(pick(r, ["gesamt", "gp", "total", "totalnet"]), menge * ep);

      if (!kurztext && !posNr) {
        skipped++;
        continue;
      }

      if (!einheit) {
        skipped++;
        continue;
      }

      const existing = await prisma.kalkulationsDbEntry.findFirst({
        where: {
          companyId,
          positionNumber: posNr,
          shortText: kurztext,
          unit: einheit,
          source,
        },
        select: { id: true },
      });

      const data = {
        companyId,
        projectId: project?.id || null,
        source,
        projectCode: project?.code || projectKey || null,
        projectName: project?.name || null,

        positionNumber: posNr,
        shortText: kurztext,
        longText: langtext,
        unit: einheit,
        quantity: menge,

        materialCost: csvNumber(pick(r, ["materialcost", "material", "materialkosten"])),
        laborCost: csvNumber(pick(r, ["laborcost", "lohn", "lohnkosten", "personal"])),
        machineCost: csvNumber(pick(r, ["machinecost", "maschinen", "geraete", "geräte"])),
        subcontractorCost: csvNumber(pick(r, ["subcontractorcost", "fremdleistung"])),
        disposalCost: csvNumber(pick(r, ["disposalcost", "entsorgung"])),
        transportCost: csvNumber(pick(r, ["transportcost", "transport"])),
        overheadCost: csvNumber(pick(r, ["overheadcost", "gemeinkosten"])),
        riskCost: csvNumber(pick(r, ["riskcost", "risiko"])),
        profitCost: csvNumber(pick(r, ["profitcost", "gewinn"])),

        unitPriceNet: ep,
        totalNet: gp,

        trade: gewerk,
        serviceType: leistungsart,
        constructionMethod: bauverfahren,

        riskLevel: "mittel",
        confidence: source === "company" ? 0.95 : 0.85,

        parameters: {
          sourceVersion,
          region,
          importType: "csv",
        },

        resources: [],
        tags: tagsRaw ? tagsRaw.split(/[;,]/).map((x) => x.trim()).filter(Boolean) : [],

        aiNote: "",
        calculatorNote: `Importiert aus CSV. Quelle: ${source}${sourceVersion ? `, Stand: ${sourceVersion}` : ""}${region ? `, Region: ${region}` : ""}`,
      };

      if (existing) {
        await prisma.kalkulationsDbEntry.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.kalkulationsDbEntry.create({ data });
      }

      saved++;
    }

    return res.json({
      ok: true,
      source,
      imported: saved,
      skipped,
      total: parsed.length,
    });
  } catch (e: any) {
    console.error("[kalkulation.datenbank] import-csv failed:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "IMPORT_CSV_FAILED",
    });
  }
});


export default router;
