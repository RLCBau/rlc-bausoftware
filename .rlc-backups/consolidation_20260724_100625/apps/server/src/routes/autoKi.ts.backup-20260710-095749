// apps/server/src/routes/autoKi.ts
// @ts-nocheck

import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import OpenAI from "openai";
import { prisma } from "../lib/prisma";
import { PROJECTS_ROOT } from "../lib/projectsRoot";

const r = Router();
const upload = multer({ storage: multer.memoryStorage() });

/* ===================== HELPERS ===================== */

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function safeProjectKey(input: string) {
  return String(input || "")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/[^A-Za-z0-9_\-]/g, "_");
}

function isPdfName(name: string) {
  return /\.pdf$/i.test(name || "");
}

function mimeFromName(name: string) {
  const lowerName = String(name || "").toLowerCase();
  if (lowerName.endsWith(".pdf")) return "application/pdf";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function bufferToDataUrl(buf: Buffer, mime: string) {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/* ===================== OPENAI ===================== */

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  return new OpenAI({ apiKey: key });
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const KI_VISION_ON = String(process.env.KI_VISION || "on").toLowerCase() !== "off";

/* ===================== TYPES ===================== */

type Det = {
  id: string;
  pos: string;
  type: "LINE" | "AREA" | "COUNT";
  descr: string;
  unit: string;
  qty: number;
  layer?: string;
  source?: string;
  poly?: { x: number; y: number }[];
  box?: { x: number; y: number; w: number; h: number };
};

type DetectBox = {
  id: string;
  label: string;
  score: number;
  qty?: number;
  unit?: string;
  box?: [number, number, number, number]; // normalized 0..1
};

type ExtraRow = {
  id: string;
  typ: "KI" | "Manuell";
  lvPos?: string;
  beschreibung: string;
  einheit: string;
  menge: number;
};

type PhotoPosition = {
  id?: string;
  kurztext: string;
  einheit?: string;
  qty?: number | null; // IMPORTANT
  typ?: "sichtbar" | "implizit";
  status?: "bestehend" | "nachtrag";
};

type AutoKiFile = {
  savedAt: string;
  projectIdOrCode: string;
  fsKey: string;
  note?: string;
  scale?: string;
  sourceFile?: { name?: string; type?: string; size?: number } | null;
  preview?: string | null; // dataURL
  boxes?: DetectBox[];
  extras?: ExtraRow[];
  summary?: string;
  positions?: PhotoPosition[];
  items: Det[];
};

type AufmassHistory = {
  savedAt: string;
  projectIdOrCode: string;
  history: { ts: number; count: number; note?: string; source?: string }[];
  lastRows?: any[];
};

/* ===================== PROJECT RESOLVE ===================== */

async function resolveProjectKey(projectKey: string) {
  const key = String(projectKey || "").trim();
  if (!key) return null;

  // 1) code
  const byCode = await prisma.project.findFirst({
    where: { code: key },
    select: { id: true, code: true, name: true },
  });
  if (byCode) return { id: byCode.id, code: byCode.code, fsKey: byCode.code || key };

  // 2) id
  const byId = await prisma.project.findUnique({
    where: { id: key },
    select: { id: true, code: true, name: true },
  });
  if (byId) return { id: byId.id, code: byId.code, fsKey: byId.code || key };

  // fallback FS
  return { id: key, code: key, fsKey: key };
}

/* ===================== PATHS ===================== */

function autoKiDir(fsKey: string) {
  return path.join(PROJECTS_ROOT, safeProjectKey(fsKey), "auto-ki");
}
function uploadsDir(fsKey: string) {
  return path.join(autoKiDir(fsKey), "uploads");
}
function autoKiJsonPath(fsKey: string) {
  return path.join(autoKiDir(fsKey), "auto-ki.json");
}
function aufmassHistoryPath(fsKey: string) {
  return path.join(autoKiDir(fsKey), "aufmass-history.json");
}
function sollIstPath(fsKey: string) {
  // AufmaßEditor reads: PROJECTS_ROOT/<projectKey>/soll-ist.json
  return path.join(PROJECTS_ROOT, safeProjectKey(fsKey), "soll-ist.json");
}

/* ===================== PDF -> PNG (server-safe) ===================== */
async function pdfFirstPageToPngDataUrl(pdfBuffer: Buffer): Promise<string | null> {
  try {
    const { createCanvas } = require("@napi-rs/canvas");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      disableWorker: true,
    });

    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    // scale up for plans
    const viewport = page.getViewport({ scale: 3 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");

    await page.render({ canvasContext: ctx, viewport }).promise;

    const pngBuffer = canvas.toBuffer("image/png");
    return bufferToDataUrl(pngBuffer, "image/png");
  } catch (e: any) {
    console.error("[auto-ki] pdf preview render failed:", e?.message || e);
    return null;
  }
}

/* ===================== OPENAI VISION ===================== */

function visionPrompt(note: string) {
  return `
Du bist Bau-KI für Tiefbau/Wegebau. Analysiere das Bild (Plan oder Baustellenfoto) und extrahiere alle erkennbaren Positionen.

WICHTIG:
- Wenn im Plan eine Menge/Fläche/Länge bereits lesbar ist, übernimm sie als qty (Zahl) + passende Einheit.
- Wenn keine Menge eindeutig lesbar ist, setze qty = null.
- Extrahiere so viel wie möglich (auch kleine Beschriftungen), aber nur wenn wirklich lesbar.

Gib ausschließlich JSON zurück im Format:
{
  "summary": "kurze Zusammenfassung",
  "positions": [
    { "id": "", "kurztext": "Bezeichnung", "einheit": "m|m²|m³|St|...", "qty": 12.34 }
  ]
}

Regeln:
- Kein Fließtext außerhalb JSON.
- 3 bis 30 Positionen.
- Einheiten plausibel wählen (m / m² / m³ / St).
- qty darf null sein.
- Optional: Note berücksichtigen: ${note || "(keine Notiz)"}.
`.trim();
}

function coerceQty(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return null;
  // 12,34 -> 12.34 ; 1.234,5 -> 1234.5 (best effort)
  const normalized = s
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

async function analyzeWithOpenAI(imageDataUrl: string, note: string) {
  const client = getOpenAI();

  const resp = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: visionPrompt(note) },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });

  const text = resp.choices?.[0]?.message?.content || "";
  let parsed = safeJsonParse<any>(text, null);

  if (!parsed || !Array.isArray(parsed.positions)) {
    const m = text.match(/\{[\s\S]*\}/);
    parsed = m ? safeJsonParse<any>(m[0], null) : null;
  }

  if (!parsed || !Array.isArray(parsed.positions)) {
    return { summary: "KI-Antwort unlesbar.", positions: [] as any[] };
  }

  const positions = parsed.positions.map((p: any) => ({
    id: p?.id ? String(p.id) : "",
    kurztext: String(p?.kurztext || p?.label || "").trim(),
    einheit: String(p?.einheit || p?.unit || "").trim(),
    qty: coerceQty(p?.qty),
    typ: p?.typ ? String(p.typ) : undefined,
    status: p?.status ? String(p.status) : undefined,
  }));

  return { summary: String(parsed.summary || ""), positions };
}

