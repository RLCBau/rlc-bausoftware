import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { API_BASE } from "../../lib/apiBase";
import { useRef, useState } from "react";
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
export default function ProjectImport({ onImported }) {
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    const openPicker = () => inputRef.current?.click();
    const onPick = async (e) => {
        const f = e.target.files?.[0];
        if (!f)
            return;
        setMsg(null);
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append("file", f);
            const isJson = /\.json$/i.test(f.name);
            const isZip = /\.zip$/i.test(f.name);
            if (!isJson && !isZip) {
                throw new Error("Bitte eine .json oder .zip Datei auswählen.");
            }
            const endpoint = isJson ?
                apiUrl("/api/import/project-json") :
                apiUrl("/api/import/project-zip");
            const r = await fetch(endpoint, {
                method: "POST",
                body: fd,
                credentials: "include"
            });
            const j = await r.json().catch(() => null);
            if (!r.ok || !j || j.ok === false) {
                throw new Error(j?.error || "Import fehlgeschlagen");
            }
            setMsg(`✅ Import OK: ${j.project?.name || j.created || j.from || f.name}`);
            onImported?.();
        }
        catch (err) {
            console.error("Import error:", err);
            setMsg(`❌ ${err?.message || String(err)}`);
        }
        finally {
            setBusy(false);
            if (inputRef.current)
                inputRef.current.value = "";
        }
    };
    return (_jsxs("div", { className: "rlc-migrated-pages-start-projectimport-tsx-1562", children: [_jsx("button", { type: "button", onClick: openPicker, disabled: busy, className: "rlc-migrated-pages-start-projectimport-tsx-1563", children: busy ? "Importiere..." : "Import" }), _jsx("input", { ref: inputRef, type: "file", accept: ".json,.zip,application/json,application/zip", onChange: onPick, className: "rlc-migrated-pages-start-projectimport-tsx-1564" }), busy && _jsx("span", { children: "\u23F3 Import l\u00E4uft..." }), msg && _jsx("span", { children: msg })] }));
}
