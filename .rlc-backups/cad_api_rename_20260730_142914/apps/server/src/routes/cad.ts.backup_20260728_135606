// apps/server/src/routes/cad.ts
import { Router } from "express";
import path from "path";
import fs from "fs";

const r = Router();

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function projectDir(projectId: string) {
  const dir = path.join(PROJECTS_ROOT, String(projectId));
  ensureDir(dir);
  return dir;
}

r.get("/load", (req, res) => {
  try {
    const projectId = String(req.query.projectId || "");
    if (!projectId) return res.status(400).json({ ok: false, error: "projectId missing" });
    const dir = projectDir(projectId);
    const file = path.join(dir, "cad.json");
    if (!fs.existsSync(file)) return res.json({ ok: true, data: null });
    const raw = fs.readFileSync(file, "utf-8");
    return res.json({ ok: true, data: JSON.parse(raw) });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

r.post("/save", (req, res) => {
  try {
    const { projectId, data } = req.body || {};
    if (!projectId) return res.status(400).json({ ok: false, error: "projectId missing" });
    const dir = projectDir(String(projectId));
    const file = path.join(dir, "cad.json");
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// export for Aufmaß/Massenermittlung
r.post("/export-aufmass", (req, res) => {
  try {
    const { projectId, data } = req.body || {};
    if (!projectId) return res.status(400).json({ ok: false, error: "projectId missing" });
    const dir = projectDir(String(projectId));
    const file = path.join(dir, "cad-export.json");
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

export default r;
