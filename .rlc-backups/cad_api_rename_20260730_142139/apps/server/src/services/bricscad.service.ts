import fs from "fs";
import path from "path";
import { spawn } from "child_process";

export type BricscadPaths = {
  projectRoot: string;
  bricscadDir: string;
  utmCsvPath: string;
  takeoffJsonPath: string;
  snapshotPngPath: string; // ✅ NEW
};

export type TakeoffPayload = {
  ok?: boolean;
  message?: string;

  // Formati "vecchi" o generici
  features?: any[];
  points?: any[];
  data?: any;

  // ✅ RLC Takeoff v2 (plugin attuale)
  type?: string; // "rlc_takeoff_v2"
  rows?: any[];

  // ✅ formato normalizzato (sempre presente se ok=true)
  normalized?: {
    version: string;
    sourceType?: string;
    features: any[];
    points: any[];
  };
};

function exists(p: string) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function readText(p: string) {
  return fs.readFileSync(p, "utf8");
}

/**
 * Rende il testo più "parseable" su Windows/plugin:
 * - rimuove BOM
 * - rimuove null bytes
 * - trim
 */
function sanitizeJsonText(raw: string) {
  if (!raw) return "";
  let s = raw;

  // BOM (UTF-8)
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);

  // null bytes
  s = s.replace(/\u0000/g, "");

  return s.trim();
}

/**
 * Parse robusto:
 * 1) prova parse diretto
 * 2) se fallisce, prova a estrarre il JSON tra prima "{" e ultima "}"
 *    (utile se il file contiene log/garbage attorno)
 */
function robustJsonParse<T>(
  raw: string
): { ok: boolean; value?: T; error?: string } {
  const s0 = sanitizeJsonText(raw);
  if (!s0) return { ok: false, error: "Empty file." };

  try {
    return { ok: true, value: JSON.parse(s0) as T };
  } catch (e1: any) {
    // tenta estrazione tra { ... }
    const first = s0.indexOf("{");
    const last = s0.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const sliced = s0.slice(first, last + 1);
      try {
        return { ok: true, value: JSON.parse(sliced) as T };
      } catch (e2: any) {
        return {
          ok: false,
          error:
            `JSON.parse failed (direct + sliced). ` +
            `DirectError: ${String(e1?.message || e1)} ` +
            `SlicedError: ${String(e2?.message || e2)}`,
        };
      }
    }

    return { ok: false, error: `JSON.parse failed. ${String(e1?.message || e1)}` };
  }
}

export function getProjectsRoot() {
  return process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");
}

export function getBricscadPaths(projectId: string): BricscadPaths {
  const PROJECTS_ROOT = getProjectsRoot();
  const projectRoot = path.join(PROJECTS_ROOT, projectId);
  const bricscadDir = path.join(projectRoot, "bricscad");

  return {
    projectRoot,
    bricscadDir,
    utmCsvPath: path.join(bricscadDir, "utm.csv"),
    takeoffJsonPath: path.join(bricscadDir, "takeoff.json"),
    snapshotPngPath: path.join(bricscadDir, "snapshot.png"), // ✅ NEW
  };
}

export function readUtmCsv(projectId: string): {
  ok: boolean;
  message?: string;
  csv?: string;
  paths: BricscadPaths;
} {
  const paths = getBricscadPaths(projectId);

  if (!exists(paths.utmCsvPath)) {
    return {
      ok: false,
      message:
        `utm.csv nicht gefunden.\n` +
        `Erwarteter Pfad:\n${paths.utmCsvPath}\n\n` +
        `Hinweis: Plugin muss die Datei unter data/projects/<projectId>/bricscad/utm.csv schreiben.`,
      paths,
    };
  }

  const csv = readText(paths.utmCsvPath);
  if (!csv.trim()) {
    return { ok: false, message: "utm.csv ist leer.", paths };
  }

  return { ok: true, csv, paths };
}

