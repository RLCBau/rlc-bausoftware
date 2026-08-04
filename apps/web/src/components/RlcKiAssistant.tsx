import { rlcClass } from "../ui/rlcRuntimeStyle"; // apps/web/src/components/RlcKiAssistant.tsx
import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { API_BASE } from "../lib/apiBase";
import { buildRlcKnowledgeContext } from "../copilot/RlcSoftwareKnowledge";
import { LV, type LVPos } from "../pages/kalkulation/store.lv";
import {
  KalkulationsDatenbank,
  type KalkulationsErfahrung } from
"../pages/kalkulation/kalkulationsDatenbank";

const RLC_COPILOT_KI_AVATAR_SRC = "/assets/rlc-copilot-cartoon.webp";

function rlcNum(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const raw = String(value).trim();
  const normalized = raw.includes(",") ?
  raw.replace(/\./g, "").replace(",", ".") :
  raw;
  const parsed = typeof value === "number" ? value : Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeReactText(value: any): string {
  if (value === null || value === undefined) return "";
  if (
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean")
  {
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
type PageRuntimeSnapshot = {
  title: string;
  headings: string[];
  buttons: string[];
  fields: Array<{label: string;value: string;}>;
  visibleText: string[];
  selectedText: string;
  capturedAt: string;
};

function compactText(value: unknown, max = 180): string {
  return String(value ?? "").
  replace(/\s+/g, " ").
  trim().
  slice(0, max);
}

function collectPageRuntimeSnapshot(): PageRuntimeSnapshot {
  if (typeof document === "undefined") {
    return {
      title: "",
      headings: [],
      buttons: [],
      fields: [],
      visibleText: [],
      selectedText: "",
      capturedAt: ""
    };
  }

  const isVisible = (el: Element): boolean => {
    const node = el as HTMLElement;
    const style = window.getComputedStyle(node);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      node.offsetParent !== null);

  };

  const unique = (values: string[], limit: number): string[] =>
  Array.from(
    new Set(values.map((x) => compactText(x)).filter(Boolean))
  ).slice(0, limit);

  const headings = unique(
    Array.from(
      document.querySelectorAll(
        "main h1, main h2, main h3, .content h1, .content h2, .content h3"
      )
    ).
    filter(isVisible).
    map((el) => el.textContent || ""),
    24
  );

  const buttons = unique(
    Array.from(
      document.querySelectorAll(
        "main button, .content button, main [role='button'], .content [role='button']"
      )
    ).
    filter(isVisible).
    map(
      (el) =>
      el.textContent ||
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      ""
    ),
    36
  );

  const fields = Array.from(
    document.querySelectorAll(
      "main input, main select, main textarea, .content input, .content select, .content textarea"
    )
  ).
  filter(isVisible).
  slice(0, 40).
  map((el) => {
    const input = el as
    HTMLInputElement |
    HTMLSelectElement |
    HTMLTextAreaElement;
    const id = input.id;
    const explicitLabel = id ?
    document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent :
    "";
    const wrappingLabel = input.closest("label")?.textContent || "";
    const nearbyLabel =
    input.parentElement?.previousElementSibling?.textContent || "";
    const label = compactText(
      explicitLabel ||
      wrappingLabel ||
      nearbyLabel ||
      input.getAttribute("aria-label") ||
      input.name || (
      "placeholder" in input ? input.placeholder : "") ||
      input.type,
      90
    );
    const value =
    input instanceof HTMLSelectElement ?
    compactText(
      input.selectedOptions?.[0]?.textContent || input.value,
      140
    ) :
    input.type === "password" ?
    "***" :
    compactText(input.value, 140);
    return { label, value };
  }).
  filter((x) => x.label || x.value);

  const visibleText = unique(
    Array.from(
      document.querySelectorAll(
        "main .card, main section, .content .card, .content section"
      )
    ).
    filter(isVisible).
    map((el) => el.textContent || "").
    filter((text) => text.trim().length >= 20),
    18
  );

  return {
    title: compactText(document.title, 140),
    headings,
    buttons,
    fields,
    visibleText,
    selectedText: compactText(window.getSelection?.()?.toString() || "", 500),
    capturedAt: new Date().toISOString()
  };
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
  "server"];


  const source = String(row?.source || "").trim();

  return (
    rlcNum(row?.rlcKiUnitPrice) > 0 ||
    rlcNum(row?.finalUnitPrice) > 0 ||
    rlcNum(row?.preis) > 0 ||
    rlcNum(row?.totalNet) > 0 ||
    rlcNum(row?.rlcKiTotal) > 0 ||
    rlcNum(row?.gesamt) > 0 ||
    Array.isArray(row?.priceBreakdown) && row.priceBreakdown.length > 0 ||
    !!row?.reverseUrkalkulation ||
    validSources.includes(source));

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
"kalkulation" |
"mengenermittlung" |
"cad" |
"buro" |
"ki" |
"buchhaltung" |
"info" |
"projekt" |
"start" |
"global";

type PageKey =
"kalkulation-uebersicht" |
"kalkulation-lv" |
"kalkulation-mit-ki" |
"kalkulation-datenbank" |
"kalkulation-gaeb" |
"kalkulation-preise" |
"kalkulation-angebot" |
"kalkulation-nachtraege" |
"kalkulation-versionsvergleich" |
"kalkulation-crm" |
"kalkulation-rezepte" |
"projekt-uebersicht" |
"start-projekt" |
"mengenermittlung" |
"mengenermittlung-uebersicht" |
"mengenermittlung-aufmasseditor" |
"mengenermittlung-soll-ist" |
"mengenermittlung-auto" |
"mengenermittlung-gps" |
"mengenermittlung-historie" |
"mengenermittlung-bilder" |
"cad" |
"buro" |
"buchhaltung" |
"ki" |
"info" |
"global";

type ButtonKind = "primary" | "secondary" | "danger";
type CopilotMode = "idle" | "listening" | "speaking" | "analyzing";

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
  ps: "PS"
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
  "rlc_access_token"];


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
    }}

  return "";
}

function n(value: unknown): number {
  const raw = String(value ?? "0").
  replace(/\s/g, "").
  replace(/\.(?=\d{3}(?:[.,]|$))/g, "").
  replace(",", ".");

  const x = Number(raw);
  return Number.isFinite(x) ? x : 0;
}

function money(value: unknown): string {
  return `${n(value).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} €`;
}

function pct(value: unknown): string {
  const v = n(value);
  const percent = v <= 1 ? v * 100 : v;
  return `${Math.round(percent)} %`;
}

function norm(value: unknown): string {
  return String(value ?? "").
  toLowerCase().
  normalize("NFKD").
  replace(/[\u0300-\u036f]/g, "").
  replace(/[^\p{L}\p{N}]+/gu, " ").
  replace(/\s+/g, " ").
  trim();
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
  return n(
    r.finalUnitPrice ?? r.preis ?? r.suggestedUnitPrice ?? r.baseUnitPrice
  );
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

function getDbDuplicateGroups(
rows: KalkulationsErfahrung[])
: KalkulationsErfahrung[][] {
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
  pathname.startsWith("/projekt/Übersicht"))
  {
    return "projekt-uebersicht";
  }

  if (pathname.startsWith("/kalkulation/nachtraege"))
  return "kalkulation-nachtraege";
  if (pathname.startsWith("/kalkulation/versionsvergleich")) {
    return "kalkulation-versionsvergleich";
  }
  if (pathname.startsWith("/kalkulation/crm")) return "kalkulation-crm";

  if (
  pathname.startsWith("/kalkulation/rezepte") ||
  pathname.startsWith("/kalkulation/recipes") ||
  pathname.startsWith("/kalkulation/urkalkulation"))
  {
    return "kalkulation-rezepte";
  }

  if (pathname === "/kalkulation" || pathname === "/kalkulation/") {
    return "kalkulation-uebersicht";
  }

  if (
  pathname.startsWith("/kalkulation/lv-import") ||
  pathname.startsWith("/kalkulation/lv"))
  {
    return "kalkulation-lv";
  }

  if (pathname.startsWith("/kalkulation/mit-ki")) return "kalkulation-mit-ki";

  if (
  pathname.startsWith("/kalkulation/datenbank/preise") ||
  pathname.startsWith("/kalkulation/preise"))
  {
    return "kalkulation-preise";
  }

  if (pathname.startsWith("/kalkulation/datenbank"))
  return "kalkulation-datenbank";
  if (pathname.startsWith("/kalkulation/gaeb")) return "kalkulation-gaeb";
  if (pathname.startsWith("/kalkulation/angebot")) return "kalkulation-angebot";
  if (pathname === "/mengenermittlung" || pathname === "/mengenermittlung/")
  return "mengenermittlung-uebersicht";
  if (
  pathname.startsWith("/mengenermittlung/aufmasseditor") ||
  pathname.startsWith("/mengenermittlung/aufmass"))

  return "mengenermittlung-aufmasseditor";
  if (
  pathname.startsWith("/mengenermittlung/soll-ist") ||
  pathname.startsWith("/mengenermittlung/vergleich"))

  return "mengenermittlung-soll-ist";
  if (
  pathname.startsWith("/mengenermittlung/auto") ||
  pathname.startsWith("/mengenermittlung/manuell") ||
  pathname.startsWith("/mengenermittlung/import"))

  return "mengenermittlung-auto";
  if (
  pathname.startsWith("/mengenermittlung/gps") ||
  pathname.startsWith("/mengenermittlung/GPSZuweisung"))

  return "mengenermittlung-gps";
  if (pathname.startsWith("/mengenermittlung/historie"))
  return "mengenermittlung-historie";
  if (pathname.startsWith("/mengenermittlung/bilder"))
  return "mengenermittlung-bilder";
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
  if (pageKey === "kalkulation-datenbank")
  return "Kalkulation · Kalkulationsdatenbank";
  if (pageKey === "kalkulation-gaeb") return "Kalkulation · GAEB";
  if (pageKey === "kalkulation-preise") return "Kalkulation · Preise";
  if (pageKey === "kalkulation-angebot") return "Kalkulation · Angebot";
  if (pageKey === "kalkulation-nachtraege") return "Kalkulation · Nachträge";
  if (pageKey === "kalkulation-versionsvergleich") {
    return "Kalkulation · Versionsvergleich / Angebotsanalyse";
  }
  if (pageKey === "kalkulation-crm")
  return "Kalkulation · CRM / Angebotsverfolgung";
  if (pageKey === "kalkulation-rezepte")
  return "Kalkulation · Urkalkulation / Rezepte";
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
    return "Ich prüfe hier Nachträge, fehlende Begründungen, Mengen, EP, Einheiten, Dubletten, Angebot-übergabe, PDF und Server-Speicherung.";
  }

  if (pageKey === "kalkulation-uebersicht") {
    return "Ich bin in der Kalkulationszentrale. Ich sehe LV, Datenbank, KI-Kalkulation, GAEB und Angebot und führe dich zum nächsten sinnvollen Schritt.";
  }

  if (pageKey === "kalkulation-lv") {
    return "Ich prüfe hier LV-Positionen, fehlende Einheiten, Mengen, EP, Langtexte, Dubletten und übergabe an GAEB oder KI-Kalkulation.";
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

  if (pageKey === "mengenermittlung-aufmasseditor") {
    return "Ich bin direkt mit dem Aufmaß-Editor verbunden. Ich erkenne sichtbare LV-Positionen, Orte/Unterorte, Aufmaßzeilen, Eingabefelder, Summen und verfügbare Aktionen und beantworte Fragen anhand des aktuellen Seitenzustands.";
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
    (row.posNr ? 10 : 0) + (
    row.kurztext ? 10 : 0) + (
    row.langtext ? 6 : 0) + (
    row.einheit ? 5 : 0) + (
    n(row.menge) > 0 ? 10 : 0) + (
    rowPrice(row) > 0 ? 10 : 0) + (
    row.priceBreakdown?.length ? 8 : 0));

}

function dbScore(row: KalkulationsErfahrung): number {
  return (
    (row.posNr ? 8 : 0) + (
    row.kurztext ? 10 : 0) + (
    row.langtext ? 6 : 0) + (
    row.einheit ? 6 : 0) + (
    n(row.menge) > 0 ? 6 : 0) + (
    dbEntryPrice(row) > 0 ? 12 : 0) + (
    row.ressourcen?.length ? 10 : 0) + (
    n(row.verwendungen) > 0 ? 5 : 0) +
    Math.round(n(row.confidence) * 10));

}

function getProjectCodeFromPage(): string {
  try {
    const normalizeCode = (value: unknown): string => {
      const raw = String(value ?? "").trim();
      if (!raw) return "";
      const match = raw.match(/\bBA-\d{4}-[A-Z0-9_-]+\b/i);
      return (match?.[0] || raw).trim().toUpperCase();
    };

    const url = new URL(window.location.href);
    const fromUrl =
    url.searchParams.get("projectCode") ||
    url.searchParams.get("code") ||
    url.searchParams.get("ba") ||
    url.searchParams.get("project");

    const urlCode = normalizeCode(fromUrl);
    if (urlCode) return urlCode;

    const globals = [
    (window as any).__RLC_CURRENT_PROJECT__?.code,
    (window as any).__RLC_CURRENT_PROJECT__?.projectCode,
    (window as any).__RLC_ACTIVE_PROJECT__?.code,
    (window as any).__RLC_ACTIVE_PROJECT__?.projectCode,
    (window as any).__RLC_KALKULATION_RUNTIME_SUMMARY__?.projectCode,
    (window as any).__RLC_KALKULATION_RUNTIME_SUMMARY__?.code,
    (window as any).__RLC_PROJECT_CODE__,
    (window as any).rlcProjectCode];


    for (const value of globals) {
      const code = normalizeCode(value);
      if (code) return code;
    }

    const body = document.body?.innerText || "";
    const bodyCode = normalizeCode(body);
    if (bodyCode) return bodyCode;

    const keys = [
    "rlc_current_project",
    "rlc_current_project_v1",
    "rlc_current_project_code",
    "rlc_project_current",
    "rlc_active_project",
    "currentProject",
    "selectedProject",
    "rlc_project",
    "project"];


    for (const store of [localStorage, sessionStorage]) {
      for (const key of keys) {
        const raw = store.getItem(key);
        if (!raw) continue;

        try {
          const p = JSON.parse(raw);
          const code = normalizeCode(
            p?.code ??
            p?.projectCode ??
            p?.baCode ??
            p?.number ??
            p?.projektnummer ??
            p?.baustellenNummer ??
            p?.baustellennummer
          );

          if (code) return code;
        } catch {
          const code = normalizeCode(raw);
          if (code) return code;
        }
      }
    }

    const localStorageCodeKey = Object.keys(localStorage).find((key) =>
    /project.*code|code.*project|baustelle|ba-\d{4}/i.test(key)
    );

    if (localStorageCodeKey) {
      const code = normalizeCode(localStorage.getItem(localStorageCodeKey));
      if (code) return code;
    }
  } catch {

    //
  }
  return "";
}

