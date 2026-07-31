// apps/server/src/routes/cad.ts
import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";

const r = Router();

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

type DrawingIndexItem = {
  id: string;
  drawingName: string;
  fileName: string;
  storageFile: string;
  objectCount: number;
  createdAt: string;
  updatedAt: string;
};

type DrawingIndex = {
  version: 1;
  activeDrawingId?: string;
  drawings: DrawingIndexItem[];
};

function ensureDir(target: string) {
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
}

function safeSegment(value: unknown, fallback: string) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
  return normalized || fallback;
}

function safeProjectId(value: unknown) {
  return safeSegment(value, "");
}

function projectDir(projectId: string) {
  const safeId = safeProjectId(projectId);
  if (!safeId) throw new Error("projectId missing");
  const dir = path.join(PROJECTS_ROOT, safeId);
  ensureDir(dir);
  return dir;
}

function drawingsDir(projectId: string) {
  const dir = path.join(projectDir(projectId), "cad", "drawings");
  ensureDir(dir);
  return dir;
}

function indexFile(projectId: string) {
  return path.join(drawingsDir(projectId), "index.json");
}

function legacyCadFile(projectId: string) {
  return path.join(projectDir(projectId), "cad.json");
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file: string, value: unknown) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), "utf-8");
  fs.renameSync(temp, file);
}

function featureCount(data: any): number {
  const candidates = [
    data?.features,
    data?.data?.features,
    data?.document?.features,
    data?.drawing?.features,
    data?.takeoff?.features,
  ];
  const features = candidates.find(Array.isArray);
  return Array.isArray(features) ? features.length : 0;
}

function drawingStorageFile(value: unknown) {
  const safe = safeSegment(value, "zeichnung");
  return safe.toLowerCase().endsWith(".json") ? safe : `${safe}.json`;
}

function normalizeIndex(raw: any): DrawingIndex {
  const source = Array.isArray(raw?.drawings) ? raw.drawings : [];
  const drawings = source
    .map((item: any): DrawingIndexItem | null => {
      const id = safeSegment(item?.id, "");
      if (!id) return null;
      const now = new Date().toISOString();
      return {
        id,
        drawingName: String(item?.drawingName || item?.name || "Zeichnung"),
        fileName: String(
          item?.fileName || `${safeSegment(item?.drawingName, id)}.rlccad.json`
        ),
        storageFile: drawingStorageFile(item?.storageFile || id),
        objectCount: Number.isFinite(Number(item?.objectCount))
          ? Number(item.objectCount)
          : 0,
        createdAt: String(item?.createdAt || item?.updatedAt || now),
        updatedAt: String(item?.updatedAt || item?.createdAt || now),
      };
    })
    .filter((item: DrawingIndexItem | null): item is DrawingIndexItem =>
      Boolean(item)
    );

  return {
    version: 1,
    activeDrawingId: safeSegment(raw?.activeDrawingId, "") || undefined,
    drawings,
  };
}

function readIndex(projectId: string): DrawingIndex {
  return normalizeIndex(readJson(indexFile(projectId), { version: 1, drawings: [] }));
}

function writeIndex(projectId: string, index: DrawingIndex) {
  writeJsonAtomic(indexFile(projectId), {
    version: 1,
    activeDrawingId: index.activeDrawingId,
    drawings: index.drawings,
  });
}

function drawingFile(projectId: string, item: DrawingIndexItem) {
  return path.join(
    drawingsDir(projectId),
    drawingStorageFile(item.storageFile || item.id)
  );
}

function findDrawing(
  index: DrawingIndex,
  selector: {
    drawingId?: unknown;
    drawingName?: unknown;
    fileName?: unknown;
  }
) {
  const drawingId = String(selector.drawingId ?? "").trim();
  const drawingName = String(selector.drawingName ?? "").trim();
  const fileName = String(selector.fileName ?? "").trim();

  if (drawingId) {
    const safeId = safeSegment(drawingId, "");
    const byId = index.drawings.find((item) => item.id === safeId);
    if (byId) return byId;
  }
  if (drawingName) {
    const byName = index.drawings.find(
      (item) => item.drawingName.toLowerCase() === drawingName.toLowerCase()
    );
    if (byName) return byName;
  }
  if (fileName) {
    const byFile = index.drawings.find(
      (item) => item.fileName.toLowerCase() === fileName.toLowerCase()
    );
    if (byFile) return byFile;
  }
  return null;
}

function migrateLegacyCad(projectId: string): DrawingIndex {
  const current = readIndex(projectId);
  if (current.drawings.length) return current;

  const legacyFile = legacyCadFile(projectId);
  if (!fs.existsSync(legacyFile)) return current;

  const data = readJson<any>(legacyFile, null);
  if (!data) return current;

  const now = new Date().toISOString();
  const drawingName = String(data?.drawingName || "Zeichnung 1").trim() || "Zeichnung 1";
  const requestedId = String(data?.drawingId || "").trim();
  const id = safeSegment(requestedId || drawingName, `zeichnung_${Date.now()}`);
  const fileName =
    String(data?.fileName || "").trim() ||
    `${safeSegment(drawingName, id)}.rlccad.json`;

  const item: DrawingIndexItem = {
    id,
    drawingName,
    fileName,
    storageFile: drawingStorageFile(id),
    objectCount: featureCount(data),
    createdAt: now,
    updatedAt: now,
  };

  const migratedData = {
    ...data,
    drawingId: id,
    drawingName,
    fileName,
  };

  writeJsonAtomic(drawingFile(projectId, item), migratedData);
  const migrated: DrawingIndex = {
    version: 1,
    activeDrawingId: id,
    drawings: [item],
  };
  writeIndex(projectId, migrated);
  return migrated;
}

