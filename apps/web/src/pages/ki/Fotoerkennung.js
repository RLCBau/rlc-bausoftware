import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/Fotoerkennung.tsx
import React from "react";
import { useProject } from "../../store/useProject";
import { saveProjectLvPosition } from "../../api/projectLvCompat";
const card = {
    display: "grid",
    gap: 10,
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: 16,
    background: "#fff"
};
const inp = {
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14
};
const tbl = {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 8,
    background: "#fff"
};
const th = {
    textAlign: "left",
    padding: 6,
    borderBottom: "1px solid #e5e7eb"
};
const thC = {
    ...th,
    textAlign: "center"
};
const td = {
    padding: 6,
    borderBottom: "1px solid #f0f0f0"
};
const tdC = {
    ...td,
    textAlign: "center"
};
export default function Fotoerkennung() {
    const projectCtx = useProject();
    const currentProject = projectCtx?.currentProject ?? null;
    const storeProjectId = currentProject?.id ?? "";
    const projectCode = currentProject?.code ?? "";
    const [file, setFile] = React.useState(null);
    const [note, setNote] = React.useState("");
    const [result, setResult] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [previewUrl, setPreviewUrl] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [projectInput, setProjectInput] = React.useState("");
    const effectiveProjectId = projectInput.trim() || storeProjectId || projectCode || "";
    React.useEffect(() => {
        if (!file) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => {
            URL.revokeObjectURL(url);
        };
    }, [file]);
    async function handleAnalyze() {
        if (!file) {
            window.alert("Bitte ein Foto auswählen.");
            return;
        }
        if (!effectiveProjectId) {
            window.alert("Bitte ein Projekt auswählen oder Projekt-ID eingeben.");
            return;
        }
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const form = new FormData();
            form.append("file", file);
            form.append("note", note);
            form.append("projectId", storeProjectId || effectiveProjectId);
            form.append("projectCode", projectCode || "");
            const res = await fetch("/api/ki/photo-analyze", {
                method: "POST",
                body: form
            });
            if (!res.ok) {
                throw new Error((await res.text()) || "Analyse fehlgeschlagen");
            }
            const data = (await res.json());
            setResult({
                positions: Array.isArray(data?.positions) ? data.positions : [],
                boxes: Array.isArray(data?.boxes) ? data.boxes : [],
                summary: typeof data?.summary === "string" ? data.summary : ""
            });
        }
        catch (e) {
            console.error(e);
            const msg = e instanceof Error ? e.message : "Analyse fehlgeschlagen";
            setError(msg);
            window.alert("Fehler bei Analyse.");
        }
        finally {
            setLoading(false);
        }
    }
    async function handleAddToLV(p) {
        if (!effectiveProjectId) {
            window.alert("Kein Projekt gewählt.");
            return;
        }
        try {
            const payload = {
                projectId: storeProjectId || effectiveProjectId,
                projectCode: projectCode || undefined,
                posNr: p.match?.id || undefined,
                kurztext: p.match?.kurztext || p.kurztext,
                einheit: p.match?.einheit || p.einheit,
                quelle: "Fotoerkennung"
            };
            await saveProjectLvPosition(storeProjectId || effectiveProjectId, payload);
            window.alert(`'${payload.kurztext}' ins LV eingefügt ✅`);
        }
        catch (e) {
            console.error(e);
            window.alert("Fehler beim Einfügen ins LV");
        }
    }
    function handleNachtrag(p) {
        const url = `/kalkulation/nachtraege?fromFoto=1` +
            `&projectId=${encodeURIComponent(storeProjectId || effectiveProjectId)}` +
            `&projectCode=${encodeURIComponent(projectCode || "")}` +
            `&kurztext=${encodeURIComponent(p.kurztext)}` +
            `&einheit=${encodeURIComponent(p.einheit)}`;
        window.location.href = url;
    }
    return (_jsxs("div", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-986", children: [_jsx("h1", { children: "Fotoerkennung (Leistung/Material/Mengen)" }), _jsxs("div", { className: rlcClass(null, card), children: [_jsxs("div", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-987", children: [_jsxs("div", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-988", children: [_jsx("input", { type: "file", accept: "image/*", onChange: (e) => {
                                            setFile(e.target.files?.[0] || null);
                                            setResult(null);
                                            setError(null);
                                        } }), _jsx("textarea", { placeholder: "Notiz oder Beschreibung\u2026", value: note, onChange: (e) => setNote(e.target.value), className: rlcClass(null, { ...inp, minHeight: 80 }) }), _jsxs("div", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-989", children: [_jsx("label", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-990", children: "Projekt" }), _jsx("input", { className: rlcClass(null, { ...inp, flex: 1 }), placeholder: "z. B. BA-2025-834", value: projectInput, onChange: (e) => setProjectInput(e.target.value) })] }), _jsxs("div", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-991", children: ["Aktiv: ", effectiveProjectId || "kein Projekt gewählt"] })] }), _jsxs("div", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-992", children: [_jsx("button", { className: "btn", onClick: handleAnalyze, disabled: loading || !file, children: loading ? "Analysiere…" : "Foto analysieren" }), result &&
                                        _jsx("button", { className: "btn", onClick: () => setResult(null), children: "Ergebnis zur\u00FCcksetzen" })] })] }), error && _jsx("div", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-993", children: error })] }), previewUrl &&
                _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h3", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-994", children: "Vorschau" }), _jsx(ImageWithBoxes, { src: previewUrl, boxes: result?.boxes || [] })] }), result?.positions &&
                _jsxs("div", { className: rlcClass(null, card), children: [_jsx("h3", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-995", children: "Erkannte LV-Positionen" }), _jsx("p", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-996", children: result.summary || "—" }), _jsxs("table", { className: rlcClass(null, tbl), children: [_jsx("thead", { children: _jsxs("tr", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-997", children: [_jsx("th", { className: rlcClass(null, th), children: "Kurztext" }), _jsx("th", { className: rlcClass(null, thC), children: "Einheit" }), _jsx("th", { className: rlcClass(null, thC), children: "Typ" }), _jsx("th", { className: rlcClass(null, thC), children: "Status" }), _jsx("th", { className: rlcClass(null, th), children: "Match (falls vorhanden)" }), _jsx("th", { className: rlcClass(null, thC), children: "Aktion" })] }) }), _jsxs("tbody", { children: [result.positions.map((p) => _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: p.kurztext }), _jsx("td", { className: rlcClass(null, tdC), children: p.einheit || "—" }), _jsx("td", { className: rlcClass(null, {
                                                        ...tdC,
                                                        color: p.typ === "implizit" ? "#92400e" : "#065f46"
                                                    }), children: p.typ }), _jsx("td", { className: rlcClass(null, {
                                                        ...tdC,
                                                        fontWeight: 600,
                                                        color: p.status === "bestehend" ? "#065f46" : "#9a3412"
                                                    }), children: p.status }), _jsx("td", { className: rlcClass(null, td), children: p.match ?
                                                        _jsxs(_Fragment, { children: [_jsx("div", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-998", children: p.match.kurztext }), _jsxs("div", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-999", children: [p.match.einheit || "—", " \u00B7 Score:", " ", Math.round((p.match.score || 0) * 100), "%"] })] }) :
                                                        _jsx("span", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-1000", children: "\u2014" }) }), _jsx("td", { className: rlcClass(null, { ...tdC, whiteSpace: "nowrap" }), children: p.status === "bestehend" ?
                                                        _jsx("button", { className: "btn rlc-migrated-pages-ki-fotoerkennung-tsx-1001", onClick: () => handleAddToLV(p), children: "In LV einf\u00FCgen" }) :
                                                        _jsx("button", { className: "btn rlc-migrated-pages-ki-fotoerkennung-tsx-1002", onClick: () => handleNachtrag(p), children: "Nachtrag erstellen \u2192" }) })] }, p.id)), result.positions.length === 0 &&
                                            _jsx("tr", { children: _jsx("td", { className: rlcClass(null, { ...td, opacity: 0.6 }), colSpan: 6, children: "Keine Positionen erkannt." }) })] })] })] })] }));
}
/* ================== Image + Overlay ================== */
function ImageWithBoxes({ src, boxes }) {
    const imgRef = React.useRef(null);
    const canvasRef = React.useRef(null);
    React.useEffect(() => {
        const img = imgRef.current;
        const cv = canvasRef.current;
        if (!img || !cv)
            return;
        function draw() {
            if (!img || !cv)
                return;
            const rect = img.getBoundingClientRect();
            if (!rect.width || !rect.height)
                return;
            cv.width = Math.round(rect.width);
            cv.height = Math.round(rect.height);
            const ctx = cv.getContext("2d");
            if (!ctx)
                return;
            ctx.clearRect(0, 0, cv.width, cv.height);
            ctx.lineWidth = 2;
            ctx.font = "12px system-ui, sans-serif";
            boxes.forEach((b, i) => {
                const [x, y, w, h] = b.box || [0, 0, 0, 0];
                const normalized = x <= 1 && y <= 1 && w <= 1 && h <= 1 && x >= 0 && y >= 0 && w >= 0 && h >= 0;
                const X = normalized ? x * cv.width : x;
                const Y = normalized ? y * cv.height : y;
                const W = normalized ? w * cv.width : w;
                const H = normalized ? h * cv.height : h;
                const color = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"][i % 5];
                ctx.strokeStyle = color;
                ctx.fillStyle = color;
                ctx.strokeRect(X, Y, W, H);
                const label = `${b.label} • ${Math.round((b.score || 0) * 100)}% • ${b.qty} ${b.unit}`;
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
    return (_jsxs("div", { className: "rlc-migrated-pages-ki-fotoerkennung-tsx-1003", children: [_jsx("img", { ref: imgRef, src: src, alt: "preview", className: "rlc-migrated-pages-ki-fotoerkennung-tsx-1004" }), _jsx("canvas", { ref: canvasRef, className: "rlc-migrated-pages-ki-fotoerkennung-tsx-1005" })] }));
}
