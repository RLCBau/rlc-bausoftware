// apps/server/src/routes/tagesbericht.ts
import { Router } from "express";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { PROJECTS_ROOT } from "../lib/projectsRoot";

import {
  requireAuth,
  requireMode,
  requireEmailVerified,
} from "../middleware/requireAuth";

const router = Router();
console.log("[tagesbericht] router loaded");

/* ================= HELPERS ================= */

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeFsKey(input: string) {
  return String(input || "")
    .trim()
    .replace(/[^A-Za-z0-9_\-]/g, "_")
    .slice(0, 120);
}

function readJson<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(p: string, obj: any) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function rid() {
  return `tb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/* ================= PATHS ================= */

function projectRoot(fsKey: string) {
  return path.join(PROJECTS_ROOT, fsKey);
}

function inboxDir(fsKey: string) {
  return path.join(projectRoot(fsKey), "eingangspruefung", "tagesbericht");
}

function freigabeDir(fsKey: string) {
  return path.join(projectRoot(fsKey), "tagesbericht");
}

/* ================= SCHEMA ================= */

const Schema = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1),
  projectCode: z.string().optional(),
  date: z.string().optional(),

  weather: z.string().optional(),
  temperature: z.string().optional(),
  workers: z.string().optional(),
  machines: z.string().optional(),
  workDone: z.string().optional(),
  issues: z.string().optional(),
  notes: z.string().optional(),

  attachments: z.array(z.any()).optional(),

  createdAt: z.number().optional(),
});

/* ================= SUBMIT ================= */

router.post(
  "/",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const body = Schema.parse(req.body);

      const fsKey = safeFsKey(body.projectCode || body.projectId);
      const dir = inboxDir(fsKey);
      ensureDir(dir);

      const id = body.id || rid();

      const payload = {
        ...body,
        id,
        projectFsKey: fsKey,
        workflowStatus: "EINGEREICHT",
        reportType: "TAGESBERICHT",
        submittedAt: Date.now(),
      };

      const p = path.join(dir, `${id}.json`);
      writeJson(p, payload);

      return res.json({ ok: true, id });
    } catch (e: any) {
      console.error("tagesbericht submit failed:", e);
      return res.status(500).json({ ok: false });
    }
  }
);

/* ================= LIST ================= */

router.get(
  "/inbox/list",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    try {
      const projectId = String(req.query.projectId || "");
      const fsKey = safeFsKey(projectId);
      const dir = inboxDir(fsKey);
      ensureDir(dir);

      const items = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => readJson<any>(path.join(dir, f), null))
        .filter(Boolean);

      return res.json({ ok: true, items });
    } catch {
      return res.status(500).json({ ok: false });
    }
  }
);

/* ================= READ ================= */

router.get(
  "/inbox/read",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    const fsKey = safeFsKey(String(req.query.projectId || ""));
    const p = path.join(inboxDir(fsKey), `${req.query.docId}.json`);

    if (!fs.existsSync(p)) {
      return res.status(404).json({ ok: false });
    }

    return res.json({ ok: true, snapshot: readJson(p, null) });
  }
);

/* ================= APPROVE ================= */

router.post(
  "/inbox/approve",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    const { projectId, docId } = req.body;

    const fsKey = safeFsKey(projectId);

    const src = path.join(inboxDir(fsKey), `${docId}.json`);
    const dst = path.join(freigabeDir(fsKey), `${docId}.json`);

    if (!fs.existsSync(src)) {
      return res.status(404).json({ ok: false });
    }

    const obj = readJson(src, null);

    writeJson(dst, {
      ...(obj && typeof obj === "object" ? obj : {}),
      workflowStatus: "FREIGEGEBEN",
      approvedAt: Date.now(),
    });

    fs.unlinkSync(src);

    return res.json({ ok: true });
  }
);

/* ================= REJECT ================= */

router.post(
  "/inbox/reject",
  requireAuth,
  requireMode("SERVER_SYNC"),
  requireEmailVerified,
  async (req, res) => {
    const { projectId, docId, reason } = req.body;

    const fsKey = safeFsKey(projectId);
    const p = path.join(inboxDir(fsKey), `${docId}.json`);

    const obj = readJson(p, null);

    writeJson(p, {
      ...(obj && typeof obj === "object" ? obj : {}),
      workflowStatus: "ABGELEHNT",
      rejectionReason: reason,
    });

    return res.json({ ok: true });
  }
);

export default router;
