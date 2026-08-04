import React from "react";
import { useProject } from "../store/useProject";
export function useAutosave({ id, data, isDirty, save, debounceMs = 800, intervalMs = 30000, }) {
    const { currentProject } = useProject();
    const projectId = currentProject?.id ?? null;
    const timerRef = React.useRef(null);
    const lastDataRef = React.useRef(null);
    const isDirtyRef = React.useRef(isDirty);
    const saveRef = React.useRef(save);
    // sempre aggiornati ma senza rompere deps
    React.useEffect(() => {
        isDirtyRef.current = isDirty;
        saveRef.current = save;
    }, [isDirty, save]);
    // 🔹 DEBOUNCE SAVE
    React.useEffect(() => {
        if (lastDataRef.current === data)
            return;
        lastDataRef.current = data;
        if (timerRef.current) {
            window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(async () => {
            if (!isDirtyRef.current())
                return;
            try {
                await saveRef.current({ projectId, id, data });
            }
            catch {
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
            if (!isDirtyRef.current())
                return;
            try {
                await saveRef.current({ projectId, id, data });
            }
            catch {
                // silent
            }
        }, intervalMs);
        return () => {
            window.clearInterval(iv);
        };
    }, [projectId, id, data, intervalMs]);
}
