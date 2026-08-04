import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { API_BASE } from "../../lib/apiBase";
import { useEffect, useState } from "react";
const shell = {
    maxWidth: 900,
    margin: "0 auto",
    padding: "12px 16px 40px",
    fontFamily: "Inter,system-ui,Arial",
    color: "#0f172a"
};
const box = {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 12,
    margin: "10px 0",
    background: "#fafafa"
};
const row = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 12
};
const btn = {
    padding: "8px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600
};
const supportBtn = {
    position: "fixed",
    right: 20,
    bottom: 20,
    background: "#0ea5e9",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "12px 18px",
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
};
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
export default function Systemstatus() {
    const [info, setInfo] = useState({});
    const [loading, setLoading] = useState(false);
    const loadInfo = async () => {
        setLoading(true);
        const baseInfo = {
            ua: navigator.userAgent,
            lang: navigator.language,
            online: navigator.onLine,
            storage: !!window.localStorage,
            time: new Date().toISOString(),
            api: "unbekannt"
        };
        try {
            const res = await fetch(apiUrl("/health"), {
                method: "GET"
            });
            if (res.ok) {
                baseInfo.api = "online";
            }
            else {
                baseInfo.api = `Fehler (${res.status})`;
            }
        }
        catch {
            baseInfo.api = "offline / nicht erreichbar";
        }
        setInfo(baseInfo);
        setLoading(false);
    };
    useEffect(() => {
        loadInfo();
        const onOnline = () => {
            setInfo((prev) => ({
                ...prev,
                online: true,
                time: new Date().toISOString()
            }));
        };
        const onOffline = () => {
            setInfo((prev) => ({
                ...prev,
                online: false,
                time: new Date().toISOString()
            }));
        };
        window.addEventListener("online", onOnline);
        window.addEventListener("offline", onOffline);
        return () => {
            window.removeEventListener("online", onOnline);
            window.removeEventListener("offline", onOffline);
        };
    }, []);
    const clearAll = () => {
        if (confirm("Lokalen Speicher wirklich leeren?")) {
            localStorage.clear();
            alert("Lokale Daten gelöscht.");
            loadInfo();
        }
    };
    const openSupport = () => {
        window.location.href = "/info/support";
    };
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { children: "Systemstatus" }), _jsxs("div", { className: rlcClass(null, box), children: [_jsx("b", { children: "API-Status:" }), " ", loading ? "Prüfung läuft..." : info.api] }), _jsxs("div", { className: rlcClass(null, box), children: [_jsx("b", { children: "Browser:" }), " ", info.ua] }), _jsxs("div", { className: rlcClass(null, box), children: [_jsx("b", { children: "Sprache:" }), " ", info.lang, _jsx("br", {}), _jsx("b", { children: "Online:" }), " ", String(info.online), _jsx("br", {}), _jsx("b", { children: "LocalStorage:" }), " ", String(info.storage)] }), _jsxs("div", { className: rlcClass(null, box), children: [_jsx("b", { children: "Uhrzeit:" }), " ", info.time] }), _jsxs("div", { className: rlcClass(null, row), children: [_jsx("button", { className: rlcClass(null, btn), onClick: loadInfo, type: "button", children: "Status aktualisieren" }), _jsx("button", { className: rlcClass(null, btn), onClick: clearAll, type: "button", children: "Lokale Daten l\u00F6schen" })] }), _jsx("button", { className: rlcClass(null, supportBtn), onClick: openSupport, type: "button", children: "Support Chat" })] }));
}
