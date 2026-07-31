import { Router } from "express";
const router = Router();

type BuchhaltungEintrag = {
  projectId: string;
  datum: string;
  summeNetto: number;
  summeBrutto: number;
  quelle: string; // z. B. "Abrechnung"
};

const byProject = new Map<string, BuchhaltungEintrag[]>();

router.post("/save", (req, res) => {
  const { projectId, summeNetto, summeBrutto, quelle } = req.body || {};
  if (!projectId || summeNetto == null || summeBrutto == null) {
    return res.status(400).json({ error: "projectId, summeNetto, summeBrutto sind Pflicht." });
  }
  const list = byProject.get(projectId) || [];
  const item: BuchhaltungEintrag = {
    projectId,
    datum: new Date().toISOString().slice(0, 10),
    summeNetto: Number(summeNetto),
    summeBrutto: Number(summeBrutto),
    quelle: quelle || "Abrechnung",
  };
  list.push(item);
  byProject.set(projectId, list);
  res.json({ ok: true, item });
});

router.get("/by-project/:projectId", (req, res) => {
  const pid = req.params.projectId;
  res.json({ projectId: pid, items: byProject.get(pid) || [] });
});

export default router;
