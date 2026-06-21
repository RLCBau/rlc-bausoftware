// apps/web/src/components/RlcKiAssistant.tsx
import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { API_BASE } from "../lib/apiBase";
import { LV, type LVPos } from "../pages/kalkulation/store.lv";
import {
  KalkulationsDatenbank,
  type KalkulationsErfahrung,
} from "../pages/kalkulation/kalkulationsDatenbank";

function rlcNum(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const raw = String(value).trim();
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = typeof value === "number" ? value : Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeReactText(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object") {
    return String(
      value.title ||
      value.text ||
      value.nextLabel ||
      value.label ||
      value.action ||
      value.filter ||
      ""
    );
  }

  return String(value);
}
function hasValidKiCalculation(row: any): boolean {
  const validSources = [
    "company-calibration",
    "technical-parser",
    "recipe",
    "rule-engine",
    "database",
    "x84-reverse-urkalkulation",
    "openai",
    "server",
  ];

  const source = String(row?.source || "").trim();

  return (
    rlcNum(row?.rlcKiUnitPrice) > 0 ||
    rlcNum(row?.finalUnitPrice) > 0 ||
    rlcNum(row?.preis) > 0 ||
    rlcNum(row?.totalNet) > 0 ||
    rlcNum(row?.rlcKiTotal) > 0 ||
    rlcNum(row?.gesamt) > 0 ||
    (Array.isArray(row?.priceBreakdown) && row.priceBreakdown.length > 0) ||
    !!row?.reverseUrkalkulation ||
    validSources.includes(source)
  );
}

type ChatMsg = {
  role: "user" | "assistant";
  text: string;
};

type KiChangeLog = {
  title: string;
  changes: string[];
  warnings?: string[];
  unchanged?: string[];
};

type ModuleKey =
  | "kalkulation"
  | "mengenermittlung"
  | "cad"
  | "buro"
  | "ki"
  | "buchhaltung"
  | "info"
  | "projekt"
  | "start"
  | "global";

type PageKey =
  | "kalkulation-uebersicht"
  | "kalkulation-lv"
  | "kalkulation-mit-ki"
  | "kalkulation-datenbank"
  | "kalkulation-gaeb"
  | "kalkulation-preise"
  | "kalkulation-angebot"
  | "kalkulation-nachtraege"
  | "kalkulation-versionsvergleich"
  | "kalkulation-crm"
  | "kalkulation-rezepte"
  | "projekt-uebersicht"
  | "start-projekt"
  | "mengenermittlung"
  | "cad"
  | "buro"
  | "buchhaltung"
  | "ki"
  | "info"
  | "global";

type ButtonKind = "primary" | "secondary" | "danger";

type ActiveKiSuggestion = {
  id?: string;
  module?: string;
  pageKey?: string;
  level?: "info" | "success" | "warning" | "critical";
  title: string;
  text?: string;
  message?: string;
  nextLabel?: string;
  eventName?: string;
  action?: string;
  filter?: string;
  autoOpen?: boolean;
  pulse?: boolean;
};
type AssistantAction = {
  label: string;
  kind?: ButtonKind;
  disabled?: boolean;
  onClick: () => void;
};

const ME_FIX: Record<string, string> = {
  qm: "m²",
  m2: "m²",
  "m^2": "m²",
  qkm: "km²",
  qdm: "dm²",
  qcm: "cm²",
  qmm: "mm²",
  mtr: "m",
  meter: "m",
  stk: "St",
  st: "St",
  stck: "St",
  std: "h",
  stunden: "h",
  m3: "m³",
  "m^3": "m³",
  pauschal: "PS",
  ps: "PS",
};

function apiUrl(path: string): string {
  const base = String(API_BASE || "").replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  if (!base) return cleanPath;

  if (base.endsWith("/api") && cleanPath.startsWith("/api/")) {
    return `${base}${cleanPath.slice(4)}`;
  }

  return `${base}${cleanPath}`;
}

function getAuthToken(): string {
  const keys = [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc.auth.token",
    "rlc_mobile_token",
    "rlc_auth_token",
    "rlc_access_token",
  ];

  for (const key of keys) {
    const v = localStorage.getItem(key);
    if (v && v.trim()) return v.trim();
  }

  const jsonKeys = ["rlc_auth", "auth", "user", "session", "rlc_session"];

  for (const key of jsonKeys) {
    try {
      const auth = JSON.parse(localStorage.getItem(key) || "null");
      const token =
        auth?.token ??
        auth?.accessToken ??
        auth?.authToken ??
        auth?.jwt ??
        auth?.data?.token ??
        auth?.data?.accessToken;

      if (typeof token === "string" && token.trim()) return token.trim();
    } catch {
      //
    }
  }

  return "";
}

function n(value: unknown): number {
  const raw = String(value ?? "0")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, "")
    .replace(",", ".");

  const x = Number(raw);
  return Number.isFinite(x) ? x : 0;
}

