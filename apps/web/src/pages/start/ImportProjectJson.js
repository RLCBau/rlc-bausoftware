import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { API_BASE } from "../../lib/apiBase";
import { useRef, useState } from "react";
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
export default function ImportProjectJson({ onImported }) {
    const fileRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const handleChoose = () => {
        fileRef.current?.click();
    };
    const handleFile = async (e) => {
        const f = e.target.files?.[0];
        if (!f)
            return;
        const isJsonName = /\.json$/i.test(f.name);
        const isJsonType = f.type === "application/json" || f.type === "text/json";
        if (!isJsonName && !isJsonType) {
            window.alert("Bitte eine gültige project.json auswählen.");
            e.target.value = "";
            return;
        }
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append("file", f);
            const res = await fetch(apiUrl("/api/import/project-json"), {
                method: "POST",
                body: fd,
                credentials: "include"
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json || json?.ok === false) {
                throw new Error(json?.error || `Import fehlgeschlagen (${res.status})`);
            }
            onImported?.();
            window.alert(`Import erfolgreich: ${json?.imported?.name || json?.project?.name || f.name}`);
        }
        catch (err) {
            console.error("Import error:", err);
            window.alert(`Fehler beim Import: ${err?.message || String(err)}`);
        }
        finally {
            setBusy(false);
            if (fileRef.current) {
                fileRef.current.value = "";
            }
        }
    };
    return (_jsxs("div", { className: "rlc-migrated-pages-start-importprojectjson-tsx-1560", children: [_jsx("input", { ref: fileRef, type: "file", accept: ".json,application/json", onChange: handleFile, className: "rlc-migrated-pages-start-importprojectjson-tsx-1561" }), _jsx("button", { type: "button", onClick: handleChoose, disabled: busy, children: busy ? "Importiere..." : "Import project.json" }), _jsxs("small", { children: ["Unterst\u00FCtzt: Datei ", _jsx("code", { children: "project.json" })] })] }));
}
