// src/hooks/useAutosave.ts
import React from "react";
import { useProject } from "../store/useProject";

/**
 * Autosave universale con:
 * - debounce su change (default 800 ms)
 * - ticker periodico (default 30 s)
 * - scope per progetto (riesegue quando cambia projectId)
 *
 * Esempio:
 * const dirtyRef = React.useRef(false);
 * useAutosave({
 *   id: "aufmass.table",
 *   data,                                   // oggetto o snapshot serializzabile
 *   isDirty: () => dirtyRef.current,
 *   save: async (payload) => fetch("/api/.../save", {method:"POST", body: JSON.stringify(payload)}),
 *   debounceMs: 800,
 *   intervalMs: 30000
 * });
 */
type Options<T> = {
  id: string;
  data: T;
  isDirty: () => boolean;
  save: (payload: { projectId: string | null; id: string; data: T }) => Promise<any> | any;
  debounceMs?: number;
  intervalMs?: number;
};

export function useAutosave<T>({
  id,
  data,
  isDirty,
  save,
  debounceMs = 800,
  intervalMs = 30_000,
}: Options<T>) {
  const { projectId } = useProject();
  const timerRef = React.useRef<number | null>(null);
  const lastJsonRef = React.useRef<string>("");

  // Debounce su change di "data"
  React.useEffect(() => {
    const json = JSON.stringify(data);
    if (json === lastJsonRef.current) return;
    lastJsonRef.current = json;

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      if (isDirty()) {
        try { await save({ projectId, id, data }); } catch {}
      }
    }, debounceMs) as unknown as number;

    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, projectId, id, debounceMs]);

  // Ticker periodico
  React.useEffect(() => {
    const iv = window.setInterval(async () => {
      if (isDirty()) {
        try { await save({ projectId, id, data }); } catch {}
      }
    }, intervalMs);
    return () => window.clearInterval(iv);
  }, [projectId, id, data, isDirty, save, intervalMs]);
}
