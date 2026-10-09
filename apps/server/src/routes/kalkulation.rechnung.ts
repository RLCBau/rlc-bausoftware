import { Router } from "express";
import { prisma } from "../lib/prisma";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { buildDeliveryPackage, type DeliveryFormat } from "../services/documentDeliveryService";
import { archiveProjectFileVersion } from "../services/dmsArchive";
import { loadRlcPdfCompanyFromRequest } from "../services/pdf/pdfCompanyContext";
import { resolveRlcCompany } from "../services/pdf/rlcPdfCore";
import { requireProjectMember } from "../middleware/guards";

const router = Router();

function rechnungRole(req: any): string {
  return String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
}

function allowDraftWrite(req: any, res: any, next: any) {
  const role = rechnungRole(req);
  if (!["ADMIN", "ADMINISTRATOR", "BUCHHALTUNG", "BAULEITER"].includes(role)) {
    return res.status(403).json({ error: "RECHNUNG_WRITE_FORBIDDEN" });
  }
  return next();
}

function allowFiscalIssue(req: any, res: any, next: any) {
  const role = rechnungRole(req);
  if (!["ADMIN", "ADMINISTRATOR", "BUCHHALTUNG"].includes(role)) {
    return res.status(403).json({ error: "RECHNUNG_ISSUE_FORBIDDEN" });
  }
  return next();
}

router.use("/:projectKey", requireProjectMember("projectKey"), async (req:any, _res, next) => {
  const projectId = String(req.resolvedProjectId || "").trim();
  const projectCode = String(req.resolvedProjectCode || "").trim();
  if (!projectId) return next(new Error("RESOLVED_PROJECT_ID_MISSING"));

  const canonicalDir = path.join(PROJECTS_ROOT, projectId, "kalkulation", "rechnung");
  const legacyDir = projectCode
    ? path.join(PROJECTS_ROOT, projectCode, "kalkulation", "rechnung")
    : "";

  if (!fs.existsSync(canonicalDir) && legacyDir && fs.existsSync(legacyDir)) {
    const duplicates = await prisma.project.count({ where: { code: projectCode } });
    if (duplicates === 1) {
      fs.mkdirSync(path.dirname(canonicalDir), { recursive: true });
      fs.cpSync(legacyDir, canonicalDir, { recursive: true });
      console.log("[rechnung] migrated unique legacy project-code store", { projectId, projectCode });
    } else {
      console.warn("[rechnung] legacy project-code store ignored because code is not globally unique", {
        projectId,
        projectCode,
        duplicates,
      });
    }
  }

  req.params.projectKey = projectId;
  next();
});

/* =========================
   UTILS
========================= */

function isSafeKey(v: string) {
  return /^[A-Za-z0-9_\-]+$/.test(v || "");
}

function getDir(projectKey: string) {
  return path.join(PROJECTS_ROOT, projectKey, "kalkulation", "rechnung");
}

function getFile(projectKey: string) {
  return path.join(getDir(projectKey), "rechnungen.json");
}

