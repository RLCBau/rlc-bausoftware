import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { KalkulationsDatenbank } from "./kalkulationsDatenbank";
function n(v) {
    if (v === null || v === undefined || v === "")
        return 0;
    const s = String(v).replace(/\./g, "").replace(",", ".");
    const x = typeof v === "number" ? v : Number(s);
    return Number.isFinite(x) ? x : 0;
}
function round2(v) {
    return Math.round((v + Number.EPSILON) * 100) / 100;
}
function money(v) {
    return `${n(v).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} €`;
}
export default function KalkulationsDatenbankPositionPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [entry, setEntry] = useState(() => {
        if (!id)
            return null;
        return KalkulationsDatenbank.get(id) || null;
    });
    useEffect(() => {
        if (!id)
            return;
        setEntry(KalkulationsDatenbank.get(id) || null);
    }, [id]);
    const ep = useMemo(() => n(entry?.kosten?.epNetto), [entry]);
    const gp = useMemo(() => n(entry?.kosten?.gpNetto), [entry]);
    function update(patch) {
        if (!entry)
            return;
        const next = {
            ...entry,
            ...patch,
            updatedAt: new Date().toISOString()
        };
        const saved = KalkulationsDatenbank.upsert(next);
        setEntry(saved);
    }
    function updateKosten(patch) {
        if (!entry)
            return;
        const kosten = {
            ...(entry.kosten || {}),
            ...patch
        };
        if (Object.prototype.hasOwnProperty.call(patch, "epNetto")) {
            kosten.gpNetto = round2(n(entry.menge) * n(kosten.epNetto));
        }
        update({ kosten });
    }
    function updateParameter(patch) {
        update({
            parameter: {
                ...(entry?.parameter || {}),
                ...patch
            }
        });
    }
    function addResource() {
        const r = {
            id: crypto.randomUUID(),
            typ: "material",
            bezeichnung: "",
            kurztext: "",
            beschreibung: "",
            einheit: entry?.einheit || "St",
            menge: 0,
            einzelpreis: 0,
            gesamtpreis: 0,
            bemerkung: ""
        };
        update({
            ressourcen: [...(entry?.ressourcen || []), r]
        });
    }
    function updateResource(resourceId, patch) {
        const next = (entry?.ressourcen || []).map((r) => {
            if (r.id !== resourceId)
                return r;
            const updated = { ...r, ...patch };
            updated.gesamtpreis = round2(n(updated.menge) * n(updated.einzelpreis));
            return updated;
        });
        update({ ressourcen: next });
    }
    function removeResource(resourceId) {
        update({
            ressourcen: (entry?.ressourcen || []).filter((r) => r.id !== resourceId)
        });
    }
    if (!entry) {
        return (_jsxs("div", { className: rlcClass(null, page), children: [_jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => navigate("/kalkulation/datenbank"), children: "Zur\u00FCck zur Datenbank" }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("h1", { className: rlcClass(null, title), children: "Position nicht gefunden" }), _jsx("p", { className: rlcClass(null, muted), children: "Der Datenbankeintrag konnte nicht geladen werden." })] })] }));
    }
    return (_jsxs("div", { className: rlcClass(null, page), children: [_jsxs("div", { className: rlcClass(null, topBar), children: [_jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => navigate("/kalkulation/datenbank"), children: "\u2190 Zur\u00FCck zur Datenbank" }), _jsx("div", { className: rlcClass(null, topActions), children: _jsx("button", { className: rlcClass(null, btnPrimary), onClick: () => {
                                const saved = KalkulationsDatenbank.upsert(entry);
                                setEntry(saved);
                                alert("Position gespeichert.");
                            }, children: "Speichern" }) })] }), _jsxs("section", { className: rlcClass("rlc-page-hero", hero), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "Kalkulationsdatenbank" }), _jsx("h1", { className: rlcClass(null, title), children: "Position bearbeiten" }), _jsxs("p", { className: rlcClass(null, subtitle), children: [entry.posNr || "—", " \u00B7 ", entry.kurztext || "Ohne Kurztext"] })] }), _jsxs("div", { className: rlcClass(null, priceBox), children: [_jsx("div", { className: rlcClass(null, priceLabel), children: "EP netto" }), _jsx("div", { className: rlcClass(null, priceValue), children: money(ep) }), _jsxs("div", { className: rlcClass(null, priceLabel), children: ["GP netto: ", money(gp)] })] })] }), _jsxs("section", { className: rlcClass(null, grid), children: [_jsxs("div", { className: rlcClass(null, card), children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Grunddaten" }), _jsxs("div", { className: rlcClass(null, formGrid), children: [_jsx(Field, { label: "PosNr", children: _jsx("input", { className: rlcClass(null, input), value: entry.posNr || "", onChange: (e) => update({ posNr: e.target.value }) }) }), _jsx(Field, { label: "Einheit", children: _jsx("input", { className: rlcClass(null, input), value: entry.einheit || "", onChange: (e) => update({ einheit: e.target.value }) }) }), _jsx(Field, { label: "Menge", children: _jsx("input", { type: "number", className: rlcClass(null, input), value: entry.menge || 0, onChange: (e) => {
                                                const menge = n(e.target.value);
                                                update({
                                                    menge,
                                                    kosten: {
                                                        ...(entry.kosten || {}),
                                                        gpNetto: round2(menge * n(entry.kosten?.epNetto))
                                                    }
                                                });
                                            } }) }), _jsx(Field, { label: "Quelle", children: _jsx("input", { className: rlcClass(null, input), value: entry.quelle || "", onChange: (e) => update({ quelle: e.target.value }) }) })] }), _jsx(Field, { label: "Kurztext", children: _jsx("input", { className: rlcClass(null, input), value: entry.kurztext || "", onChange: (e) => update({ kurztext: e.target.value }) }) }), _jsx(Field, { label: "Langtext", children: _jsx("textarea", { className: rlcClass(null, { ...input, minHeight: 160 }), value: entry.langtext || "", onChange: (e) => update({ langtext: e.target.value }) }) })] }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Technische Parameter" }), _jsxs("div", { className: rlcClass(null, formGrid), children: [_jsx(Field, { label: "Gewerk", children: _jsx("input", { className: rlcClass(null, input), value: entry.parameter?.gewerk || "", onChange: (e) => updateParameter({ gewerk: e.target.value }) }) }), _jsx(Field, { label: "Leistungsart", children: _jsx("input", { className: rlcClass(null, input), value: entry.parameter?.leistungsart || "", onChange: (e) => updateParameter({ leistungsart: e.target.value }) }) }), _jsx(Field, { label: "Bauverfahren", children: _jsx("input", { className: rlcClass(null, input), value: entry.parameter?.bauverfahren || "", onChange: (e) => updateParameter({ bauverfahren: e.target.value }) }) }), _jsx(Field, { label: "Bodenklasse", children: _jsx("input", { className: rlcClass(null, input), value: entry.parameter?.bodenklasse || "", onChange: (e) => updateParameter({ bodenklasse: e.target.value }) }) }), _jsx(Field, { label: "Grabentiefe m", children: _jsx("input", { type: "number", className: rlcClass(null, input), value: entry.parameter?.grabentiefeM ?? "", onChange: (e) => updateParameter({ grabentiefeM: n(e.target.value) }) }) }), _jsx(Field, { label: "Grabenbreite m", children: _jsx("input", { type: "number", className: rlcClass(null, input), value: entry.parameter?.grabenbreiteM ?? "", onChange: (e) => updateParameter({ grabenbreiteM: n(e.target.value) }) }) }), _jsx(Field, { label: "DN / Durchmesser mm", children: _jsx("input", { type: "number", className: rlcClass(null, input), value: entry.parameter?.rohrDurchmesserMm ?? "", onChange: (e) => updateParameter({ rohrDurchmesserMm: n(e.target.value) }) }) }), _jsx(Field, { label: "Entfernung km", children: _jsx("input", { type: "number", className: rlcClass(null, input), value: entry.parameter?.baustellenEntfernungKm ?? "", onChange: (e) => updateParameter({ baustellenEntfernungKm: n(e.target.value) }) }) }), _jsx(Field, { label: "Fahrzeit min", children: _jsx("input", { type: "number", className: rlcClass(null, input), value: entry.parameter?.fahrzeitMin ?? "", onChange: (e) => updateParameter({ fahrzeitMin: n(e.target.value) }) }) }), _jsx(Field, { label: "Bauzeit Tage", children: _jsx("input", { type: "number", className: rlcClass(null, input), value: entry.parameter?.bauzeitTage ?? "", onChange: (e) => updateParameter({ bauzeitTage: n(e.target.value) }) }) })] })] })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, sectionHeader), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Kostenaufbau / Ressourcen" }), _jsx("p", { className: rlcClass(null, muted), children: "Personal, Maschinen, Material, Transport und Fremdleistungen." })] }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: addResource, children: "+ Kostenposition" })] }), (entry.ressourcen || []).length ?
                        _jsx("div", { className: rlcClass(null, resourceList), children: (entry.ressourcen || []).map((r) => _jsxs("div", { className: rlcClass(null, resourceBox), children: [_jsxs("select", { className: rlcClass(null, input), value: r.typ || "material", onChange: (e) => updateResource(r.id, { typ: e.target.value }), children: [_jsx("option", { value: "personal", children: "personal" }), _jsx("option", { value: "maschine", children: "maschine" }), _jsx("option", { value: "material", children: "material" }), _jsx("option", { value: "transport", children: "transport" }), _jsx("option", { value: "fremdleistung", children: "fremdleistung" }), _jsx("option", { value: "entsorgung", children: "entsorgung" }), _jsx("option", { value: "sonstiges", children: "sonstiges" })] }), _jsx("input", { className: rlcClass(null, input), value: r.bezeichnung || "", placeholder: "Bezeichnung", onChange: (e) => updateResource(r.id, { bezeichnung: e.target.value }) }), _jsx("input", { className: rlcClass(null, input), value: r.einheit || "", placeholder: "EH", onChange: (e) => updateResource(r.id, { einheit: e.target.value }) }), _jsx("input", { type: "number", className: rlcClass(null, input), value: r.menge || 0, placeholder: "Menge", onChange: (e) => updateResource(r.id, { menge: n(e.target.value) }) }), _jsx("input", { type: "number", className: rlcClass(null, input), value: r.einzelpreis || 0, placeholder: "EP", onChange: (e) => updateResource(r.id, { einzelpreis: n(e.target.value) }) }), _jsx("div", { className: rlcClass(null, totalBox), children: money(r.gesamtpreis) }), _jsx("button", { className: rlcClass(null, btnDanger), onClick: () => removeResource(r.id), children: "Entfernen" })] }, r.id)) }) :
                        _jsx("div", { className: rlcClass(null, empty), children: "Noch kein Kostenaufbau vorhanden." })] }), _jsxs("section", { className: rlcClass(null, grid), children: [_jsxs("div", { className: rlcClass(null, card), children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Kosten & Bewertung" }), _jsx("div", { className: rlcClass(null, formGrid), children: [
                                    ["material", "Material"],
                                    ["lohn", "Lohn"],
                                    ["maschinen", "Maschinen"],
                                    ["fremdleistung", "Fremdleistung"],
                                    ["entsorgung", "Entsorgung"],
                                    ["transport", "Transport"],
                                    ["gemeinkosten", "Gemeinkosten"],
                                    ["risiko", "Risiko"],
                                    ["gewinn", "Gewinn"],
                                    ["epNetto", "EP netto"],
                                    ["gpNetto", "GP netto"]
                                ].
                                    map(([key, label]) => _jsx(Field, { label: label, children: _jsx("input", { type: "number", className: rlcClass(null, input), value: entry.kosten?.[key] ?? 0, onChange: (e) => updateKosten({ [key]: n(e.target.value) }) }) }, key)) })] }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "KI / Notizen" }), _jsx(Field, { label: "Confidence 0-1", children: _jsx("input", { type: "number", step: "0.01", min: "0", max: "1", className: rlcClass(null, input), value: entry.confidence ?? 0, onChange: (e) => update({ confidence: n(e.target.value) }) }) }), _jsx(Field, { label: "Risiko-Stufe", children: _jsxs("select", { className: rlcClass(null, input), value: entry.risiko || "normal", onChange: (e) => update({ risiko: e.target.value }), children: [_jsx("option", { value: "niedrig", children: "niedrig" }), _jsx("option", { value: "normal", children: "normal" }), _jsx("option", { value: "hoch", children: "hoch" }), _jsx("option", { value: "kritisch", children: "kritisch" })] }) }), _jsx(Field, { label: "KI-Pr\u00FCfhinweis", children: _jsx("textarea", { className: rlcClass(null, { ...input, minHeight: 100 }), value: entry.kiHinweis || "", onChange: (e) => update({ kiHinweis: e.target.value }) }) }), _jsx(Field, { label: "Kalkulator-Notiz", children: _jsx("textarea", { className: rlcClass(null, { ...input, minHeight: 100 }), value: entry.kalkulatorNotiz || "", onChange: (e) => update({ kalkulatorNotiz: e.target.value }) }) })] })] })] }));
}
function Field({ label, children }) {
    return (_jsxs("label", { className: rlcClass(null, field), children: [_jsx("span", { className: rlcClass(null, labelStyle), children: label }), children] }));
}
const page = {
    padding: 24,
    display: "grid",
    gap: 18
};
const topBar = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center"
};
const topActions = {
    display: "flex",
    gap: 10
};
const hero = {
    color: "#FFFFFF", border: "1px solid #E2E8F0",
    borderRadius: 22,
    padding: 22,
    background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
    display: "flex",
    justifyContent: "space-between",
    gap: 18
};
const eyebrow = {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#146EF5",
    letterSpacing: 0.5
};
const title = {
    margin: "6px 0",
    fontSize: 30,
    fontWeight: 700,
    color: "#0F172A"
};
const subtitle = {
    margin: 0,
    color: "#475569",
    fontWeight: 600
};
const priceBox = {
    minWidth: 210,
    border: "1px solid #DBEAFE",
    borderRadius: 18,
    padding: 16,
    background: "#EAF2FF"
};
const priceLabel = {
    color: "#475569",
    fontSize: 12,
    fontWeight: 700
};
const priceValue = {
    color: "#0F172A",
    fontSize: 26,
    fontWeight: 700,
    margin: "4px 0 8px"
};
const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    gap: 18
};
const card = {
    border: "1px solid #E2E8F0",
    borderRadius: 20,
    padding: 20,
    background: "#FFFFFF",
    boxShadow: "0 10px 25px rgba(15,23,42,0.04)"
};
const sectionHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12
};
const sectionTitle = {
    margin: "0 0 12px",
    fontSize: 18,
    fontWeight: 700,
    color: "#0F172A"
};
const muted = {
    margin: 0,
    color: "#64748B",
    fontWeight: 600
};
const formGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    gap: 12,
    marginBottom: 12
};
const field = {
    display: "grid",
    gap: 6,
    marginBottom: 12
};
const labelStyle = {
    fontSize: 12,
    color: "#475569",
    fontWeight: 700
};
const input = {
    width: "100%",
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    background: "#FFFFFF"
};
const btnPrimary = {
    border: "1px solid #0B5BD3",
    background: "#146EF5",
    color: "#FFFFFF",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer"
};
const btnSecondary = {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer"
};
const btnDanger = {
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 700,
    cursor: "pointer"
};
const resourceList = {
    display: "grid",
    gap: 10
};
const resourceBox = {
    display: "grid",
    gridTemplateColumns: "130px 1fr 90px 100px 110px 120px 110px",
    gap: 8,
    alignItems: "center",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: 10,
    background: "#F8FAFC"
};
const totalBox = {
    border: "1px solid #DBEAFE",
    background: "#EAF2FF",
    color: "#0F172A",
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 700,
    textAlign: "right"
};
const empty = {
    border: "1px dashed #CBD5E1",
    borderRadius: 14,
    padding: 16,
    color: "#64748B",
    fontWeight: 600
};