function listDrawings(req: Request, res: Response) {
  try {
    const projectId = String(req.query.projectId || "");
    if (!projectId) {
      return res.status(400).json({ ok: false, error: "projectId missing" });
    }

    const index = migrateLegacyCad(projectId);
    const drawings = [...index.drawings].sort((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt))
    );

    return res.json({
      ok: true,
      activeDrawingId: index.activeDrawingId || null,
      drawings,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

function loadDrawing(req: Request, res: Response) {
  try {
    const projectId = String(req.query.projectId || "");
    if (!projectId) {
      return res.status(400).json({ ok: false, error: "projectId missing" });
    }

    const index = migrateLegacyCad(projectId);
    const requested = findDrawing(index, {
      drawingId: req.query.drawingId || req.params.drawingId,
      drawingName: req.query.drawingName,
      fileName: req.query.fileName,
    });

    const selected =
      requested ||
      index.drawings.find((item) => item.id === index.activeDrawingId) ||
      index.drawings[0] ||
      null;

    if (!selected) {
      return res.json({ ok: true, data: null });
    }

    const file = drawingFile(projectId, selected);
    if (!fs.existsSync(file)) {
      return res.status(404).json({
        ok: false,
        error: "drawing file missing",
        drawingId: selected.id,
      });
    }

    const data = readJson<any>(file, null);
    if (!data) {
      return res.status(500).json({
        ok: false,
        error: "drawing file invalid",
        drawingId: selected.id,
      });
    }

    return res.json({
      ok: true,
      data: {
        ...data,
        drawingId: selected.id,
        drawingName: selected.drawingName,
        fileName: selected.fileName,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

function saveDrawing(req: Request, res: Response, forceCreateNew: boolean) {
  try {
    const body = req.body || {};
    const projectId = String(body.projectId || "");
    const data = body.data ?? body.document ?? body.drawing ?? null;

    if (!projectId) {
      return res.status(400).json({ ok: false, error: "projectId missing" });
    }
    if (!data || typeof data !== "object") {
      return res.status(400).json({ ok: false, error: "data missing" });
    }

    const index = migrateLegacyCad(projectId);
    const now = new Date().toISOString();
    const drawingName =
      String(body.drawingName || data.drawingName || "Zeichnung").trim() ||
      "Zeichnung";
    const fileName =
      String(body.fileName || data.fileName || "").trim() ||
      `${safeSegment(drawingName, "zeichnung")}.rlccad.json`;

    const requestedId = String(body.drawingId || data.drawingId || "").trim();
    let id = safeSegment(requestedId || drawingName, `zeichnung_${Date.now()}`);

    const createNew = forceCreateNew || body.createNew === true;

    // Old clients may call /save without drawingId. Reuse the active drawing.
    if (!requestedId && !createNew && index.activeDrawingId) {
      id = index.activeDrawingId;
    }

    let existing = index.drawings.find((item) => item.id === id);
    if (createNew && existing) {
      id = `${id}_${Date.now().toString(36)}`;
      existing = undefined;
    }

    const item: DrawingIndexItem = {
      id,
      drawingName,
      fileName,
      storageFile: drawingStorageFile(id),
      objectCount: featureCount(data),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const storedData = {
      ...data,
      drawingId: id,
      drawingName,
      fileName,
    };

    writeJsonAtomic(drawingFile(projectId, item), storedData);

    const nextDrawings = [
      item,
      ...index.drawings.filter((entry) => entry.id !== id),
    ];
    const nextIndex: DrawingIndex = {
      version: 1,
      activeDrawingId: id,
      drawings: nextDrawings,
    };
    writeIndex(projectId, nextIndex);

    // Legacy compatibility: /api/cad/load without drawingId still returns the active drawing.
    writeJsonAtomic(legacyCadFile(projectId), storedData);

    return res.json({
      ok: true,
      drawingId: id,
      drawingName,
      fileName,
      objectCount: item.objectCount,
      created: !existing,
      updatedAt: now,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

r.get(["/drawings", "/list", "/files"], listDrawings);
r.get("/drawings/:drawingId", loadDrawing);
r.get("/load", loadDrawing);

r.post("/save", (req, res) => saveDrawing(req, res, false));
r.post("/save-as", (req, res) => saveDrawing(req, res, true));

// export for Aufmaß/Massenermittlung
r.post("/export-aufmass", (req, res) => {
  try {
    const { projectId, data } = req.body || {};
    if (!projectId) {
      return res.status(400).json({ ok: false, error: "projectId missing" });
    }
    const dir = projectDir(String(projectId));
    const file = path.join(dir, "cad-export.json");
    writeJsonAtomic(file, data);
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

export default r;
