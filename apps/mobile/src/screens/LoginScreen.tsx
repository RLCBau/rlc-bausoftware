// apps/mobile/src/screens/LoginScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, Alert, Platform, Modal, Linking, SafeAreaView, KeyboardAvoidingView, ScrollView, Keyboard, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList, type ArbeitsmodusType } from "../navigation/types";
import { api } from "../lib/api";
import { COLORS, createRlcStyles } from "../ui/theme";
import { clearToken, setToken, getToken, getAuthState, setAuthState, patchAuthState, logout, setAuthMode } from "../lib/auth";
import { getCompanyHeaderCached, getCompanyLogoUriCached, setCompanyBrandingOffline } from "../lib/companyCache";
type Props = NativeStackScreenProps<RootStackParamList, "Login">;
const IS_DEV = typeof __DEV__ !== "undefined" ? __DEV__ : false;

/** AsyncStorage keys (legacy compatibility) */
const KEY_MODE = "rlc_mobile_mode";
const KEY_LOCAL_USER = "rlc_mobile_local_user_v1";
const KEY_LAST_EMAIL_BASE = "rlc_mobile_last_email";
const KEY_PROFILE_BASE = "rlc_mobile_profile_v1";

// ✅ legacy verification state (older builds)
const KEY_EMAIL_VERIFIED_AT_BASE = "rlc_mobile_email_verified_at_v1";
const KEY_EMAIL_VERIFIED_FOR_BASE = "rlc_mobile_email_verified_for_v1";

// ✅ Local-only: verification challenge (NUR_APP)
const KEY_LOCAL_VERIFY_HASH = "rlc_mobile_local_verify_hash_v1";
const KEY_LOCAL_VERIFY_EMAIL = "rlc_mobile_local_verify_email_v1";
const KEY_LOCAL_VERIFY_TS = "rlc_mobile_local_verify_ts_v1";

// ✅ Admin unlock
const ADMIN_CODE_KEY_BASE = "rlc_admin_unlock_code_v1";
const ADMIN_UNLOCKED_KEY_BASE = "rlc_admin_unlocked_v1";
const COMPANY_NAME_KEY_BASE = "rlc_company_name_v1";

// ✅ TEST CODE per te
const TEST_ADMIN_CODE = "RLC-TEST-2026";

