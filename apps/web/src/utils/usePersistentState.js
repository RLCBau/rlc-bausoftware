import { useEffect, useMemo, useState } from "react";
export function usePersistentState(key, initial) {
    const initialValue = useMemo(() => initial, [initial]);
    function read() {
        try {
            if (typeof window === "undefined")
                return initialValue;
            const raw = window.localStorage.getItem(key);
            if (!raw)
                return initialValue;
            return JSON.parse(raw);
        }
        catch {
            return initialValue;
        }
    }
    const [value, setValue] = useState(() => read());
    // rileggi se cambia la chiave
    useEffect(() => {
        setValue(read());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    // salva su localStorage
    useEffect(() => {
        try {
            if (typeof window === "undefined")
                return;
            window.localStorage.setItem(key, JSON.stringify(value));
        }
        catch {
            // quota exceeded o serializzazione fallita
        }
    }, [key, value]);
    // sync tra tab/browser
    useEffect(() => {
        if (typeof window === "undefined")
            return;
        function onStorage(e) {
            if (e.key !== key)
                return;
            try {
                if (e.newValue === null) {
                    setValue(initialValue);
                    return;
                }
                setValue(JSON.parse(e.newValue));
            }
            catch {
                setValue(initialValue);
            }
        }
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, [key, initialValue]);
    function reset() {
        setValue(initialValue);
        try {
            if (typeof window === "undefined")
                return;
            window.localStorage.removeItem(key);
        }
        catch { }
    }
    return [value, setValue, reset];
}
export default usePersistentState;
