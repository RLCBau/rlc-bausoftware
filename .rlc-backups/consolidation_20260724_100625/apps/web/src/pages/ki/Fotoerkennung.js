import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
const card = { display: "grid", gap: 10, border: "1px solid var(--line)", borderRadius: 10, padding: 16, background: "#fff" };
const inp = { border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 14 };
const tbl = { width: "100%", borderCollapse: "collapse", marginTop: 8, background: "#fff" };
const th = { textAlign: "left", padding: 6, borderBottom: "1px solid #e5e7eb" };
const thR = { ...th, textAlign: "right" };
const thC = { ...th, textAlign: "center" };
const td = { padding: 6, borderBottom: "1px solid #f0f0f0" };
const tdR = { ...td, textAlign: "right" };
const tdC = { ...td, textAlign: "center" };
export default function Fotoerkennung() {
    const [file, setFile] = React.useState(null);
    const [note, setNote] = React.useState("");
    const [result, setResult] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [previewUrl, setPreviewUrl] = React.useState(null);
    const [error, setError] = React.useState(null);
    // ProjectId da querystring o sessionStorage
    const [projectId, setProjectId] = React.useState(() => {
        const q = new URLSearchParams(window.location.search).get("projectId") || "";
        const s = sessionStorage.getItem("projectId") || "";
        return q || s || "";
    });
    React.useEffect(() => {
        if (!file) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);
    async function handleAnalyze() {
        if (!file) {
            alert("Bitte ein Foto auswählen.");
            return;
        }
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const form = new FormData();
            form.append("file", file);
            form.append("note", note);
            if (projectId)
                form.append("projectId", projectId);
            const res = await fetch("/api/ki/photo-analyze", { method: "POST", body: form });
            if (!res.ok)
                throw new Error(await res.text());
            const data = (await res.json());
            setResult(data);
        }
        catch (e) {
            console.error(e);
            setError("Analyse fehlgeschlagen");
            alert("Fehler bei Analyse.");
        }
        finally {
            setLoading(false);
        }
    }
    React.useEffect(() => {
        if (projectId)
            sessionStorage.setItem("projectId", projectId);
    }, [projectId]);
    // --- AZIONI RIGHE ---
    async function handleAddToLV(p) {
        if (!projectId)
            return alert("Kein Projekt gewählt.");
        try {
            const res = await fetch("/api/lv/add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId,
                    kurztext: p.kurztext,
                    einheit: p.einheit,
                    quelle: "Fotoerkennung",
                }),
            });
            if (!res.ok)
                throw new Error(await res.text());
            alert(`'${p.kurztext}' ins LV eingefügt ✅`);
        }
        catch (e) {
            console.error(e);
            alert("Fehler beim Einfügen ins LV");
        }
    }
    function handleNachtrag(p) {
        const url = `/kalkulation/nachtraege?fromFoto=1` +
            `&projectId=${encodeURIComponent(projectId)}` +
            `&kurztext=${encodeURIComponent(p.kurztext)}` +
            `&einheit=${encodeURIComponent(p.einheit)}`;
        window.location.href = url; // ✅ ora va alla pagina corretta
    }
    return (_jsxs("div", { style: { display: "grid", gap: 16, padding: 16 }, children: [_jsx("h1", { children: "Fotoerkennung (Leistung/Material/Mengen)" }), _jsxs("div", { style: card, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 220px", gap: 12 }, children: [_jsxs("div", { style: { display: "grid", gap: 10 }, children: [_jsx("input", { type: "file", accept: "image/*", onChange: e => setFile(e.target.files?.[0] || null) }), _jsx("textarea", { placeholder: "Notiz oder Beschreibung\u2026", value: note, onChange: e => setNote(e.target.value), style: { ...inp, minHeight: 80 } }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("label", { style: { fontSize: 12, opacity: .8, width: 90 }, children: "Project ID" }), _jsx("input", { style: { ...inp, flex: 1 }, placeholder: "z.B. 12345", value: projectId, onChange: e => setProjectId(e.target.value) })] })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [_jsx("button", { className: "btn", onClick: handleAnalyze, disabled: loading || !file, children: loading ? "Analysiere…" : "Foto analysieren" }), result && _jsx("button", { className: "btn", onClick: () => setResult(null), children: "Ergebnis zur\u00FCcksetzen" })] })] }), error && _jsx("div", { style: { color: "#b91c1c", fontSize: 13 }, children: error })] }), previewUrl && (_jsxs("div", { style: card, children: [_jsx("h3", { style: { margin: 0 }, children: "Vorschau" }), _jsx(ImageWithBoxes, { src: previewUrl, boxes: (result?.boxes || []) })] })), result?.positions && (_jsxs("div", { style: card, children: [_jsx("h3", { style: { margin: 0 }, children: "Erkannte LV-Positionen" }), _jsx("p", { style: { margin: "4px 0 8px" }, children: result.summary || "—" }), _jsxs("table", { style: tbl, children: [_jsx("thead", { children: _jsxs("tr", { style: { background: "#f7f7f7" }, children: [_jsx("th", { style: th, children: "Kurztext" }), _jsx("th", { style: thC, children: "Einheit" }), _jsx("th", { style: thC, children: "Typ" }), _jsx("th", { style: thC, children: "Status" }), _jsx("th", { style: th, children: "Match (falls vorhanden)" }), _jsx("th", { style: thC, children: "Aktion" })] }) }), _jsxs("tbody", { children: [result.positions.map((p) => (_jsxs("tr", { children: [_jsx("td", { style: td, children: p.kurztext }), _jsx("td", { style: tdC, children: p.einheit || "—" }), _jsx("td", { style: { ...tdC, color: p.typ === "implizit" ? "#92400e" : "#065f46" }, children: p.typ }), _jsx("td", { style: { ...tdC, fontWeight: 700, color: p.status === "bestehend" ? "#065f46" : "#9a3412" }, children: p.status }), _jsx("td", { style: td, children: p.match
                                                    ? _jsxs(_Fragment, { children: [_jsx("div", { style: { fontWeight: 600 }, children: p.match.kurztext }), _jsxs("div", { style: { opacity: .7, fontSize: 12 }, children: [p.match.einheit || "—", " \u00B7 Score: ", Math.round((p.match.score || 0) * 100), "%"] })] })
                                                    : _jsx("span", { style: { opacity: .6 }, children: "\u2014" }) }), _jsx("td", { style: { ...tdC, whiteSpace: "nowrap" }, children: p.status === "bestehend" ? (_jsx("button", { className: "btn", style: { fontSize: 12, padding: "4px 8px" }, onClick: () => handleAddToLV(p), children: "In LV einf\u00FCgen" })) : (_jsx("button", { className: "btn", style: { fontSize: 12, padding: "4px 8px" }, onClick: () => handleNachtrag(p), children: "Nachtrag erstellen \u2192" })) })] }, p.id))), result.positions.length === 0 && (_jsx("tr", { children: _jsx("td", { style: { ...td, opacity: .6 }, colSpan: 6, children: "Keine Positionen erkannt." }) }))] })] })] }))] }));
}
/* ================== Image + Overlay (facoltativo) ================== */
function ImageWithBoxes({ src, boxes }) {
    const imgRef = React.useRef(null);
    const canvasRef = React.useRef(null);
    React.useEffect(() => {
        const img = imgRef.current, cv = canvasRef.current;
        if (!img || !cv)
            return;
        function draw() {
            const rect = img.getBoundingClientRect();
            cv.width = Math.round(rect.width);
            cv.height = Math.round(rect.height);
            const ctx = cv.getContext("2d");
            ctx.clearRect(0, 0, cv.width, cv.height);
            ctx.lineWidth = 2;
            ctx.font = "12px system-ui, sans-serif";
            boxes.forEach((b, i) => {
                const [x, y, w, h] = b.box;
                const X = x * cv.width, Y = y * cv.height, W = w * cv.width, H = h * cv.height;
                const color = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"][i % 5];
                ctx.strokeStyle = color;
                ctx.fillStyle = color;
                ctx.strokeRect(X, Y, W, H);
                const label = `${b.label} • ${Math.round(b.score * 100)}% • ${b.qty} ${b.unit}`;
                const pad = 4;
                const textW = ctx.measureText(label).width + pad * 2;
                const textH = 16;
                const labelY = Math.max(0, Y - textH);
                ctx.fillRect(X, labelY, textW, textH);
                ctx.fillStyle = "#fff";
                ctx.fillText(label, X + pad, labelY + 12);
            });
        }
        const obs = new ResizeObserver(draw);
        obs.observe(img);
        img.addEventListener("load", draw);
        window.addEventListener("resize", draw);
        draw();
        return () => {
            obs.disconnect();
            img.removeEventListener("load", draw);
            window.removeEventListener("resize", draw);
        };
    }, [boxes, src]);
    return (_jsxs("div", { style: { position: "relative", width: "100%", maxWidth: 960 }, children: [_jsx("img", { ref: imgRef, src: src, alt: "preview", style: { width: "100%", height: "auto", display: "block", borderRadius: 8 } }), _jsx("canvas", { ref: canvasRef, style: { position: "absolute", inset: 0, pointerEvents: "none" } })] }));
}
