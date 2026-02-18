// src/store/persist.ts
import React from "react";
import { useProject } from "./useProject";

/* ===========================
   Safe storage (fallback in-memory)
=========================== */
const memStore = new Map<string, string>();
const safeStorage = {
  getItem(key: string) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {}
    return memStore.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {}
    memStore.set(key, value);
  },
};

type Options = {
  /** Chiave logica (senza prefissi) */
  key: string;
  /** Se true, la chiave viene prefissata con l'ID progetto corrente */
  projectScoped?: boolean;
  /** Versione logica della struttura salvata per invalidare i vecchi dati */
  version?: number;
};

function resolveInitial<T>(initial: T | (() => T)): T {
  return typeof initial === "function" ? (initial as any)() : initial;
}

/* ===========================
   Hook principale
=========================== */
export function usePersistedState<T>(initial: T | (() => T), opts: Options) {
  const { key, projectScoped = false, version = 1 } = opts;

  // Il hook può essere usato prima che il provider monti: evita crash
  const { projectId } = (() => {
    try {
      return useProject();
    } catch {
      return { projectId: null } as any;
    }
  })();

  const storageKey = React.useMemo(() => {
    const base = `rlc:${key}:v${version}`;
    return projectScoped && projectId ? `prj:${projectId}:${base}` : base;
  }, [key, version, projectScoped, projectId]);

  // Stato iniziale: prova a leggere dal storage
  const [state, setState] = React.useState<T>(() => {
    const raw = safeStorage.getItem(storageKey);
    if (raw) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        // se corrotto, torna al default
        return resolveInitial(initial);
      }
    }
    return resolveInitial(initial);
  });

  // Scrivi su storage quando cambia lo stato o la chiave
  React.useEffect(() => {
    try {
      safeStorage.setItem(storageKey, JSON.stringify(state));
    } catch {}
  }, [storageKey, state]);

  // Ricarica quando cambia la chiave (es: cambio progetto / versione)
  React.useEffect(() => {
    const raw = safeStorage.getItem(storageKey);
    if (raw) {
      try {
        setState(JSON.parse(raw) as T);
        return;
      } catch {}
    }
    setState(resolveInitial(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Sync tra TAB/finestre (solo quando c'è localStorage reale)
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === storageKey && ev.newValue != null) {
        try {
          const next = JSON.parse(ev.newValue) as T;
          setState(next);
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  return [state, setState] as const;
}

/* ===========================
   Tipi & helper per liste "recenti"
=========================== */
export type OpenDoc = {
  id: string;
  name: string;
  type: "pdf" | "cad";
  src: string;         // file://, http(s):// o blob URL
  pageNum?: number;    // PDF: pagina corrente
  scale?: number;      // viewer zoom
  timestamp: number;   // per ordinare (recenti)
};

/**
 * Inserisce/aggiorna un documento nella lista "recenti":
 * - deduplica per (type + id/src)
 * - aggiorna timestamp
 * - mantiene al massimo `max` elementi
 */
export function pushRecentDoc(list: OpenDoc[], doc: OpenDoc, max = 50): OpenDoc[] {
  const keyOf = (d: OpenDoc) => `${d.type}::${d.id || d.src}`;
  const seen = new Set<string>();
  const out: OpenDoc[] = [];

  // Prima l'elemento aggiornato
  const merged: OpenDoc = {
    ...doc,
    timestamp: doc.timestamp || Date.now(),
  };

  for (const item of [merged, ...list]) {
    const k = keyOf(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    if (out.length >= max) break;
  }

  // Ordina per timestamp desc
  out.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return out;
}
