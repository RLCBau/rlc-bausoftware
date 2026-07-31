import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/mengenermittlung/VerknuepfungNachtraegeAbrechnung.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";
const API = import.meta?.env?.VITE_API_URL ||
    import.meta?.env?.VITE_BACKEND_URL ||
    "https://api.rlcbausoftware.com";
/* ================= STYLES (copiati come AufmassEditor) ================= */
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
const fmtEUR = (v) => "€ " + (Number.isFinite(v) ? v.toFixed(2) : "0.00");
const num = (v, d = 3) => {
    const n = Number(v);
    return Number.isFinite(n)
        ? n.toLocaleString("de-DE", { maximumFractionDigits: d })
        : "0";
};
/* ================= LOCAL STORAGE HELPERS ================= */
function loadAufmassLocal(projectKey) {
    if (!projectKey)
        return [];
    try {
        const key = `RLC_AUFMASS_${projectKey}`;
        const raw = localStorage.getItem(key);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function loadNachtraegeLocal(projectId) {
    if (!projectId)
        return [];
    try {
        const raw = localStorage.getItem(`nt:${projectId}`);
        const parsed = JSON.parse(raw || "[]");
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
/* ================= OPTIONAL API (non rompe se assente) ================= */
async function tryApi(path) {
    try {
        const res = await fetch(`${API}${path}`);
        if (!res.ok)
            return null;
        return (await res.json());
    }
    catch {
        return null;
    }
}
/* ================= COMPONENT ================= */
export default function VerknuepfungNachtraegeAbrechnung() {
    const navigate = useNavigate();
    const { getSelectedProject } = useProject();
    const project = getSelectedProject();
    const projectKey = (project?.code || project?.id || "").trim();
    const projectId = project?.id || "";
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [err, setErr] = React.useState(null);
    const [sel, setSel] = React.useState({});
    const selectedIds = React.useMemo(() => Object.keys(sel).filter((k) => sel[k]), [sel]);
    function toggleAll(v) {
        const next = {};
        rows.forEach((r) => (next[r.id] = v));
        setSel(next);
    }
    function toggleOne(id, v) {
        setSel((s) => ({ ...s, [id]: v }));
    }
    function buildRows(aufmass, nts) {
        const ntByLvPos = new Map();
        for (const n of nts) {
            const k = String(n.lvPos || "").trim();
            if (!k)
                continue;
            const arr = ntByLvPos.get(k) || [];
            arr.push({ ...n, total: (n.qty || 0) * (n.ep || 0) });
            ntByLvPos.set(k, arr);
        }
        return (aufmass || []).map((r) => {
            const diff = Number(r.ist || 0) - Number(r.soll || 0);
            const status = diff === 0 ? "OK" : diff > 0 ? "UEBERMASS" : "FEHLMENGE";
            const lvPos = String(r.pos || "").trim();
            const matches = ntByLvPos.get(lvPos) || [];
            const best = matches[0]; // semplice: primo
            return {
                id: r.id || `${lvPos}-${Math.random()}`,
                lvPos,
                text: String(r.text || ""),
                unit: String(r.unit || ""),
                soll: Number(r.soll || 0),
                ist: Number(r.ist || 0),
                ep: Number(r.ep || 0),
                diff,
                status,
                nachtragNr: best?.number || undefined,
                nachtragStatus: best?.status || undefined,
                nachtragTotal: best?.total || undefined,
                abschlagNr: null,
            };
        });
    }
    async function load() {
        if (!projectKey) {
            setRows([]);
            setSel({});
            setErr("Kein Projekt gewählt.");
            return;
        }
        setLoading(true);
        setErr(null);
        try {
            // 1) optional server (se esiste, non obbligatorio)
            // TODO: se implementi endpoint, qui puoi usarli senza cambiare UI.
            // const server = await tryApi<{ ok: boolean; items: LinkRow[] }>(`/api/linking/list?projectId=${encodeURIComponent(projectId)}`);
            // 2) local fallback: Aufmaß + Nachträge LS
            const aufmass = loadAufmassLocal(projectKey);
            const nachtraege = projectId ? loadNachtraegeLocal(projectId) : [];
            const built = buildRows(aufmass, nachtraege);
            setRows(built);
            setSel({});
        }
        catch (e) {
            setErr(e?.message || "Fehler beim Laden");
            setRows([]);
            setSel({});
        }
        finally {
            setLoading(false);
        }
    }
    React.useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectKey, projectId]);
    const kpi = React.useMemo(() => {
        let sollSum = 0;
        let istSum = 0;
        let offenNachtrag = 0;
        let abrechenbar = 0;
        for (const r of rows) {
            sollSum += r.soll || 0;
            istSum += r.ist || 0;
            // “offen nachtrag”: Übermaß ohne Nachtrag-Nr.
            if (r.diff > 0 && !r.nachtragNr) {
                offenNachtrag += r.diff * (r.ep || 0);
            }
            // “abrechenbar”: tutto ist * ep (placeholder finché non c’è Abschlag)
            abrechenbar += (r.ist || 0) * (r.ep || 0);
        }
        return { sollSum, istSum, offenNachtrag, abrechenbar };
    }, [rows]);
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
            return (_jsx("span", { style: { ...base, background: "#ECFDF3", borderColor: "#BBF7D0", color: "#166534" }, children: "OK" }));
        if (st === "UEBERMASS")
            return (_jsx("span", { style: { ...base, background: "#FEF3C7", borderColor: "#FDE68A", color: "#92400E" }, children: "\u00DCberma\u00DF" }));
        return (_jsx("span", { style: { ...base, background: "#FEE2E2", borderColor: "#FECACA", color: "#991B1B" }, children: "Fehlmenge" }));
    };
    return (_jsxs("div", { style: pageContainer, children: [_jsxs("div", { style: { marginBottom: 14 }, children: [_jsx("div", { style: { fontSize: 12, color: "#6B7280", marginBottom: 4 }, children: "RLC / 2. Mengenermittlung / Verkn\u00FCpfung mit Nachtr\u00E4gen & Abrechnung" }), _jsx("div", { style: { fontSize: 22, fontWeight: 700, color: "#111827" }, children: "Verkn\u00FCpfung mit Nachtr\u00E4gen & Abrechnung" }), _jsx("div", { style: { marginTop: 8, fontSize: 13, color: "#4B5563" }, children: "Mengenermittlung \u2192 LV-Positionen \u2192 Nachtr\u00E4ge \u2192 Abschlagsrechnungen" }), project && (_jsxs("div", { style: { marginTop: 6, fontSize: 13, color: "#4B5563" }, children: [_jsx("b", { children: project.code }), " \u2014 ", project.name, project.client ? ` • ${project.client}` : "", project.place ? ` • ${project.place}` : ""] }))] }), _jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
                    gap: 12,
                    marginBottom: 16,
                }, children: [_jsx(Kpi, { label: "Soll (Summe)", value: num(kpi.sollSum, 3) }), _jsx(Kpi, { label: "Ist (Summe)", value: num(kpi.istSum, 3) }), _jsx(Kpi, { label: "Offene Nachtr\u00E4ge (\u20AC)", value: fmtEUR(kpi.offenNachtrag) }), _jsx(Kpi, { label: "Abrechenbar (\u20AC)", value: fmtEUR(kpi.abrechenbar) })] }), _jsxs("section", { style: card, children: [_jsxs("div", { style: cardTitleRow, children: [_jsxs("div", { children: [_jsx("div", { style: cardTitle, children: "Positionen (Soll/Ist, Nachtrag, Abschlag)" }), _jsx("div", { style: cardHint, children: "Daten kommen aktuell aus Aufma\u00DF (localStorage) + Nachtr\u00E4ge (localStorage). Server optional." })] }), _jsx("div", { style: { fontSize: 12, color: "#6B7280" }, children: loading ? "Lädt…" : `${rows.length} Zeile(n)` })] }), _jsxs("div", { style: toolbar, children: [_jsx("button", { style: btn, onClick: () => void load(), disabled: loading, children: "Laden" }), _jsx("button", { style: btn, disabled: selectedIds.length === 0, onClick: () => alert("Freigeben: API-Endpunkt fehlt noch (TODO)."), children: "Freigeben" }), _jsx("button", { style: btn, disabled: selectedIds.length === 0, onClick: () => alert("Als Nachtrag anlegen: Öffne den Nachträge-Editor (falls du ihn routest) oder implementiere API.\n\nTipp: Route z.B. /mengenermittlung/nachtraege"), children: "Als Nachtrag anlegen" }), _jsx("button", { style: btn, disabled: selectedIds.length === 0, onClick: () => alert("In Abschlag übernehmen: API-Endpunkt fehlt noch (TODO)."), children: "In Abschlag \u00FCbernehmen" }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { style: btn, onClick: () => toggleAll(true), disabled: !rows.length, children: "Alle w\u00E4hlen" }), _jsx("button", { style: btn, onClick: () => toggleAll(false), disabled: !rows.length, children: "Auswahl l\u00F6schen" }), _jsx("button", { style: btnPrimary, onClick: () => navigate("/mengenermittlung/aufmasseditor"), title: "Zur\u00FCck zum Aufma\u00DF-Editor", children: "\u21A9\uFE0E Aufma\u00DF-Editor" })] }), err && (_jsx("div", { style: {
                            marginTop: 10,
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #FECACA",
                            background: "#FEF2F2",
                            color: "#991B1B",
                            fontSize: 13,
                        }, children: err })), _jsx("div", { style: {
                            marginTop: 10,
                            borderRadius: 10,
                            border: "1px solid #E5E7EB",
                            overflow: "auto",
                        }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: _jsx("input", { type: "checkbox", checked: rows.length > 0 && selectedIds.length === rows.length, onChange: (e) => toggleAll(e.target.checked) }) }), _jsx("th", { style: th, children: "LV-Pos" }), _jsx("th", { style: th, children: "Kurztext" }), _jsx("th", { style: th, children: "Einheit" }), _jsx("th", { style: th, children: "Soll" }), _jsx("th", { style: th, children: "Ist" }), _jsx("th", { style: th, children: "Diff" }), _jsx("th", { style: th, children: "Status" }), _jsx("th", { style: th, children: "EP (\u20AC)" }), _jsx("th", { style: th, children: "Nachtrag" }), _jsx("th", { style: th, children: "Abschlag" })] }) }), _jsx("tbody", { children: rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { style: { ...td, color: "#6B7280" }, colSpan: 11, children: "Keine Daten. Bitte im Aufma\u00DF-Editor speichern oder \u201ELaden\u201C dr\u00FCcken." }) })) : (rows.map((r) => (_jsxs("tr", { style: { background: "#FFFFFF" }, children: [_jsx("td", { style: td, children: _jsx("input", { type: "checkbox", checked: !!sel[r.id], onChange: (e) => toggleOne(r.id, e.target.checked) }) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap", fontWeight: 600 }, children: r.lvPos }), _jsx("td", { style: td, children: r.text }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: r.unit }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: num(r.soll, 3) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap", fontWeight: 700 }, children: num(r.ist, 3) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: num(r.diff, 3) }), _jsx("td", { style: td, children: badge(r.status) }), _jsxs("td", { style: { ...td, whiteSpace: "nowrap" }, children: [num(r.ep, 2), " \u20AC"] }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: r.nachtragNr ? (_jsxs("span", { title: r.nachtragStatus || "", children: ["NT ", r.nachtragNr, " ", typeof r.nachtragTotal === "number"
                                                            ? `(${fmtEUR(r.nachtragTotal)})`
                                                            : ""] })) : (_jsx("span", { style: { color: "#6B7280" }, children: "-" })) }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: typeof r.abschlagNr === "number" ? `#${r.abschlagNr}` : "-" })] }, r.id)))) })] }) }), _jsx("div", { style: { marginTop: 10, fontSize: 12, color: "#6B7280" }, children: "Hinweis: Derzeit ist die Verkn\u00FCpfung nach LV-Pos (pos) \u2192 Nachtrag.lvPos umgesetzt (localStorage). Abschl\u00E4ge sind noch TODO." })] })] }));
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
