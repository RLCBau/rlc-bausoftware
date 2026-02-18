// apps/server/src/routes/lv.routes.ts
import { Router } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import * as XLSX from "xlsx";
import OpenAI from "openai";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const ai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

/** ===== In-Memory store per test (sostituisci con Prisma/DB) ===== */
type LVItem = {
  id: string;
  projectId: string;
  posNr?: string;
  kurztext: string;
  einheit?: string;
  preis?: number | null;
  quelle?: string;     // es. "Fotoerkennung"
  createdAt: number;
};
const byProject = new Map<string, LVItem[]>();

/* ------------------------------------------------------------------ */
/* ------------------------ UTILS PER /compare ----------------------- */

type Row = {
  posNr?: string;
  kurztext: string;
  einheit?: string;
  menge?: number;
  ep?: number;
};
type CompareItem = {
  lv: Row | null;
  angebot: Row | null;
  status:
    | "ok" | "text" | "einheit" | "menge" | "preis"
    | "fehlt_angebot" | "fehlt_lv";
  ai?: { note: string; action?: "nachtrag" | "update"; confidence?: number };
};

function toNum(v: any): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = Number(String(v).replace(/\./g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : undefined;
}
function clean(s: any) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s.%°/-]/gu, "")
    .trim();
}
function sim(a: string, b: string) {
  if (!a || !b) return 0;
  const bi = (s: string) => {
    const r: string[] = [];
    for (let i = 0; i < s.length - 1; i++) r.push(s.slice(i, i + 2));
    return r;
  };
  const A = new Map<string, number>();
  bi(a).forEach((x) => A.set(x, (A.get(x) || 0) + 1));
  let inter = 0;
  bi(b).forEach((x) => {
    const v = A.get(x) || 0;
    if (v > 0) {
      inter++;
      A.set(x, v - 1);
    }
  });
  return (2 * inter) / (Math.max(1, a.length - 1) + Math.max(1, b.length - 1));
}

function sheetToRows(buf: Buffer): Row[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

  const mapKey = (o: any, keys: string[]) =>
    keys.find((k) => Object.keys(o).some((kk) => clean(kk) === clean(k)));

  return json.map((r) => {
    const posKey = mapKey(r, ["Pos", "Position", "PosNr", "Positionsnummer"]);
    const txtKey = mapKey(r, ["Kurztext", "Text", "Bezeichnung", "Beschreibung"]);
    const einKey = mapKey(r, ["Einheit", "ME", "Unit"]);
    const qtyKey = mapKey(r, ["Menge", "Quantity", "Qty"]);
    const epKey  = mapKey(r, ["EP", "Einheitspreis", "Preis", "EP (netto)"]);
    return {
      posNr: posKey ? String(r[posKey]) : undefined,
      kurztext: String(r[txtKey || ""] || "").trim(),
      einheit: einKey ? String(r[einKey]) : undefined,
      menge: qtyKey ? toNum(r[qtyKey]) : undefined,
      ep:    epKey  ? toNum(r[epKey])  : undefined,
    };
  });
}

function compareRows(lv: Row[], an: Row[]): CompareItem[] {
  const res: CompareItem[] = [];
  const used = new Set<number>();

  for (const L of lv) {
    let bestIdx = -1, best = -1;
    for (let i = 0; i < an.length; i++) {
      if (used.has(i)) continue;
      const s = sim(clean(L.kurztext), clean(an[i].kurztext));
      if (s > best) { best = s; bestIdx = i; }
    }

    if (best >= 0.65) {
      used.add(bestIdx);
      const A = an[bestIdx];
      let status: CompareItem["status"] = "ok";
      if (clean(L.kurztext) !== clean(A.kurztext)) status = "text";
      else if ((L.einheit || "").toLowerCase() !== (A.einheit || "").toLowerCase()) status = "einheit";
      else if (L.menge != null && A.menge != null && Math.abs(L.menge - A.menge) > 0.01 * (L.menge || 1)) status = "menge";
      else if (L.ep    != null && A.ep    != null && Math.abs(L.ep    - A.ep)    > 0.02 * (L.ep    || 1)) status = "preis";
      res.push({ lv: L, angebot: A, status });
    } else {
      res.push({ lv: L, angebot: null, status: "fehlt_angebot" });
    }
  }
  an.forEach((A, i) => { if (!used.has(i)) res.push({ lv: null, angebot: A, status: "fehlt_lv" }); });
  return res;
}

