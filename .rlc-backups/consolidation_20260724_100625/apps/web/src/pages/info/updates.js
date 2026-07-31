import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
const shell = { maxWidth: 800, margin: "0 auto", padding: "12px 16px 40px", fontFamily: "Inter,system-ui,Arial" };
const card = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, margin: "10px 0" };
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" };
export default function Updates() {
    const [log, setLog] = useState("");
    const check = () => { setLog("Aktuelle Version: v0.4 · Server: offline-check (Demo)."); };
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { children: "Updates" }), _jsx("button", { style: btn, onClick: check, children: "Auf Updates pr\u00FCfen" }), _jsx("div", { style: card, children: log || "Noch keine Prüfung durchgeführt." })] }));
}
