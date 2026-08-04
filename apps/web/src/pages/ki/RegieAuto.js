import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/RegieAuto.tsx
import { useMemo, useRef, useState } from "react";
import { useProject } from "../../store/useProject";
const shell = {
    display: "grid",
    gap: 16,
    padding: 24
};
const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 16,
    background: "#fff"
};
const input = {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    width: "100%"
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
    borderCollapse: "collapse"
};
const th = {
    borderBottom: "1px solid #ccc",
    textAlign: "left",
    padding: 8,
    background: "#f8fafc"
};
const td = {
    padding: 6,
    borderBottom: "1px solid #eee",
    verticalAlign: "top"
};
/** ===== Component ===== */
export default function RegieAuto() {
    const fileInputRef = useRef(null);
    const projectCtx = useProject();
    const currentProject = projectCtx?.currentProject ?? null;
    const storeProjectId = currentProject?.id ?? "";
    const projectCode = currentProject?.code ?? "";
    const [projectInput, setProjectInput] = useState("");
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [uploads, setUploads] = useState([]);
    const [aufmass, setAufmass] = useState([]);
    const [scheine, setScheine] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [pdfUrl, setPdfUrl] = useState("");
    const [error, setError] = useState(null);
    const [personal, setPersonal] = useState("");
    const [geraete, setGeraete] = useState("");
    const [arbeitszeit, setArbeitszeit] = useState("");
    const [ort, setOrt] = useState("");
    const [wetter, setWetter] = useState("");
    const [bemerkung, setBemerkung] = useState("");
    const effectiveProjectId = useMemo(() => projectInput.trim() || storeProjectId || projectCode || "", [projectInput, storeProjectId, projectCode]);
    const canGenerate = useMemo(() => effectiveProjectId.trim().length > 0 && (aufmass.length > 0 ||
        scheine.length > 0 ||
        !!personal.trim() ||
        !!geraete.trim() ||
        !!arbeitszeit.trim() ||
        !!bemerkung.trim()), [effectiveProjectId, aufmass, scheine, personal, geraete, arbeitszeit, bemerkung]);
    /** ===== Upload & KI ===== */
    async function handleUpload(e) {
        if (!e.target.files || e.target.files.length === 0)
            return;
        if (!effectiveProjectId) {
            window.alert("Projekt-ID fehlt.");
            if (fileInputRef.current)
                fileInputRef.current.value = "";
            return;
        }
        setUploading(true);
        setError(null);
        try {
            const fd = new FormData();
            Array.from(e.target.files).forEach((f) => fd.append("files", f));
            fd.append("projectId", effectiveProjectId);
            if (projectCode)
                fd.append("projectCode", projectCode);
            const res = await fetch("/api/ki/regie/upload", {
                method: "POST",
                body: fd
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = (await res.json());
            const nextFiles = Array.isArray(data?.files) ?
                data.files.map(normalizeUpload) :
                [];
            const nextAufmass = Array.isArray(data?.recognized?.aufmass) ?
                data.recognized.aufmass.map(normalizeAufmass) :
                [];
            const nextScheine = Array.isArray(data?.recognized?.lieferscheine) ?
                data.recognized.lieferscheine.map(normalizeLieferschein) :
                [];
            setUploads((p) => [...p, ...nextFiles]);
            setAufmass((p) => [...p, ...nextAufmass]);
            setScheine((p) => [...p, ...nextScheine]);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : "Upload/Erkennung fehlgeschlagen";
            setError(msg);
            window.alert(`Upload/Erkennung fehlgeschlagen: ${msg}`);
        }
        finally {
            setUploading(false);
            if (fileInputRef.current)
                fileInputRef.current.value = "";
        }
    }
    /** ===== Commit in Mengenermittlung ===== */
    async function commitToMengenermittlung() {
        if (!effectiveProjectId || aufmass.length === 0)
            return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/ki/regie/commit/mengen", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: effectiveProjectId,
                    projectCode: projectCode || "",
                    date,
                    aufmass
                })
            });
            if (!res.ok)
                throw new Error(await res.text());
            window.alert("Aufmaß in Mengenermittlung übernommen.");
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : "Fehler Mengenermittlung";
            setError(msg);
            window.alert(`Fehler Mengenermittlung: ${msg}`);
        }
        finally {
            setBusy(false);
        }
    }
    /** ===== Salva Regiebericht (JSON) ===== */
    async function saveRegieJson() {
        if (!effectiveProjectId) {
            window.alert("Projekt-ID fehlt.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/ki/regie/commit/regiebericht", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: effectiveProjectId,
                    projectCode: projectCode || "",
                    date,
                    meta: { personal, geraete, arbeitszeit, ort, wetter, bemerkung },
                    aufmass,
                    lieferscheine: scheine,
                    fotos: uploads.map((u) => u.url)
                })
            });
            if (!res.ok)
                throw new Error(await res.text());
            window.alert("Regiebericht gespeichert.");
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : "Fehler Speichern";
            setError(msg);
            window.alert(`Fehler Speichern: ${msg}`);
        }
        finally {
            setBusy(false);
        }
    }
    /** ===== PDF ===== */
    async function generatePDF() {
        if (!effectiveProjectId) {
            window.alert("Projekt-ID fehlt.");
            return;
        }
        setGenerating(true);
        setError(null);
        try {
            const res = await fetch("/api/ki/regie/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId: effectiveProjectId,
                    projectCode: projectCode || "",
                    date,
                    photos: uploads.map((u) => u.url),
                    items: { aufmass, lieferscheine: scheine },
                    meta: { personal, geraete, arbeitszeit, ort, wetter, bemerkung },
                    participants: { bauleiter: "", auftraggeber: "" }
                })
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = (await res.json());
            setPdfUrl(String(data?.pdfUrl || ""));
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : "Fehler bei Generierung";
            setError(msg);
            window.alert(`Fehler bei Generierung: ${msg}`);
        }
        finally {
            setGenerating(false);
        }
    }
    /** ===== UI Helpers ===== */
    const fmt = (v) => v === undefined || v === null ? "" : String(v);
    function addAufmass() {
        setAufmass((r) => [
            ...r,
            {
                id: `A_${Date.now()}`,
                position: "",
                kurztext: "",
                einheit: "m",
                menge: 0
            }
        ]);
    }
    function addSchein() {
        setScheine((r) => [
            ...r,
            {
                id: `L_${Date.now()}`,
                lieferant: "",
                datum: date,
                menge: 0,
                einheit: "stk"
            }
        ]);
    }
    function updateAufmass(i, patch) {
        setAufmass((rows) => rows.map((r, idx) => idx === i ? normalizeAufmass({ ...r, ...patch }) : r));
    }
    function updateSchein(i, patch) {
        setScheine((rows) => rows.map((r, idx) => idx === i ? normalizeLieferschein({ ...r, ...patch }) : r));
    }
    return (_jsxs("div", { className: rlcClass(null, shell), children: [_jsx("h1", { children: "Regieberichte automatisch generieren" }), _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("div", { className: "rlc-migrated-pages-ki-regieauto-tsx-1026", children: [_jsxs("label", { children: ["Projekt-ID:\u00A0", _jsx("input", { className: rlcClass(null, input), value: projectInput, onChange: (e) => setProjectInput(e.target.value), placeholder: "P-2025-001" })] }), _jsxs("label", { children: ["Datum:\u00A0", _jsx("input", { className: rlcClass(null, input), type: "date", value: date, onChange: (e) => setDate(e.target.value) })] }), _jsx("input", { ref: fileInputRef, type: "file", accept: ".jpg,.jpeg,.png,.heic,.pdf", multiple: true, onChange: handleUpload, className: "rlc-migrated-pages-ki-regieauto-tsx-1027" })] }), _jsxs("div", { className: "rlc-migrated-pages-ki-regieauto-tsx-1028", children: ["Aktiv: ", effectiveProjectId || "kein Projekt gewählt"] }), error &&
                        _jsx("div", { className: "rlc-migrated-pages-ki-regieauto-tsx-1029", children: error })] }), _jsxs("div", { className: rlcClass(null, { ...card, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }), children: [_jsx("input", { className: rlcClass(null, input), placeholder: "Personal (Namen)", value: personal, onChange: (e) => setPersonal(e.target.value) }), _jsx("input", { className: rlcClass(null, input), placeholder: "Ger\u00E4te/Maschinen", value: geraete, onChange: (e) => setGeraete(e.target.value) }), _jsx("input", { className: rlcClass(null, input), placeholder: "Arbeitszeit (z. B. 07:30\u201316:30, 8h)", value: arbeitszeit, onChange: (e) => setArbeitszeit(e.target.value) }), _jsx("input", { className: rlcClass(null, input), placeholder: "Ort/Bereich", value: ort, onChange: (e) => setOrt(e.target.value) }), _jsx("input", { className: rlcClass(null, input), placeholder: "Wetter", value: wetter, onChange: (e) => setWetter(e.target.value) }), _jsx("input", { className: rlcClass(null, input), placeholder: "Bemerkung", value: bemerkung, onChange: (e) => setBemerkung(e.target.value) })] }), uploads.length > 0 &&
                _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h3", { className: "rlc-migrated-pages-ki-regieauto-tsx-1030", children: "Fotos / Belege" }), _jsx("div", { className: "rlc-migrated-pages-ki-regieauto-tsx-1031", children: uploads.map((f) => _jsxs("div", { className: "rlc-migrated-pages-ki-regieauto-tsx-1032", children: [_jsx("div", { className: "rlc-migrated-pages-ki-regieauto-tsx-1033", children: f.fileId }), /\.(pdf)$/i.test(f.url) ?
                                        _jsx("a", { href: f.url, target: "_blank", rel: "noopener noreferrer", children: "\u00D6ffnen" }) :
                                        _jsx("img", { src: f.url, alt: "", className: "rlc-migrated-pages-ki-regieauto-tsx-1034" })] }, f.fileId)) })] }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h3", { className: "rlc-migrated-pages-ki-regieauto-tsx-1035", children: "Erkannte / manuelle Aufma\u00DF-Positionen" }), _jsx("button", { onClick: addAufmass, className: rlcClass(null, { ...btn, marginTop: 8, marginBottom: 8 }), children: "Zeile hinzuf\u00FCgen" }), _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsx("tr", { children: ["Pos.", "Kurztext", "Einh.", "Menge", "Kommentar"].map((h) => _jsx("th", { className: rlcClass(null, th), children: h }, h)) }) }), _jsxs("tbody", { children: [aufmass.length === 0 &&
                                        _jsx("tr", { children: _jsx("td", { colSpan: 5, className: "rlc-migrated-pages-ki-regieauto-tsx-1036", children: "Keine Positionen." }) }), aufmass.map((r, i) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: fmt(r.position), onChange: (e) => updateAufmass(i, { position: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: fmt(r.kurztext), onChange: (e) => updateAufmass(i, { kurztext: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, { ...td, width: 90 }), children: _jsx("input", { className: rlcClass(null, input), value: fmt(r.einheit), onChange: (e) => updateAufmass(i, { einheit: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, { ...td, width: 120 }), children: _jsx("input", { className: rlcClass(null, input), type: "number", step: "0.001", value: r.menge ?? 0, onChange: (e) => updateAufmass(i, { menge: safeNumber(e.target.value, 0) }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: fmt(r.kommentar), onChange: (e) => updateAufmass(i, { kommentar: e.target.value }) }) })] }, r.id))] })] })] }), _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h3", { className: "rlc-migrated-pages-ki-regieauto-tsx-1037", children: "Lieferscheine" }), _jsx("button", { onClick: addSchein, className: rlcClass(null, { ...btn, marginTop: 8, marginBottom: 8 }), children: "Zeile hinzuf\u00FCgen" }), _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsx("tr", { children: ["Lieferant", "Datum", "Material", "Menge", "Einh.", "Preis", "Kostenstelle", "Beleg"].map((h) => _jsx("th", { className: rlcClass(null, th), children: h }, h)) }) }), _jsxs("tbody", { children: [scheine.length === 0 &&
                                        _jsx("tr", { children: _jsx("td", { colSpan: 8, className: "rlc-migrated-pages-ki-regieauto-tsx-1038", children: "Keine Lieferscheine." }) }), scheine.map((s, i) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: fmt(s.lieferant), onChange: (e) => updateSchein(i, { lieferant: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, { ...td, width: 150 }), children: _jsx("input", { className: rlcClass(null, input), type: "date", value: fmt(s.datum), onChange: (e) => updateSchein(i, { datum: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: fmt(s.material), onChange: (e) => updateSchein(i, { material: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, { ...td, width: 120 }), children: _jsx("input", { className: rlcClass(null, input), type: "number", step: "0.001", value: s.menge ?? 0, onChange: (e) => updateSchein(i, { menge: safeNumber(e.target.value, 0) }) }) }), _jsx("td", { className: rlcClass(null, { ...td, width: 90 }), children: _jsx("input", { className: rlcClass(null, input), value: fmt(s.einheit), onChange: (e) => updateSchein(i, { einheit: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, { ...td, width: 120 }), children: _jsx("input", { className: rlcClass(null, input), type: "number", step: "0.01", value: s.preis ?? 0, onChange: (e) => updateSchein(i, { preis: safeNumber(e.target.value, 0) }) }) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("input", { className: rlcClass(null, input), value: fmt(s.kostenstelle), onChange: (e) => updateSchein(i, { kostenstelle: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, td), children: s.belegUrl ?
                                                    _jsx("a", { href: s.belegUrl, target: "_blank", rel: "noopener noreferrer", children: "\u00D6ffnen" }) :
                                                    "-" })] }, s.id))] })] })] }), _jsxs("div", { className: "rlc-migrated-pages-ki-regieauto-tsx-1039", children: [_jsx("button", { className: rlcClass(null, btn), disabled: uploading, onClick: () => fileInputRef.current?.click(), children: uploading ? "Erkenne..." : "Weitere Fotos/Belege hochladen" }), _jsx("button", { className: rlcClass(null, btn), onClick: commitToMengenermittlung, disabled: !effectiveProjectId || aufmass.length === 0 || busy, children: "In Mengenermittlung \u00FCbernehmen" }), _jsx("button", { className: rlcClass(null, btn), onClick: saveRegieJson, disabled: !effectiveProjectId || busy, children: "Als Regiebericht speichern" }), _jsx("button", { className: rlcClass(null, btn), disabled: !canGenerate || generating, onClick: generatePDF, children: generating ? "Generiere..." : "Regiebericht generieren (PDF)" }), pdfUrl &&
                        _jsx("a", { href: pdfUrl, target: "_blank", rel: "noopener noreferrer", className: "rlc-migrated-pages-ki-regieauto-tsx-1040", children: "PDF \u00F6ffnen" })] }), !effectiveProjectId.trim() &&
                _jsx("div", { className: "rlc-migrated-pages-ki-regieauto-tsx-1041", children: "\u26A0\uFE0F Projekt-ID eintragen." })] }));
}
function safeNumber(v, fallback = 0) {
    const n = typeof v === "number" ?
        v :
        typeof v === "string" ?
            Number(v.replace(",", ".")) :
            Number(v);
    return Number.isFinite(n) ? n : fallback;
}
function normalizeUpload(u) {
    const x = (u ?? {});
    return {
        fileId: String(x.fileId || crypto.randomUUID()),
        url: String(x.url || ""),
        ocrText: x.ocrText ? String(x.ocrText) : undefined
    };
}
function normalizeAufmass(a) {
    const x = (a ?? {});
    return {
        id: String(x.id || `A_${Date.now()}_${Math.random()}`),
        position: x.position ? String(x.position) : "",
        kurztext: x.kurztext ? String(x.kurztext) : "",
        einheit: x.einheit ? String(x.einheit) : "",
        menge: safeNumber(x.menge, 0),
        kommentar: x.kommentar ? String(x.kommentar) : ""
    };
}
function normalizeLieferschein(s) {
    const x = (s ?? {});
    return {
        id: String(x.id || `L_${Date.now()}_${Math.random()}`),
        lieferant: x.lieferant ? String(x.lieferant) : "",
        datum: x.datum ? String(x.datum) : "",
        material: x.material ? String(x.material) : "",
        menge: safeNumber(x.menge, 0),
        einheit: x.einheit ? String(x.einheit) : "",
        preis: safeNumber(x.preis, 0),
        kostenstelle: x.kostenstelle ? String(x.kostenstelle) : "",
        belegUrl: x.belegUrl ? String(x.belegUrl) : ""
    };
}
