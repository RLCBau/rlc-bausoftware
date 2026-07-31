import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
import { loadDoc, saveDoc } from "../../lib/cad/store";
const shell = { maxWidth: 900, margin: "0 auto", padding: "12px 16px 40px", fontFamily: "Inter, system-ui, Arial", color: "#0f172a" };
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" };
export default function CADImport() {
    const [log, setLog] = useState("");
    const importJSON = (f) => {
        const rd = new FileReader();
        rd.onload = () => {
            try {
                const next = JSON.parse(String(rd.result));
                if (!next.layers || !next.entities)
                    throw new Error("Ungültiges CAD JSON");
                saveDoc(next);
                setLog(`Import OK: ${next.name}, Entities: ${next.entities.length}, Layers: ${next.layers.length}`);
            }
            catch (e) {
                setLog("Fehler: " + e.message);
            }
        };
        rd.readAsText(f, "utf-8");
    };
    const importCSVPoints = (f) => {
        const rd = new FileReader();
        rd.onload = () => {
            const text = String(rd.result || "");
            // Format: x;y (metri)
            const lines = text.split(/\r?\n/).filter(Boolean);
            const doc = loadDoc();
            const layerId = doc.layers[0].id;
            const ents = lines.map((ln, i) => {
                const [xs, ys] = ln.split(";");
                const x = Number(xs), y = Number(ys);
                return { id: `pt-${i}`, type: "point", layerId, p: { x, y } };
            });
            doc.entities.push(...ents);
            saveDoc(doc);
            setLog(`Import Punkte OK: ${ents.length}`);
        };
        rd.readAsText(f, "utf-8");
    };
    return (_jsxs("div", { style: shell, children: [_jsx("h2", { style: { margin: "4px 0 12px", fontSize: 20, fontWeight: 700 }, children: "Import" }), _jsxs("p", { style: { color: "#64748b" }, children: ["Unterst\u00FCtzt: ", _jsx("b", { children: "RLC CAD JSON" }), ", ", _jsx("b", { children: "CSV Punkte" }), " (x;y). DXF/DWG Parser folgt."] }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsxs("label", { style: btn, children: ["Import JSON", _jsx("input", { type: "file", accept: "application/json", onChange: e => { const f = e.target.files?.[0]; if (f)
                                    importJSON(f); e.currentTarget.value = ""; }, style: { display: "none" } })] }), _jsxs("label", { style: btn, children: ["Import CSV Punkte", _jsx("input", { type: "file", accept: ".csv,text/csv", onChange: e => { const f = e.target.files?.[0]; if (f)
                                    importCSVPoints(f); e.currentTarget.value = ""; }, style: { display: "none" } })] })] }), _jsx("pre", { style: { marginTop: 12, padding: 10, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fafafa", fontSize: 12 }, children: log })] }));
}
