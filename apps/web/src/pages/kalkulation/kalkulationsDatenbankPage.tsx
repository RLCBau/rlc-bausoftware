// apps/web/src/pages/kalkulation/KalkulationsDatenbankPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

import { runRlcAction } from "../../lib/rlcProgress";
import { useNavigate } from "react-router-dom";
import { LV, type LVPos } from "./store.lv";
import { useProject } from "../../store/useProject";
import {
  KalkulationsDatenbank,
  type KalkulationsQuelle,
  type RisikoStufe,
  type KalkulationsRessource,
  type KalkulationsParameter,
  type KalkulationsKosten,
  type KalkulationsErfahrung,
} from "./kalkulationsDatenbank";

/* ================= TYPES ================= */

type FilterQuelle = "alle" | KalkulationsQuelle;
type FilterRisiko = "alle" | RisikoStufe;

type DbQualityFilter =
  | "alle"
  | "epFehlt"
  | "einheitFehlt"
  | "ressourcenFehlen"
  | "risikoHoch"
  | "confidenceNiedrig"
  | "dubletten";

type SortKey =
  | "updatedAt"
  | "posNr"
  | "kurztext"
  | "epNetto"
  | "gpNetto"
  | "verwendungen"
  | "confidence";

type ProjectLike = {
  id?: string;
  code?: string;
  number?: string;
  projektnummer?: string;
  name?: string;
  projectName?: string;
};

/* ================= CONSTANTS ================= */

const QUELLEN: FilterQuelle[] = [
  "alle",
  "manual",
  "ki",
  "rezept",
  "lv",
  "import",
  "nachtrag",
  "server",
];

const DB_LOAD_LIMIT = 200;
const DB_TABLE_LIMIT = 10;
const RISIKEN: FilterRisiko[] = [
  "alle",
  "niedrig",
  "mittel",
  "hoch",
  "kritisch",
];

const RESSOURCEN_TYPEN: Array<KalkulationsRessource["typ"]> = [
  "personal",
  "maschine",
  "material",
  "fremdleistung",
  "entsorgung",
  "sonstiges",
];

/* ================= HELPERS ================= */

function safeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `kdb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function n(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  const raw = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, "")
    .replace(",", ".");

  const parsed = typeof value === "number" ? value : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: unknown): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(n(value));
}

function num(value: unknown, digits = 2): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n(value));
}

function fmtDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function percent(value: unknown): string {
  return `${Math.round(n(value) * 100)} %`;
}

function norm(value: unknown): string {
  return String(value ?? "").toLowerCase().trim();
}

function downloadText(
  text: string,
  filename: string,
  type = "text/plain;charset=utf-8"
) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function getProject(projectCtx: any): ProjectLike | null {
  const p =
    projectCtx?.project ||
    projectCtx?.currentProject ||
    projectCtx?.selectedProject ||
    projectCtx?.current ||
    projectCtx;

  if (!p || typeof p !== "object") return null;
  return p as ProjectLike;
}

function getProjectCode(project: ProjectLike | null): string {
  return String(
    project?.code ||
      project?.number ||
      project?.projektnummer ||
      project?.id ||
      ""
  ).trim();
}

function getProjectName(project: ProjectLike | null): string {
  return String(project?.name || project?.projectName || "").trim();
}

function quelleLabel(q: string): string {
  if (q === "ki") return "KI";
  if (q === "manual") return "Manuell";
  if (q === "rezept") return "Rezept";
  if (q === "lv") return "LV";
  if (q === "import") return "Import";
  if (q === "nachtrag") return "Nachtrag";
  if (q === "server") return "Server";
  return q;
}

function risikoLabel(r: string): string {
  if (r === "niedrig") return "Niedrig";
  if (r === "mittel") return "Mittel";
  if (r === "hoch") return "Hoch";
  if (r === "kritisch") return "Kritisch";
  return r;
}

function resourceTotal(r: Partial<KalkulationsRessource>): number {
  return round2(n(r.menge) * n(r.einzelpreis));
}

function normalizeResource(
  r: Partial<KalkulationsRessource>
): KalkulationsRessource {
  return {
    id: String(r.id || safeId()),
    typ: r.typ || "sonstiges",
    bezeichnung: String(r.bezeichnung || ""),
    kurztext: String(r.kurztext || ""),
    beschreibung: String(r.beschreibung || ""),
    einheit: String(r.einheit || ""),
    menge: n(r.menge),
    einzelpreis: n(r.einzelpreis),
    gesamtpreis: resourceTotal(r),
    leistungswert:
      r.leistungswert === undefined ? undefined : n(r.leistungswert),
    leistungsEinheit: String(r.leistungsEinheit || ""),
    bemerkung: String(r.bemerkung || ""),
  };
}

function emptyKosten(): KalkulationsKosten {
  return {
    material: 0,
    lohn: 0,
    maschinen: 0,
    fremdleistung: 0,
    entsorgung: 0,
    transport: 0,
    gemeinkosten: 0,
    risiko: 0,
    gewinn: 0,
    epNetto: 0,
    gpNetto: 0,
  };
}

function entryDirectCost(entry: KalkulationsErfahrung): number {
  const k = entry.kosten || emptyKosten();

  const kostenSum =
    n(k.material) +
    n(k.lohn) +
    n(k.maschinen) +
    n(k.fremdleistung) +
    n(k.entsorgung) +
    n(k.transport) +
    n(k.gemeinkosten) +
    n(k.risiko) +
    n(k.gewinn);

  if (kostenSum > 0) return round2(kostenSum);

  const resSum = (entry.ressourcen || []).reduce(
    (sum, r) => sum + n(r.gesamtpreis, n(r.menge) * n(r.einzelpreis)),
    0
  );

  return round2(resSum);
}

function entryEp(entry: KalkulationsErfahrung): number {
  const ep = n(entry.kosten?.epNetto);
  if (ep > 0) return ep;

  const gp = n(entry.kosten?.gpNetto);
  const menge = n(entry.menge);

  if (gp > 0 && menge > 0) return round2(gp / menge);

  const direct = entryDirectCost(entry);
  if (direct > 0 && menge > 0) return round2(direct / menge);

  return 0;
}

function entryGp(entry: KalkulationsErfahrung): number {
  const gp = n(entry.kosten?.gpNetto);
  if (gp > 0) return gp;

  const ep = entryEp(entry);
  const menge = n(entry.menge);

  if (ep > 0 && menge > 0) return round2(ep * menge);

  return 0;
}

function toLvPos(entry: KalkulationsErfahrung): LVPos {
  return {
    id: safeId(),
    posNr: entry.posNr,
    kurztext: entry.kurztext,
    langtext: entry.langtext,
    einheit: entry.einheit,
    menge: entry.menge,
    preis: entryEp(entry),
    gesamt: entryGp(entry),
    waehrung: "EUR",
    confidence: entry.confidence,
    source: "manual",
    updatedAt: new Date().toISOString(),
  } as unknown as LVPos;
}

function emptyEntry(
  projectCode: string,
  projectName: string
): KalkulationsErfahrung {
  return KalkulationsDatenbank.upsert({
    id: safeId(),
    quelle: "manual",
    projektCode: projectCode,
    projektName: projectName,
    posNr: "",
    kurztext: "",
    langtext: "",
    einheit: "m",
    menge: 0,
    parameter: {
      gewerk: "",
      leistungsart: "",
      bauverfahren: "",
      menge: 0,
      einheit: "m",
      baustellenEntfernungKm: 0,
      fahrzeitMin: 0,
      transportNotwendig: false,
      innerorts: false,
      beengterArbeitsraum: false,
      grundwasser: false,
      verkehrssicherung: false,
      handarbeit: false,
      nachtarbeit: false,
      erschwerteBedingungen: false,
    },
    ressourcen: [],
    kosten: emptyKosten(),
    risiko: "mittel",
    confidence: 0.75,
    kiHinweis: "",
    kalkulatorNotiz: "",
    tags: [],
    verwendungen: 0,
  });
}

function lvToEntry(
  row: LVPos,
  projektCode: string,
  projektName: string
): KalkulationsErfahrung {
  return KalkulationsDatenbank.fromCalculatedPosition({
    quelle: "lv",
    projektCode,
    projektName,
    posNr: row.posNr || "",
    kurztext: row.kurztext || "",
    langtext: row.langtext || "",
    einheit: row.einheit || "",
    menge: n(row.menge),
    finalUnitPrice: n(row.preis),
    totalNet: n(row.gesamt, n(row.menge) * n(row.preis)),
    confidence: n(row.confidence, 0.6),
  });
}

function riskStyle(risiko: RisikoStufe): React.CSSProperties {
  if (risiko === "niedrig") return badgeOk;
  if (risiko === "mittel") return badgeWarn;
  if (risiko === "hoch") return badgeCritical;
  if (risiko === "kritisch") return badgeCriticalDark;
  return badgeNeutral;
}

async function tryServerList(): Promise<KalkulationsErfahrung[] | null> {
  const api = KalkulationsDatenbank as any;
  if (typeof api.listServer !== "function") {
    return null;
  }

  try {
    const rows = await api.listServer();
    return Array.isArray(rows) ? rows : null;
  } catch (e) {
    return null;
  }
}

async function tryServerBulkUpsert(rows: KalkulationsErfahrung[]) {
  const api = KalkulationsDatenbank as any;
  if (typeof api.bulkUpsertServer !== "function") return;

  try {
    await api.bulkUpsertServer(rows);
  } catch {
    // local fallback bleibt aktiv
  }
}

async function tryServerRemove(id: string) {
  const api = KalkulationsDatenbank as any;
  if (typeof api.removeServer !== "function") return;

  try {
    await api.removeServer(id);
  } catch {
    // local fallback bleibt aktiv
  }
}


/* ================= GLOBAL KI / DATENBANK COMMANDS ================= */

function textForUnit(entry: KalkulationsErfahrung): string {
  return norm(`${entry.kurztext || ""} ${entry.langtext || ""} ${entry.parameter?.leistungsart || ""}`);
}

function suggestUnit(entry: KalkulationsErfahrung): string {
  const current = String(entry.einheit || "").trim();
  if (current) return current;

  const text = textForUnit(entry);

  if (
    text.includes("aushub") ||
    text.includes("graben") ||
    text.includes("boden") ||
    text.includes("verfull") ||
    text.includes("verfüll") ||
    text.includes("kies") ||
    text.includes("schotter") ||
    text.includes("beton")
  ) return "m³";

  if (
    text.includes("pflaster") ||
    text.includes("asphalt") ||
    text.includes("fläche") ||
    text.includes("flache") ||
    text.includes("tragschicht") ||
    text.includes("deckschicht")
  ) return "m²";

  if (
    text.includes("rohr") ||
    text.includes("leitung") ||
    text.includes("kabel") ||
    text.includes("speedpipe") ||
    text.includes("trasse")
  ) return "m";

  if (
    text.includes("abfuhr") ||
    text.includes("entsorgung") ||
    text.includes("deponie")
  ) return "t";

  if (
    text.includes("schacht") ||
    text.includes("bogen") ||
    text.includes("abzweig") ||
    text.includes("anschluss") ||
    text.includes("stück") ||
    text.includes("stk")
  ) return "Stk";

  return "";
}

function kostenSum(k?: Partial<KalkulationsKosten>): number {
  return round2(
    n(k?.material) +
      n(k?.lohn) +
      n(k?.maschinen) +
      n(k?.fremdleistung) +
      n(k?.entsorgung) +
      n(k?.transport) +
      n(k?.gemeinkosten) +
      n(k?.risiko) +
      n(k?.gewinn)
  );
}

function resourcesToKosten(
  resources: KalkulationsRessource[],
  menge: number,
  old?: Partial<KalkulationsKosten>
): KalkulationsKosten {
  const qty = Math.max(n(menge), 1);

  const unit = {
    material: 0,
    lohn: 0,
    maschinen: 0,
    fremdleistung: 0,
    entsorgung: 0,
    transport: 0,
    gemeinkosten: 0,
    risiko: n(old?.risiko),
    gewinn: n(old?.gewinn),
  };

  for (const r of resources) {
    const value = n(r.einzelpreis) || n(r.gesamtpreis);
    if (r.typ === "material") unit.material += value;
    else if (r.typ === "personal") unit.lohn += value;
    else if (r.typ === "maschine") unit.maschinen += value;
    else if (r.typ === "fremdleistung") unit.fremdleistung += value;
    else if (r.typ === "entsorgung") unit.entsorgung += value;
    else if (r.typ === "transport") unit.transport += value;
    else unit.gemeinkosten += value;
  }

  const epNetto = round2(
    unit.material +
      unit.lohn +
      unit.maschinen +
      unit.fremdleistung +
      unit.entsorgung +
      unit.transport +
      unit.gemeinkosten +
      unit.risiko +
      unit.gewinn
  );

  return {
    material: round2(unit.material * qty),
    lohn: round2(unit.lohn * qty),
    maschinen: round2(unit.maschinen * qty),
    fremdleistung: round2(unit.fremdleistung * qty),
    entsorgung: round2(unit.entsorgung * qty),
    transport: round2(unit.transport * qty),
    gemeinkosten: round2(unit.gemeinkosten * qty),
    risiko: round2(unit.risiko * qty),
    gewinn: round2(unit.gewinn * qty),
    epNetto,
    gpNetto: round2(epNetto * qty),
  };
}

function buildResourcesFromKosten(entry: KalkulationsErfahrung): KalkulationsRessource[] {
  const k = entry.kosten || emptyKosten();
  const qty = Math.max(n(entry.menge), 1);
  const unit = entry.einheit || suggestUnit(entry) || "EH";

  const candidates: Partial<KalkulationsRessource>[] = [
    { typ: "material", bezeichnung: "Material", einheit: unit, menge: 1, einzelpreis: round2(n(k.material) / qty) },
    { typ: "personal", bezeichnung: "Lohn / Personal", einheit: unit, menge: 1, einzelpreis: round2(n(k.lohn) / qty) },
    { typ: "maschine", bezeichnung: "Maschinen", einheit: unit, menge: 1, einzelpreis: round2(n(k.maschinen) / qty) },
    { typ: "transport", bezeichnung: "Transport", einheit: unit, menge: 1, einzelpreis: round2(n(k.transport) / qty) },
    { typ: "fremdleistung", bezeichnung: "Fremdleistung", einheit: unit, menge: 1, einzelpreis: round2(n(k.fremdleistung) / qty) },
    { typ: "entsorgung", bezeichnung: "Entsorgung", einheit: unit, menge: 1, einzelpreis: round2(n(k.entsorgung) / qty) },
    { typ: "sonstiges", bezeichnung: "Gemeinkosten", einheit: unit, menge: 1, einzelpreis: round2(n(k.gemeinkosten) / qty) },
    { typ: "sonstiges", bezeichnung: "Risiko", einheit: unit, menge: 1, einzelpreis: round2(n(k.risiko) / qty) },
    { typ: "sonstiges", bezeichnung: "Gewinn", einheit: unit, menge: 1, einzelpreis: round2(n(k.gewinn) / qty) },
  ];

  return candidates
    .filter((r) => n(r.einzelpreis) > 0)
    .map(normalizeResource);
}

function fallbackResourcesFromEp(entry: KalkulationsErfahrung): KalkulationsRessource[] {
  const ep = entryEp(entry);
  if (ep <= 0) return [];

  const unit = entry.einheit || suggestUnit(entry) || "EH";
  const text = textForUnit(entry);

  let material = 0.28;
  let lohn = 0.34;
  let maschine = 0.18;
  let entsorgung = 0.02;
  let gemeinkosten = 0.08;
  let risiko = 0.03;
  let gewinn = 0.07;

  if (text.includes("aushub") || text.includes("graben") || text.includes("boden")) {
    material = 0.14; lohn = 0.28; maschine = 0.27; entsorgung = 0.10; gemeinkosten = 0.09; risiko = 0.04; gewinn = 0.08;
  }

  if (text.includes("pflaster") || text.includes("asphalt")) {
    material = 0.45; lohn = 0.18; maschine = 0.14; entsorgung = 0.04; gemeinkosten = 0.08; risiko = 0.03; gewinn = 0.08;
  }

  if (text.includes("rohr") || text.includes("leitung") || text.includes("speedpipe") || text.includes("kabel")) {
    material = 0.42; lohn = 0.24; maschine = 0.11; entsorgung = 0.02; gemeinkosten = 0.09; risiko = 0.04; gewinn = 0.08;
  }

  return [
    { typ: "material", bezeichnung: "Materialansatz", einheit: unit, menge: 1, einzelpreis: round2(ep * material) },
    { typ: "personal", bezeichnung: "Lohn / Personal", einheit: unit, menge: 1, einzelpreis: round2(ep * lohn) },
    { typ: "maschine", bezeichnung: "Maschinenansatz", einheit: unit, menge: 1, einzelpreis: round2(ep * maschine) },
    { typ: "entsorgung", bezeichnung: "Entsorgung", einheit: unit, menge: 1, einzelpreis: round2(ep * entsorgung) },
    { typ: "sonstiges", bezeichnung: "Gemeinkosten", einheit: unit, menge: 1, einzelpreis: round2(ep * gemeinkosten) },
    { typ: "sonstiges", bezeichnung: "Risiko", einheit: unit, menge: 1, einzelpreis: round2(ep * risiko) },
    { typ: "sonstiges", bezeichnung: "Gewinn", einheit: unit, menge: 1, einzelpreis: round2(ep * gewinn) },
  ].filter((r) => n(r.einzelpreis) > 0).map((r) => normalizeResource(r as Partial<KalkulationsRessource>));
}

function calculateConfidence(entry: KalkulationsErfahrung): number {
  let score = 0.35;

  if (String(entry.posNr || "").trim()) score += 0.06;
  if (String(entry.kurztext || "").trim().length >= 8) score += 0.10;
  if (String(entry.langtext || "").trim().length >= 25) score += 0.10;
  if (String(entry.einheit || "").trim()) score += 0.08;
  if (n(entry.menge) > 0) score += 0.08;
  if (entryEp(entry) > 0) score += 0.12;
  if (entry.ressourcen?.length) score += 0.10;
  if (entry.parameter?.gewerk) score += 0.05;
  if (entry.parameter?.bauverfahren) score += 0.04;

  if (entry.risiko === "hoch") score -= 0.05;
  if (entry.risiko === "kritisch") score -= 0.10;

  return Math.max(0.2, Math.min(0.99, round2(score)));
}

function dbQualityKey(row: KalkulationsErfahrung): string {
  const text = norm(`${row.kurztext || ""} ${row.langtext || ""}`);
  const unit = norm(row.einheit);
  const price = Math.round(entryEp(row) * 100) / 100;
  if (text.length < 8) return "";
  return `${text}|${unit}|${price}`;
}

function dbDuplicateIds(rows: KalkulationsErfahrung[]): Set<string> {
  const map = new Map<string, KalkulationsErfahrung[]>();

  for (const row of rows) {
    const key = dbQualityKey(row);
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }

  return new Set(
    Array.from(map.values())
      .filter((g) => g.length > 1)
      .flatMap((g) => g.map((x) => x.id))
  );
}

function dispatchKiProgress(detail: {
  active?: boolean;
  progress?: number;
  title?: string;
  message?: string;
  changes?: string[];
}) {
  window.dispatchEvent(
    new CustomEvent("rlc:ki-progress", {
      detail,
    })
  );
}

/* ================= COMPONENT ================= */

export default function KalkulationsDatenbankPage() {
  const navigate = useNavigate();
  const projectCtx: any = useProject();
  const project = getProject(projectCtx);

  const projectCode = getProjectCode(project);
  const projectName = getProjectName(project);

  const importRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<KalkulationsErfahrung[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [quelle, setQuelle] = useState<FilterQuelle>("alle");
  const [risiko, setRisiko] = useState<FilterRisiko>("alle");
  const [gewerk, setGewerk] = useState("alle");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [qualityFilter, setQualityFilter] = useState<DbQualityFilter>("alle");
  const [info, setInfo] = useState("");
  const [syncMode, setSyncMode] = useState<"local" | "server">("local");
  const [serverTotal, setServerTotal] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const [serverLimit, setServerLimit] = useState(DB_LOAD_LIMIT);
  const [serverHasNext, setServerHasNext] = useState(false);
  const [serverHasPrev, setServerHasPrev] = useState(false);
  const [buttonFeedback, setButtonFeedback] = useState("");

  const selected = useMemo(
    () => rows.find((x) => x.id === selectedId) || rows[0] || null,
    [rows, selectedId]
  );

  useEffect(() => {
    if (!selectedId && rows[0]?.id) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const localRows = KalkulationsDatenbank.list().slice(0, DB_LOAD_LIMIT);
      setRows(localRows);
      setSyncMode("local");
      showInfo("Lokale Datenbank geladen. Server-Synchronisierung nur manuell.");
    }, 0);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showInfo(message = "") {
    if (!message) return;
    setInfo(message);
    window.setTimeout(() => setInfo(""), 2400);
  }

  function refresh(message = "") {
    const next = KalkulationsDatenbank.list();
    setRows(next);
    showInfo(message);
  }

  function handleButtonFeedback(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    const button = target?.closest("button") as HTMLButtonElement | null;

    if (!button || button.disabled) return;

    const label = String(button.innerText || button.textContent || "Aktion")
      .replace(/\s+/g, " ")
      .trim();

    setButtonFeedback(label ? `RLC arbeitet: ${label}` : "RLC arbeitet...");
    document.body.style.cursor = "progress";

    window.setTimeout(() => {
      document.body.style.cursor = "";
      setButtonFeedback("");
    }, 1000);
  }
  async function refreshFromServer(message = "", nextOffset = serverOffset) {
    try {
      const page = await KalkulationsDatenbank.listServerPage(
        DB_LOAD_LIMIT,
        nextOffset
      );

      setRows(page.rows);
      setSyncMode("server");
      setServerTotal(page.total);
      setServerOffset(page.offset);
      setServerLimit(page.limit);
      setServerHasNext(page.hasNext);
      setServerHasPrev(page.hasPrev);

      if (page.rows[0]?.id) setSelectedId(page.rows[0].id);

      const pageNumber = Math.floor(page.offset / page.limit) + 1;
      const pageCount = Math.max(1, Math.ceil(page.total / page.limit));

      showInfo(
        message ||
          `Server-Datenbank geladen: ${page.total} Positionen · Seite ${pageNumber} von ${pageCount}`
      );
      return;
    } catch {
      const localRows = KalkulationsDatenbank.list().slice(0, DB_LOAD_LIMIT);
      setRows(localRows);
      setSyncMode("local");
      setServerTotal(localRows.length);
      setServerOffset(0);
      setServerLimit(DB_LOAD_LIMIT);
      setServerHasNext(false);
      setServerHasPrev(false);
      showInfo(message || "Lokale Datenbank geladen. Server nicht erreichbar.");
    }
  }

  const gewerke = useMemo(() => {
    const set = new Set<string>();

    for (const row of rows) {
      const g = String(row.parameter?.gewerk || "").trim();
      if (g) set.add(g);
    }

    return ["alle", ...Array.from(set).sort((a, b) => a.localeCompare(b, "de"))];
  }, [rows]);
  function applyDbFilter(nextFilter: any) {
    setQualityFilter(nextFilter);
    setInfo(`Filter aktiv: ${nextFilter}`);
    window.setTimeout(() => setInfo(""), 2200);
  }

  function suggestUnitForEntry(entry: KalkulationsErfahrung): string {
    const current = String(entry.einheit || "").trim();
    if (current) return current;

    const text = `${entry.kurztext || ""} ${entry.langtext || ""}`.toLowerCase();

    if (text.includes("aushub") || text.includes("boden") || text.includes("verfüll") || text.includes("verfull") || text.includes("kies") || text.includes("schotter")) return "m³";
    if (text.includes("pflaster") || text.includes("asphalt") || text.includes("fläche") || text.includes("flache")) return "m²";
    if (text.includes("rohr") || text.includes("leitung") || text.includes("kabel") || text.includes("speedpipe")) return "m";
    if (text.includes("abfuhr") || text.includes("entsorgung")) return "t";
    if (text.includes("schacht") || text.includes("anschluss") || text.includes("bogen") || text.includes("abzweig")) return "St";

    return "St";
  }

  function makeAutoResources(entry: KalkulationsErfahrung): KalkulationsRessource[] {
    const ep = entryEp(entry);
    const unit = suggestUnitForEntry(entry);
    if (ep <= 0) return [];

    const text = `${entry.kurztext || ""} ${entry.langtext || ""}`.toLowerCase();

    let material = 0;
    let lohn = 0;
    let maschine = 0;
    let entsorgung = 0;
    let transport = 0;
    let gemein = 0;
    let risiko = 0;
    let gewinn = 0;

    if (text.includes("aushub") || text.includes("graben") || text.includes("boden")) {
      material = round2(ep * 0.10);
      lohn = round2(ep * 0.28);
      maschine = round2(ep * 0.30);
      entsorgung = round2(ep * 0.12);
      transport = round2(ep * 0.06);
      gemein = round2(ep * 0.06);
      risiko = round2(ep * 0.03);
      gewinn = round2(ep * 0.05);
    } else if (text.includes("pflaster") || text.includes("asphalt")) {
      material = round2(ep * 0.45);
      lohn = round2(ep * 0.20);
      maschine = round2(ep * 0.14);
      entsorgung = round2(ep * 0.03);
      gemein = round2(ep * 0.08);
      risiko = round2(ep * 0.03);
      gewinn = round2(ep * 0.07);
    } else if (text.includes("rohr") || text.includes("leitung") || text.includes("speedpipe") || text.includes("kabel")) {
      material = round2(ep * 0.42);
      lohn = round2(ep * 0.26);
      maschine = round2(ep * 0.12);
      transport = round2(ep * 0.04);
      gemein = round2(ep * 0.07);
      risiko = round2(ep * 0.03);
      gewinn = round2(ep * 0.06);
    } else {
      material = round2(ep * 0.30);
      lohn = round2(ep * 0.30);
      maschine = round2(ep * 0.15);
      gemein = round2(ep * 0.10);
      risiko = round2(ep * 0.05);
      gewinn = round2(ep * 0.10);
    }

    return [
      { id: safeId(), typ: "material", bezeichnung: "Materialansatz", einheit: unit, menge: 1, einzelpreis: material, gesamtpreis: material },
      { id: safeId(), typ: "personal", bezeichnung: "Lohn / Personal", einheit: unit, menge: 1, einzelpreis: lohn, gesamtpreis: lohn },
      { id: safeId(), typ: "maschine", bezeichnung: "Maschinenansatz", einheit: unit, menge: 1, einzelpreis: maschine, gesamtpreis: maschine },
      { id: safeId(), typ: "entsorgung", bezeichnung: "Entsorgung", einheit: unit, menge: 1, einzelpreis: entsorgung, gesamtpreis: entsorgung },
      { id: safeId(), typ: "transport", bezeichnung: "Transport", einheit: unit, menge: 1, einzelpreis: transport, gesamtpreis: transport },
      { id: safeId(), typ: "sonstiges", bezeichnung: "Gemeinkosten", einheit: unit, menge: 1, einzelpreis: gemein, gesamtpreis: gemein },
      { id: safeId(), typ: "sonstiges", bezeichnung: "Risiko", einheit: unit, menge: 1, einzelpreis: risiko, gesamtpreis: risiko },
      { id: safeId(), typ: "sonstiges", bezeichnung: "Gewinn", einheit: unit, menge: 1, einzelpreis: gewinn, gesamtpreis: gewinn },
    ].filter((r) => n(r.einzelpreis) > 0).map((r) => normalizeResource(r as Partial<KalkulationsRessource>));
  }

  function applyDbFix(action: string) {
    const before = rows;
    let changed = 0;
    const report: string[] = [];

    const next = before.map((entry) => {
      let updated: KalkulationsErfahrung = entry;

      if (action === "fixEinheiten" && !String(entry.einheit || "").trim()) {
        const unit = suggestUnitForEntry(entry);
        updated = {
          ...updated,
          einheit: unit,
          parameter: {
            ...updated.parameter,
            einheit: unit,
          },
          updatedAt: new Date().toISOString(),
        };
        changed += 1;
        report.push(`✓ Pos. ${entry.posNr || "—"} – Einheit ergänzt: leer → ${unit}.`);
      }

      if (action === "fixKostenaufbau" && !entry.ressourcen?.length && entryEp(entry) > 0) {
        const resources = makeAutoResources(entry);
        if (resources.length) {
          updated = {
            ...updated,
            ressourcen: resources,
            updatedAt: new Date().toISOString(),
          };
          changed += 1;
          report.push(`✓ Pos. ${entry.posNr || "—"} – Kostenaufbau automatisch erzeugt.`);
        }
      }

      if (action === "fixEpAusKostenaufbau" && entry.ressourcen?.length) {
        const ep = round2(entry.ressourcen.reduce((sum, r) => sum + n(r.einzelpreis), 0));
        const gp = round2(ep * Math.max(1, n(entry.menge)));
        const oldEp = entryEp(entry);

        if (ep > 0 && Math.abs(ep - oldEp) > 0.009) {
          updated = {
            ...updated,
            kosten: {
              ...updated.kosten,
              epNetto: ep,
              gpNetto: gp,
            },
            updatedAt: new Date().toISOString(),
          };
          changed += 1;
          report.push(`✓ Pos. ${entry.posNr || "—"} – EP geändert: ${money(oldEp)} → ${money(ep)}.`);
        }
      }

      if (action === "recalculateConfidence") {
        const score =
          (String(updated.kurztext || "").trim() ? 0.18 : 0) +
          (String(updated.langtext || "").trim() ? 0.16 : 0) +
          (String(updated.einheit || "").trim() ? 0.12 : 0) +
          (entryEp(updated) > 0 ? 0.20 : 0) +
          (updated.ressourcen?.length ? 0.18 : 0) +
          (n(updated.menge) > 0 ? 0.10 : 0) +
          (updated.risiko === "niedrig" || updated.risiko === "mittel" ? 0.06 : 0);

        const confidence = Math.max(0.35, Math.min(0.98, round2(score)));
        const oldConfidence = n(updated.confidence);

        if (Math.abs(confidence - oldConfidence) > 0.009) {
          updated = {
            ...updated,
            confidence,
            updatedAt: new Date().toISOString(),
          };
          changed += 1;
          report.push(`✓ Pos. ${entry.posNr || "—"} – Confidence geändert: ${percent(oldConfidence)} → ${percent(confidence)}.`);
        }
      }

      return updated;
    });

    if (changed <= 0) {
      setInfo("Keine passenden Einträge für diese Aktion gefunden.");
      window.dispatchEvent(
        new CustomEvent("rlc:ki-progress", {
          detail: {
            running: false,
            title: "Keine Änderung notwendig",
            log: ["Keine passenden Einträge gefunden."],
          },
        })
      );
      return;
    }

    KalkulationsDatenbank.bulkUpsert(next);
    void tryServerBulkUpsert(next);

    setRows(KalkulationsDatenbank.list());
    setInfo(`${changed} Änderung(en) durchgeführt.`);

    window.dispatchEvent(
      new CustomEvent("rlc:ki-progress", {
        detail: {
          running: false,
          title: "Datenbank-Korrektur abgeschlossen",
          log: report.slice(0, 30),
        },
      })
    );

    window.setTimeout(() => setInfo(""), 3000);
  }

  const filtered = useMemo(() => {
    const q = norm(query);

        const duplicateIds = qualityFilter === "dubletten" ? dbDuplicateIds(rows) : new Set<string>();
let out = rows.filter((row) => {
      if (quelle !== "alle" && row.quelle !== quelle) return false;
      if (risiko !== "alle" && row.risiko !== risiko) return false;
      if (gewerk !== "alle" && row.parameter?.gewerk !== gewerk) return false;

      if (qualityFilter !== "alle") {
        const duplicateIds = dbDuplicateIds(rows);

        if (qualityFilter === "epFehlt" && entryEp(row) > 0) return false;
        if (qualityFilter === "einheitFehlt" && String(row.einheit || "").trim()) return false;
        if (qualityFilter === "ressourcenFehlen" && row.ressourcen?.length) return false;
        if (qualityFilter === "risikoHoch" && row.risiko !== "hoch" && row.risiko !== "kritisch") return false;
        if (qualityFilter === "confidenceNiedrig" && n(row.confidence) >= 0.7) return false;
        if (qualityFilter === "dubletten" && !duplicateIds.has(row.id)) return false;
      }

      if (!q) return true;

      const hay = [
        row.projektCode,
        row.projektName,
        row.posNr,
        row.kurztext,
        row.langtext,
        row.einheit,
        row.parameter?.gewerk,
        row.parameter?.leistungsart,
        row.parameter?.bauverfahren,
        row.parameter?.bodenklasse,
        row.kiHinweis,
        row.kalkulatorNotiz,
        Array.isArray(row.tags) ? row.tags.join(" ") : "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });

    out = [...out].sort((a, b) => {
      if (sortKey === "updatedAt") {
        return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      }

      if (sortKey === "posNr") {
        return a.posNr.localeCompare(b.posNr, "de", {
          numeric: true,
          sensitivity: "base",
        });
      }

      if (sortKey === "kurztext") {
        return a.kurztext.localeCompare(b.kurztext, "de", {
          numeric: true,
          sensitivity: "base",
        });
      }

      if (sortKey === "epNetto") return b.kosten.epNetto - a.kosten.epNetto;
      if (sortKey === "gpNetto") return b.kosten.gpNetto - a.kosten.gpNetto;
      if (sortKey === "verwendungen") return b.verwendungen - a.verwendungen;
      if (sortKey === "confidence") return b.confidence - a.confidence;

      return 0;
    });

    return out;
  }, [rows, query, quelle, risiko, gewerk, sortKey, qualityFilter]);

  
  const visibleRows = useMemo(
    () => filtered,
    [filtered]
  );
const stats = useMemo(() => {
    const total = rows.length;
    const used = rows.reduce((s, r) => s + n(r.verwendungen), 0);
    const highRisk = rows.filter(
      (r) => r.risiko === "hoch" || r.risiko === "kritisch"
    ).length;
    const confidence = total
      ? rows.reduce((s, r) => s + n(r.confidence), 0) / total
      : 0;

    return {
      total,
      filtered: filtered.length,
      used,
      highRisk,
      confidence,
    };
  }, [rows, filtered.length]);

  function addEntry() {
    const created = emptyEntry(projectCode, projectName);
    refresh("Neue Kalkulationsposition erstellt.");
    setSelectedId(created.id);
    void tryServerBulkUpsert([created]);
    navigate(`/kalkulation/datenbank/position/${created.id}`);
  }

  function deleteEntry(id: string) {
    if (!confirm("Diesen Datenbankeintrag wirklich löschen?")) return;

    KalkulationsDatenbank.remove(id);
    void tryServerRemove(id);

    refresh("Eintrag gelöscht.");
  }

  function clearAll() {
    if (!confirm("Wirklich die komplette lokale Kalkulationsdatenbank löschen?")) {
      return;
    }

    KalkulationsDatenbank.clear();
    setSelectedId("");
    refresh("Lokale Datenbank gelöscht.");
  }

  function exportJson() {
    downloadText(
      KalkulationsDatenbank.exportJson(),
      "RLC_Kalkulationsdatenbank.json",
      "application/json;charset=utf-8"
    );
  }

  function exportCsv() {
    downloadText(
      KalkulationsDatenbank.exportCsv(),
      "RLC_Kalkulationsdatenbank.csv",
      "text/csv;charset=utf-8"
    );
  }

  function importFromLv() {
    const lvRows = LV.list();

    if (!lvRows.length) {
      alert("Kein LV vorhanden.");
      return;
    }

    const entries = lvRows.map((r) => lvToEntry(r, projectCode, projectName));

    KalkulationsDatenbank.bulkUpsert(entries);
    void tryServerBulkUpsert(entries);

    refresh(`${entries.length.toLocaleString("de-DE")} LV-Positionen übernommen.`);
  }

  function importJsonFile(file: File | null | undefined) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const count = KalkulationsDatenbank.importJson(String(reader.result || ""));
        const imported = KalkulationsDatenbank.list();

        void tryServerBulkUpsert(imported);
        refresh(`${count.toLocaleString("de-DE")} Einträge importiert.`);
      } catch (e: any) {
        alert(`Import fehlgeschlagen: ${e?.message || e}`);
      } finally {
        if (importRef.current) importRef.current.value = "";
      }
    };

    reader.readAsText(file, "utf-8");
  }

  function updateSelected(patch: Partial<KalkulationsErfahrung>) {
    if (!selected) return;

    const saved = KalkulationsDatenbank.upsert({
      ...selected,
      ...patch,
      updatedAt: new Date().toISOString(),
    });

    setRows(KalkulationsDatenbank.list());
    setSelectedId(saved.id);
    void tryServerBulkUpsert([saved]);
  }

  function updateParameter(patch: Partial<KalkulationsParameter>) {
    if (!selected) return;

    updateSelected({
      parameter: {
        ...selected.parameter,
        ...patch,
      },
    });
  }

  function updateKosten(patch: Partial<KalkulationsKosten>) {
    if (!selected) return;

    const nextKosten: KalkulationsKosten = {
      ...selected.kosten,
      ...patch,
    };

    const epChanged = Object.prototype.hasOwnProperty.call(patch, "epNetto");
    const gpChanged = Object.prototype.hasOwnProperty.call(patch, "gpNetto");

    if (epChanged && !gpChanged) {
      nextKosten.gpNetto = round2(n(selected.menge) * n(nextKosten.epNetto));
    }

    updateSelected({
      kosten: nextKosten,
    });
  }

  function addResource() {
    if (!selected) return;

    updateSelected({
      ressourcen: [
        ...selected.ressourcen,
        {
          id: safeId(),
          typ: "material",
          bezeichnung: "",
          kurztext: "",
          beschreibung: "",
          einheit: selected.einheit || "St",
          menge: 0,
          einzelpreis: 0,
          gesamtpreis: 0,
          leistungswert: undefined,
          leistungsEinheit: "",
          bemerkung: "",
        },
      ],
    });
  }

  function updateResource(id: string, patch: Partial<KalkulationsRessource>) {
    if (!selected) return;

    const next = selected.ressourcen.map((r) => {
      if (r.id !== id) return r;

      return normalizeResource({
        ...r,
        ...patch,
      });
    });

    updateSelected({ ressourcen: next });
  }

  function removeResource(id: string) {
    if (!selected) return;

    updateSelected({
      ressourcen: selected.ressourcen.filter((r) => r.id !== id),
    });
  }

  function copyToLv(entry: KalkulationsErfahrung) {
    LV.upsert(toLvPos(entry));

    KalkulationsDatenbank.markUsed(entry.id);
    const updated = KalkulationsDatenbank.get(entry.id);
    if (updated) void tryServerBulkUpsert([updated]);

    refresh("Position wurde ins LV übernommen.");
  }


  useEffect(() => {
    function handleGlobalDatenbankCommand(event: Event) {
      const detail = (event as CustomEvent<{ filter?: string; action?: string }>).detail;
      if (!detail) return;

      const filter = String(detail.filter || "");
      const action = String(detail.action || "");

      if (filter) {
        applyDbFilter(filter);
      }

      if (action) {
        applyDbFix(action);
      }

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }

    window.addEventListener("rlc:datenbank-command", handleGlobalDatenbankCommand);

    return () => {
      window.removeEventListener("rlc:datenbank-command", handleGlobalDatenbankCommand);
    };
  }, [rows]);

  return (
    <div style={page} onClickCapture={handleButtonFeedback}>
      {buttonFeedback ? <div style={actionFeedback}>{buttonFeedback}</div> : null}
      <section style={heroCard}>
        <div>
          <div style={eyebrow}>RLC KI · Erfahrungsdatenbank</div>
          <h1 style={title}>KI-Kalkulationsdatenbank</h1>
          <p style={subtitle}>
            Zentrale Wissensbasis für kalkulierte Positionen: Personal, Maschinen,
            Material, Transport, Bauverfahren, Risiken, Erfahrungswerte und EP-Netto
            für zukünftige KI-Kalkulationen.
          </p>
        </div>

        <div style={heroActions}>
          <button type="button" style={btnPrimary} onClick={addEntry}>
            Neue Position
          </button>

          <button
            type="button"
            style={btnPrimary}
            onClick={() => navigate("/kalkulation/datenbank/preise")}
          >
            Preise einfügen
          </button>

          <button type="button" style={btnSecondary} onClick={importFromLv}>
            Aus LV übernehmen
          </button>

          <div style={serverPager}>
            <button
              type="button"
              style={btnSecondary}
              disabled={syncMode !== "server" || !serverHasPrev}
              onClick={() =>
                void refreshFromServer(
                  "",
                  Math.max(serverOffset - serverLimit, 0)
                )
              }
            >
              ◀ Vorherige Seite
            </button>

            <div style={serverPagerInfo}>
              Datenbank-Server: {serverTotal || rows.length} Positionen · Seite{" "}
              {serverTotal
                ? Math.floor(serverOffset / serverLimit) + 1
                : 1}{" "}
              von {serverTotal ? Math.max(1, Math.ceil(serverTotal / serverLimit)) : 1}
            </div>

            <button
              type="button"
              style={btnSecondary}
              disabled={syncMode !== "server" || !serverHasNext}
              onClick={() =>
                void refreshFromServer("", serverOffset + serverLimit)
              }
            >
              Nächste Seite ▶
            </button>

            <button
              type="button"
              style={btnSecondary}
              onClick={() => void refreshFromServer("Datenbank synchronisiert.", 0)}
            >
              Server verbinden
            </button>
          </div>

          <button
            type="button"
            style={btnSecondary}
            onClick={exportCsv}
            disabled={!rows.length}
          >
            CSV Export
          </button>

          <button
            type="button"
            style={btnSecondary}
            onClick={exportJson}
            disabled={!rows.length}
          >
            JSON Export
          </button>

          <button
            type="button"
            style={btnSecondary}
            onClick={() => importRef.current?.click()}
          >
            JSON Import
          </button>

          <button
            type="button"
            style={btnSecondary}
            onClick={() => navigate("/kalkulation/mit-ki")}
          >
            Zur KI-Kalkulation
          </button>

          <button
            type="button"
            style={btnDanger}
            onClick={clearAll}
            disabled={!rows.length}
          >
            Lokal löschen
          </button>

          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={(e) => importJsonFile(e.target.files?.[0])}
          />
        </div>

        <div style={heroMeta}>
          Projekt: <b>{projectCode || "—"}</b>
          {projectName ? <span> · {projectName}</span> : null}
          <span> · Speicher: {syncMode === "server" ? "Server + Lokal" : "Lokal"}</span>
          {info ? <span> · {info}</span> : null}
        </div>
      </section>

      <section style={grid6}>
        <Kpi label="Einträge" value={String(stats.total)} sub={`${stats.filtered} sichtbar`} />

        <Kpi
          label="EP selezionato"
          value={selected ? money(entryEp(selected)) : "—"}
          sub={selected ? selected.posNr : "nessuna posizione"}
        />

        <Kpi
          label="GP selezionato"
          value={selected ? money(entryGp(selected)) : "—"}
          sub={selected ? `${num(selected.menge, 3)} ${selected.einheit}` : ""}
        />

        <Kpi label="Verwendungen" value={String(selected?.verwendungen ?? 0)} />

        <Kpi
          label="Risiko"
          value={selected ? risikoLabel(selected.risiko) : "—"}
          danger={selected?.risiko === "hoch" || selected?.risiko === "kritisch"}
        />

        <Kpi
          label="Confidence"
          value={selected ? percent(selected.confidence) : "—"}
        />
      </section>

      <section style={card}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>Suche & Filter</h2>
            <div style={sectionText}>
              Suche nach Position, Text, Gewerk, Bauverfahren, Bodenklasse,
              KI-Prüfhinweis oder Notiz.
            </div>
          </div>
        </div>

        <div style={filterGrid}>
          <input
            style={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Intelligente Suche… PosNr, Kurztext, Langtext, Gewerk, Bauverfahren"
          />

          <select
            style={input}
            value={quelle}
            onChange={(e) => setQuelle(e.target.value as FilterQuelle)}
          >
            {QUELLEN.map((q) => (
              <option key={q} value={q}>
                {q === "alle" ? "Alle Quellen" : quelleLabel(q)}
              </option>
            ))}
          </select>

          <select
            style={input}
            value={risiko}
            onChange={(e) => setRisiko(e.target.value as FilterRisiko)}
          >
            {RISIKEN.map((r) => (
              <option key={r} value={r}>
                {r === "alle" ? "Alle Risiken" : risikoLabel(r)}
              </option>
            ))}
          </select>

          <select
            style={input}
            value={gewerk}
            onChange={(e) => setGewerk(e.target.value)}
          >
            {gewerke.map((g) => (
              <option key={g} value={g}>
                {g === "alle" ? "Alle Gewerke" : g}
              </option>
            ))}
          </select>

          <select
            style={input}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="updatedAt">Sortierung: zuletzt geändert</option>
            <option value="posNr">Sortierung: PosNr</option>
            <option value="kurztext">Sortierung: Kurztext</option>
            <option value="epNetto">Sortierung: EP netto</option>
            <option value="gpNetto">Sortierung: GP netto</option>
            <option value="verwendungen">Sortierung: Verwendungen</option>
            <option value="confidence">Sortierung: Confidence</option>
          </select>
        </div>
      </section>

      
        <div style={qualityBar}>
          <button type="button" style={qualityFilter === "alle" ? btnFilterActive : btnFilter} onClick={() => applyDbFilter("alle")}>
            Alle
          </button>

          <button type="button" style={qualityFilter === "epFehlt" ? btnFilterActive : btnFilter} onClick={() => applyDbFilter("epFehlt")}>
            EP fehlt
          </button>

          <button type="button" style={qualityFilter === "einheitFehlt" ? btnFilterActive : btnFilter} onClick={() => applyDbFilter("einheitFehlt")}>
            Einheit fehlt
          </button>

          <button type="button" style={qualityFilter === "ressourcenFehlen" ? btnFilterActive : btnFilter} onClick={() => applyDbFilter("ressourcenFehlen")}>
            Kostenbestandteile fehlen
          </button>

          <button type="button" style={qualityFilter === "risikoHoch" ? btnFilterActive : btnFilter} onClick={() => applyDbFilter("risikoHoch")}>
            Prüfung nötig
          </button>

          <button type="button" style={qualityFilter === "confidenceNiedrig" ? btnFilterActive : btnFilter} onClick={() => applyDbFilter("confidenceNiedrig")}>
            Sicherheit niedrig
          </button>

          <button type="button" style={qualityFilter === "dubletten" ? btnFilterActive : btnFilter} onClick={() => applyDbFilter("dubletten")}>
            Doppelte Preise prüfen
          </button>

          <button type="button" style={btnSecondary} onClick={() => applyDbFix("fixEinheiten")}>
            Einheiten automatisch ergänzen
          </button>

          <button type="button" style={btnSecondary} onClick={() => applyDbFix("fixKostenaufbau")}>
            Kostenbestandteile erstellen
          </button>

          <button type="button" style={btnSecondary} onClick={() => applyDbFix("fixEpAusKostenaufbau")}>
            EP aus Bestandteilen berechnen
          </button>

          <button type="button" style={btnSecondary} onClick={() => applyDbFix("recalculateConfidence")}>
            Sicherheit neu bewerten
          </button>
        </div>

      <section style={mainGrid}>
        <section style={card}>
          <div style={sectionHead}>
            <div>
              <h2 style={sectionTitle}>Gespeicherte Kalkulationen</h2>
              <div style={sectionText}>
                Jede Position kann wiederverwendet, angepasst oder ins aktuelle LV
                übernommen werden.
              </div>
            </div>
          </div>

          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>PosNr</th>
                  <th style={th}>Kurztext</th>
                                    <th style={th}>Projekt</th>
<th style={th}>Gewerk</th>
                  <th style={th}>ME</th>
                  <th style={thRight}>Menge</th>
                  <th style={thRight}>EP netto</th>
                  <th style={thRight}>GP netto</th>
                  <th style={th}>Risiko</th>
                  <th style={thRight}>Conf.</th>
                  <th style={thRight}>Verw.</th>
                  <th style={th}>Aktion</th>
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((row, i) => {
                  const active = selected?.id === row.id;

                  return (
                    <tr
                      key={row.id}
                      style={{
                        background: active ? "#EFF6FF" : i % 2 ? "#FCFCFC" : "#FFFFFF",
                        cursor: "pointer",
                      }}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td style={tdStrong}>{row.posNr || "—"}</td>

                      <td style={tdText}>
                        <b>{row.kurztext || "Ohne Kurztext"}</b>
                        <div style={tiny}>
                          {quelleLabel(row.quelle)} · {fmtDate(row.updatedAt)}
                        </div>
                      </td>

                                            <td style={tdText}>
                        <b>{row.projektCode || projectCode || "—"}</b>
                        <div style={tiny}>{row.projektName || projectName || "Ohne Projektname"}</div>
                      </td>
<td style={td}>{row.parameter?.gewerk || "—"}</td>
                      <td style={td}>{row.einheit || "—"}</td>
                      <td style={tdRight}>{num(row.menge, 3)}</td>
                      <td style={tdRight}>{money(entryEp(row))}</td>
                      <td style={tdRight}>{money(entryGp(row))}</td>

                      <td style={td}>
                        <span style={riskStyle(row.risiko)}>
                          {risikoLabel(row.risiko)}
                        </span>
                      </td>

                      <td style={tdRight}>{percent(row.confidence)}</td>
                      <td style={tdRight}>{row.verwendungen}</td>

                      <td style={td}>
                        <div style={actionCol}>
                          <button
                            type="button"
                            style={btnSecondary}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/kalkulation/datenbank/position/${row.id}`);
                            }}
                          >
                            Position bearbeiten
                          </button>
                          <button
                            type="button"
                            style={btnMini}
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToLv(row);
                            }}
                          >
                            Ins LV
                          </button>

                          <button
                            type="button"
                            style={btnDangerMini}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteEntry(row.id);
                            }}
                          >
                            Löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!filtered.length ? (
                  <tr>
                    <td colSpan={12} style={emptyCell}>
                      Keine Kalkulationen gefunden. Lege einen Eintrag an oder
                      übernimm Positionen aus dem LV / der KI-Kalkulation.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  );
}

