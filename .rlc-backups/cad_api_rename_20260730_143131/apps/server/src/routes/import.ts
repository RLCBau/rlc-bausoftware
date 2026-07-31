// apps/server/src/routes/import.ts
// @ts-nocheck   // disattiva i controlli TS in questo file

import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import unzipper from "unzipper";

import { prisma } from "../lib/prisma";
import { slugifyLocal } from "../lib/slugifyLocal";

const router = express.Router();

// ---- libs extra per il parsing dei file ----
const DxfParser = require("dxf-parser");
const { parseStringPromise } = require("xml2js");
const { parse: csvParse } = require("csv-parse/sync");

// ✅ AGGIUNTO: PDF text extraction
const pdfParse = require("pdf-parse");

// === Upload (in RAM) ===
const upload = multer({ storage: multer.memoryStorage() });

// === Root per salvare project.json opzionale ===
const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");
fs.mkdirSync(PROJECTS_ROOT, { recursive: true });

/* ---------------------------------------------------
 * Helpers
 * --------------------------------------------------- */

function safeFsKey(k: string) {
  return String(k || "")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);
}

function randSuffix(len = 6) {
  return Math.random().toString(36).slice(2, 2 + len);
}

function isP2002Slug(e: any) {
  const isP2002 = e?.code === "P2002";
  const targets = e?.meta?.target || [];
  const slugConflict =
    isP2002 &&
    (Array.isArray(targets)
      ? targets.includes("slug")
      : String(targets).includes("slug"));
  return !!slugConflict;
}

/* ---------------------------------------------------
 * Helper: company (id + code) – logica come in projects.ts
 * --------------------------------------------------- */
async function ensureCompany(req: any): Promise<{ id: string; code: string }> {
  const auth = (req as any)?.auth;

  // 1) da auth
  if (auth && typeof auth.company === "string") {
    const found = await prisma.company.findUnique({
      where: { id: auth.company },
      select: { id: true, code: true },
    });
    if (found) return { id: found.id, code: String(found.code || "COMPANY") };
  }

  // 2) da ENV
  if (process.env.DEV_COMPANY_ID) {
    const found = await prisma.company.findUnique({
      where: { id: process.env.DEV_COMPANY_ID },
      select: { id: true, code: true },
    });
    if (found) return { id: found.id, code: String(found.code || "COMPANY") };
  }

  // 3) prima company se esiste
  const first = await prisma.company.findFirst({
    select: { id: true, code: true },
  });
  if (first) return { id: first.id, code: String(first.code || "COMPANY") };

  // 4) se non c’è niente, crea company standard
  const created = await prisma.company.create({
    data: {
      name: "Standard Firma",
      code: "STANDARD",
    },
    select: { id: true, code: true },
  });

  return { id: created.id, code: String(created.code || "STANDARD") };
}

/* ---------------------------------------------------
 * Helper: salva project.json in folder progetto (FS-key = project.code)
 * --------------------------------------------------- */
function saveProjectJsonBackup(projectCode: string, json: any) {
  try {
    const dir = path.join(PROJECTS_ROOT, safeFsKey(projectCode));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "project.json"),
      JSON.stringify(json, null, 2),
      "utf8"
    );
  } catch (e) {
    console.warn("Konnte project.json nicht speichern:", e);
  }
}

/* ---------------------------------------------------
 * Helper: crea / aggiorna progetto partendo da JSON
 * --------------------------------------------------- */
