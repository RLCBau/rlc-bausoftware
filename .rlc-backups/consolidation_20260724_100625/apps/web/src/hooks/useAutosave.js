// src/hooks/useAutosave.ts
import React from "react";
import { useProject } from "../store/useProject";
export function useAutosave({ id, data, isDirty, save, debounceMs = 800, intervalMs = 30000, }) {
    const { projectId } = useProject();
    const timerRef = React.useRef(null);
    const lastJsonRef = React.useRef("");
    // Debounce su change di "data"
    React.useEffect(() => {
        const json = JSON.stringify(data);
        if (json === lastJsonRef.current)
            return;
        lastJsonRef.current = json;
        if (timerRef.current)
            window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(async () => {
            if (isDirty()) {
                try {
                    await save({ projectId, id, data });
                }
                catch { }
            }
        }, debounceMs);
        return () => { if (timerRef.current)
            window.clearTimeout(timerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, projectId, id, debounceMs]);
    // Ticker periodico
    React.useEffect(() => {
        const iv = window.setInterval(async () => {
            if (isDirty()) {
                try {
                    await save({ projectId, id, data });
                }
                catch { }
            }
        }, intervalMs);
        return () => window.clearInterval(iv);
    }, [projectId, id, data, isDirty, save, intervalMs]);
}