/* ================= SMALL UI ================= */

function Kpi({
  label,
  value,
  sub,
  danger,
}: {
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div style={kpiCard}>
      <div style={kpiLabel}>{label}</div>
      <div style={{ ...kpiValue, color: danger ? "#B91C1C" : "#0F172A" }}>
        {value}
      </div>
      {sub ? <div style={kpiSub}>{sub}</div> : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={checkLabel}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/* ================= STYLES ================= */


const qualityBar: React.CSSProperties = {
  marginTop: 14,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const btnFilter: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#334155",
  borderRadius: 999,
  padding: "7px 11px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const btnFilterActive: React.CSSProperties = {
  ...btnFilter,
  border: "1px solid #2563EB",
  background: "#EFF6FF",
  color: "#1D4ED8",
};

const serverPager: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  border: "1px solid rgba(255,255,255,0.25)",
  background: "rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: 6,
};

const serverPagerInfo: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  color: "#0F172A",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 900,
  fontSize: 13,
};

const actionFeedback: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1E3A8A",
  borderRadius: 14,
  padding: "12px 16px",
  fontWeight: 900,
  boxShadow: "0 10px 24px rgba(15,23,42,0.10)",
};

const page: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 16,
};

const heroCard: React.CSSProperties = {
  background: "linear-gradient(135deg,#0F172A,#1E3A8A)",
  color: "#FFFFFF",
  borderRadius: 18,
  padding: 22,
  display: "grid",
  gap: 14,
  boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.8,
  fontWeight: 800,
};