function getProjectTitleFromPage(): string {
  try {
    const globals = [
    (window as any).__RLC_CURRENT_PROJECT__?.name,
    (window as any).__RLC_CURRENT_PROJECT__?.title,
    (window as any).__RLC_CURRENT_PROJECT__?.projectName,
    (window as any).__RLC_ACTIVE_PROJECT__?.name,
    (window as any).__RLC_ACTIVE_PROJECT__?.title,
    (window as any).__RLC_ACTIVE_PROJECT__?.projectName,
    (window as any).__RLC_KALKULATION_RUNTIME_SUMMARY__?.projectName,
    (window as any).__RLC_KALKULATION_RUNTIME_SUMMARY__?.projectTitle];


    for (const value of globals) {
      const title = String(value ?? "").trim();
      if (title) return title;
    }

    const keys = [
    "rlc_current_project",
    "rlc_current_project_v1",
    "rlc_project_current",
    "rlc_active_project",
    "currentProject",
    "selectedProject",
    "rlc_project",
    "project"];


    for (const store of [localStorage, sessionStorage]) {
      for (const key of keys) {
        const raw = store.getItem(key);
        if (!raw) continue;

        try {
          const p = JSON.parse(raw);
          const title = String(
            p?.name ??
            p?.title ??
            p?.projectName ??
            p?.projektName ??
            p?.bezeichnung ??
            ""
          ).trim();

          if (title) return title;
        } catch {

          //
        }}
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
  const unchangedRaw = Array.isArray(detail?.unchanged) ?
  detail?.unchanged :
  [];

  return {
    title: compactKiText(detail?.title) || "KI-Analyse abgeschlossen",
    changes: uniqueCompactList(changesRaw, 6),
    warnings: uniqueCompactList(warningsRaw, 4),
    unchanged: uniqueCompactList(unchangedRaw, 3)
  };
}

function copilotModeLabel(mode: CopilotMode): string {
  if (mode === "listening") return "hört zu";
  if (mode === "speaking") return "spricht";
  if (mode === "analyzing") return "analysiert";
  return "bereit";
}

function stripForSpeech(text: string): string {
  return String(text || "").
  replace(/https?:\/\/\S+/gi, "").
  replace(/[?*_#`>\[\]{}]/g, " ").
  replace(/\s+/g, " ").
  trim().
  slice(0, 900);
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

  const [voiceEnabled, setVoiceEnabled] = React.useState(false);
  const [isListening, setIsListening] = React.useState(false);
  const [isSpeaking, setIsSpeaking] = React.useState(false);
  const recognitionRef = React.useRef<any>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = React.useRef<string | null>(null);
  const chatListRef = React.useRef<HTMLDivElement | null>(null);

  const [activeKiSuggestion, setActiveKiSuggestion] =
  React.useState<ActiveKiSuggestion | null>(null);
  const [kiSignalPulse, setKiSignalPulse] = React.useState(false);
  const [secretaryAlert, setSecretaryAlert] = React.useState("");
  const secretaryLastSignatureRef = React.useRef("");
  const moduleKey = getModuleKey(pathname);
  const pageKey = getPageKey(pathname);
  const current = routeLabel(pathname);
  const chatStorageKey = `rlc_ki_assistant_chat_v2:${pageKey}`;
  const copilotMode: CopilotMode = isListening ?
  "listening" :
  isSpeaking ?
  "speaking" :
  busy || kiWorking ?
  "analyzing" :
  "idle";
  const voiceAvailable =
  typeof window !== "undefined" && typeof Audio !== "undefined";
  const recognitionAvailable =
  typeof window !== "undefined" && (
  !!(window as any).SpeechRecognition ||
  !!(window as any).webkitSpeechRecognition);

  const [messages, setMessages] = React.useState<ChatMsg[]>([
  {
    role: "assistant",
    text: "Ich bin RLC Copilot. Ich erkenne Projekt, Seite und Kalkulationsdaten und antworte projektbezogen."
  }]
  );

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(chatStorageKey);
      const parsed = raw ? JSON.parse(raw) : null;

      if (Array.isArray(parsed) && parsed.length) {
        const clean = parsed.filter(
          (m) =>
          m && (
          m.role === "user" || m.role === "assistant") &&
          typeof m.text === "string"
        );

        if (clean.length) setMessages(clean);
      }
    } catch {

      //
    }}, [chatStorageKey]);

  React.useEffect(() => {
    try {
      sessionStorage.setItem(
        chatStorageKey,
        JSON.stringify(messages.slice(-30))
      );
    } catch {

      //
    }}, [chatStorageKey, messages]);

  React.useEffect(() => {
    if (!open || tab !== "support") return;
    const el = chatListRef.current;
    if (!el) return;
    window.setTimeout(() => {
      el.scrollTop = el.scrollHeight;
    }, 40);
  }, [messages, open, tab]);

  React.useEffect(() => {
    setOpen(false);
    setStatus("");
  }, [pathname]);

  React.useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop?.();
      } catch {

        //
      }
      try {
        audioRef.current?.pause?.();
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioRef.current = null;
        audioUrlRef.current = null;
        (window as any).speechSynthesis?.cancel?.();
      } catch {

        //
      }};
  }, []);

  React.useEffect(() => {
    function onStart(event: Event) {
      const detail = (event as CustomEvent<any>).detail || {};

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
        pageKey: detail.pageKey || pageKey
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
      window.removeEventListener(
        "rlc:active-ki-suggestion",
        onActiveKiSuggestion
      );
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

  const lvDuplicateGroups = React.useMemo(
    () => getLvDuplicateGroups(lvRows),
    [lvRows]
  );
  const dbDuplicateGroups = React.useMemo(
    () => getDbDuplicateGroups(dbRows),
    [dbRows]
  );

  const lvDuplicateCount = React.useMemo(
    () =>
    lvDuplicateGroups.reduce((sum, g) => sum + Math.max(0, g.length - 1), 0),
    [lvDuplicateGroups]
  );

  const dbDuplicateCount = React.useMemo(
    () =>
    dbDuplicateGroups.reduce((sum, g) => sum + Math.max(0, g.length - 1), 0),
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

    window.addEventListener(
      "rlc:kalkulation-runtime-summary",
      onRuntimeSummary
    );

    const currentSummary = (window as any).__RLC_KALKULATION_RUNTIME_SUMMARY__;
    if (currentSummary) setRuntimeKalkulationSummary(currentSummary);

    return () => {
      window.removeEventListener(
        "rlc:kalkulation-runtime-summary",
        onRuntimeSummary
      );
    };
  }, [pathname, open, refresh]);

  const lvStats = React.useMemo(() => {
    const missingUnits = lvRows.filter(
      (r) => !String(r.einheit || "").trim()
    ).length;
    const missingQty = lvRows.filter((r) => n(r.menge) <= 0).length;
    const missingPrice = lvRows.filter((r) => rowPrice(r) <= 0).length;
    const missingBreakdown = lvRows.filter(
      (r) => !hasValidKiCalculation(r)
    ).length;

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
      projectCode ? `rlc_kalkulation_mit_ki_elite_v1:${projectCode}` : ""].
      filter(Boolean);

      const fallbackKeys = Object.keys(localStorage).
      filter((key) => key.startsWith("rlc_kalkulation_mit_ki_elite_v1:")).
      sort((a, b) => {
        const aHit = projectCode && a.includes(projectCode) ? 1 : 0;
        const bHit = projectCode && b.includes(projectCode) ? 1 : 0;
        return bHit - aHit;
      });

      for (const key of [...directKeys, ...fallbackKeys]) {
        try {
          const raw = localStorage.getItem(key);
          const parsed = raw ? JSON.parse(raw) : null;
          const rows = Array.isArray(parsed) ?
          parsed :
          Array.isArray(parsed?.rows) ?
          parsed.rows :
          [];

          if (rows.length) return rows;
        } catch {

          // ignore broken localStorage entries
        }}

      return [];
    }

    function readServerKiSummaryForAssistant(): any | null {
      const directKeys = [
      projectCode ? `rlc_kalkulation_server_summary_v1:${projectCode}` : ""].
      filter(Boolean);

      const fallbackKeys = Object.keys(localStorage).
      filter((key) => key.startsWith("rlc_kalkulation_server_summary_v1:")).
      sort((a, b) => {
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
        }}

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
      const gp = n(r.rlcKiTotal ?? r.totalNet ?? r.gesamt);

      return sum + (gp > 0 ? gp : qty * ep);
    }, 0);

    const net =
    kiNet > 0 ?
    kiNet :
    lvRows.reduce((sum, r) => sum + n(r.menge) * rowPrice(r), 0);

    const unitFixable = lvRows.filter((r) => {
      const key = String(r.einheit || "").
      trim().
      toLowerCase();
      return !!ME_FIX[key] && ME_FIX[key] !== r.einheit;
    }).length;

    const missingPosNr = lvRows.filter(
      (r) => !String(r.posNr || "").trim()
    ).length;
    const missingText = lvRows.filter(
      (r) =>
      !String(r.kurztext || "").trim() && !String(r.langtext || "").trim()
    ).length;

    const runtime =
    pathname.includes("/kalkulation") && runtimeKalkulationSummary ?
    runtimeKalkulationSummary :
    null;

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
      missingPrice: hasRuntimeKiCalculation ?
      0 :
      runtime?.missingPrice ?? missingPrice,
      missingBreakdown: hasRuntimeKiCalculation ? 0 : missingBreakdown,
      activeKi: runtime?.activeKi ?? null,
      safeRows,
      unitFixable,
      missingPosNr,
      missingText
    };
  }, [lvRows, lvDuplicateCount, pathname, runtimeKalkulationSummary]);

  const dbStats = React.useMemo(() => {
    const missingUnit = dbRows.filter(
      (r) => !String(r.einheit || "").trim()
    ).length;
    const missingPrice = dbRows.filter((r) => dbEntryPrice(r) <= 0).length;
    const missingResources = dbRows.filter((r) => !r.ressourcen?.length).length;
    const highRisk = dbRows.filter(
      (r) => r.risiko === "hoch" || r.risiko === "kritisch"
    ).length;
    const lowConfidence = dbRows.filter((r) => n(r.confidence) < 0.7).length;
    const used = dbRows.filter((r) => n(r.verwendungen) > 0).length;
    const avgConfidence =
    dbRows.length > 0 ?
    dbRows.reduce((sum, r) => sum + n(r.confidence), 0) / dbRows.length :
    0;

    return {
      count: dbRows.length,
      duplicateCount: dbDuplicateCount,
      missingUnit,
      missingPrice,
      missingResources,
      highRisk,
      lowConfidence,
      used,
      avgConfidence
    };
  }, [dbRows, dbDuplicateCount]);

  const gaebLocalProblems = React.useMemo(() => {
    return (
      lvStats.missingPosNr +
      lvStats.missingText +
      lvStats.missingUnits +
      lvStats.missingQty +
      lvStats.duplicateCount);

  }, [lvStats]);

  function buildCopilotContext(userMessage?: string) {
    const projectCode = getProjectCodeFromPage();
    const projectTitle = getProjectTitleFromPage();
    const runtime = runtimeKalkulationSummary || {};
    const pageRuntime = collectPageRuntimeSnapshot();
    const softwareKnowledge = buildRlcKnowledgeContext(String(userMessage || ""), pathname);

    return {
      source: "rlc-web-copilot",
      userMessage: String(userMessage || "").trim(),
      pageKey,
      pathname,
      module: current,
      moduleKey,
      status,
      project: {
        code: projectCode || "",
        title: projectTitle || "",
        detected: Boolean(projectCode)
      },
      kalkulation: {
        projectCode: projectCode || runtime?.projectCode || "",
        count: lvStats.count,
        net: lvStats.net,
        duplicateCount: lvStats.duplicateCount,
        missingUnits: lvStats.missingUnits,
        missingQty: lvStats.missingQty,
        missingPrice: lvStats.missingPrice,
        missingBreakdown: lvStats.missingBreakdown,
        activeKi: lvStats.activeKi,
        runtimeSummary: runtime
      },
      kalkulationsdatenbank: dbStats,
      gaeb: {
        localProblems: gaebLocalProblems,
        projectCode: projectCode || ""
      },
      pageRuntime,
      softwareKnowledge,
      aufmasseditor:
      pageKey === "mengenermittlung-aufmasseditor" ?
      {
        purpose:
        "LV-bezogenes Aufmaß mit Orte/Unterorte, Aufmaßzeilen, Formeln, Mengen, Summen und Export",
        headings: pageRuntime.headings,
        actions: pageRuntime.buttons,
        fields: pageRuntime.fields,
        visibleSections: pageRuntime.visibleText,
        selectedText: pageRuntime.selectedText
      } :
      undefined,
      ui: {
        open,
        tab,
        copilotMode,
        voiceEnabled
      }
    };
  }

  function buildCopilotPromptMessage(userMessage: string): string {
    const context = buildCopilotContext(userMessage);
    const projectCode = context.project.code || "nicht erkannt";
    const projectTitle = context.project.title || "nicht erkannt";

    if (isGeneralConversationModeActive()) {
      return [
      "Du bist RLC Copilot, aber der Nutzer hat bewusst den freien Gesprächsmodus aktiviert.",
      "Antworte immer auf Deutsch.",
      "Sprich natürlich, warm, aufmerksam und menschlich, nicht wie ein technischer Bot.",
      "Wichtig: Antworte direkt auf das konkrete Thema des Nutzers. Keine Standardblöcke, keine Menüpfade, keine Projektanalyse, keine wiederholte Erklärung, dass du normal reden kannst.",
      "Wenn der Nutzer über Alltag, Essen, Wetter, Familie, Ideen, Gesundheit oder Stimmung spricht, führe das Gespräch frei weiter und stelle höchstens eine passende kurze Anschlussfrage.",
      "Nur wenn der Nutzer ausdrücklich zurück zum Projekt, zur Kalkulation oder zu RLC will, darfst du wieder technisch werden.",
      "Halte die Antwort kurz, angenehm und lebendig: 2 bis 5 Sätze reichen meistens.",
      "",
      "AKTUELLER MODUS: Freies Gespräch, Projekt bewusst ausgeblendet.",
      "FRAGE / NACHRICHT DES NUTZERS:",
      userMessage].
      join("\n");
    }

    const lines = [
    "Du bist RLC Copilot: eine aktive, intelligente Sekretärin und vollwertige allgemeine KI-Assistentin innerhalb der RLC Bausoftware.",
    "Beantworte jede Nutzerfrage direkt, natürlich und fachlich korrekt – auch wenn sie nichts mit Bau, Projekt oder der geöffneten Seite zu tun hat.",
    "Der Seiten- und Projektkontext ist zusätzliches Wissen, kein Zwangsthema. Verwende ihn nur, wenn er zur Frage passt.",
    "Bei Fragen zur geöffneten Seite darfst du alle sichtbaren Daten, Felder, Aktionen und Projektinformationen konkret einbeziehen.",
    "Bei allgemeinen Themen antworte frei wie ein moderner KI-Assistent und erwähne die RLC-Seite nicht unnötig.",
    "Handle proaktiv: erkenne Aufgaben, Risiken, fehlende Angaben, Termine und sinnvolle nächste Schritte; formuliere jedoch keine erfundenen Tatsachen.",
    "Wenn ein Wert aus dem Kontext vorhanden ist, verwende ihn direkt. Frage nicht erneut nach Daten, die bereits im Kontext stehen.",
    "Wenn Projektdaten fehlen und sie für die konkrete Frage nötig sind, nenne exakt, welche Daten fehlen und wie sie in RLC ergänzt werden sollen.",
    "",
    "AKTUELLER RLC-KONTEXT:",
    `- Projektcode: ${projectCode}`,
    `- Projektname: ${projectTitle}`,
    `- Seite: ${context.module}`,
    `- Pfad: ${context.pathname}`,
    `- LV-Positionen: ${context.kalkulation.count}`,
    `- Netto RLC-KI: ${money(context.kalkulation.net)}`,
    `- Doppelte LV-Positionen: ${context.kalkulation.duplicateCount}`,
    `- Fehlende Einheiten: ${context.kalkulation.missingUnits}`,
    `- Fehlende Mengen: ${context.kalkulation.missingQty}`,
    `- EP fehlt: ${context.kalkulation.missingPrice}`,
    `- Urkalkulation fehlt: ${context.kalkulation.missingBreakdown}`,
    `- KI-Status: ${safeReactText(context.kalkulation.activeKi) || "nicht gesetzt"}`,
    `- Sichtbare Überschriften: ${context.pageRuntime.headings.join(" | ") || "keine erkannt"}`,
    `- Sichtbare Aktionen: ${context.pageRuntime.buttons.join(" | ") || "keine erkannt"}`,
    `- Aktuelle Eingaben: ${context.pageRuntime.fields.map((x) => `${x.label}: ${x.value}`).join(" | ") || "keine erkannt"}`,
    `- Sichtbarer Seiteninhalt: ${context.pageRuntime.visibleText.join(" || ") || "kein strukturierter Inhalt erkannt"}`,
    "",
    pageKey === "mengenermittlung-aufmasseditor" ?
    "AUFMASS-EDITOR-KONTEXT: Bei Fragen zum Aufmaß-Editor beziehe LV-Positionen, Orte/Unterorte, Aufmaßzeilen, Formeln, Mengen, Summen, Speichern und Export konkret ein. Bei anderen Fragen antworte frei zum tatsächlichen Thema des Nutzers." :
    "WICHTIGE REGEL:",
    "Doppelte Positionen werden in der Kalkulation über den Filter „Doppelte“ und anschließend über „Auswahl löschen“ bearbeitet. Der Copilot soll erklären und führen, aber nicht selbst blind löschen.",
    "",
    "FRAGE DES NUTZERS:",
    userMessage];


    return lines.join("\n");
  }

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
          filter
        }
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

  function normalizeNavigationText(value: string): string {
    return String(value || "").
    toLowerCase().
    normalize("NFD").
    replace(/[\u0300-\u036f]/g, "").
    replace(/ß/g, "ss").
    replace(/ä/g, "ae").
    replace(/ö/g, "oe").
    replace(/ü/g, "ue").
    replace(/[^a-z0-9]+/g, " ").
    replace(/\s+/g, " ").
    trim();
  }

  type CopilotRouteTarget = {path: string;label: string;answer: string;};

  const COPILOT_ROUTE_TARGETS: {
    keys: string[];
    path: string;
    label: string;
    answer: string;
  }[] = [
  {
    keys: [
    "mahnwesen",
    "mahnung",
    "mahnungen",
    "offene mahnungen",
    "zahlungsmahnung"],

    path: "/buchhaltung/mahnwesen",
    label: "Mahnwesen wird geöffnet.",
    answer:
    "Ich öffne das Mahnwesen in der Buchhaltung. Dort prüfst du offene Posten, Mahnungen und Zahlungsstatus."
  },
  {
    keys: [
    "kostenuebersicht",
    "kostenubersicht",
    "kosten uebersicht",
    "kosten ubersicht"],

    path: "/buchhaltung/kostenuebersicht",
    label: "Kostenübersicht wird geöffnet.",
    answer: "Ich öffne die Kostenübersicht pro Projekt."
  },
  {
    keys: [
    "abschlagsrechnungen",
    "abschlagsrechnung",
    "abschlag",
    "abschlaege",
    "abschlage"],

    path: "/buchhaltung/abschlagsrechnungen",
    label: "Abschlagsrechnungen werden geöffnet.",
    answer: "Ich öffne die Abschlagsrechnungen."
  },
  {
    keys: ["rechnungen", "rechnung", "schlussrechnung"],
    path: "/buchhaltung/rechnungen",
    label: "Rechnungen werden geöffnet.",
    answer: "Ich öffne Rechnungen / Abschläge in der Buchhaltung."
  },
  {
    keys: [
    "zahlungseingaenge",
    "zahlungseingange",
    "zahlungen",
    "offene posten",
    "zahlungseingang"],

    path: "/buchhaltung/zahlungen",
    label: "Zahlungen werden geöffnet.",
    answer: "Ich öffne Zahlungseingänge / Offene Posten."
  },
  {
    keys: ["eingangsrechnungen", "eingangsrechnung", "eingang"],
    path: "/buchhaltung/eingang",
    label: "Eingangsrechnungen werden geöffnet.",
    answer: "Ich öffne die Eingangsrechnungen."
  },
  {
    keys: ["kassenbuch", "kasse"],
    path: "/buchhaltung/kassenbuch",
    label: "Kassenbuch wird geöffnet.",
    answer: "Ich öffne das Kassenbuch."
  },
  {
    keys: [
    "kostenstellen",
    "kostenstelle",
    "projekt kostenstellenstruktur",
    "kostenstellenstruktur"],

    path: "/buchhaltung/kostenstellen",
    label: "Kostenstellen werden geöffnet.",
    answer: "Ich öffne die Projekt-Kostenstellenstruktur."
  },
  {
    keys: ["datev", "lexware", "sap", "datev export", "sap export"],
    path: "/buchhaltung/datev",
    label: "DATEV / Lexware / SAP Export wird geöffnet.",
    answer: "Ich öffne den DATEV / Lexware / SAP Export."
  },
  {
    keys: ["ust", "umsatzsteuer", "ust uebersicht", "ust ubersicht"],
    path: "/buchhaltung/ust",
    label: "USt.-Übersicht wird geöffnet.",
    answer: "Ich öffne die USt.-Übersicht."
  },
  {
    keys: ["lieferscheine kosten", "lieferschein kosten"],
    path: "/buchhaltung/lieferscheine",
    label: "Lieferscheine Kosten werden geöffnet.",
    answer: "Ich öffne die Lieferscheine in der Buchhaltung."
  },
  {
    keys: ["buchhaltung"],
    path: "/buchhaltung",
    label: "Buchhaltung wird geöffnet.",
    answer: "Ich öffne die Buchhaltung-Übersicht."
  },

  {
    keys: [
    "aufmass editor",
    "aufmasseditor",
    "aufmass editor",
    "aufmaß editor",
    "aufmaßeditor",
    "aufmass erfassen",
    "aufmaß erfassen"],

    path: "/mengenermittlung/aufmasseditor",
    label: "Aufmaß-Editor wird geöffnet.",
    answer:
    "Ich öffne den Aufmaß-Editor. Dort erfasst du Aufmaße direkt mit Maßen, Formeln und Positionen."
  },
  {
    keys: ["auftragsliste"],
    path: "/mengenermittlung/auftragsliste",
    label: "Auftragsliste wird geöffnet.",
    answer: "Ich öffne die Auftragsliste der Mengenermittlung."
  },
  {
    keys: [
    "mengenermittlung nach position",
    "position lv",
    "lv gestuetzt",
    "lv gestutzt",
    "mengen nach position"],

    path: "/mengenermittlung/aufmasseditor",
    label: "Mengenermittlung nach Position wird geöffnet.",
    answer: "Ich öffne die Mengenermittlung nach Position."
  },
  {
    keys: ["regieberichte", "regiebericht", "regie"],
    path: "/mengenermittlung/regieberichte",
    label: "Regieberichte werden geöffnet.",
    answer: "Ich öffne die Regieberichte."
  },
  {
    keys: [
    "manuell foto sprache",
    "per foto",
    "sprache",
    "foto aufmass",
    "manuell"],

    path: "/mengenermittlung/auto",
    label: "Manuell / Foto / Sprache wird geöffnet.",
    answer: "Ich öffne Manuell / per Foto / Sprache."
  },
  {
    keys: ["soll ist", "soll ist vergleich", "aufmassvergleich"],
    path: "/mengenermittlung/soll-ist",
    label: "Soll-Ist-Vergleich wird geöffnet.",
    answer: "Ich öffne den Aufmaßvergleich Soll-Ist."
  },
  {
    keys: [
    "automatisierte mengenermittlung",
    "auto mengenermittlung",
    "automatisch mengen"],

    path: "/mengenermittlung/auto",
    label: "Automatisierte Mengenermittlung wird geöffnet.",
    answer: "Ich öffne die automatisierte Mengenermittlung."
  },
  {
    keys: ["aufmasse ki", "aufmaße ki", "aufmass ki", "ki aufmass"],
    path: "/mengenermittlung/auto",
    label: "Aufmaße KI wird geöffnet.",
    answer: "Ich öffne Aufmaße KI."
  },
  {
    keys: [
    "import pdf cad landxml gsi csv",
    "landxml",
    "gsi",
    "csv import",
    "import mengenermittlung"],

    path: "/mengenermittlung/auto",
    label: "Import wird geöffnet.",
    answer: "Ich öffne den Import für PDF / CAD / LandXML / GSI / CSV."
  },
  {
    keys: ["lieferscheine", "lieferschein"],
    path: "/mengenermittlung/lieferscheine",
    label: "Lieferscheine werden geöffnet.",
    answer: "Ich öffne die Lieferscheine."
  },
  {
    keys: ["historie", "versionierung", "aufmass versionierung"],
    path: "/mengenermittlung/historie",
    label: "Historie wird geöffnet.",
    answer: "Ich öffne die Aufmaß-Historie."
  },
  {
    keys: ["gps", "positionszuweisung"],
    path: "/mengenermittlung/gps",
    label: "GPS-Zuweisung wird geöffnet.",
    answer: "Ich öffne die GPS-basierte Positionszuweisung."
  },
  {
    keys: ["bilder zum aufmass", "bilder zum aufmaß", "aufmass bilder"],
    path: "/mengenermittlung/bilder",
    label: "Bilder zum Aufmaß werden geöffnet.",
    answer: "Ich öffne Bilder zum Aufmaß."
  },
  {
    keys: ["ausdrucke", "ausdruck"],
    path: "/mengenermittlung/ausdrucke",
    label: "Ausdrucke werden geöffnet.",
    answer: "Ich öffne Ausdrucke."
  },
  {
    keys: ["mengenermittlung", "mengen", "aufmass", "aufmaß"],
    path: "/mengenermittlung",
    label: "Mengenermittlung wird geöffnet.",
    answer: "Ich öffne die Mengenermittlung-Übersicht."
  },

  {
    keys: ["cad viewer", "dwg", "dxf", "cad", "cad pdf"],
    path: "/cad/viewer",
    label: "CAD Viewer wird geöffnet.",
    answer: "Ich öffne den CAD Viewer."
  },
  {
    keys: ["pdf viewer", "pdf plan", "pdf plaene", "pdf pläne"],
    path: "/cad/pdf-viewer",
    label: "PDF Viewer wird geöffnet.",
    answer: "Ich öffne den PDF Viewer."
  },
  {
    keys: ["as built", "asbuilt"],
    path: "/cad/asbuild",
    label: "As-Built wird geöffnet.",
    answer: "Ich öffne As-Built."
  },
  {
    keys: ["layer", "eigenschaften", "cad tools"],
    path: "/cad/tools",
    label: "Layer & Eigenschaften wird geöffnet.",
    answer: "Ich öffne Layer & Eigenschaften."
  },
  {
    keys: ["cad mit karte", "karte", "map"],
    path: "/cad/map",
    label: "CAD mit Karte wird geöffnet.",
    answer: "Ich öffne CAD mit Karte."
  },

  {
    keys: ["projektverwaltung", "projekte buero", "projekte büro"],
    path: "/buro/projekte",
    label: "Projektverwaltung wird geöffnet.",
    answer: "Ich öffne die Projektverwaltung im Büro-Modul."
  },
  {
    keys: ["dokumentenverwaltung", "dokumente", "dokument"],
    path: "/buro/dokumente",
    label: "Dokumentenverwaltung wird geöffnet.",
    answer: "Ich öffne die Dokumentenverwaltung."
  },
  {
    keys: [
    "vertragsverwaltung",
    "vertraege",
    "verträge",
    "vertrag",
    "signatur"],

    path: "/buro/vertraege",
    label: "Vertragsverwaltung wird geöffnet.",
    answer: "Ich öffne die Vertragsverwaltung."
  },
  {
    keys: ["kommunikation", "notizen", "kommunikation notizen aufgaben"],
    path: "/buro/kommunikation",
    label: "Kommunikation wird geöffnet.",
    answer: "Ich öffne Kommunikation / Notizen / Aufgaben."
  },
  {
    keys: ["outlook", "kalender", "kalender integration"],
    path: "/buro/outlook",
    label: "Outlook / Kalender wird geöffnet.",
    answer: "Ich öffne Outlook / Kalender-Integration."
  },
  {
    keys: ["nutzerverwaltung", "rechte", "nutzer rechte"],
    path: "/buro/nutzerverwaltung",
    label: "Nutzerverwaltung wird geöffnet.",
    answer: "Ich öffne Nutzerverwaltung & Rechte."
  },
  {
    keys: ["bauzeitenplan", "gantt"],
    path: "/buro/bauzeitenplan",
    label: "Bauzeitenplan wird geöffnet.",
    answer: "Ich öffne den Bauzeitenplan."
  },
  {
    keys: ["personalverwaltung", "personal"],
    path: "/buro/personalverwaltung",
    label: "Personalverwaltung wird geöffnet.",
    answer: "Ich öffne die Personalverwaltung."
  },
  {
    keys: ["maschinenverwaltung", "maschinen", "wartung"],
    path: "/buro/maschinenverwaltung",
    label: "Maschinenverwaltung wird geöffnet.",
    answer: "Ich öffne die Maschinenverwaltung."
  },
  {
    keys: ["materialverwaltung", "material", "barcode", "rfid"],
    path: "/buro/materialverwaltung",
    label: "Materialverwaltung wird geöffnet.",
    answer: "Ich öffne die Materialverwaltung."
  },
  {
    keys: ["ressourcenplanung", "ressourcen"],
    path: "/buro/ressourcenplanung",
    label: "Ressourcenplanung wird geöffnet.",
    answer: "Ich öffne die Ressourcenplanung."
  },
  {
    keys: ["sicherheit", "unterweisungen", "unterweisung"],
    path: "/buro/sicherheit",
    label: "Sicherheit wird geöffnet.",
    answer: "Ich öffne Sicherheit & Unterweisungen."
  },
  {
    keys: ["uebergabe", "übergabe", "abnahme", "abnahmeprotokolle"],
    path: "/buro/uebergabe",
    label: "Übergabe wird geöffnet.",
    answer: "Ich öffne Digitale Übergabe & Abnahmeprotokolle."
  },
  {
    keys: ["lagerbestand", "lager", "einkauf"],
    path: "/buro/lager",
    label: "Lagerbestand & Einkauf wird geöffnet.",
    answer: "Ich öffne Lagerbestand & Einkauf."
  },
  {
    keys: ["aufgaben", "tasks", "task"],
    path: "/buro/tasks",
    label: "Aufgaben werden geöffnet.",
    answer: "Ich öffne Aufgaben."
  },
  {
    keys: ["buero", "buro", "büro", "verwaltung"],
    path: "/buro",
    label: "Büro / Verwaltung wird geöffnet.",
    answer: "Ich öffne die Büro / Verwaltung-Übersicht."
  },

  {
    keys: ["ki kalkulation", "kalkulation mit ki", "mit ki"],
    path: "/kalkulation/mit-ki",
    label: "KI-Kalkulation wird geöffnet.",
    answer: "Ich öffne die KI-Kalkulation."
  },
  {
    keys: ["lv import", "lv positionen", "leistungsverzeichnis"],
    path: "/kalkulation/lv-import",
    label: "LV / Positionen wird geöffnet.",
    answer: "Ich öffne LV / Positionen."
  },
  {
    keys: ["gaeb", "x83", "x84", "d83", "p83"],
    path: "/kalkulation/gaeb",
    label: "GAEB wird geöffnet.",
    answer: "Ich öffne die GAEB-Seite."
  },
  {
    keys: ["kalkulationsdatenbank", "datenbank", "preise"],
    path: "/kalkulation/datenbank",
    label: "Kalkulationsdatenbank wird geöffnet.",
    answer: "Ich öffne die Kalkulationsdatenbank."
  },
  {
    keys: ["versionsvergleich", "analyse vergleich"],
    path: "/kalkulation/versionsvergleich",
    label: "Versionsvergleich wird geöffnet.",
    answer: "Ich öffne Versionsvergleich / Analyse."
  },
  {
    keys: ["crm", "angebotsverfolgung"],
    path: "/kalkulation/crm",
    label: "CRM wird geöffnet.",
    answer: "Ich öffne CRM / Angebotsverfolgung."
  },
  {
    keys: ["nachtraege", "nachträge", "nachtrag"],
    path: "/kalkulation/nachtraege",
    label: "Nachträge werden geöffnet.",
    answer: "Ich öffne die Nachträge."
  },
  {
    keys: ["angebot", "angebot export"],
    path: "/kalkulation/angebot",
    label: "Angebot wird geöffnet.",
    answer: "Ich öffne Angebot / Export."
  },
  {
    keys: ["ur kalkulation", "urkalkulation", "rezepte", "recipes"],
    path: "/kalkulation/rezepte",
    label: "Urkalkulation wird geöffnet.",
    answer: "Ich öffne die Urkalkulation / Rezepte."
  },
  {
    keys: ["kalkulation", "kalkulieren"],
    path: "/kalkulation",
    label: "Kalkulation wird geöffnet.",
    answer: "Ich öffne die Kalkulation-Übersicht."
  }];


  function resolveCopilotRouteTarget(
  userText: string)
  : CopilotRouteTarget | null {
    const q = ` ${normalizeNavigationText(userText)} `;

    const wantsNavigation =
    /\b(oeffne|offne|open|gehe|geh|wechsel|zeige|zeig|navigiere|bring mich|portami|porta|vai|mandami|ins|zum|zur|in die|in den|apri|aprimi)\b/.test(
      q
    );
    const asksLocation =
    /\b(wo finde|wo ist|wo kann|wie komme|dove trovo|dove e|dove sta)\b/.test(
      q
    );

    if (!wantsNavigation && !asksLocation) return null;

    const sorted = [...COPILOT_ROUTE_TARGETS].sort((a, b) => {
      const al = Math.max(
        ...a.keys.map((x) => normalizeNavigationText(x).length)
      );
      const bl = Math.max(
        ...b.keys.map((x) => normalizeNavigationText(x).length)
      );
      return bl - al;
    });

    for (const item of sorted) {
      if (
      item.keys.some((key) => q.includes(` ${normalizeNavigationText(key)} `)))
      {
        return { path: item.path, label: item.label, answer: item.answer };
      }
    }

    return null;
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
      checkSurcharges: "Zuschläge und EP werden geprüft."
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
      exportCsv: "CSV-Export wird gestartet."
    };

    setStatus(label[action] || `Analyse-Aktion gestartet: ${action}`);
  }

  function sendCrmCommand(action: string) {
    sendPageCommand("rlc:crm-command", { action });

    const label: Record<string, string> = {
      showOpen: "Offene Angebote werden angezeigt.",
      showOverdue: "überfällige Follow-ups werden angezeigt.",
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
      syncServer: "CRM-Daten werden am Server gespeichert."
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
      deleteSelectedImportedFromLv:
      "Ausgewählte importierte Positionen werden entfernt.",
      clearImport: "GAEB-Import wird aus der Ansicht entfernt."
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
      doppelte: "Filter: Dubletten / Konflikte."
    };

    setStatus(label[filter] || `GAEB-Filter aktiviert: ${filter}`);
  }

  function sendKalkulationFilter(filter: string) {
    sendSimpleFilter(
      "rlc:kalkulation-filter",
      filter,
      `Filter aktiviert: ${filter}`
    );
  }

  function sendKalkulationAction(action: string) {
    const label =
    action === "runKi" ?
    "KI-Kalkulation läuft…" :
    action === "completeMissing" ?
    "Fehlende Daten werden ergänzt…" :
    "KI-Aktion läuft…";

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
        unchanged: ["Keine doppelten LV-Positionen gefunden."]
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
        changes.push(
          `${rowLabel(r)} gelöscht · behalten wurde ${rowLabel(keep)}.`
        );
      });
    }

    LV.setAll(lvRows.filter((r) => !removeIds.has(r.id)));

    setStatus(`${removeIds.size} doppelte LV-Position(en) gelöscht.`);
    setRefresh((x) => x + 1);
    window.dispatchEvent(new StorageEvent("storage", { key: LV.key }));

    finishLocalProgress({
      title: "Doppelte LV-Positionen bereinigt",
      changes
    });
  }

  function deleteDbDuplicates() {
    if (!dbDuplicateGroups.length) {
      setStatus("Keine doppelten Datenbank-Einträge gefunden.");
      finishLocalProgress({
        title: "Dublettenprüfung Datenbank abgeschlossen",
        changes: [],
        unchanged: ["Keine doppelten Datenbank-Einträge gefunden."]
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
        changes.push(
          `${dbLabel(r)} gelöscht · behalten wurde ${dbLabel(keep)}.`
        );
      });
    }

    removeIds.forEach((id) => KalkulationsDatenbank.remove(id));

    setStatus(
      `${removeIds.size} doppelte Datenbank-Eintrag/Einträge gelöscht.`
    );
    setRefresh((x) => x + 1);
    window.dispatchEvent(
      new StorageEvent("storage", { key: KalkulationsDatenbank.key })
    );

    finishLocalProgress({
      title: "Doppelte Datenbank-Einträge bereinigt",
      changes
    });
  }

  function normalizeLvUnits() {
    startLocalProgress("Einheiten werden für GAEB normalisiert…");

    const changes: string[] = [];
    const next = lvRows.map((r) => {
      const key = String(r.einheit || "").
      trim().
      toLowerCase();
      const fixed = ME_FIX[key];

      if (fixed && fixed !== r.einheit) {
        changes.push(
          `${rowLabel(r)}: Einheit ${r.einheit || "leer"} → ${fixed}`
        );
        return { ...r, einheit: fixed };
      }

      return r;
    });

    LV.setAll(next);

    setRefresh((x) => x + 1);
    window.dispatchEvent(new StorageEvent("storage", { key: LV.key }));

    setStatus(
      changes.length ?
      `${changes.length} Einheit(en) normalisiert.` :
      "Keine normalisierbaren Einheiten gefunden."
    );

    finishLocalProgress({
      title: "GAEB-Einheiten normalisiert",
      changes,
      unchanged: changes.length ?
      [] :
      ["Keine Einheiten mussten geändert werden."]
    });
  }

  function showGaebLocalProblems() {
    const warnings: string[] = [];

    if (lvStats.missingPosNr)
    warnings.push(
      `${lvStats.missingPosNr} Position(en) ohne Positionsnummer.`
    );
    if (lvStats.missingText)
    warnings.push(
      `${lvStats.missingText} Position(en) ohne Kurztext/Langtext.`
    );
    if (lvStats.missingUnits)
    warnings.push(`${lvStats.missingUnits} Position(en) ohne Einheit.`);
    if (lvStats.missingQty)
    warnings.push(
      `${lvStats.missingQty} Position(en) ohne Menge oder mit Menge 0.`
    );
    if (lvStats.duplicateCount)
    warnings.push(`${lvStats.duplicateCount} doppelte LV-Position(en).`);
    if (lvStats.unitFixable)
    warnings.push(
      `${lvStats.unitFixable} Einheit(en) können automatisch normalisiert werden.`
    );

    finishLocalProgress({
      title: "GAEB-Vorprüfung lokal",
      changes: warnings.length ?
      [] :
      ["Keine lokalen GAEB-Strukturprobleme gefunden."],
      warnings
    });

    setStatus(
      warnings.length ?
      `Lokale GAEB-Vorprüfung: ${warnings.length} Problemgruppe(n) gefunden.` :
      "Lokale GAEB-Vorprüfung ohne Probleme."
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
      if (pageKey === "mengenermittlung-aufmasseditor") {
        const runtime = collectPageRuntimeSnapshot();
        return `${base} Erkläre konkret den aktuell sichtbaren Aufmaß-Editor. Nutze diese real erkannten Seitendaten: Überschriften: ${runtime.headings.join(" | ") || "keine"}; Aktionen: ${runtime.buttons.join(" | ") || "keine"}; Eingaben: ${runtime.fields.map((x) => `${x.label}: ${x.value}`).join(" | ") || "keine"}; sichtbare Bereiche: ${runtime.visibleText.join(" || ") || "keine"}. Erkläre LV-Auswahl, Orte/Unterorte, Aufmaßzeilen, Formeln/Mengen, Summen, Speichern und Export nur soweit sie aktuell sichtbar oder aus diesen Daten sicher ableitbar sind.`;
      }
      return `${base} Erkläre professionell und konkret, was diese Seite macht und welche Schritte sinnvoll sind.`;
    }

    if (kind === "workflow") {
      return `${base} Gib mir einen klaren Arbeitsablauf mit Prioritäten, Prüfungen und typischen Fehlerquellen.`;
    }

    if (kind === "error") {
      return `${base} Hilf mir bei der Fehlersuche. Frage gezielt nach den notwendigen Informationen und schlage konkrete Kontrollen vor.`;
    }

    if (kind === "recipes") {
      return `${base} Prüfe die Urkalkulation fachlich: Positionsdaten, Menge, Einheit, direkte Kosten, Ressourcen, Zuschläge, EP, GP, Preisaufbau, Langtext, Datenbank-Rezept und übergabe an LV/Nachtrag/Angebot/GAEB. Kontext: LV-Positionen ${lvStats.count}, Netto ${money(lvStats.net)}, fehlende Urkalkulationen ${lvStats.missingBreakdown}, fehlende Preise ${lvStats.missingPrice}, fehlende Mengen ${lvStats.missingQty}, Datenbank-Einträge ${dbStats.count}.`;
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

    if (kind === "nachtraege") {
      return `${base} Prüfe die Nachträge fachlich: Status Entwurf/abgegeben/beauftragt, fehlende Begründungen, fehlende Mengen, fehlende Einheiten, fehlende EP, Dubletten, Angebotsübergabe, PDF-Export und Server-Speicherung. Kontext: LV-Positionen ${lvStats.count}, Netto ${money(lvStats.net)}, doppelte LV-Positionen ${lvStats.duplicateCount}, fehlende Preise ${lvStats.missingPrice}, fehlende Mengen ${lvStats.missingQty}, fehlende Einheiten ${lvStats.missingUnits}. Gib nur die wichtigsten nächsten 3 Schritte.`;
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
    `- ◉ Confidence: ${pct(dbStats.avgConfidence)}`,
    `- Offene DB-Probleme gesamt: ${dbProblems}`,
    "",
    "GAEB",
    `- Lokale GAEB-Probleme: ${gaebLocalProblems}`,
    `- PosNr fehlt: ${lvStats.missingPosNr}`,
    `- Text fehlt: ${lvStats.missingText}`,
    "",
    "Empfohlener nächster Schritt",
    lvProblems > 0 ?
    "Zuerst LV-Daten prüfen: Menge, Einheit, EP, Urkalkulation und Dubletten." :
    dbProblems > 0 ?
    "Danach Kalkulationsdatenbank prüfen: EP, Einheit, Ressourcen, Risiko und Confidence." :
    gaebLocalProblems > 0 ?
    "GAEB-Struktur prüfen und X83/X84 validieren." :
    "Keine kritischen lokalen Probleme erkannt. Nächster Schritt: fachliche Prüfung oder Export."];


    return lines.join("\n");
  }

  async function speakCopilot(text: string) {
    if (!voiceEnabled || !voiceAvailable) return;

    const clean = stripForSpeech(text);
    if (!clean) return;

    try {
      audioRef.current?.pause?.();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioRef.current = null;
      audioUrlRef.current = null;

      setIsSpeaking(true);

      const token = getAuthToken();
      const res = await fetch(apiUrl("/api/copilot/tts"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          text: clean,
          voice: "nova",
          instructions:
          "Sprich immer auf Deutsch mit einer eindeutig weiblichen, hellen, weichen und süßen Stimme. Wichtig: höhere Stimmlage, leichter Klang, freundliches Lächeln in der Stimme, niemals tief, schwer, kühl oder männlich. Die Stimme soll charmant, warm, lebendig und elegant-verführerisch wirken, aber nicht übertrieben und weiterhin professionell für RLC Bausoftware. Sprich kurz, natürlich, mit heller Satzmelodie, sanften Pausen und etwas mehr Wärme in Begrüßungen und Dankesantworten.",
          pitch: 1.18,
          speed: 1.04,
          style: "warm_feminine_bright"
        })
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail || `TTS fehlgeschlagen (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audioRef.current = audio;
      audioUrlRef.current = url;

      audio.onended = () => {
        setIsSpeaking(false);
        if (audioUrlRef.current === url) {
          URL.revokeObjectURL(url);
          audioUrlRef.current = null;
          audioRef.current = null;
        }
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        if (audioUrlRef.current === url) {
          URL.revokeObjectURL(url);
          audioUrlRef.current = null;
          audioRef.current = null;
        }
        setStatus("RLC Copilot konnte die natürliche Stimme nicht abspielen.");
      };

      audio.playbackRate = 1.03;
      await audio.play();
    } catch (error: any) {
      setIsSpeaking(false);
      setStatus(
        error?.message || "RLC Copilot Stimme ist gerade nicht erreichbar."
      );
    }
  }

  function stopCopilotSpeech() {
    try {
      audioRef.current?.pause?.();
      audioRef.current = null;

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }

      (window as any).speechSynthesis?.cancel?.();
    } catch {

      //
    }
    setIsSpeaking(false);
  }

  function toggleVoice() {
    if (!voiceAvailable) {
      setStatus("Sprachausgabe wird von diesem Browser nicht unterstützt.");
      return;
    }

    setVoiceEnabled((currentValue) => {
      const next = !currentValue;
      if (!next) stopCopilotSpeech();
      if (next) {
        window.setTimeout(
          () => speakCopilot("RLC Copilot ist bereit. Wie kann ich helfen?"),
          80
        );
      }
      return next;
    });
  }

  function startVoiceInput() {
    if (!recognitionAvailable) {
      setStatus("Mikrofonsteuerung wird von diesem Browser nicht unterstützt.");
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current?.stop?.();
      } catch {

        //
      }setIsListening(false);
      return;
    }

    const Recognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

    try {
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.lang = "de-DE";
      recognition.interimResults = false;
      recognition.continuous = false;

      recognition.onstart = () => {
        setOpen(true);
        setTab("support");
        setIsListening(true);
        setStatus("Ich höre zu…");
      };

      recognition.onresult = (event: any) => {
        const transcript = String(
          event?.results?.[0]?.[0]?.transcript || ""
        ).trim();
        if (!transcript) return;

        setInput(transcript);
        setStatus("Sprache erkannt. Anfrage wird verarbeitet…");
        window.setTimeout(() => void sendSupportMessage(transcript), 80);
      };

      recognition.onerror = () => {
        setIsListening(false);
        setStatus("Mikrofon konnte die Anfrage nicht sicher erkennen.");
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch {
      setIsListening(false);
      setStatus("Mikrofon konnte nicht gestartet werden.");
    }
  }

  function createSupportReport() {
    const report = buildSupportReport();

    setOpen(true);
    setTab("support");

    setMessages((prev) => [
    ...prev,
    {
      role: "assistant",
      text: report
    }]
    );

    try {
      void navigator.clipboard?.writeText(report);
    } catch {

      //
    }}

  function getRlcCopilotBrainAnswer(userText: string): string | null {
    const q = String(userText || "").toLowerCase();
    const projectCode = getProjectCodeFromPage() || "nicht erkannt";
    const projectTitle = getProjectTitleFromPage() || "Neues Projekt";
    const projectLine = `Projekt ${projectCode} – ${projectTitle}`;

    const has = (words: string[]) => words.some((w) => q.includes(w));
    const wantsOpen = has([
    "öffne",
    "oeffne",
    "open",
    "gehe",
    "geh",
    "wechsel",
    "zeige",
    "zeig",
    "bring mich",
    "navigiere",
    "wo finde",
    "wo ist",
    "wo kann",
    "von wo",
    "wie komme",
    "aufrufen",
    "starten",
    "ins ",
    "zum ",
    "zur ",
    "in die",
    "in den",
    "portami",
    "portare",
    "porta",
    "mandami",
    "vai",
    "andiamo"]
    );
    const wantsCreate = has([
    "erstellen",
    "anlegen",
    "einfügen",
    "einfuegen",
    "hinzufügen",
    "hinzufuegen",
    "neu",
    "neue",
    "neuen",
    "machen",
    "vorbereiten",
    "ausgeben",
    "exportieren"]
    );
    const wantsExplain = has([
    "wie",
    "was",
    "warum",
    "erklär",
    "erklaer",
    "hilfe",
    "geht",
    "funktioniert",
    "ablauf"]
    );

    const projectState = [
    `Aktuelle Seite: ${current}`,
    `Pfad: ${pathname}`,
    `LV-Positionen: ${lvStats.count}`,
    `Netto RLC-KI: ${money(lvStats.net)}`,
    `Doppelte LV-Positionen: ${lvStats.duplicateCount}`,
    `Fehlende Einheiten: ${lvStats.missingUnits}`,
    `Fehlende Mengen: ${lvStats.missingQty}`,
    `EP fehlt: ${lvStats.missingPrice}`,
    `Urkalkulation fehlt: ${lvStats.missingBreakdown}`];


    const tail = () => [
    "",
    "Aktueller Stand:",
    ...projectState.map((x) => `- ${x}`)];


    const openSoon = (path: string, label: string) => {
      if (wantsOpen || wantsCreate) {
        setStatus(label);
        window.setTimeout(() => go(path), 450);
      }
    };

    const answer = (lines: string[], path?: string, label?: string) => {
      if (path && label) openSoon(path, label);
      return [`Ich bin in ${projectLine}.`, "", ...lines, ...tail()].join("\n");
    };

    if (pageKey === "mengenermittlung-aufmasseditor" && wantsExplain) {
      const runtime = collectPageRuntimeSnapshot();
      const actions = runtime.buttons.slice(0, 10).join(", ");
      const fields = runtime.fields.
      slice(0, 8).
      map((x) => `${x.label}${x.value ? ` = ${x.value}` : ""}`).
      join(", ");
      return [
      `Du bist im Aufmaß-Editor von ${projectLine}.`,
      "",
      "Hier ordnest du eine LV-Position einem oder mehreren Orten/Unterorten zu und erfasst dazu prüfbare Aufmaßzeilen mit Maßen oder Formeln. Die Zeilen ergeben die ausgeführte Menge; daraus entstehen Positionssumme, Aufmaßblatt und später die Abrechnung.",
      runtime.headings.length ?
      `Aktuell erkenne ich diese Bereiche: ${runtime.headings.slice(0, 10).join(", ")}.` :
      "",
      actions ? `Aktuell verfügbare Aktionen: ${actions}.` : "",
      fields ? `Aktuell sichtbare Eingaben: ${fields}.` : "",
      "Sinnvoller Ablauf: LV-Position wählen → Ort/Unterort zuordnen → Aufmaßzeile erfassen → Menge prüfen → auf dem Server speichern → PDF/REB/GAEB-Export erzeugen."].

      filter(Boolean).
      join("\n");
    }

    // Direkte Navigation muss vor allgemeinen Erklärungen kommen.
    const routeTarget = resolveCopilotRouteTarget(userText);
    if (routeTarget) {
      openSoon(routeTarget.path, routeTarget.label);
      return [
      `Ich bin in ${projectLine}.`,
      "",
      routeTarget.answer,
      `Pfad: ${routeTarget.path}`,
      ...tail()].
      join("\n");
    }

    if (
    wantsOpen &&
    has([
    "aufmasseditor",
    "aufmaßeditor",
    "aufmass-editor",
    "aufmaß-editor",
    "aufmass editor",
    "aufmaß editor",
    "aufmass erfassen",
    "aufmaß erfassen"]
    ))
    {
      return answer(
        [
        "Ich öffne den Aufmaßeditor in der Mengenermittlung.",
        "Dort wählst du die LV-Position und erfasst Länge, Breite, Höhe, Anzahl, Formel oder manuelle Menge."],

        "/mengenermittlung/aufmasseditor",
        "Aufmaß-Editor wird geöffnet."
      );
    }

    if (
    wantsOpen &&
    has(["ki-kalkulation", "kalkulation mit ki", "mit-ki", "ki kalkulation"]))
    {
      return answer(
        [
        "Ich öffne die KI-Kalkulation.",
        "Dort prüfst du LV-Positionen, RLC-KI Netto, Doppelte, Top-Risiken und fehlende Daten."],

        "/kalkulation/mit-ki",
        "KI-Kalkulation wird geöffnet."
      );
    }

    if (
    wantsOpen &&
    has(["kalkulation", "kalkulieren", "calcolo", "calcolare"]))
    {
      return answer(
        [
        "Ich öffne die Kalkulation.",
        "Von dort kommst du zu LV, KI-Kalkulation, GAEB, Preisen, Urkalkulation, Nachträgen und Angebot."],

        "/kalkulation",
        "Kalkulation wird geöffnet."
      );
    }

    // KALKULATION – häufige operative Detailfragen
    if (
    has([
    "kalkulation",
    "kalkulieren",
    "ki-kalkulation",
    "kalkulation mit ki",
    "berechnen",
    "angebot kalkulieren"]
    ) && (
    wantsExplain ||
    has(["wie funktioniert", "wie geht", "ablauf", "machen", "kann"])))
    {
      return answer([
      "So funktioniert die Kalkulation in RLC:",
      "1. Zuerst LV/X83 oder Positionen laden: PosNr, Kurztext, Langtext, Einheit und Menge müssen stimmen.",
      "2. Danach KI-Kalkulation starten. RLC berechnet nicht blind einen Preis, sondern prüft Firmen-Datenbank, Global Knowledge, technische Regeln, Urkalkulation und Projektrisiko.",
      "3. Context-sensitive Positionen wie Baustelleneinrichtung, Verkehrssicherung, Wasserhaltung oder Vorhaltung bleiben prüfpflichtig und müssen über Urkalkulation kontrolliert werden.",
      "4. Danach zuerst Doppelte, fehlende Daten und Top-Risiken prüfen.",
      "5. Erst wenn die Positionen plausibel sind, Angebot/PDF/GAEB erzeugen oder Werte als geprüfte Firmenwerte speichern.",
      "",
      pageKey === "kalkulation-mit-ki" ?
      "Du bist bereits in der richtigen Seite: Kalkulation · KI-Kalkulation. Nächster Schritt: Projekt analysieren und danach Top-Risiken prüfen." :
      "Menüpfad: Kalkulation → KI-Kalkulation."]
      );
    }

    if (
    has([
    "neue position",
    "position erstellen",
    "position einfügen",
    "position einfuegen",
    "lv-position",
    "position hinzufügen",
    "position hinzufuegen"]
    ))
    {
      return answer(
        [
        "Neue Position – der schnellste Weg:",
        "1. Wenn du im aktuellen Bildschirm bist: oben auf „Neue Position erstellen“ klicken.",
        "2. Für eine normale LV-Position: Kalkulation → LV / Positionen öffnen.",
        "3. Für technische Preisbildung: Kalkulation → Urkalkulation / Rezepte öffnen.",
        "4. PosNr, Kurztext, Langtext, Einheit, Menge und EP/Urkalkulation eintragen.",
        "5. Danach KI-Kalkulation starten oder die Position in Angebot / GAEB übernehmen.",
        "",
        "Wichtig: Wenn die Position wirklich kalkuliert werden soll, nimm Urkalkulation / Rezepte. Wenn sie nur ins LV soll, nimm LV / Positionen."],

        "/kalkulation/lv-import",
        "LV / Positionen wird geöffnet."
      );
    }

    if (has(["doppelte", "dubletten", "duplikat", "duplicate"])) {
      return answer([
      "Doppelte LV-Positionen bearbeitest du direkt in der KI-Kalkulation:",
      `1. Filter „Doppelte ${lvStats.duplicateCount}“ öffnen.`,
      "2. Die angezeigten Gruppen fachlich kontrollieren.",
      "3. Nur echte Dubletten markieren.",
      "4. Danach „Auswahl löschen“ verwenden.",
      "",
      "Der Copilot erklärt und führt dich, löscht aber nicht blind automatisch."]
      );
    }

    if (
    has([
    "outlier",
    "risiko",
    "top-risiken",
    "abweichung",
    "prüfpflichtig",
    "preis falsch",
    "preis prüfen",
    "preis pruefen"]
    ))
    {
      return answer([
      "Für Preisrisiken gehst du so vor:",
      "1. In KI-Kalkulation auf „Top-Risiken anzeigen“ klicken.",
      "2. Danach Outlier Report öffnen.",
      "3. Positionen mit falscher Einheit, falscher Mengenbasis oder falscher Vergleichsfamilie prüfen.",
      "4. Bei Psch/context-sensitive Positionen Urkalkulation fachlich kontrollieren.",
      "5. Erst danach Angebot/PDF erzeugen."]
      );
    }

    if (
    has([
    "ur kalkulation",
    "urkalkulation",
    "rezept",
    "rezepte",
    "preisaufbau",
    "ressourcen",
    "lohn",
    "maschine",
    "material",
    "zuschlag"]
    ))
    {
      return answer(
        [
        "Urkalkulation / Rezepte ist der technische Preisaufbau:",
        "1. Kalkulation → Urkalkulation / Rezepte öffnen.",
        "2. Position auswählen oder neue Position erfassen.",
        "3. Material, Lohn, Geräte/Maschinen, Nachunternehmer, Entsorgung und Zuschläge prüfen.",
        "4. EP/GP berechnen lassen.",
        "5. Rezept speichern oder in LV/Kalkulationsdatenbank übernehmen."],

        "/kalkulation/rezepte",
        "Urkalkulation / Rezepte wird geöffnet."
      );
    }

    if (
    has([
    "datenbank",
    "kalkulationsdatenbank",
    "firmenwert",
    "firmenpreis",
    "erfahrungswert",
    "preis speichern",
    "company db"]
    ))
    {
      return answer(
        [
        "Kalkulationsdatenbank nutzt du für Firmenwerte und Erfahrungswerte:",
        "1. Kalkulation → Kalkulationsdatenbank öffnen.",
        "2. Nach Position, Kurztext, Einheit oder Quelle suchen.",
        "3. EP, Ressourcen, Confidence und Risiko prüfen.",
        "4. Dubletten bereinigen, bevor Werte als zuverlässig gelten.",
        "5. Neue Werte nur speichern, wenn sie fachlich geprüft sind."],

        "/kalkulation/datenbank",
        "Kalkulationsdatenbank wird geöffnet."
      );
    }

    if (
    has([
    "preise",
    "preisliste",
    "ressourcenliste",
    "materialpreis",
    "maschinenpreis",
    "lohnansatz",
    "ep fehlt"]
    ))
    {
      return answer(
        [
        "Preise & Ressourcen sind für Basispreise gedacht:",
        "1. Kalkulation → Preise & Ressourcen öffnen.",
        "2. Material, Lohn, Geräte, Maschinen oder Nachunternehmer prüfen.",
        "3. Fehlende EP oder Einheiten ergänzen.",
        "4. Dubletten auswählen und bereinigen.",
        "5. Danach Urkalkulation/Kalkulation erneut prüfen."],

        "/kalkulation/preise",
        "Preise & Ressourcen wird geöffnet."
      );
    }

    // GAEB / Angebot / Nachtrag / CRM
    if (
    has([
    "x83",
    "x84",
    "gaeb",
    "d83",
    "p83",
    "lv import",
    "leistungsverzeichnis import"]
    ))
    {
      return answer(
        [
        "GAEB / X83 / X84 läuft über Kalkulation → GAEB:",
        "1. Für LV/Leistungsverzeichnis: X83 importieren oder prüfen.",
        "2. Für Angebots-/Preisvergleich: X84 importieren oder prüfen.",
        "3. PosNr, Kurztext, Langtext, Einheit, Menge und Dubletten prüfen.",
        "4. Danach Positionen in LV / KI-Kalkulation übernehmen.",
        "5. Für Ausgabe anschließend Angebot / Export öffnen.",
        "",
        "Merke: X83 = LV, X84 = Angebots-/Preisvergleich."],

        "/kalkulation/gaeb",
        "GAEB-Seite wird geöffnet."
      );
    }

    if (
    has([
    "angebot",
    "pdf",
    "xlsx",
    "excel",
    "export",
    "ausgeben",
    "ausgabe",
    "gaeb ausgeben"]
    ))
    {
      return answer(
        [
        "Angebot/PDF/Export machst du über Kalkulation → Angebot / Export:",
        "1. Vorher Dubletten und Top-Risiken prüfen.",
        "2. Angebot / Export öffnen.",
        "3. PDF, XLSX oder GAEB-Ausgabe wählen.",
        "4. Netto/Brutto, Projektcode und Positionsliste prüfen.",
        "5. Danach Export erzeugen."],

        "/kalkulation/angebot",
        "Angebot / Export wird geöffnet."
      );
    }

    if (
    has([
    "nachtrag",
    "nachträge",
    "nachtraeg",
    "änderung",
    "aenderung",
    "zusatzleistung",
    "mehrkosten"]
    ))
    {
      return answer(
        [
        "Nachträge erstellst du über Kalkulation → Nachträge:",
        "1. Neuen Nachtrag erstellen.",
        "2. Betroffene LV-Position wählen oder neue Nachtragsposition anlegen.",
        "3. Menge, Einheit, EP und Begründung erfassen.",
        "4. Urkalkulation/Preisaufbau prüfen.",
        "5. Danach Angebot/PDF erzeugen oder Freigabe vorbereiten."],

        "/kalkulation/nachtraege",
        "Nachträge werden geöffnet."
      );
    }

    if (
    has([
    "crm",
    "angebot verfolgen",
    "angebotsverfolgung",
    "follow-up",
    "kunde",
    "gewonnen",
    "verloren"]
    ))
    {
      return answer(
        [
        "CRM / Angebotsverfolgung nutzt du für Nachfassen und Status:",
        "1. Kalkulation → CRM / Angebotsverfolgung öffnen.",
        "2. Offene, überfällige oder heutige Follow-ups filtern.",
        "3. Kontakt, nächste Aktion, PDF/Link und Status prüfen.",
        "4. Angebot als nachgefasst, gewonnen oder verloren markieren."],

        "/kalkulation/crm",
        "CRM / Angebotsverfolgung wird geöffnet."
      );
    }

    // Mengenermittlung / Mobile / Eingangsprüfung
    if (
    has([
    "mengenermittlung",
    "aufmaß",
    "aufmass",
    "massen",
    "massenaufstellung",
    "soll-ist",
    "soll ist",
    "abrechnung menge"]
    ))
    {
      return answer(
        [
        "Mengenermittlung ist für Mengen, Aufmaß und Soll-Ist:",
        "1. Mengenermittlung öffnen.",
        "2. Position aus dem LV auswählen.",
        "3. Rechnerische Massen oder Aufmaß erfassen.",
        "4. Formel, Länge, Breite, Höhe, Anzahl und Einheit prüfen.",
        "5. Ergebnis mit Abrechnung, Nachtrag oder Regiebericht verknüpfen."],

        has(["aufmaß", "aufmass", "aufmasseditor", "aufmaßeditor"]) ?
        "/mengenermittlung/aufmasseditor" :
        "/mengenermittlung",
        has(["aufmaß", "aufmass", "aufmasseditor", "aufmaßeditor"]) ?
        "Aufmaßeditor wird geöffnet." :
        "Mengenermittlung wird geöffnet."
      );
    }

    if (
    has([
    "mobile",
    "app",
    "regiebericht",
    "regie",
    "lieferschein",
    "fotos",
    "foto",
    "notizen",
    "eingangsprüfung",
    "eingangspruefung",
    "offline",
    "sync",
    "synchronisieren",
    "unterschrift",
    "signatur"]
    ))
    {
      return answer([
      "Mobile / Baustelle funktioniert so:",
      "1. In der Mobile App Projekt auswählen.",
      "2. Regiebericht, Lieferschein oder Fotos / Notizen öffnen.",
      "3. Projektcode/BaustellenNummer und Bauleiter prüfen.",
      "4. Daten, Fotos, Lieferscheine und Unterschrift erfassen.",
      "5. Offline lokal speichern, wenn keine Verbindung vorhanden ist.",
      "6. Bei Verbindung synchronisieren.",
      "7. Im Web über Eingangsprüfung kontrollieren und freigeben.",
      "",
      "Für Server-PDFs und Sync ist der BA-Code entscheidend, z.B. BA-2026-028."]
      );
    }

    // CAD / Büro / Buchhaltung / Hilfe
    if (
    has([
    "cad",
    "dwg",
    "dxf",
    "pdf-plan",
    "plan",
    "pläne",
    "plaene",
    "as-built",
    "asbuilt",
    "layer",
    "vermessung",
    "landxml",
    "ifc"]
    ))
    {
      return answer(
        [
        "CAD/DWG öffnest du nicht in der KI-Kalkulation, sondern im Hauptmodul CAD.",
        "Direkter Weg: Hauptmenü → CAD → CAD Viewer.",
        "Dort lädst du DWG, DXF, PDF oder LandXML hoch und prüfst Layer, Leitungen, Schichten, Maße und As-Built.",
        "Für die Verbindung zur Kalkulation danach die passende LV-Position oder Mengenermittlung verknüpfen.",
        "Wenn du möchtest, öffne ich dir den CAD Viewer direkt."],

        "/cad/viewer",
        "CAD Viewer wird geöffnet."
      );
    }

    if (
    has([
    "büro",
    "buero",
    "verwaltung",
    "dokument",
    "dokumente",
    "aufgabe",
    "aufgaben",
    "nutzer",
    "rechte",
    "outlook",
    "kalender",
    "vertrag",
    "kommunikation"]
    ))
    {
      return answer(
        [
        "Büro / Verwaltung ist für Organisation und Dokumente:",
        "1. Büro / Verwaltung öffnen.",
        "2. Projektverwaltung, Dokumente, Verträge, Aufgaben oder Nutzer wählen.",
        "3. Dokumente projektbezogen ablegen und Versionen kontrollieren.",
        "4. Zuständigkeit, Frist und Status prüfen.",
        "5. Bei Bedarf mit Kalkulation, Nachträgen oder Buchhaltung verbinden."],

        "/buro",
        "Büro / Verwaltung wird geöffnet."
      );
    }

    if (
    has([
    "buchhaltung",
    "rechnung",
    "abschlag",
    "abschlagsrechnung",
    "schlussrechnung",
    "zahlung",
    "zahlungseingang",
    "datev",
    "lexware",
    "sap",
    "kostenstelle",
    "kostenübersicht",
    "kostenuebersicht"]
    ))
    {
      return answer(
        [
        "Buchhaltung ist für Kosten, Rechnungen und Export:",
        "1. Buchhaltung öffnen.",
        "2. Kostenübersicht, Rechnungen oder Abschlagsrechnungen wählen.",
        "3. LV, Nachträge und Regieberichte als Grundlage prüfen.",
        "4. Rechnung/PDF vorbereiten.",
        "5. Danach DATEV/Lexware/SAP Export nutzen, wenn benötigt."],

        "/buchhaltung",
        "Buchhaltung wird geöffnet."
      );
    }

    if (
    has([
    "hilfe",
    "support",
    "video",
    "erklärung",
    "erklaerung",
    "tutorial",
    "problem",
    "fehler",
    "was kann",
    "übersicht",
    "uebersicht"]
    ))
    {
      return answer(
        [
        "Ich kann dich softwareweit führen – nicht nur in Kalkulation:",
        "- Kalkulation, LV, KI, GAEB, Angebot, Nachträge, CRM",
        "- Mengenermittlung, Aufmaß, Regieberichte, Lieferscheine, Fotos",
        "- Mobile App, Offline Queue, Sync, Eingangsprüfung",
        "- CAD/PDF, DWG/DXF, As-Built, Vermessung",
        "- Büro/Verwaltung, Dokumente, Aufgaben, Nutzer",
        "- Buchhaltung, Rechnungen, Abschläge, DATEV/Lexware/SAP",
        "",
        "Frag mich direkt: „Wo finde ich …?“ oder „Öffne …“."],

        "/info/support",
        "Support / Hilfe wird geöffnet."
      );
    }

    return null;
  }

  function getDirectRlcActionAnswer(userText: string): string | null {
    const q = String(userText || "").toLowerCase();
    const projectCode = getProjectCodeFromPage() || "nicht erkannt";
    const projectTitle = getProjectTitleFromPage() || "Neues Projekt";
    const projectLine = `Projekt ${projectCode} – ${projectTitle}`;
    const has = (words: string[]) => words.some((w) => q.includes(w));
    const wantsOpen = has([
    "öffne",
    "oeffne",
    "open",
    "gehe",
    "geh",
    "wechsel",
    "zeige",
    "zeig",
    "bring mich",
    "navigiere",
    "ins ",
    "zum ",
    "zur ",
    "in die",
    "in den",
    "portami",
    "portare",
    "porta",
    "mandami",
    "vai",
    "andiamo"]
    );

    const openSoon = (path: string, label: string) => {
      setStatus(label);
      window.setTimeout(() => go(path), 450);
    };

    const routeTarget = resolveCopilotRouteTarget(userText);
    if (routeTarget) {
      openSoon(routeTarget.path, routeTarget.label);
      return `${routeTarget.answer} Pfad: ${routeTarget.path}`;
    }

    if (
    wantsOpen &&
    has([
    "aufmasseditor",
    "aufmaßeditor",
    "aufmass-editor",
    "aufmaß-editor",
    "aufmass editor",
    "aufmaß editor",
    "aufmass erfassen",
    "aufmaß erfassen"]
    ))
    {
      openSoon(
        "/mengenermittlung/aufmasseditor",
        "Aufmaß-Editor wird geöffnet."
      );
      return `Ich öffne für ${projectLine} den Aufmaßeditor. Dort wählst du die LV-Position und erfasst Formel, Länge, Breite, Höhe, Anzahl oder manuelle Menge.`;
    }

    if (
    wantsOpen &&
    has(["ki-kalkulation", "kalkulation mit ki", "mit-ki", "ki kalkulation"]))
    {
      openSoon("/kalkulation/mit-ki", "KI-Kalkulation wird geöffnet.");
      return `Ich öffne für ${projectLine} die KI-Kalkulation. Dort prüfst du Netto, Doppelte, Top-Risiken und fehlende Daten.`;
    }

    if (
    wantsOpen &&
    has(["kalkulation", "kalkulieren", "calcolo", "calcolare"]))
    {
      openSoon("/kalkulation", "Kalkulation wird geöffnet.");
      return `Ich öffne für ${projectLine} die Kalkulation. Von dort kommst du zu LV, KI-Kalkulation, GAEB, Preisen, Urkalkulation, Nachträgen und Angebot.`;
    }

    if (
    has([
    "neue position",
    "position erstellen",
    "position einfügen",
    "position einfuegen",
    "position hinzufügen",
    "position hinzufuegen",
    "neue lv-position",
    "lv-position erstellen"]
    ))
    {
      if (wantsOpen)
      openSoon("/kalkulation/lv-import", "LV / Positionen wird geöffnet.");
      return [
      `Ja, Roberto. Ich bin in ${projectLine}.`,
      "",
      "Eine neue Position fügst du je nach Ziel an zwei Stellen ein:",
      "1. Für eine normale LV-Position: Kalkulation → LV / Positionen → Neue Position erstellen.",
      "2. Für eine technisch kalkulierte Position: Kalkulation → Urkalkulation / Rezepte → Neue Position.",
      "3. Wenn du gerade in „Kalkulation mit KI“ bist, kannst du oben auch „Neue Position erstellen“ nutzen und die Position danach kalkulieren lassen.",
      "",
      "Pflichtfelder: PosNr, Kurztext, Langtext, Einheit, Menge und EP/Urkalkulation.",
      "Danach: KI-Kalkulation starten oder Position in Angebot/GAEB übernehmen."].
      join("\n");
    }

    if (wantsOpen && has(["gaeb", "x83", "x84", "d83", "p83"])) {
      openSoon("/kalkulation/gaeb", "GAEB-Seite wird geöffnet.");
      return `Ich öffne für ${projectLine} die GAEB-Seite. Dort lädst du X83 für LV/Leistungsverzeichnis oder X84 für Angebots-/Preisvergleich hoch.`;
    }

    if (wantsOpen && has(["nachtrag", "nachträge", "nachtraeg"])) {
      openSoon("/kalkulation/nachtraege", "Nachträge werden geöffnet.");
      return `Ich öffne für ${projectLine} die Nachträge. Dort kannst du neue Nachtragspositionen mit Menge, Einheit, EP und Begründung erstellen.`;
    }

    if (wantsOpen && has(["angebot", "pdf", "export", "xlsx", "excel"])) {
      openSoon("/kalkulation/angebot", "Angebot / Export wird geöffnet.");
      return `Ich öffne für ${projectLine} Angebot / Export. Dort erzeugst du PDF, XLSX oder GAEB-Ausgabe.`;
    }

    if (
    wantsOpen &&
    has(["rechnung", "buchhaltung", "abschlag", "datev", "kosten"]))
    {
      openSoon("/buchhaltung", "Buchhaltung wird geöffnet.");
      return `Ich öffne die Buchhaltung. Dort findest du Kostenübersicht, Rechnungen, Abschläge und DATEV/Lexware/SAP Export.`;
    }

    if (wantsOpen && has(["mengenermittlung", "aufmaß", "aufmass", "massen"])) {
      const targetPath = has([
      "aufmaß",
      "aufmass",
      "aufmasseditor",
      "aufmaßeditor"]
      ) ?
      "/mengenermittlung/aufmasseditor" :
      "/mengenermittlung";
      const targetLabel = targetPath.includes("position") ?
      "Aufmaßeditor wird geöffnet." :
      "Mengenermittlung wird geöffnet.";
      openSoon(targetPath, targetLabel);
      return targetPath.includes("position") ?
      `Ich öffne den Aufmaßeditor. Dort erfasst du für die LV-Position Mengen, Formeln und Maße.` :
      `Ich öffne die Mengenermittlung. Dort erfasst du Aufmaß, rechnerische Massen, Soll-Ist und Verknüpfung mit Abrechnung/Nachträgen.`;
    }

    if (
    wantsOpen &&
    has(["cad", "pdf-plan", "plan", "dwg", "dxf", "as-built", "asbuilt"]))
    {
      openSoon("/cad/viewer", "CAD Viewer wird geöffnet.");
      return `Ich öffne für ${projectLine} den CAD Viewer. Dort lädst du DWG, DXF, PDF oder LandXML, prüfst Layer/Leitungen/Maße und verknüpfst den Plan anschließend mit LV oder Mengenermittlung.`;
    }

    return null;
  }

  function getLocalRlcWideAnswer(userText: string): string | null {
    const q = String(userText || "").toLowerCase();
    const projectCode = getProjectCodeFromPage() || "nicht erkannt";
    const projectTitle = getProjectTitleFromPage() || "Neues Projekt";
    const projectLine = `Ich befinde mich im Projekt ${projectCode} – ${projectTitle}.`;

    const includesAny = (words: string[]) => words.some((w) => q.includes(w));

    const projectState = [
    `Projekt: ${projectCode} – ${projectTitle}`,
    `Aktuelle Seite: ${current}`,
    `Pfad: ${pathname}`,
    `LV-Positionen: ${lvStats.count}`,
    `Netto RLC-KI: ${money(lvStats.net)}`,
    `Doppelte LV-Positionen: ${lvStats.duplicateCount}`,
    `Fehlende Einheiten: ${lvStats.missingUnits}`,
    `Fehlende Mengen: ${lvStats.missingQty}`,
    `EP fehlt: ${lvStats.missingPrice}`,
    `Urkalkulation fehlt: ${lvStats.missingBreakdown}`];


    const addProjectState = () => [
    "",
    "Aktueller Projektstand:",
    ...projectState.map((x) => `- ${x}`)];


    if (
    includesAny([
    "wie funktioniert kalkulation",
    "wie funktioniert die kalkulation",
    "kalkulieren",
    "kalkulation machen",
    "angebot kalkulieren",
    "ki-kalkulation",
    "kalkulation mit ki"]
    ))
    {
      return [
      projectLine,
      "",
      "So kalkulierst du in RLC:",
      "1. LV/X83 oder Positionen laden und PosNr, Kurztext, Langtext, Einheit und Menge prüfen.",
      "2. Kalkulation → KI-Kalkulation öffnen und RLC rechnen lassen.",
      "3. RLC prüft Firmen-Datenbank, Global Knowledge, technische Regeln, Urkalkulation und OpenAI-Unterstützung. X84 ist nur Benchmark, nicht automatische Preisquelle.",
      "4. Danach Doppelte, fehlende Daten, Top-Risiken und Outlier prüfen.",
      "5. Context-sensitive Positionen wie Baustelleneinrichtung oder Verkehrssicherung über Urkalkulation kontrollieren.",
      "6. Erst danach Angebot/PDF/GAEB erzeugen oder geprüfte Werte in der Firmen-Datenbank speichern.",
      ...addProjectState()].
      join("\n");
    }

    if (
    includesAny([
    "x83",
    "x84",
    "gaeb",
    "d83",
    "p83",
    "lv import",
    "leistungsverzeichnis import",
    "gaeb importieren"]
    ))
    {
      return [
      projectLine,
      "",
      "GAEB / X83 / X84 findest du im Modul Kalkulation → GAEB.",
      "",
      "Wichtig:",
      "- X83 ist für LV / Leistungsverzeichnis.",
      "- X84 ist für Angebots- und Preisvergleich.",
      "- D83/P83 sind ältere GAEB-Varianten und müssen technisch geprüft werden.",
      "",
      "Ablauf:",
      "1. Links Kalkulation → GAEB öffnen.",
      "2. X83 laden/importieren oder X84 für Vergleich laden.",
      "3. PosNr, Kurztext, Langtext, Einheit, Menge und Dubletten prüfen.",
      "4. Danach Positionen in LV / KI-Kalkulation übernehmen.",
      "5. Danach Angebot / Export öffnen und PDF, XLSX oder GAEB erzeugen.",
      ...addProjectState()].
      join("\n");
    }

    if (
    includesAny([
    "nachtrag",
    "nachträge",
    "nachtraeg",
    "änderung",
    "aenderung",
    "zusatzleistung",
    "mehrkosten",
    "minderkosten",
    "freigabe"]
    ))
    {
      return [
      projectLine,
      "",
      "Nachträge findest du im Modul Kalkulation → Nachträge.",
      "",
      "Ablauf:",
      "1. Nachträge öffnen.",
      "2. Neuen Nachtrag erstellen.",
      "3. LV-Position wählen oder neue Nachtragsposition anlegen.",
      "4. Menge, Einheit, EP und Begründung eintragen.",
      "5. Urkalkulation / Preisaufbau prüfen.",
      "6. Angebot/PDF erzeugen oder zur Freigabe vorbereiten.",
      "7. Nach Freigabe kann der Nachtrag in Angebot, Abrechnung oder Dokumentation weiterverwendet werden.",
      ...addProjectState()].
      join("\n");
    }

    if (
    includesAny([
    "angebot",
    "pdf",
    "export",
    "xlsx",
    "excel",
    "ausgeben",
    "drucken",
    "angebot/pdf",
    "preisblatt"]
    ))
    {
      return [
      projectLine,
      "",
      "Angebot, PDF, XLSX und Export findest du über Kalkulation → Angebot / Export.",
      "",
      "Sinnvoller Ablauf:",
      "1. Doppelte Positionen prüfen.",
      "2. Top-Risiken / Outlier Report prüfen.",
      "3. Nachträge prüfen, falls vorhanden.",
      "4. Angebot / Export öffnen.",
      "5. PDF, XLSX oder GAEB erzeugen.",
      "6. Vor Versand Netto/Brutto, Zuschläge, Rabatt/Aufschlag und Positionssummen kontrollieren.",
      ...addProjectState()].
      join("\n");
    }

    if (
    includesAny([
    "doppelt",
    "dubletten",
    "duplikat",
    "duplicate",
    "auswahl löschen",
    "löschen"]
    ))
    {
      return [
      projectLine,
      "",
      "Doppelte Positionen bearbeitest du direkt in der jeweiligen Liste.",
      "",
      "Für diese KI-Kalkulation:",
      `1. In der Positionsliste den Filter „Doppelte ${lvStats.duplicateCount}“ öffnen.`,
      "2. Prüfen, welche Position behalten werden soll.",
      "3. Danach „Auswahl löschen“ verwenden.",
      "4. Danach Kalkulation neu prüfen.",
      "",
      "Der Copilot soll dich dabei führen, aber nicht blind Positionen löschen.",
      ...addProjectState()].
      join("\n");
    }

    if (
    includesAny([
    "risiko",
    "outlier",
    "abweichung",
    "prüfpflichtig",
    "warnung",
    "top-risiken",
    "plausibilität",
    "plausibilitaet"]
    ))
    {
      return [
      projectLine,
      "",
      "Risiken prüfst du über Top-Risiken, Outlier Report und die Prüfhinnweise der Positionen.",
      "",
      "Vorgehen:",
      "1. Top-Risiken anzeigen.",
      "2. Outlier Report öffnen.",
      "3. Positionen mit großer Abweichung prüfen.",
      "4. Bei context-sensitiven Positionen Urkalkulation prüfen.",
      "5. Danach Angebot/Export erst freigeben.",
      ...addProjectState()].
      join("\n");
    }

    if (
    includesAny([
    "kalkulationsdatenbank",
    "datenbank",
    "firmenwert",
    "firmen-datenbank",
    "preis speichern",
    "preise speichern",
    "erfahrungswert",
    "confidence"]
    ))
    {
      return [
      projectLine,
      "",
      "Die Kalkulationsdatenbank findest du unter Kalkulation → Kalkulationsdatenbank.",
      "",
      "Sie dient für Firmenpreise, Erfahrungswerte und wiederverwendbare Positionen.",
      "Wichtig:",
      "- KI-Preise werden nicht blind übernommen.",
      "- X84 ist Benchmark, nicht automatisch Firmenpreis.",
      "- Speichern erst nach fachlicher Freigabe.",
      "- Dubletten, fehlende EP, Einheiten, Ressourcen und Confidence prüfen."].
      join("\n");
    }

    if (
    includesAny([
    "preis",
    "preise",
    "ressourcen",
    "lohn",
    "material",
    "maschine",
    "gerät",
    "geraet",
    "zuschlag",
    "urkalkulation",
    "rezept",
    "preisaufbau"]
    ))
    {
      return [
      projectLine,
      "",
      "Urkalkulation / Rezepte findest du unter Kalkulation → Urkalkulation / Rezepte.",
      "",
      "Dort werden Preisaufbau, Material, Lohn, Maschinen, Geräte, Zuschläge, Risiko und Gewinn geprüft.",
      "Für echte Kalkulation ist diese Seite wichtiger als ein reiner Datenbankpreis.",
      "",
      "Ablauf:",
      "1. Position auswählen.",
      "2. Menge und Einheit prüfen.",
      "3. Ressourcen und Zuschläge prüfen.",
      "4. EP/GP berechnen.",
      "5. Rezept/Firmenwert speichern, wenn fachlich korrekt."].
      join("\n");
    }

    if (
    includesAny([
    "neue position",
    "position erstellen",
    "position einfügen",
    "position einfuegen",
    "position hinzufügen",
    "position hinzufuegen",
    "neue lv-position"]
    ))
    {
      return [
      projectLine,
      "",
      "Neue Position erstellen:",
      "1. Normale LV-Position: Kalkulation → LV / Positionen → Neue Position erstellen.",
      "2. Technische Preisbildung: Kalkulation → Urkalkulation / Rezepte → Neue Position.",
      "3. In KI-Kalkulation: Button „Neue Position erstellen“ oben verwenden.",
      "4. Danach Pflichtdaten erfassen: PosNr, Kurztext, Langtext, Einheit, Menge, EP/Urkalkulation.",
      "5. Anschließend KI-Kalkulation starten oder Angebot/GAEB vorbereiten.",
      ...addProjectState()].
      join("\n");
    }

    if (
    includesAny([
    "lv",
    "position",
    "positionen",
    "leistungsverzeichnis",
    "langtext",
    "kurztext",
    "einheit fehlt",
    "menge fehlt",
    "positionsliste"]
    ))
    {
      return [
      projectLine,
      "",
      "LV / Positionen findest du unter Kalkulation → LV / Positionen.",
      "",
      "Dort prüfst du:",
      "- Positionsnummer",
      "- Kurztext / Langtext",
      "- Einheit",
      "- Menge",
      "- EP/GP",
      "- Dubletten",
      "- Übergabe an GAEB, KI-Kalkulation, Angebot oder Nachträge",
      ...addProjectState()].
      join("\n");
    }

    if (
    includesAny([
    "mengenermittlung",
    "aufmaß",
    "aufmass",
    "massen",
    "soll-ist",
    "abrechnung",
    "formel",
    "länge",
    "breite",
    "höhe",
    "hoehe"]
    ))
    {
      return [
      projectLine,
      "",
      "Mengenermittlung findest du im Modul Mengenermittlung.",
      "",
      "Typischer Ablauf:",
      "1. Position aus LV wählen.",
      "2. Rechnerische Massen oder Aufmaß eintragen.",
      "3. Formel, Länge, Breite, Höhe, Anzahl prüfen.",
      "4. Soll-Ist vergleichen.",
      "5. Ergebnis mit Abrechnung, Nachtrag oder Regiebericht verknüpfen.",
      "6. Für Tablet/Mobile muss die Eingabe später auch baustellentauglich funktionieren."].
      join("\n");
    }

    if (
    includesAny([
    "mobile",
    "app",
    "android",
    "ios",
    "offline",
    "queue",
    "sync",
    "synchron",
    "eingangsprüfung",
    "eingangspruefung"]
    ))
    {
      return [
      projectLine,
      "",
      "Mobile / App betrifft den Baustellenablauf:",
      "1. Projekt auswählen.",
      "2. Regiebericht, Lieferschein oder Fotos / Notizen öffnen.",
      "3. Projektcode / BaustellenNummer prüfen.",
      "4. Daten, Fotos und Unterschrift erfassen.",
      "5. Offline lokal speichern.",
      "6. Bei Verbindung über Queue synchronisieren.",
      "7. In der Eingangsprüfung im Web werden Regie, Lieferscheine und Fotos kontrolliert, freigegeben und archiviert.",
      "",
      "Wichtig: Für Sync braucht jedes Projekt einen stabilen BA-Code, nicht nur eine UUID."].
      join("\n");
    }

    if (
    includesAny([
    "regie",
    "regiebericht",
    "tagesbericht",
    "stunden",
    "personal",
    "gerät",
    "geraet",
    "unterschrift",
    "signatur"]
    ))
    {
      return [
      projectLine,
      "",
      "Regieberichte laufen über Mobile und später über Eingangsprüfung/Web:",
      "1. Mobile App öffnen.",
      "2. Projekt wählen.",
      "3. Regiebericht erstellen.",
      "4. Leistungen, Personal, Geräte, Stunden und Bemerkungen erfassen.",
      "5. Fotos/Lieferscheine anhängen, falls nötig.",
      "6. Unterschrift erfassen.",
      "7. Synchronisieren.",
      "8. Im Web über Eingangsprüfung kontrollieren und freigeben."].
      join("\n");
    }

    if (
    includesAny([
    "lieferschein",
    "lieferscheine",
    "ls",
    "lieferung",
    "materialschein"]
    ))
    {
      return [
      projectLine,
      "",
      "Lieferscheine laufen über Mobile → Lieferschein und Web → Eingangsprüfung.",
      "",
      "Ablauf:",
      "1. Mobile App öffnen.",
      "2. Projekt auswählen.",
      "3. Lieferschein erfassen oder fotografieren.",
      "4. Material, Menge, Lieferant und Datum prüfen.",
      "5. Lokal speichern / synchronisieren.",
      "6. Im Web in der Eingangsprüfung kontrollieren.",
      "7. Danach mit Regiebericht, Kostenstelle oder Abrechnung verknüpfen."].
      join("\n");
    }

    if (
    includesAny([
    "foto",
    "fotos",
    "notiz",
    "notizen",
    "photos",
    "baustellenfoto",
    "bild",
    "bilder"]
    ))
    {
      return [
      projectLine,
      "",
      "Fotos / Notizen laufen über Mobile und Eingangsprüfung:",
      "1. Mobile App öffnen.",
      "2. Projekt wählen.",
      "3. Fotos / Notizen öffnen.",
      "4. Bilder aufnehmen oder auswählen.",
      "5. Ort, Beschreibung und Bezug zu Regie/Lieferschein/LV erfassen.",
      "6. Offline speichern oder synchronisieren.",
      "7. Im Web über Eingangsprüfung prüfen und archivieren."].
      join("\n");
    }

    if (
    includesAny([
    "cad",
    "dwg",
    "dxf",
    "pdf plan",
    "plan",
    "pläne",
    "plaene",
    "as-built",
    "asbuilt",
    "landxml",
    "dgm",
    "viewer"]
    ))
    {
      return [
      projectLine,
      "",
      "CAD / PDF findest du im Modul CAD / PDF.",
      "",
      "Dort geht es um:",
      "- PDF Viewer",
      "- CAD Viewer",
      "- DWG/DXF Import",
      "- Leitungen, Schichten, Maße",
      "- As-Built Dokumentation",
      "- Verbindung mit LV / Massenermittlung",
      "- Export für Dokumentation oder Abrechnung"].
      join("\n");
    }

    if (
    includesAny([
    "büro",
    "buero",
    "verwaltung",
    "dokument",
    "dokumente",
    "vertrag",
    "aufgabe",
    "aufgaben",
    "nutzer",
    "outlook",
    "kalender"]
    ))
    {
      return [
      projectLine,
      "",
      "Büro / Verwaltung ist für Projektorganisation:",
      "1. Projektverwaltung für Stammdaten und Status.",
      "2. Dokumentenverwaltung für Dateien, Verträge und Versionen.",
      "3. Aufgaben / Kommunikation für Zuständigkeiten und Fristen.",
      "4. Nutzerverwaltung für Rollen und Rechte.",
      "5. Outlook/Kalender für Termine und Erinnerungen.",
      "6. Verbindung zu Kalkulation, Nachträgen und Buchhaltung."].
      join("\n");
    }

    if (
    includesAny([
    "rechnung",
    "abschlag",
    "abschlagsrechnung",
    "schlussrechnung",
    "buchhaltung",
    "datev",
    "lexware",
    "sap",
    "zahlung",
    "kosten",
    "kostenstelle"]
    ))
    {
      return [
      projectLine,
      "",
      "Buchhaltung findest du im Modul Buchhaltung.",
      "",
      "Dort geht es um:",
      "1. Kostenübersicht.",
      "2. Rechnungen und Abschlagsrechnungen.",
      "3. Zahlungseingänge.",
      "4. Verbindung zu LV, Regieberichten, Lieferscheinen und Nachträgen.",
      "5. Kostenstellen und Projektkosten.",
      "6. Export DATEV / Lexware / SAP."].
      join("\n");
    }

    if (
    includesAny([
    "crm",
    "angebot verfolgen",
    "angebotsverfolgung",
    "kunde",
    "follow-up",
    "pipeline",
    "verloren",
    "gewonnen"]
    ))
    {
      return [
      projectLine,
      "",
      "CRM / Angebotsverfolgung findest du unter Kalkulation → CRM / Angebotsverfolgung.",
      "",
      "Dort prüfst du:",
      "- offene Angebote",
      "- Status gewonnen/verloren",
      "- Follow-up Datum",
      "- nächste Aktion",
      "- Kontakt",
      "- PDF/Link",
      "- Angebotsrisiko und Abschlusswahrscheinlichkeit"].
      join("\n");
    }

    if (
    includesAny([
    "hilfe",
    "support",
    "video",
    "anleitung",
    "erklären",
    "erklaeren",
    "wo finde",
    "wo ist",
    "wie geht",
    "wie mache"]
    ))
    {
      return [
      projectLine,
      "",
      "Ich bin der globale RLC Copilot. Ich kann dich durch alle Hauptbereiche führen:",
      "- Kalkulation",
      "- LV / GAEB / X83 / X84",
      "- KI-Kalkulation",
      "- Urkalkulation / Rezepte",
      "- Nachträge",
      "- Mengenermittlung / Aufmaß",
      "- Mobile App mit Regie, Lieferschein, Fotos und Sync",
      "- CAD / PDF / As-Built",
      "- Büro / Verwaltung",
      "- Buchhaltung / Rechnung / DATEV",
      "- CRM / Angebotsverfolgung",
      "",
      "Frag mich direkt nach dem Ziel, z.B. „wo lade ich X83 hoch“, „wie erstelle ich einen Regiebericht“, „wo prüfe ich Lieferscheine“ oder „wie exportiere ich ein Angebot“."].
      join("\n");
    }

    return [
    projectLine,
    "",
    "Ich bin als RLC Copilot softwareweit aktiv. Ich kann dich durch Kalkulation, GAEB, Nachträge, Mengenermittlung, Mobile, Regieberichte, Lieferscheine, Fotos, CAD/PDF, Büro, Buchhaltung und CRM führen.",
    "",
    "Sag mir konkret, welches Ziel du erreichen willst. Ich antworte dann mit dem passenden Menüpfad und dem nächsten Arbeitsschritt."].
    join("\n");
  }

  function getHumanSmallTalkAnswer(userText: string): string | null {
    const q = String(userText || "").
    toLowerCase().
    trim();
    if (!q) return null;

    const hasActionIntent = [
    "öffne",
    "oeffne",
    "open",
    "gehe",
    "geh",
    "wechsel",
    "zeige",
    "zeig",
    "bring mich",
    "navigiere",
    "ins ",
    "zum ",
    "zur ",
    "in die",
    "in den",
    "portami",
    "portare",
    "porta",
    "mandami",
    "vai",
    "andiamo",
    "apri",
    "analys",
    "prüf",
    "pruef",
    "controll",
    "calcola",
    "berechne",
    "lösche",
    "loesche"].
    some((w) => q.includes(w));

    const hasThanks = [
    "grazie",
    "danke",
    "thanks",
    "thank you",
    "sei un tesoro",
    "tesoro",
    "brava",
    "bravissima",
    "perfetto",
    "perfetta",
    "ottimo",
    "super",
    "top"].
    some((w) => q.includes(w));

    if (hasThanks && !hasActionIntent) {
      const projectCode = getProjectCodeFromPage();
      const projectText = projectCode ? ` im Projekt ${projectCode}` : "";
      return [
      "Sehr gern, Roberto. Ich bin immer für dich da – mit einem Lächeln und ganz nah an deinem Projekt.",
      "",
      `Ich bleibe aufmerksam bei deinem Projekt${projectText}: wenn Preise fehlen, doppelte Positionen auftauchen, Mengen komisch wirken oder etwas riskant aussieht, melde ich mich direkt bei dir.`].
      join("\n");
    }

    const asksMood = [
    "come stai",
    "come va",
    "tutto bene",
    "wie geht",
    "alles gut"].
    some((w) => q.includes(w));
    if (asksMood && !hasActionIntent) {
      return [
      "Mir geht es sehr gut, Roberto. Ich bin wach, gut gelaunt und bereit für dich.",
      "",
      "Ich bleibe aufmerksam im Hintergrund: fehlende Preise, doppelte Positionen, Risiken und den nächsten sinnvollen Schritt behalte ich für dich im Blick."].
      join("\n");
    }

    const onlyGreeting =
    /^(ciao|buongiorno|buonasera|salve|hallo|hi|hey)\b/.test(q) &&
    q.length <= 40;
    if (onlyGreeting && !hasActionIntent) {
      const projectCode = getProjectCodeFromPage() || "il progetto aperto";
      return [
      "Guten Morgen Roberto, ich bin schon da und habe dein Projekt im Blick.",
      "",
      `Ich prüfe für dich ${projectCode}: Kalkulation, Nachträge, Aufmaß, CAD, Angebote, fehlende Preise und Risiken – ruhig, aufmerksam und Schritt für Schritt.`].
      join("\n");
    }

    return null;
  }

  function setGeneralConversationMode(value: boolean) {
    try {
      sessionStorage.setItem(
        "rlc_copilot_general_conversation_mode",
        value ? "1" : "0"
      );
    } catch {

      // ignore storage errors
    }}

  function isGeneralConversationModeActive(): boolean {
    try {
      return (
        sessionStorage.getItem("rlc_copilot_general_conversation_mode") === "1");

    } catch {
      return false;
    }
  }

  function getNaturalConversationAnswer(userText: string): string | null {
    const q = String(userText || "").
    toLowerCase().
    trim();
    if (!q) return null;

    const wantsGeneralConversation = [
    "nicht über das projekt",
    "nicht ueber das projekt",
    "nicht vom projekt",
    "nicht über rlc",
    "nicht ueber rlc",
    "nicht technisch",
    "normal reden",
    "einfach reden",
    "nur reden",
    "frei reden",
    "smalltalk",
    "conversare",
    "conversazione",
    "chiacchierare",
    "parlare di altro",
    "non del progetto",
    "non parlare del progetto",
    "non voglio parlare del progetto",
    "ich möchte nicht über das projekt reden",
    "ich moechte nicht ueber das projekt reden",
    "5 minuten",
    "5 minuti",
    "cinque minuti"].
    some((w) => q.includes(w));

    const generalTopicWords = [
    "wetter",
    "tempo",
    "mittagessen",
    "mittagsessen",
    "essen",
    "pranzo",
    "mangiare",
    "cena",
    "abendessen",
    "frühstück",
    "fruehstueck",
    "kaffee",
    "alltag",
    "giornata",
    "tag",
    "familie",
    "famiglia",
    "urlaub",
    "vacanza",
    "vacanze",
    "gesundheit",
    "salute",
    "stimmung",
    "umore",
    "stress",
    "idee",
    "idea",
    "auto",
    "sport",
    "spaziergang",
    "camminata",
    "cavin"];


    const asksGeneralTopic =
    (q.includes("können wir über") ||
    q.includes("koennen wir ueber") ||
    q.includes("kann ich über") ||
    q.includes("kann ich ueber") ||
    q.includes("reden wir über") ||
    q.includes("reden wir ueber") ||
    q.includes("parliamo di") ||
    q.includes("possiamo parlare") ||
    q.includes("über was können wir reden") ||
    q.includes("ueber was koennen wir reden")) &&
    generalTopicWords.some((w) => q.includes(w));

    const clearNonProjectEverydayQuestion =
    generalTopicWords.some((w) => q.includes(w)) &&
    ![
    "kalkulation",
    "projekt",
    "rlc",
    "lv",
    "gaeb",
    "x83",
    "x84",
    "cad",
    "pdf",
    "aufmaß",
    "aufmass",
    "rechnung",
    "buchhaltung",
    "nachtrag",
    "angebot"].
    some((w) => q.includes(w));

    const backToProject = [
    "torniamo al progetto",
    "torna al progetto",
    "parliamo del progetto",
    "zurück zum projekt",
    "zurueck zum projekt",
    "wieder projekt",
    "wieder zur arbeit",
    "weiter mit rlc",
    "weiter mit kalkulation"].
    some((w) => q.includes(w));

    if (backToProject) {
      setGeneralConversationMode(false);
      return [
      "Natürlich, Roberto. Wir gehen wieder zurück zur Arbeit im Projekt.",
      "",
      "Ich habe die Kalkulation wieder im Blick: Preise, Mengen, doppelte Positionen, Risiken und den nächsten sauberen Schritt. Sag mir einfach, was ich zuerst prüfen oder öffnen soll."].
      join("\n");
    }

    if (
    wantsGeneralConversation ||
    asksGeneralTopic ||
    clearNonProjectEverydayQuestion)
    {
      setGeneralConversationMode(true);
      // Keine lokale Standardantwort: die konkrete Nachricht geht direkt an /api/support/chat,
      // damit der Copilot wirklich frei, thematisch und ohne Projekt-Fallback antwortet.
      return null;
    }

    // Wichtig: Im freien Gespräch keine lokalen Standardantworten mehr liefern.
    // Alles Normale geht bewusst an /api/support/chat, damit der Copilot wirklich frei antworten kann.
    return null;
  }

  function getLocalProjectAwareAnswer(userText: string): string | null {
    if (
    pageKey !== "kalkulation-mit-ki" &&
    pageKey !== "kalkulation-nachtraege")

    return null;

    const q = String(userText || "").toLowerCase();
    const projectCode = getProjectCodeFromPage() || "nicht erkannt";
    const projectTitle = getProjectTitleFromPage() || "Neues Projekt";

    const asksProject =
    q.includes("projekt") ||
    q.includes("code") ||
    q.includes("kontroll") ||
    q.includes("kontrol") ||
    q.includes("siehst du") ||
    q.includes("hallo") ||
    q.includes("überblick") ||
    q.includes("ueberblick") ||
    q.includes("zusammenfassung") ||
    q.includes("wo befinden");

    const asksNachtrag =
    q.includes("nachtrag") ||
    q.includes("nachträge") ||
    q.includes("nachtraeg") ||
    q.includes("zusatz") ||
    q.includes("änderung") ||
    q.includes("aenderung");

    if (asksNachtrag) {
      return [
      `Ja, Roberto. Du bist im Projekt ${projectCode} – ${projectTitle}.`,
      "",
      "Einen Nachtrag erstellst du so:",
      "1. Öffne im linken Menü Kalkulation → Nachträge.",
      "2. Klicke auf „Neuen Nachtrag erstellen“.",
      "3. Wähle die betroffene LV-Position oder erstelle eine neue Nachtragsposition.",
      "4. Trage Menge, Einheit, EP und Begründung ein.",
      "5. Prüfe die Urkalkulation und speichere den Nachtrag.",
      "6. Danach kannst du daraus Angebot/PDF erzeugen oder ihn zur Freigabe vorbereiten.",
      "",
      `Aktueller Projektstand: ${lvStats.count} LV-Positionen, ${money(lvStats.net)} RLC-KI netto, ${lvStats.duplicateCount} doppelte LV-Positionen.`].
      join("\n");
    }

    const asksOffer =
    q.includes("angebot") || q.includes("pdf") || q.includes("export");

    const asksGaeb =
    q.includes("gaeb") ||
    q.includes("x83") ||
    q.includes("x84") ||
    q.includes("d83") ||
    q.includes("p83") ||
    q.includes("eintragen") ||
    q.includes("importieren");

    if (asksGaeb) {
      return [
      `Ja, Roberto. Du bist im Projekt ${projectCode} – ${projectTitle}.`,
      "",
      "Eine GAEB/X83-Datei trägst du in RLC über die GAEB-Seite ein:",
      "1. Öffne links Kalkulation → GAEB.",
      "2. Wähle „X83 prüfen“ oder „GAEB importieren“.",
      "3. Lade die X83-Datei hoch.",
      "4. Prüfe PosNr, Kurztext, Langtext, Einheit, Menge und Dubletten.",
      "5. Danach kannst du die Positionen in LV / KI-Kalkulation übernehmen.",
      "",
      "Wichtig: X84 ist für Angebots-/Preisvergleich, X83 ist für LV/Leistungsverzeichnis."].
      join("\n");
    }

    if (asksOffer) {
      return [
      `Ja, Roberto. Im Projekt ${projectCode} kannst du aus der KI-Kalkulation direkt Angebot/PDF vorbereiten.`,
      "",
      "Sinnvoller Ablauf:",
      "1. Erst doppelte Positionen über „Doppelte“ prüfen.",
      "2. Danach Top-Risiken / Outlier Report prüfen.",
      "3. Dann Angebot / Export öffnen.",
      "4. PDF, XLSX oder GAEB erzeugen."].
      join("\n");
    }

    const asksRisk =
    q.includes("risiko") ||
    q.includes("outlier") ||
    q.includes("abweichung") ||
    q.includes("prüfpflichtig");

    if (asksRisk) {
      return [
      `Ich sehe im Projekt ${projectCode}:`,
      `- LV-Positionen: ${lvStats.count}`,
      `- Netto RLC-KI: ${money(lvStats.net)}`,
      `- Doppelte LV-Positionen: ${lvStats.duplicateCount}`,
      `- Fehlende Einheiten: ${lvStats.missingUnits}`,
      `- Fehlende Mengen: ${lvStats.missingQty}`,
      `- EP fehlt: ${lvStats.missingPrice}`,
      `- Urkalkulation fehlt: ${lvStats.missingBreakdown}`,
      "",
      "Nächster Schritt: Top-Risiken anzeigen und danach Outlier Report prüfen."].
      join("\n");
    }

    if (!asksProject) {
      // Keine technische Standardantwort auf freie/alltägliche Nachrichten.
      // Dadurch kann der freie Chat über /api/support/chat übernehmen.
      return null;
    }

    return [
    `Ja, Roberto. Ich sehe das aktuell geöffnete Projekt: ${projectCode} – ${projectTitle}.`,
    "",
    pageKey === "kalkulation-nachtraege" ?
    `Ich befinde mich in den Nachträgen dieses Projekts.` :
    `Ich befinde mich in der KI-Kalkulation dieses Projekts.`,
    `Aktueller Stand:`,
    `- LV-Positionen: ${lvStats.count}`,
    `- Netto RLC-KI: ${money(lvStats.net)}`,
    `- Doppelte LV-Positionen: ${lvStats.duplicateCount}`,
    `- Fehlende Einheiten: ${lvStats.missingUnits}`,
    `- Fehlende Mengen: ${lvStats.missingQty}`,
    `- EP fehlt: ${lvStats.missingPrice}`,
    `- Urkalkulation fehlt: ${lvStats.missingBreakdown}`,
    "",
    lvStats.duplicateCount > 0 ?
    `Wichtig: Die ${lvStats.duplicateCount} doppelten Positionen bearbeitest du direkt in der Kalkulation über den Filter „Doppelte ${lvStats.duplicateCount}“ und danach über „Auswahl löschen“.` :
    `Es sind aktuell keine doppelten LV-Positionen offen.`].
    join("\n");
  }

  async function sendSupportMessage(customText?: string) {
    const text = String(customText || input).trim();

    if (!text || busy) return;

    const nextMessages: ChatMsg[] = [...messages, { role: "user", text }];

    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setTab("support");

    // Nur eindeutige Bedienbefehle lokal ausführen (z. B. „Öffne CAD“).
    // Alle echten Fragen und Gespräche gehen immer an das KI-Backend.
    // Dadurch antwortet der Copilot frei wie ein Assistent und nicht aus festen Textbausteinen.
    const directActionAnswer = getDirectRlcActionAnswer(text);

    if (directActionAnswer) {
      setMessages([
      ...nextMessages,
      { role: "assistant", text: directActionAnswer }]
      );
      speakCopilot(directActionAnswer);
      setBusy(false);
      return;
    }

    try {
      const token = getAuthToken();

      const res = await fetch(apiUrl("/api/support/chat"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          message: text,
          originalMessage: text,
          systemPrompt: buildCopilotPromptMessage(text),
          page: pathname,
          module: current,
          context: {
            ...buildCopilotContext(text),
            softwareKnowledge: buildRlcKnowledgeContext(text, pathname),
            supportReport: buildSupportReport(),
            crm: {
              projectCode: getProjectCodeFromPage(),
              purpose: "Angebotsverfolgung / CRM"
            },
            recipes: {
              projectCode: getProjectCodeFromPage(),
              purpose: "Urkalkulation / Ressourcen / Preisaufbau",
              lvStats,
              dbStats
            }
          }
        })
      });

      const json = await res.json().catch(() => null);

      const answer =
      json?.answer ||
      json?.message ||
      json?.reply || (
      res.ok ?
      "Ich habe deine Anfrage aufgenommen. Der Support-Endpunkt hat aber keine konkrete Antwort geliefert." :
      `Support-Server antwortet mit Fehler ${res.status}. Prüfe Auth, Lizenz, Serverroute /api/support/chat und API_BASE.`);

      const assistantAnswer = String(answer);
      setMessages([
      ...nextMessages,
      { role: "assistant", text: assistantAnswer }]
      );
      speakCopilot(assistantAnswer);
    } catch {
      const fallback = isGeneralConversationModeActive() ?
      "Ich wollte dir gerade frei antworten, aber der Copilot-Server ist momentan nicht erreichbar. Prüfe bitte kurz API_BASE und /api/support/chat; sobald der Server antwortet, kann ich ohne feste Textbausteine normal mit dir reden." :
      pageKey === "start-projekt" ?
      "Support ist gerade nicht erreichbar. Für die Startseite prüfe zuerst: Projektliste, Suche, Schnellwahl, zuletzt geöffnete Projekte, neues Projekt sowie JSON/ZIP Import." :
      pageKey === "projekt-uebersicht" ?
      "Support ist gerade nicht erreichbar. Für die Projektübersicht prüfe zuerst: Projektcode, Projektname, Speicherart, letzter Zugriff und ob die gewünschten Module über die Buttons erreichbar sind." :
      pageKey === "kalkulation-rezepte" ?
      "Support ist gerade nicht erreichbar. Für die Urkalkulation prüfe zuerst: Positionsdaten, Einheit, Menge, Ressourcen, direkte Kosten, Zuschläge, EP/GP, Langtext und ob die Position in LV/Datenbank übernommen wurde." :
      pageKey === "kalkulation-gaeb" ?
      "Support ist gerade nicht erreichbar. Für GAEB prüfe zuerst: Projektcode, PosNr, Kurztext/Langtext, Einheit, Menge, Dubletten und danach X83/X84 Validierung." :
      pageKey === "kalkulation-datenbank" ?
      "Support ist gerade nicht erreichbar. Für die Kalkulationsdatenbank prüfe zuerst: doppelte Einträge, fehlende EP, fehlende Einheit, fehlende Ressourcen, Risiko hoch/kritisch und Confidence unter 70 %." :
      pageKey === "kalkulation-mit-ki" ?
      "Support ist gerade nicht erreichbar. Für die KI-Kalkulation prüfe zuerst: LV-Positionen, fehlende Einheiten/Mengen, doppelte Positionen, EP, Urkalkulation und GAEB-Export." :
      pageKey === "kalkulation-versionsvergleich" ?
      "Support ist gerade nicht erreichbar. Für die Angebotsanalyse prüfe zuerst: mindestens zwei Versionen auswählen, Vergleich starten, Preis-/Mengen-/Einheitsabweichungen filtern und danach Risikoanalyse oder PDF-Export ausführen." :
      pageKey === "kalkulation-crm" ?
      "Support ist gerade nicht erreichbar. Für CRM prüfe zuerst: offene Angebote, Follow-up-Datum, nächste Aktion, Kontakt, PDF/Link, Status und ob Angebote überfällig sind." :
      "Support ist gerade nicht erreichbar. Prüfe bitte API_BASE, Server, Auth und /api/support/chat.";

      setMessages([...nextMessages, { role: "assistant", text: fallback }]);
      speakCopilot(fallback);
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
    const activePages: PageKey[] = [
    "projekt-uebersicht",
    "kalkulation-uebersicht",
    "kalkulation-lv",
    "kalkulation-mit-ki",
    "kalkulation-nachtraege",
    "mengenermittlung",
    "cad"];


    if (!activePages.includes(pageKey)) return;

    const projectCode = getProjectCodeFromPage();
    if (!projectCode && pageKey === "start-projekt") return;

    const hour = new Date().getHours();
    const greeting =
    hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";

    const problems = {
      duplicates: Number(lvStats.duplicateCount || 0),
      missingUnits: Number(lvStats.missingUnits || 0),
      missingQty: Number(lvStats.missingQty || 0),
      missingPrice: Number(lvStats.missingPrice || 0),
      missingBreakdown: Number(lvStats.missingBreakdown || 0),
      net: Number(lvStats.net || 0),
      count: Number(lvStats.count || 0)
    };

    const totalProblems =
    problems.duplicates +
    problems.missingUnits +
    problems.missingQty +
    problems.missingPrice +
    problems.missingBreakdown;

    const checks: string[] = [];
    if (problems.missingPrice > 0)
    checks.push(`${problems.missingPrice} Preis(e) fehlen`);
    if (problems.duplicates > 0)
    checks.push(`${problems.duplicates} doppelte LV-Position(en)`);
    if (problems.missingUnits > 0)
    checks.push(`${problems.missingUnits} Einheit(en) fehlen`);
    if (problems.missingQty > 0)
    checks.push(`${problems.missingQty} Menge(n) fehlen`);
    if (problems.missingBreakdown > 0)
    checks.push(`${problems.missingBreakdown} Urkalkulation(en) fehlen`);

    const nextStep =
    problems.missingPrice > 0 ?
    `Zuerst ${problems.missingPrice} Position(en) ohne EP prüfen.` :
    problems.duplicates > 0 ?
    `Zuerst in der Kalkulation den Filter „Doppelte ${problems.duplicates}“ öffnen und danach „Auswahl löschen“ verwenden.` :
    problems.missingBreakdown > 0 ?
    `Zuerst ${problems.missingBreakdown} Position(en) ohne Urkalkulation prüfen.` :
    problems.missingUnits > 0 ?
    `Zuerst ${problems.missingUnits} fehlende Einheit(en) ergänzen.` :
    problems.missingQty > 0 ?
    `Zuerst ${problems.missingQty} fehlende Menge(n) ergänzen.` :
    problems.net > 0 ?
    "Heute zuerst Outlier Report und Top-Risiken prüfen, danach Angebot/Export vorbereiten." :
    "Heute zuerst LV/GAEB laden oder KI-Kalkulation starten.";

    const projectPrefix = projectCode ?
    `Projekt ${projectCode}` :
    "das aktuelle Projekt";
    const message =
    totalProblems > 0 ?
    `${greeting} Roberto, ich bin schon da. Ich habe ${projectPrefix} aufmerksam geprüft: ${problems.count} LV-Position(en), ${money(problems.net)} RLC-KI netto. Mir ist aufgefallen: ${checks.join(", ")}. Ich würde heute damit anfangen: ${nextStep}` :
    `${greeting} Roberto, ich bin schon da. Ich habe ${projectPrefix} aufmerksam geprüft. Die Kalkulation wirkt aktuell vollständig. Ich würde trotzdem kurz Top-Risiken und Export kontrollieren. ${nextStep}`;

    const signature = [
    projectCode || pathname,
    pageKey,
    problems.count,
    problems.duplicates,
    problems.missingUnits,
    problems.missingQty,
    problems.missingPrice,
    problems.missingBreakdown,
    Math.round(problems.net)].
    join("|");

    setSecretaryAlert(message);

    if (secretaryLastSignatureRef.current !== signature) {
      secretaryLastSignatureRef.current = signature;
      setTab("steuerung");
      setKiSignalPulse(true);
      window.setTimeout(() => setKiSignalPulse(false), 4200);
    }
  }, [
  pageKey,
  pathname,
  lvStats.count,
  lvStats.duplicateCount,
  lvStats.missingUnits,
  lvStats.missingQty,
  lvStats.missingPrice,
  lvStats.missingBreakdown,
  lvStats.net]
  );

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
      text: "Outlier Report ist auf dieser Seite noch nicht verbunden. Öffne ihn über den Button in der Kalkulation oder lade die Seite neu."
    }]
    );
  }
  function renderActions(actions: AssistantAction[]) {
    return actions.slice(0, 3).map((action) =>
    <button
      key={action.label}
      type="button" className={rlcClass(null,
      getButtonStyle(action))}
      disabled={!!action.disabled}
      onClick={action.onClick}>
      
        {action.label}
      </button>
    );
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
    pageKey === "start-projekt")
    {
      return (
        <div className={rlcClass(null, statsList)}>
          {pageKey === "kalkulation-mit-ki" && lvStats.activeKi ?
          <div className={rlcClass(null, statsRow)}>
              <span>KI aktiv</span>
              <b>{safeReactText(lvStats.activeKi)}</b>
            </div> :
          null}

          <div className={rlcClass(null, statsRow)}>
            <span>Netto RLC-KI</span>
            <b>
              {lvStats.net > 0 ?
              money(lvStats.net) :
              runtimeKalkulationSummary ?
              "Wird berechnet…" :
              "0,00 €"}
            </b>
          </div>

          <div className={rlcClass(null, statsRow)}>
            <span>Doppelte LV-Positionen</span>
            <b>{lvStats.duplicateCount}</b>
          </div>

          <div className={rlcClass(null, statsRow)}>
            <span>Einheit fehlt</span>
            <b>{lvStats.missingUnits}</b>
          </div>

          <div className={rlcClass(null, statsRow)}>
            <span>Menge fehlt / 0</span>
            <b>{lvStats.missingQty}</b>
          </div>

          <div className={rlcClass(null, statsRow)}>
            <span>EP fehlt</span>
            <b>{lvStats.missingPrice}</b>
          </div>

          <div className={rlcClass(null, statsRow)}>
            <span>Urkalkulation fehlt</span>
            <b>{lvStats.missingBreakdown}</b>
          </div>
        </div>);

    }
    if (pageKey === "kalkulation-datenbank") {
      return (
        <div className={rlcClass(null, statsGrid)}>
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

          <span>◉ Confidence</span>
          <b>{pct(dbStats.avgConfidence)}</b>

          <span>Wiederverwendet</span>
          <b>{dbStats.used}</b>
        </div>);

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
        sendSimpleCommand(
          "rlc:start-command",
          "reloadProjects",
          "Projekte werden neu geladen."
        )
      },
      {
        label: "Neues Projekt vorbereiten",
        kind: "primary",
        onClick: () =>
        sendSimpleCommand(
          "rlc:start-command",
          "focusNewProject",
          "Neues Projekt wird vorbereitet."
        )
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "projekt-uebersicht") {
      return [
      {
        label: "Kalkulation öffnen",
        kind: "primary",
        onClick: () => go("/kalkulation")
      },
      {
        label: "KI-Kalkulation öffnen",
        kind: "primary",
        onClick: () => go("/kalkulation/mit-ki")
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "kalkulation-uebersicht") {
      return [
      {
        label: "LV / Positionen prüfen",
        kind: "primary",
        onClick: () => go("/kalkulation/lv-import")
      },
      {
        label: "KI-Kalkulation öffnen",
        kind: "primary",
        onClick: () => go("/kalkulation/mit-ki")
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "kalkulation-lv") {
      return [
      {
        label: "LV prüfen",
        kind: "primary",
        onClick: () => void sendSupportMessage(makeSupportPrompt("lv"))
      },
      {
        label: "Doppelte anzeigen",
        kind: "primary",
        onClick: () => sendKalkulationFilter("doppelte")
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "kalkulation-mit-ki") {
      return [
      {
        label: "Projekt analysieren",
        kind: "primary",
        onClick: () =>
        void sendSupportMessage(
          "Analysiere diese Kalkulation fachlich als RLC Copilot. Prüfe Gesamtbetrag, Preislogik, Risiken, fehlende Mengen/Einheiten, fehlende Urkalkulation, doppelte Positionen und die wichtigsten Abweichungen. Gib mir eine klare Prioritätenliste. Die Bearbeitung von doppelten Positionen erfolgt direkt in der Kalkulation über den Filter Doppelte."
        )
      },
      {
        label: "Top-Risiken anzeigen",
        kind: "primary",
        onClick: () => sendKalkulationFilter("warnungen")
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "kalkulation-datenbank") {
      return [
      {
        label: "Dubletten bereinigen",
        kind: "danger",
        disabled: dbStats.duplicateCount <= 0,
        onClick: deleteDbDuplicates
      },
      {
        label: "Risiko-Einträge anzeigen",
        kind: "primary",
        onClick: () =>
        sendSimpleFilter(
          "rlc:datenbank-command",
          "risikoHoch",
          "Risiko-Einträge werden angezeigt."
        )
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "kalkulation-preise") {
      return [
      {
        label: "Prüfung starten",
        kind: "primary",
        onClick: () =>
        sendSimpleCommand(
          "rlc:preise-command",
          "startPruefung",
          "Preisprüfung wird gestartet."
        )
      },
      {
        label: "EP fehlt anzeigen",
        onClick: () =>
        sendSimpleFilter(
          "rlc:preise-command",
          "epFehlt",
          "EP fehlt wird angezeigt."
        )
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "kalkulation-nachtraege") {
      return [
      {
        label: "Nachträge analysieren",
        kind: "primary",
        onClick: () =>
        void sendSupportMessage(
          `Analysiere die Nachträge für ${getProjectCodeFromPage() || "das aktuelle Projekt"}. Prüfe Entwürfe, abgegebene/beauftragte Nachträge, fehlende Begründungen, fehlende Mengen, fehlende Einheiten, fehlende EP, Dubletten, Angebotsübergabe und PDF/Server-Speicherung. Gib eine kurze Prioritätenliste mit den nächsten 3 Schritten.`
        )
      },
      {
        label: "Fehlende Daten anzeigen",
        kind: "primary",
        onClick: () =>
        sendSimpleFilter(
          "rlc:nachtraege-command",
          "begruendungFehlt",
          "Nachträge ohne Begründung werden angezeigt."
        )
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "kalkulation-angebot") {
      return [
      {
        label: "PDF erzeugen",
        kind: "primary",
        onClick: () =>
        sendSimpleCommand(
          "rlc:angebot-command",
          "pdf",
          "PDF-Erzeugung wird gestartet."
        )
      },
      {
        label: "Angebot prüfen",
        kind: "primary",
        onClick: () =>
        sendSimpleCommand(
          "rlc:angebot-command",
          "check",
          "Angebot wird geprüft."
        )
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "kalkulation-gaeb") {
      return [
      {
        label: "X83 prüfen",
        kind: "primary",
        onClick: () => sendGaebCommand("validate", { mode: "x83" })
      },
      {
        label: "GAEB-Fehler anzeigen",
        kind: "primary",
        onClick: () => sendGaebCommand("showErrors")
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "kalkulation-rezepte") {
      return [
      {
        label: "KI-Ressourcen vorschlagen",
        kind: "primary",
        onClick: () => sendRezepteCommand("suggestResources")
      },
      {
        label: "Preisaufbau starten",
        kind: "primary",
        onClick: () => sendRezepteCommand("calculatePriceBuildUp")
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "kalkulation-versionsvergleich") {
      return [
      {
        label: "Versionen vergleichen",
        kind: "primary",
        onClick: () => sendVersionsvergleichCommand("compareSelected")
      },
      {
        label: "Risikoanalyse starten",
        kind: "primary",
        onClick: () => sendVersionsvergleichCommand("riskAnalysis")
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "kalkulation-crm") {
      return [
      {
        label: "Offene Angebote anzeigen",
        kind: "primary",
        onClick: () => sendCrmCommand("showOpen")
      },
      {
        label: "Überfällige Follow-ups",
        kind: "primary",
        onClick: () => sendCrmCommand("showOverdue")
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "mengenermittlung") {
      return [
      {
        label: "Aufmaß nach LV öffnen",
        kind: "primary",
        onClick: () => go("/mengenermittlung/aufmasseditor")
      },
      {
        label: "Soll-Ist prüfen",
        kind: "primary",
        onClick: () => go("/mengenermittlung/soll-ist")
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "cad") {
      return [
      {
        label: "CAD Viewer öffnen",
        kind: "primary",
        onClick: () => go("/cad/viewer")
      },
      {
        label: "PDF Viewer öffnen",
        kind: "primary",
        onClick: () => go("/cad/pdf-viewer")
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "buchhaltung") {
      return [
      {
        label: "Kostenübersicht öffnen",
        kind: "primary",
        onClick: () => go("/buchhaltung/kostenuebersicht")
      },
      {
        label: "Rechnungen öffnen",
        kind: "primary",
        onClick: () => go("/buchhaltung/rechnungen")
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    if (pageKey === "buro") {
      return [
      {
        label: "Projekte öffnen",
        kind: "primary",
        onClick: () => go("/buro/projekte")
      },
      {
        label: "Dokumente öffnen",
        kind: "primary",
        onClick: () => go("/buro/dokumente")
      },
      { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

    }

    return [
    {
      label: "Kalkulation öffnen",
      kind: "primary",
      onClick: () => go("/kalkulation")
    },
    {
      label: "Projektübersicht öffnen",
      onClick: () => go("/projekt/uebersicht")
    },
    { label: "Frage an RLC Copilot", onClick: () => setTab("support") }];

  }

  function renderSupportChips() {
    const chips: Array<{label: string;kind: string;}> = [
    { label: "Seite erklären", kind: "page" },
    { label: "Workflow", kind: "workflow" },
    { label: "Fehlerhilfe", kind: "error" }];


    if (pageKey === "start-projekt")
    chips.push({ label: "Startseite", kind: "start" });
    if (pageKey === "projekt-uebersicht")
    chips.push({ label: "Projektübersicht", kind: "project" });
    if (pageKey === "kalkulation-rezepte")
    chips.push({ label: "Urkalkulation", kind: "recipes" });
    if (pageKey === "kalkulation-gaeb")
    chips.push({ label: "GAEB Analyse", kind: "gaeb" });
    if (pageKey === "kalkulation-datenbank")
    chips.push({ label: "Datenbank", kind: "database" });
    if (pageKey === "kalkulation-versionsvergleich") {
      chips.push({ label: "Angebotsanalyse", kind: "versionsvergleich" });
    }
    if (pageKey === "kalkulation-crm")
    chips.push({ label: "CRM Analyse", kind: "crm" });

    return chips.map((chip) =>
    <button
      key={chip.kind}
      type="button" className={rlcClass(null,
      chipBtn)}
      onClick={() => void sendSupportMessage(makeSupportPrompt(chip.kind))}>
      
        {chip.label}
      </button>
    );
  }

  return (
    <>
      <style>{`
        @keyframes rlcKiPulse {
          0% { transform: scale(1); box-shadow: 0 18px 38px rgba(20,110,245,0.36); }
          50% { transform: scale(1.08); box-shadow: 0 0 0 10px rgba(20,110,245,0.18), 0 18px 42px rgba(20,110,245,0.46); }
          100% { transform: scale(1); box-shadow: 0 18px 38px rgba(20,110,245,0.36); }
        }

        @keyframes rlcKiBoxPulse {
          0% { box-shadow: 0 0 0 0 rgba(20,110,245,0.0); border-color: #BED6FF; }
          50% { box-shadow: 0 0 0 5px rgba(20,110,245,0.18); border-color: #146EF5; }
          100% { box-shadow: 0 0 0 0 rgba(20,110,245,0.0); border-color: #BED6FF; }
        }

        @keyframes rlcCopilotAura {
          0% { transform: scale(1); opacity: 0.45; }
          50% { transform: scale(1.16); opacity: 0.20; }
          100% { transform: scale(1); opacity: 0.45; }
        }

        @keyframes rlcCopilotTalk {
          0%, 100% { transform: scaleY(0.45); }
          50% { transform: scaleY(1); }
        }

        @keyframes rlcCopilotBlink {
          0%, 92%, 100% { transform: scaleY(1); }
          95% { transform: scaleY(0.15); }
        }
      `}</style>
      {open ?
      <div className={rlcClass("rlc-copilot-layer", overlay)}>
          <aside
            className={rlcClass("rlc-copilot-popover", drawer)}
            role="dialog"
            aria-modal="false"
            aria-label="RLC Copilot">
            <div className={rlcClass(null, head)}>
              <div className={rlcClass(null, headLeft)}>
                <div className={rlcClass(null,
              avatarShell(copilotMode))}
              aria-label={`RLC Copilot ${copilotModeLabel(copilotMode)}`}>
                
                  <div className={rlcClass(null, avatarAura(copilotMode))} />
                  <div className={rlcClass(null, avatarRealPhotoIcon(copilotMode))} />
                </div>
                <div>
                  <div className={rlcClass(null, title)}>RLC Copilot</div>
                  <div className={rlcClass(null, sub)}>{current}</div>
                  <div className={rlcClass(null, modePill(copilotMode))}>
                    {copilotModeLabel(copilotMode)}
                  </div>
                </div>
              </div>

              <div className={rlcClass(null, headActions)}>
                <button
                type="button" className={rlcClass(null,
                isListening ? iconBtnActive : iconBtn)}
                onClick={startVoiceInput}
                title="Mit RLC Copilot sprechen">
                
                  <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true">
                  
                    <path
                    d="M12 14c1.7 0 3-1.3 3-3V6c0-1.7-1.3-3-3-3S9 4.3 9 6v5c0 1.7 1.3 3 3 3Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round" />
                  
                    <path
                    d="M5 11c0 3.9 3.1 7 7 7s7-3.1 7-7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round" />
                  
                    <path
                    d="M12 18v3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round" />
                  
                  </svg>
                </button>
                <button
                type="button" className={rlcClass(null,
                voiceEnabled ? iconBtnActive : iconBtn)}
                onClick={toggleVoice}
                title="Sprachausgabe ein/aus">
                
                  <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true">
                  
                    <path
                    d="M4 9v6h4l5 4V5L8 9H4Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round" />
                  
                    <path
                    d="M17 9.5c.8.8 1.2 1.6 1.2 2.5S17.8 13.7 17 14.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round" />
                  
                    <path
                    d="M19.5 7c1.4 1.4 2.2 3.1 2.2 5s-.8 3.6-2.2 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round" />
                  
                  </svg>
                </button>
                <button
                type="button" className={rlcClass(null,
                closeBtn)}
                onClick={() => setOpen(false)}>
                
                  <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true">
                  
                    <path
                    d="M6 6l12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round" />
                  
                  </svg>
                </button>
              </div>
            </div>

            <div className={rlcClass(null, tabs)}>
              <button
              type="button" className={rlcClass(null,
              tab === "steuerung" ? tabActive : tabBtn)}
              onClick={() => setTab("steuerung")}>
              
                Analyse
              </button>

              <button
              type="button" className={rlcClass(null,
              tab === "support" ? tabActive : tabBtn)}
              onClick={() => setTab("support")}>
              
                Chat
              </button>
            </div>

            <div className={rlcClass(null, liveStatusBox(copilotMode))}>
              <span className={rlcClass(null, liveDot(copilotMode))} />
              <span>
                {copilotMode === "listening" ?
              "Ich höre dir zu. Sprich ganz normal mit mir." :
              copilotMode === "speaking" ?
              "Ich antworte dir gerade per Stimme." :
              copilotMode === "analyzing" ?
              "Ich analysiere die aktuellen Projektdaten." :
              "Bereit für Analyse, Chat oder Sprachbefehl."}
              </span>
            </div>

            {tab === "steuerung" ?
          <div className={rlcClass(null, body)}>
                {pageKey !== "kalkulation-mit-ki" ?
            <div className={rlcClass(null, speech)}>{pageIntro(pageKey)}</div> :
            null}

                {secretaryAlert ?
            <div className={rlcClass(null,
            {
              border: "1px solid #BED6FF",
              background: "#EAF2FF",
              color: "#1E3A8A",
              borderRadius: 14,
              padding: 14,
              fontWeight: 700,
              lineHeight: 1.45,
              animation: kiSignalPulse ?
              "rlcKiBoxPulse 1.1s ease-in-out" :
              undefined
            })}>
              
                    {secretaryAlert}
                  </div> :
            null}

                {status ? <div className={rlcClass(null, successBox)}>{status}</div> : null}

                {kiWorking || kiProgress > 0 || kiLog ?
            <div className={rlcClass(null, progressBox)}>
                    <div className={rlcClass(null, progressHead)}>
                      <b>{kiWorking ? "KI arbeitet" : "KI-Protokoll"}</b>
                      <span>{kiProgress}%</span>
                    </div>

                    <div className={rlcClass(null, progressTrack)}>
                      <div className={rlcClass(null,
                { ...progressFill, width: `${kiProgress}%` })} />
                
                    </div>

                    {kiProgressText ?
              <div className={rlcClass(null, progressText)}>{kiProgressText}</div> :
              null}

                    {kiLog ?
              <div className={rlcClass(null, changeLogBox)}>
                        <div className={rlcClass(null, changeLogTitle)}>{kiLog.title}</div>

                        {kiLog.changes.length ?
                <div className={rlcClass(null, changeList)}>
                            <div className={rlcClass(null, changeSectionTitle)}>Änderungen</div>

                            {kiLog.changes.map((x, idx) =>
                  <div key={`c-${idx}`} className={rlcClass(null, changeItem)}>
                                – {x}
                              </div>
                  )}
                          </div> :
                null}

                        {kiLog.warnings?.length ?
                <div className={rlcClass(null, warningList)}>
                            <div className={rlcClass(null, warningSectionTitle)}>Warnungen</div>

                            {kiLog.warnings.map((x, idx) =>
                  <div key={`w-${idx}`} className={rlcClass(null, warningItem)}>
                                – {x}
                              </div>
                  )}
                          </div> :
                null}

                        {kiLog.unchanged?.length ?
                <div className={rlcClass(null, unchangedList)}>
                            <div className={rlcClass(null, unchangedSectionTitle)}>
                              übersprungen / unverändert
                            </div>

                            {kiLog.unchanged.map((x, idx) =>
                  <div key={`u-${idx}`} className={rlcClass(null, unchangedItem)}>
                                – {x}
                              </div>
                  )}
                          </div> :
                null}

                        {!kiLog.changes.length &&
                !kiLog.warnings?.length &&
                !kiLog.unchanged?.length ?
                <div className={rlcClass(null, unchangedItem)}>
                            Keine Detailmeldungen vorhanden.
                          </div> :
                null}
                      </div> :
              null}
                  </div> :
            null}

                <div className={rlcClass(null, moduleBox)}>
                  <div className={rlcClass(null, boxTitle)}>
                    {pageKey === "kalkulation-mit-ki" ?
                "Copilot Analyse" :
                current}
                  </div>
                  {renderStats()}
                  {renderActions(getActions())}
                </div>
              </div> :

          <div className={rlcClass(null, chatBody)}>
                <div ref={chatListRef} className={rlcClass(null, chatList)}>
                  <div className={rlcClass(null, speechSmall)}>
                    Copilot-Kontext: <b>{current}</b>
                    <br />
                    {pathname}
                  </div>

                  <div className={rlcClass(null, supportActions)}>{renderSupportChips()}</div>

                  {messages.map((m, idx) =>
              <div
                key={`${m.role}-${idx}`} className={rlcClass(null,
                m.role === "assistant" ? assistantMsg : userMsg)}>
                
                      {m.text}
                    </div>
              )}
                </div>

                <div className={rlcClass(null, composer)}>
                  <button
                type="button" className={rlcClass(null,
                isListening ? micBtnActive : micBtn)}
                onClick={startVoiceInput}
                title="Frage diktieren"
                disabled={!recognitionAvailable}>
                
                    {isListening ?
                "Stop" :

                <svg
                  width="21"
                  height="21"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true">
                  
                        <path
                    d="M12 14c1.7 0 3-1.3 3-3V6c0-1.7-1.3-3-3-3S9 4.3 9 6v5c0 1.7 1.3 3 3 3Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round" />
                  
                        <path
                    d="M5 11c0 3.9 3.1 7 7 7s7-3.1 7-7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round" />
                  
                        <path
                    d="M12 18v3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round" />
                  
                      </svg>
                }
                  </button>

                  <textarea className={rlcClass(null,
              textarea)}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
              isListening ?
              "Ich höre zu…" :
              "Frag RLC Copilot zum Softwareziel…"
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendSupportMessage();
                }
              }} />
              

                  <button
                type="button" className={rlcClass(null,
                voiceEnabled ? voiceBtnActive : voiceBtn)}
                onClick={toggleVoice}
                title="Antwort vorlesen"
                disabled={!voiceAvailable}>
                
                    <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true">
                  
                      <path
                    d="M4 9v6h4l5 4V5L8 9H4Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round" />
                  
                      <path
                    d="M17 9.5c.8.8 1.2 1.6 1.2 2.5S17.8 13.7 17 14.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round" />
                  
                      <path
                    d="M19.5 7c1.4 1.4 2.2 3.1 2.2 5s-.8 3.6-2.2 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round" />
                  
                    </svg>
                  </button>

                  <button
                type="button" className={rlcClass(null,
                sendBtn)}
                disabled={busy || !input.trim()}
                onClick={() => void sendSupportMessage()}>
                
                    {busy ? "..." : "Senden"}
                  </button>
                </div>
              </div>
          }
          </aside>
        </div> :
      null}

      <button
        type="button" className={rlcClass(null,
        kiSignalPulse ? floatBtnPulse : floatBtn)}
        onClick={() => {
          setOpen(true);
          setKiSignalPulse(false);
        }}
        aria-label="RLC Copilot öffnen"
        title="RLC Copilot öffnen">
        
        <span className={rlcClass(null, floatAvatarRealPhoto)} aria-hidden="true" />
      </button>
    </>);

}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9998,
  background: "transparent",
  pointerEvents: "none"
};

const drawer: React.CSSProperties = {
  position: "absolute",
  top: 18,
  right: 18,
  width: 430,
  maxWidth: "calc(100vw - 36px)",
  height: "min(650px, calc(100vh - 36px))",
  maxHeight: "calc(100vh - 36px)",
  background: "#FFFFFF",
  border: "1px solid #DDE5F0",
  borderRadius: 20,
  boxShadow: "0 24px 70px rgba(15,23,42,0.22)",
  padding: 16,
  boxSizing: "border-box",
  display: "grid",
  gridTemplateRows: "auto auto minmax(0,1fr)",
  gap: 12,
  overflow: "hidden",
  pointerEvents: "auto"
};

const head: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12
};

const headLeft: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10
};

function avatarShell(mode: CopilotMode): React.CSSProperties {
  const active = mode !== "idle";
  return {
    width: 54,
    height: 54,
    borderRadius: 16,
    background: "linear-gradient(135deg,#146EF5,#24B4FF)",
    color: "#FFFFFF",
    display: "grid",
    placeItems: "center",
    position: "relative",
    overflow: "hidden",
    boxShadow: active ?
    "0 0 0 6px rgba(20,110,245,0.13), 0 18px 36px rgba(20,110,245,0.36)" :
    "0 14px 30px rgba(20,110,245,0.28)"
  };
}

function avatarAura(mode: CopilotMode): React.CSSProperties {
  return {
    position: "absolute",
    inset: 7,
    borderRadius: 20,
    background:
    mode === "listening" ?
    "radial-gradient(circle,#22C55E 0%,rgba(34,197,94,0.0) 62%)" :
    mode === "speaking" ?
    "radial-gradient(circle,#F97316 0%,rgba(249,115,22,0.0) 62%)" :
    "radial-gradient(circle,#93C5FD 0%,rgba(147,197,253,0.0) 62%)",
    opacity: mode === "idle" ? 0.28 : 0.52,
    animation:
    mode === "idle" ? undefined : "rlcCopilotAura 1.4s ease-in-out infinite"
  };
}

function avatarRealPhotoIcon(mode: CopilotMode): React.CSSProperties {
  return {
    position: "relative",
    zIndex: 2,
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundImage: `url(${RLC_COPILOT_KI_AVATAR_SRC})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    boxShadow:
    mode === "idle" ?
    "0 8px 18px rgba(15,23,42,0.16), inset 0 0 0 1px rgba(255,255,255,0.36)" :
    "0 0 0 4px rgba(255,255,255,0.22), 0 12px 24px rgba(20,110,245,0.26)",
    transform: mode === "speaking" ? "scale(1.04)" : "scale(1)",
    transition: "transform 160ms ease, box-shadow 160ms ease"
  };
}

const avatarFace: React.CSSProperties = {
  position: "relative",
  width: 44,
  height: 47,
  display: "grid",
  placeItems: "center"
};

function avatarWomanPortrait(mode: CopilotMode): React.CSSProperties {
  return {
    width: 44,
    height: 44,
    borderRadius: 18,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Cdefs%3E%3CradialGradient id='bg' cx='50%25' cy='32%25' r='72%25'%3E%3Cstop offset='0%25' stop-color='%23ffffff'/%3E%3Cstop offset='100%25' stop-color='%23dbeafe'/%3E%3C/radialGradient%3E%3ClinearGradient id='hair' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23111827'/%3E%3Cstop offset='100%25' stop-color='%23312e81'/%3E%3C/linearGradient%3E%3ClinearGradient id='skin' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0%25' stop-color='%23ffe8d6'/%3E%3Cstop offset='100%25' stop-color='%23f3b78d'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='96' height='96' rx='24' fill='url(%23bg)'/%3E%3Cpath d='M21 47c0-22 13-34 29-34 17 0 30 13 30 35v24c-9 8-20 12-31 12-12 0-22-4-28-12V47z' fill='url(%23hair)'/%3E%3Cpath d='M29 49c0-15 8-25 21-25 13 0 21 10 21 25 0 17-9 29-21 29S29 66 29 49z' fill='url(%23skin)'/%3E%3Cpath d='M30 43c10-1 20-6 28-16 3 9 8 15 14 18-2-15-10-25-22-25-13 0-21 9-20 23z' fill='url(%23hair)'/%3E%3Ccircle cx='41' cy='52' r='3' fill='%23111827'/%3E%3Ccircle cx='59' cy='52' r='3' fill='%23111827'/%3E%3Cpath d='M43 66c5 4 11 4 16 0' fill='none' stroke='%239f1239' stroke-width='3' stroke-linecap='round'/%3E%3Cpath d='M34 58c3-2 7-2 10 0M56 58c3-2 7-2 10 0' stroke='%23f9a8d4' stroke-width='3' stroke-linecap='round' opacity='.75'/%3E%3C/svg%3E")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    boxShadow:
    mode === "idle" ?
    "inset 0 0 0 2px rgba(255,255,255,0.80)" :
    "0 0 0 4px rgba(255,255,255,0.30), inset 0 0 0 2px rgba(255,255,255,0.85)",
    transform: mode === "speaking" ? "scale(1.05)" : "scale(1)",
    transition: "transform 160ms ease, box-shadow 160ms ease"
  };
}

const avatarHair: React.CSSProperties = {
  position: "absolute",
  top: 2,
  width: 36,
  height: 34,
  borderRadius: "18px 18px 14px 14px",
  background: "linear-gradient(180deg,#172554,#312E81)"
};

const avatarHead: React.CSSProperties = {
  position: "absolute",
  top: 10,
  width: 31,
  height: 31,
  borderRadius: "14px 14px 16px 16px",
  background: "linear-gradient(180deg,#FDE7D3,#F8CFAE)",
  display: "grid",
  placeItems: "center",
  boxShadow: "inset 0 -4px 0 rgba(180,83,9,0.10)"
};

const avatarEyes: React.CSSProperties = {
  display: "flex",
  gap: 7,
  marginTop: 2
};

function avatarEye(mode: CopilotMode): React.CSSProperties {
  return {
    width: 4,
    height: 4,
    borderRadius: 999,
    background: "#0F172A",
    animation:
    mode === "speaking" || mode === "listening" ?
    "rlcCopilotBlink 3s ease-in-out infinite" :
    undefined
  };
}

function avatarMouth(mode: CopilotMode): React.CSSProperties {
  return {
    position: "absolute",
    bottom: 8,
    width: mode === "speaking" ? 10 : 8,
    height: mode === "speaking" ? 5 : 3,
    borderRadius: 999,
    background: mode === "speaking" ? "#BE123C" : "#334155",
    animation:
    mode === "speaking" ?
    "rlcCopilotTalk 0.55s ease-in-out infinite" :
    undefined
  };
}

function avatarMicRing(mode: CopilotMode): React.CSSProperties {
  return {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 999,
    border: "2px solid rgba(255,255,255,0.88)",
    background:
    mode === "listening" ?
    "#16A34A" :
    mode === "speaking" ?
    "#EA580C" :
    "#146EF5",
    display: "grid",
    placeItems: "center",
    fontSize: 8,
    fontWeight: 700,
    color: "#FFFFFF"
  };
}

function avatarStatusDot(mode: CopilotMode): React.CSSProperties {
  return {
    position: "absolute",
    top: 7,
    right: 7,
    width: 10,
    height: 10,
    borderRadius: 999,
    border: "2px solid #FFFFFF",
    background:
    mode === "idle" ?
    "#22C55E" :
    mode === "listening" ?
    "#10B981" :
    mode === "speaking" ?
    "#F97316" :
    "#146EF5"
  };
}

const headActions: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7
};

const iconBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 9,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  fontWeight: 700,
  cursor: "pointer"
};

const iconBtnActive: React.CSSProperties = {
  ...iconBtn,
  border: "1px solid #146EF5",
  background: "#EAF2FF",
  color: "#0B5BD3",
  boxShadow: "0 0 0 4px rgba(20,110,245,0.12)"
};

function modePill(mode: CopilotMode): React.CSSProperties {
  return {
    marginTop: 5,
    display: "inline-flex",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    background:
    mode === "idle" ?
    "#ECFDF5" :
    mode === "listening" ?
    "#DCFCE7" :
    mode === "speaking" ?
    "#FFEDD5" :
    "#EAF2FF",
    color:
    mode === "idle" ?
    "#166534" :
    mode === "listening" ?
    "#15803D" :
    mode === "speaking" ?
    "#C2410C" :
    "#0B5BD3"
  };
}

const title: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 650,
  color: "#0F172A"
};

const sub: React.CSSProperties = {
  marginTop: 2,
  fontSize: 12,
  fontWeight: 500,
  color: "#64748B"
};

const closeBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 9,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: 22,
  fontWeight: 600,
  cursor: "pointer"
};

