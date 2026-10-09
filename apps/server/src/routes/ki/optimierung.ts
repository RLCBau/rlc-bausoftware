import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";

import { prisma } from "../../lib/prisma";
import { optimizePlan } from "../../services/scheduling/optimizer";
import { createGanttPdf } from "../../services/pdf/ganttPdf";
import { archiveProjectFileVersion } from "../../services/dmsArchive";

const router = Router();

interface RunBody {
  projectId: string | number;
  start: string;
  tasks: any[];
  capacity: any;
}

function optimizationRole(req: any): string {
  return String(req?.auth?.companyRole || req?.auth?.role || "").trim().toUpperCase();
}

function optimizationUserId(req: any): string {
  return String(req?.auth?.sub || "").trim();
}

function requireOptimizationWrite(req: any, res: any, next: any) {
  if (!["ADMIN", "ADMINISTRATOR", "BAULEITER", "KALKULATOR"].includes(optimizationRole(req))) {
    return res.status(403).json({ ok: false, error: "OPTIMIZATION_WRITE_FORBIDDEN" });
  }
  return next();
}

async function resolveOptimizationProject(req: any, token: any) {
  const companyId = String(req?.auth?.companyId || req?.auth?.company || "").trim();
  const userId = optimizationUserId(req);
  const value = String(token || "").trim();
  if (!companyId || !userId || !value) return null;

  const privileged = ["ADMIN", "ADMINISTRATOR"].includes(optimizationRole(req));
  return prisma.project.findFirst({
    where: {
      companyId,
      OR: [{ id: value }, { code: value }],
      ...(privileged ? {} : { projectMembers: { some: { userId } } }),
    },
    select: { id: true, code: true, name: true },
  });
}

function safeDateToken(value: any): string | null {
  const v = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function optimizationDir(projectId: string) {
  const dir = path.join(process.cwd(), "uploads", projectId, "optimierung");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function saveTasks(projectId: string, tasks: any[]): Promise<void> {
  const dir = optimizationDir(projectId);
  fs.writeFileSync(path.join(dir, "tasks.json"), JSON.stringify(tasks, null, 2), "utf8");
}

async function saveCapacity(projectId: string, capacity: any): Promise<void> {
  const dir = optimizationDir(projectId);
  fs.writeFileSync(path.join(dir, "capacity.json"), JSON.stringify(capacity, null, 2), "utf8");
}

async function saveSnapshot(projectId: string, start: string, end: string, data: any): Promise<void> {
  const dir = optimizationDir(projectId);
  const safeStart = safeDateToken(start) || "start";
  const safeEnd = safeDateToken(end) || "end";
  fs.writeFileSync(
    path.join(dir, `snapshot_${safeStart}_${safeEnd}.json`),
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

router.post("/run", requireOptimizationWrite, async (req: Request, res: Response) => {
  try {
    const { projectId, start, tasks, capacity } = req.body as RunBody;
    const project = await resolveOptimizationProject(req, projectId);
    if (!project) return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });

    const safeStart = safeDateToken(start);
    if (!safeStart) return res.status(400).json({ ok: false, error: "INVALID_START_DATE" });
    if (!Array.isArray(tasks)) return res.status(400).json({ ok: false, error: "TASKS_REQUIRED" });
    if (tasks.length > 5000) return res.status(413).json({ ok: false, error: "TOO_MANY_TASKS" });
    if (capacity && typeof capacity === "object" && Object.keys(capacity).length > 1000) {
      return res.status(413).json({ ok: false, error: "TOO_MANY_CAPACITY_ROWS" });
    }

    const pid = project.id;
    await saveTasks(pid, tasks);
    await saveCapacity(pid, capacity && typeof capacity === "object" ? capacity : {});

    const result: any = await optimizePlan({
      projectId: pid,
      start: safeStart,
      tasks,
      capacity,
    } as any);

    if (!result || !result.start || !result.ende) {
      return res.status(500).json({ error: "Optimizer-Result ungültig (start/ende fehlt)" });
    }

    await saveSnapshot(pid, String(result.start), String(result.ende), result);

    const dir = optimizationDir(pid);
    const jsonPath = path.join(dir, `plan_${safeStart}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf8");

    const pdfName = `Bauzeitenplan_${safeStart}.pdf`;
    const pdfPath = path.join(dir, pdfName);
    await createGanttPdf({ ...result, projectId: pid }, pdfPath);

    void archiveProjectFileVersion({
      projectIdOrCode: pid,
      filename: pdfName,
      kind: "PDF",
      localPath: pdfPath,
      uploadedBy: optimizationUserId(req) || null,
      meta: { module: "KI_OPTIMIERUNG", source: "optimierung.run" },
    }).catch((error) => console.error("[optimierung:dms]", error));

    return res.json({
      ok: true,
      result,
      savedJson: `uploads/${pid}/optimierung/plan_${safeStart}.json`,
      pdfUrl: `/files/${pid}/optimierung/${pdfName}`,
    });
  } catch (err: any) {
    console.error("[optimierung/run]", err);
    return res.status(500).json({ error: err?.message || "Optimierung fehlgeschlagen" });
  }
});

router.post("/pdf", requireOptimizationWrite, async (req: Request, res: Response) => {
  try {
    const project = await resolveOptimizationProject(req, req.body?.projectId);
    if (!project) return res.status(403).json({ ok: false, error: "PROJECT_FORBIDDEN" });

    const plan = req.body?.plan;
    if (!plan || typeof plan !== "object") {
      return res.status(400).json({ ok: false, error: "PLAN_REQUIRED" });
    }

    const dir = optimizationDir(project.id);
    const fileName = `Bauzeitenplan_${Date.now()}.pdf`;
    const pdfPath = path.join(dir, fileName);
    await createGanttPdf({ ...plan, projectId: project.id }, pdfPath);

    await archiveProjectFileVersion({
      projectIdOrCode: project.id,
      filename: fileName,
      kind: "PDF",
      localPath: pdfPath,
      uploadedBy: optimizationUserId(req) || null,
      meta: { module: "KI_OPTIMIERUNG", source: "optimierung.pdf" },
    });

    return res.json({ ok: true, url: `/files/${project.id}/optimierung/${fileName}` });
  } catch (err: any) {
    console.error("[optimierung/pdf]", err);
    return res.status(500).json({ ok: false, error: "PDF_EXPORT_FAILED" });
  }
});

export default router;
