import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";

import { optimizePlan } from "../../services/scheduling/optimizer";
import { createGanttPdf } from "../../services/pdf/ganttPdf";

const router = Router();

interface RunBody {
  projectId: string | number;
  start: string;
  tasks: any[];
  capacity: any;
}

/**
 * Helper locali per salvare dati su disco
 */
async function saveTasks(projectId: string, tasks: any[]): Promise<void> {
  const dir = path.join(process.cwd(), "uploads", projectId, "optimierung");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "tasks.json"),
    JSON.stringify(tasks, null, 2),
    "utf8"
  );
}

async function saveCapacity(projectId: string, capacity: any): Promise<void> {
  const dir = path.join(process.cwd(), "uploads", projectId, "optimierung");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "capacity.json"),
    JSON.stringify(capacity, null, 2),
    "utf8"
  );
}

async function saveSnapshot(
  projectId: string,
  start: string,
  end: string,
  data: any
): Promise<void> {
  const dir = path.join(process.cwd(), "uploads", projectId, "optimierung");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `snapshot_${start}_${end}.json`),
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

/* ============================================================
   ▶️   Optimierung starten + Ergebnisse speichern
   ============================================================ */

router.post("/run", async (req: Request, res: Response) => {
  try {
    const { projectId, start, tasks, capacity } = req.body as RunBody;

    if (!projectId) {
      return res.status(400).json({ error: "projectId fehlt" });
    }

    const pid = String(projectId);

    // 1) Tasks & Kapazitäten speichern
    await saveTasks(pid, tasks).catch(() => {});
    await saveCapacity(pid, capacity).catch(() => {});

    // 2) Optimierung – HIER: nur 1 Argument (Object) an optimizePlan
    const result: any = await optimizePlan({
      projectId: pid,
      start,
      tasks,
      capacity,
    } as any);

    if (!result || !result.start || !result.ende) {
      return res
        .status(500)
        .json({ error: "Optimizer-Result ungültig (start/ende fehlt)" });
    }

    // 3) Snapshot speichern
    await saveSnapshot(pid, result.start as any, result.ende as any, result).catch(
      () => {}
    );

    // 4) Lokale JSON-Speicherung
    const dir = path.join(process.cwd(), "uploads", pid, "optimierung");
    fs.mkdirSync(dir, { recursive: true });

    const jsonPath = path.join(dir, `plan_${start}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf8");

    // 5) Gantt-PDF erzeugen – DEINE Version von createGanttPdf erwartet 2 Argumente
    await createGanttPdf(pid as any, result as any).catch(() => {});

    // 6) Antwort
    return res.json({
      ok: true,
      result,
      savedJson: `uploads/${pid}/optimierung/plan_${start}.json`,
    });
  } catch (err: any) {
    console.error("❌ Optimierungsfehler:", err);
    return res
      .status(500)
      .json({ error: err.message || "Optimierung fehlgeschlagen" });
  }
});

export default router;
