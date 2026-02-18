// apps/mobile/src/screens/ProjectHomeScreen.tsx
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  FlatList,
  ActivityIndicator,
  Linking,
  Alert,
  SafeAreaView,
  Platform,
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { queueByProject, queueIsLocked, queueStats } from "../lib/offlineQueue";
import { syncAll } from "../lib/sync";
import { getProjectRoles, ProjectRoles } from "../storage/projectMeta";
import { getSession, clearSession, SessionRole } from "../storage/session";
import { api, looksLikeProjectCode, extractBaCode } from "../lib/api";

// ✅ icon
import { Ionicons } from "@expo/vector-icons";

// ✅ offline PDF helpers
import {
  downloadPdf,
  getLocalUri,
  isDownloaded,
  deletePdf,
  importLocalPdf,
} from "../lib/pdfStorage";

import * as DocumentPicker from "expo-document-picker";

type Props = NativeStackScreenProps<RootStackParamList, "ProjectHome">;

/* ================= helpers ================= */

function roleLabel(r?: SessionRole) {
  switch (r) {
    case "BAULEITER":
      return "Bauleiter";
    case "ABRECHNUNG":
      return "Abrechnung";
    case "BUERO":
      return "Büro";
    case "POLIER":
      return "Polier / Vorarbeiter";
    case "VERMESSUNG":
      return "Vermessung";
    case "FAHRER":
      return "Fahrer";
    case "MITARBEITER":
      return "Mitarbeiter";
    default:
      return "Nicht angemeldet";
  }
}

function perms(role?: SessionRole) {
  const full = role === "BAULEITER" || role === "ABRECHNUNG";
  const office = role === "BUERO";
  return {
    full,
    office,
    canReview: full || office,
    canEditContacts: full || office,
    canLvRead: full || office || role === "POLIER" || role === "VERMESSUNG",
    canCreateDocs: true,
  };
}

type ProjectPdfItem = {
  name: string;
  url: string;
  folder?: string;
  mtime?: string;
};

function looksLikeLocalKey(k?: string) {
  return /^local-/i.test(String(k || "").trim());
}

// ✅ UUID check
function looksLikeUuid(v?: string) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
    s
  );
}

// ✅ SAME KEY POLICY as ProjectsScreen (scoped by mode)
const CODEMAP_KEY_BASE = "rlc_project_code_map_v1";

// ✅ Arbeitsmodus (mode) key
const KEY_MODE = "rlc_mobile_mode";
type ArbeitsmodusType = "NUR_APP" | "SERVER_SYNC";

