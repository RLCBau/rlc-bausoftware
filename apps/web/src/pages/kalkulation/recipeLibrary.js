// apps/web/src/pages/kalkulation/recipeLibrary.ts
const STORE_KEY = "rlc_recipe_library_v1";
/* ================= BASIC HELPERS ================= */
function safeId() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `lib-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
function n(value, fallback = 0) {
    if (value === null || value === undefined || value === "")
        return fallback;
    const raw = String(value).trim();
    const normalized = raw.includes(",")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/\s/g, "");
    const parsed = typeof value === "number" ? value : Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function norm(value) {
    return String(value ?? "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
function compact(value) {
    return norm(value).replace(/[^a-z0-9äöüß]+/gi, "");
}
function normalizeUnit(unit) {
    const u = String(unit ?? "").trim();
    const l = u.toLowerCase();
    if (!u)
        return "St";
    if (["m2", "qm", "m²", "m^2"].includes(l))
        return "m²";
    if (["m3", "cbm", "m³", "m^3"].includes(l))
        return "m³";
    if (["stk", "st", "stück", "stueck"].includes(l))
        return "St";
    if (["std", "h", "stunden"].includes(l))
        return "h";
    if (["to", "tonne", "tonnen"].includes(l))
        return "t";
    if (["psch", "pausch", "pauschale"].includes(l))
        return "pauschal";
    return u;
}
function splitCsvLine(line) {
    const out = [];
    let cur = "";
    let inside = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        const next = line[i + 1];
        if (ch === '"' && inside && next === '"') {
            cur += '"';
            i += 1;
            continue;
        }
        if (ch === '"') {
            inside = !inside;
            continue;
        }
        if ((ch === ";" || ch === ",") && !inside) {
            out.push(cur.trim());
            cur = "";
            continue;
        }
        cur += ch;
    }
    out.push(cur.trim());
    return out;
}
function makeKeywords(title) {
    return Array.from(new Set(norm(title)
        .split(/[^a-z0-9äöüß]+/i)
        .map((x) => x.trim())
        .filter((x) => x.length >= 3)));
}
function classifyGroup(title) {
    const t = norm(title);
    if (t.includes("lkw") ||
        t.includes("transport") ||
        t.includes("abfuhr") ||
        t.includes("anfuhr") ||
        t.includes("anliefer") ||
        t.includes("fahren") ||
        t.includes("tieflader")) {
        return "LKW / Transport";
    }
    if (t.includes("bagger") ||
        t.includes("radlader") ||
        t.includes("walze") ||
        t.includes("rüttel") ||
        t.includes("ruettel") ||
        t.includes("ruttel") ||
        t.includes("verdichter") ||
        t.includes("maschine") ||
        t.includes("fugenschneider") ||
        t.includes("steinschneider") ||
        t.includes("pflasterknacker")) {
        return "Maschinen";
    }
    if (t.includes("facharbeiter") ||
        t.includes("helfer") ||
        t.includes("polier") ||
        t.includes("arbeiter") ||
        t.includes("lohn") ||
        t.includes("kolonne") ||
        t.includes("bauleiter") ||
        t.includes("vermessung")) {
        return "Personal";
    }
    if (t.includes("entsorgung") ||
        t.includes("deponie") ||
        t.includes("verwertung") ||
        t.includes("beseitigung") ||
        t.includes("aufbruch entsorgen")) {
        return "Entsorgung";
    }
    if (t.includes("frostschutz") ||
        t.includes("kies") ||
        t.includes("schotter") ||
        t.includes("sand") ||
        t.includes("splitt") ||
        t.includes("pflaster") ||
        t.includes("bordstein") ||
        t.includes("rasengitter") ||
        t.includes("asphalt") ||
        t.includes("beton") ||
        t.includes("rohr") ||
        t.includes("leitung") ||
        t.includes("speedpipe") ||
        t.includes("material") ||
        t.includes("stein") ||
        t.includes("platte") ||
        t.includes("fugen")) {
        return "Material";
    }
    if (t.includes("fremd") || t.includes("nachunternehmer")) {
        return "Fremdleistung";
    }
    if (t.includes("gemeinkosten") || t.includes("bgk"))
        return "Gemeinkosten";
    if (t.includes("risiko"))
        return "Risiko";
    if (t.includes("gewinn"))
        return "Gewinn";
    return "Sonstiges";
}
/**
 * Wichtig:
 * Nicht nur title+unit verwenden.
 * Sonst werden tausende reale Positionen zu wenigen Einträgen verschmolzen.
 */
function dedupeKey(item) {
    const code = compact(item.code);
    const title = compact(item.title);
    const unit = compact(normalizeUnit(item.unit));
    const group = compact(item.group);
    const price = round2(n(item.unitPrice)).toFixed(2);
    if (code) {
        return `code:${code}|unit:${unit}|price:${price}|group:${group}`;
    }
    return `title:${title}|unit:${unit}|price:${price}|group:${group}`;
}
function normalizeItem(row) {
    const now = new Date().toISOString();
    const title = String(row.title || "").trim();
    const unit = normalizeUnit(row.unit);
    const unitPrice = round2(n(row.unitPrice ?? row.avgPrice));
    const minPrice = round2(n(row.minPrice, unitPrice));
    const maxPrice = round2(n(row.maxPrice, unitPrice));
    const avgPrice = round2(n(row.avgPrice, unitPrice));
    const group = row.group || classifyGroup(title);
    return {
        id: String(row.id || safeId()),
        code: String(row.code || "").trim(),
        title,
        unit,
        qty: n(row.qty, 1),
        unitPrice,
        minPrice,
        maxPrice,
        avgPrice,
        variants: Math.max(1, n(row.variants, 1)),
        group,
        keywords: Array.isArray(row.keywords) ? row.keywords : makeKeywords(title),
        source: row.source || "manual",
        createdAt: String(row.createdAt || now),
        updatedAt: String(row.updatedAt || now),
    };
}
/* ================= STORAGE ================= */
function readDb() {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        const parsed = JSON.parse(raw || "[]");
        if (!Array.isArray(parsed))
            return [];
        return parsed
            .map(normalizeItem)
            .filter((x) => x.title.trim() && x.unitPrice >= 0);
    }
    catch {
        return [];
    }
}
function writeDb(rows) {
    localStorage.setItem(STORE_KEY, JSON.stringify(rows.map(normalizeItem)));
}
function mergeItems(oldItem, newItem) {
    const oldVariants = Math.max(1, n(oldItem.variants, 1));
    const newVariants = Math.max(1, n(newItem.variants, 1));
    const totalVariants = oldVariants + newVariants;
    const avgPrice = round2((n(oldItem.avgPrice) * oldVariants + n(newItem.avgPrice) * newVariants) /
        totalVariants);
    return normalizeItem({
        ...oldItem,
        code: oldItem.code || newItem.code,
        title: oldItem.title || newItem.title,
        unit: oldItem.unit || newItem.unit,
        qty: round2((n(oldItem.qty) + n(newItem.qty)) / 2),
        unitPrice: avgPrice,
        avgPrice,
        minPrice: Math.min(n(oldItem.minPrice, avgPrice), n(newItem.minPrice, avgPrice)),
        maxPrice: Math.max(n(oldItem.maxPrice, avgPrice), n(newItem.maxPrice, avgPrice)),
        variants: totalVariants,
        keywords: Array.from(new Set([...oldItem.keywords, ...newItem.keywords])),
        source: oldItem.source === "base" ? "base" : newItem.source,
        updatedAt: new Date().toISOString(),
    });
}
/* ================= CSV IMPORT ================= */
function parseCsv(text) {
    const lines = String(text || "")
        .replace(/\r/g, "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
    if (lines.length < 2)
        return [];
    const headers = splitCsvLine(lines[0]).map((h) => norm(h).replace(/[^a-z0-9]+/g, ""));
    return lines.slice(1).map((line) => {
        const cells = splitCsvLine(line);
        const obj = {};
        headers.forEach((h, i) => {
            obj[h] = cells[i] ?? "";
        });
        return obj;
    });
}
function firstValue(obj, names) {
    for (const name of names) {
        const key = norm(name).replace(/[^a-z0-9]+/g, "");
        const value = obj[key];
        if (value !== undefined && String(value).trim())
            return value;
    }
    return "";
}
function csvObjToItem(obj) {
    const code = firstValue(obj, [
        "code",
        "nr",
        "nummer",
        "artikelnummer",
        "artnr",
        "posnr",
        "position",
        "positionsnummer",
        "oz",
    ]);
    const title = firstValue(obj, [
        "title",
        "titel",
        "kurztext",
        "text",
        "bezeichnung",
        "beschreibung",
        "name",
        "leistung",
    ]);
    const unit = firstValue(obj, ["unit", "einheit", "me", "mengeneinheit"]);
    const qty = firstValue(obj, ["qty", "menge", "quantity", "anzahl"]) || "1";
    const unitPrice = firstValue(obj, [
        "unitprice",
        "preis",
        "ep",
        "einheitspreis",
        "price",
        "avgprice",
        "durchschnittspreis",
    ]);
    const groupRaw = firstValue(obj, ["group", "gruppe", "category", "kategorie"]);
    const price = n(unitPrice);
    if (!String(title).trim())
        return null;
    if (price < 0)
        return null;
    const group = groupRaw && isRecipeLibraryGroup(groupRaw)
        ? groupRaw
        : classifyGroup(title);
    return normalizeItem({
        id: safeId(),
        code,
        title,
        unit,
        qty: n(qty, 1),
        unitPrice: price,
        minPrice: price,
        maxPrice: price,
        avgPrice: price,
        variants: 1,
        group,
        keywords: makeKeywords(`${code} ${title} ${group}`),
        source: "csv-import",
    });
}
function isRecipeLibraryGroup(value) {
    return [
        "Personal",
        "Maschinen",
        "LKW / Transport",
        "Material",
        "Entsorgung",
        "Fremdleistung",
        "Gemeinkosten",
        "Risiko",
        "Gewinn",
        "Sonstiges",
    ].includes(value);
}
/* ================= SEARCH ================= */
function scoreItem(item, query) {
    const q = norm(query);
    if (!q)
        return 0;
    const title = norm(item.title);
    const code = norm(item.code);
    const group = norm(item.group);
    let score = 0;
    if (title === q)
        score += 100;
    if (title.includes(q))
        score += 50;
    if (code && code.includes(q))
        score += 45;
    if (group.includes(q))
        score += 15;
    const qTokens = q.split(/[^a-z0-9äöüß]+/i).filter((x) => x.length >= 3);
    const itemTokens = new Set(item.keywords);
    for (const token of qTokens) {
        if (itemTokens.has(token))
            score += 12;
        else if (title.includes(token))
            score += 8;
        else if (code.includes(token))
            score += 6;
    }
    if (item.variants > 1)
        score += Math.min(12, item.variants);
    return score;
}
/* ================= PUBLIC API ================= */
export const RecipeLibrary = {
    key: STORE_KEY,
    list() {
        return readDb().sort((a, b) => a.title.localeCompare(b.title, "de", {
            numeric: true,
            sensitivity: "base",
        }));
    },
    count() {
        return readDb().length;
    },
    clear() {
        localStorage.removeItem(STORE_KEY);
    },
    upsert(row) {
        const item = normalizeItem(row);
        const rows = readDb();
        const key = dedupeKey(item);
        const idx = rows.findIndex((x) => x.id === item.id || dedupeKey(x) === key);
        if (idx >= 0) {
            rows[idx] = mergeItems(rows[idx], item);
            writeDb(rows);
            return rows[idx];
        }
        rows.unshift(item);
        writeDb(rows);
        return item;
    },
    bulkUpsert(items) {
        const saved = [];
        for (const item of items) {
            saved.push(this.upsert(item));
        }
        return saved;
    },
    search(query, limit = 50) {
        return readDb()
            .map((item) => ({ item, score: scoreItem(item, query) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((x) => x.item);
    },
    byGroup(group) {
        return this.list().filter((x) => x.group === group);
    },
    importCsvPriceLibrary(text) {
        const parsed = parseCsv(text);
        const rows = readDb();
        const map = new Map();
        for (const row of rows) {
            map.set(dedupeKey(row), row);
        }
        let imported = 0;
        let skipped = 0;
        let duplicatesMerged = 0;
        for (const obj of parsed) {
            const item = csvObjToItem(obj);
            if (!item) {
                skipped += 1;
                continue;
            }
            const key = dedupeKey(item);
            const existing = map.get(key);
            if (existing) {
                map.set(key, mergeItems(existing, item));
                duplicatesMerged += 1;
            }
            else {
                map.set(key, item);
                imported += 1;
            }
        }
        const next = Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title, "de", {
            numeric: true,
            sensitivity: "base",
        }));
        writeDb(next);
        return {
            imported,
            skipped,
            duplicatesMerged,
            total: next.length,
        };
    },
    exportJson() {
        return JSON.stringify(readDb(), null, 2);
    },
    importJson(text) {
        const parsed = JSON.parse(text || "[]");
        if (!Array.isArray(parsed))
            return 0;
        const saved = this.bulkUpsert(parsed);
        return saved.length;
    },
    exportCsv() {
        const header = [
            "id",
            "code",
            "title",
            "unit",
            "qty",
            "unitPrice",
            "minPrice",
            "maxPrice",
            "avgPrice",
            "variants",
            "group",
            "keywords",
            "source",
        ];
        const body = readDb().map((r) => [
            r.id,
            r.code,
            r.title,
            r.unit,
            r.qty,
            r.unitPrice,
            r.minPrice,
            r.maxPrice,
            r.avgPrice,
            r.variants,
            r.group,
            r.keywords.join(", "),
            r.source,
        ]
            .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
            .join(";"));
        return [header.join(";"), ...body].join("\n");
    },
};
