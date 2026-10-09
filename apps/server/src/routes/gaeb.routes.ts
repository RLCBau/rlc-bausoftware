// apps/server/src/routes/gaeb.routes.ts
import express, { type Request, type Response } from "express";
import multer from "multer";
import iconv from "iconv-lite";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { PROJECTS_ROOT } from "../lib/projectsRoot";
import { buildGaebX84Xml, buildGaebX85X87Xml } from "../gaeb/gaebXml33";
import { buildGaeb2000 } from "../gaeb/gaeb2000";
import { buildGaeb90 } from "../gaeb/gaeb90";
import { requireProjectMember } from "../middleware/guards";

const router = express.Router();

const requireOptionalGaebProjectAccess = async (req:any,res:any,next:any) => {
  const project = req.body?.project || {};
  const token = String(project?.id || project?.code || project?.number || req.body?.projectCode || "").trim();
  if (!token) return next();
  req.params = req.params || {};
  req.params.__gaebProject = token;
  return requireProjectMember("__gaebProject")(req,res,(err?:any)=>{
    if(err) return next(err);
    const code = String(req.resolvedProjectCode || "").trim();
    const id = String(req.resolvedProjectId || "").trim();
    req.body.project = { ...project, ...(code ? { code } : {}), ...(id ? { id } : {}) };
    if (code) req.body.projectCode = code;
    return next();
  });
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

/**
 * Riconosce/decodifica il buffer GAEB provando alcune codifiche tipiche
 * (UTF-16 LE, Latin1, Win1252) e restituisce testo + encoding usato.
 */
function detectAndDecode(
  buf: Buffer
): { encoding: string; text: string } {
  const decodings: [string, string][] = [
    ["utf16-le", iconv.decode(buf, "utf16-le") as string],
    ["latin1", iconv.decode(buf, "latin1") as string],
    ["win1252", iconv.decode(buf, "win1252") as string],
  ];

  // Scegliamo il primo risultato non vuoto, altrimenti il primo in lista
  const best =
    decodings.find(([, txt]) => txt && txt.trim().length > 0) ??
    decodings[0];

  const [encoding, text] = best;
  return { encoding, text };
}

/**
 * POST /api/gaeb/import
 * Body: file GAEB (campo "file" nel FormData)
 *
 * Per ora:
 *  - decodifica il file
 *  - restituisce una preview delle prime 500 righe
 * In futuro qui si potrà fare il parsing vero e proprio.
 */
router.post(
  "/import",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file as Express.Multer.File | undefined;

      if (!file) {
        return res.status(400).json({
          ok: false,
          error: "Keine Datei hochgeladen (Feldname: 'file')",
        });
      }

      const buf = file.buffer;

      const { encoding, text } = detectAndDecode(buf);

      const lines = text.split(/\r?\n/);
      const preview = lines.slice(0, 500);

      return res.json({
        ok: true,
        encoding,
        lineCount: lines.length,
        preview,
      });
    } catch (e: any) {
      console.error("GAEB-Import Fehler:", e);
      return res.status(500).json({
        ok: false,
        error: e?.message || "Fehler beim GAEB-Import",
      });
    }
  }
);

function companyIdFromReq(req: Request): string {
  const authCompany = String(
    (req as any)?.auth?.companyId ||
    (req as any)?.auth?.company ||
    ""
  ).trim();
  if (authCompany) return authCompany;
  const devAuth = process.env.NODE_ENV !== "production" && (process.env.DEV_AUTH || "").toLowerCase() === "on";
  return devAuth ? String(process.env.DEV_COMPANY_ID || "").trim() : "";
}

function posLeafDigits(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || /[A-Za-z]/.test(raw)) return "";
  const parts = raw.split(/[.\-_/]/).filter(Boolean);
  const leaf = String(parts[parts.length - 1] || raw).replace(/\D/g, "");
  return leaf ? String(Number(leaf)) : "";
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function reconcileGaebRowsWithProject(rows: any[], projectId: string): any[] {
  if (!projectId || !/^[A-Za-z0-9_-]+$/.test(projectId)) return rows;
  try {
    const file = path.join(PROJECTS_ROOT, projectId, "kalkulation", "ki", "data.json");
    if (!fs.existsSync(file)) return rows;
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    const basis = Array.isArray(doc?.data?.rows) ? doc.data.rows : [];
    if (!basis.length) return rows;

    return rows.map((row: any) => {
      const current = String(row?.posNr || row?.pos || row?.position || "").trim();
      if (!current || /[A-Za-z]/.test(current)) return row;
      const leaf = posLeafDigits(current);
      if (!leaf) return row;

      const candidates = basis.filter((b: any) => posLeafDigits(b?.posNr) === leaf);
      if (!candidates.length) return row;
      if (candidates.length === 1) return { ...row, posNr: String(candidates[0].posNr || current).trim() };

      const rowText = normalizeText(row?.kurztext || row?.text || row?.langtext);
      const rowUnit = String(row?.einheit || row?.unit || row?.me || "").trim().toLowerCase();
      const strong = candidates.filter((b: any) => {
        const bText = normalizeText(b?.kurztext || b?.langtext);
        const bUnit = String(b?.einheit || b?.unit || "").trim().toLowerCase();
        return rowText && bText === rowText && (!rowUnit || !bUnit || rowUnit === bUnit);
      });
      if (strong.length === 1) return { ...row, posNr: String(strong[0].posNr || current).trim() };
      return row;
    });
  } catch {
    return rows;
  }
}

