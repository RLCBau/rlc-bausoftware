import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

router.get("/lv", async (req, res) => {
  try {
    const projectId = String(req.query.projectId || "");
    const q = String(req.query.q || "").toLowerCase();
    const p = path.join(process.cwd(), "uploads", projectId, "lv", "positions.json");
    let rows: any[] = [];
    if (fs.existsSync(p)) rows = JSON.parse(fs.readFileSync(p, "utf8"));
    const out = rows
      .filter(r => !q || (r.id?.toLowerCase().includes(q) || r.kurz?.toLowerCase().includes(q)))
      .slice(0, 200)
      .map(r => ({ id: r.id, label: `${r.id} — ${r.kurz || ""}`.trim() }));
    res.json({ items: out });
  } catch (e:any) { res.status(500).send("LV-Lookup fehlgeschlagen"); }
});

router.get("/regieberichte", async (req, res) => {
  try {
    const projectId = String(req.query.projectId || "");
    const q = String(req.query.q || "").toLowerCase();
    const p = path.join(process.cwd(), "uploads", projectId, "regie", "regieberichte.json");
    let rows: any[] = [];
    if (fs.existsSync(p)) rows = JSON.parse(fs.readFileSync(p, "utf8"));
    const out = rows
      .filter(r => !q || (`${r.id} ${r.datum} ${r.titel||""}`.toLowerCase().includes(q)))
      .slice(0, 200)
      .map(r => ({ id: r.id, label: `${r.id} — ${r.datum || ""} ${r.titel ? "— " + r.titel : ""}`.trim() }));
    res.json({ items: out });
  } catch (e:any) { res.status(500).send("Regiebericht-Lookup fehlgeschlagen"); }
});

export default router;