/** Roles */
type SessionRole = "BAULEITER" | "BUERO" | "KALKULATOR" | "POLIER" | "FAHRER" | "MITARBEITER";
const ROLE_OPTIONS: {
  key: SessionRole;
  label: string;
}[] = [{
  key: "BAULEITER",
  label: "Bauleiter"
}, {
  key: "BUERO",
  label: "Büro"
}, {
  key: "KALKULATOR",
  label: "Kalkulator"
}, {
  key: "POLIER",
  label: "Polier / Vorarbeiter"
}, {
  key: "FAHRER",
  label: "Fahrer"
}, {
  key: "MITARBEITER",
  label: "Mitarbeiter"
}];
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
  const salt = String(email || "").replace(/\s+/g, "").trim().toLowerCase();
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
async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, ms = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(input, {
      ...init,
      signal: ctrl.signal
    });
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
  if (isLicenseRequiredError(e)) {
    return "SERVER UPGRADE erforderlich: Deine Server-Lizenz ist nicht aktiv. Tippe auf „Upgrade Server“ und aktiviere den Code.";
  }
  if (msg === "offline") return "OFFLINE: Keine Internetverbindung oder Server nicht erreichbar.";
  if (msg === "timeout") return "TIMEOUT: Server antwortet nicht. Prüfe URL / Verbindung.";
  if (name.includes("abort") || msg.includes("aborted")) return "TIMEOUT: Server antwortet nicht. Prüfe URL / Verbindung.";
  if (msg.includes("network request failed") || msg.includes("failed to fetch")) return "OFFLINE: Keine Internetverbindung oder Server nicht erreichbar.";
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
  const found = ROLE_OPTIONS.find(x => x.key === r);
  return found?.label || "Rolle wählen";
}
export default function LoginScreen({
  navigation,
  route
}: Props) {
  const mode: ArbeitsmodusType = route.params?.mode || "SERVER_SYNC";
  const isStandalone = mode === "NUR_APP";
  const title = isStandalone ? "Ohne Server arbeiten" : "Mit Server verbinden";
  const mNow: "SERVER_SYNC" | "NUR_APP" = (mode === "NUR_APP" ? "NUR_APP" : "SERVER_SYNC") as any;
  const modeScopedKey = (base: string, m: "SERVER_SYNC" | "NUR_APP") => `${base}:${m}`;
  const KEY_LAST_EMAIL = `${KEY_LAST_EMAIL_BASE}:${mode}`;
  const KEY_PROFILE = `${KEY_PROFILE_BASE}:${mode}`;
  const KEY_EMAIL_VERIFIED_AT = `${KEY_EMAIL_VERIFIED_AT_BASE}:${mode}`;
  const KEY_EMAIL_VERIFIED_FOR = `${KEY_EMAIL_VERIFIED_FOR_BASE}:${mode}`;
  const KEY_MOBILE_DEVICE_ID = "rlc_mobile_device_id_v1";
  const KEY_MOBILE_LICENSE_CODE = "rlc_mobile_license_code_v1";
  async function getOrCreateMobileDeviceId() {
    // Expo Go e TestFlight hanno archivi locali separati. L'ID viene quindi
    // derivato dall'account e rimane identico passando da una build all'altra.
    const accountEmail = String(normalizedEmail || email || "").trim().toLowerCase();
    if (!accountEmail || !accountEmail.includes("@")) {
      throw new Error("Keine gÃ¼ltige E-Mail fÃ¼r die GerÃ¤teerkennung vorhanden.");
    }
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `RLC-MOBILE|${accountEmail}`);
    const stableDeviceId = `RLC-ACCOUNT-${digest.slice(0, 24)}`.toUpperCase();
    const existing = String((await AsyncStorage.getItem(KEY_MOBILE_DEVICE_ID)) || "").trim();
    if (existing !== stableDeviceId) {
      await AsyncStorage.setItem(KEY_MOBILE_DEVICE_ID, stableDeviceId);
    }
    return stableDeviceId;
  }
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<SessionRole>("BAULEITER");
  const [roleOpen, setRoleOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [effectiveApiUrl, setEffectiveApiUrl] = useState<string>(api.apiUrl);
  const [localUser, setLocalUser] = useState<LocalUser | null>(null);
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<string>("");
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyToken, setVerifyToken] = useState("");
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [licenseErr, setLicenseErr] = useState<string | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<any>(null);
  const [licenseCode, setLicenseCode] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyStreet, setCompanyStreet] = useState("");
  const [companyZipCity, setCompanyZipCity] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyMail, setCompanyMail] = useState("");
  const [companyLogoUri, setCompanyLogoUri] = useState<string | null>(null);
  const [adminCode, setAdminCode] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [postVerifyStep, setPostVerifyStep] = useState<"NONE" | "NEED_ADMIN" | "NEED_MOBILE">("NONE");
  const [webInviteCode, setWebInviteCode] = useState("");
  const [mobileActivationCode, setMobileActivationCode] = useState("");
  const [mobileActivationBusy, setMobileActivationBusy] = useState(false);
  const normalizedEmail = useMemo(() => String(email || "").replace(/\s+/g, "").trim().toLowerCase(), [email]);
  const isEmailVerified = useMemo(() => {
    return !!String(emailVerifiedAt || "").trim();
  }, [emailVerifiedAt]);
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
    if (passwordOnly) return false;
    if (!name.trim()) return true;
    if (!role) return true;
    return false;
  }, [normalizedEmail, password, name, role, loading, passwordOnly]);
  const canRegisterLocal = isStandalone && !isEmailVerified;
  const canRegisterServer = !isStandalone && !isEmailVerified;
  async function loadCachedBranding() {
    try {
      const header = await getCompanyHeaderCached();
      const logoUri = await getCompanyLogoUriCached();
      if (header?.name && !companyName) setCompanyName(String(header.name));
      if (header?.address && !companyStreet && !companyZipCity) {
        const addressRaw = String(header.address || "").trim();
        const parts = addressRaw.split(",").map(x => x.trim()).filter(Boolean);
        if (parts.length >= 2) {
          setCompanyStreet(parts[0]);
          setCompanyZipCity(parts.slice(1).join(", "));
        } else if (addressRaw) {
          setCompanyStreet(addressRaw);
        }
      }
      if (header?.phone && !companyPhone) setCompanyPhone(String(header.phone));
      if (header?.email && !companyMail) setCompanyMail(String(header.email));
      if (logoUri) setCompanyLogoUri(logoUri);
    } catch {}
  }
  async function pickCompanyLogo() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Logo", "Bitte Zugriff auf Fotos erlauben.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        allowsEditing: false
      });
      if (!res.canceled && res.assets?.[0]?.uri) {
        setCompanyLogoUri(String(res.assets[0].uri));
      }
    } catch (e: any) {
      Alert.alert("Logo", String(e?.message || "Logo-Auswahl fehlgeschlagen."));
    }
  }
  async function saveCompanyBrandingBestEffort(m: "SERVER_SYNC" | "NUR_APP") {
    const headerPayload = {
      name: String(companyName || "").trim(),
      address: [companyStreet, companyZipCity].map(x => String(x || "").trim()).filter(Boolean).join(", "),
      phone: String(companyPhone || "").trim() || null,
      email: String(companyMail || "").trim() || null
    };
    try {
      await setCompanyBrandingOffline({
        header: headerPayload,
        logoUri: companyLogoUri || undefined
      });
    } catch {}
    if (m === "SERVER_SYNC") {
      try {
        await api.updateCompanyHeaderAdmin({
          name: headerPayload.name,
          address: headerPayload.address,
          phone: headerPayload.phone || "",
          email: headerPayload.email || ""
        });
      } catch {}
      if (companyLogoUri) {
        try {
          await api.uploadCompanyLogoAdmin(companyLogoUri);
        } catch {}
      }
    }
  }
  async function checkAdminUnlocked(m: "SERVER_SYNC" | "NUR_APP") {
    try {
      const unlocked = await AsyncStorage.getItem(modeScopedKey(ADMIN_UNLOCKED_KEY_BASE, m));
      if (unlocked === "1") {
        setAdminUnlocked(true);
        const cn = String((await AsyncStorage.getItem(modeScopedKey(COMPANY_NAME_KEY_BASE, m))) || "");
        setCompanyName(cn);
        return true;
      }
      if (m === "SERVER_SYNC") {
        try {
          const st = await api.licenseStatus();
          if (st?.ok === true) {
            await AsyncStorage.setItem(modeScopedKey(ADMIN_UNLOCKED_KEY_BASE, m), "1");
            setAdminUnlocked(true);
            return true;
          }
        } catch {}
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
      if (code === TEST_ADMIN_CODE) {
        await AsyncStorage.setItem(modeScopedKey(COMPANY_NAME_KEY_BASE, m), cn);
        await AsyncStorage.setItem(modeScopedKey(ADMIN_CODE_KEY_BASE, m), code);
        await AsyncStorage.setItem(modeScopedKey(ADMIN_UNLOCKED_KEY_BASE, m), "1");
        setAdminUnlocked(true);
        setPostVerifyStep("NONE");
        return true;
      }
      if (m === "NUR_APP") {
        await AsyncStorage.setItem(modeScopedKey(COMPANY_NAME_KEY_BASE, m), cn);
        await AsyncStorage.setItem(modeScopedKey(ADMIN_CODE_KEY_BASE, m), code);
        await AsyncStorage.setItem(modeScopedKey(ADMIN_UNLOCKED_KEY_BASE, m), "1");
        setAdminUnlocked(true);
        setPostVerifyStep("NONE");
        return true;
      }
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
    } catch {}
  }
  async function loadAuthStateFirst() {
    try {
      await AsyncStorage.setItem(KEY_MODE, mode);
    } catch {}
    try {
      await setAuthMode(mode as any);
    } catch {}
    const st = await getAuthState(mode as any);
    const stEmail = String(st?.email || "").trim().toLowerCase();
    const stName = String(st?.name || "").trim();
    const stRole = st?.role;
    if (stEmail && !email) setEmail(stEmail);
    if (stName && !name) setName(stName);
    if (stRole && ROLE_OPTIONS.some(x => x.key === stRole as any)) setRole(stRole as SessionRole);
    const stVerifiedAt = String(st?.emailVerifiedAt || "").trim();
    if (stEmail && stVerifiedAt) {
      setEmailVerifiedAt(stVerifiedAt);
    } else {
      setEmailVerifiedAt("");
    }
    await checkAdminUnlocked(mNow);
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
          await setAuthState({
            email: vForNorm,
            name: name?.trim() || undefined,
            role: role,
            mode: mode as any,
            emailVerifiedAt: vAt
          }, mode as any);
          setEmailVerifiedAt(vAt);
        }
      } catch {}
    }
    const u = await loadJson<LocalUser>(KEY_LOCAL_USER);
    setLocalUser(u);
  }
  useEffect(() => {
    reloadApiUrl();
    loadAuthStateFirst();
    loadCachedBranding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function persistEmail(e: string) {
    try {
      await AsyncStorage.setItem(KEY_LAST_EMAIL, e);
    } catch {}
    await patchAuthState({
      email: String(e || "").trim().toLowerCase()
    }, mode as any);
  }
  async function persistProfile(e: string) {
    try {
      const p: LocalProfile = {
        email: e,
        name: name.trim(),
        role,
        ts: Date.now()
      };
      await saveJson(KEY_PROFILE, p);
    } catch {}
    await patchAuthState({
      email: e,
      name: name.trim(),
      role
    }, mode as any);
  }
  async function clearVerificationState() {
    setEmailVerifiedAt("");
    try {
      await AsyncStorage.multiRemove([KEY_EMAIL_VERIFIED_AT, KEY_EMAIL_VERIFIED_FOR]);
    } catch {}
    await patchAuthState({
      emailVerifiedAt: null
    }, mode as any);
    setPostVerifyStep("NONE");
  }
  async function clearAdminUnlockForMode() {
    try {
      await AsyncStorage.multiRemove([modeScopedKey(ADMIN_UNLOCKED_KEY_BASE, mNow), modeScopedKey(ADMIN_CODE_KEY_BASE, mNow), modeScopedKey(COMPANY_NAME_KEY_BASE, mNow)]);
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
    await patchAuthState({
      email: now
    }, mode as any);
    if (prev && now && prev !== now) {
      await clearVerificationState();
      await clearAdminUnlockForMode();
      try {
        const pendingFor = (await AsyncStorage.getItem(KEY_LOCAL_VERIFY_EMAIL)) || "";
        if (pendingFor && pendingFor !== now) {
          await AsyncStorage.multiRemove([KEY_LOCAL_VERIFY_EMAIL, KEY_LOCAL_VERIFY_HASH, KEY_LOCAL_VERIFY_TS]);
        }
      } catch {}
    }
  }
  function onSwitchMode() {
    Alert.alert("Modus wechseln", "Zurück zur Modus-Auswahl?", [{
      text: "Abbrechen",
      style: "cancel"
    }, {
      text: "Ja",
      style: "default",
      onPress: () => {
        navigation.reset({
          index: 0,
          routes: [{
            name: "Arbeitsmodus",
            params: {
              force: true
            } as any
          }]
        });
      }
    }]);
  }
  async function onTestConnection() {
    setErr(null);
    setLoading(true);
    try {
      const base = await api.getApiUrl();
      const r = await fetchWithTimeout(`${base}/api/health`, {
        method: "GET"
      }, 15000);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || `Health fehlgeschlagen (${r.status})`);
      }
      Alert.alert("Verbindung OK", `Server erreichbar.\n${base}`);
    } catch (e: any) {
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
    if (isStandalone) return;
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
  async function handleServerError(e: any) {
    const msg = mapLoginError(e);
    setErr(msg);
    if (!isStandalone && isLicenseRequiredError(e)) {
      setLicenseOpen(true);
      await refreshLicenseStatus();
    }
  }
  async function onHardReset() {
    setErr(null);
    setLoading(true);
    try {
      await AsyncStorage.multiRemove([KEY_LAST_EMAIL, KEY_PROFILE]);
      await clearAdminUnlockForMode();
      try {
        await logout(mode as any);
      } catch {
        try {
          await clearToken();
        } catch {}
      }
      try {
        await AsyncStorage.multiRemove([KEY_EMAIL_VERIFIED_AT, KEY_EMAIL_VERIFIED_FOR]);
      } catch {}
      try {
        await AsyncStorage.multiRemove([KEY_LOCAL_VERIFY_EMAIL, KEY_LOCAL_VERIFY_HASH, KEY_LOCAL_VERIFY_TS]);
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
    Alert.alert("Account wechseln", "Willst du diesen Modus zurücksetzen und einen anderen Account nutzen?", [{
      text: "Abbrechen",
      style: "cancel"
    }, {
      text: "Reset",
      style: "destructive",
      onPress: onHardReset
    }]);
  }
  async function sendLocalVerifyCode() {
    const e = normalizedEmail;
    const c = code6();
    const h = hash32(c);
    await AsyncStorage.setItem(KEY_LOCAL_VERIFY_EMAIL, e);
    await AsyncStorage.setItem(KEY_LOCAL_VERIFY_HASH, h);
    await AsyncStorage.setItem(KEY_LOCAL_VERIFY_TS, String(Date.now()));
    const subject = encodeURIComponent("RLC Mobile – E-Mail bestätigen");
    const body = encodeURIComponent(`Dein Bestätigungscode für RLC Mobile ist:\n\n${c}\n\n(öffne die App und füge dann den Code ein)`);
    const url = `mailto:${encodeURIComponent(e)}?subject=${subject}&body=${body}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
    } catch {}
    Alert.alert("Code erstellt", "E-Mail-App wurde geöffnet. Sende dir die Mail und füge dann den Code in der App ein.");
  }
  async function onRegisterLocal() {
    setErr(null);
    setLoading(true);
    try {
      const e = normalizedEmail;
      const pw = password;
      if (!e.includes("@")) throw new Error("Bitte gültige E-Mail eingeben.");
      if (!name.trim()) throw new Error("Bitte Name eingeben.");
      if (pw.trim().length < 6) throw new Error("Passwort muss mindestens 6 Zeichen haben.");
      if (isEmailVerified) {
        throw new Error("E-Mail ist bereits verifiziert. (Lokalen Benutzer zurücksetzen, falls nötig.)");
      }
      const u: LocalUser = {
        email: e,
        passHash: passHash(e, pw),
        createdAt: Date.now()
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
      await patchAuthState({
        email: e,
        name: name.trim(),
        role,
        emailVerifiedAt: verifiedAt
      }, mode as any);
      try {
        await AsyncStorage.setItem(KEY_EMAIL_VERIFIED_AT, verifiedAt);
        await AsyncStorage.setItem(KEY_EMAIL_VERIFIED_FOR, e);
      } catch {}
      await AsyncStorage.multiRemove([KEY_LOCAL_VERIFY_EMAIL, KEY_LOCAL_VERIFY_HASH, KEY_LOCAL_VERIFY_TS]);
      setVerifyOpen(false);
      setVerifyToken("");
      const okUnlocked = await checkAdminUnlocked("NUR_APP");
      if (!okUnlocked) {
        setPostVerifyStep("NEED_ADMIN");
        Alert.alert("Verifiziert", "E-Mail bestätigt. Bitte Firmendaten + Admin-Code eingeben.");
        return;
      }
      Alert.alert("Verifiziert", "E-Mail bestätigt. Weiter zu Projekte.");
      navigation.reset({
        index: 0,
        routes: [{
          name: "Projects"
        }]
      });
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
      const e = normalizedEmail;
      if (e !== String(existing.email || "").toLowerCase()) {
        throw new Error("E-Mail passt nicht zum lokalen Benutzer.");
      }
      if (!passwordOnly && !name.trim()) throw new Error("Bitte Name eingeben.");
      const h = passHash(e, password);
      if (h !== existing.passHash) throw new Error("Passwort falsch.");
      await persistEmail(e);
      await persistProfile(e);
      await setToken(`local:${existing.passHash}`);
      await patchAuthState({
        email: e,
        name: name.trim(),
        role
      }, mode as any);
      const okUnlocked = await checkAdminUnlocked("NUR_APP");
      if (!okUnlocked) {
        setPostVerifyStep("NEED_ADMIN");
        Alert.alert("Admin", "Bitte Firmendaten + Admin-Code eingeben.");
        return;
      }
      navigation.reset({
        index: 0,
        routes: [{
          name: "Projects"
        }]
      });
    } catch (e: any) {
      setErr(e?.message || "Login fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }
  async function onResetLocalUser() {
    Alert.alert("Lokalen Benutzer löschen", "Damit kannst du eine falsche lokale E-Mail korrigieren. Nur lokale Zugangsdaten + Verifizierung werden gelöscht.", [{
      text: "Abbrechen",
      style: "cancel"
    }, {
      text: "Löschen",
      style: "destructive",
      onPress: async () => {
        try {
          setLoading(true);
          setErr(null);
          await AsyncStorage.multiRemove([KEY_LOCAL_USER, KEY_LOCAL_VERIFY_EMAIL, KEY_LOCAL_VERIFY_HASH, KEY_LOCAL_VERIFY_TS, KEY_EMAIL_VERIFIED_AT, KEY_EMAIL_VERIFIED_FOR]);
          setLocalUser(null);
          setEmailVerifiedAt("");
          setPassword("");
          await patchAuthState({
            emailVerifiedAt: null
          }, mode as any);
          await clearAdminUnlockForMode();
          Alert.alert("OK", "Lokaler Benutzer entfernt. Du kannst neu registrieren.");
        } catch (e: any) {
          setErr(e?.message || "Löschen fehlgeschlagen");
        } finally {
          setLoading(false);
        }
      }
    }]);
  }
  async function onRegisterServer(resendOnly = false) {
    setErr(null);
    setLoading(true);
    try {
      const e = normalizedEmail;
      if (!e.includes("@")) throw new Error("Bitte gültige E-Mail eingeben.");
      if (!name.trim()) throw new Error("Bitte Name eingeben.");
      if (password.trim().length < 6) throw new Error("Passwort min. 6 Zeichen.");
      const j = await (api.register as any)(e, password, "SERVER_SYNC", {
        name: name.trim(),
        role,
        inviteCode: String(webInviteCode || "").trim() || undefined
      });
      if (j?.token) {
        try {
          await setToken(String(j.token));
        } catch {}
      }
      await clearVerificationState();
      await persistEmail(e);
      await persistProfile(e);
      await setAuthState({
        email: e,
        name: name.trim(),
        role,
        mode: "SERVER_SYNC",
        userId: j?.user?.id ? String(j.user.id) : undefined,
        emailVerifiedAt: j?.user?.emailVerifiedAt ?? null
      }, "SERVER_SYNC" as any);
      Alert.alert(resendOnly ? "E-Mail erneut gesendet" : "Registrierung OK", "Bitte E-Mail öffnen und Token nutzen. Danach 'E-Mail bestätigen'.");
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
      const j = await api.verify(token, e);
      const verifiedAt = String(j?.user?.emailVerifiedAt || "").trim() || nowIso();
      setEmailVerifiedAt(verifiedAt);
      if (j?.token) {
        try {
          await setToken(String(j.token));
        } catch {}
      }
      await patchAuthState({
        email: e,
        name: name.trim(),
        role,
        userId: j?.user?.id ? String(j.user.id) : undefined,
        emailVerifiedAt: verifiedAt
      }, "SERVER_SYNC" as any);
      try {
        await AsyncStorage.setItem(KEY_EMAIL_VERIFIED_AT, verifiedAt);
        await AsyncStorage.setItem(KEY_EMAIL_VERIFIED_FOR, e);
      } catch {}
      setVerifyOpen(false);
      setVerifyToken("");
      setPostVerifyStep("NEED_MOBILE");
      Alert.alert("Verifiziert", "E-Mail bestätigt. Bitte jetzt den Mobile-Aktivierungscode eingeben.");
      return;
    } catch (e: any) {
      await handleServerError(e);
    } finally {
      setLoading(false);
    }
  }
  async function activateMobileLicenseForLoggedInUser(codeOverride?: string) {
    const code = String(codeOverride ?? mobileActivationCode ?? "").trim().toUpperCase();
    if (!code) throw new Error("Bitte Mobile-Aktivierungscode eingeben.");
    setMobileActivationBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Kein Login-Token vorhanden. Bitte erneut anmelden.");
      const base = await api.getApiUrl();
      const deviceId = await getOrCreateMobileDeviceId();
      const deviceName = `${Platform.OS === "ios" ? "iPhone/iPad" : "Android"} – RLC Mobile`;
      const res = await fetchWithTimeout(`${base}/api/company/mobile-licenses/activate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          code,
          deviceId,
          deviceName,
          appVersion: "RLC Mobile"
        })
      }, 30000);
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.ok !== true) {
        const error = String(data?.error || `Aktivierung fehlgeschlagen (${res.status})`);
        if (error === "MOBILE_LICENSE_BLOCKED") throw new Error("Diese Mobile-Lizenz wurde gesperrt.");
        if (error === "MOBILE_LICENSE_EXPIRED") throw new Error("Dieser Mobile-Aktivierungscode ist abgelaufen.");
        if (error === "MOBILE_LICENSE_DEVICE_MISMATCH") throw new Error("Diese Mobile-Lizenz ist bereits mit einem anderen Gerät verbunden.");
        throw new Error(error);
      }
      await AsyncStorage.setItem(KEY_MOBILE_LICENSE_CODE, code);
      setPostVerifyStep("NONE");
      return data;
    } finally {
      setMobileActivationBusy(false);
    }
  }
  async function onLoginServer() {
    setErr(null);
    setLoading(true);
    try {
      const e = normalizedEmail;
      if (!e.includes("@")) throw new Error("Bitte gültige E-Mail eingeben.");
      if (!passwordOnly && !name.trim()) throw new Error("Bitte Name eingeben.");
      console.log("LOGIN EMAIL RAW:", email);
      console.log("LOGIN EMAIL NORMALIZED:", e);
      const r = await api.login(e, password, "SERVER_SYNC");
      if (!r?.token) throw new Error("Login: token missing");
      await persistEmail(e);
      await persistProfile(e);
      await setToken(String(r.token));
      const t = await getToken();
      console.log("DEBUG TOKEN after setToken (SERVER_SYNC):", t ? t.slice(0, 20) + "..." : null);
      await patchAuthState({
        email: e,
        name: name.trim(),
        role,
        userId: r?.user?.id ? String(r.user.id) : undefined,
        emailVerifiedAt: r?.user?.emailVerifiedAt ?? emailVerifiedAt ?? nowIso()
      }, "SERVER_SYNC" as any);
      const savedMobileCode = String((await AsyncStorage.getItem(KEY_MOBILE_LICENSE_CODE)) || "").trim();
      if (!savedMobileCode) {
        setPostVerifyStep("NEED_MOBILE");
        Alert.alert("Mobile-Lizenz", "Bitte Mobile-Aktivierungscode eingeben.");
        return;
      }

      // React state updates are asynchronous. Validate the stored code directly
      // so an already activated device does not reopen the activation form.
      setMobileActivationCode(savedMobileCode);
      try {
        await activateMobileLicenseForLoggedInUser(savedMobileCode);
      } catch (activationError: any) {
        setPostVerifyStep("NEED_MOBILE");
        setErr(String(activationError?.message || "Mobile-Lizenz konnte für dieses Gerät nicht bestätigt werden."));
        return;
      }
      navigation.reset({
        index: 0,
        routes: [{
          name: "Projects"
        }]
      });
    } catch (e: any) {
      await handleServerError(e);
    } finally {
      setLoading(false);
    }
  }
  async function onPasswordResetRequest() {
    setErr(null);
    setResetBusy(true);
    try {
      if (isStandalone) {
        throw new Error("Passwort-Reset ist nur im Server-Modus verfügbar.");
      }
      const e = normalizedEmail;
      if (!e.includes("@")) throw new Error("Bitte gültige E-Mail eingeben.");
      const j = await api.passwordResetRequest(e);
      if (j?.ok !== true && j?.resetSent !== true) {
        throw new Error(String(j?.error || j?.message || "Reset-Anfrage fehlgeschlagen."));
      }
      Alert.alert("Reset angefordert", "Der Reset-Code wurde versendet. Bitte Code aus der E-Mail einfügen und neues Passwort setzen.");
      setResetOpen(true);
    } catch (e: any) {
      setErr(mapLoginError(e));
    } finally {
      setResetBusy(false);
    }
  }
  async function onPasswordResetConfirm() {
    setErr(null);
    setResetBusy(true);
    try {
      if (isStandalone) {
        throw new Error("Passwort-Reset ist nur im Server-Modus verfügbar.");
      }
      const e = normalizedEmail;
      const token = String(resetToken || "").trim();
      const newPw = String(resetNewPassword || "");
      if (!e.includes("@")) throw new Error("Bitte gültige E-Mail eingeben.");
      if (!token) throw new Error("Bitte Reset-Code eingeben.");
      if (newPw.trim().length < 6) {
        throw new Error("Neues Passwort muss mindestens 6 Zeichen haben.");
      }
      const j = await api.passwordResetConfirm(token, newPw);
      if (j?.ok !== true) {
        throw new Error(String(j?.error || j?.message || "Reset fehlgeschlagen."));
      }
      const verifiedAt = String(j?.user?.emailVerifiedAt || "").trim() || nowIso();
      setEmailVerifiedAt(verifiedAt);
      setPassword(newPw);
      try {
        await AsyncStorage.setItem(KEY_EMAIL_VERIFIED_AT, verifiedAt);
        await AsyncStorage.setItem(KEY_EMAIL_VERIFIED_FOR, e);
      } catch {}
      await patchAuthState({
        email: e,
        name: name.trim(),
        role,
        userId: j?.user?.id ? String(j.user.id) : undefined,
        emailVerifiedAt: verifiedAt
      }, "SERVER_SYNC" as any);
      setResetToken("");
      setResetNewPassword("");
      setResetOpen(false);
      Alert.alert("Passwort geändert", "Dein Passwort wurde erfolgreich aktualisiert. Du kannst dich jetzt direkt anmelden.");
    } catch (e: any) {
      setErr(mapLoginError(e));
    } finally {
      setResetBusy(false);
    }
  }
  async function onLogin() {
    if (isStandalone) return onLoginLocal();
    return onLoginServer();
  }
  async function onResendVerification() {
    return onRegisterServer(true);
  }
  const canContinueFirmendaten = useMemo(() => {
    return !!String(companyName || "").trim() && !!String(adminCode || "").trim();
  }, [companyName, adminCode]);
  return <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.safe} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <ScrollView style={s.safe} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          <Pressable style={s.flex} onPress={Keyboard.dismiss} accessible={false}>
            <View style={s.page} pointerEvents="box-none">
              <View style={s.heroCard}>
                <View style={s.loginBlueprintA} />
                <View style={s.loginBlueprintB} />

                <View style={s.heroContentRow}>
                  <View style={s.heroCopy}>
                    <Text style={s.eyebrow}>RLC Bausoftware</Text>
                    <Text style={s.title}>RLC Mobile</Text>
                    <View style={s.heroAccentLine} />
                    <Text style={s.sub}>{title}</Text>
                    {!isStandalone ? <Text style={s.sub2}>API: {effectiveApiUrl}</Text> : null}
                    {isStandalone ? <Text style={s.sub2}>Lokaler Modus ohne Server-Sync</Text> : null}
                  </View>

                  <View style={s.heroBuilding}>
                    <View style={s.buildingTowerTall} />
                    <View style={s.buildingTower} />
                    <View style={s.buildingBase} />
                    <View style={s.buildingGrid1} />
                    <View style={s.buildingGrid2} />
                  </View>
                </View>
              </View>

              <View style={s.sectionCard}>
                {!passwordOnly ? <>
                    <TextInput style={[s.input, isEmailVerified ? s.inputLocked : null]} placeholder="E-Mail" placeholderTextColor={COLORS.sub} autoCapitalize="none" editable={!loading && !isEmailVerified} value={email} onChangeText={onEmailChange} />

                    <View style={s.infoCard}>
                      <Text style={s.infoText}>
                        {isEmailVerified ? `E-Mail verifiziert (${emailVerifiedAt}).` : "E-Mail nicht verifiziert: du kannst sie noch ändern. Nach Verify wird sie gesperrt."}
                      </Text>
                    </View>

                    <TextInput style={s.input} placeholder="Name" placeholderTextColor={COLORS.sub} autoCapitalize="words" editable={!loading} value={name} onChangeText={v => {
                  setName(v);
                  patchAuthState({
                    name: v.trim()
                  }, mode as any).catch(() => {});
                }} />

                    <Pressable style={[s.input, s.roleInput]} onPress={() => setRoleOpen(x => !x)} disabled={loading}>
                      <Text style={s.roleText}>{labelOfRole(role)}</Text>
                      <Text style={s.roleChevron}>{roleOpen ? "▲" : "▼"}</Text>
                    </Pressable>

                    {!isStandalone ? <>
                        <Text style={s.label}>Web-Einladungscode</Text>
                        <TextInput style={s.input} placeholder="Optional bei Registrierung" placeholderTextColor={COLORS.sub} autoCapitalize="characters" editable={!loading && !isEmailVerified} value={webInviteCode} onChangeText={setWebInviteCode} />
                        <Text style={s.mutedSmall}>
                          Nur für die Registrierung eines Web-Benutzers in einer bestehenden Firma.
                        </Text>
                      </> : null}

                    {roleOpen ? <View style={s.roleBox}>
                        {ROLE_OPTIONS.map((opt, idx) => <Pressable key={opt.key} style={[s.roleRow, idx > 0 ? s.roleRowBorder : null, opt.key === role ? s.roleRowActive : null]} onPress={() => {
                    setRole(opt.key);
                    setRoleOpen(false);
                    patchAuthState({
                      role: opt.key
                    }, mode as any).catch(() => {});
                  }}>
                            <Text style={s.roleRowTxt}>{opt.label}</Text>
                            {opt.key === role ? <Text style={s.roleRowMark}>✓</Text> : null}
                          </Pressable>)}
                      </View> : null}
                  </> : <View style={s.infoCard}>
                    <Text style={s.infoText}>
                      Passwort-Login ({normalizedEmail}) – verifiziert & freigeschaltet.
                    </Text>
                    <Pressable style={[s.linkBtn, {
                  marginTop: 10
                }]} onPress={onChangeAccount} disabled={loading}>
                      <Text style={s.linkTxt}>Account wechseln</Text>
                    </Pressable>
                  </View>}

                {postVerifyStep === "NEED_ADMIN" && isStandalone ? <View style={s.adminBox}>
                    <Text style={s.sectionTitle}>Firmendaten</Text>

                    <Text style={s.label}>Firmenname</Text>
                    <TextInput value={companyName} onChangeText={setCompanyName} placeholder="Firmenname" placeholderTextColor={COLORS.sub} autoCapitalize="words" style={s.input} editable={!adminBusy && !loading} />

                    <Text style={s.label}>Straße / Hausnummer</Text>
                    <TextInput value={companyStreet} onChangeText={setCompanyStreet} placeholder="Straße und Hausnummer" placeholderTextColor={COLORS.sub} autoCapitalize="words" style={s.input} editable={!adminBusy && !loading} />

                    <Text style={s.label}>PLZ / Ort</Text>
                    <TextInput value={companyZipCity} onChangeText={setCompanyZipCity} placeholder="PLZ Ort" placeholderTextColor={COLORS.sub} autoCapitalize="words" style={s.input} editable={!adminBusy && !loading} />

                    <Text style={s.label}>Telefon</Text>
                    <TextInput value={companyPhone} onChangeText={setCompanyPhone} placeholder="Telefon" placeholderTextColor={COLORS.sub} autoCapitalize="none" keyboardType="phone-pad" style={s.input} editable={!adminBusy && !loading} />

                    <Text style={s.label}>E-Mail Firma</Text>
                    <TextInput value={companyMail} onChangeText={setCompanyMail} placeholder="E-Mail Firma" placeholderTextColor={COLORS.sub} autoCapitalize="none" keyboardType="email-address" style={s.input} editable={!adminBusy && !loading} />

                    <Text style={s.label}>Logo</Text>
                    {companyLogoUri ? <Image source={{
                  uri: companyLogoUri
                }} style={s.logoPreview} /> : <View style={s.logoPlaceholder}>
                        <Text style={s.logoPlaceholderTxt}>Kein Logo ausgewählt</Text>
                      </View>}

                    <Pressable disabled={adminBusy || loading} onPress={pickCompanyLogo} style={({
                  pressed
                }) => [s.btnSecondary, adminBusy || loading ? s.btnDis : null, pressed && !(adminBusy || loading) ? s.pressed : null]}>
                      <Text style={s.btnSecondaryTxt}>
                        {companyLogoUri ? "Logo ändern" : "Logo auswählen"}
                      </Text>
                    </Pressable>

                    <Text style={s.label}>Admin-Code</Text>
                    <TextInput value={adminCode} onChangeText={setAdminCode} placeholder="Admin-Code" placeholderTextColor={COLORS.sub} autoCapitalize="characters" style={s.input} editable={!adminBusy && !loading} />

                    {IS_DEV ? <Text style={s.mutedSmall}>TEST (Roberto): {TEST_ADMIN_CODE}</Text> : null}

                    <Pressable disabled={!canContinueFirmendaten || adminBusy || loading} onPress={async () => {
                  try {
                    await activateAdminAndCompany(mNow);
                    await saveCompanyBrandingBestEffort(mNow);
                    navigation.reset({
                      index: 0,
                      routes: [{
                        name: "Projects"
                      }]
                    });
                  } catch (e: any) {
                    Alert.alert("Admin-Code", String(e?.message || "Fehler"));
                  }
                }} style={({
                  pressed
                }) => [s.btnPrimary, !canContinueFirmendaten || adminBusy || loading ? s.btnDis : null, pressed && canContinueFirmendaten && !(adminBusy || loading) ? s.pressed : null]}>
                      <Text style={s.btnPrimaryTxt}>
                        {adminBusy ? "..." : "Weiter zu Projekte"}
                      </Text>
                    </Pressable>
                  </View> : null}

                {postVerifyStep === "NEED_MOBILE" && !isStandalone ? <View style={s.adminBox}>
                    <Text style={s.mobileSectionTitle}>Mobile-Lizenz aktivieren</Text>
                    <Text style={s.mobileSectionHint}>
                      Gib den Mobile-Aktivierungscode ein, den der Firmenadministrator
                      in der Web-Verwaltung erstellt hat.
                    </Text>

                    <Text style={s.label}>Mobile-Aktivierungscode</Text>
                    <TextInput value={mobileActivationCode} onChangeText={setMobileActivationCode} placeholder="RLC-MOB-..." placeholderTextColor={COLORS.sub} autoCapitalize="characters" style={s.input} editable={!mobileActivationBusy && !loading} />

                    <Pressable disabled={!String(mobileActivationCode || "").trim() || mobileActivationBusy || loading} onPress={async () => {
                  try {
                    await activateMobileLicenseForLoggedInUser();
                    Alert.alert("Aktiviert", "Mobile-Lizenz erfolgreich aktiviert.");
                    navigation.reset({
                      index: 0,
                      routes: [{
                        name: "Projects"
                      }]
                    });
                  } catch (e: any) {
                    Alert.alert("Mobile-Aktivierung", String(e?.message || "Aktivierung fehlgeschlagen"));
                  }
                }} style={({
                  pressed
                }) => [s.btnPrimary, (!String(mobileActivationCode || "").trim() || mobileActivationBusy || loading) && s.btnDis, pressed && !!String(mobileActivationCode || "").trim() && !(mobileActivationBusy || loading) ? s.pressed : null]}>
                      <Text style={s.btnPrimaryTxt}>
                        {mobileActivationBusy ? "Aktiviert..." : "Mobile-Lizenz aktivieren"}
                      </Text>
                    </Pressable>
                  </View> : null}

                <View style={s.passwordRow}>
                  <TextInput style={s.passwordInput} placeholder="Passwort" placeholderTextColor={COLORS.sub} secureTextEntry={!showPassword} editable={!loading} value={password} onChangeText={setPassword} />
                  <Pressable style={s.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                    <Text style={s.eyeTxt}>{showPassword ? "🙈" : "👁"}</Text>
                  </Pressable>
                </View>

                <Text style={s.hint}>
                  {isStandalone ? "NUR_APP: Registrieren → Code per E-Mail senden → Code einfügen → Anmelden." : "SERVER: Registrieren → E-Mail bestätigen → Anmelden."}
                </Text>

                {err ? <Text style={s.err}>{err}</Text> : null}

                <Pressable style={({
                pressed
              }) => [s.btnPrimary, disabledLogin && s.btnDis, pressed && !disabledLogin ? s.pressed : null]} disabled={disabledLogin} onPress={onLogin}>
                  <Text style={s.btnPrimaryTxt}>
                    {loading ? "Bitte warten..." : "Anmelden"}
                  </Text>
                </Pressable>

                {!isStandalone ? <Pressable style={s.forgotWrap} onPress={onPasswordResetRequest} disabled={loading || resetBusy}>
                    <Text style={[s.forgotTxt, loading || resetBusy ? s.linkDisabled : null]}>
                      Passwort vergessen
                    </Text>
                  </Pressable> : null}

                {isStandalone ? <>
                    <Pressable style={({
                  pressed
                }) => [s.btnSecondary, (!canRegisterLocal || loading) && s.btnDis, pressed && canRegisterLocal && !loading ? s.pressed : null]} disabled={!canRegisterLocal || loading} onPress={onRegisterLocal}>
                      <Text style={s.btnSecondaryTxt}>
                        {loading ? "Bitte warten..." : "Registrieren (NUR_APP) + Code senden"}
                      </Text>
                    </Pressable>

                    <Pressable style={({
                  pressed
                }) => [s.btnSecondary, loading && s.btnDis, pressed && !loading ? s.pressed : null]} disabled={loading} onPress={() => setVerifyOpen(true)}>
                      <Text style={s.btnSecondaryTxt}>E-Mail bestätigen (Code)</Text>
                    </Pressable>

                    {localUser ? <Pressable style={({
                  pressed
                }) => [s.btnDangerOutline, loading && s.btnDis, pressed && !loading ? s.pressed : null]} disabled={loading} onPress={onResetLocalUser}>
                        <Text style={s.btnDangerOutlineTxt}>
                          Lokalen Benutzer zurücksetzen
                        </Text>
                      </Pressable> : null}
                  </> : <>
                    <Pressable style={({
                  pressed
                }) => [s.btnSecondary, (!canRegisterServer || loading) && s.btnDis, pressed && canRegisterServer && !loading ? s.pressed : null]} disabled={!canRegisterServer || loading} onPress={() => onRegisterServer(false)}>
                      <Text style={s.btnSecondaryTxt}>
                        {loading ? "Bitte warten..." : "Registrieren (Server)"}
                      </Text>
                    </Pressable>

                    <Pressable style={({
                  pressed
                }) => [s.btnSecondary, loading && s.btnDis, pressed && !loading ? s.pressed : null]} disabled={loading} onPress={() => setVerifyOpen(true)}>
                      <Text style={s.btnSecondaryTxt}>E-Mail bestätigen (Token)</Text>
                    </Pressable>

                    {!isEmailVerified ? <Pressable style={({
                  pressed
                }) => [s.btnSecondary, loading && s.btnDis, pressed && !loading ? s.pressed : null]} disabled={loading} onPress={onResendVerification}>
                        <Text style={s.btnSecondaryTxt}>Bestätigung erneut senden</Text>
                      </Pressable> : null}

                    <Pressable style={({
                  pressed
                }) => [s.btnSecondary, loading && s.btnDis, pressed && !loading ? s.pressed : null]} disabled={loading} onPress={onTestConnection}>
                      <Text style={s.btnSecondaryTxt}>
                        {loading ? "Bitte warten..." : "Verbindung testen"}
                      </Text>
                    </Pressable>

                    <Pressable style={({
                  pressed
                }) => [s.btnSecondary, (loading || licenseLoading) && s.btnDis, pressed && !(loading || licenseLoading) ? s.pressed : null]} disabled={loading || licenseLoading} onPress={async () => {
                  setLicenseOpen(true);
                  await refreshLicenseStatus();
                }}>
                      <Text style={s.btnSecondaryTxt}>
                        {licenseLoading ? "Bitte warten..." : "Upgrade Server"}
                      </Text>
                    </Pressable>

                    
                  </>}

                <View style={s.linksWrap}>
                  <Pressable style={s.linkBtn} onPress={onSwitchMode}>
                    <Text style={s.linkTxt}>Modus wechseln</Text>
                  </Pressable>

                  {!isStandalone ? <Pressable style={s.linkBtn} onPress={onHardReset} disabled={loading}>
                      <Text style={[s.linkTxt, {
                    opacity: loading ? 0.5 : 1
                  }]}>
                        Reset Login
                      </Text>
                    </Pressable> : null}
                </View>
              </View>

              <View style={s.bottomSpace} />
            </View>
          </Pressable>
        </ScrollView>

        <Modal visible={verifyOpen} transparent animationType="slide" onRequestClose={() => setVerifyOpen(false)}>
          <View style={s.modalWrap}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>E-Mail bestätigen</Text>
              <Text style={s.modalHint}>
                {isStandalone ? "Code aus deiner E-Mail einfügen." : "Token aus der E-Mail einfügen (oder aus dem Link extrahieren)."}
              </Text>

              <TextInput style={s.modalInput} placeholder={isStandalone ? "6-stelliger Code" : "Verify-Token"} placeholderTextColor={COLORS.sub} autoCapitalize="none" editable={!loading} value={verifyToken} onChangeText={setVerifyToken} />

              <View style={s.modalActions}>
                <Pressable style={({
                pressed
              }) => [s.modalBtnPrimary, loading && s.btnDis, pressed && !loading ? s.pressed : null]} disabled={loading} onPress={isStandalone ? onVerifyLocalCode : onVerifyServerToken}>
                  <Text style={s.modalBtnPrimaryTxt}>Verify</Text>
                </Pressable>

                <Pressable style={({
                pressed
              }) => [s.modalBtnSecondary, loading && s.btnDis, pressed && !loading ? s.pressed : null]} disabled={loading} onPress={() => {
                setVerifyOpen(false);
                setVerifyToken("");
              }}>
                  <Text style={s.modalBtnSecondaryTxt}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={resetOpen} transparent animationType="slide" onRequestClose={() => {
        if (resetBusy) return;
        setResetOpen(false);
      }}>
          <View style={s.modalWrap}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>Passwort zurücksetzen</Text>
              <Text style={s.modalHint}>
                Reset-Code aus der E-Mail eingeben und neues Passwort setzen.
              </Text>

              <TextInput style={s.modalInput} placeholder="Reset-Code" placeholderTextColor={COLORS.sub} autoCapitalize="none" editable={!resetBusy} value={resetToken} onChangeText={setResetToken} />

              <TextInput style={s.modalInput} placeholder="Neues Passwort" placeholderTextColor={COLORS.sub} secureTextEntry editable={!resetBusy} value={resetNewPassword} onChangeText={setResetNewPassword} />

              <View style={s.modalActions}>
                <Pressable style={({
                pressed
              }) => [s.modalBtnPrimary, resetBusy && s.btnDis, pressed && !resetBusy ? s.pressed : null]} disabled={resetBusy} onPress={onPasswordResetConfirm}>
                  <Text style={s.modalBtnPrimaryTxt}>
                    {resetBusy ? "..." : "Passwort setzen"}
                  </Text>
                </Pressable>

                <Pressable style={({
                pressed
              }) => [s.modalBtnSecondary, resetBusy && s.btnDis, pressed && !resetBusy ? s.pressed : null]} disabled={resetBusy} onPress={() => {
                setResetOpen(false);
                setResetToken("");
                setResetNewPassword("");
              }}>
                  <Text style={s.modalBtnSecondaryTxt}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={licenseOpen} transparent animationType="slide" onRequestClose={() => setLicenseOpen(false)}>
          <View style={s.modalWrap}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>Server Upgrade</Text>
              <Text style={s.modalHint}>
                Lizenzstatus prüfen und Upgrade-Code aktivieren.
              </Text>

              <View style={s.licenseBox}>
                <Text style={s.licenseSmall}>Status</Text>
                <Text style={s.licenseStrong}>
                  {licenseLoading ? "Lade..." : licenseInfo?.ok ? "OK" : "Nicht aktiv"}
                </Text>
                {licenseInfo ? <Text style={s.licenseJson} numberOfLines={6}>
                    {JSON.stringify(licenseInfo)}
                  </Text> : null}
              </View>

              <TextInput style={s.modalInput} placeholder="Upgrade-Code" placeholderTextColor={COLORS.sub} autoCapitalize="none" editable={!licenseLoading} value={licenseCode} onChangeText={setLicenseCode} />

              {licenseErr || err ? <Text style={s.err}>{licenseErr || err}</Text> : null}

              <View style={s.modalActions}>
                <Pressable style={({
                pressed
              }) => [s.modalBtnPrimary, licenseLoading && s.btnDis, pressed && !licenseLoading ? s.pressed : null]} disabled={licenseLoading} onPress={onActivateLicense}>
                  <Text style={s.modalBtnPrimaryTxt}>
                    {licenseLoading ? "..." : "Aktivieren"}
                  </Text>
                </Pressable>

                <Pressable style={({
                pressed
              }) => [s.modalBtnSecondary, licenseLoading && s.btnDis, pressed && !licenseLoading ? s.pressed : null]} disabled={licenseLoading} onPress={refreshLicenseStatus}>
                  <Text style={s.modalBtnSecondaryTxt}>Status</Text>
                </Pressable>

                <Pressable style={({
                pressed
              }) => [s.modalBtnSecondary, licenseLoading && s.btnDis, pressed && !licenseLoading ? s.pressed : null]} disabled={licenseLoading} onPress={() => {
                setLicenseOpen(false);
                setLicenseCode("");
                setLicenseErr(null);
              }}>
                  <Text style={s.modalBtnSecondaryTxt}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>;
}
const s = createRlcStyles("LoginScreen", {
  flex: {
    flex: 1
  },
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  scrollContent: {
    padding: 14,
    paddingTop: 18,
    paddingBottom: 28,
    flexGrow: 1
  },
  page: {
    width: "100%"
  },
  heroCard: {
    borderRadius: 14,
    padding: 14,
    minHeight: 126,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.primaryDark,
    marginBottom: 14,
    overflow: "hidden",
    shadowColor: COLORS.text,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 2
  },
  eyebrow: {
    color: COLORS.sky,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.2
  },
  title: {
    marginTop: 8,
    color: COLORS.card,
    fontSize: 18,
    lineHeight: 27,
    fontWeight: "600",
    letterSpacing: -0.8
  },
  sub: {
    marginTop: 10,
    color: COLORS.card,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  },
  sub2: {
    marginTop: 6,
    color: "rgba(255,255,255,0.86)",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "400"
  },
  sectionCard: {
    borderRadius: 10,
    padding: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    shadowColor: COLORS.text,
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6
    },
    elevation: 2
  },
  sectionTitle: {
    marginTop: 8,
    color: COLORS.text,
    fontSize: 18,
    lineHeight: 31,
    fontWeight: "600",
    letterSpacing: -0.8
  },
  mobileSectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "600",
    marginBottom: 6
  },
  mobileSectionHint: {
    color: COLORS.sub,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "400",
    marginBottom: 12
  },
  passwordRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    marginBottom: 10,
    paddingHorizontal: 10
  },
  passwordInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontWeight: "400",
    marginBottom: 10
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  eyeTxt: {
    fontSize: 18
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontWeight: "400",
    marginBottom: 10
  },
  inputLocked: {
    backgroundColor: COLORS.card2,
    color: COLORS.sub
  },
  infoCard: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  infoText: {
    color: COLORS.sub,
    fontWeight: "400",
    fontSize: 12,
    lineHeight: 17
  },
  roleInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontWeight: "400",
    marginBottom: 10
  },
  roleText: {
    fontWeight: "600",
    color: COLORS.text
  },
  roleChevron: {
    color: COLORS.sub,
    fontWeight: "600"
  },
  roleBox: {
    borderRadius: 10,
    marginBottom: 10,
    overflow: "hidden",
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  roleRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  roleRowBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border
  },
  roleRowActive: {
    backgroundColor: COLORS.inputBg
  },
  roleRowTxt: {
    fontWeight: "600",
    color: COLORS.text
  },
  roleRowMark: {
    fontWeight: "600",
    color: COLORS.accent
  },
  hint: {
    marginTop: 2,
    marginBottom: 10,
    color: COLORS.sub,
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 18
  },
  err: {
    color: COLORS.danger,
    marginBottom: 10,
    fontWeight: "600",
    lineHeight: 18
  },
  btnPrimary: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 5
    },
    elevation: 4
  },
  btnPrimaryTxt: {
    color: COLORS.card,
    fontWeight: "600",
    fontSize: 16,
    textAlign: "center"
  },
  btnSecondary: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 9
  },
  btnSecondaryTxt: {
    color: COLORS.navyDark,
    fontWeight: "600",
    fontSize: 15,
    textAlign: "center"
  },
  btnDangerOutline: {
    borderWidth: 1,
    borderColor: COLORS.danger,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
    backgroundColor: COLORS.card2
  },
  btnDangerOutlineTxt: {
    color: COLORS.danger,
    fontWeight: "600",
    fontSize: 14
  },
  btnDis: {
    opacity: 0.5
  },
  pressed: {
    opacity: 0.92
  },
  linkBtn: {
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  linkTxt: {
    color: COLORS.text,
    fontWeight: "600",
    textDecorationLine: "underline"
  },
  forgotWrap: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 2
  },
  forgotTxt: {
    color: COLORS.accentDark,
    fontWeight: "600",
    textDecorationLine: "underline"
  },
  linkDisabled: {
    opacity: 0.5
  },
  linksWrap: {
    marginTop: 14,
    gap: 8
  },
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
    padding: 14
  },
  modalCard: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  modalTitle: {
    marginTop: 8,
    color: COLORS.text,
    fontSize: 18,
    lineHeight: 31,
    fontWeight: "600",
    letterSpacing: -0.8
  },
  modalHint: {
    fontSize: 12,
    color: COLORS.sub,
    marginBottom: 10,
    fontWeight: "400",
    lineHeight: 18
  },
  modalInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontWeight: "400",
    marginBottom: 10
  },
  modalActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8
  },
  modalBtnPrimary: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 5
    },
    elevation: 4
  },
  modalBtnPrimaryTxt: {
    color: COLORS.card,
    fontWeight: "600",
    fontSize: 16,
    textAlign: "center"
  },
  modalBtnSecondary: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 9
  },
  modalBtnSecondaryTxt: {
    color: COLORS.navyDark,
    fontWeight: "600",
    fontSize: 15,
    textAlign: "center"
  },
  licenseBox: {
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  licenseSmall: {
    fontSize: 12,
    color: COLORS.sub,
    fontWeight: "400"
  },
  licenseStrong: {
    fontWeight: "600",
    color: COLORS.text,
    marginTop: 4
  },
  licenseJson: {
    fontSize: 12,
    color: COLORS.sub,
    marginTop: 6,
    fontWeight: "400",
    lineHeight: 18
  },
  adminBox: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 6
  },
  mutedSmall: {
    fontSize: 12,
    fontWeight: "400",
    color: COLORS.sub,
    marginTop: -4,
    marginBottom: 8
  },
  logoPreview: {
    width: "100%",
    height: 110,
    resizeMode: "contain",
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10
  },
  logoPlaceholder: {
    height: 72,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10
  },
  logoPlaceholderTxt: {
    color: COLORS.sub,
    fontWeight: "400",
    fontSize: 12
  },
  // RLC_LOGIN_HERO_EXTRA_STYLES_V1
  loginBlueprintA: {
    position: "absolute",
    right: -20,
    top: 24,
    width: 170,
    height: 95,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    transform: [{
      rotate: "-7deg"
    }]
  },
  loginBlueprintB: {
    position: "absolute",
    right: 38,
    bottom: -22,
    width: 135,
    height: 105,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.18)",
    transform: [{
      rotate: "6deg"
    }]
  },
  heroContentRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 138,
    gap: 10
  },
  heroCopy: {
    flex: 1,
    zIndex: 2
  },
  heroAccentLine: {
    width: 34,
    height: 4,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    marginTop: 10,
    marginBottom: 8
  },
  heroBuilding: {
    width: 105,
    height: 120,
    alignItems: "center",
    justifyContent: "flex-end",
    opacity: 0.98
  },
  buildingTowerTall: {
    position: "absolute",
    right: 30,
    bottom: 24,
    width: 36,
    height: 86,
    borderRadius: 5,
    backgroundColor: "rgba(56,189,248,0.42)",
    borderWidth: 1,
    borderColor: "rgba(191,234,255,0.72)"
  },
  buildingTower: {
    position: "absolute",
    right: 4,
    bottom: 24,
    width: 34,
    height: 66,
    borderRadius: 5,
    backgroundColor: "rgba(10,132,255,0.34)",
    borderWidth: 1,
    borderColor: "rgba(191,234,255,0.56)"
  },
  buildingBase: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 76,
    height: 20,
    borderRadius: 4,
    backgroundColor: "rgba(125,211,252,0.16)",
    borderWidth: 1,
    borderColor: "rgba(191,234,255,0.35)"
  },
  buildingGrid1: {
    position: "absolute",
    right: 0,
    bottom: 44,
    width: 88,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.22)"
  },
  buildingGrid2: {
    position: "absolute",
    right: 0,
    bottom: 64,
    width: 88,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  bottomSpace: {
    height: 24
  }
});
