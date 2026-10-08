import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/* ============================================================
 *  COSTANTI
 * ============================================================ */

const TOKEN_KEY = "auth_token"; // ✅ token solo per SERVER_SYNC
const AUTH_STATE_KEY_BASE = "rlc_mobile_auth_state_v1";
const AUTH_MODE_KEY = "rlc_mobile_auth_mode_v1"; // ✅ per ricordare l'ultima modalità usata

// 🔐 ADMIN DEV (solo sviluppo)
const ADMIN_EMAIL = "";
const ADMIN_KEY = ""; // No admin secrets in a distributed application.

/* ============================================================
 *  TYPES
 * ============================================================ */

export type AuthMode = "NUR_APP" | "SERVER_SYNC";

export type AuthState = {
  email?: string; // lowercase
  name?: string;
  role?: string; // es. ADMIN, USER
  mode?: AuthMode;
  userId?: string;
  companyId?: string;
  emailVerifiedAt?: string | null; // ISO or null
};

/* ============================================================
 *  API BASE URL (Expo)
 * ============================================================ */

function apiBaseUrl() {
  const isDev = typeof __DEV__ !== "undefined" && __DEV__;
  const candidate = String(
    process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_BASE_URL || ""
  ).trim();
  if (/^https:\/\//i.test(candidate)) return candidate.replace(/\/$/, "");
  if (isDev && /^http:\/\//i.test(candidate)) return candidate.replace(/\/$/, "");
  return "https://api.rlcbausoftware.com";
}

/* ============================================================
 *  MODE SCOPING
 * ============================================================ */

function normalizeMode(m: any): AuthMode {
  return m === "NUR_APP" ? "NUR_APP" : "SERVER_SYNC";
}

function authStateKeyForMode(mode: AuthMode) {
  return `${AUTH_STATE_KEY_BASE}:${mode}`;
}

/**
 * Persisti esplicitamente la modalità corrente.
 * Chiamala quando l'utente cambia toggle SERVER/NUR_APP.
 */
export async function setAuthMode(mode: AuthMode): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_MODE_KEY, normalizeMode(mode));
  } catch {
    // ignore
  }
}

/** Ritorna la modalità salvata (default SERVER_SYNC). */
export async function getAuthMode(): Promise<AuthMode> {
  try {
    const m = await AsyncStorage.getItem(AUTH_MODE_KEY);
    return normalizeMode(m);
  } catch {
    return "SERVER_SYNC";
  }
}

/* ============================================================
 *  TOKEN HELPERS (SERVER_SYNC)
 * ============================================================ */

function normalizeToken(t: any): string {
  const s = String(t ?? "").trim();
  if (!s) return "";
  if (s === "null" || s === "undefined") return "";
  const candidate = s.toLowerCase().startsWith("bearer ") ? s.slice(7).trim() : s;
  // Historic NUR_APP tokens are not real JWTs and must never reach the API.
  if (candidate.toLowerCase().startsWith("local:")) return "";
  return candidate;
}

export async function setToken(token: string) {
  const t = normalizeToken(token);
  if (!t) {
    await clearToken();
    return;
  }

  // Secrets must never be persisted in unencrypted AsyncStorage.
  await SecureStore.setItemAsync(TOKEN_KEY, t);
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
}

export async function getToken(): Promise<string> {
  try {
    const t = normalizeToken(await SecureStore.getItemAsync(TOKEN_KEY));
    if (t) {
      // Remove plaintext tokens left behind by older installations.
      await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
      return t;
    }
  } catch {
    // ignore
  }

  // One-time migration of tokens saved by older TestFlight builds.
  const legacy = normalizeToken(await AsyncStorage.getItem(TOKEN_KEY));
  if (!legacy) return "";
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, legacy);
    await AsyncStorage.removeItem(TOKEN_KEY);
    return legacy;
  } catch {
    return ""; // Never continue using an insecure token fallback.
  }
}

export async function getTokenOrNull(): Promise<string | null> {
  const t = normalizeToken(await getToken());
  return t ? t : null;
}

export async function hasToken(): Promise<boolean> {
  const t = await getToken();
  return !!normalizeToken(t);
}

export async function clearToken() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // ignore
  }
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

/* ============================================================
 *  AUTH STATE (SCOPED PER MODE)
 * ============================================================ */

function normalizeEmail(v: any): string | undefined {
  const s = String(v ?? "").trim().toLowerCase();
  return s ? s : undefined;
}