function normalizeTakeoff(payload: any): {
  ok: boolean;
  message?: string;
  normalized: TakeoffPayload["normalized"];
} {
  const empty = {
    version: "normalized_v1",
    sourceType: typeof payload?.type === "string" ? payload.type : "unknown",
    features: [] as any[],
    points: [] as any[],
  };

  // ✅ Case A: RLC Takeoff v2
  const type = String(payload?.type || "");
  const rows = Array.isArray(payload?.rows) ? payload.rows : null;

  if (type === "rlc_takeoff_v2" && rows) {
    const features = rows
      .map((r: any, idx: number) => {
        const handle = String(r?.handle || "").trim();
        const layer = String(r?.layer || "").trim();
        const entityType = String(r?.entityType || "").trim();
        const lvPos = String(r?.lvPos || "").trim();
        const lvText = String(r?.lvText || "").trim();

        const length = Number(r?.length);
        const area = Number(r?.area);

        const id = handle ? `H_${handle}` : `ROW_${idx + 1}`;

        const kind =
          entityType.toLowerCase().includes("polyline")
            ? "polyline"
            : entityType.toLowerCase().includes("line")
            ? "line"
            : entityType.toLowerCase().includes("arc")
            ? "line"
            : "polyline";

        const safeLength = Number.isFinite(length) ? length : 0;
        const safeArea = Number.isFinite(area) ? area : 0;

        return {
          id,
          kind,
          layer: layer || undefined,
          name: lvText || undefined,
          length: safeLength,
          area: safeArea,

          // Non abbiamo i vertici: viewer può usare lista/preview quantitativa
          pts: [],
          closed: false,

          meta: {
            source: "rlc_takeoff_v2",
            entityType,
            handle,
            lvPos,
            lvText,
          },
        };
      })
      .filter((f: any) => f && f.id);

    if (!features.length) {
      return {
        ok: false,
        message:
          "rlc_takeoff_v2 erkannt, aber rows enthält keine verwertbaren Einträge.",
        normalized: empty,
      };
    }

    return {
      ok: true,
      normalized: { ...empty, sourceType: "rlc_takeoff_v2", features, points: [] },
    };
  }

  // Case B: features/points standard
  const features =
    Array.isArray(payload?.features)
      ? payload.features
      : Array.isArray(payload?.data?.features)
      ? payload.data.features
      : [];

  const points =
    Array.isArray(payload?.points)
      ? payload.points
      : Array.isArray(payload?.data?.points)
      ? payload.data.points
      : [];

  if (features.length || points.length) {
    return {
      ok: true,
      normalized: { ...empty, sourceType: "features_points", features, points },
    };
  }

  return {
    ok: false,
    message:
      "takeoff.json enthält keine 'features' oder 'points' und ist auch nicht 'rlc_takeoff_v2'.\n" +
      "Erwartet: { features:[...] } oder { data:{ features:[...] } } oder { type:'rlc_takeoff_v2', rows:[...] }.",
    normalized: empty,
  };
}

export function readTakeoff(projectId: string): {
  ok: boolean;
  message?: string;
  payload?: TakeoffPayload;
  paths: BricscadPaths;
} {
  const paths = getBricscadPaths(projectId);

  if (!exists(paths.takeoffJsonPath)) {
    return {
      ok: false,
      message:
        `takeoff.json nicht gefunden.\n` +
        `Erwarteter Pfad:\n${paths.takeoffJsonPath}\n\n` +
        `Hinweis: Plugin muss die Datei unter data/projects/<projectId>/bricscad/takeoff.json schreiben.`,
      paths,
    };
  }

  const raw = readText(paths.takeoffJsonPath);

  const parsed = robustJsonParse<any>(raw);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
    const s = sanitizeJsonText(raw);
    const head = s.slice(0, 200);
    const tail = s.slice(Math.max(0, s.length - 200));

    return {
      ok: false,
      message:
        "takeoff.json ist kein gültiges JSON-Objekt.\n" +
        (parsed.error ? `Parse-Fehler: ${parsed.error}\n\n` : "\n") +
        `Debug (Head 200): ${head}\n\nDebug (Tail 200): ${tail}`,
      paths,
    };
  }

  const norm = normalizeTakeoff(parsed.value);

  const outPayload: TakeoffPayload = {
    ...(parsed.value as any),
    normalized: norm.normalized,
  };

  if (!norm.ok) {
    return { ok: false, message: norm.message, payload: outPayload, paths };
  }

  return { ok: true, payload: outPayload, paths };
}

