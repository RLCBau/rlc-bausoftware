// apps/server/src/routes/aufmass.ts
import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { PROJECTS_ROOT } from "../lib/projectsRoot";

/* ============================================================
   AUFMASS ROUTES

   Legacy store:
     data/projects/_aufmass_store.json
       GET    /                 ?project=...
       POST   /row
       PUT    /row/:id
       POST   /save
       GET    /history/:project/:id

   New files per project (projectKey = code, e.g. BA-2025-DEMO):
     data/projects/<projectKey>/aufmass.json
     data/projects/<projectKey>/aufmass-history.json
     data/projects/<projectKey>/soll-ist.json   <-- AufmassEditor / Verknüpfung leggono questo
     POST /soll-ist/:projectId/append           <-- CADViewer usa questo
     POST /add-from-cad                         <-- compat (scrive in soll-ist)

   IMPORTANT:
   - In manchen Frontend-Modulen wird statt project.code versehentlich project.id (UUID) gesendet.
     Dann landen die Dateien in data/projects/<UUID>/...
   - Dieser Router löst das robust, indem er UUID -> Projektordner (code) auflöst,
     sofern in data/projects/<code>/project.json (oder meta.json) die id enthalten ist.
   - Zusätzlich wird beim Lesen ein Merge gemacht, falls Daten sowohl unter <code> als auch <uuid> existieren.
   - ✅ FIX (2026-01): Merge jetzt auch umgekehrt robust:
       Wenn Frontend mit code liest, aber früher unter UUID gespeichert wurde,
       werden UUID-Ordner anhand meta/project.json (code/projectCode) automatisch als Kandidat hinzugefügt.
   ============================================================ */

const router = Router();

/* =========================
   1) LEGACY AUFMASS STORE
   ========================= */

type HistoryEntry = {
  ts: number;
  ist: number;
  formula?: string;
};

export type AufmassRow = {
  id: string; // es. "001.001"
  pos: string; // alias
  kurztext: string;
  einheit: string;
  lvSoll: number;
  ist: number;
  ep: number;
  formula?: string;
  total?: number;
  history?: HistoryEntry[];
};

type Store = { [projectId: string]: AufmassRow[] };

const dataFile = path.join(PROJECTS_ROOT, "_aufmass_store.json");

function readStore(): Store {
  try {
    if (!fs.existsSync(dataFile)) return {};
    const raw = fs.readFileSync(dataFile, "utf8");
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2), "utf8");
}

// GET legacy list
router.get("/", (req: Request, res: Response) => {
  const project = (req.query.project as string) || "";
  if (!project) return res.status(400).json({ error: "project mancante" });

  const store = readStore();
  const rows = (store[project] || []).map((r) => ({
    ...r,
    total: Number((Number(r.ist || 0) * Number(r.ep || 0)).toFixed(2)),
  }));
  res.json({ project, rows });
});

// POST create legacy row
router.post("/row", (req: Request, res: Response) => {
  const project = (req.body.project as string) || "";
  const row = req.body.row as AufmassRow;

  if (!project) return res.status(400).json({ error: "project mancante" });
  if (!row || !row.id) return res.status(400).json({ error: "row/id mancante" });

  const store = readStore();
  const list = store[project] || [];
  if (list.find((r) => r.id === row.id)) {
    return res.status(409).json({ error: "id già presente" });
  }

  const newRow: AufmassRow = {
    ...row,
    pos: row.id,
    lvSoll: row.lvSoll ?? 0,
    ist: row.ist ?? 0,
    ep: row.ep ?? 0,
    history: [],
  };

  list.push(newRow);
  store[project] = list;
  writeStore(store);

  res.json({ ok: true, row: newRow });
});

// PUT update legacy row + history
router.put("/row/:id", (req: Request, res: Response) => {
  const project = (req.body.project as string) || "";
  const id = req.params.id;
  const patch = req.body.patch as Partial<AufmassRow>;

  if (!project) return res.status(400).json({ error: "project mancante" });

  const store = readStore();
  const list = store[project] || [];
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return res.status(404).json({ error: "riga non trovata" });

  const old = list[idx];
  const updated: AufmassRow = { ...old, ...patch };
  if (!updated.history) updated.history = old.history || [];

  const changedIst = typeof patch.ist === "number" && patch.ist !== old.ist;
  const changedFormula = typeof patch.formula === "string" && patch.formula !== old.formula;

  if (changedIst || changedFormula) {
    updated.history!.push({
      ts: Date.now(),
      ist: Number(updated.ist || 0),
      formula: updated.formula,
    });
  }

  list[idx] = updated;
  store[project] = list;
  writeStore(store);

  res.json({
    ok: true,
    row: {
      ...updated,
      total: Number((Number(updated.ist || 0) * Number(updated.ep || 0)).toFixed(2)),
    },
  });
});

