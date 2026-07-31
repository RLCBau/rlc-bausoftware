// apps/server/src/routes/projectLv.ts
import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import XLSX from "xlsx";
import pdfParse from "pdf-parse";
import { prisma } from "../lib/prisma";

const router = express.Router();

const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

/** Log helper */
function log(...args: any[]) {
  console.log("[LV-API]", ...args);
}

/**
 * Garantisce che esista SEMPRE una companyId valida
 */
async function ensureCompanyId(req: Request): Promise<string> {
  const auth: any = (req as any).auth;

  if (auth && typeof auth.company === "string") {
    const found = await prisma.company.findUnique({ where: { id: auth.company } });
    if (found) return found.id;
  }

  if (process.env.DEV_COMPANY_ID) {
    const found = await prisma.company.findUnique({
      where: { id: process.env.DEV_COMPANY_ID },
    });
    if (found) return found.id;
  }

  const first = await prisma.company.findFirst();
  if (first) return first.id;

  const created = await prisma.company.create({
    data: { name: "Standard Firma", code: "STANDARD" },
  });
  return created.id;
}

function xmlEscape(value: any): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeOz(value: any): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/_/g, ".")
    .replace(/-+/g, "-");
}

type LvTreeNode = {
  key: string;
  oz: string;
  title: string;
  type: "chapter" | "position";
  item?: any;
  children: LvTreeNode[];
};

function deriveChapterPath(position: string): string[] {
  const oz = normalizeOz(position);
  if (!oz) return [];
  const parts = oz.split(".").filter(Boolean);

  if (parts.length <= 1) return [];
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("."));
}

function buildLvTree(items: any[]): LvTreeNode[] {
  const root = new Map<string, LvTreeNode>();

  function ensureChapter(pathOz: string): LvTreeNode {
    if (root.has(pathOz)) return root.get(pathOz)!;

    const node: LvTreeNode = {
      key: pathOz,
      oz: pathOz,
      title: `Kapitel ${pathOz}`,
      type: "chapter",
      children: [],
    };
    root.set(pathOz, node);
    return node;
  }

  const positionNodes: LvTreeNode[] = items.map((item) => ({
    key: `pos:${item.id ?? item.position ?? Math.random().toString(36).slice(2)}`,
    oz: normalizeOz(item.position),
    title: String(item.kurztext || ""),
    type: "position",
    item,
    children: [],
  }));

  for (const posNode of positionNodes) {
    const chapterPath = deriveChapterPath(posNode.oz);

    if (!chapterPath.length) {
      root.set(posNode.key, posNode);
      continue;
    }

    let parent: LvTreeNode | null = null;

    for (const chapterOz of chapterPath) {
      const chapter = ensureChapter(chapterOz);
      if (parent && !parent.children.find((c) => c.key === chapter.key)) {
        parent.children.push(chapter);
      }
      parent = chapter;
    }

    if (parent && !parent.children.find((c) => c.key === posNode.key)) {
      parent.children.push(posNode);
    }
  }

  const values = Array.from(root.values());

  const topLevel = values.filter((node) => {
    if (node.type === "position") return true;
    const chapterPath = deriveChapterPath(node.oz);
    return chapterPath.length <= 1;
  });

  function sortNodes(nodes: LvTreeNode[]) {
    nodes.sort((a, b) => a.oz.localeCompare(b.oz, "de", { numeric: true }));
    for (const n of nodes) sortNodes(n.children);
  }

  sortNodes(topLevel);
  return topLevel;
}

function renderGaebLikeTree(nodes: LvTreeNode[], level = 1): string {
  let out = "";

  for (const node of nodes) {
    if (node.type === "chapter") {
      out += `${"  ".repeat(level)}<BoQCtgy RNoPart="${xmlEscape(node.oz)}">\n`;
      out += `${"  ".repeat(level + 1)}<LblTx>${xmlEscape(node.title)}</LblTx>\n`;
      if (node.children.length) {
        out += renderGaebLikeTree(node.children, level + 1);
      }
      out += `${"  ".repeat(level)}</BoQCtgy>\n`;
      continue;
    }

    const p = node.item || {};
    out += `${"  ".repeat(level)}<Item RNoPart="${xmlEscape(node.oz)}">\n`;
    out += `${"  ".repeat(level + 1)}<Qty>${xmlEscape(p.menge ?? 0)}</Qty>\n`;
    out += `${"  ".repeat(level + 1)}<QU>${xmlEscape(p.einheit || "")}</QU>\n`;
    out += `${"  ".repeat(level + 1)}<UP>${xmlEscape(p.einzelpreis ?? 0)}</UP>\n`;
    out += `${"  ".repeat(level + 1)}<IT>${xmlEscape(p.kurztext || "")}</IT>\n`;
    if (p.langtext) {
      out += `${"  ".repeat(level + 1)}<OutlineText>\n`;
      out += `${"  ".repeat(level + 2)}<OutlTxt>\n`;
      out += `${"  ".repeat(level + 3)}<Text>${xmlEscape(p.langtext)}</Text>\n`;
      out += `${"  ".repeat(level + 2)}</OutlTxt>\n`;
      out += `${"  ".repeat(level + 1)}</OutlineText>\n`;
    }
    out += `${"  ".repeat(level)}</Item>\n`;
  }

  return out;
}

function toSafeNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function gaebFileNameBase(projectCode: string, version: number) {
  return `lv_${projectCode}_v${version}`;
}

function ensureProjectExportDirs(projectCode: string) {
  const projectDir = path.join(PROJECTS_ROOT, projectCode);
  const exportsDir = path.join(projectDir, "exports");
  const gaebDir = path.join(projectDir, "gaeb");

  fs.mkdirSync(exportsDir, { recursive: true });
  fs.mkdirSync(gaebDir, { recursive: true });

  return { projectDir, exportsDir, gaebDir };
}

function deriveGaebCategoryTitle(pathOz: string): string {
  return `Kapitel ${pathOz}`;
}

function renderGaebX83Tree(nodes: LvTreeNode[], level = 4): string {
  let out = "";

  for (const node of nodes) {
    if (node.type === "chapter") {
      out += `${"  ".repeat(level)}<BoQCtgy RNoPart="${xmlEscape(node.oz)}">\n`;
      out += `${"  ".repeat(level + 1)}<LblTx>${xmlEscape(
        deriveGaebCategoryTitle(node.oz)
      )}</LblTx>\n`;
      out += renderGaebX83Tree(node.children, level + 1);
      out += `${"  ".repeat(level)}</BoQCtgy>\n`;
      continue;
    }

    const p = node.item || {};
    out += `${"  ".repeat(level)}<Item RNoPart="${xmlEscape(node.oz)}">\n`;
    out += `${"  ".repeat(level + 1)}<Qty>${xmlEscape(toSafeNumber(p.menge))}</Qty>\n`;
    out += `${"  ".repeat(level + 1)}<QU>${xmlEscape(p.einheit || "")}</QU>\n`;
    out += `${"  ".repeat(level + 1)}<IT>${xmlEscape(p.kurztext || "")}</IT>\n`;

    if (p.langtext) {
      out += `${"  ".repeat(level + 1)}<OutlineText>\n`;
      out += `${"  ".repeat(level + 2)}<OutlTxt>\n`;
      out += `${"  ".repeat(level + 3)}<Text>${xmlEscape(p.langtext)}</Text>\n`;
      out += `${"  ".repeat(level + 2)}</OutlTxt>\n`;
      out += `${"  ".repeat(level + 1)}</OutlineText>\n`;
    }

    out += `${"  ".repeat(level)}</Item>\n`;
  }

  return out;
}

function renderGaebX84Tree(nodes: LvTreeNode[], level = 4): string {
  let out = "";

  for (const node of nodes) {
    if (node.type === "chapter") {
      out += `${"  ".repeat(level)}<BoQCtgy RNoPart="${xmlEscape(node.oz)}">\n`;
      out += `${"  ".repeat(level + 1)}<LblTx>${xmlEscape(
        deriveGaebCategoryTitle(node.oz)
      )}</LblTx>\n`;
      out += renderGaebX84Tree(node.children, level + 1);
      out += `${"  ".repeat(level)}</BoQCtgy>\n`;
      continue;
    }

    const p = node.item || {};
    const qty = toSafeNumber(p.menge);
    const up = toSafeNumber(p.einzelpreis);
    const gp = toSafeNumber(p.gesamt || qty * up);

    out += `${"  ".repeat(level)}<Item RNoPart="${xmlEscape(node.oz)}">\n`;
    out += `${"  ".repeat(level + 1)}<Qty>${xmlEscape(qty)}</Qty>\n`;
    out += `${"  ".repeat(level + 1)}<QU>${xmlEscape(p.einheit || "")}</QU>\n`;
    out += `${"  ".repeat(level + 1)}<UP>${xmlEscape(up.toFixed(2))}</UP>\n`;
    out += `${"  ".repeat(level + 1)}<IT>${xmlEscape(p.kurztext || "")}</IT>\n`;
    out += `${"  ".repeat(level + 1)}<Total>${xmlEscape(gp.toFixed(2))}</Total>\n`;

    if (p.langtext) {
      out += `${"  ".repeat(level + 1)}<OutlineText>\n`;
      out += `${"  ".repeat(level + 2)}<OutlTxt>\n`;
      out += `${"  ".repeat(level + 3)}<Text>${xmlEscape(p.langtext)}</Text>\n`;
      out += `${"  ".repeat(level + 2)}</OutlTxt>\n`;
      out += `${"  ".repeat(level + 1)}</OutlineText>\n`;
    }

    out += `${"  ".repeat(level)}</Item>\n`;
  }

  return out;
}