/* ============================================================
   ✅ Snapshot: existence check (file is produced by plugin)
   ============================================================ */
export function getSnapshotInfo(projectId: string): {
  ok: boolean;
  message?: string;
  paths: BricscadPaths;
} {
  const paths = getBricscadPaths(projectId);
  if (!exists(paths.snapshotPngPath)) {
    return {
      ok: false,
      message:
        `snapshot.png nicht gefunden.\n` +
        `Erwarteter Pfad:\n${paths.snapshotPngPath}\n\n` +
        `Hinweis: Plugin muss Snapshot nach data/projects/<projectId>/bricscad/snapshot.png exportieren.`,
      paths,
    };
  }
  return { ok: true, paths };
}

/* ============================================================
   ✅ BricsCAD öffnen (Windows) — robust
   ============================================================ */

function isWindows() {
  return process.platform === "win32";
}

function sanitizeProjectId(input: string) {
  const v = String(input || "").trim();
  return v.replace(/[^a-zA-Z0-9._-]/g, "");
}

function assertProjectDirExists(projectIdRaw: string) {
  const projectId = sanitizeProjectId(projectIdRaw);
  if (!projectId) throw new Error("projectId fehlt.");

  const projectRoot = path.join(getProjectsRoot(), projectId);
  if (!exists(projectRoot)) {
    throw new Error(`Projektordner existiert nicht: ${projectRoot}`);
  }

  return { projectId, projectRoot };
}

function findFirstDwg(projectRoot: string): string | null {
  const candidates = [
    path.join(projectRoot, "cad", "current.dwg"),
    path.join(projectRoot, "cad", "plan.dwg"),
    path.join(projectRoot, "bricscad", "current.dwg"),
    path.join(projectRoot, "bricscad", "plan.dwg"),
    path.join(projectRoot, "current.dwg"),
    path.join(projectRoot, "plan.dwg"),
  ];

  for (const c of candidates) {
    if (exists(c)) return c;
  }

  const maxDepth = 3;

  const walk = (dir: string, depth: number): string | null => {
    if (depth > maxDepth) return null;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }

    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        const r = walk(full, depth + 1);
        if (r) return r;
      } else if (e.isFile() && path.extname(e.name).toLowerCase() === ".dwg") {
        return full;
      }
    }
    return null;
  };

  return walk(projectRoot, 0);
}

export function openBricscad(projectIdRaw: string): {
  ok: boolean;
  projectId: string;
  projectRoot: string;
  exe: string;
  openedFile: string | null;
  message: string;
} {
  if (!isWindows()) {
    throw new Error("BricsCAD öffnen ist aktuell nur für Windows vorgesehen.");
  }

  const { projectId, projectRoot } = assertProjectDirExists(projectIdRaw);

  const exe =
    (process.env.BRICSCAD_EXE || "").trim() ||
    "C:\\Programme\\Bricsys\\BricsCAD V24 de_DE\\bricscad.exe";

  if (!exists(exe)) {
    throw new Error(
      `BricsCAD EXE nicht gefunden.\n` +
        `Setze BRICSCAD_EXE in apps/server/.env\n` +
        `Aktuell: ${exe}`
    );
  }

  const dwg = findFirstDwg(projectRoot);

  const args = ["/c", "start", '""', exe, ...(dwg ? [dwg] : [])];

  const child = spawn("cmd.exe", args, {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });

  child.unref();

  return {
    ok: true,
    projectId,
    projectRoot,
    exe,
    openedFile: dwg,
    message: dwg
      ? `BricsCAD gestartet mit DWG: ${path.basename(dwg)}`
      : "BricsCAD gestartet (kein DWG gefunden, nur App geöffnet).",
  };
}
