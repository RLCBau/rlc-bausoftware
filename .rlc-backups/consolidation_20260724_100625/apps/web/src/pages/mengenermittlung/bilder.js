import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
const shell = { maxWidth: 1260, margin: "0 auto", padding: "12px 16px 40px",
    fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif", color: "#0f172a" };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12 };
const card = { border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", background: "#fff" };
const imgStyle = { width: "100%", height: 140, objectFit: "cover" };
const textInput = { width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px" };
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" };
export default function BilderZumAufmass() {
    const [bilder, setBilder] = useState([]);
    const [pos, setPos] = useState("");
    const [kom, setKom] = useState("");
    const onFile = (e) => {
        const f = e.target.files?.[0];
        if (!f)
            return;
        const url = URL.createObjectURL(f);
        setBilder((p) => [...p, { id: Math.random().toString(36).slice(2, 9), url, posNr: pos, kommentar: kom }]);
        setKom("");
        setPos("");
        e.currentTarget.value = "";
    };
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { style: { margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }, children: "Bilder zum Aufma\u00DF" }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", margin: "0 0 10px" }, children: [_jsx("input", { placeholder: "Pos-Nr (optional)", style: { ...textInput, width: 150 }, value: pos, onChange: (e) => setPos(e.target.value) }), _jsx("input", { placeholder: "Kommentar (optional)", style: { ...textInput, width: 280 }, value: kom, onChange: (e) => setKom(e.target.value) }), _jsxs("label", { style: btn, children: ["Bild hinzuf\u00FCgen", _jsx("input", { type: "file", accept: "image/*", onChange: onFile, style: { display: "none" } })] })] }), _jsx("div", { style: grid, children: bilder.map(b => (_jsxs("div", { style: card, children: [_jsx("img", { src: b.url, alt: "", style: imgStyle }), _jsxs("div", { style: { padding: 8, fontSize: 12 }, children: [_jsxs("div", { children: [_jsx("b", { children: "Pos:" }), " ", b.posNr ?? "-"] }), _jsx("div", { style: { color: "#64748b" }, children: b.kommentar })] })] }, b.id))) })] }));
}
