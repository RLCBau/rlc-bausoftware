// apps/web/src/lib/storage.ts

import { AufmassDokument } from "./types";

/* =========================================================
   CONFIG
   ========================================================= */

const KEY = "rlc.mengenermittlung";
const VERSION = 1;

/* =========================================================
   HELPERS
   ========================================================= */

function buildKey(projektId: string) {
  return `${KEY}:${projektId}`;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/* =========================================================
   LOAD
   ========================================================= */

export function loadAufmass(projektId: string): AufmassDokument | null {
  const data = safeParse<{
    version: number;
    payload: AufmassDokument;
  }>(localStorage.getItem(buildKey(projektId)));

  if (!data) return null;

  // 🔒 futura compatibilità versioni
  if (data.version !== VERSION) {
    console.warn("Aufmass version mismatch → fallback");
    return data.payload || null;
  }

  return data.payload;
}

/* =========================================================
   SAVE
   ========================================================= */

export function saveAufmass(doc: AufmassDokument) {
  try {
    const wrapped = {
      version: VERSION,
      payload: doc,
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(buildKey(doc.projektId), JSON.stringify(wrapped));
  } catch (err) {
    console.error("Save Aufmass failed", err);
  }
}

/* =========================================================
   DELETE
   ========================================================= */

export function deleteAufmass(projektId: string) {
  try {
    localStorage.removeItem(buildKey(projektId));
  } catch {}
}

/* =========================================================
   LIST (utile per debug / futuro UI)
   ========================================================= */

export function listAufmassKeys(): string[] {
  return Object.keys(localStorage).filter((k) =>
    k.startsWith(KEY)
  );
}






