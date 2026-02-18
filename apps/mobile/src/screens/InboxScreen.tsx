// apps/mobile/src/screens/InboxScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  SafeAreaView,
  RefreshControl,
  Platform,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import {
  projectFsKey as computeProjectFsKey,
  looksLikeProjectCode,
  extractBaCode,
  Project,
} from "../lib/api";

// ✅ Team / Rollen (per prefill Email Versand Ansprechpartner)
import { getProjectRoles } from "../storage/projectMeta";

// ✅ PDF Export + Email (stabile, allineato con Regie/Lieferschein/Photos)
import {
  exportRegiePdfToProject,
  exportLieferscheinPdfToProject,
  exportPhotosPdfToProject,
  emailPdf,
} from "../lib/exporters/projectExport";

type Props = NativeStackScreenProps<RootStackParamList, "Inbox">;

/** AsyncStorage keys (aligned with ProjectsScreen/LoginScreen) */
const KEY_MODE = "rlc_mobile_mode";
const KEY_LOCAL_PROJECTS = "rlc_mobile_local_projects_v1";
const CODEMAP_KEY = "rlc_project_code_map_v1";

type WorkflowStatus = "DRAFT" | "EINGEREICHT" | "FREIGEGEBEN" | "ABGELEHNT";
type Kind = "REGIE" | "LS" | "PHOTOS";

