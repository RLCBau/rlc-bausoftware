import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// apps/web/src/pages/start/projektUebersicht.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
/* === Config API (fallback) === */
const API = import.meta?.env?.VITE_API_URL || "https://api.rlcbausoftware.com";
/* === Mini-Widget inline per importare ein project.json === */
function ImportProjectJsonInline({ onDone }) {
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const upload = async () => {
        if (!file)
            return alert("Bitte zuerst eine project.json auswählen");
        setBusy(true);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(`${API}/api/import/project-json`, {
                method: "POST",
                body: form,
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json)
                throw new Error("Import fehlgeschlagen");
            if (json.ok === false)
                throw new Error(json.error || "Import fehlgeschlagen");
            alert("Projekt importiert!");
            onDone?.();
        }
        catch (e) {
            console.error(e);
            alert("Import fehlgeschlagen: " + (e?.message ?? String(e)));
        }
        finally {
            setBusy(false);
            setFile(null);
        }
    };
    return (_jsxs("div", { style: {
            display: "flex",
            gap: 8,
            alignItems: "center",
            margin: "8px 0 16px",
        }, children: [_jsx("input", { type: "file", accept: ".json,application/json", onChange: (e) => setFile(e.target.files?.[0] || null) }), _jsx("button", { className: "btn", onClick: upload, disabled: !file || busy, children: busy ? "Importiere…" : "Import JSON" })] }));
}
export default function ProjektUebersicht() {
    const nav = useNavigate();
    const projectCtx = useProject?.() ?? null;
    // Progetto dal context, se disponibile
    const ctxProject = projectCtx?.currentProject ??
        projectCtx?.current ??
        projectCtx?.selectedProject ??
        projectCtx?.project ??
        (typeof projectCtx?.getCurrentProject === "function"
            ? projectCtx.getCurrentProject()
            : null);
    // Fallback: variabile globale impostata in project.tsx
    let globalProject = null;
    try {
        const g = globalThis;
        globalProject = g.__RLC_CURRENT_PROJECT ?? null;
    }
    catch {
        globalProject = null;
    }
    const cur = ctxProject || globalProject || null;
    console.log("ProjektÜbersicht current project:", cur);
    // --- Nessun progetto selezionato ---
    if (!cur) {
        return (_jsx("div", { style: { padding: 16 }, children: _jsxs("div", { className: "card", style: { padding: 16 }, children: [_jsx("h2", { style: { marginTop: 0 }, children: "Kein Projekt gew\u00E4hlt" }), _jsx("p", { style: { marginBottom: 12 }, children: "Bitte w\u00E4hle zuerst ein Projekt oder importiere eine Projekt-Datei." }), _jsx(ImportProjectJsonInline, { onDone: () => nav("/start") }), _jsx("button", { className: "btn", onClick: () => nav("/start"), children: "\u2192 Projekt ausw\u00E4hlen" })] }) }));
    }
    // Normalizziamo i campi
    const number = cur.code ?? cur.number ?? cur.projektnummer ?? "";
    const name = cur.name ?? cur.projectName ?? cur.projektname ?? "";
    const client = cur.client ?? cur.auftraggeber ?? cur.kunde ?? "";
    const location = cur.place ?? cur.city ?? cur.ort ?? cur.location ?? "";
    const tiles = [
        { title: "Kalkulation (Manuell)", to: "/kalkulation/manuell", emoji: "💰" },
        { title: "Kalkulation (KI)", to: "/kalkulation/mit-ki", emoji: "🤖" },
        {
            title: "Mengenermittlung",
            to: "/mengenermittlung/aufmasseditor",
            emoji: "📋",
        },
        { title: "CAD / PDF", to: "/cad/viewer", emoji: "📐" },
        { title: "Büro / Verwaltung", to: "/buro", emoji: "🏢" },
        { title: "Buchhaltung", to: "/buchhaltung", emoji: "📒" },
        { title: "Info / Hilfe", to: "/hilfe", emoji: "ℹ️" },
    ];
    return (_jsx("div", { style: { padding: 16, display: "grid", gap: 16 }, children: _jsxs("div", { className: "card", style: { padding: 16 }, children: [_jsx("h2", { style: { marginTop: 0 }, children: "Projekt-\u00DCbersicht" }), _jsxs("div", { style: { opacity: 0.85, marginBottom: 8 }, children: [_jsx("b", { children: number }), " \u2014 ", name, client ? _jsxs(_Fragment, { children: [" \u2022 ", client] }) : null, location ? _jsxs(_Fragment, { children: [" \u2022 ", location] }) : null] }), _jsx("div", { style: {
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
                        gap: 12,
                    }, children: tiles.map((t) => (_jsxs("button", { className: "btn", onClick: () => nav(t.to), style: {
                            textAlign: "left",
                            padding: "14px 12px",
                            border: "1px solid #e6e6e6",
                            borderRadius: 10,
                            background: "#fff",
                        }, children: [_jsx("div", { style: { fontSize: 24, marginBottom: 6 }, children: t.emoji }), _jsx("div", { style: { fontWeight: 700 }, children: t.title }), _jsx("div", { style: { opacity: 0.6, fontSize: 13 }, children: "Zum Modul wechseln" })] }, t.to))) }), _jsxs("div", { style: {
                        marginTop: 12,
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                    }, children: [_jsx("button", { className: "btn", onClick: () => nav("/start"), children: "\u2190 Zur\u00FCck zu Projekt ausw\u00E4hlen" }), _jsx("span", { style: { marginLeft: 8, opacity: 0.7, fontSize: 13 }, children: "Oder neues Projekt importieren:" }), _jsx(ImportProjectJsonInline, { onDone: () => nav("/start") })] })] }) }));
}
