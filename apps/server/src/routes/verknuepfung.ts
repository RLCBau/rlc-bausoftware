// apps/server/src/routes/verknuepfung.ts
// @ts-nocheck

import { Router } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";

/**
 * ✅ Allineamento FS-Key policy:
 * folder sotto PROJECTS_ROOT deve essere basato su project.code (BA-...)
 * Se arriva UUID → risolviamo via Prisma (best effort) → prendiamo .code
 * Se DB KO → fallback sanificato.
 */
import { prisma } from "../lib/prisma";
import { PROJECTS_ROOT as PROJECTS_ROOT_LIB } from "../lib/projectsRoot";

const r = Router();

/**
 * Mantengo la variabile originale, ma la rendo coerente con lib/projectsRoot.
 * Se qualcuno usa env PROJECTS_ROOT, resta compatibile.
 */
const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || PROJECTS_ROOT_LIB || path.join(process.cwd(), "data", "projects");

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}
function writeJson(file: string, data: any) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}
function rid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}
function safeNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
function s(x: any) {
  return String(x ?? "").trim();
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/* ================= FS-KEY HELPERS ================= */

function safeFsKey(input: string) {
  return String(input || "")
    .trim()
    .replace(/[^A-Za-z0-9_\-]/g, "_")
    .slice(0, 120);
}

/**
 * ✅ FS-Key policy (coerente con regie.ts / ls.ts):
 * - se input è già BA-.... -> ok
 * - altrimenti prova prisma: findFirst({ id: input } OR { code: input }) -> usa project.code
 * - fallback: safeFsKey(input)
 */
async function resolveProjectFsKey(input: string): Promise<string> {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "UNKNOWN";

  // già un code BA-...
  if (/^BA-\d{4}[-_]/i.test(trimmed)) return safeFsKey(trimmed);

  try {
    const proj = await prisma.project.findFirst({
      where: { OR: [{ id: trimmed }, { code: trimmed }] },
      select: { code: true },
    });
    const code = String(proj?.code || "").trim();
    if (code) return safeFsKey(code);
  } catch {
    // DB non raggiungibile -> fallback
  }

  return safeFsKey(trimmed);
}

function pProjectResolved(fsKey: string) {
  return path.join(PROJECTS_ROOT, fsKey);
}

/* ================= TYPES ================= */

type SollIstRow = {
  pos: string;
  text: string;
  unit: string;
  soll: number;
  ist: number;
  ep: number;
};

type NachtragStatus = "offen" | "inBearbeitung" | "freigegeben" | "abgelehnt";

type Nachtrag = {
  id: string;
  projectKey: string; // fsKey (BA-... sanificato)
  lvPos: string;
  number: string; // N01, N02...
  title: string;
  qty: number;
  unit: string;
  ep: number;
  total: number;
  status: NachtragStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

type AbschlagStatus = "Entwurf" | "Freigegeben" | "Gebucht";

type AbschlagItemRow = {
  lvPos: string;
  kurztext: string;
  einheit: string;
  qty: number;
  ep: number;
  total: number;
};

type AbschlagItem = {
  id: string;
  projectId: string; // fsKey
  nr: number;
  date: string;
  title?: string;
  netto: number;
  mwst: number;
  brutto: number;
  status: AbschlagStatus;
  rows: AbschlagItemRow[];
};

/* ================= PATHS ================= */

function files(fsKey: string) {
  const root = pProjectResolved(fsKey);

  // ✅ soll-ist.json nel ROOT del progetto
  const sollIstRoot = path.join(root, "soll-ist.json");

  // ✅ fallback legacy: /aufmass/soll-ist.json
  const sollIstLegacy = path.join(root, "aufmass", "soll-ist.json");

  const vRoot = path.join(root, "verknuepfung");
  const nachtraege = path.join(vRoot, "nachtraege.json");

  // ✅ Abschläge IM ROOT progetto (stesso come routes/abschlag.ts)
  const abschlaege = path.join(root, "abschlaege.json");

  return { sollIstRoot, sollIstLegacy, nachtraege, abschlaege, vRoot, root };
}

/* ================= HELPERS ================= */

function normalizeSollIstRow(x: any): SollIstRow | null {
  const pos = s(x?.pos ?? x?.lvPos ?? x?.posNr);
  if (!pos) return null;

  return {
    pos,
    text: String(x?.text ?? x?.kurztext ?? x?.title ?? ""),
    unit: String(x?.unit ?? x?.einheit ?? "m"),
    soll: safeNum(x?.soll),
    ist: safeNum(x?.ist),
    ep: safeNum(x?.ep ?? x?.preis),
  };
}

function readSollIstRows(fsKey: string): SollIstRow[] {
  const { sollIstRoot, sollIstLegacy } = files(fsKey);

  const pick = fs.existsSync(sollIstRoot) ? sollIstRoot : sollIstLegacy;
  if (!pick || !fs.existsSync(pick)) return [];

  const raw = readJson<any>(pick, null);
  const arr = Array.isArray(raw) ? raw : raw && Array.isArray(raw.rows) ? raw.rows : [];

  const out: SollIstRow[] = [];
  for (const it of arr) {
    const n = normalizeSollIstRow(it);
    if (n) out.push(n);
  }
  return out;
}

function nextNachtragNumber(existing: Nachtrag[]) {
  let max = 0;
  for (const n of existing || []) {
    const m = String(n.number || "").match(/(\d+)/);
    if (m) max = Math.max(max, Number(m[1] || 0));
  }
  const next = max + 1;
  return `N${String(next).padStart(2, "0")}`;
}

function normalizeNachtragStatus(x: any): NachtragStatus {
  const v = String(x ?? "").trim().toLowerCase();

  if (!v) return "offen";
  if (v === "offen" || v === "open") return "offen";
  if (v === "inbearbeitung" || v === "in_bearbeitung" || v === "bearbeitung") return "inBearbeitung";
  if (v === "freigegeben" || v === "approved" || v === "ok") return "freigegeben";
  if (v === "abgelehnt" || v === "rejected" || v === "nein") return "abgelehnt";

  if (v.includes("entwurf")) return "offen";
  return "offen";
}

function recalcAbschlagTotals(a: AbschlagItem) {
  const netto = (a.rows || []).reduce((sum, r0) => sum + safeNum(r0.total), 0);
  const mwst = safeNum(a.mwst);
  const brutto = netto * (1 + mwst / 100);
  a.netto = Math.round(netto * 100) / 100;
  a.brutto = Math.round(brutto * 100) / 100;
}

function readAbschlaegeArray(fsKey: string): { items: AbschlagItem[]; file: string } {
  const { abschlaege } = files(fsKey);
  const data = readJson<any>(abschlaege, []);
  const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  return { items: arr as AbschlagItem[], file: abschlaege };
}

function writeAbschlaegeArray(fsKey: string, items: AbschlagItem[]) {
  const { abschlaege } = files(fsKey);
  writeJson(abschlaege, items); // ✅ array, coerente con routes/abschlag.ts
}

function buildLinking(fsKey: string) {
  const { nachtraege } = files(fsKey);

  const sollRows = readSollIstRows(fsKey);
  const ntData = readJson<{ items: Nachtrag[] }>(nachtraege, { items: [] });

  const { items: abItems } = readAbschlaegeArray(fsKey);

  const ntByPos = new Map<string, Nachtrag[]>();
  for (const n of ntData.items || []) {
    const k = s(n.lvPos);
    if (!k) continue;
    const arr = ntByPos.get(k) || [];
    arr.push(n);
    ntByPos.set(k, arr);
  }

  const abByPos = new Map<string, number>(); // lvPos -> abschlagNr
  for (const a of abItems || []) {
    for (const row of a.rows || []) {
      const k = s(row.lvPos);
      if (k) abByPos.set(k, a.nr);
    }
  }

  const rows = (sollRows || []).map((r0) => {
    const pos = s(r0.pos);
    const soll = safeNum(r0.soll);
    const ist = safeNum(r0.ist);
    const ep = safeNum(r0.ep);
    const diff = ist - soll;

    const status = diff === 0 ? "OK" : diff > 0 ? "UEBERMASS" : "FEHLMENGE";

    const nts = ntByPos.get(pos) || [];
    const best = nts.find((x) => x.status !== "abgelehnt") || nts[0] || null;

    const abschlagNr = abByPos.get(pos) ?? null;

    return {
      id: `lv:${pos}`,
      lvPos: pos,
      text: String(r0.text || ""),
      unit: String(r0.unit || ""),
      soll,
      ist,
      ep,
      diff,
      status,
      nachtragId: best?.id || null,
      nachtragNr: best?.number || null,
      nachtragStatus: best?.status || null,
      nachtragTotal: best?.total || null,
      abschlagNr,
    };
  });

  return {
    rows,
    nachtraege: ntData.items || [],
    abschlaege: abItems || [],
  };
}

/* ================= ROUTES ================= */

/**
 * GET /api/verknuepfung/list/:projectKey
 */
r.get("/verknuepfung/list/:projectKey", async (req, res) => {
  const inputKey = s(req.params.projectKey);
  if (!inputKey) return res.status(400).json({ ok: false, error: "projectKey fehlt" });

  const fsKey = await resolveProjectFsKey(inputKey);
  const out = buildLinking(fsKey);

  let sollSum = 0,
    istSum = 0,
    offenNachtragEUR = 0,
    abrechenbarEUR = 0;

  for (const r0 of out.rows) {
    sollSum += safeNum(r0.soll);
    istSum += safeNum(r0.ist);
    abrechenbarEUR += safeNum(r0.ist) * safeNum(r0.ep);
    if (safeNum(r0.diff) > 0 && !r0.nachtragNr) {
      offenNachtragEUR += safeNum(r0.diff) * safeNum(r0.ep);
    }
  }

  const f = files(fsKey);
  const sourceSollIstFile = fs.existsSync(f.sollIstRoot)
    ? f.sollIstRoot
    : fs.existsSync(f.sollIstLegacy)
    ? f.sollIstLegacy
    : null;

  return res.json({
    ok: true,
    projectKey: inputKey,
    fsKey,
    kpi: { sollSum, istSum, offenNachtragEUR, abrechenbarEUR },
    items: out.rows,
    sourceSollIstFile,
  });
});

/**
 * GET /api/verknuepfung/nachtraege/:projectKey
 */
r.get("/verknuepfung/nachtraege/:projectKey", async (req, res) => {
  const inputKey = s(req.params.projectKey);
  if (!inputKey) return res.status(400).json({ ok: false, error: "projectKey fehlt" });

  const fsKey = await resolveProjectFsKey(inputKey);

  const { nachtraege } = files(fsKey);
  const ntData = readJson<{ items: Nachtrag[] }>(nachtraege, { items: [] });

  return res.json({ ok: true, projectKey: inputKey, fsKey, items: ntData.items || [] });
});

/**
 * PUT /api/verknuepfung/nachtraege/:projectKey
 * body: { items: Nachtrag[] }
 */
r.put("/verknuepfung/nachtraege/:projectKey", async (req, res) => {
  const inputKey = s(req.params.projectKey);
  if (!inputKey) return res.status(400).json({ ok: false, error: "projectKey fehlt" });

  const fsKey = await resolveProjectFsKey(inputKey);
  const { nachtraege } = files(fsKey);

  const incoming: any[] = Array.isArray(req.body?.items) ? req.body.items : [];

  const existing = readJson<{ items: Nachtrag[] }>(nachtraege, { items: [] });
  const existingById = new Map<string, Nachtrag>();
  for (const n of existing.items || []) existingById.set(String(n.id), n);

  let running = existing.items || [];
  const now = new Date().toISOString();

  const cleaned: Nachtrag[] = incoming
    .map((x: any) => {
      const id = String(x.id || rid());
      const prev = existingById.get(id) || null;

      const lvPos = s(x.lvPos ?? x.posNr ?? prev?.lvPos);
      const title = String(x.title ?? x.kurztext ?? prev?.title ?? "");
      const unit = String(x.unit ?? x.einheit ?? prev?.unit ?? "m");

      let number = String(x.number ?? prev?.number ?? "");
      if (!number) number = nextNachtragNumber(running);

      const createdAt = String(x.createdAt ?? prev?.createdAt ?? now);

      const qty = safeNum(x.qty ?? x.mengeDelta ?? prev?.qty);
      const ep = safeNum(x.ep ?? x.preis ?? prev?.ep);

      const total = Number.isFinite(Number(x.total)) ? safeNum(x.total) : safeNum(qty) * safeNum(ep);

      const note = String(x.note ?? x.begruendung ?? prev?.note ?? "");
      const status = normalizeNachtragStatus(x.status ?? prev?.status);

      const out: Nachtrag = {
        id,
        projectKey: fsKey, // ✅ scrive sempre fsKey
        lvPos,
        number,
        title,
        qty,
        unit,
        ep,
        total,
        status,
        note,
        createdAt,
        updatedAt: now,
      };

      running = [out, ...running];
      return out;
    })
    .filter((n) => s(n.lvPos).length > 0 || String(n.title || "").trim().length > 0);

  writeJson(nachtraege, { items: cleaned });
  return res.json({ ok: true, projectKey: inputKey, fsKey, items: cleaned });
});

/**
 * POST /api/verknuepfung/nachtrag/:projectKey
 * body: { lvPos: string[] }
 */
r.post("/verknuepfung/nachtrag/:projectKey", async (req, res) => {
  const inputKey = s(req.params.projectKey);
  const lvPos: string[] = Array.isArray(req.body?.lvPos) ? req.body.lvPos : [];

  if (!inputKey) return res.status(400).json({ ok: false, error: "projectKey fehlt" });
  if (!lvPos.length) return res.status(400).json({ ok: false, error: "lvPos[] fehlt" });

  const fsKey = await resolveProjectFsKey(inputKey);
  const { nachtraege } = files(fsKey);
  const ntData = readJson<{ items: Nachtrag[] }>(nachtraege, { items: [] });

  const sollRows = readSollIstRows(fsKey);
  const byPos = new Map<string, SollIstRow>();
  for (const r0 of sollRows || []) byPos.set(s(r0.pos), r0);

  const created: Nachtrag[] = [];
  const now = new Date().toISOString();

  for (const pos of lvPos.map((x) => s(x)).filter(Boolean)) {
    const row = byPos.get(pos);
    if (!row) continue;

    const diff = safeNum(row.ist) - safeNum(row.soll);
    if (diff <= 0) continue;

    const exists = (ntData.items || []).find((n) => s(n.lvPos) === pos && n.status !== "abgelehnt");
    if (exists) continue;

    const number = nextNachtragNumber(ntData.items || []);
    const ep = safeNum(row.ep);
    const total = diff * ep;

    const nt: Nachtrag = {
      id: rid(),
      projectKey: fsKey,
      lvPos: pos,
      number,
      title: `Nachtrag zu LV ${pos}`,
      qty: diff,
      unit: String(row.unit || "m"),
      ep,
      total,
      status: "offen",
      note: `Automatisch erstellt aus Soll/Ist (Diff ${diff})`,
      createdAt: now,
      updatedAt: now,
    };

    ntData.items.unshift(nt);
    created.push(nt);
  }

  writeJson(nachtraege, ntData);
  return res.json({ ok: true, projectKey: inputKey, fsKey, created });
});

/**
 * POST /api/verknuepfung/freigeben/:projectKey
 */
r.post("/verknuepfung/freigeben/:projectKey", async (req, res) => {
  const inputKey = s(req.params.projectKey);
  if (!inputKey) return res.status(400).json({ ok: false, error: "projectKey fehlt" });

  const fsKey = await resolveProjectFsKey(inputKey);

  const nachtragIds: string[] = Array.isArray(req.body?.nachtragIds) ? req.body.nachtragIds : [];
  const lvPos: string[] = Array.isArray(req.body?.lvPos) ? req.body.lvPos : [];

  const { nachtraege } = files(fsKey);
  const ntData = readJson<{ items: Nachtrag[] }>(nachtraege, { items: [] });

  const idSet = new Set(nachtragIds.map(String));
  const posSet = new Set(lvPos.map((x) => s(x)));

  const now = new Date().toISOString();
  let updated = 0;

  ntData.items = (ntData.items || []).map((n) => {
    const match = (n.id && idSet.has(n.id)) || (n.lvPos && posSet.has(s(n.lvPos)));
    if (!match) return n;
    updated++;
    return { ...n, status: "freigegeben", updatedAt: now };
  });

  writeJson(nachtraege, ntData);
  return res.json({ ok: true, projectKey: inputKey, fsKey, updated });
});

/**
 * POST /api/verknuepfung/abschlag/:projectKey
 * body: { lvPos: string[], nr?: number | null }
 */
r.post("/verknuepfung/abschlag/:projectKey", async (req, res) => {
  const inputKey = s(req.params.projectKey);
  const lvPos: string[] = Array.isArray(req.body?.lvPos) ? req.body.lvPos : [];
  const wantedNr = req.body?.nr !== undefined && req.body?.nr !== null ? Number(req.body.nr) : null;

  if (!inputKey) return res.status(400).json({ ok: false, error: "projectKey fehlt" });
  if (!lvPos.length) return res.status(400).json({ ok: false, error: "lvPos[] fehlt" });

  const fsKey = await resolveProjectFsKey(inputKey);

  const sollRows = readSollIstRows(fsKey);
  const byPos = new Map<string, SollIstRow>();
  for (const r0 of sollRows || []) byPos.set(s(r0.pos), r0);

  const { items: abItems, file } = readAbschlaegeArray(fsKey);

  // scegli/crea Abschlag
  let abschlag: AbschlagItem | null = null;
  if (wantedNr && Number.isFinite(wantedNr) && wantedNr > 0) {
    abschlag = (abItems || []).find((a) => Number(a.nr) === wantedNr) || null;
  }

  if (!abschlag) {
    const maxNr = (abItems || []).reduce((m, a) => Math.max(m, Number(a.nr) || 0), 0);
    const nextNr = maxNr + 1;

    abschlag = {
      id: rid(),
      projectId: fsKey,
      nr: nextNr,
      date: todayIso(),
      title: `Abschlagsrechnung ${nextNr}`,
      netto: 0,
      mwst: 19,
      brutto: 0,
      status: "Entwurf",
      rows: [],
    };

    abItems.unshift(abschlag);
  } else {
    // normalizza campi mancanti (robustezza)
    abschlag.rows = Array.isArray(abschlag.rows) ? abschlag.rows : [];
    if (!abschlag.mwst && abschlag.mwst !== 0) abschlag.mwst = 19;
    if (!abschlag.status) abschlag.status = "Entwurf";
    if (!abschlag.date) abschlag.date = todayIso();
    if (!abschlag.title) abschlag.title = `Abschlagsrechnung ${abschlag.nr}`;
  }

  const selSet = new Set(lvPos.map((x) => s(x)).filter(Boolean));

  // rimuovi righe già esistenti per quelle pos selezionate
  abschlag.rows = (abschlag.rows || []).filter((row) => !selSet.has(s(row.lvPos)));

  // aggiungi righe
  for (const pos of selSet) {
    const row = byPos.get(pos);
    if (!row) continue;

    const qty = safeNum(row.ist);
    const ep = safeNum(row.ep);
    const total = qty * ep;

    abschlag.rows.push({
      lvPos: pos,
      kurztext: String(row.text || ""),
      einheit: String(row.unit || ""),
      qty,
      ep,
      total,
    });
  }

  // aggiorna totali
  recalcAbschlagTotals(abschlag);

  // salva array
  writeAbschlaegeArray(fsKey, abItems);

  return res.json({
    ok: true,
    projectKey: inputKey,
    fsKey,
    nr: abschlag.nr,
    id: abschlag.id,
    rows: abschlag.rows?.length || 0,
    netto: abschlag.netto,
    brutto: abschlag.brutto,
    file,
  });
});

export default r;