async function annotateWithAI(items: CompareItem[], lang: "de" | "it" | "en") {
  if (!ai) return items;
  const sys =
    lang === "de"
      ? "Du bist ein Baukalkulator (Tief-/Straßenbau). Entscheide bei Abweichungen, ob Nachtrag nötig ist oder LV aktualisiert werden sollte."
      : lang === "it"
      ? "Sei un calcolatore lavori infrastrutturali. Spiega sinteticamente la discrepanza e indica se serve un Nachtrag o aggiornare il capitolato."
      : "You are a construction estimator. Explain the discrepancy and suggest change order or LV update.";
  const work = items.map(async (it) => {
    if (it.status === "ok") return it;
    const prompt = `
LV: ${JSON.stringify(it.lv)}
OFFERTE: ${JSON.stringify(it.angebot)}
STATUS: ${it.status}
Rispondi SOLO JSON: {"note":"...", "action":"nachtrag"|"update", "confidence":0..1}`;
    try {
      const out = await ai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [{ role: "system", content: sys }, { role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      });
      const payload = JSON.parse(out.choices[0].message?.content || "{}");
      it.ai = {
        note: String(payload.note || "").slice(0, 500),
        action: payload.action === "nachtrag" ? "nachtrag" : "update",
        confidence: Number(payload.confidence || 0),
      };
    } catch { /* ignora */ }
    return it;
  });
  return await Promise.all(work);
}

/* ------------------------------------------------------------------ */
/* --------------------------- ENDPOINTS LV -------------------------- */
router.get("/search", (_req, res) => res.status(410).json({
  error: "Use /api/projects/:projectId/lv/search?q=..."
}));

/**
 * GET /api/lv
 * Ping di servizio (come avevi prima)
 */
router.get("/", (_req, res) => {
  res.json({
    ok: true,
    message: "LV-Routen aktiv – bereit für KI-Kalkulation",
    ts: Date.now(),
  });
});

/**
 * POST /api/lv/add
 * Aggiunge una posizione LV al progetto
 * Body: { projectId, kurztext, einheit?, preis?, quelle? }
 */
router.post("/add", (req, res) => {
  const { projectId, kurztext, einheit, preis, quelle } = req.body || {};
  if (!projectId || !kurztext) {
    return res.status(400).json({ error: "projectId und kurztext sind Pflicht." });
  }
  const item: LVItem = {
    id: randomUUID(),
    projectId: String(projectId),
    kurztext: String(kurztext),
    einheit: einheit ? String(einheit) : undefined,
    preis: preis != null ? Number(preis) : null,
    quelle: quelle ? String(quelle) : undefined,
    createdAt: Date.now(),
  };
  const list = byProject.get(item.projectId) || [];
  list.push(item);
  byProject.set(item.projectId, list);
  return res.json({ ok: true, item, count: list.length });
});

/**
 * GET /api/lv/by-project/:projectId
 * Ritorna le posizioni LV di un progetto (debug)
 */
router.get("/by-project/:projectId", (req, res) => {
  const pid = req.params.projectId;
  res.json({ projectId: pid, items: byProject.get(pid) || [] });
});

/* -------------------------- NUOVO: /compare ------------------------ */
/** POST /api/lv/compare
 * multipart/form-data: lv(file), angebot(file), lang? (de/it/en), projectId?
 * Ritorna: { items: CompareItem[], projectId? }
 */
router.post(
  "/compare",
  upload.fields([
    { name: "lv", maxCount: 1 },
    { name: "angebot", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const lang = (String(req.body.lang || "de").slice(0, 2) as "de" | "it" | "en") || "de";
      const projectId = req.body.projectId ? String(req.body.projectId) : undefined;

      const lvFile = (req.files as any)?.lv?.[0];
      const anFile = (req.files as any)?.angebot?.[0];
      if (!lvFile || !anFile) return res.status(400).json({ error: "lv und angebot Dateien fehlen" });

      const lvRows = sheetToRows(lvFile.buffer).filter((r) => r.kurztext);
      const anRows = sheetToRows(anFile.buffer).filter((r) => r.kurztext);

      const compared = compareRows(lvRows, anRows);
      const items = await annotateWithAI(compared, lang);

      res.json({ items, projectId });
    } catch (e: any) {
      console.error("[/api/lv/compare] error", e);
      res.status(500).json({ error: "compare failed", detail: String(e?.message || e) });
    }
  }
);
/**
 * POST /api/lv/update
 * Aggiorna (o inserisce) una posizione LV in base a posNr o kurztext
 * Body: { projectId, posNr?, kurztext, einheit?, menge?, ep?, quelle? }
 */
router.post("/update", (req, res) => {
  const { projectId, posNr, kurztext, einheit, menge, ep, quelle } = req.body || {};
  if (!projectId || !kurztext) {
    return res.status(400).json({ error: "projectId und kurztext sind Pflicht." });
  }

  let list = byProject.get(projectId) || [];
  const existing = list.find((x) => x.posNr === posNr || x.kurztext === kurztext);

  if (existing) {
    existing.kurztext = kurztext;
    if (einheit) existing.einheit = einheit;
    if (ep != null) existing.preis = Number(ep);
    existing.quelle = quelle || "LV-Update";
  } else {
    list.push({
      id: randomUUID(),
      projectId,
      posNr,
      kurztext,
      einheit,
      preis: ep != null ? Number(ep) : null,
      quelle: quelle || "LV-Update",
      createdAt: Date.now(),
    });
  }

  byProject.set(projectId, list);
  res.json({ ok: true, count: list.length, updated: !!existing });
});

export default router;
