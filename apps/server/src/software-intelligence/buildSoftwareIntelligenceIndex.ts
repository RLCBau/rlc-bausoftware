import fs from "fs";
import path from "path";
import crypto from "crypto";

type Platform = "WEB" | "MOBILE" | "SERVER";

type SourceKind =
  | "PAGE"
  | "SCREEN"
  | "ROUTE"
  | "SERVICE"
  | "COMPONENT"
  | "API"
  | "EXPORTER"
  | "STORE"
  | "LIB"
  | "CONFIG"
  | "OTHER";

type IndexChunk = {
  id: string;
  platform: Platform;
  kind: SourceKind;
  file: string;
  fileName: string;
  fileStem: string;
  area: string;
  title: string;
  pathTerms: string[];
  nameTerms: string[];
  uiLabels: string[];
  symbols: string[];
  routes: string[];
  keywords: string[];
  content: string;
};

type SoftwareIndex = {
  version: string;
  generatedAt: string;
  repository: string;
  stats: {
    files: number;
    chunks: number;
    web: number;
    mobile: number;
    server: number;
  };
  chunks: IndexChunk[];
};

const SERVER_ROOT = path.resolve(__dirname, "../..");
const REPO_ROOT = path.resolve(SERVER_ROOT, "../..");

const OUTPUT_FILE = path.join(
  SERVER_ROOT,
  "src",
  "generated",
  "software-intelligence-index.json"
);

const SOURCE_ROOTS: Array<{ platform: Platform; root: string }> = [
  {
    platform: "WEB",
    root: path.join(REPO_ROOT, "apps", "web", "src"),
  },
  {
    platform: "MOBILE",
    root: path.join(REPO_ROOT, "apps", "mobile"),
  },
  {
    platform: "SERVER",
    root: path.join(REPO_ROOT, "apps", "server", "src"),
  },
];

const ALLOWED_EXT = new Set([
  ".ts",
  ".tsx",
  ".json",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".expo",
  ".next",
  "coverage",
  "generated",
]);

const MAX_FILE_BYTES = 600_000;
const MAX_CHUNK_CHARS = 5_500;
const CHUNK_OVERLAP_LINES = 12;

function norm(value: unknown): string {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function searchable(value: unknown): string {
  return String(value ?? "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./\\-]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function terms(value: unknown): string[] {
  return Array.from(
    new Set(
      searchable(value)
        .split(" ")
        .map((x) => x.trim())
        .filter((x) => x.length >= 2)
    )
  );
}

function relativeFile(file: string): string {
  return path
    .relative(REPO_ROOT, file)
    .replace(/\\/g, "/");
}

function hash(value: string): string {
  return crypto
    .createHash("sha1")
    .update(value)
    .digest("hex")
    .slice(0, 16);
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const out: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walk(path.join(dir, entry.name)));
      continue;
    }

    const full = path.join(dir, entry.name);
    const ext = path.extname(entry.name).toLowerCase();

    if (!ALLOWED_EXT.has(ext)) continue;

    try {
      if (fs.statSync(full).size > MAX_FILE_BYTES) continue;
    } catch {
      continue;
    }

    out.push(full);
  }

  return out;
}

function detectKind(
  file: string,
  platform: Platform
): SourceKind {
  const f = file.toLowerCase();

  if (platform === "MOBILE" && f.includes("/screens/")) return "SCREEN";
  if (platform === "WEB" && f.includes("/pages/")) return "PAGE";

  if (
    platform === "SERVER" &&
    (
      f.includes("/routes/") ||
      /\.routes?\.ts$/.test(f)
    )
  ) {
    return "ROUTE";
  }

  if (f.includes("/services/")) return "SERVICE";
  if (f.includes("/components/")) return "COMPONENT";
  if (f.includes("/api/")) return "API";
  if (f.includes("/exporters/")) return "EXPORTER";
  if (f.includes("store.")) return "STORE";
  if (f.includes("/lib/")) return "LIB";

  if (
    f.endsWith(".json") ||
    f.includes("config") ||
    f.includes("tsconfig")
  ) {
    return "CONFIG";
  }

  return "OTHER";
}

