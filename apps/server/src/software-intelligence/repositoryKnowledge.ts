import index from "../generated/software-intelligence-index.json";

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
  kind?: SourceKind;
  file: string;
  fileName?: string;
  fileStem?: string;
  area: string;
  title: string;
  pathTerms?: string[];
  nameTerms?: string[];
  uiLabels?: string[];
  symbols?: string[];
  routes?: string[];
  keywords?: string[];
  content: string;
};

type SearchOptions = {
  platform?: Platform | null;
  currentPath?: string | null;
  screen?: string | null;
  limit?: number;
};

type RankedChunk = IndexChunk & {
  score: number;
};

const softwareIndex = index as {
  version?: string;
  generatedAt?: string;
  stats?: Record<string, number>;
  chunks?: IndexChunk[];
};

const STOP_WORDS = new Set([
  "der", "die", "das", "den", "dem", "des",
  "ein", "eine", "einer", "einen", "einem",
  "und", "oder", "aber", "mit", "von", "auf",
  "im", "in", "an", "am", "zu", "zum", "zur",
  "ist", "sind", "war", "wie", "wo", "was",
  "welche", "welcher", "welches",
  "ich", "du", "mir", "mich", "mein", "meine",
  "finde", "finden", "funktioniert", "funktion",
  "kann", "kannst", "bitte", "zeige", "zeig",
  "oeffne", "offne",
]);