async function upsertProjectFromJson(req: any, json: any) {
  const company = await ensureCompany(req);
  const companyId = company.id;
  const companyCode = String(company.code || "COMPANY");

  // accetto sia struttura { project: { ... } } che flat
  const src = json?.project ?? json ?? {};

  const code: string = (
    src.code ||
    src.projektnummer ||
    src.projectNumber ||
    "BA-UNBEKANNT"
  )
    .toString()
    .trim();

  const name: string = (
    src.name ||
    src.projectName ||
    src.projektname ||
    "Neues Projekt"
  )
    .toString()
    .trim();

  const client: string | null =
    src.client || src.kunde || src.auftraggeber
      ? String(src.client || src.kunde || src.auftraggeber).trim()
      : null;

  // nel DB usiamo "place" (Ort)
  const place: string | null =
    src.place || src.city || src.ort
      ? String(src.place || src.city || src.ort).trim()
      : null;

  /**
   * ✅ SLUG ROBUSTO
   * - il tuo schema ha `slug @unique` (globale)
   * - quindi lo slug deve essere unico ANCHE tra company diverse
   * - strategia: base = companyCode + code
   * - retry con suffisso se P2002 su slug
   */
  const baseSlug = slugifyLocal(`${companyCode}-${code}`);
  let slug = baseSlug;

  // upsert usando la unique [code, companyId]
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const project = await prisma.project.upsert({
        where: {
          // composite unique nel modello Prisma: @@unique([code, companyId], name: "code_companyId")
          code_companyId: {
            code,
            companyId,
          },
        },
        update: {
          name,
          client,
          place,
          slug,
          updatedAt: new Date(),
        },
        create: {
          code,
          name,
          client,
          place,
          slug,
          companyId,
        },
        select: {
          id: true,
          code: true,
          name: true,
          client: true,
          place: true,
          slug: true,
          companyId: true,
          createdAt: true,
        },
      });

      // backup json su FS-key = project.code
      saveProjectJsonBackup(project.code, json);

      return project;
    } catch (e: any) {
      if (!isP2002Slug(e)) throw e;

      // retry slug più unico
      slug = `${baseSlug}-${randSuffix(6)}`;
      continue;
    }
  }

  throw new Error(
    "Import failed: could not generate unique slug (slug collision)"
  );
}

/* ===================================================
 *  POST /api/import/project-json
 * =================================================== */
router.post("/project-json", upload.single("file"), async (req, res) => {
  try {
    const file = (req as any).file;
    if (!file) {
      return res
        .status(400)
        .json({ ok: false, error: "Keine Datei empfangen" });
    }

    const json = JSON.parse(file.buffer.toString("utf8"));
    const project = await upsertProjectFromJson(req, json);

    return res.json({ ok: true, project });
  } catch (e: any) {
    console.error("POST /api/import/project-json error:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Fehler beim Import (project.json)",
    });
  }
});

/* ===================================================
 *  POST /api/import/project-zip
 * =================================================== */
router.post("/project-zip", upload.single("file"), async (req, res) => {
  try {
    const file = (req as any).file;
    if (!file) {
      return res
        .status(400)
        .json({ ok: false, error: "Keine Datei empfangen" });
    }

    // ZIP im Speicher öffnen
    const dir = await unzipper.Open.buffer(file.buffer);
    const entry = dir.files.find((f: any) =>
      f.path.toLowerCase().endsWith("project.json")
    );

    if (!entry) {
      return res.status(400).json({
        ok: false,
        error: "In ZIP wurde keine project.json gefunden",
      });
    }

    const content = await entry.buffer();
    const json = JSON.parse(content.toString("utf8"));
    const project = await upsertProjectFromJson(req, json);

    return res.json({ ok: true, project });
  } catch (e: any) {
    console.error("POST /api/import/project-zip error:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Fehler beim Import (ZIP)",
    });
  }
});

/* ===================================================
 * Helper per DXF → Overlay + Items
 * =================================================== */
function lengthSegment(a: any, b: any) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function lengthPolyline(pts: any[]) {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    sum += lengthSegment(pts[i - 1], pts[i]);
  }
  return sum;
}

