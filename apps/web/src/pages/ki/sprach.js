import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/Sprachsteuerung.tsx
import { useMemo, useState } from "react";
import { useProject } from "../../store/useProject";
const shell = {
    maxWidth: 900,
    margin: "0 auto",
    padding: "12px 16px",
    fontFamily: "Inter,system-ui,Arial"
};
const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 16,
    background: "#fff"
};
const input = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: 14
};
const btn = {
    padding: "8px 12px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer"
};
export default function Sprachsteuerung() {
    const { currentProject } = useProject();
    const projectId = currentProject?.id ?? "";
    const projectCode = currentProject?.code ?? "";
    const [text, setText] = useState("");
    const [rows, setRows] = useState([]);
    const [actions, setActions] = useState([]);
    const [summary, setSummary] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const effectiveProject = useMemo(() => projectCode || projectId || "", [projectCode, projectId]);
    async function simulate() {
        if (!text.trim()) {
            setError("Bitte einen gesprochenen Befehl eingeben.");
            return;
        }
        if (!effectiveProject) {
            setError("Kein Projekt ausgewÃ¤hlt.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/ki/sprachsteuerung", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    projectId: projectId || "",
                    projectCode: projectCode || "",
                    text: text.trim()
                })
            });
            if (!res.ok) {
                throw new Error((await res.text()) || "Sprachanalyse fehlgeschlagen");
            }
            const data = await res.json();
            const transcript = data?.transcript || text.trim();
            const nextActions = Array.isArray(data?.actions) ? data.actions : [];
            const nextSummary = data?.summary || "";
            setRows((prev) => [`Erkannt: ${transcript}`, ...prev]);
            setActions(nextActions);
            setSummary(nextSummary);
            setText("");
        }
        catch (e) {
            setError(e?.message || "Fehler bei Sprachsteuerung");
        }
        finally {
            setLoading(false);
        }
    }
    function runAction(a) {
        const payload = a.payload || {};
        if (a.type === "nachtrag") {
            const url = `/kalkulation/nachtraege?projectId=${encodeURIComponent(projectId || effectiveProject)}` +
                `&prefill=${encodeURIComponent(JSON.stringify(payload))}`;
            window.location.href = url;
            return;
        }
        if (a.type === "lv") {
            const url = `/kalkulation/lv?projectId=${encodeURIComponent(projectId || effectiveProject)}` +
                `&prefill=${encodeURIComponent(JSON.stringify(payload))}`;
            window.location.href = url;
            return;
        }
        if (a.type === "regie") {
            const url = `/ki/regie-auto?projectId=${encodeURIComponent(projectId || effectiveProject)}` +
                `&prefill=${encodeURIComponent(JSON.stringify(payload))}`;
            window.location.href = url;
            return;
        }
    }
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { children: "Sprachsteuerung" }), _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("div", { className: "rlc-migrated-pages-ki-sprach-tsx-1092", children: ["Projekt: ", effectiveProject || "â€”"] }), _jsx("input", { value: text, onChange: (e) => setText(e.target.value), placeholder: "gesprochenes Kommando\u00E2\u20AC\u00A6", className: rlcClass(null, input) }), _jsx("div", { className: "rlc-migrated-pages-ki-sprach-tsx-1093", children: _jsx("button", { className: rlcClass(null, btn), onClick: () => void simulate(), disabled: loading, children: loading ? "Analysiere..." : "Befehl auswerten" }) }), error &&
                        _jsx("div", { className: "rlc-migrated-pages-ki-sprach-tsx-1094", children: error })] }), _jsxs("div", { className: rlcClass(null, { ...card, marginTop: 16 }), children: [_jsx("h3", { className: "rlc-migrated-pages-ki-sprach-tsx-1095", children: "Erkannte Eingaben" }), !rows.length && !loading &&
                        _jsx("div", { className: "rlc-migrated-pages-ki-sprach-tsx-1096", children: "Noch keine Eingaben verarbeitet." }), !!rows.length &&
                        _jsx("ul", { className: "rlc-migrated-pages-ki-sprach-tsx-1097", children: rows.map((r, i) => _jsx("li", { className: "rlc-migrated-pages-ki-sprach-tsx-1098", children: r }, `${r}-${i}`)) })] }), (!!actions.length || !!summary) &&
                _jsxs("div", { className: rlcClass(null, { ...card, marginTop: 16 }), children: [_jsx("h3", { className: "rlc-migrated-pages-ki-sprach-tsx-1099", children: "KI-Auswertung" }), summary &&
                            _jsx("div", { className: "rlc-migrated-pages-ki-sprach-tsx-1100", children: summary }), !!actions.length &&
                            _jsx("div", { className: "rlc-migrated-pages-ki-sprach-tsx-1101", children: actions.map((a, i) => _jsxs("div", { className: "rlc-migrated-pages-ki-sprach-tsx-1102", children: [_jsxs("div", { children: [_jsx("div", { className: "rlc-migrated-pages-ki-sprach-tsx-1103", children: a.label }), _jsxs("div", { className: "rlc-migrated-pages-ki-sprach-tsx-1104", children: ["Typ: ", a.type] })] }), a.type !== "unknown" &&
                                            _jsx("button", { className: rlcClass(null, btn), onClick: () => runAction(a), children: "\u00C3\u2013ffnen \u00E2\u2020\u2019" })] }, `${a.type}-${a.label}-${i}`)) })] })] }));
}