function buildGaebX83Xml(input: {
  projectCode: string;
  projectName: string;
  headerId: string;
  headerTitle: string;
  version: number;
  nodes: LvTreeNode[];
}) {
  const { projectCode, projectName, headerId, headerTitle, version, nodes } = input;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<GAEBInfo>\n`;
  xml += `  <GAEBVers>3.3</GAEBVers>\n`;
  xml += `  <VersDate>${new Date().toISOString()}</VersDate>\n`;
  xml += `  <PrjInfo>\n`;
  xml += `    <NamePrj>${xmlEscape(projectName)}</NamePrj>\n`;
  xml += `    <LblPrj>${xmlEscape(projectCode)}</LblPrj>\n`;
  xml += `  </PrjInfo>\n`;
  xml += `  <Award>\n`;
  xml += `    <BoQ ID="${xmlEscape(headerId)}" RNoPart="${xmlEscape(
    projectCode
  )}" IC="${xmlEscape(`${projectCode}-X83-V${version}`)}">\n`;
  xml += `      <LblBoQ>${xmlEscape(headerTitle)}</LblBoQ>\n`;
  xml += `      <BoQBody>\n`;
  xml += renderGaebX83Tree(nodes, 4);
  xml += `      </BoQBody>\n`;
  xml += `    </BoQ>\n`;
  xml += `  </Award>\n`;
  xml += `</GAEBInfo>\n`;

  return xml;
}

function buildGaebX84Xml(input: {
  projectCode: string;
  projectName: string;
  headerId: string;
  headerTitle: string;
  version: number;
  nodes: LvTreeNode[];
  items: any[];
}) {
  const { projectCode, projectName, headerId, headerTitle, version, nodes, items } = input;
  const total = items.reduce((sum, x) => {
    const qty = toSafeNumber(x.menge);
    const up = toSafeNumber(x.einzelpreis);
    const gp = toSafeNumber(x.gesamt || qty * up);
    return sum + gp;
  }, 0);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<GAEBInfo>\n`;
  xml += `  <GAEBVers>3.3</GAEBVers>\n`;
  xml += `  <VersDate>${new Date().toISOString()}</VersDate>\n`;
  xml += `  <PrjInfo>\n`;
  xml += `    <NamePrj>${xmlEscape(projectName)}</NamePrj>\n`;
  xml += `    <LblPrj>${xmlEscape(projectCode)}</LblPrj>\n`;
  xml += `  </PrjInfo>\n`;
  xml += `  <Award>\n`;
  xml += `    <BoQ ID="${xmlEscape(headerId)}" RNoPart="${xmlEscape(
    projectCode
  )}" IC="${xmlEscape(`${projectCode}-X84-V${version}`)}">\n`;
  xml += `      <LblBoQ>${xmlEscape(headerTitle)} - Angebot</LblBoQ>\n`;
  xml += `      <BoQBody>\n`;
  xml += renderGaebX84Tree(nodes, 4);
  xml += `      </BoQBody>\n`;
  xml += `      <BoQInfo>\n`;
  xml += `        <Cur>EUR</Cur>\n`;
  xml += `        <Tot>${xmlEscape(total.toFixed(2))}</Tot>\n`;
  xml += `      </BoQInfo>\n`;
  xml += `    </BoQ>\n`;
  xml += `  </Award>\n`;
  xml += `</GAEBInfo>\n`;

  return xml;
}

type GaebValidationIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
  position?: string;
};

const ALLOWED_UNITS = new Set([
  "m",
  "m2",
  "m²",
  "m3",
  "m³",
  "St",
  "Stk",
  "Psch",
  "kg",
  "t",
  "h",
  "d",
  "l",
]);

function normalizeUnit(unit: any): string {
  return String(unit ?? "").trim();
}

function validateGaebItems(items: any[], mode: "x83" | "x84") {
  const issues: GaebValidationIssue[] = [];
  const seen = new Set<string>();

  for (const raw of items) {
    const p = raw || {};
    const pos = String(p.position || "").trim();
    const kurz = String(p.kurztext || "").trim();
    const lang = String(p.langtext || "").trim();
    const unit = normalizeUnit(p.einheit);
    const qty = toSafeNumber(p.menge);
    const up = toSafeNumber(p.einzelpreis);
    const total = toSafeNumber(p.gesamt);

    if (!pos) {
      issues.push({
        level: "error",
        code: "POSITION_MISSING",
        message: "Positionsnummer fehlt",
      });
      continue;
    }

    if (seen.has(pos)) {
      issues.push({
        level: "error",
        code: "POSITION_DUPLICATE",
        message: `Doppelte Positionsnummer: ${pos}`,
        position: pos,
      });
    }
    seen.add(pos);

    const posParts = pos.split(".").filter(Boolean);
    const isTitlePosition = posParts.length <= 1;
    const isRealLvPosition = posParts.length >= 2;
    const isProjectCodePosition = /^BA-\d{4}-[A-Z0-9_-]+$/i.test(pos);

    if (!isTitlePosition && !isProjectCodePosition && !/^[0-9]+(\.[0-9]+)*$/.test(pos)) {
      issues.push({
        level: "error",
        code: "POSITION_STRUCTURE",
        message: "Positionsnummer nicht GAEB-konform (z.B. 1.2.3)",
        position: pos,
      });
    }

    if (isTitlePosition) {
      if (!kurz && !lang) {
        issues.push({
          level: "warning",
          code: "TITLE_TEXT_MISSING",
          message: "Titel ohne Kurztext/Langtext",
          position: pos,
        });
      }

      continue;
    }

    if (isRealLvPosition && !kurz) {
      issues.push({
        level: "error",
        code: "KURZTEXT_MISSING",
        message: "Kurztext fehlt",
        position: pos,
      });
    }

    if (isRealLvPosition && !lang) {
      issues.push({
        level: "warning",
        code: "LANGTEXT_MISSING",
        message: "Langtext fehlt",
        position: pos,
      });
    }

    if (isRealLvPosition && !unit) {
      issues.push({
        level: "error",
        code: "UNIT_MISSING",
        message: "Einheit fehlt",
        position: pos,
      });
    } else if (isRealLvPosition && !ALLOWED_UNITS.has(unit)) {
      issues.push({
        level: "error",
        code: "UNIT_INVALID",
        message: `Nicht zulässige Einheit: ${unit}`,
        position: pos,
      });
    }

    if (isRealLvPosition && !(qty > 0)) {
      issues.push({
        level: "error",
        code: "QTY_INVALID",
        message: "Menge muss > 0 sein",
        position: pos,
      });
    }

    if (mode === "x84") {
      if (!(up >= 0)) {
        issues.push({
          level: "error",
          code: "PRICE_INVALID",
          message: "Einheitspreis ungültig",
          position: pos,
        });
      }

      const expected = Number((qty * up).toFixed(2));
      const actual = Number(total.toFixed(2));

      if (Math.abs(expected - actual) > 0.01) {
        issues.push({
          level: "error",
          code: "TOTAL_MISMATCH",
          message: `Gesamtpreis falsch (${actual} statt ${expected})`,
          position: pos,
        });
      }
    }
  }

  return {
    valid: !issues.some((x) => x.level === "error"),
    errors: issues.filter((x) => x.level === "error"),
    warnings: [] as GaebValidationIssue[],
    issues,
  };
}

function buildGaebValidationErrorResponse(validation: ReturnType<typeof validateGaebItems>) {
  return {
    ok: false,
    error: "GAEB validation failed",
    errorCount: validation.errors.length,
    errors: validation.errors,
  };
}

/* =========================================================
   resolve project by (companyId + id/code) with DEV fallback
========================================================= */
async function resolveProject(companyId: string, projectIdOrCode: string) {
  const key = String(projectIdOrCode || "").trim();
  if (!key) return null;

  const scoped = await prisma.project.findFirst({
    where: {
      companyId,
      OR: [{ id: key }, { code: key }],
    },
  });
  if (scoped) return scoped;

  const fallback = await prisma.project.findFirst({
    where: {
      OR: [{ id: key }, { code: key }],
    },
  });

  if (fallback) {
    log(
      "WARN: project resolved without company scope (likely DEV / auth mismatch).",
      "requested=",
      key,
      "companyId=",
      companyId,
      "project.companyId=",
      fallback.companyId
    );
  }

  return fallback;
}

async function getLvHeaderByVersion(projectId: string, version?: number | null) {
  return prisma.lVHeader.findFirst({
    where: {
      projectId,
      ...(typeof version === "number" && Number.isFinite(version) ? { version } : {}),
    },
    orderBy: { version: "desc" },
  });
}

async function getLvForExport(projectId: string, version?: number | null) {
  const header = await getLvHeaderByVersion(projectId, version);

  if (!header) {
    return { header: null, items: [] as any[] };
  }

  const items = await prisma.lVPosition.findMany({
    where: { lvId: header.id },
    orderBy: { position: "asc" },
  });

  return { header, items };
}