function normalize(value: unknown): string {
  return String(value ?? "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "ae")
    .replace(/Ö/g, "oe")
    .replace(/Ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./\\-]+/g, " ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: unknown): string {
  return normalize(value).replace(/\s+/g, "");
}

function singularLike(value: string): string[] {
  const n = normalize(value);
  const out = new Set<string>([n]);

  if (n.endsWith("en") && n.length > 5) out.add(n.slice(0, -2));
  if (n.endsWith("er") && n.length > 5) out.add(n.slice(0, -2));
  if (n.endsWith("e") && n.length > 4) out.add(n.slice(0, -1));
  if (n.endsWith("s") && n.length > 4) out.add(n.slice(0, -1));

  return Array.from(out);
}

function tokens(value: unknown): string[] {
  const normalized = normalize(value);

  const raw = normalized
    .split(" ")
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
    .filter((x) => !STOP_WORDS.has(x));

  const expanded = new Set<string>();

  for (const token of raw) {
    for (const variant of singularLike(token)) {
      expanded.add(variant);
    }
  }

  /*
   * RLC terminology aliases.
   * These are vocabulary equivalents, not hard-coded answers.
   */
  if (normalized.includes("lizenzverwaltung")) {
    expanded.add("lizenz");
    expanded.add("nutzerverwaltung");
    expanded.add("rechte");
    expanded.add("berechtigungen");
  }

  if (normalized.includes("eingangspruefung")) {
    expanded.add("eingang");
    expanded.add("pruefung");
  }

  if (normalized.includes("bautagesbericht")) {
    expanded.add("bautagebuch");
    expanded.add("tagesbericht");
  }

  if (normalized.includes("mengenermittlung")) {
    expanded.add("mengen");
    expanded.add("menge");
  }

  return Array.from(expanded);
}

function detectPlatform(
  query: string,
  options: SearchOptions
): Platform | null {
  if (options.platform) return options.platform;

  const q = normalize(query);

  if (
    q.includes("mobile") ||
    q.includes("app") ||
    options.screen
  ) {
    return "MOBILE";
  }

  if (
    q.includes("web") ||
    q.includes("browser") ||
    String(options.currentPath || "").startsWith("/")
  ) {
    return "WEB";
  }

  if (
    q.includes("server") ||
    q.includes("backend") ||
    q.includes("api")
  ) {
    return "SERVER";
  }

  return null;
}

function similarity(term: string, candidate: string): number {
  const t = compact(term);
  const c = compact(candidate);

  if (!t || !c) return 0;
  if (t === c) return 1;

  if (t.length >= 4 && c.includes(t)) return 0.9;
  if (c.length >= 4 && t.includes(c)) return 0.82;

  const min = Math.min(t.length, c.length);
  let prefix = 0;

  while (
    prefix < min &&
    t[prefix] === c[prefix]
  ) {
    prefix++;
  }

  if (prefix >= 5) return 0.7;
  if (prefix >= 4) return 0.55;

  return 0;
}

function bestMatch(
  term: string,
  values: unknown[]
): number {
  let best = 0;

  for (const value of values) {
    const s = similarity(term, String(value ?? ""));
    if (s > best) best = s;
  }

  return best;
}

function kindBonus(kind: SourceKind | undefined): number {
  switch (kind) {
    case "SCREEN":
      return 45;
    case "PAGE":
      return 42;
    case "ROUTE":
      return 38;
    case "SERVICE":
      return 24;
    case "API":
      return 22;
    case "EXPORTER":
      return 16;
    case "COMPONENT":
      return 12;
    case "STORE":
      return 10;
    case "LIB":
      return 5;
    case "CONFIG":
      return -25;
    default:
      return 0;
  }
}

function intentBonus(
  chunk: IndexChunk,
  query: string,
  options: SearchOptions
): number {
  const q = normalize(query);
  const file = normalize(chunk.file);
  let score = 0;

  const navigationOrUsage =
    q.includes("wo finde") ||
    q.includes("wie funktioniert") ||
    q.includes("wie erfasse") ||
    q.includes("wie bearbeite") ||
    q.includes("wie verwalte") ||
    q.includes("wie sehe");

  const technical =
    q.includes("api") ||
    q.includes("backend") ||
    q.includes("server");

  if (navigationOrUsage) {
    if (chunk.kind === "SCREEN") score += 140;
    if (chunk.kind === "PAGE") score += 120;

    if (
      chunk.kind === "LIB" ||
      chunk.kind === "EXPORTER" ||
      chunk.kind === "CONFIG"
    ) {
      score -= 80;
    }
  }

  if (technical) {
    if (chunk.kind === "ROUTE") score += 140;
    if (chunk.kind === "SERVICE") score += 90;
    if (chunk.kind === "API") score += 80;

    if (
      chunk.kind === "PAGE" ||
      chunk.kind === "SCREEN"
    ) {
      score -= 60;
    }
  }

  /*
   * "verwalten" in the Web product refers primarily to Büro/Verwaltung,
   * not the mirrored Mobile inbox pages.
   */
  if (
    options.platform === "WEB" &&
    q.includes("verwalte")
  ) {
    if (file.includes("apps web src pages buro")) score += 120;
    if (file.includes("apps web src pages mobile")) score -= 100;
  }

  /*
   * For licence checks on the server, licence routes/middleware
   * are structurally more authoritative than unrelated routes.
   */
  if (
    options.platform === "SERVER" &&
    (q.includes("lizenz") || q.includes("license"))
  ) {
    if (file.includes("license")) score += 150;
    if (chunk.area === "Lizenzen") score += 100;
  }

  /*
   * Canonical product intent.
   * Resolve situazioni dove più file appartengono alla stessa area,
   * ma uno rappresenta il punto operativo principale richiesto.
   */

  // Projekt öffnen / erstellen -> Start-Projektverwaltung
  if (
    options.platform === "WEB" &&
    q.includes("projekt") &&
    (
      q.includes("erstelle") ||
      q.includes("erstellen") ||
      q.includes("oeffne") ||
      q.includes("offne")
    )
  ) {
    if (file.includes("apps web src pages start project tsx")) {
      score += 320;
    }

    if (file.includes("apps web src pages buro projekte tsx")) {
      score -= 100;
    }

    if (file.includes("apps web src pages kalkulation project tsx")) {
      score -= 80;
    }
  }

  // Kalkulations-Rezepte
  if (
    options.platform === "WEB" &&
    (
      q.includes("rezepte") ||
      q.includes("rezept")
    )
  ) {
    if (file.includes("apps web src pages kalkulation recipes tsx")) {
      score += 420;
    }
  }

  // Haupteinstieg CAD
  if (
    options.platform === "WEB" &&
    (
      q === "cad" ||
      q.includes("finde ich cad") ||
      q.includes("cad viewer")
    )
  ) {
    if (file.includes("apps web src pages cad cadviewer tsx")) {
      score += 420;
    }
  }

  // Passwort anzeigen gehört zur Anmeldung
  if (
    options.platform === "WEB" &&
    q.includes("passwort") &&
    (
      q.includes("anzeigen") ||
      q.includes("ausblenden") ||
      q.includes("sichtbar")
    )
  ) {
    if (file.includes("apps web src pages auth login tsx")) {
      score += 500;
    }
  }

  // Mobile Projektübersicht innerhalb eines geöffneten Projektes
  if (
    options.platform === "MOBILE" &&
    q.includes("projekt") &&
    (
      q.includes("uebersicht") ||
      q.includes("projektuebersicht")
    )
  ) {
    if (file.includes("apps mobile src screens project home screen tsx")) {
      score += 750;
    }

    if (file.includes("apps mobile src screens projects screen tsx")) {
      score -= 120;
    }
  }

  return score;
}

function scoreChunk(
  chunk: IndexChunk,
  query: string,
  options: SearchOptions
): number {
  const qTerms = tokens(query);
  const qCompact = compact(query);

  const fileStem = chunk.fileStem || "";
  const fileName = chunk.fileName || "";
  const pathTerms = chunk.pathTerms || [];
  const nameTerms = chunk.nameTerms || [];
  const uiLabels = chunk.uiLabels || [];
  const symbols = chunk.symbols || [];
  const routes = chunk.routes || [];
  const keywords = chunk.keywords || [];

  let score =
    kindBonus(chunk.kind) +
    intentBonus(chunk, query, options);

  /*
   * Exact/compound match on the real source name is the strongest
   * generic signal: AufmassEditor -> Aufmaßeditor,
   * EingangPruefungScreen -> Eingangsprüfung, etc.
   */
  const stemCompact = compact(fileStem);
  if (
    qCompact.length >= 5 &&
    stemCompact.length >= 4
  ) {
    if (qCompact.includes(stemCompact)) score += 150;
    if (stemCompact.includes(qCompact)) score += 150;
  }

  for (const term of qTerms) {
    score += bestMatch(term, [fileStem]) * 100;
    score += bestMatch(term, [fileName]) * 80;
    score += bestMatch(term, nameTerms) * 75;
    score += bestMatch(term, pathTerms) * 42;
    score += bestMatch(term, [chunk.area]) * 38;
    score += bestMatch(term, [chunk.title]) * 48;
    score += bestMatch(term, uiLabels) * 65;
    score += bestMatch(term, symbols) * 48;
    score += bestMatch(term, routes) * 52;
    score += bestMatch(term, keywords) * 16;
  }

  /*
   * Phrase/compound search in UI and source metadata.
   */
  const metadataCompact = compact([
    fileStem,
    fileName,
    chunk.area,
    chunk.title,
    ...pathTerms,
    ...nameTerms,
    ...uiLabels,
    ...symbols,
    ...routes,
  ].join(" "));

  if (
    qCompact.length >= 6 &&
    metadataCompact.includes(qCompact)
  ) {
    score += 180;
  }

  /*
   * Content is useful, but intentionally much weaker than structural
   * metadata so giant generic files cannot dominate.
   */
  const content = normalize(chunk.content);

  for (const term of qTerms) {
    if (
      term.length >= 4 &&
      content.includes(term)
    ) {
      score += 3;
    }
  }

  const platform = detectPlatform(query, options);

  if (platform && chunk.platform === platform) {
    score += 60;
  }

  const currentPath = normalize(options.currentPath);

  if (currentPath) {
    const currentCompact = compact(currentPath);

    if (
      routes.some((route) => {
        const r = compact(route);
        return (
          r.includes(currentCompact) ||
          currentCompact.includes(r)
        );
      })
    ) {
      score += 70;
    }

    if (
      compact(chunk.file).includes(currentCompact)
    ) {
      score += 35;
    }
  }

  const screen = normalize(options.screen);

  if (screen) {
    const screenCompact = compact(screen);

    if (
      compact(fileStem).includes(screenCompact) ||
      compact(chunk.title).includes(screenCompact) ||
      symbols.some((x) =>
        compact(x).includes(screenCompact)
      )
    ) {
      score += 90;
    }
  }

  const file = normalize(chunk.file);
  const q = normalize(query);

  /*
   * RLC source authority adjustments.
   *
   * Bedienfragen auf Mobile:
   * SCREEN ist die primäre Quelle; technische PDF-/Lib-Dateien
   * dienen nur als Sekundärkontext.
   */
  if (
    options.platform === "MOBILE" &&
    (
      q.includes("wie funktioniert") ||
      q.includes("wie erfasse") ||
      q.includes("wie bearbeite") ||
      q.includes("wie sehe")
    )
  ) {
    if (chunk.kind === "SCREEN") score += 180;

    if (
      chunk.kind === "LIB" ||
      chunk.kind === "EXPORTER"
    ) {
      score -= 120;
    }
  }

  /*
   * Generische Lizenzprüfung auf Server:
   * Core-Route/Middleware/Library haben Vorrang vor
   * firmenspezifischer Mobile-Lizenzverwaltung.
   */
  if (
    options.platform === "SERVER" &&
    (
      q.includes("lizenzpruefung") ||
      q.includes("lizenz pruefung") ||
      q.includes("license check") ||
      q.includes("lizenz")
    )
  ) {
    if (
      file.includes("routes license ts") ||
      file.includes("middleware license ts") ||
      file.includes("lib license ts")
    ) {
      score += 220;
    }

    if (
      file.includes("company mobile licenses")
    ) {
      score -= 80;
    }
  }

  /*
   * Generic support/config files are secondary unless directly asked.
   */


  if (
    chunk.kind === "CONFIG" &&
    !q.includes("config")
  ) {
    score -= 50;
  }

  if (
    file.includes("rlckiassistant") &&
    !q.includes("copilot") &&
    !q.includes("assistant")
  ) {
    score -= 70;
  }

  if (
    file.includes("faq") &&
    !q.includes("faq")
  ) {
    score -= 45;
  }

  if (
    chunk.kind === "LIB" &&
    /(?:^|\/)api\.ts$/i.test(chunk.file)
  ) {
    score -= 30;
  }

  return Math.round(score);
}

export function retrieveSoftwareIntelligence(
  query: string,
  options: SearchOptions = {}
) {
  const chunks = Array.isArray(softwareIndex.chunks)
    ? softwareIndex.chunks
    : [];

  const limit = Math.max(
    1,
    Math.min(20, Number(options.limit || 10))
  );

  /*
   * When the runtime knows the platform, never mix another platform
   * into the primary answer.
   */
  const searchableChunks = options.platform
    ? chunks.filter(
        (chunk) => chunk.platform === options.platform
      )
    : chunks;

  const ranked: RankedChunk[] = searchableChunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(chunk, query, options),
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score);

  /*
   * Keep only the strongest chunk of each source file.
   */
  const files = new Set<string>();
  const unique: RankedChunk[] = [];

  for (const chunk of ranked) {
    if (files.has(chunk.file)) continue;

    files.add(chunk.file);
    unique.push(chunk);

    if (unique.length >= limit) break;
  }

  return {
    version: softwareIndex.version || "unknown",
    generatedAt: softwareIndex.generatedAt || null,
    stats: softwareIndex.stats || {},
    matches: unique.map((x) => ({
      score: x.score,
      platform: x.platform,
      kind: x.kind || "OTHER",
      area: x.area,
      title: x.title,
      file: x.file,
      fileStem: x.fileStem || "",
      routes: x.routes || [],
      uiRoutes: (x.routes || []).filter((r) => !String(r).startsWith("/api/")),
      apiRoutes: (x.routes || []).filter((r) => String(r).startsWith("/api/")),
      symbols: x.symbols || [],
      uiLabels: x.uiLabels || [],
      content: x.content.slice(0, 5000),
    })),
  };
}

