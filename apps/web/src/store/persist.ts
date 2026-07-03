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
    } catch {
      // ignore
    }
    return memStore.get(key) ?? null;
  },

  setItem(key: string, value: string) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // ignore
    }
    memStore.set(key, value);
  },
};

type Options = {
  /** Logischer Schlüssel (ohne Präfixe) */
  key: string;
  /** Wenn true, wird der Schlüssel mit der aktuellen Projekt-ID scoped */
  projectScoped?: boolean;
  /** Strukturversion für Invalidierung alter Daten */
  version?: number;
};

function resolveInitial<T>(initial: T | (() => T)): T {
  return typeof initial === "function" ? (initial as () => T)() : initial;
}

function useOptionalProject() {
  try {
    return useProject();
  } catch {
    return null;
  }
}

/* ===========================
   Haupt-Hook
=========================== */
export function usePersistedState<T>(initial: T | (() => T), opts: Options) {
  const { key, projectScoped = false, version = 1 } = opts;

  const projectCtx = useOptionalProject();

  const projectId =
    projectCtx?.selectedProjectId ??
    projectCtx?.currentProject?.id ??
    null;

  const storageKey = React.useMemo(() => {
    const base = `rlc:${key}:v${version}`;
    return projectScoped && projectId ? `prj:${projectId}:${base}` : base;
  }, [key, version, projectScoped, projectId]);

  const [state, setState] = React.useState<T>(() => {
    const raw = safeStorage.getItem(storageKey);
    if (raw) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return resolveInitial(initial);
      }
    }
    return resolveInitial(initial);
  });

  React.useEffect(() => {
    try {
      safeStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [storageKey, state]);

  React.useEffect(() => {
    const raw = safeStorage.getItem(storageKey);
    if (raw) {
      try {
        setState(JSON.parse(raw) as T);
        return;
      } catch {
        // ignore
      }
    }
    setState(resolveInitial(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorage = (ev: StorageEvent) => {
      if (ev.key === storageKey && ev.newValue != null) {
        try {
          const next = JSON.parse(ev.newValue) as T;
          setState(next);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  return [state, setState] as const;
}

/* ===========================
   Typen & Helper für "recent docs"
=========================== */
export type OpenDoc = {
  id: string;
  name: string;
  type: "pdf" | "cad";
  src: string;       // file://, http(s):// oder blob URL
  pageNum?: number;  // PDF: aktuelle Seite
  scale?: number;    // Viewer-Zoom
  timestamp: number; // Sortierung nach "zuletzt geöffnet"
};

/**
 * Fügt ein Dokument in die "recent"-Liste ein oder aktualisiert es:
 * - dedupliziert nach (type + id/src)
 * - aktualisiert timestamp
 * - hält maximal `max` Elemente
 */
export function pushRecentDoc(
  list: OpenDoc[],
  doc: OpenDoc,
  max = 50
): OpenDoc[] {
  const keyOf = (d: OpenDoc) => `${d.type}::${d.id || d.src}`;
  const seen = new Set<string>();
  const out: OpenDoc[] = [];

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

  out.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return out;
}





