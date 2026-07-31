// apps/server/src/routes/abschlag.ts
// @ts-nocheck

import { Router } from "express";
import path from "path";
import fs from "fs";

const router = Router();

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeJsonParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function filePath(projectKey: string) {
  const root = path.join(PROJECTS_ROOT, projectKey);
  ensureDir(root);
  return path.join(root, "abschlaege.json");
}

/**
 * GET /api/abschlag/list/:projectKey
 * -> legge data/projects/<projectKey>/abschlaege.json
 */
router.get("/abschlag/list/:projectKey", (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();
    if (!projectKey) return res.status(400).json({ ok: false, error: "projectKey missing" });

    const fp = filePath(projectKey);
    if (!fs.existsSync(fp)) {
      return res.json({ ok: true, items: [], file: fp });
    }

    const raw = fs.readFileSync(fp, "utf-8");
    const items = safeJsonParse(raw, []);
    return res.json({ ok: true, items: Array.isArray(items) ? items : [], file: fp });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

/**
 * POST /api/abschlag/save/:projectKey
 * body: { items: [...] }
 */
router.post("/abschlag/save/:projectKey", (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();
    if (!projectKey) return res.status(400).json({ ok: false, error: "projectKey missing" });

    const items = req.body?.items;
    if (!Array.isArray(items)) {
      return res.status(400).json({ ok: false, error: "items must be array" });
    }

    const fp = filePath(projectKey);
    fs.writeFileSync(fp, JSON.stringify(items, null, 2), "utf-8");

    return res.json({ ok: true, saved: items.length, file: fp });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

export default router;
