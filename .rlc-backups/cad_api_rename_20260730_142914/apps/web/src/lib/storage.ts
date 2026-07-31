// apps/web/src/lib/storage.ts
import { AufmassDokument } from "./types";

const KEY = "rlc.mengenermittlung";

export function loadAufmass(projektId: string): AufmassDokument | null {
  try {
    const raw = localStorage.getItem(`${KEY}:${projektId}`);
    if (!raw) return null;
    return JSON.parse(raw) as AufmassDokument;
  } catch {
    return null;
  }
}

export function saveAufmass(doc: AufmassDokument) {
  try {
    localStorage.setItem(`${KEY}:${doc.projektId}`, JSON.stringify(doc));
  } catch {}
}