const title: React.CSSProperties = {
  margin: "4px 0",
  fontSize: 30,
  fontWeight: 900,
};

const subtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 980,
  opacity: 0.9,
  lineHeight: 1.55,
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const heroMeta: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.92,
};

const grid6: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
  gap: 12,
};

const kpiCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const kpiValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 22,
  color: "#0F172A",
  fontWeight: 900,
};

const kpiSub: React.CSSProperties = {
  marginTop: 3,
  fontSize: 12,
  color: "#64748B",
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const sectionHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 17,
  color: "#0F172A",
  fontWeight: 900,
};

const sectionText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#64748B",
  lineHeight: 1.45,
};

const filterGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(260px,1fr) 160px 150px 180px 220px",
  gap: 10,
};

const input: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  background: "#FFFFFF",
};

const smallInput: React.CSSProperties = {
  ...input,
  padding: "7px 9px",
};

const mainGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 16,
  alignItems: "start",
};

const sideCard: React.CSSProperties = {
  ...card,
  position: "sticky",
  top: 12,
  maxHeight: "calc(100vh - 24px)",
  overflow: "auto",
};

const tableWrap: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  overflowX: "auto",
  overflowY: "auto",
  maxHeight: 720,
};

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 1220,
  borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 9px",
  fontSize: 12,
  color: "#475569",
  background: "#F8FAFC",
  borderBottom: "1px solid #E5E7EB",
  whiteSpace: "nowrap",
  fontWeight: 900,
};

