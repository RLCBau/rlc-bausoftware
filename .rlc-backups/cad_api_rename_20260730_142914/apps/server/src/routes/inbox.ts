// apps/server/src/routes/inbox.ts
import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { PROJECTS_ROOT } from "../lib/projectsRoot";

const router = Router();

/** =========================
 * Helpers
 * ========================= */
function safeKey(s: any) {
  return String(s || "").trim();
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, "utf-8");
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(p: string, obj: any) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}

function projectDir(projectKey: string) {
  return path.join(PROJECTS_ROOT, projectKey);
}

function inboxDir(projectKey: string, kind: "regie" | "lieferscheine" | "fotos") {
  return path.join(projectDir(projectKey), "inbox", kind);
}

function finalDir(projectKey: string, kind: "regie" | "lieferscheine" | "fotos") {
  return path.join(projectDir(projectKey), kind);
}

function listJsonFiles(dir: string) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/** --- NEW: list folders for fotos inbox --- */
function listFolders(dir: string) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .map((name) => path.join(dir, name))
      .filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory());
  } catch {
    return [];
  }
}

function rewriteRelPathForFotos(projectKey: string, docId: string, rel: any) {
  const s = String(rel || "");
  const from = `/projects/${projectKey}/inbox/fotos/${docId}/`;
  const to = `/projects/${projectKey}/fotos/${docId}/`;
  if (s.startsWith(from)) return to + s.substring(from.length);
  return rel;
}

/** =========================
 * GET Inbox list
 * GET /api/inbox/:projectKey/:kind
 * kind = regie | lieferscheine | fotos
 * ========================= */
router.get("/:projectKey/:kind", (req: Request, res: Response) => {
  const projectKey = safeKey(req.params.projectKey);
  const kind = safeKey(req.params.kind) as "regie" | "lieferscheine" | "fotos";

  if (!projectKey) return res.status(400).json({ ok: false, error: "projectKey missing" });
  if (kind !== "regie" && kind !== "lieferscheine" && kind !== "fotos")
    return res.status(400).json({ ok: false, error: "invalid kind" });

  // ✅ fotos: folder-based inbox (meta.json per folder)
  if (kind === "fotos") {
    const dir = inboxDir(projectKey, "fotos");
    const folders = listFolders(dir);

    const items = folders
      .map((folder) => {
        const metaPath = path.join(folder, "meta.json");
        const meta = readJson<any>(metaPath, null);
        return meta;
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          Number(b?.submittedAt || b?.createdAt || 0) - Number(a?.submittedAt || a?.createdAt || 0)
      );

    return res.json({ ok: true, projectKey, kind, items });
  }

  // ✅ regie/lieferscheine: json-based inbox
  const dir = inboxDir(projectKey, kind);
  const files = listJsonFiles(dir);

  const items = files
    .map((p) => readJson<any>(p, null))
    .filter(Boolean)
    .sort((a, b) => Number(b?.submittedAt || 0) - Number(a?.submittedAt || 0));

  res.json({ ok: true, projectKey, kind, items });
});

/** =========================
 * POST Approve
 * POST /api/inbox/:projectKey/:kind/:docId/approve
 * - regie/lieferscheine: moves inbox json -> final folder
 * - fotos: moves inbox folder -> final folder and patches meta.json
 * ========================= */
router.post("/:projectKey/:kind/:docId/approve", (req: Request, res: Response) => {
  const projectKey = safeKey(req.params.projectKey);
  const kind = safeKey(req.params.kind) as "regie" | "lieferscheine" | "fotos";
  const docId = safeKey(req.params.docId);

  if (!projectKey || !docId) return res.status(400).json({ ok: false, error: "missing params" });
  if (kind !== "regie" && kind !== "lieferscheine" && kind !== "fotos")
    return res.status(400).json({ ok: false, error: "invalid kind" });

  // ✅ fotos: move folder inbox/fotos/<docId> -> fotos/<docId>
  if (kind === "fotos") {
    const srcFolder = path.join(inboxDir(projectKey, "fotos"), docId);
    if (!fs.existsSync(srcFolder))
      return res.status(404).json({ ok: false, error: "doc not found" });

    const dstFolder = path.join(finalDir(projectKey, "fotos"), docId);
    ensureDir(path.dirname(dstFolder));

    // move folder (same filesystem)
    try {
      fs.renameSync(srcFolder, dstFolder);
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || "move failed" });
    }

    const metaPath = path.join(dstFolder, "meta.json");
    const obj = readJson<any>(metaPath, null);

    const now = Date.now();
    const updated = {
      ...(obj || {}),
      workflowStatus: "FREIGEGEBEN",
      approvedAt: now,
      approvedBy: safeKey(req.body?.approvedBy || ""), // optional
      rejectionReason: null,
      committedAt: now,
    };

    // rewrite attachment paths if present
    if (Array.isArray(updated.attachments)) {
      updated.attachments = updated.attachments.map((a: any) => {
        const name = safeKey(a?.name || "");
        const relPath = a?.relPath || a?.url || "";
        return {
          ...a,
          relPath: name ? `/projects/${projectKey}/fotos/${docId}/${name}` : rewriteRelPathForFotos(projectKey, docId, relPath),
        };
      });
    }

    writeJson(metaPath, updated);

    return res.json({ ok: true, projectKey, kind, docId, movedTo: dstFolder });
  }

  // ✅ regie/lieferscheine (unchanged)
  const src = path.join(inboxDir(projectKey, kind), `${docId}.json`);
  if (!fs.existsSync(src)) return res.status(404).json({ ok: false, error: "doc not found" });

  const obj = readJson<any>(src, null);
  if (!obj) return res.status(500).json({ ok: false, error: "invalid json" });

  const now = Date.now();
  const updated = {
    ...obj,
    workflowStatus: "FREIGEGEBEN",
    approvedAt: now,
    approvedBy: safeKey(req.body?.approvedBy || ""), // optional
    rejectionReason: null,
  };

  const dst = path.join(finalDir(projectKey, kind), `${docId}.json`);
  writeJson(dst, updated);

  // remove inbox file
  try {
    fs.unlinkSync(src);
  } catch {}

  res.json({ ok: true, projectKey, kind, docId, movedTo: dst });
});