router.post("/export", express.json({ limit: "20mb" }), requireOptionalGaebProjectAccess, async (req: Request, res: Response) => {
  try {
    const format = String(req.body?.format || req.body?.mode || "X84").trim().toUpperCase();
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const project = req.body?.project || {};
    if (!rows.length) return res.status(400).json({ ok: false, error: "Keine Exportpositionen vorhanden." });

    const isGaebXml = ["X84", "X85", "X86", "X87"].includes(format);
    const isGaeb2000 = ["P81", "P82", "P83", "P84", "P85", "P86"].includes(format);
    const isGaeb90 = ["D81", "D82", "D83", "D84", "D85", "D86"].includes(format);
    if (!isGaebXml && !isGaeb2000 && !isGaeb90) {
      return res.status(501).json({
        ok: false,
        error: `${format} ist im neuen GAEB-Export noch nicht separat implementiert.`,
        code: "GAEB_PHASE_NOT_IMPLEMENTED",
      });
    }

    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(403).json({ ok: false, error: "NO_COMPANY" });
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, address: true, email: true, phone: true },
    });
    if (!company) return res.status(404).json({ ok: false, error: "COMPANY_NOT_FOUND" });

    if (isGaeb90) {
      const projectIdForMapping = String(
        project?.id || (req as any).resolvedProjectId || ""
      ).trim();
      const gaeb90Rows = reconcileGaebRowsWithProject(rows, projectIdForMapping);
      const gaeb90 = buildGaeb90({
        format: format as "D81" | "D82" | "D83" | "D84" | "D85" | "D86",
        rows: gaeb90Rows, project, company, owner: req.body?.owner || null
      });
      const projectCode = String(project?.code || project?.number || req.body?.projectCode || "RLC").trim();
      const safeCode = projectCode.replace(/[^0-9A-Za-z._-]+/g, "_") || "RLC";
      const filename = `${safeCode}.${format.toLowerCase()}`;
      const encoded = iconv.encode(gaeb90, "cp850");
      res.setHeader("Content-Type", "text/plain; charset=ibm850");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("X-RLC-GAEB-Version", "GAEB90");
      res.setHeader("X-RLC-GAEB-Phase", format);
      return res.status(200).send(encoded);
    }

    if (isGaeb2000) {
      const gaeb2000 = buildGaeb2000({
        format: format as "P81" | "P82" | "P83" | "P84" | "P85" | "P86" | "P94",
        rows, project, company, owner: req.body?.owner || null
      });
      const projectCode = String(project?.code || project?.number || req.body?.projectCode || "RLC").trim();
      const safeCode = projectCode.replace(/[^0-9A-Za-z._-]+/g, "_") || "RLC";
      const filename = `${safeCode}.${format.toLowerCase()}`;
      const encoded = iconv.encode(gaeb2000, "win1252");
      res.setHeader("Content-Type", "text/plain; charset=windows-1252");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("X-RLC-GAEB-Version", "DA2000");
      res.setHeader("X-RLC-GAEB-Phase", format);
      return res.status(200).send(encoded);
    }

    const xml = format === "X84" ? buildGaebX84Xml({ rows, project, company }) : buildGaebX85X87Xml({ format: format as "X85" | "X86" | "X87", rows, project, company, owner: req.body?.owner || null });
    const projectCode = String(project?.code || project?.number || req.body?.projectCode || "RLC").trim();
    const safeCode = projectCode.replace(/[^0-9A-Za-z._-]+/g, "_") || "RLC";
    const filename = `${safeCode}.${format.toLowerCase()}`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-RLC-GAEB-Version", "3.3");
    res.setHeader("X-RLC-GAEB-Schema", `GAEB_DA_XML_${format.slice(1)}_3.3_2021-05`);
    return res.status(200).send(xml);
  } catch (e: any) {
    const message = e?.message || "GAEB_EXPORT_FAILED";
    const status = String(message).startsWith("GAEB_STAMMDATEN_UNVOLLSTAENDIG") || String(message).startsWith("GAEB_AUFTRAGGEBER_UNVOLLSTAENDIG") || String(message).startsWith("GAEB2000_AUFTRAGGEBER_UNVOLLSTAENDIG") || String(message).startsWith("GAEB2000_AUFTRAGNEHMER_UNVOLLSTAENDIG") ? 422 : 500;
    return res.status(status).json({ ok: false, error: message });
  }
});

/**
 * GET /api/gaeb/export
 * Placeholder per l’export GAEB – da implementare in seguito.
 */
router.get("/export", (req: Request, res: Response) => {
  return res.status(501).json({
    ok: false,
    error: "GAEB-Export noch nicht implementiert",
  });
});

export default router;