const tabs: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8
};

const tabBtn: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  borderRadius: 8,
  padding: "8px 10px",
  fontWeight: 600,
  cursor: "pointer"
};

const tabActive: React.CSSProperties = {
  ...tabBtn,
  border: "1px solid #146EF5",
  background: "#EAF2FF",
  color: "#0B5BD3"
};

function liveStatusBox(mode: CopilotMode): React.CSSProperties {
  return {
    border: "1px solid #E0E7FF",
    background: mode === "idle" ? "#FFFFFF" : "#F8FAFC",
    color: "#334155",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 8
  };
}

function liveDot(mode: CopilotMode): React.CSSProperties {
  return {
    width: 9,
    height: 9,
    borderRadius: 999,
    background:
    mode === "idle" ?
    "#22C55E" :
    mode === "listening" ?
    "#16A34A" :
    mode === "speaking" ?
    "#F97316" :
    "#146EF5",
    boxShadow: mode === "idle" ? undefined : "0 0 0 5px rgba(20,110,245,0.12)"
  };
}

const body: React.CSSProperties = {
  overflow: "auto",
  display: "grid",
  gap: 11,
  alignContent: "start"
};

const speech: React.CSSProperties = {
  border: "1px solid #BED6FF",
  borderLeft: "3px solid #146EF5",
  background: "#EAF2FF",
  color: "#172033",
  borderRadius: 10,
  padding: 11,
  lineHeight: 1.5,
  fontSize: 13,
  fontWeight: 400
};

