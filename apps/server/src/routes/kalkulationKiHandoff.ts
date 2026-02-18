// apps/server/src/routes/kalkulationKiHandoff.ts
import { Router } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { PROJECTS_ROOT } from "../lib/projectsRoot";

const router = Router();

/* =====================================================================
   Helpers
===================================================================== */

function projDir(projectKey: string) {
  return path.join(PROJECTS_ROOT, projectKey);
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function safeReadJson(file: string) {
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

/* =====================================================================
   1) EXISTING: KI HANDOFF (Rezepte -> KI)  [KEEP]
   - GET  /api/kalkulation/ki-handoff/:projectKey
   - POST /api/kalkulation/ki-handoff/:projectKey
===================================================================== */

const Row = z.object({
  id: z.string().optional(),
  posNr: z.string().optional().default(""),
  kurztext: z.string().optional().default(""),
  einheit: z.string().optional().default("m"),
  menge: z.number().optional().default(0),
  preis: z.number().optional().default(0),
  confidence: z.number().optional(),
  rabatt: z.number().optional(),
});

const Body = z.object({
  ts: z.number().optional(),
  source: z.string().optional(),
  mwst: z.number().optional(),
  pricingDate: z.string().optional(),
  rows: z.array(Row).default([]),
});

router.get("/kalkulation/ki-handoff/:projectKey", (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();
    if (!projectKey) return res.status(400).json({ ok: false, error: "projectKey missing" });

    const base = projDir(projectKey);
    const file = path.join(base, "ki", "kalkulation_ki_handoff.json");
    if (!fs.existsSync(file)) return res.json({ ok: true, exists: false, data: null });

    const data = safeReadJson(file);
    return res.json({ ok: true, exists: true, data });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

router.post("/kalkulation/ki-handoff/:projectKey", (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();
    if (!projectKey) return res.status(400).json({ ok: false, error: "projectKey missing" });

    const parsed = Body.parse(req.body || {});
    const base = projDir(projectKey);

    const kiDir = path.join(base, "ki");
    ensureDir(kiDir);

    const file = path.join(kiDir, "kalkulation_ki_handoff.json");
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          ...parsed,
          ts: parsed.ts ?? Date.now(),
          projectKey,
        },
        null,
        2
      ),
      "utf8"
    );

    return res.json({
      ok: true,
      saved: true,
      file: `projects/${projectKey}/ki/kalkulation_ki_handoff.json`,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/* =====================================================================
   2) NEW: KALKULATION MIT KI -> SAVE/LOAD (Server)
   - POST /api/kalkulation/:projectKey/ki/save
   - GET  /api/kalkulation/:projectKey/ki
   Salva in:
     data/projects/<projectKey>/kalkulation/ki-kalkulation.json
===================================================================== */

const KiSavePayload = z.object({
  meta: z
    .object({
      mwst: z.number().optional(),
      aufschlag: z.number().optional(),
      kapRabatt: z.record(z.string(), z.number()).optional(),
      kapMarkup: z.record(z.string(), z.number()).optional(),
      offerNumber: z.string().optional(),
      projectKey: z.string().optional(),
      savedAt: z.string().optional(),
      // permissivo: se domani aggiungi campi, non rompi
    })
    .optional(),
  rows: z.array(Row).default([]),
  totals: z
    .object({
      netto: z.number().optional(),
      aufschlagWert: z.number().optional(),
      brutto: z.number().optional(),
    })
    .optional(),
});

function kiKalkulationFile(projectKey: string) {
  const base = projDir(projectKey);
  const dir = path.join(base, "kalkulation");
  ensureDir(dir);
  return path.join(dir, "ki-kalkulation.json");
}

router.get("/kalkulation/:projectKey/ki", (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();
    if (!projectKey) return res.status(400).json({ ok: false, error: "projectKey missing" });

    const file = kiKalkulationFile(projectKey);

    // se non esiste, non creiamo cartelle inutili: controlliamo prima esistenza reale
    const base = projDir(projectKey);
    const realFile = path.join(base, "kalkulation", "ki-kalkulation.json");
    if (!fs.existsSync(realFile)) return res.json({ ok: true, exists: false, data: null });

    const data = safeReadJson(realFile);
    return res.json({ ok: true, exists: true, data });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

router.post("/kalkulation/:projectKey/ki/save", (req, res) => {
  try {
    const projectKey = String(req.params.projectKey || "").trim();
    if (!projectKey) return res.status(400).json({ ok: false, error: "projectKey missing" });

    const parsed = KiSavePayload.parse(req.body || {});
    const file = kiKalkulationFile(projectKey);

    const payloadToWrite = {
      ...parsed,
      meta: {
        ...(parsed.meta || {}),
        projectKey,
        savedAt: parsed.meta?.savedAt || new Date().toISOString(),
      },
    };

    fs.writeFileSync(file, JSON.stringify(payloadToWrite, null, 2), "utf8");

    return res.json({
      ok: true,
      saved: true,
      file: `projects/${projectKey}/kalkulation/ki-kalkulation.json`,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

export default router;
