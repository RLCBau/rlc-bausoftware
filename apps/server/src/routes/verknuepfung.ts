// apps/server/src/routes/verknuepfung.ts
// @ts-nocheck

import { Router } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { PROJECTS_ROOT as PROJECTS_ROOT_LIB } from "../lib/projectsRoot";

const r = Router();

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT ||
  PROJECTS_ROOT_LIB ||
  path.join(process.cwd(), "data", "projects");

/* ================= BASIC HELPERS ================= */

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
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function safeNum(x: any) {
  if (x === null || x === undefined || x === "") return 0;

  const raw = String(x).trim();
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function s(x: any) {
  return String(x ?? "").trim();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function round2(v: number) {
  return Math.round((safeNum(v) + Number.EPSILON) * 100) / 100;
}

/* ================= FS-KEY HELPERS ================= */

function safeFsKey(input: string) {
  return String(input || "")
    .trim()
    .replace(/[^A-Za-z0-9_\-]/g, "_")
    .slice(0, 120);
}

async function resolveProjectFsKey(input: string): Promise<string> {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "UNKNOWN";

  // FS-Key diretto: BA-2026-DEMO non deve interrogare Prisma
  if (/^BA[-_]/i.test(trimmed)) return safeFsKey(trimmed);

  try {
    const dbLookup = prisma.project.findFirst({
      where: { OR: [{ id: trimmed }, { code: trimmed }] },
      select: { code: true },
    });

    const proj = await Promise.race([
      dbLookup,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);

    const code = String((proj as any)?.code || "").trim();
    if (code) return safeFsKey(code);
  } catch {
    // DB fallback
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

type NachtragStatus =
  | "offen"
  | "inBearbeitung"
  | "freigegeben"
  | "abgelehnt";

type Nachtrag = {
  id: string;
  projectKey: string;
  lvPos: string;
  number: string;
  title: string;
  langtext?: string;
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
  projectId: string;
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

  const sollIstRoot = path.join(root, "soll-ist.json");
  const sollIstLegacy = path.join(root, "aufmass", "soll-ist.json");

  const vRoot = path.join(root, "verknuepfung");
  const nachtraege = path.join(vRoot, "nachtraege.json");

  const abschlaege = path.join(root, "abschlaege.json");

  return {
    root,
    vRoot,
    sollIstRoot,
    sollIstLegacy,
    nachtraege,
    abschlaege,
  };
}

function ensureProjectStructure(fsKey: string) {
  const f = files(fsKey);

  ensureDir(f.root);
  ensureDir(f.vRoot);

  if (!fs.existsSync(f.nachtraege)) {
    writeJson(f.nachtraege, { items: [] });
  }

  if (!fs.existsSync(f.abschlaege)) {
    writeJson(f.abschlaege, []);
  }

  return f;
}

/* ================= NORMALIZER ================= */

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
  const arr = Array.isArray(raw)
    ? raw
    : raw && Array.isArray(raw.rows)
    ? raw.rows
    : [];

  const out: SollIstRow[] = [];

  for (const item of arr) {
    const row = normalizeSollIstRow(item);
    if (row) out.push(row);
  }

  return out;
}

function nextNachtragNumber(existing: Nachtrag[]) {
  let max = 0;

  for (const n of existing || []) {
    const m = String(n.number || "").match(/(\d+)/);
    if (m) max = Math.max(max, Number(m[1] || 0));
  }

  return `N${String(max + 1).padStart(2, "0")}`;
}

function normalizeNachtragStatus(x: any): NachtragStatus {
  const v = String(x ?? "").trim().toLowerCase();

  if (!v) return "offen";
  if (v === "offen" || v === "open") return "offen";
  if (v === "inbearbeitung" || v === "in_bearbeitung" || v === "bearbeitung")
    return "inBearbeitung";
  if (v === "freigegeben" || v === "approved" || v === "ok")
    return "freigegeben";
  if (v === "abgelehnt" || v === "rejected" || v === "nein")
    return "abgelehnt";

  if (v.includes("entwurf")) return "offen";
  if (v.includes("abgegeben")) return "inBearbeitung";
  if (v.includes("beauftragt")) return "freigegeben";

  return "offen";
}

function normalizeNachtrag(x: any, fsKey: string, existing?: Nachtrag[]): Nachtrag {
  const now = new Date().toISOString();
  const existingRows = Array.isArray(existing) ? existing : [];
  const id = String(x?.id || rid());

  const prev =
    existingRows.find((n) => String(n.id) === id) ||
    existingRows.find(
      (n) =>
        s(n.lvPos) &&
        s(n.lvPos) === s(x?.lvPos ?? x?.posNr ?? x?.pos)
    ) ||
    null;

  const lvPos = s(x?.lvPos ?? x?.posNr ?? x?.pos ?? prev?.lvPos);
  const title = String(x?.title ?? x?.kurztext ?? prev?.title ?? "");
  const langtext = String(
    x?.langtext ?? x?.longText ?? x?.beschreibung ?? prev?.langtext ?? ""
  );

  const unit = String(x?.unit ?? x?.einheit ?? prev?.unit ?? "m");
  const qty = safeNum(x?.qty ?? x?.mengeDelta ?? x?.menge ?? prev?.qty);
  const ep = safeNum(x?.ep ?? x?.preis ?? prev?.ep);

  const total =
    Number.isFinite(Number(x?.total)) && x?.total !== ""
      ? round2(safeNum(x?.total))
      : round2(qty * ep);

  let number = String(x?.number ?? prev?.number ?? "");
  if (!number) number = nextNachtragNumber(existingRows);

  const note = String(
    x?.note ?? x?.begruendung ?? x?.reason ?? prev?.note ?? ""
  );

  return {
    id,
    projectKey: fsKey,
    lvPos,
    number,
    title,
    langtext,
    qty,
    unit,
    ep,
    total,
    status: normalizeNachtragStatus(x?.status ?? prev?.status),
    note,
    createdAt: String(x?.createdAt ?? prev?.createdAt ?? now),
    updatedAt: now,
  };
}

function readNachtraege(fsKey: string): Nachtrag[] {
  const { nachtraege } = ensureProjectStructure(fsKey);
  const data = readJson<{ items: Nachtrag[] }>(nachtraege, { items: [] });
  return Array.isArray(data.items) ? data.items : [];
}

function writeNachtraege(fsKey: string, items: Nachtrag[]) {
  const { nachtraege } = ensureProjectStructure(fsKey);
  writeJson(nachtraege, { items: Array.isArray(items) ? items : [] });
}

function readAbschlaegeArray(fsKey: string): { items: AbschlagItem[]; file: string } {
  const { abschlaege } = ensureProjectStructure(fsKey);
  const data = readJson<any>(abschlaege, []);
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
    ? data.items
    : [];

  return { items: arr as AbschlagItem[], file: abschlaege };
}

function writeAbschlaegeArray(fsKey: string, items: AbschlagItem[]) {
  const { abschlaege } = ensureProjectStructure(fsKey);
  writeJson(abschlaege, items);
}

function recalcAbschlagTotals(a: AbschlagItem) {
  const netto = (a.rows || []).reduce((sum, row) => sum + safeNum(row.total), 0);
  const mwst = safeNum(a.mwst);
  const brutto = netto * (1 + mwst / 100);

  a.netto = round2(netto);
  a.brutto = round2(brutto);
}

/* ================= LINKING ================= */

function buildLinking(fsKey: string) {
  ensureProjectStructure(fsKey);

  const sollRows = readSollIstRows(fsKey);
  const nachtraege = readNachtraege(fsKey);
  const { items: abschlaege } = readAbschlaegeArray(fsKey);

  const ntByPos = new Map<string, Nachtrag[]>();

  for (const n of nachtraege) {
    const k = s(n.lvPos);
    if (!k) continue;
    const arr = ntByPos.get(k) || [];
    arr.push(n);
    ntByPos.set(k, arr);
  }

  const abByPos = new Map<string, number>();

  for (const a of abschlaege || []) {
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
    nachtraege,
    abschlaege,
  };
}

/* ================= ROUTES ================= */

/**
 * GET /api/verknuepfung/list/:projectKey
 */
r.get("/verknuepfung/list/:projectKey", async (req, res) => {
  try {
    const inputKey = s(req.params.projectKey);
    if (!inputKey) {
      return res.status(400).json({ ok: false, error: "projectKey fehlt" });
    }

    const fsKey = await resolveProjectFsKey(inputKey);
    ensureProjectStructure(fsKey);

    const out = buildLinking(fsKey);

    let sollSum = 0;
    let istSum = 0;
    let offenNachtragEUR = 0;
    let abrechenbarEUR = 0;

    for (const row of out.rows) {
      sollSum += safeNum(row.soll);
      istSum += safeNum(row.ist);
      abrechenbarEUR += safeNum(row.ist) * safeNum(row.ep);

      if (safeNum(row.diff) > 0 && !row.nachtragNr) {
        offenNachtragEUR += safeNum(row.diff) * safeNum(row.ep);
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
      kpi: {
        sollSum: round2(sollSum),
        istSum: round2(istSum),
        offenNachtragEUR: round2(offenNachtragEUR),
        abrechenbarEUR: round2(abrechenbarEUR),
      },
      items: out.rows,
      sourceSollIstFile,
    });
  } catch (e: any) {
    console.error("[verknuepfung:list:GET]", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Verknüpfung konnte nicht geladen werden",
    });
  }
});

/**
 * GET /api/verknuepfung/nachtraege/:projectKey
 */
r.get("/verknuepfung/nachtraege/:projectKey", async (req, res) => {
  try {
    const inputKey = s(req.params.projectKey);
    if (!inputKey) {
      return res.status(400).json({ ok: false, error: "projectKey fehlt" });
    }

    const fsKey = /^BA[-_]/i.test(inputKey) ? safeFsKey(inputKey) : await resolveProjectFsKey(inputKey);
    const f = ensureProjectStructure(fsKey);
    const data = readJson<{ items: Nachtrag[] }>(f.nachtraege, { items: [] });
    const items = Array.isArray(data.items) ? data.items : [];

    return res.json({
      ok: true,
      projectKey: inputKey,
      fsKey,
      items,
    });
  } catch (e: any) {
    console.error("[verknuepfung:nachtraege:GET]", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Nachträge konnten nicht geladen werden",
    });
  }
});

/**
 * PUT /api/verknuepfung/nachtraege/:projectKey
 * body: { items: Nachtrag[] }
 */
r.put("/verknuepfung/nachtraege/:projectKey", async (req, res) => {
  try {
    const inputKey = s(req.params.projectKey);
    if (!inputKey) {
      return res.status(400).json({ ok: false, error: "projectKey fehlt" });
    }

    const fsKey = await resolveProjectFsKey(inputKey);
    ensureProjectStructure(fsKey);

    const incoming: any[] = Array.isArray(req.body?.items)
      ? req.body.items
      : [];

    const existing = readNachtraege(fsKey);

    const cleaned: Nachtrag[] = incoming
      .map((x) => normalizeNachtrag(x, fsKey, existing))
      .filter(
        (n) =>
          s(n.lvPos).length > 0 ||
          String(n.title || "").trim().length > 0 ||
          String(n.langtext || "").trim().length > 0 ||
          String(n.note || "").trim().length > 0
      );

    writeNachtraege(fsKey, cleaned);

    return res.json({
      ok: true,
      projectKey: inputKey,
      fsKey,
      items: cleaned,
      count: cleaned.length,
    });
  } catch (e: any) {
    console.error("[verknuepfung:nachtraege:PUT]", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Nachträge konnten nicht gespeichert werden",
    });
  }
});

/**
 * POST /api/verknuepfung/nachtrag/:projectKey
 * body: { lvPos: string[] }
 */
r.post("/verknuepfung/nachtrag/:projectKey", async (req, res) => {
  try {
    const inputKey = s(req.params.projectKey);
    const lvPos: string[] = Array.isArray(req.body?.lvPos)
      ? req.body.lvPos
      : [];

    if (!inputKey) {
      return res.status(400).json({ ok: false, error: "projectKey fehlt" });
    }

    if (!lvPos.length) {
      return res.status(400).json({ ok: false, error: "lvPos[] fehlt" });
    }

    const fsKey = await resolveProjectFsKey(inputKey);
    ensureProjectStructure(fsKey);

    const nachtraege = readNachtraege(fsKey);
    const sollRows = readSollIstRows(fsKey);

    const byPos = new Map<string, SollIstRow>();
    for (const row of sollRows) byPos.set(s(row.pos), row);

    const created: Nachtrag[] = [];
    const now = new Date().toISOString();

    for (const pos of lvPos.map((x) => s(x)).filter(Boolean)) {
      const row = byPos.get(pos);
      if (!row) continue;

      const diff = safeNum(row.ist) - safeNum(row.soll);
      if (diff <= 0) continue;

      const exists = nachtraege.find(
        (n) => s(n.lvPos) === pos && n.status !== "abgelehnt"
      );

      if (exists) continue;

      const ep = safeNum(row.ep);

      const nt: Nachtrag = {
        id: rid(),
        projectKey: fsKey,
        lvPos: pos,
        number: nextNachtragNumber([...nachtraege, ...created]),
        title: `Nachtrag zu LV ${pos}`,
        langtext: "",
        qty: diff,
        unit: String(row.unit || "m"),
        ep,
        total: round2(diff * ep),
        status: "offen",
        note: `Automatisch erstellt aus Soll/Ist. Differenz: ${diff}`,
        createdAt: now,
        updatedAt: now,
      };

      created.push(nt);
    }

    const next = [...created, ...nachtraege];
    writeNachtraege(fsKey, next);

    return res.json({
      ok: true,
      projectKey: inputKey,
      fsKey,
      created,
      items: next,
    });
  } catch (e: any) {
    console.error("[verknuepfung:nachtrag:POST]", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Nachtrag konnte nicht erstellt werden",
    });
  }
});

