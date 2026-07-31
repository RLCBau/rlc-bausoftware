import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
const API = import.meta?.env?.VITE_API_URL ||
    import.meta?.env?.VITE_BACKEND_URL ||
    "https://api.rlcbausoftware.com";
/* ================= STYLES ================= */
const pageContainer = {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "1.5rem 1.75rem 2rem",
};
const card = {
    background: "#FFFFFF",
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    padding: "1.25rem 1.5rem 1.5rem",
};
const cardTitleRow = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "0.75rem",
};
const cardTitle = {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#111827",
};
const cardHint = {
    fontSize: "0.8rem",
    color: "#9CA3AF",
};
const toolbar = {
    display: "flex",
    gap: 8,
    padding: "6px 10px 10px",
    borderBottom: "1px solid #E5E7EB",
    alignItems: "center",
    flexWrap: "wrap",
};
const btn = {
    fontSize: "0.8rem",
    borderRadius: 999,
    padding: "0.35rem 0.9rem",
    border: "1px solid #D1D5DB",
    background: "#F9FAFB",
    color: "#374151",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
};
const btnPrimary = {
    ...btn,
    background: "#2563EB",
    borderColor: "#1D4ED8",
    color: "#FFFFFF",
    fontWeight: 500,
};
const th = {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid #E5E7EB",
    fontSize: 12,
    whiteSpace: "nowrap",
    background: "#F9FAFB",
    color: "#4B5563",
};
const td = {
    padding: "6px 10px",
    borderBottom: "1px solid #E5E7EB",
    fontSize: 13,
    verticalAlign: "middle",
};
const fmtEUR = (v) => "€ " +
    (Number.isFinite(v)
        ? v.toLocaleString("de-DE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
        : "0,00");
const num = (v, d = 3) => {
    const n = Number(v);
    return Number.isFinite(n)
        ? n.toLocaleString("de-DE", { maximumFractionDigits: d })
        : "0";
};
async function apiJson(path, init) {
    const base = String(API || "").replace(/\/+$/, "");
    const res = await fetch(`${base}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...init,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
        throw new Error(text || `Server-Fehler (${res.status})`);
    }
    try {
        return JSON.parse(text);
    }
    catch {
        // se server risponde plain text
        return text;
    }
}
/* ================= COMPONENT ================= */
export default function VerknuepfungNachtraegeAbrechnung() {
    const navigate = useNavigate();
    const { getSelectedProject } = useProject();
    const project = getSelectedProject();
    // IMPORTANT: per la Verknüpfung usiamo il project CODE come folder key (data/projects/<code>)
    const projectKey = (project?.code || "").trim();
    const [rows, setRows] = React.useState([]);
    const [kpi, setKpi] = React.useState({
        sollSum: 0,
        istSum: 0,
        offenNachtragEUR: 0,
        abrechenbarEUR: 0,
    });
    const [loading, setLoading] = React.useState(false);
    const [err, setErr] = React.useState(null);
    const [info, setInfo] = React.useState(null);
    const [sourceFile, setSourceFile] = React.useState(null);
    // selection by lvPos
    const [sel, setSel] = React.useState({});
    const selectedLvPos = React.useMemo(() => Object.keys(sel).filter((k) => sel[k]), [sel]);
    const canAct = !!projectKey && selectedLvPos.length > 0 && !loading;
    function toggleAll(v) {
        const next = {};
        if (v)
            rows.forEach((r) => (next[r.lvPos] = true));
        setSel(next);
    }
    function toggleOne(lvPos, v) {
        setSel((s0) => ({ ...s0, [lvPos]: v }));
    }
    async function load() {
        if (!projectKey) {
            setRows([]);
            setSel({});
            setErr("Kein Projekt gewählt.");
            setInfo(null);
            setSourceFile(null);
            return;
        }
        setLoading(true);
        setErr(null);
        setInfo(null);
        setSourceFile(null);
        try {
            let data = null;
            try {
                data = await apiJson(`/api/verknuepfung/list/${encodeURIComponent(projectKey)}`);
            }
            catch {
                data = await apiJson(`/api/verknuepfung/list?projectKey=${encodeURIComponent(projectKey)}`);
            }
            if (!data || data.ok === false) {
                throw new Error(data?.error || "Fehler beim Laden (ok=false)");
            }
            const items = Array.isArray(data.items) ? data.items : [];
            setRows(items);
            setSel({});
            setSourceFile(data.sourceSollIstFile || null);
            if (data.kpi) {
                setKpi(data.kpi);
            }
            else {
                let sollSum = 0, istSum = 0, offenNachtragEUR = 0, abrechenbarEUR = 0;
                for (const r of items) {
                    sollSum += Number(r.soll || 0);
                    istSum += Number(r.ist || 0);
                    if (Number(r.diff || 0) > 0 && !r.nachtragNr) {
                        offenNachtragEUR += Number(r.diff || 0) * Number(r.ep || 0);
                    }
                    abrechenbarEUR += Number(r.ist || 0) * Number(r.ep || 0);
                }
                setKpi({ sollSum, istSum, offenNachtragEUR, abrechenbarEUR });
            }
        }
        catch (e) {
            const msg = e?.message || "Fehler beim Laden";
            setErr(`${msg}\n\nAPI: ${String(API)}`);
            setRows([]);
            setSel({});
            setSourceFile(null);
            setKpi({
                sollSum: 0,
                istSum: 0,
                offenNachtragEUR: 0,
                abrechenbarEUR: 0,
            });
        }
        finally {
            setLoading(false);
        }
    }
    async function freigeben() {
        if (!canAct)
            return;
        setLoading(true);
        setErr(null);
        setInfo(null);
        try {
            await apiJson(`/api/verknuepfung/freigeben/${encodeURIComponent(projectKey)}`, {
                method: "POST",
                body: JSON.stringify({ lvPos: selectedLvPos }),
            });
            await load();
            setInfo(`Freigabe gesetzt für ${selectedLvPos.length} Position(en).`);
        }
        catch (e) {
            setErr((e?.message || "Fehler beim Freigeben") + `\n\nAPI: ${String(API)}`);
        }
        finally {
            setLoading(false);
        }
    }
    async function alsNachtragAnlegen() {
        if (!canAct)
            return;
        setLoading(true);
        setErr(null);
        setInfo(null);
        try {
            await apiJson(`/api/verknuepfung/nachtrag/${encodeURIComponent(projectKey)}`, {
                method: "POST",
                body: JSON.stringify({ lvPos: selectedLvPos }),
            });
            await load();
            setInfo(`Nachtrag erstellt für ${selectedLvPos.length} Position(en).`);
            navigate("/kalkulation/nachtraege");
        }
        catch (e) {
            setErr((e?.message || "Fehler beim Erstellen der Nachträge") + `\n\nAPI: ${String(API)}`);
        }
        finally {
            setLoading(false);
        }
    }
    async function inAbschlagUebernehmen() {
        if (!canAct)
            return;
        const raw = prompt("Abschlagsrechnung Nummer (leer = neue):", "");
        const n = raw ? Number(String(raw).trim()) : NaN;
        const nr = Number.isFinite(n) && n > 0 ? n : null;
        setLoading(true);
        setErr(null);
        setInfo(null);
        try {
            const resp = await apiJson(`/api/verknuepfung/abschlag/${encodeURIComponent(projectKey)}`, {
                method: "POST",
                body: JSON.stringify({ lvPos: selectedLvPos, nr }),
            });
            if (!resp || resp.ok === false) {
                throw new Error(resp?.error || "Fehler (ok=false)");
            }
            const usedNr = typeof resp.nr === "number" ? resp.nr : nr ?? undefined;
            // Flag per la pagina Abschlagsrechnungen (auto-load / focus)
            try {
                localStorage.setItem(`rlc_abschlaege_focus_${projectKey}`, JSON.stringify({ nr: usedNr ?? null, ts: Date.now() }));
            }
            catch { }
            await load();
            setInfo(`In Abschlag übernommen: ${selectedLvPos.length} Position(en)` +
                (usedNr ? ` → Abschlagsrechnung #${usedNr}` : ""));
            // Vai alla lista Buchhaltung
            navigate("/buchhaltung/abschlagsrechnungen");
        }
        catch (e) {
            setErr((e?.message || "Fehler beim Übernehmen in Abschlag") + `\n\nAPI: ${String(API)}`);
        }
        finally {
            setLoading(false);
        }
    }
    React.useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectKey]);
    const badge = (st) => {
        const base = {
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 12,
            border: "1px solid",
            whiteSpace: "nowrap",
        };
        if (st === "OK")
            return (_jsx("span", { style: {
                    ...base,
                    background: "#ECFDF3",
                    borderColor: "#BBF7D0",
                    color: "#166534",
                }, children: "OK" }));
        if (st === "UEBERMASS")
            return (_jsx("span", { style: {
                    ...base,
                    background: "#FEF3C7",
                    borderColor: "#FDE68A",
                    color: "#92400E",
                }, children: "\u00DCberma\u00DF" }));
        if (st === "FEHLMENGE")
            return (_jsx("span", { style: {
                    ...base,
                    background: "#FEE2E2",
                    borderColor: "#FECACA",
                    color: "#991B1B",
                }, children: "Fehlmenge" }));
        return (_jsx("span", { style: { ...base, background: "#F3F4F6", borderColor: "#E5E7EB" }, children: st || "—" }));
    };
    const allChecked = rows.length > 0 && selectedLvPos.length === rows.length;
    return (_jsxs("div", { style: pageContainer, children: [_jsxs("div", { style: { marginBottom: 14 }, children: [_jsx("div", { style: { fontSize: 12, color: "#6B7280", marginBottom: 4 }, children: "RLC / 2. Mengenermittlung / Verkn\u00FCpfung mit Nachtr\u00E4gen & Abrechnung" }), _jsx("div", { style: { fontSize: 22, fontWeight: 700, color: "#111827" }, children: "Verkn\u00FCpfung mit Nachtr\u00E4gen & Abrechnung" }), _jsx("div", { style: { marginTop: 8, fontSize: 13, color: "#4B5563" }, children: "Mengenermittlung \u2192 LV-Positionen \u2192 Nachtr\u00E4ge \u2192 Abschlagsrechnungen" }), project && (_jsxs("div", { style: { marginTop: 6, fontSize: 13, color: "#4B5563" }, children: [_jsx("b", { children: project.code }), " \u2014 ", project.name, project.client ? ` • ${project.client}` : "", project.place ? ` • ${project.place}` : ""] }))] }), _jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
                    gap: 12,
                    marginBottom: 16,
                }, children: [_jsx(Kpi, { label: "Soll (Summe)", value: num(kpi.sollSum, 3) }), _jsx(Kpi, { label: "Ist (Summe)", value: num(kpi.istSum, 3) }), _jsx(Kpi, { label: "Offene Nachtr\u00E4ge (\u20AC)", value: fmtEUR(kpi.offenNachtragEUR) }), _jsx(Kpi, { label: "Abrechenbar (\u20AC)", value: fmtEUR(kpi.abrechenbarEUR) })] }), _jsxs("section", { style: card, children: [_jsxs("div", { style: cardTitleRow, children: [_jsxs("div", { children: [_jsx("div", { style: cardTitle, children: "Positionen (Soll/Ist, Nachtrag, Abschlag)" }), _jsxs("div", { style: cardHint, children: ["Diese Seite liest ", _jsx("b", { children: "soll-ist.json" }), " und erzeugt daraus Nachtr\u00E4ge/Abschl\u00E4ge.", sourceFile ? (_jsxs("span", { style: { marginLeft: 8 }, children: ["Quelle: ", _jsx("span", { style: { color: "#6B7280" }, children: sourceFile })] })) : null] })] }), _jsx("div", { style: { fontSize: 12, color: "#6B7280" }, children: loading ? "Lädt…" : `${rows.length} Zeile(n)` })] }), _jsxs("div", { style: toolbar, children: [_jsx("button", { style: btn, onClick: () => void load(), disabled: loading || !projectKey, children: "Laden" }), _jsx("button", { style: btn, disabled: !canAct, onClick: () => void freigeben(), children: "Freigeben" }), _jsx("button", { style: btn, disabled: !canAct, onClick: () => void alsNachtragAnlegen(), children: "Als Nachtrag anlegen" }), _jsx("button", { style: btn, disabled: !canAct, onClick: () => void inAbschlagUebernehmen(), children: "In Abschlag \u00FCbernehmen" }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { style: btn, onClick: () => navigate("/buchhaltung/abschlagsrechnungen"), disabled: !projectKey || loading, children: "Abschlagsrechnungen" }), _jsx("button", { style: btn, onClick: () => toggleAll(true), disabled: !rows.length || loading, children: "Alle w\u00E4hlen" }), _jsx("button", { style: btn, onClick: () => toggleAll(false), disabled: !rows.length || loading, children: "Auswahl l\u00F6schen" }), _jsx("button", { style: btnPrimary, onClick: () => navigate("/mengenermittlung/aufmasseditor"), title: "Zur\u00FCck zum Aufma\u00DF-Editor", children: "\u21A9\uFE0E Aufma\u00DF-Editor" })] }), info && (_jsx("div", { style: {
                            marginTop: 10,
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #BBF7D0",
                            background: "#ECFDF3",
                            color: "#166534",
                            fontSize: 13,
                            whiteSpace: "pre-wrap",
                        }, children: info })), err && (_jsx("div", { style: {
                            marginTop: 10,
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #FECACA",
                            background: "#FEF2F2",
                            color: "#991B1B",
                            fontSize: 13,
                            whiteSpace: "pre-wrap",
                        }, children: err })), _jsx("div", { style: {
                            marginTop: 10,
                            borderRadius: 10,
                            border: "1px solid #E5E7EB",
                            overflow: "auto",
                        }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: _jsx("input", { type: "checkbox", checked: allChecked, onChange: (e) => toggleAll(e.target.checked), disabled: !rows.length }) }), _jsx("th", { style: th, children: "LV-Pos" }), _jsx("th", { style: th, children: "Kurztext" }), _jsx("th", { style: th, children: "Einheit" }), _jsx("th", { style: th, children: "Soll" }), _jsx("th", { style: th, children: "Ist" }), _jsx("th", { style: th, children: "Diff" }), _jsx("th", { style: th, children: "Status" }), _jsx("th", { style: th, children: "EP (\u20AC)" }), _jsx("th", { style: th, children: "Nachtrag" }), _jsx("th", { style: th, children: "Abschlag" })] }) }), _jsx("tbody", { children: rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { style: { ...td, color: "#6B7280" }, colSpan: 11, children: "Keine Daten. Entweder ist soll-ist.json leer/nicht vorhanden oder noch nicht erzeugt." }) })) : (rows.map((r0) => (_jsxs("tr", { style: { background: "#FFFFFF" }, children: [_jsx("td", { style: td, children: _jsx("input", { type: "checkbox", checked: !!sel[r0.lvPos], onChange: (e) => toggleOne(r0.lvPos, e.target.checked) }) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap", fontWeight: 600 }, children: r0.lvPos }), _jsx("td", { style: td, children: r0.text }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: r0.unit }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: num(r0.soll, 3) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap", fontWeight: 700 }, children: num(r0.ist, 3) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap", fontWeight: 700 }, children: num(r0.diff, 3) }), _jsx("td", { style: td, children: badge(String(r0.status || "")) }), _jsxs("td", { style: { ...td, whiteSpace: "nowrap" }, children: [num(r0.ep, 2), " \u20AC"] }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: r0.nachtragNr ? (_jsxs("span", { title: r0.nachtragStatus || "", children: ["NT ", r0.nachtragNr, typeof r0.nachtragTotal === "number" ? ` (${fmtEUR(r0.nachtragTotal)})` : ""] })) : (_jsx("span", { style: { color: "#6B7280" }, children: "-" })) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: typeof r0.abschlagNr === "number" ? `#${r0.abschlagNr}` : "-" })] }, r0.id)))) })] }) }), _jsxs("div", { style: { marginTop: 10, fontSize: 12, color: "#6B7280" }, children: ["Hinweis: Voraussetzung ist, dass ", _jsx("b", { children: "soll-ist.json" }), " vorher im Aufma\u00DFvergleich (oder per Server-Import) erzeugt/gespeichert wurde."] })] })] }));
}
/* ================= SMALL UI PARTS ================= */
function Kpi({ label, value }) {
    return (_jsxs("div", { style: {
            background: "#FFFFFF",
            borderRadius: 12,
            border: "1px solid #E5E7EB",
            boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
            padding: "0.9rem 1rem",
        }, children: [_jsx("div", { style: { fontSize: 12, color: "#6B7280", marginBottom: 4 }, children: label }), _jsx("div", { style: { fontSize: 18, fontWeight: 700, color: "#111827" }, children: value })] }));
}