const speechSmall: React.CSSProperties = {
  ...speech,
  padding: 10,
  fontSize: 12
};

const successBox: React.CSSProperties = {
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#166534",
  borderRadius: 14,
  padding: 12,
  fontSize: 13,
  fontWeight: 700
};

const progressBox: React.CSSProperties = {
  border: "1px solid #BED6FF",
  background: "#F8FAFC",
  borderRadius: 10,
  padding: 10,
  display: "grid",
  gap: 9
};

const progressHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 13,
  color: "#0F172A"
};

const progressTrack: React.CSSProperties = {
  height: 10,
  borderRadius: 999,
  background: "#E5E7EB",
  overflow: "hidden"
};

const progressFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg,#146EF5,#22C55E)",
  transition: "width 260ms ease"
};

const progressText: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  fontWeight: 700
};

const changeLogBox: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 8
};

const changeLogTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#0F172A"
};

const changeSectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#166534",
  textTransform: "uppercase",
  letterSpacing: 0.4
};

const warningSectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#92400E",
  textTransform: "uppercase",
  letterSpacing: 0.4
};

const unchangedSectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: 0.4
};

const changeList: React.CSSProperties = {
  display: "grid",
  gap: 5
};

const changeItem: React.CSSProperties = {
  fontSize: 12,
  color: "#166534",
  lineHeight: 1.35,
  fontWeight: 700
};