/**
 * Legge lo stato auth per la mode corrente (se omessa, usa getAuthMode()).
 */
export async function getAuthState(mode?: AuthMode): Promise<AuthState | null> {
  const m = mode || (await getAuthMode());
  const key = authStateKeyForMode(m);

  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthState;
    return {
      ...parsed,
      mode: normalizeMode(parsed.mode || m),
      email: normalizeEmail(parsed.email),
    };
  } catch {
    return null;
  }
}

/**
 * Scrive lo stato auth per la mode indicata (se manca, usa next.mode o getAuthMode()).
 */
export async function setAuthState(next: AuthState, mode?: AuthMode): Promise<void> {
  const m = mode || normalizeMode(next?.mode) || (await getAuthMode());
  const key = authStateKeyForMode(m);

  try {
    const fixed: AuthState = {
      ...next,
      mode: m,
      email: normalizeEmail(next?.email),
    };
    await AsyncStorage.setItem(key, JSON.stringify(fixed));
    await setAuthMode(m); // mantiene coerenza
  } catch {
    // ignore
  }
}

/**
 * Patch dello stato per una mode (default: mode corrente).
 */
export async function patchAuthState(
  patch: Partial<AuthState>,
  mode?: AuthMode
): Promise<AuthState | null> {
  const m = mode || (await getAuthMode());
  const prev = (await getAuthState(m)) || {};
  const next: AuthState = {
    ...prev,
    ...patch,
    mode: m,
    email: patch.email !== undefined ? normalizeEmail(patch.email) : prev.email,
  };
  await setAuthState(next, m);
  return next;
}

export function isEmailVerified(state: AuthState | null, email: string): boolean {
  if (!state) return false;
  const e = String(email || "").trim().toLowerCase();
  const sEmail = String(state.email || "").trim().toLowerCase();
  const vAt = String(state.emailVerifiedAt || "").trim();
  return !!e && !!vAt && !!sEmail && sEmail === e;
}

/* ============================================================
 *  ADMIN LOGIN (DEV ONLY) -> SERVER_SYNC
 * ============================================================ */

export async function adminLoginDev(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const IS_DEV = typeof __DEV__ !== "undefined" ? __DEV__ : false;
  if (!IS_DEV || !ADMIN_EMAIL || !ADMIN_KEY) {
    return { ok: false, error: "ADMIN_LOGIN_DISABLED" };
  }

  try {
    const url = `${apiBaseUrl()}/api/auth/admin-login`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": ADMIN_KEY,
      },
      body: JSON.stringify({ email: ADMIN_EMAIL }),
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok || !data?.token) {
      return { ok: false, error: String(data?.error || `HTTP_${resp.status}`) };
    }

    await setToken(String(data.token));

    const nowIso = new Date().toISOString();
    await setAuthState(
      {
        email: ADMIN_EMAIL,
        name: "Roberto",
        role: "ADMIN",
        mode: "SERVER_SYNC",
        userId: "admin-bypass",
        emailVerifiedAt: nowIso,
      },
      "SERVER_SYNC"
    );

    return { ok: true, token: String(data.token) };
  } catch (e: any) {
    return { ok: false, error: e?.message || "ADMIN_LOGIN_FAILED" };
  }
}

/* ============================================================
 *  LOGOUT
 * ============================================================ */

/**
 * Logout per una mode specifica.
 * - SERVER_SYNC: cancella token + auth_state:SERVER_SYNC
 * - NUR_APP: cancella solo auth_state:NUR_APP
 *
 * Se non passi mode, usa la mode corrente.
 */
export async function logout(mode?: AuthMode): Promise<void> {
  const m = mode || (await getAuthMode());

  if (m === "SERVER_SYNC") {
    await clearToken();
  }

  try {
    await AsyncStorage.removeItem(authStateKeyForMode(m));
  } catch {
    // ignore
  }
}

/**
 * Pulisce TUTTO (entrambi i profili) — utile per "Reset totale".
 */
export async function logoutAll(): Promise<void> {
  await clearToken();
  try {
    await AsyncStorage.removeItem(authStateKeyForMode("SERVER_SYNC"));
    await AsyncStorage.removeItem(authStateKeyForMode("NUR_APP"));
    await AsyncStorage.removeItem(AUTH_MODE_KEY);
  } catch {
    // ignore
  }
}