/**
 * POST /api/verknuepfung/freigeben/:projectKey
 */
r.post("/verknuepfung/freigeben/:projectKey", async (req, res) => {
  try {
    const inputKey = s(req.params.projectKey);
    if (!inputKey) {
      return res.status(400).json({ ok: false, error: "projectKey fehlt" });
    }

    const fsKey = await resolveProjectFsKey(inputKey);
    ensureProjectStructure(fsKey);

    const nachtragIds: string[] = Array.isArray(req.body?.nachtragIds)
      ? req.body.nachtragIds
      : [];

    const lvPos: string[] = Array.isArray(req.body?.lvPos)
      ? req.body.lvPos
      : [];

    const idSet = new Set(nachtragIds.map(String));
    const posSet = new Set(lvPos.map((x) => s(x)));

    const now = new Date().toISOString();
    let updated = 0;

    const next = readNachtraege(fsKey).map((n) => {
      const match =
        (n.id && idSet.has(String(n.id))) ||
        (n.lvPos && posSet.has(s(n.lvPos)));

      if (!match) return n;

      updated += 1;

      return {
        ...n,
        status: "freigegeben" as NachtragStatus,
        updatedAt: now,
      };
    });

    writeNachtraege(fsKey, next);

    return res.json({
      ok: true,
      projectKey: inputKey,
      fsKey,
      updated,
      items: next,
    });
  } catch (e: any) {
    console.error("[verknuepfung:freigeben:POST]", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Nachträge konnten nicht freigegeben werden",
    });
  }
});

