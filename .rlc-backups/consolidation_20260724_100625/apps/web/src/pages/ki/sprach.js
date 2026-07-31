import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
const shell = { maxWidth: 700, margin: "0 auto", padding: "12px 16px", fontFamily: "Inter,system-ui,Arial" };
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" };
export default function Sprach() {
    const [text, setText] = useState("");
    const [rows, setRows] = useState([]);
    const simulate = () => {
        if (!text.trim())
            return;
        setRows([...rows, `Erkannt: ${text}`]);
        setText("");
    };
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { children: "Sprachsteuerung" }), _jsx("input", { value: text, onChange: e => setText(e.target.value), placeholder: "gesprochenes Kommando\u2026", style: { width: "100%", padding: 6, border: "1px solid #cbd5e1", borderRadius: 6 } }), _jsx("button", { style: btn, onClick: simulate, children: "Simulieren" }), _jsx("ul", { children: rows.map((r, i) => _jsx("li", { children: r }, i)) })] }));
}
