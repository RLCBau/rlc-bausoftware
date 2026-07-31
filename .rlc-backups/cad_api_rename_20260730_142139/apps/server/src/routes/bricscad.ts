import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";

import {
  readTakeoff,
  readUtmCsv,
  getBricscadPaths,
  openBricscad,
} from "../services/bricscad.service";
import { parseByExtension } from "../parsers";
import { parseDXFGeometry } from "../parsers/dxf";

const r = Router();

function getProjectId(req: Request) {
  return String(req.query.projectId || "").trim();
}

function jsonError(res: Response, status: number, message: string) {
  return res.status(status).json({ ok: false, message });
}


const cadUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 1,
  },
});

const ALLOWED_CAD_EXTENSIONS = new Set([
  ".dxf",
  ".dwg",
  ".csv",
  ".txt",
  ".xml",
  ".gsi",
  ".pdf",
]);

function safeProjectId(req: Request): string {
  const projectId = String(
    req.query.projectId ||
    req.body?.projectId ||
    ""
  ).trim();

  if (!projectId) {
    throw new Error("projectId fehlt.");
  }

  if (
    projectId.includes("..") ||
    projectId.includes("/") ||
    projectId.includes("\\") ||
    !/^[A-Za-z0-9._-]+$/.test(projectId)
  ) {
    throw new Error("Ungültige projectId.");
  }

  return projectId;
}

function safeFileName(name: string): string {
  const base = path.basename(String(name || "cad-datei"));
  const cleaned = base.replace(/[^A-Za-z0-9ÄÖÜäöüß._-]/g, "_");

  if (!cleaned || cleaned === "." || cleaned === "..") {
    return "cad-datei";
  }

  return cleaned;
}

function getUploadedFile(req: Request): Express.Multer.File | undefined {
  if (req.file) return req.file;

  const files = req.files;
  if (Array.isArray(files) && files.length) {
    return files[0];
  }

  if (files && typeof files === "object") {
    const groups = Object.values(files);
    for (const group of groups) {
      if (Array.isArray(group) && group.length) {
        return group[0];
      }
    }
  }

  return undefined;
}

function resolveStoredCadFile(
  projectId: string,
  requestedValue: unknown
): string | null {
  const paths = getBricscadPaths(projectId);
  const uploadDir = path.join(paths.bricscadDir, "uploads");

  const requested = String(requestedValue || "").trim();
  if (!requested) return null;

  const base = path.basename(requested);
  if (base !== requested) return null;

  const full = path.resolve(uploadDir, base);
  const uploadRoot = path.resolve(uploadDir) + path.sep;

  if (!full.startsWith(uploadRoot)) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;

  return full;
}

/**
 * CAD-Datei hochladen
 * POST /api/bricscad/upload?projectId=...
 *
 * Multipart-Feld kann "file", "cadFile", "upload" oder ein beliebiger
 * einzelner Dateiname sein.
 */
r.post(
  "/upload",
  cadUpload.any(),
  (req: Request, res: Response) => {
    try {
      const projectId = safeProjectId(req);
      const uploaded = getUploadedFile(req);

      if (!uploaded) {
        return jsonError(res, 400, "Keine CAD-Datei empfangen.");
      }

      const originalName = safeFileName(uploaded.originalname);
      const extension = path.extname(originalName).toLowerCase();

      if (!ALLOWED_CAD_EXTENSIONS.has(extension)) {
        return jsonError(
          res,
          400,
          `Dateiformat nicht unterstützt: ${extension || "ohne Erweiterung"}.`
        );
      }

      const paths = getBricscadPaths(projectId);
      const uploadDir = path.join(paths.bricscadDir, "uploads");
      fs.mkdirSync(uploadDir, { recursive: true });

      const timestamp = new Date()
        .toISOString()
        .replace(/[-:.TZ]/g, "")
        .slice(0, 14);

      const stem =
        path.basename(originalName, extension)
          .replace(/[^A-Za-z0-9ÄÖÜäöüß_-]/g, "_")
          .slice(0, 100) || "cad";

      const storedName = `${timestamp}-${stem}${extension}`;
      const targetPath = path.join(uploadDir, storedName);

      fs.writeFileSync(targetPath, uploaded.buffer);

      return res.status(201).json({
        ok: true,
        message: "CAD-Datei erfolgreich hochgeladen.",
        projectId,
        uploadId: storedName,
        fileName: storedName,
        storedName,
        originalName,
        relativePath: path
          .relative(paths.projectRoot, targetPath)
          .replace(/\\/g, "/"),
        size: uploaded.size,
        mimeType: uploaded.mimetype,
      });
    } catch (e: any) {
      return jsonError(res, 500, String(e?.message || e));
    }
  }
);