// GET legacy history
router.get("/history/:project/:id", (req: Request, res: Response) => {
  const project = req.params.project;
  const id = req.params.id;

  const store = readStore();
  const list = store[project] || [];
  const row = list.find((r) => r.id === id);
  if (!row) return res.status(404).json({ error: "riga non trovata" });

  res.json({ id, history: row.history || [] });
});

// POST legacy bulk save
router.post("/save", (req: Request, res: Response) => {
  const project = (req.body.project as string) || "";
  const rows = (req.body.rows as AufmassRow[]) || [];

  if (!project) return res.status(400).json({ error: "project mancante" });

  const store = readStore();
  store[project] = rows;
  writeStore(store);
  res.json({ ok: true, count: rows.length });
});

/* =========================
   Helpers: per-project files
   ========================= */

function safeProjectKey(input: string) {
  return String(input || "")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/[^A-Za-z0-9_\-]/g, "_");
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resolveCache = new Map<string, string>();

function tryReadJson(p: string): any | null {
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function listProjectDirs(): string[] {
  try {
    if (!fs.existsSync(PROJECTS_ROOT)) return [];
    const entries = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => !name.startsWith("_"));
  } catch {
    return [];
  }
}

/**
 * Resolve project directory key:
 * - If input is already an existing folder name -> use it
 * - If input looks like UUID -> scan all project dirs for project.json/meta.json containing this id
 * - Otherwise -> fallback to safeProjectKey(input)
 */
function resolveProjectKey(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return safeProjectKey(raw);

  const direct = safeProjectKey(raw);
  const directDir = path.join(PROJECTS_ROOT, direct);
  if (fs.existsSync(directDir)) return direct;

  if (resolveCache.has(raw)) return resolveCache.get(raw)!;

  if (UUID_RE.test(raw)) {
    const dirs = listProjectDirs();

    for (const d of dirs) {
      const pj = tryReadJson(path.join(PROJECTS_ROOT, d, "project.json"));
      const mj = tryReadJson(path.join(PROJECTS_ROOT, d, "meta.json"));

      const candidate = pj || mj;
      const cid = String(candidate?.id ?? candidate?.projectId ?? "").trim();
      const ccode = String(candidate?.code ?? candidate?.projectCode ?? "").trim();

      if (cid && cid === raw) {
        resolveCache.set(raw, d);
        return d;
      }
      // falls in manchen Files statt id nur code steht und raw==code
      if (ccode && safeProjectKey(ccode) === safeProjectKey(raw)) {
        resolveCache.set(raw, d);
        return d;
      }
    }
  }

  // fallback: sanitize
  resolveCache.set(raw, direct);
  return direct;
}

function projectDir(projectIdOrKey: string) {
  const key = resolveProjectKey(projectIdOrKey);
  const dir = path.join(PROJECTS_ROOT, key);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * If there are TWO folders (uuid + code) with data, we can merge reads:
 * - resolved folder (preferred)
 * - direct sanitized folder (raw->safeProjectKey)
 * - ✅ plus: "linked" folders found via meta/project.json matching code/id in BOTH directions
 */
function candidateProjectDirs(projectIdOrKey: string): string[] {
  const raw = String(projectIdOrKey || "").trim();
  const resolved = resolveProjectKey(raw);
  const direct = safeProjectKey(raw);

  const out: string[] = [];
  const rdir = path.join(PROJECTS_ROOT, resolved);
  const ddir = path.join(PROJECTS_ROOT, direct);

  if (fs.existsSync(rdir)) out.push(resolved);
  if (direct !== resolved && fs.existsSync(ddir)) out.push(direct);

  // ✅ NEW: bidirectional linking scan
  // If raw is CODE, include UUID folders whose meta/project.json have code == raw
  // If raw is UUID, include code folders already handled by resolveProjectKey, but we also add
  // any other folder whose meta/project.json has id == raw (in case folder name differs).
  try {
    const dirs = listProjectDirs();
    const rawKey = safeProjectKey(raw);

    for (const d of dirs) {
      const pj = tryReadJson(path.join(PROJECTS_ROOT, d, "project.json"));
      const mj = tryReadJson(path.join(PROJECTS_ROOT, d, "meta.json"));
      const candidate = pj || mj;
      if (!candidate) continue;

      const cid = String(candidate?.id ?? candidate?.projectId ?? "").trim();
      const ccode = String(candidate?.code ?? candidate?.projectCode ?? "").trim();

      // raw = UUID -> add any folder referencing this id
      if (UUID_RE.test(raw) && cid && cid === raw) {
        const dd = path.join(PROJECTS_ROOT, d);
        if (fs.existsSync(dd)) out.push(d);
      }

      // raw = CODE -> add any folder referencing this code
      if (!UUID_RE.test(raw) && ccode && safeProjectKey(ccode) === rawKey) {
        const dd = path.join(PROJECTS_ROOT, d);
        if (fs.existsSync(dd)) out.push(d);
      }
    }
  } catch {
    // ignore
  }

  // ensure at least one
  if (!out.length) out.push(resolved);

  // unique (preserve order)
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const k of out) {
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(k);
  }
  return uniq;
}

