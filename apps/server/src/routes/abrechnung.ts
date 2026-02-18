import { Router } from "express";
import { randomUUID } from "crypto";

const router = Router();

/* ===== In-Memory store (sostituisci con Prisma in seguito) ===== */
type Abschlag = {
  id: string;
  projectId: string;
  nr: number;
  datum: string;
  betrag: number;
  createdAt: number;
};

const byProject = new Map<string, Abschlag[]>();

/* ===== POST /api/abrechnung/save ===== */
router.post("/save", (req, res) => {
  const { projectId, betrag } = req.body || {};
  if (!projectId || !betrag) {
    return res.status(400).json({ error: "projectId und betrag sind Pflicht." });
  }

  const list = byProject.get(projectId) || [];
  const newItem: Abschlag = {
    id: randomUUID(),
    projectId,
    nr: list.length + 1,
    datum: new Date().toISOString().slice(0, 10),
    betrag: Number(betrag),
    createdAt: Date.now(),
  };

  list.push(newItem);
  byProject.set(projectId, list);
  res.json({ ok: true, item: newItem, count: list.length });
});

/* ===== GET /api/abrechnung/by-project/:projectId ===== */
router.get("/by-project/:projectId", (req, res) => {
  const pid = req.params.projectId;
  const items = byProject.get(pid) || [];
  res.json({ ok: true, projectId: pid, items });
});

/* ===== DELETE /api/abrechnung/:id ===== */
router.delete("/:id", (req, res) => {
  const id = req.params.id;
  let removed = false;
  for (const [pid, list] of byProject.entries()) {
    const idx = list.findIndex(a => a.id === id);
    if (idx >= 0) {
      list.splice(idx, 1);
      byProject.set(pid, list);
      removed = true;
      break;
    }
  }
  if (!removed) return res.status(404).json({ error: "Nicht gefunden" });
  res.json({ ok: true });
});

export default router;