/**
 * CAD-Datei importieren/parsen
 * POST /api/bricscad/import?projectId=...
 *
 * Unterstützt:
 * 1. erneutes Multipart-Upload;
 * 2. JSON/Form-Daten mit uploadId, storedName, fileName oder filename.
 */
r.post(
  "/import",
  cadUpload.any(),
  async (req: Request, res: Response) => {
    try {
      const projectId = safeProjectId(req);
      const uploaded = getUploadedFile(req);

      let originalName = "";
      let storedName = "";
      let sourcePath = "";
      let buffer: Buffer;

      if (uploaded) {
        originalName = safeFileName(uploaded.originalname);
        buffer = uploaded.buffer;

        const extension = path.extname(originalName).toLowerCase();
        if (!ALLOWED_CAD_EXTENSIONS.has(extension)) {
          return jsonError(
            res,
            400,
            `Dateiformat nicht unterstützt: ${extension || "ohne Erweiterung"}.`
          );
        }
      } else {
        const requested =
          req.body?.uploadId ||
          req.body?.storedName ||
          req.body?.fileName ||
          req.body?.filename ||
          req.query.uploadId ||
          req.query.storedName ||
          req.query.fileName ||
          req.query.filename;

        sourcePath = resolveStoredCadFile(projectId, requested) || "";

        if (!sourcePath) {
          return jsonError(
            res,
            400,
            "Keine importierbare Datei gefunden. Zuerst /upload ausführen."
          );
        }

        storedName = path.basename(sourcePath);
        originalName = String(
          req.body?.originalName ||
          req.query.originalName ||
          storedName
        );

        buffer = fs.readFileSync(sourcePath);
      }

      const rawScale =
        req.body?.scale ??
        req.query.scale ??
        1;

      const scale = Number(String(rawScale).replace(",", "."));
      const safeScale =
        Number.isFinite(scale) && scale > 0
          ? scale
          : 1;

      const parsed = await parseByExtension(
        originalName,
        buffer,
        safeScale
      );

      const extension = path.extname(originalName).toLowerCase();
      const dxfGeometry = extension === ".dxf" ? parseDXFGeometry(buffer) : null;

      const paths = getBricscadPaths(projectId);
      const importDir = path.join(paths.bricscadDir, "imports");
      fs.mkdirSync(importDir, { recursive: true });

      const importResult = {
        version: "rlc_cad_import_v1",
        projectId,
        importedAt: new Date().toISOString(),
        originalName,
        storedName: storedName || undefined,
        scale: safeScale,
        note: parsed.note,
        items: parsed.items,
      };

      const resultFile = path.join(importDir, "latest-import.json");
      fs.writeFileSync(
        resultFile,
        JSON.stringify(importResult, null, 2),
        "utf8"
      );

      let takeoffFile: string | undefined;
      let takeoffPayload: any = undefined;
      if (dxfGeometry) {
        takeoffPayload = {
          type: "rlc_cad_geometry_v1",
          version: "1.0",
          projectId,
          sourceFile: originalName,
          importedAt: importResult.importedAt,
          layers: dxfGeometry.layers.map((name) => ({ name, visible: true, locked: false })),
          features: dxfGeometry.features,
          points: dxfGeometry.features
            .filter((feature) => feature.kind === "point" && feature.pts[0])
            .map((feature) => ({ id: feature.id, x: feature.pts[0].x, y: feature.pts[0].y, label: feature.name })),
          normalized: {
            version: "normalized_v1",
            sourceType: "rlc_cad_geometry_v1",
            features: dxfGeometry.features,
            points: [],
          },
          quantities: parsed.items,
        };
        fs.mkdirSync(paths.bricscadDir, { recursive: true });
        takeoffFile = paths.takeoffJsonPath;
        fs.writeFileSync(takeoffFile, JSON.stringify(takeoffPayload, null, 2), "utf8");
      }

      return res.json({
        ok: true,
        message: parsed.note || `${parsed.items.length} Elemente importiert.`,
        projectId,
        originalName,
        storedName: storedName || undefined,
        scale: safeScale,
        count: parsed.items.length,
        items: parsed.items,
        data: parsed.items,
        result: importResult,
        note: parsed.note,
        relativeResultPath: path
          .relative(paths.projectRoot, resultFile)
          .replace(/\\/g, "/"),
        takeoffCreated: Boolean(takeoffFile),
        takeoff: takeoffPayload,
        relativeTakeoffPath: takeoffFile
          ? path.relative(paths.projectRoot, takeoffFile).replace(/\\/g, "/")
          : undefined,
      });
    } catch (e: any) {
      return jsonError(res, 500, String(e?.message || e));
    }
  }
);