/**
 * POST /api/verknuepfung/abschlag/:projectKey
 * body: { lvPos: string[], nr?: number | null }
 */
r.post("/verknuepfung/abschlag/:projectKey", async (req, res) => {
  try {
    const inputKey = s(req.params.projectKey);
    const lvPos: string[] = Array.isArray(req.body?.lvPos)
      ? req.body.lvPos
      : [];

    const wantedNr =
      req.body?.nr !== undefined && req.body?.nr !== null
        ? Number(req.body.nr)
        : null;

    if (!inputKey) {
      return res.status(400).json({ ok: false, error: "projectKey fehlt" });
    }

    if (!lvPos.length) {
      return res.status(400).json({ ok: false, error: "lvPos[] fehlt" });
    }

    const fsKey = await resolveProjectFsKey(inputKey);
    ensureProjectStructure(fsKey);

    const sollRows = readSollIstRows(fsKey);
    const byPos = new Map<string, SollIstRow>();

    for (const row of sollRows) byPos.set(s(row.pos), row);

    const { items: abItems, file } = readAbschlaegeArray(fsKey);

    let abschlag: AbschlagItem | null = null;

    if (wantedNr && Number.isFinite(wantedNr) && wantedNr > 0) {
      abschlag =
        (abItems || []).find((a) => Number(a.nr) === wantedNr) || null;
    }

    if (!abschlag) {
      const maxNr = (abItems || []).reduce(
        (m, a) => Math.max(m, Number(a.nr) || 0),
        0
      );

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
      abschlag.rows = Array.isArray(abschlag.rows) ? abschlag.rows : [];
      if (!abschlag.mwst && abschlag.mwst !== 0) abschlag.mwst = 19;
      if (!abschlag.status) abschlag.status = "Entwurf";
      if (!abschlag.date) abschlag.date = todayIso();
      if (!abschlag.title) {
        abschlag.title = `Abschlagsrechnung ${abschlag.nr}`;
      }
    }

    const selSet = new Set(lvPos.map((x) => s(x)).filter(Boolean));

    abschlag.rows = (abschlag.rows || []).filter(
      (row) => !selSet.has(s(row.lvPos))
    );

    for (const pos of selSet) {
      const row = byPos.get(pos);
      if (!row) continue;

      const qty = safeNum(row.ist);
      const ep = safeNum(row.ep);
      const total = round2(qty * ep);

      abschlag.rows.push({
        lvPos: pos,
        kurztext: String(row.text || ""),
        einheit: String(row.unit || ""),
        qty,
        ep,
        total,
      });
    }

    recalcAbschlagTotals(abschlag);
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
  } catch (e: any) {
    console.error("[verknuepfung:abschlag:POST]", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Abschlag konnte nicht erstellt werden",
    });
  }
});

export default r;
