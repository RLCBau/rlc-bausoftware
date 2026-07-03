import React from "react";
import { useProject } from "../store/useProject";

type Options<T> = {
  id: string;
  data: T;
  isDirty: () => boolean;
  save: (payload: {
    projectId: string | null;
    id: string;
    data: T;
  }) => Promise<any> | any;
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
  const { currentProject } = useProject();
  const projectId = currentProject?.id ?? null;

  const timerRef = React.useRef<number | null>(null);
  const lastDataRef = React.useRef<T | null>(null);

  const isDirtyRef = React.useRef(isDirty);
  const saveRef = React.useRef(save);

  // sempre aggiornati ma senza rompere deps
  React.useEffect(() => {
    isDirtyRef.current = isDirty;
    saveRef.current = save;
  }, [isDirty, save]);

  // 🔹 DEBOUNCE SAVE
  React.useEffect(() => {
    if (lastDataRef.current === data) return;
    lastDataRef.current = data;

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(async () => {
      if (!isDirtyRef.current()) return;

      try {
        await saveRef.current({ projectId, id, data });
      } catch {
        // silent
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [data, projectId, id, debounceMs]);

  // 🔹 INTERVAL SAVE
  React.useEffect(() => {
    const iv = window.setInterval(async () => {
      if (!isDirtyRef.current()) return;

      try {
        await saveRef.current({ projectId, id, data });
      } catch {
        // silent
      }
    }, intervalMs);

    return () => {
      window.clearInterval(iv);
    };
  }, [projectId, id, data, intervalMs]);
}






