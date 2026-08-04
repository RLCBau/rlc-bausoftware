// apps/web/src/pages/kalkulation/catalogStore.ts
const KEY = "rlc_catalog_v2";
const LEGACY_KEY = "rlc_catalog_v1";
const CHUNK_SIZE = 500000;
function nowIso() {
    return new Date().toISOString();
}
function safeUuid() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `cat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
}
function hasStorage() {
    try {
        return typeof localStorage !== "undefined";
    }
    catch {
        return false;
    }
}
function normalizeText(value) {
    return String(value ?? "").trim();
}
function normalizePosNr(value) {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, "")
        .replace(/_/g, ".")
        .replace(/,+/g, ".")
        .replace(/\.+/g, ".")
        .replace(/^\./, "")
        .replace(/\.$/, "");
}
function normalizeGroup(value) {
    const v = normalizeText(value);
    if (!v)
        return "Sonstiges";
    const l = v.toLowerCase();
    if (["material", "materialien", "stoff", "stoffe"].includes(l)) {
        return "Material";
    }
    if (["arbeiter", "lohn", "personal", "labor"].includes(l)) {
        return "Arbeiter";
    }
    if (["maschine", "maschinen", "gerät", "geraet", "machine"].includes(l)) {
        return "Maschinen";
    }
    return v;
}
function toNumber(value) {
    if (value === null || value === undefined || value === "")
        return 0;
    const raw = String(value).trim();
    if (!raw)
        return 0;
    const normalized = raw
        .replace(/\s/g, "")
        .replace(/[€]/g, "")
        .replace(/\.(?=\d{3}(?:[.,]|$))/g, "")
        .replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
}
function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function csvEscape(value) {
    const s = String(value ?? "");
    if (/[;"\n\r]/.test(s))
        return `"${s.replace(/"/g, '""')}"`;
    return s;
}
function parseCsvLine(line, separator = ";") {
    const out = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        const next = line[i + 1];
        if (ch === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                i += 1;
            }
            else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === separator && !inQuotes) {
            out.push(current);
            current = "";
            continue;
        }
        current += ch;
    }
    out.push(current);
    return out;
}
function detectSeparator(firstLine) {
    const semi = (firstLine.match(/;/g) || []).length;
    const comma = (firstLine.match(/,/g) || []).length;
    const tab = (firstLine.match(/\t/g) || []).length;
    if (tab > semi && tab > comma)
        return "\t";
    if (comma > semi)
        return ",";
    return ";";
}
function normalizeHeader(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[_-]/g, "");
}
function findHeader(headers, alternatives) {
    return headers.findIndex((h) => alternatives.includes(h));
}
function makeRow(input) {
    const createdAt = normalizeText(input.createdAt) || nowIso();
    return {
        id: normalizeText(input.id) || safeUuid(),
        posNr: normalizePosNr(input.posNr),
        kurztext: normalizeText(input.kurztext),
        einheit: normalizeText(input.einheit),
        ep: round2(toNumber(input.ep)),
        gruppe: normalizeGroup(input.gruppe),
        createdAt,
        updatedAt: nowIso(),
    };
}
function sortRows(rows) {
    return [...rows].sort((a, b) => {
        const g = String(a.gruppe || "").localeCompare(String(b.gruppe || ""), "de", {
            numeric: true,
            sensitivity: "base",
        });
        if (g !== 0)
            return g;
        const p = String(a.posNr || "").localeCompare(String(b.posNr || ""), "de", {
            numeric: true,
            sensitivity: "base",
        });
        if (p !== 0)
            return p;
        return String(a.kurztext || "").localeCompare(String(b.kurztext || ""), "de", {
            sensitivity: "base",
        });
    });
}
function dedupeRows(rows) {
    const byKey = new Map();
    for (const row of rows) {
        const clean = makeRow(row);
        const key = `${clean.gruppe || ""}:${clean.posNr || ""}:${clean.kurztext || ""}:${clean.einheit || ""}`;
        if (!clean.posNr && !clean.kurztext)
            continue;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, clean);
            continue;
        }
        byKey.set(key, {
            ...existing,
            ...clean,
            id: existing.id,
            createdAt: existing.createdAt || clean.createdAt,
            updatedAt: nowIso(),
        });
    }
    return sortRows(Array.from(byKey.values()));
}
function clearChunks(baseKey) {
    if (!hasStorage())
        return;
    Object.keys(localStorage).forEach((k) => {
        if (k === `${baseKey}_n` || k.startsWith(`${baseKey}_`)) {
            localStorage.removeItem(k);
        }
    });
}
function saveChunks(baseKey, json) {
    if (!hasStorage())
        return;
    clearChunks(baseKey);
    const count = Math.ceil(json.length / CHUNK_SIZE);
    localStorage.setItem(`${baseKey}_n`, String(count));
    for (let i = 0; i < count; i += 1) {
        const start = i * CHUNK_SIZE;
        localStorage.setItem(`${baseKey}_${i}`, json.slice(start, start + CHUNK_SIZE));
    }
    localStorage.setItem(`${baseKey}_updatedAt`, nowIso());
}
function loadChunks(baseKey) {
    if (!hasStorage())
        return null;
    const n = Number(localStorage.getItem(`${baseKey}_n`) || 0);
    if (!Number.isFinite(n) || n <= 0)
        return null;
    let json = "";
    for (let i = 0; i < n; i += 1) {
        json += localStorage.getItem(`${baseKey}_${i}`) || "";
    }
    return json || null;
}
function readRows() {
    try {
        const raw = loadChunks(KEY) || loadChunks(LEGACY_KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return sortRows(parsed.map(makeRow));
    }
    catch {
        return [];
    }
}
function writeRows(rows) {
    const clean = dedupeRows(rows);
    saveChunks(KEY, JSON.stringify(clean));
}
function parseRowsFromCSV(text) {
    const content = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!content)
        return [];
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (!lines.length)
        return [];
    const sep = detectSeparator(lines[0]);
    const first = parseCsvLine(lines[0], sep).map(normalizeHeader);
    const hasHeader = first.includes("posnr") ||
        first.includes("positionsnummer") ||
        first.includes("kurztext") ||
        first.includes("einheit") ||
        first.includes("ep") ||
        first.includes("gruppe");
    let iPos = 0;
    let iKurz = 1;
    let iEinheit = 2;
    let iEp = 3;
    let iGruppe = 4;
    if (hasHeader) {
        iPos = findHeader(first, ["posnr", "positionsnummer", "pos", "position"]);
        iKurz = findHeader(first, [
            "kurztext",
            "text",
            "bezeichnung",
            "artikel",
            "leistung",
        ]);
        iEinheit = findHeader(first, ["einheit", "me", "eh", "unit"]);
        iEp = findHeader(first, [
            "ep",
            "preis",
            "einheitspreis",
            "einzelpreis",
            "nettopreis",
        ]);
        iGruppe = findHeader(first, [
            "gruppe",
            "typ",
            "art",
            "category",
            "kategorie",
        ]);
    }
    const body = hasHeader ? lines.slice(1) : lines;
    return body
        .map((line) => {
        const parts = parseCsvLine(line, sep);
        return makeRow({
            posNr: iPos >= 0 ? parts[iPos] : parts[0],
            kurztext: iKurz >= 0 ? parts[iKurz] : parts[1],
            einheit: iEinheit >= 0 ? parts[iEinheit] : parts[2],
            ep: toNumber(iEp >= 0 ? parts[iEp] : parts[3]),
            gruppe: iGruppe >= 0 ? parts[iGruppe] : parts[4],
        });
    })
        .filter((row) => row.posNr || row.kurztext);
}
export const Catalog = {
    list() {
        return readRows();
    },
    count() {
        return readRows().length;
    },
    stats() {
        const rows = readRows();
        return {
            total: rows.length,
            material: rows.filter((r) => r.gruppe === "Material").length,
            arbeiter: rows.filter((r) => r.gruppe === "Arbeiter").length,
            maschinen: rows.filter((r) => r.gruppe === "Maschinen").length,
            sonstiges: rows.filter((r) => r.gruppe !== "Material" &&
                r.gruppe !== "Arbeiter" &&
                r.gruppe !== "Maschinen").length,
            updatedAt: hasStorage()
                ? localStorage.getItem(`${KEY}_updatedAt`) || ""
                : "",
        };
    },
    clear() {
        clearChunks(KEY);
        clearChunks(LEGACY_KEY);
    },
    setAll(rows) {
        const clean = dedupeRows(rows);
        writeRows(clean);
        return clean.length;
    },
    upsert(row) {
        const all = readRows();
        const next = makeRow(row);
        const idx = all.findIndex((r) => r.id === next.id);
        if (idx >= 0) {
            next.createdAt = all[idx].createdAt || next.createdAt;
            all[idx] = next;
        }
        else {
            all.unshift(next);
        }
        writeRows(all);
        return next;
    },
    remove(id) {
        const next = readRows().filter((r) => r.id !== id);
        writeRows(next);
    },
    importCSV(text) {
        const rows = parseRowsFromCSV(text);
        writeRows(rows);
        return rows.length;
    },
    appendCSV(text) {
        const current = readRows();
        const incoming = parseRowsFromCSV(text);
        const merged = dedupeRows([...incoming, ...current]);
        writeRows(merged);
        return incoming.length;
    },
    exportCSV(rows) {
        const data = rows ?? readRows();
        const header = ["PosNr", "Kurztext", "Einheit", "EP", "Gruppe"];
        const body = sortRows(data).map((row) => [
            csvEscape(row.posNr),
            csvEscape(row.kurztext),
            csvEscape(row.einheit),
            csvEscape(row.ep),
            csvEscape(row.gruppe || "Sonstiges"),
        ].join(";"));
        return [header.join(";"), ...body].join("\n");
    },
};