type InboxItem = {
  kind: Kind;
  projectId: string;
  projectTitle: string;
  projectCode?: string; // BA-...
  projectKey: string; // FS key (BA-... o local-...)
  id: string; // stable id
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

function getBaForProject(
  map: Record<string, string>,
  projectId: string,
  fallback?: string
) {
  return extractBaCode(map?.[projectId] || fallback || "") || "";
}

/** keys used elsewhere (ProjectsScreen) */
function regieInboxKeys(projectKey: string) {
  return [`rlc_mobile_inbox_regie:${projectKey}`];
}
function lsInboxKeys(projectKey: string) {
  return [
    `rlc_mobile_inbox_lieferschein:${projectKey}`,
    `rlc_mobile_inbox_ls:${projectKey}`,
  ];
}
function photosInboxKeys(projectKey: string) {
  return [
    `rlc_mobile_inbox_photos:${projectKey}`,
    `rlc_mobile_inbox_photo:${projectKey}`,
    `rlc_mobile_inbox_photonotes:${projectKey}`,
    `rlc_mobile_inbox_photosnotes:${projectKey}`,
    `rlc_mobile_inbox_photos_notes:${projectKey}`,
    `rlc_mobile_inbox_fotos:${projectKey}`,
    `rlc_mobile_inbox_fotos_notizen:${projectKey}`,
  ];
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
  return (
    String((p as any)?.name || "").trim() ||
    String((p as any)?.number || (p as any)?.baustellenNummer || "").trim() ||
    String((p as any)?.code || "").trim() ||
    String((p as any)?.id || "").trim()
  );
}

function inferRowTitle(kind: Kind, r: any): string {
  const nr = String(
    r?.nr || r?.number || r?.regieNr || r?.lieferscheinNr || r?.id || ""
  )
    .trim()
    .slice(0, 18);

  const date =
    r?.datum || r?.date || r?.createdAt || r?.created_at || r?.timestamp;

  const dateStr =
    typeof date === "number"
      ? new Date(date).toLocaleDateString()
      : typeof date === "string"
      ? String(date).slice(0, 10)
      : "";

  const base = kind === "REGIE" ? "Regie" : kind === "LS" ? "Lieferschein" : "Photos";
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

function pickTs(r: any): { createdAt?: number; updatedAt?: number } {
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

  return { createdAt: toNum(c), updatedAt: toNum(u) };
}

function badgeText(st: WorkflowStatus) {
  if (st === "EINGEREICHT") return "E";
  if (st === "FREIGEGEBEN") return "F";
  if (st === "ABGELEHNT") return "A";
  return "D";
}

function badgeColor(st: WorkflowStatus) {
  if (st === "EINGEREICHT") return "#0B57D0";
  if (st === "FREIGEGEBEN") return "#1A7F37";
  if (st === "ABGELEHNT") return "#C33";
  return "rgba(11,23,32,0.55)";
}

/** =========================
 * ✅ Stable id
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
    comment: r?.comment ?? r?.bemerkungen ?? r?.notes ?? r?.note ?? null,
    kostenstelle: r?.kostenstelle ?? null,
  };
  return JSON.stringify(lite);
}
function inferIdStable(kind: Kind, projectKey: string, r: any): string {
  const explicit = String(r?.id || r?.opId || r?.uuid || "").trim();
  if (explicit) return explicit;
  const base = `${kind}::${projectKey}::${stableStringifyLite(r)}`;
  return `h_${hash32(base)}`;
}

/** =========================================================
 * ✅ FS-key resolver (GUARANTEES BA if possible)
 * ======================================================= */
function resolveProjectFsKeyForInbox(opts: {
  project: Project;
  codeMap: Record<string, string>;
}): { fsKey: string; ba?: string } {
  const p = opts.project;
  const projectId = String((p as any)?.id || "").trim();

  const candidate =
    String(opts.codeMap?.[projectId] || "").trim() ||
    String((p as any)?.code || (p as any)?.projectCode || "").trim() ||
    String((p as any)?.baustellenNummer || (p as any)?.number || "").trim() ||
    String(projectId || "").trim();

  const ba = extractBaCode(candidate) || "";
  const baOk = looksLikeProjectCode(ba);

  const fallback = String(computeProjectFsKey(p) || "").trim();

  const fsKey = (baOk ? ba : fallback).trim();
  if (!fsKey) {
    return { fsKey: `local-${projectId || "unknown"}`, ba: baOk ? ba : undefined };
  }
  return { fsKey, ba: baOk ? ba : undefined };
}

/** =========================================================
 * ✅ Email parsing helpers (multi-mail support)
 * ======================================================= */
function splitEmails(v: any): string[] {
  const s = String(v ?? "").trim();
  if (!s) return [];
  const parts = s
    .split(/[;, \n\r\t]+/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const ok = parts.filter((x) => x.includes("@"));

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
 * ✅ Normalize file metas (string uri -> {uri,name,type})
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

function normalizeFileMetaArray(
  input: any
): Array<{ uri: string; name?: string; type?: string }> {
  const arr = Array.isArray(input) ? input : [];
  const out: Array<{ uri: string; name?: string; type?: string }> = [];

  for (const it of arr) {
    if (!it) continue;
    if (typeof it === "string") {
      const uri = it.trim();
      if (!uri) continue;
      out.push({
        uri,
        name: `file_${Date.now()}.jpg`,
        type: inferMimeFromUri(uri),
      });
      continue;
    }
    const uri = String(it?.uri || it?.url || it?.path || "").trim();
    if (!uri) continue;
    out.push({
      uri,
      name: it?.name || it?.filename || `file_${Date.now()}.jpg`,
      type: it?.type || it?.mime || it?.mimeType || inferMimeFromUri(uri),
    });
  }

  // dedupe by uri
  const seen = new Set<string>();
  return out.filter((f) => {
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

export default function InboxScreen({ navigation }: Props) {
  const [mode, setMode] = useState<"SERVER_SYNC" | "NUR_APP">("SERVER_SYNC");
  const [loading, setLoading] = useState(false);
  const [syncing] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [codeMap, setCodeMap] = useState<Record<string, string>>({});
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

  // ✅ OFFLINE ONLY: Inbox exists only in NUR_APP
  const enforceNurApp = useCallback(async () => {
    const mNow = await readMode();
    if (mNow !== "NUR_APP") {
      Alert.alert(
        "Inbox (Offline)",
        "Diese Inbox ist nur für NUR_APP (offline). In SERVER_SYNC bitte Eingang / Prüfung verwenden."
      );
      navigation.goBack();
      return false;
    }
    return true;
  }, [navigation, readMode]);

  const loadProjects = useCallback(async (_mNow: "SERVER_SYNC" | "NUR_APP") => {
    // ✅ force local projects only
    const local = (await loadJson<LocalProject[]>(KEY_LOCAL_PROJECTS)) || [];
    const arr: Project[] = local.map((lp) => ({
      id: lp.id,
      name: lp.name,
      code: lp.code,
      baustellenNummer: lp.baustellenNummer,
      ort: lp.ort,
      kunde: lp.kunde,
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

        const { fsKey, ba } = resolveProjectFsKeyForInbox({
          project: p,
          codeMap: cm || {},
        });
        const projectKey = fsKey;
        const projectTitle = titleOf(p);

        const [regieInbox, lsInbox, photosInbox] = await Promise.all([
          loadArrayFromFirstKey(regieInboxKeys(projectKey)),
          loadArrayFromFirstKey(lsInboxKeys(projectKey)),
          loadArrayFromFirstKey(photosInboxKeys(projectKey)),
        ]);

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
            raw: r,
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
            raw: r,
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
            raw: r,
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
    const regie = items.filter((x) => x.kind === "REGIE").length;
    const ls = items.filter((x) => x.kind === "LS").length;
    const photos = items.filter((x) => x.kind === "PHOTOS").length;
    return { regie, ls, photos };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (tab === "REGIE") return items.filter((x) => x.kind === "REGIE");
    if (tab === "LS") return items.filter((x) => x.kind === "LS");
    return items.filter((x) => x.kind === "PHOTOS");
  }, [items, tab]);

  const openProjectHome = useCallback(
    (it: InboxItem) => {
      navigation.navigate("ProjectHome" as any, {
        projectId: it.projectId,
        projectCode: it.projectCode || it.projectKey,
        title: it.projectTitle,
      });
    },
    [navigation]
  );

  function openEditFromInbox(it: InboxItem) {
    const editId = String(it.raw?.id || it.id || "").trim();
    if (!editId) return Alert.alert("Bearbeiten", "Dokument-ID fehlt.");

    if (it.kind === "REGIE") {
      navigation.navigate(
        "Regie" as any,
        {
          projectId: it.projectId,
          projectCode: it.projectCode || it.projectKey,
          title: it.projectTitle,
          editId,
          fromInbox: true,
        } as any
      );
      return;
    }

    if (it.kind === "LS") {
      navigation.navigate(
        "Lieferschein" as any,
        {
          projectId: it.projectId,
          projectCode: it.projectCode || it.projectKey,
          title: it.projectTitle,
          editId,
          fromInbox: true,
        } as any
      );
      return;
    }

    navigation.navigate(
      "PhotosNotes" as any,
      {
        projectId: it.projectId,
        projectCode: it.projectCode || it.projectKey,
        title: it.projectTitle,
        editId,
        fromInbox: true,
      } as any
    );
  }

  function TabButton({
    k,
    label,
    count,
  }: {
    k: Kind;
    label: string;
    count: number;
  }) {
    const active = tab === k;
    return (
      <Pressable
        onPress={() => setTab(k)}
        style={[s.tabBtn, active ? s.tabBtnActive : null]}
      >
        <Text style={[s.tabTxt, active ? s.tabTxtActive : null]}>{label}</Text>
        <View style={[s.tabCountPill, active ? s.tabCountPillActive : null]}>
          <Text style={[s.tabCountTxt, active ? s.tabCountTxtActive : null]}>
            {count}
          </Text>
        </View>
      </Pressable>
    );
  }

  const onPdfEmail = useCallback(async (it: InboxItem) => {
    try {
      const fsKey = String(it.projectKey || it.projectCode || "").trim();
      if (!fsKey) throw new Error("Projekt-Key fehlt.");

      const hintDate =
        String(it.raw?.date || it.raw?.datum || "").slice(0, 10) ||
        new Date().toISOString().slice(0, 10);

      const shortId =
        String(it.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "doc";

      const roles =
        (await getProjectRoles(fsKey)) ||
        (await getProjectRoles(String(it.projectId || "").trim())) ||
        null;

      const to = splitEmails((roles as any)?.emails?.bauleiter);
      const cc = splitEmails((roles as any)?.emails?.buero);
      const bcc = splitEmails((roles as any)?.emails?.extern);

      const r = it.raw || {};

      const poolA = normalizeFileMetaArray(r?.files);
      const poolB = normalizeFileMetaArray(r?.attachments);
      const poolC = normalizeFileMetaArray(r?.photos);

      const fromLines = Array.isArray(r?.rows)
        ? normalizeFileMetaArray((r.rows || []).flatMap((x: any) => x?.photos || []))
        : [];

      const mergedPool = normalizeFileMetaArray([...poolA, ...poolB, ...poolC, ...fromLines]);

      const mainUri = String(r?.imageUri || r?.imageMeta?.uri || "").trim();
      const mainArr = mainUri
        ? normalizeFileMetaArray([
            { uri: mainUri, name: "photo_main.jpg", type: inferMimeFromUri(mainUri) },
          ])
        : [];

      const filesForPhotos = normalizeFileMetaArray([...mainArr, ...mergedPool]);

      const dateYmd = toYmd(r?.date || r?.datum || r?.createdAt || r?.timestamp);
      const text =
        String(r?.rows?.[0]?.comment || r?.comment || r?.text || r?.leistung || "").trim() ||
        String(r?.bemerkungen || r?.notes || r?.note || "").trim();

      const hours = (r?.rows?.[0]?.hours ?? r?.hours ?? undefined) as any;
      const note = String(r?.bemerkungen || r?.notes || r?.note || "").trim();

      const rowForExporter =
        it.kind === "REGIE"
          ? {
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
                  attachments: Array.isArray(r?.attachments)
                    ? normalizeFileMetaArray(r.attachments)
                    : mergedPool,
                  photos: Array.isArray(r?.photos) ? normalizeFileMetaArray(r.photos) : mergedPool,
                },
              },
            }
          : it.kind === "LS"
          ? {
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
                  attachments: Array.isArray(r?.attachments)
                    ? normalizeFileMetaArray(r.attachments)
                    : mergedPool,
                },
              },
            }
          : {
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
                  attachments: Array.isArray(r?.attachments)
                    ? normalizeFileMetaArray(r.attachments)
                    : filesForPhotos,
                  photos: Array.isArray(r?.photos)
                    ? normalizeFileMetaArray(r.photos)
                    : filesForPhotos,
                },
              },
            };

      if (Platform.OS === "web") {
        if (it.kind === "REGIE") {
          await exportRegiePdfToProject({
            projectFsKey: fsKey,
            projectTitle: it.projectTitle,
            row: rowForExporter,
            filenameHint: `Regiebericht_${hintDate}_${shortId}`,
          });
          Alert.alert("PDF", "Browser: Bitte im Druckdialog als PDF speichern.");
          return;
        }
        if (it.kind === "LS") {
          await exportLieferscheinPdfToProject({
            projectFsKey: fsKey,
            projectTitle: it.projectTitle,
            row: rowForExporter,
            filenameHint: `Lieferschein_${hintDate}_${shortId}`,
          });
          Alert.alert("PDF", "Browser: Bitte im Druckdialog als PDF speichern.");
          return;
        }
        await exportPhotosPdfToProject({
          projectFsKey: fsKey,
          projectTitle: it.projectTitle,
          row: rowForExporter,
          filenameHint: `Fotos_${hintDate}_${shortId}`,
        });
        Alert.alert("PDF", "Browser: Bitte im Druckdialog als PDF speichern.");
        return;
      }

      const sendMail = async (
        out: { pdfUri: string; fileName: string; date: string; attachments?: string[] },
        body: string
      ) => {
        const rawAtt =
          Array.isArray(out.attachments) && out.attachments.length ? out.attachments : [out.pdfUri];
        const att = rawAtt.filter((u) => typeof u === "string" && u.startsWith("file://"));
        if (!att.length) throw new Error("Kein gültiger PDF-Anhang (file://).");

        await emailPdf({
          subject: out.fileName,
          body,
          attachments: att,
          to: to.length ? to : undefined,
          cc: cc.length ? cc : undefined,
          bcc: bcc.length ? bcc : undefined,
        });
      };

      if (it.kind === "REGIE") {
        const out = await exportRegiePdfToProject({
          projectFsKey: fsKey,
          projectTitle: it.projectTitle,
          row: rowForExporter,
          filenameHint: `Regiebericht_${hintDate}_${shortId}`,
        });
        if (!out?.pdfUri) throw new Error("PDF Export fehlgeschlagen (kein pdfUri).");
        await sendMail(out as any, `Regiebericht ${fsKey} (${(out as any).date})`);
        return;
      }

      if (it.kind === "LS") {
        const out = await exportLieferscheinPdfToProject({
          projectFsKey: fsKey,
          projectTitle: it.projectTitle,
          row: rowForExporter,
          filenameHint: `Lieferschein_${hintDate}_${shortId}`,
        });
        if (!out?.pdfUri) throw new Error("PDF Export fehlgeschlagen (kein pdfUri).");
        await sendMail(out as any, `Lieferschein ${fsKey} (${(out as any).date})`);
        return;
      }

      const out = await exportPhotosPdfToProject({
        projectFsKey: fsKey,
        projectTitle: it.projectTitle,
        row: rowForExporter,
        filenameHint: `Fotos_${hintDate}_${shortId}`,
      });
      if (!out?.pdfUri) throw new Error("PDF Export fehlgeschlagen (kein pdfUri).");
      await sendMail(out as any, `Fotodokumentation ${fsKey} (${(out as any).date})`);
    } catch (e: any) {
      Alert.alert("PDF / E-Mail", e?.message || "Export fehlgeschlagen.");
    }
  }, []);

  function renderRow({ item }: { item: InboxItem }) {
    const accent = item.kind === "REGIE" ? "#0B57D0" : item.kind === "LS" ? "#1A7F37" : "#7A4DFF";
    const stColor = badgeColor(item.status);

    const ts = item.updatedAt ?? item.createdAt;
    const tsStr = ts ? new Date(ts).toLocaleString() : "";

    return (
      <View style={s.rowCard}>
        <View style={s.rowTop}>
          <View style={[s.kindDot, { backgroundColor: accent }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={s.rowSub} numberOfLines={2}>
              {item.projectTitle}
              {item.projectCode ? ` • ${item.projectCode}` : ""}
              {tsStr ? ` • ${tsStr}` : ""}
            </Text>
          </View>

          <View style={[s.badge, { borderColor: stColor }]}>
            <Text style={[s.badgeTxt, { color: stColor }]}>{badgeText(item.status)}</Text>
          </View>
        </View>

        <View style={s.rowActions}>
          <Pressable style={[s.btn, s.btnGhost]} onPress={() => openEditFromInbox(item)}>
            <Text style={[s.btnTxt, s.btnGhostTxt]}>Bearbeiten</Text>
          </Pressable>

          <Pressable style={[s.btn, s.btnGhost]} onPress={() => openProjectHome(item)}>
            <Text style={[s.btnTxt, s.btnGhostTxt]}>Zum Projekt</Text>
          </Pressable>

          <Pressable style={[s.btn]} onPress={() => onPdfEmail(item)}>
            <Text style={s.btnTxt}>PDF / E-Mail</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.bg}>
        <View style={s.header}>
          <View style={s.headerRow}>
            <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
              <Text style={s.backTxt}>Zurück</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <View style={s.modePill}>
              <Text style={s.modeTxt}>{mode === "NUR_APP" ? "NUR_APP" : "SERVER"}</Text>
            </View>
          </View>

          <Text style={s.h1}>Inbox (Offline)</Text>

          <View style={s.tabsRow}>
            <TabButton k="REGIE" label="Regie" count={counts.regie} />
            <TabButton k="LS" label="Lieferscheine" count={counts.ls} />
            <TabButton k="PHOTOS" label="Photos" count={counts.photos} />
          </View>

          <View style={s.actionsRow}>
            <Pressable style={s.actionBtn} onPress={loadInbox} disabled={loading || syncing}>
              <Text style={s.actionTxt}>{loading ? "Lade..." : "Aktualisieren"}</Text>
            </Pressable>
          </View>

          <Text style={s.hint}>
            Hinweis: Diese Inbox ist nur für NUR_APP (offline). Keine Server-Synchronisierung.
          </Text>
        </View>

        <FlatList
          data={filteredItems}
          keyExtractor={(x) => `${x.kind}:${x.projectKey}:${x.id}`}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 12 }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={loadInbox} tintColor="#fff" />
          }
          ListEmptyComponent={
            <View style={{ padding: 16 }}>
              <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "700" }}>
                {"Keine offenen Einträge in dieser Kategorie."}
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1720" },
  bg: { flex: 1, backgroundColor: "#0B1720" },

  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  backTxt: { color: "#fff", fontWeight: "900" },

  modePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modeTxt: { color: "rgba(255,255,255,0.9)", fontWeight: "900", fontSize: 12 },

  h1: { fontSize: 34, fontWeight: "900", color: "#fff" },

  tabsRow: { marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  tabBtnActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderColor: "rgba(255,255,255,0.28)",
  },
  tabTxt: { color: "rgba(255,255,255,0.78)", fontWeight: "900" },
  tabTxtActive: { color: "#fff" },

  tabCountPill: {
    minWidth: 28,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
  },
  tabCountPillActive: {
    backgroundColor: "rgba(0,0,0,0.35)",
    borderColor: "rgba(255,255,255,0.24)",
  },
  tabCountTxt: { color: "rgba(255,255,255,0.85)", fontWeight: "900" },
  tabCountTxtActive: { color: "#fff" },

  actionsRow: { marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" },
  actionBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  actionTxt: { color: "#fff", fontWeight: "900" },

  hint: { marginTop: 10, color: "rgba(255,255,255,0.65)", fontWeight: "700" },

  rowCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  kindDot: { width: 10, height: 10, borderRadius: 99, marginTop: 5 },

  rowTitle: { fontSize: 16, fontWeight: "900", color: "#0B1720" },
  rowSub: { marginTop: 6, opacity: 0.75, fontWeight: "700", color: "#0B1720" },

  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
  },
  badgeTxt: { fontSize: 11, fontWeight: "900" },

  rowActions: { marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: "#111" },
  btnTxt: { color: "#fff", fontWeight: "900" },

  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(11,23,32,0.20)" },
  btnGhostTxt: { color: "#0B1720" },
});
