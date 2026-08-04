import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { BuroAPI } from "../../lib/buro/store";
/* ================= STYLES ================= */
const shell = {
    maxWidth: 1000,
    margin: "0 auto",
    padding: "12px 16px",
    fontFamily: "Inter,system-ui,Arial"
};
const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13
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
const input = {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    padding: "4px 6px"
};
const btn = {
    padding: "6px 10px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer"
};
/* ================= HELPERS ================= */
function firstVersion(doc) {
    return Array.isArray(doc.versions) ? doc.versions[0] : undefined;
}
function toDateInput(value) {
    if (value == null || value === "")
        return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
        return "";
    return d.toISOString().slice(0, 10);
}
/* ================= COMPONENT ================= */
export default function Vertrage() {
    const docs = BuroAPI.use((s) => s.docs);
    const contracts = docs.map((d) => {
        const v = firstVersion(d);
        return {
            id: d.id,
            partner: d.title || "",
            datum: toDateInput(v?.uploadedAt),
            wert: typeof v?.size === "number" ? v.size : 0,
            projectId: d.projectId
        };
    });
    const add = () => {
        const created = BuroAPI.addDocument({
            projectId: "",
            tags: ["Vertrag"],
            updatedAt: Date.now()
        });
        if (created?.id) {
            BuroAPI.updateDocument(created.id, {
                ...created,
                title: "Neuer Vertrag",
                projectId: "",
                tags: ["Vertrag"],
                updatedAt: Date.now()
            });
        }
    };
    const upd = (id, patch) => {
        const doc = docs.find((d) => d.id === id);
        if (!doc)
            return;
        const updated = {
            ...doc,
            title: patch.partner ?? doc.title ?? "",
            projectId: patch.projectId ?? doc.projectId,
            updatedAt: Date.now()
        };
        BuroAPI.updateDocument(id, updated);
    };
    const del = (id) => {
        BuroAPI.removeDocument(id);
    };
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h2", { children: "Vertragsverwaltung" }), _jsx("button", { className: rlcClass(null, btn), onClick: add, children: "+ Vertrag" }), _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, head), children: "Partner" }), _jsx("th", { className: rlcClass(null, head), children: "Datum" }), _jsx("th", { className: rlcClass(null, head), children: "Wert (\u20AC)" }), _jsx("th", { className: rlcClass(null, head), children: "Projekt" }), _jsx("th", { className: rlcClass(null, head), children: "Aktion" })] }) }), _jsxs("tbody", { children: [contracts.map((r) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, thtd), children: _jsx("input", { className: rlcClass(null, input), value: r.partner, onChange: (e) => upd(r.id, { partner: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, thtd), children: _jsx("input", { className: rlcClass(null, input), type: "date", value: r.datum, onChange: (e) => upd(r.id, { datum: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, thtd), children: _jsx("input", { className: rlcClass(null, input), type: "number", value: r.wert, onChange: (e) => upd(r.id, { wert: Number(e.target.value) }) }) }), _jsx("td", { className: rlcClass(null, thtd), children: _jsx("input", { className: rlcClass(null, input), value: r.projectId || "", onChange: (e) => upd(r.id, { projectId: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, thtd), children: _jsx("button", { className: rlcClass(null, { ...btn, color: "#b91c1c" }), onClick: () => del(r.id), children: "L\u00F6schen" }) })] }, r.id)), contracts.length === 0 &&
                                _jsx("tr", { children: _jsx("td", { colSpan: 5, className: rlcClass(null, { ...thtd, textAlign: "center", color: "#777" }), children: "Keine Vertr\u00E4ge vorhanden" }) })] })] })] }));
}
