// Lokaler Store je Projekt
const KEY = "rlc_changes_v1";
const uid = () => (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
function load() {
    try {
        return JSON.parse(localStorage.getItem(KEY) || "{}");
    }
    catch {
        return {};
    }
}
function save(db) { localStorage.setItem(KEY, JSON.stringify(db)); }
export const Changes = {
    list(projectId) {
        const db = load();
        return db[projectId] ?? [];
    },
    upsert(projectId, row) {
        const db = load();
        const id = row.id ?? uid();
        const list = db[projectId] ?? [];
        const i = list.findIndex(r => r.id === id);
        const item = {
            id,
            posNr: row.posNr ?? "",
            kurztext: row.kurztext ?? "",
            einheit: row.einheit ?? "m",
            mengeDelta: Number(row.mengeDelta ?? 0),
            preis: row.preis,
            begruendung: row.begruendung ?? "",
            status: row.status ?? "Entwurf",
        };
        if (i >= 0)
            list[i] = item;
        else
            list.unshift(item);
        db[projectId] = list;
        save(db);
        return item;
    },
    remove(projectId, id) {
        const db = load();
        db[projectId] = (db[projectId] ?? []).filter(r => r.id !== id);
        save(db);
    },
    clear(projectId) {
        const db = load();
        db[projectId] = [];
        save(db);
    },
    exportCSV(projectId) {
        const rows = Changes.list(projectId);
        const head = "PosNr;Kurztext;Einheit;DeltaMenge;EP (netto);Status;Begründung;Zeilen-Netto";
        const body = rows.map(r => {
            const z = (r.mengeDelta || 0) * (r.preis || 0);
            const t = JSON.stringify(r.kurztext ?? "");
            const b = JSON.stringify(r.begruendung ?? "");
            return [r.posNr ?? "", t, r.einheit ?? "", r.mengeDelta ?? 0, r.preis ?? "", r.status ?? "", b, z].join(";");
        }).join("\n");
        return head + "\n" + body;
    },
    importCSV(projectId, text) {
        const lines = text.trim().split(/\r?\n/);
        if (!lines.length)
            return 0;
        if (/posnr/i.test(lines[0]))
            lines.shift();
        const rows = [];
        for (const l of lines) {
            if (!l.trim())
                continue;
            const p = l.split(";");
            const parseStr = (s) => {
                if (!s)
                    return "";
                try {
                    return JSON.parse(s);
                }
                catch {
                    return s;
                }
            };
            rows.push({
                id: uid(),
                posNr: p[0] || "",
                kurztext: parseStr(p[1] || ""),
                einheit: p[2] || "m",
                mengeDelta: Number(p[3] || 0),
                preis: p[4] ? Number(p[4].replace(",", ".")) : undefined,
                status: p[5] || "Entwurf",
                begruendung: parseStr(p[6] || ""),
            });
        }
        const db = load();
        db[projectId] = rows;
        save(db);
        return rows.length;
    },
    totals(projectId, mwst) {
        const rows = Changes.list(projectId);
        const netto = rows.reduce((s, r) => s + (r.mengeDelta || 0) * (r.preis || 0), 0);
        const brutto = netto * (1 + (mwst || 0) / 100);
        return { netto, brutto };
    }
};
