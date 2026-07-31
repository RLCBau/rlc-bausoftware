import { useEffect, useState } from "react";
export function usePersistentState(key, initial) {
    const [value, setValue] = useState(() => {
        try {
            const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
            return raw ? JSON.parse(raw) : initial;
        }
        catch {
            return initial;
        }
    });
    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        }
        catch {
            // ignore quota/SSR
        }
    }, [key, value]);
    return [value, setValue];
}
// esportazione default + named per compatibilità
export default usePersistentState;