function detectArea(
  file: string,
  platform: Platform
): string {
  const f = searchable(file);

  if (f.includes("kalkulation")) return "Kalkulation";

  if (
    f.includes("mengenermittlung") ||
    f.includes("aufmass") ||
    f.includes("aufmaß")
  ) {
    return "Mengenermittlung";
  }

  if (
    f.includes("cad") ||
    f.includes("dxf") ||
    f.includes("dwg")
  ) {
    return "CAD / Geo";
  }

  if (
    f.includes("buchhaltung") ||
    f.includes("rechnung")
  ) {
    return "Buchhaltung / Abrechnung";
  }

  if (
    f.includes("buro") ||
    f.includes("buero") ||
    f.includes("verwaltung")
  ) {
    return "Büro / Verwaltung";
  }

  if (f.includes("regie")) return "Regie";
  if (f.includes("lieferschein")) return "Lieferschein";
  if (f.includes("arbeitszeit")) return "Arbeitszeiten";

  if (
    f.includes("tagesbericht") ||
    f.includes("bautagebuch")
  ) {
    return "Bautagebuch / Tagesbericht";
  }

  if (
    f.includes("foto") ||
    f.includes("photo")
  ) {
    return "Fotos / Dokumentation";
  }

  if (
    f.includes("license") ||
    f.includes("lizenz")
  ) {
    return "Lizenzen";
  }

  if (
    f.includes("platform admin") ||
    f.includes("platformadmin")
  ) {
    return "Platform Admin";
  }

  if (
    f.includes("support") ||
    f.includes("copilot")
  ) {
    return "RLC Copilot / Support";
  }

  if (
    f.includes("auth") ||
    f.includes("login")
  ) {
    return "Authentifizierung";
  }

  if (
    f.includes("project") ||
    f.includes("projekt")
  ) {
    return "Projekte";
  }

  return platform === "WEB"
    ? "Web"
    : platform === "MOBILE"
      ? "Mobile"
      : "Server";
}