/* =========================
   1b) AUFMASS.JSON
   ========================= */

type AufmassJsonRow = {
  pos: string;
  text: string;
  unit: string;
  soll: number;
  ist: number;
  ep: number;
};

function aufmassFile(projectIdOrKey: string, keyOverride?: string) {
  const dirKey = keyOverride ?? resolveProjectKey(projectIdOrKey);
  return path.join(PROJECTS_ROOT, dirKey, "aufmass.json");
}

function readAufmass(projectIdOrKey: string): AufmassJsonRow[] {
  // merge from all candidate dirs (resolved first)
  const dirs = candidateProjectDirs(projectIdOrKey);
  const map = new Map<string, AufmassJsonRow>();

  for (const d of dirs) {
    const file = aufmassFile(projectIdOrKey, d);
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, "utf8");
      const rows: AufmassJsonRow[] = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(rows)) continue;

      for (const r of rows) {
        const pos = String(r?.pos ?? "").trim();
        if (!pos) continue;
        map.set(pos, {
          pos,
          text: String(r?.text ?? ""),
          unit: String(r?.unit ?? "m"),
          soll: Number(r?.soll ?? 0),
          ist: Number(r?.ist ?? 0),
          ep: Number(r?.ep ?? 0),
        });
      }
    } catch {
      // ignore
    }
  }

  return Array.from(map.values());
}

router.get("/aufmass/:projectId", (req: Request, res: Response) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: "projectId mancante" });

  try {
    const rows = readAufmass(projectId);
    return res.json({ projectId, rows });
  } catch (err) {
    console.error("READ aufmass.json error", err);
    return res.status(500).json({ error: "Lesefehler aufmass.json" });
  }
});

router.post("/aufmass/:projectId", (req: Request, res: Response) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: "projectId mancante" });

  const rows = (req.body?.rows as AufmassJsonRow[]) || [];

  try {
    const dir = projectDir(projectId);
    const file = path.join(dir, "aufmass.json");
    fs.writeFileSync(file, JSON.stringify(Array.isArray(rows) ? rows : [], null, 2), "utf8");

    // snapshot history (optional)
    const hist = readAufmassHistory(projectId);
    hist.history.push({ ts: Date.now(), rows: Array.isArray(rows) ? rows : [] });
    if (hist.history.length > 50) hist.history = hist.history.slice(-50);
    writeAufmassHistory(projectId, hist);

    return res.json({
      ok: true,
      projectId,
      count: Array.isArray(rows) ? rows.length : 0,
      historySnapshots: hist.history.length,
    });
  } catch (err) {
    console.error("WRITE aufmass.json error", err);
    return res.status(500).json({ error: "Schreibfehler aufmass.json" });
  }
});

/* =========================
   1c) AUFMASS-HISTORY.JSON
   ========================= */

type AufmassHistorySnapshot = { ts: number; rows: AufmassJsonRow[] };
type AufmassHistoryFile = { history: AufmassHistorySnapshot[] };

function aufmassHistoryFile(projectIdOrKey: string) {
  const dir = projectDir(projectIdOrKey);
  return path.join(dir, "aufmass-history.json");
}

function readAufmassHistory(projectIdOrKey: string): AufmassHistoryFile {
  try {
    const file = aufmassHistoryFile(projectIdOrKey);
    if (!fs.existsSync(file)) return { history: [] };

    const raw = fs.readFileSync(file, "utf8");
    const parsed = raw ? (JSON.parse(raw) as AufmassHistoryFile) : { history: [] };
    if (!parsed || !Array.isArray(parsed.history)) return { history: [] };
    return parsed;
  } catch {
    return { history: [] };
  }
}

