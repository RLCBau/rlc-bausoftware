import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/Analyse.tsx
import { useState } from "react";
import { useProject } from "../../store/useProject";
/* ================= STYLES ================= */
const shell = {
    maxWidth: 900,
    margin: "0 auto",
    padding: "12px 16px",
    fontFamily: "Inter,system-ui,Arial"
};
const btn = {
    padding: "6px 10px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer"
};
const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    marginTop: 12
};
const thtd = {
    border: "1px solid #e2e8f0",
    padding: "6px 8px"
};
const head = {
    ...thtd,
    background: "#f8fafc",
    fontWeight: 600
};
/* ================= COMPONENT ================= */
export default function Analyse() {
    const { currentProject } = useProject();
    const projectId = currentProject?.id ?? "";
    const projectCode = currentProject?.code ?? "";
    const [res, setRes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const run = async () => {
        if (!projectId && !projectCode) {
            setError("Kein Projekt ausgewÃ¤hlt");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const r = await fetch("/api/ki/analyse", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    projectId,
                    projectCode
                })
            });
            const data = await r.json();
            if (!r.ok) {
                throw new Error(data?.error || "Analyse fehlgeschlagen");
            }
            // sicurezza dati
            const rows = Array.isArray(data?.rows) ?
                data.rows.map((r) => ({
                    pos: String(r.pos || "-"),
                    kosten: Number(r.kosten || 0),
                    risk: r.risk || "niedrig"
                })) :
                [];
            setRes(rows);
        }
        catch (e) {
            setError(e?.message || "Fehler bei Analyse");
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { children: "LV-Analyse (KI)" }), _jsxs("div", { className: "rlc-migrated-pages-ki-analyse-tsx-1078", children: ["Projekt: ", projectCode || projectId || "-"] }), _jsx("button", { className: rlcClass(null, btn), onClick: run, disabled: loading, children: loading ? "Analysiert..." : "Analyse starten" }), error &&
                _jsx("div", { className: "rlc-migrated-pages-ki-analyse-tsx-1079", children: error }), _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, head), children: "Pos" }), _jsx("th", { className: rlcClass(null, head), children: "Kosten (\u00E2\u201A\u00AC)" }), _jsx("th", { className: rlcClass(null, head), children: "Risiko" })] }) }), _jsxs("tbody", { children: [res.map((r) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: r.pos }), _jsx("td", { className: rlcClass(null, thtd), children: r.kosten.toLocaleString("de-DE", {
                                            minimumFractionDigits: 2
                                        }) }), _jsx("td", { className: rlcClass(null, {
                                            ...thtd,
                                            fontWeight: 600,
                                            color: r.risk === "hoch" ?
                                                "#b91c1c" :
                                                r.risk === "mittel" ?
                                                    "#d97706" :
                                                    "#065f46"
                                        }), children: r.risk })] }, r.pos)), res.length === 0 && !loading &&
                                _jsx("tr", { children: _jsx("td", { colSpan: 3, className: rlcClass(null, { ...thtd, color: "#6b7280" }), children: "Noch keine Analyse durchgef\u00C3\u00BChrt." }) })] })] })] }));
}