async function loadCodeMap(
  mode: ArbeitsmodusType
): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(`${CODEMAP_KEY_BASE}:${mode}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getBaFromMap(
  map: Record<string, string> | null,
  projectId: string,
  fallback?: string
) {
  const fromMap = map?.[String(projectId || "").trim()] || "";
  return extractBaCode(fromMap || fallback || "") || "";
}

/**
 * ✅ Expo DocumentPicker compat (NEW + OLD result shapes)
 * - new: { canceled, assets:[{uri,name,mimeType,...}] }
 * - old: { type:"success", uri, name }
 */
function pickResultToFile(res: any): { uri: string; name: string } | null {
  if (!res) return null;

  // NEW
  if (res.canceled === true) return null;
  if (Array.isArray(res.assets) && res.assets[0]?.uri) {
    return {
      uri: String(res.assets[0].uri),
      name: String(res.assets[0].name || "document.pdf"),
    };
  }

  // OLD
  if (res.type === "success" && res.uri) {
    return {
      uri: String(res.uri),
      name: String(res.name || "document.pdf"),
    };
  }

  return null;
}

/* ================= component ================= */

export default function ProjectHomeScreen({ route, navigation }: Props) {
  const { projectId, title, projectCode } = route.params as any;

  // ✅ mode: NUR_APP vs SERVER_SYNC
  const [mode, setMode] = useState<ArbeitsmodusType>("SERVER_SYNC");

  const [pending, setPending] = useState(0);
  const [roles, setRoles] = useState<ProjectRoles | null>(null);
  const [sessionRole, setSessionRole] = useState<SessionRole | undefined>();
  const [sessionName, setSessionName] = useState<string>("");
  const [resolvedCode, setResolvedCode] = useState<string>("");

  // ✅ server whoami role (authoritative)
  const [serverRole, setServerRole] = useState<string>("");

  // ✅ local BA-map cache
  const [codeMap, setCodeMap] = useState<Record<string, string> | null>(null);

  // ✅ Company header + logo (letterhead)
  const [companyHeader, setCompanyHeader] = useState<any | null>(null);
  const [companyLogoUri, setCompanyLogoUri] = useState<string | null>(null);

  // ✅ Support auto-open guard (avoid loops)
  const supportAutoOpenedRef = useRef(false);

  // ===== PDF state =====
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfItems, setPdfItems] = useState<ProjectPdfItem[]>([]);
  const [pdfBusyMap, setPdfBusyMap] = useState<Record<string, boolean>>({});
  const [pdfOfflineMap, setPdfOfflineMap] = useState<Record<string, boolean>>(
    {}
  );

  const setItemBusy = useCallback((name: string, v: boolean) => {
    setPdfBusyMap((prev) => ({ ...prev, [name]: v }));
  }, []);

  /* ================= derived ================= */

  const effectiveProjectCode = useMemo(() => {
    return String(projectCode || resolvedCode || "").trim();
  }, [projectCode, resolvedCode]);

  // ✅ BA ok only in SERVER_SYNC
  const baOk =
    mode === "SERVER_SYNC" && looksLikeProjectCode(effectiveProjectCode);

  const projectKey = useMemo(() => {
    return (effectiveProjectCode || String(projectId)).trim();
  }, [effectiveProjectCode, projectId]);

  /* ================= refresh ================= */

  const refreshPending = useCallback(async (key: string) => {
    const list = await queueByProject(key);
    setPending(list.filter((x) => x.status !== "DONE").length);
  }, []);

  const refreshRoles = useCallback(async () => {
    const r = await getProjectRoles(projectKey);
    setRoles(r);
  }, [projectKey]);

  const refreshSession = useCallback(async () => {
    const s = await getSession(projectKey);
    setSessionRole(s?.role);
    setSessionName(s?.name || "");
  }, [projectKey]);

  const refreshCodeMap = useCallback(
    async (mNow?: ArbeitsmodusType) => {
      const m = mNow || mode;
      const map = await loadCodeMap(m);
      setCodeMap(map || {});
      return map || {};
    },
    [mode]
  );

  const loadMode = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY_MODE);
      const m: ArbeitsmodusType = raw === "NUR_APP" ? "NUR_APP" : "SERVER_SYNC";
      setMode(m);
      return m;
    } catch {
      setMode("SERVER_SYNC");
      return "SERVER_SYNC" as ArbeitsmodusType;
    }
  }, []);

  const resolveProjectCodeNow = useCallback(
    async (mNow?: ArbeitsmodusType): Promise<string> => {
      const modeNow = mNow || mode;

      if (projectCode) return String(projectCode).trim();
      if (resolvedCode) return String(resolvedCode).trim();

      // 1) local map (scoped by mode)
      try {
        const m = codeMap || (await refreshCodeMap(modeNow));
        const ba = getBaFromMap(m, String(projectId).trim(), "");
        if (ba) {
          setResolvedCode(ba);
          return ba;
        }
      } catch {}

      // 2) server only in SERVER_SYNC
      if (modeNow === "SERVER_SYNC") {
        try {
          const projects = await api.projects();
          const hit = projects.find(
            (p: any) => String(p?.id || "").trim() === String(projectId).trim()
          );
          const code = extractBaCode(String(hit?.code || "").trim()) || "";
          if (code) {
            setResolvedCode(code);
            return code;
          }
        } catch {}
      }

      return "";
    },
    [mode, projectCode, resolvedCode, projectId, codeMap, refreshCodeMap]
  );

  const refreshWhoami = useCallback(async () => {
    try {
      const r = await (api as any).whoami?.();
      const role = String((r as any)?.user?.role || "").toUpperCase();
      setServerRole(role);
      return role;
    } catch {
      setServerRole("");
      return "";
    }
  }, []);

  /* ================= guards ================= */

  async function requireProjectKey(): Promise<string | null> {
    const key = String(projectKey || "").trim();
    if (looksLikeProjectCode(key) || looksLikeLocalKey(key)) return key;

    const codeNow = await resolveProjectCodeNow();
    if (looksLikeProjectCode(codeNow)) return codeNow;

    return null;
  }

  async function requireFsCode(): Promise<string | null> {
    if (mode !== "SERVER_SYNC") return null;
    const codeNow = await resolveProjectCodeNow();
    return looksLikeProjectCode(codeNow) ? codeNow : null;
  }

  // ✅ stable offline FS key (never UUID if possible)
  async function requireOfflineFsKey(): Promise<string | null> {
    const fs = await requireFsCode();
    if (fs) return fs;

    const k = await requireProjectKey();
    if (k) return k;

    const fallback = String(projectKey || "").trim();
    return fallback || null;
  }

  // ✅ navigation helper: prefer BA in SERVER_SYNC
  const resolveNavProjectKey = useCallback(async () => {
    if (mode === "SERVER_SYNC") {
      const fs = await requireFsCode();
      if (fs) return fs;
    }
    return (await requireProjectKey()) || String(projectKey || "").trim();
  }, [mode, projectKey]);

  // ✅ Header: Support button
  useLayoutEffect(() => {
    navigation.setOptions({
      title: title || "Projekt",
      headerRight: () => (
        <Pressable
          onPress={() => {
            (async () => {
              const fsKey =
                (await requireOfflineFsKey()) || String(projectKey || "").trim();

              navigation.navigate("SupportChat" as any, {
                projectId: String(projectId),
                projectCode: String(fsKey || "").trim() || undefined,
                title: "Support Chat",
                screen: "ProjectHome",
                initialMessage: "",
              });
            })();
          }}
          style={{ paddingHorizontal: 10, paddingVertical: 6 }}
          hitSlop={10}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
        </Pressable>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, title, projectId, projectKey, mode]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;

      (async () => {
        const mNow = await loadMode();

        // cached branding
        try {
          const h = await api.getCompanyHeaderCached();
          const l = await api.getCompanyLogoCachedUri();
          if (alive) {
            if (h) setCompanyHeader(h);
            if (l) setCompanyLogoUri(l);
          }
        } catch {}

        // try sync from server
        try {
          const { header, logoUri } =
            await api.syncCompanyBrandingToOfflineCache();
          if (alive) {
            if (header) setCompanyHeader(header);
            if (logoUri) setCompanyLogoUri(logoUri);
          }
        } catch {}

        await refreshCodeMap(mNow);
        await refreshWhoami();

        const codeNow = await resolveProjectCodeNow(mNow);

        // guard: SERVER_SYNC requires BA when route came with UUID only
        if (
          mNow === "SERVER_SYNC" &&
          !looksLikeProjectCode(codeNow) &&
          looksLikeUuid(String(projectId)) &&
          !looksLikeLocalKey(String(projectId))
        ) {
          if (alive) navigation.replace("Projects");
          return;
        }

        const keyNow = (codeNow || String(projectId)).trim();

        await refreshPending(keyNow);
        await refreshRoles();
        await refreshSession();

        // proactive support if queue locked
        try {
          const locked = await queueIsLocked();
          if (!alive) return;

          if (!locked) supportAutoOpenedRef.current = false;

          if (locked && !supportAutoOpenedRef.current) {
            supportAutoOpenedRef.current = true;

            const st = await queueStats().catch(() => null as any);
            const lastError =
              (st && (st as any).lastError) ||
              (st && (st as any).errorMsg) ||
              "";

            navigation.navigate("SupportChat" as any, {
              projectId: String(projectId),
              projectCode: String(codeNow || keyNow || "").trim() || undefined,
              title: "Support (Queue locked)",
              screen: "ProjectHome",
              initialMessage:
                "La queue risulta BLOCCATA. Guidami per sbloccarla." +
                (lastError ? `\nUltimo errore: ${String(lastError)}` : ""),
            });
          }
        } catch {}

        const s = await getSession(keyNow);
        if (alive && (!s?.role || !s?.name)) {
          navigation.navigate("Anmelden" as any, {
            projectId: keyNow,
            projectCode:
              mNow === "SERVER_SYNC" && looksLikeProjectCode(codeNow)
                ? codeNow
                : undefined,
            title: "Anmelden",
          });
        }
      })();

      return () => {
        alive = false;
      };
    }, [
      projectId,
      navigation,
      refreshRoles,
      refreshSession,
      refreshPending,
      resolveProjectCodeNow,
      refreshCodeMap,
      loadMode,
      refreshWhoami,
    ])
  );

  /* ================= server actions ================= */

  async function onSync() {
    try {
      if (mode !== "SERVER_SYNC") return;

      const codeNow = await resolveProjectCodeNow();
      if (!looksLikeProjectCode(codeNow)) return;

      const keyNow = (codeNow || String(projectId)).trim();

      const r = await syncAll({
        projectId: keyNow,
        projectCode: looksLikeProjectCode(codeNow) ? codeNow : undefined,
      });
      await refreshPending(keyNow);

      Alert.alert("Sync", `OK: ${r?.ok ?? 0}\nFail: ${r?.fail ?? 0}`);
    } catch (e: any) {
      Alert.alert("Sync", e?.message || "Sync fehlgeschlagen.");
    }
  }

  async function onWechseln() {
    await clearSession(projectKey);
    setSessionRole(undefined);
    setSessionName("");

    const codeNow = await resolveProjectCodeNow();
    navigation.navigate("Anmelden" as any, {
      projectId: projectKey,
      projectCode:
        mode === "SERVER_SYNC" && looksLikeProjectCode(codeNow)
          ? codeNow
          : undefined,
      title: "Anmelden",
    });
  }

  const p = perms(sessionRole);

  const canAdmin =
    mode === "SERVER_SYNC" &&
    (serverRole === "ADMIN" || serverRole === "ADMINISTRATOR");

  const bauleiter = roles?.bauleiter?.name?.trim() || "Nicht gesetzt";
  const auftraggeber =
    roles?.auftraggeber?.company?.trim() ||
    roles?.auftraggeber?.contactName?.trim() ||
    "Nicht gesetzt";

  const projektAnzeige = effectiveProjectCode || String(projectId);

  // ===== PDF helpers =====
  async function getBaseUrl(): Promise<string> {
    try {
      const base = String(
        (api as any)?.getApiUrl
          ? await (api as any).getApiUrl()
          : (api as any)?.apiUrl || ""
      ).replace(/\/$/, "");
      return base;
    } catch {
      return String((api as any)?.apiUrl || "").replace(/\/$/, "");
    }
  }

  function absUrl(base: string, url: string) {
    const u = String(url || "").trim();
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    return `${String(base || "").replace(/\/$/, "")}${
      u.startsWith("/") ? "" : "/"
    }${u}`;
  }

  const pdfRows = useMemo(() => {
    return pdfItems.map((it) => ({
      ...it,
      offline: !!pdfOfflineMap[it.name],
      busy: !!pdfBusyMap[it.name],
    }));
  }, [pdfItems, pdfBusyMap, pdfOfflineMap]);

  const refreshOfflineFlags = useCallback(
    async (fsKey: string, items: ProjectPdfItem[]) => {
      if (!fsKey || !items.length) return;
      try {
        const flags: Record<string, boolean> = {};
        for (const it of items) {
          flags[it.name] = await isDownloaded(fsKey, it.name);
        }
        setPdfOfflineMap(flags);
      } catch {}
    },
    []
  );

  // ✅ PDF LADEN (NUR_APP)
  const importPdfFromDevice = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
        multiple: false,
      });

      const file = pickResultToFile(res);
      if (!file) return;

      setPdfBusy(true);

      const offKey =
        (await requireOfflineFsKey()) || String(projectKey || "").trim();

      let localUri: string | null = null;

      try {
        const r: any = await (importLocalPdf as any)(
          offKey,
          file.uri,
          file.name
        );
        localUri =
          (typeof r === "string" && r) ||
          (typeof r?.uri === "string" && r.uri) ||
          null;
      } catch {
        localUri = null;
      }

      const uriToOpen = localUri || file.uri;

      try {
        navigation.navigate("PdfViewer" as any, {
          uri: uriToOpen,
          title: file.name,
        });
        return;
      } catch {}

      const ok = await Linking.canOpenURL(uriToOpen);
      if (!ok) throw new Error("Kann PDF nicht öffnen: " + uriToOpen);
      await Linking.openURL(uriToOpen);
    } catch (e: any) {
      console.error("PDF IMPORT/OPEN ERROR:", e);
      Alert.alert("PDF laden", String(e?.message || e || "Unbekannter Fehler"));
    } finally {
      setPdfBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, projectKey]);

  const openProjectPdfs = useCallback(async () => {
    const fsKey = await requireFsCode(); // BA-only
    if (!fsKey) {
      const offKey = (await requireOfflineFsKey()) || String(projectKey).trim();
      navigation.navigate("ProjectPdfs" as any, {
        projectFsKey: offKey,
        title: "Projekt PDFs (Offline)",
      });
      return;
    }

    setPdfBusy(true);
    try {
      const base = await getBaseUrl();
      if (!base) throw new Error("API base URL fehlt");

      const r = await fetch(
        `${base}/api/projects/${encodeURIComponent(fsKey)}/pdfs`
      );
      const t = await r.text().catch(() => "");
      if (!r.ok) throw new Error(t || `HTTP ${r.status}`);

      const json = t ? JSON.parse(t) : null;
      const items = Array.isArray(json?.items) ? json.items : [];
      const normalized: ProjectPdfItem[] = items
        .map((x: any) => ({
          name: String(x?.name || x?.filename || "").trim(),
          url: String(x?.url || "").trim(),
          folder: String(x?.folder || "").trim() || undefined,
          mtime: String(x?.mtime || x?.savedAt || "").trim() || undefined,
        }))
        .filter((x: any) => !!x.name && !!x.url);

      setPdfItems(normalized);
      await refreshOfflineFlags(fsKey, normalized);
      setPdfOpen(true);
    } catch (e: any) {
      setPdfOpen(false);

      const offKey = (await requireOfflineFsKey()) || String(projectKey).trim();
      navigation.navigate("ProjectPdfs" as any, {
        projectFsKey: offKey,
        title: "Projekt PDFs (Offline)",
      });

      Alert.alert(
        "PDFs (Offline)",
        "Keine Verbindung. Es werden nur bereits heruntergeladene PDFs angezeigt."
      );
    } finally {
      setPdfBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, projectKey, refreshOfflineFlags]);

  const openPdfItem = useCallback(
    async (item: ProjectPdfItem) => {
      try {
        const fsKey = await requireFsCode(); // BA-only
        if (!fsKey) {
          const localKey =
            (await requireOfflineFsKey()) || String(projectKey).trim();

          const local = await getLocalUri(localKey, item.name);
          if (local) {
            try {
              navigation.navigate("PdfViewer" as any, {
                uri: local,
                title: item.name,
              });
              return;
            } catch {}
            const okLocal = await Linking.canOpenURL(local);
            if (okLocal) {
              await Linking.openURL(local);
              return;
            }
          }
          throw new Error(
            "Offline: PDF nicht gefunden. Bitte zuerst herunterladen (SERVER_SYNC) oder in NUR_APP laden."
          );
        }

        const local = await getLocalUri(fsKey, item.name);
        if (local) {
          try {
            navigation.navigate("PdfViewer" as any, {
              uri: local,
              title: item.name,
            });
            return;
          } catch {}
          const okLocal = await Linking.canOpenURL(local);
          if (okLocal) {
            await Linking.openURL(local);
            return;
          }
        }

        const base = await getBaseUrl();
        const url = absUrl(base, item.url);
        if (!url) throw new Error("PDF URL fehlt");
        const ok = await Linking.canOpenURL(url);
        if (!ok) throw new Error("Kann PDF nicht öffnen: " + url);
        await Linking.openURL(url);
      } catch (e: any) {
        Alert.alert(
          "PDF öffnen",
          e?.message || "PDF konnte nicht geöffnet werden."
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigation, projectKey]
  );

  const downloadPdfItem = useCallback(
    async (item: ProjectPdfItem) => {
      const fsKey = await requireFsCode(); // BA-only
      if (!fsKey) return;

      setItemBusy(item.name, true);
      try {
        const base = await getBaseUrl();
        const url = absUrl(base, item.url);
        if (!url) throw new Error("PDF URL fehlt");

        await downloadPdf(fsKey, item.name, url);
        setPdfOfflineMap((prev) => ({ ...prev, [item.name]: true }));
      } catch (e: any) {
        Alert.alert("Download", e?.message || "Download fehlgeschlagen.");
      } finally {
        setItemBusy(item.name, false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setItemBusy]
  );

  const deletePdfItem = useCallback(
    async (item: ProjectPdfItem) => {
      const fsKey = await requireFsCode(); // BA-only
      if (!fsKey) return;

      setItemBusy(item.name, true);
      try {
        await deletePdf(fsKey, item.name);
        setPdfOfflineMap((prev) => ({ ...prev, [item.name]: false }));
      } catch (e: any) {
        Alert.alert("Offline löschen", e?.message || "Löschen fehlgeschlagen.");
      } finally {
        setItemBusy(item.name, false);
      }
    },
    [setItemBusy]
  );

  /* ================= UI ================= */

  const companyTitle =
    String(companyHeader?.name || companyHeader?.companyName || "").trim() ||
    "RLC Bausoftware";

  const companySub =
    String(companyHeader?.email || "").trim() ||
    (mode === "NUR_APP" ? "offline" : "mobile");

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.bg}>
        <ScrollView style={s.wrap} contentContainerStyle={s.content}>
          <View style={s.header}>
            <View style={s.headerRow}>
              <Pressable
                style={s.backBtn}
                onPress={() => navigation.navigate("Projects")}
              >
                <Text style={s.backTxt}>Projekte</Text>
              </Pressable>

              <View style={{ flex: 1 }} />

              <View style={s.modePill}>
                <Text style={s.modeTxt}>
                  {mode === "NUR_APP" ? "NUR_APP" : "SERVER"}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {companyLogoUri ? (
                <Image
                  source={{ uri: companyLogoUri }}
                  style={s.companyLogo}
                  resizeMode="contain"
                />
              ) : null}

              <View style={{ flex: 1 }}>
                <Text style={s.brandTop}>{companyTitle}</Text>
                <Text style={s.brandSub}>{companySub}</Text>
              </View>
            </View>

            <Text style={s.h1}>{projektAnzeige}</Text>

            <View style={s.pillRow}>
              <View style={s.badge}>
                <Text style={s.badgeTxt}>
                  {roleLabel(sessionRole)}
                  {sessionName ? ` – ${sessionName}` : ""}
                </Text>
              </View>

              <View style={[s.badge, pending > 0 ? s.badgeWarn : s.badgeOk]}>
                <Text style={s.badgeTxt}>
                  Pending: <Text style={{ fontWeight: "900" }}>{pending}</Text>
                </Text>
              </View>

              <View style={s.badge}>
                <Text style={s.badgeTxt}>
                  Modus:{" "}
                  <Text style={{ fontWeight: "900" }}>
                    {mode === "NUR_APP" ? "Nur App" : "Server Sync"}
                  </Text>
                </Text>
              </View>

              {mode === "SERVER_SYNC" ? (
                <View style={s.badge}>
                  <Text style={s.badgeTxt}>
                    Server-Rolle:{" "}
                    <Text style={{ fontWeight: "900" }}>
                      {serverRole || "—"}
                    </Text>
                  </Text>
                </View>
              ) : null}
            </View>

            {mode === "SERVER_SYNC" &&
            !looksLikeProjectCode(effectiveProjectCode) ? (
              <View style={s.baHintBox}>
                <Text style={s.baHintTitle}>BA-Code erforderlich</Text>
                <Text style={s.baHintText}>
                  Online-Funktionen (Sync, Eingang/Prüfung, PDF vom Server) sind
                  erst verfügbar, wenn ein Projekt-Code im Format BA-YYYY-XXX
                  gesetzt ist.
                </Text>
              </View>
            ) : null}
          </View>

          <View style={s.body}>
            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <View style={s.accentBar} />
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Angemeldet</Text>
                  <Text style={s.cardSub}>Projekt: {projektAnzeige}</Text>
                </View>

                <Pressable style={s.btnOutline} onPress={onWechseln}>
                  <Text style={s.btnOutlineTxt}>Wechseln</Text>
                </Pressable>
              </View>

              <Text style={s.sessionLine}>
                Rolle:{" "}
                <Text style={s.sessionStrong}>{roleLabel(sessionRole)}</Text>
                {sessionName ? (
                  <>
                    {" "}
                    – <Text style={s.sessionStrong}>{sessionName}</Text>
                  </>
                ) : null}
              </Text>
            </View>

            {/* ✅ SUPPORT CHAT */}
            <Pressable
              style={s.navCard}
              onPress={async () => {
                const fsKey =
                  (await requireOfflineFsKey()) ||
                  effectiveProjectCode ||
                  String(projectId);
                navigation.navigate("SupportChat" as any, {
                  projectId: String(projectId),
                  projectCode: String(fsKey || "").trim(),
                  title: "Support Chat",
                  screen: "ProjectHome",
                  initialMessage: "",
                });
              }}
            >
              <View style={s.navRow}>
                <View style={[s.navIcon, { backgroundColor: "#111" }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.navTitle}>Support Chat</Text>
                  <Text style={s.navSub}>
                    Hilfe bei Sync/Queue/Fehlern (Regeln + optional KI)
                  </Text>
                </View>
              </View>
            </Pressable>

            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <View style={s.accentBar} />
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Projekt-Info</Text>
                  <Text style={s.cardSub}>Kontakte & Zuständigkeiten</Text>
                </View>
              </View>

              <View style={s.kv}>
                <Text style={s.k}>Bauleiter</Text>
                <Text style={s.v}>{bauleiter}</Text>
              </View>
              <View style={s.kv}>
                <Text style={s.k}>Auftraggeber</Text>
                <Text style={s.v}>{auftraggeber}</Text>
              </View>
            </View>

            {/* ✅ SYNC: only SERVER_SYNC */}
            <Pressable
              style={[
                s.syncCard,
                !baOk || mode !== "SERVER_SYNC" ? { opacity: 0.55 } : null,
              ]}
              onPress={onSync}
              disabled={!baOk || mode !== "SERVER_SYNC"}
            >
              <View style={s.cardHeaderRow}>
                <View style={[s.accentBar, { backgroundColor: "#111" }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.syncTitle}>Sync jetzt</Text>
                  <Text style={s.syncSub}>
                    Offline-Puffer hochladen und Status aktualisieren
                  </Text>
                </View>

                <View style={s.syncPill}>
                  <Text style={s.syncPillTxt}>{pending}</Text>
                </View>
              </View>
            </Pressable>

            {/* ✅ PDFs */}
            {mode === "SERVER_SYNC" && (
              <Pressable
                style={s.navCard}
                onPress={openProjectPdfs}
                disabled={pdfBusy}
              >
                <View style={s.navRow}>
                  <View style={[s.navIcon, { backgroundColor: "#6B7280" }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.navTitle}>Projekt PDFs</Text>
                    <Text style={s.navSub}>
                      Liste vom Server (Download/Offline)
                    </Text>
                  </View>
                  {pdfBusy ? <ActivityIndicator /> : null}
                </View>
              </Pressable>
            )}

            {mode === "NUR_APP" && (
              <Pressable
                style={s.navCard}
                onPress={importPdfFromDevice}
                disabled={pdfBusy}
              >
                <View style={s.navRow}>
                  <View style={[s.navIcon, { backgroundColor: "#111" }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.navTitle}>PDF laden (vom Gerät)</Text>
                    <Text style={s.navSub}>
                      Öffnet Dokumente / Dateien und speichert das PDF offline im
                      Projekt
                    </Text>
                  </View>
                  {pdfBusy ? <ActivityIndicator /> : null}
                </View>
              </Pressable>
            )}

            {/* ✅ MODE SPLIT (your rule) */}
            {mode === "NUR_APP" ? (
              <Pressable
                style={s.navCard}
                onPress={() => navigation.navigate("Inbox" as any)}
              >
                <View style={s.navRow}>
                  <View style={[s.navIcon, { backgroundColor: "#111" }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.navTitle}>Inbox (Offline)</Text>
                    <Text style={s.navSub}>
                      Nur App Modus – lokale Queue / Entwürfe
                    </Text>
                  </View>
                </View>
              </Pressable>
            ) : (
              <Pressable
                style={[
                  s.navCard,
                  s.navCardStrong,
                  !baOk ? { opacity: 0.55 } : null,
                ]}
                disabled={!baOk}
                onPress={async () => {
                  const fsKey = await requireFsCode(); // BA-only (server workflow)
                  const offKey =
                    (await requireOfflineFsKey()) ||
                    String(projectKey || "").trim();

                  navigation.navigate("EingangPruefung" as any, {
                    projectId: fsKey || offKey,
                    projectCode: fsKey || offKey, // ✅ never undefined
                    title: "Eingang / Prüfung",
                  });
                }}
              >
                <View style={s.navRow}>
                  <View style={[s.navIcon, { backgroundColor: "#111" }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.navTitle}>Eingang / Prüfung (Server)</Text>
                    <Text style={s.navSub}>
                      Server Sync – prüfen / freigeben / ablehnen
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}

            <Pressable
              style={s.navCard}
              onPress={async () => {
                const key = await resolveNavProjectKey();
                // TeamRoles is ProjectBaseParams: projectCode optional, keep as-is
                navigation.navigate("TeamRoles" as any, {
                  projectId: key || projectKey,
                  projectCode:
                    mode === "SERVER_SYNC"
                      ? (await requireFsCode()) || undefined
                      : undefined,
                  title: "Team / Rollen",
                });
              }}
            >
              <View style={s.navRow}>
                <View style={[s.navIcon, { backgroundColor: "#3B82F6" }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.navTitle}>Team / Rollen</Text>
                  <Text style={s.navSub}>Bauleiter, Auftraggeber, Rollen</Text>
                </View>
              </View>
            </Pressable>

            {canAdmin ? (
  <Pressable
    style={s.navCard}
    onPress={() => navigation.navigate("CompanyAdmin" as any)}
  >
    <View style={s.navRow}>
      <View style={[s.navIcon, { backgroundColor: "#111" }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.navTitle}>Firma (Admin)</Text>
        <Text style={s.navSub}>
          Header + Logo / Briefkopf
        </Text>
      </View>
    </View>
  </Pressable>
) : null}


            {p.canLvRead && (
              <Pressable
                style={s.navCard}
                onPress={async () => {
                  const key = await resolveNavProjectKey();
                  navigation.navigate("LvReadOnly" as any, {
                    projectId: key || projectKey,
                    projectCode:
                      mode === "SERVER_SYNC"
                        ? (await requireFsCode()) || undefined
                        : undefined,
                    title: "LV (nur Lesen)",
                  });
                }}
              >
                <View style={s.navRow}>
                  <View style={[s.navIcon, { backgroundColor: "#10B981" }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.navTitle}>LV (nur Lesen)</Text>
                    <Text style={s.navSub}>
                      Suchen, filtern, offline speichern
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}

            {p.canCreateDocs && (
              <>
                <Pressable
                  style={s.navCard}
                  onPress={async () => {
                    const key = await resolveNavProjectKey();
                    const fsKey =
                      (await requireOfflineFsKey()) ||
                      String(key || projectKey || "").trim();

                    navigation.navigate("Regie" as any, {
                      projectId: String(key || projectKey),
                      projectCode: String(fsKey), // ✅ REQUIRED
                      title: "Regiebericht",
                    });
                  }}
                >
                  <View style={s.navRow}>
                    <View style={[s.navIcon, { backgroundColor: "#22C55E" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.navTitle}>Regiebericht</Text>
                      <Text style={s.navSub}>Leistung / Stunden / Notiz</Text>
                    </View>
                  </View>
                </Pressable>

                <Pressable
                  style={s.navCard}
                  onPress={async () => {
                    const key = await resolveNavProjectKey();
                    const fsKey =
                      (await requireOfflineFsKey()) ||
                      String(key || projectKey || "").trim();

                    navigation.navigate("Lieferschein" as any, {
                      projectId: String(key || projectKey),
                      projectCode: String(fsKey), // ✅ REQUIRED
                      title: "Lieferschein",
                    });
                  }}
                >
                  <View style={s.navRow}>
                    <View style={[s.navIcon, { backgroundColor: "#2563EB" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.navTitle}>Lieferschein</Text>
                      <Text style={s.navSub}>Foto + Notiz</Text>
                    </View>
                  </View>
                </Pressable>

                <Pressable
                  style={s.navCard}
                  onPress={async () => {
                    const key = await resolveNavProjectKey();
                    const fsKey =
                      (await requireOfflineFsKey()) ||
                      String(key || projectKey || "").trim();

                    navigation.navigate("PhotosNotes" as any, {
                      projectId: String(key || projectKey),
                      projectCode: String(fsKey), // ✅ REQUIRED
                      title: "Fotos / Notizen",
                    });
                  }}
                >
                  <View style={s.navRow}>
                    <View style={[s.navIcon, { backgroundColor: "#F59E0B" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.navTitle}>Fotos / Notizen</Text>
                      <Text style={s.navSub}>Dokumentation & Anhänge</Text>
                    </View>
                  </View>
                </Pressable>
              </>
            )}

            <View style={{ height: 22 }} />

            <Modal
              visible={pdfOpen}
              transparent
              animationType="fade"
              onRequestClose={() => setPdfOpen(false)}
            >
              <View style={s.pdfBackdrop}>
                <View style={s.pdfCard}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View
                      style={[
                        s.navIcon,
                        { backgroundColor: "#6B7280", height: 28 },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.pdfTitle}>Projekt PDFs</Text>
                      <Text style={s.pdfSub}>{projektAnzeige}</Text>
                    </View>

                    <Pressable
                      style={s.pdfClose}
                      onPress={() => setPdfOpen(false)}
                    >
                      <Text style={s.pdfCloseTxt}>Schließen</Text>
                    </Pressable>
                  </View>

                  <View style={{ height: 12 }} />

                  <FlatList
                    data={pdfRows}
                    keyExtractor={(it, idx) =>
                      `${String(it?.name || "pdf")}__${String(
                        it?.url || "local"
                      )}__${idx}`
                    }
                    ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                    renderItem={({ item }: any) => {
                      const offline = !!item.offline;
                      const busy = !!item.busy;

                      return (
                        <View style={s.pdfItemRow}>
                          <Pressable
                            style={s.pdfItem}
                            onPress={() => openPdfItem(item)}
                          >
                            <Text style={s.pdfItemName}>{item.name}</Text>
                            <Text style={s.pdfItemMeta}>
                              {item.folder ? `${item.folder} • ` : ""}
                              {item.mtime ? item.mtime : "Server"}
                            </Text>
                          </Pressable>

                          <View style={s.pdfActions}>
                            {offline ? (
                              <>
                                <View style={s.badgeOffline}>
                                  <Text style={s.badgeOfflineTxt}>Offline</Text>
                                </View>
                                <Pressable
                                  style={[
                                    s.btnDangerSmall,
                                    busy ? { opacity: 0.6 } : null,
                                  ]}
                                  onPress={() => deletePdfItem(item)}
                                  disabled={busy}
                                >
                                  <Text style={s.btnTxtWhite}>
                                    {busy ? "…" : "X"}
                                  </Text>
                                </Pressable>
                              </>
                            ) : (
                              <Pressable
                                style={[
                                  s.btnPrimarySmall,
                                  busy ? { opacity: 0.6 } : null,
                                ]}
                                onPress={() => downloadPdfItem(item)}
                                disabled={busy}
                              >
                                <Text style={s.btnTxtWhite}>
                                  {busy ? "…" : "Download"}
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        </View>
                      );
                    }}
                    ListEmptyComponent={
                      <View style={{ paddingVertical: 16 }}>
                        <Text style={{ opacity: 0.7, fontWeight: "700" }}>
                          Keine PDFs in der Liste.
                        </Text>
                        <Text
                          style={{
                            opacity: 0.55,
                            marginTop: 6,
                            fontWeight: "700",
                          }}
                        >
                          Server Endpoint benötigt: /api/projects/:fsKey/pdfs
                        </Text>
                      </View>
                    }
                  />
                </View>
              </View>
            </Modal>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

/* ================= styles (unchanged) ================= */

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1720" },
  bg: { flex: 1, backgroundColor: "#0B1720" },

  wrap: { flex: 1, backgroundColor: "#0B1720" },
  content: { paddingBottom: 28 },

  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: "#0B1720",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
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

  companyLogo: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  brandTop: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 14,
    fontWeight: "800",
  },
  brandSub: {
    color: "rgba(255,255,255,0.60)",
    marginTop: 2,
    fontSize: 12,
    fontWeight: "800",
  },

  h1: { marginTop: 10, fontSize: 34, fontWeight: "900", color: "#fff" },

  pillRow: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  badgeTxt: {
    fontWeight: "900",
    color: "rgba(255,255,255,0.90)",
    fontSize: 12,
  },
  badgeOk: {},
  badgeWarn: {
    borderColor: "rgba(234,88,12,0.35)",
    backgroundColor: "rgba(234,88,12,0.14)",
  },

  baHintBox: {
    marginTop: 12,
    backgroundColor: "rgba(234,88,12,0.14)",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(234,88,12,0.35)",
  },
  baHintTitle: { fontWeight: "900", color: "#FDBA74", fontSize: 13 },
  baHintText: {
    marginTop: 6,
    fontWeight: "800",
    color: "rgba(255,255,255,0.78)",
    lineHeight: 18,
  },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    marginBottom: 12,
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

  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  accentBar: {
    width: 6,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#2563EB",
  },

  cardTitle: { fontSize: 16, fontWeight: "900", color: "#0B1720" },
  cardSub: {
    marginTop: 2,
    opacity: 0.65,
    fontWeight: "800",
    color: "#0B1720",
  },

  sessionLine: {
    marginTop: 10,
    fontSize: 14,
    opacity: 0.9,
    fontWeight: "800",
    color: "#0B1720",
  },
  sessionStrong: { fontWeight: "900", color: "#0B1720" },

  btnOutline: {
    borderWidth: 1.5,
    borderColor: "rgba(11,23,32,0.25)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  btnOutlineTxt: { fontWeight: "900", color: "#0B1720" },

  kv: { marginTop: 12 },
  k: { fontWeight: "900", opacity: 0.7, fontSize: 12, color: "#0B1720" },
  v: { fontWeight: "900", fontSize: 15, marginTop: 4, color: "#0B1720" },

  syncCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#111",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  syncTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  syncSub: {
    color: "rgba(255,255,255,0.78)",
    marginTop: 4,
    fontWeight: "800",
  },
  syncPill: {
    minWidth: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  syncPillTxt: { color: "#fff", fontWeight: "900" },

  navCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  navCardStrong: {
    borderColor: "rgba(37,99,235,0.25)",
    backgroundColor: "rgba(219,234,254,0.85)",
  },

  navRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  navIcon: { width: 12, height: 42, borderRadius: 999 },
  navTitle: { fontSize: 17, fontWeight: "900", color: "#0B1720" },
  navSub: { opacity: 0.65, marginTop: 5, fontWeight: "800", color: "#0B1720" },

  pdfBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  pdfCard: {
    width: "100%",
    maxWidth: 640,
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    maxHeight: "80%",
  },
  pdfTitle: { fontSize: 16, fontWeight: "900", color: "#0B1720" },
  pdfSub: {
    marginTop: 2,
    opacity: 0.65,
    fontWeight: "800",
    color: "#0B1720",
  },
  pdfClose: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.18)",
    backgroundColor: "#fff",
  },
  pdfCloseTxt: { fontWeight: "900", color: "#0B1720" },

  pdfItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    backgroundColor: "rgba(255,255,255,0.94)",
  },

  pdfItem: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pdfItemName: { fontWeight: "900", fontSize: 14, color: "#0B1720" },
  pdfItemMeta: {
    marginTop: 4,
    opacity: 0.6,
    fontWeight: "800",
    fontSize: 12,
    color: "#0B1720",
  },

  pdfActions: { flexDirection: "row", alignItems: "center", gap: 8 },

  btnPrimarySmall: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#111",
  },
  btnDangerSmall: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#DC2626",
  },

  btnTxtWhite: { color: "#fff", fontWeight: "900" },

  badgeOffline: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.25)",
  },
  badgeOfflineTxt: { fontWeight: "900", color: "#065F46", fontSize: 12 },
});