function extractRoutes(text: string): string[] {
  const found = new Set<string>();

  const patterns = [
    /path\s*=\s*["'`]([^"'`]+)["'`]/g,
    /\.(?:get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    /(?:fetch|apiUrl|getApiUrl)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    /["'`](\/api\/[^"'`\s]+)["'`]/g,
    /navigation\.navigate\s*\(\s*["'`]([^"'`]+)["'`]/g,
  ];

  for (const rx of patterns) {
    let m: RegExpExecArray | null;

    while ((m = rx.exec(text))) {
      const value = norm(m[1]);
      if (value) found.add(value);
    }
  }

  return Array.from(found).slice(0, 100);
}

function extractSymbols(text: string): string[] {
  const found = new Set<string>();

  const patterns = [
    /(?:export\s+)?(?:default\s+)?function\s+([A-Za-z0-9_$]+)/g,
    /(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=/g,
    /class\s+([A-Za-z0-9_$]+)/g,
    /interface\s+([A-Za-z0-9_$]+)/g,
    /type\s+([A-Za-z0-9_$]+)\s*=/g,
  ];

  for (const rx of patterns) {
    let m: RegExpExecArray | null;

    while ((m = rx.exec(text))) {
      found.add(m[1]);
    }
  }

  return Array.from(found).slice(0, 120);
}

function extractUiLabels(text: string): string[] {
  const found = new Set<string>();

  const patterns = [
    />\s*([^<>{}\n]{3,80})\s*</g,
    /\b(?:title|label|placeholder|headerTitle)\s*[:=]\s*["'`]([^"'`\n]{3,100})["'`]/g,
    /\b(?:Alert\.alert|setTitle)\s*\(\s*["'`]([^"'`\n]{3,100})["'`]/g,
  ];

  for (const rx of patterns) {
    let m: RegExpExecArray | null;

    while ((m = rx.exec(text))) {
      const value = norm(m[1]);

      if (
        value &&
        !value.includes("${") &&
        /[A-Za-zÄÖÜäöüß]/.test(value)
      ) {
        found.add(value);
      }
    }
  }

  return Array.from(found).slice(0, 100);
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      terms(value).filter((x) => x.length >= 3)
    )
  ).slice(0, 260);
}

function chunkFile(
  platform: Platform,
  file: string,
  text: string
): IndexChunk[] {
  const rel = relativeFile(file);
  const fileName = path.basename(file);
  const fileStem = path.basename(file, path.extname(file));

  const kind = detectKind(rel, platform);
  const area = detectArea(rel, platform);

  const routes = extractRoutes(text);
  const symbols = extractSymbols(text);
  const uiLabels = extractUiLabels(text);

  const pathTerms = terms(
    rel
      .split("/")
      .slice(0, -1)
      .join(" ")
  );

  const nameTerms = terms(fileStem);

  const lines = text.replace(/\r/g, "").split("\n");
  const chunks: IndexChunk[] = [];

  let start = 0;

  while (start < lines.length) {
    let end = start;
    let size = 0;

    while (end < lines.length) {
      const nextSize = size + lines[end].length + 1;

      if (
        nextSize > MAX_CHUNK_CHARS &&
        end > start
      ) {
        break;
      }

      size = nextSize;
      end += 1;
    }

    const body = lines
      .slice(start, end)
      .join("\n")
      .trim();

    if (body.length >= 80) {
      const localSymbols = extractSymbols(body);
      const localRoutes = extractRoutes(body);
      const localLabels = extractUiLabels(body);

      const title =
        localSymbols[0] ||
        localLabels[0] ||
        fileStem ||
        area;

      const keywordText = [
        platform,
        kind,
        rel,
        fileName,
        fileStem,
        area,
        title,
        ...pathTerms,
        ...nameTerms,
        ...symbols,
        ...routes,
        ...uiLabels,
        ...localSymbols,
        ...localRoutes,
        ...localLabels,
        body.slice(0, 3500),
      ].join(" ");

      chunks.push({
        id: hash(`${rel}:${start}:${end}:${body}`),
        platform,
        kind,
        file: rel,
        fileName,
        fileStem,
        area,
        title,
        pathTerms,
        nameTerms,
        uiLabels: localLabels.length
          ? localLabels
          : uiLabels.slice(0, 30),
        symbols: localSymbols.length
          ? localSymbols
          : symbols.slice(0, 30),
        routes: localRoutes.length
          ? localRoutes
          : routes.slice(0, 30),
        keywords: tokenize(keywordText),
        content: body,
      });
    }

    if (end >= lines.length) break;

    start = Math.max(
      end - CHUNK_OVERLAP_LINES,
      start + 1
    );
  }

  return chunks;
}

function main() {
  const allChunks: IndexChunk[] = [];
  let fileCount = 0;

  for (const source of SOURCE_ROOTS) {
    const files = walk(source.root);

    for (const file of files) {
      let text = "";

      try {
        text = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }

      if (!text.trim()) continue;

      fileCount += 1;

      allChunks.push(
        ...chunkFile(
          source.platform,
          file,
          text
        )
      );
    }
  }

  const stats = {
    files: fileCount,
    chunks: allChunks.length,
    web: allChunks.filter(
      (x) => x.platform === "WEB"
    ).length,
    mobile: allChunks.filter(
      (x) => x.platform === "MOBILE"
    ).length,
    server: allChunks.filter(
      (x) => x.platform === "SERVER"
    ).length,
  };

  const index: SoftwareIndex = {
    version: "RLC-SOFTWARE-INTELLIGENCE-V2",
    generatedAt: new Date().toISOString(),
    repository: "RLC Bausoftware",
    stats,
    chunks: allChunks,
  };

  fs.mkdirSync(
    path.dirname(OUTPUT_FILE),
    { recursive: true }
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(index, null, 2),
    "utf8"
  );

  console.log("=== RLC SOFTWARE INTELLIGENCE INDEX V2 ===");
  console.log(`Repository: ${REPO_ROOT}`);
  console.log(`Files:      ${stats.files}`);
  console.log(`Chunks:     ${stats.chunks}`);
  console.log(`Web:        ${stats.web}`);
  console.log(`Mobile:     ${stats.mobile}`);
  console.log(`Server:     ${stats.server}`);
  console.log(`Output:     ${OUTPUT_FILE}`);
}

main();