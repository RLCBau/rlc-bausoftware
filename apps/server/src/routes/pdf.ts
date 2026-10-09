// apps/server/src/routes/pdf.ts
// @ts-nocheck

import { Router } from "express";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { COMPANIES_ROOT } from "../lib/companiesRoot";
import { buildDeliveryPackage } from "../services/documentDeliveryService";
import {
  archiveProjectFileVersion,
  archiveProjectBufferVersion
} from "../services/dmsArchive";
import {
  RLC_PDF_THEME,
  createRlcPdfDocument,
  drawRlcInfoField,
  drawRlcRoundedBox,
  drawRlcSectionTitle,
  rlcFirstText,
  rlcGermanNumber,
  rlcNumber,
} from "../services/pdf/rlcPdfCore";
import { loadRlcPdfCompanyFromRequest } from "../services/pdf/pdfCompanyContext";
import { evaluateReb23003Positions } from "../reb/reb23003";
import { requireProjectMember } from "../middleware/guards";

const router = Router();

async function requireOptionalPdfProjectAccess(req: any, res: any, next: any) {
  const body = req.body || {};
  const project = body.project || {};
  const token = String(
    body.projectId ||
    body.projectFsKey ||
    body.projectKey ||
    body.projectCode ||
    project.id ||
    project.projectId ||
    project.code ||
    project.projectCode ||
    ""
  ).trim();

  if (!token) return next();

  const companyId = String(req?.auth?.companyId || req?.auth?.company || "").trim();
  const userId = String(req?.auth?.sub || req?.auth?.userId || "").trim();
  const role = String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
  if (!companyId || !userId) {
    return res.status(403).json({ ok: false, error: "PROJECT_ACCESS_REQUIRED" });
  }

  const isAdmin = role === "ADMIN" || role === "ADMINISTRATOR";
  const row = await prisma.project.findFirst({
    where: {
      companyId,
      OR: [{ id: token }, { code: token }, { number: token }],
      ...(isAdmin ? {} : { members: { some: { userId } } }),
    },
    select: { id: true, code: true, number: true, name: true },
  });

  if (!row) {
    return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });
  }

  req.resolvedPdfProjectId = row.id;
  req.resolvedPdfProjectCode = row.code || row.number || row.id;
  req.body = {
    ...body,
    projectId: row.id,
    projectKey: row.code || row.number || row.id,
    projectCode: row.code || row.number || row.id,
    projectFsKey: row.code || row.number || row.id,
    project: {
      ...project,
      id: row.id,
      projectId: row.id,
      code: row.code || row.number || row.id,
      projectCode: row.code || row.number || row.id,
      number: row.number || project.number,
      name: project.name || row.name || "",
    },
  };
  return next();
}

router.use(requireOptionalPdfProjectAccess);

/*
 * Zentraler Kontext für alle klassischen /api/pdf/* Downloads.
 * mobile-render archiviert sich bereits selbst und wird ausgeschlossen.
 */
router.use((req: any, res: any, next: any) => {
  const body = req.body || {};
  const project = body.project || {};

  const projectIdOrCode = String(
    body.projectId ||
    body.projectFsKey ||
    body.projectKey ||
    project.id ||
    project.projectId ||
    project.code ||
    ""
  ).trim();

  res.locals.rlcPdfDms = {
    projectIdOrCode,
    source: `pdf${String(req.path || "")}`,
    uploadedBy: String(
      req?.auth?.email ||
      req?.auth?.userId ||
      req?.auth?.sub ||
      ""
    ).trim() || null
  };

  next();
});

/* ======================
   HELPERS
====================== */

function n(v: any, fallback = 0) {
  const raw = String(v ?? "").trim();
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const x = typeof v === "number" ? v : Number(normalized);
  return Number.isFinite(x) ? x : fallback;
}

function s(v: any) {
  return String(v ?? "").trim();
}

function money(v: any) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(n(v));
}

function num(v: any, d = 3) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n(v));
}

function safeFileName(v: string) {
  return String(v || "document")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function todayDE() {
  return new Date().toLocaleDateString("de-DE");
}

function offerNo(projectCode: string) {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `ANG-${ymd}`;
}

async function getCompany(req: any) {
  const companyId = String(req?.auth?.companyId || req?.auth?.company || "").trim();
  if (!companyId) return null;

  try {
    return await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        logoPath: true,
      },
    });
  } catch (e: any) {
    console.error("[pdf:getCompany]", e?.message || e);
    return null;
  }
}

function getLogoPath(company: any) {
  const companyId = s(company?.id);
  const rel = s(company?.logoPath);
  if (!companyId || !rel) return "";

  const filename = path.basename(rel);
  const abs = path.join(COMPANIES_ROOT, companyId, filename);
  const allowedBase = path.join(COMPANIES_ROOT, companyId) + path.sep;

  if (!abs.startsWith(allowedBase)) return "";
  if (!fs.existsSync(abs)) return "";

  const ext = path.extname(abs).toLowerCase();
  if (![".png", ".jpg", ".jpeg"].includes(ext)) return "";

  return abs;
}

function createPdf(
  res: any,
  filename: string,
  build: (doc: any) => void,
  options?: { layout?: "portrait" | "landscape" }
) {
  const doc = new PDFDocument({
    size: "A4",
    layout: options?.layout || "portrait",
    margin: 40,
    bufferPages: true,
    autoFirstPage: true,
  });

  const chunks: Buffer[] = [];

  doc.on("data", (c: Buffer) => chunks.push(c));
  doc.on("end", () => {
    const pdf = Buffer.concat(chunks);
    const dms = res.locals?.rlcPdfDms;

    if (
      dms?.projectIdOrCode &&
      dms.source !== "pdf/mobile-render"
    ) {
      void archiveProjectBufferVersion({
        projectIdOrCode: dms.projectIdOrCode,
        filename: `${safeFileName(filename)}.pdf`,
        kind: "PDF",
        buffer: pdf,
        uploadedBy: dms.uploadedBy || null,
        meta: {
          module: "PDF",
          source: dms.source
        }
      }).catch((error) => {
        console.error("[pdf:createPdf:dms]", error);
      });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName(filename)}.pdf"`
    );
    res.setHeader("Content-Length", String(pdf.length));
    res.send(pdf);
  });

  build(doc);

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);

    // Dezenter professioneller Seitenrahmen
    doc.save();
    doc.lineWidth(0.45);
    doc.strokeColor("#E3EAF2");
    doc.rect(32, 28, 531, 782).stroke();

    doc.lineWidth(0.35);
    doc.strokeColor("#E8EEF5");
    doc.moveTo(56, 780).lineTo(540, 780).stroke();
    doc.restore();

    doc.font("Helvetica").fontSize(7.5).fillColor("#64748B");
    doc.text(`RLC Bausoftware · Seite ${i + 1}/${pages.count}`, 56, 790, {
      align: "center",
      width: 484,
    });
    doc.fillColor("#000000");
  }

  doc.end();
}

function drawCompanyHeader(doc: any, company: any) {
  const logo = getLogoPath(company);

  const leftX = 56;
  const rightX = 295;
  const topY = 48;

  if (logo) {
    try {
      doc.image(logo, leftX, topY, { fit: [120, 46] });
    } catch {
      // logo skip
    }
  } else {
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#0F172A");
    doc.text(s(company?.code || ""), leftX, topY + 10, { width: 120 });
  }

  const name = s(company?.name || "Firma");
  const address = s(company?.address || "");
  const phone = s(company?.phone || "");
  const email = s(company?.email || "");

  doc.font("Helvetica-Bold").fontSize(13.5).fillColor("#0F172A");
  doc.text(name, rightX, topY, { width: 245, align: "right" });

  doc.font("Helvetica").fontSize(8.3).fillColor("#475569");

  if (address) {
    doc.text(address, rightX, topY + 20, { width: 245, align: "right" });
  }

  const contact = [
    phone ? `Tel.: ${phone}` : "",
    email ? `E-Mail: ${email}` : "",
  ].filter(Boolean).join("  ·  ");

  if (contact) {
    doc.text(contact, rightX, topY + 36, { width: 245, align: "right" });
  }

  doc.strokeColor("#CBD5E1").lineWidth(0.6);
  doc.moveTo(56, 108).lineTo(540, 108).stroke();

  doc.y = 132;
  doc.fillColor("#000000");
}
function drawRecipientBlock(doc: any, company: any, recipient: any) {
  const senderLine = [company?.name, company?.address].filter(Boolean).join(" · ");

  const x = 56;
  const y = 138;

  doc.font("Helvetica").fontSize(6.8).fillColor("#64748B");
  doc.text(senderLine || "Absender", x, y, { width: 260 });

  doc.strokeColor("#E2E8F0").lineWidth(0.35);
  doc.moveTo(x, y + 11).lineTo(x + 260, y + 11).stroke();

  doc.font("Helvetica").fontSize(10).fillColor("#111827");

  const lines = [
    s(recipient?.name || recipient?.client || recipient?.auftraggeber || "Auftraggeber"),
    s(recipient?.address || recipient?.adresse || ""),
    s(recipient?.zipCity || recipient?.ort || recipient?.city || ""),
  ].filter(Boolean);

  let yy = y + 26;
  for (const line of lines) {
    doc.text(line, x, yy, { width: 260 });
    yy += 14;
  }

  doc.fillColor("#000000");
  doc.y = 225;
}
function drawMetaBox(doc: any, meta: Record<string, string>) {
  const x = 360;
  const y = 136;
  const w = 180;

  doc.save();
  doc.strokeColor("#D8E0EA").lineWidth(0.6);
  doc.roundedRect(x, y, w, 86, 4).stroke();
  doc.restore();

  let yy = y + 12;

  for (const [k, v] of Object.entries(meta)) {
    doc.font("Helvetica-Bold").fontSize(8.1).fillColor("#334155");
    doc.text(k, x + 10, yy, { width: 72 });

    doc.font("Helvetica").fontSize(8.1).fillColor("#111827");
    doc.text(String(v || "—"), x + 78, yy, {
      width: 92,
      align: "right",
      lineBreak: false,
      ellipsis: true,
    });

    yy += 15;
  }

  doc.fillColor("#000000");
}
function ensurePage(doc: any, minSpace = 70) {
  if (doc.y > 790 - minSpace) doc.addPage();
}

function tableHeader(doc: any, cols: any[]) {
  ensurePage(doc, 45);

  const y = doc.y;
  doc.roundedRect(56, y - 5, 484, 21, 3).fill("#EFF6FF");

  doc.font("Helvetica-Bold").fontSize(8).fillColor("#1E3A8A");
  for (const c of cols) {
    doc.text(c.label, c.x, y, {
      width: c.w,
      align: c.align || "left",
    });
  }

  doc.y = y + 22;
  doc.fillColor("#000000").font("Helvetica");
}

function rowLine(doc: any, cols: any[], values: any[]) {
  ensurePage(doc, 46);

  const y = doc.y;
  doc.font("Helvetica").fontSize(8).fillColor("#111827");

  let maxH = 12;

  values.forEach((value, i) => {
    const c = cols[i];
    const txt = s(value);
    const h = doc.heightOfString(txt, { width: c.w, lineGap: 1 });
    maxH = Math.max(maxH, h);
    doc.text(txt, c.x, y, {
      width: c.w,
      align: c.align || "left",
      lineGap: 1,
    });
  });

  doc.y = y + maxH + 6;
  doc.strokeColor("#F1F5F9").moveTo(56, doc.y).lineTo(540, doc.y).stroke();
  doc.y += 4;
}