function num(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* =========================================================
   SEARCH LV (Prisma)
========================================================= */
async function handleLvSearch(req: Request, res: Response) {
  try {
    const companyId = await ensureCompanyId(req);

    const projectIdOrCode = String(req.params.projectId || "").trim();
    const q = String((req.query as any)?.q || "").trim();
    const take = Math.min(50, Math.max(1, Number((req.query as any)?.take || 20)));

    if (!projectIdOrCode) return res.status(400).json({ ok: false, error: "projectId fehlt" });
    if (!q) return res.json({ ok: true, items: [] });

    const project = await resolveProject(companyId, projectIdOrCode);
    if (!project) {
      return res.status(404).json({
        ok: false,
        error: "Projekt nicht gefunden",
        hint: "projectId può essere UUID oppure project.code (es. BA-2025-DEMO)",
      });
    }

    const projectId = project.id;

    const header = await prisma.lVHeader.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { id: true, version: true, title: true },
    });

    if (!header) return res.json({ ok: true, items: [] });

    const items = await prisma.lVPosition.findMany({
      where: {
        lvId: header.id,
        OR: [
          { kurztext: { contains: q, mode: "insensitive" } },
          { langtext: { contains: q, mode: "insensitive" } },
          { position: { contains: q, mode: "insensitive" } },
          { einheit: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { position: "asc" },
      take,
      select: {
        id: true,
        position: true,
        kurztext: true,
        langtext: true,
        einheit: true,
        menge: true,
        einzelpreis: true,
      },
    });

    return res.json({
      ok: true,
      header,
      items: items.map((p) => ({
        id: p.id,
        pos: p.position,
        text: p.kurztext,
        langtext: p.langtext || "",
        unit: p.einheit,
        quantity: p.menge ?? 0,
        ep: p.einzelpreis ?? 0,
      })),
    });
  } catch (e: any) {
    console.error("[LV-API] search error", e);
    return res.status(500).json({ ok: false, error: e?.message || "search failed" });
  }
}

router.get("/projects/:projectId/lv/search", handleLvSearch);
router.get("/:projectId/lv/search", handleLvSearch);
router.get("/project-lv/:projectId/lv/search", handleLvSearch);

async function handleGetProjectLv(req: Request, res: Response) {
  try {
    const companyId = await ensureCompanyId(req);
    const projectIdOrCode = String(req.params.projectId || "").trim();

    if (!projectIdOrCode) {
      return res.status(400).json({ ok: false, error: "projectId fehlt" });
    }

    const project = await resolveProject(companyId, projectIdOrCode);

    if (!project) {
      return res.status(404).json({
        ok: false,
        error: "Projekt nicht gefunden",
        hint: "projectId può essere UUID oppure project.code (es. BA-2025-DEMO)",
      });
    }

    const projectId = project.id;

    const header = await prisma.lVHeader.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
    });

    if (header) {
      const positions = await prisma.lVPosition.findMany({
        where: { lvId: header.id },
        orderBy: { position: "asc" },
      });

      log("LV aus DB gefunden. Header:", header.id, "Anzahl Pos:", positions.length);

      return res.json({
        ok: true,
        source: "db",
        header: {
          id: header.id,
          title: header.title,
          currency: header.currency,
          version: header.version,
        },
        items: positions.map((p) => ({
          id: p.id,
          pos: p.position,
          text: p.kurztext,
          langtext: p.langtext || "",
          unit: p.einheit,
          quantity: p.menge ?? 0,
          ep: p.einzelpreis ?? 0,
        })),
      });
    }

    const folderById = path.join(PROJECTS_ROOT, project.id);

    const safeCode = project.code ? project.code.replace(/[^A-Za-z0-9_\-]/g, "_") : null;
    const folderByCode = safeCode ? path.join(PROJECTS_ROOT, safeCode) : null;

    const candidatePaths: string[] = [path.join(folderById, "lv.json")];
    if (folderByCode) candidatePaths.push(path.join(folderByCode, "lv.json"));

    let lvJsonPath: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        lvJsonPath = p;
        break;
      }
    }

    if (!lvJsonPath) {
      log("Kein LV in DB und keine lv.json für Projekt gefunden:", projectIdOrCode);
      return res.json({ ok: true, source: "empty", header: null, items: [] });
    }

    log("lv.json gefunden unter:", lvJsonPath);

    const raw = fs.readFileSync(lvJsonPath, "utf8");
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("[LV-API] lv.json ist kein gültiges JSON:", e);
      return res.status(500).json({ ok: false, error: "lv.json ist kein gültiges JSON" });
    }

    const itemsFromJson: any[] = Array.isArray(parsed.items) ? parsed.items : [];

    const newHeader = await prisma.lVHeader.create({
      data: {
        projectId,
        title: parsed.title || "LV aus Datei",
        currency: parsed.currency || "EUR",
        version: 1,
      },
    });

    const dataForDb = itemsFromJson
  .filter((p, idx) => {
    const pos = String(p.pos ?? p.position ?? p.id ?? idx + 1).trim();
    const text = String(p.text ?? p.kurztext ?? "").trim();
    const langtext = p.langtext ? String(p.langtext).trim() : "";
    if (!pos && !text && !langtext) return false;
    if (text === "EUR" && !langtext) return false;
    return true;
  })
  .map((p, idx) => {
    const mengeRaw =
      p.quantity !== undefined && p.quantity !== null ? Number(p.quantity) : Number(p.menge);
    const epRaw =
      p.ep !== undefined && p.ep !== null ? Number(p.ep) : Number(p.einzelpreis);

    const menge = Number.isFinite(mengeRaw) ? mengeRaw : 0;
    const einzelpreis = Number.isFinite(epRaw) ? epRaw : null;

    return {
      lvId: newHeader.id,
      position: String(p.pos ?? p.position ?? p.id ?? idx + 1).trim(),
      kurztext: String(p.text ?? p.kurztext ?? "").trim(),
      langtext: p.langtext ? String(p.langtext).trim() : "",
      einheit: String(p.unit ?? p.einheit ?? "").trim(),
      menge,
      einzelpreis,
      gesamt:
        typeof p.total === "number" && Number.isFinite(p.total)
          ? p.total
          : typeof einzelpreis === "number"
            ? Number((menge * einzelpreis).toFixed(2))
            : null,
      parentPos: p.parentPos ?? null,
    };
  });    

    if (dataForDb.length > 0) {
      await prisma.lVPosition.createMany({ data: dataForDb });
    }

    log(
      "LV aus lv.json in DB importiert. Header:",
      newHeader.id,
      "Anzahl Pos:",
      dataForDb.length
    );

    return res.json({
      ok: true,
      source: "lvjson",
      header: {
        id: newHeader.id,
        title: newHeader.title,
        currency: newHeader.currency,
        version: newHeader.version,
      },
      items: dataForDb.map((p, idx) => ({
        id: `import-${idx}`,
        pos: p.position,
        text: p.kurztext,
        langtext: p.langtext || "",
        unit: p.einheit,
        quantity: p.menge ?? 0,
        ep: p.einzelpreis ?? 0,
      })),
    });
  }catch (err: any) {
  console.error("[LV-IMPORT-FILE] error", err);

  const msg = String(err?.message || "");

  if (
    msg.includes("PDF beschädigt") ||
    msg.includes("nicht kompatibel") ||
    msg.includes("bad XRef entry") ||
    msg.includes("unsupported") ||
    msg.includes("invalid pdf")
  ) {
    return res.status(422).json({
      ok: false,
      error: msg || "PDF konnte nicht gelesen werden.",
    });
  }

  return res.status(500).json({
    ok: false,
    error: "Interner Serverfehler beim LV-Import.",
  });
}
}

router.get("/:projectId", (req, res) => {
  (req as any).params.projectId = req.params.projectId;
  return handleGetProjectLv(req, res);
});

router.get("/project-lv/:projectId", (req, res) => {
  (req as any).params.projectId = req.params.projectId;
  return handleGetProjectLv(req, res);
});

const multer = require("multer");
const xml2js = require("xml2js");

function arrify<T = any>(v: T | T[] | null | undefined): T[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function txt(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return txt(v[0]);
  if (typeof v === "object") {
    if ("_" in v) return String(v._ ?? "").trim();
  }
  return "";
}

function firstDefined(...vals: any[]) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

function collectGaebItemsDeep(node: any, out: any[] = []) {
  if (!node || typeof node !== "object") return out;

  const positionNo =
    firstDefined(
      node?.RNoPart,
      node?.RNoIndex,
      node?.RNo,
      node?.ItemNumber,
      node?.OZ,
      node?.PositionNumber
    ) ?? "";

  const kurz =
    firstDefined(
      node?.ShortText,
      node?.Kurztext,
      node?.IT,
      node?.OutlineText,
      node?.Description
    ) ?? "";

  const lang =
    firstDefined(node?.LongText, node?.Langtext, node?.DetailText, node?.CompleteText) ?? "";

  const unit = firstDefined(node?.QU, node?.Unit, node?.Einheit, node?.UoM) ?? "";

  const qty = firstDefined(node?.Qty, node?.Quantity, node?.Menge) ?? null;

  const ep = firstDefined(node?.UP, node?.UnitRate, node?.EP, node?.Einzelpreis) ?? null;

  const posText = txt(positionNo);
  const kurzText = txt(kurz);
  const langText = txt(lang);
  const unitText = txt(unit);

  if (posText || kurzText) {
    out.push({
      pos: posText,
      text: kurzText,
      langtext: langText,
      unit: unitText,
      quantity: toImportNumber(txt(qty)),
      ep: toImportNumber(txt(ep)),
    });
  }

  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const entry of value) collectGaebItemsDeep(entry, out);
    } else if (value && typeof value === "object") {
      collectGaebItemsDeep(value, out);
    }
  }

  return out;
}