function money(value: unknown): string {
  return `${n(value).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

function pct(value: unknown): string {
  const v = n(value);
  const percent = v <= 1 ? v * 100 : v;
  return `${Math.round(percent)} %`;
}

function norm(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowLabel(r: Partial<LVPos>): string {
  const pos = String(r.posNr || "").trim();
  const text = String(r.kurztext || "").trim();

  if (pos && text) return `Pos. ${pos} – ${text.slice(0, 70)}`;
  if (pos) return `Pos. ${pos}`;
  if (text) return text.slice(0, 80);

  return String(r.id || "Position");
}

function dbLabel(r: Partial<KalkulationsErfahrung>): string {
  const pos = String(r.posNr || "").trim();
  const text = String(r.kurztext || "").trim();

  if (pos && text) return `DB ${pos} – ${text.slice(0, 70)}`;
  if (pos) return `DB ${pos}`;
  if (text) return text.slice(0, 80);

  return String(r.id || "Datenbankeintrag");
}

function rowPrice(r: LVPos): number {
  return n(r.finalUnitPrice ?? r.preis ?? r.suggestedUnitPrice ?? r.baseUnitPrice);
}

function lvDuplicateKey(r: LVPos): string {
  const text = norm(`${r.kurztext || ""} ${r.langtext || ""}`);
  const unit = norm(r.einheit);
  const qty = Math.round(n(r.menge) * 1000) / 1000;
  const price = Math.round(rowPrice(r) * 100) / 100;

  if (text.length < 8) return "";

  return `${text}|${unit}|${qty}|${price}`;
}

function dbEntryPrice(e: KalkulationsErfahrung): number {
  return n(e.kosten?.epNetto);
}

function dbDuplicateKey(e: KalkulationsErfahrung): string {
  const text = norm(`${e.kurztext || ""} ${e.langtext || ""}`);
  const unit = norm(e.einheit);
  const price = Math.round(dbEntryPrice(e) * 100) / 100;

  if (text.length < 8) return "";

  return `${text}|${unit}|${price}`;
}

function getLvDuplicateGroups(rows: LVPos[]): LVPos[][] {
  const map = new Map<string, LVPos[]>();

  for (const row of rows) {
    const key = lvDuplicateKey(row);
    if (!key) continue;

    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }

  return Array.from(map.values()).filter((x) => x.length > 1);
}

function getDbDuplicateGroups(rows: KalkulationsErfahrung[]): KalkulationsErfahrung[][] {
  const map = new Map<string, KalkulationsErfahrung[]>();

  for (const row of rows) {
    const key = dbDuplicateKey(row);
    if (!key) continue;

    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }

  return Array.from(map.values()).filter((x) => x.length > 1);
}

function getModuleKey(pathname: string): ModuleKey {
  if (pathname.startsWith("/kalkulation")) return "kalkulation";
  if (pathname.startsWith("/mengenermittlung")) return "mengenermittlung";
  if (pathname.startsWith("/cad")) return "cad";
  if (pathname.startsWith("/buro")) return "buro";
  if (pathname.startsWith("/ki")) return "ki";
  if (pathname.startsWith("/buchhaltung")) return "buchhaltung";
  if (pathname.startsWith("/info")) return "info";
  if (pathname.startsWith("/projekt")) return "projekt";
  if (pathname.startsWith("/start")) return "start";

  return "global";
}

function getPageKey(pathname: string): PageKey {
  if (pathname === "/start" || pathname === "/start/") return "start-projekt";

  if (
    pathname.startsWith("/projekt/uebersicht") ||
    pathname.startsWith("/projekt/übersicht")
  ) {
    return "projekt-uebersicht";
  }

  if (pathname.startsWith("/kalkulation/nachtraege")) return "kalkulation-nachtraege";
  if (pathname.startsWith("/kalkulation/versionsvergleich")) {
    return "kalkulation-versionsvergleich";
  }
  if (pathname.startsWith("/kalkulation/crm")) return "kalkulation-crm";

  if (
    pathname.startsWith("/kalkulation/rezepte") ||
    pathname.startsWith("/kalkulation/recipes") ||
    pathname.startsWith("/kalkulation/urkalkulation")
  ) {
    return "kalkulation-rezepte";
  }

  if (pathname === "/kalkulation" || pathname === "/kalkulation/") {
    return "kalkulation-uebersicht";
  }

  if (
    pathname.startsWith("/kalkulation/lv-import") ||
    pathname.startsWith("/kalkulation/lv")
  ) {
    return "kalkulation-lv";
  }

  if (pathname.startsWith("/kalkulation/mit-ki")) return "kalkulation-mit-ki";

  if (
    pathname.startsWith("/kalkulation/datenbank/preise") ||
    pathname.startsWith("/kalkulation/preise")
  ) {
    return "kalkulation-preise";
  }

  if (pathname.startsWith("/kalkulation/datenbank")) return "kalkulation-datenbank";
  if (pathname.startsWith("/kalkulation/gaeb")) return "kalkulation-gaeb";
  if (pathname.startsWith("/kalkulation/angebot")) return "kalkulation-angebot";
  if (pathname.startsWith("/mengenermittlung")) return "mengenermittlung";
  if (pathname.startsWith("/cad")) return "cad";
  if (pathname.startsWith("/buro")) return "buro";
  if (pathname.startsWith("/buchhaltung")) return "buchhaltung";
  if (pathname.startsWith("/ki")) return "ki";
  if (pathname.startsWith("/info")) return "info";

  return "global";
}

function routeLabel(pathname: string): string {
  const pageKey = getPageKey(pathname);

  if (pageKey === "kalkulation-lv") return "Kalkulation · LV / Positionen";
  if (pageKey === "kalkulation-mit-ki") return "Kalkulation · KI-Kalkulation";
  if (pageKey === "kalkulation-datenbank") return "Kalkulation · Kalkulationsdatenbank";
  if (pageKey === "kalkulation-gaeb") return "Kalkulation · GAEB";
  if (pageKey === "kalkulation-preise") return "Kalkulation · Preise";
  if (pageKey === "kalkulation-angebot") return "Kalkulation · Angebot";
  if (pageKey === "kalkulation-nachtraege") return "Kalkulation · Nachträge";
  if (pageKey === "kalkulation-versionsvergleich") {
    return "Kalkulation · Versionsvergleich / Angebotsanalyse";
  }
  if (pageKey === "kalkulation-crm") return "Kalkulation · CRM / Angebotsverfolgung";
  if (pageKey === "kalkulation-rezepte") return "Kalkulation · Urkalkulation / Rezepte";
  if (pageKey === "projekt-uebersicht") return "Projektübersicht";
  if (pageKey === "start-projekt") return "Start · Projekt auswählen";

  if (pathname.startsWith("/kalkulation")) return "Kalkulation";
  if (pathname.startsWith("/mengenermittlung")) return "Mengenermittlung";
  if (pathname.startsWith("/cad")) return "CAD / PDF";
  if (pathname.startsWith("/buro")) return "Büro / Verwaltung";
  if (pathname.startsWith("/ki")) return "KI";
  if (pathname.startsWith("/buchhaltung")) return "Buchhaltung";
  if (pathname.startsWith("/info")) return "Info / Hilfe";
  if (pathname.startsWith("/projekt")) return "Projektübersicht";
  if (pathname.startsWith("/start")) return "Start";

  return "RLC Bausoftware";
}

function pageIntro(pageKey: PageKey): string {
  if (pageKey === "start-projekt") {
    return "Ich steuere hier die Startseite: Projekte neu laden, suchen, öffnen, neu anlegen, project.json importieren und direkt zur Projektübersicht wechseln.";
  }

  if (pageKey === "projekt-uebersicht") {
    return "Ich steuere hier die Projekt-Übersicht: Projektstatus prüfen, Module öffnen, Schnellzugriffe nutzen, Kalkulation/LV/Angebot starten und zur Projekt-Auswahl wechseln.";
  }

  if (pageKey === "kalkulation-rezepte") {
    return "Ich steuere hier die Urkalkulation: Position erfassen, Ressourcen vorschlagen, Langtext erzeugen, EP/GP kalkulieren, Preisaufbau prüfen, Rezept speichern, Datenbank aktualisieren und die Position an LV, Nachträge, Angebot oder GAEB übergeben.";
  }

  if (pageKey === "kalkulation-gaeb") {
    return "Ich steuere die GAEB-Seite direkt: Fehler korrigieren, X83/X84 prüfen, Export erstellen, Import speichern, Fehler anzeigen und ausgewählte Positionen entfernen.";
  }

  if (pageKey === "kalkulation-versionsvergleich") {
    return "Ich steuere hier die Angebotsanalyse: LV-Version speichern, CSV importieren, Versionen vergleichen, Abweichungen prüfen, Risikoanalyse ausführen und PDF exportieren.";
  }

  if (pageKey === "kalkulation-crm") {
    return "Ich steuere hier die Angebotsverfolgung: offene Angebote, überfällige Follow-ups, nächste Aktionen, Kundenkontakte, fehlende PDF-Links und Statuspflege.";
  }

  if (pageKey === "kalkulation-nachtraege") {
    return "Ich prüfe hier Nachträge, fehlende Begründungen, Mengen, EP, Einheiten, Dubletten, Angebot-Übergabe, PDF und Server-Speicherung.";
  }

  if (pageKey === "kalkulation-uebersicht") {
    return "Ich bin in der Kalkulationszentrale. Ich sehe LV, Datenbank, KI-Kalkulation, GAEB und Angebot und führe dich zum nächsten sinnvollen Schritt.";
  }

  if (pageKey === "kalkulation-lv") {
    return "Ich prüfe hier LV-Positionen, fehlende Einheiten, Mengen, EP, Langtexte, Dubletten und Übergabe an GAEB oder KI-Kalkulation.";
  }

  if (pageKey === "kalkulation-mit-ki") {
    return "Ich prüfe hier LV-Positionen, fehlende Mengen/Einheiten, EP, Urkalkulation und doppelte LV-Positionen.";
  }

  if (pageKey === "kalkulation-datenbank") {
    return "Ich prüfe hier die Kalkulationsdatenbank: Erfahrungswerte, Preise, Ressourcen, Risiken, Dubletten und Wiederverwendbarkeit.";
  }

  if (pageKey === "kalkulation-preise") {
    return "Ich prüfe Preislisten, Material, Maschinen, Lohnansätze, Dubletten und fehlende Einheitspreise.";
  }

  if (pageKey === "mengenermittlung") {
    return "Ich helfe bei Aufmaß, Mengen, Regieberichten, Lieferscheinen, Fotos, Soll-Ist und Abrechnung.";
  }

  if (pageKey === "cad") {
    return "Ich helfe bei PDF/CAD, Layern, Plänen, As-Built, Importen und technischen Prüfungen.";
  }

  if (pageKey === "buchhaltung") {
    return "Ich helfe bei Rechnungen, Abschlägen, Kostenstellen, Zahlungseingängen, Mahnwesen und Export.";
  }

  if (pageKey === "buro") {
    return "Ich helfe bei Projekten, Dokumenten, Aufgaben, Nutzern, Kalender, Ressourcen und Verwaltung.";
  }

  if (pageKey === "ki") {
    return "Ich helfe bei KI-Funktionen, automatischer LV-Erstellung, Fotoerkennung, Sprache und Analyse.";
  }

  return "Ich erkenne die aktuelle Seite und zeige passende Kontrollen, Aktionen und Hilfe.";
}

function lvScore(row: LVPos): number {
  return (
    (row.posNr ? 10 : 0) +
    (row.kurztext ? 10 : 0) +
    (row.langtext ? 6 : 0) +
    (row.einheit ? 5 : 0) +
    (n(row.menge) > 0 ? 10 : 0) +
    (rowPrice(row) > 0 ? 10 : 0) +
    (row.priceBreakdown?.length ? 8 : 0)
  );
}

function dbScore(row: KalkulationsErfahrung): number {
  return (
    (row.posNr ? 8 : 0) +
    (row.kurztext ? 10 : 0) +
    (row.langtext ? 6 : 0) +
    (row.einheit ? 6 : 0) +
    (n(row.menge) > 0 ? 6 : 0) +
    (dbEntryPrice(row) > 0 ? 12 : 0) +
    (row.ressourcen?.length ? 10 : 0) +
    (n(row.verwendungen) > 0 ? 5 : 0) +
    Math.round(n(row.confidence) * 10)
  );
}

function getProjectCodeFromPage(): string {
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("projectCode");

    if (fromUrl) return fromUrl.trim().toUpperCase();

    const body = document.body?.innerText || "";
    const matches = body.match(/\bBA-\d{4}-[A-Z0-9_-]+\b/i);

    if (matches?.[0]) return matches[0].trim().toUpperCase();

    const keys = [
      "rlc_current_project",
      "currentProject",
      "selectedProject",
      "rlc_project",
      "project",
    ];

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const p = JSON.parse(raw);
        const code = String(p?.code ?? p?.number ?? p?.projektnummer ?? "").trim();

        if (code) return code.toUpperCase();
      } catch {
        const code = raw.match(/\bBA-\d{4}-[A-Z0-9_-]+\b/i)?.[0];
        if (code) return code.toUpperCase();
      }
    }
  } catch {
    //
  }

  return "";
}

function compactKiText(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const oneLine = raw.replace(/\s+/g, " ");
  const lower = oneLine.toLowerCase();

  if (lower.includes("ki-cache") || lower.includes("cache verwendet")) {
    return "KI-Cache verwendet.";
  }

  if (lower.includes("openai") && lower.includes("nicht notwendig")) {
    return "OpenAI nicht notwendig.";
  }

  if (lower.includes("openai") && lower.includes("schätzung")) {
    return "OpenAI-Schätzung verwendet.";
  }

  if (lower.includes("regel-engine") || lower.includes("rule-engine")) {
    return "Regel-Engine-Fallback verwendet.";
  }

  if (lower.includes("bereits vollständig") || lower.includes("übersprungen")) {
    return oneLine.replace(
      "Bereits vollständig / übersprungen:",
      "Bereits vollständig:"
    );
  }

  return oneLine;
}

function uniqueCompactList(values?: unknown[], max = 10): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values || []) {
    const text = compactKiText(value);
    if (!text) continue;

    const key = norm(text);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    out.push(text);

    if (out.length >= max) break;
  }

  return out;
}

function compactKiLog(detail?: Partial<KiChangeLog> | null): KiChangeLog {
  const changesRaw = Array.isArray(detail?.changes) ? detail?.changes : [];
  const warningsRaw = Array.isArray(detail?.warnings) ? detail?.warnings : [];
  const unchangedRaw = Array.isArray(detail?.unchanged) ? detail?.unchanged : [];

  return {
    title: compactKiText(detail?.title) || "KI-Analyse abgeschlossen",
    changes: uniqueCompactList(changesRaw, 6),
    warnings: uniqueCompactList(warningsRaw, 4),
    unchanged: uniqueCompactList(unchangedRaw, 3),
  };
}

export default function RlcKiAssistant() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"steuerung" | "support">("steuerung");
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);

  const [kiWorking, setKiWorking] = React.useState(false);
  const [kiProgress, setKiProgress] = React.useState(0);
  const [kiProgressText, setKiProgressText] = React.useState("");
  const [kiLog, setKiLog] = React.useState<KiChangeLog | null>(null);

  const [activeKiSuggestion, setActiveKiSuggestion] =
    React.useState<ActiveKiSuggestion | null>(null);
const [kiSignalPulse, setKiSignalPulse] = React.useState(false);
  const [secretaryAlert, setSecretaryAlert] = React.useState("");
  const secretaryLastSignatureRef = React.useRef("");
    const moduleKey = getModuleKey(pathname);
  const pageKey = getPageKey(pathname);
  const current = routeLabel(pathname);
  const chatStorageKey = `rlc_ki_assistant_chat_v2:${pageKey}`;

  const [messages, setMessages] = React.useState<ChatMsg[]>([
    {
      role: "assistant",
      text: "Ich bin der RLC-KI Assistent. Ich erkenne die aktuelle Seite und gebe passende Hilfe, Prüfungen und Aktionen.",
    },
  ]);

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(chatStorageKey);
      const parsed = raw ? JSON.parse(raw) : null;

      if (Array.isArray(parsed) && parsed.length) {
        const clean = parsed.filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.text === "string"
        );

        if (clean.length) setMessages(clean);
      }
    } catch {
      //
    }
  }, [chatStorageKey]);

  React.useEffect(() => {
    try {
      sessionStorage.setItem(chatStorageKey, JSON.stringify(messages.slice(-30)));
    } catch {
      //
    }
  }, [chatStorageKey, messages]);

  React.useEffect(() => {
    setStatus("");
  }, [pathname]);

  React.useEffect(() => {
    function onStart(event: Event) {
      const detail = (event as CustomEvent<any>).detail || {};

      setOpen(true);
      setTab("steuerung");
      setKiWorking(true);
      setKiProgress(12);
      setKiProgressText(String(detail.text || detail.title || "KI arbeitet…"));
      setKiLog(null);
    }

    function onProgress(event: Event) {
      const detail = (event as CustomEvent<any>).detail || {};

      setKiWorking(true);
      setKiProgress(Math.max(5, Math.min(95, n(detail.progress || 35))));
      setKiProgressText(String(detail.text || "KI prüft Daten…"));
    }

    function onResult(event: Event) {
      const detail = (event as CustomEvent<KiChangeLog>).detail;

      setOpen(true);
      setTab("steuerung");
      setKiWorking(false);
      setKiProgress(100);
      setKiProgressText("Aktion abgeschlossen.");
      setKiLog(compactKiLog(detail));

      setRefresh((x) => x + 1);
    }

    window.addEventListener("rlc:ki-action-start", onStart);
    window.addEventListener("rlc:ki-action-progress", onProgress);
    window.addEventListener("rlc:ki-action-result", onResult);

    return () => {
      window.removeEventListener("rlc:ki-action-start", onStart);
      window.removeEventListener("rlc:ki-action-progress", onProgress);
      window.removeEventListener("rlc:ki-action-result", onResult);
    };
  }, []);


  React.useEffect(() => {
    function onActiveKiSuggestion(event: Event) {
      const detail = (event as CustomEvent<ActiveKiSuggestion>).detail;

      if (!detail?.title) return;

      const nextSuggestion: ActiveKiSuggestion = {
        ...detail,
        text: detail.text || detail.message || "",
        pageKey: detail.pageKey || pageKey,
      };

      setActiveKiSuggestion(nextSuggestion);
      setKiSignalPulse(true);
      setKiLog(null);
      setKiProgress(0);
      setKiProgressText("");

    }

    function onActiveKiClear() {
      setActiveKiSuggestion(null);
      setKiSignalPulse(false);
    }

    window.addEventListener("rlc:active-ki-suggestion", onActiveKiSuggestion);
    window.addEventListener("rlc:active-ki-clear", onActiveKiClear);

    return () => {
      window.removeEventListener("rlc:active-ki-suggestion", onActiveKiSuggestion);
      window.removeEventListener("rlc:active-ki-clear", onActiveKiClear);
    };
  }, [pageKey]);

  const lvRows = React.useMemo(() => {
    try {
      return LV.list();
    } catch {
      return [];
    }
  }, [pathname, open, refresh]);

  const dbRows = React.useMemo(() => {
    try {
      return KalkulationsDatenbank.list();
    } catch {
      return [];
    }
  }, [pathname, open, refresh]);

  const lvDuplicateGroups = React.useMemo(() => getLvDuplicateGroups(lvRows), [lvRows]);
  const dbDuplicateGroups = React.useMemo(() => getDbDuplicateGroups(dbRows), [dbRows]);

  const lvDuplicateCount = React.useMemo(
    () => lvDuplicateGroups.reduce((sum, g) => sum + Math.max(0, g.length - 1), 0),
    [lvDuplicateGroups]
  );

  const dbDuplicateCount = React.useMemo(
    () => dbDuplicateGroups.reduce((sum, g) => sum + Math.max(0, g.length - 1), 0),
    [dbDuplicateGroups]
  );

  const [runtimeKalkulationSummary, setRuntimeKalkulationSummary] =
    React.useState<any>(() => {
      try {
        return (window as any).__RLC_KALKULATION_RUNTIME_SUMMARY__ || null;
      } catch {
        return null;
      }
    });

  React.useEffect(() => {
    function onRuntimeSummary(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail) setRuntimeKalkulationSummary(detail);
    }

    window.addEventListener("rlc:kalkulation-runtime-summary", onRuntimeSummary);

    const currentSummary = (window as any).__RLC_KALKULATION_RUNTIME_SUMMARY__;
    if (currentSummary) setRuntimeKalkulationSummary(currentSummary);

    return () => {
      window.removeEventListener("rlc:kalkulation-runtime-summary", onRuntimeSummary);
    };
  }, [pathname, open, refresh]);

  const lvStats = React.useMemo(() => {
    const missingUnits = lvRows.filter((r) => !String(r.einheit || "").trim()).length;
    const missingQty = lvRows.filter((r) => n(r.menge) <= 0).length;
    const missingPrice = lvRows.filter((r) => rowPrice(r) <= 0).length;
    const missingBreakdown = lvRows.filter((r) => !hasValidKiCalculation(r)).length;

    const safeRows = lvRows.filter(
      (r) =>
        String(r.kurztext || "").trim() &&
        String(r.einheit || "").trim() &&
        n(r.menge) > 0 &&
        rowPrice(r) > 0
    ).length;

    const projectCode = getProjectCodeFromPage();

    function readKiRowsForAssistant(): any[] {
      const directKeys = [
        projectCode ? `rlc_kalkulation_mit_ki_elite_v1:${projectCode}` : "",
      ].filter(Boolean);

      const fallbackKeys = Object.keys(localStorage)
        .filter((key) => key.startsWith("rlc_kalkulation_mit_ki_elite_v1:"))
        .sort((a, b) => {
          const aHit = projectCode && a.includes(projectCode) ? 1 : 0;
          const bHit = projectCode && b.includes(projectCode) ? 1 : 0;
          return bHit - aHit;
        });

      for (const key of [...directKeys, ...fallbackKeys]) {
        try {
          const raw = localStorage.getItem(key);
          const parsed = raw ? JSON.parse(raw) : null;
          const rows = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.rows)
            ? parsed.rows
            : [];

          if (rows.length) return rows;
        } catch {
          // ignore broken localStorage entries
        }
      }

      return [];
    }

    function readServerKiSummaryForAssistant(): any | null {
      const directKeys = [
        projectCode ? `rlc_kalkulation_server_summary_v1:${projectCode}` : "",
      ].filter(Boolean);

      const fallbackKeys = Object.keys(localStorage)
        .filter((key) => key.startsWith("rlc_kalkulation_server_summary_v1:"))
        .sort((a, b) => {
          const aHit = projectCode && a.includes(projectCode) ? 1 : 0;
          const bHit = projectCode && b.includes(projectCode) ? 1 : 0;
          return bHit - aHit;
        });

      for (const key of [...directKeys, ...fallbackKeys]) {
        try {
          const raw = localStorage.getItem(key);
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed && Number(parsed.totalNet || 0) > 0) return parsed;
        } catch {
          // ignore broken localStorage entries
        }
      }

      return null;
    }

    const serverKiSummary = readServerKiSummaryForAssistant();
    const kiRowsForNet = readKiRowsForAssistant();

    const kiNet = kiRowsForNet.reduce((sum, r) => {
      const qty = n(r.menge ?? r.quantity);
      const ep = n(
        r.rlcKiUnitPrice ??
          r.finalUnitPrice ??
          r.suggestedUnitPrice ??
          r.unitPrice ??
          r.preis
      );
      const gp = n(
        r.rlcKiTotal ??
          r.totalNet ??
          r.gesamt
      );

      return sum + (gp > 0 ? gp : qty * ep);
    }, 0);

    const net =
      kiNet > 0
        ? kiNet
        : lvRows.reduce((sum, r) => sum + n(r.menge) * rowPrice(r), 0);

    const unitFixable = lvRows.filter((r) => {
      const key = String(r.einheit || "").trim().toLowerCase();
      return !!ME_FIX[key] && ME_FIX[key] !== r.einheit;
    }).length;

    const missingPosNr = lvRows.filter((r) => !String(r.posNr || "").trim()).length;
    const missingText = lvRows.filter(
      (r) => !String(r.kurztext || "").trim() && !String(r.langtext || "").trim()
    ).length;

    const runtime =
      pathname.includes("/kalkulation") && runtimeKalkulationSummary
        ? runtimeKalkulationSummary
        : null;


    const runtimeKiNet =
      rlcNum((runtime as any)?.rlcKiNet) ||
      rlcNum((runtime as any)?.rlcKiTotal) ||
      rlcNum((runtime as any)?.kiNet) ||
      rlcNum((runtime as any)?.kiTotal);

    const hasRuntimeKiCalculation = runtimeKiNet > 0;
    return {
      count: runtime?.count ?? lvRows.length,
      net,
      duplicateCount: runtime?.duplicateCount ?? lvDuplicateCount,
      missingUnits: runtime?.missingUnits ?? missingUnits,
      missingQty: runtime?.missingQty ?? missingQty,
      missingPrice: hasRuntimeKiCalculation ? 0 : runtime?.missingPrice ?? missingPrice,
      missingBreakdown: hasRuntimeKiCalculation ? 0 : missingBreakdown,
      activeKi: runtime?.activeKi ?? null,
      safeRows,
      unitFixable,
      missingPosNr,
      missingText,
    };
  }, [lvRows, lvDuplicateCount, pathname, runtimeKalkulationSummary]);

  const dbStats = React.useMemo(() => {
    const missingUnit = dbRows.filter((r) => !String(r.einheit || "").trim()).length;
    const missingPrice = dbRows.filter((r) => dbEntryPrice(r) <= 0).length;
    const missingResources = dbRows.filter((r) => !r.ressourcen?.length).length;
    const highRisk = dbRows.filter((r) => r.risiko === "hoch" || r.risiko === "kritisch").length;
    const lowConfidence = dbRows.filter((r) => n(r.confidence) < 0.7).length;
    const used = dbRows.filter((r) => n(r.verwendungen) > 0).length;
    const avgConfidence =
      dbRows.length > 0
        ? dbRows.reduce((sum, r) => sum + n(r.confidence), 0) / dbRows.length
        : 0;

    return {
      count: dbRows.length,
      duplicateCount: dbDuplicateCount,
      missingUnit,
      missingPrice,
      missingResources,
      highRisk,
      lowConfidence,
      used,
      avgConfidence,
    };
  }, [dbRows, dbDuplicateCount]);

  const gaebLocalProblems = React.useMemo(() => {
    return (
      lvStats.missingPosNr +
      lvStats.missingText +
      lvStats.missingUnits +
      lvStats.missingQty +
      lvStats.duplicateCount
    );
  }, [lvStats]);

  function startLocalProgress(titleText: string) {
    setOpen(true);
    setTab("steuerung");
    setKiWorking(true);
    setKiProgress(18);
    setKiProgressText(titleText);
    setKiLog(null);

    window.setTimeout(() => setKiProgress((p) => Math.max(p, 45)), 350);
    window.setTimeout(() => setKiProgress((p) => Math.max(p, 72)), 900);
  }

  function finishLocalProgress(log: KiChangeLog) {
    setKiWorking(false);
    setKiProgress(100);
    setKiProgressText("Aktion abgeschlossen.");
    setKiLog(compactKiLog(log));
  }

  function sendPageCommand(eventName: string, detail: Record<string, unknown>) {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
    setTab("steuerung");
  }


  function runActiveKiSuggestion(activeKi: ActiveKiSuggestion | null) {
    if (!activeKi) return;

    setKiSignalPulse(false);

    const eventName = activeKi.eventName || "rlc:kalkulation-filter";
    const action = String(activeKi.action || "").trim();
    const filter = String(activeKi.filter || "").trim();

    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: {
          ...activeKi,
          action,
          filter,
        },
      })
    );

    setStatus(activeKi.nextLabel || activeKi.title || "KI-Aktion gestartet.");
    setKiSignalPulse(false);
    setOpen(true);
    setTab("steuerung");

    window.setTimeout(() => setRefresh((x) => x + 1), 250);
  }

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  function sendSimpleCommand(eventName: string, action: string, label: string) {
    sendPageCommand(eventName, { action });
    setStatus(label);
  }

  function sendSimpleFilter(eventName: string, filter: string, label: string) {
    sendPageCommand(eventName, { filter });
    setStatus(label);
  }

  function sendRezepteCommand(action: string) {
    sendPageCommand("rlc:rezepte-command", { action });

    const label: Record<string, string> = {
      newPosition: "Neue Urkalkulationsposition wird vorbereitet.",
      suggestResources: "KI-Ressourcen werden vorgeschlagen.",
      generateLongText: "Langtext wird automatisch erzeugt.",
      importLibraryCsv: "Bibliothek-CSV-Import wird geöffnet.",
      refreshLibrary: "Bibliothek wird aktualisiert.",
      saveCompanyRecipe: "Firmen-Rezept wird gespeichert.",
      saveDatabase: "Position wird in der Kalkulationsdatenbank gespeichert.",
      insertPosition: "Position wird übernommen.",
      calculatePriceBuildUp: "KI mit Preisaufbau wird gestartet.",
      exportCsv: "CSV-Export wird gestartet.",
      exportPdf: "PDF-Export wird gestartet.",
      checkResources: "Ressourcen werden geprüft.",
      checkSurcharges: "Zuschläge und EP werden geprüft.",
    };

    setStatus(label[action] || `Urkalkulation-Aktion gestartet: ${action}`);
  }

  function sendVersionsvergleichCommand(action: string) {
    sendPageCommand("rlc:versionsvergleich-command", { action });

    const label: Record<string, string> = {
      saveCurrentLv: "Aktuelles LV wird als Version gespeichert.",
      importCsv: "CSV-Import wird geöffnet.",
      analyseCurrent: "Analyse wird gestartet.",
      compareSelected: "Ausgewählte Versionen werden verglichen.",
      showPriceDiffs: "Preisabweichungen werden angezeigt.",
      showQtyDiffs: "Mengenabweichungen werden angezeigt.",
      showUnitDiffs: "Einheitsabweichungen werden angezeigt.",
      showTextDiffs: "Textabweichungen werden angezeigt.",
      riskAnalysis: "Risikoanalyse wird gestartet.",
      exportPdf: "PDF-Export wird gestartet.",
      exportCsv: "CSV-Export wird gestartet.",
    };

    setStatus(label[action] || `Analyse-Aktion gestartet: ${action}`);
  }

  function sendCrmCommand(action: string) {
    sendPageCommand("rlc:crm-command", { action });

    const label: Record<string, string> = {
      showOpen: "Offene Angebote werden angezeigt.",
      showOverdue: "Überfällige Follow-ups werden angezeigt.",
      showToday: "Heutige Follow-ups werden angezeigt.",
      showMissingContact: "Angebote ohne Kontakt werden angezeigt.",
      showMissingAction: "Angebote ohne nächste Aktion werden angezeigt.",
      showMissingPdf: "Angebote ohne PDF oder Link werden angezeigt.",
      createFollowUp: "Follow-up wird vorbereitet.",
      markNachgefasst: "Angebot wird als nachgefasst markiert.",
      markGewonnen: "Angebot wird als gewonnen markiert.",
      markVerloren: "Angebot wird als verloren markiert.",
      riskAnalysis: "CRM-Risikoanalyse wird gestartet.",
      exportPdf: "CRM-Auswertung wird als PDF exportiert.",
      syncServer: "CRM-Daten werden am Server gespeichert.",
    };

    setStatus(label[action] || `CRM-Aktion gestartet: ${action}`);
  }

  function sendGaebCommand(action: string, extra?: Record<string, unknown>) {
    sendPageCommand("rlc:gaeb-command", { action, ...(extra || {}) });

    const label: Record<string, string> = {
      validate: "GAEB-Prüfung gestartet.",
      export: "GAEB-Export gestartet.",
      autoFixErrors: "GAEB-Fehlerkorrektur gestartet.",
      saveImportToServer: "GAEB-Import wird gespeichert.",
      showErrors: "GAEB-Fehler werden angezeigt.",
      deleteSelectedImportedFromLv: "Ausgewählte importierte Positionen werden entfernt.",
      clearImport: "GAEB-Import wird aus der Ansicht entfernt.",
    };

    setStatus(label[action] || `GAEB-Aktion gestartet: ${action}`);
  }

  function sendGaebFilter(filter: string) {
    sendPageCommand("rlc:gaeb-command", { filter });

    const label: Record<string, string> = {
      errors: "Filter: Fehler.",
      posNrFehlt: "Filter: Positionen ohne PosNr.",
      einheitFehlt: "Filter: Positionen ohne/falsche Einheit.",
      mengeFehlt: "Filter: Positionen ohne Menge.",
      doppelte: "Filter: Dubletten / Konflikte.",
    };

    setStatus(label[filter] || `GAEB-Filter aktiviert: ${filter}`);
  }

  function sendKalkulationFilter(filter: string) {
    sendSimpleFilter("rlc:kalkulation-filter", filter, `Filter aktiviert: ${filter}`);
  }

  function sendKalkulationAction(action: string) {
    const label =
      action === "runKi"
        ? "KI-Kalkulation läuft…"
        : action === "completeMissing"
        ? "Fehlende Daten werden ergänzt…"
        : "KI-Aktion läuft…";

    startLocalProgress(label);
    sendPageCommand("rlc:kalkulation-filter", { action });
    setStatus(`Aktion gestartet: ${action}`);
  }

  function deleteLvDuplicates() {
    if (!lvDuplicateGroups.length) {
      setStatus("Keine doppelten LV-Positionen gefunden.");
      finishLocalProgress({
        title: "Dublettenprüfung LV abgeschlossen",
        changes: [],
        unchanged: ["Keine doppelten LV-Positionen gefunden."],
      });
      return;
    }

    startLocalProgress("Doppelte LV-Positionen werden bereinigt…");

    const removeIds = new Set<string>();
    const changes: string[] = [];

    for (const group of lvDuplicateGroups) {
      const sorted = [...group].sort((a, b) => lvScore(b) - lvScore(a));
      const keep = sorted[0];

      sorted.slice(1).forEach((r) => {
        removeIds.add(r.id);
        changes.push(`${rowLabel(r)} gelöscht · behalten wurde ${rowLabel(keep)}.`);
      });
    }

    LV.setAll(lvRows.filter((r) => !removeIds.has(r.id)));

    setStatus(`${removeIds.size} doppelte LV-Position(en) gelöscht.`);
    setRefresh((x) => x + 1);
    window.dispatchEvent(new StorageEvent("storage", { key: LV.key }));

    finishLocalProgress({
      title: "Doppelte LV-Positionen bereinigt",
      changes,
    });
  }

  function deleteDbDuplicates() {
    if (!dbDuplicateGroups.length) {
      setStatus("Keine doppelten Datenbank-Einträge gefunden.");
      finishLocalProgress({
        title: "Dublettenprüfung Datenbank abgeschlossen",
        changes: [],
        unchanged: ["Keine doppelten Datenbank-Einträge gefunden."],
      });
      return;
    }

    startLocalProgress("Doppelte Datenbank-Einträge werden bereinigt…");

    const removeIds = new Set<string>();
    const changes: string[] = [];

    for (const group of dbDuplicateGroups) {
      const sorted = [...group].sort((a, b) => dbScore(b) - dbScore(a));
      const keep = sorted[0];

      sorted.slice(1).forEach((r) => {
        removeIds.add(r.id);
        changes.push(`${dbLabel(r)} gelöscht · behalten wurde ${dbLabel(keep)}.`);
      });
    }

    removeIds.forEach((id) => KalkulationsDatenbank.remove(id));

    setStatus(`${removeIds.size} doppelte Datenbank-Eintrag/Einträge gelöscht.`);
    setRefresh((x) => x + 1);
    window.dispatchEvent(new StorageEvent("storage", { key: KalkulationsDatenbank.key }));

    finishLocalProgress({
      title: "Doppelte Datenbank-Einträge bereinigt",
      changes,
    });
  }

  function normalizeLvUnits() {
    startLocalProgress("Einheiten werden für GAEB normalisiert…");

    const changes: string[] = [];
    const next = lvRows.map((r) => {
      const key = String(r.einheit || "").trim().toLowerCase();
      const fixed = ME_FIX[key];

      if (fixed && fixed !== r.einheit) {
        changes.push(`${rowLabel(r)}: Einheit ${r.einheit || "leer"} → ${fixed}`);
        return { ...r, einheit: fixed };
      }

      return r;
    });

    LV.setAll(next);

    setRefresh((x) => x + 1);
    window.dispatchEvent(new StorageEvent("storage", { key: LV.key }));

    setStatus(
      changes.length
        ? `${changes.length} Einheit(en) normalisiert.`
        : "Keine normalisierbaren Einheiten gefunden."
    );

    finishLocalProgress({
      title: "GAEB-Einheiten normalisiert",
      changes,
      unchanged: changes.length ? [] : ["Keine Einheiten mussten geändert werden."],
    });
  }

  function showGaebLocalProblems() {
    const warnings: string[] = [];

    if (lvStats.missingPosNr) warnings.push(`${lvStats.missingPosNr} Position(en) ohne Positionsnummer.`);
    if (lvStats.missingText) warnings.push(`${lvStats.missingText} Position(en) ohne Kurztext/Langtext.`);
    if (lvStats.missingUnits) warnings.push(`${lvStats.missingUnits} Position(en) ohne Einheit.`);
    if (lvStats.missingQty) warnings.push(`${lvStats.missingQty} Position(en) ohne Menge oder mit Menge 0.`);
    if (lvStats.duplicateCount) warnings.push(`${lvStats.duplicateCount} doppelte LV-Position(en).`);
    if (lvStats.unitFixable) warnings.push(`${lvStats.unitFixable} Einheit(en) können automatisch normalisiert werden.`);

    finishLocalProgress({
      title: "GAEB-Vorprüfung lokal",
      changes: warnings.length ? [] : ["Keine lokalen GAEB-Strukturprobleme gefunden."],
      warnings,
    });

    setStatus(
      warnings.length
        ? `Lokale GAEB-Vorprüfung: ${warnings.length} Problemgruppe(n) gefunden.`
        : "Lokale GAEB-Vorprüfung ohne Probleme."
    );
  }

  function makeSupportPrompt(kind: string): string {
    const base = `Aktuelle Seite: ${current}, Pfad: ${pathname}.`;

    if (kind === "start") {
      return `${base} Prüfe die Startseite fachlich: Projektliste, Suche, Schnellwahl, zuletzt geöffnete Projekte, neues Projekt, JSON/ZIP Import und ob der Nutzer den richtigen nächsten Schritt findet.`;
    }

    if (kind === "project") {
      return `${base} Prüfe die Projektübersicht fachlich: Projektcode, Projektname, Auftraggeber, Ort, Speicherart, letzter Zugriff, Modulnavigation, Schnellzugriffe und ob der Nutzer den richtigen nächsten Schritt sieht.`;
    }

    if (kind === "page") {
      return `${base} Erkläre professionell und konkret, was diese Seite macht und welche Schritte sinnvoll sind.`;
    }

    if (kind === "workflow") {
      return `${base} Gib mir einen klaren Arbeitsablauf mit Prioritäten, Prüfungen und typischen Fehlerquellen.`;
    }

    if (kind === "error") {
      return `${base} Hilf mir bei der Fehlersuche. Frage gezielt nach den notwendigen Informationen und schlage konkrete Kontrollen vor.`;
    }

    if (kind === "recipes") {
      return `${base} Prüfe die Urkalkulation fachlich: Positionsdaten, Menge, Einheit, direkte Kosten, Ressourcen, Zuschläge, EP, GP, Preisaufbau, Langtext, Datenbank-Rezept und Übergabe an LV/Nachtrag/Angebot/GAEB. Kontext: LV-Positionen ${lvStats.count}, Netto ${money(lvStats.net)}, fehlende Urkalkulationen ${lvStats.missingBreakdown}, fehlende Preise ${lvStats.missingPrice}, fehlende Mengen ${lvStats.missingQty}, Datenbank-Einträge ${dbStats.count}.`;
    }

    if (kind === "database") {
      return `${base} Prüfe die Kalkulationsdatenbank fachlich: Dubletten, fehlende EP, fehlende Ressourcen, schlechte Confidence, Risiken und Datenqualität.`;
    }

    if (kind === "gaeb") {
      return `${base} Prüfe GAEB fachlich und technisch. Kontext: LV-Positionen ${lvStats.count}, lokale GAEB-Probleme ${gaebLocalProblems}, fehlende PosNr ${lvStats.missingPosNr}, fehlende Einheit ${lvStats.missingUnits}, fehlende Menge ${lvStats.missingQty}, Dubletten ${lvStats.duplicateCount}.`;
    }

    if (kind === "versionsvergleich") {
      return `${base} Prüfe den Versionsvergleich fachlich: Welche Versionen sind sinnvoll vergleichbar, welche Preis-, Mengen-, Einheits- und Textabweichungen sind kritisch, und welche Risiken entstehen daraus? Kontext: LV-Positionen ${lvStats.count}, Netto ${money(lvStats.net)}, fehlende Preise ${lvStats.missingPrice}, fehlende Mengen ${lvStats.missingQty}, fehlende Einheiten ${lvStats.missingUnits}.`;
    }

    if (kind === "crm") {
      return `${base} Prüfe die Angebotsverfolgung fachlich: offene Angebote, überfällige Follow-ups, fehlende nächste Aktionen, fehlende Kontakte, fehlende PDF-Links, Statuspflege, Abschlusswahrscheinlichkeit und Risiken, dass Angebote vergessen oder nicht nachgefasst werden. Kontext: LV-Positionen ${lvStats.count}, Netto ${money(lvStats.net)}, fehlende Preise ${lvStats.missingPrice}, fehlende Mengen ${lvStats.missingQty}.`;
    }

    return base;
  }

  function buildSupportReport(): string {
    const lvProblems =
      lvStats.missingQty +
      lvStats.missingUnits +
      lvStats.missingPrice +
      lvStats.missingBreakdown +
      lvStats.duplicateCount;

    const dbProblems =
      dbStats.missingPrice +
      dbStats.missingUnit +
      dbStats.missingResources +
      dbStats.highRisk +
      dbStats.lowConfidence +
      dbStats.duplicateCount;

    const lines = [
      "RLC SUPPORTBERICHT",
      "===================",
      `Seite: ${current}`,
      `Pfad: ${pathname}`,
      `PageKey: ${pageKey}`,
      `ModuleKey: ${moduleKey}`,
      `Projektcode: ${getProjectCodeFromPage() || "nicht erkannt"}`,
      "",
      "LV / Kalkulation",
      `- LV-Positionen: ${lvStats.count}`,
      `- Netto Server-KI: ${money(lvStats.net)}`,
      `- Fehlende Mengen: ${lvStats.missingQty}`,
      `- Fehlende Einheiten: ${lvStats.missingUnits}`,
      `- Fehlende Preise: ${lvStats.missingPrice}`,
      `- Fehlende Urkalkulation: ${lvStats.missingBreakdown}`,
      `- Doppelte LV-Positionen: ${lvStats.duplicateCount}`,
      `- Offene LV-Probleme gesamt: ${lvProblems}`,
      "",
      "Kalkulationsdatenbank",
      `- Einträge: ${dbStats.count}`,
      `- Dubletten: ${dbStats.duplicateCount}`,
      `- EP fehlt: ${dbStats.missingPrice}`,
      `- Einheit fehlt: ${dbStats.missingUnit}`,
      `- Ressourcen fehlen: ${dbStats.missingResources}`,
      `- Risiko hoch/kritisch: ${dbStats.highRisk}`,
      `- Confidence niedrig: ${dbStats.lowConfidence}`,
      `- Ø Confidence: ${pct(dbStats.avgConfidence)}`,
      `- Offene DB-Probleme gesamt: ${dbProblems}`,
      "",
      "GAEB",
      `- Lokale GAEB-Probleme: ${gaebLocalProblems}`,
      `- PosNr fehlt: ${lvStats.missingPosNr}`,
      `- Text fehlt: ${lvStats.missingText}`,
      "",
      "Empfohlener nächster Schritt",
      lvProblems > 0
        ? "Zuerst LV-Daten prüfen: Menge, Einheit, EP, Urkalkulation und Dubletten."
        : dbProblems > 0
        ? "Danach Kalkulationsdatenbank prüfen: EP, Einheit, Ressourcen, Risiko und Confidence."
        : gaebLocalProblems > 0
        ? "GAEB-Struktur prüfen und X83/X84 validieren."
        : "Keine kritischen lokalen Probleme erkannt. Nächster Schritt: fachliche Prüfung oder Export.",
    ];

    return lines.join("\n");
  }

  function createSupportReport() {
    const report = buildSupportReport();

    setOpen(true);
    setTab("support");

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text: report,
      },
    ]);

    try {
      void navigator.clipboard?.writeText(report);
    } catch {
      //
    }
  }

  async function sendSupportMessage(customText?: string) {
    const text = String(customText || input).trim();

    if (!text || busy) return;

    const nextMessages: ChatMsg[] = [...messages, { role: "user", text }];

    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setTab("support");

    try {
      const token = getAuthToken();

      const res = await fetch(apiUrl("/api/support/chat"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: text,
          page: pathname,
          module: current,
          context: {
            module: current,
            moduleKey,
            pageKey,
            pathname,
            source: "web-global-assistant",
            status,
            projectCode: getProjectCodeFromPage(),
            supportReport: buildSupportReport(),
            lv: lvStats,
            kalkulationsdatenbank: dbStats,
            gaeb: {
              projectCode: getProjectCodeFromPage(),
              localProblems: gaebLocalProblems,
            },
            crm: {
              projectCode: getProjectCodeFromPage(),
              purpose: "Angebotsverfolgung / CRM",
            },
            recipes: {
              projectCode: getProjectCodeFromPage(),
              purpose: "Urkalkulation / Ressourcen / Preisaufbau",
              lvStats,
              dbStats,
            },
          },
        }),
      });

      const json = await res.json().catch(() => null);

      const answer =
        json?.answer ||
        json?.message ||
        json?.reply ||
        (res.ok
          ? "Ich habe deine Anfrage aufgenommen. Der Support-Endpunkt hat aber keine konkrete Antwort geliefert."
          : `Support-Server antwortet mit Fehler ${res.status}. Prüfe Auth, Lizenz, Serverroute /api/support/chat und API_BASE.`);

      setMessages([...nextMessages, { role: "assistant", text: String(answer) }]);
    } catch {
      const fallback =
        pageKey === "start-projekt"
          ? "Support ist gerade nicht erreichbar. Für die Startseite prüfe zuerst: Projektliste, Suche, Schnellwahl, zuletzt geöffnete Projekte, neues Projekt sowie JSON/ZIP Import."
          : pageKey === "projekt-uebersicht"
          ? "Support ist gerade nicht erreichbar. Für die Projektübersicht prüfe zuerst: Projektcode, Projektname, Speicherart, letzter Zugriff und ob die gewünschten Module über die Buttons erreichbar sind."
          : pageKey === "kalkulation-rezepte"
          ? "Support ist gerade nicht erreichbar. Für die Urkalkulation prüfe zuerst: Positionsdaten, Einheit, Menge, Ressourcen, direkte Kosten, Zuschläge, EP/GP, Langtext und ob die Position in LV/Datenbank übernommen wurde."
          : pageKey === "kalkulation-gaeb"
          ? "Support ist gerade nicht erreichbar. Für GAEB prüfe zuerst: Projektcode, PosNr, Kurztext/Langtext, Einheit, Menge, Dubletten und danach X83/X84 Validierung."
          : pageKey === "kalkulation-datenbank"
          ? "Support ist gerade nicht erreichbar. Für die Kalkulationsdatenbank prüfe zuerst: doppelte Einträge, fehlende EP, fehlende Einheit, fehlende Ressourcen, Risiko hoch/kritisch und Confidence unter 70 %."
          : pageKey === "kalkulation-mit-ki"
          ? "Support ist gerade nicht erreichbar. Für die KI-Kalkulation prüfe zuerst: LV-Positionen, fehlende Einheiten/Mengen, doppelte Positionen, EP, Urkalkulation und GAEB-Export."
          : pageKey === "kalkulation-versionsvergleich"
          ? "Support ist gerade nicht erreichbar. Für die Angebotsanalyse prüfe zuerst: mindestens zwei Versionen auswählen, Vergleich starten, Preis-/Mengen-/Einheitsabweichungen filtern und danach Risikoanalyse oder PDF-Export ausführen."
          : pageKey === "kalkulation-crm"
          ? "Support ist gerade nicht erreichbar. Für CRM prüfe zuerst: offene Angebote, Follow-up-Datum, nächste Aktion, Kontakt, PDF/Link, Status und ob Angebote überfällig sind."
          : "Support ist gerade nicht erreichbar. Prüfe bitte API_BASE, Server, Auth und /api/support/chat.";

      setMessages([...nextMessages, { role: "assistant", text: fallback }]);
    } finally {
      setBusy(false);
    }
  }

  function getButtonStyle(action: AssistantAction): React.CSSProperties {
    if (action.disabled) return disabledBtn;
    if (action.kind === "danger") return dangerBtn;
    if (action.kind === "primary") return primaryBtn;
    return secondaryBtn;
  }

  React.useEffect(() => {
    if (pageKey !== "kalkulation-mit-ki") return;

    const problems = {
      duplicates: Number(lvStats.duplicateCount || 0),
      missingUnits: Number(lvStats.missingUnits || 0),
      missingQty: Number(lvStats.missingQty || 0),
      missingPrice: Number(lvStats.missingPrice || 0),
      missingBreakdown: Number(lvStats.missingBreakdown || 0),
      net: Number(lvStats.net || 0),
    };

    const totalProblems =
      problems.duplicates +
      problems.missingUnits +
      problems.missingQty +
      problems.missingPrice +
      problems.missingBreakdown;

    const signature = [
      pathname,
      problems.duplicates,
      problems.missingUnits,
      problems.missingQty,
      problems.missingPrice,
      problems.missingBreakdown,
      Math.round(problems.net),
    ].join("|");

    if (!totalProblems && problems.net > 0) {
      setSecretaryAlert(
        "Roberto, die Kalkulation wirkt vollständig. Nächster Schritt: Outlier Report prüfen und danach Angebot/Export vorbereiten."
      );
      return;
    }

    if (!totalProblems) return;

    const nextStep =
      problems.duplicates > 0
        ? `Zuerst ${problems.duplicates} doppelte LV-Position(en) bereinigen.`
        : problems.missingPrice > 0
          ? `Zuerst ${problems.missingPrice} Position(en) ohne EP kalkulieren.`
          : problems.missingBreakdown > 0
            ? `Zuerst ${problems.missingBreakdown} Position(en) ohne Urkalkulation prüfen.`
            : problems.missingUnits > 0
              ? `Zuerst ${problems.missingUnits} fehlende Einheit(en) ergänzen.`
              : problems.missingQty > 0
                ? `Zuerst ${problems.missingQty} fehlende Menge(n) ergänzen.`
                : "Outlier Report prüfen.";

    const message =
      `Roberto, ich kontrolliere das Projekt automatisch. ` +
      `Ich habe ${totalProblems} offene Prüfpunkte gefunden. ` +
      nextStep;

    setSecretaryAlert(message);

    if (secretaryLastSignatureRef.current !== signature) {
      secretaryLastSignatureRef.current = signature;
      setOpen(true);
      setTab("steuerung");
      setKiSignalPulse(true);
      window.setTimeout(() => setKiSignalPulse(false), 1200);
    }
  }, [
    pageKey,
    pathname,
    lvStats.duplicateCount,
    lvStats.missingUnits,
    lvStats.missingQty,
    lvStats.missingPrice,
    lvStats.missingBreakdown,
    lvStats.net,
  ]);

  function openKalkulationOutlierReportFromAssistant() {
    const fn = (window as any).rlcOpenKalkulationOutlierReport;
    if (typeof fn === "function") {
      fn();
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text:
          "Outlier Report ist auf dieser Seite noch nicht verbunden. Öffne ihn über den Button in der Kalkulation oder lade die Seite neu.",
      },
    ]);
  }
  function renderActions(actions: AssistantAction[]) {
    return actions.map((action) => (
      <button
        key={action.label}
        type="button"
        style={getButtonStyle(action)}
        disabled={!!action.disabled}
        onClick={action.onClick}
      >
        {action.label}
      </button>
    ));
  }
function renderStats() {
    if (
      pageKey === "kalkulation-uebersicht" ||
      pageKey === "kalkulation-lv" ||
      pageKey === "kalkulation-mit-ki" ||
      pageKey === "kalkulation-gaeb" ||
      pageKey === "kalkulation-rezepte" ||
      pageKey === "kalkulation-versionsvergleich" ||
      pageKey === "kalkulation-crm" ||
      pageKey === "projekt-uebersicht" ||
      pageKey === "start-projekt"
    ) {
      return (
        <div style={statsList}>
          {pageKey === "kalkulation-mit-ki" && lvStats.activeKi ? (
            <div style={statsRow}>
              <span>KI aktiv</span>
              <b>{safeReactText(lvStats.activeKi)}</b>
            </div>
          ) : null}

          <div style={statsRow}>
            <span>Netto RLC-KI</span>
            <b>
              {lvStats.net > 0
                ? money(lvStats.net)
                : runtimeKalkulationSummary
                  ? "Wird berechnet…"
                  : "0,00 €"}
            </b>
          </div>

          <div style={statsRow}>
            <span>Doppelte LV-Positionen</span>
            <b>{lvStats.duplicateCount}</b>
          </div>

          <div style={statsRow}>
            <span>Einheit fehlt</span>
            <b>{lvStats.missingUnits}</b>
          </div>

          <div style={statsRow}>
            <span>Menge fehlt / 0</span>
            <b>{lvStats.missingQty}</b>
          </div>

          <div style={statsRow}>
            <span>EP fehlt</span>
            <b>{lvStats.missingPrice}</b>
          </div>

          <div style={statsRow}>
            <span>Urkalkulation fehlt</span>
            <b>{lvStats.missingBreakdown}</b>
          </div>
        </div>
      );
    }
    if (pageKey === "kalkulation-datenbank") {
      return (
        <div style={statsGrid}>
          <span>Einträge</span>
          <b>{dbStats.count}</b>

          <span>Dubletten</span>
          <b>{dbStats.duplicateCount}</b>

          <span>EP fehlt</span>
          <b>{dbStats.missingPrice}</b>

          <span>Einheit fehlt</span>
          <b>{dbStats.missingUnit}</b>

          <span>Ressourcen fehlen</span>
          <b>{dbStats.missingResources}</b>

          <span>Risiko hoch/kritisch</span>
          <b>{dbStats.highRisk}</b>

          <span>Confidence niedrig</span>
          <b>{dbStats.lowConfidence}</b>

          <span>Ø Confidence</span>
          <b>{pct(dbStats.avgConfidence)}</b>

          <span>Wiederverwendet</span>
          <b>{dbStats.used}</b>
        </div>
      );
    }

    return null;
  }

  function getActions(): AssistantAction[] {
    if (pageKey === "start-projekt") {
      return [
        {
          label: "Projekte neu laden",
          kind: "primary",
          onClick: () =>
            sendSimpleCommand("rlc:start-command", "reloadProjects", "Projekte werden neu geladen."),
        },
        {
          label: "Projektsuche öffnen",
          kind: "primary",
          onClick: () =>
            sendSimpleCommand("rlc:start-command", "focusSearch", "Projektsuche wird geöffnet."),
        },
        {
          label: "Neues Projekt vorbereiten",
          onClick: () =>
            sendSimpleCommand("rlc:start-command", "focusNewProject", "Neues Projekt wird vorbereitet."),
        },
        {
          label: "project.json importieren",
          onClick: () =>
            sendSimpleCommand("rlc:start-command", "focusJsonImport", "project.json Import wird geöffnet."),
        },
        { label: "Projektübersicht öffnen", onClick: () => go("/projekt/uebersicht") },
        { label: "Kalkulation öffnen", onClick: () => go("/kalkulation") },
        {
          label: "Startseite fachlich analysieren",
          onClick: () => void sendSupportMessage(makeSupportPrompt("start")),
        },
      ];
    }

    if (pageKey === "projekt-uebersicht") {
      return [
        { label: "Kalkulation öffnen", kind: "primary", onClick: () => go("/kalkulation") },
        { label: "LV / Positionen öffnen", kind: "primary", onClick: () => go("/kalkulation/lv-import") },
        { label: "Urkalkulation / Rezepte öffnen", onClick: () => go("/kalkulation/rezepte") },
        { label: "KI-Kalkulation öffnen", onClick: () => go("/kalkulation/mit-ki") },
        { label: "Angebot / Export öffnen", onClick: () => go("/kalkulation/angebot") },
        { label: "GAEB prüfen", onClick: () => go("/kalkulation/gaeb") },
        { label: "Nachträge öffnen", onClick: () => go("/kalkulation/nachtraege") },
        { label: "CRM / Angebotsverfolgung öffnen", onClick: () => go("/kalkulation/crm") },
        { label: "Mengenermittlung öffnen", onClick: () => go("/mengenermittlung") },
        { label: "CAD / Planung öffnen", onClick: () => go("/cad/viewer") },
        { label: "Büro / Verwaltung öffnen", onClick: () => go("/buro") },
        { label: "Buchhaltung öffnen", onClick: () => go("/buchhaltung") },
        { label: "Projekt wechseln", onClick: () => go("/start") },
        {
          label: "Projektübersicht fachlich analysieren",
          onClick: () => void sendSupportMessage(makeSupportPrompt("project")),
        },
      ];
    }

    if (pageKey === "kalkulation-rezepte") {
      return [
        { label: "KI-Ressourcen vorschlagen", kind: "primary", onClick: () => sendRezepteCommand("suggestResources") },
        { label: "KI mit Preisaufbau starten", kind: "primary", onClick: () => sendRezepteCommand("calculatePriceBuildUp") },
        { label: "Langtext automatisch erzeugen", onClick: () => sendRezepteCommand("generateLongText") },
        { label: "Ressourcen prüfen", onClick: () => sendRezepteCommand("checkResources") },
        { label: "Zuschläge / EP prüfen", onClick: () => sendRezepteCommand("checkSurcharges") },
        { label: "Firmen-Rezept speichern", kind: "primary", onClick: () => sendRezepteCommand("saveCompanyRecipe") },
        { label: "In Datenbank speichern", kind: "primary", onClick: () => sendRezepteCommand("saveDatabase") },
        { label: "Position übernehmen", kind: "primary", onClick: () => sendRezepteCommand("insertPosition") },
        { label: "Neue Position", onClick: () => sendRezepteCommand("newPosition") },
        { label: "Bibliothek CSV importieren", onClick: () => sendRezepteCommand("importLibraryCsv") },
        { label: "Bibliothek aktualisieren", onClick: () => sendRezepteCommand("refreshLibrary") },
        { label: "CSV exportieren", onClick: () => sendRezepteCommand("exportCsv") },
        { label: "PDF exportieren", onClick: () => sendRezepteCommand("exportPdf") },
        { label: "LV / Positionen öffnen", onClick: () => go("/kalkulation/lv-import") },
        { label: "Nachträge öffnen", onClick: () => go("/kalkulation/nachtraege") },
        { label: "Angebot öffnen", onClick: () => go("/kalkulation/angebot") },
        { label: "GAEB prüfen", onClick: () => go("/kalkulation/gaeb") },
        {
          label: "Urkalkulation fachlich analysieren",
          onClick: () => void sendSupportMessage(makeSupportPrompt("recipes")),
        },
      ];
    }

    if (pageKey === "kalkulation-gaeb") {
      return [
        { label: "GAEB-Fehler automatisch korrigieren", kind: "primary", onClick: () => sendGaebCommand("autoFixErrors") },
        { label: "X83 prüfen", kind: "primary", onClick: () => sendGaebCommand("validate", { mode: "x83" }) },
        { label: "X84 prüfen", kind: "primary", onClick: () => sendGaebCommand("validate", { mode: "x84" }) },
        { label: "X84 prüfen & exportieren", kind: "primary", onClick: () => sendGaebCommand("export", { mode: "x84" }) },
        { label: "Import am Server speichern", kind: "primary", onClick: () => sendGaebCommand("saveImportToServer") },
        { label: "GAEB-Fehler anzeigen", onClick: () => sendGaebCommand("showErrors") },
        { label: "Fehler filtern", onClick: () => sendGaebFilter("errors") },
        { label: "Ohne PosNr anzeigen", onClick: () => sendGaebFilter("posNrFehlt") },
        { label: "Ohne/falsche Einheit anzeigen", onClick: () => sendGaebFilter("einheitFehlt") },
        { label: "Ohne Menge anzeigen", onClick: () => sendGaebFilter("mengeFehlt") },
        {
          label: "Ausgewählte Positionen aus LV löschen",
          kind: "danger",
          onClick: () => sendGaebCommand("deleteSelectedImportedFromLv"),
        },
        { label: "Import aus Ansicht entfernen", onClick: () => sendGaebCommand("clearImport") },
        { label: "Lokale Probleme erklären", onClick: showGaebLocalProblems },
        {
          label: "LV-Einheiten normalisieren",
          kind: lvStats.unitFixable > 0 ? "primary" : "secondary",
          disabled: lvStats.unitFixable <= 0,
          onClick: normalizeLvUnits,
        },
        { label: "LV öffnen", onClick: () => go("/kalkulation/lv-import") },
        { label: "Angebot öffnen", onClick: () => go("/kalkulation/angebot") },
        {
          label: "GAEB fachlich analysieren",
          onClick: () => void sendSupportMessage(makeSupportPrompt("gaeb")),
        },
      ];
    }

    if (pageKey === "kalkulation-versionsvergleich") {
      return [
        { label: "Aktuelles LV als Version speichern", kind: "primary", onClick: () => sendVersionsvergleichCommand("saveCurrentLv") },
        { label: "CSV-Version importieren", onClick: () => sendVersionsvergleichCommand("importCsv") },
        { label: "Ausgewählte Versionen vergleichen", kind: "primary", onClick: () => sendVersionsvergleichCommand("compareSelected") },
        { label: "Analyse starten", kind: "primary", onClick: () => sendVersionsvergleichCommand("analyseCurrent") },
        { label: "Preisabweichungen anzeigen", onClick: () => sendVersionsvergleichCommand("showPriceDiffs") },
        { label: "Mengenabweichungen anzeigen", onClick: () => sendVersionsvergleichCommand("showQtyDiffs") },
        { label: "Einheitsabweichungen anzeigen", onClick: () => sendVersionsvergleichCommand("showUnitDiffs") },
        { label: "Textabweichungen anzeigen", onClick: () => sendVersionsvergleichCommand("showTextDiffs") },
        { label: "Risikoanalyse starten", kind: "primary", onClick: () => sendVersionsvergleichCommand("riskAnalysis") },
        { label: "PDF exportieren", onClick: () => sendVersionsvergleichCommand("exportPdf") },
        { label: "CSV exportieren", onClick: () => sendVersionsvergleichCommand("exportCsv") },
        {
          label: "Analyse fachlich prüfen",
          onClick: () => void sendSupportMessage(makeSupportPrompt("versionsvergleich")),
        },
      ];
    }

    if (pageKey === "kalkulation-crm") {
      return [
        { label: "Offene Angebote anzeigen", kind: "primary", onClick: () => sendCrmCommand("showOpen") },
        { label: "Überfällige Follow-ups anzeigen", kind: "primary", onClick: () => sendCrmCommand("showOverdue") },
        { label: "Follow-ups heute anzeigen", onClick: () => sendCrmCommand("showToday") },
        { label: "Ohne Kontakt anzeigen", onClick: () => sendCrmCommand("showMissingContact") },
        { label: "Ohne nächste Aktion anzeigen", onClick: () => sendCrmCommand("showMissingAction") },
        { label: "Ohne PDF / Link anzeigen", onClick: () => sendCrmCommand("showMissingPdf") },
        { label: "Follow-up vorbereiten", kind: "primary", onClick: () => sendCrmCommand("createFollowUp") },
        { label: "Als nachgefasst markieren", onClick: () => sendCrmCommand("markNachgefasst") },
        { label: "Als gewonnen markieren", onClick: () => sendCrmCommand("markGewonnen") },
        { label: "Als verloren markieren", kind: "danger", onClick: () => sendCrmCommand("markVerloren") },
        { label: "CRM-Risikoanalyse starten", kind: "primary", onClick: () => sendCrmCommand("riskAnalysis") },
        { label: "CRM-Auswertung PDF", onClick: () => sendCrmCommand("exportPdf") },
        { label: "CRM am Server speichern", onClick: () => sendCrmCommand("syncServer") },
        { label: "Angebot öffnen", onClick: () => go("/kalkulation/angebot") },
        { label: "Angebotsanalyse öffnen", onClick: () => go("/kalkulation/versionsvergleich") },
        {
          label: "CRM fachlich analysieren",
          onClick: () => void sendSupportMessage(makeSupportPrompt("crm")),
        },
      ];
    }

    if (pageKey === "kalkulation-uebersicht") {
      return [
        { label: "LV / Positionen prüfen", kind: "primary", onClick: () => go("/kalkulation/lv-import") },
        { label: "KI-Kalkulation öffnen", kind: "primary", onClick: () => go("/kalkulation/mit-ki") },
        { label: "Urkalkulation / Rezepte öffnen", onClick: () => go("/kalkulation/rezepte") },
        { label: "Kalkulationsdatenbank öffnen", onClick: () => go("/kalkulation/datenbank") },
        { label: "Preise & Ressourcen öffnen", onClick: () => go("/kalkulation/preise") },
        { label: "GAEB prüfen", onClick: () => go("/kalkulation/gaeb") },
        { label: "Angebot / Export öffnen", onClick: () => go("/kalkulation/angebot") },
      ];
    }

    if (pageKey === "kalkulation-lv") {
      return [
        {
          label: "Positionen ohne EP anzeigen",
          onClick: () => sendSimpleFilter("rlc:lv-command", "epFehlt", "Positionen ohne EP werden angezeigt."),
        },
        {
          label: "Fehlende Einheiten anzeigen",
          onClick: () => sendSimpleFilter("rlc:lv-command", "einheitFehlt", "Fehlende Einheiten werden angezeigt."),
        },
        {
          label: "Fehlende Mengen anzeigen",
          onClick: () => sendSimpleFilter("rlc:lv-command", "mengeFehlt", "Fehlende Mengen werden angezeigt."),
        },
        {
          label: "Fehlende Langtexte anzeigen",
          onClick: () => sendSimpleFilter("rlc:lv-command", "langtextFehlt", "Fehlende Langtexte werden angezeigt."),
        },
        {
          label: "Doppelte anzeigen",
          onClick: () => sendSimpleFilter("rlc:lv-command", "doppelte", "Doppelte LV-Positionen werden angezeigt."),
        },
        {
          label: "Fehlende Daten automatisch ergänzen",
          kind: "primary",
          onClick: () => sendSimpleCommand("rlc:lv-command", "fixMissing", "Fehlende LV-Daten werden ergänzt."),
        },
        {
          label: "Doppelte bereinigen",
          onClick: () => sendSimpleCommand("rlc:lv-command", "deleteDuplicates", "Dublettenbereinigung wird gestartet."),
        },
        {
          label: "LV am Server speichern",
          onClick: () => sendSimpleCommand("rlc:lv-command", "syncServer", "LV wird am Server gespeichert."),
        },
        {
          label: "Zur KI-Kalkulation übergeben",
          kind: "primary",
          onClick: () => sendSimpleCommand("rlc:lv-command", "goKi", "Übergabe an KI-Kalkulation wird gestartet."),
        },
        { label: "Urkalkulation öffnen", onClick: () => go("/kalkulation/rezepte") },
        {
          label: "GAEB öffnen",
          onClick: () => sendSimpleCommand("rlc:lv-command", "goGaeb", "GAEB wird geöffnet."),
        },
      ];
    }

    if (pageKey === "kalkulation-mit-ki") {
      return [
        {
          label: "Doppelte LV-Positionen löschen",
          kind: "danger",
          disabled: lvStats.duplicateCount <= 0,
          onClick: deleteLvDuplicates,
        },
        { label: "Mengen prüfen", onClick: () => sendKalkulationFilter("mengeFehlt") },
        { label: "Preise prüfen", onClick: () => sendKalkulationFilter("preisFehlt") },
        { label: "Einheiten prüfen", onClick: () => sendKalkulationFilter("einheitFehlt") },
        { label: "Urkalkulation prüfen", onClick: () => sendKalkulationFilter("urkalkulationFehlt") },
        { label: "Doppelte anzeigen", onClick: () => sendKalkulationFilter("doppelte") },
        { label: "KI-Kalkulation starten", kind: "primary", onClick: () => sendKalkulationAction("runKi") },
        { label: "Fehlende Daten ergänzen", onClick: () => sendKalkulationAction("completeMissing") },
        { label: "Urkalkulation / Rezepte öffnen", kind: "primary", onClick: () => go("/kalkulation/rezepte") },
        { label: "Kalkulationsdatenbank öffnen", kind: "primary", onClick: () => go("/kalkulation/datenbank") },
        { label: "GAEB prüfen", onClick: () => go("/kalkulation/gaeb") },
      ];
    }

    if (pageKey === "kalkulation-datenbank") {
      return [
        {
          label: "Datenbank-Dubletten bereinigen",
          kind: "danger",
          disabled: dbStats.duplicateCount <= 0,
          onClick: deleteDbDuplicates,
        },
        {
          label: "Einträge ohne EP anzeigen",
          onClick: () => sendSimpleFilter("rlc:datenbank-command", "epFehlt", "Einträge ohne EP werden angezeigt."),
        },
        {
          label: "Einträge ohne Einheit anzeigen",
          onClick: () => sendSimpleFilter("rlc:datenbank-command", "einheitFehlt", "Einträge ohne Einheit werden angezeigt."),
        },
        {
          label: "Einträge ohne Ressourcen anzeigen",
          onClick: () =>
            sendSimpleFilter("rlc:datenbank-command", "ressourcenFehlen", "Einträge ohne Ressourcen werden angezeigt."),
        },
        {
          label: "Risiko-Einträge anzeigen",
          onClick: () => sendSimpleFilter("rlc:datenbank-command", "risikoHoch", "Risiko-Einträge werden angezeigt."),
        },
        {
          label: "Niedrige Confidence anzeigen",
          onClick: () =>
            sendSimpleFilter("rlc:datenbank-command", "confidenceNiedrig", "Einträge mit niedriger Confidence werden angezeigt."),
        },
        {
          label: "Einheiten automatisch ergänzen",
          onClick: () =>
            sendSimpleCommand("rlc:datenbank-command", "fixEinheiten", "Einheiten werden automatisch ergänzt."),
        },
        {
          label: "Ressourcen automatisch erzeugen",
          onClick: () =>
            sendSimpleCommand("rlc:datenbank-command", "fixRessourcen", "Ressourcen werden automatisch erzeugt."),
        },
        {
          label: "EP aus Ressourcen berechnen",
          onClick: () =>
            sendSimpleCommand("rlc:datenbank-command", "fixEpAusRessourcen", "EP wird aus Ressourcen berechnet."),
        },
        {
          label: "Confidence neu bewerten",
          onClick: () =>
            sendSimpleCommand("rlc:datenbank-command", "recalculateConfidence", "Confidence wird neu bewertet."),
        },
        { label: "Zur Urkalkulation", kind: "primary", onClick: () => go("/kalkulation/rezepte") },
        { label: "Zur KI-Kalkulation", kind: "primary", onClick: () => go("/kalkulation/mit-ki") },
        {
          label: "Datenbank fachlich prüfen",
          onClick: () => void sendSupportMessage(makeSupportPrompt("database")),
        },
      ];
    }

    if (pageKey === "kalkulation-preise") {
      return [
        {
          label: "Katalog laden",
          kind: "primary",
          onClick: () => sendSimpleCommand("rlc:preise-command", "loadCatalog", "Katalog wird geladen."),
        },
        {
          label: "Aus LV laden",
          onClick: () => sendSimpleCommand("rlc:preise-command", "loadFromLV", "Preise werden aus LV geladen."),
        },
        {
          label: "Aus KI / Manuell laden",
          onClick: () =>
            sendSimpleCommand("rlc:preise-command", "loadFromKiOrManuell", "Preise werden aus KI / Manuell geladen."),
        },
        {
          label: "Prüfung starten",
          onClick: () => sendSimpleCommand("rlc:preise-command", "startPruefung", "Preisprüfung wird gestartet."),
        },
        {
          label: "EP fehlt anzeigen",
          onClick: () => sendSimpleFilter("rlc:preise-command", "epFehlt", "EP fehlt wird angezeigt."),
        },
        {
          label: "Einheit fehlt anzeigen",
          onClick: () => sendSimpleFilter("rlc:preise-command", "einheitFehlt", "Einheit fehlt wird angezeigt."),
        },
        {
          label: "Doppelte anzeigen",
          onClick: () => sendSimpleFilter("rlc:preise-command", "doppelte", "Doppelte werden angezeigt."),
        },
        {
          label: "Doppelte auswählen",
          onClick: () => sendSimpleCommand("rlc:preise-command", "selectDuplicates", "Doppelte werden ausgewählt."),
        },
        {
          label: "Auswahl automatisch korrigieren",
          kind: "primary",
          onClick: () =>
            sendSimpleCommand("rlc:preise-command", "autoCorrectSelected", "Auswahl wird automatisch korrigiert."),
        },
        { label: "Urkalkulation öffnen", onClick: () => go("/kalkulation/rezepte") },
        { label: "Zur Kalkulationsdatenbank", onClick: () => go("/kalkulation/datenbank") },
      ];
    }

    if (pageKey === "kalkulation-nachtraege") {
      return [
        ...[
          ["entwurf", "Entwürfe anzeigen"],
          ["abgegeben", "Abgegebene anzeigen"],
          ["beauftragt", "Beauftragte anzeigen"],
          ["begruendungFehlt", "Ohne Begründung anzeigen"],
          ["epFehlt", "Ohne EP anzeigen"],
          ["mengeFehlt", "Ohne Menge anzeigen"],
          ["einheitFehlt", "Ohne Einheit anzeigen"],
          ["doppelte", "Doppelte anzeigen"],
        ].map(([filter, label]) => ({
          label,
          onClick: () =>
            sendSimpleFilter("rlc:nachtraege-command", filter, `Nachträge-Filter aktiviert: ${label}`),
        })),
        {
          label: "Fehlende Nachtragsdaten ergänzen",
          kind: "primary",
          onClick: () =>
            sendSimpleCommand("rlc:nachtraege-command", "completeMissing", "Fehlende Nachtragsdaten werden ergänzt."),
        },
        {
          label: "Doppelte auswählen",
          onClick: () => sendSimpleCommand("rlc:nachtraege-command", "selectDuplicates", "Doppelte werden ausgewählt."),
        },
        {
          label: "Angebot aus Auswahl",
          onClick: () => sendSimpleCommand("rlc:nachtraege-command", "angebotAuswahl", "Angebot aus Auswahl wird vorbereitet."),
        },
        {
          label: "PDF Export",
          onClick: () => sendSimpleCommand("rlc:nachtraege-command", "pdfExport", "PDF Export wird gestartet."),
        },
        {
          label: "Server speichern",
          onClick: () => sendSimpleCommand("rlc:nachtraege-command", "serverSpeichern", "Nachträge werden am Server gespeichert."),
        },
        { label: "Zur Urkalkulation", kind: "primary", onClick: () => go("/kalkulation/rezepte") },
        { label: "Zur KI-Kalkulation", kind: "primary", onClick: () => go("/kalkulation/mit-ki") },
      ];
    }

    if (pageKey === "kalkulation-angebot") {
      return [
        ["pdf", "PDF erzeugen", "primary"],
        ["excel", "Excel exportieren", "secondary"],
        ["csv", "CSV exportieren", "secondary"],
        ["save", "Angebot speichern", "secondary"],
        ["load", "Angebot laden", "secondary"],
        ["refresh", "Angebotsdaten neu laden", "secondary"],
        ["check", "Angebot prüfen", "secondary"],
        ["completeMissing", "Fehlende Angebotsdaten ergänzen", "primary"],
        ["lv", "LV bearbeiten", "secondary"],
        ["nachtraege", "Nachträge öffnen", "secondary"],
        ["ki", "KI-Kalkulation öffnen", "secondary"],
        ["rezepte", "Urkalkulation öffnen", "secondary"],
        ["gaeb", "GAEB öffnen", "secondary"],
      ].map(([action, label, kind]) => ({
        label,
        kind: kind as ButtonKind,
        onClick: () => {
          if (action === "rezepte") {
            go("/kalkulation/rezepte");
            return;
          }

          sendSimpleCommand("rlc:angebot-command", action, `Angebots-Aktion gestartet: ${label}`);
        },
      }));
    }

    if (pageKey === "mengenermittlung") {
      return [
        { label: "Aufmaß nach LV öffnen", kind: "primary", onClick: () => go("/mengenermittlung/position") },
        { label: "Regieberichte öffnen", onClick: () => go("/mengenermittlung/regieberichte") },
        { label: "Lieferscheine öffnen", onClick: () => go("/mengenermittlung/lieferscheine") },
        { label: "Soll-Ist prüfen", onClick: () => go("/mengenermittlung/soll-ist") },
      ];
    }

    if (pageKey === "cad") {
      return [
        { label: "CAD Viewer öffnen", kind: "primary", onClick: () => go("/cad/viewer") },
        { label: "PDF Viewer öffnen", onClick: () => go("/cad/pdf-viewer") },
        { label: "As-Built öffnen", onClick: () => go("/cad/asbuild") },
      ];
    }

    if (pageKey === "buchhaltung") {
      return [
        { label: "Kostenübersicht öffnen", kind: "primary", onClick: () => go("/buchhaltung/kostenuebersicht") },
        { label: "Rechnungen öffnen", onClick: () => go("/buchhaltung/rechnungen") },
        { label: "Abschlagsrechnungen öffnen", onClick: () => go("/buchhaltung/abschlagsrechnungen") },
        { label: "DATEV Export öffnen", onClick: () => go("/buchhaltung/datev") },
      ];
    }

    if (pageKey === "buro") {
      return [
        { label: "Projekte öffnen", kind: "primary", onClick: () => go("/buro/projekte") },
        { label: "Dokumente öffnen", onClick: () => go("/buro/dokumente") },
        { label: "Aufgaben öffnen", onClick: () => go("/buro/tasks") },
        { label: "Nutzerverwaltung öffnen", onClick: () => go("/buro/nutzerverwaltung") },
      ];
    }

    return [
      { label: "Kalkulation öffnen", kind: "primary", onClick: () => go("/kalkulation") },
      { label: "Projektübersicht öffnen", onClick: () => go("/projekt/uebersicht") },
      { label: "Supportbericht erstellen", onClick: createSupportReport },
    ];
  }

  function renderSupportChips() {
    const chips: Array<{ label: string; kind: string }> = [
      { label: "Seite erklären", kind: "page" },
      { label: "Workflow", kind: "workflow" },
      { label: "Fehlerhilfe", kind: "error" },
    ];

    if (pageKey === "start-projekt") chips.push({ label: "Startseite", kind: "start" });
    if (pageKey === "projekt-uebersicht") chips.push({ label: "Projektübersicht", kind: "project" });
    if (pageKey === "kalkulation-rezepte") chips.push({ label: "Urkalkulation", kind: "recipes" });
    if (pageKey === "kalkulation-gaeb") chips.push({ label: "GAEB Analyse", kind: "gaeb" });
    if (pageKey === "kalkulation-datenbank") chips.push({ label: "Datenbank", kind: "database" });
    if (pageKey === "kalkulation-versionsvergleich") {
      chips.push({ label: "Angebotsanalyse", kind: "versionsvergleich" });
    }
    if (pageKey === "kalkulation-crm") chips.push({ label: "CRM Analyse", kind: "crm" });

    return chips.map((chip) => (
      <button
        key={chip.kind}
        type="button"
        style={chipBtn}
        onClick={() => void sendSupportMessage(makeSupportPrompt(chip.kind))}
      >
        {chip.label}
      </button>
    ));
  }

  return (
    <>
      <style>{`
        @keyframes rlcKiPulse {
          0% { transform: scale(1); box-shadow: 0 18px 38px rgba(37,99,235,0.36); }
          50% { transform: scale(1.08); box-shadow: 0 0 0 10px rgba(37,99,235,0.18), 0 18px 42px rgba(37,99,235,0.46); }
          100% { transform: scale(1); box-shadow: 0 18px 38px rgba(37,99,235,0.36); }
        }

        @keyframes rlcKiBoxPulse {
          0% { box-shadow: 0 0 0 0 rgba(37,99,235,0.0); border-color: #BFDBFE; }
          50% { box-shadow: 0 0 0 5px rgba(37,99,235,0.18); border-color: #2563EB; }
          100% { box-shadow: 0 0 0 0 rgba(37,99,235,0.0); border-color: #BFDBFE; }
        }
      `}</style>
      {open ? (
        <div style={overlay}>
          <aside style={drawer}>
            <div style={head}>
              <div style={headLeft}>
                <div style={botIcon}>🤖</div>
                <div>
                  <div style={title}>RLC-KI Sekretärin</div>
                  <div style={sub}>{current}</div>
                </div>
              </div>

              <button type="button" style={closeBtn} onClick={() => setOpen(false)}>
                ×
              </button>
            </div>

            <div style={tabs}>
              <button
                type="button"
                style={tab === "steuerung" ? tabActive : tabBtn}
                onClick={() => setTab("steuerung")}
              >
                Steuerung
              </button>

              <button
                type="button"
                style={tab === "support" ? tabActive : tabBtn}
                onClick={() => setTab("support")}
              >
                Support
              </button>
            </div>

            {tab === "steuerung" ? (
              <div style={body}>
                <div style={speech}>{pageIntro(pageKey)}</div>

                {secretaryAlert ? (
                  <div
                    style={{
                      border: "1px solid #BFDBFE",
                      background: "#EFF6FF",
                      color: "#1E3A8A",
                      borderRadius: 14,
                      padding: 14,
                      fontWeight: 900,
                      lineHeight: 1.45,
                      animation: kiSignalPulse ? "rlcKiBoxPulse 1.1s ease-in-out" : undefined,
                    }}
                  >
                    {secretaryAlert}
                  </div>
                ) : null}

                {status ? <div style={successBox}>{status}</div> : null}

                {kiWorking || kiProgress > 0 || kiLog ? (
                  <div style={progressBox}>
                    <div style={progressHead}>
                      <b>{kiWorking ? "KI arbeitet" : "KI-Protokoll"}</b>
                      <span>{kiProgress}%</span>
                    </div>

                    <div style={progressTrack}>
                      <div style={{ ...progressFill, width: `${kiProgress}%` }} />
                    </div>

                    {kiProgressText ? <div style={progressText}>{kiProgressText}</div> : null}

                    {kiLog ? (
                      <div style={changeLogBox}>
                        <div style={changeLogTitle}>{kiLog.title}</div>

                        {kiLog.changes.length ? (
                          <div style={changeList}>
                            <div style={changeSectionTitle}>Änderungen</div>

                            {kiLog.changes.map((x, idx) => (
                              <div key={`c-${idx}`} style={changeItem}>
                                ✓ {x}
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {kiLog.warnings?.length ? (
                          <div style={warningList}>
                            <div style={warningSectionTitle}>Warnungen</div>

                            {kiLog.warnings.map((x, idx) => (
                              <div key={`w-${idx}`} style={warningItem}>
                                ⚠ {x}
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {kiLog.unchanged?.length ? (
                          <div style={unchangedList}>
                            <div style={unchangedSectionTitle}>Übersprungen / unverändert</div>

                            {kiLog.unchanged.map((x, idx) => (
                              <div key={`u-${idx}`} style={unchangedItem}>
                                – {x}
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {!kiLog.changes.length &&
                        !kiLog.warnings?.length &&
                        !kiLog.unchanged?.length ? (
                          <div style={unchangedItem}>Keine Detailmeldungen vorhanden.</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div style={moduleBox}>
                  <div style={boxTitle}>{current}</div>
                  {renderStats()}
                  {renderActions(getActions())}
                </div>

                <div style={quickGrid}>
                  {pageKey === "kalkulation-mit-ki" ? (
                    <button
                      type="button"
                      style={quickBtnButton}
                      onClick={openKalkulationOutlierReportFromAssistant}
                    >
                      Outlier Report öffnen
                    </button>
                  ) : null}

                  <button
                    type="button"
                    style={quickBtnButton}
                    onClick={() => void sendSupportMessage(makeSupportPrompt("page"))}
                  >
                    Diese Seite erklären
                  </button>

                  <button
                    type="button"
                    style={quickBtnButton}
                    onClick={() => void sendSupportMessage(makeSupportPrompt("workflow"))}
                  >
                    Arbeitsablauf anzeigen
                  </button>

                  <button type="button" style={quickBtnButton} onClick={createSupportReport}>
                    Supportbericht erstellen
                  </button>

                  <button
                    type="button"
                    style={quickBtnButton}
                    onClick={() => void sendSupportMessage(makeSupportPrompt("error"))}
                  >
                    Problem analysieren
                  </button>

                  <Link style={quickBtn} to="/info/support">
                    Support-Seite öffnen
                  </Link>
                </div>
              </div>
            ) : (
              <div style={chatBody}>
                <div style={chatList}>
                  <div style={speechSmall}>
                    Support-Kontext: <b>{current}</b>
                    <br />
                    {pathname}
                  </div>

                  <div style={supportActions}>{renderSupportChips()}</div>

                  {messages.map((m, idx) => (
                    <div
                      key={`${m.role}-${idx}`}
                      style={m.role === "assistant" ? assistantMsg : userMsg}
                    >
                      {m.text}
                    </div>
                  ))}
                </div>

                <div style={composer}>
                  <textarea
                    style={textarea}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Problem oder Frage eingeben…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendSupportMessage();
                      }
                    }}
                  />

                  <button
                    type="button"
                    style={sendBtn}
                    disabled={busy || !input.trim()}
                    onClick={() => void sendSupportMessage()}
                  >
                    {busy ? "…" : "Senden"}
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      ) : null}

      <button
        type="button"
        style={kiSignalPulse ? floatBtnPulse : floatBtn}
        onClick={() => {
          setOpen(true);
    setKiSignalPulse(false);
        }}
      >
        <span style={floatFace}>🤖</span>
        <span>KI</span>
      </button>
    </>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9998,
  background: "rgba(15,23,42,0.25)",
  display: "flex",
  justifyContent: "flex-end",
};

const drawer: React.CSSProperties = {
  width: 390,
  maxWidth: "92vw",
  height: "100vh",
  background: "#FFFFFF",
  boxShadow: "-18px 0 46px rgba(15,23,42,0.20)",
  padding: 18,
  boxSizing: "border-box",
  display: "grid",
  gridTemplateRows: "auto auto minmax(0,1fr)",
  gap: 14,
};

const head: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const headLeft: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const botIcon: React.CSSProperties = {
  width: 54,
  height: 54,
  borderRadius: 19,
  background: "linear-gradient(135deg,#2563EB,#1E40AF)",
  color: "#FFFFFF",
  display: "grid",
  placeItems: "center",
  fontSize: 27,
  boxShadow: "0 12px 28px rgba(37,99,235,0.30)",
};

const title: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  color: "#0F172A",
};

const sub: React.CSSProperties = {
  marginTop: 2,
  fontSize: 12,
  fontWeight: 800,
  color: "#64748B",
};

const closeBtn: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 14,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: 26,
  fontWeight: 900,
  cursor: "pointer",
};

const tabs: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const tabBtn: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const tabActive: React.CSSProperties = {
  ...tabBtn,
  border: "1px solid #2563EB",
  background: "#EFF6FF",
  color: "#1D4ED8",
};

const body: React.CSSProperties = {
  overflow: "auto",
  display: "grid",
  gap: 14,
  alignContent: "start",
};

const speech: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1E3A8A",
  borderRadius: 16,
  padding: 14,
  lineHeight: 1.5,
  fontSize: 14,
  fontWeight: 800,
};

const speechSmall: React.CSSProperties = {
  ...speech,
  padding: 10,
  fontSize: 12,
};

const successBox: React.CSSProperties = {
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#166534",
  borderRadius: 14,
  padding: 12,
  fontSize: 13,
  fontWeight: 800,
};

const progressBox: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "#F8FAFC",
  borderRadius: 16,
  padding: 12,
  display: "grid",
  gap: 9,
};

const progressHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 13,
  color: "#0F172A",
};

const progressTrack: React.CSSProperties = {
  height: 10,
  borderRadius: 999,
  background: "#E5E7EB",
  overflow: "hidden",
};

const progressFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg,#2563EB,#22C55E)",
  transition: "width 260ms ease",
};

const progressText: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  fontWeight: 800,
};

const changeLogBox: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 8,
};

const changeLogTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "#0F172A",
};

const changeSectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: "#166534",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const warningSectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: "#92400E",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const unchangedSectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const changeList: React.CSSProperties = {
  display: "grid",
  gap: 5,
};

const changeItem: React.CSSProperties = {
  fontSize: 12,
  color: "#166534",
  lineHeight: 1.35,
  fontWeight: 800,
};

const warningList: React.CSSProperties = {
  display: "grid",
  gap: 5,
};

const warningItem: React.CSSProperties = {
  fontSize: 12,
  color: "#92400E",
  lineHeight: 1.35,
  fontWeight: 800,
};

const unchangedList: React.CSSProperties = {
  display: "grid",
  gap: 5,
};

const unchangedItem: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  lineHeight: 1.35,
  fontWeight: 800,
};

const moduleBox: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  background: "#F8FAFC",
  borderRadius: 16,
  padding: 14,
  display: "grid",
  gap: 10,
};

const boxTitle: React.CSSProperties = {
  color: "#0F172A",
  fontSize: 14,
  fontWeight: 900,
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 6,
  fontSize: 13,
  color: "#0F172A",
};

const statsList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontSize: 13,
  color: "#0F172A",
};

const statsRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};
const primaryBtn: React.CSSProperties = {
  border: "1px solid #2563EB",
  background: "#2563EB",
  color: "#FFFFFF",
  borderRadius: 12,
  padding: "11px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  ...primaryBtn,
  border: "1px solid #DC2626",
  background: "#DC2626",
};

const secondaryBtn: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 12,
  padding: "11px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const disabledBtn: React.CSSProperties = {
  ...primaryBtn,
  border: "1px solid #CBD5E1",
  background: "#E5E7EB",
  color: "#64748B",
  cursor: "not-allowed",
};

const quickGrid: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const quickBtn: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: "11px 12px",
  color: "#0F172A",
  textDecoration: "none",
  fontWeight: 900,
  background: "#FFFFFF",
};

const quickBtnButton: React.CSSProperties = {
  ...quickBtn,
  textAlign: "left",
  cursor: "pointer",
};

const chatBody: React.CSSProperties = {
  minHeight: 0,
  display: "grid",
  gridTemplateRows: "minmax(0,1fr) auto",
  gap: 10,
};

const chatList: React.CSSProperties = {
  overflow: "auto",
  display: "grid",
  gap: 8,
  alignContent: "start",
  paddingRight: 4,
};

const supportActions: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const chipBtn: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 999,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const assistantMsg: React.CSSProperties = {
  justifySelf: "start",
  maxWidth: "88%",
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1E3A8A",
  borderRadius: 14,
  padding: 11,
  fontSize: 13,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const userMsg: React.CSSProperties = {
  justifySelf: "end",
  maxWidth: "88%",
  background: "#2563EB",
  color: "#FFFFFF",
  borderRadius: 14,
  padding: 11,
  fontSize: 13,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const composer: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 8,
  alignItems: "end",
};

const textarea: React.CSSProperties = {
  minHeight: 64,
  maxHeight: 120,
  resize: "vertical",
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: 10,
  fontSize: 13,
  outline: "none",
};

const sendBtn: React.CSSProperties = {
  border: "1px solid #2563EB",
  background: "#2563EB",
  color: "#FFFFFF",
  borderRadius: 12,
  padding: "11px 14px",
  fontWeight: 900,
  cursor: "pointer",
};

const floatBtn: React.CSSProperties = {
  position: "fixed",
  right: 18,
  bottom: 22,
  zIndex: 9997,
  width: 74,
  height: 74,
  borderRadius: 24,
  border: "none",
  background: "linear-gradient(135deg,#2563EB,#1E40AF)",
  color: "#FFFFFF",
  boxShadow: "0 18px 38px rgba(37,99,235,0.36)",
  display: "grid",
  placeItems: "center",
  gap: 0,
  fontWeight: 900,
  cursor: "pointer",
};


const floatBtnPulse: React.CSSProperties = {
  ...floatBtn,
  transform: "scale(1.08)",
  boxShadow:
    "0 0 0 8px rgba(37,99,235,0.18), 0 0 0 16px rgba(37,99,235,0.10), 0 18px 44px rgba(37,99,235,0.48)",
  animation: "rlcKiPulse 1s ease-in-out infinite",
};
const floatFace: React.CSSProperties = {
  fontSize: 27,
  lineHeight: 1,
};





const activeKiBoxPulse: React.CSSProperties = {
  border: "2px solid #2563EB",
  background: "linear-gradient(180deg,#DBEAFE,#FFFFFF)",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 6,
  marginBottom: 8,
  boxShadow: "0 0 0 4px rgba(37,99,235,0.14), 0 0 28px rgba(37,99,235,0.35)",
  animation: "rlcKiPulse 1.15s ease-in-out infinite",
};

const activeKiBox: React.CSSProperties = {
  gridColumn: "1 / -1",
  border: "1px solid #BFDBFE",
  background: "linear-gradient(180deg,#EFF6FF,#FFFFFF)",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 6,
  marginBottom: 8,
};

const activeKiEyebrow: React.CSSProperties = {
  fontSize: 11,
  color: "#2563EB",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const activeKiTitle: React.CSSProperties = {
  fontSize: 14,
  color: "#0F172A",
  fontWeight: 900,
};

const activeKiText: React.CSSProperties = {
  fontSize: 12,
  color: "#334155",
  lineHeight: 1.45,
  fontWeight: 700,
};

const activeKiButton: React.CSSProperties = {
  border: "1px solid #2563EB",
  background: "#2563EB",
  color: "#FFFFFF",
  borderRadius: 10,
  padding: "8px 11px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  justifySelf: "start",
};














































