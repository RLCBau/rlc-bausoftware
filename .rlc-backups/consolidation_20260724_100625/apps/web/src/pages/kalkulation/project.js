import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Projects } from "./projectStore";
import { setCurrentProjectId } from "../../utils/project";
import { useNavigate } from "react-router-dom";
export default function ProjektPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [q, setQ] = useState("");
    const fileRef = useRef(null);
    useEffect(() => { setRows(Projects.list()); }, []);
    /** Converte un Project in un projectId numerico stabile (se manca dbId/projectId) */
    function asNumericProjectId(p) {
        const raw = p.dbId ?? p.projectId;
        if (raw !== undefined && !isNaN(Number(raw)))
            return Number(raw);
        const basis = String(p.id ?? p.number ?? p.name ?? "project");
        let h = 0;
        for (let i = 0; i < basis.length; i++)
            h = (((h << 5) - h) + basis.charCodeAt(i)) | 0;
        const pid = Math.abs(h % 9000000) + 1000000; // 7 cifre, deterministico
        return pid;
    }
    /** Apri Angebotsanalyse passando sempre ?projectId=NUM e salvandolo */
    function openAngebotsanalyse(p) {
        const pid = asNumericProjectId(p);
        setCurrentProjectId(pid);
        navigate(`/kalkulation/versionsvergleich?projectId=${pid}`);
    }
    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s)
            return rows;
        return rows.filter(p => (p.name || "").toLowerCase().includes(s) ||
            (p.number || "").toLowerCase().includes(s) ||
            (p.client || "").toLowerCase().includes(s) ||
            (p.location || "").toLowerCase().includes(s));
    }, [rows, q]);
    const create = (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const number = String(fd.get("number") || "").trim();
        const name = String(fd.get("name") || "").trim();
        if (!/^[A-Z0-9\-_.]+$/i.test(number)) {
            alert("BaustellenNummer: nur A-Z, 0-9, - _ .");
            return;
        }
        if (name.length < 3) {
            alert("Projektname zu kurz.");
            return;
        }
        const item = Projects.upsert({
            number,
            name,
            client: String(fd.get("client") || "").trim(),
            location: String(fd.get("location") || "").trim(),
        });
        setRows(Projects.list());
        Projects.setCurrent(item.id);
        setCurrentProjectId(asNumericProjectId(item)); // salva subito il numeric id
        e.currentTarget.reset();
    };
    const del = (id) => {
        if (!confirm("Projekt wirklich löschen?"))
            return;
        Projects.remove(id);
        setRows(Projects.list());
    };
    const exportJSON = () => {
        const blob = new Blob([Projects.exportJSON()], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "rlc_projects.json";
        a.click();
        URL.revokeObjectURL(url);
    };
    const importJSON = (text) => { Projects.importJSON(text); setRows(Projects.list()); };
    const cur = Projects.getCurrent?.();
    return (_jsxs("div", { style: { padding: 16, display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: 16 }, children: [_jsxs("section", { style: card(), children: [_jsxs("header", { style: cardHead(), children: [_jsx("h2", { style: { margin: 0 }, children: "Projekt ausw\u00E4hlen" }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("input", { placeholder: "Suche: Name / BaustellenNr / Kunde / Ort", value: q, onChange: (e) => setQ(e.target.value), style: searchInput() }), _jsx("button", { onClick: exportJSON, children: "Export" }), _jsx("input", { ref: fileRef, type: "file", accept: "application/json", style: { display: "none" }, onChange: (e) => {
                                            const f = e.target.files?.[0];
                                            if (!f)
                                                return;
                                            const r = new FileReader();
                                            r.onload = () => importJSON(String(r.result || ""));
                                            r.readAsText(f, "utf-8");
                                        } }), _jsx("button", { onClick: () => fileRef.current?.click(), children: "Import" })] })] }), _jsx("div", { style: { overflowX: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 14 }, children: [_jsx("thead", { children: _jsx("tr", { children: ["BaustellenNr", "Projektname", "Kunde", "Ort", "Erstellt am", "Aktionen"].map((h, i) => _jsx("th", { style: th, children: h }, i)) }) }), _jsxs("tbody", { children: [filtered.map(p => (_jsxs("tr", { children: [_jsx("td", { style: td, children: p.number }), _jsx("td", { style: td, children: p.name }), _jsx("td", { style: td, children: p.client || "–" }), _jsx("td", { style: td, children: p.location || "–" }), _jsx("td", { style: td, children: new Date(p.createdAt).toLocaleDateString() }), _jsxs("td", { style: tdRight, children: [_jsx("button", { onClick: () => navigate("/kalkulation/manuell"), children: "\u00D6ffnen (Manuell)" }), " ", _jsx("button", { onClick: () => navigate("/kalkulation/mit-ki"), children: "\u00D6ffnen (KI)" }), " ", _jsx("button", { onClick: () => openAngebotsanalyse(p), children: "Angebotsanalyse" }), " ", _jsx("button", { onClick: () => del(p.id), children: "L\u00F6schen" })] })] }, p.id))), filtered.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, style: { padding: 12, color: "#666" }, children: "Keine Projekte gefunden." }) }))] })] }) })] }), _jsxs("aside", { style: card(), children: [_jsx("header", { style: cardHead(), children: _jsx("h2", { style: { margin: 0 }, children: "Projekt erstellen" }) }), _jsxs("form", { onSubmit: create, style: { display: "grid", gap: 10 }, children: [_jsxs("div", { style: field(), children: [_jsx("label", { style: label(), children: "BaustellenNummer*" }), _jsx("input", { name: "number", required: true, placeholder: "BA-2025-001", pattern: "[A-Za-z0-9_.-]+", title: "Nur Buchstaben, Ziffern, -, _, ." }), _jsx("small", { style: hint(), children: "z. B. Bauabschnitt/Angebotsnr. \u2013 eindeutig" })] }), _jsxs("div", { style: field(), children: [_jsx("label", { style: label(), children: "Projektname*" }), _jsx("input", { name: "name", required: true, placeholder: "Erneuerung TWL BA III/IV" }), _jsx("small", { style: hint(), children: "Kurze, eindeutige Bezeichnung des Projekts" })] }), _jsxs("div", { style: field(), children: [_jsx("label", { style: label(), children: "Auftraggeber" }), _jsx("input", { name: "client", placeholder: "Gemeinde X / Musterbau GmbH" })] }), _jsxs("div", { style: field(), children: [_jsx("label", { style: label(), children: "Ort" }), _jsx("input", { name: "location", placeholder: "Bischofswiesen" })] }), _jsxs("div", { style: { display: "flex", gap: 8, marginTop: 6 }, children: [_jsx("button", { type: "submit", style: { fontWeight: 600 }, children: "Projekt anlegen" }), _jsx("button", { type: "button", onClick: () => {
                                            const n = `BA-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`;
                                            document.querySelector('input[name="number"]').value = n;
                                        }, children: "Nummer vorschlagen" })] })] }), _jsxs("div", { style: { marginTop: 16, padding: 12, border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: "Aktuelles Projekt" }), _jsx("div", { style: { marginBottom: 8 }, children: cur ? `${cur.number} — ${cur.name}` : "Keines ausgewählt." }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("button", { onClick: () => { if (cur)
                                            navigate("/kalkulation/manuell"); }, disabled: !cur, children: "In Manuell \u00F6ffnen" }), _jsx("button", { onClick: () => { if (cur)
                                            navigate("/kalkulation/mit-ki"); }, disabled: !cur, children: "In KI \u00F6ffnen" }), _jsx("button", { onClick: () => { if (cur)
                                            openAngebotsanalyse(cur); }, disabled: !cur, children: "Angebotsanalyse" })] })] })] })] }));
}
/* ——— Styles ——— */
const card = () => ({ border: "1px solid #e6e6e6", borderRadius: 10, background: "#fff" });
const cardHead = () => ({ padding: "12px 14px", borderBottom: "1px solid #eee", background: "#fcfcfc" });
const th = { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee", background: "#fafafa", fontWeight: 600, whiteSpace: "nowrap" };
const td = { padding: "8px", borderBottom: "1px solid #f5f5f5" };
const tdRight = { ...td, textAlign: "right", whiteSpace: "nowrap" };
const field = () => ({ display: "grid", gap: 6 });
const label = () => ({ fontSize: 12, color: "#333", fontWeight: 600 });
const hint = () => ({ fontSize: 11, color: "#777" });
const searchInput = () => ({ padding: "6px 10px", minWidth: 320, border: "1px solid #ddd", borderRadius: 6 });
