import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useCallback, useEffect, useMemo, useRef, useState, } from "react";
import { useProject } from "../../store/useProject";
/* ========== util ========== */
const fmtEUR = (v) => `€ ${isFinite(v) ? v.toFixed(2) : "0.00"}`;
const toNum = (v) => typeof v === "number"
    ? v
    : Number(String(v ?? "").replace(",", ".").trim()) || 0;
const API_BASE = import.meta?.env?.VITE_API_URL || "https://api.rlcbausoftware.com/api";
function fromAufmassJson(rows) {
    return (rows || []).map((r) => ({
        pos: String(r.pos ?? ""),
        text: String(r.text ?? ""),
        unit: String(r.unit ?? "m"),
        soll: Number(r.soll ?? 0),
        ist: Number(r.ist ?? 0),
        ep: Number(r.ep ?? 0),
    }));
}
function toAufmassJson(rows) {
    return (rows || []).map((r) => ({
        pos: String(r.pos ?? ""),
        text: String(r.text ?? ""),
        unit: String(r.unit ?? "m"),
        soll: Number(r.soll ?? 0),
        ist: Number(r.ist ?? 0),
        ep: Number(r.ep ?? 0),
    }));
}
/* ========== piccolo grafico SVG (nessuna dipendenza) ========== */
function SollIstChart({ rows }) {
    const W = 920;
    const H = 220;
    const PAD = 30;
    const data = rows.map((r) => ({ soll: r.soll, ist: r.ist, label: r.pos }));
    const maxV = Math.max(1, ...data.map((d) => Math.max(d.soll, d.ist)));
    const barW = Math.max(8, (W - PAD * 2) / Math.max(data.length, 1) - 6);
    return (_jsxs("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, role: "img", "aria-label": "Soll-Ist Balkendiagramm", children: [_jsx("line", { x1: PAD, y1: H - PAD, x2: W - PAD, y2: H - PAD, stroke: "#ccc" }), _jsx("line", { x1: PAD, y1: PAD, x2: PAD, y2: H - PAD, stroke: "#ccc" }), [0, 0.25, 0.5, 0.75, 1].map((t) => {
                const y = H - PAD - (H - PAD * 2) * t;
                const v = (maxV * t).toFixed(0);
                return (_jsxs("g", { children: [_jsx("line", { x1: PAD, x2: W - PAD, y1: y, y2: y, stroke: "#f1f1f1" }), _jsx("text", { x: 6, y: y + 4, fontSize: "10", fill: "#777", children: v })] }, t));
            }), data.map((d, i) => {
                const x0 = PAD + i * (barW * 2 + 6) + 2;
                const hSoll = (H - PAD * 2) * (d.soll / maxV);
                const hIst = (H - PAD * 2) * (d.ist / maxV);
                return (_jsxs("g", { children: [_jsx("rect", { x: x0, y: H - PAD - hSoll, width: barW, height: hSoll, fill: "#9ec5fe" }), _jsx("rect", { x: x0 + barW, y: H - PAD - hIst, width: barW, height: hIst, fill: "#f3a7a7" }), _jsx("text", { x: x0 + barW, y: H - 8, fontSize: "9", textAnchor: "middle", fill: "#444", children: d.label })] }, i));
            }), _jsxs("g", { transform: `translate(${W - 170},${PAD - 8})`, children: [_jsx("rect", { x: 0, y: 0, width: 12, height: 12, fill: "#9ec5fe" }), _jsx("text", { x: 18, y: 10, fontSize: "12", fill: "#333", children: "Soll" }), _jsx("rect", { x: 70, y: 0, width: 12, height: 12, fill: "#f3a7a7" }), _jsx("text", { x: 88, y: 10, fontSize: "12", fill: "#333", children: "Ist" })] })] }));
}
/* ========== componente principale ========== */
export default function SollIst() {
    const { currentProject } = useProject();
    const projectId = currentProject?.id;
    const projectKey = currentProject?.code || currentProject?.id || undefined;
    const storageKey = projectKey ? `sollist-${projectKey}` : null;
    const [rows, setRows] = useState([]);
    const [history, setHistory] = useState([]);
    const [busy, setBusy] = useState(false);
    const fileAufmassRef = useRef(null);
    const filePdfRef = useRef(null);
    const fileJsonRef = useRef(null);
    /* ========== LOAD da localStorage per progetto ========== */
    useEffect(() => {
        if (!storageKey)
            return;
        try {
            const raw = window.localStorage.getItem(storageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setRows(parsed);
                    return;
                }
            }
        }
        catch {
            // ignora
        }
        setRows([
            { pos: "001.001", text: "Neue Position", unit: "m", soll: 0, ist: 0, ep: 0 },
        ]);
    }, [storageKey]);
    /* ========== SAVE su localStorage ========== */
    useEffect(() => {
        if (!storageKey)
            return;
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(rows));
        }
        catch {
            // ignore
        }
    }, [rows, storageKey]);
    /* ========== LOAD / SAVE su SERVER (STESSO FILE di AufmassEditor) ========== */
    const loadFromServer = useCallback(async () => {
        if (!projectKey)
            return;
        try {
            setBusy(true);
            // stesso endpoint usato dall’AufmassEditor nuovo
            const url = `${API_BASE}/aufmass/aufmass/${encodeURIComponent(projectKey)}`;
            const res = await fetch(url);
            if (!res.ok)
                throw new Error(`API ${url} -> HTTP ${res.status}`);
            const data = await res.json();
            const serverRows = Array.isArray(data?.rows) ? data.rows : [];
            setRows(fromAufmassJson(serverRows));
            // aufmass.json non ha history: teniamo history “leggera” locale
            setHistory((prev) => {
                if (!serverRows.length)
                    return prev;
                const snap = { ts: Date.now(), count: serverRows.length };
                const next = [snap, ...prev].slice(0, 20);
                return next;
            });
        }
        catch (err) {
            console.error(err);
            alert("Aufmaßdaten vom Server laden fehlgeschlagen.");
        }
        finally {
            setBusy(false);
        }
    }, [projectKey]);
    useEffect(() => {
        if (!projectKey)
            return;
        loadFromServer();
    }, [projectKey, loadFromServer]);
    async function saveToServer() {
        if (!projectKey) {
            alert("Kein Projekt ausgewählt. Bitte zuerst ein Projekt wählen.");
            return;
        }
        try {
            setBusy(true);
            // salva nello stesso file: data/projects/<projectKey>/aufmass.json
            const url = `${API_BASE}/aufmass/aufmass/${encodeURIComponent(projectKey)}`;
            const payloadRows = toAufmassJson(rows);
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows: payloadRows }),
            });
            if (!res.ok)
                throw new Error(`API ${url} -> HTTP ${res.status}`);
            // snapshot locale per UI “Verlauf”
            setHistory((prev) => {
                const snap = { ts: Date.now(), count: rows.length };
                const next = [snap, ...prev].slice(0, 20);
                return next;
            });
        }
        catch (err) {
            console.error(err);
            alert("Aufmaßdaten am Server speichern fehlgeschlagen.");
        }
        finally {
            setBusy(false);
        }
    }
    /* ========== somme ========== */
    const sumSoll = useMemo(() => rows.reduce((a, r) => a + r.soll, 0), [rows]);
    const sumIst = useMemo(() => rows.reduce((a, r) => a + r.ist, 0), [rows]);
    const sumDiff = useMemo(() => sumSoll - sumIst, [sumSoll, sumIst]);
    const sumEUR = useMemo(() => rows.reduce((a, r) => a + r.ist * r.ep, 0), [rows]);
    /* ========== mutazioni riga ========== */
    const updateRow = (i, patch) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    const addRow = () => setRows((prev) => [
        ...prev,
        {
            pos: `001.${String(prev.length + 1).padStart(3, "0")}`,
            text: "Neue Position",
            unit: "m",
            soll: 0,
            ist: 0,
            ep: 0,
        },
    ]);
    const delRow = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));
    /* ========== helper CSV (Aufmaß-Datei) ========== */
    function parseCsvWithHeader(text) {
        const lines = text
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
        if (!lines.length)
            return [];
        const sep = lines[0].includes(";") ? ";" : ",";
        const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
        const dataLines = lines.slice(1);
        return dataLines.map((line) => {
            const cols = line.split(sep).map((c) => c.replace(/^"(.*)"$/, "$1").trim());
            const item = {};
            header.forEach((h, idx) => {
                const v = cols[idx];
                if (/^pos/.test(h))
                    item.pos = v;
                else if (/kurz|beschr|text/.test(h)) {
                    item.descr = v;
                    item.kurztext = v;
                    item.text = v;
                }
                else if (/einheit|unit/.test(h))
                    item.unit = v;
                else if (/lv|soll/.test(h))
                    item.qty = v;
                else if (/ist|abgerechnet/.test(h))
                    item.ist = v;
                else if (/ep|preis/.test(h))
                    item.ep = v;
            });
            return item;
        });
    }
    /* ========== Aus Aufmaß laden (Datei) ========== */
    const pickAufmassFile = () => fileAufmassRef.current?.click();
    const onPickAufmassFile = async (e) => {
        const f = e.target.files?.[0];
        if (!f)
            return;
        e.target.value = "";
        try {
            setBusy(true);
            const text = await f.text();
            const items = parseCsvWithHeader(text);
            const mapped = items.map((it, idx) => ({
                pos: it.pos || `AUF.${String(idx + 1).padStart(3, "0")}`,
                text: it.descr || it.kurztext || it.text || it.type || "Aufmaß-Position",
                unit: it.unit || it.einheit || "m",
                soll: toNum(it.qty ?? 0),
                ist: toNum(it.ist ?? 0),
                ep: toNum(it.ep ?? 0),
            }));
            setRows(mapped);
        }
        catch (err) {
            console.error(err);
            alert("Aufmaß-Import (Datei) fehlgeschlagen.");
        }
        finally {
            setBusy(false);
        }
    };
    /* ========== Import aus LV (Projekt) – DB → /api/project-lv/:projectId ========== */
    async function importFromLV() {
        if (!projectId) {
            alert("Kein Projekt ausgewählt. Bitte zuerst ein Projekt wählen.");
            return;
        }
        try {
            setBusy(true);
            const url = `${API_BASE}/project-lv/${encodeURIComponent(projectId)}`;
            const res = await fetch(url);
            if (!res.ok)
                throw new Error(`API ${url} -> HTTP ${res.status}`);
            const payload = await res.json();
            const list = payload.items || [];
            if (!Array.isArray(list) || !list.length) {
                alert("Im LV wurden keine Positionen gefunden.");
                return;
            }
            const mapped = list.map((it, idx) => ({
                pos: it.pos || it.position || `LV.${String(idx + 1).padStart(3, "0")}`,
                text: it.text || it.kurztext || it.descr || it.Kurztext || "LV-Position",
                unit: it.unit || it.einheit || it.Einheit || "m",
                soll: toNum(it.quantity ??
                    it.qty ??
                    it.menge ??
                    it.lvMenge ??
                    it.soll ??
                    it.Soll ??
                    0),
                ist: 0,
                ep: toNum(it.ep ?? it.einzelpreis ?? it.preis ?? 0),
            }));
            setRows((prev) => {
                const map = new Map();
                prev.forEach((r) => map.set(r.pos, r));
                mapped.forEach((m) => {
                    const ex = map.get(m.pos);
                    if (ex) {
                        map.set(m.pos, {
                            ...ex,
                            text: m.text || ex.text,
                            unit: m.unit || ex.unit,
                            soll: m.soll,
                            ep: m.ep || ex.ep,
                        });
                    }
                    else {
                        map.set(m.pos, m);
                    }
                });
                return Array.from(map.values());
            });
        }
        catch (err) {
            console.error(err);
            alert(`LV-Import fehlgeschlagen. Prüfe /api/project-lv/:projectId.\nDetails: ${err?.message || ""}`);
        }
        finally {
            setBusy(false);
        }
    }
    /* ========== Import aus PDF (Plan) ========== */
    const pickPdfFile = () => filePdfRef.current?.click();
    async function onPickPdfFile(e) {
        const f = e.target.files?.[0];
        if (!f)
            return;
        e.target.value = "";
        try {
            setBusy(true);
            const fd = new FormData();
            fd.append("file", f);
            fd.append("note", "Soll-Ist Import");
            fd.append("scale", "1");
            const url = `${API_BASE}/import/parse`;
            const res = await fetch(url, { method: "POST", body: fd }); // ✅ FIX
            if (!res.ok)
                throw new Error(`Import API ${res.status}`);
            const data = await res.json();
            const items = data.items || [];
            const mapped = items.map((it, idx) => ({
                pos: it.pos || `PDF.${String(idx + 1).padStart(3, "0")}`,
                text: it.descr || it.text || it.type || "PDF-Zeile",
                unit: it.unit || "m",
                soll: toNum(it.qty ?? 0),
                ist: 0,
                ep: 0,
            }));
            setRows((prev) => [...prev, ...mapped]);
        }
        catch (err) {
            console.error(err);
            alert("PDF-Import fehlgeschlagen. Prüfe /api/import/parse.");
        }
        finally {
            setBusy(false);
        }
    }
    /* ========== Laden von JSON-Datei (aufmass.json o array righe) ========== */
    const pickJsonFile = () => fileJsonRef.current?.click();
    async function onPickJsonFile(e) {
        const f = e.target.files?.[0];
        if (!f)
            return;
        e.target.value = "";
        try {
            setBusy(true);
            const text = await f.text();
            const parsed = JSON.parse(text);
            // oggetto { rows: [...] } (aufmass.json wrapper)
            if (!Array.isArray(parsed) && parsed && typeof parsed === "object") {
                const objRows = Array.isArray(parsed.rows) ? parsed.rows : [];
                // può essere Row[] o AufmassJsonRow[]
                if (objRows.length && typeof objRows[0]?.soll !== "undefined") {
                    setRows(fromAufmassJson(objRows));
                    return;
                }
            }
            // direttamente array
            if (Array.isArray(parsed)) {
                // tenta come AufmassJsonRow
                if (parsed.length && typeof parsed[0]?.soll !== "undefined") {
                    setRows(fromAufmassJson(parsed));
                    return;
                }
                setRows(parsed);
                return;
            }
            alert("JSON-Format wird nicht erkannt.");
        }
        catch (err) {
            console.error(err);
            alert("JSON-Datei konnte nicht geladen werden.");
        }
        finally {
            setBusy(false);
        }
    }
    /* ========== stili ========== */
    const tdStyle = {
        padding: "6px 8px",
        borderBottom: "1px solid var(--line)",
        fontSize: 13,
    };
    const thStyle = {
        ...tdStyle,
        fontWeight: 700,
        background: "#f7f7f7",
    };
    const inp = {
        border: "1px solid var(--line)",
        borderRadius: 6,
        padding: "4px 6px",
        fontSize: 13,
    };
    /* ========== render ========== */
    return (_jsxs("div", { className: "card", style: { padding: 16 }, children: [_jsx("h2", { style: { marginTop: 0 }, children: "Aufma\u00DFvergleich \u00B7 Soll\u2013Ist" }), _jsxs("div", { style: { display: "flex", gap: 8, marginBottom: 10 }, children: [_jsx("button", { className: "btn", onClick: addRow, disabled: busy, children: "+ Zeile" }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: pickAufmassFile, disabled: busy, children: "Aus Aufma\u00DF laden" }), _jsx("button", { className: "btn", onClick: importFromLV, disabled: busy, children: "Import aus LV" }), _jsx("button", { className: "btn", onClick: pickPdfFile, disabled: busy, children: "Import aus PDF" }), _jsx("button", { className: "btn", onClick: loadFromServer, disabled: busy || !projectKey, children: "Vom Server laden" }), _jsx("button", { className: "btn", onClick: saveToServer, disabled: busy || !projectKey, children: "Speichern" }), _jsx("button", { className: "btn", onClick: pickJsonFile, disabled: busy, children: "Laden (JSON)" }), _jsx("input", { ref: fileAufmassRef, type: "file", accept: ".csv,text/csv,application/vnd.ms-excel", style: { display: "none" }, onChange: onPickAufmassFile }), _jsx("input", { ref: filePdfRef, type: "file", accept: "application/pdf", style: { display: "none" }, onChange: onPickPdfFile }), _jsx("input", { ref: fileJsonRef, type: "file", accept: "application/json,.json", style: { display: "none" }, onChange: onPickJsonFile })] }), _jsx("div", { className: "card", style: { padding: 10, marginBottom: 12 }, children: _jsx(SollIstChart, { rows: rows }) }), _jsx("div", { className: "card", style: { padding: 0, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: thStyle, children: "Pos." }), _jsx("th", { style: thStyle, children: "Beschreibung" }), _jsx("th", { style: thStyle, children: "Einheit" }), _jsx("th", { style: thStyle, children: "LV (Soll)" }), _jsx("th", { style: thStyle, children: "Ist (Abgerechnet)" }), _jsx("th", { style: thStyle, children: "Differenz (Soll\u2013Ist)" }), _jsx("th", { style: thStyle, children: "EP (\u20AC)" }), _jsx("th", { style: thStyle, children: "Gesamt (\u20AC)" }), _jsx("th", { style: thStyle, children: "Aktion" })] }) }), _jsx("tbody", { children: rows.map((r, i) => {
                                const diff = r.soll - r.ist;
                                const total = r.ist * r.ep;
                                return (_jsxs("tr", { children: [_jsx("td", { style: tdStyle, children: r.pos }), _jsx("td", { style: tdStyle, children: _jsx("input", { style: { ...inp, width: "100%" }, value: r.text, onChange: (e) => updateRow(i, { text: e.target.value }) }) }), _jsx("td", { style: tdStyle, children: _jsx("input", { style: { ...inp, width: 60 }, value: r.unit, onChange: (e) => updateRow(i, { unit: e.target.value }) }) }), _jsx("td", { style: tdStyle, children: _jsx("input", { type: "number", step: "0.01", style: { ...inp, width: 110 }, value: r.soll, onChange: (e) => updateRow(i, { soll: Number(e.target.value) }) }) }), _jsx("td", { style: tdStyle, children: _jsx("input", { type: "number", step: "0.01", style: { ...inp, width: 110 }, value: r.ist, onChange: (e) => updateRow(i, { ist: Number(e.target.value) }) }) }), _jsx("td", { style: { ...tdStyle, fontWeight: 700 }, children: diff.toLocaleString(undefined, { maximumFractionDigits: 3 }) }), _jsx("td", { style: tdStyle, children: _jsx("input", { type: "number", step: "0.01", style: { ...inp, width: 100 }, value: r.ep, onChange: (e) => updateRow(i, { ep: Number(e.target.value) }) }) }), _jsx("td", { style: { ...tdStyle, whiteSpace: "nowrap" }, children: fmtEUR(total) }), _jsx("td", { style: tdStyle, children: _jsx("button", { className: "btn", onClick: () => delRow(i), children: "L\u00F6schen" }) })] }, r.pos + i));
                            }) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { style: { ...tdStyle, fontWeight: 700 }, colSpan: 3, children: "Summen" }), _jsx("td", { style: { ...tdStyle, fontWeight: 700 }, children: sumSoll.toLocaleString(undefined, { maximumFractionDigits: 2 }) }), _jsx("td", { style: { ...tdStyle, fontWeight: 700 }, children: sumIst.toLocaleString(undefined, { maximumFractionDigits: 2 }) }), _jsx("td", { style: { ...tdStyle, fontWeight: 700 }, children: sumDiff.toLocaleString(undefined, { maximumFractionDigits: 2 }) }), _jsx("td", { style: { ...tdStyle, fontWeight: 700 }, colSpan: 2, children: fmtEUR(sumEUR) }), _jsx("td", { style: tdStyle })] }) })] }) }), _jsxs("div", { className: "card", style: { marginTop: 12, padding: 10 }, children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "Verlauf" }), !projectKey && (_jsx("div", { style: { fontSize: 13 }, children: "Kein Projekt gew\u00E4hlt. Verlauf steht erst nach Projektauswahl zur Verf\u00FCgung." })), projectKey && history.length === 0 && (_jsxs("div", { style: { fontSize: 13 }, children: ["Noch keine gespeicherten St\u00E4nde. Mit ", _jsx("b", { children: "Speichern" }), " wird ein Snapshot erzeugt."] })), projectKey && history.length > 0 && (_jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: history.map((h) => (_jsxs("button", { className: "btn", style: { fontSize: 11, padding: "4px 8px" }, onClick: loadFromServer, children: [new Date(h.ts).toLocaleString(), " \u00B7 ", h.count, " Pos."] }, h.ts))) }))] })] }));
}