function cleanOfferRows(rows: any[]) {
  return rows.filter((r) => {
    const pos = s(r.posNr || r.lvPos || r.pos);
    const txt = s(r.kurztext || r.text || r.title);
    const qty = n(r.menge ?? r.qty);
    const ep = n(r.preis ?? r.ep);
    const total = n(r.zeilen ?? r.total ?? qty * ep);

    // Keine leeren Kapitel-/Schmutzzeilen ins Angebot
    if (!txt && qty === 0 && total === 0) return false;
    if (pos.toUpperCase().startsWith("BA-")) return false;

    return true;
  });
}

/* =========================================================
   RLC PDF CORE – ANGEBOT
   POST /api/pdf/angebot
========================================================= */
router.post("/angebot", async (req: any, res) => {
  let pdfPath = "";

  try {
    const body = req.body || {};
    const company = await getCompany(req);
    const project = body.project || {};
    const options = body.options || {};
    const rows = cleanOfferRows(Array.isArray(body.rows) ? body.rows : []);
    const totals = body.totals || {};

    const projectCode = s(
      project.code ||
      project.projectCode ||
      project.number ||
      body.projectKey ||
      body.projectCode ||
      project.id ||
      "Projekt"
    );

    const projectName = s(project.name || body.projectName || projectCode);
    const dmsProjectId = s(body.projectId || project.id || projectCode);
    const clientName = s(project.client || project.auftraggeber || body.clientName || "Auftraggeber");
    const clientAddress = s(project.clientAddress || project.address || body.clientAddress || "");
    const location = s(project.location || project.place || project.ort || options.city || "");
    const offerNumber = s(body.offerNo || body.angebotNr || offerNo(projectCode));
    const date = s(options.dateISO || body.date || new Date().toISOString()).slice(0, 10);
    const fileName = safeFileName(`Angebot_${projectCode}`);

    pdfPath = path.join("/tmp", `${fileName}_${Date.now()}.pdf`);

    const pdf = createRlcPdfDocument({
      pdfPath,
      title: "Angebot",
      documentType: "Angebot",
      projectId: projectCode,
      projectName,
      date,
      company,
      subject: `Angebot ${offerNumber}`,
    });

    const { doc } = pdf;
    const left = RLC_PDF_THEME.marginX;
    const right = doc.page.width - RLC_PDF_THEME.marginX;
    const contentWidth = right - left;
    const gap = 8;
    const fieldWidth = (contentWidth - gap) / 2;

    const writeTableHeader = (y: number) => {
      const columns = [
        { label: "PosNr", x: left, width: 46 },
        { label: "Leistungsbeschreibung", x: left + 50, width: 218 },
        { label: "ME", x: left + 272, width: 28 },
        { label: "Menge", x: left + 304, width: 55 },
        { label: "EP", x: left + 363, width: 70 },
        { label: "Gesamt", x: left + 437, width: 90 },
      ];

      doc.fillColor("#EAF2FF").roundedRect(left, y, contentWidth, 19, 3).fill();
      doc.fillColor("#174EA6").font("Helvetica-Bold").fontSize(7.7);

      for (const column of columns) {
        doc.text(column.label, column.x + 3, y + 6, {
          width: column.width - 6,
          align: ["Menge", "EP", "Gesamt"].includes(column.label) ? "right" : "left",
        });
      }

      return y + 24;
    };

    let y = pdf.startCurrentPage();

    drawRlcInfoField(doc, left, y, fieldWidth, "Angebot Nr.", offerNumber);
    drawRlcInfoField(doc, left + fieldWidth + gap, y, fieldWidth, "Projekt", projectCode);

    y += 64;

    drawRlcInfoField(doc, left, y, fieldWidth, "Ausführungsort", location || "—");
    drawRlcInfoField(
      doc,
      left + fieldWidth + gap,
      y,
      fieldWidth,
      "Auftraggeber",
      [clientName, clientAddress].filter(Boolean).join(" · ") || "—"
    );

    y += 64;
    y = drawRlcSectionTitle(doc, "Leistungspositionen", y);
    y = writeTableHeader(y);

    let calculatedNetto = 0;

    for (const row of rows) {
      const qty = n(row.menge ?? row.qty);
      const ep = n(row.preis ?? row.ep);
      const total = n(row.zeilen ?? row.total ?? row.gesamt ?? qty * ep);
      calculatedNetto += total;

      const description = [
        s(row.kurztext || row.text || row.title || row.bezeichnung || "—"),
        s(row.langtext || row.description || ""),
      ].filter(Boolean).join("\n");

      doc.font("Helvetica").fontSize(7.9);
      const descriptionHeight = doc.heightOfString(description, {
        width: 212,
        lineGap: 1,
      });
      const rowHeight = Math.max(32, Math.ceil(descriptionHeight + 12));

      if (y + rowHeight > pdf.contentBottom()) {
        y = pdf.addPage();
        y += 16;
        y = writeTableHeader(y);
      }

      doc
        .strokeColor(RLC_PDF_THEME.border)
        .lineWidth(0.35)
        .roundedRect(left, y, contentWidth, rowHeight, 2)
        .stroke();

      doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(8.1);
      doc.text(s(row.posNr || row.lvPos || row.pos || "—"), left + 3, y + 6, { width: 40 });

      doc.font("Helvetica").fontSize(7.9);
      doc.text(description, left + 53, y + 6, { width: 212, lineGap: 1 });
      doc.text(s(row.einheit || row.unit || "—"), left + 275, y + 6, { width: 22 });
      doc.text(num(qty, 3), left + 307, y + 6, { width: 49, align: "right" });
      doc.text(money(ep), left + 366, y + 6, { width: 64, align: "right" });
      doc.text(money(total), left + 440, y + 6, { width: 84, align: "right" });

      y += rowHeight + 5;
    }

    const netto = n(totals.netto, calculatedNetto);
    const mwst = n(totals.mwst ?? options.mwst ?? 19);
    const steuer = n(totals.steuer, (netto * mwst) / 100);
    const brutto = n(totals.brutto, netto + steuer);
    const totalHeight = 82;

    if (y + totalHeight + 86 > pdf.contentBottom()) {
      y = pdf.addPage();
      y += 18;
    }

    const totalWidth = 215;
    const totalX = right - totalWidth;

    doc
      .roundedRect(totalX, y, totalWidth, totalHeight, 7)
      .fillAndStroke("#F6F8FC", RLC_PDF_THEME.line);

    [
      ["Netto", money(netto)],
      [`MwSt (${mwst} %)`, money(steuer)],
      ["Brutto", money(brutto)],
    ].forEach(([label, value], index) => {
      const rowY = y + 12 + index * 22;
      const isLast = index === 2;

      if (isLast) {
        doc.strokeColor(RLC_PDF_THEME.line).lineWidth(0.5);
        doc.moveTo(totalX + 12, rowY - 7).lineTo(totalX + totalWidth - 12, rowY - 7).stroke();
      }

      doc
        .fillColor(isLast ? "#0F172A" : "#475569")
        .font(isLast ? "Helvetica-Bold" : "Helvetica")
        .fontSize(isLast ? 10.5 : 9)
        .text(label, totalX + 12, rowY, { width: 80 });

      doc.text(value, totalX + 96, rowY, {
        width: totalWidth - 108,
        align: "right",
      });
    });

    y += totalHeight + 16;

    const payment = s(
      options.payment ||
      body.payment ||
      "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage."
    );

    doc.font("Helvetica").fontSize(8.7).fillColor("#475569");
    doc.text(payment, left, y, { width: contentWidth });

    y += 46;
    if (y + 34 > pdf.contentBottom()) {
      y = pdf.addPage();
      y += 22;
    }

    const signatureWidth = 180;
    doc.strokeColor(RLC_PDF_THEME.line).lineWidth(0.6);
    doc.moveTo(left, y).lineTo(left + signatureWidth, y).stroke();
    doc.moveTo(right - signatureWidth, y).lineTo(right, y).stroke();

    doc.font("Helvetica").fontSize(7.7).fillColor("#64748B");
    doc.text("Ort, Datum / Auftragnehmer", left, y + 6, {
      width: signatureWidth,
      align: "center",
    });
    doc.text("Ort, Datum / Auftraggeber", right - signatureWidth, y + 6, {
      width: signatureWidth,
      align: "center",
    });

    await pdf.finish();

    try {
      await archiveProjectFileVersion({
        projectIdOrCode: dmsProjectId || projectCode,
        filename: `${fileName}.pdf`,
        kind: "PDF",
        localPath: pdfPath,
        uploadedBy: String(
          req?.auth?.email ||
          req?.auth?.userId ||
          req?.auth?.sub ||
          req?.user?.email ||
          req?.user?.id ||
          ""
        ).trim() || null,
        meta: {
          module: "KALKULATION",
          source: "pdf.angebot",
          projectCode,
          offerNumber,
          rows: rows.length,
        },
      });
    } catch (dmsError) {
      console.error("[pdf:angebot:dms]", dmsError);
    }

    const buffer = fs.readFileSync(pdfPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    return res.send(buffer);
  } catch (error: any) {
    console.error("[pdf:angebot]", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Angebot PDF konnte nicht erzeugt werden.",
    });
  } finally {
    if (pdfPath && fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch {}
    }
  }
});



