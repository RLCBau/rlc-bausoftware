import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
const shell = { maxWidth: 900, margin: "0 auto", padding: "12px 16px", fontFamily: "Inter,system-ui,Arial" };
const input = { width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", margin: "6px 0" };
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" };
export default function Nachtraege() {
    const [lv, setLv] = useState("");
    const [off, setOff] = useState("");
    const [diff, setDiff] = useState([]);
    const check = () => {
        setDiff(["Position 02.01: Menge in Angebot höher", "Position 03.05: Einheitspreis abweichend"]);
    };
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { children: "Nachtragserkennung" }), _jsx("textarea", { style: { ...input, height: 80 }, value: lv, onChange: e => setLv(e.target.value), placeholder: "LV-Text" }), _jsx("textarea", { style: { ...input, height: 80 }, value: off, onChange: e => setOff(e.target.value), placeholder: "Angebot-Text" }), _jsx("button", { style: btn, onClick: check, children: "Vergleichen" }), _jsx("ul", { children: diff.map((d, i) => _jsx("li", { children: d }, i)) })] }));
}
