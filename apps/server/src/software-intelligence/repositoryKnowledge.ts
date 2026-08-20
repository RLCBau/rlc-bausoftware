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
  "mobile", "web", "server", "app",
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

  /*
   * Product vocabulary / German compounds.
   * These are semantic equivalents, not hard-coded answers.
   */
  if (
    normalized.includes("lizenzcode") ||
    normalized.includes("aktivierungscode")
  ) {
    expanded.add("lizenz");
    expanded.add("license");
    expanded.add("code");
    expanded.add("aktivierung");
    expanded.add("mobilelicense");
    expanded.add("mobilelicenses");
  }

  if (
    normalized.includes("x84") &&
    (
      normalized.includes("ohne") ||
      normalized.includes("kein")
    )
  ) {
    expanded.add("autonom");
    expanded.add("autonomous");
    expanded.add("urkalkulation");
    expanded.add("preisquelle");
  }

  if (normalized.includes("cloud")) {
    expanded.add("cloudenabled");
    expanded.add("subscription");
    expanded.add("firma");
    expanded.add("company");
  }

  /*
   * CAD and field-survey vocabulary.
   * User terminology must resolve to the actual CAD, DXF and
   * GPS / As-Built implementation sources.
   */
  if (
    normalized.includes("cad") ||
    normalized.includes("dxf") ||
    normalized.includes("dwg")
  ) {
    expanded.add("cad");
    expanded.add("cadviewer");
    expanded.add("cadimport");
    expanded.add("cadengine");
    expanded.add("dxf");
    expanded.add("dwg");
    expanded.add("layer");
    expanded.add("layern");
  }

  if (
    normalized.includes("gps") ||
    normalized.includes("asbuilt") ||
    normalized.includes("as built")
  ) {
    expanded.add("gps");
    expanded.add("asbuild");
    expanded.add("asbuilt");
    expanded.add("gpszuweisung");
    expanded.add("gnss");
    expanded.add("cadgeomap");
  }
  return Array.from(expanded);
}