/* =========================================================
   MAHNWESEN – MAHNUNG PDF
========================================================= */
router.post("/mahnung", async (req: any, res: any) => {
  let pdfPath = "";

  try {
    const body = req.body || {};
    const invoiceId = s(body.invoiceId);
    const requestedLevel = Math.max(1, Math.min(3, Math.round(n(body.dunningLevel, 1))));

    if (!invoiceId) {
      return res.status(400).json({ error: "Rechnung fehlt" });
    }

    const companyId = s(req?.auth?.companyId || req?.auth?.company);
    const userId = s(req?.auth?.sub || req?.auth?.userId);
    const role = s(req?.auth?.companyRole || req?.auth?.role).toUpperCase();
    const privileged = ["ADMIN", "ADMINISTRATOR", "BUCHHALTUNG"].includes(role);
    if (!companyId || !userId) return res.status(403).json({ error: "PROJECT_ACCESS_REQUIRED" });
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        accounting: {
          project: {
            companyId,
            ...(privileged ? {} : { projectMembers: { some: { userId } } }),
          }
        }
      },
      include: {
        customer: true,
        accounting: { include: { project: true } }
      }
    });

    if (!invoice) {
      return res.status(404).json({ error: "Rechnung nicht gefunden" });
    }

    const payments = await prisma.payment.findMany({
      where: {
        accountingId: invoice.accountingId,
        refType: "INVOICE",
        refId: invoice.id,
        direction: "IN"
      }
    });

    const paid = payments.reduce((sum, payment) => sum + n(payment.amount), 0);
    const openAmount = Math.max(0, n(invoice.grossAmount) - paid);
    if (openAmount <= 0.009) {
      return res.status(400).json({ error: "Rechnung ist bereits vollständig bezahlt" });
    }

    const meta = invoice.data && typeof invoice.data === "object" ? invoice.data as any : {};
    const company = await getCompany(req);
    const projectCode = s(invoice.accounting?.project?.code || body.projectId || "Projekt");
    const projectName = s(invoice.accounting?.project?.name || projectCode);
    const customerName = s(invoice.customer?.name || "Kunde");
    const levelTitle = requestedLevel === 1
      ? "1. Mahnung"
      : requestedLevel === 2
      ? "2. Mahnung"
      : "Letzte Mahnung";

    const paymentDue = new Date();
    paymentDue.setDate(paymentDue.getDate() + 14);
    const paymentDueDE = paymentDue.toLocaleDateString("de-DE");

    const fileName = safeFileName(`Mahnung_${invoice.number}_${new Date().toISOString().slice(0, 10)}`);
    pdfPath = path.join("/tmp", `${fileName}_${Date.now()}.pdf`);

    const pdf = createRlcPdfDocument({
      pdfPath,
      title: levelTitle,
      documentType: "Mahnung",
      projectId: projectCode,
      projectName,
      date: new Date().toISOString().slice(0, 10),
      company,
      subject: `${levelTitle} zu Rechnung ${invoice.number}`
    });

    const { doc } = pdf;
    const left = RLC_PDF_THEME.marginX;
    const right = doc.page.width - RLC_PDF_THEME.marginX;
    const contentWidth = right - left;
    let y = pdf.startCurrentPage();

    doc.font("Helvetica-Bold").fontSize(17).fillColor(RLC_PDF_THEME.primary);
    doc.text(levelTitle, left, y, { width: contentWidth });
    y += 34;

    drawRlcInfoField(doc, left, y, (contentWidth - 8) / 2, "Rechnung", invoice.number);
    drawRlcInfoField(doc, left + (contentWidth + 8) / 2, y, (contentWidth - 8) / 2, "Mahnstufe", `${requestedLevel}. Mahnung`);
    y += 48;

    doc.font("Helvetica").fontSize(10).fillColor("#1E293B");
    doc.text(`Sehr geehrte Damen und Herren,`, left, y, { width: contentWidth });
    y += 28;

    doc.text(
      `leider konnten wir bis heute keinen Zahlungseingang zu unserer Rechnung ${invoice.number} feststellen. ` +
      `Wir bitten Sie, den offenen Betrag bis spätestens ${paymentDueDE} zu überweisen.`,
      left, y, { width: contentWidth, lineGap: 4 }
    );
    y += 70;

    drawRlcSectionTitle(doc, "Offene Forderung", y);
    y += 26;

    drawRlcInfoField(doc, left, y, (contentWidth - 16) / 3, "Rechnungsbetrag", money(invoice.grossAmount));
    drawRlcInfoField(doc, left + (contentWidth + 8) / 3, y, (contentWidth - 16) / 3, "Bereits bezahlt", money(paid));
    drawRlcInfoField(doc, left + (contentWidth + 8) * 2 / 3, y, (contentWidth - 16) / 3, "Offener Betrag", money(openAmount));
    y += 55;

    const fee = requestedLevel === 1 ? 5 : requestedLevel === 2 ? 10 : 20;
    doc.font("Helvetica").fontSize(10).fillColor("#1E293B");
    doc.text(
      `Mahngebühr: ${money(fee)} · Bitte geben Sie als Verwendungszweck "${invoice.number}" an.`,
      left, y, { width: contentWidth }
    );
    y += 34;

    if (meta.dueDate) {
      doc.font("Helvetica").fontSize(9).fillColor("#64748B");
      doc.text(`Ursprüngliches Fälligkeitsdatum: ${s(meta.dueDate)}`, left, y, { width: contentWidth });
      y += 22;
    }

    doc.font("Helvetica").fontSize(10).fillColor("#1E293B");
    doc.text(`Mit freundlichen Grüßen\n${s(company?.name || "RLC Bausoftware")}`, left, y, { width: contentWidth, lineGap: 3 });

    await pdf.finish();

    await archiveProjectFileVersion({
      projectIdOrCode: projectCode,
      filename: `${fileName}.pdf`,
      kind: "PDF",
      localPath: pdfPath,
      uploadedBy: s(req?.auth?.email || req?.auth?.userId || req?.auth?.sub) || null,
      meta: {
        module: "BUCHHALTUNG",
        source: "pdf.mahnung",
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        dunningLevel: requestedLevel
      }
    });

    const buffer = fs.readFileSync(pdfPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    return res.send(buffer);
  } catch (error: any) {
    console.error("[pdf:mahnung]", error);
    return res.status(500).json({ error: error?.message || "Mahnung PDF konnte nicht erzeugt werden" });
  } finally {
    if (pdfPath && fs.existsSync(pdfPath)) {
      try { fs.unlinkSync(pdfPath); } catch {}
    }
  }
});

/* ======================
   GENERISCHE KALKULATION PDFS
====================== */

