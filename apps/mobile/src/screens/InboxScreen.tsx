// apps/mobile/src/screens/InboxScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, FlatList, SafeAreaView, RefreshControl, Platform, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { projectFsKey as computeProjectFsKey, looksLikeProjectCode, extractBaCode, Project } from "../lib/api";
import { COLORS, createRlcStyles } from "../ui/theme";
import RlcCategoryGrid, { RlcCategoryItem } from "../components/RlcCategoryGrid";

// ✅ Team / Rollen (per prefill Email Versand Ansprechpartner)
import { getProjectRoles } from "../storage/projectMeta";

// ✅ PDF Export + Email
import { exportRegiePdfToProject, exportLieferscheinPdfToProject, exportPhotosPdfToProject, exportTagesberichtPdfToProject, emailPdf } from "../lib/exporters/projectExport";
import {
  buildDocumentPdf,
  type PdfDocType,
  type PdfRow,
} from "../lib/exporters/documentPdfBuilder";
type Props = NativeStackScreenProps<RootStackParamList, "Inbox">;

/** AsyncStorage keys */
const KEY_MODE = "rlc_mobile_mode";
const KEY_LOCAL_PROJECTS = "rlc_mobile_local_projects_v1";
const CODEMAP_KEY = "rlc_project_code_map_v1";
type WorkflowStatus = "DRAFT" | "EINGEREICHT" | "FREIGEGEBEN" | "ABGELEHNT";
type Kind = "REGIE" | "LS" | "PHOTOS" | "TAGESBERICHT" | "BAUTAGEBUCH" | "ANGEBOT" | "RECHNUNG" | "ABSCHLAGSRECHNUNG" | "MENGEN" | "KALKULATION";
type InboxItem = {
  kind: Kind;
  projectId: string;
  projectTitle: string;
  projectCode?: string; // BA-...
  projectKey: string; // FS key (BA-... o local-...)
  id: string;
  title: string;
  status: WorkflowStatus;
  createdAt?: number;
  updatedAt?: number;
  raw: any;
};
async function loadJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
async function loadCodeMap(): Promise<Record<string, string>> {
  return (await loadJson<Record<string, string>>(CODEMAP_KEY)) || {};
}
function regieInboxKeys(projectKey: string) {
  return [`rlc_mobile_inbox_regie:${projectKey}`];
}
function lsInboxKeys(projectKey: string) {
  return [`rlc_mobile_inbox_lieferschein:${projectKey}`, `rlc_mobile_inbox_ls:${projectKey}`];
}
function photosInboxKeys(projectKey: string) {
  return [`rlc_mobile_inbox_photos:${projectKey}`, `rlc_mobile_inbox_photo:${projectKey}`, `rlc_mobile_inbox_photonotes:${projectKey}`, `rlc_mobile_inbox_photosnotes:${projectKey}`, `rlc_mobile_inbox_photos_notes:${projectKey}`, `rlc_mobile_inbox_fotos:${projectKey}`, `rlc_mobile_inbox_fotos_notizen:${projectKey}`];
}
function tagesberichtInboxKeys(projectKey: string) {
  return [`rlc_tagesbericht_list:${projectKey}`, `rlc_mobile_inbox_tagesbericht:${projectKey}`, `rlc_mobile_inbox_tagesberichte:${projectKey}`];
}
async function loadArrayFromFirstKey(keys: string[]): Promise<any[]> {
  for (const k of keys) {
    try {
      const raw = await AsyncStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

/** minimal local-project shape used in ProjectsScreen */
type LocalProject = {
  id: string;
  name: string;
  code?: string;
  baustellenNummer?: string;
  ort?: string;
  kunde?: string;
  createdAt: number;
};
function titleOf(p: Project) {
  return String((p as any)?.name || "").trim() || String((p as any)?.number || (p as any)?.baustellenNummer || "").trim() || String((p as any)?.code || "").trim() || String((p as any)?.id || "").trim();
}
function inferRowTitle(kind: Kind, r: any): string {
  const nr = String(r?.nr || r?.number || r?.regieNr || r?.lieferscheinNr || r?.id || r?.docId || "").trim().slice(0, 18);
  const date = r?.datum || r?.date || r?.createdAt || r?.created_at || r?.timestamp;
  const dateStr = typeof date === "number" ? new Date(date).toLocaleDateString() : typeof date === "string" ? String(date).slice(0, 10) : "";
  const base = kind === "REGIE" ? "Regie" : kind === "LS" ? "Lieferschein" : kind === "TAGESBERICHT" ? "Tagesbericht" : kind === "BAUTAGEBUCH" ? "Bautagebuch" : kind === "ANGEBOT" ? "Angebot" : kind === "RECHNUNG" ? "Rechnung" : kind === "ABSCHLAGSRECHNUNG" ? "Abschlagsrechnung" : kind === "MENGEN" ? "Mengenermittlung" : kind === "KALKULATION" ? "Kalkulation" : "Fotos";
  const p1 = nr ? `#${nr}` : "";
  const p2 = dateStr ? `${dateStr}` : "";
  return [base, p1, p2].filter(Boolean).join(" ");
}
function inferStatus(r: any): WorkflowStatus {
  const st = String(r?.workflowStatus || r?.status || "DRAFT").toUpperCase();
  if (st === "EINGEREICHT") return "EINGEREICHT";
  if (st === "FREIGEGEBEN") return "FREIGEGEBEN";
  if (st === "ABGELEHNT") return "ABGELEHNT";
  return "DRAFT";
}
function pickTs(r: any): {
  createdAt?: number;
  updatedAt?: number;
} {
  const c = r?.createdAt ?? r?.created_at ?? r?.timestamp ?? r?.time;
  const u = r?.updatedAt ?? r?.updated_at ?? r?.mtime;
  const toNum = (v: any): number | undefined => {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim()) {
      const n = Date.parse(v);
      if (!Number.isNaN(n)) return n;
    }
    return undefined;
  };
  return {
    createdAt: toNum(c),
    updatedAt: toNum(u)
  };
}
function badgeText(st: WorkflowStatus) {
  if (st === "EINGEREICHT") return "E";
  if (st === "FREIGEGEBEN") return "F";
  if (st === "ABGELEHNT") return "A";
  return "D";
}
function badgeColor(st: WorkflowStatus) {
  if (st === "EINGEREICHT") return COLORS.accentDark;
  if (st === "FREIGEGEBEN") return COLORS.accent;
  if (st === "ABGELEHNT") return COLORS.danger;
  return COLORS.sub;
}

/** =========================
 * Stable id
 * ========================= */
function hash32(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function stableStringifyLite(r: any) {
  const lite = {
    id: r?.id ?? r?.uuid ?? r?.opId ?? null,
    nr: r?.nr ?? r?.number ?? r?.regieNr ?? r?.lieferscheinNr ?? null,
    date: r?.datum ?? r?.date ?? null,
    createdAt: r?.createdAt ?? r?.created_at ?? r?.timestamp ?? null,
    updatedAt: r?.updatedAt ?? r?.updated_at ?? r?.mtime ?? null,
    status: r?.workflowStatus ?? r?.status ?? null,
    comment: r?.comment ?? r?.bemerkungen ?? r?.notes ?? r?.note ?? r?.workDone ?? r?.issues ?? null,
    kostenstelle: r?.kostenstelle ?? null
  };
  return JSON.stringify(lite);
}
function inferIdStable(kind: Kind, projectKey: string, r: any): string {
  const explicit = String(r?.id || r?.opId || r?.uuid || r?.docId || "").trim();
  if (explicit) return explicit;
  const base = `${kind}::${projectKey}::${stableStringifyLite(r)}`;
  return `h_${hash32(base)}`;
}

/** =========================================================
 * FS-key resolver
 * ======================================================= */
function resolveProjectFsKeyForInbox(opts: {
  project: Project;
  codeMap: Record<string, string>;
}): {
  fsKey: string;
  ba?: string;
} {
  const p = opts.project;
  const projectId = String((p as any)?.id || "").trim();
  const candidate = String(opts.codeMap?.[projectId] || "").trim() || String((p as any)?.code || (p as any)?.projectCode || "").trim() || String((p as any)?.baustellenNummer || (p as any)?.number || "").trim() || String(projectId || "").trim();
  const ba = extractBaCode(candidate) || "";
  const baOk = looksLikeProjectCode(ba);
  const fallback = String(computeProjectFsKey(p) || "").trim();
  const fsKey = (baOk ? ba : fallback).trim();
  if (!fsKey) {
    return {
      fsKey: `local-${projectId || "unknown"}`,
      ba: baOk ? ba : undefined
    };
  }
  return {
    fsKey,
    ba: baOk ? ba : undefined
  };
}

/** =========================================================
 * Email parsing helpers
 * ======================================================= */
function splitEmails(v: any): string[] {
  const s = String(v ?? "").trim();
  if (!s) return [];
  const parts = s.split(/[;, \n\r\t]+/g).map(x => x.trim()).filter(Boolean);
  const ok = parts.filter(x => x.includes("@"));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of ok) {
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** =========================================================
 * Normalize file metas
 * ======================================================= */
function inferMimeFromUri(uri: string) {
  const u = String(uri || "").toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".heic") || u.includes("heic")) return "image/heic";
  if (u.endsWith(".heif") || u.includes("heif")) return "image/heif";
  if (u.endsWith(".pdf")) return "application/pdf";
  return "image/jpeg";
}
function normalizeFileMetaArray(input: any): Array<{
  uri: string;
  name?: string;
  type?: string;
}> {
  const arr = Array.isArray(input) ? input : [];
  const out: Array<{
    uri: string;
    name?: string;
    type?: string;
  }> = [];
  for (const it of arr) {
    if (!it) continue;
    if (typeof it === "string") {
      const uri = it.trim();
      if (!uri) continue;
      out.push({
        uri,
        name: `file_${Date.now()}.jpg`,
        type: inferMimeFromUri(uri)
      });
      continue;
    }
    const uri = String(it?.uri || it?.url || it?.path || "").trim();
    if (!uri) continue;
    out.push({
      uri,
      name: it?.name || it?.filename || `file_${Date.now()}.jpg`,
      type: it?.type || it?.mime || it?.mimeType || inferMimeFromUri(uri)
    });
  }
  const seen = new Set<string>();
  return out.filter(f => {
    const u = String(f?.uri || "");
    if (!u) return false;
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}
function toYmd(v: any) {
  const s = String(v ?? "").trim();
  if (s.length >= 10) return s.slice(0, 10);
  return s || new Date().toISOString().slice(0, 10);
}

function asFiniteNumber(value: any): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value ?? "").trim().replace(/\s/g, "");
  if (!raw) return 0;

  const normalized =
    raw.includes(",") && raw.includes(".")
      ? raw.lastIndexOf(",") > raw.lastIndexOf(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "")
      : raw.replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveBusinessDocument(raw: any) {
  const nested =
    (raw?.doc && typeof raw.doc === "object" ? raw.doc : null) ||
    (raw?.payload?.doc && typeof raw.payload.doc === "object" ? raw.payload.doc : null) ||
    (raw?.payload?.row && typeof raw.payload.row === "object" ? raw.payload.row : null) ||
    (raw?.row && typeof raw.row === "object" ? raw.row : null) ||
    {};

  return {
    ...(raw && typeof raw === "object" ? raw : {}),
    ...nested,
  };
}

function resolveBusinessRows(document: any): PdfRow[] {
  const source = Array.isArray(document?.rows)
    ? document.rows
    : Array.isArray(document?.items)
      ? document.items
      : Array.isArray(document?.positions)
        ? document.positions
        : Array.isArray(document?.lines)
          ? document.lines
          : [];

  return source.map((row: any, index: number) => {
    const qty = asFiniteNumber(
      row?.qty ??
      row?.quantity ??
      row?.menge ??
      row?.ergebnis ??
      row?.result
    );
    const ep = asFiniteNumber(
      row?.ep ??
      row?.preis ??
      row?.unitPrice ??
      row?.finalUnitPrice ??
      row?.rlcKiUnitPrice
    );
    const explicitTotal = asFiniteNumber(
      row?.gp ??
      row?.gesamt ??
      row?.total ??
      row?.rlcKiTotal
    );

    return {
      pos: String(
        row?.pos ??
        row?.position ??
        row?.posNr ??
        row?.lvPos ??
        row?.nr ??
        index + 1
      ),
      text: String(
        row?.text ??
        row?.kurztext ??
        row?.description ??
        row?.bezeichnung ??
        row?.title ??
        ""
      ),
      unit: String(row?.unit ?? row?.einheit ?? row?.me ?? ""),
      qty,
      ep,
      gp: explicitTotal || qty * ep,
      formula: String(row?.formula ?? row?.formel ?? row?.rechenansatz ?? ""),
    };
  });
}

function sanitizeBusinessPdfPart(value: any, fallback: string) {
  return String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback;
}

async function exportBusinessInboxPdf(params: {
  item: InboxItem;
  projectFsKey: string;
  hintDate: string;
  shortId: string;
}) {
  const { item, projectFsKey, hintDate, shortId } = params;
  const document = resolveBusinessDocument(item.raw);
  const rows = resolveBusinessRows(document);
  const calculatedNet = rows.reduce(
    (sum, row) => sum + asFiniteNumber(row.gp),
    0
  );
  const sourceTotals =
    document?.totals && typeof document.totals === "object"
      ? document.totals
      : {};

  const netto = asFiniteNumber(
    sourceTotals?.netto ??
    sourceTotals?.totalNet ??
    document?.nettoFinal ??
    document?.netto ??
    calculatedNet
  );
  const mwstPct = asFiniteNumber(
    sourceTotals?.mwstPct ??
    sourceTotals?.mwstRate ??
    document?.mwstPct ??
    document?.mwstRate ??
    19
  );
  const mwstValue = asFiniteNumber(
    sourceTotals?.mwstValue ??
    sourceTotals?.steuer ??
    sourceTotals?.tax ??
    document?.mwstValue ??
    document?.mwst ??
    netto * mwstPct / 100
  );
  const brutto = asFiniteNumber(
    sourceTotals?.brutto ??
    sourceTotals?.totalGross ??
    document?.brutto ??
    document?.betrag ??
    netto + mwstValue
  );

  let type: PdfDocType;
  let title: string;
  let documentNumber = "";
  let fileBase = "";

  if (item.kind === "ANGEBOT") {
    type = "ANGEBOT";
    title = "Angebot";
    documentNumber = String(
      document?.angebotNr ??
      document?.offerNo ??
      document?.number ??
      document?.nr ??
      ""
    );
    fileBase = sanitizeBusinessPdfPart(
      documentNumber || document?.angebotTitle,
      `Angebot_${hintDate}_${shortId}`
    );
  } else if (item.kind === "RECHNUNG") {
    const isFinal = /schluss/i.test(
      String(document?.documentType || document?.type || document?.title || "")
    );
    type = isFinal ? "SCHLUSSRECHNUNG" : "RECHNUNG";
    title = isFinal ? "Schlussrechnung" : "Rechnung";
    documentNumber = String(
      document?.rechnungNr ??
      document?.invoiceNo ??
      document?.number ??
      document?.nr ??
      ""
    );
    fileBase = sanitizeBusinessPdfPart(
      documentNumber,
      `${title}_${hintDate}_${shortId}`
    );
  } else if (item.kind === "ABSCHLAGSRECHNUNG") {
    type = "ABSCHLAGSRECHNUNG";
    title = "Abschlagsrechnung";
    documentNumber = String(
      document?.abschlagNr ??
      document?.nummer ??
      document?.number ??
      document?.nr ??
      ""
    );
    fileBase = sanitizeBusinessPdfPart(
      documentNumber,
      `Abschlagsrechnung_${hintDate}_${shortId}`
    );
  } else {
    type = "MENGENERMITTLUNG";
    title = "Mengenermittlung";
    documentNumber = String(
      document?.mengenNr ??
      document?.number ??
      document?.nr ??
      ""
    );
    fileBase = sanitizeBusinessPdfPart(
      document?.title || documentNumber,
      `Mengenermittlung_${hintDate}_${shortId}`
    );
  }

  const output = await buildDocumentPdf({
    type,
    projectCode: projectFsKey,
    fileName: `${fileBase}.pdf`,
    title,
    subTitle: String(
      document?.subTitle ||
      document?.status ||
      document?.workflowStatus ||
      ""
    ),
    docNo: documentNumber,
    date: toYmd(document?.date || document?.datum || hintDate),
    period: String(
      document?.period ||
      document?.leistungszeitraum ||
      ""
    ),
    customer: {
      name: String(
        document?.customerName ||
        document?.clientName ||
        document?.auftraggeber ||
        document?.customer?.name ||
        ""
      ),
      address: String(
        document?.customerAddress ||
        document?.address ||
        document?.customer?.address ||
        ""
      ),
      email: String(document?.customerEmail || document?.email || ""),
      phone: String(document?.customerPhone || document?.phone || ""),
    },
    bank: {
      bank: String(document?.bank || ""),
      iban: String(document?.iban || ""),
      bic: String(document?.bic || ""),
      owner: String(document?.owner || ""),
      steuerNr: String(document?.steuerNr || ""),
      ustId: String(document?.ustId || ""),
      zahlungsziel: String(document?.zahlungsziel || ""),
    },
    rows,
    totals:
      type === "MENGENERMITTLUNG"
        ? { netto }
        : {
            netto,
            rabattPct: asFiniteNumber(document?.rabattPct),
            rabattValue: asFiniteNumber(document?.rabattValue),
            zuschlagPct: asFiniteNumber(document?.zuschlagPct),
            zuschlagValue: asFiniteNumber(document?.zuschlagValue),
            mwstPct,
            mwstValue,
            brutto,
            bezahlt: asFiniteNumber(document?.bezahlt),
            rest: asFiniteNumber(document?.rest),
          },
    note: String(document?.note || document?.bemerkungen || ""),
    extraBlocks: [
      {
        title: "Projekt",
        lines: [
          `Projekt: ${item.projectTitle || projectFsKey}`,
          `Projektcode: ${projectFsKey}`,
        ],
      },
    ],
    showFormulaColumn: type === "MENGENERMITTLUNG",
    shareAfterCreate: false,
  });

  return {
    pdfUri: output.pdfUri,
    fileName: `${fileBase}.pdf`,
    date: toYmd(document?.date || document?.datum || hintDate),
    attachments: [output.pdfUri],
    documentType: type,
    title,
  };
}

function bautagebuchInboxKeys(projectKey: string) {
  return [`rlc_mobile_inbox_bautagebuch:${projectKey}`];
}
function angebotInboxKeys(projectKey: string) {
  return [`rlc_mobile_inbox_angebot:${projectKey}`];
}
function rechnungInboxKeys(projectKey: string) {
  return [`rlc_mobile_inbox_rechnung:${projectKey}`];
}
function abschlagInboxKeys(projectKey: string) {
  return [`rlc_mobile_inbox_abschlag:${projectKey}`];
}
function mengenInboxKeys(projectKey: string) {
  return [`rlc_mobile_inbox_mengen:${projectKey}`];
}
function kalkulationInboxKeys(projectKey: string) {
  return [`rlc_mobile_inbox_kalkulation:${projectKey}`];
}
export default function InboxScreen({
  navigation
}: Props) {
  const [mode, setMode] = useState<"SERVER_SYNC" | "NUR_APP">("SERVER_SYNC");
  const [loading, setLoading] = useState(false);
  const [syncing] = useState(false);
  const [, setProjects] = useState<Project[]>([]);
  const [, setCodeMap] = useState<Record<string, string>>({});
  const [items, setItems] = useState<InboxItem[]>([]);
  const [tab, setTab] = useState<Kind>("REGIE");
  const reqId = useRef(0);
  const readMode = useCallback(async (): Promise<"SERVER_SYNC" | "NUR_APP"> => {
    try {
      const m = (await AsyncStorage.getItem(KEY_MODE)) as any;
      if (m === "NUR_APP" || m === "SERVER_SYNC") {
        setMode(m);
        return m;
      }
    } catch {}
    setMode("SERVER_SYNC");
    return "SERVER_SYNC";
  }, []);
  const enforceNurApp = useCallback(async () => {
    const mNow = await readMode();
    if (mNow !== "NUR_APP") {
      Alert.alert("Inbox (Offline)", "Diese Inbox ist nur für NUR_APP (offline). In SERVER_SYNC bitte Eingang / Prüfung verwenden.");
      navigation.goBack();
      return false;
    }
    return true;
  }, [navigation, readMode]);
  const loadProjects = useCallback(async (_mNow: "SERVER_SYNC" | "NUR_APP") => {
    const local = (await loadJson<LocalProject[]>(KEY_LOCAL_PROJECTS)) || [];
    const arr: Project[] = local.map(lp => ({
      id: lp.id,
      name: lp.name,
      code: lp.code,
      baustellenNummer: lp.baustellenNummer,
      ort: lp.ort,
      kunde: lp.kunde
    })) as any;
    setProjects(arr);
    return arr;
  }, []);
  const loadInbox = useCallback(async () => {
    const my = ++reqId.current;
    setLoading(true);
    try {
      const ok = await enforceNurApp();
      if (!ok) return;
      const cm = await loadCodeMap();
      setCodeMap(cm || {});
      const proj = await loadProjects("NUR_APP");
      const out: InboxItem[] = [];
      const seen = new Set<string>();
      for (const p of proj) {
        const projectId = String((p as any)?.id || "").trim();
        if (!projectId) continue;
        const {
          fsKey,
          ba
        } = resolveProjectFsKeyForInbox({
          project: p,
          codeMap: cm || {}
        });
        const projectKey = fsKey;
        const projectTitle = titleOf(p);
        const [regieInbox, lsInbox, photosInbox, tagesberichtInbox, bautagebuchInbox, angebotInbox, rechnungInbox, abschlagInbox, mengenInbox, kalkulationInbox] = await Promise.all([loadArrayFromFirstKey(regieInboxKeys(projectKey)), loadArrayFromFirstKey(lsInboxKeys(projectKey)), loadArrayFromFirstKey(photosInboxKeys(projectKey)), loadArrayFromFirstKey(tagesberichtInboxKeys(projectKey)), loadArrayFromFirstKey(bautagebuchInboxKeys(projectKey)), loadArrayFromFirstKey(angebotInboxKeys(projectKey)), loadArrayFromFirstKey(rechnungInboxKeys(projectKey)), loadArrayFromFirstKey(abschlagInboxKeys(projectKey)), loadArrayFromFirstKey(mengenInboxKeys(projectKey)), loadArrayFromFirstKey(kalkulationInboxKeys(projectKey))]);
        for (const r of regieInbox || []) {
          const st = inferStatus(r);
          const ts = pickTs(r);
          const id = inferIdStable("REGIE", projectKey, r);
          const dedupeKey = `REGIE:${projectKey}:${id}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          out.push({
            kind: "REGIE",
            projectId,
            projectTitle,
            projectCode: ba,
            projectKey,
            id,
            title: inferRowTitle("REGIE", r),
            status: st,
            createdAt: ts.createdAt,
            updatedAt: ts.updatedAt,
            raw: r
          });
        }
        for (const r of lsInbox || []) {
          const st = inferStatus(r);
          const ts = pickTs(r);
          const id = inferIdStable("LS", projectKey, r);
          const dedupeKey = `LS:${projectKey}:${id}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          out.push({
            kind: "LS",
            projectId,
            projectTitle,
            projectCode: ba,
            projectKey,
            id,
            title: inferRowTitle("LS", r),
            status: st,
            createdAt: ts.createdAt,
            updatedAt: ts.updatedAt,
            raw: r
          });
        }
        for (const r of photosInbox || []) {
          const st = inferStatus(r);
          const ts = pickTs(r);
          const id = inferIdStable("PHOTOS", projectKey, r);
          const dedupeKey = `PHOTOS:${projectKey}:${id}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          out.push({
            kind: "PHOTOS",
            projectId,
            projectTitle,
            projectCode: ba,
            projectKey,
            id,
            title: inferRowTitle("PHOTOS", r),
            status: st,
            createdAt: ts.createdAt,
            updatedAt: ts.updatedAt,
            raw: r
          });
        }
        const pushGeneric = (kind: Kind, arr: any[]) => {
          for (const r of arr || []) {
            const st = inferStatus(r);
            const ts = pickTs(r);
            const id = inferIdStable(kind, projectKey, r);
            const dedupeKey = `${kind}:${projectKey}:${id}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            out.push({
              kind,
              projectId,
              projectTitle,
              projectCode: ba,
              projectKey,
              id,
              title: inferRowTitle(kind, r),
              status: st,
              createdAt: ts.createdAt,
              updatedAt: ts.updatedAt,
              raw: r
            });
          }
        };
        pushGeneric("BAUTAGEBUCH", bautagebuchInbox);
        pushGeneric("ANGEBOT", angebotInbox);
        pushGeneric("RECHNUNG", rechnungInbox);
        pushGeneric("ABSCHLAGSRECHNUNG", abschlagInbox);
        pushGeneric("MENGEN", mengenInbox);
        pushGeneric("KALKULATION", kalkulationInbox);
        for (const r of tagesberichtInbox || []) {
          const st = inferStatus(r);
          const ts = pickTs(r);
          const id = inferIdStable("TAGESBERICHT", projectKey, r);
          const dedupeKey = `TAGESBERICHT:${projectKey}:${id}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          out.push({
            kind: "TAGESBERICHT",
            projectId,
            projectTitle,
            projectCode: ba,
            projectKey,
            id,
            title: inferRowTitle("TAGESBERICHT", r),
            status: st,
            createdAt: ts.createdAt,
            updatedAt: ts.updatedAt,
            raw: r
          });
        }
      }
      out.sort((a, b) => {
        const ta = a.updatedAt ?? a.createdAt ?? 0;
        const tb = b.updatedAt ?? b.createdAt ?? 0;
        return tb - ta;
      });
      if (my === reqId.current) setItems(out);
    } catch (e: any) {
      Alert.alert("Inbox", e?.message || "Inbox konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [enforceNurApp, loadProjects]);
  useEffect(() => {
    (async () => {
      const ok = await enforceNurApp();
      if (!ok) return;
      await loadInbox();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const counts = useMemo(() => {
    const regie = items.filter(x => x.kind === "REGIE").length;
    const ls = items.filter(x => x.kind === "LS").length;
    const photos = items.filter(x => x.kind === "PHOTOS").length;
    const tagesbericht = items.filter(x => x.kind === "TAGESBERICHT").length;
    const bautagebuch = items.filter(x => x.kind === "BAUTAGEBUCH").length;
    const angebot = items.filter(x => x.kind === "ANGEBOT").length;
    const rechnung = items.filter(x => x.kind === "RECHNUNG").length;
    const abschlag = items.filter(x => x.kind === "ABSCHLAGSRECHNUNG").length;
    const mengen = items.filter(x => x.kind === "MENGEN").length;
    const kalkulation = items.filter(x => x.kind === "KALKULATION").length;
    return {
      regie,
      ls,
      photos,
      tagesbericht,
      bautagebuch,
      angebot,
      rechnung,
      abschlag,
      mengen,
      kalkulation
    };
  }, [items]);
  const categoryItems: RlcCategoryItem[] = [{
    key: "REGIE",
    label: "Regie",
    count: counts.regie,
    icon: "clipboard-outline"
  }, {
    key: "LS",
    label: "Lieferscheine",
    count: counts.ls,
    icon: "cube-outline"
  }, {
    key: "PHOTOS",
    label: "Fotos",
    count: counts.photos,
    icon: "camera-outline"
  }, {
    key: "TAGESBERICHT",
    label: "Tagesberichte",
    count: counts.tagesbericht,
    icon: "newspaper-outline"
  }, {
    key: "BAUTAGEBUCH",
    label: "Bautagebuch",
    count: counts.bautagebuch,
    icon: "book-outline"
  }, {
    key: "ANGEBOT",
    label: "Angebote",
    count: counts.angebot,
    icon: "pricetag-outline"
  }, {
    key: "RECHNUNG",
    label: "Rechnungen",
    count: counts.rechnung,
    icon: "receipt-outline"
  }, {
    key: "ABSCHLAGSRECHNUNG",
    label: "Abschläge",
    count: counts.abschlag,
    icon: "document-text-outline"
  }, {
    key: "MENGEN",
    label: "Mengen",
    count: counts.mengen,
    icon: "resize-outline"
  }, {
    key: "KALKULATION",
    label: "Kalkulation",
    count: counts.kalkulation,
    icon: "calculator-outline"
  }];
  const filteredItems = useMemo(() => {
    if (tab === "REGIE") return items.filter(x => x.kind === "REGIE");
    if (tab === "LS") return items.filter(x => x.kind === "LS");
    if (tab === "PHOTOS") return items.filter(x => x.kind === "PHOTOS");
    if (tab === "TAGESBERICHT") return items.filter(x => x.kind === "TAGESBERICHT");
    if (tab === "BAUTAGEBUCH") return items.filter(x => x.kind === "BAUTAGEBUCH");
    if (tab === "ANGEBOT") return items.filter(x => x.kind === "ANGEBOT");
    if (tab === "RECHNUNG") return items.filter(x => x.kind === "RECHNUNG");
    if (tab === "ABSCHLAGSRECHNUNG") return items.filter(x => x.kind === "ABSCHLAGSRECHNUNG");
    if (tab === "MENGEN") return items.filter(x => x.kind === "MENGEN");
    return items.filter(x => x.kind === "KALKULATION");
  }, [items, tab]);
  const openProjectHome = useCallback((it: InboxItem) => {
    navigation.navigate("ProjectHome" as any, {
      projectId: it.projectId,
      projectCode: it.projectCode || it.projectKey,
      title: it.projectTitle
    });
  }, [navigation]);
  function openEditFromInbox(it: InboxItem) {
    const editId = String(it.raw?.id || it.id || "").trim();
    if (!editId) return Alert.alert("Bearbeiten", "Dokument-ID fehlt.");
    if (it.kind === "REGIE") {
      navigation.navigate("Regie" as any, {
        projectId: it.projectId,
        projectCode: it.projectCode || it.projectKey,
        title: it.projectTitle,
        editId,
        fromInbox: true
      } as any);
      return;
    }
    if (it.kind === "LS") {
      navigation.navigate("Lieferschein" as any, {
        projectId: it.projectId,
        projectCode: it.projectCode || it.projectKey,
        title: it.projectTitle,
        editId,
        fromInbox: true
      } as any);
      return;
    }
    if (it.kind === "TAGESBERICHT") {
      navigation.navigate("TagesberichtEditor" as any, {
        projectId: it.projectId,
        projectCode: it.projectCode || it.projectKey,
        title: it.projectTitle,
        tagesberichtId: editId,
        fromInbox: true
      } as any);
      return;
    }
    if (it.kind === "BAUTAGEBUCH") {
      navigation.navigate("Bautagebuch" as any, {
        projectId: it.projectId,
        projectCode: it.projectCode || it.projectKey,
        title: it.projectTitle
      });
      return;
    }
    if (it.kind === "ANGEBOT") {
      navigation.navigate("AngebotEditor" as any, {
        projectId: it.projectId,
        projectCode: it.projectCode || it.projectKey,
        editId,
        inboxSnapshot: it.raw,
        fromInbox: true
      });
      return;
    }
    if (it.kind === "RECHNUNG") {
      navigation.navigate("RechnungEditor" as any, {
        projectId: it.projectId,
        projectCode: it.projectCode || it.projectKey,
        editId,
        inboxSnapshot: it.raw,
        fromInbox: true
      });
      return;
    }
    if (it.kind === "ABSCHLAGSRECHNUNG") {
      const snapshot = it.raw?.doc || it.raw?.payload?.doc || it.raw?.payload?.row || it.raw || {};
      const basisId = String(snapshot?.rechnungId || snapshot?.basisRechnungId || snapshot?.invoiceId || snapshot?.rechnung?.id || snapshot?.basisRechnung?.id || snapshot?.rechnungNr || snapshot?.basisRechnungNr || "").trim();
      navigation.navigate("AbschlagEditor" as any, {
        projectId: it.projectId,
        projectCode: it.projectCode || it.projectKey,
        title: "Abschlagsrechnung",
        rechnungId: basisId,
        abschlagNr: snapshot?.abschlagNr || snapshot?.nummer || snapshot?.nr || it.raw?.abschlagNr,
        editId: editId,
        inboxSnapshot: snapshot,
        fromInbox: true
      });
      return;
    }
    if (it.kind === "MENGEN") {
      navigation.navigate("MengenEditor" as any, {
        projectId: it.projectId,
        projectCode: it.projectCode || it.projectKey,
        editId,
        inboxSnapshot: it.raw,
        fromInbox: true
      });
      return;
    }
    if (it.kind === "KALKULATION") {
      navigation.navigate("KiCalculation" as any, {
        projectId: it.projectId,
        projectCode: it.projectCode || it.projectKey,
        editId,
        inboxSnapshot: it.raw,
        fromInbox: true
      });
      return;
    }
    navigation.navigate("PhotosNotes" as any, {
      projectId: it.projectId,
      projectCode: it.projectCode || it.projectKey,
      title: it.projectTitle,
      editId,
      fromInbox: true
    } as any);
  }
  const onPdfEmail = useCallback(async (it: InboxItem, action: "PDF" | "EMAIL") => {
    try {
      const fsKey = String(it.projectKey || it.projectCode || "").trim();
      if (!fsKey) throw new Error("Projekt-Key fehlt.");
      const hintDate = String(it.raw?.date || it.raw?.datum || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
      const shortId = String(it.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "doc";
      const roles = (await getProjectRoles(fsKey)) || (await getProjectRoles(String(it.projectId || "").trim())) || null;
      const to = splitEmails((roles as any)?.emails?.bauleiter);
      const cc = splitEmails((roles as any)?.emails?.buero);
      const bcc = splitEmails((roles as any)?.emails?.extern);
      const sendMail = async (out: {
        pdfUri: string;
        fileName: string;
        date: string;
        attachments?: string[];
      }, body: string) => {
        const rawAtt = Array.isArray(out.attachments) && out.attachments.length ? out.attachments : [out.pdfUri];
        const att = rawAtt.filter(u => typeof u === "string" && u.startsWith("file://"));
        if (!att.length) throw new Error("Kein gültiger PDF-Anhang (file://).");
        await emailPdf({
          subject: out.fileName,
          body,
          attachments: att,
          to: to.length ? to : undefined,
          cc: cc.length ? cc : undefined,
          bcc: bcc.length ? bcc : undefined
        });
      };
      const r = it.raw || {};
      const poolA = normalizeFileMetaArray(r?.files);
      const poolB = normalizeFileMetaArray(r?.attachments);
      const poolC = normalizeFileMetaArray(r?.photos);
      const fromRows = Array.isArray(r?.rows) ? normalizeFileMetaArray((r.rows || []).flatMap((x: any) => x?.photos || [])) : [];
      const fromLines = Array.isArray(r?.lines) ? normalizeFileMetaArray((r.lines || []).flatMap((x: any) => x?.photos || [])) : [];
      const mergedPool = normalizeFileMetaArray([...poolA, ...poolB, ...poolC, ...fromRows, ...fromLines]);
      const mainUri = String(r?.imageUri || r?.imageMeta?.uri || "").trim();
      const mainArr = mainUri ? normalizeFileMetaArray([{
        uri: mainUri,
        name: "photo_main.jpg",
        type: inferMimeFromUri(mainUri)
      }]) : [];
      const filesForPhotos = normalizeFileMetaArray([...mainArr, ...mergedPool]);
      const dateYmd = toYmd(r?.date || r?.datum || r?.createdAt || r?.timestamp);
      const text = String(r?.rows?.[0]?.comment || r?.lines?.[0]?.taetigkeit || r?.workDone || r?.comment || r?.text || r?.leistung || "").trim() || String(r?.bemerkungen || r?.notes || r?.note || r?.issues || "").trim();
      const hours = (r?.rows?.[0]?.hours ?? r?.lines?.[0]?.stunden ?? r?.hours ?? undefined) as any;
      const note = String(r?.bemerkungen || r?.notes || r?.note || r?.issues || "").trim();
      const rowForExporter = it.kind === "REGIE" ? {
        kind: "REGIE",
        payload: {
          date: dateYmd,
          text,
          hours,
          note,
          files: mergedPool,
          row: {
            ...r,
            date: dateYmd,
            files: mergedPool,
            attachments: Array.isArray(r?.attachments) ? normalizeFileMetaArray(r.attachments) : mergedPool,
            photos: Array.isArray(r?.photos) ? normalizeFileMetaArray(r.photos) : mergedPool
          }
        }
      } : it.kind === "LS" ? {
        kind: "LIEFERSCHEIN",
        payload: {
          date: dateYmd,
          text,
          note,
          files: mergedPool,
          row: {
            ...r,
            date: dateYmd,
            files: mergedPool,
            attachments: Array.isArray(r?.attachments) ? normalizeFileMetaArray(r.attachments) : mergedPool
          }
        }
      } : it.kind === "TAGESBERICHT" ? {
        kind: "TAGESBERICHT",
        payload: {
          date: dateYmd,
          text,
          note,
          files: mergedPool,
          row: {
            ...r,
            date: dateYmd,
            reportType: "TAGESBERICHT",
            docType: "TAGESBERICHT",
            files: mergedPool,
            attachments: Array.isArray(r?.attachments) ? normalizeFileMetaArray(r.attachments) : mergedPool,
            photos: Array.isArray(r?.photos) ? normalizeFileMetaArray(r.photos) : mergedPool
          }
        }
      } : {
        kind: "PHOTOS",
        payload: {
          date: dateYmd,
          text,
          note,
          files: filesForPhotos,
          row: {
            ...r,
            date: dateYmd,
            files: filesForPhotos,
            attachments: Array.isArray(r?.attachments) ? normalizeFileMetaArray(r.attachments) : filesForPhotos,
            photos: Array.isArray(r?.photos) ? normalizeFileMetaArray(r.photos) : filesForPhotos
          }
        }
      };
      if (
        it.kind === "ANGEBOT" ||
        it.kind === "RECHNUNG" ||
        it.kind === "ABSCHLAGSRECHNUNG" ||
        it.kind === "MENGEN"
      ) {
        const out = await exportBusinessInboxPdf({
          item: it,
          projectFsKey: fsKey,
          hintDate,
          shortId,
        });
        if (!out?.pdfUri) {
          throw new Error("PDF Export fehlgeschlagen (kein pdfUri).");
        }

        if (action === "EMAIL") {
          await sendMail(
            out,
            `${out.title} ${fsKey} (${out.date})`
          );
        } else {
          navigation.navigate("PdfViewer" as any, {
            uri: out.pdfUri,
            title: out.fileName,
            projectId: it.projectId,
            projectCode: it.projectCode || it.projectKey,
            documentType: out.documentType,
          });
        }
        return;
      }
      if (Platform.OS === "web") {
        if (it.kind === "REGIE") {
          await exportRegiePdfToProject({
            projectFsKey: fsKey,
            projectTitle: it.projectTitle,
            row: rowForExporter,
            filenameHint: `Regiebericht_${hintDate}_${shortId}`
          });
          Alert.alert("PDF", "Browser: Bitte im Druckdialog als PDF speichern.");
          return;
        }
        if (it.kind === "LS") {
          await exportLieferscheinPdfToProject({
            projectFsKey: fsKey,
            projectTitle: it.projectTitle,
            row: rowForExporter,
            filenameHint: `Lieferschein_${hintDate}_${shortId}`
          });
          Alert.alert("PDF", "Browser: Bitte im Druckdialog als PDF speichern.");
          return;
        }
        if (it.kind === "TAGESBERICHT") {
          await exportTagesberichtPdfToProject({
            projectFsKey: fsKey,
            projectTitle: it.projectTitle,
            row: rowForExporter,
            filenameHint: `Tagesbericht_${hintDate}_${shortId}`
          });
          Alert.alert("PDF", "Browser: Bitte im Druckdialog als PDF speichern.");
          return;
        }
        await exportPhotosPdfToProject({
          projectFsKey: fsKey,
          projectTitle: it.projectTitle,
          row: rowForExporter,
          filenameHint: `Fotos_${hintDate}_${shortId}`
        });
        Alert.alert("PDF", "Browser: Bitte im Druckdialog als PDF speichern.");
        return;
      }
      if (it.kind === "REGIE") {
        const out = await exportRegiePdfToProject({
          projectFsKey: fsKey,
          projectTitle: it.projectTitle,
          row: rowForExporter,
          filenameHint: `Regiebericht_${hintDate}_${shortId}`
        });
        if (!out?.pdfUri) throw new Error("PDF Export fehlgeschlagen (kein pdfUri).");
        if (action === "EMAIL") await sendMail(out as any, `Regiebericht ${fsKey} (${(out as any).date})`);else navigation.navigate("PdfViewer" as any, {
          uri: out.pdfUri,
          title: out.fileName
        });
        return;
      }
      if (it.kind === "LS") {
        const out = await exportLieferscheinPdfToProject({
          projectFsKey: fsKey,
          projectTitle: it.projectTitle,
          row: rowForExporter,
          filenameHint: `Lieferschein_${hintDate}_${shortId}`
        });
        if (!out?.pdfUri) throw new Error("PDF Export fehlgeschlagen (kein pdfUri).");
        if (action === "EMAIL") await sendMail(out as any, `Lieferschein ${fsKey} (${(out as any).date})`);else navigation.navigate("PdfViewer" as any, {
          uri: out.pdfUri,
          title: out.fileName
        });
        return;
      }
      if (it.kind === "TAGESBERICHT") {
        const out = await exportTagesberichtPdfToProject({
          projectFsKey: fsKey,
          projectTitle: it.projectTitle,
          row: rowForExporter,
          filenameHint: `Tagesbericht_${hintDate}_${shortId}`
        });
        if (!out?.pdfUri) throw new Error("PDF Export fehlgeschlagen (kein pdfUri).");
        if (action === "EMAIL") await sendMail(out as any, `Tagesbericht ${fsKey} (${(out as any).date})`);else navigation.navigate("PdfViewer" as any, {
          uri: out.pdfUri,
          title: out.fileName
        });
        return;
      }
      const out = await exportPhotosPdfToProject({
        projectFsKey: fsKey,
        projectTitle: it.projectTitle,
        row: rowForExporter,
        filenameHint: `Fotos_${hintDate}_${shortId}`
      });
      if (!out?.pdfUri) throw new Error("PDF Export fehlgeschlagen (kein pdfUri).");
      if (action === "EMAIL") await sendMail(out as any, `Fotodokumentation ${fsKey} (${(out as any).date})`);else navigation.navigate("PdfViewer" as any, {
        uri: out.pdfUri,
        title: out.fileName
      });
    } catch (e: any) {
      Alert.alert(action === "EMAIL" ? "E-Mail" : "PDF", e?.message || "Export fehlgeschlagen.");
    }
  }, []);
  function renderRow({
    item
  }: {
    item: InboxItem;
  }) {
    const accent = item.kind === "REGIE" ? COLORS.accent : item.kind === "LS" ? COLORS.accentDark : item.kind === "TAGESBERICHT" ? COLORS.accentDark : COLORS.text;
    const stColor = badgeColor(item.status);
    const ts = item.updatedAt ?? item.createdAt;
    const tsStr = ts ? new Date(ts).toLocaleString() : "";
    return <View style={s.rowCard}>
        <View style={s.rowTop}>
          <View style={[s.kindDot, {
          backgroundColor: accent
        }]} />
          <View style={s.rowTextWrap}>
            <Text style={s.rowTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={s.rowSub} numberOfLines={2}>
              {item.projectTitle}
              {item.projectCode ? ` • ${item.projectCode}` : ""}
              {tsStr ? ` • ${tsStr}` : ""}
            </Text>
          </View>

          <View style={[s.badge, {
          borderColor: stColor,
          backgroundColor: COLORS.card2
        }]}>
            <Text style={[s.badgeTxt, {
            color: stColor
          }]}>{badgeText(item.status)}</Text>
          </View>
        </View>

        <View style={s.rowActions}>
          <Pressable style={[s.btn, s.btnGhost]} onPress={() => openEditFromInbox(item)}>
            <Text style={[s.btnTxt, s.btnGhostTxt]}>Bearbeiten</Text>
          </Pressable>

          <Pressable style={[s.btn, s.btnGhost]} onPress={() => openProjectHome(item)}>
            <Text style={[s.btnTxt, s.btnGhostTxt]}>Zum Projekt</Text>
          </Pressable>

          <Pressable style={[s.btn, s.btnGhost]} onPress={() => onPdfEmail(item, "PDF")}>
            <Text style={[s.btnTxt, s.btnGhostTxt]}>PDF</Text>
          </Pressable>

          <Pressable style={s.btnPrimary} onPress={() => onPdfEmail(item, "EMAIL")}>
            <Text style={s.btnPrimaryTxt}>E-Mail</Text>
          </Pressable>
        </View>
      </View>;
  }
  return <SafeAreaView style={s.safe}>
      <View style={s.bg}>
        <FlatList style={s._inline1} ListHeaderComponent={<View style={s.headerCard}>
          <View style={s.headerRow}>
            <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
              <Text style={s.backTxt}>Zurück</Text>
            </Pressable>

            <View style={s.headerSpacer} />

            <View style={s.modePill}>
              <Text style={s.modeTxt}>{mode === "NUR_APP" ? "NUR_APP" : "SERVER"}</Text>
            </View>
          </View>

          <Text style={s.eyebrow}>RLC Bausoftware</Text>
          <Text style={s.h1}>Inbox (Offline)</Text>
          <Text style={s.sub}>
            Lokale Entwürfe und Offline-Dokumente ohne Server-Synchronisierung.
          </Text>
          <RlcCategoryGrid title="Übersicht" items={categoryItems} activeKey={tab} onPress={key => setTab(key as Kind)} onRefresh={loadInbox} />

          <View style={s.infoBox}>
            <Text style={s.infoTitle}>Hinweis</Text>
            <Text style={s.infoText}>
              Diese Inbox ist nur für NUR_APP (offline). Keine Server-Synchronisierung.
            </Text>
          </View>
              </View>} data={filteredItems} keyExtractor={x => `${x.kind}:${x.projectKey}:${x.id}`} renderItem={renderRow} contentContainerStyle={s.listContent} refreshControl={<RefreshControl refreshing={loading} onRefresh={loadInbox} tintColor={COLORS.accent} />} showsVerticalScrollIndicator={true} nestedScrollEnabled={true} scrollEnabled={true} keyboardShouldPersistTaps="handled" removeClippedSubviews={false} ListEmptyComponent={<View style={s.emptyWrap}>
              <View style={s.emptyCard}>
                <Text style={s.emptyTitle}>Keine offenen Einträge</Text>
                <Text style={s.emptyText}>
                  In dieser Kategorie sind aktuell keine Offline-Dokumente vorhanden.
                </Text>
              </View>
            </View>} />
      </View>
    </SafeAreaView>;
}
const s = createRlcStyles("InboxScreen", {
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  bg: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  headerCard: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10
  },
  headerSpacer: {
    flex: 1
  },
  backBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2
  },
  backTxt: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 13
  },
  modePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2
  },
  modeTxt: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 12
  },
  eyebrow: {
    color: COLORS.accentDark,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3
  },
  h1: {
    marginTop: 8,
    fontSize: 18,
    lineHeight: 27,
    fontWeight: "600",
    color: COLORS.text
  },
  sub: {
    marginTop: 8,
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 20
  },
  tabsRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card2
  },
  tabBtnActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent
  },
  tabTxt: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 13
  },
  tabTxtActive: {
    color: COLORS.textLight
  },
  tabCountPill: {
    minWidth: 28,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center"
  },
  tabCountPillActive: {
    backgroundColor: COLORS.accentDark,
    borderColor: COLORS.accentDark
  },
  tabCountTxt: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 12
  },
  tabCountTxtActive: {
    color: COLORS.textLight
  },
  actionsRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  actionBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.text
  },
  actionTxt: {
    color: COLORS.textLight,
    fontWeight: "600",
    fontSize: 13
  },
  infoBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  infoTitle: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 13
  },
  infoText: {
    marginTop: 6,
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 19,
    fontSize: 13
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 160,
    gap: 12
  },
  rowCard: {
    borderRadius: 14,
    padding: 15,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.text,
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: {
          width: 0,
          height: 6
        }
      },
      android: {
        elevation: 2
      },
      default: {}
    })
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10
  },
  rowTextWrap: {
    flex: 1
  },
  kindDot: {
    width: 10,
    height: 10,
    borderRadius: 14,
    marginTop: 5
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text
  },
  rowSub: {
    marginTop: 6,
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 18,
    fontSize: 13
  },
  badge: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start"
  },
  badgeTxt: {
    fontSize: 11,
    fontWeight: "600"
  },
  rowActions: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14
  },
  btnTxt: {
    fontWeight: "600",
    fontSize: 13
  },
  btnGhost: {
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  btnGhostTxt: {
    color: COLORS.text
  },
  btnPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accent
  },
  btnPrimaryTxt: {
    color: COLORS.textLight,
    fontWeight: "600",
    fontSize: 13
  },
  emptyWrap: {
    paddingTop: 4
  },
  emptyCard: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  emptyTitle: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 15
  },
  emptyText: {
    marginTop: 6,
    color: COLORS.sub,
    fontWeight: "600",
    lineHeight: 20,
    fontSize: 13
  },
  _inline1: {
    flex: 1
  }
});