const warningList: React.CSSProperties = {
  display: "grid",
  gap: 5
};

const warningItem: React.CSSProperties = {
  fontSize: 12,
  color: "#92400E",
  lineHeight: 1.35,
  fontWeight: 700
};

const unchangedList: React.CSSProperties = {
  display: "grid",
  gap: 5
};

const unchangedItem: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  lineHeight: 1.35,
  fontWeight: 700
};

const moduleBox: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  background: "#F8FAFC",
  borderRadius: 10,
  padding: 11,
  display: "grid",
  gap: 10
};

const boxTitle: React.CSSProperties = {
  color: "#0F172A",
  fontSize: 14,
  fontWeight: 700
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 6,
  fontSize: 13,
  color: "#0F172A"
};

const statsList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontSize: 13,
  color: "#0F172A"
};

const statsRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12
};
const primaryBtn: React.CSSProperties = {
  border: "1px solid #146EF5",
  background: "#146EF5",
  color: "#FFFFFF",
  borderRadius: 8,
  padding: "9px 11px",
  fontWeight: 600,
  cursor: "pointer"
};

const dangerBtn: React.CSSProperties = {
  ...primaryBtn,
  border: "1px solid #DC2626",
  background: "#DC2626"
};

const secondaryBtn: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 8,
  padding: "9px 11px",
  fontWeight: 600,
  cursor: "pointer"
};