function writeAufmassHistory(projectIdOrKey: string, data: AufmassHistoryFile) {
  const file = aufmassHistoryFile(projectIdOrKey);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

router.get("/aufmass-history/:projectId", (req: Request, res: Response) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: "projectId mancante" });

  try {
    const data = readAufmassHistory(projectId);
    return res.json({ projectId, history: data.history });
  } catch (err) {
    console.error("READ aufmass-history.json error", err);
    return res.status(500).json({ error: "Lesefehler aufmass-history.json" });
  }
});

router.post("/aufmass-history/:projectId", (req: Request, res: Response) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: "projectId mancante" });

  const rows = (req.body?.rows as AufmassJsonRow[]) || [];
  const ts = typeof req.body?.ts === "number" ? req.body.ts : Date.now();

  try {
    const data = readAufmassHistory(projectId);
    data.history.push({ ts, rows: Array.isArray(rows) ? rows : [] });
    if (data.history.length > 50) data.history = data.history.slice(-50);

    writeAufmassHistory(projectId, data);
    return res.json({
      ok: true,
      projectId,
      count: Array.isArray(rows) ? rows.length : 0,
      snapshots: data.history.length,
    });
  } catch (err) {
    console.error("WRITE aufmass-history.json error", err);
    return res.status(500).json({ error: "Schreibfehler aufmass-history.json" });
  }
});

/* =========================
   2) SOLL–IST
   ========================= */

export type SollIstRow = {
  pos: string;
  text: string;
  unit: string;
  soll: number;
  ist: number;
  ep: number;
};

function sollIstFile(projectIdOrKey: string, keyOverride?: string) {
  const dirKey = keyOverride ?? resolveProjectKey(projectIdOrKey);
  return path.join(PROJECTS_ROOT, dirKey, "soll-ist.json");
}

function readSollIst(projectIdOrKey: string): SollIstRow[] {
  const dirs = candidateProjectDirs(projectIdOrKey);
  const map = new Map<string, SollIstRow>();

  for (const d of dirs) {
    const file = sollIstFile(projectIdOrKey, d);
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, "utf8");
      const rows = raw ? (JSON.parse(raw) as SollIstRow[]) : [];
      if (!Array.isArray(rows)) continue;

      for (const r of rows) {
        const pos = String(r?.pos ?? "").trim();
        if (!pos) continue;

        const prev = map.get(pos);
        if (!prev) {
          map.set(pos, {
            pos,
            text: String(r?.text ?? ""),
            unit: String(r?.unit ?? "m"),
            soll: Number(r?.soll ?? 0),
            ist: Number(r?.ist ?? 0),
            ep: Number(r?.ep ?? 0),
          });
        } else {
          // merge: keep max ist, fill missing meta
          prev.ist = Math.max(Number(prev.ist || 0), Number(r?.ist ?? 0));
          if (!prev.text && r?.text) prev.text = String(r.text);
          if (!prev.unit && r?.unit) prev.unit = String(r.unit);
          if (!prev.ep && r?.ep) prev.ep = Number(r.ep);
          if (!prev.soll && r?.soll) prev.soll = Number(r.soll);
          map.set(pos, prev);
        }
      }
    } catch {
      // ignore
    }
  }

  return Array.from(map.values());
}

function writeSollIst(projectIdOrKey: string, rows: SollIstRow[]) {
  const dir = projectDir(projectIdOrKey);
  const file = path.join(dir, "soll-ist.json");
  fs.writeFileSync(file, JSON.stringify(Array.isArray(rows) ? rows : [], null, 2), "utf8");
}

router.get("/soll-ist/:projectId", (req: Request, res: Response) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: "projectId mancante" });

  try {
    const rows = readSollIst(projectId);
    return res.json({ projectId, rows });
  } catch (err) {
    console.error("READ soll-ist error", err);
    return res.status(500).json({ error: "Lesefehler soll-ist" });
  }
});

router.post("/soll-ist/:projectId", (req: Request, res: Response) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: "projectId mancante" });

  const rows = (req.body?.rows as SollIstRow[]) || [];

  try {
    writeSollIst(projectId, Array.isArray(rows) ? rows : []);
    return res.json({ ok: true, projectId, count: Array.isArray(rows) ? rows.length : 0 });
  } catch (err) {
    console.error("WRITE soll-ist error", err);
    return res.status(500).json({ error: "Schreibfehler soll-ist" });
  }
});

