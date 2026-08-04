// apps/web/src/lib/pricing.ts
const KEY = "rlc.kalkulation.preise";
const BACKUP_KEY = "rlc.kalkulation.preise.backup";
const VERSION_KEY = "rlc.kalkulation.preise.version";
const CURRENT_VERSION = "2";
function uid() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `price-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
function nowIso() {
    return new Date().toISOString();
}
function normalizeText(value) {
    return String(value ?? "").trim();
}
function normalizeCurrency(value) {
    const v = normalizeText(value).toUpperCase();
    return v || "EUR";
}
function parseNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "")
        return fallback;
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : fallback;
    }
    const raw = String(value).trim();
    if (!raw)
        return fallback;
    const normalized = raw
        .replace(/\s/g, "")
        .replace(/\.(?=\d{3}(?:[.,]|$))/g, "")
        .replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
}
function roundPrice(value) {
    return Math.round((parseNumber(value, 0) + Number.EPSILON) * 100) / 100;
}
function normalizeUnit(value) {
    const v = normalizeText(value);
    const l = v.toLowerCase();
    if (l === "m2" || l === "qm" || l === "m^2")
        return "m²";
    if (l === "m3" || l === "cbm" || l === "m^3")
        return "m³";
    if (l === "stk" || l === "st" || l === "stück" || l === "stck")
        return "St";
    if (l === "std" || l === "stunden")
        return "h";
    if (l === "to" || l === "tonnen")
        return "t";
    if (l === "pauschal")
        return "PS";
    return v || "St";
}
function normalizeGroup(value) {
    const v = normalizeText(value).toLowerCase();
    if (["material", "materialien", "mat"].includes(v))
        return "Material";
    if (["arbeit", "arbeiter", "lohn", "labor", "personal"].includes(v))
        return "Arbeit";
    if (["maschine", "maschinen", "machine", "gerät", "geraet"].includes(v))
        return "Maschine";
    if (["fremdleistung", "subunternehmer", "subcontractor"].includes(v))
        return "Fremdleistung";
    if (["entsorgung", "deponie", "abfall"].includes(v))
        return "Entsorgung";
    return "Sonstiges";
}
function sanitizeSource(value) {
    const v = normalizeText(value).toLowerCase();
    if (v === "demo" ||
        v === "manual" ||
        v === "csv" ||
        v === "server" ||
        v === "company" ||
        v === "catalog" ||
        v === "unknown") {
        return v;
    }
    return "unknown";
}
function makeRefKey(row) {
    const existing = normalizeText(row.refKey);
    if (existing)
        return existing.toUpperCase();
    const artikelNr = normalizeText(row.artikelNr);
    const group = normalizeGroup(row.gruppe);
    if (!artikelNr)
        return "";
    if (group === "Arbeit")
        return `LABOR:${artikelNr}`.toUpperCase();
    if (group === "Maschine")
        return `MACHINE:${artikelNr}`.toUpperCase();
    if (group === "Material")
        return `MATERIAL:${artikelNr}`.toUpperCase();
    if (group === "Fremdleistung")
        return `SUB:${artikelNr}`.toUpperCase();
    if (group === "Entsorgung")
        return `DISPOSAL:${artikelNr}`.toUpperCase();
    return `OTHER:${artikelNr}`.toUpperCase();
}
export function normalizePriceRow(row) {
    const createdAt = normalizeText(row.createdAt) || nowIso();
    const next = {
        id: normalizeText(row.id) || uid(),
        artikelNr: normalizeText(row.artikelNr),
        refKey: makeRefKey(row),
        bezeichnung: normalizeText(row.bezeichnung || row.kurztext),
        kurztext: normalizeText(row.kurztext || row.bezeichnung),
        langtext: normalizeText(row.langtext),
        einheit: normalizeUnit(row.einheit),
        ep: roundPrice(row.ep),
        waehrung: normalizeCurrency(row.waehrung),
        gruppe: normalizeGroup(row.gruppe),
        kategorie: normalizeText(row.kategorie),
        gewerk: normalizeText(row.gewerk),
        validFrom: normalizeText(row.validFrom) || new Date().toISOString().slice(0, 10),
        validTo: row.validTo === undefined ? null : row.validTo,
        source: sanitizeSource(row.source),
        note: normalizeText(row.note),
        createdAt,
        updatedAt: nowIso(),
    };
    if (!next.bezeichnung && next.artikelNr) {
        next.bezeichnung = next.artikelNr;
    }
    if (!next.kurztext) {
        next.kurztext = next.bezeichnung;
    }
    return next;
}
function sortRows(rows) {
    return [...rows].sort((a, b) => {
        const g = String(a.gruppe || "").localeCompare(String(b.gruppe || ""), "de", {
            numeric: true,
            sensitivity: "base",
        });
        if (g !== 0)
            return g;
        return String(a.artikelNr || "").localeCompare(String(b.artikelNr || ""), "de", {
            numeric: true,
            sensitivity: "base",
        });
    });
}
function dedupeRows(rows) {
    const map = new Map();
    for (const row of rows) {
        const normalized = normalizePriceRow(row);
        const key = normalized.refKey ||
            `${normalized.gruppe}:${normalized.artikelNr}`.toUpperCase() ||
            normalized.id;
        const existing = map.get(key);
        if (existing?.createdAt) {
            normalized.createdAt = existing.createdAt;
        }
        map.set(key, normalized);
    }
    return sortRows(Array.from(map.values()));
}
function safeParse(raw) {
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return null;
        return dedupeRows(parsed);
    }
    catch {
        return null;
    }
}
function writeRows(rows) {
    const normalized = dedupeRows(rows);
    try {
        const old = localStorage.getItem(KEY);
        if (old)
            localStorage.setItem(BACKUP_KEY, old);
    }
    catch {
        // ignore backup failure
    }
    localStorage.setItem(KEY, JSON.stringify(normalized));
    localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
}
export function loadPreise() {
    try {
        const rows = safeParse(localStorage.getItem(KEY));
        if (rows && rows.length) {
            const version = localStorage.getItem(VERSION_KEY);
            if (version !== CURRENT_VERSION) {
                writeRows(rows);
            }
            return rows;
        }
        const initial = demo();
        writeRows(initial);
        return initial;
    }
    catch {
        return demo();
    }
}
export function savePreise(rows) {
    try {
        writeRows(rows);
    }
    catch {
        // localStorage quota or browser restriction
    }
}
export function clearPreise() {
    try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(BACKUP_KEY);
        localStorage.removeItem(VERSION_KEY);
    }
    catch {
        // ignore
    }
}
export function upsertPreis(row) {
    const all = loadPreise();
    const next = normalizePriceRow(row);
    const idx = all.findIndex((x) => {
        if (next.refKey && x.refKey)
            return x.refKey === next.refKey;
        return x.id === next.id;
    });
    if (idx >= 0) {
        next.createdAt = all[idx].createdAt || next.createdAt;
        all[idx] = next;
    }
    else {
        all.unshift(next);
    }
    savePreise(all);
    return next;
}
export function removePreis(idOrRefKey) {
    const key = normalizeText(idOrRefKey).toUpperCase();
    const next = loadPreise().filter((r) => r.id !== idOrRefKey && String(r.refKey || "").toUpperCase() !== key);
    savePreise(next);
}
export function findPreis(refKeyOrArtikelNr) {
    const key = normalizeText(refKeyOrArtikelNr).toUpperCase();
    if (!key)
        return null;
    return (loadPreise().find((r) => {
        return (String(r.refKey || "").toUpperCase() === key ||
            String(r.artikelNr || "").toUpperCase() === key);
    }) || null);
}
export function searchPreise(query, group) {
    const q = normalizeText(query).toLowerCase();
    return loadPreise().filter((r) => {
        const groupOk = !group || group === "Alle" ? true : r.gruppe === group;
        if (!groupOk)
            return false;
        if (!q)
            return true;
        const hay = [
            r.artikelNr,
            r.refKey,
            r.bezeichnung,
            r.kurztext,
            r.langtext,
            r.einheit,
            r.gruppe,
            r.kategorie,
            r.gewerk,
        ]
            .join(" ")
            .toLowerCase();
        return hay.includes(q);
    });
}
export function importPreiseCSV(text) {
    const content = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!content)
        return 0;
    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length)
        return 0;
    const sep = lines[0].includes(";") ? ";" : ",";
    const splitLine = (line) => {
        const out = [];
        let cur = "";
        let quoted = false;
        for (let i = 0; i < line.length; i += 1) {
            const ch = line[i];
            const next = line[i + 1];
            if (ch === '"') {
                if (quoted && next === '"') {
                    cur += '"';
                    i += 1;
                }
                else {
                    quoted = !quoted;
                }
                continue;
            }
            if (ch === sep && !quoted) {
                out.push(cur);
                cur = "";
                continue;
            }
            cur += ch;
        }
        out.push(cur);
        return out;
    };
    const normalizeHeader = (v) => v.trim().toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "");
    const first = splitLine(lines[0]).map(normalizeHeader);
    const hasHeader = first.includes("artikelnr") ||
        first.includes("refkey") ||
        first.includes("bezeichnung") ||
        first.includes("kurztext") ||
        first.includes("einheit") ||
        first.includes("ep") ||
        first.includes("gruppe");
    const idx = (names) => first.findIndex((h) => names.includes(h));
    const iArtikel = hasHeader ? idx(["artikelnr", "artikelnummer", "nummer", "posnr", "position"]) : 0;
    const iRef = hasHeader ? idx(["refkey", "referenz", "key"]) : -1;
    const iBez = hasHeader ? idx(["bezeichnung", "kurztext", "text", "titel"]) : 1;
    const iLang = hasHeader ? idx(["langtext", "beschreibung", "description"]) : -1;
    const iUnit = hasHeader ? idx(["einheit", "me", "unit", "eh"]) : 2;
    const iEp = hasHeader ? idx(["ep", "preis", "einzelpreis", "unitprice"]) : 3;
    const iGroup = hasHeader ? idx(["gruppe", "group", "typ", "type"]) : 4;
    const iCat = hasHeader ? idx(["kategorie", "category"]) : -1;
    const iGewerk = hasHeader ? idx(["gewerk"]) : -1;
    const iValidFrom = hasHeader ? idx(["validfrom", "gueltigab", "gültigab"]) : -1;
    const iNote = hasHeader ? idx(["note", "notiz", "bemerkung"]) : -1;
    const body = hasHeader ? lines.slice(1) : lines;
    const imported = body
        .map((line) => {
        const c = splitLine(line);
        return normalizePriceRow({
            id: uid(),
            artikelNr: c[iArtikel] || "",
            refKey: iRef >= 0 ? c[iRef] : "",
            bezeichnung: c[iBez] || "",
            kurztext: c[iBez] || "",
            langtext: iLang >= 0 ? c[iLang] : "",
            einheit: c[iUnit] || "St",
            ep: parseNumber(c[iEp], 0),
            gruppe: c[iGroup] || "Sonstiges",
            kategorie: iCat >= 0 ? c[iCat] : "",
            gewerk: iGewerk >= 0 ? c[iGewerk] : "",
            validFrom: iValidFrom >= 0 ? c[iValidFrom] : "",
            source: "csv",
            note: iNote >= 0 ? c[iNote] : "",
        });
    })
        .filter((r) => r.artikelNr || r.bezeichnung);
    savePreise([...imported, ...loadPreise()]);
    return imported.length;
}
export function exportPreiseCSV(rows) {
    const data = rows || loadPreise();
    const header = [
        "ArtikelNr",
        "RefKey",
        "Bezeichnung",
        "Langtext",
        "Einheit",
        "EP",
        "Waehrung",
        "Gruppe",
        "Kategorie",
        "Gewerk",
        "ValidFrom",
        "ValidTo",
        "Source",
        "Note",
    ];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = sortRows(data).map((r) => [
        esc(r.artikelNr),
        esc(r.refKey),
        esc(r.bezeichnung),
        esc(r.langtext),
        esc(r.einheit),
        esc(r.ep),
        esc(r.waehrung || "EUR"),
        esc(r.gruppe),
        esc(r.kategorie),
        esc(r.gewerk),
        esc(r.validFrom),
        esc(r.validTo),
        esc(r.source),
        esc(r.note),
    ].join(";"));
    return [header.join(";"), ...body].join("\n");
}
function demo() {
    const today = new Date().toISOString().slice(0, 10);
    return dedupeRows([
        {
            id: "mat-speedpipe-12",
            artikelNr: "M-1001",
            refKey: "MATERIAL:M-1001",
            bezeichnung: "Speedpipe 12 mm",
            kurztext: "Speedpipe 12 mm",
            langtext: "Speedpipe 12 mm liefern und bereitstellen.",
            einheit: "m",
            ep: 2.1,
            waehrung: "EUR",
            gruppe: "Material",
            kategorie: "Rohr / Kabelschutz",
            gewerk: "Tiefbau / Glasfaser",
            validFrom: today,
            validTo: null,
            source: "demo",
            note: "Demo-Preis",
        },
        {
            id: "arb-kolonne-tiefbau",
            artikelNr: "A-2001",
            refKey: "LABOR:A-2001",
            bezeichnung: "Kolonne Tiefbau (2 Pers.)",
            kurztext: "Kolonne Tiefbau (2 Pers.)",
            langtext: "Tiefbaukolonne bestehend aus zwei Mitarbeitern.",
            einheit: "h",
            ep: 78,
            waehrung: "EUR",
            gruppe: "Arbeit",
            kategorie: "Personal",
            gewerk: "Tiefbau",
            validFrom: today,
            validTo: null,
            source: "demo",
            note: "Demo-Preis",
        },
        {
            id: "mas-minibagger-18t",
            artikelNr: "MS-3001",
            refKey: "MACHINE:MS-3001",
            bezeichnung: "Minibagger 1,8 t",
            kurztext: "Minibagger 1,8 t",
            langtext: "Minibagger inklusive Standardausrüstung, ohne Bediener.",
            einheit: "h",
            ep: 42.5,
            waehrung: "EUR",
            gruppe: "Maschine",
            kategorie: "Bagger",
            gewerk: "Tiefbau",
            validFrom: today,
            validTo: null,
            source: "demo",
            note: "Demo-Preis",
        },
        {
            id: "mat-asphalt-ac11d",
            artikelNr: "M-9010",
            refKey: "MATERIAL:M-9010",
            bezeichnung: "Asphalt AC 11 D",
            kurztext: "Asphalt AC 11 D",
            langtext: "Asphaltmischgut AC 11 D liefern.",
            einheit: "t",
            ep: 99,
            waehrung: "EUR",
            gruppe: "Material",
            kategorie: "Asphalt",
            gewerk: "Straßenbau",
            validFrom: today,
            validTo: null,
            source: "demo",
            note: "Demo-Preis",
        },
    ]);
}