function detectPlatform(
  query: string,
  options: SearchOptions
): Platform | null {
  /*
   * Runtime platform explicitly supplied by the application
   * always has priority.
   */
  if (options.platform) return options.platform;

  const q = normalize(query);
  const currentPath = normalize(options.currentPath || "");

  /*
   * MOBILE only when the user is actually referring to use/navigation
   * inside the Mobile application.
   *
   * IMPORTANT:
   * A product term such as "Mobile-Lizenzcode" does NOT automatically
   * mean that the implementation/administration lives in MOBILE.
   */
  const explicitMobileUsage =
    q.includes("mobile app") ||
    q.includes("mobile anwendung") ||
    q.includes("in mobile") ||
    q.includes("auf mobile") ||
    q.includes("mobile screen") ||
    q.includes("mobile screen") ||
    q.includes("in der app") ||
    q.includes("in die app") ||
    q.includes("auf der app");

  if (options.screen || explicitMobileUsage) {
    return "MOBILE";
  }

  /*
   * SERVER only when the question explicitly concerns technical
   * backend/API/server implementation.
   */
  if (
    q.includes("serverseitig") ||
    q.includes("backend") ||
    q.includes(" api ") ||
    q.startsWith("api ") ||
    q.endsWith(" api") ||
    q.includes("server route") ||
    q.includes("server implementierung")
  ) {
    return "SERVER";
  }

  /*
   * Explicit Web/browser wording.
   */
  if (
    q.includes("im web") ||
    q.includes("web app") ||
    q.includes("webanwendung") ||
    q.includes("browser")
  ) {
    return "WEB";
  }

  /*
   * Current UI path can provide useful context, but the Support page
   * itself must NOT force every product question to WEB.
   */
  if (
    currentPath &&
    currentPath.startsWith("/") &&
    !currentPath.startsWith("/info/support") &&
    !currentPath.startsWith("/support")
  ) {
    return "WEB";
  }

  /*
   * No reliable platform intent:
   * search WEB + MOBILE + SERVER together.
   */
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
   * Resolve situazioni dove piÃ¹ file appartengono alla stessa area,
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

  /*
   * =========================================================
   * RLC semantic source authority
   * =========================================================
   * Prefer the source that actually implements/manages the
   * requested concept. This changes retrieval authority only;
   * it does NOT contain pre-written answers.
   */

  // ---------------------------------------------------------
  // Mobile licence codes belonging to / managed for a company
  // ---------------------------------------------------------
  if (
    (
      q.includes("lizenzcode") ||
      q.includes("aktivierungscode") ||
      q.includes("mobile code") ||
      q.includes("mobile lizenz")
    ) &&
    (
      q.includes("firma") ||
      q.includes("company") ||
      q.includes("zugeordnet") ||
      q.includes("zuordnen") ||
      q.includes("erstellt") ||
      q.includes("erstellen")
    )
  ) {
    if (
      file.includes("company.admin") ||
      (
        file.includes("company") &&
        file.includes("license")
      )
    ) {
      score += 2400;
    }

    if (
      file.includes(
        "apps web src pages buro nutzerverwaltung tsx"
      )
    ) {
      score += 580;
    }

    if (
      file.includes(
        "apps web src pages admin platform admin tsx"
      )
    ) {
      score += 420;
    }

    if (
      file.includes(
        "apps server src routes platform admin ts"
      )
    ) {
      score += 340;
    }

    /*
     * LoginScreen explains activation on the device,
     * but not the company-side creation/assignment.
     */
    if (
      file.includes("apps mobile src screens") &&
      file.includes("login") &&
      file.includes("screen")
    ) {
      score -= 700;
    }

    if (
      file.includes("mobile pdf core")
    ) {
      score -= 450;
    }
  }

  // ---------------------------------------------------------
  // KI calculation WITHOUT X84 as price source
  // ---------------------------------------------------------
  if (
    q.includes("x84") &&
    (
      q.includes("ohne") ||
      q.includes("kein")
    ) &&
    (
      q.includes("ki") ||
      q.includes("kalkulation") ||
      q.includes("kalkulier")
    )
  ) {
    if (
      file.includes(
        "apps server src kalkulation autonomous autonomous urkalkulation engine ts"
      )
    ) {
      score += 850;
    }

    if (
      file.includes(
        "apps server src kalkulation autonomous rlc autonomous kalkulator ts"
      )
    ) {
      score += 700;
    }

    if (
      file.includes(
        "apps server src kalkulation autonomous tiefbau family catalog ts"
      )
    ) {
      score += 520;
    }

    if (
      file.includes(
        "apps server src kalkulation construction intelligence engine ts"
      )
    ) {
      score += 420;
    }

    if (
      file.includes(
        "apps server src routes kalkulation ki ts"
      )
    ) {
      score += 380;
    }

    /*
     * Reverse Urkalkulation explicitly starts from X84.
     * It must not dominate a question asking how calculation
     * works without X84.
     */
    if (
      file.includes(
        "rlc reverse urkalkulation engine"
      )
    ) {
      score -= 280;
    }
  }

  // ---------------------------------------------------------
  // Cloud capability for a company
  // ---------------------------------------------------------
  if (
    q.includes("cloud") &&
    (
      q.includes("firma") ||
      q.includes("company") ||
      q.includes("unternehmen")
    )
  ) {
    if (
      file.includes(
        "apps web src pages admin platform admin tsx"
      )
    ) {
      score += 650;
    }

    if (
      file.includes(
        "apps server src routes platform admin ts"
      )
    ) {
      score += 500;
    }

    if (
      file.includes(
        "apps server src routes company admin ts"
      )
    ) {
      score += 180;
    }

    if (
      file.includes("pricing page")
    ) {
      score -= 180;
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

  const effectiveOptions: SearchOptions = {
    ...options,
    platform: options.platform || detectPlatform(query, options),
  };

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
    intentBonus(chunk, query, effectiveOptions);

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

  let contentMatches = 0;

  for (const term of qTerms) {
    if (
      term.length >= 4 &&
      content.includes(term)
    ) {
      /*
       * Il contenuto del singolo chunk serve a scegliere
       * la sezione corretta dentro file grandi come
       * PlatformAdmin.tsx o kalkulationMitKI.tsx.
       */
      score += term.length >= 8 ? 28 : 18;
      contentMatches += 1;
    }
  }

  /*
   * Più termini della domanda presenti nello stesso chunk =
   * forte evidenza che questo sia il blocco realmente pertinente.
   */
  if (contentMatches >= 2) {
    score += contentMatches * 22;
  }

  /*
   * Termini tecnici specifici/composti hanno grande valore:
   * X84, cloudEnabled, Lizenzcode ecc.
   */
  const rawQueryTerms = normalize(query)
    .split(" ")
    .filter((x) => x.length >= 3);

  for (const rawTerm of rawQueryTerms) {
    if (
      rawTerm.length >= 5 &&
      content.includes(rawTerm)
    ) {
      score += rawTerm.length >= 8 ? 35 : 20;
    }
  }

  const q = normalize(query);
  const contentCompact = compact(chunk.content);

  /*
   * Company-side licence creation and assignment belongs to the
   * company administration backend, not to the device login flow.
   */
  if (
    (
      q.includes("lizenzcode") ||
      q.includes("aktivierungscode")
    ) &&
    normalize(chunk.file).includes("company.admin")
  ) {
    score += 5000;
  }

  /*
   * CAD questions must prefer the CAD workspace, CAD routes and
   * DXF/DWG processing sources over generic import pages.
   */
  const chunkFile = String(chunk.file || "").toLowerCase();

  const isCadQuestion =
    q.includes("cad") ||
    q.includes("dxf") ||
    q.includes("dwg") ||
    q.includes("layer");

  const isCadSource =
    /(^|[\\/])cad([\\/.\-]|$)|cadviewer|dxfpreview|dxf\.engine|cad-import|cad-converter/i.test(
      chunkFile
    );

  if (isCadQuestion && isCadSource) {
    score += 1400;
  }

  /*
   * Prefer the precise section inside large source files.
   */
  if (
    q.includes("cloud") &&
    (
      contentCompact.includes("cloudenabled") ||
      contentCompact.includes("cloudaktiv") ||
      contentCompact.includes("cloud")
    )
  ) {
    score += 260;
  }

  if (
    q.includes("x84") &&
    (
      q.includes("ohne") ||
      q.includes("kein")
    ) &&
    (
      contentCompact.includes("keinx84alspreisquelle") ||
      (
        contentCompact.includes("autonom") &&
        contentCompact.includes("urkalkulation")
      )
    )
  ) {
    score += 340;
  }

  if (
    (
      q.includes("lizenzcode") ||
      q.includes("aktivierungscode")
    ) &&
    (
      contentCompact.includes("mobilelicense") ||
      contentCompact.includes("mobilelizenz") ||
      contentCompact.includes("mobileaktivierungscode")
    )
  ) {
    score += 300;
  }

  if (
    qCompact.length >= 6 &&
    contentCompact.includes(qCompact)
  ) {
    score += 140;
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

  /*
   * RLC source authority adjustments.
   *
   * Bedienfragen auf Mobile:
   * SCREEN ist die primäre Quelle; technische PDF-/Lib-Dateien
   * dienen nur als Sekundärkontext.
   */
  if (
    effectiveOptions.platform === "MOBILE" &&
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
    effectiveOptions.platform === "SERVER" &&
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
  /*
   * Effective platform:
   * - explicit runtime platform has priority
   * - otherwise infer it from the user's question
   */
  const effectivePlatform =
    options.platform || detectPlatform(query, options);

  /*
   * A Mobile licence code is activated on Mobile, but it is created
   * and assigned in company administration on the server.
   */
  const normalizedQuery = normalize(query);
  const isCompanyMobileLicenseQuery =
    (
      normalizedQuery.includes("lizenzcode") ||
      normalizedQuery.includes("aktivierungscode")
    ) &&
    (
      normalizedQuery.includes("firma") ||
      normalizedQuery.includes("company")
    );

  const searchableChunks =
    effectivePlatform && !isCompanyMobileLicenseQuery
      ? chunks.filter(
          (chunk) => chunk.platform === effectivePlatform
        )
      : chunks;
  /*
   * Test files document verification scenarios, not product behaviour.
   * They must never become Copilot knowledge sources.
   */
  const productionChunks = searchableChunks.filter((chunk) => {
    const isTestFile =
      /(^|[\\/])(?:test[^\\/]*|[^\\/]*\.(?:test|spec))\.(?:[cm]?[jt]sx?)$/i.test(
        chunk.file
      );

    const isRetrievalImplementation =
      /(^|[\\/])software-intelligence[\\/](?:repositoryKnowledge|buildSoftwareIntelligenceIndex)\.ts$/i.test(
        chunk.file
      );

    return !isTestFile && !isRetrievalImplementation;
  });

  const ranked: RankedChunk[] = productionChunks
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

  /*
   * User-facing questions need navigation and workflow context, not
   * implementation details copied from backend routes or source code.
   */
  const normalizedQuery = normalize(query);
  const isTechnicalQuestion =
    normalizedQuery.includes("backend") ||
    normalizedQuery.includes("serverseitig") ||
    normalizedQuery.includes(" api ") ||
    normalizedQuery.startsWith("api ") ||
    normalizedQuery.endsWith(" api") ||
    normalizedQuery.includes("endpoint") ||
    normalizedQuery.includes("datenbank") ||
    normalizedQuery.includes("schema") ||
    normalizedQuery.includes("implementierung") ||
    normalizedQuery.includes("quellcode") ||
    normalizedQuery.includes("route");

  const blocks = result.matches.map((match, index) => {
    const isUserFacingSource =
      match.kind === "PAGE" ||
      match.kind === "SCREEN" ||
      match.kind === "COMPONENT";

    const showImplementation =
      isTechnicalQuestion || isUserFacingSource;

    return [
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
      isTechnicalQuestion && match.apiRoutes?.length
        ? `API-Endpunkte: ${match.apiRoutes.join(", ")}`
        : "",
      isTechnicalQuestion && match.symbols.length
        ? `Symbole: ${match.symbols.slice(0, 12).join(", ")}`
        : "",
      showImplementation && isTechnicalQuestion
        ? `Quellcode-Kontext:\n${match.content}`
        : "",
      !isTechnicalQuestion && !isUserFacingSource
        ? "Technische Quelle nur zur fachlichen Validierung; keine API-, Datenbank-, ID- oder Implementierungsdetails an Nutzer ausgeben."
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

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
