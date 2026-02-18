// apps/mobile/src/screens/LoginScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
  Modal,
  Linking,
  SafeAreaView,
  KeyboardAvoidingView,
  ScrollView,
  Keyboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList, type ArbeitsmodusType } from "../navigation/types";
import { api } from "../lib/api";
import {
  clearToken,
  setToken,
  getAuthState,
  setAuthState,
  patchAuthState,
  logout,
  setAuthMode, // ✅ NEW: mode scoping
  // ✅ AGGIUNTO (senza eliminare niente)
  adminLoginDev,
} from "../lib/auth";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

const IS_DEV = typeof __DEV__ !== "undefined" ? __DEV__ : false;

/** AsyncStorage keys (legacy compatibility) */
const KEY_MODE = "rlc_mobile_mode";
const KEY_LOCAL_USER = "rlc_mobile_local_user_v1"; // { email, passHash, createdAt }
const KEY_LAST_EMAIL_BASE = "rlc_mobile_last_email";
const KEY_PROFILE_BASE = "rlc_mobile_profile_v1"; // { email, name, role, ts }

// ✅ legacy verification state (older builds)
const KEY_EMAIL_VERIFIED_AT_BASE = "rlc_mobile_email_verified_at_v1"; // ISO string or ""
const KEY_EMAIL_VERIFIED_FOR_BASE = "rlc_mobile_email_verified_for_v1"; // email lowercase

// ✅ Local-only: verification challenge (NUR_APP)
const KEY_LOCAL_VERIFY_HASH = "rlc_mobile_local_verify_hash_v1"; // hash32(code)
const KEY_LOCAL_VERIFY_EMAIL = "rlc_mobile_local_verify_email_v1"; // email lowercase
const KEY_LOCAL_VERIFY_TS = "rlc_mobile_local_verify_ts_v1"; // number

const API_URL_STORAGE_KEY = "api_base_url";

// ✅ Admin unlock (spostato qui, non più in Projects)
const ADMIN_CODE_KEY_BASE = "rlc_admin_unlock_code_v1";
const ADMIN_UNLOCKED_KEY_BASE = "rlc_admin_unlocked_v1";
const COMPANY_NAME_KEY_BASE = "rlc_company_name_v1";

// ✅ TEST CODE per te
const TEST_ADMIN_CODE = "RLC-TEST-2026";

/** Roles */
type SessionRole =
  | "BAULEITER"
  | "ABRECHNUNG"
  | "BUERO"
  | "POLIER"
  | "VERMESSUNG"
  | "FAHRER"
  | "MITARBEITER";

const ROLE_OPTIONS: { key: SessionRole; label: string }[] = [
  { key: "BAULEITER", label: "Bauleiter" },
  { key: "ABRECHNUNG", label: "Abrechnung" },
  { key: "BUERO", label: "Büro" },
  { key: "POLIER", label: "Polier / Vorarbeiter" },
  { key: "VERMESSUNG", label: "Vermessung" },
  { key: "FAHRER", label: "Fahrer" },
  { key: "MITARBEITER", label: "Mitarbeiter" },
];

function nowIso() {
  return new Date().toISOString();
}