export function formatSoftwareIntelligenceContext(
  query: string,
  options: SearchOptions = {}
): string {
  const result = retrieveSoftwareIntelligence(
    query,
    options
  );

  if (!result.matches.length) {
    return [
      "RLC SOFTWARE INTELLIGENCE",
      `Index-Version: ${result.version}`,
      "Keine ausreichend passende Stelle im aktuellen Repository-Index gefunden.",
      "WICHTIGE REGEL: Keine Softwarefunktion, Route oder Bedienfolge erfinden.",
    ].join("\n");
  }

  const blocks = result.matches.map(
    (match, index) =>
      [
        `### Treffer ${index + 1}`,
        `Score: ${match.score}`,
        `Plattform: ${match.platform}`,
        `Typ: ${match.kind}`,
        `Bereich: ${match.area}`,
        `Datei: ${match.file}`,
        `Quellname: ${match.fileStem}`,
        `Titel/Symbol: ${match.title}`,
        match.uiLabels.length
          ? `UI-Texte: ${match.uiLabels.slice(0, 12).join(" | ")}`
          : "",
        match.uiRoutes?.length
          ? `UI-Routen/Navigation: ${match.uiRoutes.join(", ")}`
          : "",
        match.apiRoutes?.length
          ? `API-Endpunkte (NICHT als Benutzer-Navigation verwenden): ${match.apiRoutes.join(", ")}`
          : "",
        match.symbols.length
          ? `Symbole: ${match.symbols.slice(0, 12).join(", ")}`
          : "",
        "Quellcode-Kontext:",
        match.content,
      ]
        .filter(Boolean)
        .join("\n")
  );

  return [
    "RLC SOFTWARE INTELLIGENCE",
    `Index-Version: ${result.version}`,
    `Index erzeugt: ${result.generatedAt || "unknown"}`,
    "",
    "VERBINDLICHE REGELN:",
    "- Die aktuelle Repository-Implementierung ist die primäre technische Wahrheit über RLC Bausoftware.",
    "- WEB, MOBILE, SERVER und PLATFORM ADMIN strikt unterscheiden.",
    "- PAGE, SCREEN und ROUTE sind für Bedien- und Navigationsfragen primäre Quellen.",
    "- UI-Texte, Routen und reale Quellnamen zur Erklärung des Bedienpfades verwenden.",
    "- Keine Route, Schaltfläche, Funktion oder Bedienfolge erfinden.",
    "- Bei nicht eindeutig belegbaren Aussagen ausdrücklich Unsicherheit nennen.",
    "",
    ...blocks,
  ].join("\n\n");
}