/* ===================== AUFMASS EXPORT (Husemann & Fritz style) ===================== */

type SollIstRow = {
  id: string;
  kind: "base" | "mass";
  pos: string;
  text: string;
  unit: string;
  soll: number;
  ist: number; // base: 0 (computed in FE), mass: qty
  ep: number;
  formula?: string;
  source?: string;
  ts?: number;
};

function toNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function readSollIst(fsKey: string): SollIstRow[] {
  const file = sollIstPath(fsKey);
  ensureDir(path.dirname(file));
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, "utf8");
  const arr = safeJsonParse<any[]>(raw, []);
  return Array.isArray(arr) ? (arr as SollIstRow[]) : [];
}

function writeSollIst(fsKey: string, rows: SollIstRow[]) {
  const file = sollIstPath(fsKey);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(rows, null, 2), "utf8");
  return file;
}

function appendMassLines(
  fsKey: string,
  incoming: Array<{ pos: string; text?: string; unit?: string; qty?: number; ep?: number; soll?: number; formula?: string; source?: string }>
) {
  const current = readSollIst(fsKey);

  // index base rows
  const baseByPos = new Map<string, SollIstRow>();
  for (const r of current) {
    if (r?.kind === "base") baseByPos.set(String(r.pos || "").trim(), r);
  }

  const out: SollIstRow[] = [...current];

  for (const x of incoming || []) {
    const pos = String(x?.pos ?? "").trim();
    if (!pos) continue;

    const text = String(x?.text ?? "").trim() || "Auto-KI";
    const unit = String(x?.unit ?? "m").trim() || "m";
    const ep = toNum(x?.ep ?? 0, 0);
    const soll = toNum(x?.soll ?? 0, 0);
    const qty = toNum(x?.qty ?? 0, 0);

    let base = baseByPos.get(pos);
    if (!base) {
      base = {
        id: crypto.randomUUID(),
        kind: "base",
        pos,
        text,
        unit,
        soll,
        ist: 0,
        ep,
      };
      baseByPos.set(pos, base);
      out.push(base);
    } else {
      if ((!base.text || !base.text.trim()) && text) base.text = text;
      if ((!base.unit || !base.unit.trim()) && unit) base.unit = unit;
      if (!base.ep && ep) base.ep = ep;
      if (!base.soll && soll) base.soll = soll;
    }

    // append mass line
    if (qty !== 0) {
      out.push({
        id: crypto.randomUUID(),
        kind: "mass",
        pos,
        text: base.text,
        unit: base.unit,
        soll: base.soll,
        ep: base.ep,
        ist: qty,
        formula: String(x?.formula ?? "KI-Plan").trim(),
        source: String(x?.source ?? "auto-ki").trim(),
        ts: Date.now(),
      });
    }
  }

  const file = writeSollIst(fsKey, out);
  return { count: out.length, file };
}