/* =========================================================
   RLC PDF CORE – GENERISCHE KALKULATIONSDOKUMENTE
   Kalkulation · Mengenermittlung · Rechnung · Regiebericht · Lieferschein
========================================================= */
function genericKalkPdf(title: string) {
  return async (req: any, res: any) => {
    let pdfPath = "";

    try {
      const company = await getCompany(req);
      const body = req.body || {};
      const project = body.project || {};
      const rows = Array.isArray(body.rows)
        ? body.rows
        : Array.isArray(body.items)
        ? body.items
        : [];

      const projectCode = s(
        project.code ||
        project.projectCode ||
        project.number ||
        body.projectKey ||
        body.projectCode ||
        "Projekt"
      );

      const projectName = s(
        project.name ||
        project.projectName ||
        body.projectName ||
        projectCode
      );

      const dmsProjectId = s(body.projectId || project.id || projectCode);
      const date = s(body.options?.dateISO || body.date || new Date().toISOString()).slice(0, 10);
      const fileName = safeFileName(`${title}_${projectCode}`);

      pdfPath = path.join("/tmp", `${fileName}_${Date.now()}.pdf`);

      const pdf = createRlcPdfDocument({
        pdfPath,
        title,
        documentType: title,
        projectId: projectCode,
        projectName,
        date,
        company,
        subject: `${title} ${projectCode}`,
      });

      const { doc } = pdf;
      const left = RLC_PDF_THEME.marginX;
      const right = doc.page.width - RLC_PDF_THEME.marginX;
      const contentWidth = right - left;
      const gap = 8;
      const fieldWidth = (contentWidth - gap) / 2;

      const tableHeader = (y: number) => {
        const columns = [
          { label: "Pos.", x: left, width: 46 },
          { label: "Beschreibung", x: left + 50, width: 218 },
          { label: "ME", x: left + 272, width: 28 },
          { label: "Menge", x: left + 304, width: 55 },
          { label: "EP", x: left + 363, width: 70 },
          { label: "Betrag", x: left + 437, width: 90 },
        ];

        doc.fillColor("#EAF2FF").roundedRect(left, y, contentWidth, 19, 3).fill();
        doc.fillColor("#174EA6").font("Helvetica-Bold").fontSize(7.7);

        for (const column of columns) {
          doc.text(column.label, column.x + 3, y + 6, {
            width: column.width - 6,
            align: ["Menge", "EP", "Betrag"].includes(column.label) ? "right" : "left",
          });
        }

        return y + 24;
      };

      let y = pdf.startCurrentPage();

      drawRlcInfoField(doc, left, y, fieldWidth, "Projekt", projectCode);
      drawRlcInfoField(doc, left + fieldWidth + gap, y, fieldWidth, "Bezeichnung", projectName);

      y += 64;

      drawRlcInfoField(doc, left, y, fieldWidth, "Dokument", title);
      drawRlcInfoField(doc, left + fieldWidth + gap, y, fieldWidth, "Positionen", String(rows.length));

      y += 64;
      y = drawRlcSectionTitle(doc, `${title} – Positionen`, y);
      y = tableHeader(y);

      let sum = 0;

      for (const row of rows) {
        const qty = n(row.menge ?? row.qty);
        const ep = n(row.preis ?? row.ep);
        const total = n(row.total ?? row.gesamt ?? row.zeilen ?? qty * ep);
        sum += total;

        const description = [
          s(row.kurztext || row.text || row.title || row.bezeichnung || "—"),
          s(row.langtext || row.description || ""),
        ].filter(Boolean).join("\n");

        doc.font("Helvetica").fontSize(7.9);
        const descriptionHeight = doc.heightOfString(description, {
          width: 212,
          lineGap: 1,
        });
        const rowHeight = Math.max(32, Math.ceil(descriptionHeight + 12));

        if (y + rowHeight > pdf.contentBottom()) {
          y = pdf.addPage();
          y += 16;
          y = tableHeader(y);
        }

        doc
          .strokeColor(RLC_PDF_THEME.border)
          .lineWidth(0.35)
          .roundedRect(left, y, contentWidth, rowHeight, 2)
          .stroke();

        doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(8.1);
        doc.text(s(row.posNr || row.lvPos || row.pos || "—"), left + 3, y + 6, { width: 40 });

        doc.font("Helvetica").fontSize(7.9);
        doc.text(description, left + 53, y + 6, { width: 212, lineGap: 1 });
        doc.text(s(row.einheit || row.unit || "—"), left + 275, y + 6, { width: 22 });
        doc.text(qty ? num(qty, 3) : "—", left + 307, y + 6, { width: 49, align: "right" });
        doc.text(ep ? money(ep) : "—", left + 366, y + 6, { width: 64, align: "right" });
        doc.text(money(total), left + 440, y + 6, { width: 84, align: "right" });

        y += rowHeight + 5;
      }

      const requestedTotal = n(body?.totals?.brutto ?? body?.totals?.netto ?? sum);
      const totalHeight = 48;

      if (y + totalHeight + 24 > pdf.contentBottom()) {
        y = pdf.addPage();
        y += 18;
      }

      const totalWidth = 215;
      const totalX = right - totalWidth;

      doc
        .roundedRect(totalX, y, totalWidth, totalHeight, 7)
        .fillAndStroke("#F6F8FC", RLC_PDF_THEME.line);

      doc.fillColor("#475569").font("Helvetica").fontSize(9);
      doc.text("Gesamt", totalX + 12, y + 17, { width: 80 });

      doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(11);
      doc.text(money(requestedTotal), totalX + 96, y + 16, {
        width: totalWidth - 108,
        align: "right",
      });

      await pdf.finish();

      try {
        await archiveProjectFileVersion({
          projectIdOrCode: dmsProjectId || projectCode,
          filename: `${fileName}.pdf`,
          kind: "PDF",
          localPath: pdfPath,
          uploadedBy: String(
            req?.auth?.email ||
            req?.auth?.userId ||
            req?.auth?.sub ||
            req?.user?.email ||
            req?.user?.id ||
            ""
          ).trim() || null,
          meta: {
            module: "PDF",
            source: `pdf.${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            documentType: title,
            projectCode,
            rows: rows.length,
          },
        });
      } catch (dmsError) {
        console.error(`[pdf:${title}:dms]`, dmsError);
      }

      const buffer = fs.readFileSync(pdfPath);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}.pdf"`);
      res.setHeader("Content-Length", String(buffer.length));
      return res.send(buffer);
    } catch (error: any) {
      console.error(`[pdf:${title}]`, error);
      return res.status(500).json({
        ok: false,
        error: error?.message || `PDF ${title} konnte nicht erzeugt werden.`,
      });
    } finally {
      if (pdfPath && fs.existsSync(pdfPath)) {
        try {
          fs.unlinkSync(pdfPath);
        } catch {}
      }
    }
  };
}



async function professionalCalculationPdf(req: any, res: any, opts: any) {
  const body = req.body || {};
  const company = await getCompany(req);

  const project = body.project || {};
  const offer = body.offer || body.meta?.offer || {};
  const client = body.client || {};
  const totals = body.totals || body.summary || {};

  const rowsRaw = Array.isArray(body.rows) ? body.rows : [];
  const cleanedRows = cleanOfferRows(rowsRaw);

  const rows = cleanedRows.map((row: any, idx: number) => ({
    ...row,
    priceBreakdown: Array.isArray(rowsRaw[idx]?.priceBreakdown)
      ? rowsRaw[idx].priceBreakdown
      : [],
    aiReason: row.aiReason ?? rowsRaw[idx]?.aiReason ?? "",
    warning: row.warning ?? rowsRaw[idx]?.warning ?? "",
  }));

  const projectCode = s(
    project.code ||
      project.number ||
      project.projectKey ||
      body.projectKey ||
      body.meta?.projectKey ||
      "Projekt"
  );

  const projectName = s(
    project.name ||
      project.projectName ||
      body.projectName ||
      body.meta?.projectName ||
      "Kalkulation"
  );

  const clientName = s(
    client.name ||
      offer.clientName ||
      project.client ||
      project.auftraggeber ||
      "Auftraggeber"
  );

  const clientAddress = s(
    client.address ||
      offer.clientAddress ||
      project.clientAddress ||
      project.address ||
      ""
  );

  const place = s(
    offer.place ||
      project.location ||
      project.place ||
      project.ort ||
      body.place ||
      ""
  );

  const date = body.options?.dateISO
    ? new Date(body.options.dateISO).toLocaleDateString("de-DE")
    : todayDE();

  const title = opts?.title || "Urkalkulation";

  function cleanBreakdownLine(line: any) {
    const qty = n(line?.qty ?? line?.menge ?? 1);
    const price = n(line?.price ?? line?.preis ?? line?.ep ?? 0);
    const total = n(line?.total ?? line?.gesamt ?? qty * price);

    return {
      group: s(line?.group || line?.gruppe || "Kosten"),
      name: s(line?.name || line?.bezeichnung || line?.text || "Kostenansatz"),
      unit: s(line?.unit || line?.einheit || "EH"),
      qty,
      price,
      total,
      note: s(line?.note || line?.hinweis || ""),
    };
  }

  function getBreakdown(row: any) {
    if (!Array.isArray(row?.priceBreakdown)) return [];
    return row.priceBreakdown.map(cleanBreakdownLine).filter((x: any) => x.total > 0);
  }

  function breakdownSum(row: any) {
    return getBreakdown(row).reduce((sum: number, line: any) => sum + n(line.total), 0);
  }

  function rowEp(row: any) {
    const fromBreakdown = breakdownSum(row);
    return n(
      row.preis ??
        row.ep ??
        row.finalUnitPrice ??
        row.suggestedUnitPrice,
      fromBreakdown
    );
  }

  function rowTotal(row: any) {
    const qty = n(row.menge ?? row.qty);
    const ep = rowEp(row);
    return n(row.zeilen ?? row.total ?? row.gesamt, qty * ep);
  }

  createPdf(res, `${opts?.filePrefix || "Urkalkulation"}_${projectCode}`, (doc) => {
    drawCompanyHeader(doc, company);

    drawMetaBox(doc, {
      Projekt: projectCode,
      Datum: date,
      Ort: place || "—",
      Bearbeiter: s((req as any)?.auth?.role || "RLC"),
    });

    drawRecipientBlock(doc, company, {
      name: clientName,
      address: clientAddress,
      city: "",
    });

    doc.font("Helvetica-Bold").fontSize(23).fillColor("#0F172A");
    doc.text(title, 56, 246);

    doc.font("Helvetica").fontSize(10).fillColor("#334155");
    doc.text(`${projectCode}${projectName ? " · " + projectName : ""}`, 56, 278, {
      width: 484,
    });

    if (place) {
      doc.text(`Baustelle / Ort: ${place}`, 56, 293, { width: 484 });
    }

    doc.y = place ? 320 : 306;
    doc.fillColor("#000000");

    const mainCols = [
      { label: "PosNr", x: 56, w: 55 },
      { label: "Leistungsbeschreibung", x: 118, w: 230 },
      { label: "ME", x: 355, w: 30 },
      { label: "Menge", x: 390, w: 50, align: "right" },
      { label: "EP", x: 445, w: 43, align: "right" },
      { label: "Gesamt", x: 493, w: 47, align: "right" },
    ];

    let sum = 0;

    for (const r of rows) {
      if (doc.y > 690) doc.addPage();

      const qtyValue = n(r.menge ?? r.qty);
      const ep = rowEp(r);
      const total = rowTotal(r);
      const breakdown = getBreakdown(r);

      sum += total;

      const posNr = s(r.posNr || r.lvPos || r.pos || "");
      const kurz = s(r.kurztext || r.text || r.title || r.bezeichnung || "");
      const lang = s(r.langtext || r.description || "");
      const note = s(r.aiReason || r.warning || "");

      doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#0F172A");
      doc.text(`${posNr || "—"} · ${kurz || "Position"}`, 56, doc.y, { width: 484 });
      doc.moveDown(0.25);

      if (lang) {
        doc.font("Helvetica").fontSize(8.5).fillColor("#334155");
        doc.text(lang, 56, doc.y, { width: 484 });
        doc.moveDown(0.3);
      }

      tableHeader(doc, mainCols);

      rowLine(doc, mainCols, [
        posNr,
        kurz,
        r.einheit || r.unit || "",
        qtyValue ? num(qtyValue, 3) : "",
        ep ? money(ep) : "",
        money(total),
      ]);

      if (breakdown.length) {
        if (doc.y > 650) doc.addPage();

        doc.moveDown(0.35);
        doc.font("Helvetica-Bold").fontSize(8.8).fillColor("#1E3A8A");
        doc.text("Preisaufbau / Urkalkulation", 76, doc.y);
        doc.moveDown(0.25);

        const bCols = [
          { label: "Gruppe", x: 76, w: 74 },
          { label: "Bezeichnung", x: 154, w: 165 },
          { label: "ME", x: 322, w: 30 },
          { label: "Menge", x: 356, w: 50, align: "right" },
          { label: "Preis", x: 411, w: 55, align: "right" },
          { label: "Gesamt", x: 471, w: 69, align: "right" },
        ];

        tableHeader(doc, bCols);

        for (const b of breakdown) {
          if (doc.y > 705) {
            doc.addPage();
            tableHeader(doc, bCols);
          }

          rowLine(doc, bCols, [
            b.group,
            b.note ? `${b.name}\n${b.note}` : b.name,
            b.unit,
            num(b.qty, 2),
            money(b.price),
            money(b.total),
          ]);
        }

        doc.font("Helvetica-Bold").fontSize(8.8).fillColor("#0F172A");
        doc.text(`Summe Preisaufbau / EP: ${money(breakdownSum(r))}`, 350, doc.y + 4, {
          width: 190,
          align: "right",
        });
        doc.y += 18;
      }

      if (opts?.showKiInfo && note) {
        if (doc.y > 685) doc.addPage();

        doc.font("Helvetica").fontSize(8).fillColor("#475569");
        doc.text(`KI-Hinweis: ${note}`, 76, doc.y, { width: 464 });
        doc.moveDown(0.6);
      }

      doc.strokeColor("#E5E7EB").lineWidth(0.5);
      doc.moveTo(56, doc.y + 4).lineTo(540, doc.y + 4).stroke();
      doc.y += 14;
    }

    if (doc.y > 625) doc.addPage();

    const netto = n(totals.netto ?? totals.net ?? sum);
    const mwst = n(body.mwst ?? body.options?.mwst ?? body.meta?.mwst ?? 19);
    const steuer = n(totals.steuer ?? totals.tax ?? (netto * mwst) / 100);
    const brutto = n(totals.brutto ?? totals.gross ?? netto + steuer);

    const sumX = 335;
    const sumY = doc.y + 8;
    const sumW = 205;
    const rowH = 20;

    doc.save();
    doc.roundedRect(sumX, sumY, sumW, rowH * 3 + 14, 6).fill("#F8FAFC");
    doc.strokeColor("#D8E0EA").lineWidth(0.6);
    doc.roundedRect(sumX, sumY, sumW, rowH * 3 + 14, 6).stroke();

    doc.font("Helvetica").fontSize(9).fillColor("#475569");
    doc.text("Netto", sumX + 12, sumY + 12, { width: 80 });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#0F172A");
    doc.text(money(netto), sumX + 95, sumY + 12, {
      width: 95,
      align: "right",
    });

    doc.font("Helvetica").fontSize(9).fillColor("#475569");
    doc.text(`MwSt (${mwst}%)`, sumX + 12, sumY + 12 + rowH, { width: 80 });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#0F172A");
    doc.text(money(steuer), sumX + 95, sumY + 12 + rowH, {
      width: 95,
      align: "right",
    });

    doc.strokeColor("#CBD5E1").lineWidth(0.5);
    doc.moveTo(sumX + 12, sumY + 12 + rowH * 2 - 4)
      .lineTo(sumX + sumW - 12, sumY + 12 + rowH * 2 - 4)
      .stroke();

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0F172A");
    doc.text("Brutto", sumX + 12, sumY + 12 + rowH * 2, { width: 80 });
    doc.text(money(brutto), sumX + 95, sumY + 12 + rowH * 2, {
      width: 95,
      align: "right",
    });

    doc.restore();

    doc.y = sumY + rowH * 3 + 38;

    const notes = s(
      body.notes ||
        offer.notes ||
        body.options?.payment ||
        body.meta?.offer?.notes ||
        ""
    );

    if (notes) {
      doc.font("Helvetica").fontSize(9).fillColor("#334155");
      doc.text(notes, 56, doc.y, { width: 484 });
    }
  });
}



/* =========================================================
   RLC PDF CORE – NACHTRÄGE
   POST /api/pdf/nachtraege
========================================================= */
async function professionalNachtraegePdf(req: any, res: any) {
  let pdfPath = "";

  try {
    const body = req.body || {};
    const company = await getCompany(req);
    const project = body.project || {};
    const rowsRaw = Array.isArray(body.rows)
      ? body.rows
      : Array.isArray(body.items)
      ? body.items
      : [];

    const rows = cleanOfferRows(rowsRaw);

    const projectCode = s(
      project.code ||
      project.projectCode ||
      project.number ||
      project.projectKey ||
      body.projectKey ||
      "Projekt"
    );

    const projectName = s(
      project.name ||
      project.projectName ||
      body.projectName ||
      projectCode
    );

    const dmsProjectId = s(body.projectId || project.id || projectCode);
    const place = s(project.location || project.place || project.ort || body.place || "");
    const clientName = s(
      project.client ||
      project.auftraggeber ||
      body.clientName ||
      "Auftraggeber"
    );
    const clientAddress = s(project.clientAddress || project.address || body.clientAddress || "");
    const mwst = n(body.mwst ?? body.options?.mwst ?? 19);
    const date = s(body.options?.dateISO || body.date || new Date().toISOString()).slice(0, 10);
    const fileName = safeFileName(`Nachtraege_${projectCode}`);

    pdfPath = path.join("/tmp", `${fileName}_${Date.now()}.pdf`);

    const pdf = createRlcPdfDocument({
      pdfPath,
      title: "Nachträge",
      documentType: "Nachträge",
      projectId: projectCode,
      projectName,
      date,
      company,
      subject: `Nachträge ${projectCode}`,
    });

    const { doc } = pdf;
    const left = RLC_PDF_THEME.marginX;
    const right = doc.page.width - RLC_PDF_THEME.marginX;
    const contentWidth = right - left;
    const gap = 8;
    const fieldWidth = (contentWidth - gap) / 2;

    const tableHeader = (y: number) => {
      const columns = [
        { label: "PosNr", x: left, width: 46 },
        { label: "Nachtragsbeschreibung", x: left + 50, width: 194 },
        { label: "ME", x: left + 248, width: 30 },
        { label: "Menge", x: left + 282, width: 54 },
        { label: "EP", x: left + 340, width: 64 },
        { label: "Netto", x: left + 408, width: 64 },
        { label: "Status", x: left + 476, width: 51 },
      ];

      doc.fillColor("#EAF2FF").roundedRect(left, y, contentWidth, 19, 3).fill();
      doc.fillColor("#174EA6").font("Helvetica-Bold").fontSize(7.6);

      for (const column of columns) {
        doc.text(column.label, column.x + 3, y + 6, {
          width: column.width - 6,
          align: ["Menge", "EP", "Netto"].includes(column.label) ? "right" : "left",
        });
      }

      return y + 24;
    };

    let y = pdf.startCurrentPage();

    drawRlcInfoField(doc, left, y, fieldWidth, "Projekt", projectCode);
    drawRlcInfoField(doc, left + fieldWidth + gap, y, fieldWidth, "Bezeichnung", projectName);

    y += 64;

    drawRlcInfoField(doc, left, y, fieldWidth, "Baustelle / Ort", place || "—");
    drawRlcInfoField(
      doc,
      left + fieldWidth + gap,
      y,
      fieldWidth,
      "Auftraggeber",
      [clientName, clientAddress].filter(Boolean).join(" · ") || "—"
    );

    y += 64;
    y = drawRlcSectionTitle(doc, "Nachtragspositionen", y);
    y = tableHeader(y);

    let netto = 0;

    for (const row of rows) {
      const qty = n(row.mengeDelta ?? row.qty ?? row.menge);
      const ep = n(row.preis ?? row.ep);
      const total = n(row.total ?? row.gesamt ?? row.zeilen ?? qty * ep);
      netto += total;

      const shortText = s(row.kurztext || row.text || row.title || row.bezeichnung || "—");
      const longText = s(row.langtext || row.description || "");
      const reason = s(row.begruendung || row.note || row.reason || "");
      const description = [
        shortText,
        longText,
        reason ? `Begründung: ${reason}` : "",
      ].filter(Boolean).join("\n");

      doc.font("Helvetica").fontSize(7.8);
      const descriptionHeight = doc.heightOfString(description, {
        width: 188,
        lineGap: 1,
      });
      const rowHeight = Math.max(36, Math.ceil(descriptionHeight + 12));

      if (y + rowHeight > pdf.contentBottom()) {
        y = pdf.addPage();
        y += 16;
        y = tableHeader(y);
      }

      doc
        .strokeColor(RLC_PDF_THEME.border)
        .lineWidth(0.35)
        .roundedRect(left, y, contentWidth, rowHeight, 2)
        .stroke();

      doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(8.1);
      doc.text(s(row.posNr || row.lvPos || row.pos || "—"), left + 3, y + 6, { width: 40 });

      doc.font("Helvetica").fontSize(7.8);
      doc.text(description, left + 53, y + 6, { width: 188, lineGap: 1 });
      doc.text(s(row.einheit || row.unit || "—"), left + 251, y + 6, { width: 24 });
      doc.text(qty ? num(qty, 3) : "—", left + 285, y + 6, { width: 48, align: "right" });
      doc.text(ep ? money(ep) : "—", left + 343, y + 6, { width: 58, align: "right" });
      doc.text(money(total), left + 411, y + 6, { width: 58, align: "right" });

      doc.font("Helvetica-Bold").fontSize(7.1);
      doc.text(s(row.status || "Entwurf"), left + 479, y + 6, { width: 45 });

      y += rowHeight + 5;
    }

    const steuer = netto * mwst / 100;
    const brutto = netto + steuer;
    const totalHeight = 82;

    if (y + totalHeight + 34 > pdf.contentBottom()) {
      y = pdf.addPage();
      y += 18;
    }

    const totalWidth = 215;
    const totalX = right - totalWidth;

    doc
      .roundedRect(totalX, y, totalWidth, totalHeight, 7)
      .fillAndStroke("#F6F8FC", RLC_PDF_THEME.line);

    const totalRows = [
      ["Netto", money(netto)],
      [`MwSt (${mwst} %)`, money(steuer)],
      ["Brutto", money(brutto)],
    ];

    totalRows.forEach(([label, value], index) => {
      const rowY = y + 12 + index * 22;
      const isLast = index === totalRows.length - 1;

      if (index === 2) {
        doc.strokeColor(RLC_PDF_THEME.line).lineWidth(0.5);
        doc.moveTo(totalX + 12, rowY - 7).lineTo(totalX + totalWidth - 12, rowY - 7).stroke();
      }

      doc
        .fillColor(isLast ? "#0F172A" : "#475569")
        .font(isLast ? "Helvetica-Bold" : "Helvetica")
        .fontSize(isLast ? 10.5 : 9)
        .text(label, totalX + 12, rowY, { width: 80 });

      doc.text(value, totalX + 96, rowY, {
        width: totalWidth - 108,
        align: "right",
      });
    });

    y += totalHeight + 17;
    doc.font("Helvetica").fontSize(8.5).fillColor("#475569");
    doc.text(
      "Die aufgeführten Nachträge verstehen sich vorbehaltlich Prüfung und Freigabe durch den Auftraggeber.",
      left,
      y,
      { width: contentWidth }
    );

    await pdf.finish();

    try {
      await archiveProjectFileVersion({
        projectIdOrCode: dmsProjectId || projectCode,
        filename: `${fileName}.pdf`,
        kind: "PDF",
        localPath: pdfPath,
        uploadedBy: String(
          req?.auth?.email ||
          req?.auth?.userId ||
          req?.auth?.sub ||
          req?.user?.email ||
          req?.user?.id ||
          ""
        ).trim() || null,
        meta: {
          module: "KALKULATION",
          source: "pdf.nachtraege",
          projectCode,
          rows: rows.length,
          mwst,
        },
      });
    } catch (dmsError) {
      console.error("[pdf:nachtraege:dms]", dmsError);
    }

    const buffer = fs.readFileSync(pdfPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    return res.send(buffer);
  } catch (error: any) {
    console.error("[pdf:nachtraege]", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Nachträge PDF konnte nicht erzeugt werden.",
    });
  } finally {
    if (pdfPath && fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch {}
    }
  }
}

router.post("/nachtraege", professionalNachtraegePdf);
router.post("/kalkulation", genericKalkPdf("Kalkulation"));
router.post("/mengen", genericKalkPdf("Mengenermittlung"));
router.post("/rechnung", genericKalkPdf("Rechnung"));
router.post("/regiebericht", genericKalkPdf("Regiebericht"));
router.post("/lieferschein", genericKalkPdf("Lieferschein"));

/* =========================================================
   RLC PDF CORE – VERSIONSVERGLEICH
   POST /api/pdf/versionsvergleich
========================================================= */
async function renderVersionsvergleichPdfCore(
  req: any,
  res: any,
  input: any
) {
  let pdfPath = "";

  try {
    const project = input.project || {};
    const rows = Array.isArray(input.rows) ? input.rows : [];
    const versions = Array.isArray(input.versions) ? input.versions : [];
    const stats = input.stats || {};
    const company = await getCompany(req);

    // Codice leggibile nel PDF; UUID solo per la relazione DMS.
    const projectCode = s(
      project.code ||
      project.projectCode ||
      input.projectKey ||
      input.projectCode ||
      project.number ||
      "Projekt"
    );

    const projectName = s(
      project.name ||
      input.projectName ||
      input.projectTitle ||
      projectCode
    );

    const dmsProjectId = s(
      input.projectId ||
      project.id ||
      projectCode
    );

    const date = new Date().toISOString().slice(0, 10);
    const fileName = safeFileName(`Versionsvergleich_${projectCode}`);

    pdfPath = path.join("/tmp", `${fileName}_${Date.now()}.pdf`);

    const pdf = createRlcPdfDocument({
      pdfPath,
      title: "Versionsvergleich",
      documentType: "Versionsvergleich",
      projectId: projectCode,
      projectName,
      date,
      company,
      subject: `Versionsvergleich ${projectCode}`,
    });

    const { doc } = pdf;
    const left = RLC_PDF_THEME.marginX;
    const right = doc.page.width - RLC_PDF_THEME.marginX;
    const contentWidth = right - left;
    const gap = 8;
    const fieldWidth = (contentWidth - gap) / 2;

    const writeTableHeader = (y: number) => {
      const cols = [
        { label: "PosNr", x: left, width: 54 },
        { label: "Kurztext", x: left + 58, width: 188 },
        { label: "Version 1", x: left + 250, width: 118 },
        { label: "Version 2", x: left + 372, width: 118 },
      ];

      doc
        .fillColor("#EAF2FF")
        .roundedRect(left, y, contentWidth, 19, 3)
        .fill();

      doc.fillColor("#174EA6").font("Helvetica-Bold").fontSize(8);
      for (const col of cols) {
        doc.text(col.label, col.x + 3, y + 6, { width: col.width - 6 });
      }

      return y + 24;
    };

    const cellVersion = (value: any) => {
      if (!value) return "—";
      const quantity = Number(value.menge ?? value.qty ?? 0);
      const unit = s(value.einheit || value.unit || "—");
      const price = Number(value.preis ?? value.ep ?? 0);

      return `${Number.isFinite(quantity) ? num(quantity, 3) : "—"} ${unit}\nEP ${money(price)}`;
    };

    const differencesFor = (row: any) =>
      [
        row?.diffQty ? "Menge" : "",
        row?.diffUnit ? "ME" : "",
        row?.diffPrice ? "Preis" : "",
        row?.diffText ? "Text" : "",
      ].filter(Boolean).join(", ");

    let y = pdf.startCurrentPage();

    drawRlcInfoField(doc, left, y, fieldWidth, "Projekt", projectCode);
    drawRlcInfoField(
      doc,
      left + fieldWidth + gap,
      y,
      fieldWidth,
      "Bezeichnung",
      projectName
    );

    y += 64;

    drawRlcInfoField(
      doc,
      left,
      y,
      fieldWidth,
      "Versionen / Positionen",
      `${versions.length} / ${Number(stats.rows || rows.length)}`
    );
    drawRlcInfoField(
      doc,
      left + fieldWidth + gap,
      y,
      fieldWidth,
      "Abweichungen",
      `Preis ${Number(stats.priceDiff || 0)} · Menge ${Number(stats.qtyDiff || 0)} · Text ${Number(stats.textDiff || 0)}`
    );

    y += 64;
    y = drawRlcSectionTitle(doc, "Vergleichspositionen", y);
    y = writeTableHeader(y);

    if (rows.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor("#475569");
      doc.text(
        "Keine Vergleichspositionen vorhanden. Speichere mindestens zwei Versionen und wähle diese für den Vergleich aus.",
        left,
        y + 4,
        { width: contentWidth }
      );
    }

    for (const row of rows) {
      const first = Array.isArray(row?.cells) ? row.cells[0] : null;
      const second = Array.isArray(row?.cells) ? row.cells[1] : null;
      const shortText = s(row?.kurztext || row?.text || "—");
      const diff = differencesFor(row);

      doc.font("Helvetica").fontSize(8);
      const textHeight = doc.heightOfString(shortText, { width: 182, lineGap: 1 });
      const rowHeight = Math.max(38, Math.ceil(textHeight + (diff ? 17 : 11)));

      if (y + rowHeight > pdf.contentBottom()) {
        y = pdf.addPage();
        y += 16;
        y = writeTableHeader(y);
      }

      doc
        .strokeColor(RLC_PDF_THEME.border)
        .lineWidth(0.35)
        .roundedRect(left, y, contentWidth, rowHeight, 2)
        .stroke();

      doc.font("Helvetica-Bold").fontSize(8.2).fillColor("#0F172A");
      doc.text(s(row?.posNr || "—"), left + 3, y + 6, { width: 50 });

      doc.font("Helvetica").fontSize(8).fillColor("#0F172A");
      doc.text(shortText, left + 61, y + 6, { width: 182, lineGap: 1 });

      doc.font("Helvetica").fontSize(7.7);
      doc.text(cellVersion(first), left + 253, y + 6, {
        width: 112,
        lineGap: 2,
      });
      doc.text(cellVersion(second), left + 375, y + 6, {
        width: 112,
        lineGap: 2,
      });

      if (diff) {
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#B42318");
        doc.text(`Abweichung: ${diff}`, left + 61, y + rowHeight - 11, {
          width: 425,
        });
      }

      y += rowHeight + 5;
    }

    await pdf.finish();

    // DMS prima della risposta; un errore DMS non deve impedire il download.
    try {
      await archiveProjectFileVersion({
        projectIdOrCode: dmsProjectId || projectCode,
        filename: `${fileName}.pdf`,
        kind: "PDF",
        localPath: pdfPath,
        uploadedBy: String(
          req?.auth?.email ||
          req?.auth?.userId ||
          req?.auth?.sub ||
          req?.user?.email ||
          req?.user?.id ||
          ""
        ).trim() || null,
        meta: {
          module: "KALKULATION",
          source: "pdf.versionsvergleich",
          projectCode,
          versions: versions.length,
          positions: rows.length,
        },
      });
    } catch (dmsError) {
      console.error("[pdf:versionsvergleich:dms]", dmsError);
    }

    const buffer = fs.readFileSync(pdfPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}.pdf"`
    );
    res.setHeader("Content-Length", String(buffer.length));
    return res.send(buffer);
  } catch (error: any) {
    console.error("[pdf:versionsvergleich]", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Versionsvergleich PDF error",
    });
  } finally {
    if (pdfPath && fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch {}
    }
  }
}

router.post("/versionsvergleich", async (req: any, res: any) => {
  return renderVersionsvergleichPdfCore(req, res, req.body || {});
});

/*
 * Compatibilità con il precedente GET: nessun collegamento esistente si rompe.
 */
router.get("/versionsvergleich/:projectId", requireProjectMember("projectId"), async (req: any, res: any) => {
  try {
    const requestedProjectId = String((req as any).resolvedProjectId || req.params.projectId || "").trim();

    const project = await prisma.project.findUnique({
      where: { id: requestedProjectId },
      select: { id: true, code: true, name: true },
    });

    const versions = await prisma.offerVersion.findMany({
      where: { projectId: project?.id || requestedProjectId },
      orderBy: { createdAt: "asc" },
    });

    return renderVersionsvergleichPdfCore(req, res, {
      projectId: project?.id || requestedProjectId,
      projectKey: project?.code || requestedProjectId,
      project: {
        id: project?.id || requestedProjectId,
        code: project?.code || requestedProjectId,
        name: project?.name || "",
      },
      versions,
      rows: [],
      stats: { rows: 0 },
    });
  } catch (error: any) {
    console.error("[pdf:versionsvergleich:get]", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Versionsvergleich PDF error",
    });
  }
});


