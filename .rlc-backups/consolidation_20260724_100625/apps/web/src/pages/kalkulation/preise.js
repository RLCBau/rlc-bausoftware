import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// preise.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Catalog } from "./catalogStore";
import { LV } from "./store.lv";
// ❌ import { Projects } from "./projectStore";  // <-- RIMOSSO
import { useProject } from "../../store/useProject"; // ✅ usa lo store globale (adatta path se diverso)
const API = import.meta?.env?.VITE_API_URL ||
    import.meta?.env?.VITE_BACKEND_URL ||
    "https://api.rlcbausoftware.com";
export default function PreisePage() {
    // ✅ PROJEKT: prende lo stesso progetto che vedi nella UI globale
    const projectState = useProject();
    const project = projectState?.project ||
        projectState?.currentProject ||
        projectState?.selectedProject ||
        projectState; // fallback: se lo store ritorna direttamente il project
    const [cat, setCat] = useState([]);
    const [query, setQuery] = useState("");
    const [gruppe, setGruppe] = useState("Alle");
    const [allWords, setAllWords] = useState(false);
    const [wholeWords, setWholeWords] = useState(true);
    const [selected, setSelected] = useState({});
    const [stat, setStat] = useState("");
    const [err, setErr] = useState("");
    // Company context (opzione 2)
    const [companyId, setCompanyId] = useState("");
    const [savingPrices, setSavingPrices] = useState(false);
    // Validity inputs
    const [validFrom, setValidFrom] = useState(() => new Date().toISOString().slice(0, 10)); // yyyy-mm-dd
    const [note, setNote] = useState("seed-ui");
    const fileRef = useRef(null);
    useEffect(() => {
        setCat(Catalog.list());
    }, []);
    // ====== load companyId for current project (OPZIONE 2) ======
    useEffect(() => {
        let alive = true;
        setErr("");
        setCompanyId("");
        async function loadCompanyId() {
            if (!project?.id)
                return;
            try {
                // Assumption: GET /api/projects/:id returns { ok, project: { companyId, ... } } or { companyId }
                const r = await fetch(`${API.replace(/\/$/, "")}/api/projects/${encodeURIComponent(project.id)}`, {
                    headers: { "Content-Type": "application/json" },
                });
                if (!r.ok)
                    throw new Error(`GET project failed: ${r.status}`);
                const j = await r.json();
                const cid = j?.project?.companyId || j?.companyId || j?.data?.companyId || "";
                if (!cid)
                    throw new Error("companyId not found in project response");
                if (alive)
                    setCompanyId(String(cid));
            }
            catch (e) {
                if (alive)
                    setErr(e?.message || String(e));
            }
        }
        loadCompanyId();
        return () => {
            alive = false;
        };
    }, [project?.id]);
    const gruppen = ["Alle", "Material", "Arbeiter", "Maschinen"];
    // ✅ compatibile ovunque: rimuove accenti senza \p{...}
    const norm = (s) => s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "");
    const tokens = useMemo(() => {
        const t = norm(query).split(/[^a-z0-9.]+/g).filter(Boolean);
        return Array.from(new Set(t));
    }, [query]);
    const matchRow = (r) => {
        if (!tokens.length)
            return true;
        const hay = norm(`${r.posNr ?? ""} ${r.kurztext ?? ""}`);
        const check = (tok) => {
            if (!wholeWords)
                return hay.includes(tok);
            const re = new RegExp(`(^|\\W)${escapeRegex(tok)}(\\W|$)`, "i");
            return re.test(hay);
        };
        return allWords ? tokens.every(check) : tokens.some(check);
    };
    const view = useMemo(() => {
        let rows = [...cat];
        if (gruppe !== "Alle")
            rows = rows.filter((x) => (x.gruppe || "") === gruppe);
        rows = rows.filter(matchRow);
        return rows.slice(0, 2000);
    }, [cat, gruppe, tokens, allWords, wholeWords]);
    const counts = useMemo(() => {
        const c = { Alle: 0, Material: 0, Arbeiter: 0, Maschinen: 0 };
        for (const r of cat) {
            c.Alle++;
            if (r.gruppe === "Material")
                c.Material++;
            else if (r.gruppe === "Arbeiter")
                c.Arbeiter++;
            else if (r.gruppe === "Maschinen")
                c.Maschinen++;
        }
        return c;
    }, [cat]);
    const toggleAll = (checked) => {
        const next = {};
        if (checked)
            view.forEach((r) => (next[r.id] = true));
        setSelected(next);
    };
    const importCSV = (text) => {
        setErr("");
        const n = Catalog.importCSV(text);
        setCat(Catalog.list());
        setStat(`Importiert: ${n.toLocaleString("de-DE")} Positionen.`);
    };
    const exportCSV = () => {
        setErr("");
        const csv = Catalog.exportCSV();
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "katalog.csv";
        a.click();
        URL.revokeObjectURL(url);
    };
    const addToLV = (mode) => {
        setErr("");
        const sel = view.filter((r) => selected[r.id]);
        if (!sel.length) {
            alert("Bitte mindestens eine Position auswählen.");
            return;
        }
        const cur = LV.list();
        const map = new Map(cur.map((x) => [x.posNr, x]));
        let ins = 0, upd = 0;
        for (const r of sel) {
            const found = map.get(r.posNr);
            if (found && mode === "upsert") {
                LV.upsert({
                    ...found,
                    preis: r.ep,
                    kurztext: found.kurztext || r.kurztext,
                    einheit: found.einheit || r.einheit,
                });
                upd++;
            }
            else if (!found) {
                LV.upsert({
                    id: crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2),
                    posNr: r.posNr,
                    kurztext: r.kurztext,
                    einheit: r.einheit,
                    menge: 0,
                    preis: r.ep,
                    confidence: undefined,
                });
                ins++;
            }
        }
        setStat(`Zum LV übernommen — neu: ${ins}, aktualisiert: ${upd}.`);
    };
    // ====== NEW: save selected to CompanyPrice (opzione 2) ======
    function toRefKey(r) {
        const pos = String(r.posNr || "").trim();
        // if already looks like LABOR:..., MACHINE:..., MATERIAL:..., keep it
        if (/^(LABOR|MACHINE|MATERIAL):/i.test(pos))
            return pos.toUpperCase();
        const g = String(r.gruppe || "").trim();
        if (g === "Arbeiter")
            return `LABOR:${pos}`;
        if (g === "Maschinen")
            return `MACHINE:${pos}`;
        if (g === "Material")
            return `MATERIAL:${pos}`;
        // fallback: keep group-less as OTHER
        return `OTHER:${pos}`;
    }
    async function saveToCompanyPrices(mode) {
        setErr("");
        setStat("");
        if (!project?.id) {
            alert("Kein Projekt ausgewählt.");
            return;
        }
        if (!companyId) {
            alert("companyId konnte nicht geladen werden. Prüfe /api/projects/:id Route.");
            return;
        }
        const sel = view.filter((r) => selected[r.id]);
        if (!sel.length) {
            alert("Bitte mindestens eine Position auswählen.");
            return;
        }
        const vf = (validFrom || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(vf)) {
            alert("validFrom muss im Format YYYY-MM-DD sein.");
            return;
        }
        const rows = sel
            .filter((r) => typeof r.ep === "number" && !Number.isNaN(r.ep))
            .map((r) => ({
            refKey: toRefKey(r),
            price: Number(r.ep || 0),
            unit: String(r.einheit || "").trim() || "pauschal",
            validFrom: new Date(`${vf}T00:00:00.000Z`).toISOString(),
            validTo: null,
            note: note?.trim() ? note.trim() : null,
        }))
            .filter((x) => x.refKey && x.price >= 0);
        if (!rows.length) {
            alert("Keine gültigen Preise in der Auswahl (EP fehlt?).");
            return;
        }
        setSavingPrices(true);
        try {
            const resp = await fetch(`${API.replace(/\/$/, "")}/api/company-prices/bulk-upsert`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    companyId,
                    mode, // "insert" | "upsert"
                    rows,
                }),
            });
            const j = await resp.json().catch(() => ({}));
            if (!resp.ok || j?.ok === false) {
                throw new Error(j?.error || `bulk-upsert failed: ${resp.status}`);
            }
            const inserted = Number(j?.inserted ?? 0);
            const updated = Number(j?.updated ?? 0);
            const skipped = Number(j?.skipped ?? 0);
            setStat(`CompanyPrice gespeichert — inserted: ${inserted}, updated: ${updated}, skipped: ${skipped}.`);
        }
        catch (e) {
            setErr(e?.message || String(e));
        }
        finally {
            setSavingPrices(false);
        }
    }
    const katalogCount = Catalog.count();
    return (_jsxs("div", { style: { padding: 16 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }, children: [_jsx("h2", { style: { margin: 0 }, children: "Preise einf\u00FCgen (Material / Arbeiter / Maschinen)" }), _jsxs("div", { style: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("div", { style: badge, children: project?.id ? (_jsxs(_Fragment, { children: [_jsx("b", { children: project.number || project.code || project.id }), _jsxs("span", { children: [" \u2014 ", project.name || "Projekt"] })] })) : ("kein Projekt ausgewählt") }), _jsxs("div", { style: badge, children: [_jsx("span", { style: { opacity: 0.75 }, children: "CompanyId:" }), " ", _jsx("b", { style: { fontFamily: "monospace" }, children: companyId || "—" })] })] })] }), _jsxs("div", { style: panel, children: [_jsxs("div", { style: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("input", { placeholder: "Suche\u2026 (PosNr, Kurztext)", value: query, onChange: (e) => setQuery(e.target.value), style: input(360) }), _jsxs("label", { style: chk, children: [_jsx("input", { type: "checkbox", checked: allWords, onChange: (e) => setAllWords(e.target.checked) }), "Alle W\u00F6rter (UND)"] }), _jsxs("label", { style: chk, children: [_jsx("input", { type: "checkbox", checked: wholeWords, onChange: (e) => setWholeWords(e.target.checked) }), "Ganze W\u00F6rter"] }), _jsx("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: gruppen.map((g) => (_jsxs("button", { onClick: () => setGruppe(g), style: { ...chip, ...(gruppe === g ? chipActive : {}) }, title: `${g} (${counts[g].toLocaleString("de-DE")})`, children: [g, _jsx("span", { style: { opacity: 0.7, marginLeft: 6 }, children: counts[g].toLocaleString("de-DE") })] }, g))) }), _jsxs("div", { style: { marginLeft: "auto", color: "#666" }, children: ["Katalog: ", _jsx("b", { children: katalogCount.toLocaleString("de-DE") }), " Positionen"] })] }), _jsxs("div", { style: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }, children: [_jsx("button", { onClick: () => fileRef.current?.click(), children: "CSV-Import" }), _jsx("input", { ref: fileRef, type: "file", accept: ".csv", style: { display: "none" }, onChange: (e) => {
                                    const f = e.target.files?.[0];
                                    if (!f)
                                        return;
                                    const r = new FileReader();
                                    r.onload = () => importCSV(String(r.result || ""));
                                    r.readAsText(f, "utf-8");
                                } }), _jsx("button", { onClick: exportCSV, children: "CSV-Export (Katalog)" }), _jsx("span", { style: { width: 16 } }), _jsx("button", { onClick: () => addToLV("insert"), style: primary, children: "\u2192 Ins LV einf\u00FCgen (nur neue)" }), _jsx("button", { onClick: () => addToLV("upsert"), children: "\u2192 Aktualisieren/Einf\u00FCgen ins LV (Upsert)" }), _jsx("span", { style: { width: 16 } }), _jsxs("label", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 13 }, children: ["g\u00FCltig ab", _jsx("input", { value: validFrom, onChange: (e) => setValidFrom(e.target.value), style: input(140), placeholder: "YYYY-MM-DD" })] }), _jsxs("label", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 13 }, children: ["note", _jsx("input", { value: note, onChange: (e) => setNote(e.target.value), style: input(160), placeholder: "note" })] }), _jsx("button", { onClick: () => saveToCompanyPrices("insert"), disabled: savingPrices || !companyId, style: { ...primary, borderColor: "#27a", background: "#eef7ff" }, title: "Schreibt CompanyPrice f\u00FCr die Company des aktuellen Projekts", children: "\u2192 In Firmenpreise speichern (nur neue)" }), _jsx("button", { onClick: () => saveToCompanyPrices("upsert"), disabled: savingPrices || !companyId, title: "Upsert CompanyPrice f\u00FCr die Company des aktuellen Projekts", children: "\u2192 In Firmenpreise speichern (Upsert)" })] }), err && _jsx("div", { style: { marginTop: 8, color: "#b00020" }, children: err }), stat && _jsx("div", { style: { marginTop: 8, color: "#0b7a3c" }, children: stat }), _jsxs("div", { style: { marginTop: 8, fontSize: 12, opacity: 0.75 }, children: ["Mapping: Arbeiter \u2192 ", _jsx("code", { children: "LABOR:PosNr" }), ", Maschinen \u2192 ", _jsx("code", { children: "MACHINE:PosNr" }), ", Material \u2192 ", _jsx("code", { children: "MATERIAL:PosNr" })] })] }), _jsx("div", { style: { marginTop: 12, border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 14 }, children: [_jsx("thead", { style: { background: "#fafafa", position: "sticky", top: 0, zIndex: 1 }, children: _jsxs("tr", { children: [_jsx("th", { style: th, children: _jsx("input", { type: "checkbox", onChange: (e) => toggleAll(e.target.checked), title: "Seite ausw\u00E4hlen (max. 2000 sichtbar)" }) }), ["PosNr", "Kurztext", "ME", "EP (netto)", "Gruppe"].map((h, i) => (_jsx("th", { style: th, children: h }, i))), _jsx("th", { style: th, children: "refKey (Preview)" })] }) }), _jsxs("tbody", { children: [view.map((r, i) => {
                                    const sel = !!selected[r.id];
                                    return (_jsxs("tr", { style: { background: i % 2 ? "#fcfcfc" : "#fff" }, children: [_jsx("td", { style: tdCenter, children: _jsx("input", { type: "checkbox", checked: sel, onChange: (e) => setSelected((s) => ({ ...s, [r.id]: e.target.checked })) }) }), _jsx("td", { style: td, children: r.posNr }), _jsx("td", { style: td, children: r.kurztext }), _jsx("td", { style: td, children: r.einheit }), _jsx("td", { style: { ...tdNum, fontWeight: 600 }, children: fmt(r.ep) }), _jsx("td", { style: td, children: r.gruppe || "–" }), _jsx("td", { style: { ...td, fontFamily: "monospace", fontSize: 12, opacity: 0.85 }, children: toRefKey(r) })] }, r.id));
                                }), !view.length && (_jsx("tr", { children: _jsx("td", { colSpan: 7, style: { padding: 12, color: "#777" }, children: "Kein Ergebnis. Bitte Katalog-CSV importieren oder Filter anpassen." }) }))] })] }) })] }));
}
/* ---------- UI ---------- */
const th = {
    textAlign: "left",
    padding: "8px 6px",
    borderBottom: "1px solid #eee",
    whiteSpace: "nowrap",
    fontWeight: 600,
};
const td = { padding: "6px", borderBottom: "1px solid #f5f5f5" };
const tdNum = { ...td, textAlign: "right" };
const tdCenter = { ...td, textAlign: "center", width: 36 };
const panel = { border: "1px solid #eee", borderRadius: 10, background: "#fff", padding: 12, marginTop: 8 };
const input = (w) => ({ width: w, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6 });
const badge = {
    border: "1px solid #eee",
    borderRadius: 999,
    padding: "6px 12px",
    background: "#fafafa",
    display: "flex",
    gap: 8,
    alignItems: "center",
    whiteSpace: "nowrap",
};
const primary = { fontWeight: 700, border: "1px solid #2b7", background: "#eafff4", padding: "6px 10px", borderRadius: 6 };
const chip = { border: "1px solid #ddd", background: "#fff", borderRadius: 999, padding: "4px 10px", cursor: "pointer" };
const chipActive = { borderColor: "#2b7", background: "#f2fffa", fontWeight: 600 };
const chk = { display: "flex", alignItems: "center", gap: 4, fontSize: 13 };
const fmt = (n) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
