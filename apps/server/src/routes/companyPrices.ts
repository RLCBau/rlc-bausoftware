// apps/server/src/routes/companyPrices.ts
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

/* =========================================================
 * ensureCompanyId (stesso approccio di projects.ts)
 * =======================================================*/
async function ensureCompanyId(req: any): Promise<string> {
  const auth: any = req?.auth;

  // 1) Auth company
  if (auth && typeof auth.company === "string") {
    const found = await prisma.company.findUnique({ where: { id: auth.company } });
    if (found) return found.id;
  }

  // 2) DEV company
  if (process.env.DEV_COMPANY_ID) {
    const found = await prisma.company.findUnique({ where: { id: process.env.DEV_COMPANY_ID } });
    if (found) return found.id;
  }

  // 3) First company fallback
  const first = await prisma.company.findFirst();
  if (first) return first.id;

  // 4) Create default if nothing exists
  const created = await prisma.company.create({
    data: { name: "Standard Firma", code: "STANDARD" },
  });

  return created.id;
}

const router = Router();

/* =========================================================
 * POST /api/company-prices/bulk-upsert
 * - Opzione 2: salva prezzi sulla Company del progetto corrente
 * - mode:
 *   - insert: crea solo se non esiste (skipDuplicates)
 *   - upsert: se esiste aggiorna price/unit/validTo/note
 *
 * NOTE PRISMA:
 * - Evitiamo "interactive transaction" (tx => for await ...) che può
 *   generare "Transaction not found" quando nel mezzo ci sono query
 *   fuori contesto o richieste lunghe.
 * - Usiamo:
 *   - createMany + skipDuplicates per insert
 *   - prisma.$transaction([upsert, upsert, ...]) per upsert
 * =======================================================*/
const bulkUpsertSchema = z.object({
  companyId: z.string().min(1),
  mode: z.enum(["insert", "upsert"]).default("upsert"),
  rows: z
    .array(
      z.object({
        refKey: z.string().min(1),
        price: z.number(),
        unit: z.string().min(1),
        validFrom: z.string().min(1), // ISO
        validTo: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      })
    )
    .min(1),
});

router.post("/bulk-upsert", async (req, res) => {
  try {
    const parsed = bulkUpsertSchema.parse(req.body || {});
    const reqCompanyId = await ensureCompanyId(req);

    // sicurezza: in opzione 2 NON permettiamo scrittura su un'altra company
    if (parsed.companyId !== reqCompanyId) {
      return res.status(403).json({
        ok: false,
        error: "Forbidden: companyId mismatch",
      });
    }

    const companyId = parsed.companyId;
    const mode = parsed.mode;

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    // Normalizzazione + validazione date (prima di toccare Prisma)
    const normalized = [];
    for (const r of parsed.rows) {
      const refKey = String(r.refKey).trim();
      const unit = String(r.unit).trim();
      const price = Number(r.price);

      const validFrom = new Date(r.validFrom);
      if (!Number.isFinite(validFrom.getTime())) {
        skipped++;
        continue;
      }

      const validTo = r.validTo ? new Date(r.validTo) : null;
      if (validTo && !Number.isFinite(validTo.getTime())) {
        skipped++;
        continue;
      }

      normalized.push({
        companyId,
        refKey,
        unit,
        price,
        validFrom,
        validTo,
        note: r.note ?? null,
      });
    }

    if (!normalized.length) {
      return res.json({ ok: true, inserted: 0, updated: 0, skipped });
    }

    if (mode === "insert") {
      // ✅ Insert-only: usa createMany con skipDuplicates (no error su @@unique)
      // Unicità Prisma: @@unique([companyId, refKey, validFrom])
      const result = await prisma.companyPrice.createMany({
        data: normalized,
        skipDuplicates: true,
      });

      inserted = result.count;
      skipped += normalized.length - result.count;

      return res.json({ ok: true, inserted, updated: 0, skipped });
    }

    // ✅ Upsert: transazione "batch" (non interactive)
    // Nota conteggi: Prisma non distingue create vs update in modo diretto.
    // Qui contiamo "updated" come numero di upsert eseguiti (righe processate).
    const ops = normalized.map((r) =>
      prisma.companyPrice.upsert({
        where: {
          companyId_refKey_validFrom: {
            companyId: r.companyId,
            refKey: r.refKey,
            validFrom: r.validFrom,
          },
        } as any,
        create: r,
        update: {
          unit: r.unit,
          price: r.price,
          validTo: r.validTo,
          note: r.note ?? null,
        },
      })
    );

    await prisma.$transaction(ops);

    updated = ops.length;

    return res.json({ ok: true, inserted: 0, updated, skipped });
  } catch (err: any) {
    console.error("POST /api/company-prices/bulk-upsert error:", err);
    res.status(500).json({ ok: false, error: err?.message || "bulk-upsert failed" });
  }
});

export default router;
