import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useRef, useState } from "react";
export default function ProjectImport() {
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    const API = import.meta.env.VITE_API_URL || "https://api.rlcbausoftware.com";
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
            const r = await fetch(`${API}/api/import/project`, {
                method: "POST",
                body: fd,
                credentials: "include",
            });
            const j = await r.json();
            if (!j.ok)
                throw new Error(j.error || "Import fehlgeschlagen");
            setMsg(`✅ Import OK: ${j.project?.name || j.created || j.from}`);
            // TODO: refresh lista progetti o navigate allo specifico progetto
        }
        catch (err) {
            setMsg(`❌ ${err.message}`);
        }
        finally {
            setBusy(false);
            if (inputRef.current)
                inputRef.current.value = "";
        }
    };
    return (_jsxs("div", { style: { display: "inline-flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { type: "button", onClick: openPicker, disabled: busy, style: { padding: "8px 14px", borderRadius: 6, cursor: "pointer" }, children: "Import" }), _jsx("input", { ref: inputRef, type: "file", accept: ".json,.zip", onChange: onPick, style: { display: "none" } }), busy && _jsx("span", { children: "\u23F3 Import\u2026" }), msg && _jsx("span", { children: msg })] }));
}
