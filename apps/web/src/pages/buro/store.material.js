const KEY = "rlc-material-db";
/* ================= LOAD / SAVE ================= */
const load = () => {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
const save = (rows) => {
    localStorage.setItem(KEY, JSON.stringify(rows));
};
/* ================= HELPERS ================= */
function esc(s) {
    return (s || "").replace(/;/g, ",").replace(/\n/g, " ");
}
function unesc(s) {
    return s || "";
}
function normalizeItem(it) {
    return {
        id: it.id || crypto.randomUUID(),
        name: it.name || "",
        code: it.code || "",
        unit: it.unit || "Stk",
        stock: Number.isFinite(it.stock) ? it.stock : 0,
        minStock: Number.isFinite(it.minStock) ? it.minStock : 0,
        priceNet: Number.isFinite(it.priceNet) ? it.priceNet : 0,
        projectId: it.projectId || undefined,
        location: it.location || "",
        supplier: it.supplier || "",
        moves: Array.isArray(it.moves) ? it.moves : [],
        attachments: Array.isArray(it.attachments) ? it.attachments : [],
        updatedAt: it.updatedAt || Date.now(),
    };
}
function normalizeMove(m) {
    return {
        id: m.id || crypto.randomUUID(),
        dir: m.dir === "OUT" ? "OUT" : "IN",
        qty: Number(m.qty || 0),
        note: m.note || "",
        date: m.date || new Date().toISOString(),
    };
}
/* ================= DB ================= */
export const MaterialDB = {
    list() {
        return load()
            .map(normalizeItem)
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    },
    create(projectId) {
        const item = normalizeItem({
            id: crypto.randomUUID(),
            name: "",
            code: "",
            unit: "Stk",
            stock: 0,
            minStock: 0,
            priceNet: 0,
            projectId,
            location: "",
            supplier: "",
            moves: [],
            attachments: [],
            updatedAt: Date.now(),
        });
        const all = load();
        all.push(item);
        save(all);
        return item;
    },
    upsert(item) {
        const it = normalizeItem(item);
        const all = load();
        const index = all.findIndex((x) => x.id === it.id);
        if (index >= 0) {
            all[index] = it;
        }
        else {
            all.push(it);
        }
        save(all);
        return it;
    },
    remove(id) {
        const all = load().filter((x) => x.id !== id);
        save(all);
    },
    /* ================= MOVES ================= */
    addMove(itemId, move) {
        const all = load();
        const index = all.findIndex((x) => x.id === itemId);
        if (index === -1)
            return;
        const it = normalizeItem(all[index]);
        const m = normalizeMove(move);
        const delta = m.dir === "IN" ? m.qty : -m.qty;
        it.moves = [m, ...(it.moves ?? [])];
        it.stock = Math.max(0, (it.stock || 0) + delta);
        it.updatedAt = Date.now();
        all[index] = it;
        save(all);
        return m;
    },
    /* ================= ATTACHMENTS ================= */
    async attach(itemId, file) {
        const all = load();
        const index = all.findIndex((x) => x.id === itemId);
        if (index === -1)
            return null;
        const it = normalizeItem(all[index]);
        const dataURL = await new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.readAsDataURL(file);
        });
        const attachment = {
            id: crypto.randomUUID(),
            name: file.name,
            mime: file.type,
            size: file.size,
            dataURL,
        };
        it.attachments = [attachment, ...(it.attachments ?? [])];
        it.updatedAt = Date.now();
        all[index] = it;
        save(all);
        return attachment;
    },
    /* ================= CSV ================= */
    exportCSV(rows) {
        const header = "id;name;code;projectId;location;unit;stock;minStock;priceNet;supplier";
        const body = rows
            .map((r) => {
            const it = normalizeItem(r);
            return [
                it.id,
                esc(it.name || ""),
                esc(it.code || ""),
                it.projectId ?? "",
                esc(it.location || ""),
                it.unit ?? "",
                it.stock ?? 0,
                it.minStock ?? 0,
                it.priceNet ?? 0,
                esc(it.supplier || ""),
            ].join(";");
        })
            .join("\n");
        return header + "\n" + body;
    },
    importCSV(txt) {
        if (!txt)
            return 0;
        const lines = txt.split(/\r?\n/).filter(Boolean);
        if (lines.length <= 1)
            return 0;
        const rows = lines.slice(1).map((l) => l.split(";"));
        const all = load();
        let count = 0;
        for (const r of rows) {
            try {
                const item = normalizeItem({
                    id: r[0] || crypto.randomUUID(),
                    name: unesc(r[1] || ""),
                    code: unesc(r[2] || ""),
                    projectId: r[3] || undefined,
                    location: unesc(r[4] || ""),
                    unit: r[5] || "Stk",
                    stock: Number(r[6] || 0),
                    minStock: Number(r[7] || 0),
                    priceNet: Number(r[8] || 0),
                    supplier: unesc(r[9] || ""),
                    moves: [],
                    attachments: [],
                    updatedAt: Date.now(),
                });
                const index = all.findIndex((x) => x.id === item.id);
                if (index >= 0) {
                    all[index] = item;
                }
                else {
                    all.push(item);
                }
                count++;
            }
            catch {
                // skip row
            }
        }
        save(all);
        return count;
    },
    /* ================= JSON ================= */
    exportJSON() {
        return JSON.stringify(load());
    },
    importJSON(txt) {
        try {
            const data = JSON.parse(txt || "[]");
            const normalized = data.map(normalizeItem);
            save(normalized);
            return normalized.length;
        }
        catch {
            return 0;
        }
    },
};
