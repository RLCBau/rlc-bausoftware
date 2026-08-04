import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/KalkulationsDatenbankPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LV } from "./store.lv";
import { useProject } from "../../store/useProject";
import { KalkulationsDatenbank } from "./kalkulationsDatenbank";
/* ================= CONSTANTS ================= */
const QUELLEN = [
    "alle",
    "manual",
    "ki",
    "rezept",
    "lv",
    "import",
    "nachtrag",
    "server"
];
const DB_LOAD_LIMIT = 200;
const DB_TABLE_LIMIT = 10;
const RISIKEN = [
    "alle",
    "niedrig",
    "mittel",
    "hoch",
    "kritisch"
];
const RESSOURCEN_TYPEN = [
    "personal",
    "maschine",
    "material",
    "fremdleistung",
    "entsorgung",
    "sonstiges"
];
/* ================= HELPERS ================= */
function safeId() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `kdb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
function n(value, fallback = 0) {
    if (value === null || value === undefined || value === "")
        return fallback;
    const raw = String(value).
        trim().
        replace(/\s/g, "").
        replace(/\.(?=\d{3}(?:[.,]|$))/g, "").
        replace(",", ".");
    const parsed = typeof value === "number" ? value : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function money(value) {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR"
    }).format(n(value));
}
function num(value, digits = 2) {
    return new Intl.NumberFormat("de-DE", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(n(value));
}
function fmtDate(value) {
    if (!value)
        return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
        return "—";
    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(d);
}
function percent(value) {
    return `${Math.round(n(value) * 100)} %`;
}
function norm(value) {
    return String(value ?? "").toLowerCase().trim();
}
function downloadText(text, filename, type = "text/plain;charset=utf-8") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
function getProject(projectCtx) {
    const p = projectCtx?.project ||
        projectCtx?.currentProject ||
        projectCtx?.selectedProject ||
        projectCtx?.current ||
        projectCtx;
    if (!p || typeof p !== "object")
        return null;
    return p;
}
function getProjectCode(project) {
    return String(project?.code ||
        project?.number ||
        project?.projektnummer ||
        project?.id ||
        "").trim();
}
function getProjectName(project) {
    return String(project?.name || project?.projectName || "").trim();
}
function quelleLabel(q) {
    if (q === "ki")
        return "KI";
    if (q === "manual")
        return "Manuell";
    if (q === "rezept")
        return "Rezept";
    if (q === "lv")
        return "LV";
    if (q === "import")
        return "Import";
    if (q === "nachtrag")
        return "Nachtrag";
    if (q === "server")
        return "Server";
    return q;
}
function risikoLabel(r) {
    if (r === "niedrig")
        return "Niedrig";
    if (r === "mittel")
        return "Mittel";
    if (r === "hoch")
        return "Hoch";
    if (r === "kritisch")
        return "Kritisch";
    return r;
}
function resourceTotal(r) {
    return round2(n(r.menge) * n(r.einzelpreis));
}
function normalizeResource(r) {
    return {
        id: String(r.id || safeId()),
        typ: r.typ || "sonstiges",
        bezeichnung: String(r.bezeichnung || ""),
        kurztext: String(r.kurztext || ""),
        beschreibung: String(r.beschreibung || ""),
        einheit: String(r.einheit || ""),
        menge: n(r.menge),
        einzelpreis: n(r.einzelpreis),
        gesamtpreis: resourceTotal(r),
        leistungswert: r.leistungswert === undefined ? undefined : n(r.leistungswert),
        leistungsEinheit: String(r.leistungsEinheit || ""),
        bemerkung: String(r.bemerkung || "")
    };
}
function emptyKosten() {
    return {
        material: 0,
        lohn: 0,
        maschinen: 0,
        fremdleistung: 0,
        entsorgung: 0,
        transport: 0,
        gemeinkosten: 0,
        risiko: 0,
        gewinn: 0,
        epNetto: 0,
        gpNetto: 0
    };
}
function entryDirectCost(entry) {
    const k = entry.kosten || emptyKosten();
    const kostenSum = n(k.material) +
        n(k.lohn) +
        n(k.maschinen) +
        n(k.fremdleistung) +
        n(k.entsorgung) +
        n(k.transport) +
        n(k.gemeinkosten) +
        n(k.risiko) +
        n(k.gewinn);
    if (kostenSum > 0)
        return round2(kostenSum);
    const resSum = (entry.ressourcen || []).reduce((sum, r) => sum + n(r.gesamtpreis, n(r.menge) * n(r.einzelpreis)), 0);
    return round2(resSum);
}
function entryEp(entry) {
    const ep = n(entry.kosten?.epNetto);
    if (ep > 0)
        return ep;
    const gp = n(entry.kosten?.gpNetto);
    const menge = n(entry.menge);
    if (gp > 0 && menge > 0)
        return round2(gp / menge);
    const direct = entryDirectCost(entry);
    if (direct > 0 && menge > 0)
        return round2(direct / menge);
    return 0;
}
function entryGp(entry) {
    const gp = n(entry.kosten?.gpNetto);
    if (gp > 0)
        return gp;
    const ep = entryEp(entry);
    const menge = n(entry.menge);
    if (ep > 0 && menge > 0)
        return round2(ep * menge);
    return 0;
}
function toLvPos(entry) {
    return {
        id: safeId(),
        posNr: entry.posNr,
        kurztext: entry.kurztext,
        langtext: entry.langtext,
        einheit: entry.einheit,
        menge: entry.menge,
        preis: entryEp(entry),
        gesamt: entryGp(entry),
        waehrung: "EUR",
        confidence: entry.confidence,
        source: "manual",
        updatedAt: new Date().toISOString()
    };
}
function emptyEntry(projectCode, projectName) {
    return KalkulationsDatenbank.upsert({
        id: safeId(),
        quelle: "manual",
        projektCode: projectCode,
        projektName: projectName,
        posNr: "",
        kurztext: "",
        langtext: "",
        einheit: "m",
        menge: 0,
        parameter: {
            gewerk: "",
            leistungsart: "",
            bauverfahren: "",
            menge: 0,
            einheit: "m",
            baustellenEntfernungKm: 0,
            fahrzeitMin: 0,
            transportNotwendig: false,
            innerorts: false,
            beengterArbeitsraum: false,
            grundwasser: false,
            verkehrssicherung: false,
            handarbeit: false,
            nachtarbeit: false,
            erschwerteBedingungen: false
        },
        ressourcen: [],
        kosten: emptyKosten(),
        risiko: "mittel",
        confidence: 0.75,
        kiHinweis: "",
        kalkulatorNotiz: "",
        tags: [],
        verwendungen: 0
    });
}
function lvToEntry(row, projektCode, projektName) {
    return KalkulationsDatenbank.fromCalculatedPosition({
        quelle: "lv",
        projektCode,
        projektName,
        posNr: row.posNr || "",
        kurztext: row.kurztext || "",
        langtext: row.langtext || "",
        einheit: row.einheit || "",
        menge: n(row.menge),
        finalUnitPrice: n(row.preis),
        totalNet: n(row.gesamt, n(row.menge) * n(row.preis)),
        confidence: n(row.confidence, 0.6)
    });
}
function riskStyle(risiko) {
    if (risiko === "niedrig")
        return badgeOk;
    if (risiko === "mittel")
        return badgeWarn;
    if (risiko === "hoch")
        return badgeCritical;
    if (risiko === "kritisch")
        return badgeCriticalDark;
    return badgeNeutral;
}
async function tryServerList() {
    const api = KalkulationsDatenbank;
    if (typeof api.listServer !== "function") {
        return null;
    }
    try {
        const rows = await api.listServer();
        return Array.isArray(rows) ? rows : null;
    }
    catch (e) {
        return null;
    }
}
async function tryServerBulkUpsert(rows) {
    const api = KalkulationsDatenbank;
    if (typeof api.bulkUpsertServer !== "function")
        return;
    try {
        await api.bulkUpsertServer(rows);
    }
    catch {
        // local fallback bleibt aktiv
    }
}
async function tryServerRemove(id) {
    const api = KalkulationsDatenbank;
    if (typeof api.removeServer !== "function")
        return;
    try {
        await api.removeServer(id);
    }
    catch {
        // local fallback bleibt aktiv
    }
}
/* ================= GLOBAL KI / DATENBANK COMMANDS ================= */
function textForUnit(entry) {
    return norm(`${entry.kurztext || ""} ${entry.langtext || ""} ${entry.parameter?.leistungsart || ""}`);
}
function suggestUnit(entry) {
    const current = String(entry.einheit || "").trim();
    if (current)
        return current;
    const text = textForUnit(entry);
    if (text.includes("aushub") ||
        text.includes("graben") ||
        text.includes("boden") ||
        text.includes("verfull") ||
        text.includes("verfüll") ||
        text.includes("kies") ||
        text.includes("schotter") ||
        text.includes("beton"))
        return "m³";
    if (text.includes("pflaster") ||
        text.includes("asphalt") ||
        text.includes("fläche") ||
        text.includes("flache") ||
        text.includes("tragschicht") ||
        text.includes("deckschicht"))
        return "m²";
    if (text.includes("rohr") ||
        text.includes("leitung") ||
        text.includes("kabel") ||
        text.includes("speedpipe") ||
        text.includes("trasse"))
        return "m";
    if (text.includes("abfuhr") ||
        text.includes("entsorgung") ||
        text.includes("deponie"))
        return "t";
    if (text.includes("schacht") ||
        text.includes("bogen") ||
        text.includes("abzweig") ||
        text.includes("anschluss") ||
        text.includes("stück") ||
        text.includes("stk"))
        return "Stk";
    return "";
}
function kostenSum(k) {
    return round2(n(k?.material) +
        n(k?.lohn) +
        n(k?.maschinen) +
        n(k?.fremdleistung) +
        n(k?.entsorgung) +
        n(k?.transport) +
        n(k?.gemeinkosten) +
        n(k?.risiko) +
        n(k?.gewinn));
}
function resourcesToKosten(resources, menge, old) {
    const qty = Math.max(n(menge), 1);
    const unit = {
        material: 0,
        lohn: 0,
        maschinen: 0,
        fremdleistung: 0,
        entsorgung: 0,
        transport: 0,
        gemeinkosten: 0,
        risiko: n(old?.risiko),
        gewinn: n(old?.gewinn)
    };
    for (const r of resources) {
        const value = n(r.einzelpreis) || n(r.gesamtpreis);
        if (r.typ === "material")
            unit.material += value;
        else if (r.typ === "personal")
            unit.lohn += value;
        else if (r.typ === "maschine")
            unit.maschinen += value;
        else if (r.typ === "fremdleistung")
            unit.fremdleistung += value;
        else if (r.typ === "entsorgung")
            unit.entsorgung += value;
        else if (r.typ === "transport")
            unit.transport += value;
        else
            unit.gemeinkosten += value;
    }
    const epNetto = round2(unit.material +
        unit.lohn +
        unit.maschinen +
        unit.fremdleistung +
        unit.entsorgung +
        unit.transport +
        unit.gemeinkosten +
        unit.risiko +
        unit.gewinn);
    return {
        material: round2(unit.material * qty),
        lohn: round2(unit.lohn * qty),
        maschinen: round2(unit.maschinen * qty),
        fremdleistung: round2(unit.fremdleistung * qty),
        entsorgung: round2(unit.entsorgung * qty),
        transport: round2(unit.transport * qty),
        gemeinkosten: round2(unit.gemeinkosten * qty),
        risiko: round2(unit.risiko * qty),
        gewinn: round2(unit.gewinn * qty),
        epNetto,
        gpNetto: round2(epNetto * qty)
    };
}
function buildResourcesFromKosten(entry) {
    const k = entry.kosten || emptyKosten();
    const qty = Math.max(n(entry.menge), 1);
    const unit = entry.einheit || suggestUnit(entry) || "EH";
    const candidates = [
        { typ: "material", bezeichnung: "Material", einheit: unit, menge: 1, einzelpreis: round2(n(k.material) / qty) },
        { typ: "personal", bezeichnung: "Lohn / Personal", einheit: unit, menge: 1, einzelpreis: round2(n(k.lohn) / qty) },
        { typ: "maschine", bezeichnung: "Maschinen", einheit: unit, menge: 1, einzelpreis: round2(n(k.maschinen) / qty) },
        { typ: "transport", bezeichnung: "Transport", einheit: unit, menge: 1, einzelpreis: round2(n(k.transport) / qty) },
        { typ: "fremdleistung", bezeichnung: "Fremdleistung", einheit: unit, menge: 1, einzelpreis: round2(n(k.fremdleistung) / qty) },
        { typ: "entsorgung", bezeichnung: "Entsorgung", einheit: unit, menge: 1, einzelpreis: round2(n(k.entsorgung) / qty) },
        { typ: "sonstiges", bezeichnung: "Gemeinkosten", einheit: unit, menge: 1, einzelpreis: round2(n(k.gemeinkosten) / qty) },
        { typ: "sonstiges", bezeichnung: "Risiko", einheit: unit, menge: 1, einzelpreis: round2(n(k.risiko) / qty) },
        { typ: "sonstiges", bezeichnung: "Gewinn", einheit: unit, menge: 1, einzelpreis: round2(n(k.gewinn) / qty) }
    ];
    return candidates.
        filter((r) => n(r.einzelpreis) > 0).
        map(normalizeResource);
}
function fallbackResourcesFromEp(entry) {
    const ep = entryEp(entry);
    if (ep <= 0)
        return [];
    const unit = entry.einheit || suggestUnit(entry) || "EH";
    const text = textForUnit(entry);
    let material = 0.28;
    let lohn = 0.34;
    let maschine = 0.18;
    let entsorgung = 0.02;
    let gemeinkosten = 0.08;
    let risiko = 0.03;
    let gewinn = 0.07;
    if (text.includes("aushub") || text.includes("graben") || text.includes("boden")) {
        material = 0.14;
        lohn = 0.28;
        maschine = 0.27;
        entsorgung = 0.10;
        gemeinkosten = 0.09;
        risiko = 0.04;
        gewinn = 0.08;
    }
    if (text.includes("pflaster") || text.includes("asphalt")) {
        material = 0.45;
        lohn = 0.18;
        maschine = 0.14;
        entsorgung = 0.04;
        gemeinkosten = 0.08;
        risiko = 0.03;
        gewinn = 0.08;
    }
    if (text.includes("rohr") || text.includes("leitung") || text.includes("speedpipe") || text.includes("kabel")) {
        material = 0.42;
        lohn = 0.24;
        maschine = 0.11;
        entsorgung = 0.02;
        gemeinkosten = 0.09;
        risiko = 0.04;
        gewinn = 0.08;
    }
    return [
        { typ: "material", bezeichnung: "Materialansatz", einheit: unit, menge: 1, einzelpreis: round2(ep * material) },
        { typ: "personal", bezeichnung: "Lohn / Personal", einheit: unit, menge: 1, einzelpreis: round2(ep * lohn) },
        { typ: "maschine", bezeichnung: "Maschinenansatz", einheit: unit, menge: 1, einzelpreis: round2(ep * maschine) },
        { typ: "entsorgung", bezeichnung: "Entsorgung", einheit: unit, menge: 1, einzelpreis: round2(ep * entsorgung) },
        { typ: "sonstiges", bezeichnung: "Gemeinkosten", einheit: unit, menge: 1, einzelpreis: round2(ep * gemeinkosten) },
        { typ: "sonstiges", bezeichnung: "Risiko", einheit: unit, menge: 1, einzelpreis: round2(ep * risiko) },
        { typ: "sonstiges", bezeichnung: "Gewinn", einheit: unit, menge: 1, einzelpreis: round2(ep * gewinn) }
    ].
        filter((r) => n(r.einzelpreis) > 0).map((r) => normalizeResource(r));
}
function calculateConfidence(entry) {
    let score = 0.35;
    if (String(entry.posNr || "").trim())
        score += 0.06;
    if (String(entry.kurztext || "").trim().length >= 8)
        score += 0.10;
    if (String(entry.langtext || "").trim().length >= 25)
        score += 0.10;
    if (String(entry.einheit || "").trim())
        score += 0.08;
    if (n(entry.menge) > 0)
        score += 0.08;
    if (entryEp(entry) > 0)
        score += 0.12;
    if (entry.ressourcen?.length)
        score += 0.10;
    if (entry.parameter?.gewerk)
        score += 0.05;
    if (entry.parameter?.bauverfahren)
        score += 0.04;
    if (entry.risiko === "hoch")
        score -= 0.05;
    if (entry.risiko === "kritisch")
        score -= 0.10;
    return Math.max(0.2, Math.min(0.99, round2(score)));
}
function dbQualityKey(row) {
    const text = norm(`${row.kurztext || ""} ${row.langtext || ""}`);
    const unit = norm(row.einheit);
    const price = Math.round(entryEp(row) * 100) / 100;
    if (text.length < 8)
        return "";
    return `${text}|${unit}|${price}`;
}
function dbDuplicateIds(rows) {
    const map = new Map();
    for (const row of rows) {
        const key = dbQualityKey(row);
        if (!key)
            continue;
        const list = map.get(key) || [];
        list.push(row);
        map.set(key, list);
    }
    return new Set(Array.from(map.values()).
        filter((g) => g.length > 1).
        flatMap((g) => g.map((x) => x.id)));
}
function dispatchKiProgress(detail) {
    window.dispatchEvent(new CustomEvent("rlc:ki-progress", {
        detail
    }));
}
/* ================= COMPONENT ================= */
export default function KalkulationsDatenbankPage() {
    const navigate = useNavigate();
    const projectCtx = useProject();
    const project = getProject(projectCtx);
    const projectCode = getProjectCode(project);
    const projectName = getProjectName(project);
    const importRef = useRef(null);
    const [rows, setRows] = useState([]);
    const [selectedId, setSelectedId] = useState("");
    const [query, setQuery] = useState("");
    const [quelle, setQuelle] = useState("alle");
    const [risiko, setRisiko] = useState("alle");
    const [gewerk, setGewerk] = useState("alle");
    const [sortKey, setSortKey] = useState("updatedAt");
    const [qualityFilter, setQualityFilter] = useState("alle");
    const [info, setInfo] = useState("");
    const [syncMode, setSyncMode] = useState("local");
    const [serverTotal, setServerTotal] = useState(0);
    const [serverOffset, setServerOffset] = useState(0);
    const [serverLimit, setServerLimit] = useState(DB_LOAD_LIMIT);
    const [serverHasNext, setServerHasNext] = useState(false);
    const [serverHasPrev, setServerHasPrev] = useState(false);
    const [buttonFeedback, setButtonFeedback] = useState("");
    const selected = useMemo(() => rows.find((x) => x.id === selectedId) || rows[0] || null, [rows, selectedId]);
    useEffect(() => {
        if (!selectedId && rows[0]?.id)
            setSelectedId(rows[0].id);
    }, [rows, selectedId]);
    useEffect(() => {
        const t = window.setTimeout(() => {
            const localRows = KalkulationsDatenbank.list().slice(0, DB_LOAD_LIMIT);
            setRows(localRows);
            setSyncMode("local");
            showInfo("Lokale Datenbank geladen. Server-Synchronisierung nur manuell.");
        }, 0);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    function showInfo(message = "") {
        if (!message)
            return;
        setInfo(message);
        window.setTimeout(() => setInfo(""), 2400);
    }
    function refresh(message = "") {
        const next = KalkulationsDatenbank.list();
        setRows(next);
        showInfo(message);
    }
    function handleButtonFeedback(event) {
        const target = event.target;
        const button = target?.closest("button");
        if (!button || button.disabled)
            return;
        const label = String(button.innerText || button.textContent || "Aktion").
            replace(/\s+/g, " ").
            trim();
        setButtonFeedback(label ? `RLC arbeitet: ${label}` : "RLC arbeitet...");
        document.body.style.cursor = "progress";
        window.setTimeout(() => {
            document.body.style.cursor = "";
            setButtonFeedback("");
        }, 1000);
    }
    async function refreshFromServer(message = "", nextOffset = serverOffset) {
        try {
            const page = await KalkulationsDatenbank.listServerPage(DB_LOAD_LIMIT, nextOffset);
            setRows(page.rows);
            setSyncMode("server");
            setServerTotal(page.total);
            setServerOffset(page.offset);
            setServerLimit(page.limit);
            setServerHasNext(page.hasNext);
            setServerHasPrev(page.hasPrev);
            if (page.rows[0]?.id)
                setSelectedId(page.rows[0].id);
            const pageNumber = Math.floor(page.offset / page.limit) + 1;
            const pageCount = Math.max(1, Math.ceil(page.total / page.limit));
            showInfo(message ||
                `Server-Datenbank geladen: ${page.total} Positionen · Seite ${pageNumber} von ${pageCount}`);
            return;
        }
        catch {
            const localRows = KalkulationsDatenbank.list().slice(0, DB_LOAD_LIMIT);
            setRows(localRows);
            setSyncMode("local");
            setServerTotal(localRows.length);
            setServerOffset(0);
            setServerLimit(DB_LOAD_LIMIT);
            setServerHasNext(false);
            setServerHasPrev(false);
            showInfo(message || "Lokale Datenbank geladen. Server nicht erreichbar.");
        }
    }
    const gewerke = useMemo(() => {
        const set = new Set();
        for (const row of rows) {
            const g = String(row.parameter?.gewerk || "").trim();
            if (g)
                set.add(g);
        }
        return ["alle", ...Array.from(set).sort((a, b) => a.localeCompare(b, "de"))];
    }, [rows]);
    function applyDbFilter(nextFilter) {
        setQualityFilter(nextFilter);
        setInfo(`Filter aktiv: ${nextFilter}`);
        window.setTimeout(() => setInfo(""), 2200);
    }
    function suggestUnitForEntry(entry) {
        const current = String(entry.einheit || "").trim();
        if (current)
            return current;
        const text = `${entry.kurztext || ""} ${entry.langtext || ""}`.toLowerCase();
        if (text.includes("aushub") || text.includes("boden") || text.includes("verfüll") || text.includes("verfull") || text.includes("kies") || text.includes("schotter"))
            return "m³";
        if (text.includes("pflaster") || text.includes("asphalt") || text.includes("fläche") || text.includes("flache"))
            return "m²";
        if (text.includes("rohr") || text.includes("leitung") || text.includes("kabel") || text.includes("speedpipe"))
            return "m";
        if (text.includes("abfuhr") || text.includes("entsorgung"))
            return "t";
        if (text.includes("schacht") || text.includes("anschluss") || text.includes("bogen") || text.includes("abzweig"))
            return "St";
        return "St";
    }
    function makeAutoResources(entry) {
        const ep = entryEp(entry);
        const unit = suggestUnitForEntry(entry);
        if (ep <= 0)
            return [];
        const text = `${entry.kurztext || ""} ${entry.langtext || ""}`.toLowerCase();
        let material = 0;
        let lohn = 0;
        let maschine = 0;
        let entsorgung = 0;
        let transport = 0;
        let gemein = 0;
        let risiko = 0;
        let gewinn = 0;
        if (text.includes("aushub") || text.includes("graben") || text.includes("boden")) {
            material = round2(ep * 0.10);
            lohn = round2(ep * 0.28);
            maschine = round2(ep * 0.30);
            entsorgung = round2(ep * 0.12);
            transport = round2(ep * 0.06);
            gemein = round2(ep * 0.06);
            risiko = round2(ep * 0.03);
            gewinn = round2(ep * 0.05);
        }
        else if (text.includes("pflaster") || text.includes("asphalt")) {
            material = round2(ep * 0.45);
            lohn = round2(ep * 0.20);
            maschine = round2(ep * 0.14);
            entsorgung = round2(ep * 0.03);
            gemein = round2(ep * 0.08);
            risiko = round2(ep * 0.03);
            gewinn = round2(ep * 0.07);
        }
        else if (text.includes("rohr") || text.includes("leitung") || text.includes("speedpipe") || text.includes("kabel")) {
            material = round2(ep * 0.42);
            lohn = round2(ep * 0.26);
            maschine = round2(ep * 0.12);
            transport = round2(ep * 0.04);
            gemein = round2(ep * 0.07);
            risiko = round2(ep * 0.03);
            gewinn = round2(ep * 0.06);
        }
        else {
            material = round2(ep * 0.30);
            lohn = round2(ep * 0.30);
            maschine = round2(ep * 0.15);
            gemein = round2(ep * 0.10);
            risiko = round2(ep * 0.05);
            gewinn = round2(ep * 0.10);
        }
        return [
            { id: safeId(), typ: "material", bezeichnung: "Materialansatz", einheit: unit, menge: 1, einzelpreis: material, gesamtpreis: material },
            { id: safeId(), typ: "personal", bezeichnung: "Lohn / Personal", einheit: unit, menge: 1, einzelpreis: lohn, gesamtpreis: lohn },
            { id: safeId(), typ: "maschine", bezeichnung: "Maschinenansatz", einheit: unit, menge: 1, einzelpreis: maschine, gesamtpreis: maschine },
            { id: safeId(), typ: "entsorgung", bezeichnung: "Entsorgung", einheit: unit, menge: 1, einzelpreis: entsorgung, gesamtpreis: entsorgung },
            { id: safeId(), typ: "transport", bezeichnung: "Transport", einheit: unit, menge: 1, einzelpreis: transport, gesamtpreis: transport },
            { id: safeId(), typ: "sonstiges", bezeichnung: "Gemeinkosten", einheit: unit, menge: 1, einzelpreis: gemein, gesamtpreis: gemein },
            { id: safeId(), typ: "sonstiges", bezeichnung: "Risiko", einheit: unit, menge: 1, einzelpreis: risiko, gesamtpreis: risiko },
            { id: safeId(), typ: "sonstiges", bezeichnung: "Gewinn", einheit: unit, menge: 1, einzelpreis: gewinn, gesamtpreis: gewinn }
        ].
            filter((r) => n(r.einzelpreis) > 0).map((r) => normalizeResource(r));
    }
    function applyDbFix(action) {
        const before = rows;
        let changed = 0;
        const report = [];
        const next = before.map((entry) => {
            let updated = entry;
            if (action === "fixEinheiten" && !String(entry.einheit || "").trim()) {
                const unit = suggestUnitForEntry(entry);
                updated = {
                    ...updated,
                    einheit: unit,
                    parameter: {
                        ...updated.parameter,
                        einheit: unit
                    },
                    updatedAt: new Date().toISOString()
                };
                changed += 1;
                report.push(`✓ Pos. ${entry.posNr || "—"} – Einheit ergänzt: leer → ${unit}.`);
            }
            if (action === "fixKostenaufbau" && !entry.ressourcen?.length && entryEp(entry) > 0) {
                const resources = makeAutoResources(entry);
                if (resources.length) {
                    updated = {
                        ...updated,
                        ressourcen: resources,
                        updatedAt: new Date().toISOString()
                    };
                    changed += 1;
                    report.push(`✓ Pos. ${entry.posNr || "—"} – Kostenaufbau automatisch erzeugt.`);
                }
            }
            if (action === "fixEpAusKostenaufbau" && entry.ressourcen?.length) {
                const ep = round2(entry.ressourcen.reduce((sum, r) => sum + n(r.einzelpreis), 0));
                const gp = round2(ep * Math.max(1, n(entry.menge)));
                const oldEp = entryEp(entry);
                if (ep > 0 && Math.abs(ep - oldEp) > 0.009) {
                    updated = {
                        ...updated,
                        kosten: {
                            ...updated.kosten,
                            epNetto: ep,
                            gpNetto: gp
                        },
                        updatedAt: new Date().toISOString()
                    };
                    changed += 1;
                    report.push(`✓ Pos. ${entry.posNr || "—"} – EP geändert: ${money(oldEp)} → ${money(ep)}.`);
                }
            }
            if (action === "recalculateConfidence") {
                const score = (String(updated.kurztext || "").trim() ? 0.18 : 0) + (String(updated.langtext || "").trim() ? 0.16 : 0) + (String(updated.einheit || "").trim() ? 0.12 : 0) + (entryEp(updated) > 0 ? 0.20 : 0) + (updated.ressourcen?.length ? 0.18 : 0) + (n(updated.menge) > 0 ? 0.10 : 0) + (updated.risiko === "niedrig" || updated.risiko === "mittel" ? 0.06 : 0);
                const confidence = Math.max(0.35, Math.min(0.98, round2(score)));
                const oldConfidence = n(updated.confidence);
                if (Math.abs(confidence - oldConfidence) > 0.009) {
                    updated = {
                        ...updated,
                        confidence,
                        updatedAt: new Date().toISOString()
                    };
                    changed += 1;
                    report.push(`✓ Pos. ${entry.posNr || "—"} – Confidence geändert: ${percent(oldConfidence)} → ${percent(confidence)}.`);
                }
            }
            return updated;
        });
        if (changed <= 0) {
            setInfo("Keine passenden Einträge für diese Aktion gefunden.");
            window.dispatchEvent(new CustomEvent("rlc:ki-progress", {
                detail: {
                    running: false,
                    title: "Keine Änderung notwendig",
                    log: ["Keine passenden Einträge gefunden."]
                }
            }));
            return;
        }
        KalkulationsDatenbank.bulkUpsert(next);
        void tryServerBulkUpsert(next);
        setRows(KalkulationsDatenbank.list());
        setInfo(`${changed} Änderung(en) durchgeführt.`);
        window.dispatchEvent(new CustomEvent("rlc:ki-progress", {
            detail: {
                running: false,
                title: "Datenbank-Korrektur abgeschlossen",
                log: report.slice(0, 30)
            }
        }));
        window.setTimeout(() => setInfo(""), 3000);
    }
    const filtered = useMemo(() => {
        const q = norm(query);
        const duplicateIds = qualityFilter === "dubletten" ? dbDuplicateIds(rows) : new Set();
        let out = rows.filter((row) => {
            if (quelle !== "alle" && row.quelle !== quelle)
                return false;
            if (risiko !== "alle" && row.risiko !== risiko)
                return false;
            if (gewerk !== "alle" && row.parameter?.gewerk !== gewerk)
                return false;
            if (qualityFilter !== "alle") {
                const duplicateIds = dbDuplicateIds(rows);
                if (qualityFilter === "epFehlt" && entryEp(row) > 0)
                    return false;
                if (qualityFilter === "einheitFehlt" && String(row.einheit || "").trim())
                    return false;
                if (qualityFilter === "ressourcenFehlen" && row.ressourcen?.length)
                    return false;
                if (qualityFilter === "risikoHoch" && row.risiko !== "hoch" && row.risiko !== "kritisch")
                    return false;
                if (qualityFilter === "confidenceNiedrig" && n(row.confidence) >= 0.7)
                    return false;
                if (qualityFilter === "dubletten" && !duplicateIds.has(row.id))
                    return false;
            }
            if (!q)
                return true;
            const hay = [
                row.projektCode,
                row.projektName,
                row.posNr,
                row.kurztext,
                row.langtext,
                row.einheit,
                row.parameter?.gewerk,
                row.parameter?.leistungsart,
                row.parameter?.bauverfahren,
                row.parameter?.bodenklasse,
                row.kiHinweis,
                row.kalkulatorNotiz,
                Array.isArray(row.tags) ? row.tags.join(" ") : ""
            ].
                join(" ").
                toLowerCase();
            return hay.includes(q);
        });
        out = [...out].sort((a, b) => {
            if (sortKey === "updatedAt") {
                return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
            }
            if (sortKey === "posNr") {
                return a.posNr.localeCompare(b.posNr, "de", {
                    numeric: true,
                    sensitivity: "base"
                });
            }
            if (sortKey === "kurztext") {
                return a.kurztext.localeCompare(b.kurztext, "de", {
                    numeric: true,
                    sensitivity: "base"
                });
            }
            if (sortKey === "epNetto")
                return b.kosten.epNetto - a.kosten.epNetto;
            if (sortKey === "gpNetto")
                return b.kosten.gpNetto - a.kosten.gpNetto;
            if (sortKey === "verwendungen")
                return b.verwendungen - a.verwendungen;
            if (sortKey === "confidence")
                return b.confidence - a.confidence;
            return 0;
        });
        return out;
    }, [rows, query, quelle, risiko, gewerk, sortKey, qualityFilter]);
    const visibleRows = useMemo(() => filtered, [filtered]);
    const stats = useMemo(() => {
        const total = rows.length;
        const used = rows.reduce((s, r) => s + n(r.verwendungen), 0);
        const highRisk = rows.filter((r) => r.risiko === "hoch" || r.risiko === "kritisch").length;
        const confidence = total ?
            rows.reduce((s, r) => s + n(r.confidence), 0) / total :
            0;
        return {
            total,
            filtered: filtered.length,
            used,
            highRisk,
            confidence
        };
    }, [rows, filtered.length]);
    function addEntry() {
        const created = emptyEntry(projectCode, projectName);
        refresh("Neue Kalkulationsposition erstellt.");
        setSelectedId(created.id);
        void tryServerBulkUpsert([created]);
        navigate(`/kalkulation/datenbank/position/${created.id}`);
    }
    function deleteEntry(id) {
        if (!confirm("Diesen Datenbankeintrag wirklich löschen?"))
            return;
        KalkulationsDatenbank.remove(id);
        void tryServerRemove(id);
        refresh("Eintrag gelöscht.");
    }
    function clearAll() {
        if (!confirm("Wirklich die komplette lokale Kalkulationsdatenbank löschen?")) {
            return;
        }
        KalkulationsDatenbank.clear();
        setSelectedId("");
        refresh("Lokale Datenbank gelöscht.");
    }
    function exportJson() {
        downloadText(KalkulationsDatenbank.exportJson(), "RLC_Kalkulationsdatenbank.json", "application/json;charset=utf-8");
    }
    function exportCsv() {
        downloadText(KalkulationsDatenbank.exportCsv(), "RLC_Kalkulationsdatenbank.csv", "text/csv;charset=utf-8");
    }
    function importFromLv() {
        const lvRows = LV.list();
        if (!lvRows.length) {
            alert("Kein LV vorhanden.");
            return;
        }
        const entries = lvRows.map((r) => lvToEntry(r, projectCode, projectName));
        KalkulationsDatenbank.bulkUpsert(entries);
        void tryServerBulkUpsert(entries);
        refresh(`${entries.length.toLocaleString("de-DE")} LV-Positionen übernommen.`);
    }
    function importJsonFile(file) {
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const count = KalkulationsDatenbank.importJson(String(reader.result || ""));
                const imported = KalkulationsDatenbank.list();
                void tryServerBulkUpsert(imported);
                refresh(`${count.toLocaleString("de-DE")} Einträge importiert.`);
            }
            catch (e) {
                alert(`Import fehlgeschlagen: ${e?.message || e}`);
            }
            finally {
                if (importRef.current)
                    importRef.current.value = "";
            }
        };
        reader.readAsText(file, "utf-8");
    }
    function updateSelected(patch) {
        if (!selected)
            return;
        const saved = KalkulationsDatenbank.upsert({
            ...selected,
            ...patch,
            updatedAt: new Date().toISOString()
        });
        setRows(KalkulationsDatenbank.list());
        setSelectedId(saved.id);
        void tryServerBulkUpsert([saved]);
    }
    function updateParameter(patch) {
        if (!selected)
            return;
        updateSelected({
            parameter: {
                ...selected.parameter,
                ...patch
            }
        });
    }
    function updateKosten(patch) {
        if (!selected)
            return;
        const nextKosten = {
            ...selected.kosten,
            ...patch
        };
        const epChanged = Object.prototype.hasOwnProperty.call(patch, "epNetto");
        const gpChanged = Object.prototype.hasOwnProperty.call(patch, "gpNetto");
        if (epChanged && !gpChanged) {
            nextKosten.gpNetto = round2(n(selected.menge) * n(nextKosten.epNetto));
        }
        updateSelected({
            kosten: nextKosten
        });
    }
    function addResource() {
        if (!selected)
            return;
        updateSelected({
            ressourcen: [
                ...selected.ressourcen,
                {
                    id: safeId(),
                    typ: "material",
                    bezeichnung: "",
                    kurztext: "",
                    beschreibung: "",
                    einheit: selected.einheit || "St",
                    menge: 0,
                    einzelpreis: 0,
                    gesamtpreis: 0,
                    leistungswert: undefined,
                    leistungsEinheit: "",
                    bemerkung: ""
                }
            ]
        });
    }
    function updateResource(id, patch) {
        if (!selected)
            return;
        const next = selected.ressourcen.map((r) => {
            if (r.id !== id)
                return r;
            return normalizeResource({
                ...r,
                ...patch
            });
        });
        updateSelected({ ressourcen: next });
    }
    function removeResource(id) {
        if (!selected)
            return;
        updateSelected({
            ressourcen: selected.ressourcen.filter((r) => r.id !== id)
        });
    }
    function copyToLv(entry) {
        LV.upsert(toLvPos(entry));
        KalkulationsDatenbank.markUsed(entry.id);
        const updated = KalkulationsDatenbank.get(entry.id);
        if (updated)
            void tryServerBulkUpsert([updated]);
        refresh("Position wurde ins LV übernommen.");
    }
    useEffect(() => {
        function handleGlobalDatenbankCommand(event) {
            const detail = event.detail;
            if (!detail)
                return;
            const filter = String(detail.filter || "");
            const action = String(detail.action || "");
            if (filter) {
                applyDbFilter(filter);
            }
            if (action) {
                applyDbFix(action);
            }
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        }
        window.addEventListener("rlc:datenbank-command", handleGlobalDatenbankCommand);
        return () => {
            window.removeEventListener("rlc:datenbank-command", handleGlobalDatenbankCommand);
        };
    }, [rows]);
    return (_jsxs("div", { className: rlcClass(null, page), onClickCapture: handleButtonFeedback, children: [buttonFeedback ? _jsx("div", { className: rlcClass(null, actionFeedback), children: buttonFeedback }) : null, _jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC KI \u00B7 Erfahrungsdatenbank" }), _jsx("h1", { className: rlcClass(null, title), children: "KI-Kalkulationsdatenbank" }), _jsx("p", { className: rlcClass(null, subtitle), children: "Zentrale Wissensbasis f\u00FCr kalkulierte Positionen: Personal, Maschinen, Material, Transport, Bauverfahren, Risiken, Erfahrungswerte und EP-Netto f\u00FCr zuk\u00FCnftige KI-Kalkulationen." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: addEntry, children: "Neue Position" }), _jsx("button", { type: "button", className: rlcClass(null, btnPrimary), onClick: () => navigate("/kalkulation/datenbank/preise"), children: "Preise einf\u00FCgen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: importFromLv, children: "Aus LV \u00FCbernehmen" }), _jsxs("div", { className: rlcClass(null, serverPager), children: [_jsx("button", { type: "button", className: rlcClass(null, btnSecondary), disabled: syncMode !== "server" || !serverHasPrev, onClick: () => void refreshFromServer("", Math.max(serverOffset - serverLimit, 0)), children: "\u25C0 Vorherige Seite" }), _jsxs("div", { className: rlcClass(null, serverPagerInfo), children: ["Datenbank-Server: ", serverTotal || rows.length, " Positionen \u00B7 Seite", " ", serverTotal ?
                                                Math.floor(serverOffset / serverLimit) + 1 :
                                                1, " ", "von ", serverTotal ? Math.max(1, Math.ceil(serverTotal / serverLimit)) : 1] }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), disabled: syncMode !== "server" || !serverHasNext, onClick: () => void refreshFromServer("", serverOffset + serverLimit), children: "N\u00E4chste Seite \u25B6" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => void refreshFromServer("Datenbank synchronisiert.", 0), children: "Server verbinden" })] }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: exportCsv, disabled: !rows.length, children: "CSV Export" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: exportJson, disabled: !rows.length, children: "JSON Export" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => importRef.current?.click(), children: "JSON Import" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => navigate("/kalkulation/mit-ki"), children: "Zur KI-Kalkulation" }), _jsx("button", { type: "button", className: rlcClass(null, btnDanger), onClick: clearAll, disabled: !rows.length, children: "Lokal l\u00F6schen" }), _jsx("input", { ref: importRef, type: "file", accept: ".json,application/json", onChange: (e) => importJsonFile(e.target.files?.[0]), className: "rlc-migrated-pages-kalkulation-kalkulationsdatenbankpage-tsx-910" })] }), _jsxs("div", { className: rlcClass(null, heroMeta), children: ["Projekt: ", _jsx("b", { children: projectCode || "—" }), projectName ? _jsxs("span", { children: [" \u00B7 ", projectName] }) : null, _jsxs("span", { children: [" \u00B7 Speicher: ", syncMode === "server" ? "Server + Lokal" : "Lokal"] }), info ? _jsxs("span", { children: [" \u00B7 ", info] }) : null] })] }), _jsxs("section", { className: rlcClass(null, grid6), children: [_jsx(Kpi, { label: "Eintr\u00E4ge", value: String(stats.total), sub: `${stats.filtered} sichtbar` }), _jsx(Kpi, { label: "EP selezionato", value: selected ? money(entryEp(selected)) : "—", sub: selected ? selected.posNr : "nessuna posizione" }), _jsx(Kpi, { label: "GP selezionato", value: selected ? money(entryGp(selected)) : "—", sub: selected ? `${num(selected.menge, 3)} ${selected.einheit}` : "" }), _jsx(Kpi, { label: "Verwendungen", value: String(selected?.verwendungen ?? 0) }), _jsx(Kpi, { label: "Risiko", value: selected ? risikoLabel(selected.risiko) : "—", danger: selected?.risiko === "hoch" || selected?.risiko === "kritisch" }), _jsx(Kpi, { label: "Confidence", value: selected ? percent(selected.confidence) : "—" })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Suche & Filter" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Suche nach Position, Text, Gewerk, Bauverfahren, Bodenklasse, KI-Pr\u00FCfhinweis oder Notiz." })] }) }), _jsxs("div", { className: rlcClass(null, filterGrid), children: [_jsx("input", { className: rlcClass(null, input), value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Intelligente Suche\u2026 PosNr, Kurztext, Langtext, Gewerk, Bauverfahren" }), _jsx("select", { className: rlcClass(null, input), value: quelle, onChange: (e) => setQuelle(e.target.value), children: QUELLEN.map((q) => _jsx("option", { value: q, children: q === "alle" ? "Alle Quellen" : quelleLabel(q) }, q)) }), _jsx("select", { className: rlcClass(null, input), value: risiko, onChange: (e) => setRisiko(e.target.value), children: RISIKEN.map((r) => _jsx("option", { value: r, children: r === "alle" ? "Alle Risiken" : risikoLabel(r) }, r)) }), _jsx("select", { className: rlcClass(null, input), value: gewerk, onChange: (e) => setGewerk(e.target.value), children: gewerke.map((g) => _jsx("option", { value: g, children: g === "alle" ? "Alle Gewerke" : g }, g)) }), _jsxs("select", { className: rlcClass(null, input), value: sortKey, onChange: (e) => setSortKey(e.target.value), children: [_jsx("option", { value: "updatedAt", children: "Sortierung: zuletzt ge\u00E4ndert" }), _jsx("option", { value: "posNr", children: "Sortierung: PosNr" }), _jsx("option", { value: "kurztext", children: "Sortierung: Kurztext" }), _jsx("option", { value: "epNetto", children: "Sortierung: EP netto" }), _jsx("option", { value: "gpNetto", children: "Sortierung: GP netto" }), _jsx("option", { value: "verwendungen", children: "Sortierung: Verwendungen" }), _jsx("option", { value: "confidence", children: "Sortierung: Confidence" })] })] })] }), _jsxs("div", { className: rlcClass(null, qualityBar), children: [_jsx("button", { type: "button", className: rlcClass(null, qualityFilter === "alle" ? btnFilterActive : btnFilter), onClick: () => applyDbFilter("alle"), children: "Alle" }), _jsx("button", { type: "button", className: rlcClass(null, qualityFilter === "epFehlt" ? btnFilterActive : btnFilter), onClick: () => applyDbFilter("epFehlt"), children: "EP fehlt" }), _jsx("button", { type: "button", className: rlcClass(null, qualityFilter === "einheitFehlt" ? btnFilterActive : btnFilter), onClick: () => applyDbFilter("einheitFehlt"), children: "Einheit fehlt" }), _jsx("button", { type: "button", className: rlcClass(null, qualityFilter === "ressourcenFehlen" ? btnFilterActive : btnFilter), onClick: () => applyDbFilter("ressourcenFehlen"), children: "Kostenbestandteile fehlen" }), _jsx("button", { type: "button", className: rlcClass(null, qualityFilter === "risikoHoch" ? btnFilterActive : btnFilter), onClick: () => applyDbFilter("risikoHoch"), children: "Pr\u00FCfung n\u00F6tig" }), _jsx("button", { type: "button", className: rlcClass(null, qualityFilter === "confidenceNiedrig" ? btnFilterActive : btnFilter), onClick: () => applyDbFilter("confidenceNiedrig"), children: "Sicherheit niedrig" }), _jsx("button", { type: "button", className: rlcClass(null, qualityFilter === "dubletten" ? btnFilterActive : btnFilter), onClick: () => applyDbFilter("dubletten"), children: "Doppelte Preise pr\u00FCfen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => applyDbFix("fixEinheiten"), children: "Einheiten automatisch erg\u00E4nzen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => applyDbFix("fixKostenaufbau"), children: "Kostenbestandteile erstellen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => applyDbFix("fixEpAusKostenaufbau"), children: "EP aus Bestandteilen berechnen" }), _jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: () => applyDbFix("recalculateConfidence"), children: "Sicherheit neu bewerten" })] }), _jsx("section", { className: rlcClass(null, mainGrid), children: _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Gespeicherte Kalkulationen" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Jede Position kann wiederverwendet, angepasst oder ins aktuelle LV \u00FCbernommen werden." })] }) }), _jsx("div", { className: rlcClass(null, tableWrap), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "PosNr" }), _jsx("th", { className: rlcClass(null, th), children: "Kurztext" }), _jsx("th", { className: rlcClass(null, th), children: "Projekt" }), _jsx("th", { className: rlcClass(null, th), children: "Gewerk" }), _jsx("th", { className: rlcClass(null, th), children: "ME" }), _jsx("th", { className: rlcClass(null, thRight), children: "Menge" }), _jsx("th", { className: rlcClass(null, thRight), children: "EP netto" }), _jsx("th", { className: rlcClass(null, thRight), children: "GP netto" }), _jsx("th", { className: rlcClass(null, th), children: "Risiko" }), _jsx("th", { className: rlcClass(null, thRight), children: "Conf." }), _jsx("th", { className: rlcClass(null, thRight), children: "Verw." }), _jsx("th", { className: rlcClass(null, th), children: "Aktion" })] }) }), _jsxs("tbody", { children: [visibleRows.map((row, i) => {
                                                const active = selected?.id === row.id;
                                                return (_jsxs("tr", { className: rlcClass(null, {
                                                        background: active ? "#EAF2FF" : i % 2 ? "#FCFCFC" : "#FFFFFF",
                                                        cursor: "pointer"
                                                    }), onClick: () => setSelectedId(row.id), children: [_jsx("td", { className: rlcClass(null, tdStrong), children: row.posNr || "—" }), _jsxs("td", { className: rlcClass(null, tdText), children: [_jsx("b", { children: row.kurztext || "Ohne Kurztext" }), _jsxs("div", { className: rlcClass(null, tiny), children: [quelleLabel(row.quelle), " \u00B7 ", fmtDate(row.updatedAt)] })] }), _jsxs("td", { className: rlcClass(null, tdText), children: [_jsx("b", { children: row.projektCode || projectCode || "—" }), _jsx("div", { className: rlcClass(null, tiny), children: row.projektName || projectName || "Ohne Projektname" })] }), _jsx("td", { className: rlcClass(null, td), children: row.parameter?.gewerk || "—" }), _jsx("td", { className: rlcClass(null, td), children: row.einheit || "—" }), _jsx("td", { className: rlcClass(null, tdRight), children: num(row.menge, 3) }), _jsx("td", { className: rlcClass(null, tdRight), children: money(entryEp(row)) }), _jsx("td", { className: rlcClass(null, tdRight), children: money(entryGp(row)) }), _jsx("td", { className: rlcClass(null, td), children: _jsx("span", { className: rlcClass(null, riskStyle(row.risiko)), children: risikoLabel(row.risiko) }) }), _jsx("td", { className: rlcClass(null, tdRight), children: percent(row.confidence) }), _jsx("td", { className: rlcClass(null, tdRight), children: row.verwendungen }), _jsx("td", { className: rlcClass(null, td), children: _jsxs("div", { className: rlcClass(null, actionCol), children: [_jsx("button", { type: "button", className: rlcClass(null, btnSecondary), onClick: (e) => {
                                                                            e.stopPropagation();
                                                                            navigate(`/kalkulation/datenbank/position/${row.id}`);
                                                                        }, children: "Position bearbeiten" }), _jsx("button", { type: "button", className: rlcClass(null, btnMini), onClick: (e) => {
                                                                            e.stopPropagation();
                                                                            copyToLv(row);
                                                                        }, children: "Ins LV" }), _jsx("button", { type: "button", className: rlcClass(null, btnDangerMini), onClick: (e) => {
                                                                            e.stopPropagation();
                                                                            deleteEntry(row.id);
                                                                        }, children: "L\u00F6schen" })] }) })] }, row.id));
                                            }), !filtered.length ?
                                                _jsx("tr", { children: _jsx("td", { colSpan: 12, className: rlcClass(null, emptyCell), children: "Keine Kalkulationen gefunden. Lege einen Eintrag an oder \u00FCbernimm Positionen aus dem LV / der KI-Kalkulation." }) }) :
                                                null] })] }) })] }) })] }));
}
/* ================= SMALL UI ================= */
function Kpi({ label, value, sub, danger }) {
    return (_jsxs("div", { className: rlcClass(null, kpiCard), children: [_jsx("div", { className: rlcClass(null, kpiLabel), children: label }), _jsx("div", { className: rlcClass(null, { ...kpiValue, color: danger ? "#B91C1C" : "#0F172A" }), children: value }), sub ? _jsx("div", { className: rlcClass(null, kpiSub), children: sub }) : null] }));
}
function Field({ label, children }) {
    return (_jsxs("label", { className: "rlc-migrated-pages-kalkulation-kalkulationsdatenbankpage-tsx-911", children: [_jsx("span", { className: rlcClass(null, labelStyle), children: label }), children] }));
}
function Check({ label, checked, onChange }) {
    return (_jsxs("label", { className: rlcClass(null, checkLabel), children: [_jsx("input", { type: "checkbox", checked: checked, onChange: (e) => onChange(e.target.checked) }), label] }));
}
/* ================= STYLES ================= */
const qualityBar = {
    marginTop: 14,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center"
};
const btnFilter = {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    borderRadius: 999,
    padding: "7px 11px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer"
};
const btnFilterActive = {
    ...btnFilter,
    border: "1px solid #146EF5",
    background: "#EAF2FF",
    color: "#0B5BD3"
};
const serverPager = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 6
};
const serverPagerInfo = {
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#0F172A",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
    fontSize: 13
};
const actionFeedback = {
    position: "sticky",
    top: 0,
    zIndex: 50,
    border: "1px solid #BED6FF",
    background: "#EAF2FF",
    color: "#1E3A8A",
    borderRadius: 14,
    padding: "12px 16px",
    fontWeight: 700,
    boxShadow: "0 10px 24px rgba(15,23,42,0.10)"
};
const page = {
    display: "grid",
    gap: 16,
    padding: 16
};
const heroCard = {
    background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
    color: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
    display: "grid",
    gap: 14,
    boxShadow: "0 16px 40px rgba(15,23,42,0.18)"
};
const eyebrow = {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.8,
    fontWeight: 700
};
const title = {
    margin: "4px 0",
    fontSize: 30,
    fontWeight: 700
};
const subtitle = {
    margin: 0,
    maxWidth: 980,
    opacity: 0.9,
    lineHeight: 1.55
};
const heroActions = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
};
const heroMeta = {
    fontSize: 13,
    opacity: 0.92
};
const grid6 = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
    gap: 12
};
const kpiCard = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const kpiLabel = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em"
};
const kpiValue = {
    marginTop: 6,
    fontSize: 22,
    color: "#0F172A",
    fontWeight: 700
};
const kpiSub = {
    marginTop: 3,
    fontSize: 12,
    color: "#64748B"
};
const card = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const sectionHead = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 12
};
const sectionTitle = {
    margin: 0,
    fontSize: 17,
    color: "#0F172A",
    fontWeight: 700
};
const sectionText = {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
    lineHeight: 1.45
};
const filterGrid = {
    display: "grid",
    gridTemplateColumns: "minmax(260px,1fr) 160px 150px 180px 220px",
    gap: 10
};
const input = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 11px",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
    background: "#FFFFFF"
};
const smallInput = {
    ...input,
    padding: "7px 9px"
};
const mainGrid = {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 16,
    alignItems: "start"
};
const sideCard = {
    ...card,
    position: "sticky",
    top: 12,
    maxHeight: "calc(100vh - 24px)",
    overflow: "auto"
};
const tableWrap = {
    border: "1px solid #E5E7EB",
    borderRadius: 14,
    overflowX: "auto",
    overflowY: "auto",
    maxHeight: 720
};
const table = {
    width: "100%",
    minWidth: 1220,
    borderCollapse: "collapse"
};
const th = {
    textAlign: "left",
    padding: "10px 9px",
    fontSize: 12,
    color: "#475569",
    background: "#F8FAFC",
    borderBottom: "1px solid #E5E7EB",
    whiteSpace: "nowrap",
    fontWeight: 700
};
const thRight = {
    ...th,
    textAlign: "right"
};
const td = {
    padding: "9px",
    fontSize: 12,
    borderBottom: "1px solid #F1F5F9",
    color: "#0F172A",
    verticalAlign: "top"
};
const tdStrong = {
    ...td,
    fontWeight: 700,
    whiteSpace: "nowrap"
};
const tdText = {
    ...td,
    minWidth: 260
};
const tdRight = {
    ...td,
    textAlign: "right",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums"
};
const tiny = {
    marginTop: 3,
    fontSize: 11,
    color: "#64748B",
    fontWeight: 600
};
const actionCol = {
    display: "flex",
    gap: 6,
    flexDirection: "column"
};
const detailStack = {
    display: "grid",
    gap: 14
};
const advancedDetails = {
    border: "1px solid #E5E7EB",
    background: "#F8FAFC",
    borderRadius: 14,
    padding: 14
};
const advancedSummary = {
    cursor: "pointer",
    fontWeight: 700,
    color: "#0B5BD3",
    userSelect: "none"
};
const advancedContent = {
    marginTop: 14,
    display: "grid",
    gap: 16
};
const detailHeader = {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start"
};
const sideTitle = {
    marginTop: 4,
    fontSize: 15,
    fontWeight: 700,
    color: "#0F172A",
    lineHeight: 1.35
};
const formGrid2 = {
    display: "grid",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    gap: 10
};
const formGrid4 = {
    display: "grid",
    gridTemplateColumns: "70px 1fr 1fr 110px",
    gap: 8,
    alignItems: "center"
};
const checkGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    gap: 8
};
const checkLabel = {
    display: "flex",
    gap: 7,
    alignItems: "center",
    fontSize: 12,
    color: "#334155",
    fontWeight: 600
};
const labelStyle = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700
};
const label = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700
};
const subTitle = {
    margin: 0,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: 700
};
const separator = {
    height: 1,
    background: "#E5E7EB"
};
const resourceList = {
    display: "grid",
    gap: 10
};
const resourceBox = {
    border: "1px solid #E5E7EB",
    background: "#F8FAFC",
    borderRadius: 12,
    padding: 10,
    display: "grid",
    gap: 8
};
const resourceTop = {
    display: "flex",
    gap: 8,
    justifyContent: "space-between"
};
const resourceTotalBox = {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    borderRadius: 10,
    padding: "8px 9px",
    fontSize: 12,
    fontWeight: 700,
    textAlign: "right"
};
const footerActions = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap"
};
const emptyCell = {
    padding: 16,
    color: "#64748B",
    fontSize: 13
};
const emptySmall = {
    border: "1px dashed #CBD5E1",
    background: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    color: "#64748B",
    fontSize: 13
};
const btnBase = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 13px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap"
};
const btnPrimary = {
    ...btnBase,
    border: "1px solid #146EF5",
    background: "#146EF5",
    color: "#FFFFFF"
};
const btnSecondary = {
    ...btnBase,
    background: "#FFFFFF",
    color: "#0F172A"
};
const btnDanger = {
    ...btnBase,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C"
};
const btnMini = {
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 8,
    padding: "6px 9px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap"
};
const btnDangerMini = {
    ...btnMini,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C"
};
const badgeNeutral = {
    display: "inline-flex",
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#475569",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 11,
    fontWeight: 700
};
const badgeOk = {
    ...badgeNeutral,
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#15803D"
};
const badgeWarn = {
    ...badgeNeutral,
    border: "1px solid #FDE68A",
    background: "#FFFBEB",
    color: "#B45309"
};
const badgeCritical = {
    ...badgeNeutral,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C"
};
const badgeCriticalDark = {
    ...badgeNeutral,
    border: "1px solid #991B1B",
    background: "#7F1D1D",
    color: "#FFFFFF"
};