const thRight: React.CSSProperties = {
  ...th,
  textAlign: "right",
};

const td: React.CSSProperties = {
  padding: "9px",
  fontSize: 12,
  borderBottom: "1px solid #F1F5F9",
  color: "#0F172A",
  verticalAlign: "top",
};

const tdStrong: React.CSSProperties = {
  ...td,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const tdText: React.CSSProperties = {
  ...td,
  minWidth: 260,
};

const tdRight: React.CSSProperties = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};

const tiny: React.CSSProperties = {
  marginTop: 3,
  fontSize: 11,
  color: "#64748B",
  fontWeight: 600,
};

const actionCol: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexDirection: "column",
};

const detailStack: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const advancedDetails: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  background: "#F8FAFC",
  borderRadius: 14,
  padding: 14,
};

const advancedSummary: React.CSSProperties = {
  cursor: "pointer",
  fontWeight: 900,
  color: "#1D4ED8",
  userSelect: "none",
};

const advancedContent: React.CSSProperties = {
  marginTop: 14,
  display: "grid",
  gap: 16,
};
const detailHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
};

const sideTitle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 15,
  fontWeight: 900,
  color: "#0F172A",
  lineHeight: 1.35,
};

const formGrid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 10,
};

const formGrid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "70px 1fr 1fr 110px",
  gap: 8,
  alignItems: "center",
};

const checkGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 8,
};

const checkLabel: React.CSSProperties = {
  display: "flex",
  gap: 7,
  alignItems: "center",
  fontSize: 12,
  color: "#334155",
  fontWeight: 700,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 800,
};

const label: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 800,
};

const subTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#0F172A",
  fontWeight: 900,
};

const separator: React.CSSProperties = {
  height: 1,
  background: "#E5E7EB",
};

const resourceList: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const resourceBox: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  background: "#F8FAFC",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 8,
};

const resourceTop: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "space-between",
};

const resourceTotalBox: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  borderRadius: 10,
  padding: "8px 9px",
  fontSize: 12,
  fontWeight: 900,
  textAlign: "right",
};

const footerActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const emptyCell: React.CSSProperties = {
  padding: 16,
  color: "#64748B",
  fontSize: 13,
};

const emptySmall: React.CSSProperties = {
  border: "1px dashed #CBD5E1",
  background: "#F8FAFC",
  borderRadius: 12,
  padding: 12,
  color: "#64748B",
  fontSize: 13,
};

const btnBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 13px",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #2563EB",
  background: "#2563EB",
  color: "#FFFFFF",
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "#FFFFFF",
  color: "#0F172A",
};

const btnDanger: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
};

const btnMini: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnDangerMini: React.CSSProperties = {
  ...btnMini,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
};

const badgeNeutral: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  color: "#475569",
  borderRadius: 999,
  padding: "4px 9px",
  fontSize: 11,
  fontWeight: 900,
};

const badgeOk: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#15803D",
};

const badgeWarn: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#B45309",
};

const badgeCritical: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
};

const badgeCriticalDark: React.CSSProperties = {
  ...badgeNeutral,
  border: "1px solid #991B1B",
  background: "#7F1D1D",
  color: "#FFFFFF",
};



























