function ensureDir(projectKey: string) {
  const dir = getDir(projectKey);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readList(projectKey: string) {
  try {
    const file = getFile(projectKey);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function writeList(projectKey: string, list: any[]) {
  ensureDir(projectKey);
  const file = getFile(projectKey);
  fs.writeFileSync(file, JSON.stringify(list, null, 2));
}

function fiscalStatus(row: any): string {
  return String(row?.fiscalStatus || row?.fiscal_state || "ENTWURF").trim().toUpperCase();
}

function isFiscalLocked(row: any): boolean {
  return ["AUSGESTELLT", "STORNIERT", "KORRIGIERT"].includes(fiscalStatus(row));
}

function fiscalCanonical(row: any): string {
  const copy = JSON.parse(JSON.stringify(row || {}));
  for (const key of ["fiscalStatus", "issuedAt", "issuedBy", "immutableHash", "dms", "exportId", "updatedAt"]) delete copy[key];
  const sortValue = (value: any): any => {
    if (Array.isArray(value)) return value.map(sortValue);
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce((acc: any, key) => { acc[key] = sortValue(value[key]); return acc; }, {});
    }
    return value;
  };
  return JSON.stringify(sortValue(copy));
}

function fiscalHash(row: any): string {
  return crypto.createHash("sha256").update(fiscalCanonical(row), "utf8").digest("hex");
}

function invoiceRetentionMeta(row: any) {
  const date = accountingDate(row?.datum || row?.date);
  const year = date.getUTCFullYear();
  return {
    retentionLocked: true,
    retentionUntil: new Date(Date.UTC(year + 8, 11, 31, 23, 59, 59, 999)).toISOString(),
    retentionReason: "§ 14b UStG / § 147 AO / § 257 HGB – Rechnungs-/Buchungsbeleg 8 Jahre",
    retentionCategory: "TAX_INVOICE_8Y",
  };
}

function validateInvoiceForIssue(row: any): string[] {
  const errors: string[] = [];
  if (!String(row?.nr || row?.rechnungNr || "").trim()) errors.push("Rechnungsnummer fehlt.");
  if (!String(row?.datum || row?.date || "").trim()) errors.push("Rechnungsdatum fehlt.");
  if (!String(row?.leistungsdatum || row?.deliveryDate || "").trim()) errors.push("Leistungsdatum fehlt.");
  if (!String(row?.kunde || row?.customerName || "").trim()) errors.push("Kunde fehlt.");
  if (!Array.isArray(row?.positions) || !row.positions.length) errors.push("Mindestens eine Rechnungsposition ist erforderlich.");
  if (!Number.isFinite(Number(row?.netto)) || Number(row.netto) < 0) errors.push("Nettobetrag ist ungültig.");
  if (row?.taxTreatment === "REVERSE_CHARGE_13B" && !String(row?.customerVatId || "").trim()) errors.push("§13b: Kunden-USt-IdNr. fehlt.");
  if (String(row?.typ || "").toUpperCase() === "KORREKTUR" && !String(row?.originalInvoiceNumber || "").trim()) errors.push("Korrekturrechnung: Ursprüngliche Rechnungsnummer fehlt.");
  const recipientType = String(row?.recipientType || "B2B").toUpperCase();
  if (recipientType === "B2G" && !String(row?.buyerReference || "").trim()) errors.push("B2G: Leitweg-ID / BuyerReference fehlt.");
  return errors;
}

/* =========================
   ROUTES
========================= */

/* GET: tutte le Rechnungen */
router.get("/:projectKey", (req, res) => {
  const { projectKey } = req.params;

  if (!isSafeKey(projectKey)) {
    return res.status(400).json({ error: "invalid projectKey" });
  }

  const list = readList(projectKey);
  res.json(list);
});

/* POST: salva/aggiorna Rechnung */
router.post("/:projectKey/save", allowDraftWrite, (req, res) => {
  try {
    const { projectKey } = req.params;
    const doc = req.body;

    if (!isSafeKey(projectKey)) {
      return res.status(400).json({ error: "invalid projectKey" });
    }

    if (!doc || !doc.id) {
      return res.status(400).json({ error: "missing doc.id" });
    }

    const list = readList(projectKey);
    const idx = list.findIndex((x: any) => String(x.id) === String(doc.id));

    if (idx >= 0) {
      if (isFiscalLocked(list[idx])) {
        return res.status(409).json({ error: "INVOICE_FISCALLY_LOCKED", fiscalStatus: fiscalStatus(list[idx]) });
      }
      list[idx] = { ...doc, fiscalStatus: "ENTWURF" };
    } else {
      list.unshift({ ...doc, fiscalStatus: "ENTWURF" });
    }

    writeList(projectKey, list);

    res.json({
      ok: true,
      id: doc.id,
      count: list.length,
    });
  } catch (e) {
    console.error("rechnung save error", e);
    res.status(500).json({ error: "save failed" });
  }
});

function accountingDate(value: unknown): Date {
  const raw = String(value || "").trim();
  const de = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (de) return new Date(`${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}T12:00:00.000Z`);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function accountingNumber(value: unknown): number {
  const parsed = Number(String(value ?? 0).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function syncInvoicesToAccounting(projectId: string, items: any[]) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, companyId: true }
  });

  if (!project) return { synced: 0, skipped: items.length };

  let accounting = await prisma.accountingRoot.findUnique({
    where: { projectId: project.id }
  });

  if (!accounting) {
    accounting = await prisma.accountingRoot.create({
      data: { projectId: project.id }
    });
  }

  let synced = 0;

  for (const row of items) {
    const number = String(row?.nr || row?.rechnungNr || "").trim();
    const customerName = String(row?.kunde || row?.customerName || "").trim();
    if (!number || !customerName) continue;

    let customer = await prisma.party.findFirst({
      where: {
        companyId: project.companyId,
        name: customerName,
        type: "CUSTOMER"
      }
    });

    if (!customer) {
      customer = await prisma.party.create({
        data: {
          companyId: project.companyId,
          name: customerName,
          type: "CUSTOMER"
        }
      });
    }

    const fullNetAmount = accountingNumber(row?.netto);
    const reverseCharge = row?.taxTreatment === "REVERSE_CHARGE_13B";
    const taxRate = reverseCharge ? 0 : accountingNumber(row?.mwstPct ?? row?.mwst ?? 19);
    const advanceRows = Array.isArray(row?.advanceDeductions) ? row.advanceDeductions : [];
    const advanceNetAmount = String(row?.typ || "").toUpperCase() === "SCHLUSS"
      ? advanceRows.reduce((sum: number, item: any) => sum + accountingNumber(item?.netto), 0)
      : 0;
    const advanceTaxAmount = String(row?.typ || "").toUpperCase() === "SCHLUSS"
      ? advanceRows.reduce((sum: number, item: any) => sum + accountingNumber(item?.tax), 0)
      : 0;
    const netAmount = Math.max(0, Number((fullNetAmount - advanceNetAmount).toFixed(2)));
    const fullTaxAmount = reverseCharge ? 0 : Number((fullNetAmount * taxRate / 100).toFixed(2));
    const taxAmount = Math.max(0, Number((fullTaxAmount - advanceTaxAmount).toFixed(2)));
    const grossAmount = Number((netAmount + taxAmount).toFixed(2));
    const sourceRechnungId = String(row?.id || number);

    const data = {
      source: "kalkulation.rechnung",
      sourceRechnungId,
      typ: String(row?.typ || "RECHNUNG"),
      dueDate: row?.faellig || null,
      hint: row?.hinweis || null,
      positions: Array.isArray(row?.positions) ? row.positions : [],
      fiscalStatus: fiscalStatus(row),
      issuedAt: row?.issuedAt || null,
      issuedBy: row?.issuedBy || null,
      immutableHash: row?.immutableHash || null,
      taxTreatment: row?.taxTreatment || "STANDARD",
      recipientType: row?.recipientType || "B2B",
      fullNetAmount,
      advanceNetAmount,
      advanceTaxAmount,
      advanceDeductions: advanceRows
    };

    const existing = await prisma.invoice.findFirst({
      where: {
        accountingId: accounting.id,
        number
      }
    });

    const payload = {
      date: accountingDate(row?.datum || row?.date),
      customerId: customer.id,
      netAmount,
      taxAmount,
      grossAmount,
      status: fiscalStatus(row).toLowerCase(),
      data
    };

    if (existing) {
      await prisma.invoice.update({
        where: { id: existing.id },
        data: payload
      });
    } else {
      await prisma.invoice.create({
        data: {
          accountingId: accounting.id,
          number,
          ...payload
        }
      });
    }

    synced += 1;
  }

  return { synced, skipped: items.length - synced };
}

/* POST: ersetzt die vollständige Liste (Web-Sammelspeicherung) */
router.post("/:projectKey/replace", allowDraftWrite, async (req, res) => {
  try {
    const { projectKey } = req.params;
    const items = Array.isArray(req.body?.items) ? req.body.items : null;

    if (!isSafeKey(projectKey)) {
      return res.status(400).json({ error: "invalid projectKey" });
    }
    if (!items) {
      return res.status(400).json({ error: "missing items" });
    }

    const existing = readList(projectKey);
    const incomingById = new Map(items.map((row: any) => [String(row?.id || ""), row]));
    for (const oldRow of existing) {
      if (!isFiscalLocked(oldRow)) continue;
      const incoming = incomingById.get(String(oldRow?.id || ""));
      if (!incoming) {
        return res.status(409).json({ error: "ISSUED_INVOICE_CANNOT_BE_REMOVED", id: oldRow?.id, nr: oldRow?.nr });
      }
      if (fiscalHash(oldRow) !== fiscalHash(incoming)) {
        return res.status(409).json({ error: "ISSUED_INVOICE_CANNOT_BE_CHANGED", id: oldRow?.id, nr: oldRow?.nr });
      }
      Object.assign(incoming, oldRow);
    }

    const normalized = items.map((row: any) => isFiscalLocked(row) ? row : { ...row, fiscalStatus: "ENTWURF" });
    writeList(projectKey, normalized);
    const accountingSync = await syncInvoicesToAccounting(String((req as any).resolvedProjectId || ""), normalized);
    return res.json({ ok: true, count: items.length, accountingSync });
  } catch (e) {
    console.error("rechnung replace error", e);
    return res.status(500).json({ error: "replace failed" });
  }
});

/* EMISSIONE FISCALE: bozza -> AUSGESTELLT, con PDF/XRechnung + DMS */
router.post("/:projectKey/:id/issue", allowFiscalIssue, async (req: any, res) => {
  try {
    const { projectKey, id } = req.params;
    if (!isSafeKey(projectKey)) return res.status(400).json({ error: "invalid projectKey" });
    const list = readList(projectKey);
    const index = list.findIndex((row: any) => String(row?.id) === String(id));
    if (index < 0) return res.status(404).json({ error: "INVOICE_NOT_FOUND" });
    const row = list[index];
    if (isFiscalLocked(row)) return res.status(409).json({ error: "INVOICE_ALREADY_FISCALLY_LOCKED", fiscalStatus: fiscalStatus(row) });

    const errors = validateInvoiceForIssue(row);
    if (errors.length) return res.status(422).json({ error: "INVOICE_ISSUE_VALIDATION_FAILED", errors });

    const number = String(row?.nr || row?.rechnungNr || "").trim();
    const duplicate = list.find((other: any, i: number) => i !== index && String(other?.nr || other?.rechnungNr || "").trim() === number && fiscalStatus(other) !== "STORNIERT");
    if (duplicate) return res.status(409).json({ error: "INVOICE_NUMBER_NOT_UNIQUE", number });

    const actor = String(req?.auth?.email || req?.auth?.sub || req?.auth?.userId || "").trim();
    const issuedAt = new Date().toISOString();
    const requestCompany = await loadRlcPdfCompanyFromRequest(req);
    const sellerCompany = resolveRlcCompany(
      path.join(PROJECTS_ROOT, projectKey, "exports", "invoice-company-context.pdf"),
      requestCompany
    );
    const recipientType = String(row?.recipientType || "B2B").toUpperCase();
    const invoiceForExport = {
      ...row,
      recipientType,
      fiscalStatus: "AUSGESTELLT",
      issuedAt,
      issuedBy: actor || null,
      buyerReference: String(row?.buyerReference || "").trim() || (recipientType === "B2B" ? "-" : ""),
    };
    const formats: DeliveryFormat[] = recipientType === "B2C" ? ["pdf", "json"] : ["pdf", "xrechnung", "json"];
    const result = await buildDeliveryPackage({
      projectId: projectKey,
      projectName: String(row?.projectName || row?.projectCode || projectKey),
      moduleKey: "rechnung",
      documentId: String(row.id),
      title: row?.typ === "SCHLUSS" ? "Schlussrechnung" : row?.typ === "ABSCHLAG" ? "Abschlagsrechnung" : row?.typ === "KORREKTUR" ? "Rechnungskorrektur" : "Rechnung",
      date: String(row?.datum || row?.date || ""),
      data: { ...invoiceForExport, structured: [invoiceForExport], __sellerCompany: sellerCompany, company: sellerCompany },
      formats,
      pdfFileName: `${number}.pdf`,
      createdBy: actor || "workflow",
    });

    const retentionMeta = invoiceRetentionMeta(row);
    const archived: any[] = [];
    const candidates = [...result.files, result.packageFile, result.manifestFile].filter(Boolean);
    const seen = new Set<string>();
    for (const file of candidates) {
      if (!file?.filePath || seen.has(file.filePath)) continue;
      seen.add(file.filePath);
      const archivedFile = await archiveProjectFileVersion({
        projectIdOrCode: projectKey,
        filename: file.name,
        kind: /\.pdf$/i.test(file.name) ? "PDF" : "DOC",
        localPath: file.filePath,
        uploadedBy: actor || null,
        meta: { source: "invoice-issue", invoiceNumber: number, invoiceId: row.id, ...retentionMeta },
      });
      archived.push({ name: file.name, ...archivedFile });
    }

    const issued = {
      ...row,
      recipientType,
      fiscalStatus: "AUSGESTELLT",
      issuedAt,
      issuedBy: actor || null,
      immutableHash: fiscalHash(row),
      dms: archived,
      exportId: result.exportId,
    };
    list[index] = issued;
    if (String(row?.typ || "").toUpperCase() === "KORREKTUR" && row?.originalInvoiceNumber) {
      const originalIndex = list.findIndex((candidate: any, i: number) =>
        i !== index && String(candidate?.nr || candidate?.rechnungNr || "").trim() === String(row.originalInvoiceNumber).trim()
      );
      if (originalIndex >= 0 && fiscalStatus(list[originalIndex]) === "AUSGESTELLT") {
        list[originalIndex] = {
          ...list[originalIndex],
          fiscalStatus: "KORRIGIERT",
          correctedByInvoice: number,
          correctedAt: issuedAt,
        };
      }
    }
    writeList(projectKey, list);
    await syncInvoicesToAccounting(String((req as any).resolvedProjectId || ""), [issued]);

    return res.json({ ok: true, invoice: issued, exportId: result.exportId, files: result.files.map((f: any) => ({ name: f.name, sha256: f.sha256, url: f.url })) });
  } catch (e: any) {
    console.error("rechnung issue error", e);
    return res.status(500).json({ error: e?.message || "INVOICE_ISSUE_FAILED" });
  }
});

/* DELETE */
router.delete("/:projectKey/:id", allowDraftWrite, (req, res) => {
  try {
    const { projectKey, id } = req.params;

    if (!isSafeKey(projectKey)) {
      return res.status(400).json({ error: "invalid projectKey" });
    }

    const list = readList(projectKey);
    const existing = list.find((x: any) => String(x.id) === String(id));
    if (existing && isFiscalLocked(existing)) {
      return res.status(409).json({ error: "INVOICE_FISCALLY_LOCKED", fiscalStatus: fiscalStatus(existing) });
    }
    const next = list.filter((x: any) => String(x.id) !== String(id));

    writeList(projectKey, next);

    res.json({ ok: true });
  } catch (e) {
    console.error("rechnung delete error", e);
    res.status(500).json({ error: "delete failed" });
  }
});

export default router;