async function parseGaebXmlImport(xmlText: string) {
  const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
    trim: true,
    explicitCharkey: true,
  });

  const parsed = await parser.parseStringPromise(xmlText);

  function arr<T = any>(v: T | T[] | null | undefined): T[] {
    if (Array.isArray(v)) return v;
    if (v === null || v === undefined) return [];
    return [v];
  }

  function deepText(v: any): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number") return String(v).trim();
    if (Array.isArray(v)) return v.map(deepText).filter(Boolean).join(" ").trim();

    if (typeof v === "object") {
      if ("_" in v && String(v._ ?? "").trim()) return String(v._).trim();

      return Object.entries(v)
        .filter(([k]) => !String(k).startsWith("$"))
        .map(([, val]) => deepText(val))
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    return "";
  }

  function cleanGaebTextValue(value: string): string {
      return String(value || "")
        .replace(/\btext-align\s*:\s*[^;\s]+;?/gi, " ")
        .replace(/\bmargin-(?:top|bottom|left|right)\s*:\s*[^;\s]+;?/gi, " ")
        .replace(/\bfont-family\s*:\s*[^;]+;?/gi, " ")
        .replace(/\bfont-size\s*:\s*[^;\s]+;?/gi, " ")
        .replace(/\b(?:font-weight|font-style|line-height)\s*:\s*[^;\s]+;?/gi, " ")
        .replace(/; +/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function firstText(...vals: any[]): string {
    for (const v of vals) {
      const t = cleanGaebTextValue(deepText(v));
      if (t) return t;
    }
    return "";
  }

  function firstValue(...vals: any[]): any {
    for (const v of vals) {
      const t = deepText(v);
      if (t) return v;
    }
    return null;
  }

  function looksLikeNumberText(v: any): boolean {
    const t = deepText(v).replace(/\s+/g, "").trim();
    if (!t) return false;
    return /^[-+]?\d+(?:[.,]\d+)?$/.test(t);
  }

  function firstNonNumericText(...vals: any[]): string {
    for (const v of vals) {
      const t = cleanGaebTextValue(deepText(v));
      if (t && !looksLikeNumberText(v)) return t;
    }
    return "";
  }

  function directGaebText(v: any): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number") {
      return cleanGaebTextValue(String(v));
    }
    if (Array.isArray(v)) {
      return v.map(directGaebText).filter(Boolean).join(" ").trim();
    }
    if (typeof v === "object" && "_" in v) {
      return cleanGaebTextValue(String(v._ ?? ""));
    }
    return "";
  }

  function firstNonNumericDirectText(...vals: any[]): string {
    for (const v of vals) {
      const t = directGaebText(v);
      if (t && !/^[-+]?\d+(?:[.,]\d+)?$/.test(t.replace(/\s+/g, ""))) return t;
    }
    return "";
  }

  function deriveKurztextFromGaebText(value: string): string {
    const text = cleanGaebTextValue(value)
      .replace(/[-]{5,}/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) return "";
    if (text.length <= 140) return text;

    const parts = text
      .split(/(?:\.\s+|;\s+|\n+)/)
      .map((x) => cleanGaebTextValue(x))
      .filter((x) => x.length >= 8 && x.length <= 180);

    if (parts.length) return parts[parts.length - 1];

    return text.slice(0, 140).trim();
  }

  function cleanOz(v: any): string {
    return firstText(v)
      .replace(/\s+/g, "")
      .replace(/_/g, ".")
      .replace(/^\.+|\.+$/g, "")
      .trim();
  }

  function joinOz(prefix: string, part: string): string {
    const a = cleanOz(prefix);
    const b = cleanOz(part);

    if (!a) return b;
    if (!b) return a;
    if (b === a || b.startsWith(a + ".")) return b;

    return `${a}.${b}`;
  }
  function pickItemText(item: any): { kurztext: string; langtext: string } {
    /*
     * GAEB Textlogik:
     * IT / ShortText = Kurztext direkt.
     * DetailTxt / OutlineText = Langtext.
     * Wenn IT dennoch Langtext enthält, wird daraus ein kurzer Kurztext abgeleitet.
     */
    const kurzDirect = firstNonNumericDirectText(
      item?.IT,
      item?.ShortText,
      item?.Kurztext,
      item?.LblTx,
      item?.Description
    );

    const langtext = firstNonNumericText(
      item?.DetailTxt?.Text,
      item?.DetailTxt,
      item?.DetailText,
      item?.LongText,
      item?.Langtext,
      item?.CompleteText,
      item?.ItemText,
      item?.DescriptionInfo,
      item?.OutlineText?.OutlTxt?.Text,
      item?.OutlineText?.OutlTxt,
      item?.OutlineText,
      item?.OutlineTextOutlTxt,
      item?.TextOutlTxt
    );

    const kurztext = deriveKurztextFromGaebText(kurzDirect || langtext);

    return {
      kurztext: kurztext || langtext,
      langtext: langtext || kurzDirect || kurztext || "",
    };
  }

  function normalizeOneItem(item: any, prefix: string, fallbackNo: number) {
    const rNo = cleanOz(
      firstValue(
        item?.RNoPart,
        item?.RNo,
        item?.ItemNumber,
        item?.PositionNumber,
        item?.OZ,
        item?.Nr,
        item?.No,
        item?.ID
      )
    );

    const position = joinOz(prefix, rNo) || String(fallbackNo);
    const { kurztext, langtext } = pickItemText(item);

    const quantity = toImportNumber(
      firstText(item?.Qty, item?.QUANTITY, item?.Quantity, item?.V, item?.Menge)
    );

    const unit = firstText(item?.QU, item?.Unit, item?.U, item?.Einheit, item?.UoM);

    const ep = toImportNumber(
      firstText(item?.UP, item?.EP, item?.UnitPrice, item?.Price, item?.Einzelpreis, item?.UnitRate)
    );

    const total = toImportNumber(
      firstText(item?.Total, item?.ITotal, item?.GP, item?.Gesamt, item?.Amount, item?.IT)
    );

    if (!position && !kurztext && !langtext) return null;

    const safeKurztext = String(kurztext || "").trim();
    const safeLangtext = String(langtext || "").trim();

    /*
     * Wichtig für X84:
     * X84 enthält häufig nur Preis-/Mengeninformationen.
     * Wir erzeugen hier KEINEN künstlichen Text wie "Position 001".
     * Fehlende Texte werden später aus X81/X83 bzw. vorhandenem LV ergänzt.
     */
    return {
      pos: position,
      text: safeKurztext,
      langtext: safeLangtext,
      unit,
      quantity,
      ep,
      total,
      gaebRawTextMissing: !safeKurztext && !safeLangtext,
    };
  }

  function readItemsFromBoQ(root: any): any[] {
    const out: any[] = [];

    function walkAny(node: any, prefix = "") {
      if (!node || typeof node !== "object") return;

      for (const ctgy of arr(node?.BoQCtgy)) {
        const ctgyRNo = cleanOz(
          firstValue(ctgy?.RNoPart, ctgy?.RNo, ctgy?.Nr, ctgy?.No, ctgy?.ID)
        );

        const nextPrefix = joinOz(prefix, ctgyRNo);

        for (const item of arr(ctgy?.Item)) {
          const row = normalizeOneItem(item, nextPrefix, out.length + 1);
          if (row) out.push(row);
        }

        walkAny(ctgy, nextPrefix);
      }

      for (const item of arr(node?.Item)) {
        const row = normalizeOneItem(item, prefix, out.length + 1);
        if (row) out.push(row);
      }

      /*
       * GAEB 3.x large X83:
       * Viele Dateien speichern Positionen nicht direkt unter <BoQCtgy><Item>,
       * sondern unter <BoQCtgy><Itemlist><Item>.
       * Ohne diesen Block liest der Server nur Teilmengen, z. B. 81 statt 465.
       */
      for (const item of arr(node?.Itemlist?.Item)) {
        const row = normalizeOneItem(item, prefix, out.length + 1);
        if (row) out.push(row);
      }

      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          for (const entry of value) {
            if (entry && typeof entry === "object") walkAny(entry, prefix);
          }
        } else if (
          value &&
            typeof value === "object"
        ) {
          walkAny(value as any, prefix);
        }
      }
    }

    const roots = [
      parsed?.GAEB?.Award?.BoQ,
      parsed?.GAEB?.Award?.AwardInfo?.BoQ,
      parsed?.GAEB?.Award?.BoQBody?.BoQ,
      parsed?.GAEB?.BoQ,
      parsed?.BoQ,
      parsed?.GAEB,
      parsed,
    ].filter(Boolean);

    /*
     * X83/X84 parser fix:
     * Nicht beim ersten Treffer abbrechen. Große GAEB-Dateien können Positionen
     * über mehrere BoQ-/Award-/Body-Knoten verteilen. Das alte break führte dazu,
     * dass große X83-Dateien nur teilweise gelesen wurden, z. B. 81 statt 465 Positionen.
     * Duplikate werden später über pos + text entfernt.
     */
    for (const rootNode of roots) {
      walkAny(rootNode, "");
    }

    return out;
  }

  const title =
    firstText(
      parsed?.GAEB?.Award?.Project,
      parsed?.GAEB?.Award?.ProjectInfo?.Name,
      parsed?.GAEB?.PrjInfo?.NamePrj,
      parsed?.GAEB?.PrjInfo?.LblPrj,
      parsed?.GAEB?.Project,
      parsed?.Project
    ) || "GAEB Import";

  const currency =
    firstText(
      parsed?.GAEB?.Award?.Cur,
      parsed?.GAEB?.Award?.Currency,
      parsed?.GAEB?.Currency,
      parsed?.GAEB?.Award?.BoQ?.BoQInfo?.Cur
    ) || "EUR";

  let items = readItemsFromBoQ(parsed);

  if (!items.length) {
    items = collectGaebItemsDeep(parsed, []).filter(
      (x) => String(x?.pos || "").trim() || String(x?.text || "").trim()
    );
  }

  const seen = new Set<string>();
  items = items.filter((x) => {
    const pos = String(x?.pos || "").trim();
    const text = String(x?.text || "").trim();

    /*
     * GAEB large X83:
     * Durch Deep-Walk können identische Positionen aus mehreren XML-Wurzelknoten
     * erneut gefunden werden. Für LV-Import gilt: Positionsnummer ist eindeutig.
     */
    const key = pos ? `POS:${pos}` : `TEXT:${text}`;

    if (!pos && !text) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    title,
    currency,
    items,
  };
}

const lvImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
  },
});

function parseCsvLine(line: string, sep = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

function toImportNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;

  let raw = String(v).trim();
  if (!raw) return null;

  raw = raw.replace(/\s+/g, "");

  if (raw.includes(",") && raw.includes(".")) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (raw.includes(",")) {
    raw = raw.replace(",", ".");
  }

  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeImportItems(itemsRaw: any[]): any[] {
  return (Array.isArray(itemsRaw) ? itemsRaw : [])
    .map((p: any, i: number) => {
      const quantity =
        typeof p?.quantity === "number"
          ? p.quantity
          : typeof p?.menge === "number"
            ? p.menge
            : toImportNumber(p?.quantity ?? p?.menge);

      const ep =
        typeof p?.ep === "number"
          ? p.ep
          : typeof p?.einzelpreis === "number"
            ? p.einzelpreis
            : toImportNumber(p?.ep ?? p?.einzelpreis);

      const position = String(p?.pos ?? p?.position ?? i + 1).trim();
      const kurztext = String(p?.text ?? p?.kurztext ?? "").trim();
      const langtext = p?.langtext ? String(p.langtext).trim() : "";

      return {
        position,
        kurztext,
        langtext,
        einheit: String(p?.unit ?? p?.einheit ?? "").trim(),
        menge: quantity,
        einzelpreis: ep,

        // GAEB/X84-Metadaten: wichtig für spätere LV-Anreicherung und KI
        total:
          typeof p?.total === "number"
            ? p.total
            : toImportNumber(p?.total ?? p?.gesamt ?? p?.gp ?? p?.amount),
        gaebRawTextMissing: Boolean(p?.gaebRawTextMissing || (!kurztext && !langtext)),
      };
    })
    .filter((x) => x.position || x.kurztext);
}

function parseCsvImport(text: string) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim() !== "");

  if (!lines.length) {
    return {
      title: "Importiertes LV",
      currency: "EUR",
      items: [],
    };
  }

  const headers = parseCsvLine(lines[0], ";").map((s) => s.trim().toLowerCase());
  const idx = (alts: string[]) => headers.findIndex((h) => alts.includes(h));

  const iPos = idx(["posnr", "positionsnummer", "pos", "position"]);
  const iKurz = idx(["kurztext", "kurz", "bezeichnung", "text"]);
  const iLang = idx(["langtext", "beschreibung", "longtext"]);
  const iME = idx(["me", "einheit", "eh", "unit"]);
  const iMenge = idx(["menge", "qty", "quantity"]);
  const iEP = idx(["ep", "einheitspreis", "preis", "einzelpreis"]);

  const items: any[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r], ";");
    if (cols.length === 1 && cols[0].trim() === "") continue;

    const row = {
      pos: String(iPos >= 0 ? cols[iPos] ?? "" : r).trim(),
      text: String(iKurz >= 0 ? cols[iKurz] ?? "" : "").trim(),
      langtext: String(iLang >= 0 ? cols[iLang] ?? "" : "").trim(),
      unit: String(iME >= 0 ? cols[iME] ?? "" : "").trim(),
      quantity: iMenge >= 0 ? toImportNumber(cols[iMenge]) : null,
      ep: iEP >= 0 ? toImportNumber(cols[iEP]) : null,
    };

    if (!row.pos && !row.text) continue;
    items.push(row);
  }

  return {
    title: "Importiertes LV",
    currency: "EUR",
    items,
  };
}

function parseJsonImport(text: string) {
  const parsed = JSON.parse(text);
  const title =
    typeof parsed?.title === "string" && parsed.title.trim()
      ? parsed.title.trim()
      : "Importiertes LV";

  const currency =
    typeof parsed?.currency === "string" && parsed.currency.trim()
      ? parsed.currency.trim().toUpperCase()
      : "EUR";

  const itemsRaw = Array.isArray(parsed?.items)
    ? parsed.items
    : Array.isArray(parsed)
      ? parsed
      : [];

  return {
    title,
    currency,
    items: itemsRaw,
  };
}

function fileBaseName(name: string) {
  return String(name || "Importiertes LV")
    .replace(/\.[^.]+$/, "")
    .trim();
}

function parseExcelImport(buffer: Buffer, filename = "Importiertes LV") {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = wb.SheetNames?.[0];

  if (!firstSheetName) {
    return {
      title: fileBaseName(filename),
      currency: "EUR",
      items: [],
    };
  }

  const ws = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  });

  if (!Array.isArray(rows) || !rows.length) {
    return {
      title: fileBaseName(filename),
      currency: "EUR",
      items: [],
    };
  }

  const normalizedRows = rows.map((r) =>
    Array.isArray(r) ? r.map((x) => String(x ?? "").trim()) : []
  );

  const headerIndex = normalizedRows.findIndex((row) => {
    const joined = row.join(" ").toLowerCase();
    return (
      joined.includes("positionsnummer") ||
      joined.includes("pos") ||
      joined.includes("kurztext") ||
      joined.includes("einheit") ||
      joined.includes("menge") ||
      joined.includes("einheitspreis")
    );
  });

  const startHeader = headerIndex >= 0 ? headerIndex : 0;
  const headers = (normalizedRows[startHeader] || []).map((s) => s.toLowerCase());

  const idx = (alts: string[]) => headers.findIndex((h) => alts.includes(h));

  const iPos = idx(["posnr", "positionsnummer", "pos", "position"]);
  const iKurz = idx(["kurztext", "kurz", "bezeichnung", "text"]);
  const iLang = idx(["langtext", "beschreibung", "longtext"]);
  const iME = idx(["me", "einheit", "eh", "unit"]);
  const iMenge = idx(["menge", "qty", "quantity"]);
  const iEP = idx(["ep", "einheitspreis", "preis", "einzelpreis"]);

  const items: any[] = [];

  for (let r = startHeader + 1; r < normalizedRows.length; r++) {
    const cols = normalizedRows[r];
    if (!cols || !cols.some((x) => String(x || "").trim())) continue;

    const row = {
      pos: String(iPos >= 0 ? cols[iPos] ?? "" : r).trim(),
      text: String(iKurz >= 0 ? cols[iKurz] ?? "" : "").trim(),
      langtext: String(iLang >= 0 ? cols[iLang] ?? "" : "").trim(),
      unit: String(iME >= 0 ? cols[iME] ?? "" : "").trim(),
      quantity: iMenge >= 0 ? toImportNumber(cols[iMenge]) : null,
      ep: iEP >= 0 ? toImportNumber(cols[iEP]) : null,
    };

    if (!row.pos && !row.text) continue;
    items.push(row);
  }

  return {
    title: fileBaseName(filename),
    currency: "EUR",
    items,
  };
}

  async function parsePdfImport(buffer: Buffer, filename = "Importiertes LV") {
  let parsed: any;

  try {
    parsed = await pdfParse(buffer);
  } catch (err: any) {
    const msg = String(err?.message || "");

    console.error("[PDF-IMPORT] ERROR:", msg);

    if (
      msg.includes("bad XRef entry") ||
      msg.includes("Illegal character") ||
      msg.includes("FormatError")
    ) {
      throw new Error(
        "PDF beschädigt oder nicht kompatibel. Bitte PDF neu exportieren oder XLSX/GAEB verwenden."
      );
    }

    throw err;
  }
  const text = String(parsed?.text || "").replace(/\r/g, "");

  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const items: any[] = [];

  const ignoreLine = (line: string) => {
    const v = String(line || "").trim();
    if (!v) return true;

    return (
      [
        "Leistungsverzeichnis",
        "Pos",
        "Kurztext",
        "ME",
        "Menge",
        "EP",
        "Gesamt",
      ].includes(v) ||
      /^Projekt:/i.test(v) ||
      /^Version:/i.test(v) ||
      /^Titel:/i.test(v) ||
      /^Gesamtsumme:/i.test(v) ||
      /^[\d.,]+\s*EUR$/i.test(v)
    );
  };

  const isPos = (line: string) => /^\d+(?:\.\d+)+$/.test(String(line || "").trim());

  const isUnit = (line: string) =>
    /^(m|m2|m²|m3|m³|St|Stk|Psch|kg|t|h|d|l)$/i.test(String(line || "").trim());

  const isNumberLine = (line: string) =>
    /^[\d.,]+$/.test(String(line || "").trim());

  const cleaned = lines.filter((line) => !ignoreLine(line));

  // Variante 1: PDF a righe complete
  for (const line of cleaned) {
    const m = line.match(
      /^(\d+(?:\.\d+)+)\s+(.+?)\s+(m|m2|m²|m3|m³|St|Stk|Psch|kg|t|h|d|l)\s+([\d.,]+)\s+([\d.,]+)(?:\s+([\d.,]+))?$/i
    );

    if (m) {
      items.push({
        pos: String(m[1]).trim(),
        text: String(m[2]).trim(),
        langtext: "",
        unit: String(m[3]).trim(),
        quantity: toImportNumber(m[4]),
        ep: toImportNumber(m[5]),
        gesamt: m[6] ? toImportNumber(m[6]) : null,
      });
    }
  }

  // Variante 2: PDF a colonne verticali
  if (!items.length) {
    for (let i = 0; i < cleaned.length; i++) {
      const pos = String(cleaned[i] ?? "").trim();
      if (!isPos(pos)) continue;

      const textLine = String(cleaned[i + 1] ?? "").trim();
      const unitLine = String(cleaned[i + 2] ?? "").trim();
      const qtyLine = String(cleaned[i + 3] ?? "").trim();
      const epLine = String(cleaned[i + 4] ?? "").trim();
      const totalLine = String(cleaned[i + 5] ?? "").trim();

      if (!textLine) continue;
      if (!isUnit(unitLine)) continue;
      if (!isNumberLine(qtyLine)) continue;
      if (!isNumberLine(epLine)) continue;

      items.push({
        pos,
        text: textLine,
        langtext: "",
        unit: unitLine,
        quantity: toImportNumber(qtyLine),
        ep: toImportNumber(epLine),
        gesamt: isNumberLine(totalLine) ? toImportNumber(totalLine) : null,
      });

      i += 5;
    }
  }

  return {
    title: fileBaseName(filename),
    currency: "EUR",
    items,
  };
}