/* ===================== ROUTES ===================== */

async function handleLoad(req: any, res: any) {
  try {
    const projectKey = String(req.params.projectKey || "").trim();
    const p = await resolveProjectKey(projectKey);
    if (!p) return res.status(400).json({ ok: false, error: "projectKey missing" });

    ensureDir(autoKiDir(p.fsKey));

    const fp = autoKiJsonPath(p.fsKey);
    if (!fs.existsSync(fp)) return res.json({ ok: true, data: null });

    const raw = fs.readFileSync(fp, "utf-8");
    const data = safeJsonParse<AutoKiFile>(raw, null as any);
    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error("[auto-ki] load error", e);
    return res.status(500).json({ ok: false, error: e?.message || "server error" });
  }
}

r.get("/auto-ki/:projectKey", handleLoad);
r.get("/auto-ki/:projectKey/load", handleLoad);

/**
 * Save auto-ki.json
 */
r.post("/auto-ki/:projectKey/save", async (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();
    const p = await resolveProjectKey(projectKey);
    if (!p) return res.status(400).json({ ok: false, error: "projectKey missing" });

    ensureDir(autoKiDir(p.fsKey));

    const payload = req.body || {};
    const fp = autoKiJsonPath(p.fsKey);

    const file: AutoKiFile = {
      savedAt: nowIso(),
      projectIdOrCode: p.code || projectKey,
      fsKey: safeProjectKey(p.fsKey),
      note: String(payload.note ?? ""),
      scale: String(payload.scale ?? "1"),
      sourceFile: payload.sourceFile ?? null,
      preview: payload.preview ?? null,
      boxes: Array.isArray(payload.boxes) ? payload.boxes : [],
      extras: Array.isArray(payload.extras) ? payload.extras : [],
      summary: String(payload.summary ?? ""),
      positions: Array.isArray(payload.positions) ? payload.positions : [],
      items: Array.isArray(payload.items) ? payload.items : [],
    };

    fs.writeFileSync(fp, JSON.stringify(file, null, 2), "utf-8");
    return res.json({ ok: true, count: file.items.length });
  } catch (e: any) {
    console.error("[auto-ki] save error", e);
    return res.status(500).json({ ok: false, error: e?.message || "server error" });
  }
});

/**
 * History read
 */
