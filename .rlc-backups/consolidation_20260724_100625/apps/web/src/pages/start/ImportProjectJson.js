import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useRef, useState } from "react";
const API = import.meta.env.VITE_API_URL || "https://api.rlcbausoftware.com";
export default function ImportProjectJson({ onImported }) {
    const fileRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const handleChoose = () => fileRef.current?.click();
    const handleFile = async (e) => {
        const f = e.target.files?.[0];
        if (!f)
            return;
        if (!/\.json$/i.test(f.name)) {
            alert("Seleziona un file project.json");
            e.target.value = "";
            return;
        }
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append("file", f); // campo 'file' richiesto dalla route
            const res = await fetch(`${API}/api/import/project-json`, {
                method: "POST",
                body: fd,
            });
            const json = await res.json();
            if (!res.ok || json?.ok === false) {
                throw new Error(json?.error || `Import fallito (${res.status})`);
            }
            // ok
            if (onImported)
                onImported();
            alert(`Import riuscito: ${json?.imported?.name || json?.project?.name || f.name}`);
        }
        catch (err) {
            console.error("Import error:", err);
            alert(`Errore import: ${err.message || err}`);
        }
        finally {
            setBusy(false);
            // reset per poter ri-caricare lo stesso file
            if (fileRef.current)
                fileRef.current.value = "";
        }
    };
    return (_jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("input", { ref: fileRef, type: "file", accept: ".json", style: { display: "none" }, onChange: handleFile }), _jsx("button", { onClick: handleChoose, disabled: busy, children: busy ? "Import..." : "Import project.json" }), _jsxs("small", { children: ["Supportato: file ", _jsx("code", { children: "project.json" })] })] }));
}
