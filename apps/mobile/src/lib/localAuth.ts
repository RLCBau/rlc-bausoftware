import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const KEY_EMAIL = "rlc_local_email_v1";
const KEY_PWHASH = "rlc_local_pwhash_v1"; // legacy migration only
const KEY_VERIFIER = "rlc_local_password_verifier_v2";
const KEY_LOGGED = "rlc_local_logged_v1";

type Verifier = { salt: string; hash: string; v: 2 };

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function derive(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${String(password || "")}`,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
}

async function createVerifier(password: string): Promise<Verifier> {
  const salt = bytesToHex(await Crypto.getRandomBytesAsync(16));
  return { salt, hash: await derive(password, salt), v: 2 };
}

async function saveVerifier(password: string): Promise<void> {
  const verifier = await createVerifier(password);
  await SecureStore.setItemAsync(KEY_VERIFIER, JSON.stringify(verifier));
  await AsyncStorage.removeItem(KEY_PWHASH).catch(() => {});
}

async function verifySecure(password: string): Promise<boolean | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_VERIFIER);
    if (!raw) return null;
    const v = JSON.parse(raw) as Verifier;
    if (!v?.salt || !v?.hash) return false;
    return (await derive(password, v.salt)) === v.hash;
  } catch {
    return null;
  }
}

async function legacyHash(input: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    String(input || ""),
    { encoding: Crypto.CryptoEncoding.HEX }
  );
}

export async function localRegister(email: string, password: string) {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !e.includes("@")) throw new Error("E-Mail ungültig.");
  const p = String(password || "");
  if (p.length < 8) throw new Error("Passwort zu kurz (min. 8).");
  await saveVerifier(p);
  await AsyncStorage.multiSet([[KEY_EMAIL, e], [KEY_LOGGED, "1"]]);
  return { email: e };
}

export async function localLogin(email: string, password: string) {
  const e = String(email || "").trim().toLowerCase();
  const storedEmail = (await AsyncStorage.getItem(KEY_EMAIL)) || "";
  if (!storedEmail) throw new Error("Kein lokales Konto. Bitte registrieren.");
  if (e !== storedEmail) throw new Error("E-Mail stimmt nicht.");

  const secureOk = await verifySecure(password);
  if (secureOk === false) throw new Error("Passwort falsch.");

  if (secureOk === null) {
    const legacy = (await AsyncStorage.getItem(KEY_PWHASH)) || "";
    if (!legacy || (await legacyHash(password)) !== legacy) {
      throw new Error("Passwort falsch.");
    }
    await saveVerifier(password);
  }

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