r.get("/auto-ki/:projectKey/aufmass-history", async (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();
    const p = await resolveProjectKey(projectKey);
    if (!p) return res.status(400).json({ ok: false, error: "projectKey missing" });

    ensureDir(autoKiDir(p.fsKey));

    const fp = aufmassHistoryPath(p.fsKey);
    if (!fs.existsSync(fp)) {
      const empty: AufmassHistory = {
        savedAt: nowIso(),
        projectIdOrCode: p.code || projectKey,
        history: [],
        lastRows: [],
      };
      fs.writeFileSync(fp, JSON.stringify(empty, null, 2), "utf-8");
      return res.json({ ok: true, data: empty });
    }

    const raw = fs.readFileSync(fp, "utf-8");
    const data = safeJsonParse<AufmassHistory>(raw, {
      savedAt: nowIso(),
      projectIdOrCode: p.code || projectKey,
      history: [],
      lastRows: [],
    });

    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error("[auto-ki] aufmass-history get error", e);
    return res.status(500).json({ ok: false, error: e?.message || "server error" });
  }
});

/**
 * Snapshot
 */
r.post("/auto-ki/:projectKey/aufmass-history/snapshot", async (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();
    const p = await resolveProjectKey(projectKey);
    if (!p) return res.status(400).json({ ok: false, error: "projectKey missing" });

    ensureDir(autoKiDir(p.fsKey));

    const fp = aufmassHistoryPath(p.fsKey);
    const raw = fs.existsSync(fp) ? fs.readFileSync(fp, "utf-8") : "";
    const data = safeJsonParse<AufmassHistory>(raw, {
      savedAt: nowIso(),
      projectIdOrCode: p.code || projectKey,
      history: [],
      lastRows: [],
    });

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const note = String(req.body?.note ?? "");
    const source = String(req.body?.source ?? "auto-ki");

    const snap = { ts: Date.now(), count: rows.length, note: note || undefined, source: source || undefined };

    data.savedAt = nowIso();
    data.projectIdOrCode = p.code || projectKey;
    data.history = [snap, ...(data.history || [])].slice(0, 50);
    data.lastRows = rows;

    fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf-8");
    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error("[auto-ki] snapshot error", e);
    return res.status(500).json({ ok: false, error: e?.message || "server error" });
  }
});

/**
 * Export to Aufmaß (Husemann & Fritz style)
 * POST /api/auto-ki/:projectKey/export-to-aufmass
 * body: { rows: [{pos,text,unit,qty,ep,soll,formula,source}] }
 */
r.post("/auto-ki/:projectKey/export-to-aufmass", async (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();
    const p = await resolveProjectKey(projectKey);
    if (!p) return res.status(400).json({ ok: false, error: "projectKey missing" });

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ ok: false, error: "rows missing" });

    const incoming = rows
      .map((x: any) => ({
        pos: String(x?.pos ?? "").trim(),
        text: String(x?.text ?? x?.kurztext ?? "").trim(),
        unit: String(x?.unit ?? x?.einheit ?? "m").trim() || "m",
        qty: toNum(x?.qty ?? x?.istDelta ?? x?.ist ?? 0, 0),
        ep: toNum(x?.ep ?? 0, 0),
        soll: toNum(x?.soll ?? 0, 0),
        formula: String(x?.formula ?? "KI-Plan").trim(),
        source: String(x?.source ?? "auto-ki").trim(),
      }))
      .filter((x: any) => !!x.pos);

    const out = appendMassLines(p.fsKey, incoming);
    return res.json({ ok: true, projectId: p.fsKey, count: out.count, file: out.file });
  } catch (e: any) {
    console.error("[auto-ki] export-to-aufmass error", e);
    return res.status(500).json({ ok: false, error: e?.message || "server error" });
  }
});

/**
 * Analyze
 * POST /api/auto-ki/:projectKey/analyze (multipart)
 * file, note, scale
 */