/* =========================================================
   RLC PDF CORE – KALKULATION MIT KI
   POST /api/pdf/kalkulation-ki
========================================================= */
router.post("/kalkulation-ki", async (req: any, res) => {
  let pdfPath = "";

  try {
    const body = req.body || {};
    const company = await getCompany(req);
    const project = body.project || {};
    const options = body.options || {};
    const totals = body.totals || body.summary || {};
    const rows = Array.isArray(body.rows) ? body.rows : [];

    const projectId = s(
      project.id ||
      project.code ||
      project.number ||
      body.projectKey ||
      "Projekt"
    );

    const projectName = s(
      project.name ||
      body.projectTitle ||
      "KI-Kalkulation"
    );

    const clientName = s(
      project.client ||
      project.auftraggeber ||
      body.client?.name ||
      ""
    );

    const date = s(options.dateISO || body.date || new Date().toISOString())
      .slice(0, 10);

    const fileName = safeFileName(
      `KI_Angebot_${body.offerNo || body.angebotNr || projectId}`
    );

    pdfPath = path.join(
      "/tmp",
      `${fileName}_${Date.now()}.pdf`
    );

    const pdf = createRlcPdfDocument({
      pdfPath,
      title: "KI-Kalkulation / Angebot",
      documentType: "KI-Kalkulation",
      projectId,
      projectName,
      date,
      company,
      subject: `KI-Kalkulation ${projectId}`,
    });

    const { doc } = pdf;
    let y = pdf.startCurrentPage();
    const contentWidth =
      doc.page.width - RLC_PDF_THEME.marginX * 2;
    const gap = 8;

    const fieldWidth = (contentWidth - gap * 3) / 4;

    drawRlcInfoField(doc, 34, y, fieldWidth, "Projekt", projectId);
    drawRlcInfoField(
      doc,
      34 + fieldWidth + gap,
      y,
      fieldWidth,
      "Bezeichnung",
      projectName
    );
    drawRlcInfoField(
      doc,
      34 + (fieldWidth + gap) * 2,
      y,
      fieldWidth,
      "Auftraggeber",
      clientName
    );
    drawRlcInfoField(
      doc,
      34 + (fieldWidth + gap) * 3,
      y,
      fieldWidth,
      "Positionen",
      String(rows.length)
    );

    y += 62;
    y = drawRlcSectionTitle(doc, "Angebotssummen", y);

    const netto = n(
      totals.netto ??
      totals.totalNet ??
      totals.summeNetto ??
      rows.reduce((sum: number, row: any) => {
        const qty = n(row.menge ?? row.qty);
        const ep = n(
          row.finalUnitPrice ??
          row.rlcKiUnitPrice ??
          row.preis ??
          row.ep
        );
        return sum + n(row.gesamt ?? row.total ?? qty * ep);
      }, 0)
    );

    const mwstRate = n(
      body.mwst ??
      totals.mwstRate ??
      19
    );

    const mwst = n(
      totals.mwst ??
      totals.tax ??
      netto * mwstRate / 100
    );

    const brutto = n(
      totals.brutto ??
      totals.totalGross ??
      netto + mwst
    );

    const sumWidth = (contentWidth - gap * 2) / 3;

    drawRlcInfoField(
      doc,
      34,
      y,
      sumWidth,
      "Netto",
      money(netto)
    );

    drawRlcInfoField(
      doc,
      34 + sumWidth + gap,
      y,
      sumWidth,
      `MwSt. ${mwstRate}%`,
      money(mwst)
    );

    drawRlcInfoField(
      doc,
      34 + (sumWidth + gap) * 2,
      y,
      sumWidth,
      "Brutto",
      money(brutto)
    );

    y += 64;
    y = drawRlcSectionTitle(
      doc,
      "Leistungspositionen und KI-Preise",
      y
    );

    const columns = [
      { label: "Pos.", x: 34, width: 54 },
      { label: "Leistungsbeschreibung", x: 92, width: 235 },
      { label: "ME", x: 331, width: 32 },
      { label: "Menge", x: 367, width: 52, align: "right" },
      { label: "EP", x: 423, width: 62, align: "right" },
      { label: "Gesamt", x: 489, width: 72, align: "right" },
    ];

    function drawHeader() {
      if (y > pdf.contentBottom() - 44) {
        y = pdf.addPage();
      }

      doc
        .roundedRect(34, y, contentWidth, 24, 4)
        .fill(RLC_PDF_THEME.sectionFill);

      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(RLC_PDF_THEME.primary);

      for (const col of columns) {
        doc.text(col.label, col.x, y + 8, {
          width: col.width,
          align: col.align || "left",
        });
      }

      y += 30;
    }

    drawHeader();

    for (const row of rows) {
      const pos = s(
        row.posNr ||
        row.lvPos ||
        row.pos ||
        ""
      );

      const description = [
        s(row.kurztext || row.text || row.title),
        s(row.langtext),
        s(row.aiReason)
          ? `KI-Begründung: ${s(row.aiReason)}`
          : "",
        s(row.warning)
          ? `Prüfhinweis: ${s(row.warning)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const unit = s(row.einheit || row.unit);
      const qty = n(row.menge ?? row.qty);

      const ep = n(
        row.finalUnitPrice ??
        row.rlcKiUnitPrice ??
        row.preis ??
        row.ep
      );

      const total = n(
        row.gesamt ??
        row.rlcKiTotal ??
        row.total ??
        qty * ep
      );

      const rowHeight = Math.max(
        28,
        doc.heightOfString(description || "—", {
          width: 225,
          lineGap: 1,
        }) + 12
      );

      if (y + rowHeight > pdf.contentBottom()) {
        y = pdf.addPage();
        drawHeader();
      }

      doc
        .font("Helvetica")
        .fontSize(7.6)
        .fillColor(RLC_PDF_THEME.text);

      doc.text(pos || "—", 34, y + 5, {
        width: 54,
      });

      doc.text(description || "—", 92, y + 5, {
        width: 235,
        lineGap: 1,
      });

      doc.text(unit || "—", 331, y + 5, {
        width: 32,
      });

      doc.text(rlcGermanNumber(qty), 367, y + 5, {
        width: 52,
        align: "right",
      });

      doc.text(money(ep), 423, y + 5, {
        width: 62,
        align: "right",
      });

      doc.text(money(total), 489, y + 5, {
        width: 72,
        align: "right",
      });

      doc
        .strokeColor(RLC_PDF_THEME.border)
        .lineWidth(0.35)
        .moveTo(34, y + rowHeight)
        .lineTo(561, y + rowHeight)
        .stroke();

      y += rowHeight + 4;
    }

    await pdf.finish();

    const buffer = fs.readFileSync(pdfPath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}.pdf"`
    );
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  } catch (error: any) {
    console.error("[pdf:kalkulation-ki]", error);
    res.status(500).json({
      ok: false,
      error: error?.message || "Kalkulations-PDF konnte nicht erzeugt werden.",
    });
  } finally {
    if (pdfPath && fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch {}
    }
  }
});


/* =========================================================
   RLC PDF CORE – BVBS PRÜFAUSDRUCK MENGENERMITTLUNG
   POST /api/pdf/bvbs-pruefausdruck
========================================================= */
router.post("/bvbs-pruefausdruck", async (req: any, res) => {
  let pdfPath = "";
  try {
    const body = req.body || {};
    const project = body.project || {};
    const positions = Array.isArray(body.positions) ? body.positions : [];
    if (!positions.length) {
      return res.status(400).json({ ok: false, error: "Keine BVBS-Aufmaßdaten vorhanden." });
    }

    const company = await getCompany(req);
    const projectId = s(project.code || project.id || body.projectKey || "Projekt");
    const projectName = s(project.name || body.projectTitle || "Mengenermittlung GAEB-Zertifizierung");
    const date = s(body.date || new Date().toISOString()).slice(0, 10);
    const fileName = safeFileName(`BVBS_Pruefausdruck_${projectId}`);
    pdfPath = path.join("/tmp", `${fileName}_${Date.now()}.pdf`);

    const evaluated = evaluateReb23003Positions(
      positions.map((p: any) => ({
        pos: s(p.pos || p.position || p.posNr),
        qTakeoffRows: Array.isArray(p.qTakeoffRows) ? p.qTakeoffRows : [],
      }))
    );

    const pdf = createRlcPdfDocument({
      pdfPath,
      title: "BVBS-Prüfausdruck",
      documentType: "BVBS Mengenermittlung",
      projectId,
      projectName,
      date,
      company,
      subject: `GAEB-Zertifizierung Mengenermittlung ${projectId}`,
    });

    const { doc } = pdf;
    let y = pdf.startCurrentPage();
    const left = RLC_PDF_THEME.marginX;
    const width = doc.page.width - RLC_PDF_THEME.marginX * 2;
    const gap = 7;
    const field = (width - gap * 3) / 4;

    drawRlcInfoField(doc, left, y, field, "Projekt", projectName || projectId);
    drawRlcInfoField(doc, left + field + gap, y, field, "Datenphase", "X31 / REB 23.003");
    drawRlcInfoField(doc, left + (field + gap) * 2, y, field, "GAEB", s(body.gaebVersion || "3.3"));
    drawRlcInfoField(doc, left + (field + gap) * 3, y, field, "Positionen", String(positions.length));
    y += 62;
    y = drawRlcSectionTitle(doc, "Mengenermittlung – Prüfdaten", y);

    const cols = [
      { label: "Adresse", x: left, w: 47 },
      { label: "Kz", x: left + 49, w: 20 },
      { label: "Erl.", x: left + 71, w: 69 },
      { label: "Fakt.", x: left + 142, w: 37 },
      { label: "Fn", x: left + 181, w: 24 },
      { label: "Berechnung", x: left + 207, w: 236 },
      { label: "Ergebnis", x: left + 445, w: width - 445, align: "right" },
    ];

    const drawTableHeader = () => {
      if (y > pdf.contentBottom() - 34) y = pdf.addPage();
      doc.roundedRect(left, y, width, 22, 4).fill(RLC_PDF_THEME.blueSoft);
      doc.fillColor(RLC_PDF_THEME.blueDark).font("Helvetica-Bold").fontSize(7.2);
      for (const c of cols) doc.text(c.label, c.x + 3, y + 7, { width: c.w - 6, align: c.align || "left", lineBreak: false });
      y += 26;
    };

    drawTableHeader();

    for (const position of positions) {
      const pos = s(position.pos || position.position || position.posNr);
      const result: any = evaluated.get(pos);
      if (!result) continue;

      const title = [pos, s(position.text || position.kurztext || position.title), s(position.unit || position.einheit)].filter(Boolean).join(" · ");
      if (y > pdf.contentBottom() - 60) {
        y = pdf.addPage();
        drawTableHeader();
      }
      doc.fillColor(RLC_PDF_THEME.text).font("Helvetica-Bold").fontSize(8.2).text(title || pos, left, y, { width });
      y += 14;

      for (const row of result.rows || []) {
        if (y > pdf.contentBottom() - 22) {
          y = pdf.addPage();
          drawTableHeader();
          doc.fillColor(RLC_PDF_THEME.text).font("Helvetica-Bold").fontSize(8).text(title || pos, left, y, { width });
          y += 14;
        }

        const address = s(row.address);
        const marker = s(row.marker);
        const label = s(row.label);
        const factorRaw = s(row.factorRaw);
        const factor = factorRaw === "999" ? "999" : (factorRaw ? String(row.factor ?? "") : "");
        const formulaNo = s(row.formulaNo);
        const expression = row.kind === "comment" ? s(row.text) : s(row.expression);
        const resultText = row.result === null || row.result === undefined ? "" : num(row.result, 3);
        const rowH = Math.max(17, doc.heightOfString(expression || " ", { width: cols[5].w - 6, lineGap: 1 }) + 7);

        if (row.kind === "comment") {
          doc.roundedRect(left, y, width, rowH, 2).fill("#F8FAFC");
        }
        doc.fillColor(RLC_PDF_THEME.text).font("Helvetica").fontSize(7.1);
        doc.text(address, cols[0].x + 3, y + 4, { width: cols[0].w - 6 });
        doc.text(marker || (row.kind === "comment" ? "*" : ""), cols[1].x + 3, y + 4, { width: cols[1].w - 6 });
        doc.text(label, cols[2].x + 3, y + 4, { width: cols[2].w - 6 });
        doc.text(factor, cols[3].x + 3, y + 4, { width: cols[3].w - 6, align: "right" });
        doc.text(formulaNo, cols[4].x + 3, y + 4, { width: cols[4].w - 6, align: "center" });
        doc.text(expression, cols[5].x + 3, y + 4, { width: cols[5].w - 6, lineGap: 1 });
        doc.text(resultText, cols[6].x + 3, y + 4, { width: cols[6].w - 6, align: "right" });
        doc.strokeColor(RLC_PDF_THEME.line).lineWidth(0.3).moveTo(left, y + rowH).lineTo(left + width, y + rowH).stroke();
        y += rowH;
      }

      const unit = s(position.unit || position.einheit);
      const totalText = `${unit ? unit + " · " : ""}${num(result.total, 3)}`;
      doc.fillColor(RLC_PDF_THEME.blueDark).font("Helvetica-Bold").fontSize(8.2);
      doc.text("Summe Position", left + 300, y + 5, { width: 120, align: "right" });
      doc.text(totalText, left + 425, y + 5, { width: width - 425, align: "right" });
      y += 22;
    }

    const imageMap = body.images && typeof body.images === "object" ? body.images : {};
    const imageEntries = Object.entries(imageMap).filter(([, value]) => /^data:image\//i.test(String(value || "")));
    if (imageEntries.length) {
      y = pdf.addPage();
      y = drawRlcSectionTitle(doc, "X31-Bildanlagen", y);
      for (const [name, value] of imageEntries) {
        if (y > pdf.contentBottom() - 220) y = pdf.addPage();
        doc.fillColor(RLC_PDF_THEME.text).font("Helvetica-Bold").fontSize(9).text(String(name), left, y, { width });
        y += 18;
        const match = String(value).match(/^data:image\/[^;]+;base64,(.+)$/i);
        if (match) {
          try {
            const buffer = Buffer.from(match[1], "base64");
            doc.image(buffer, left, y, { fit: [width, 190], align: "left", valign: "top" });
            y += 202;
          } catch {
            doc.font("Helvetica").fontSize(8).text("Bild konnte nicht gerendert werden.", left, y);
            y += 18;
          }
        }
      }
    }

    await pdf.finish();
    const buffer = fs.readFileSync(pdfPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("X-RLC-PDF-Core", "server");
    res.setHeader("X-RLC-PDF-Profile", "BVBS-Mengenermittlung");
    return res.send(buffer);
  } catch (error: any) {
    console.error("[pdf:bvbs-pruefausdruck]", error);
    return res.status(500).json({ ok: false, error: error?.message || "BVBS-Prüfausdruck konnte nicht erzeugt werden." });
  } finally {
    if (pdfPath && fs.existsSync(pdfPath)) {
      try { fs.unlinkSync(pdfPath); } catch {}
    }
  }
});


/* =========================================================
   RLC PDF CORE – AUFMASS
   POST /api/pdf/aufmass
========================================================= */
router.post("/aufmass", async (req: any, res) => {
  let pdfPath = "";

  try {
    const body = req.body || {};
    const company = await getCompany(req);

    const projectId = s(
      body.projectId ||
      body.projectKey ||
      body.project?.id ||
      body.project?.code ||
      "Projekt"
    );

    const projectName = s(
      body.projectName ||
      body.projectTitle ||
      body.project?.name ||
      projectId
    );

    const date = s(
      body.date ||
      body.options?.dateISO ||
      new Date().toISOString()
    ).slice(0, 10);

    const rows = Array.isArray(body.rows)
      ? body.rows
      : Array.isArray(body.lines)
        ? body.lines
        : Array.isArray(body.aufmass)
          ? body.aufmass
          : [];

    const fileName = safeFileName(
      `Aufmass_${projectId}_${date}`
    );

    pdfPath = path.join(
      "/tmp",
      `${fileName}_${Date.now()}.pdf`
    );

    const pdf = createRlcPdfDocument({
      pdfPath,
      title: "Aufmaßblatt",
      documentType: "Aufmaß",
      projectId,
      projectName,
      date,
      company,
      subject: `Aufmaß ${projectId}`,
    });

    const { doc } = pdf;
    let y = pdf.startCurrentPage();
    const contentWidth =
      doc.page.width - RLC_PDF_THEME.marginX * 2;
    const gap = 8;
    const fieldWidth = (contentWidth - gap * 3) / 4;

    drawRlcInfoField(doc, 34, y, fieldWidth, "Projekt", projectId);
    drawRlcInfoField(
      doc,
      34 + fieldWidth + gap,
      y,
      fieldWidth,
      "Bezeichnung",
      projectName
    );
    drawRlcInfoField(
      doc,
      34 + (fieldWidth + gap) * 2,
      y,
      fieldWidth,
      "Ort",
      s(body.ort || body.location || "")
    );
    drawRlcInfoField(
      doc,
      34 + (fieldWidth + gap) * 3,
      y,
      fieldWidth,
      "Zeilen",
      String(rows.length)
    );

    y += 64;
    y = drawRlcSectionTitle(doc, "Aufmaßzeilen", y);

    const columns = [
      { label: "Kreis", x: 34, width: 34 },
      { label: "Blatt", x: 72, width: 38 },
      { label: "Nr.", x: 114, width: 32 },
      { label: "REB", x: 150, width: 34 },
      { label: "Pos.", x: 188, width: 54 },
      { label: "Bezeichnung / Rechenansatz", x: 246, width: 190 },
      { label: "Menge", x: 440, width: 58, align: "right" },
      { label: "ME", x: 502, width: 59 },
    ];

    function drawHeader() {
      if (y > pdf.contentBottom() - 44) {
        y = pdf.addPage();
      }

      doc
        .roundedRect(34, y, contentWidth, 24, 4)
        .fill(RLC_PDF_THEME.sectionFill);

      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(RLC_PDF_THEME.primary);

      for (const col of columns) {
        doc.text(col.label, col.x, y + 8, {
          width: col.width,
          align: col.align || "left",
        });
      }

      y += 30;
    }

    drawHeader();

    for (const row of rows) {
      const description = [
        s(row.kurztext || row.bezeichnung || row.text),
        s(row.langtext),
        s(row.rechenansatz || row.formula || row.formel),
      ]
        .filter(Boolean)
        .join("\n");

      const rowHeight = Math.max(
        27,
        doc.heightOfString(description || "—", {
          width: 184,
          lineGap: 1,
        }) + 12
      );

      if (y + rowHeight > pdf.contentBottom()) {
        y = pdf.addPage();
        drawHeader();
      }

      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(RLC_PDF_THEME.text);

      const values = [
        s(row.kreis),
        s(row.blatt),
        s(row.nr || row.nummer),
        s(row.reb),
        s(row.posNr || row.position || row.pos),
        description || "—",
        rlcGermanNumber(
          row.ergebnis ??
          row.result ??
          row.menge
        ),
        s(row.einheit || row.unit),
      ];

      values.forEach((value, index) => {
        const col = columns[index];
        doc.text(value || "—", col.x, y + 5, {
          width: col.width,
          align: col.align || "left",
          lineGap: 1,
        });
      });

      doc
        .strokeColor(RLC_PDF_THEME.border)
        .lineWidth(0.35)
        .moveTo(34, y + rowHeight)
        .lineTo(561, y + rowHeight)
        .stroke();

      y += rowHeight + 4;
    }

    await pdf.finish();

    const buffer = fs.readFileSync(pdfPath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}.pdf"`
    );
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  } catch (error: any) {
    console.error("[pdf:aufmass]", error);
    res.status(500).json({
      ok: false,
      error: error?.message || "Aufmaß-PDF konnte nicht erzeugt werden.",
    });
  } finally {
    if (pdfPath && fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch {}
    }
  }
});



/* RLC_MOBILE_PDF_CORE_PHASE2
   Mobile -> /api/pdf/mobile-render -> Document Delivery -> rlcPdfCore.ts
*/
router.post("/mobile-render", async (req: any, res) => {
  try {
    const body = req.body || {};
    const documentType = String(body.documentType || "").trim().toUpperCase();
    const projectFsKey = String(body.projectFsKey || body.projectId || "").trim();
    const rawPayload: any = body.payload ?? {};
    const company = await loadRlcPdfCompanyFromRequest(req);

    const row =
      rawPayload?.row && typeof rawPayload.row === "object"
        ? rawPayload.row
        : {};

    const rowPayload =
      row?.payload && typeof row.payload === "object"
        ? row.payload
        : {};

    const nestedPayload =
      rawPayload?.payload && typeof rawPayload.payload === "object"
        ? rawPayload.payload
        : {};

    const asArray = (value: any): any[] => {
      if (Array.isArray(value)) return value;
      if (value === undefined || value === null || value === "") return [];
      return [value];
    };

    const normalizeAsset = (value: any): any | null => {
      if (!value) return null;

      if (typeof value === "string") {
        const source = value.trim();
        if (!source) return null;

        return {
          url: source,
          path: source,
          name: source.split("/").pop() || "Foto",
        };
      }

      if (typeof value !== "object") return null;

      const source =
        value.url ||
        value.uri ||
        value.path ||
        value.filePath ||
        value.downloadUrl ||
        value.publicUrl ||
        value.storageUrl ||
        "";

      const contentBase64 =
        value.contentBase64 ||
        value.base64 ||
        value.dataBase64 ||
        "";

      if (!source && !contentBase64) return null;

      return {
        ...value,
        url: value.url || value.uri || value.publicUrl || source,
        path: value.path || value.filePath || source,
        contentBase64,
        name:
          value.name ||
          value.fileName ||
          value.filename ||
          String(source).split("/").pop() ||
          "Foto",
        mimeType:
          value.mimeType ||
          value.type ||
          value.contentType ||
          "",
      };
    };

    const assets = [
      ...asArray(rawPayload?.photos),
      ...asArray(rawPayload?.files),
      ...asArray(rawPayload?.attachments),
      ...asArray(rawPayload?.images),
      ...asArray(rawPayload?.photo),
      ...asArray(rawPayload?.image),
      ...asArray(nestedPayload?.photos),
      ...asArray(nestedPayload?.files),
      ...asArray(nestedPayload?.attachments),
      ...asArray(nestedPayload?.images),
      ...asArray(row?.photos),
      ...asArray(row?.files),
      ...asArray(row?.attachments),
      ...asArray(rowPayload?.photos),
      ...asArray(rowPayload?.files),
      ...asArray(rowPayload?.attachments),
      ...asArray(rowPayload?.images),
    ]
      .map(normalizeAsset)
      .filter(Boolean);

    const reports = [
      ...asArray(rawPayload?.reports),
      ...asArray(rawPayload?.tagesberichte),
      ...asArray(rawPayload?.entries),
      ...asArray(rawPayload?.rows),
      ...asArray(nestedPayload?.reports),
      ...asArray(nestedPayload?.tagesberichte),
      ...asArray(nestedPayload?.entries),
    ].filter(
      (entry: any) =>
        entry &&
        typeof entry === "object"
    );

    const payload: any = {
      ...rawPayload,
      company,

      projectId:
        rawPayload?.projectId ||
        rawPayload?.projectCode ||
        row?.projectId ||
        row?.projectCode ||
        projectFsKey,

      projectName:
        rawPayload?.projectName ||
        rawPayload?.projectTitle ||
        row?.projectName ||
        row?.projectTitle ||
        projectFsKey,

      photos: assets,
      files: assets,
      attachments: assets,
    };

    if (documentType === "BAUTAGEBUCH") {
      payload.reports =
        reports.length > 0
          ? reports
          : [rawPayload].filter(
              (entry: any) =>
                entry &&
                typeof entry === "object" &&
                (
                  entry.date ||
                  entry.datum ||
                  entry.lines ||
                  entry.entries ||
                  entry.works
                )
            );
    }

    if (!projectFsKey) {
      return res.status(400).json({ error: "Projekt fehlt" });
    }

    const moduleByType: Record<string, string> = {
      REGIE: "regie",
      LIEFERSCHEIN: "lieferschein",
      FOTOS: "fotos",
      TAGESBERICHT: "tagesbericht",
      BAUTAGEBUCH: "bautagebuch",
      ARBEITSZEIT: "arbeitszeit",
      ANGEBOT: "angebot",
      MENGENERMITTLUNG: "mengenermittlung",
      ABSCHLAGSRECHNUNG: "abschlagsrechnung",
      RECHNUNG: "rechnung",
      SCHLUSSRECHNUNG: "rechnung",
    };

    const titleByType: Record<string, string> = {
      REGIE: "Regiebericht",
      LIEFERSCHEIN: "Lieferschein",
      FOTOS: "Fotos / Notizen",
      TAGESBERICHT: "Tagesbericht",
      BAUTAGEBUCH: "Bautagebuch",
      ARBEITSZEIT: "Arbeitszeitnachweis",
      ANGEBOT: "Angebot",
      MENGENERMITTLUNG: "Mengenermittlung",
      ABSCHLAGSRECHNUNG: "Abschlagsrechnung",
      RECHNUNG: "Rechnung",
      SCHLUSSRECHNUNG: "Schlussrechnung",
    };

    const moduleKey = moduleByType[documentType];
    if (!moduleKey) {
      return res.status(400).json({ error: `Nicht unterstützter Dokumenttyp: ${documentType || "leer"}` });
    }

    const projectName = String(
      payload?.projectTitle ||
      payload?.projectName ||
      payload?.project?.name ||
      payload?.project?.title ||
      projectFsKey
    ).trim();

    const documentId = String(
      payload?.id ||
      payload?.documentId ||
      payload?.number ||
      payload?.nr ||
      payload?.reportNo ||
      ""
    ).trim();

    const date = String(
      payload?.date ||
      payload?.datum ||
      payload?.createdAt ||
      new Date().toISOString().slice(0, 10)
    ).slice(0, 10);

    const result = await buildDeliveryPackage({
      projectId: projectFsKey,
      projectName,
      moduleKey,
      documentId,
      title: titleByType[documentType] || documentType,
      date,
      data: payload,
      formats: ["pdf"],
      createdBy: String(req?.auth?.email || req?.auth?.userId || req?.user?.email || req?.user?.id || "mobile"),
    });

    const pdf = result.files.find((file: any) => file.mime === "application/pdf" || String(file.name).toLowerCase().endsWith(".pdf"));
    if (!pdf || !fs.existsSync(pdf.filePath)) {
      return res.status(500).json({ error: "PDF wurde nicht erzeugt" });
    }

    const requestedName = String(body.fileName || pdf.name || `${titleByType[documentType] || documentType}.pdf`)
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/\.pdf$/i, "") + ".pdf";


    /*
     * Buchhaltungsdokumente werden zentral im DMS registriert.
     * Rechnung und Schlussrechnung werden zusätzlich mit Invoice verknüpft.
     */
    if (
      documentType === "RECHNUNG" ||
      documentType === "SCHLUSSRECHNUNG" ||
      documentType === "ABSCHLAGSRECHNUNG"
    ) {
      try {
        const sourceNumber = String(
          rawPayload?.invoiceNumber ||
          rawPayload?.rechnungNr ||
          rawPayload?.number ||
          rawPayload?.nr ||
          row?.invoiceNumber ||
          row?.rechnungNr ||
          row?.number ||
          row?.nr ||
          documentId ||
          ""
        ).trim();

        await archiveProjectFileVersion({
          projectIdOrCode: projectFsKey,
          filename: requestedName,
          kind: "PDF",
          localPath: pdf.filePath,
          uploadedBy: String(
            req?.auth?.email ||
            req?.auth?.userId ||
            req?.auth?.sub ||
            ""
          ).trim() || null,
          meta: {
            module: "BUCHHALTUNG",
            source: "pdf-core",
            documentType,
            sourceNumber: sourceNumber || null,
            sourceId: documentId || null
          }
        });

        const project = await prisma.project.findFirst({
          where: {
            companyId: String(req?.auth?.companyId || req?.auth?.company || ""),
            OR: [
              { id: String(req?.resolvedPdfProjectId || projectFsKey) },
              { code: projectFsKey }
            ]
          },
          select: {
            id: true
          }
        });

        if (
          project &&
          sourceNumber &&
          (
            documentType === "RECHNUNG" ||
            documentType === "SCHLUSSRECHNUNG"
          )
        ) {
          const accounting =
            await prisma.accountingRoot.findUnique({
              where: {
                projectId: project.id
              },
              select: {
                id: true
              }
            });

          if (accounting) {
            const invoice =
              await prisma.invoice.findFirst({
                where: {
                  accountingId: accounting.id,
                  number: sourceNumber
                },
                select: {
                  id: true
                }
              });

            const dmsDocument =
              await prisma.document.findFirst({
                where: {
                  projectId: project.id,
                  name: requestedName,
                  deletedAt: null
                },
                orderBy: {
                  createdAt: "asc"
                },
                select: {
                  id: true
                }
              });

            if (invoice && dmsDocument) {
              await prisma.invoice.update({
                where: {
                  id: invoice.id
                },
                data: {
                  pdfDocId: dmsDocument.id
                }
              });
            }
          }
        }
      } catch (dmsError) {
        console.error(
          "[pdf:mobile-render:dms]",
          dmsError
        );
      }
    }

    const buffer = fs.readFileSync(pdf.filePath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${requestedName}"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("X-RLC-PDF-Core", "server");
    return res.send(buffer);
  } catch (error: any) {
    console.error("[pdf:mobile-render]", error?.stack || error?.message || error);
    return res.status(500).json({ error: error?.message || "Mobile PDF konnte nicht erzeugt werden" });
  }
});

export default router;