async function enrichGaebX84RowsWithLatestLv(projectId: string, items: any[]): Promise<any[]> {
  if (!Array.isArray(items) || !items.length) return items;

  const latestHeader = await prisma.lVHeader.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { id: true },
  });

  if (!latestHeader?.id) return items;

  const basePositions = await prisma.lVPosition.findMany({
    where: { lvId: latestHeader.id },
    select: {
      position: true,
      kurztext: true,
      langtext: true,
      einheit: true,
      menge: true,
      einzelpreis: true,
      gesamt: true,
      parentPos: true,
    },
  });

  const byPos = new Map<string, any>();
  for (const p of basePositions) {
    const key = String(p.position || "").trim();
    if (key) byPos.set(key, p);
  }

  return items.map((row: any) => {
    const pos = String(row?.pos ?? row?.position ?? "").trim();
    const base = byPos.get(pos);
    if (!base) return row;

    const kurztext = String(row?.text ?? row?.kurztext ?? "").trim();
    const langtext = String(row?.langtext ?? "").trim();
    const unit = String(row?.unit ?? row?.einheit ?? "").trim();

    const ep =
      row?.ep !== undefined && row?.ep !== null
        ? row.ep
        : row?.einzelpreis !== undefined && row?.einzelpreis !== null
          ? row.einzelpreis
          : base.einzelpreis;

    const quantity =
      row?.quantity !== undefined && row?.quantity !== null
        ? row.quantity
        : row?.menge !== undefined && row?.menge !== null
          ? row.menge
          : base.menge;

    const total =
      row?.total !== undefined && row?.total !== null
        ? row.total
        : row?.gesamt !== undefined && row?.gesamt !== null
          ? row.gesamt
          : ep !== null && ep !== undefined && quantity !== null && quantity !== undefined
            ? Number((Number(ep) * Number(quantity)).toFixed(2))
            : base.gesamt;

    return {
      ...row,
      pos,
      position: pos,
      text: kurztext || String(base.kurztext || ""),
      kurztext: kurztext || String(base.kurztext || ""),
      langtext: langtext || String(base.langtext || base.kurztext || ""),
      unit: unit || String(base.einheit || ""),
      einheit: unit || String(base.einheit || ""),
      quantity,
      menge: quantity,
      ep,
      einzelpreis: ep,
      total,
      gesamt: total,
      parentPos: row?.parentPos ?? base.parentPos ?? null,
      gaebRawTextMissing: Boolean(row?.gaebRawTextMissing) && !kurztext && !langtext,
      enrichedFromLatestLv: true,
    };
  });
}

async function importLvItemsIntoNewVersion(args: {
  projectId: string;
  title?: string;
  currency?: string;
  itemsRaw: any[];
}) {
  const last = await prisma.lVHeader.findFirst({
    where: { projectId: args.projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const nextVersion = (last?.version || 0) + 1;

  const header = await prisma.lVHeader.create({
    data: {
      projectId: args.projectId,
      title: args.title || "Importiertes LV",
      currency: args.currency || "EUR",
      version: nextVersion,
    },
  });

  const normalized = normalizeImportItems(args.itemsRaw);

  const data = normalized
  .filter((p) => {
    const pos = String(p.position ?? "").trim();
    const text = String(p.kurztext ?? "").trim();
    const langtext = String(p.langtext ?? "").trim();
    if (!pos && !text && !langtext) return false;
    if (text === "EUR" && !langtext) return false;
    return true;
  })
  .map((p) => {
    const menge = typeof p.menge === "number" && Number.isFinite(p.menge) ? p.menge : 0;
    const einzelpreis =
      typeof p.einzelpreis === "number" && Number.isFinite(p.einzelpreis)
        ? p.einzelpreis
        : null;

    const total =
      typeof (p as any).total === "number" && Number.isFinite((p as any).total)
        ? Number((p as any).total)
        : null;

    return {
      lvId: header.id,
      position: String(p.position ?? "").trim(),
      kurztext: String(p.kurztext ?? "").trim(),
      langtext: String(p.langtext ?? "").trim(),
      einheit: String(p.einheit ?? "").trim(),
      menge,
      einzelpreis,
      gesamt:
        total !== null
          ? Number(total.toFixed(2))
          : typeof einzelpreis === "number"
            ? Number((menge * einzelpreis).toFixed(2))
            : null,
    };
  });

  if (data.length) {
    await prisma.lVPosition.createMany({ data });
  }

  return {
    header,
    count: data.length,
    items: normalized,
  };
}

router.post("/:projectId/import", async (req, res) => {
  try {
    const companyId = await ensureCompanyId(req);
    const projectIdOrCode = String(req.params.projectId || "").trim();

    if (!projectIdOrCode) {
      return res.status(400).json({ ok: false, error: "projectId fehlt" });
    }

    const project = await resolveProject(companyId, projectIdOrCode);

    if (!project) {
      return res.status(404).json({
        ok: false,
        error: "Projekt nicht gefunden",
      });
    }

    const projectId = project.id;
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!itemsRaw.length) {
      return res.status(400).json({
        ok: false,
        error: "Keine LV items übergeben",
      });
    }

    const last = await prisma.lVHeader.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const nextVersion = (last?.version || 0) + 1;

    const header = await prisma.lVHeader.create({
      data: {
        projectId,
        title: req.body?.title || "Importiertes LV",
        currency: req.body?.currency || "EUR",
        version: nextVersion,
      },
    });

    const data = itemsRaw.map((p: any, i: number) => {
    const quantityRaw =
  typeof p.quantity === "number"
    ? p.quantity
    : typeof p.menge === "number"
      ? p.menge
      : Number(p.quantity ?? p.menge);

const epRaw =
  typeof p.ep === "number"
    ? p.ep
    : typeof p.einzelpreis === "number"
      ? p.einzelpreis
      : Number(p.ep ?? p.einzelpreis);

const quantity = Number.isFinite(quantityRaw) ? quantityRaw : 0;
const ep = Number.isFinite(epRaw) ? epRaw : null;

return {
  lvId: header.id,
  position: String(p.pos ?? p.position ?? i + 1).trim(),
  kurztext: String(p.text ?? p.kurztext ?? "").trim(),
  langtext: p.langtext ? String(p.langtext).trim() : "",
  einheit: String(p.unit ?? p.einheit ?? "").trim(),
  menge: quantity,
  einzelpreis: ep,
  gesamt:
    typeof ep === "number"
      ? Number((quantity * ep).toFixed(2))
      : null,
};
    });

    if (data.length) {
      await prisma.lVPosition.createMany({ data });
    }

    return res.json({
      ok: true,
      headerId: header.id,
      count: data.length,
    });
  } catch (e) {
    console.error("[LV-IMPORT] error", e);
    return res.status(500).json({
      ok: false,
      error: "Import failed",
    });
  }
});

router.post("/:projectId/import-file", lvImportUpload.single("file"), async (req, res) => {
  try {
    const companyId = await ensureCompanyId(req);
    const projectIdOrCode = String(req.params.projectId || "").trim();

    if (!projectIdOrCode) {
      return res.status(400).json({ ok: false, error: "projectId fehlt" });
    }

    const project = await resolveProject(companyId, projectIdOrCode);

    if (!project) {
      return res.status(404).json({
        ok: false,
        error: "Projekt nicht gefunden",
      });
    }

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({
        ok: false,
        error: "Datei fehlt",
      });
    }

    const originalName = String(file.originalname || "import.dat");
    const lower = originalName
      .toLowerCase()
      .replace(/[\u0000-\u001f\u007f]+/g, "")
      .trim();
    const text = Buffer.isBuffer(file.buffer) ? file.buffer.toString("utf8") : "";
    const isGaebXmlLike =
      /\.x(80|81|82|83|84|85|86|89|94)$/i.test(lower) ||
      lower.endsWith(".xml") ||
      lower.endsWith(".gaeb") ||
      text.includes("<GAEB") ||
      text.includes("<BoQ") ||
      text.includes("<Item") ||
      text.includes("RNoPart");

    let parsed: { title: string; currency: string; items: any[] } | null = null;
    let detectedType = "unknown";

    if (lower.endsWith(".json")) {
      parsed = parseJsonImport(text);
      detectedType = "json";
    } else if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
      parsed = parseCsvImport(text);
      detectedType = "csv";
    } else if (isGaebXmlLike) {
      parsed = await parseGaebXmlImport(text);
      const extMatch = lower.match(/\.x(80|81|82|83|84|85|86|89|94)$/i);
      detectedType = extMatch ? `x${extMatch[1]}` : lower.endsWith(".gaeb") ? "gaeb" : "xml";

        /*
         * X83 enthält LV-Texte.
         * Deep-Walk findet zusätzlich leere Struktur-/Mengenfragmente.
         * Diese dürfen bei X83 nicht als echte LV-Positionen gespeichert werden.
         * X84 bleibt unberührt, weil dort Texte fehlen können.
         */
        if (detectedType === "x83" && parsed?.items?.length) {
          parsed.items = parsed.items.filter((row: any) => {
            const text = String(row?.text || row?.kurztext || "").trim();
            const lang = String(row?.langtext || "").trim();
            return Boolean(text || lang);
          });
        }
    } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      parsed = parseExcelImport(file.buffer, originalName);
      detectedType = lower.endsWith(".xls") ? "xls" : "xlsx";
    } else if (lower.endsWith(".pdf")) {
      parsed = await parsePdfImport(file.buffer, originalName);
      detectedType = "pdf";
    } else {
      return res.status(415).json({
        ok: false,
        error: "Nicht unterstützter Dateityp",
      });
    }

    if (!parsed || !Array.isArray(parsed.items) || !parsed.items.length) {
      return res.status(400).json({
        ok: false,
        error:
          detectedType === "pdf"
            ? "PDF erkannt, aber keine LV-Positionen gefunden. Unterstützt wird aktuell nur textbasierter PDF-Inhalt, kein Scan/OCR."
            : "Datei erkannt, aber keine gültigen LV-Positionen gefunden.",
      });
    }

    const isX84Import = String(detectedType || "").toLowerCase() === "x84";

    if (isX84Import) {
      parsed.items = await enrichGaebX84RowsWithLatestLv(project.id, parsed.items);
    }

    const imported = await importLvItemsIntoNewVersion({
      projectId: project.id,
      title: parsed.title,
      currency: parsed.currency,
      itemsRaw: parsed.items,
    });

    return res.json({
      ok: true,
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
      },
      headerId: imported.header.id,
      version: imported.header.version,
      count: imported.count,
      detectedType,
      format: detectedType,
      items: parsed.items,
      rows: parsed.items,
      positions: parsed.items,
    });
  } catch (e: any) {
    console.error("[LV-IMPORT-FILE] error", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Import file failed",
    });
  }
});

