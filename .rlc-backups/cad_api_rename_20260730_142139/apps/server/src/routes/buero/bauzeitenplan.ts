import { Router } from "express";
import path from "path";
import fs from "fs";
import { loadTasks, saveTasks, loadCapacity, saveCapacity, saveSnapshot } from "../../services/dao/plannerRepo";

const router = Router();

/** POST /api/buero/bauzeitenplan/load  { projectId } */
router.post("/load", async (req, res) => {
  try {
    const { projectId } = req.body as any;
    // DB
    const tasks = (await loadTasks(projectId)) ?? [];
    const capacity = (await loadCapacity(projectId)) ?? {};
    // Fallback: ultimo snapshot su file (per start)
    const dir = path.join(process.cwd(), "uploads", String(projectId), "optimierung");
    let start = new Date().toISOString().slice(0, 10);
    try {
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith("plan_") && f.endsWith(".json")) : [];
      if (files.length) {
        const last = JSON.parse(fs.readFileSync(path.join(dir, files.sort().reverse()[0]), "utf8"));
        start = last.start || start;
      }
    } catch {}
    res.json({ start, tasks, capacity });
  } catch (e:any) {
    console.error(e);
    res.status(500).send(e?.message || "Büro Laden fehlgeschlagen");
  }
});

/** POST /api/buero/bauzeitenplan/save  { projectId, start, tasks, capacity, result? } */
router.post("/save", async (req, res) => {
  try {
    const { projectId, start, tasks, capacity, result } = req.body as any;
    await saveTasks(projectId, tasks).catch(()=>{});
    await saveCapacity(projectId, capacity).catch(()=>{});
    if (result) await saveSnapshot(projectId, result.start, result.ende, result).catch(()=>{});

    // Fallback file
    const dir = path.join(process.cwd(), "uploads", String(projectId), "buero");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `bauzeitenplan_${start}.json`), JSON.stringify({ start, tasks, capacity, result }, null, 2));

    res.json({ ok: true });
  } catch (e:any) {
    console.error(e);
    res.status(500).send(e?.message || "Büro Speichern fehlgeschlagen");
  }
});

export default router;
