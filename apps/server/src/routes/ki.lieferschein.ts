// apps/server/src/routes/ki.lieferschein.ts
import express from "express";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { PROJECTS_ROOT } from "../lib/projectsRoot";

const r = express.Router();

const BodySchema = z.object({
  projectFsKey: z.string().min(3),
  projectCode: z.string().optional(),
  date: z.string().optional(),

  // payload from mobile
  text: z.string().optional(),
  row: z.any().optional(),
  strict: z.boolean().optional().default(true),

  // NEW: the IDs returned by /api/ki/vision-files
  visionFileIds: z.array(z.string().min(6)).optional(),
  enableOcr: z.boolean().optional(),
  allowOcr: z.boolean().optional(),
  ocr: z.boolean().optional(),
});

/** same whitelist policy */
function assertSafeProjectKey(input: string) {
  const v = String(input || "").trim();
  if (!v) throw new Error("projectKey missing");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,80}$/.test(v)) {
    throw new Error("invalid projectKey");
  }
  if (v.includes("..") || v.includes("/") || v.includes("\\")) {
    throw new Error("invalid projectKey");
  }
  return v;
}

function getVisionDir(projectKey: string) {
  return path.join(PROJECTS_ROOT, projectKey, "ki", "vision");
}

function readVisionJson(projectKey: string, id: string) {
  const dir = getVisionDir(projectKey);
  const file = path.join(dir, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** pick best extracted (for header) + merge materials across all extracted */
function mergeVisionEntities(payload: any): any {
  try {
    const e = payload?.entities || payload || {};
    const extracted = Array.isArray(e?.extracted) ? e.extracted : [];
    if (!extracted.length) return e;

    // 1) pick best header (lieferschein) candidate
    let best: any = extracted[0];
    for (const it of extracted) {
      const score =
        (it?.entities?.lieferschein ? 50 : 0) +
        (Array.isArray(it?.entities?.materialien)
          ? it.entities.materialien.length * 10
          : 0) +
        (it?.text ? 1 : 0);

      const bestScore =
        (best?.entities?.lieferschein ? 50 : 0) +
        (Array.isArray(best?.entities?.materialien)
          ? best.entities.materialien.length * 10
          : 0) +
        (best?.text ? 1 : 0);

      if (score > bestScore) best = it;
    }

    // 2) merge all materials from all extracted blocks
    const mergedMaterials: any[] = [];
    for (const it of extracted) {
      const arr = Array.isArray(it?.entities?.materialien)
        ? it.entities.materialien
        : [];
      for (const m of arr) mergedMaterials.push(m);
    }

    // 3) build flat entities (header from best, materials merged)
    const flat = {
      ...(e || {}),
      ...(best?.entities || {}),
      materialien: mergedMaterials.length
        ? mergedMaterials
        : Array.isArray(best?.entities?.materialien)
        ? best.entities.materialien
        : [],
      _visionText: String(best?.text || e?.text || "").trim(),
    };

    return flat;
  } catch {
    return payload?.entities || payload || {};
  }
}

/** build field patches for MOBILE schema */
function buildLieferscheinFieldPatches(args: {
  row?: any;
  entitiesFlat?: any;
  date?: string;
}) {
  const { row, entitiesFlat, date } = args;
  const fp: any = {};

  // always keep date (prevents "empty patch" error)
  if (date && String(date).trim()) fp.date = String(date).trim();

  // keep existing row values if already present
  const takeRow = (k: string) =>
    row?.[k] != null && String(row?.[k]).trim() !== "" ? row[k] : undefined;

  // entities from vision
  const ls = (entitiesFlat?.lieferschein || {}) as any;
  const mats = Array.isArray(entitiesFlat?.materialien)
    ? entitiesFlat.materialien
    : [];

  const normDate = (d: any) => {
    const s = String(d || "").trim();
    if (!s) return "";
    // already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // dd.mm.yyyy
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (m) {
      const dd = String(m[1]).padStart(2, "0");
      const mm = String(m[2]).padStart(2, "0");
      const yy = String(m[3]);
      return `${yy}-${mm}-${dd}`;
    }
    return s;
  };

  // --- lieferscheinNr / lieferant / kostenstelle / baustelle / fahrer
  const lieferscheinNummer =
    takeRow("lieferscheinNummer") ||
    (ls?.lieferscheinNr ? String(ls.lieferscheinNr).trim() : "");
  if (lieferscheinNummer) fp.lieferscheinNummer = lieferscheinNummer;

  const lieferant =
    takeRow("lieferant") || (ls?.lieferant ? String(ls.lieferant).trim() : "");
  if (lieferant) fp.lieferant = lieferant;

  const kostenstelle =
    takeRow("kostenstelle") ||
    (ls?.kostenstelle ? String(ls.kostenstelle).trim() : "") ||
    (entitiesFlat?.kostenstelle ? String(entitiesFlat.kostenstelle).trim() : "");
  if (kostenstelle) fp.kostenstelle = kostenstelle;

  const baustelle =
    takeRow("baustelle") || (ls?.baustelle ? String(ls.baustelle).trim() : "");
  if (baustelle) fp.baustelle = baustelle;

  const fahrer =
    takeRow("fahrer") || (ls?.fahrer ? String(ls.fahrer).trim() : "");
  if (fahrer) fp.fahrer = fahrer;

  // --- datum from vision if present
  const dVision = normDate(ls?.datum);
  if (dVision) fp.date = dVision;

  // --- material lines
  const materialRow = takeRow("material");
  if (materialRow) {
    fp.material = String(materialRow);
  } else if (mats.length) {
    fp.material = mats
      .map((m: any) => {
        const b = String(m?.bezeichnung || "").trim();
        const q =
          m?.menge != null && String(m.menge).trim() !== ""
            ? String(m.menge)
            : "";
        const u = String(m?.einheit || "").trim();
        return [b, q && u ? `${q} ${u}` : q || u].filter(Boolean).join(" – ");
      })
      .filter(Boolean)
      .join("\n");
  }

  // --- quantity + unit
  const qRow = takeRow("quantity");
  const uRow = takeRow("unit");

  if (qRow != null && String(qRow).trim() !== "") fp.quantity = qRow;
  if (uRow) fp.unit = String(uRow);

  if (fp.quantity == null) {
    const nums = mats
      .map((m: any) => Number(m?.menge))
      .filter((x: any) => Number.isFinite(x));
    if (nums.length) {
      fp.quantity = nums.reduce((a: number, b: number) => a + b, 0);
      const units = new Set(
        mats
          .map((m: any) => String(m?.einheit || "").trim())
          .filter(Boolean)
      );
      if (!fp.unit && units.size === 1) fp.unit = [...units][0];
    }
  } else {
    const n = Number(fp.quantity);
    if (Number.isFinite(n)) fp.quantity = n;
  }

  // --- lvItemPos passthrough
  const lvItemPos = takeRow("lvItemPos");
  if (lvItemPos) fp.lvItemPos = String(lvItemPos).trim();

  return fp;
}

r.post("/lieferschein/suggest", async (req, res) => {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "bad_request", details: parsed.error.flatten() });
  }

  try {
    const {
      projectFsKey,
      projectCode,
      row,
      strict,
      visionFileIds,
      date,
      allowOcr,
      enableOcr,
      ocr,
    } = parsed.data;

    const projectKey = assertSafeProjectKey(projectCode || projectFsKey);

    const ocrEnabled = !!(allowOcr || enableOcr || ocr);
    const ids = Array.isArray(visionFileIds) ? visionFileIds : [];

    let entitiesFlat: any = {};
    let loaded = 0;

    if (ocrEnabled && ids.length) {
      // load all jsons and merge best
      const mergedExtracted: any[] = [];
      for (const id of ids.slice(0, 6)) {
        const data = readVisionJson(projectKey, id);
        if (data) {
          loaded++;
          // data is the payload written by /vision-files
          // we normalize as { extracted:[{text,entities}] } compatible
          const ex = data?.entities?.extracted;
          if (Array.isArray(ex)) {
            for (const e of ex) mergedExtracted.push(e);
          } else if (data?.entities) {
            mergedExtracted.push({
              text: data?.text || "",
              entities: data?.entities || {},
            });
          }
        }
      }

      entitiesFlat = mergeVisionEntities({ extracted: mergedExtracted });

      // 🔎 quick debug: do we actually have materials after merge?
      const matsCount = Array.isArray(entitiesFlat?.materialien)
        ? entitiesFlat.materialien.length
        : 0;
      console.log("[KI][LS] merged materials:", matsCount);
    }

    const fp = buildLieferscheinFieldPatches({
      row,
      entitiesFlat,
      date,
    });

    // IMPORTANT: never return empty object (UI would complain)
    if (!fp || Object.keys(fp).length === 0) {
      fp.date = String(date || new Date().toISOString().slice(0, 10));
    }

    return res.json({
      suggestions: [
        {
          fieldPatches: fp,
          notes: ocrEnabled
            ? loaded
              ? `OCR aktiv: ${loaded} Vision-JSON geladen. Projekt: ${projectKey}`
              : `OCR aktiv, aber keine Vision-JSON gefunden. Projekt: ${projectKey}`
            : strict
            ? `STRICT: keine OCR aktiv. Nur sichere Felder übernommen. Projekt: ${projectKey}`
            : `Vorschlag erzeugt (non-strict). Projekt: ${projectKey}`,
          debug: {
            ocrEnabled,
            visionFileIdsCount: ids.length,
            loadedJsonCount: loaded,
          },
        },
      ],
    });
  } catch (e: any) {
    console.error("lieferschein/suggest error:", e);
    return res.status(500).json({
      error: "lieferschein/suggest failed",
      detail: e?.message || String(e),
    });
  }
});

export default r;
