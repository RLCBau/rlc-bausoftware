
import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

function norm(s: any): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizedKey(row: any): string {
  return [
    norm(row.shortText),
    norm(row.unit),
    norm(row.region),
  ].filter(Boolean).join("|");
}

router.get("/search", async (req, res) => {
  try {
    const q = norm(req.query.q);
    const unit = norm(req.query.unit);
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    const rows = await prisma.rlcGlobalPosition.findMany({
      where: {
        AND: [
          q ? {
            OR: [
              { shortText: { contains: q, mode: "insensitive" } },
              { longText: { contains: q, mode: "insensitive" } },
              { gewerk: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
              { normalizedKey: { contains: q } },
            ],
          } : {},
          unit ? { unit: { contains: unit, mode: "insensitive" } } : {},
        ],
      },
      orderBy: [
        { confidence: "desc" },
        { sampleCount: "desc" },
        { updatedAt: "desc" },
      ],
      take: limit,
    });

    res.json({ ok: true, rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? "GLOBAL_SEARCH_FAILED" });
  }
});

router.post("/import", async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const sourceName = String(req.body?.sourceName ?? "manual-import");
    const sourceType = String(req.body?.sourceType ?? "manual");
    const sourceUrl = req.body?.sourceUrl ? String(req.body.sourceUrl) : null;

    let acceptedRows = 0;
    let rejectedRows = 0;

    for (const row of rows) {
      const shortText = String(row.shortText ?? row.kurztext ?? "").trim();
      if (!shortText) {
        rejectedRows++;
        continue;
      }

      const data: any = {
        source: row.source ?? sourceName,
        sourceType,
        sourceUrl,
        region: row.region ?? null,
        year: row.year ? Number(row.year) : null,
        gewerk: row.gewerk ?? null,
        category: row.category ?? null,
        positionNumber: row.positionNumber ?? row.posNr ?? null,
        shortText,
        longText: row.longText ?? row.langtext ?? null,
        unit: row.unit ?? row.einheit ?? null,
        priceMin: row.priceMin != null ? Number(row.priceMin) : null,
        priceAvg: row.priceAvg != null ? Number(row.priceAvg) : null,
        priceMax: row.priceMax != null ? Number(row.priceMax) : null,
        confidence: row.confidence != null ? Number(row.confidence) : 0.3,
        sampleCount: row.sampleCount != null ? Number(row.sampleCount) : 1,
        isContextSensitive: Boolean(row.isContextSensitive ?? false),
        needsReview: Boolean(row.needsReview ?? true),
      };

      data.normalizedKey = normalizedKey(data);

      await prisma.rlcGlobalPosition.upsert({
        where: { id: row.id ?? "__new__" },
        create: data,
        update: data,
      });

      acceptedRows++;
    }

    await prisma.rlcGlobalImportLog.create({
      data: {
        sourceName,
        sourceType,
        sourceUrl,
        importedRows: rows.length,
        acceptedRows,
        rejectedRows,
        notes: req.body?.notes ?? null,
      },
    });

    res.json({ ok: true, importedRows: rows.length, acceptedRows, rejectedRows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? "GLOBAL_IMPORT_FAILED" });
  }
});

router.get("/outliers", async (_req, res) => {
  try {
    const rows = await prisma.rlcGlobalPosition.findMany({
      where: {
        OR: [
          { needsReview: true },
          { confidence: { lt: 0.5 } },
          { priceAvg: null },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
    });

    res.json({ ok: true, rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? "GLOBAL_OUTLIERS_FAILED" });
  }
});

export default router;
