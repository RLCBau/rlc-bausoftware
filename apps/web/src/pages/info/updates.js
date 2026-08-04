import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { API_BASE } from "../../lib/apiBase";
import { useState } from "react";
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
const shell = {
    maxWidth: 800,
    margin: "0 auto",
    padding: "12px 16px 40px",
    fontFamily: "Inter,system-ui,Arial"
};
const card = {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 10,
    margin: "10px 0"
};
const btn = {
    padding: "8px 12px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer"
};
export default function Updates() {
    const [log, setLog] = useState("");
    const [loading, setLoading] = useState(false);
    const check = async () => {
        setLoading(true);
        setLog("");
        try {
            const res = await fetch(apiUrl("/health"));
            const data = await res.json();
            setLog(`Version Web: v0.4\nServer: ONLINE\nZeit: ${new Date(data.ts).toLocaleString()}`);
        }
        catch {
            setLog("Server nicht erreichbar ❌");
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { children: "Updates & System" }), _jsx("button", { className: rlcClass(null, btn), onClick: check, children: loading ? "Prüfe..." : "Auf Updates prüfen" }), _jsx("div", { className: rlcClass(null, card), children: log || "Noch keine Prüfung durchgeführt." }), _jsx("div", { className: "rlc-migrated-pages-info-updates-tsx-820", children: "Hinweis: Automatische Updates, Versionsvergleich und Release-Notes werden integriert." })] }));
}
