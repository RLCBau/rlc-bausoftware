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

    const rows = await prisma.kalkulationsDbEntry.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return res.json({
      ok: true,
      count: rows.length,
      rows: rows.map(mapEntry),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "LIST_FAILED" });
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

          source: incomingSource,

        },
        select: { id: true, useCount: true, source: true, unitPriceNet: true, parameters: true },
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

        await prisma.kalkulationsDbEntry.update({
          where: { id: existing.id },
          data,
        });
      } else {
        if (ep <= 0) continue;
        await prisma.kalkulationsDbEntry.create({ data });
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
