import { useState, useCallback } from "react";
import { apiUrl } from "../../lib/apiBase";
const SYS_PROMPT = `Du bist Kalkulator für Tief-/Straßenbau. 
Erzeuge eine Liste geeigneter LV-Positionen als JSON-Array.
Jedes Element: { "posNr": "01.001" (optional), "kurztext": "...", "langtext": "...", "einheit": "m/m²/Stk", "menge": number, "preis": number (optional), "confidence": 0..1 }.
Keine Erklärungen, nur JSON. Realistische deutsche Bezeichnungen.`;
export function useKiPropose() {
    const [loading, setLoading] = useState(false);
    const propose = useCallback(async (projectText) => {
        if (!projectText?.trim())
            return [];
        setLoading(true);
        try {
            const token = (() => {
                try {
                    for (const key of ["rlc_token", "token", "authToken", "accessToken", "rlc_auth_token", "rlc_access_token"]) {
                        for (const storage of [localStorage, sessionStorage]) {
                            const value = storage.getItem(key);
                            if (value?.trim())
                                return value.trim();
                        }
                    }
                }
                catch { }
                return "";
            })();
            const res = await fetch(apiUrl("/api/ki/propose"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ text: projectText }),
            });
            if (!res.ok)
                return [];
            const json = await res.json();
            return normalize(json?.items || json);
        catch {
            return [];
        }
        finally {
            setLoading(false);
        }
    }, []);
    return { propose, loading };
}
function normalize(arr) {
    if (!Array.isArray(arr))
        return [];
    const out = [];
    for (const it of arr) {
        if (!it?.kurztext || !it?.einheit)
            continue;
        out.push({
            id: crypto.randomUUID(),
            posNr: it.posNr || "",
            kurztext: it.kurztext,
            langtext: it.langtext || "",
            einheit: it.einheit,
            menge: Number(it.menge) || 0,
            preis: typeof it.preis === "number" ? it.preis : undefined,
            confidence: clamp01(Number(it.confidence)),
        });
    }
    return out;
}
function clamp01(n) { return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : undefined; }
function safeJson(s) { try {
    return s ? JSON.parse(s) : null;
}
catch {
    return null;
} }
