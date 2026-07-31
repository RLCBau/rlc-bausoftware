// apps/server/src/routes/ki.ts
import express from "express";
import multer from "multer";
import OpenAI from "openai";

import path from "path";
import fs from "fs";
import sharp from "sharp";
import { z } from "zod";
import { PROJECTS_ROOT } from "../lib/projectsRoot";

const router = express.Router();

/**
 * ✅ hard limit per evitare crash RAM
 * (puoi alzare a 15-25MB se ti serve, ma non infinito)
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function apiBaseUrl() {
  return (
    process.env.API_SELF_URL || `http://localhost:${process.env.PORT || 4000}`
  ).replace(/\/$/, "");
}

/**
 * ✅ projectKey whitelist (anti path traversal)
 * accetta BA-2025-DEMO o codici simili; altrimenti 400
 */
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

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function getKalkulationKiFile(projectKey: string) {
  return path.join(
    PROJECTS_ROOT,
    projectKey,
    "kalkulation",
    "ki-kalkulation.json"
  );
}

function pickVisionModel() {
  const m = String(process.env.OPENAI_VISION_MODEL || "").trim();
  // ✅ robust fallback
  return m || "gpt-4o-mini";
}

function pickTextModel() {
  const m = String(process.env.OPENAI_MODEL || "").trim();
  // ✅ robust fallback (gpt-4.1-mini può non essere abilitato su alcuni account/env)
  return m || "gpt-4o-mini";
}

/**
 * ✅ Consistent OpenAI error payload (keeps requestId when available)
 */
function openAiErrorPayload(err: any) {
  const status =
    Number(err?.status) ||
    Number(err?.response?.status) ||
    Number(err?.statusCode) ||
    undefined;

  // OpenAI SDK may expose request id differently
  const requestId =
    err?.request_id ||
    err?.requestId ||
    err?.response?.headers?.["x-request-id"] ||
    err?.headers?.["x-request-id"] ||
    err?.responseHeaders?.["x-request-id"] ||
    undefined;

  // Try to extract detail
  const detail =
    err?.error?.message ||
    err?.message ||
    (typeof err === "string" ? err : undefined) ||
    "Unknown error";

  // Some errors include a JSON body string in message - keep it readable
  let safeDetail = String(detail);
  if (safeDetail.length > 2000) safeDetail = safeDetail.slice(0, 2000);

  return {
    error: "KI request failed",
    detail: safeDetail,
    requestId: requestId ? String(requestId) : undefined,
    status: status || undefined,
  };
}

function requireOpenAiKeyOrRespond(res: express.Response) {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({
      error: "OPENAI_API_KEY fehlt",
      detail:
        "Server hat keinen OPENAI_API_KEY. Setze ihn in apps/server/.env und starte den Server neu.",
    });
    return false;
  }
  return true;
}

/**
 * ✅ HEIC/HEIF support: convert to JPEG for Vision
 */
async function toVisionJpegIfNeeded(file: Express.Multer.File) {
  const mt = String(file.mimetype || "").toLowerCase();

  if (/^image\/(png|jpe?g|webp)$/i.test(mt)) {
    return { buffer: file.buffer, mime: file.mimetype };
  }

  if (mt === "image/heic" || mt === "image/heif") {
    const buf = await sharp(file.buffer).jpeg({ quality: 90 }).toBuffer();
    return { buffer: buf, mime: "image/jpeg" };
  }

  if (mt.startsWith("image/")) {
    const buf = await sharp(file.buffer).jpeg({ quality: 90 }).toBuffer();
    return { buffer: buf, mime: "image/jpeg" };
  }

  throw new Error(`Unsupported mimetype: ${file.mimetype}`);
}

const SaveSchema = z
  .object({
    meta: z
      .object({
        pricingDate: z.string().optional(),
        companyId: z.string().optional(),
        mode: z.string().optional(),
        markupPercent: z.number().optional(),
        rabattPercent: z.number().optional(),
        note: z.string().optional(),
      })
      .optional(),
    rows: z.any(),
    totals: z.any().optional(),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
  })
  .strict()
  .passthrough();

/**
 * ✅ helper: fuzzy check nell'LV esistente via /api/lv/search
 */
