// apps/server/src/routes/gps.ts
import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeProjectId(v: any) {
  const s = String(v || "").trim();
  return s.replace(/[^a-zA-Z0-9._-]/g, "");
}

function safeFilename(v: any) {
  const s = String(v || "")
    .trim()
    // sostituisce tutto ciò che non è "safe" con underscore
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 180);

  // evita filename vuoto
  return s || "gpszuweisung.pdf";
}

function gpsDir(projectId: string) {
  return path.join(PROJECTS_ROOT, projectId, "gps");
}

function assignmentsFile(projectId: string) {
  return path.join(PROJECTS_ROOT, projectId, "gps-assignments.json");
}

function readJson<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(p: string, data: any) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

type GpsPoint = { lat: number; lng: number; ts?: number };

type Assignment = {
  id: string;
  projectId: string; // FS key, es. BA-2025-DEMO
  lvPosId: string; // DB LVPosition.id
  points: GpsPoint[];
  createdAt: number;
  lvPos?: any;
};

/* =========================
   ASSIGNMENTS (EXISTING)
========================= */

router.get("/list", (req, res) => {
  const projectId = safeProjectId((req.query as any).projectId);
  if (!projectId)
    return res.status(400).json({ ok: false, error: "projectId fehlt" });

  const p = assignmentsFile(projectId);
  const items = readJson<Assignment[]>(p, []);
  return res.json({ ok: true, items });
});

router.post("/assign", (req, res) => {
  const body = req.body as Assignment;

  const projectId = safeProjectId(body?.projectId);
  if (!projectId)
    return res.status(400).json({ ok: false, error: "projectId fehlt" });
  if (!body?.id)
    return res.status(400).json({ ok: false, error: "id fehlt" });
  if (!body?.lvPosId)
    return res.status(400).json({ ok: false, error: "lvPosId fehlt" });
  if (!Array.isArray(body?.points) || body.points.length === 0)
    return res.status(400).json({ ok: false, error: "points fehlen" });

  const p = assignmentsFile(projectId);
  const items = readJson<Assignment[]>(p, []);

  const item: Assignment = {
    ...body,
    projectId,
    createdAt: Number(body.createdAt || Date.now()),
  };

  const idx = items.findIndex((x) => x.id === item.id);
  if (idx >= 0) items[idx] = item;
  else items.unshift(item);

  writeJson(p, items);
  return res.json({ ok: true, item });
});

router.delete("/delete", (req, res) => {
  const projectId = safeProjectId((req.query as any).projectId);
  const id = String((req.query as any).id || "").trim();

  if (!projectId)
    return res.status(400).json({ ok: false, error: "projectId fehlt" });
  if (!id) return res.status(400).json({ ok: false, error: "id fehlt" });

  const p = assignmentsFile(projectId);
  const items = readJson<Assignment[]>(p, []);
  const next = items.filter((x) => x.id !== id);

  writeJson(p, next);
  return res.json({ ok: true });
});

/* =========================
   PDF EXPORT (NEW)
========================= */

/**
 * POST /api/gps/export-pdf
 * Body: { projectId: string, filenameHint?: string, pdfDataUrl: string }
 * -> salva /data/projects/<projectId>/gps/<filename>.pdf
 */
router.post("/export-pdf", (req, res) => {
  try {
    const projectId = safeProjectId(req.body?.projectId);
    const filenameHint = String(req.body?.filenameHint || "gpszuweisung.pdf");
    const pdfDataUrl = String(req.body?.pdfDataUrl || "");

    if (!projectId)
      return res.status(400).json({ ok: false, error: "projectId fehlt" });

    if (!pdfDataUrl.startsWith("data:application/pdf;base64,")) {
      return res
        .status(400)
        .json({ ok: false, error: "pdfDataUrl invalid" });
    }

    const base64 = pdfDataUrl.split(",")[1] || "";
    const buf = Buffer.from(base64, "base64");
    if (!buf || buf.length < 10) {
      return res.status(400).json({ ok: false, error: "pdf leer" });
    }

    const dir = gpsDir(projectId);
    ensureDir(dir);

    // filename safe + garantisce estensione .pdf
    let filename = safeFilename(filenameHint);
    if (!filename.toLowerCase().endsWith(".pdf")) filename += ".pdf";

    // path traversal protection
    const abs = path.join(dir, filename);
    const resolvedDir = path.resolve(dir);
    const resolvedAbs = path.resolve(abs);
    if (!resolvedAbs.startsWith(resolvedDir + path.sep)) {
      return res.status(400).json({ ok: false, error: "bad filename" });
    }

    fs.writeFileSync(resolvedAbs, buf);

    const url = `/api/gps/pdf?projectId=${encodeURIComponent(
      projectId
    )}&filename=${encodeURIComponent(filename)}`;

    return res.json({ ok: true, filename, url });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * GET /api/gps/pdf?projectId=...&filename=...
 * -> restituisce PDF inline
 */
router.get("/pdf", (req, res) => {
  try {
    const projectId = safeProjectId((req.query as any).projectId);
    const filename = safeFilename((req.query as any).filename);

    if (!projectId) return res.status(400).send("projectId fehlt");
    if (!filename) return res.status(400).send("filename fehlt");

    const dir = gpsDir(projectId);
    const abs = path.join(dir, filename);

    const resolvedDir = path.resolve(dir);
    const resolvedAbs = path.resolve(abs);
    if (!resolvedAbs.startsWith(resolvedDir + path.sep)) {
      return res.status(400).send("bad filename");
    }

    if (!fs.existsSync(resolvedAbs)) return res.status(404).send("not found");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    fs.createReadStream(resolvedAbs).pipe(res);
  } catch (e: any) {
    return res.status(500).send(String(e?.message || e));
  }
});

/**
 * GET /api/gps/pdfs?projectId=...
 * -> lista PDF salvati in /gps
 */
router.get("/pdfs", (req, res) => {
  try {
    const projectId = safeProjectId((req.query as any).projectId);
    if (!projectId)
      return res.status(400).json({ ok: false, error: "projectId fehlt" });

    const dir = gpsDir(projectId);
    ensureDir(dir);

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .map((f) => {
        const abs = path.join(dir, f);
        const st = fs.statSync(abs);
        return {
          name: f,
          size: st.size,
          mtime: st.mtimeMs,
          url: `/api/gps/pdf?projectId=${encodeURIComponent(
            projectId
          )}&filename=${encodeURIComponent(f)}`,
        };
      })
      .sort((a, b) => b.mtime - a.mtime);

    return res.json({ ok: true, items: files });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