async function getLatestLvHeaderOrCreate(projectId: string, title = "Importiertes LV") {
  const latest = await prisma.lVHeader.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });

  if (latest) return latest;

  return prisma.lVHeader.create({
    data: {
      projectId,
      title,
      currency: "EUR",
      version: 1,
    },
  });
}

function toNullableNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function resolveProjectOrFail(req: Request, res: Response) {
  const companyId = await ensureCompanyId(req);
  const projectIdOrCode = String(req.params.projectId || "").trim();

  if (!projectIdOrCode) {
    res.status(400).json({ ok: false, error: "projectId fehlt" });
    return null;
  }

  const project = await resolveProject(companyId, projectIdOrCode);
  if (!project) {
    res.status(404).json({ ok: false, error: "Projekt nicht gefunden" });
    return null;
  }

  return project;
}

router.post("/:projectId/position", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const header = await getLatestLvHeaderOrCreate(
      project.id,
      req.body?.headerTitle || "Importiertes LV"
    );

    const pos = String(req.body?.pos ?? req.body?.position ?? "").trim();
    const text = String(req.body?.text ?? req.body?.kurztext ?? "").trim();
    const langtext =
      req.body?.langtext !== undefined && req.body?.langtext !== null
        ? String(req.body.langtext)
        : "";
    const unit = String(req.body?.unit ?? req.body?.einheit ?? "").trim();

    const quantity = toNullableNumber(req.body?.quantity ?? req.body?.menge);
    const ep = toNullableNumber(req.body?.ep ?? req.body?.einzelpreis);
    const parentPos =
      req.body?.parentPos !== undefined && req.body?.parentPos !== null
        ? String(req.body.parentPos)
        : null;

    if (!pos) {
      return res.status(400).json({ ok: false, error: "Position fehlt" });
    }

    if (!text) {
      return res.status(400).json({ ok: false, error: "Kurztext fehlt" });
    }

    if (!unit) {
      return res.status(400).json({ ok: false, error: "Einheit fehlt" });
    }

    const created = await prisma.lVPosition.create({
      data: {
        lvId: header.id,
        position: pos,
        kurztext: text,
        langtext,
        einheit: unit,
        menge: quantity ?? 0,
        einzelpreis: ep,
        gesamt:
          typeof quantity === "number" && typeof ep === "number"
            ? Number((quantity * ep).toFixed(2))
            : null,
        parentPos,
      },
    });

    return res.json({
      ok: true,
      item: {
        id: created.id,
        pos: created.position,
        text: created.kurztext,
        langtext: created.langtext || "",
        unit: created.einheit,
        quantity: Number(created.menge ?? 0),
        ep: created.einzelpreis != null ? Number(created.einzelpreis) : 0,
      },
    });
  } catch (e: any) {
    console.error("[LV-POSITION-CREATE] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Create failed" });
  }
});

router.patch("/:projectId/position/:positionId", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const positionId = String(req.params.positionId || "").trim();
    if (!positionId) {
      return res.status(400).json({ ok: false, error: "positionId fehlt" });
    }

    const latest = await prisma.lVHeader.findFirst({
      where: { projectId: project.id },
      orderBy: { version: "desc" },
      select: { id: true },
    });

    if (!latest) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const existing = await prisma.lVPosition.findFirst({
      where: {
        id: positionId,
        lvId: latest.id,
      },
    });

    if (!existing) {
      return res.status(404).json({ ok: false, error: "Position nicht gefunden" });
    }

    const nextQuantityRaw =
      req.body?.quantity !== undefined ? req.body.quantity : req.body?.menge;
    const nextEpRaw = req.body?.ep !== undefined ? req.body.ep : req.body?.einzelpreis;

    const quantity =
      nextQuantityRaw !== undefined ? toNullableNumber(nextQuantityRaw) : Number(existing.menge);

    const ep =
      nextEpRaw !== undefined
        ? toNullableNumber(nextEpRaw)
        : existing.einzelpreis != null
          ? Number(existing.einzelpreis)
          : null;

    const updated = await prisma.lVPosition.update({
      where: { id: existing.id },
      data: {
        position:
          req.body?.pos !== undefined || req.body?.position !== undefined
            ? String(req.body?.pos ?? req.body?.position ?? existing.position)
            : undefined,
        kurztext:
          req.body?.text !== undefined || req.body?.kurztext !== undefined
            ? String(req.body?.text ?? req.body?.kurztext ?? existing.kurztext)
            : undefined,
        langtext:
          req.body?.langtext !== undefined
            ? req.body.langtext == null
              ? ""
              : String(req.body.langtext)
            : undefined,
        einheit:
          req.body?.unit !== undefined || req.body?.einheit !== undefined
            ? String(req.body?.unit ?? req.body?.einheit ?? existing.einheit)
            : undefined,
        menge: quantity ?? 0,
        einzelpreis: ep,
        gesamt:
          typeof quantity === "number" && typeof ep === "number"
            ? Number((quantity * ep).toFixed(2))
            : null,
        parentPos:
          req.body?.parentPos !== undefined
            ? req.body.parentPos == null
              ? null
              : String(req.body.parentPos)
            : undefined,
      },
    });

    return res.json({
      ok: true,
      item: {
        id: updated.id,
        pos: updated.position,
        text: updated.kurztext,
        langtext: updated.langtext || "",
        unit: updated.einheit,
        quantity: Number(updated.menge ?? 0),
        ep: updated.einzelpreis != null ? Number(updated.einzelpreis) : 0,
      },
    });
  } catch (e: any) {
    console.error("[LV-POSITION-PATCH] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Patch failed" });
  }
});

router.delete("/:projectId/position/:positionId", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const positionId = String(req.params.positionId || "").trim();
    if (!positionId) {
      return res.status(400).json({ ok: false, error: "positionId fehlt" });
    }

    const latest = await prisma.lVHeader.findFirst({
      where: { projectId: project.id },
      orderBy: { version: "desc" },
      select: { id: true },
    });

    if (!latest) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const existing = await prisma.lVPosition.findFirst({
      where: {
        id: positionId,
        lvId: latest.id,
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ ok: false, error: "Position nicht gefunden" });
    }

    await prisma.lVPosition.delete({
      where: { id: existing.id },
    });

    return res.json({
      ok: true,
      deletedId: existing.id,
    });
  } catch (e: any) {
    console.error("[LV-POSITION-DELETE] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Delete failed" });
  }
});

router.get("/:projectId/versions", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const versions = await prisma.lVHeader.findMany({
      where: { projectId: project.id },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        title: true,
        createdAt: true,
      },
    });

    return res.json({
      ok: true,
      versions,
    });
  } catch (e) {
    console.error("[LV-VERSIONS] error", e);
    return res.status(500).json({ ok: false });
  }
});

router.get("/:projectId/version/:version", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const version = Number(req.params.version);

    const header = await prisma.lVHeader.findFirst({
      where: {
        projectId: project.id,
        version,
      },
    });

    if (!header) {
      return res.status(404).json({ ok: false, error: "Version not found" });
    }

    const positions = await prisma.lVPosition.findMany({
      where: { lvId: header.id },
      orderBy: { position: "asc" },
    });

    return res.json({
      ok: true,
      header,
      items: positions,
    });
  } catch (e) {
    console.error("[LV-VERSION-GET] error", e);
    return res.status(500).json({ ok: false });
  }
});

