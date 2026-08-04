import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { apiUrl } from "../../lib/apiBase";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../../store/useProject";
import MengPageHeader from "./MengPageHeader";
/* ========== util ========== */
const fmtEUR = (v) => `€ ${isFinite(v) ? v.toFixed(2) : "0.00"}`;
const toNum = (v) => typeof v === "number" ?
    v :
    Number(String(v ?? "").replace(",", ".").trim()) || 0;
function safeTrim(v) {
    return String(v ?? "").trim();
}
function fromAufmassJson(rows) {
    return (rows || []).map((r) => ({
        pos: String(r.pos ?? ""),
        text: String(r.text ?? ""),
        unit: String(r.unit ?? "m"),
        soll: Number(r.soll ?? 0),
        ist: Number(r.ist ?? 0),
        ep: Number(r.ep ?? 0)
    }));
}
function toAufmassJson(rows) {
    return (rows || []).map((r) => ({
        pos: String(r.pos ?? ""),
        text: String(r.text ?? ""),
        unit: String(r.unit ?? "m"),
        soll: Number(r.soll ?? 0),
        ist: Number(r.ist ?? 0),
        ep: Number(r.ep ?? 0)
    }));
}
function byPosAsc(a, b) {
    return String(a.pos ?? "").localeCompare(String(b.pos ?? ""), "de-DE", {
        numeric: true,
        sensitivity: "base"
    });
}
function mergeServerRowsByPos(a, b) {
    const map = new Map();
    const norm = (p) => String(p ?? "").trim();
    const put = (r) => {
        const k = norm(r?.pos);
        if (!k)
            return;
        const prev = map.get(k);
        if (!prev) {
            map.set(k, {
                pos: k,
                text: String(r?.text ?? ""),
                unit: String(r?.unit ?? "m"),
                soll: Number(r?.soll ?? 0),
                ist: Number(r?.ist ?? 0),
                ep: Number(r?.ep ?? 0)
            });
            return;
        }
        const next = { ...prev };
        if (!safeTrim(next.text) && safeTrim(r?.text))
            next.text = String(r.text);
        if (!safeTrim(next.unit) && safeTrim(r?.unit))
            next.unit = String(r.unit);
        if (!Number(next.ep) && Number(r?.ep))
            next.ep = Number(r.ep);
        if (!Number(next.soll) && Number(r?.soll))
            next.soll = Number(r.soll);
        next.ist = Math.max(Number(next.ist ?? 0), Number(r?.ist ?? 0));
        map.set(k, next);
    };
    (Array.isArray(a) ? a : []).forEach(put);
    (Array.isArray(b) ? b : []).forEach(put);
    return Array.from(map.values()).sort((x, y) => byPosAsc(fromAufmassJson([x])[0], fromAufmassJson([y])[0]));
}
async function fetchRowsForKey(key) {
    if (!safeTrim(key))
        return [];
    const url = apiUrl(`/api/aufmass/soll-ist/${encodeURIComponent(key)}`);
    const res = await fetch(url);
    if (!res.ok)
        return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.rows) ? data.rows : [];
}
/* ========== piccolo grafico SVG (nessuna dipendenza) ========== */
function SollIstChart({ rows }) {
    const H = 220;
    const PAD = 34;
    const groupWidth = 34;
    const W = Math.max(920, PAD * 2 + rows.length * groupWidth);
    const data = rows.map((row) => {
        const localMax = Math.max(1, Math.abs(row.soll), Math.abs(row.ist));
        return {
            label: row.pos,
            soll: row.soll,
            ist: row.ist,
            sollRatio: Math.abs(row.soll) / localMax,
            istRatio: Math.abs(row.ist) / localMax
        };
    });
    return (_jsxs("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Soll-Ist Vergleich je Position in relativer Darstellung", children: [_jsx("line", { x1: PAD, y1: H - PAD, x2: W - PAD, y2: H - PAD, stroke: "#cbd5e1" }), _jsx("line", { x1: PAD, y1: PAD, x2: PAD, y2: H - PAD, stroke: "#cbd5e1" }), [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = H - PAD - (H - PAD * 2) * ratio;
                return (_jsxs("g", { children: [_jsx("line", { x1: PAD, x2: W - PAD, y1: y, y2: y, stroke: "#eef2f7" }), _jsxs("text", { x: 4, y: y + 4, fontSize: "10", fill: "#64748b", children: [Math.round(ratio * 100), " %"] })] }, ratio));
            }), data.map((item, index) => {
                const x0 = PAD + index * groupWidth + 5;
                const barWidth = 10;
                const availableHeight = H - PAD * 2;
                const hSoll = availableHeight * item.sollRatio;
                const hIst = availableHeight * item.istRatio;
                return (_jsxs("g", { children: [_jsx("title", { children: `${item.label}: Soll ${item.soll}, Ist ${item.ist}` }), _jsx("rect", { x: x0, y: H - PAD - hSoll, width: barWidth, height: hSoll, fill: "#9ec5fe" }), _jsx("rect", { x: x0 + barWidth + 2, y: H - PAD - hIst, width: barWidth, height: hIst, fill: "#f3a7a7" }), _jsx("text", { x: x0 + barWidth, y: H - 9, fontSize: "9", textAnchor: "middle", fill: "#475569", children: item.label })] }, `${item.label}-${index}`));
            }), _jsxs("g", { transform: `translate(${W - 175},${PAD - 9})`, children: [_jsx("rect", { x: 0, y: 0, width: 12, height: 12, fill: "#9ec5fe" }), _jsx("text", { x: 18, y: 10, fontSize: "12", fill: "#334155", children: "Soll" }), _jsx("rect", { x: 70, y: 0, width: 12, height: 12, fill: "#f3a7a7" }), _jsx("text", { x: 88, y: 10, fontSize: "12", fill: "#334155", children: "Ist" })] })] }));
}
/* ========== componente principale ========== */
export default function SollIst() {
    const projectStore = useProject();
    const currentProject = projectStore?.currentProject;
    const getSelectedProject = projectStore?.getSelectedProject;
    const selectedProject = typeof getSelectedProject === "function" ? getSelectedProject() : null;
    const project = currentProject || selectedProject || null;
    const projectId = project?.id;
    const projectCode = project?.code;
    const projectKey = projectCode || projectId || undefined;
    const storageKey = projectKey ? `sollist:${projectKey}` : null;
    const legacyStorageKey = projectKey ? `sollist-${projectKey}` : null;
    const historyStorageKey = projectKey ?
        `sollist-snapshots:${projectKey}` :
        null;
    const [rows, setRows] = useState([]);
    const [history, setHistory] = useState([]);
    const [busy, setBusy] = useState(false);
    const [hydrated, setHydrated] = useState(false);
    const fileAufmassRef = useRef(null);
    const filePdfRef = useRef(null);
    const fileJsonRef = useRef(null);
    /* ========== LOAD history locale ========== */
    useEffect(() => {
        if (!historyStorageKey)
            return;
        try {
            const raw = window.localStorage.getItem(historyStorageKey);
            if (!raw) {
                setHistory([]);
                return;
            }
            const parsed = JSON.parse(raw);
            const snapshots = Array.isArray(parsed) ?
                parsed.filter((item) => Boolean(item) &&
                    typeof item.ts === "number" &&
                    Array.isArray(item.rows)) :
                [];
            setHistory(snapshots.slice(0, 5));
        }
        catch {
            setHistory([]);
        }
    }, [historyStorageKey]);
    /* ========== SAVE su localStorage ========== */
    useEffect(() => {
        if (!storageKey || !hydrated)
            return;
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(rows));
            if (legacyStorageKey)
                window.localStorage.removeItem(legacyStorageKey);
        }
        catch (error) {
            console.warn("Soll/Ist: lokaler Speicher konnte nicht aktualisiert werden", error);
        }
    }, [hydrated, legacyStorageKey, rows, storageKey]);
    /* ========== SAVE history locale ========== */
    useEffect(() => {
        if (!historyStorageKey)
            return;
        try {
            window.localStorage.setItem(historyStorageKey, JSON.stringify(history.slice(0, 5)));
        }
        catch (error) {
            console.warn("Soll/Ist: lokale Snapshots konnten nicht gespeichert werden", error);
        }
    }, [history, historyStorageKey]);
    /* ========== LOAD / SAVE su SERVER (STESSO FILE di AufmassEditor) ========== */
    const loadFromServer = useCallback(async () => {
        if (!projectKey && !projectId) {
            setRows([]);
            setHydrated(true);
            return;
        }
        const loadLocalFallback = () => {
            try {
                const raw = storageKey ?
                    window.localStorage.getItem(storageKey) || (legacyStorageKey ?
                        window.localStorage.getItem(legacyStorageKey) :
                        null) :
                    null;
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed : [];
            }
            catch {
                return [];
            }
        };
        try {
            setBusy(true);
            setHydrated(false);
            const byCode = projectCode ? await fetchRowsForKey(projectCode) : [];
            const byId = projectId && projectId !== projectCode ?
                await fetchRowsForKey(projectId) :
                [];
            const serverRows = byCode.length && !byId.length ?
                byCode :
                !byCode.length && byId.length ?
                    byId :
                    mergeServerRowsByPos(byCode, byId);
            if (serverRows.length > 0) {
                const loadedRows = fromAufmassJson(serverRows);
                setRows(loadedRows);
                setHistory((prev) => {
                    const snapshot = {
                        ts: Date.now(),
                        count: loadedRows.length,
                        rows: loadedRows.map((row) => ({ ...row }))
                    };
                    return [snapshot, ...prev].slice(0, 5);
                });
                setHydrated(true);
                return;
            }
            const fallbackRows = loadLocalFallback();
            setRows(fallbackRows.length ?
                fallbackRows :
                [
                    {
                        pos: "001.001",
                        text: "Neue Position",
                        unit: "m",
                        soll: 0,
                        ist: 0,
                        ep: 0
                    }
                ]);
            setHydrated(true);
        }
        catch (err) {
            console.error(err);
            const fallbackRows = loadLocalFallback();
            setRows(fallbackRows.length ?
                fallbackRows :
                [
                    {
                        pos: "001.001",
                        text: "Neue Position",
                        unit: "m",
                        soll: 0,
                        ist: 0,
                        ep: 0
                    }
                ]);
            setHydrated(true);
        }
        finally {
            setBusy(false);
        }
    }, [
        legacyStorageKey,
        projectCode,
        projectId,
        projectKey,
        storageKey
    ]);
    useEffect(() => {
        if (!projectKey && !projectId)
            return;
        loadFromServer();
    }, [projectKey, projectId, loadFromServer]);
    async function saveToServer() {
        if (!projectKey && !projectId) {
            alert("Kein Projekt ausgewählt. Bitte zuerst ein Projekt wählen.");
            return;
        }
        const payloadRows = toAufmassJson(rows);
        try {
            setBusy(true);
            const post = async (key) => {
                const url = apiUrl(`/api/aufmass/soll-ist/${encodeURIComponent(key)}`);
                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rows: payloadRows })
                });
                if (!res.ok)
                    throw new Error(`API ${url} -> HTTP ${res.status}`);
            };
            if (projectCode) {
                await post(projectCode);
            }
            else if (projectId) {
                await post(projectId);
            }
            if (projectId && projectId !== projectCode) {
                post(projectId).catch(() => void 0);
            }
            setHistory((prev) => {
                const snapshot = {
                    ts: Date.now(),
                    count: rows.length,
                    rows: rows.map((row) => ({ ...row }))
                };
                return [snapshot, ...prev].slice(0, 5);
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
    const suspiciousRows = useMemo(() => rows.filter((row) => {
        const unit = safeTrim(row.unit).toLowerCase();
        const isLumpSum = ["psch", "pausch", "pauschal"].includes(unit);
        const overrun = row.soll > 0 && row.ist > row.soll * 2;
        return isLumpSum && overrun;
    }), [rows]);
    /* ========== mutazioni riga ========== */
    const updateRow = (i, patch) => setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
    const addRow = () => setRows((prev) => [
        ...prev,
        {
            pos: `001.${String(prev.length + 1).padStart(3, "0")}`,
            text: "Neue Position",
            unit: "m",
            soll: 0,
            ist: 0,
            ep: 0
        }
    ]);
    const delRow = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));
    /* ========== helper CSV (Aufmaß-Datei) ========== */
    function parseCsvWithHeader(text) {
        const lines = text.
            split(/\r?\n/).
            map((l) => l.trim()).
            filter(Boolean);
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
                ep: toNum(it.ep ?? 0)
            }));
            setRows(mapped.length ? mapped : rows);
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
        const candidateKeys = [projectId, projectKey].filter((v, i, arr) => !!v && arr.indexOf(v) === i);
        if (!candidateKeys.length) {
            alert("Kein Projekt ausgewählt. Bitte zuerst ein Projekt wählen.");
            return;
        }
        try {
            setBusy(true);
            let payload = null;
            let lastErr = null;
            for (const key of candidateKeys) {
                try {
                    const url = apiUrl(`/api/project-lv/${encodeURIComponent(key)}`);
                    const res = await fetch(url);
                    if (!res.ok)
                        throw new Error(`API ${url} -> HTTP ${res.status}`);
                    payload = await res.json();
                    break;
                }
                catch (e) {
                    lastErr = e;
                }
            }
            if (!payload)
                throw lastErr || new Error("LV konnte nicht geladen werden.");
            const list = payload.items || payload.lv || [];
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
                ep: toNum(it.ep ?? it.einzelpreis ?? it.preis ?? 0)
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
                            ep: m.ep || ex.ep
                        });
                    }
                    else {
                        map.set(m.pos, m);
                    }
                });
                return Array.from(map.values()).sort(byPosAsc);
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
            const url = apiUrl("/api/import/parse");
            const res = await fetch(url, { method: "POST", body: fd });
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
                ep: 0
            }));
            setRows((prev) => [...prev, ...mapped].sort(byPosAsc));
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
            if (!Array.isArray(parsed) && parsed && typeof parsed === "object") {
                const objRows = Array.isArray(parsed.rows) ? parsed.rows : [];
                if (objRows.length && typeof objRows[0]?.soll !== "undefined") {
                    setRows(fromAufmassJson(objRows));
                    return;
                }
            }
            if (Array.isArray(parsed)) {
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
        padding: "8px 10px",
        borderBottom: "1px solid #eef2f7",
        color: "#0f172a",
        verticalAlign: "top"
    };
    const thStyle = {
        padding: "9px 10px",
        borderBottom: "1px solid #e5eaf3",
        background: "#f8fafc",
        color: "#475569",
        fontWeight: 700,
        textAlign: "left",
        whiteSpace: "nowrap"
    };
    const inp = {
        border: "1px solid var(--line)",
        borderRadius: 6,
        padding: "4px 6px",
        fontSize: 13
    };
    /* ========== render ========== */
    return (_jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-sollist-tsx-1357", children: [_jsx(MengPageHeader, { title: "Soll/Ist Vergleich", subtitle: "Vergleicht LV-Sollmengen mit erfassten Aufma\u00DFmengen und zeigt Abweichungen." }), _jsx("h2", { className: "rlc-migrated-pages-mengenermittlung-sollist-tsx-1358", children: "Aufma\u00DFvergleich \u00B7 Soll\u2013Ist" }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-sollist-tsx-1359", children: [_jsx("button", { className: "btn", onClick: addRow, disabled: busy, children: "+ Zeile" }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-sollist-tsx-1360" }), _jsx("button", { className: "btn", onClick: pickAufmassFile, disabled: busy, children: "Aus Aufma\u00DF laden" }), _jsx("button", { className: "btn", onClick: importFromLV, disabled: busy, children: "Import aus LV" }), _jsx("button", { className: "btn", onClick: pickPdfFile, disabled: busy, children: "Import aus PDF" }), _jsx("button", { className: "btn", onClick: loadFromServer, disabled: busy || !projectKey && !projectId, children: "Vom Server laden" }), _jsx("button", { className: "btn", onClick: saveToServer, disabled: busy || !projectKey && !projectId, children: "Speichern" }), _jsx("button", { className: "btn", onClick: pickJsonFile, disabled: busy, children: "Laden (JSON)" }), _jsx("input", { ref: fileAufmassRef, type: "file", accept: ".csv,text/csv,application/vnd.ms-excel", onChange: onPickAufmassFile, className: "rlc-migrated-pages-mengenermittlung-sollist-tsx-1361" }), _jsx("input", { ref: filePdfRef, type: "file", accept: "application/pdf", onChange: onPickPdfFile, className: "rlc-migrated-pages-mengenermittlung-sollist-tsx-1362" }), _jsx("input", { ref: fileJsonRef, type: "file", accept: "application/json,.json", onChange: onPickJsonFile, className: "rlc-migrated-pages-mengenermittlung-sollist-tsx-1363" })] }), suspiciousRows.length > 0 &&
                _jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-sollist-tsx-1364", children: ["Plausibilit\u00E4tspr\u00FCfung: ", suspiciousRows.length, " Pauschalposition(en) mit Ist-Menge \u00FCber 200 % des Solls. Bitte pr\u00FCfen: ", suspiciousRows.map((row) => row.pos).join(", "), "."] }), _jsx("div", { className: "card rlc-migrated-pages-mengenermittlung-sollist-tsx-1365", children: _jsx(SollIstChart, { rows: rows }) }), _jsx("div", { className: "card rlc-migrated-pages-mengenermittlung-sollist-tsx-1366", children: _jsxs("table", { className: "rlc-migrated-pages-mengenermittlung-sollist-tsx-1367", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, thStyle), children: "Pos." }), _jsx("th", { className: rlcClass(null, thStyle), children: "Beschreibung" }), _jsx("th", { className: rlcClass(null, thStyle), children: "Einheit" }), _jsx("th", { className: rlcClass(null, thStyle), children: "LV (Soll)" }), _jsx("th", { className: rlcClass(null, thStyle), children: "Ist (Abgerechnet)" }), _jsx("th", { className: rlcClass(null, thStyle), children: "Differenz (Soll\u2013Ist)" }), _jsx("th", { className: rlcClass(null, thStyle), children: "EP (\u20AC)" }), _jsx("th", { className: rlcClass(null, thStyle), children: "Gesamt (\u20AC)" }), _jsx("th", { className: rlcClass(null, thStyle), children: "Aktion" })] }) }), _jsx("tbody", { children: rows.map((r, i) => {
                                const diff = r.soll - r.ist;
                                const total = r.ist * r.ep;
                                return (_jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, tdStyle), children: r.pos }), _jsx("td", { className: rlcClass(null, tdStyle), children: _jsx("input", { className: rlcClass(null, { ...inp, width: "100%" }), value: r.text, onChange: (e) => updateRow(i, { text: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, tdStyle), children: _jsx("input", { className: rlcClass(null, { ...inp, width: 60 }), value: r.unit, onChange: (e) => updateRow(i, { unit: e.target.value }) }) }), _jsx("td", { className: rlcClass(null, tdStyle), children: _jsx("input", { type: "number", step: "0.01", className: rlcClass(null, { ...inp, width: 110 }), value: r.soll, onChange: (e) => updateRow(i, { soll: Number(e.target.value) }) }) }), _jsx("td", { className: rlcClass(null, tdStyle), children: _jsx("input", { type: "number", step: "0.01", className: rlcClass(null, { ...inp, width: 110 }), value: r.ist, onChange: (e) => updateRow(i, { ist: Number(e.target.value) }) }) }), _jsx("td", { className: rlcClass(null, { ...tdStyle, fontWeight: 600 }), children: diff.toLocaleString(undefined, { maximumFractionDigits: 3 }) }), _jsx("td", { className: rlcClass(null, tdStyle), children: _jsx("input", { type: "number", step: "0.01", className: rlcClass(null, { ...inp, width: 100 }), value: r.ep, onChange: (e) => updateRow(i, { ep: Number(e.target.value) }) }) }), _jsx("td", { className: rlcClass(null, { ...tdStyle, whiteSpace: "nowrap" }), children: fmtEUR(total) }), _jsx("td", { className: rlcClass(null, tdStyle), children: _jsx("button", { className: "btn", onClick: () => delRow(i), children: "L\u00F6schen" }) })] }, r.pos + i));
                            }) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, { ...tdStyle, fontWeight: 600 }), colSpan: 3, children: "Summen" }), _jsx("td", { className: rlcClass(null, { ...tdStyle, fontWeight: 600 }), children: sumSoll.toLocaleString(undefined, { maximumFractionDigits: 2 }) }), _jsx("td", { className: rlcClass(null, { ...tdStyle, fontWeight: 600 }), children: sumIst.toLocaleString(undefined, { maximumFractionDigits: 2 }) }), _jsx("td", { className: rlcClass(null, { ...tdStyle, fontWeight: 600 }), children: sumDiff.toLocaleString(undefined, { maximumFractionDigits: 2 }) }), _jsx("td", { className: rlcClass(null, { ...tdStyle, fontWeight: 600 }), colSpan: 2, children: fmtEUR(sumEUR) }), _jsx("td", { className: rlcClass(null, tdStyle) })] }) })] }) }), _jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-sollist-tsx-1368", children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-sollist-tsx-1369", children: "Verlauf" }), !projectKey && !projectId &&
                        _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-sollist-tsx-1370", children: "Kein Projekt gew\u00E4hlt. Verlauf steht erst nach Projektauswahl zur Verf\u00FCgung." }), (projectKey || projectId) && history.length === 0 &&
                        _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-sollist-tsx-1371", children: ["Noch keine gespeicherten St\u00E4nde. Mit ", _jsx("b", { children: "Speichern" }), " wird ein Snapshot erzeugt."] }), (projectKey || projectId) && history.length > 0 &&
                        _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-sollist-tsx-1372", children: history.map((h) => _jsxs("button", { className: "btn rlc-migrated-pages-mengenermittlung-sollist-tsx-1373", onClick: () => setRows(h.rows.map((row) => ({ ...row }))), title: "Diesen lokalen Stand wiederherstellen", children: [new Date(h.ts).toLocaleString(), " \u00B7 ", h.count, " Pos."] }, h.ts)) })] })] }));
}
