import { Router } from "express";
import fs from "fs";
import path from "path";
import { PROJECTS_ROOT } from "../lib/projectsRoot";

const router = Router();

/* =========================
   UTILS
========================= */

function isSafeKey(v: string) {
  return /^[A-Za-z0-9_\-]+$/.test(v || "");
}

function getDir(projectKey: string) {
  return path.join(PROJECTS_ROOT, projectKey, "kalkulation", "rechnung");
}

function getFile(projectKey: string) {
  return path.join(getDir(projectKey), "rechnungen.json");
}

function ensureDir(projectKey: string) {
  const dir = getDir(projectKey);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readList(projectKey: string) {
  try {
    const file = getFile(projectKey);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function writeList(projectKey: string, list: any[]) {
  ensureDir(projectKey);
  const file = getFile(projectKey);
  fs.writeFileSync(file, JSON.stringify(list, null, 2));
}

/* =========================
   ROUTES
========================= */

/* GET: tutte le Rechnungen */
router.get("/:projectKey", (req, res) => {
  const { projectKey } = req.params;

  if (!isSafeKey(projectKey)) {
    return res.status(400).json({ error: "invalid projectKey" });
  }

  const list = readList(projectKey);
  res.json(list);
});

/* POST: salva/aggiorna Rechnung */
router.post("/:projectKey/save", (req, res) => {
  try {
    const { projectKey } = req.params;
    const doc = req.body;

    if (!isSafeKey(projectKey)) {
      return res.status(400).json({ error: "invalid projectKey" });
    }

    if (!doc || !doc.id) {
      return res.status(400).json({ error: "missing doc.id" });
    }

    const list = readList(projectKey);
    const idx = list.findIndex((x: any) => String(x.id) === String(doc.id));

    if (idx >= 0) {
      list[idx] = doc;
    } else {
      list.unshift(doc);
    }

    writeList(projectKey, list);

    res.json({
      ok: true,
      id: doc.id,
      count: list.length,
    });
  } catch (e) {
    console.error("rechnung save error", e);
    res.status(500).json({ error: "save failed" });
  }
});

/* DELETE */
router.delete("/:projectKey/:id", (req, res) => {
  try {
    const { projectKey, id } = req.params;

    if (!isSafeKey(projectKey)) {
      return res.status(400).json({ error: "invalid projectKey" });
    }

    const list = readList(projectKey);
    const next = list.filter((x: any) => String(x.id) !== String(id));

    writeList(projectKey, next);

    res.json({ ok: true });
  } catch (e) {
    console.error("rechnung delete error", e);
    res.status(500).json({ error: "delete failed" });
  }
});

export default router;