function hash32(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function passHash(email: string, pw: string) {
  const salt = String(email || "").trim().toLowerCase();
  return hash32(`${salt}::${pw}`);
}
function code6() {
  const n = Math.floor(Math.random() * 900000) + 100000;
  return String(n);
}

async function loadJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
async function saveJson(key: string, value: any) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  ms = 45000
) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(input, { ...init, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/** ✅ Detect LICENSE_REQUIRED robustly (message/code/JSON-string) */
function isLicenseRequiredError(e: any) {
  const msgRaw = String(e?.message || "").trim();
  const up = msgRaw.toUpperCase();

  if (up.includes("LICENSE_REQUIRED")) return true;

  const code = String(e?.code || e?.error?.code || "").toUpperCase();
  if (code === "LICENSE_REQUIRED") return true;

  try {
    const j = JSON.parse(msgRaw);
    const c = String(j?.code || j?.error || "").toUpperCase();
    if (c === "LICENSE_REQUIRED") return true;
  } catch {}

  return false;
}

function mapLoginError(e: any) {
  const name = String(e?.name || "").toLowerCase();
  const msgRaw = String(e?.message || "").trim();
  const msg = msgRaw.toLowerCase();

  // ✅ SALES-READY license text
  if (isLicenseRequiredError(e)) {
    return "SERVER UPGRADE erforderlich: Deine Server-Lizenz ist nicht aktiv. Tippe auf „Upgrade Server“ und aktiviere den Code.";
  }

  if (msg === "offline")
    return "OFFLINE: Keine Internetverbindung oder Server nicht erreichbar.";
  if (msg === "timeout")
    return "TIMEOUT: Server antwortet nicht. Prüfe URL / Verbindung.";
  if (name.includes("abort") || msg.includes("aborted"))
    return "TIMEOUT: Server antwortet nicht. Prüfe URL / Verbindung.";
  if (msg.includes("network request failed") || msg.includes("failed to fetch"))
    return "OFFLINE: Keine Internetverbindung oder Server nicht erreichbar.";

  return msgRaw || "Login fehlgeschlagen";
}

type LocalUser = {
  email: string;
  passHash: string;
  createdAt: number;
};

type LocalProfile = {
  email: string;
  name: string;
  role: SessionRole;
  ts: number;
};

function labelOfRole(r?: SessionRole) {
  const found = ROLE_OPTIONS.find((x) => x.key === r);
  return found?.label || "Rolle wählen";
}

export default function LoginScreen({ navigation, route }: Props) {
  const mode: ArbeitsmodusType = route.params?.mode || "SERVER_SYNC";
  const isStandalone = mode === "NUR_APP";
  const title = isStandalone ? "Ohne Server arbeiten" : "Mit Server verbinden";

  const mNow: "SERVER_SYNC" | "NUR_APP" = (mode === "NUR_APP" ? "NUR_APP" : "SERVER_SYNC") as any;
  const modeScopedKey = (base: string, m: "SERVER_SYNC" | "NUR_APP") => `${base}:${m}`;

  // ✅ mode-scoped keys (prevents SERVER reset affecting NUR_APP)
  const KEY_LAST_EMAIL = `${KEY_LAST_EMAIL_BASE}:${mode}`;
  const KEY_PROFILE = `${KEY_PROFILE_BASE}:${mode}`;
  const KEY_EMAIL_VERIFIED_AT = `${KEY_EMAIL_VERIFIED_AT_BASE}:${mode}`;
  const KEY_EMAIL_VERIFIED_FOR = `${KEY_EMAIL_VERIFIED_FOR_BASE}:${mode}`;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [name, setName] = useState("");
  const [role, setRole] = useState<SessionRole>("BAULEITER");
  const [roleOpen, setRoleOpen] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [effectiveApiUrl, setEffectiveApiUrl] = useState<string>(api.apiUrl);
  const [apiOverride, setApiOverride] = useState<string>("");

  const [localUser, setLocalUser] = useState<LocalUser | null>(null);

  // ✅ unified verification state (from auth_state scoped)
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<string>("");

  // verify modal (both modes)
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyToken, setVerifyToken] = useState("");

  // ✅ Server Upgrade (License)
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [licenseErr, setLicenseErr] = useState<string | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<any>(null);
  const [licenseCode, setLicenseCode] = useState("");

  // ✅ Admin gate (post verify)
  const [companyName, setCompanyName] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [postVerifyStep, setPostVerifyStep] = useState<"NONE" | "NEED_ADMIN">("NONE");

  const normalizedEmail = useMemo(
    () => String(email || "").trim().toLowerCase(),
    [email]
  );

  const isEmailVerified = useMemo(() => {
    return !!String(emailVerifiedAt || "").trim();
  }, [emailVerifiedAt]);

  // ✅ password-only (second access): verified + adminUnlocked + profile present
  const passwordOnly = useMemo(() => {
    if (!isEmailVerified) return false;
    if (!adminUnlocked) return false;
    if (!normalizedEmail) return false;
    if (!String(name || "").trim()) return false;
    if (!role) return false;
    return true;
  }, [isEmailVerified, adminUnlocked, normalizedEmail, name, role]);

  const disabledLogin = useMemo(() => {
    if (loading) return true;
    if (!normalizedEmail || !password.trim()) return true;

    // ✅ password-only: no need to type name/role again
    if (passwordOnly) return false;

    if (!name.trim()) return true;
    if (!role) return true;
    return false;
  }, [normalizedEmail, password, name, role, loading, passwordOnly]);

  // ✅ Registration allowed while NOT verified (fix wrong email)
  const canRegisterLocal = isStandalone && !isEmailVerified;
  const canRegisterServer = !isStandalone && !isEmailVerified;

  async function checkAdminUnlocked(m: "SERVER_SYNC" | "NUR_APP") {
    try {
      const unlocked = await AsyncStorage.getItem(modeScopedKey(ADMIN_UNLOCKED_KEY_BASE, m));
      if (unlocked === "1") {
        setAdminUnlocked(true);

        const cn = String(
          (await AsyncStorage.getItem(modeScopedKey(COMPANY_NAME_KEY_BASE, m))) || ""
        );
        setCompanyName(cn);

        return true;
      }

      // SERVER_SYNC: se server dice OK -> sblocca
      if (m === "SERVER_SYNC") {
        try {
          const st = await api.licenseStatus();
          if (st?.ok === true) {
            await AsyncStorage.setItem(modeScopedKey(ADMIN_UNLOCKED_KEY_BASE, m), "1");
            setAdminUnlocked(true);
            return true;
          }
        } catch {
          // ignore
        }
      }

      setAdminUnlocked(false);
      return false;
    } catch {
      setAdminUnlocked(false);
      return false;
    }
  }

  async function activateAdminAndCompany(m: "SERVER_SYNC" | "NUR_APP") {
    const cn = String(companyName || "").trim();
    const code = String(adminCode || "").trim();

    if (!cn) throw new Error("Bitte Firmenname eingeben.");
    if (!code) throw new Error("Bitte Admin-Code eingeben.");

    setAdminBusy(true);
    try {
      // ✅ TEST code sempre valido (per te)
      if (code === TEST_ADMIN_CODE) {
        await AsyncStorage.setItem(modeScopedKey(COMPANY_NAME_KEY_BASE, m), cn);
        await AsyncStorage.setItem(modeScopedKey(ADMIN_CODE_KEY_BASE, m), code);
        await AsyncStorage.setItem(modeScopedKey(ADMIN_UNLOCKED_KEY_BASE, m), "1");
        setAdminUnlocked(true);
        setPostVerifyStep("NONE");
        return true;
      }

      if (m === "NUR_APP") {
        // offline: non verifico davvero, salvo e sblocco
        await AsyncStorage.setItem(modeScopedKey(COMPANY_NAME_KEY_BASE, m), cn);
        await AsyncStorage.setItem(modeScopedKey(ADMIN_CODE_KEY_BASE, m), code);
        await AsyncStorage.setItem(modeScopedKey(ADMIN_UNLOCKED_KEY_BASE, m), "1");
        setAdminUnlocked(true);
        setPostVerifyStep("NONE");
        return true;
      }

      // SERVER_SYNC: attivo sul server + ricontrollo
      await api.licenseActivate(code);
      const st = await api.licenseStatus();
      if (st?.ok !== true) throw new Error("Lizenz nicht aktiv. Prüfe Admin-Code.");

      await AsyncStorage.setItem(modeScopedKey(COMPANY_NAME_KEY_BASE, m), cn);
      await AsyncStorage.setItem(modeScopedKey(ADMIN_CODE_KEY_BASE, m), code);
      await AsyncStorage.setItem(modeScopedKey(ADMIN_UNLOCKED_KEY_BASE, m), "1");

      setAdminUnlocked(true);
      setPostVerifyStep("NONE");
      return true;
    } finally {
      setAdminBusy(false);
    }
  }

  async function reloadApiUrl() {
    try {
      const u = await api.getApiUrl();
      setEffectiveApiUrl(u);
      if (IS_DEV) setApiOverride(u);
    } catch {}
  }

  /**
   * ✅ FIX + MODE-SCOPED:
   * - salva la mode corrente (per auth.ts scoped)
   * - carica auth_state scoped per mode (SERVER vs NUR_APP separati)
   */
  async function loadAuthStateFirst() {
    try {
      await AsyncStorage.setItem(KEY_MODE, mode); // legacy
    } catch {}
    try {
      await setAuthMode(mode as any); // ✅ NEW
    } catch {}

    const st = await getAuthState(mode as any);

    const stEmail = String(st?.email || "").trim().toLowerCase();
    const stName = String(st?.name || "").trim();
    const stRole = st?.role;

    if (stEmail && !email) setEmail(stEmail);
    if (stName && !name) setName(stName);
    if (stRole && ROLE_OPTIONS.some((x) => x.key === (stRole as any)))
      setRole(stRole as SessionRole);

    const stVerifiedAt = String(st?.emailVerifiedAt || "").trim();
    if (stEmail && stVerifiedAt) {
      setEmailVerifiedAt(stVerifiedAt);
    } else {
      setEmailVerifiedAt("");
    }

    // ✅ load admin unlocked early (second access password-only)
    await checkAdminUnlocked(mNow);

    // fallback legacy/bootstrap (scoped first, then legacy-global as last resort)
    if (!st) {
      try {
        const lastScoped = (await AsyncStorage.getItem(KEY_LAST_EMAIL)) || "";
        const lastLegacy = (await AsyncStorage.getItem(KEY_LAST_EMAIL_BASE)) || "";
        const last = lastScoped || lastLegacy;
        if (last && !email) setEmail(last);
      } catch {}

      try {
        const pScoped = await loadJson<LocalProfile>(KEY_PROFILE);
        const pLegacy = await loadJson<LocalProfile>(KEY_PROFILE_BASE);
        const p = pScoped || pLegacy;
        if (p?.name && !name) setName(String(p.name));
        if (p?.role) setRole(p.role);
      } catch {}

      try {
        const vAtScoped = (await AsyncStorage.getItem(KEY_EMAIL_VERIFIED_AT)) || "";
        const vForScoped = (await AsyncStorage.getItem(KEY_EMAIL_VERIFIED_FOR)) || "";
        const vAtLegacy = (await AsyncStorage.getItem(KEY_EMAIL_VERIFIED_AT_BASE)) || "";
        const vForLegacy = (await AsyncStorage.getItem(KEY_EMAIL_VERIFIED_FOR_BASE)) || "";

        const vAt = vAtScoped || vAtLegacy;
        const vFor = vForScoped || vForLegacy;

        const vForNorm = String(vFor || "").trim().toLowerCase();
        if (vAt && vForNorm) {
          await setAuthState(
            {
              email: vForNorm,
              name: name?.trim() || undefined,
              role: role,
              mode: mode as any,
              emailVerifiedAt: vAt,
            },
            mode as any
          );
          setEmailVerifiedAt(vAt);
        }
      } catch {}
    }

    const u = await loadJson<LocalUser>(KEY_LOCAL_USER);
    setLocalUser(u);
  }

  useEffect(() => {
    reloadApiUrl();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    loadAuthStateFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistEmail(e: string) {
    try {
      await AsyncStorage.setItem(KEY_LAST_EMAIL, e); // ✅ scoped
    } catch {}
    await patchAuthState({ email: String(e || "").trim().toLowerCase() }, mode as any);
  }

  async function persistProfile(e: string) {
    try {
      const p: LocalProfile = {
        email: e,
        name: name.trim(),
        role,
        ts: Date.now(),
      };
      await saveJson(KEY_PROFILE, p); // ✅ scoped
    } catch {}
    await patchAuthState(
      {
        email: e,
        name: name.trim(),
        role,
      },
      mode as any
    );
  }

  async function clearVerificationState() {
    setEmailVerifiedAt("");
    try {
      await AsyncStorage.multiRemove([KEY_EMAIL_VERIFIED_AT, KEY_EMAIL_VERIFIED_FOR]);
    } catch {}
    await patchAuthState({ emailVerifiedAt: null }, mode as any);
    setPostVerifyStep("NONE");
  }

  async function clearAdminUnlockForMode() {
    try {
      await AsyncStorage.multiRemove([
        modeScopedKey(ADMIN_UNLOCKED_KEY_BASE, mNow),
        modeScopedKey(ADMIN_CODE_KEY_BASE, mNow),
        modeScopedKey(COMPANY_NAME_KEY_BASE, mNow),
      ]);
    } catch {}
    setAdminUnlocked(false);
    setCompanyName("");
    setAdminCode("");
    setPostVerifyStep("NONE");
  }

  async function onEmailChange(next: string) {
    const prev = normalizedEmail;
    const now = String(next || "").trim().toLowerCase();
    setEmail(next);

    await patchAuthState({ email: now }, mode as any);

    // ✅ se cambia email, sblocca sempre e resetta verify + admin gate
    if (prev && now && prev !== now) {
      await clearVerificationState();
      await clearAdminUnlockForMode();

      try {
        const pendingFor = (await AsyncStorage.getItem(KEY_LOCAL_VERIFY_EMAIL)) || "";
        if (pendingFor && pendingFor !== now) {
          await AsyncStorage.multiRemove([
            KEY_LOCAL_VERIFY_EMAIL,
            KEY_LOCAL_VERIFY_HASH,
            KEY_LOCAL_VERIFY_TS,
          ]);
        }
      } catch {}
    }
  }

  function onSwitchMode() {
    Alert.alert("Modus wechseln", "Zurück zur Modus-Auswahl?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Ja",
        style: "default",
        onPress: () => {
          navigation.reset({
            index: 0,
            routes: [{ name: "Arbeitsmodus", params: { force: true } as any }],
          });
        },
      },
    ]);
  }

  async function onTestConnection() {
    setErr(null);
    setLoading(true);
    try {
      const base = await api.getApiUrl();
      const r = await fetchWithTimeout(`${base}/api/health`, { method: "GET" }, 15000);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || `Health fehlgeschlagen (${r.status})`);
      }
      Alert.alert("Verbindung OK", `Server erreichbar.\n${base}`);
    } catch (e: any) {
      // ✅ if LICENSE_REQUIRED, open Upgrade Server (SERVER_SYNC only)
      const msg = mapLoginError(e);
      setErr(msg);
      if (!isStandalone && isLicenseRequiredError(e)) {
        setLicenseOpen(true);
        await refreshLicenseStatus();
      }
    } finally {
      setLoading(false);
    }
  }

  async function refreshLicenseStatus() {
    if (isStandalone) return; // solo SERVER_SYNC
    setLicenseErr(null);
    setLicenseLoading(true);
    try {
      const j = await api.licenseStatus();
      setLicenseInfo(j || null);
    } catch (e: any) {
      setLicenseErr(mapLoginError(e));
      setLicenseInfo(null);
    } finally {
      setLicenseLoading(false);
    }
  }

  async function onActivateLicense() {
    if (isStandalone) return;
    const code = String(licenseCode || "").trim();
    if (!code) {
      setLicenseErr("Bitte Code eingeben.");
      return;
    }

    setLicenseErr(null);
    setLicenseLoading(true);
    try {
      await api.licenseActivate(code);
      setLicenseCode("");
      await refreshLicenseStatus();
      Alert.alert("OK", "Server Upgrade aktiviert.");
    } catch (e: any) {
      setLicenseErr(mapLoginError(e));
    } finally {
      setLicenseLoading(false);
    }
  }

  /** ✅ Central handler: show msg + auto-open Upgrade (SERVER_SYNC only) */
  async function handleServerError(e: any) {
    const msg = mapLoginError(e);
    setErr(msg);
    if (!isStandalone && isLicenseRequiredError(e)) {
      setLicenseOpen(true);
      await refreshLicenseStatus();
    }
  }

  /**
   * ✅ HARD RESET: ora resetta SOLO la mode corrente (non rompe l'altra)
   */
  async function onHardReset() {
    setErr(null);
    setLoading(true);
    try {
      // scoped identity
      await AsyncStorage.multiRemove([KEY_LAST_EMAIL, KEY_PROFILE]);

      // ✅ clear admin unlock for this mode
      await clearAdminUnlockForMode();

      // server-only: API override reset
      if (!isStandalone) {
        await AsyncStorage.removeItem(API_URL_STORAGE_KEY);
        try {
          await api.setApiUrl("");
        } catch {}
      }

      // ✅ logout scoped
      try {
        await logout(mode as any);
      } catch {
        try {
          await clearToken();
        } catch {}
      }

      // scoped legacy verification cleanup
      try {
        await AsyncStorage.multiRemove([KEY_EMAIL_VERIFIED_AT, KEY_EMAIL_VERIFIED_FOR]);
      } catch {}

      // local verify queue cleanup (only relevant to NUR_APP, but safe)
      try {
        await AsyncStorage.multiRemove([
          KEY_LOCAL_VERIFY_EMAIL,
          KEY_LOCAL_VERIFY_HASH,
          KEY_LOCAL_VERIFY_TS,
        ]);
      } catch {}

      setPassword("");
      setEmailVerifiedAt("");
      setVerifyToken("");
      setVerifyOpen(false);
      setPostVerifyStep("NONE");

      await reloadApiUrl();
      Alert.alert("Reset", "Login-Daten (nur dieser Modus) zurückgesetzt.");
    } catch (e: any) {
      setErr(e?.message || "Reset fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  async function onChangeAccount() {
    Alert.alert("Account wechseln", "Willst du diesen Modus zurücksetzen und einen anderen Account nutzen?", [
      { text: "Abbrechen", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: onHardReset },
    ]);
  }

  /** =========================
   *  ✅ DEV: Admin bypass login (SERVER_SYNC)
   *  ========================= */
  async function onAdminDevLogin() {
    setErr(null);
    setLoading(true);
    try {
      const r = await adminLoginDev();
      if (!r || (r as any).ok !== true) {
        const msg = String((r as any)?.error || "ADMIN_LOGIN_FAILED");
        throw new Error(msg);
      }

      // aggiorna UI dallo state salvato da adminLoginDev() (SERVER_SYNC)
      const st = await getAuthState("SERVER_SYNC" as any);
      const stEmail = String(st?.email || "").trim().toLowerCase();
      const stName = String(st?.name || "").trim();
      const stRole = st?.role;

      if (stEmail) setEmail(stEmail);
      if (stName) setName(stName);
      if (stRole && ROLE_OPTIONS.some((x) => x.key === (stRole as any)))
        setRole(stRole as SessionRole);

      const stVerifiedAt = String(st?.emailVerifiedAt || "").trim();
      setEmailVerifiedAt(stVerifiedAt || nowIso());

      // ✅ after DEV login, enforce admin gate
      const okUnlocked = await checkAdminUnlocked("SERVER_SYNC");
      if (!okUnlocked) {
        setPostVerifyStep("NEED_ADMIN");
        Alert.alert("Admin", "Bitte Firmenname + Admin-Code eingeben.");
        return;
      }

      navigation.reset({
        index: 0,
        routes: [{ name: "Projects" }],
      });
    } catch (e: any) {
      await handleServerError(e);
    } finally {
      setLoading(false);
    }
  }

  /** =========================
   *  NUR_APP: local register + local verify + local login
   *  ========================= */

  async function sendLocalVerifyCode() {
    const e = normalizedEmail;
    const c = code6();
    const h = hash32(c);

    await AsyncStorage.setItem(KEY_LOCAL_VERIFY_EMAIL, e);
    await AsyncStorage.setItem(KEY_LOCAL_VERIFY_HASH, h);
    await AsyncStorage.setItem(KEY_LOCAL_VERIFY_TS, String(Date.now()));

    const subject = encodeURIComponent("RLC Mobile – E-Mail bestätigen");
    const body = encodeURIComponent(
      `Dein Bestätigungscode für RLC Mobile ist:\n\n${c}\n\n(öffne die App und füge den Code ein)`
    );
    const url = `mailto:${encodeURIComponent(e)}?subject=${subject}&body=${body}`;

    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
    } catch {}

    Alert.alert(
      "Code erstellt",
      "E-Mail-App wurde geöffnet. Sende dir die Mail und füge dann den Code in der App ein."
    );
  }

  async function onRegisterLocal() {
    setErr(null);
    setLoading(true);
    try {
      const e = normalizedEmail;
      const pw = password;

      if (!e.includes("@")) throw new Error("Bitte gültige E-Mail eingeben.");
      if (!name.trim()) throw new Error("Bitte Name eingeben.");
      if (pw.trim().length < 6)
        throw new Error("Passwort muss mindestens 6 Zeichen haben.");

      if (isEmailVerified) {
        throw new Error(
          "E-Mail ist bereits verifiziert. (Lokalen Benutzer zurücksetzen, falls nötig.)"
        );
      }

      const u: LocalUser = {
        email: e,
        passHash: passHash(e, pw),
        createdAt: Date.now(),
      };
      await saveJson(KEY_LOCAL_USER, u);
      setLocalUser(u);

      await persistEmail(e);
      await persistProfile(e);

      await clearVerificationState();
      await sendLocalVerifyCode();

      Alert.alert("Registriert", "Bitte E-Mail bestätigen, dann anmelden.");
    } catch (e: any) {
      setErr(e?.message || "Registrierung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyLocalCode() {
    setErr(null);
    setLoading(true);
    try {
      const e = normalizedEmail;
      const code = verifyToken.trim();
      if (!e.includes("@")) throw new Error("Bitte gültige E-Mail eingeben.");
      if (!code) throw new Error("Bitte Code einfügen.");

      const pendingFor = ((await AsyncStorage.getItem(KEY_LOCAL_VERIFY_EMAIL)) || "").toLowerCase();
      const pendingHash = (await AsyncStorage.getItem(KEY_LOCAL_VERIFY_HASH)) || "";

      if (!pendingFor || !pendingHash) {
        throw new Error("Kein Code vorhanden. Bitte zuerst registrieren (Code senden).");
      }
      if (pendingFor !== e) {
        throw new Error("Code gehört zu einer anderen E-Mail. Bitte E-Mail prüfen.");
      }
      if (hash32(code) !== pendingHash) {
        throw new Error("Code falsch.");
      }

      const verifiedAt = nowIso();
      setEmailVerifiedAt(verifiedAt);

      await patchAuthState(
        { email: e, name: name.trim(), role, emailVerifiedAt: verifiedAt },
        mode as any
      );

      try {
        await AsyncStorage.setItem(KEY_EMAIL_VERIFIED_AT, verifiedAt);
        await AsyncStorage.setItem(KEY_EMAIL_VERIFIED_FOR, e);
      } catch {}

      await AsyncStorage.multiRemove([
        KEY_LOCAL_VERIFY_EMAIL,
        KEY_LOCAL_VERIFY_HASH,
        KEY_LOCAL_VERIFY_TS,
      ]);

      setVerifyOpen(false);
      setVerifyToken("");

      // ✅ Admin gate immediately after verify
      const okUnlocked = await checkAdminUnlocked("NUR_APP");
      if (!okUnlocked) {
        setPostVerifyStep("NEED_ADMIN");
        Alert.alert("Verifiziert", "E-Mail bestätigt. Bitte Firmenname + Admin-Code eingeben.");
        return;
      }

      Alert.alert("Verifiziert", "E-Mail bestätigt. Weiter zu Projekte.");
      navigation.reset({ index: 0, routes: [{ name: "Projects" }] });
    } catch (e: any) {
      setErr(e?.message || "Verify fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  async function onLoginLocal() {
    setErr(null);
    setLoading(true);
    try {
      const existing = localUser || (await loadJson<LocalUser>(KEY_LOCAL_USER));
      if (!existing) throw new Error("Kein lokaler Benutzer gefunden. Bitte registrieren.");

      if (!isEmailVerified) {
        throw new Error("Bitte zuerst E-Mail bestätigen (Verify), dann anmelden.");
      }

      const e = normalizedEmail;

      if (e !== String(existing.email || "").toLowerCase()) {
        throw new Error("E-Mail passt nicht zum lokalen Benutzer.");
      }

      // ✅ password-only: name already stored, but keep current rule for first access
      if (!passwordOnly && !name.trim()) throw new Error("Bitte Name eingeben.");
      const h = passHash(e, password);
      if (h !== existing.passHash) throw new Error("Passwort falsch.");

      await persistEmail(e);
      await persistProfile(e);

      await setToken(`local:${existing.passHash}`);

      await patchAuthState(
        { email: e, name: name.trim(), role },
        mode as any
      );

      // ✅ if somehow not unlocked yet, force admin step (do NOT enter projects)
      const okUnlocked = await checkAdminUnlocked("NUR_APP");
      if (!okUnlocked) {
        setPostVerifyStep("NEED_ADMIN");
        Alert.alert("Admin", "Bitte Firmenname + Admin-Code eingeben.");
        return;
      }

      navigation.reset({ index: 0, routes: [{ name: "Projects" }] });
    } catch (e: any) {
      setErr(e?.message || "Login fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  async function onResetLocalUser() {
    Alert.alert(
      "Lokalen Benutzer löschen",
      "Damit kannst du eine falsche lokale E-Mail korrigieren. Nur lokale Zugangsdaten + Verifizierung werden gelöscht.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              setErr(null);
              await AsyncStorage.multiRemove([
                KEY_LOCAL_USER,
                KEY_LOCAL_VERIFY_EMAIL,
                KEY_LOCAL_VERIFY_HASH,
                KEY_LOCAL_VERIFY_TS,
                KEY_EMAIL_VERIFIED_AT,
                KEY_EMAIL_VERIFIED_FOR,
              ]);
              setLocalUser(null);
              setEmailVerifiedAt("");
              setPassword("");

              await patchAuthState({ emailVerifiedAt: null }, mode as any);
              await clearAdminUnlockForMode();

              Alert.alert("OK", "Lokaler Benutzer entfernt. Du kannst neu registrieren.");
            } catch (e: any) {
              setErr(e?.message || "Löschen fehlgeschlagen");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }

  /** =========================
   *  SERVER: register + verify + login
   *  ========================= */

  async function onRegisterServer(resendOnly = false) {
    setErr(null);
    setLoading(true);
    try {
      const e = normalizedEmail;
      if (!e.includes("@")) throw new Error("Bitte gültige E-Mail eingeben.");
      if (!name.trim()) throw new Error("Bitte Name eingeben.");
      if (password.trim().length < 6) throw new Error("Passwort min. 6 Zeichen.");

      const j = await api.register(e, password, "SERVER_SYNC", {
        name: name.trim(),
        role,
      });

      if (j?.token) {
        try {
          await setToken(String(j.token));
        } catch {}
      }

      await clearVerificationState();
      await persistEmail(e);
      await persistProfile(e);

      await setAuthState(
        {
          email: e,
          name: name.trim(),
          role,
          mode: "SERVER_SYNC",
          userId: j?.user?.id ? String(j.user.id) : undefined,
          emailVerifiedAt: j?.user?.emailVerifiedAt ?? null,
        },
        "SERVER_SYNC" as any
      );

      Alert.alert(
        resendOnly ? "E-Mail erneut gesendet" : "Registrierung OK",
        "Bitte E-Mail öffnen und Token nutzen. Danach 'E-Mail bestätigen'."
      );
    } catch (e: any) {
      await handleServerError(e);
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyServerToken() {
    setErr(null);
    setLoading(true);
    try {
      const e = normalizedEmail;
      const token = verifyToken.trim();
      if (!e.includes("@")) throw new Error("Bitte gültige E-Mail eingeben.");
      if (!token) throw new Error("Bitte Token einfügen.");

      // ✅ FIX: passiamo anche email (backend coerente + evita mismatch)
      const j = await api.verify(token, e);

      const verifiedAt = String(j?.user?.emailVerifiedAt || "").trim() || nowIso();
      setEmailVerifiedAt(verifiedAt);

      if (j?.token) {
        try {
          await setToken(String(j.token));
        } catch {}
      }

      await patchAuthState(
        {
          email: e,
          name: name.trim(),
          role,
          userId: j?.user?.id ? String(j.user.id) : undefined,
          emailVerifiedAt: verifiedAt,
        },
        "SERVER_SYNC" as any
      );

      try {
        await AsyncStorage.setItem(KEY_EMAIL_VERIFIED_AT, verifiedAt);
        await AsyncStorage.setItem(KEY_EMAIL_VERIFIED_FOR, e);
      } catch {}

      setVerifyOpen(false);
      setVerifyToken("");

      // ✅ Admin gate immediately after verify
      const okUnlocked = await checkAdminUnlocked("SERVER_SYNC");
      if (!okUnlocked) {
        setPostVerifyStep("NEED_ADMIN");
        Alert.alert("Verifiziert", "E-Mail bestätigt. Bitte Firmenname + Admin-Code eingeben.");
        return;
      }

      Alert.alert("Verifiziert", "E-Mail bestätigt. Weiter zu Projekte.");
      navigation.reset({ index: 0, routes: [{ name: "Projects" }] });
    } catch (e: any) {
      await handleServerError(e);
    } finally {
      setLoading(false);
    }
  }

  async function onLoginServer() {
    setErr(null);
    setLoading(true);
    try {
      const e = normalizedEmail;
      if (!e.includes("@")) throw new Error("Bitte gültige E-Mail eingeben.");

      // ✅ password-only: name already stored; do not force typing again
      if (!passwordOnly && !name.trim()) throw new Error("Bitte Name eingeben.");

      if (!isEmailVerified) {
        throw new Error("Bitte zuerst E-Mail bestätigen (Verify), dann anmelden.");
      }

      const r = await api.login(e, password, "SERVER_SYNC");
      if (!r?.token) throw new Error("Login: token missing");

      await persistEmail(e);
      await persistProfile(e);

      await setToken(String(r.token));

      await patchAuthState(
        {
          email: e,
          name: name.trim(),
          role,
          userId: r?.user?.id ? String(r.user.id) : undefined,
          emailVerifiedAt: r?.user?.emailVerifiedAt ?? emailVerifiedAt ?? nowIso(),
        },
        "SERVER_SYNC" as any
      );

      // ✅ if somehow not unlocked yet, force admin step (do NOT enter projects)
      const okUnlocked = await checkAdminUnlocked("SERVER_SYNC");
      if (!okUnlocked) {
        setPostVerifyStep("NEED_ADMIN");
        Alert.alert("Admin", "Bitte Firmenname + Admin-Code eingeben.");
        return;
      }

      navigation.reset({ index: 0, routes: [{ name: "Projects" }] });
    } catch (e: any) {
      await handleServerError(e);
    } finally {
      setLoading(false);
    }
  }

  async function onLogin() {
    if (isStandalone) return onLoginLocal();
    return onLoginServer();
  }

  async function onResendVerification() {
    return onRegisterServer(true);
  }

  async function onSaveApiOverride() {
    setErr(null);
    try {
      await api.setApiUrl(apiOverride.trim());
      await reloadApiUrl();
    } catch (e: any) {
      setErr(e?.message || "API URL speichern fehlgeschlagen");
    }
  }
  async function onResetApiOverride() {
    setErr(null);
    try {
      await api.setApiUrl("");
      await reloadApiUrl();
    } catch (e: any) {
      setErr(e?.message || "API URL Reset fehlgeschlagen");
    }
  }

  const apiSaveDisabled = useMemo(() => {
    if (!IS_DEV) return true;
    if (loading) return true;
    return !apiOverride.trim();
  }, [apiOverride, loading]);

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          style={s.safe}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* ✅ FIX: non incastrare modali dentro un Pressable. */}
          <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss} accessible={false}>
            <View style={{ width: "100%" }} pointerEvents="box-none">
              <Text style={s.title}>RLC Mobile</Text>
              <Text style={s.sub}>{title}</Text>

              {!isStandalone ? <Text style={s.sub2}>API: {effectiveApiUrl}</Text> : null}

              {IS_DEV && !isStandalone ? (
                <View style={s.devBox}>
                  <Text style={s.devTitle}>DEV – API Base URL</Text>
                  <TextInput
                    style={s.input}
                    placeholder="https://api.rlcbausoftware.com"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    autoCapitalize="none"
                    value={apiOverride}
                    onChangeText={setApiOverride}
                  />
                  <View style={s.row}>
                    <Pressable
                      style={({ pressed }) => [
                        s.smallBtn,
                        apiSaveDisabled && s.btnDis,
                        pressed && !apiSaveDisabled ? { opacity: 0.9 } : null,
                      ]}
                      disabled={apiSaveDisabled}
                      onPress={onSaveApiOverride}
                    >
                      <Text style={s.smallBtnTxt}>Save</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        s.smallBtn,
                        loading && s.btnDis,
                        pressed && !loading ? { opacity: 0.9 } : null,
                      ]}
                      disabled={loading}
                      onPress={onResetApiOverride}
                    >
                      <Text style={s.smallBtnTxt}>Reset</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        s.smallBtn,
                        loading && s.btnDis,
                        pressed && !loading ? { opacity: 0.9 } : null,
                      ]}
                      disabled={loading}
                      onPress={reloadApiUrl}
                    >
                      <Text style={s.smallBtnTxt}>Reload</Text>
                    </Pressable>
                  </View>
                  <Text style={s.devHint}>Hinweis: In Production ist API-Override deaktiviert.</Text>

                  {/* ✅ AGGIUNTO: Admin DEV Login */}
                  <Pressable
                    style={({ pressed }) => [
                      s.btnOutline,
                      loading && s.btnDis,
                      pressed && !loading ? { opacity: 0.92 } : null,
                    ]}
                    disabled={loading}
                    onPress={onAdminDevLogin}
                  >
                    <Text style={s.btnOutlineTxt}>
                      {loading ? "Bitte warten..." : "DEV: Admin Login (Roberto)"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {/* ✅ Email + Profile inputs hidden in password-only */}
              {!passwordOnly ? (
                <>
                  <TextInput
                    style={[s.input, isEmailVerified ? s.inputLocked : null]}
                    placeholder="E-Mail"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    autoCapitalize="none"
                    editable={!loading && !isEmailVerified}
                    value={email}
                    onChangeText={onEmailChange}
                  />

                  <View style={s.infoCard}>
                    <Text style={s.infoText}>
                      {isEmailVerified
                        ? `E-Mail verifiziert (${emailVerifiedAt}).`
                        : "E-Mail nicht verifiziert: du kannst sie noch ändern. Nach Verify wird sie gesperrt."}
                    </Text>
                  </View>

                  <TextInput
                    style={s.input}
                    placeholder="Name (z.B. Roberto)"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    autoCapitalize="words"
                    editable={!loading}
                    value={name}
                    onChangeText={(v) => {
                      setName(v);
                      patchAuthState({ name: v.trim() }, mode as any).catch(() => {});
                    }}
                  />

                  <Pressable
                    style={[s.input, s.roleInput]}
                    onPress={() => setRoleOpen((x) => !x)}
                    disabled={loading}
                  >
                    <Text style={s.roleText}>{labelOfRole(role)}</Text>
                    <Text style={s.roleChevron}>{roleOpen ? "▲" : "▼"}</Text>
                  </Pressable>

                  {roleOpen ? (
                    <View style={s.roleBox}>
                      {ROLE_OPTIONS.map((opt, idx) => (
                        <Pressable
                          key={opt.key}
                          style={[
                            s.roleRow,
                            idx > 0 ? s.roleRowBorder : null,
                            opt.key === role ? s.roleRowActive : null,
                          ]}
                          onPress={() => {
                            setRole(opt.key);
                            setRoleOpen(false);
                            patchAuthState({ role: opt.key }, mode as any).catch(() => {});
                          }}
                        >
                          <Text style={s.roleRowTxt}>{opt.label}</Text>
                          {opt.key === role ? <Text style={s.roleRowMark}>✓</Text> : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={s.infoCard}>
                  <Text style={s.infoText}>
                    Passwort-Login ({normalizedEmail}) – verifiziert & freigeschaltet.
                  </Text>
                  <Pressable style={[s.linkBtn, { marginTop: 10 }]} onPress={onChangeAccount} disabled={loading}>
                    <Text style={s.linkTxt}>Account wechseln</Text>
                  </Pressable>
                </View>
              )}

              {/* ✅ Admin step (after verify, only if missing unlock) */}
              {postVerifyStep === "NEED_ADMIN" ? (
                <View style={s.adminBox}>
                  <Text style={s.h2}>Firmendaten</Text>

                  <Text style={s.label}>Firmenname</Text>
                  <TextInput
                    value={companyName}
                    onChangeText={setCompanyName}
                    placeholder="z.B. LKS Tiefbau KG"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    autoCapitalize="words"
                    style={s.input}
                    editable={!adminBusy && !loading}
                  />

                  <Text style={s.label}>Admin-Code</Text>
                  <TextInput
                    value={adminCode}
                    onChangeText={setAdminCode}
                    placeholder="z.B. RLC-XXXX-XXXX"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    autoCapitalize="characters"
                    style={s.input}
                    editable={!adminBusy && !loading}
                  />

                  <Text style={s.mutedSmall}>TEST (Roberto): {TEST_ADMIN_CODE}</Text>

                  <Pressable
                    disabled={adminBusy || loading}
                    onPress={async () => {
                      try {
                        await activateAdminAndCompany(mNow);
                        navigation.reset({ index: 0, routes: [{ name: "Projects" }] });
                      } catch (e: any) {
                        Alert.alert("Admin-Code", String(e?.message || "Fehler"));
                      }
                    }}
                    style={({ pressed }) => [
                      s.btnPrimary,
                      (adminBusy || loading) ? s.btnDis : null,
                      pressed && !(adminBusy || loading) ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Text style={s.btnPrimaryTxt}>{adminBusy ? "..." : "Weiter zu Projekte"}</Text>
                  </Pressable>
                </View>
              ) : null}

              <TextInput
                style={s.input}
                placeholder="Passwort"
                placeholderTextColor="rgba(255,255,255,0.45)"
                secureTextEntry
                editable={!loading}
                value={password}
                onChangeText={setPassword}
              />

              <Text style={s.hint}>
                {isStandalone
                  ? "NUR_APP: Registrieren → Code per E-Mail senden → Code einfügen → Anmelden."
                  : "SERVER: Registrieren → E-Mail bestätigen → Anmelden."}
              </Text>

              {err ? <Text style={s.err}>{err}</Text> : null}

              <Pressable
                style={({ pressed }) => [
                  s.btn,
                  disabledLogin && s.btnDis,
                  pressed && !disabledLogin ? { opacity: 0.9, transform: [{ scale: 0.995 }] } : null,
                ]}
                disabled={disabledLogin}
                onPress={onLogin}
              >
                <Text style={s.btnTxt}>{loading ? "Bitte warten..." : "Anmelden"}</Text>
              </Pressable>

              {isStandalone ? (
                <>
                  <Pressable
                    style={({ pressed }) => [
                      s.btnOutline,
                      (!canRegisterLocal || loading) && s.btnDis,
                      pressed && canRegisterLocal && !loading ? { opacity: 0.92 } : null,
                    ]}
                    disabled={!canRegisterLocal || loading}
                    onPress={onRegisterLocal}
                  >
                    <Text style={s.btnOutlineTxt}>
                      {loading ? "Bitte warten..." : "Registrieren (NUR_APP) + Code senden"}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      s.btnOutline,
                      loading && s.btnDis,
                      pressed && !loading ? { opacity: 0.92 } : null,
                    ]}
                    disabled={loading}
                    onPress={() => setVerifyOpen(true)}
                  >
                    <Text style={s.btnOutlineTxt}>E-Mail bestätigen (Code)</Text>
                  </Pressable>

                  {localUser ? (
                    <Pressable
                      style={({ pressed }) => [
                        s.btnOutlineDanger,
                        loading && s.btnDis,
                        pressed && !loading ? { opacity: 0.92 } : null,
                      ]}
                      disabled={loading}
                      onPress={onResetLocalUser}
                    >
                      <Text style={s.btnOutlineDangerTxt}>Lokalen Benutzer zurücksetzen</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <>
                  <Pressable
                    style={({ pressed }) => [
                      s.btnOutline,
                      (!canRegisterServer || loading) && s.btnDis,
                      pressed && canRegisterServer && !loading ? { opacity: 0.92 } : null,
                    ]}
                    disabled={!canRegisterServer || loading}
                    onPress={() => onRegisterServer(false)}
                  >
                    <Text style={s.btnOutlineTxt}>
                      {loading ? "Bitte warten..." : "Registrieren (Server)"}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      s.btnOutline,
                      loading && s.btnDis,
                      pressed && !loading ? { opacity: 0.92 } : null,
                    ]}
                    disabled={loading}
                    onPress={() => setVerifyOpen(true)}
                  >
                    <Text style={s.btnOutlineTxt}>E-Mail bestätigen (Token)</Text>
                  </Pressable>

                  {!isEmailVerified ? (
                    <Pressable
                      style={({ pressed }) => [
                        s.btnOutline,
                        loading && s.btnDis,
                        pressed && !loading ? { opacity: 0.92 } : null,
                      ]}
                      disabled={loading}
                      onPress={onResendVerification}
                    >
                      <Text style={s.btnOutlineTxt}>Bestätigung erneut senden</Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    style={({ pressed }) => [
                      s.btnOutline,
                      loading && s.btnDis,
                      pressed && !loading ? { opacity: 0.92 } : null,
                    ]}
                    disabled={loading}
                    onPress={onTestConnection}
                  >
                    <Text style={s.btnOutlineTxt}>
                      {loading ? "Bitte warten..." : "Verbindung testen"}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      s.btnOutline,
                      (loading || licenseLoading) && s.btnDis,
                      pressed && !(loading || licenseLoading) ? { opacity: 0.92 } : null,
                    ]}
                    disabled={loading || licenseLoading}
                    onPress={async () => {
                      setLicenseOpen(true);
                      await refreshLicenseStatus();
                    }}
                  >
                    <Text style={s.btnOutlineTxt}>
                      {licenseLoading ? "Bitte warten..." : "Upgrade Server"}
                    </Text>
                  </Pressable>
                </>
              )}

              <View style={{ marginTop: 14, gap: 8 }}>
                <Pressable style={s.linkBtn} onPress={onSwitchMode}>
                  <Text style={s.linkTxt}>Modus wechseln</Text>
                </Pressable>

                {!isStandalone ? (
                  <Pressable style={s.linkBtn} onPress={onHardReset} disabled={loading}>
                    <Text style={[s.linkTxt, { opacity: loading ? 0.5 : 1 }]}>Reset Login</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={{ height: 24 }} />
            </View>
          </Pressable>
        </ScrollView>

        {/* ✅ Verify Modal */}
        <Modal
          visible={verifyOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setVerifyOpen(false)}
        >
          <View style={s.modalBackdrop}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>E-Mail bestätigen</Text>
              <Text style={s.modalHint}>
                {isStandalone
                  ? "Code aus deiner E-Mail einfügen."
                  : "Token aus der E-Mail einfügen (oder aus dem Link extrahieren)."}
              </Text>

              <TextInput
                style={s.input}
                placeholder={isStandalone ? "6-stelliger Code" : "Verify-Token"}
                placeholderTextColor="rgba(255,255,255,0.45)"
                autoCapitalize="none"
                editable={!loading}
                value={verifyToken}
                onChangeText={setVerifyToken}
              />

              <View style={s.row}>
                <Pressable
                  style={({ pressed }) => [
                    s.smallBtnWide,
                    loading && s.btnDis,
                    pressed && !loading ? { opacity: 0.9 } : null,
                  ]}
                  disabled={loading}
                  onPress={isStandalone ? onVerifyLocalCode : onVerifyServerToken}
                >
                  <Text style={s.smallBtnTxt}>Verify</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    s.smallBtnWide,
                    loading && s.btnDis,
                    pressed && !loading ? { opacity: 0.9 } : null,
                  ]}
                  disabled={loading}
                  onPress={() => {
                    setVerifyOpen(false);
                    setVerifyToken("");
                  }}
                >
                  <Text style={s.smallBtnTxt}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* ✅ License Modal */}
        <Modal
          visible={licenseOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setLicenseOpen(false)}
        >
          <View style={s.modalBackdrop}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>Server Upgrade</Text>
              <Text style={s.modalHint}>Lizenzstatus prüfen und Upgrade-Code aktivieren.</Text>

              <View style={s.licenseBox}>
                <Text style={s.licenseSmall}>Status</Text>
                <Text style={s.licenseStrong}>
                  {licenseLoading ? "Lade..." : licenseInfo?.ok ? "OK" : "Nicht aktiv"}
                </Text>
                {licenseInfo ? (
                  <Text style={s.licenseJson} numberOfLines={6}>
                    {JSON.stringify(licenseInfo)}
                  </Text>
                ) : null}
              </View>

              <TextInput
                style={s.input}
                placeholder="Upgrade-Code"
                placeholderTextColor="rgba(255,255,255,0.45)"
                autoCapitalize="none"
                editable={!licenseLoading}
                value={licenseCode}
                onChangeText={setLicenseCode}
              />

              {(licenseErr || err) ? <Text style={s.err}>{licenseErr || err}</Text> : null}

              <View style={s.row}>
                <Pressable
                  style={({ pressed }) => [
                    s.smallBtnWide,
                    licenseLoading && s.btnDis,
                    pressed && !licenseLoading ? { opacity: 0.9 } : null,
                  ]}
                  disabled={licenseLoading}
                  onPress={onActivateLicense}
                >
                  <Text style={s.smallBtnTxt}>{licenseLoading ? "..." : "Aktivieren"}</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    s.smallBtnWide,
                    licenseLoading && s.btnDis,
                    pressed && !licenseLoading ? { opacity: 0.9 } : null,
                  ]}
                  disabled={licenseLoading}
                  onPress={refreshLicenseStatus}
                >
                  <Text style={s.smallBtnTxt}>Status</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    s.smallBtnWide,
                    licenseLoading && s.btnDis,
                    pressed && !licenseLoading ? { opacity: 0.9 } : null,
                  ]}
                  disabled={licenseLoading}
                  onPress={() => {
                    setLicenseOpen(false);
                    setLicenseCode("");
                    setLicenseErr(null);
                  }}
                >
                  <Text style={s.smallBtnTxt}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1720" },

  // ✅ Scroll container
  scrollContent: {
    padding: 16,
    paddingTop: 18,
    paddingBottom: 28,
    flexGrow: 1,
    justifyContent: "flex-start",
    gap: 10,
  },

  title: { fontSize: 30, fontWeight: "900", color: "#fff", marginBottom: 2 },
  sub: { color: "rgba(255,255,255,0.75)", fontWeight: "800", marginBottom: 6 },
  sub2: { color: "rgba(255,255,255,0.55)", marginBottom: 12, fontWeight: "800" },

  hint: { marginTop: 2, marginBottom: 10, color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "800" },

  infoCard: {
    borderRadius: 14,
    padding: 10,
    marginTop: -2,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  infoText: { color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 12, lineHeight: 16 },

  devBox: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 8,
  },
  devTitle: { fontWeight: "900", color: "#fff" },
  devHint: { marginTop: 2, fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: "800" },

  row: { flexDirection: "row", gap: 8, marginTop: 8 },

  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontWeight: "800",
    marginBottom: 10,
  },
  inputLocked: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.16)",
    color: "rgba(255,255,255,0.75)",
  },

  roleInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Platform.select({ ios: 12, android: 10, default: 10 }),
  },
  roleText: { fontWeight: "900", color: "#fff" },
  roleChevron: { color: "rgba(255,255,255,0.65)", fontWeight: "900" },

  roleBox: {
    borderRadius: 14,
    marginBottom: 10,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  roleRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roleRowBorder: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  roleRowActive: { backgroundColor: "rgba(0,0,0,0.18)" },
  roleRowTxt: { fontWeight: "900", color: "#fff" },
  roleRowMark: { fontWeight: "900", color: "#fff" },

  err: { color: "#ff6b6b", marginBottom: 10, fontWeight: "900" },

  btn: {
    backgroundColor: "#111",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  btnOutlineDanger: {
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.55)",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  btnOutlineDangerTxt: { color: "#ff6b6b", fontWeight: "900" },

  btnDis: { opacity: 0.5 },

  btnTxt: { color: "#fff", fontWeight: "900" },
  btnOutlineTxt: { color: "#fff", fontWeight: "900" },

  smallBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  smallBtnWide: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  smallBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 12 },

  linkBtn: {
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  linkTxt: { color: "rgba(255,255,255,0.85)", fontWeight: "900", textDecorationLine: "underline" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: 14,
  },
  modalCard: {
    width: "100%",
    maxWidth: 620,
    backgroundColor: "#0B1720",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  modalTitle: { fontSize: 16, fontWeight: "900", marginBottom: 6, color: "#fff" },
  modalHint: { fontSize: 12, color: "rgba(255,255,255,0.70)", marginBottom: 10, fontWeight: "800" },

  licenseBox: {
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  licenseSmall: { fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: "800" },
  licenseStrong: { fontWeight: "900", color: "#fff", marginTop: 4 },
  licenseJson: { fontSize: 12, color: "rgba(255,255,255,0.70)", marginTop: 6, fontWeight: "800" },

  // ✅ Admin UI (new)
  adminBox: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  h2: { fontSize: 16, fontWeight: "900", color: "#fff", marginBottom: 8 },
  label: { fontSize: 12, fontWeight: "900", color: "rgba(255,255,255,0.75)", marginBottom: 6 },
  mutedSmall: { fontSize: 12, fontWeight: "800", color: "rgba(255,255,255,0.65)", marginTop: -4, marginBottom: 8 },

  btnPrimary: {
    backgroundColor: "#111",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  btnPrimaryTxt: { color: "#fff", fontWeight: "900" },
});
