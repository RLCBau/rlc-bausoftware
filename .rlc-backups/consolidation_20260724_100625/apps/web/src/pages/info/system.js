import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useState } from "react";
const shell = { maxWidth: 900, margin: "0 auto", padding: "12px 16px 40px", fontFamily: "Inter,system-ui,Arial" };
const box = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, margin: "8px 0", background: "#fafafa" };
export default function Systemstatus() {
    const [info, setInfo] = useState({});
    useEffect(() => {
        setInfo({
            ua: navigator.userAgent,
            lang: navigator.language,
            online: navigator.onLine,
            storage: !!window.localStorage,
            time: new Date().toISOString(),
        });
    }, []);
    const clearAll = () => { if (confirm("Lokalen Speicher wirklich leeren?")) {
        localStorage.clear();
        alert("Lokale Daten gelöscht.");
    } };
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { children: "Systemstatus" }), _jsxs("div", { style: box, children: [_jsx("b", { children: "Browser:" }), " ", info.ua] }), _jsxs("div", { style: box, children: [_jsx("b", { children: "Sprache:" }), " ", info.lang, " \u00B7 ", _jsx("b", { children: "Online:" }), " ", String(info.online), " \u00B7 ", _jsx("b", { children: "LocalStorage:" }), " ", String(info.storage)] }), _jsxs("div", { style: box, children: [_jsx("b", { children: "Uhrzeit:" }), " ", info.time] }), _jsx("button", { style: { padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6 }, onClick: clearAll, children: "Lokale Daten l\u00F6schen" })] }));
}