const disabledBtn: React.CSSProperties = {
  ...primaryBtn,
  border: "1px solid #CBD5E1",
  background: "#E5E7EB",
  color: "#64748B",
  cursor: "not-allowed"
};

const quickGrid: React.CSSProperties = {
  display: "grid",
  gap: 8
};

const quickBtn: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: "9px 11px",
  color: "#0F172A",
  textDecoration: "none",
  fontWeight: 600,
  background: "#FFFFFF"
};

const quickBtnButton: React.CSSProperties = {
  ...quickBtn,
  textAlign: "left",
  cursor: "pointer"
};

const chatBody: React.CSSProperties = {
  minHeight: 0,
  display: "grid",
  gridTemplateRows: "minmax(0,1fr) auto",
  gap: 10
};

const chatList: React.CSSProperties = {
  overflow: "auto",
  display: "grid",
  gap: 8,
  alignContent: "start",
  paddingRight: 4
};

const supportActions: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap"
};

const chipBtn: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 999,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer"
};

const assistantMsg: React.CSSProperties = {
  justifySelf: "start",
  maxWidth: "88%",
  border: "1px solid #BED6FF",
  background: "#EAF2FF",
  color: "#172033",
  borderRadius: 10,
  padding: 10,
  fontSize: 13,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap"
};