async function findInLV(projectId: string | undefined, q: string) {
  if (!projectId) return null;
  try {
    const base = apiBaseUrl();
    const url = `${base}/api/lv/search?projectId=${encodeURIComponent(
      projectId
    )}&q=${encodeURIComponent(q)}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const items = await r.json();
    if (!Array.isArray(items) || items.length === 0) return null;

    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9äöüß\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

    const nq = norm(q);
    let best: any = null;
    let bestScore = 0;

    for (const it of items) {
      const nt = norm(String(it.kurztext || ""));
      const setA = new Set(nq.split(" ").filter(Boolean));
      const setB = new Set(nt.split(" ").filter(Boolean));
      const inter = [...setA].filter((w) => setB.has(w)).length;
      const union = new Set([...setA, ...setB]).size || 1;
      const score = inter / union; // 0..1
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }

    return bestScore >= 0.35 ? { ...best, _score: bestScore } : null;
  } catch {
    return null;
  }
}

function mergeVisionEntities(entities: any): any {
  try {
    const e = entities || {};
    const extracted = Array.isArray(e?.extracted) ? e.extracted : [];
    if (!extracted.length) return e;

    let best: any = extracted[0];
    for (const it of extracted) {
      const score =
        (it?.entities?.lieferschein ? 5 : 0) +
        (Array.isArray(it?.entities?.materialien)
          ? it.entities.materialien.length
          : 0) +
        (it?.text ? 1 : 0);
      const bestScore =
        (best?.entities?.lieferschein ? 5 : 0) +
        (Array.isArray(best?.entities?.materialien)
          ? best.entities.materialien.length
          : 0) +
        (best?.text ? 1 : 0);
      if (score > bestScore) best = it;
    }

    const flat = {
      ...(e || {}),
      ...(best?.entities || {}),
      _visionText: String(best?.text || e?.text || "").trim(),
    };

    return flat;
  } catch {
    return entities || {};
  }
}

function parseWeightFallback(text: string) {
  const t = String(text || "");
  const m =
    t.match(
      /netto(?:gewicht)?\s*[:\-]?\s*([0-9]{1,3}(?:[.\s][0-9]{3})*(?:[.,][0-9]+)?)\s*(t|kg)\b/i
    ) ||
    t.match(
      /nettogewicht\s*[:\-]?\s*([0-9]{1,3}(?:[.\s][0-9]{3})*(?:[.,][0-9]+)?)\s*(t|kg)\b/i
    );

  if (!m) return null;

  const numRaw = String(m[1] || "").trim();
  const unit = String(m[2] || "").trim().toLowerCase();

  let s = numRaw.replace(/\s/g, "");
  if (s.includes(".") && s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(",", ".");
  }
  const value = Number(s);
  if (!Number.isFinite(value)) return null;

  return { quantity: value, unit };
}

function parseTimeFallback(text: string) {
  const t = String(text || "");
  const m = t.match(
    /\b(uhrzeit|zeit)\s*[:\-]?\s*([0-2]?\d:[0-5]\d)\b/i
  );
  if (!m) return null;
  return { zeitVon: String(m[2] || "").trim() };
}

export function parseLieferschein(
  ocrResults: Array<{ file: string; text: string }>
): Array<{
  lieferant?: string;
  datum?: string;
  material?: string;
  menge?: number;
  einheit?: string;
  preis?: number;
  kostenstelle?: string;
}> {
  const out: any[] = [];
  for (const r of ocrResults) {
    const t = String(r.text || "");
    if (/Lieferschein/i.test(t)) {
      const lieferant = (t.match(/Firma\s+([^\n]+)/i) || [, ""])[1];
      const material = (t.match(/Material:\s*([^\n]+)/i) || [, ""])[1];
      const mengeStr = (t.match(/Menge:\s*([0-9.,]+)/i) || [, "0"])[1];
      const menge = Number(String(mengeStr).replace(",", "."));
      const einheit = /\bt\b/i.test(t) ? "t" : "stk";
      const datum = (t.match(/Datum:\s*([0-9\-./]+)/i) || [, ""])[1];
      const kostenstelle = (t.match(/Kostenstelle:\s*([^\n]+)/i) || [, ""])[1];
      out.push({
        lieferant: lieferant || undefined,
        datum: datum || undefined,
        material: material || undefined,
        menge: isFinite(menge) ? menge : undefined,
        einheit,
        preis: undefined,
        kostenstelle: kostenstelle || undefined,
      });
    }
  }
  return out;
}

router.post("/lieferschein-parse", async (req, res) => {
  try {
    const body = req.body || {};
    const ocrResults = Array.isArray(body.ocrResults) ? body.ocrResults : [];
    if (!ocrResults.length) {
      return res.status(400).json({ error: "ocrResults[] fehlt" });
    }
    const items = parseLieferschein(
      ocrResults.map((x: any) => ({
        file: String(x.file || ""),
        text: String(x.text || ""),
      }))
    );
    return res.json({ ok: true, items });
  } catch (err: any) {
    console.error("lieferschein-parse error:", err);
    return res
      .status(500)
      .json({ error: "lieferschein-parse fehlgeschlagen" });
  }
});

router.post("/photo-analyze", upload.single("file"), async (req, res) => {
  try {
    if (!requireOpenAiKeyOrRespond(res)) return;

    const note = String(req.body.note || "");
    const projectId = req.body.projectId as string | undefined;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Kein Bild hochgeladen" });

    const { buffer, mime } = await toVisionJpegIfNeeded(file);
    const base64 = buffer.toString("base64");

    const PROMPT = `Analysiere das Baustellenfoto fachlich als Kalkulator (Tief-/Straßenbau).
Erkenne ARBEITEN/LV-Positionen, NICHT Mengen. Nenne auch implizite Leistungen (z.B. Frostschutz unter Pflaster).
Gib NUR JSON:
{
  "positions":[
    {"kurztext":"Pflaster aus Betonsteinen verlegen","einheit":"m²","typ":"sichtbar"},
    {"kurztext":"Bordsteine setzen","einheit":"m","typ":"sichtbar"},
    {"kurztext":"Schacht versetzen/setzen","einheit":"St","typ":"sichtbar"},
    {"kurztext":"Frostschutzkies liefern und einbauen","einheit":"m³","typ":"implizit"}
  ],
  "summary":"Kurze Beschreibung in einem Satz."
}`;

    const out = await ai.chat.completions.create({
      model: pickVisionModel(),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Du bist Bauingenieur/Kalkulator. Erkenne geeignete LV-Positionen aus Fotos.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: PROMPT + (note ? `\nHinweis des Benutzers: ${note}` : ""),
            },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        },
      ],
    });

    const parsed = JSON.parse(out.choices?.[0]?.message?.content || "{}");
    const positions: Array<{
      kurztext: string;
      einheit?: string;
      typ?: "sichtbar" | "implizit";
    }> = parsed?.positions || [];

    const enriched = await Promise.all(
      positions.map(async (p, idx) => {
        const match = await findInLV(projectId, p.kurztext);
        return {
          id: String(idx + 1),
          kurztext: p.kurztext,
          einheit: p.einheit || "",
          typ: p.typ || "sichtbar",
          status: match ? "bestehend" : "nachtrag",
          match: match
            ? {
                id: match.id,
                kurztext: match.kurztext,
                einheit: match.einheit,
                score: match._score,
              }
            : undefined,
        };
      })
    );

    res.json({
      positions: enriched,
      summary: parsed?.summary || `Foto analysiert (${file.originalname})`,
    });
  } catch (err: any) {
    console.error("KI Analyse Fehler:", err);
    res.status(500).json(openAiErrorPayload(err));
  }
});

function buildVisionPrompt(kind: string) {
  const K = String(kind || "REGIE").toUpperCase();

  if (K === "LS" || K === "LIEFERSCHEIN") {
    return `Du extrahierst Daten aus einem deutschen Lieferschein-Foto (Baustelle).
Gib NUR JSON, KEIN Text ausserhalb.

Schema:
{
  "text": "kurzer Extrakt (max 20 Zeilen)",
  "entities": {
    "lieferschein": {
      "lieferant": "string|null",
      "lieferscheinNr": "string|null",
      "datum": "YYYY-MM-DD|null",
      "baustelle": "string|null",
      "kostenstelle": "string|null",
      "kennzeichen": "string|null",
      "fahrer": "string|null"
    },
    "materialien": [
      { "bezeichnung": "string", "menge": number|null, "einheit": "string|null" }
    ],
    "arbeiten": ["..."],
    "zeiten": { "start": "HH:MM|null", "ende": "HH:MM|null" }
  }
}

Regeln:
- Datum normalisieren auf YYYY-MM-DD wenn erkennbar, sonst null.
- Menge als Zahl (Komma oder Punkt -> Zahl), Einheit z.B. t, m3, kg, St, m.
- Wenn mehrere Positionen vorhanden: alle in materialien[].
- Falls etwas unklar: null statt raten.`;
  }

  return `Extrahiere Informationen aus einem Baustellen-Foto/Dokument fuer ${K}.
Gib NUR JSON:
{
  "text": "kurzer Text (max 20 Zeilen)",
  "entities": {
    "arbeiten": ["..."],
    "materialien": ["..."],
    "maschinen": ["..."],
    "personal": ["..."],
    "zeiten": { "start": "HH:MM", "ende": "HH:MM" }
  }
}`;
}

router.post("/vision-files", upload.array("files", 10), async (req, res) => {
  try {
    if (!requireOpenAiKeyOrRespond(res)) return;

    const kind = String((req.body as any)?.kind || "REGIE");
    const note = String((req.body as any)?.note || "");
    const projectId = (req.body as any)?.projectId as string | undefined;
    const projectCode = (req.body as any)?.projectCode as string | undefined;
    const date = String((req.body as any)?.date || "");
    const screen = String((req.body as any)?.screen || "");

    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) return res.status(400).json({ error: "files[] fehlt" });

    const imgFiles = files.filter((f) =>
      /^image\/(png|jpe?g|webp|heic|heif)$/i.test(String(f.mimetype || ""))
    );
    const pdfFiles = files.filter(
      (f) => String(f.mimetype || "").toLowerCase() === "application/pdf"
    );

    const extracted: any[] = [];
    let combinedText = "";

    for (const f of imgFiles.slice(0, 6)) {
      const PROMPT = buildVisionPrompt(kind);

      const { buffer, mime } = await toVisionJpegIfNeeded(f);
      const base64 = buffer.toString("base64");

      const out = await ai.chat.completions.create({
        model: pickVisionModel(),
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Du liest Baustellenfotos/Dokumente und extrahierst strukturierte Daten. Antworte strikt als JSON.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  PROMPT +
                  `\nKontext: kind=${String(
                    kind || "REGIE"
                  )} project=${projectId || projectCode || "-"} date=${
                    date || "-"
                  } screen=${screen || "-"}\n` +
                  (note ? `Hinweis: ${note}\n` : "") +
                  `Dateiname: ${f.originalname}`,
              },
              {
                type: "image_url",
                image_url: { url: `data:${mime};base64,${base64}` },
              },
            ],
          },
        ],
      });

      const json = JSON.parse(out.choices?.[0]?.message?.content || "{}");
      extracted.push({
        file: f.originalname,
        text: String(json?.text || ""),
        entities: json?.entities || {},
      });

      if (json?.text) combinedText += String(json.text).trim() + "\n";
    }

    if (pdfFiles.length) {
      const names = pdfFiles.map((p) => p.originalname).join(", ");
      combinedText += `PDF(s): ${names}\n`;
      extracted.push({
        file: names,
        text: `PDF(s) erhalten: ${names}`,
        entities: { pdf: pdfFiles.map((p) => ({ name: p.originalname })) },
      });
    }

    combinedText = combinedText.trim();

    return res.json({
      ok: true,
      kind,
      projectId,
      projectCode,
      date,
      screen,
      text: combinedText || (note ? note : ""),
      rawText: combinedText || "",
      entities: {
        note: note || undefined,
        extracted,
      },
      files: files.map((f) => ({
        name: f.originalname,
        type: f.mimetype,
        size: f.size,
      })),
    });
  } catch (err: any) {
    console.error("vision-files error:", err);
    return res.status(500).json(openAiErrorPayload(err));
  }
});

router.post("/measure", async (req, res) => {
  try {
    const { docId, unitScale } = req.body || {};
    if (!docId) return res.status(400).json({ error: "docId fehlt" });
    const u = Number(unitScale) || 1;
    const items = [
      {
        id: "L1",
        type: "line",
        label: "Graben Leitung",
        value: 128.4 * u,
        unit: "m",
      },
      {
        id: "A1",
        type: "area",
        label: "Asphalt Fläche",
        value: 312.7 * u,
        unit: "m²",
      },
      {
        id: "V1",
        type: "volume",
        label: "Aushub Volumen",
        value: 95.2 * u,
        unit: "m³",
      },
    ];
    res.json({ items, docId, scale: u });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "measure fehlgeschlagen" });
  }
});

/* ============================================================
 * 3) KI-SUGGEST
 * - PRICE mode se arriva {kurztext,...}
 * - REGIE/LS mode se arriva {text, kind,...} -> {suggestions:[{fieldPatches,...}]}
 * ============================================================ */

router.post("/suggest", async (req, res) => {
  try {
    if (!requireOpenAiKeyOrRespond(res)) return;

    const body = req.body || {};

    const kind = String(body?.kind || "").trim();
    const text = String(body?.text || "").trim();

    const hasRegieSignals =
      !!text ||
      !!kind ||
      body?.entities != null ||
      body?.current != null ||
      body?.mitarbeiter != null ||
      body?.maschinen != null ||
      body?.material != null ||
      body?.materialien != null ||
      body?.kostenstelle != null ||
      body?.hours != null ||
      body?.stunden != null ||
      body?.arbeitsbeginn != null ||
      body?.arbeitsende != null ||
      body?.zeitVon != null ||
      body?.zeitBis != null ||
      body?.pause1 != null ||
      body?.pause2 != null ||
      body?.comment != null ||
      body?.bemerkungen != null ||
      body?.bemerkung != null;

    // ---- A) PRICE MODE (legacy) ----
    const kurztext = body?.kurztext;
    if (kurztext && !hasRegieSignals) {
      const { einheit } = body;

      const prompt = `Du bist Kalkulator Tief-/Straßenbau.
Gib als JSON {"unitPrice": number, "confidence": number} (EUR netto, 0..1).
Position: ${kurztext} | Einheit: ${einheit || "-"}`;

      const out = await ai.chat.completions.create({
        model: pickTextModel(),
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      });

      const json = JSON.parse(out.choices[0].message?.content || "{}");
      return res.json(json);
    }

    // ---- B) REGIE/GENERIC MODE ----
    const finalKind = String(body?.kind || "REGIE");
    const finalText = String(body?.text || "").trim();

    const fallbackText =
      finalText ||
      [
        body?.kurztext ? `Kurztext: ${String(body.kurztext)}` : "",
        body?.comment ? `Kommentar: ${String(body.comment)}` : "",
        body?.bemerkungen ? `Bemerkungen: ${String(body.bemerkungen)}` : "",
        body?.bemerkung ? `Bemerkung: ${String(body.bemerkung)}` : "",
        body?.mitarbeiter ? `Mitarbeiter: ${String(body.mitarbeiter)}` : "",
        body?.maschinen ? `Maschinen: ${String(body.maschinen)}` : "",
        body?.material ? `Material: ${String(body.material)}` : "",
        body?.materialien ? `Materialien: ${String(body.materialien)}` : "",
        body?.hours != null ? `Hours: ${String(body.hours)}` : "",
        body?.stunden != null ? `Stunden: ${String(body.stunden)}` : "",
        body?.kostenstelle ? `Kostenstelle: ${String(body.kostenstelle)}` : "",
        body?.arbeitsbeginn ? `Arbeitsbeginn: ${String(body.arbeitsbeginn)}` : "",
        body?.arbeitsende ? `Arbeitsende: ${String(body.arbeitsende)}` : "",
        body?.zeitVon ? `ZeitVon: ${String(body.zeitVon)}` : "",
        body?.zeitBis ? `ZeitBis: ${String(body.zeitBis)}` : "",
        body?.pause1 ? `Pause1: ${String(body.pause1)}` : "",
        body?.pause2 ? `Pause2: ${String(body.pause2)}` : "",
      ]
        .filter(Boolean)
        .join("\n")
        .trim();

    if (!fallbackText) return res.status(400).json({ error: "text fehlt" });

    const projectId = body?.projectId as string | undefined;
    const projectCode = body?.projectCode as string | undefined;
    const date = String(body?.date || "");
    const screen = String(body?.screen || "");

    const entitiesRaw = body?.entities || {};
    const entitiesFlat = mergeVisionEntities(entitiesRaw);
    const current = body?.current || {};

    const isLS = ["LS", "LIEFERSCHEIN"].includes(
      String(finalKind || "").toUpperCase()
    );

    const visionText =
      String(entitiesFlat?._visionText || "") ||
      (Array.isArray(entitiesRaw?.extracted) && entitiesRaw.extracted[0]?.text
        ? String(entitiesRaw.extracted[0].text)
        : "");
    const weightFallback = isLS
      ? parseWeightFallback(visionText || fallbackText)
      : null;
    const timeFallback = isLS ? parseTimeFallback(visionText || fallbackText) : null;

    const sys =
      "Du bist Bauleiter-Assistent im Tief-/Straßenbau. Du füllst Formulare aus. Antworte strikt als JSON.";

    const usr = isLS
      ? `Erzeuge Vorschlaege zum Ausfuellen eines Lieferscheins (Baustelle).
Kontext: kind=${finalKind} project=${projectId || projectCode || "-"} date=${date || "-"} screen=${screen || "-"}.

WICHTIG:
- Es ist ein Lieferschein. Extrahiere: LS-Nr, Lieferant, Baustelle/Kostenstelle, Material (Bezeichnung), Menge, Einheit, Text/Beschreibung, Bemerkungen, Zeit von/bis.
- Gib keine Fantasie-Daten. Wenn unklar -> leere Strings oder null.
- Menge als Zahl. Einheit z.B. "t", "kg", "m3", "St", "m".
- Wenn du Nettogewicht/Bruttogewicht siehst, nutze Nettogewicht als Menge.

Antworte NUR als JSON im Schema:
{
  "suggestions": [
    {
      "fieldPatches": {
        "lsNr": "string",
        "lieferant": "string",
        "baustelle": "string",
        "kostenstelle": "string",
        "fahrer": "string",
        "material": "string",
        "menge": number|null,
        "einheit": "string",
        "textBeschreibung": "string",
        "bemerkungen": "string",
        "lvPosition": "string",
        "zeitVon": "HH:MM",
        "zeitBis": "HH:MM"
      },
      "lvMatches": [
        { "posNr": "string", "kurztext": "string", "einheit": "string", "score": number }
      ],
      "quantities": [
        { "label": "string", "value": number, "unit": "string", "confidence": number }
      ],
      "notes": "string"
    }
  ]
}

Text:
"""${fallbackText}"""

Entities (optional, aus Vision/OCR):
${JSON.stringify(entitiesFlat || {}, null, 2).slice(0, 8000)}

Current (optional):
${JSON.stringify(current || {}, null, 2).slice(0, 8000)}

Hilfs-Fallback (wenn sinnvoll):
${JSON.stringify(
  {
    nettogewichtDetected: weightFallback || null,
    timeDetected: timeFallback || null,
  },
  null,
  2
)}`
      : `Erzeuge Vorschlaege zum Ausfuellen.
Kontext: kind=${finalKind} project=${projectId || projectCode || "-"} date=${date || "-"} screen=${screen || "-"}.

Antworte NUR als JSON im Schema:
{
  "suggestions": [
    {
      "fieldPatches": {
        "comment": "string",
        "mitarbeiter": "string",
        "maschinen": "string",
        "materialien": "string",
        "hours": number,
        "unit": "Std|h",
        "kostenstelle": "string",
        "bemerkungen": "string",
        "arbeitsbeginn": "HH:MM",
        "arbeitsende": "HH:MM",
        "pause1": "HH:MM-HH:MM",
        "pause2": "HH:MM-HH:MM",
        "lvItemPos": "string|null"
      },
      "lvMatches": [
        { "posNr": "string", "kurztext": "string", "einheit": "string", "score": number }
      ],
      "quantities": [
        { "label": "string", "value": number, "unit": "string", "confidence": number }
      ],
      "notes": "string"
    }
  ]
}

Text:
"""${fallbackText}"""

Entities (optional):
${JSON.stringify(entitiesFlat || {}, null, 2).slice(0, 6000)}

Current (optional):
${JSON.stringify(current || {}, null, 2).slice(0, 6000)}
`;

    const out = await ai.chat.completions.create({
      model: pickTextModel(),
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const json = JSON.parse(out.choices[0].message?.content || "{}");
    const suggestions = Array.isArray(json?.suggestions) ? json.suggestions : [];

    // ✅ Post-fix LS: aumenta riempimento (materiali multipli + peso + campi base)
    if (isLS && suggestions.length) {
      const s0 = suggestions[0] || {};
      const fp = (s0.fieldPatches || {}) as any;

      const lsEnt = (entitiesFlat?.lieferschein || {}) as any;
      const mats = Array.isArray(entitiesFlat?.materialien)
        ? entitiesFlat.materialien
        : [];

      // 1) material: se manca, collassa tutte le righe materiali
      if (!fp.material || String(fp.material).trim() === "") {
        if (mats.length) {
          fp.material = mats
            .map((m: any) => {
              const b = String(m?.bezeichnung || "").trim();
              const q = m?.menge != null ? String(m.menge) : "";
              const u = String(m?.einheit || "").trim();
              return [b, q && u ? `${q} ${u}` : q || u].filter(Boolean).join(" – ");
            })
            .filter(Boolean)
            .join("\n");
        } else if (
          Array.isArray(lsEnt?.materialien) &&
          lsEnt.materialien[0]?.bezeichnung
        ) {
          fp.material = String(lsEnt.materialien[0].bezeichnung);
        }
      }

      // 2) menge/einheit: somma righe se numeriche, oppure nettogewicht fallback
      if (fp.menge == null || Number.isNaN(fp.menge)) {
        const nums = mats
          .map((m: any) => Number(m?.menge))
          .filter((x: any) => Number.isFinite(x));
        if (nums.length) {
          fp.menge = nums.reduce((a: number, b: number) => a + b, 0);
          const units = new Set(
            mats
              .map((m: any) => String(m?.einheit || "").trim())
              .filter(Boolean)
          );
          if (!fp.einheit && units.size === 1) fp.einheit = [...units][0];
        } else if (weightFallback) {
          fp.menge = weightFallback.quantity;
          if (!fp.einheit) fp.einheit = weightFallback.unit;
        }
      } else {
        fp.menge = Number(fp.menge);
      }

      // 3) zeitVon fallback
      if (!fp.zeitVon && timeFallback?.zeitVon) fp.zeitVon = timeFallback.zeitVon;

      // 4) basic headers
      if (!fp.lieferant && lsEnt?.lieferant) fp.lieferant = String(lsEnt.lieferant);
      if (!fp.lsNr && lsEnt?.lieferscheinNr) fp.lsNr = String(lsEnt.lieferscheinNr);
      if (
        !fp.kostenstelle &&
        (lsEnt?.kostenstelle || entitiesFlat?.kostenstelle)
      ) {
        fp.kostenstelle = String(lsEnt?.kostenstelle || entitiesFlat?.kostenstelle);
      }
      if (!fp.baustelle && lsEnt?.baustelle) fp.baustelle = String(lsEnt.baustelle);
      if (!fp.fahrer && lsEnt?.fahrer) fp.fahrer = String(lsEnt.fahrer);

      s0.fieldPatches = fp;
      suggestions[0] = s0;
    }

    return res.json({ suggestions });
  } catch (err: any) {
    console.error("ki/suggest error:", err);
    return res.status(500).json(openAiErrorPayload(err));
  }
});

router.post("/regie-suggest", async (req, res) => {
  try {
    if (!requireOpenAiKeyOrRespond(res)) return;

    const { text, projectId, projectCode, date, entities, current } =
      req.body || {};
    const baseText = String(text || "").trim();
    if (!baseText) return res.status(400).json({ error: "text fehlt" });

    const sys =
      "Du bist Bauleiter-Assistent im Tief-/Straßenbau. Du füllst einen Regiebericht aus. Antworte strikt als JSON.";

    const usr = `Erzeuge Vorschlaege zum Ausfuellen eines Regieberichts.
Gib NUR dieses JSON-Schema zurueck:

{
  "suggestions": [
    {
      "fieldPatches": {
        "comment": "string",
        "mitarbeiter": "string",
        "maschinen": "string",
        "materialien": "string",
        "hours": number,
        "unit": "Std|h",
        "kostenstelle": "string",
        "bemerkungen": "string",
        "arbeitsbeginn": "HH:MM",
        "arbeitsende": "HH:MM",
        "pause1": "HH:MM-HH:MM",
        "pause2": "HH:MM-HH:MM",
        "lvItemPos": "string|null"
      },
      "lvMatches": [
        { "posNr": "string", "kurztext": "string", "einheit": "string", "score": number }
      ],
      "quantities": [
        { "label": "string", "value": number, "unit": "string", "confidence": number }
      ],
      "notes": "string"
    }
  ]
}

Kontext:
- projectId: ${String(projectId || projectCode || "-")}
- date: ${String(date || "-")}

Text:
"""${baseText}"""

Entities (optional):
${JSON.stringify(entities || {}, null, 2).slice(0, 6000)}

Current (optional):
${JSON.stringify(current || {}, null, 2).slice(0, 6000)}
`;

    const out = await ai.chat.completions.create({
      model: pickTextModel(),
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const json = JSON.parse(out.choices[0].message?.content || "{}");
    const suggestions = Array.isArray(json?.suggestions) ? json.suggestions : [];
    return res.json({ suggestions });
  } catch (err: any) {
    console.error("regie-suggest error:", err);
    return res.status(500).json(openAiErrorPayload(err));
  }
});

router.post("/propose", async (req, res) => {
  try {
    if (!requireOpenAiKeyOrRespond(res)) return;

    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Text fehlt" });

    const prompt = `Erzeuge LV-Positionen als JSON-Array (realistisch, deutsch).
Antworte als JSON-Objekt mit Feld "items" (Array).
Beispiel:
{"items":[{"posNr":"01.001","kurztext":"Kabelgraben 60cm tief","einheit":"m","menge":120,"preis":12.5,"confidence":0.9}]}

Beschreibung:
${text}`;

    const out = await ai.chat.completions.create({
      model: pickTextModel(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    let parsed: any = {};
    try {
      parsed = JSON.parse(out.choices[0].message?.content || "{}");
    } catch {
      parsed = {};
    }

    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.items)
      ? parsed.items
      : Array.isArray(parsed?.positions)
      ? parsed.positions
      : [];

    res.json({ items });
  } catch (err: any) {
    console.error("propose error:", err);
    return res.status(500).json(openAiErrorPayload(err));
  }
});

router.post("/voice-parse", async (req, res) => {
  try {
    if (!requireOpenAiKeyOrRespond(res)) return;

    const { text, projectId } = req.body || {};
    if (!text) return res.status(400).json({ error: "text fehlt" });

    const prompt = `Du bist Bauleiter-Assistent (Deutsch).
Parse folgende gesprochene Notiz für einen Regiebericht in strukturierte Items.
Nur JSON antworten:

{
  "summary": "kurze Zusammenfassung in einem Satz",
  "items": [
    {
      "kurztext": "Kurzbeschreibung der Tätigkeit",
      "einheit": "m|m²|St|h|t",
      "menge": number,
      "ort": "optional",
      "bemerkung": "optional"
    }
  ],
  "zeit": { "start": "HH:MM", "ende": "HH:MM" },
  "personal": [{ "rolle": "Facharbeiter|Baggerführer|LKW", "stunden": number }],
  "maschinen": [{ "geraet": "Bagger 5t|Rüttelplatte", "stunden": number }]
}

Gesprochener Text:
"""${text}"""`;

    const out = await ai.chat.completions.create({
      model: pickTextModel(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const json = JSON.parse(out.choices[0].message?.content || "{}");
    res.json({ projectId, ...json });
  } catch (err: any) {
    console.error("voice-parse error:", err);
    return res.status(500).json(openAiErrorPayload(err));
  }
});

function parseSpeechSimple(text: string, projectId: string, date?: string) {
  const isoDate = (date || new Date().toISOString().slice(0, 10)).replace(
    /(\d{2})\.(\d{2})\.(\d{4})/,
    "$3-$2-$1"
  );

  const worker =
    text
      .match(
        /(mitarbeiter|arbeiter|arbeiterin)[:\s]*([A-Za-zÄÖÜäöüß\-.\s]+)/i
      )?.[2]
      ?.trim() ||
    text.match(/(von )?([A-ZÄÖÜ][a-zäöüß]+ [A-ZÄÖÜ][a-zäöüß]+)/)?.[2];

  const hours = Number(
    (
      text.match(/(stunden|std\.?)[:\s]*([0-9]+(?:[.,][0-9]+)?)/i)?.[2] ||
      "0"
    ).replace(",", ".")
  );

  const machine = text
    .match(/(maschine|bagger|lkw|walze)[:\s]*([A-Za-z0-9\-\/.\s]+)/i)?.[2]
    ?.trim();
  const material = text.match(/(material)[:\s]*([^\n]+)/i)?.[2]?.trim();
  const quantity = Number(
    (
      text.match(/(menge|anzahl)[:\s]*([0-9]+(?:[.,][0-9]+)?)/i)?.[2] || "0"
    ).replace(",", ".")
  );

  const unit =
    text.match(/(einheit)[:\s]*([A-Za-zÄÖÜäöüß]+)/i)?.[2]?.trim() ||
    (text.match(/\b(st|std)\b/i) ? "Std" : undefined) ||
    undefined;

  const comment =
    text.match(/(beschreibung|bemerkung)[:\s]*([^\n]+)/i)?.[2]?.trim() ||
    text.trim();

  const lvItemPos = text
    .match(/(lv[\s\-]*pos|pos\.?)[:\s]*([A-Za-z0-9.\-]+)/i)?.[2]
    ?.trim();

  return {
    projectId,
    date: isoDate,
    worker: worker || "",
    hours: isFinite(hours) ? hours : 0,
    machine: machine || "",
    material: material || "",
    quantity: isFinite(quantity) ? quantity : 0,
    unit: unit || "Std",
    comment,
    lvItemPos: lvItemPos || undefined,
  };
}

router.post("/parse-speech", async (req, res) => {
  try {
    const { text, projectId, date } = req.body || {};
    if (!text || !projectId) {
      return res
        .status(400)
        .json({ error: "text und projectId sind erforderlich" });
    }
    const item = parseSpeechSimple(String(text), String(projectId), date);
    return res.json({ ok: true, item });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "parse-speech fehlgeschlagen" });
  }
});

router.post("/parse-speech/save", async (req, res) => {
  try {
    const { text, projectId, date } = req.body || {};
    if (!text || !projectId) {
      return res
        .status(400)
        .json({ error: "text und projectId sind erforderlich" });
    }

    const item = parseSpeechSimple(String(text), String(projectId), date);

    const base = apiBaseUrl();
    const saveRes = await fetch(`${base}/api/regie`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });

    if (!saveRes.ok) {
      const t = await saveRes.text().catch(() => "");
      return res.status(500).json({ error: "Speichern fehlgeschlagen", detail: t });
    }

    const saved = await saveRes.json();
    return res.json({ ok: true, saved: (saved as any).item || saved });
  } catch (err: any) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "parse-speech/save fehlgeschlagen" });
  }
});

router.post("/offer-review", async (req, res) => {
  try {
    if (!requireOpenAiKeyOrRespond(res)) return;

    const { projectId, lv, offers, weights } = req.body || {};
    if (!Array.isArray(lv) || !Array.isArray(offers) || offers.length === 0) {
      return res.status(400).json({ error: "lv[] e offers[] richiesti" });
    }

    const compactLV = lv.slice(0, 80).map((r: any) => ({
      pos: String(r.posNr ?? ""),
      txt: String(r.kurztext ?? ""),
      e: String(r.einheit ?? ""),
      q: Number(r.menge ?? 0),
    }));

    const compactOffers = offers.map((o: any) => ({
      name: String(o.name),
      total: Number(o.total || 0),
      score: Number(o.score || 0),
      sample: (o.sample || []).slice(0, 80).map((r: any) => ({
        pos: String(r.posNr ?? ""),
        txt: String(r.kurztext ?? ""),
        e: String(r.einheit ?? ""),
        q: Number(r.menge ?? 0),
        ep: Number(r.ep ?? 0),
      })),
    }));

    const sys = `Du bist ein erfahrener Kalkulator im Tief- und Straßenbau.
Bewerte Angebote im Vergleich zum LV. Sei fachlich knapp, ohne Floskeln.`;
    const usr = `Projekt: ${projectId || "-"}
Gewichtung: ${JSON.stringify(weights || {})}
LV (Ausschnitt): ${JSON.stringify(compactLV).slice(0, 8000)}
Angebote (Ausschnitt): ${JSON.stringify(compactOffers).slice(0, 8000)}

Antworte NUR als JSON:
{
  "summary": "...",
  "perOffer": [{"name":"...", "notes":"..."}]
}`;

    const out = await ai.chat.completions.create({
      model: pickTextModel(),
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    let payload: any = {};
    try {
      payload = JSON.parse(out.choices[0].message?.content || "{}");
    } catch {}

    return res.json({
      summary: payload.summary || "",
      perOffer: payload.perOffer || [],
    });
  } catch (err: any) {
    console.error("offer-review error:", err);
    return res.status(500).json(openAiErrorPayload(err));
  }
});

router.post("/abrechnung", async (req, res) => {
  try {
    if (!requireOpenAiKeyOrRespond(res)) return;

    const { projectId, lv } = req.body || {};
    if (!Array.isArray(lv) || lv.length === 0) {
      return res.status(400).json({ error: "lv[] erforderlich" });
    }

    const sys =
      "Du bist ein erfahrener Baukalkulator. Analysiere Soll/Ist-Mengen und erstelle eine kurze Abrechnungsempfehlung.";
    const usr = `Projekt ${projectId || "-"} – LV: ${JSON.stringify(lv).slice(0, 8000)}

Antworte NUR als JSON:
{
  "summary": "3-6 Sätze",
  "progressPercent": number,
  "recommendedAbschlag": number,
  "notes": ["...","..."]
}`;

    const out = await ai.chat.completions.create({
      model: pickTextModel(),
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    let payload: any = {};
    try {
      payload = JSON.parse(out.choices[0].message?.content || "{}");
    } catch {}

    res.json(payload);
  } catch (e: any) {
    console.error("abrechnung error", e);
    return res.status(500).json(openAiErrorPayload(e));
  }
});

// GET /kalkulation/:projectKey/ki
router.get("/kalkulation/:projectKey/ki", async (req, res) => {
  try {
    const projectKey = assertSafeProjectKey(req.params.projectKey);
    const file = getKalkulationKiFile(projectKey);
    if (!fs.existsSync(file)) return res.json({ ok: true, exists: false });

    const raw = fs.readFileSync(file, "utf-8");
    return res.json({ ok: true, exists: true, data: JSON.parse(raw) });
  } catch (e: any) {
    console.error("kalkulation ki load error", e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "load failed" });
  }
});

// POST /kalkulation/:projectKey/ki/save
router.post("/kalkulation/:projectKey/ki/save", async (req, res) => {
  try {
    const projectKey = assertSafeProjectKey(req.params.projectKey);

    const parsed = SaveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "invalid payload",
        issues: parsed.error.issues,
      });
    }

    const dir = path.join(PROJECTS_ROOT, projectKey, "kalkulation");
    ensureDir(dir);

    const file = getKalkulationKiFile(projectKey);
    const now = Date.now();

    const payload = {
      ...parsed.data,
      createdAt: parsed.data.createdAt ?? now,
      updatedAt: now,
    };

    fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf-8");
    return res.json({ ok: true, file });
  } catch (e: any) {
    console.error("kalkulation ki save error", e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "save failed" });
  }
});

export default router;