function buildDxfOverlayAndItems(dxf: any, scale: number) {
  const entities = dxf?.entities || [];
  const lines: any[] = [];
  const lwpolylines: any[] = [];
  const circles: any[] = [];
  const arcs: any[] = [];
  const layerMap = new Map<string, number>();

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  function upd(x: number, y: number) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const items: any[] = [];

  for (const e of entities) {
    const layer = e.layer || "0";
    layerMap.set(layer, (layerMap.get(layer) || 0) + 1);

    if (e.type === "LINE") {
      const a = { x: e.start.x, y: e.start.y };
      const b = { x: e.end.x, y: e.end.y };
      upd(a.x, a.y);
      upd(b.x, b.y);
      lines.push({ a, b, layer });
      const len = lengthSegment(a, b) * scale;
      items.push({
        pos: "",
        type: "LINE",
        descr: `Linie (${layer})`,
        unit: "m",
        qty: Number(len.toFixed(3)),
        layer,
        source: "dxf",
      });
    } else if (e.type === "LWPOLYLINE" || e.type === "POLYLINE") {
      const pts = (e.vertices || e.points || []).map((v: any) => ({
        x: v.x,
        y: v.y,
      }));
      pts.forEach((p: any) => upd(p.x, p.y));
      lwpolylines.push({
        pts,
        closed: e.shape || e.closed,
        layer,
      });
      const len = lengthPolyline(pts) * scale;
      items.push({
        pos: "",
        type: "POLYLINE",
        descr: `Polyline (${layer})`,
        unit: "m",
        qty: Number(len.toFixed(3)),
        layer,
        source: "dxf",
      });
    } else if (e.type === "CIRCLE") {
      const c = { x: e.center.x, y: e.center.y };
      upd(c.x - e.radius, c.y - e.radius);
      upd(c.x + e.radius, c.y + e.radius);
      circles.push({ c, r: e.radius, layer });
      const len = 2 * Math.PI * e.radius * scale;
      items.push({
        pos: "",
        type: "CIRCLE",
        descr: `Kreis (${layer})`,
        unit: "m",
        qty: Number(len.toFixed(3)),
        layer,
        source: "dxf",
      });
    } else if (e.type === "ARC") {
      const c = { x: e.center.x, y: e.center.y };
      upd(c.x - e.radius, c.y - e.radius);
      upd(c.x + e.radius, c.y + e.radius);
      arcs.push({
        c,
        r: e.radius,
        start: e.startAngle,
        end: e.endAngle,
        layer,
      });
      const angleRad = ((e.endAngle - e.startAngle) * Math.PI) / 180;
      const len = angleRad * e.radius * scale;
      items.push({
        pos: "",
        type: "ARC",
        descr: `Bogen (${layer})`,
        unit: "m",
        qty: Number(len.toFixed(3)),
        layer,
        source: "dxf",
      });
    }
  }

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }

  const layers = Array.from(layerMap.entries()).map(([name, count]) => ({
    name,
    count,
  }));

  const overlay = {
    bbox: {
      min: { x: minX, y: minY },
      max: { x: maxX, y: maxY },
    },
    lines,
    lwpolylines,
    circles,
    arcs,
    layers,
    meta: {
      userScale: scale,
    },
  };

  return { overlay, items };
}

/* ===================================================
 *  Helper: LandXML → Items (molto semplice)
 * =================================================== */
async function parseLandXml(buffer: Buffer, scale: number) {
  const xml = buffer.toString("utf8");
  const root = await parseStringPromise(xml, { explicitArray: false });

  const landXml = root?.LandXML || root;
  const surfaces = landXml?.Surfaces?.Surface;
  const pts = landXml?.CgPoints?.CgPoint;

  const items: any[] = [];

  if (surfaces) {
    const arr = Array.isArray(surfaces) ? surfaces : [surfaces];
    arr.forEach((s: any, i: number) => {
      items.push({
        pos: "",
        type: "SURFACE",
        descr: `Fläche ${s.$?.name || `#${i + 1}`}`,
        unit: "m²",
        qty: null,
        layer: s.$?.desc || "",
        source: "landxml",
      });
    });
  }

  if (pts) {
    const arr = Array.isArray(pts) ? pts : [pts];
    items.push({
      pos: "",
      type: "POINTS",
      descr: `CgPoints`,
      unit: "Stk.",
      qty: arr.length,
      layer: "",
      source: "landxml",
    });
  }

  return { items };
}

/* ===================================================
 *  Helper: CSV → Items
 * =================================================== */
function parseCsv(buffer: Buffer) {
  const text = buffer.toString("utf8");
  const records = csvParse(text, {
    columns: true,
    skip_empty_lines: true,
  });

  const items = records.map((r: any, i: number) => ({
    pos: r.pos || r.Pos || String(i + 1),
    type: r.type || r.Typ || "CSV",
    descr: r.descr || r.Beschreibung || "",
    unit: r.unit || r.Einheit || "",
    qty: r.qty ? Number(r.qty) : r.Menge ? Number(r.Menge) : null,
    layer: r.layer || "",
    source: "csv",
  }));

  return { items };
}

/* ===================================================
 *  Helper: GSI → Items sehr basic
 * =================================================== */
function parseGsi(buffer: Buffer) {
  const text = buffer.toString("utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const items = lines.map((l, i) => ({
    pos: "",
    type: "GSI",
    descr: l.trim(),
    unit: "",
    qty: null,
    layer: "",
    source: "gsi",
  }));

  return { items };
}

/* ===================================================
 * ✅ Helper: PDF → Tabelle via pdf-parse (rudimentär)
 * =================================================== */