router.get("/:projectId/export/excel", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const versionRaw = req.query?.version;
    const version =
      versionRaw !== undefined && versionRaw !== null && String(versionRaw).trim() !== ""
        ? Number(versionRaw)
        : null;

    const { header, items } = await getLvForExport(project.id, version);

    if (!header) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("LV");

    sheet.columns = [
      { header: "Position", key: "position", width: 18 },
      { header: "Kurztext", key: "kurztext", width: 40 },
      { header: "Langtext", key: "langtext", width: 60 },
      { header: "Einheit", key: "einheit", width: 12 },
      { header: "Menge", key: "menge", width: 14 },
      { header: "EP", key: "einzelpreis", width: 14 },
      { header: "Gesamt", key: "gesamt", width: 16 },
      { header: "ParentPos", key: "parentPos", width: 18 },
    ];

    sheet.getRow(1).font = { bold: true };

    for (const item of items) {
      sheet.addRow({
        position: item.position,
        kurztext: item.kurztext,
        langtext: item.langtext || "",
        einheit: item.einheit,
        menge: num(item.menge),
        einzelpreis: num(item.einzelpreis),
        gesamt: num(item.gesamt),
        parentPos: item.parentPos || "",
      });
    }

    const lastRow = sheet.addRow({
      position: "",
      kurztext: "",
      langtext: "",
      einheit: "",
      menge: "",
      einzelpreis: "Summe",
      gesamt: items.reduce((s, x) => s + num(x.gesamt), 0),
      parentPos: "",
    });
    lastRow.font = { bold: true };

    const { exportsDir } = ensureProjectExportDirs(project.code);
    const filePath = path.join(exportsDir, `lv_${project.code}_v${header.version}.xlsx`);
    await workbook.xlsx.writeFile(filePath);
    log("Excel saved:", filePath);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="lv_${project.code}_v${header.version}.xlsx"`
    );

    return res.download(filePath, `lv_${project.code}_v${header.version}.xlsx`);
  } catch (e: any) {
    console.error("[LV-EXPORT-EXCEL] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "Excel export failed" });
  }
});

router.get("/:projectId/export/pdf", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const versionRaw = req.query?.version;
    const version =
      versionRaw !== undefined && versionRaw !== null && String(versionRaw).trim() !== ""
        ? Number(versionRaw)
        : null;

    const { header, items } = await getLvForExport(project.id, version);

    if (!header) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const { exportsDir } = ensureProjectExportDirs(project.code);
    const filePath = path.join(exportsDir, `lv_${project.code}_v${header.version}.pdf`);

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const fileStream = fs.createWriteStream(filePath);

    doc.pipe(fileStream);

    doc.fontSize(18).text("Leistungsverzeichnis", { align: "left" });
    doc.moveDown(0.2);
    doc.fontSize(11).text(`Projekt: ${project.code} ${project.name}`);
    doc.text(`Version: ${header.version}`);
    doc.text(`Titel: ${header.title}`);
    doc.moveDown(0.5);

    let y = doc.y;
    doc.fontSize(10).text("Pos", 40, y, { width: 70 });
    doc.text("Kurztext", 110, y, { width: 180 });
    doc.text("ME", 290, y, { width: 35 });
    doc.text("Menge", 325, y, { width: 60, align: "right" });
    doc.text("EP", 390, y, { width: 70, align: "right" });
    doc.text("Gesamt", 465, y, { width: 90, align: "right" });
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.3);

    let sum = 0;

    for (const item of items) {
      const menge = num(item.menge);
      const ep = num(item.einzelpreis);
      const gesamt = num(item.gesamt);
      sum += gesamt;

      const rowY = doc.y;
      doc.fontSize(9);
      doc.text(String(item.position || ""), 40, rowY, { width: 70 });
      doc.text(String(item.kurztext || ""), 110, rowY, { width: 180 });
      doc.text(String(item.einheit || ""), 290, rowY, { width: 35 });
      doc.text(String(menge), 325, rowY, { width: 60, align: "right" });
      doc.text(String(ep), 390, rowY, { width: 70, align: "right" });
      doc.text(String(gesamt), 465, rowY, { width: 90, align: "right" });

      if (item.langtext) {
        doc.moveDown(0.1);
        doc.fontSize(8).fillColor("#555555");
        doc.text(String(item.langtext), 110, doc.y, { width: 345 });
        doc.fillColor("#000000");
      }

      doc.moveDown(0.35);

      if (doc.y > 730) {
        doc.addPage();
      }
    }

    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#999999").stroke();
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Gesamtsumme: ${sum.toFixed(2)} EUR`, { align: "right" });

    doc.end();

    fileStream.on("finish", () => {
      log("PDF saved:", filePath);
      return res.download(filePath, `lv_${project.code}_v${header.version}.pdf`);
    });

    fileStream.on("error", (err) => {
      console.error("[LV-EXPORT-PDF] file stream error", err);
      if (!res.headersSent) {
        return res.status(500).json({ ok: false, error: "PDF export failed" });
      }
    });
  } catch (e: any) {
    console.error("[LV-EXPORT-PDF] error", e);
    return res.status(500).json({ ok: false, error: e?.message || "PDF export failed" });
  }
});

router.post("/:projectId/export/gaeb/validate", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const modeRaw = String(req.body?.mode || req.query?.mode || "x83").toLowerCase();
    const mode: "x83" | "x84" = modeRaw === "x84" ? "x84" : "x83";

    const versionRaw = req.body?.version ?? req.query?.version;
    const version =
      versionRaw !== undefined && versionRaw !== null && String(versionRaw).trim() !== ""
        ? Number(versionRaw)
        : null;

    const { header, items } = await getLvForExport(project.id, version);

    if (!header) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const result = validateGaebItems(items, mode);

    return res.json({
      ok: true,
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
      },
      lv: {
        id: header.id,
        title: header.title,
        version: header.version,
      },
      mode,
      valid: result.valid,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      errors: result.errors,
      warnings: result.warnings,
      issues: result.issues,
    });
  } catch (e: any) {
    console.error("[GAEB-VALIDATE]", e);
    return res.status(500).json({ ok: false, error: e?.message || "GAEB validation failed" });
  }
});

router.get("/:projectId/export/gaeb/x83", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const versionRaw = req.query?.version;
    const version =
      versionRaw !== undefined && versionRaw !== null && String(versionRaw).trim() !== ""
        ? Number(versionRaw)
        : null;

    const { header, items } = await getLvForExport(project.id, version);

    if (!header) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const validation = validateGaebItems(items, "x83");
    if (!validation.valid) {
      return res.status(400).json(buildGaebValidationErrorResponse(validation));
    }

    const tree = buildLvTree(items);
    const xml = buildGaebX83Xml({
      projectCode: project.code,
      projectName: project.name,
      headerId: header.id,
      headerTitle: header.title,
      version: header.version,
      nodes: tree,
    });

    const { gaebDir } = ensureProjectExportDirs(project.code);
    const abs = path.join(gaebDir, "lv.X83");
    fs.writeFileSync(abs, xml, "utf8");

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${gaebFileNameBase(project.code, header.version)}.X83"`
    );

    return res.send(xml);
  } catch (e: any) {
    console.error("[GAEB-X83 EXPORT]", e);
    return res.status(500).json({ ok: false, error: e?.message || "GAEB X83 export failed" });
  }
});

router.get("/:projectId/export/gaeb/x84", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const versionRaw = req.query?.version;
    const version =
      versionRaw !== undefined && versionRaw !== null && String(versionRaw).trim() !== ""
        ? Number(versionRaw)
        : null;

    const { header, items } = await getLvForExport(project.id, version);

    if (!header) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const validation = validateGaebItems(items, "x84");
    if (!validation.valid) {
      return res.status(400).json(buildGaebValidationErrorResponse(validation));
    }

    const tree = buildLvTree(items);
    const xml = buildGaebX84Xml({
      projectCode: project.code,
      projectName: project.name,
      headerId: header.id,
      headerTitle: header.title,
      version: header.version,
      nodes: tree,
      items,
    });

    const { gaebDir } = ensureProjectExportDirs(project.code);
    const abs = path.join(gaebDir, "angebot.X84");
    fs.writeFileSync(abs, xml, "utf8");

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="angebot_${project.code}_v${header.version}.X84"`
    );

    return res.send(xml);
  } catch (e: any) {
    console.error("[GAEB-X84 EXPORT]", e);
    return res.status(500).json({ ok: false, error: e?.message || "GAEB X84 export failed" });
  }
});

router.get("/:projectId/export/gaeb", async (req, res) => {
  try {
    const project = await resolveProjectOrFail(req, res);
    if (!project) return;

    const versionRaw = req.query?.version;
    const version =
      versionRaw !== undefined && versionRaw !== null && String(versionRaw).trim() !== ""
        ? Number(versionRaw)
        : null;

    const { header, items } = await getLvForExport(project.id, version);

    if (!header) {
      return res.status(404).json({ ok: false, error: "Kein LV vorhanden" });
    }

    const validation = validateGaebItems(items, "x83");
    if (!validation.valid) {
      return res.status(400).json(buildGaebValidationErrorResponse(validation));
    }

    const tree = buildLvTree(items);
    const xml = buildGaebX83Xml({
      projectCode: project.code,
      projectName: project.name,
      headerId: header.id,
      headerTitle: header.title,
      version: header.version,
      nodes: tree,
    });

    const { gaebDir } = ensureProjectExportDirs(project.code);
    const abs = path.join(gaebDir, "lv.X83");
    fs.writeFileSync(abs, xml, "utf8");

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${gaebFileNameBase(project.code, header.version)}.X83"`
    );

    return res.send(xml);
  } catch (e: any) {
    console.error("[GAEB EXPORT LEGACY->X83]", e);
    return res.status(500).json({ ok: false, error: e?.message || "GAEB export failed" });
  }
});

export default router;
