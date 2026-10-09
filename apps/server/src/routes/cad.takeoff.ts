import { Router } from "express";
import path from "path";
import fs from "fs";
import { requireProjectMember } from "../middleware/guards";

const r = Router();

const requireCadTakeoffAccess = async (req: any, res: any, next: any) => {
  const token = String(req.query?.projectId || "").trim();
  if (!token) return res.status(400).json({ ok: false, message: "projectId missing" });
  req.params = req.params || {};
  req.params.__cadProject = token;
  return requireProjectMember("__cadProject")(req, res, next);
};

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

function safeJsonParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/**
 * GET /api/cad/takeoff?projectId=BA-2025-DEMO
 * Legge: <PROJECTS_ROOT>/<projectId>/cad/takeoff.json
 * Ritorna: { ok:true, rows:[...] }
 */
r.get("/takeoff", requireCadTakeoffAccess, (req, res) => {
  const projectId = String(req.query.projectId || "").trim();
  if (!projectId) return res.status(400).json({ ok: false, message: "projectId missing" });

  const filePath = path.join(PROJECTS_ROOT, projectId, "cad", "takeoff.json");
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      ok: false,
      message: `takeoff.json not found: ${filePath}`,
    });
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const data = safeJsonParse<any>(raw, null);
  const rows = Array.isArray(data?.rows) ? data.rows : [];

  return res.json({
    ok: true,
    type: data?.type || "unknown",
    rows,
  });
});

export default r;
