import { Router } from "express";
import path from "path";
import fs from "fs";

const r = Router();

// uploads/<projectId>/<...>
const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

// data/projects/<fsKey>/<...>
const PROJECTS_ROOT = (() => {
  const fromEnv = process.env.PROJECTS_ROOT;
  const root = fromEnv ? fromEnv : path.join(process.cwd(), "data", "projects");
  fs.mkdirSync(root, { recursive: true });
  return root;
})();

/**
 * Sicurezza: impedisce path traversal e garantisce che `abs`
 * sia contenuto sotto `root`.
 */
function safeJoin(root: string, ...parts: string[]) {
  const abs = path.resolve(root, ...parts);
  const base = path.resolve(root);
  if (!abs.startsWith(base + path.sep) && abs !== base) return null;
  return abs;
}

/**
 * GET /files/:projectId/<rest...>
 * - prima cerca in uploads/<projectId>/<rest...>
 * - fallback in data/projects/<projectId>/<rest...>
 */
r.get("/:projectId/:rest(*)", (req, res) => {
  const { projectId, rest } = req.params as { projectId: string; rest?: string };

  const restPath = rest || "";
  const safeRest = restPath
    .split("/")
    .filter(Boolean)
    .map((p: string) => path.basename(p)); // pulizia segmenti

  const tryUploads = safeJoin(UPLOADS_ROOT, projectId, ...safeRest);
  if (
    tryUploads &&
    fs.existsSync(tryUploads) &&
    fs.statSync(tryUploads).isFile()
  ) {
    return res.sendFile(tryUploads);
  }

  const tryProjects = safeJoin(PROJECTS_ROOT, projectId, ...safeRest);
  if (
    tryProjects &&
    fs.existsSync(tryProjects) &&
    fs.statSync(tryProjects).isFile()
  ) {
    return res.sendFile(tryProjects);
  }

  return res.status(404).json({ error: "Not Found" });
});

export default r;
