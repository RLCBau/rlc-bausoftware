import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
function arr(v) {
    return Array.isArray(v) ? v.filter(Boolean) : [];
}
function pct(v, percent) {
    if (percent)
        return percent(v);
    const n = Number(v);
    if (!Number.isFinite(n))
        return "�";
    return `${Math.round(n * 100)} %`;
}
function Section({ title, items }) {
    if (!items.length)
        return null;
    return (_jsxs("div", { className: rlcClass(null, section), children: [_jsx("div", { className: rlcClass(null, sectionTitle), children: title }), _jsx("div", { className: rlcClass(null, list), children: items.map((x, i) => _jsxs("div", { className: rlcClass(null, item), children: ["\u2713 ", String(x)] }, i)) })] }));
}
export default function RlcKiDashboard({ row, percent, onSuggestResources }) {
    const ex = row?.explainability || {};
    const tb = row?.technicalBreakdown || {};
    const machines = arr(ex.machines).length ? arr(ex.machines) : arr(tb.machines);
    const labor = arr(ex.labor).length ? arr(ex.labor) : arr(tb.labor);
    const materials = arr(ex.materials).length ? arr(ex.materials) : arr(tb.materials);
    const logistics = arr(ex.logistics).length ? arr(ex.logistics) : arr(tb.logistics);
    const risks = arr(ex.risks).length ? arr(ex.risks) : arr(tb.risks);
    const hasResources = machines.length || labor.length || materials.length || logistics.length || arr(ex.calculationSteps).length;
    if (!hasResources) {
        return (_jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, workflow), children: [_jsx("span", { children: "1 Positionsdaten" }), _jsx("span", { children: "2 Ausf\u00FChrungsparameter" }), _jsx("b", { children: "3 KI-Analyse" }), _jsx("span", { children: "4 Ressourcen" }), _jsx("span", { children: "5 Preisaufbau" }), _jsx("span", { children: "6 Position \u00FCbernehmen" })] }), _jsxs("div", { className: rlcClass(null, emptyHero), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC KI Analyse" }), _jsx("h2", { className: rlcClass(null, title), children: "Urkalkulation noch nicht erstellt" }), _jsx("p", { className: rlcClass(null, emptyText), children: "Starte die KI, damit RLC aus Positionsdaten, Langtext und Ausf\uFFFDhrungsparametern automatisch Personal, Maschinen, Material, Logistik, Zuschl\uFFFDge und Preisaufbau erzeugt." })] }), onSuggestResources ?
                            _jsx("button", { type: "button", className: rlcClass(null, primaryAction), onClick: onSuggestResources, children: "Urkalkulation starten" }) :
                            null] }), _jsxs("div", { className: rlcClass(null, grid), children: [_jsx(Section, { title: "Die KI analysiert", items: [
                                "Kurztext und Langtext",
                                "Einheit und Menge",
                                "Bodenklasse, Tiefe und Ausf�hrungsparameter",
                                "Firmenwissen und importierte Bibliothek",
                                "technische Plausibilit�t und Risiken"
                            ] }), _jsx(Section, { title: "Die KI erzeugt", items: [
                                "Personalans�tze",
                                "Maschinen und Ger�te",
                                "Material und Stoffe",
                                "Transport / Entsorgung",
                                "Gemeinkosten, Risiko und Gewinn",
                                "pr�fbaren Preisaufbau"
                            ] })] })] }));
    }
    return (_jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, workflow), children: [_jsx("span", { children: "1 Positionsdaten" }), _jsx("span", { children: "2 Ausf\u00FChrungsparameter" }), _jsx("b", { children: "3 KI-Analyse" }), _jsx("span", { children: "4 Ressourcen" }), _jsx("span", { children: "5 Preisaufbau" }), _jsx("span", { children: "6 Position \u00FCbernehmen" })] }), _jsxs("div", { className: rlcClass(null, head), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC KI Analyse" }), _jsx("h2", { className: rlcClass(null, title), children: "RLC KI-Analyse" })] }), _jsx("div", { className: rlcClass(null, confidence), children: pct(ex.confidence ?? row?.confidence, percent) })] }), _jsxs("div", { className: rlcClass(null, meta), children: [_jsxs("div", { children: [_jsx("b", { children: "Quelle:" }), " ", ex.source || row?.source || "�"] }), _jsxs("div", { children: [_jsx("b", { children: "Status:" }), " ", row?.calculationStatus || "�"] }), _jsxs("div", { children: [_jsx("b", { children: "Risiko:" }), " ", row?.riskLevel || "�"] }), _jsxs("div", { children: [_jsx("b", { children: "Version:" }), " ", ex.version || "�"] })] }), _jsxs("div", { className: rlcClass(null, grid), children: [_jsx(Section, { title: "Maschinen", items: machines }), _jsx(Section, { title: "Personal", items: labor }), _jsx(Section, { title: "Material", items: materials }), _jsx(Section, { title: "Logistik", items: logistics }), _jsx(Section, { title: "Risiken", items: risks }), _jsx(Section, { title: "Normen / Wissen", items: arr(ex.standards) }), _jsx(Section, { title: "Annahmen", items: arr(ex.assumptions) }), _jsx(Section, { title: "Berechnungsschritte", items: arr(ex.calculationSteps) })] })] }));
}
const card = {
    display: "grid",
    gap: 16,
    padding: 18,
    borderRadius: 22,
    border: "1px solid #BED6FF",
    background: "linear-gradient(180deg,#EAF2FF,#FFFFFF)",
    boxShadow: "0 12px 30px rgba(15,23,42,0.06)"
};
const workflow = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    fontSize: 12,
    color: "#64748B"
};
const emptyHero = {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    alignItems: "center"
};
const emptyText = {
    margin: "6px 0 0",
    fontSize: 14,
    lineHeight: 1.45,
    color: "#334155",
    maxWidth: 760
};
const head = {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center"
};
const eyebrow = {
    fontSize: 12,
    fontWeight: 700,
    color: "#146EF5",
    textTransform: "uppercase",
    letterSpacing: 0.6
};
const title = {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: "#0F172A"
};
const confidence = {
    padding: "10px 14px",
    borderRadius: 999,
    background: "#146EF5",
    color: "white",
    fontWeight: 700,
    fontSize: 16
};
const primaryAction = {
    padding: "13px 18px",
    borderRadius: 14,
    border: "1px solid #146EF5",
    background: "#146EF5",
    color: "#FFFFFF",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap"
};
const meta = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 8,
    fontSize: 13,
    color: "#334155"
};
const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10
};
const section = {
    display: "grid",
    gap: 6,
    padding: 12,
    borderRadius: 16,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0"
};
const sectionTitle = {
    fontSize: 13,
    fontWeight: 700,
    color: "#0F172A"
};
const list = {
    display: "grid",
    gap: 4
};
const item = {
    fontSize: 13,
    color: "#334155",
    lineHeight: 1.35
};
