import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/mengenermittlung/ImportFiles.tsx
import React from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min?url";
// ⚙️ API-Basis wie in ManuellFoto.tsx
const API_BASE = import.meta?.env?.VITE_API_URL || "https://api.rlcbausoftware.com/api";
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
// ==== Hilfsfunktionen ====
const isPdf = (f) => !!f && f.name.toLowerCase().endsWith(".pdf");
const isDxf = (f) => !!f && f.name.toLowerCase().endsWith(".dxf");
// ==== PDF Preview (Seite 1 + Zoom) ====
function PdfPreview({ file, zoom }) {
    const canvasRef = React.useRef(null);
    React.useEffect(() => {
        let cancelled = false;
        async function run() {
            try {
                const buf = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: buf });
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: zoom });
                const canvas = canvasRef.current;
                if (!canvas || cancelled)
                    return;
                const ctx = canvas.getContext("2d");
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                await page.render({ canvasContext: ctx, viewport }).promise;
            }
            catch (err) {
                console.error("PDF preview error:", err);
            }
        }
        run();
        return () => {
            cancelled = true;
        };
    }, [file, zoom]);
    return (_jsx("canvas", { ref: canvasRef, style: { width: "100%", height: "auto", border: "1px solid var(--line)" } }));
}
// ==== DXF Preview (Canvas) ====
function DxfPreview({ overlays, visible, zoom, }) {
    const ref = React.useRef(null);
    React.useEffect(() => {
        if (!visible || !overlays || !ref.current)
            return;
        const { bbox, lines = [], lwpolylines = [], circles = [], arcs = [] } = overlays;
        const canvas = ref.current;
        const ctx = canvas.getContext("2d");
        const pad = 10;
        // Arbeitsfläche
        const W = 1000;
        const H = 700;
        canvas.width = W;
        canvas.height = H;
        // world → screen
        const width = Math.max(1e-6, bbox.max.x - bbox.min.x);
        const height = Math.max(1e-6, bbox.max.y - bbox.min.y);
        const sx = (W - 2 * pad) / width;
        const sy = (H - 2 * pad) / height;
        const s = Math.min(sx, sy) * zoom;
        const tx = -bbox.min.x;
        const ty = -bbox.min.y;
        const X = (x) => (x + tx) * s + pad;
        const Y = (y) => H - ((y + ty) * s + pad);
        // render
        ctx.clearRect(0, 0, W, H);
        ctx.lineWidth = 1;
        // Linien
        ctx.beginPath();
        lines.forEach((l) => {
            ctx.moveTo(X(l.a.x), Y(l.a.y));
            ctx.lineTo(X(l.b.x), Y(l.b.y));
        });
        ctx.stroke();
        // LWPOLYLINE
        lwpolylines.forEach((p) => {
            ctx.beginPath();
            p.pts.forEach((pt, i) => {
                const xx = X(pt.x), yy = Y(pt.y);
                i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
            });
            if (p.closed)
                ctx.closePath();
            ctx.stroke();
        });
        // Kreise
        circles.forEach((c) => {
            ctx.beginPath();
            ctx.arc(X(c.c.x), Y(c.c.y), c.r * s, 0, Math.PI * 2);
            ctx.stroke();
        });
        // Bögen (einfach, ohne Bulges)
        arcs.forEach((a) => {
            const sa = (a.start * Math.PI) / 180;
            const ea = (a.end * Math.PI) / 180;
            ctx.beginPath();
            ctx.arc(X(a.c.x), Y(a.c.y), a.r * s, -ea, -sa, true); // invertierte Y-Achse
            ctx.stroke();
        });
    }, [overlays, visible, zoom]);
    return (_jsx("canvas", { ref: ref, style: { width: "100%", height: "auto", border: "1px solid var(--line)" } }));
}
// ==== Hauptkomponente ====
export default function ImportFiles() {
    const [file, setFile] = React.useState(null);
    const [note, setNote] = React.useState("");
    const [scale, setScale] = React.useState(1);
    const [zoom, setZoom] = React.useState(1);
    const [items, setItems] = React.useState([]);
    const [dxfOverlay, setDxfOverlay] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    async function analyze() {
        try {
            setLoading(true);
            setError(null);
            setItems([]);
            setDxfOverlay(null);
            if (!file)
                return;
            const fd = new FormData();
            fd.append("file", file);
            fd.append("note", note);
            fd.append("scale", String(scale));
            const res = await fetch(`${API_BASE}/import/parse`, {
                method: "POST",
                body: fd,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.ok === false) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            setItems((data.items || []));
            if (data.dxfoverlay)
                setDxfOverlay(data.dxfoverlay);
        }
        catch (e) {
            console.error(e);
            setError(e?.message ?? "Analyse fehlgeschlagen");
        }
        finally {
            setLoading(false);
        }
    }
    // ====== Styles für Tabelle ======
    const th = {
        textAlign: "left",
        padding: "8px 10px",
        borderBottom: "1px solid var(--line)",
        fontSize: 13,
        whiteSpace: "nowrap",
    };
    const tdStyle = {
        padding: "6px 10px",
        borderBottom: "1px solid var(--line)",
        fontSize: 13,
        verticalAlign: "middle",
    };
    return (_jsxs("div", { className: "card", style: { padding: 18 }, children: [_jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("input", { type: "file", onChange: (e) => setFile(e.target.files?.[0] ?? null) }), _jsx("input", { type: "number", step: "0.01", value: scale, onChange: (e) => setScale(Number(e.target.value) || 1), style: { width: 80 }, title: "Skalierungsfaktor (f\u00FCr PDF/DXF)" }), _jsx("input", { type: "text", placeholder: "Sprachnotiz / Text", value: note, onChange: (e) => setNote(e.target.value), style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: analyze, disabled: !file || loading, children: "KI analysieren" })] }), (isPdf(file) || isDxf(file)) && (_jsxs("div", { style: {
                    marginTop: 10,
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                }, children: [_jsx("span", { children: "Zoom" }), _jsx("input", { type: "range", min: 0.25, max: 3, step: 0.05, value: zoom, onChange: (e) => setZoom(Number(e.target.value)), style: { width: 180 } }), _jsxs("span", { children: [Math.round(zoom * 100), "%"] })] })), _jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 360px",
                    gap: 16,
                    marginTop: 12,
                }, children: [_jsxs("div", { className: "card", style: { padding: 10, minHeight: 420 }, children: [!file && _jsx("div", { style: { color: "#666" }, children: "Keine Datei ausgew\u00E4hlt." }), file && isPdf(file) && _jsx(PdfPreview, { file: file, zoom: zoom }), file && isDxf(file) && dxfOverlay && (_jsx(DxfPreview, { overlays: dxfOverlay, visible: true, zoom: zoom })), file && isDxf(file) && !dxfOverlay && (_jsx("div", { style: { color: "#666" }, children: "DXF geladen. Bitte \u201EKI analysieren\u201C klicken, um die Layer/Geometrie zu extrahieren." })), error && (_jsxs("div", { style: { marginTop: 8, color: "#c00" }, children: ["Fehler: ", error] }))] }), _jsxs("div", { className: "card", style: { padding: 10, overflow: "auto" }, children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 8 }, children: "Vorschau (Ergebnisse)" }), _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Pos." }), _jsx("th", { style: th, children: "Typ" }), _jsx("th", { style: th, children: "Beschreibung" }), _jsx("th", { style: th, children: "Einheit" }), _jsx("th", { style: th, children: "Menge" }), _jsx("th", { style: th, children: "Layer" }), _jsx("th", { style: th, children: "Quelle" })] }) }), _jsx("tbody", { children: (items || []).length === 0 ? (_jsx("tr", { children: _jsx("td", { style: { ...tdStyle, textAlign: "center" }, colSpan: 7, children: "Noch keine Ergebnisse." }) })) : (items.map((r, i) => (_jsxs("tr", { children: [_jsx("td", { style: tdStyle, children: r.pos }), _jsx("td", { style: tdStyle, children: r.type }), _jsx("td", { style: tdStyle, children: r.descr }), _jsx("td", { style: tdStyle, children: r.unit || "" }), _jsx("td", { style: tdStyle, children: r.qty ?? "" }), _jsx("td", { style: tdStyle, children: r.layer || "" }), _jsx("td", { style: tdStyle, children: r.source || "" })] }, i)))) })] })] })] }), loading && _jsx("div", { style: { marginTop: 8 }, children: "Analyse l\u00E4uft\u2026" })] }));
}
