// apps/server/src/routes/inboxWorkflow.ts
// @ts-nocheck

import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

function safePart(v: any) {
  return String(v || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

function workflowDir() {
  return path.join(process.cwd(), "data", "inbox-workflow");
}

function workflowFile(projectKey: string) {
  return path.join(workflowDir(), `${safePart(projectKey)}.json`);
}

function readWorkflow(projectKey: string): any[] {
  try {
    const file = workflowFile(projectKey);
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWorkflow(projectKey: string, rows: any[]) {
  fs.mkdirSync(workflowDir(), { recursive: true });
  fs.writeFileSync(workflowFile(projectKey), JSON.stringify(rows || [], null, 2), "utf8");
}

function upsert(rows: any[], row: any) {
  const idx = rows.findIndex(
    (x) =>
      String(x.projectKey) === String(row.projectKey) &&
      String(x.type) === String(row.type) &&
      String(x.id) === String(row.id)
  );

  if (idx >= 0) {
    const next = [...rows];
    next[idx] = { ...next[idx], ...row };
    return next;
  }

  return [row, ...rows];
}

function handleAction(req: any, res: any, action: "approve" | "reject") {
  try {
    const projectKey = safePart(req.params.projectKey || req.body?.projectKey || req.body?.projectCode);
    const type = safePart(req.params.type || req.body?.type || req.body?.docType).toUpperCase();
    const id = safePart(req.params.id || req.body?.id || req.body?.docId);

    if (!projectKey || projectKey === "unknown") {
      return res.status(400).json({ ok: false, error: "PROJECT_KEY_REQUIRED" });
    }

    if (!type || type === "UNKNOWN") {
      return res.status(400).json({ ok: false, error: "TYPE_REQUIRED" });
    }

    if (!id || id === "unknown") {
      return res.status(400).json({ ok: false, error: "DOC_ID_REQUIRED" });
    }

    const now = Date.now();
    const workflowStatus = action === "approve" ? "FREIGEGEBEN" : "ABGELEHNT";

    const row = {
      projectKey,
      projectCode: req.body?.projectCode || projectKey,
      projectId: req.body?.projectId || projectKey,
      type,
      id,
      docId: id,
      action,
      workflowStatus,
      reason: action === "reject" ? String(req.body?.reason || "Abgelehnt") : "",
      updatedAt: now,
      approvedAt: action === "approve" ? now : undefined,
      rejectedAt: action === "reject" ? now : undefined,
      source: "server-inbox-workflow",
    };

    const rows = readWorkflow(projectKey);
    const next = upsert(rows, row);
    writeWorkflow(projectKey, next);

    return res.json({
      ok: true,
      projectKey,
      type,
      id,
      action,
      workflowStatus,
      row,
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: "INBOX_WORKFLOW_FAILED",
      message: String(e?.message || e),
    });
  }
}

router.post("/:projectKey/:type/:id/approve", (req, res) => {
  return handleAction(req, res, "approve");
});

router.post("/:projectKey/:type/:id/reject", (req, res) => {
  return handleAction(req, res, "reject");
});

router.get("/:projectKey/workflow", (req, res) => {
  try {
    const projectKey = safePart(req.params.projectKey);
    const rows = readWorkflow(projectKey);
    return res.json({ ok: true, projectKey, rows });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: "INBOX_WORKFLOW_READ_FAILED",
      message: String(e?.message || e),
    });
  }
});

export default router;