function toNumLoose(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function extractPdfTableItems(pdfText: string) {
  const lines = String(pdfText || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const posRe = "([0-9]{1,3}(?:\\.[0-9]{1,3}){1,6})";
  const unitRe =
    "(m²|m2|m³|m3|m|lfm|stk\\.?|st\\.?|pcs|kg|t|h|psch\\.?|pausch\\.?|m\\.)";
  const qtyRe = "(-?[0-9]{1,3}(?:[\\.,][0-9]{1,3})*)";

  const rowRe = new RegExp(`^${posRe}\\s+(.+?)\\s+${unitRe}\\s+${qtyRe}$`, "i");

  const out: any[] = [];
  for (const line of lines) {
    const m = line.match(rowRe);
    if (!m) continue;

    const pos = String(m[1] ?? "").trim();
    const descr = String(m[2] ?? "").trim();
    const unitRaw = String(m[3] ?? "").trim();
    const unit =
      unitRaw.toLowerCase() === "m2"
        ? "m²"
        : unitRaw.toLowerCase() === "m3"
        ? "m³"
        : unitRaw;
    const qty = toNumLoose(m[4]);

    if (!pos || !descr) continue;

    out.push({
      pos,
      type: "PDF",
      descr,
      unit,
      qty,
      layer: "",
      source: "pdf",
    });
  }
  return out;
}

/* ===================================================
 *  POST /api/import/parse
 * =================================================== */
router.post("/parse", upload.single("file"), async (req, res) => {
  try {
    const file = (req as any).file;
    if (!file) {
      return res
        .status(400)
        .json({ ok: false, error: "Keine Datei empfangen" });
    }

    const note = (req.body?.note || "").toString();
    const scale = Number(req.body?.scale || "1") || 1;

    const name = (file.originalname || "file").toLowerCase();
    const ext = path.extname(name).toLowerCase();

    let items: any[] = [];
    let dxfoverlay: any = null;

    if (ext === ".dwg") {
      return res.status(400).json({
        ok: false,
        error:
          "DWG wird noch nicht unterstützt. Bitte Zeichnung als DXF exportieren.",
      });
    }

    if (ext === ".dxf") {
      const parser = new DxfParser();
      let dxf;
      try {
        dxf = parser.parseSync(file.buffer.toString("utf8"));
      } catch (err) {
        console.error("DXF parse error:", err);
        return res.status(400).json({
          ok: false,
          error: "DXF konnte nicht gelesen werden (ASCII-DXF exportieren).",
        });
      }
      const { overlay, items: dxfItems } = buildDxfOverlayAndItems(dxf, scale);
      dxfoverlay = overlay;
      items = dxfItems;
    } else if (ext === ".landxml" || ext === ".xml") {
      const land = await parseLandXml(file.buffer, scale);
      items = land.items;
    } else if (ext === ".csv") {
      const csv = parseCsv(file.buffer);
      items = csv.items;
    } else if (ext === ".gsi") {
      const gsi = parseGsi(file.buffer);
      items = gsi.items;
    } else if (ext === ".pdf") {
      try {
        const parsed = await pdfParse(file.buffer);
        const text = parsed?.text || "";
        const pdfItems = extractPdfTableItems(text);

        if (pdfItems.length > 0) {
          items = pdfItems;
        } else {
          items.push({
            pos: "",
            type: "PDF",
            descr:
              "PDF importiert (Vorschau im Frontend, Parsing noch rudimentär).",
            unit: "",
            qty: null,
            layer: "",
            source: "pdf",
          });
        }
      } catch (e) {
        console.warn("PDF parse failed, fallback placeholder:", e);
        items.push({
          pos: "",
          type: "PDF",
          descr:
            "PDF importiert (Vorschau im Frontend, Parsing noch rudimentär).",
          unit: "",
          qty: null,
          layer: "",
          source: "pdf",
        });
      }
    } else {
      return res.status(400).json({
        ok: false,
        error: `Dateityp ${ext || "unbekannt"} wird noch nicht unterstützt.`,
      });
    }

    if (note && note.trim()) {
      items.unshift({
        pos: "",
        type: "NOTE",
        descr: note.trim(),
        unit: "",
        qty: null,
        layer: "",
        source: "user",
      });
    }

    return res.json({
      ok: true,
      items,
      dxfoverlay,
    });
  } catch (e: any) {
    console.error("POST /api/import/parse error:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Fehler beim Analysieren der Datei",
    });
  }
});

// Piccola route di test per vedere se il router risponde
router.get("/ping", (_req, res) => {
  res.json({ ok: true, message: "import routes alive" });
});

export default router;