const userMsg: React.CSSProperties = {
  justifySelf: "end",
  maxWidth: "88%",
  background: "#146EF5",
  color: "#FFFFFF",
  borderRadius: 10,
  padding: 10,
  fontSize: 13,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap"
};

const composer: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr auto auto",
  gap: 8,
  alignItems: "end"
};

const micBtn: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 8,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#0F172A",
  fontWeight: 700,
  cursor: "pointer"
};

const micBtnActive: React.CSSProperties = {
  ...micBtn,
  border: "1px solid #16A34A",
  background: "#DCFCE7",
  color: "#166534",
  boxShadow: "0 0 0 5px rgba(22,163,74,0.12)"
};

const voiceBtn: React.CSSProperties = {
  ...micBtn
};

const voiceBtnActive: React.CSSProperties = {
  ...micBtn,
  border: "1px solid #146EF5",
  background: "#EAF2FF",
  color: "#0B5BD3"
};

const textarea: React.CSSProperties = {
  minHeight: 52,
  maxHeight: 110,
  resize: "vertical",
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: 9,
  fontSize: 13,
  outline: "none"
};

const sendBtn: React.CSSProperties = {
  border: "1px solid #146EF5",
  background: "#146EF5",
  color: "#FFFFFF",
  borderRadius: 8,
  padding: "9px 13px",
  fontWeight: 600,
  cursor: "pointer"
};

