import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_EMAIL = "rlc_local_email_v1";
const KEY_PWHASH = "rlc_local_pwhash_v1";
const KEY_LOGGED = "rlc_local_logged_v1";

async function sha256(input: string): Promise<string> {
  // Expo/RN: usa SubtleCrypto se disponibile, fallback semplice (non crittografico) se no.
  const s = String(input || "");
  // @ts-ignore
  if (globalThis?.crypto?.subtle?.digest) {
    const enc = new TextEncoder().encode(s);
    // @ts-ignore
    const buf = await globalThis.crypto.subtle.digest("SHA-256", enc);
    const arr = Array.from(new Uint8Array(buf));
    return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // fallback (minimo): NON perfetto, ma evita blocchi su device vecchi
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

export async function localRegister(email: string, password: string) {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !e.includes("@")) throw new Error("E-Mail ungültig.");
  const p = String(password || "");
  if (p.length < 6) throw new Error("Passwort zu kurz (min. 6).");
  const hash = await sha256(p);
  await AsyncStorage.multiSet([
    [KEY_EMAIL, e],
    [KEY_PWHASH, hash],
    [KEY_LOGGED, "1"],
  ]);
  return { email: e };
}

export async function localLogin(email: string, password: string) {
  const e = String(email || "").trim().toLowerCase();
  const storedEmail = (await AsyncStorage.getItem(KEY_EMAIL)) || "";
  const storedHash = (await AsyncStorage.getItem(KEY_PWHASH)) || "";
  if (!storedEmail || !storedHash) throw new Error("Kein lokales Konto. Bitte registrieren.");
  if (e !== storedEmail) throw new Error("E-Mail stimmt nicht.");
  const hash = await sha256(String(password || ""));
  if (hash !== storedHash) throw new Error("Passwort falsch.");
  await AsyncStorage.setItem(KEY_LOGGED, "1");
  return { email: e };
}

export async function localLogout() {
  await AsyncStorage.setItem(KEY_LOGGED, "0");
}

export async function localIsLoggedIn() {
  return (await AsyncStorage.getItem(KEY_LOGGED)) === "1";
}

export async function localUserEmail() {
  return (await AsyncStorage.getItem(KEY_EMAIL)) || "";
}
