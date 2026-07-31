import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PROJECTS_ROOT } from "../lib/projectsRoot";

const router = Router();

/* =========================
   UTILS
========================= */

function isSafeKey(v: string) {
  return /^[A-Za-z0-9_\-]+$/.test(v || "");
}

function rid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function getDir(projectKey: string) {
  return path.join(PROJECTS_ROOT, projectKey, "kalkulation", "angebot");
}

function getFile(projectKey: string) {
  return path.join(getDir(projectKey), "angebote.json");
}

function ensureDir(projectKey: string) {
  const dir = getDir(projectKey);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readList(projectKey: string): any[] {
  try {
    const file = getFile(projectKey);
    if (!fs.existsSync(file)) return [];
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeList(projectKey: string, list: any[]) {
  ensureDir(projectKey);
  fs.writeFileSync(getFile(projectKey), JSON.stringify(list, null, 2), "utf-8");
}

function normalizeDoc(projectKey: string, body: any) {
  const id =
    String(body?.id || body?.meta?.id || "").trim() ||
    `ANG-${projectKey}-${Date.now()}`;

  return {
    ...body,
    id,
    projectKey,
    updatedAt: nowIso(),
    createdAt: body?.createdAt || body?.meta?.savedAt || nowIso(),
  };
}

/* =========================
   ROUTES
========================= */

/* GET: tutte le offerte - Mobile erwartet direkt ein Array */
router.get("/:projectKey", (req, res) => {
  const { projectKey } = req.params;

  if (!isSafeKey(projectKey)) {
    return res.status(400).json({ ok: false, error: "invalid projectKey" });
  }

  const list = readList(projectKey);
  return res.json(Array.isArray(list) ? list : []);
});

/* POST: speichert Snapshot oder Angebot */
router.post("/:projectKey/save", (req, res) => {
  try {
    const { projectKey } = req.params;

    if (!isSafeKey(projectKey)) {
      return res.status(400).json({ ok: false, error: "invalid projectKey" });
    }

    const doc = normalizeDoc(projectKey, req.body || {});
    const list = readList(projectKey);

    const idx = list.findIndex((x: any) => String(x.id) === String(doc.id));

    if (idx >= 0) {
      list[idx] = doc;
    } else {
      list.unshift(doc);
    }

    writeList(projectKey, list);

    return res.json({
      ok: true,
      saved: true,
      id: doc.id,
      projectKey,
      count: list.length,
      data: doc,
    });
  } catch (e: any) {
    console.error("[kalkulation:angebot:save]", e?.message || e);
    return res.status(500).json({ ok: false, error: "save failed" });
  }
});

/* DELETE */
router.delete("/:projectKey/:id", (req, res) => {
  try {
    const { projectKey, id } = req.params;

    if (!isSafeKey(projectKey)) {
      return res.status(400).json({ ok: false, error: "invalid projectKey" });
    }

    const list = readList(projectKey);
    const next = list.filter((x: any) => String(x.id) !== String(id));

    writeList(projectKey, next);

    return res.json({ ok: true, deleted: true, id, count: next.length });
  } catch (e: any) {
    console.error("[kalkulation:angebot:delete]", e?.message || e);
    return res.status(500).json({ ok: false, error: "delete failed" });
  }
});

export default router;