r.post("/auto-ki/:projectKey/analyze", upload.single("file"), async (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();
    const p = await resolveProjectKey(projectKey);
    if (!p) return res.status(400).json({ ok: false, error: "projectKey missing" });

    const note = String(req.body?.note ?? "");
    const scale = String(req.body?.scale ?? "1");

    const file = req.file;
    if (!file || !file.buffer) return res.status(400).json({ ok: false, error: "file missing" });

    const original = String(file.originalname || "upload.bin");
    const lowerName = original.toLowerCase();
    const isPdf = file.mimetype === "application/pdf" || isPdfName(lowerName);
    const isImage = file.mimetype?.startsWith("image/") || /\.(png|jpg|jpeg)$/i.test(lowerName);

    // 1) save upload
    ensureDir(uploadsDir(p.fsKey));
    const ts = Date.now();
    const safeName = original.replace(/[^\w.\-]+/g, "_");
    const storedName = `${ts}-${safeName}`;
    const storedPath = path.join(uploadsDir(p.fsKey), storedName);
    fs.writeFileSync(storedPath, file.buffer);

    // 2) preview
    let preview: string | null = null;
    if (isPdf) {
      preview = await pdfFirstPageToPngDataUrl(file.buffer); // server-side PDF preview
    } else if (isImage) {
      preview = bufferToDataUrl(file.buffer, file.mimetype || mimeFromName(lowerName));
    }

    let boxes: DetectBox[] = [];
    let extras: ExtraRow[] = [];
    let items: Det[] = [];
    let summary = "";
    let positions: PhotoPosition[] = [];

    if (KI_VISION_ON && preview) {
      try {
        const out = await analyzeWithOpenAI(preview, note);
        summary = out.summary || "Analyse OK (OpenAI).";
        positions = Array.isArray(out.positions) ? out.positions : [];

        boxes = positions.map((pp: any, idx: number) => ({
          id: String(pp.id || idx + 1),
          label: String(pp.kurztext || `Position ${idx + 1}`),
          score: 0.95,
          qty: pp.qty == null ? undefined : Number(pp.qty),
          unit: String(pp.einheit || ""),
          box: undefined,
        }));

        extras = positions.map((pp: any) => ({
          id: crypto.randomUUID(),
          typ: "KI",
          lvPos: String(pp.id || ""),
          beschreibung: String(pp.kurztext || ""),
          einheit: String(pp.einheit || ""),
          menge: pp.qty == null ? 0 : Number(pp.qty),
        }));

        items = positions.map((pp: any, idx: number) => ({
          id: crypto.randomUUID(),
          pos: `AUTO.${String(idx + 1).padStart(3, "0")}`,
          type: "COUNT",
          descr: String(pp.kurztext || ""),
          unit: String(pp.einheit || ""),
          qty: pp.qty == null ? 0 : Number(pp.qty),
          layer: "",
          source: "image+openai",
        }));
      } catch (e: any) {
        console.error("[auto-ki] OpenAI failed:", e?.message || e);
        summary = `Analyse OK (scale=${scale}), aber OpenAI Fehler.`;
        items = [
          {
            id: crypto.randomUUID(),
            pos: "FILE.001",
            type: "COUNT",
            descr: `Datei gespeichert (${original}). OpenAI Fehler: ${e?.message || "unknown"}`,
            unit: "",
            qty: 0,
            layer: "",
            source: "file",
          },
        ];
      }
    } else {
      summary = isPdf
        ? "PDF importiert. Preview-Rendering fehlgeschlagen – bitte als PNG/JPG hochladen."
        : "Datei importiert. Keine KI (Preview fehlt oder KI_VISION=off).";

      items = [
        {
          id: crypto.randomUUID(),
          pos: "FILE.001",
          type: "COUNT",
          descr: `Datei gespeichert (${original}). Für KI bitte PNG/JPG verwenden.`,
          unit: "",
          qty: 0,
          layer: "",
          source: "file",
        },
      ];
    }

    return res.json({
      ok: true,
      msg: `Analyse OK (scale=${scale})`,
      preview: preview ?? null,
      stored: { name: storedName, path: storedPath },
      boxes,
      extras,
      summary,
      items,
      positions,
    });
  } catch (e: any) {
    console.error("[auto-ki] analyze error", e);
    return res.status(500).json({ ok: false, error: e?.message || "server error" });
  }
});

export default r;
