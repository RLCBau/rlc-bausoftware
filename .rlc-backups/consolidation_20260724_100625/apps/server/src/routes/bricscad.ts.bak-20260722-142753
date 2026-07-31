import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";

import {
  readTakeoff,
  readUtmCsv,
  getBricscadPaths,
  openBricscad,
} from "../services/bricscad.service";

const r = Router();

function getProjectId(req: Request) {
  return String(req.query.projectId || "").trim();
}

function jsonError(res: Response, status: number, message: string) {
  return res.status(status).json({ ok: false, message });
}

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
