import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/kalkulation/KalkulationMitKI.tsx
import React from "react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import { useKiSuggest } from "./useKiSuggest";
import { LV } from "./store.lv";
import { useProject } from "../../store/useProject";
/* ====== STILI ====== */
const th = {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    whiteSpace: "nowrap",
};
const td = {
    padding: "6px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    verticalAlign: "middle",
};
const inp = { border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
const lbl = { fontSize: 12, opacity: 0.8 };
/* ====== Bridge Keys ====== */
const KI_HANDOFF_KEY = "rlc_kalkulation_ki_handoff_v1";
const HANDOFF_CONSUMED_TS_KEY = "kalkulation:kiHandoffConsumedTs";
/* ====== Server API (coerente con altri moduli kalkulation) ====== */
const API_BASE = "/api/kalkulation";
const PROJECT_LV_API_BASE = "/api/projects";
/* ====== Local backup (quando server route manca) ====== */
function localBackupKey(projectKey) {
    return `rlc_kalkulation_mit_ki_backup_v1:${projectKey || "NO_PROJECT"}`;
}
/* ====== COMPONENTE ====== */
export default function KalkulationMitKI() {
    const p = useProject();
    // supporta TUTTE le varianti: {project}, {projectId, projectCode}, ecc.
    const projectObj = p?.project || p?.currentProject || p?.selectedProject;
    const projectKey = String(projectObj?.code ||
        projectObj?.projectCode ||
        p?.projectCode ||
        projectObj?.id ||
        p?.projectId ||
        p?.id ||
        "").trim();
    // ✅ init from LV (so non si perde quando si torna indietro, se LV persiste)
    const [rows, setRows] = React.useState(() => LV.list());
    const { suggest, loading } = useKiSuggest();
    // Stato save/load server
    const [serverBusy, setServerBusy] = React.useState(false);
    const [serverStatus, setServerStatus] = React.useState("");
    // ✅ Bridge import (Rezepte -> KI)
    React.useEffect(() => {
        const alreadyHaveRows = (LV.list()?.length || 0) > 0;
        const consumedTs = sessionStorage.getItem(HANDOFF_CONSUMED_TS_KEY);
        function importIntoLv(imported, markerTs) {
            if (!imported.length)
                return;
            // Se ho già righe e questa import è già stata consumata, evita duplicati
            if (alreadyHaveRows && markerTs && consumedTs === markerTs) {
                setRows(LV.list());
                return;
            }
            // Import = prepend
            const merged = [...imported, ...LV.list()];
            LV.bulkUpsert(merged);
            setRows(LV.list());
            if (markerTs)
                sessionStorage.setItem(HANDOFF_CONSUMED_TS_KEY, markerTs);
        }
        try {
            // ===== 1) localStorage handoff (persistente) =====
            const rawH = localStorage.getItem(KI_HANDOFF_KEY);
            if (rawH) {
                const h = JSON.parse(rawH);
                if (h && h.source === "rezepte" && Array.isArray(h.rows) && h.rows.length) {
                    const markerTs = String(h.ts || "");
                    if (alreadyHaveRows && markerTs && consumedTs === markerTs) {
                        setRows(LV.list());
                        return;
                    }
                    const imported = h.rows.map((r) => ({
                        id: crypto.randomUUID(),
                        posNr: String(r.posNr || r.pos || ""),
                        kurztext: String(r.kurztext || r.text || ""),
                        einheit: String(r.einheit || r.unit || ""),
                        menge: Number(r.menge ?? r.qty ?? 0),
                        preis: Number(r.preis ?? r.ep ?? 0),
                        confidence: typeof r.confidence === "number" ? r.confidence : undefined,
                        rabatt: 0,
                    }));
                    importIntoLv(imported, markerTs);
                    return;
                }
            }
            // ===== 2) sessionStorage lastDraftKey -> draft =====
            const lastKey = sessionStorage.getItem("kalkulation:lastDraftKey");
            if (lastKey) {
                const raw = sessionStorage.getItem(lastKey);
                if (raw) {
                    const d = JSON.parse(raw);
                    if (d && d.source === "rezepte" && Array.isArray(d.rows) && d.rows.length) {
                        const markerTs = String(d.createdAt || "");
                        if (alreadyHaveRows && markerTs && consumedTs === markerTs) {
                            setRows(LV.list());
                            return;
                        }
                        const imported = d.rows.map((r) => ({
                            id: crypto.randomUUID(),
                            posNr: String(r.pos || r.posNr || ""),
                            kurztext: String(r.text || r.kurztext || ""),
                            einheit: String(r.unit || r.einheit || ""),
                            menge: Number(r.qty ?? r.menge ?? 0),
                            preis: Number(r.ep ?? r.preis ?? 0),
                            confidence: typeof r?.meta?.confidence === "number" ? r.meta.confidence : undefined,
                            rabatt: 0,
                        }));
                        importIntoLv(imported, markerTs);
                        return;
                    }
                }
            }
            // ===== 3) legacy: sessionStorage lastDraft =====
            const rawLegacy = sessionStorage.getItem("kalkulation:lastDraft");
            if (rawLegacy) {
                const d = JSON.parse(rawLegacy);
                if (d && d.source === "rezepte" && Array.isArray(d.rows) && d.rows.length) {
                    const markerTs = String(d.createdAt || "");
                    if (alreadyHaveRows && markerTs && consumedTs === markerTs) {
                        setRows(LV.list());
                        return;
                    }
                    const imported = d.rows.map((r) => ({
                        id: crypto.randomUUID(),
                        posNr: String(r.pos || r.posNr || ""),
                        kurztext: String(r.text || r.kurztext || ""),
                        einheit: String(r.unit || r.einheit || ""),
                        menge: Number(r.qty ?? r.menge ?? 0),
                        preis: Number(r.ep ?? r.preis ?? 0),
                        confidence: typeof r?.meta?.confidence === "number" ? r.meta.confidence : undefined,
                        rabatt: 0,
                    }));
                    importIntoLv(imported, markerTs);
                    return;
                }
            }
        }
        catch {
            // ignore
        }
        // fallback: mostra LV
        setRows(LV.list());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Finanza generale
    const [mwst, setMwst] = React.useState(19);
    const [aufschlag, setAufschlag] = React.useState(10);
    // Dati intestazione
    const [company, setCompany] = React.useState({
        name: "RLC Bausoftware GmbH",
        address: "Musterstraße 12, 80333 München",
        phone: "+49 89 123456",
        email: "info@rlc-bau.de",
        logoUrl: "/rlc-logo.png",
    });
    const [client, setClient] = React.useState({
        name: "Muster Bau GmbH",
        address: "Hauptstraße 5, 50667 Köln",
    });
    const [offer, setOffer] = React.useState({
        number: `ANG-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
        place: "München",
        notes: "Zahlungsbedingungen: 30 Tage netto. Angebot gültig 30 Tage.",
    });
    const [watermark, setWatermark] = React.useState(true);
    // Firme digitali (+ nomi)
    const [sigBauleiter, setSigBauleiter] = React.useState(null);
    const [sigAuftraggeber, setSigAuftraggeber] = React.useState(null);
    const [bauleiterName, setBauleiterName] = React.useState("Bauleiter");
    const [auftraggeberName, setAuftraggeberName] = React.useState("Auftraggeber");
    // Sconti/Markup capitolo
    const [kapRabatt, setKapRabatt] = React.useState({});
    const [kapMarkup, setKapMarkup] = React.useState({});
    // Colori PDF
    const [pdfColors, setPdfColors] = React.useState({
        head: [60, 120, 216],
        chap: [220, 220, 220],
    });
    // Email
    const [mail, setMail] = React.useState({
        to: "",
        subject: "Ihr Angebot",
        body: "Guten Tag,\nim Anhang finden Sie unser Angebot als PDF.\nMit freundlichen Grüßen\nRLC Bausoftware",
    });
    /* ===== Raggruppamento capitoli ===== */
    const chapters = React.useMemo(() => {
        const map = new Map();
        for (const r of rows) {
            const ch = getChapter(r.posNr);
            if (!map.has(ch))
                map.set(ch, []);
            map.get(ch).push(r);
        }
        return map;
    }, [rows]);
    React.useEffect(() => {
        const nextR = { ...kapRabatt };
        const nextM = { ...kapMarkup };
        for (const ch of chapters.keys()) {
            if (nextR[ch] == null)
                nextR[ch] = 0;
            if (nextM[ch] == null)
                nextM[ch] = 0;
        }
        for (const k of Object.keys(nextR))
            if (!chapters.has(k))
                delete nextR[k];
        for (const k of Object.keys(nextM))
            if (!chapters.has(k))
                delete nextM[k];
        setKapRabatt(nextR);
        setKapMarkup(nextM);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chapters.size]);
    /* ===== KPI ===== */
    const coverage = React.useMemo(() => {
        const priced = rows.filter((r) => typeof r.preis === "number").length;
        return { priced, total: rows.length, pct: rows.length ? Math.round((priced / rows.length) * 100) : 0 };
    }, [rows]);
    const avgConfidence = React.useMemo(() => {
        if (!rows.length)
            return 0;
        return rows.reduce((s, r) => s + (r.confidence ?? 0), 0) / rows.length;
    }, [rows]);
    /* ===== Calcoli capitolo/totali ===== */
    const kapTotals = React.useMemo(() => {
        const out = {};
        chapters.forEach((list, ch) => {
            const sumRaw = list.reduce((s, r) => s + lineRaw(r), 0);
            const sumAfterLineDisc = list.reduce((s, r) => s + lineAfterLineDiscount(r), 0);
            const rabattKap = kapRabatt[ch] || 0;
            const sumAfterKap = sumAfterLineDisc * (1 - rabattKap / 100);
            const markupKap = kapMarkup[ch] || 0;
            const sumFinalKap = sumAfterKap * (1 + markupKap / 100);
            out[ch] = { sumRaw, sumAfterLineDisc, rabattKap, sumAfterKap, markupKap, sumFinalKap };
        });
        return out;
    }, [chapters, kapRabatt, kapMarkup]);
    const netto = React.useMemo(() => Object.values(kapTotals).reduce((s, t) => s + t.sumFinalKap, 0), [kapTotals]);
    const aufschlagWert = netto * (aufschlag / 100);
    const brutto = (netto + aufschlagWert) * (1 + mwst / 100);
    /* ===== X84/LV vom Server laden ===== */
    async function loadX84FromProjectLvServer(silent = false) {
        if (!projectKey)
            return;
        try {
            if (!silent) {
                setServerBusy(true);
                setServerStatus("Lade X84/LV…");
            }
            const url = `${PROJECT_LV_API_BASE}/${encodeURIComponent(projectKey)}/lv?page=1&pageSize=2000`;
            const r = await fetch(url, { method: "GET" });
            const j = await r.json().catch(() => null);
            const serverRows = Array.isArray(j?.rows)
                ? j.rows
                : Array.isArray(j?.items)
                    ? j.items
                    : [];
            if (!r.ok || !serverRows.length) {
                if (!silent)
                    setServerStatus("Kein X84/LV Serverstand");
                return;
            }
            const imported = serverRows.map((x) => {
                const ep = Number(x.ep ?? x.einzelpreis ?? x.preis ?? 0);
                const menge = Number(x.menge ?? x.quantity ?? 0);
                const gesamt = Number(x.gesamt ?? x.total ?? x.totalNet ?? ep * menge);
                return {
                    id: String(x.id || crypto.randomUUID()),
                    posNr: String(x.posNr || x.position || x.pos || ""),
                    kurztext: String(x.kurztext || x.text || ""),
                    langtext: String(x.langtext || ""),
                    einheit: String(x.einheit || x.unit || ""),
                    menge,
                    preis: ep,
                    // X84-Angebotsbasis
                    angebotUnitPrice: ep,
                    angebotTotal: gesamt,
                    x84UnitPrice: ep,
                    originalPreKiPrice: ep,
                    rabatt: 0,
                };
            });
            LV.bulkUpsert(imported);
            setRows(imported);
            setServerStatus(`X84/LV geladen · ${imported.length} Positionen`);
            setTimeout(() => setServerStatus(""), 2500);
        }
        catch (e) {
            console.error("[RLC] X84/LV load failed", e);
            if (!silent)
                setServerStatus("X84/LV Laden fehlgeschlagen");
        }
        finally {
            if (!silent)
                setServerBusy(false);
        }
    }
    React.useEffect(() => {
        if (!projectKey)
            return;
        // Nur automatisch laden, wenn noch keine X84-Angebotsbasis vorhanden ist.
        const hasX84 = LV.list().some((r) => Number(r?.angebotUnitPrice || r?.x84UnitPrice || r?.originalPreKiPrice || 0) > 0);
        if (!hasX84) {
            void loadX84FromProjectLvServer(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectKey]);
    /* ===== Server save/load (con fallback locale se route manca) ===== */
    async function saveToProjectServer() {
        if (!projectKey) {
            alert("Kein Projekt gewählt (projectKey fehlt).");
            return;
        }
        try {
            setServerBusy(true);
            setServerStatus("Speichere…");
            const payload = {
                meta: {
                    mwst,
                    aufschlag,
                    kapRabatt,
                    kapMarkup,
                    offerNumber: offer.number,
                    projectKey,
                    savedAt: new Date().toISOString(),
                },
                rows,
                totals: {
                    netto,
                    aufschlagWert,
                    brutto,
                },
            };
            const url = `${API_BASE}/${encodeURIComponent(projectKey)}/ki/save`;
            const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const text = await r.text();
            let j = null;
            try {
                j = JSON.parse(text);
            }
            catch {
                j = null;
            }
            // 404 = route non esiste -> backup locale
            if (r.status === 404) {
                localStorage.setItem(localBackupKey(projectKey), JSON.stringify(payload));
                setServerStatus("Route fehlt · lokal gesichert");
                alert("Speichern fehlgeschlagen (Server-Route nicht gefunden). Backup lokal ist gespeichert.");
                return;
            }
            if (!r.ok || !j?.ok) {
                console.error("Save failed:", r.status, text);
                // salviamo comunque un backup locale per sicurezza
                localStorage.setItem(localBackupKey(projectKey), JSON.stringify(payload));
                setServerStatus("Fehler · lokal gesichert");
                alert(`Speichern fehlgeschlagen (${r.status}). Backup lokal ist gespeichert.\n${text.slice(0, 400)}`);
                return;
            }
            setServerStatus("Gespeichert");
            setTimeout(() => setServerStatus(""), 2000);
        }
        catch (e) {
            console.error(e);
            // backup locale
            try {
                const payload = {
                    meta: { mwst, aufschlag, kapRabatt, kapMarkup, offerNumber: offer.number, projectKey, savedAt: new Date().toISOString() },
                    rows,
                    totals: { netto, aufschlagWert, brutto },
                };
                localStorage.setItem(localBackupKey(projectKey), JSON.stringify(payload));
            }
            catch { }
            alert("Speichern fehlgeschlagen. Backup lokal ist gespeichert.");
            setServerStatus("Fehler beim Speichern");
        }
        finally {
            setServerBusy(false);
        }
    }
    async function loadFromProjectServer() {
        if (!projectKey) {
            alert("Kein Projekt gewählt (projectKey fehlt).");
            return;
        }
        try {
            setServerBusy(true);
            setServerStatus("Lade…");
            const url = `${API_BASE}/${encodeURIComponent(projectKey)}/ki`;
            const r = await fetch(url, { method: "GET" });
            const text = await r.text();
            let j = null;
            try {
                j = JSON.parse(text);
            }
            catch {
                j = null;
            }
            // 404 -> fallback locale
            if (r.status === 404) {
                const raw = localStorage.getItem(localBackupKey(projectKey));
                if (!raw) {
                    alert("Kein Server-Speicherstand (Route fehlt) und kein lokaler Backup gefunden.");
                    setServerStatus("");
                    return;
                }
                const data = JSON.parse(raw);
                applyLoadedSnapshot(data);
                setServerStatus("Lokal geladen");
                setTimeout(() => setServerStatus(""), 2000);
                alert("Server-Route nicht gefunden. Snapshot wurde aus lokalem Backup geladen.");
                return;
            }
            if (!r.ok || !j?.ok) {
                console.error("Load failed:", r.status, text);
                alert(`Laden fehlgeschlagen (${r.status}).\n${text.slice(0, 400)}`);
                setServerStatus("Fehler beim Laden");
                return;
            }
            if (!j.exists) {
                alert("Kein Server-Speicherstand gefunden.");
                setServerStatus("");
                return;
            }
            applyLoadedSnapshot(j.data || {});
            setServerStatus("Geladen");
            setTimeout(() => setServerStatus(""), 2000);
        }
        catch (e) {
            console.error(e);
            alert("Laden fehlgeschlagen.");
            setServerStatus("Fehler beim Laden");
        }
        finally {
            setServerBusy(false);
        }
    }
    function applyLoadedSnapshot(data) {
        const loadedRows = Array.isArray(data.rows) ? data.rows : [];
        if (loadedRows.length) {
            setRows(loadedRows);
            LV.bulkUpsert(loadedRows);
        }
        const meta = data.meta || {};
        if (typeof meta.mwst === "number")
            setMwst(meta.mwst);
        if (typeof meta.aufschlag === "number")
            setAufschlag(meta.aufschlag);
        if (meta.kapRabatt && typeof meta.kapRabatt === "object")
            setKapRabatt(meta.kapRabatt);
        if (meta.kapMarkup && typeof meta.kapMarkup === "object")
            setKapMarkup(meta.kapMarkup);
        if (typeof meta.offerNumber === "string" && meta.offerNumber)
            setOffer((o) => ({ ...o, number: meta.offerNumber }));
    }
    /* ===== Azioni ===== */
    async function calcAll() {
        const updated = [];
        for (const r of rows) {
            const res = await suggest(r.kurztext, r.einheit);
            updated.push({ ...r, preis: res.unitPrice, confidence: res.confidence });
        }
        setRows(updated);
        LV.bulkUpsert(updated);
    }
    const addRow = () => {
        const n = { id: crypto.randomUUID(), posNr: "", kurztext: "", einheit: "", menge: 0, rabatt: 0 };
        const next = [n, ...rows];
        setRows(next);
        LV.bulkUpsert(next);
    };
    const delRow = (id) => {
        const next = rows.filter((r) => r.id !== id);
        setRows(next);
        LV.remove(id);
    };
    const update = (id, patch) => {
        const next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
        setRows(next);
        const row = next.find((r) => r.id === id);
        LV.upsert(row);
    };
    /* ===== Render ===== */
    return (_jsxs("div", { style: { display: "grid", gridTemplateRows: "auto auto auto auto 1fr auto auto auto auto", gap: 12, padding: 12 }, children: [_jsxs("div", { className: "card", style: { padding: "10px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, alignItems: "center" }, children: [_jsx("img", { src: company.logoUrl, alt: "Logo", style: { height: 50, objectFit: "contain" } }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 800 }, children: company.name }), _jsx("div", { style: { opacity: 0.8, fontSize: 13 }, children: company.address }), _jsxs("div", { style: { opacity: 0.8, fontSize: 13 }, children: [company.phone, " \u00B7 ", company.email] })] })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "100px 1fr 100px 1fr", gap: 8, alignItems: "center" }, children: [_jsx("label", { style: lbl, children: "Angebot Nr." }), _jsx("input", { style: inp, value: offer.number, onChange: (e) => setOffer({ ...offer, number: e.target.value }) }), _jsx("label", { style: lbl, children: "Ort" }), _jsx("input", { style: inp, value: offer.place, onChange: (e) => setOffer({ ...offer, place: e.target.value }) }), _jsx("label", { style: lbl, children: "Watermark" }), _jsxs("label", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("input", { type: "checkbox", checked: watermark, onChange: (e) => setWatermark(e.target.checked) }), " Powered by OpenAI"] }), _jsx("label", { style: lbl, children: "PDF Farben" }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("input", { type: "color", onChange: (e) => setPdfColors((c) => ({ ...c, head: hexToRgb(e.target.value) })) }), _jsx("span", { style: { opacity: 0.7, fontSize: 12 }, children: "Tabellenkopf" }), _jsx("input", { type: "color", onChange: (e) => setPdfColors((c) => ({ ...c, chap: hexToRgb(e.target.value) })) }), _jsx("span", { style: { opacity: 0.7, fontSize: 12 }, children: "Kapitel-Zeile" })] })] })] }), _jsxs("div", { className: "card", style: { padding: "10px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: "Kunde" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "90px 1fr", gap: 8 }, children: [_jsx("label", { style: lbl, children: "Firma" }), _jsx("input", { style: inp, value: client.name, onChange: (e) => setClient({ ...client, name: e.target.value }) }), _jsx("label", { style: lbl, children: "Adresse" }), _jsx("input", { style: inp, value: client.address, onChange: (e) => setClient({ ...client, address: e.target.value }) })] })] }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: "Zahlung / Notizen" }), _jsx("textarea", { style: { ...inp, minHeight: 64 }, value: offer.notes, onChange: (e) => setOffer({ ...offer, notes: e.target.value }) })] })] }), _jsxs("div", { className: "card", style: { display: "flex", alignItems: "center", gap: 12, padding: "10px 16px" }, children: [_jsx("div", { style: { fontWeight: 700, fontSize: 16 }, children: "Kalkulation mit KI \u2013 Powered by OpenAI" }), _jsxs("div", { style: { marginLeft: 10, opacity: 0.7, fontSize: 12 }, children: ["Projekt: ", _jsx("b", { children: projectKey || "—" }), serverStatus ? _jsxs("span", { style: { marginLeft: 10 }, children: ["\u00B7 ", serverStatus] }) : null] }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { className: "btn", onClick: addRow, children: "+ Position" }), _jsx("button", { className: "btn", onClick: calcAll, disabled: loading || rows.length === 0, children: loading ? "Berechne…" : "KI-Kalkulation starten" }), _jsx("button", { className: "btn", onClick: saveToProjectServer, disabled: serverBusy || !projectKey, children: "Speichern (Server)" }), _jsx("button", { className: "btn", onClick: loadFromProjectServer, disabled: serverBusy || !projectKey, children: "Laden (Server)" }), _jsx("button", { className: "btn", onClick: () => loadX84FromProjectLvServer(false), disabled: serverBusy || !projectKey, children: "X84/LV laden" })] }), _jsxs("div", { className: "card", style: { padding: "10px 16px", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }, children: [_jsxs(Kpi, { title: "Qualit\u00E4t (avg. Confidence)", children: [_jsx(ProgressBar, { value: avgConfidence * 100 }), _jsxs("small", { style: { opacity: 0.8 }, children: ["\u00D8 ", (avgConfidence * 100).toFixed(0), "%"] })] }), _jsxs(Kpi, { title: "Abdeckung (KI-Preis)", children: [_jsx(ProgressBar, { value: coverage.pct }), _jsxs("small", { style: { opacity: 0.8 }, children: [coverage.priced, "/", coverage.total, " Pos. (", coverage.pct, "%)"] })] }), _jsx(Kpi, { title: "Gesamt netto", children: _jsxs("div", { style: { fontWeight: 700, fontSize: 16 }, children: [netto.toFixed(2), " \u20AC"] }) }), _jsx(Kpi, { title: "Gesamt brutto (inkl. Aufschlag & MwSt)", children: _jsxs("div", { style: { fontWeight: 700, fontSize: 16 }, children: [brutto.toFixed(2), " \u20AC"] }) })] }), _jsxs("div", { className: "card", style: { padding: "10px 16px" }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Kapitel: Rabatt & Markup (%)" }), _jsxs("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" }, children: [Array.from(chapters.keys()).map((ch) => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("div", { style: { width: 26, textAlign: "center", fontWeight: 700 }, children: ch }), _jsx("span", { style: { opacity: 0.7 }, children: "Rabatt" }), _jsx("input", { type: "number", style: { ...inp, width: 70 }, value: kapRabatt[ch] ?? 0, onChange: (e) => setKapRabatt({ ...kapRabatt, [ch]: +e.target.value }) }), "%", _jsx("span", { style: { opacity: 0.7 }, children: "Markup" }), _jsx("input", { type: "number", style: { ...inp, width: 70 }, value: kapMarkup[ch] ?? 0, onChange: (e) => setKapMarkup({ ...kapMarkup, [ch]: +e.target.value }) }), "%", _jsxs("div", { style: { opacity: 0.7, fontSize: 12 }, children: ["\u03A3: ", (kapTotals[ch]?.sumFinalKap ?? 0).toFixed(2), " \u20AC"] })] }, ch))), chapters.size === 0 && _jsx("div", { style: { opacity: 0.6 }, children: "Noch keine Kapitel." })] })] }), _jsx("div", { className: "card", style: { overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: th, children: "Kap." }), _jsx("th", { style: th, children: "Pos-Nr" }), _jsx("th", { style: th, children: "Kurztext" }), _jsx("th", { style: th, children: "Einheit" }), _jsx("th", { style: th, children: "Menge" }), _jsx("th", { style: th, children: "KI-Preis [\u20AC]" }), _jsx("th", { style: th, children: "Rabatt %" }), _jsx("th", { style: th, children: "Zeilen-\u20AC (netto)" }), _jsx("th", { style: th, children: "Confidence" }), _jsx("th", { style: th })] }) }), _jsxs("tbody", { children: [Array.from(chapters.entries()).map(([ch, list]) => (_jsxs(React.Fragment, { children: [_jsx("tr", { children: _jsxs("td", { style: { ...td, background: "#f5f7fb", fontWeight: 700 }, colSpan: 10, children: ["Kapitel ", ch, " \u00B7 Rabatt: ", kapTotals[ch]?.rabattKap ?? 0, "% \u00B7 Markup: ", kapTotals[ch]?.markupKap ?? 0, "% \u00B7 \u03A3 Roh:", " ", (kapTotals[ch]?.sumRaw ?? 0).toFixed(2), " \u20AC \u00B7 \u03A3 nach Zeilenrabatt: ", (kapTotals[ch]?.sumAfterLineDisc ?? 0).toFixed(2), " \u20AC \u00B7 \u03A3 nach Kap.-Rabatt: ", (kapTotals[ch]?.sumAfterKap ?? 0).toFixed(2), " \u20AC \u00B7 \u03A3 Kapitel (final):", " ", (kapTotals[ch]?.sumFinalKap ?? 0).toFixed(2), " \u20AC"] }) }), list.map((r) => {
                                            const status = r.confidence != null ? (r.confidence > 0.85 ? "ok" : r.confidence > 0.65 ? "warn" : "low") : undefined;
                                            const raw = lineRaw(r);
                                            const afterLine = lineAfterLineDiscount(r);
                                            return (_jsxs("tr", { style: {
                                                    background: status === "ok" ? "#e7f9ee" : status === "warn" ? "#fff7e0" : status === "low" ? "#fde8e8" : undefined,
                                                }, children: [_jsx("td", { style: td, title: "Kapitel", children: ch }), _jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: 90 }, value: r.posNr, onChange: (e) => update(r.id, { posNr: e.target.value }) }) }), _jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: "100%" }, value: r.kurztext, onChange: (e) => update(r.id, { kurztext: e.target.value }) }) }), _jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: 60 }, value: r.einheit, onChange: (e) => update(r.id, { einheit: e.target.value }) }) }), _jsx("td", { style: td, children: _jsx("input", { style: { ...inp, width: 80, textAlign: "right" }, type: "number", value: r.menge, onChange: (e) => update(r.id, { menge: +e.target.value }) }) }), _jsx("td", { style: td, children: r.preis?.toFixed(2) ?? "—" }), _jsx("td", { style: td, children: _jsx("input", { type: "number", style: { ...inp, width: 80 }, value: r.rabatt ?? 0, onChange: (e) => update(r.id, { rabatt: +e.target.value }) }) }), _jsxs("td", { style: td, children: [afterLine.toFixed(2), " \u20AC ", _jsxs("span", { style: { opacity: 0.6, fontSize: 12 }, children: ["(", raw.toFixed(2), ")"] })] }), _jsx("td", { style: td, children: r.confidence != null ? (r.confidence * 100).toFixed(0) + " %" : "—" }), _jsx("td", { style: { ...td, whiteSpace: "nowrap" }, children: _jsx("button", { className: "btn", onClick: () => delRow(r.id), children: "L\u00F6schen" }) })] }, r.id));
                                        })] }, ch))), rows.length === 0 && (_jsx("tr", { children: _jsx("td", { style: { ...td, opacity: 0.6 }, colSpan: 10, children: "Keine Positionen." }) }))] })] }) }), _jsxs("div", { className: "card", style: { padding: "10px 16px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("button", { className: "btn", onClick: () => download("text/csv;charset=utf-8", "lv.csv", LV.exportCSV(rows)), children: "Export CSV" }), _jsx("button", { className: "btn", onClick: () => pickFile(async (f) => {
                            const n = LV.importCSV(await f.text());
                            alert(`Importiert: ${n} Positionen`);
                            setRows(LV.list());
                        }), children: "Import CSV" }), _jsx("button", { className: "btn", onClick: () => exportXLSX({ rows, kapRabatt, kapMarkup, kapTotals, netto, aufschlag, mwst, brutto, company, client, offer }), children: "Export XLSX" })] }), _jsxs("div", { className: "card", style: { padding: "10px 16px", display: "flex", alignItems: "center", gap: 16 }, children: [_jsx("div", { style: { fontWeight: 700 }, children: "Aufschlag / Gewinn:" }), _jsx("input", { type: "number", style: { ...inp, width: 80 }, value: aufschlag, onChange: (e) => setAufschlag(+e.target.value) }), " %", _jsx("div", { style: { fontWeight: 700, marginLeft: 20 }, children: "MwSt:" }), _jsx("input", { type: "number", style: { ...inp, width: 80 }, value: mwst, onChange: (e) => setMwst(+e.target.value) }), " %", _jsx("div", { style: { flex: 1 } }), _jsxs("div", { style: { fontWeight: 700, fontSize: 16 }, children: ["Gesamt Brutto: ", brutto.toFixed(2), " \u20AC"] })] }), _jsxs("div", { className: "card", style: { padding: "10px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }, children: [_jsxs("div", { children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, alignItems: "center", marginBottom: 6 }, children: [_jsx("label", { style: lbl, children: "Bauleiter (Name)" }), _jsx("input", { style: inp, value: bauleiterName, onChange: (e) => setBauleiterName(e.target.value) })] }), _jsx(SignPad, { title: "Unterschrift Bauleiter", onSave: setSigBauleiter })] }), _jsxs("div", { children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, alignItems: "center", marginBottom: 6 }, children: [_jsx("label", { style: lbl, children: "Auftraggeber (Name)" }), _jsx("input", { style: inp, value: auftraggeberName, onChange: (e) => setAuftraggeberName(e.target.value) })] }), _jsx(SignPad, { title: "Unterschrift Auftraggeber", onSave: setSigAuftraggeber })] }), _jsxs("div", { style: { gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }, children: [_jsx("button", { className: "btn", onClick: () => exportPDF({
                                    rows,
                                    kapRabatt,
                                    kapMarkup,
                                    kapTotals,
                                    netto,
                                    aufschlag,
                                    mwst,
                                    brutto,
                                    company,
                                    client,
                                    offer,
                                    watermark,
                                    sigBauleiter,
                                    sigAuftraggeber,
                                    bauleiterName,
                                    auftraggeberName,
                                    pdfColors,
                                }), children: "\uD83D\uDCC4 Angebot (PDF) generieren" }), _jsx("div", { style: { opacity: 0.7, fontSize: 13 }, children: "Mit Logo, QR, digitalen Unterschriften (mit Name+Datum), Kapitel-Zusammenfassung, Wasserzeichen." })] })] }), _jsxs("div", { className: "card", style: { padding: "10px 16px", display: "grid", gridTemplateColumns: "100px 1fr", gap: 8 }, children: [_jsx("label", { style: lbl, children: "An:" }), _jsx("input", { style: inp, placeholder: "kunde@example.com", value: mail.to, onChange: (e) => setMail({ ...mail, to: e.target.value }) }), _jsx("label", { style: lbl, children: "Betreff:" }), _jsx("input", { style: inp, value: mail.subject, onChange: (e) => setMail({ ...mail, subject: e.target.value }) }), _jsx("label", { style: lbl, children: "Nachricht:" }), _jsx("textarea", { style: { ...inp, minHeight: 80 }, value: mail.body, onChange: (e) => setMail({ ...mail, body: e.target.value }) }), _jsx("div", { style: { gridColumn: "1 / -1", display: "flex", gap: 8, marginTop: 6 }, children: _jsx("button", { className: "btn", onClick: () => handleSendEmail({
                                rows,
                                kapRabatt,
                                kapMarkup,
                                kapTotals,
                                netto,
                                aufschlag,
                                mwst,
                                brutto,
                                company,
                                client,
                                offer,
                                watermark,
                                sigBauleiter,
                                sigAuftraggeber,
                                bauleiterName,
                                auftraggeberName,
                                pdfColors,
                                mail,
                            }), children: "\uD83D\uDCE8 Angebot per E-Mail senden" }) })] })] }));
}
/* ===== Helpers Calcolo ===== */
function getChapter(posNr) {
    if (!posNr)
        return "—";
    const m = posNr.match(/^(\d{2})/);
    return m ? m[1] : "—";
}
function lineRaw(r) {
    return (r.menge ?? 0) * (r.preis ?? 0);
}
function lineAfterLineDiscount(r) {
    const raw = lineRaw(r);
    const rab = r.rabatt ?? 0;
    return raw * (1 - rab / 100);
}
/* ===== UI Mini ===== */
function Kpi({ title, children }) {
    return (_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: title }), children] }));
}
function ProgressBar({ value }) {
    const v = Math.max(0, Math.min(100, value || 0));
    return (_jsx("div", { style: { height: 12, border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", background: "#fafafa" }, children: _jsx("div", { style: { width: `${v}%`, height: "100%", transition: "width .3s ease", background: "linear-gradient(90deg,#7bd389,#55c1ff)" } }) }));
}
function pickFile(onPick) {
    const i = document.createElement("input");
    i.type = "file";
    i.onchange = () => {
        const f = i.files?.[0];
        if (f)
            onPick(f);
    };
    i.click();
}
function download(type, name, data) {
    const b = new Blob([data], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}
/* ===== SignPad ===== */
function SignPad({ title, onSave }) {
    const ref = React.useRef(null);
    const [drawing, setDrawing] = React.useState(false);
    const [dirty, setDirty] = React.useState(false);
    React.useEffect(() => {
        const c = ref.current;
        if (!c)
            return;
        const ctx = c.getContext("2d");
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
    }, []);
    const getPos = (e) => {
        const c = ref.current;
        const r = c.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e) => {
        setDrawing(true);
        const ctx = ref.current.getContext("2d");
        const p = getPos(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
        if (!drawing)
            return;
        const ctx = ref.current.getContext("2d");
        const p = getPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        setDirty(true);
    };
    const up = () => {
        setDrawing(false);
    };
    const clear = () => {
        const c = ref.current;
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);
        setDirty(false);
        onSave(null);
    };
    const save = () => {
        const c = ref.current;
        const url = c.toDataURL("image/png");
        onSave(url);
    };
    return (_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: title }), _jsx("div", { style: { border: "1px dashed var(--line)", borderRadius: 8, padding: 8, background: "#fff" }, children: _jsx("canvas", { ref: ref, width: 420, height: 140, style: { width: "100%", height: 140, display: "block", touchAction: "none" }, onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerLeave: up }) }), _jsxs("div", { style: { display: "flex", gap: 8, marginTop: 8 }, children: [_jsx("button", { className: "btn", onClick: clear, disabled: !dirty, children: "L\u00F6schen" }), _jsx("button", { className: "btn", onClick: save, disabled: !dirty, children: "Speichern" })] })] }));
}
/* ===== XLSX EXPORT ===== */
function exportXLSX(opts) {
    const { rows, kapRabatt, kapMarkup, kapTotals, netto, aufschlag, mwst, brutto, company, client, offer } = opts;
    const data1 = [["Kapitel", "Pos-Nr", "Kurztext", "Einheit", "Menge", "E-Preis", "Rabatt %", "Zeilen-€ nach Rabatt", "Confidence %"]];
    for (const r of rows) {
        const ch = getChapter(r.posNr);
        data1.push([
            ch,
            r.posNr,
            r.kurztext,
            r.einheit,
            r.menge,
            r.preis ?? "",
            r.rabatt ?? 0,
            lineAfterLineDiscount(r),
            r.confidence != null ? Math.round(r.confidence * 100) : "",
        ]);
    }
    const ws1 = XLSX.utils.aoa_to_sheet(data1);
    const data2 = [["Kapitel", "Kap.-Rabatt %", "Markup %", "Σ Roh", "Σ n. Zeilenrabatt", "Σ nach Kap.-Rabatt", "Σ Kapitel (final)"]];
    Object.entries(kapTotals).forEach(([ch, t]) => {
        data2.push([ch, kapRabatt[ch] ?? 0, kapMarkup[ch] ?? 0, t.sumRaw, t.sumAfterLineDisc, t.sumAfterKap, t.sumFinalKap]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(data2);
    const aufschlagWert = netto * (aufschlag / 100);
    const steuer = (netto + aufschlagWert) * (mwst / 100);
    const data3 = [
        ["Unternehmen", company.name],
        ["Adresse", company.address],
        ["Angebot Nr.", offer.number],
        ["Kunde", client.name],
        ["Ort", offer.place],
        ["Datum", new Date().toLocaleDateString()],
        [],
        ["Netto", netto],
        ["Aufschlag %", aufschlag],
        ["Aufschlag €", aufschlagWert],
        ["MwSt %", mwst],
        ["MwSt €", steuer],
        ["Brutto", brutto],
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(data3);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "Positionen");
    XLSX.utils.book_append_sheet(wb, ws2, "Kapitel");
    XLSX.utils.book_append_sheet(wb, ws3, "Zusammenfassung");
    const wbout = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Angebot_${offer.number}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
}
/* ===== PDF: build + export ===== */
async function exportPDF(opts) {
    const doc = await buildPdfDoc(opts);
    doc.save(`Angebot_${opts.offer.number}.pdf`);
}
async function buildPdfDoc(opts) {
    const { rows, kapRabatt, kapMarkup, kapTotals, netto, aufschlag, mwst, brutto, company, client, offer, watermark, sigBauleiter, sigAuftraggeber, bauleiterName, auftraggeberName, pdfColors, } = opts;
    const doc = new jsPDF({ compress: true });
    // Logo
    try {
        const img = await loadImage(company.logoUrl);
        doc.addImage(img, "PNG", 155, 10, 40, 15);
    }
    catch { }
    doc.setFontSize(16);
    doc.text("Angebot – KI-Kalkulation", 14, 18);
    doc.setFontSize(10);
    doc.text(`${company.name} · ${company.address} · ${company.phone} · ${company.email}`, 14, 24);
    // Cliente + meta
    doc.setFontSize(11);
    doc.text(`Kunde: ${client.name}`, 14, 32);
    doc.text(client.address, 14, 38);
    doc.text(`Angebot Nr.: ${offer.number}`, 140, 32);
    doc.text(`Ort: ${offer.place}`, 140, 38);
    doc.text(`Datum: ${new Date().toLocaleDateString()}`, 140, 44);
    // Watermark
    if (watermark) {
        doc.saveGraphicsState();
        doc.setGState(new jsPDF.GState({ opacity: 0.08 }));
        doc.setFontSize(50);
        doc.text("Powered by OpenAI", 35, 160, { angle: -30 });
        doc.restoreGraphicsState();
    }
    // Tabella posizioni
    const body = rows.map((r) => [
        getChapter(r.posNr),
        r.posNr || "",
        r.kurztext || "",
        r.einheit || "",
        (r.menge ?? 0).toFixed(2),
        r.preis != null ? r.preis.toFixed(2) : "—",
        (r.rabatt ?? 0).toFixed(1) + "%",
        lineAfterLineDiscount(r).toFixed(2) + " €",
        r.confidence != null ? Math.round(r.confidence * 100) + "%" : "—",
    ]);
    doc.autoTable({
        head: [["Kap.", "Pos.-Nr", "Kurztext", "Einheit", "Menge", "E-Preis [€]", "Zeilenrabatt", "Zeilen € n. Rabatt", "KI-Conf."]],
        body,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: pdfColors.head, textColor: 255 },
        startY: 52,
        margin: { left: 14, right: 14 },
    });
    // Riepilogo capitoli
    const y = doc.lastAutoTable.finalY + 6;
    const kapRows = Object.entries(kapTotals).map(([ch, t]) => [
        ch,
        (kapRabatt[ch] ?? 0) + " %",
        t.sumRaw.toFixed(2) + " €",
        t.sumAfterLineDisc.toFixed(2) + " €",
        "nach Kap.-Rabatt: " + t.sumAfterKap.toFixed(2) + " €",
        "Markup " + (t.markupKap ?? 0) + "% → " + t.sumFinalKap.toFixed(2) + " €",
    ]);
    doc.autoTable({
        head: [["Kapitel", "Kap.-Rabatt", "Σ Roh", "Σ n. Zeilenrabatt", "Σ nach Kap.-Rabatt", "Σ Kapitel (final)"]],
        body: kapRows,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: pdfColors.chap },
        startY: y,
        margin: { left: 14, right: 14 },
    });
    // Totali
    const y2 = doc.lastAutoTable.finalY + 8;
    const aufschlagWert = netto * (aufschlag / 100);
    const steuer = (netto + aufschlagWert) * (mwst / 100);
    doc.setFontSize(12);
    doc.text("Zusammenfassung:", 14, y2);
    doc.setFontSize(11);
    doc.text(`Nettosumme: ${netto.toFixed(2)} €`, 20, y2 + 8);
    doc.text(`Aufschlag (${aufschlag}%): ${aufschlagWert.toFixed(2)} €`, 20, y2 + 16);
    doc.text(`MwSt (${mwst}%): ${steuer.toFixed(2)} €`, 20, y2 + 24);
    doc.setFont(undefined, "bold");
    doc.text(`Bruttosumme: ${brutto.toFixed(2)} €`, 20, y2 + 34);
    doc.setFont(undefined, "normal");
    // Note
    const y3 = y2 + 44;
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(`Hinweise / Bedingungen: ${offer.notes}`, 180), 14, y3);
    // QR
    const qrData = JSON.stringify({
        nr: offer.number,
        sum: brutto.toFixed(2),
        company: company.name,
        client: client.name,
        date: new Date().toISOString(),
    });
    const qr = await QRCode.toDataURL(qrData, { width: 90 });
    doc.addImage(qr, "PNG", 160, y2 - 2, 30, 30);
    // Firme
    const sigY = y3 + 28;
    const today = new Date().toLocaleDateString();
    doc.setFontSize(11);
    if (sigBauleiter) {
        try {
            doc.addImage(sigBauleiter, "PNG", 20, sigY - 22, 60, 22);
        }
        catch { }
    }
    else {
        doc.text("_____________________________", 20, sigY);
    }
    doc.text(`Bauleiter: ${bauleiterName}`, 20, sigY + 8);
    doc.text(`Datum: ${today}`, 20, sigY + 14);
    if (sigAuftraggeber) {
        try {
            doc.addImage(sigAuftraggeber, "PNG", 120, sigY - 22, 60, 22);
        }
        catch { }
    }
    else {
        doc.text("_____________________________", 120, sigY);
    }
    doc.text(`Auftraggeber: ${auftraggeberName}`, 120, sigY + 8);
    doc.text(`Datum: ${today}`, 120, sigY + 14);
    doc.text(`Ort: ${offer.place}`, 20, sigY + 24);
    addPageNumbers(doc, (page, total) => `Seite ${page} / ${total}  ·  © ${new Date().getFullYear()} ${company.name}`);
    return doc;
}
/* ===== EMAIL ===== */
async function handleSendEmail(all) {
    const { mail } = all;
    if (!mail.to) {
        alert("Bitte Empfänger-E-Mail angeben.");
        return;
    }
    const pdfBase64 = await generatePdfBase64(all);
    const res = await fetch("/api/mail/send-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to: mail.to,
            subject: mail.subject,
            html: mail.body.replace(/\n/g, "<br/>"),
            pdfBase64,
            fileName: `Angebot_${all.offer.number}.pdf`,
        }),
    });
    if (!res.ok) {
        alert("Fehler beim Senden: " + (await res.text()));
        return;
    }
    alert("E-Mail gesendet.");
}
async function generatePdfBase64(all) {
    const doc = await buildPdfDoc(all);
    const out = doc.output("datauristring");
    return out.split(",")[1];
}
/* ===== UTILS PDF ===== */
function addPageNumbers(doc, textFor) {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.text(textFor(i, pageCount), 14, 295);
    }
}
async function loadImage(src) {
    return new Promise((res, rej) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = src;
    });
}
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
}
