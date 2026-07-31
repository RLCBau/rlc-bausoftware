// apps/server/src/routes/sollist.ts
import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";

const router = Router();

/**
 * Salvataggio unter:
 *   data/projects/<fsProjectKey>/sollist.json
 *
 * fsProjectKey:
 *   - bevorzugt: project.code (z.B. "BA-2025-DEMO")
 *   - fallback: der übergebene projectId/code (gesäubert)
 */
const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

fs.mkdirSync(PROJECTS_ROOT, { recursive: true });

type SollIstRow = {
  pos: string;
  text: string;
  unit: string;
  soll: number;
  ist: number;
  ep: number;
};

type Snapshot = {
  ts: number;
  rows: SollIstRow[];
};

type FileFormat = {
  rows: SollIstRow[];   // aktueller Stand
  history: Snapshot[];  // Verlauf (inkl. rows)
};

type HistoryEntryDto = {
  ts: number;
  count: number;
};

/**
 * Ermittelt den Ordnernamen im Filesystem:
 * 1. Versucht Projekt zuerst über ID, dann über CODE zu finden.
 * 2. Wenn Projekt gefunden und code vorhanden → sanitize(code).
 * 3. Sonst fallback: sanitize(idOrCode).
 */
async function getFsProjectKey(idOrCode: string): Promise<string> {
  const clean = idOrCode.trim();

  // 1) Versuch: nach ID
  let project =
    (await prisma.project.findUnique({
      where: { id: clean },
      select: { id: true, code: true },
    })) ||
    // 2) Versuch: nach CODE
    (await prisma.project.findFirst({
      where: { code: clean },
      select: { id: true, code: true },
    }));

  if (project?.code) {
    const fsKey = project.code.replace(/[^A-Za-z0-9_\-]/g, "_");
    console.log("[sollist] FS key from project.code:", {
      input: clean,
      fsKey,
    });
    return fsKey;
  }

  // Fallback: direkt den Parameter säubern
  const fsKey = clean.replace(/[^A-Za-z0-9_\-]/g, "_");
  console.log("[sollist] FS key fallback (no project found):", {
    input: clean,
    fsKey,
  });
  return fsKey;
}

function getFilePath(fsKey: string) {
  return path.join(PROJECTS_ROOT, fsKey, "sollist.json");
}

function readFile(fsKey: string): FileFormat {
  const file = getFilePath(fsKey);
  if (!fs.existsSync(file)) {
    return { rows: [], history: [] };
  }
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<FileFormat>;
    return {
      rows: Array.isArray(parsed.rows) ? (parsed.rows as SollIstRow[]) : [],
      history: Array.isArray(parsed.history)
        ? (parsed.history as Snapshot[])
        : [],
    };
  } catch (e) {
    console.warn("[sollist] Datei fehlerhaft, starte leer:", e);
    return { rows: [], history: [] };
  }
}

function writeFile(fsKey: string, data: FileFormat) {
  const dir = path.join(PROJECTS_ROOT, fsKey);
  fs.mkdirSync(dir, { recursive: true });
  const file = getFilePath(fsKey);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

/**
 * GET /api/sollist/:projectId
 * Optional: ?ts=123456 → liefert Snapshot zu diesem Zeitstempel
 *
 * Antwort:
 * {
 *   ok: true,
 *   rows: SollIstRow[],
 *   history: { ts:number, count:number }[]
 * }
 */
router.get("/:projectId", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId;
    if (!projectId) {
      return res
        .status(400)
        .json({ ok: false, error: "projectId fehlt in URL" });
    }

    const fsKey = await getFsProjectKey(projectId);
    console.log("[sollist] GET", { projectId, fsKey });

    const store = readFile(fsKey);
    const tsParam = req.query.ts ? Number(req.query.ts) : undefined;

    let rows: SollIstRow[] = store.rows;

    if (tsParam && Number.isFinite(tsParam)) {
      const snap = store.history.find((h) => h.ts === tsParam);
      if (snap && Array.isArray(snap.rows)) {
        rows = snap.rows;
      }
    }

    const historyDto: HistoryEntryDto[] = (store.history || []).map((h) => ({
      ts: h.ts,
      count: Array.isArray(h.rows) ? h.rows.length : 0,
    }));

    return res.json({
      ok: true,
      rows,
      history: historyDto,
    });
  } catch (err) {
    console.error("GET /api/sollist/:projectId error:", err);
    return res.status(500).json({
      ok: false,
      error: "Fehler beim Laden Soll-Ist",
    });
  }
});

/**
 * POST /api/sollist/:projectId/save
 * Body: { rows: SollIstRow[] }
 *
 * Speichert aktuellen Stand + fügt Snapshot im Verlauf hinzu.
 */
router.post("/:projectId/save", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId;
    if (!projectId) {
      return res
        .status(400)
        .json({ ok: false, error: "projectId fehlt in URL" });
    }

    const fsKey = await getFsProjectKey(projectId);
    console.log("[sollist] SAVE", { projectId, fsKey });

    const rows = (req.body?.rows as SollIstRow[]) || [];
    const data = readFile(fsKey);

    const ts = Date.now();
    const snap: Snapshot = { ts, rows };

    // aktuellen Stand setzen
    data.rows = rows;

    // Verlauf ergänzen
    data.history = [...(data.history || []), snap];

    // optional: Verlauf begrenzen (z.B. letzte 50 Stände)
    const MAX_HISTORY = 50;
    if (data.history.length > MAX_HISTORY) {
      data.history = data.history.slice(data.history.length - MAX_HISTORY);
    }

    writeFile(fsKey, data);

    const historyDto: HistoryEntryDto[] = data.history.map((h) => ({
      ts: h.ts,
      count: Array.isArray(h.rows) ? h.rows.length : 0,
    }));

    return res.json({
      ok: true,
      savedAt: ts,
      history: historyDto,
    });
  } catch (err) {
    console.error("POST /api/sollist/:projectId/save error:", err);
    return res.status(500).json({
      ok: false,
      error: "Fehler beim Speichern Soll-Ist",
    });
  }
});

export default router;