/* ============================================================
   2b) SOLL–IST APPEND (CAD / KI)
   POST /api/aufmass/soll-ist/:projectId/append
   body: { rows: Array<{ pos,text,unit, istDelta, ep?, soll? }> }
   ============================================================ */
router.post("/soll-ist/:projectId/append", (req: Request, res: Response) => {
  const projectId = req.params.projectId;
  if (!projectId) return res.status(400).json({ error: "projectId mancante" });

  // ✅ robust payload support (rows | row | items | data)
  const body: any = req.body || {};
  const incoming = Array.isArray(body?.rows)
    ? body.rows
    : body?.row && typeof body.row === "object"
      ? [body.row]
      : Array.isArray(body?.items)
        ? body.items
        : Array.isArray(body?.data)
          ? body.data
          : [];

  if (!incoming.length) return res.status(400).json({ error: "rows mancanti" });

  try {
    const current = readSollIst(projectId);

    const map = new Map<string, SollIstRow>();
    for (const r of current) {
      const key = String(r.pos ?? "").trim();
      if (!key) continue;
      map.set(key, {
        pos: String(r.pos ?? ""),
        text: String(r.text ?? ""),
        unit: String(r.unit ?? "m"),
        soll: Number(r.soll ?? 0),
        ist: Number(r.ist ?? 0),
        ep: Number(r.ep ?? 0),
      });
    }

    for (const x of incoming) {
      const pos = String(x?.pos ?? "").trim();
      if (!pos) continue;

      const istDelta = Number(x?.istDelta ?? x?.ist ?? 0);
      const text = String(x?.text ?? "");
      const unit = String(x?.unit ?? "m");
      const ep = Number(x?.ep ?? 0);
      const soll = Number(x?.soll ?? 0);

      const prev = map.get(pos);
      if (prev) {
        prev.ist = Number(prev.ist || 0) + (isFinite(istDelta) ? istDelta : 0);
        if (!prev.text && text) prev.text = text;
        if (!prev.unit && unit) prev.unit = unit;
        if (!prev.ep && ep) prev.ep = ep;
        if (!prev.soll && soll) prev.soll = soll;
        map.set(pos, prev);
      } else {
        map.set(pos, {
          pos,
          text: text || "Import",
          unit: unit || "m",
          soll: isFinite(soll) ? soll : 0,
          ist: isFinite(istDelta) ? istDelta : 0,
          ep: isFinite(ep) ? ep : 0,
        });
      }
    }

    const merged = Array.from(map.values());
    writeSollIst(projectId, merged);

    return res.json({ ok: true, projectId, count: merged.length });
  } catch (err) {
    console.error("APPEND soll-ist error", err);
    return res.status(500).json({ error: "Schreibfehler soll-ist append" });
  }
});

/* ============================================================
   2c) COMPAT: /add-from-cad
   body: { projectId, row:{pos,text,unit,qty} }
   -> scrive su soll-ist come istDelta
   ============================================================ */
router.post("/add-from-cad", (req: Request, res: Response) => {
  const projectId = String(req.body?.projectId ?? "").trim();
  const row = req.body?.row || null;

  if (!projectId) return res.status(400).json({ error: "projectId mancante" });
  if (!row) return res.status(400).json({ error: "row mancante" });

  const pos = String(row.pos ?? "").trim();
  const text = String(row.text ?? "CAD Import").trim();
  const unit = String(row.unit ?? "m").trim();
  const qty = Number(row.qty ?? 0);

  if (!pos) return res.status(400).json({ error: "pos mancante" });

  try {
    const current = readSollIst(projectId);

    // append style: merge by pos
    const map = new Map<string, SollIstRow>();
    for (const r of current) map.set(String(r.pos).trim(), r);

    const prev = map.get(pos);
    if (prev) {
      prev.ist = Number(prev.ist || 0) + (isFinite(qty) ? qty : 0);
      if (!prev.text && text) prev.text = text;
      if (!prev.unit && unit) prev.unit = unit;
      map.set(pos, prev);
    } else {
      map.set(pos, { pos, text, unit, soll: 0, ist: isFinite(qty) ? qty : 0, ep: 0 });
    }

    const merged = Array.from(map.values());
    writeSollIst(projectId, merged);

    return res.json({ ok: true, projectId, count: merged.length });
  } catch (err) {
    console.error("add-from-cad error", err);
    return res.status(500).json({ error: "Schreibfehler add-from-cad" });
  }
});

export default router;
