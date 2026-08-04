import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/Nachtraege.tsx
import { useMemo, useState } from "react";
import { useProject } from "../../store/useProject";
const shell = {
    maxWidth: 1000,
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
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    padding: "8px 10px",
    margin: "6px 0",
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
const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    marginTop: 12
};
const thtd = {
    border: "1px solid #e2e8f0",
    padding: "6px 8px",
    verticalAlign: "top"
};
const head = {
    ...thtd,
    background: "#f8fafc",
    fontWeight: 600
};
export default function Nachtraege() {
    const { currentProject } = useProject();
    const projectId = currentProject?.id ?? "";
    const projectCode = currentProject?.code ?? "";
    const [lv, setLv] = useState("");
    const [off, setOff] = useState("");
    const [diffs, setDiffs] = useState([]);
    const [summary, setSummary] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const effectiveProject = useMemo(() => projectCode || projectId || "", [projectCode, projectId]);
    async function check() {
        if (!lv.trim() || !off.trim()) {
            setError("Bitte LV-Text und Angebot-Text eingeben.");
            return;
        }
        setLoading(true);
        setError(null);
        setDiffs([]);
        setSummary("");
        try {
            const res = await fetch("/api/ki/nachtraege-check", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    projectId: projectId || "",
                    projectCode: projectCode || "",
                    lvText: lv.trim(),
                    angebotText: off.trim()
                })
            });
            if (!res.ok) {
                throw new Error((await res.text()) || "Vergleich fehlgeschlagen");
            }
            const data = await res.json();
            const rows = Array.isArray(data?.diffs) ?
                data.diffs :
                Array.isArray(data?.items) ?
                    data.items :
                    [];
            setDiffs(rows);
            setSummary(data?.summary || "");
        }
        catch (e) {
            setError(e?.message || "Fehler beim Vergleich");
        }
        finally {
            setLoading(false);
        }
    }
    function gotoNachtrag(d) {
        const payload = {
            projectId: projectId || effectiveProject,
            projectCode: projectCode || "",
            posNr: d.posNr,
            kurztext: d.angebotText || d.lvText || "",
            grund: `KI Nachtragserkennung: ${d.details}`
        };
        const url = `/kalkulation/nachtraege?projectId=${encodeURIComponent(projectId || effectiveProject)}` +
            `&prefill=${encodeURIComponent(JSON.stringify(payload))}`;
        window.location.href = url;
    }
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { children: "Nachtragserkennung" }), _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("div", { className: "rlc-migrated-pages-ki-nachtraege-tsx-1087", children: ["Projekt: ", effectiveProject || "â€”"] }), _jsx("textarea", { className: rlcClass(null, { ...input, height: 120 }), value: lv, onChange: (e) => setLv(e.target.value), placeholder: "LV-Text" }), _jsx("textarea", { className: rlcClass(null, { ...input, height: 120 }), value: off, onChange: (e) => setOff(e.target.value), placeholder: "Angebot-Text" }), _jsx("div", { className: "rlc-migrated-pages-ki-nachtraege-tsx-1088", children: _jsx("button", { className: rlcClass(null, btn), onClick: () => void check(), disabled: loading, children: loading ? "Vergleiche..." : "Vergleichen" }) }), error &&
                        _jsx("div", { className: "rlc-migrated-pages-ki-nachtraege-tsx-1089", children: error })] }), _jsxs("div", { className: rlcClass(null, { ...card, marginTop: 16 }), children: [_jsx("h3", { className: "rlc-migrated-pages-ki-nachtraege-tsx-1090", children: "Ergebnis" }), summary &&
                        _jsx("div", { className: "rlc-migrated-pages-ki-nachtraege-tsx-1091", children: summary }), _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, head), children: "Pos" }), _jsx("th", { className: rlcClass(null, head), children: "Typ" }), _jsx("th", { className: rlcClass(null, head), children: "LV" }), _jsx("th", { className: rlcClass(null, head), children: "Angebot" }), _jsx("th", { className: rlcClass(null, head), children: "Details" }), _jsx("th", { className: rlcClass(null, head), children: "Aktion" })] }) }), _jsxs("tbody", { children: [diffs.map((d, i) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: d.posNr }), _jsx("td", { className: rlcClass(null, thtd), children: labelForType(d.type) }), _jsx("td", { className: rlcClass(null, thtd), children: d.lvText || "â€”" }), _jsx("td", { className: rlcClass(null, thtd), children: d.angebotText || "â€”" }), _jsx("td", { className: rlcClass(null, thtd), children: d.details }), _jsx("td", { className: rlcClass(null, thtd), children: _jsx("button", { className: rlcClass(null, btn), onClick: () => gotoNachtrag(d), children: "Nachtrag erstellen \u00E2\u2020\u2019" }) })] }, `${d.posNr}-${d.type}-${i}`)), !diffs.length && !loading &&
                                        _jsx("tr", { children: _jsx("td", { colSpan: 6, className: rlcClass(null, { ...thtd, color: "#6b7280" }), children: "Noch keine Abweichungen erkannt." }) })] })] })] })] }));
}
function labelForType(t) {
    switch (t) {
        case "qty_diff":
            return "Mengenabweichung";
        case "price_diff":
            return "Preisabweichung";
        case "text_diff":
            return "Textabweichung";
        case "missing_in_offer":
            return "Fehlt im Angebot";
        case "missing_in_lv":
            return "Fehlt im LV";
        default:
            return t;
    }
}