/** =========================
 * POST Reject
 * POST /api/inbox/:projectKey/:kind/:docId/reject
 * - regie/lieferscheine: keeps in inbox but marks ABGELEHNT + reason
 * - fotos: patches meta.json inside folder
 * ========================= */
router.post("/:projectKey/:kind/:docId/reject", (req: Request, res: Response) => {
  const projectKey = safeKey(req.params.projectKey);
  const kind = safeKey(req.params.kind) as "regie" | "lieferscheine" | "fotos";
  const docId = safeKey(req.params.docId);

  const reason = safeKey(req.body?.reason || "");

  if (!projectKey || !docId) return res.status(400).json({ ok: false, error: "missing params" });
  if (kind !== "regie" && kind !== "lieferscheine" && kind !== "fotos")
    return res.status(400).json({ ok: false, error: "invalid kind" });

  // ✅ fotos: patch meta.json in folder
  if (kind === "fotos") {
    const folder = path.join(inboxDir(projectKey, "fotos"), docId);
    if (!fs.existsSync(folder))
      return res.status(404).json({ ok: false, error: "doc not found" });

    const metaPath = path.join(folder, "meta.json");
    const obj = readJson<any>(metaPath, null);
    if (!obj) return res.status(500).json({ ok: false, error: "invalid json" });

    const updated = {
      ...obj,
      workflowStatus: "ABGELEHNT",
      rejectedAt: Date.now(),
      rejectionReason: reason || "Keine Angabe",
    };

    writeJson(metaPath, updated);
    return res.json({ ok: true, projectKey, kind, docId });
  }

  // ✅ regie/lieferscheine (unchanged)
  const p = path.join(inboxDir(projectKey, kind), `${docId}.json`);
  if (!fs.existsSync(p)) return res.status(404).json({ ok: false, error: "doc not found" });

  const obj = readJson<any>(p, null);
  if (!obj) return res.status(500).json({ ok: false, error: "invalid json" });

  const updated = {
    ...obj,
    workflowStatus: "ABGELEHNT",
    rejectedAt: Date.now(),
    rejectionReason: reason || "Keine Angabe",
  };

  writeJson(p, updated);
  res.json({ ok: true, projectKey, kind, docId });
});

export default router;
