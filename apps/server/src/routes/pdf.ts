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

const router = Router();

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

function createPdf(res: any, filename: string, build: (doc: any) => void) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    bufferPages: true,
    autoFirstPage: true,
  });

  const chunks: Buffer[] = [];

  doc.on("data", (c: Buffer) => chunks.push(c));
  doc.on("end", () => {
    const pdf = Buffer.concat(chunks);
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

/* ======================
   ANGEBOT PROFESSIONELL
   POST /api/pdf/angebot
====================== */

router.post("/angebot", async (req: any, res) => {
  try {
    const body = req.body || {};
    const company = await getCompany(req);

    const project = body.project || {};
    const options = body.options || {};
    const rows = cleanOfferRows(Array.isArray(body.rows) ? body.rows : []);
    const totals = body.totals || {};

    const projectCode = s(project.code || project.number || project.id || "Projekt");
    const projectName = s(project.name || "");
    const clientName = s(project.client || project.auftraggeber || "Auftraggeber");
    const location = s(project.location || options.city || "");
    const date = options.dateISO
      ? new Date(options.dateISO).toLocaleDateString("de-DE")
      : todayDE();

    const angebotNr = s(body.offerNo || body.angebotNr || offerNo(projectCode));

    createPdf(res, `Angebot_${projectCode}`, (doc) => {
      drawCompanyHeader(doc, company);

      drawMetaBox(doc, {
        "Angebot Nr.": angebotNr,
        "Datum": date,
        "Projekt": projectCode,
        "Bearbeiter": s((req as any)?.auth?.role || "RLC"),
      });

      drawRecipientBlock(doc, company, {
        name: clientName,
        address: project.clientAddress || project.address || "",
        city: project.clientCity || "",
      });

      doc.font("Helvetica-Bold").fontSize(23).fillColor("#0F172A").text("Angebot", 56, 246);
      doc.font("Helvetica").fontSize(10).fillColor("#334155");
      doc.text(`${projectCode}${projectName ? " · " + projectName : ""}`, 56, 278, { width: 484 });
      if (location) doc.text(`Ausführungsort: ${location}`, 56, 293, { width: 484 });
      doc.y = location ? 318 : 304;
      doc.fillColor("#000000");

      const cols = [
        { label: "PosNr", x: 56, w: 58 },
        { label: "Leistungsbeschreibung", x: 120, w: 215 },
        { label: "ME", x: 340, w: 32 },
        { label: "Menge", x: 378, w: 52, align: "right" },
        { label: "EP", x: 436, w: 48, align: "right" },
        { label: "Gesamt", x: 490, w: 50, align: "right" },
      ];

      tableHeader(doc, cols);

      for (const r of rows) {
        const qty = n(r.menge ?? r.qty);
        const ep = n(r.preis ?? r.ep);
        const total = n(r.zeilen ?? r.total ?? qty * ep);

        const text = [
          s(r.kurztext || r.text || r.title),
          s(r.langtext || "") ? `\n${s(r.langtext)}` : "",
        ].join("");

        rowLine(doc, cols, [
          r.posNr || r.lvPos || "",
          text,
          r.einheit || r.unit || "",
          num(qty, 3),
          money(ep),
          money(total),
        ]);
      }

      doc.moveDown(1.0);

      const netto = n(totals.netto);
      const mwst = n(totals.mwst ?? options.mwst ?? 19);
      const steuer = n(totals.steuer ?? netto * mwst / 100);
      const brutto = n(totals.brutto ?? netto + steuer);

      // Professioneller Summenblock
      if (doc.y > 625) doc.addPage();

      const sumX = 335;
      const sumY = doc.y + 4;
      const sumW = 205;
      const rowH = 20;

      doc.save();
      doc.roundedRect(sumX, sumY, sumW, rowH * 3 + 14, 6).fill("#F8FAFC");
      doc.strokeColor("#D8E0EA").lineWidth(0.6);
      doc.roundedRect(sumX, sumY, sumW, rowH * 3 + 14, 6).stroke();

      // Netto
      doc.font("Helvetica").fontSize(9).fillColor("#475569");
      doc.text("Netto", sumX + 12, sumY + 12, { width: 80 });
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#0F172A");
      doc.text(money(netto), sumX + 95, sumY + 12, { width: 95, align: "right" });

      // MwSt
      doc.font("Helvetica").fontSize(9).fillColor("#475569");
      doc.text(`MwSt (${mwst}%)`, sumX + 12, sumY + 12 + rowH, { width: 80 });
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#0F172A");
      doc.text(money(steuer), sumX + 95, sumY + 12 + rowH, { width: 95, align: "right" });

      // Trennlinie
      doc.strokeColor("#CBD5E1").lineWidth(0.5);
      doc.moveTo(sumX + 12, sumY + 12 + rowH * 2 - 4).lineTo(sumX + sumW - 12, sumY + 12 + rowH * 2 - 4).stroke();

      // Brutto
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0F172A");
      doc.text("Brutto", sumX + 12, sumY + 12 + rowH * 2, { width: 80 });
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0F172A");
      doc.text(money(brutto), sumX + 95, sumY + 12 + rowH * 2, { width: 95, align: "right" });

      doc.restore();

      doc.y = sumY + rowH * 3 + 34;

      // Zahlungsbedingungen sauber links unterhalb
      doc.font("Helvetica").fontSize(9).fillColor("#334155");
      doc.text(
        s(options.payment || "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage."),
        56,
        doc.y,
        { width: 300 }
      );

      if (doc.y > 675) doc.addPage();

      const sigY = Math.max(doc.y + 28, 700);
      doc.strokeColor("#CBD5E1").moveTo(56, sigY).lineTo(236, sigY).stroke();
      doc.strokeColor("#CBD5E1").moveTo(340, sigY).lineTo(520, sigY).stroke();

      doc.font("Helvetica").fontSize(8).fillColor("#64748B");
      doc.text("Ort, Datum / Auftragnehmer", 56, sigY + 6, { width: 180, align: "center" });
      doc.text("Ort, Datum / Auftraggeber", 340, sigY + 6, { width: 180, align: "center" });

      if (options.showWatermark) {
        doc.fontSize(8).fillColor("#94A3B8").text("Powered by OpenAI · RLC Bausoftware", 40, 780, {
          width: 515,
          align: "center",
        });
      }
    });
  } catch (e: any) {
    console.error("[pdf:angebot]", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || "PDF Angebot error" });
  }
});

/* ======================
   GENERISCHE KALKULATION PDFS
====================== */

function genericKalkPdf(title: string) {
  return async (req: any, res: any) => {
    try {
      const company = await getCompany(req);
      const body = req.body || {};
      const project = body.project || {};
      const rows = Array.isArray(body.rows)
        ? body.rows
        : Array.isArray(body.items)
        ? body.items
        : [];

      const projectCode = s(project.code || project.number || body.projectKey || "Projekt");

      createPdf(res, `${title}_${projectCode}`, (doc) => {
        drawCompanyHeader(doc, company);

        doc.font("Helvetica-Bold").fontSize(21).fillColor("#0F172A").text(title);
        doc.moveDown(0.25);
        doc.font("Helvetica").fontSize(10).fillColor("#334155");
        doc.text(`Projekt: ${projectCode}${project.name ? " · " + project.name : ""}`);
        doc.text(`Datum: ${todayDE()}`);
        doc.moveDown(1);

        const cols = [
          { label: "Pos", x: 40, w: 65 },
          { label: "Text", x: 110, w: 260 },
          { label: "ME", x: 375, w: 35 },
          { label: "Menge", x: 415, w: 60, align: "right" },
          { label: "Betrag", x: 480, w: 75, align: "right" },
        ];

        tableHeader(doc, cols);

        let sum = 0;

        for (const r of rows) {
          const qty = n(r.menge ?? r.qty);
          const ep = n(r.preis ?? r.ep);
          const total = n(r.total ?? r.gesamt ?? r.zeilen ?? qty * ep);
          sum += total;

          rowLine(doc, cols, [
            r.posNr || r.lvPos || r.pos || "",
            r.kurztext || r.text || r.title || r.bezeichnung || "",
            r.einheit || r.unit || "",
            qty ? num(qty, 3) : "",
            money(total),
          ]);
        }

        doc.moveDown(0.8);
        doc.font("Helvetica-Bold").fontSize(12);
        doc.text(`Gesamt: ${money(body?.totals?.brutto ?? body?.totals?.netto ?? sum)}`, 335, doc.y, {
          width: 220,
          align: "right",
        });
      });
    } catch (e: any) {
      console.error(`[pdf:${title}]`, e?.message || e);
      res.status(500).json({ ok: false, error: e?.message || `PDF ${title} error` });
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



async function professionalNachtraegePdf(req: any, res: any) {
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
    project.number ||
    project.projectKey ||
    body.projectKey ||
    "Projekt"
  );

  const projectName = s(project.name || project.projectName || "");
  const place = s(project.location || project.place || project.ort || body.place || "");
  const clientName = s(project.client || project.auftraggeber || body.clientName || "Auftraggeber");
  const clientAddress = s(project.clientAddress || project.address || body.clientAddress || "");

  const mwst = n(body.mwst ?? body.options?.mwst ?? 19);
  const date = body.options?.dateISO
    ? new Date(body.options.dateISO).toLocaleDateString("de-DE")
    : todayDE();

  createPdf(res, `Nachtraege_${projectCode}`, (doc) => {
    drawCompanyHeader(doc, company);

    drawMetaBox(doc, {
      "Projekt": projectCode,
      "Datum": date,
      "Ort": place || "—",
      "MwSt": `${mwst} %`,
    });

    drawRecipientBlock(doc, company, {
      name: clientName,
      address: clientAddress,
      city: "",
    });

    doc.font("Helvetica-Bold").fontSize(23).fillColor("#0F172A");
    doc.text("Nachträge", 56, 246);

    doc.font("Helvetica").fontSize(10).fillColor("#334155");
    doc.text(`${projectCode}${projectName ? " · " + projectName : ""}`, 56, 278, {
      width: 484,
    });

    if (place) doc.text(`Baustelle / Ort: ${place}`, 56, 293, { width: 484 });

    doc.y = place ? 320 : 306;
    doc.fillColor("#000000");

    const cols = [
      { label: "PosNr", x: 56, w: 55 },
      { label: "Nachtragsbeschreibung", x: 118, w: 220 },
      { label: "ME", x: 345, w: 30 },
      { label: "Menge", x: 380, w: 48, align: "right" },
      { label: "EP", x: 433, w: 48, align: "right" },
      { label: "Status", x: 486, w: 54 },
    ];

    tableHeader(doc, cols);

    let netto = 0;

    for (const r of rows) {
      const qty = n(r.mengeDelta ?? r.qty ?? r.menge);
      const ep = n(r.preis ?? r.ep);
      const total = n(r.total ?? r.gesamt ?? r.zeilen ?? qty * ep);
      netto += total;

      const kurz = s(r.kurztext || r.text || r.title || r.bezeichnung);
      const lang = s(r.langtext || r.description || "");
      const begr = s(r.begruendung || r.note || r.reason || "");

      const beschreibung = [
        kurz,
        lang ? `\n${lang}` : "",
        begr ? `\nBegründung: ${begr}` : "",
        `\nNetto: ${money(total)}`,
      ].join("");

      rowLine(doc, cols, [
        r.posNr || r.lvPos || r.pos || "",
        beschreibung,
        r.einheit || r.unit || "",
        qty ? num(qty, 3) : "",
        ep ? money(ep) : "",
        r.status || "Entwurf",
      ]);
    }

    if (doc.y > 625) doc.addPage();

    const steuer = netto * mwst / 100;
    const brutto = netto + steuer;

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
    doc.text(money(netto), sumX + 95, sumY + 12, { width: 95, align: "right" });

    doc.font("Helvetica").fontSize(9).fillColor("#475569");
    doc.text(`MwSt (${mwst}%)`, sumX + 12, sumY + 12 + rowH, { width: 80 });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#0F172A");
    doc.text(money(steuer), sumX + 95, sumY + 12 + rowH, { width: 95, align: "right" });

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

    doc.font("Helvetica").fontSize(9).fillColor("#334155");
    doc.text(
      "Die aufgeführten Nachträge verstehen sich vorbehaltlich Prüfung und Freigabe durch den Auftraggeber.",
      56,
      doc.y,
      { width: 484 }
    );
  });
}



router.post("/nachtraege", professionalNachtraegePdf);
router.post("/kalkulation", genericKalkPdf("Kalkulation"));
router.post("/mengen", genericKalkPdf("Mengenermittlung"));
router.post("/rechnung", genericKalkPdf("Rechnung"));
router.post("/regiebericht", genericKalkPdf("Regiebericht"));
router.post("/lieferschein", genericKalkPdf("Lieferschein"));


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
