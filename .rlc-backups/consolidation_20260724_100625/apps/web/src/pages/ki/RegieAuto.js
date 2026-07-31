import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useMemo, useRef, useState } from "react";
/** ===== Component ===== */
export default function RegieAuto() {
    const fileInputRef = useRef(null);
    // Meta
    const [projectId, setProjectId] = useState("");
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
    // Upload / KI
    const [uploads, setUploads] = useState([]);
    const [aufmass, setAufmass] = useState([]);
    const [scheine, setScheine] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [pdfUrl, setPdfUrl] = useState("");
    // Manuell (Regiebericht klassisch)
    const [personal, setPersonal] = useState(""); // z.B. „Müller, Huber“
    const [geraete, setGeraete] = useState(""); // z.B. „Bagger 20t, Rüttler“
    const [arbeitszeit, setArbeitszeit] = useState(""); // „07:30–16:30 (8h)“
    const [ort, setOrt] = useState("");
    const [wetter, setWetter] = useState("");
    const [bemerkung, setBemerkung] = useState("");
    const canGenerate = useMemo(() => projectId.trim().length > 0 &&
        (aufmass.length > 0 || scheine.length > 0 || personal || geraete || arbeitszeit || bemerkung), [projectId, aufmass, scheine, personal, geraete, arbeitszeit, bemerkung]);
    /** ===== Upload & KI ===== */
    async function handleUpload(e) {
        if (!e.target.files || e.target.files.length === 0)
            return;
        setUploading(true);
        try {
            const fd = new FormData();
            Array.from(e.target.files).forEach((f) => fd.append("files", f));
            fd.append("projectId", projectId || "unknown");
            const res = await fetch("/api/ki/regie/upload", { method: "POST", body: fd });
            if (!res.ok)
                throw new Error(await res.text());
            const data = await res.json();
            setUploads((p) => [...p, ...data.files]);
            setAufmass((p) => [...p, ...data.recognized.aufmass]);
            setScheine((p) => [...p, ...data.recognized.lieferscheine]);
        }
        catch (err) {
            alert("Upload/Erkennung fehlgeschlagen: " + err.message);
        }
        finally {
            setUploading(false);
            if (fileInputRef.current)
                fileInputRef.current.value = "";
        }
    }
    /** ===== Commit in Mengenermittlung ===== */
    async function commitToMengenermittlung() {
        try {
            const res = await fetch("/api/ki/regie/commit/mengen", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, date, aufmass }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            alert("Aufmaß in Mengenermittlung übernommen.");
        }
        catch (e) {
            alert("Fehler Mengenermittlung: " + e.message);
        }
    }
    /** ===== Salva Regiebericht (JSON) ===== */
    async function saveRegieJson() {
        try {
            const res = await fetch("/api/ki/regie/commit/regiebericht", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId,
                    date,
                    meta: { personal, geraete, arbeitszeit, ort, wetter, bemerkung },
                    aufmass,
                    lieferscheine: scheine,
                    fotos: uploads.map((u) => u.url),
                }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            alert("Regiebericht gespeichert.");
        }
        catch (e) {
            alert("Fehler Speichern: " + e.message);
        }
    }
    /** ===== PDF ===== */
    async function generatePDF() {
        setGenerating(true);
        try {
            const res = await fetch("/api/ki/regie/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId,
                    date,
                    photos: uploads.map((u) => u.url),
                    items: { aufmass, lieferscheine: scheine },
                    meta: { personal, geraete, arbeitszeit, ort, wetter, bemerkung },
                    participants: { bauleiter: "", auftraggeber: "" },
                }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            const data = await res.json();
            setPdfUrl(data.pdfUrl);
        }
        catch (err) {
            alert("Fehler bei Generierung: " + err.message);
        }
        finally {
            setGenerating(false);
        }
    }
    /** ===== UI Helpers ===== */
    const fmt = (v) => (v === undefined || v === null ? "" : String(v));
    function addAufmass() {
        setAufmass((r) => [...r, { id: `A_${Date.now()}`, position: "", kurztext: "", einheit: "m", menge: 0 }]);
    }
    function addSchein() {
        setScheine((r) => [...r, { id: `L_${Date.now()}`, lieferant: "", datum: date, menge: 0, einheit: "stk" }]);
    }
    function updateAufmass(i, patch) {
        setAufmass((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    }
    function updateSchein(i, patch) {
        setScheine((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    }
    return (_jsxs("div", { style: { padding: 24 }, children: [_jsx("h1", { children: "Regieberichte automatisch generieren" }), _jsxs("div", { style: { display: "flex", gap: 16, marginTop: 12, alignItems: "center" }, children: [_jsxs("label", { children: ["Projekt-ID:\u00A0", _jsx("input", { value: projectId, onChange: (e) => setProjectId(e.target.value), placeholder: "P-2025-001" })] }), _jsxs("label", { children: ["Datum:\u00A0", _jsx("input", { type: "date", value: date, onChange: (e) => setDate(e.target.value) })] }), _jsx("input", { ref: fileInputRef, type: "file", accept: ".jpg,.jpeg,.png,.heic,.pdf", multiple: true, onChange: handleUpload, style: { marginLeft: "auto" } })] }), _jsxs("div", { style: { marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }, children: [_jsx("input", { placeholder: "Personal (Namen)", value: personal, onChange: (e) => setPersonal(e.target.value) }), _jsx("input", { placeholder: "Ger\u00E4te/Maschinen", value: geraete, onChange: (e) => setGeraete(e.target.value) }), _jsx("input", { placeholder: "Arbeitszeit (z.B. 07:30\u201316:30, 8h)", value: arbeitszeit, onChange: (e) => setArbeitszeit(e.target.value) }), _jsx("input", { placeholder: "Ort/Bereich", value: ort, onChange: (e) => setOrt(e.target.value) }), _jsx("input", { placeholder: "Wetter", value: wetter, onChange: (e) => setWetter(e.target.value) }), _jsx("input", { placeholder: "Bemerkung", value: bemerkung, onChange: (e) => setBemerkung(e.target.value) })] }), uploads.length > 0 && (_jsxs("div", { style: { marginTop: 18 }, children: [_jsx("h3", { children: "Fotos / Belege" }), _jsx("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" }, children: uploads.map((f) => (_jsxs("div", { style: { border: "1px solid #ddd", padding: 8, width: 180 }, children: [_jsx("div", { style: { fontSize: 12, color: "#555" }, children: f.fileId }), /\.(pdf)$/i.test(f.url)
                                    ? _jsx("a", { href: f.url, target: "_blank", rel: "noopener noreferrer", children: "\u00D6ffnen" })
                                    : _jsx("img", { src: f.url, alt: "", style: { width: "100%", height: 120, objectFit: "cover" } })] }, f.fileId))) })] })), _jsxs("div", { style: { marginTop: 22 }, children: [_jsx("h3", { children: "Erkannte / manuelle Aufma\u00DF-Positionen" }), _jsx("button", { onClick: addAufmass, style: { marginBottom: 8 }, children: "Zeile hinzuf\u00FCgen" }), _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsx("tr", { children: ["Pos.", "Kurztext", "Einh.", "Menge", "Kommentar"].map((h) => _jsx("th", { style: { borderBottom: "1px solid #ccc", textAlign: "left", padding: 8 }, children: h }, h)) }) }), _jsxs("tbody", { children: [aufmass.length === 0 && _jsx("tr", { children: _jsx("td", { colSpan: 5, style: { padding: 8, color: "#777" }, children: "Keine Positionen." }) }), aufmass.map((r, i) => (_jsxs("tr", { children: [_jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: fmt(r.position), onChange: (e) => updateAufmass(i, { position: e.target.value }) }) }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: fmt(r.kurztext), onChange: (e) => updateAufmass(i, { kurztext: e.target.value }) }) }), _jsx("td", { style: { padding: 6, width: 90 }, children: _jsx("input", { value: fmt(r.einheit), onChange: (e) => updateAufmass(i, { einheit: e.target.value }) }) }), _jsx("td", { style: { padding: 6, width: 120 }, children: _jsx("input", { type: "number", step: "0.001", value: r.menge ?? 0, onChange: (e) => updateAufmass(i, { menge: Number(e.target.value) }) }) }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: fmt(r.kommentar), onChange: (e) => updateAufmass(i, { kommentar: e.target.value }) }) })] }, r.id)))] })] })] }), _jsxs("div", { style: { marginTop: 22 }, children: [_jsx("h3", { children: "Lieferscheine" }), _jsx("button", { onClick: addSchein, style: { marginBottom: 8 }, children: "Zeile hinzuf\u00FCgen" }), _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsx("tr", { children: ["Lieferant", "Datum", "Material", "Menge", "Einh.", "Preis", "Kostenstelle", "Beleg"].map((h) => _jsx("th", { style: { borderBottom: "1px solid #ccc", textAlign: "left", padding: 8 }, children: h }, h)) }) }), _jsxs("tbody", { children: [scheine.length === 0 && _jsx("tr", { children: _jsx("td", { colSpan: 8, style: { padding: 8, color: "#777" }, children: "Keine Lieferscheine." }) }), scheine.map((s, i) => (_jsxs("tr", { children: [_jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: fmt(s.lieferant), onChange: (e) => updateSchein(i, { lieferant: e.target.value }) }) }), _jsx("td", { style: { padding: 6, width: 150 }, children: _jsx("input", { type: "date", value: fmt(s.datum), onChange: (e) => updateSchein(i, { datum: e.target.value }) }) }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: fmt(s.material), onChange: (e) => updateSchein(i, { material: e.target.value }) }) }), _jsx("td", { style: { padding: 6, width: 120 }, children: _jsx("input", { type: "number", step: "0.001", value: s.menge ?? 0, onChange: (e) => updateSchein(i, { menge: Number(e.target.value) }) }) }), _jsx("td", { style: { padding: 6, width: 90 }, children: _jsx("input", { value: fmt(s.einheit), onChange: (e) => updateSchein(i, { einheit: e.target.value }) }) }), _jsx("td", { style: { padding: 6, width: 120 }, children: _jsx("input", { type: "number", step: "0.01", value: s.preis ?? 0, onChange: (e) => updateSchein(i, { preis: Number(e.target.value) }) }) }), _jsx("td", { style: { padding: 6 }, children: _jsx("input", { value: fmt(s.kostenstelle), onChange: (e) => updateSchein(i, { kostenstelle: e.target.value }) }) }), _jsx("td", { style: { padding: 6 }, children: s.belegUrl ? _jsx("a", { href: s.belegUrl, target: "_blank", rel: "noopener noreferrer", children: "\u00D6ffnen" }) : "-" })] }, s.id)))] })] })] }), _jsxs("div", { style: { display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }, children: [_jsx("button", { disabled: uploading, onClick: () => fileInputRef.current?.click(), children: uploading ? "Erkenne..." : "Weitere Fotos/Belege hochladen" }), _jsx("button", { onClick: commitToMengenermittlung, disabled: !projectId || aufmass.length === 0, children: "In Mengenermittlung \u00FCbernehmen" }), _jsx("button", { onClick: saveRegieJson, disabled: !projectId, children: "Als Regiebericht speichern" }), _jsx("button", { disabled: !canGenerate || generating, onClick: generatePDF, children: generating ? "Generiere..." : "Regiebericht generieren (PDF)" }), pdfUrl && _jsx("a", { href: pdfUrl, target: "_blank", rel: "noopener noreferrer", style: { marginLeft: "auto" }, children: "PDF \u00F6ffnen" })] }), !projectId.trim() && _jsx("div", { style: { marginTop: 8, color: "#b00" }, children: "\u26A0\uFE0F Projekt-ID eintragen." })] }));
}
