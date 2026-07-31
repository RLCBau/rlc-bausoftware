// src/store/persist.ts
import React from "react";
import { useProject } from "./useProject";
/* ===========================
   Safe storage (fallback in-memory)
=========================== */
const memStore = new Map();
const safeStorage = {
    getItem(key) {
        try {
            if (typeof window !== "undefined" && window.localStorage) {
                return window.localStorage.getItem(key);
            }
        }
        catch { }
        return memStore.get(key) ?? null;
    },
    setItem(key, value) {
        try {
            if (typeof window !== "undefined" && window.localStorage) {
                window.localStorage.setItem(key, value);
                return;
            }
        }
        catch { }
        memStore.set(key, value);
    },
};
function resolveInitial(initial) {
    return typeof initial === "function" ? initial() : initial;
}
/* ===========================
   Hook principale
=========================== */
export function usePersistedState(initial, opts) {
    const { key, projectScoped = false, version = 1 } = opts;
    // Il hook può essere usato prima che il provider monti: evita crash
    const { projectId } = (() => {
        try {
            return useProject();
        }
        catch {
            return { projectId: null };
        }
    })();
    const storageKey = React.useMemo(() => {
        const base = `rlc:${key}:v${version}`;
        return projectScoped && projectId ? `prj:${projectId}:${base}` : base;
    }, [key, version, projectScoped, projectId]);
    // Stato iniziale: prova a leggere dal storage
    const [state, setState] = React.useState(() => {
        const raw = safeStorage.getItem(storageKey);
        if (raw) {
            try {
                return JSON.parse(raw);
            }
            catch {
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
        }
        catch { }
    }, [storageKey, state]);
    // Ricarica quando cambia la chiave (es: cambio progetto / versione)
    React.useEffect(() => {
        const raw = safeStorage.getItem(storageKey);
        if (raw) {
            try {
                setState(JSON.parse(raw));
                return;
            }
            catch { }
        }
        setState(resolveInitial(initial));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey]);
    // Sync tra TAB/finestre (solo quando c'è localStorage reale)
    React.useEffect(() => {
        if (typeof window === "undefined")
            return;
        const onStorage = (ev) => {
            if (ev.key === storageKey && ev.newValue != null) {
                try {
                    const next = JSON.parse(ev.newValue);
                    setState(next);
                }
                catch { }
            }
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, [storageKey]);
    return [state, setState];
}
/**
 * Inserisce/aggiorna un documento nella lista "recenti":
 * - deduplica per (type + id/src)
 * - aggiorna timestamp
 * - mantiene al massimo `max` elementi
 */
export function pushRecentDoc(list, doc, max = 50) {
    const keyOf = (d) => `${d.type}::${d.id || d.src}`;
    const seen = new Set();
    const out = [];
    // Prima l'elemento aggiornato
    const merged = {
        ...doc,
        timestamp: doc.timestamp || Date.now(),
    };
    for (const item of [merged, ...list]) {
        const k = keyOf(item);
        if (seen.has(k))
            continue;
        seen.add(k);
        out.push(item);
        if (out.length >= max)
            break;
    }
    // Ordina per timestamp desc
    out.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return out;
}