const floatBtn: React.CSSProperties = {
  position: "fixed",
  right: 18,
  bottom: 22,
  zIndex: 9997,
  width: 64,
  height: 64,
  borderRadius: 18,
  border: "none",
  background: "linear-gradient(135deg,#146EF5,#0B5BD3)",
  color: "#FFFFFF",
  boxShadow: "0 18px 38px rgba(20,110,245,0.36)",
  display: "grid",
  placeItems: "center",
  gap: 0,
  fontWeight: 700,
  cursor: "pointer"
};

const floatBtnPulse: React.CSSProperties = {
  ...floatBtn,
  transform: "scale(1.08)",
  boxShadow:
  "0 0 0 8px rgba(20,110,245,0.18), 0 0 0 16px rgba(20,110,245,0.10), 0 18px 44px rgba(20,110,245,0.48)",
  animation: "rlcKiPulse 1s ease-in-out infinite"
};

const floatAvatarRealPhoto: React.CSSProperties = {
  width: 50,
  height: 50,
  borderRadius: 14,
  backgroundImage: `url(${RLC_COPILOT_KI_AVATAR_SRC})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  boxShadow:
  "0 10px 22px rgba(15,23,42,0.22), inset 0 0 0 1px rgba(255,255,255,0.30)"
};
const floatAvatarWrap: React.CSSProperties = {
  position: "relative",
  width: 52,
  height: 52,
  borderRadius: 18,
  background: "linear-gradient(135deg,#FDE7D3,#BED6FF)",
  boxShadow: "inset 0 0 0 3px rgba(255,255,255,0.72)",
  display: "grid",
  placeItems: "center"
};

const floatAvatarWoman: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  width: 48,
  height: 48,
  borderRadius: 17,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Cdefs%3E%3CradialGradient id='bg' cx='50%25' cy='32%25' r='72%25'%3E%3Cstop offset='0%25' stop-color='%23ffffff'/%3E%3Cstop offset='100%25' stop-color='%23dbeafe'/%3E%3C/radialGradient%3E%3ClinearGradient id='hair' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23111827'/%3E%3Cstop offset='100%25' stop-color='%23312e81'/%3E%3C/linearGradient%3E%3ClinearGradient id='skin' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0%25' stop-color='%23ffe8d6'/%3E%3Cstop offset='100%25' stop-color='%23f3b78d'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='96' height='96' rx='24' fill='url(%23bg)'/%3E%3Cpath d='M21 47c0-22 13-34 29-34 17 0 30 13 30 35v24c-9 8-20 12-31 12-12 0-22-4-28-12V47z' fill='url(%23hair)'/%3E%3Cpath d='M29 49c0-15 8-25 21-25 13 0 21 10 21 25 0 17-9 29-21 29S29 66 29 49z' fill='url(%23skin)'/%3E%3Cpath d='M30 43c10-1 20-6 28-16 3 9 8 15 14 18-2-15-10-25-22-25-13 0-21 9-20 23z' fill='url(%23hair)'/%3E%3Ccircle cx='41' cy='52' r='3' fill='%23111827'/%3E%3Ccircle cx='59' cy='52' r='3' fill='%23111827'/%3E%3Cpath d='M43 66c5 4 11 4 16 0' fill='none' stroke='%239f1239' stroke-width='3' stroke-linecap='round'/%3E%3Cpath d='M34 58c3-2 7-2 10 0M56 58c3-2 7-2 10 0' stroke='%23f9a8d4' stroke-width='3' stroke-linecap='round' opacity='.75'/%3E%3C/svg%3E")`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  filter: "drop-shadow(0 2px 2px rgba(15,23,42,0.14))"
};

const floatAvatarHair: React.CSSProperties = {
  position: "absolute",
  top: 7,
  left: 10,
  right: 10,
  height: 17,
  borderRadius: "16px 16px 8px 8px",
  background: "#1E293B"
};

const floatAvatarHead: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: 34,
  height: 32,
  borderRadius: "45% 45% 48% 48%",
  background: "#FFD7B5",
  display: "grid",
  alignItems: "center",
  justifyItems: "center",
  paddingTop: 6
};

const floatAvatarEyes: React.CSSProperties = {
  display: "flex",
  gap: 9,
  alignItems: "center"
};

const floatAvatarEye: React.CSSProperties = {
  width: 4,
  height: 4,
  borderRadius: 999,
  background: "#111827"
};

const floatAvatarMouth: React.CSSProperties = {
  width: 9,
  height: 4,
  borderBottom: "2px solid #7C2D12",
  borderRadius: "0 0 999px 999px",
  marginTop: 5
};

const floatAvatarBadge: React.CSSProperties = {
  position: "absolute",
  right: -4,
  bottom: -3,
  width: 21,
  height: 21,
  borderRadius: 999,
  background: "#146EF5",
  color: "#FFFFFF",
  border: "2px solid #FFFFFF",
  display: "grid",
  placeItems: "center",
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: -0.4,
  zIndex: 3
};

const floatAvatarStatus: React.CSSProperties = {
  position: "absolute",
  right: -5,
  top: -5,
  width: 12,
  height: 12,
  borderRadius: 999,
  background: "#22C55E",
  border: "2px solid #FFFFFF",
  zIndex: 4
};

const activeKiBoxPulse: React.CSSProperties = {
  border: "2px solid #146EF5",
  background: "linear-gradient(180deg,#DBEAFE,#FFFFFF)",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 6,
  marginBottom: 8,
  boxShadow: "0 0 0 4px rgba(20,110,245,0.14), 0 0 28px rgba(20,110,245,0.35)",
  animation: "rlcKiPulse 1.15s ease-in-out infinite"
};

const activeKiBox: React.CSSProperties = {
  gridColumn: "1 / -1",
  border: "1px solid #BED6FF",
  background: "linear-gradient(180deg,#EAF2FF,#FFFFFF)",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 6,
  marginBottom: 8
};

const activeKiEyebrow: React.CSSProperties = {
  fontSize: 11,
  color: "#146EF5",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em"
};

const activeKiTitle: React.CSSProperties = {
  fontSize: 14,
  color: "#0F172A",
  fontWeight: 700
};

const activeKiText: React.CSSProperties = {
  fontSize: 12,
  color: "#334155",
  lineHeight: 1.45,
  fontWeight: 600
};

const activeKiButton: React.CSSProperties = {
  border: "1px solid #146EF5",
  background: "#146EF5",
  color: "#FFFFFF",
  borderRadius: 10,
  padding: "8px 11px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  justifySelf: "start"
};