/** Health / Debug: zeigt erwartete Pfade */
r.get("/paths", (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  if (!projectId) return jsonError(res, 400, "projectId fehlt.");
  return res.json({ ok: true, paths: getBricscadPaths(projectId) });
});

/** UTM laden (CSV) */
r.get("/utm", (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  if (!projectId) return jsonError(res, 400, "projectId fehlt.");

  const out = readUtmCsv(projectId);
  if (!out.ok) return res.status(404).json(out);
  return res.json({ ok: true, csv: out.csv, paths: out.paths });
});

/** Takeoff laden (JSON) */
r.get("/takeoff", (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  if (!projectId) return jsonError(res, 400, "projectId fehlt.");

  const out = readTakeoff(projectId);
  if (!out.ok) return res.status(404).json(out);
  return res.json({ ok: true, data: out.payload, paths: out.paths });
});

/**
 * ✅ Snapshot PNG liefern
 * GET /api/bricscad/snapshot?projectId=BA-2025-DEMO
 * Optional: &name=snapshot.png (oder ein anderer png im bricscad-Ordner)
 *
 * Verhalten:
 * - wenn name gesetzt: genau dieses PNG
 * - sonst: snapshot.png falls vorhanden
 * - sonst: neuestes *.png im bricscad-Ordner
 */
r.get("/snapshot", (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  if (!projectId) return jsonError(res, 400, "projectId fehlt.");

  try {
    const paths = getBricscadPaths(projectId);
    const dir = paths.bricscadDir;

    if (!fs.existsSync(dir)) {
      return jsonError(res, 404, `BricsCAD-Ordner nicht gefunden: ${dir}`);
    }

    const nameRaw = String(req.query.name || "").trim();

    // 1) Wenn name angegeben → exakt dieses File (nur png, nur basename)
    if (nameRaw) {
      const base = path.basename(nameRaw);
      if (base !== nameRaw) {
        return jsonError(res, 400, "Ungültiger name (nur Dateiname, ohne Pfad).");
      }
      if (path.extname(base).toLowerCase() !== ".png") {
        return jsonError(res, 400, "Ungültiger name (nur .png erlaubt).");
      }

      const file = path.join(dir, base);
      if (!fs.existsSync(file)) {
        return jsonError(res, 404, `PNG nicht gefunden: ${file}`);
      }

      res.setHeader("Cache-Control", "no-store, max-age=0");
      return res.sendFile(path.resolve(file));
    }

    // 2) snapshot.png bevorzugen
    const preferred = path.join(dir, "snapshot.png");
    if (fs.existsSync(preferred)) {
      res.setHeader("Cache-Control", "no-store, max-age=0");
      return res.sendFile(path.resolve(preferred));
    }

    // 3) Fallback: neuestes *.png im Folder
    const files = fs
      .readdirSync(dir)
      .filter((f) => path.extname(f).toLowerCase() === ".png")
      .map((f) => {
        const full = path.join(dir, f);
        let mtime = 0;
        try {
          mtime = fs.statSync(full).mtimeMs;
        } catch {
          mtime = 0;
        }
        return { f, full, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (!files.length) {
      return jsonError(
        res,
        404,
        `Kein PNG im Ordner gefunden: ${dir}\nLege z.B. snapshot.png ab oder exportiere ein Bild aus BricsCAD.`
      );
    }

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.sendFile(path.resolve(files[0].full));
  } catch (e: any) {
    return jsonError(res, 500, String(e?.message || e));
  }
});

/**
 * ✅ BricsCAD öffnen (Windows) - startet BricsCAD auf dem Server-PC
 * GET /api/bricscad/open?projectId=BA-2025-DEMO
 *
 * Optional: file=... (relativ zum Projektroot), z.B.
 * /open?projectId=BA-2025-DEMO&file=cad\\plan.dwg
 * (Protezione: niente assoluti, niente "..")
 */
r.get("/open", (req: Request, res: Response) => {
  const projectId = getProjectId(req);
  if (!projectId) return jsonError(res, 400, "projectId fehlt.");

  try {
    const fileRel = String(req.query.file || "").trim();
    if (fileRel) {
      if (path.isAbsolute(fileRel) || fileRel.includes("..")) {
        return jsonError(res, 400, "Ungültiger file-Pfad (nur relativ, ohne '..').");
      }

      const paths = getBricscadPaths(projectId);
      const full = path.join(paths.projectRoot, fileRel);

      if (!fs.existsSync(full) || path.extname(full).toLowerCase() !== ".dwg") {
        return jsonError(res, 404, `DWG nicht gefunden: ${full}`);
      }

      const out = openBricscad(projectId);
      return res.json({ ...out, requestedFile: full });
    }

    const out = openBricscad(projectId);
    return res.json(out);
  } catch (e: any) {
    return jsonError(res, 500, String(e?.message || e));
  }
});

export default r;
