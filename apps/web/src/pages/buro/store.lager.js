const KEY_ITEMS = "rlc-lager-items";
const KEY_POS = "rlc-lager-pos";
/* ================= LOAD / SAVE ================= */
const loadItems = () => {
    try {
        const raw = localStorage.getItem(KEY_ITEMS);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
const saveItems = (rows) => {
    localStorage.setItem(KEY_ITEMS, JSON.stringify(rows));
};
const loadPOs = () => {
    try {
        const raw = localStorage.getItem(KEY_POS);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
const savePOs = (rows) => {
    localStorage.setItem(KEY_POS, JSON.stringify(rows));
};
/* ================= HELPERS ================= */
function esc(s) {
    return (s || "").replace(/;/g, ",").replace(/\n/g, " ");
}
function asString(v) {
    return typeof v === "string" ? v : "";
}
function asOptionalString(v) {
    return typeof v === "string" && v.trim() ? v : undefined;
}
function normalizeItem(it) {
    const raw = it;
    const normalized = {
        id: it.id || crypto.randomUUID(),
        name: it.name || "",
        sku: it.sku || "",
        location: it.location || "",
        price: Number.isFinite(it.price) ? it.price : 0,
        stock: Number.isFinite(it.stock) ? it.stock : 0,
        minStock: Number.isFinite(it.minStock) ? it.minStock : 0,
        updatedAt: it.updatedAt || Date.now(),
    };
    if (raw.projectId) {
        normalized.projectId = raw.projectId;
    }
    return normalized;
}
function normalizePO(po) {
    const raw = po;
    const normalized = {
        id: po.id || crypto.randomUUID(),
        number: po.number || `PO-${Date.now()}`,
        vendor: po.vendor || "",
        status: po.status || "Entwurf",
        deliveryDate: po.deliveryDate || "",
        lines: Array.isArray(po.lines) ? po.lines : [],
        updatedAt: po.updatedAt || Date.now(),
    };
    if (raw.projectId) {
        normalized.projectId = raw.projectId;
    }
    return normalized;
}
/* ================= DB ================= */
export const LagerDB = {
    /* ================= ITEMS ================= */
    listItems() {
        return loadItems()
            .map(normalizeItem)
            .sort((a, b) => asString(a.name).localeCompare(asString(b.name)));
    },
    createItem(projectId) {
        const base = {
            id: crypto.randomUUID(),
            name: "",
            sku: "",
            location: "",
            price: 0,
            stock: 0,
            minStock: 0,
            updatedAt: Date.now(),
        };
        const pid = asOptionalString(projectId);
        if (pid)
            base.projectId = pid;
        const item = normalizeItem(base);
        const all = loadItems();
        all.push(item);
        saveItems(all);
        return item;
    },
    upsertItem(item) {
        const it = normalizeItem(item);
        const all = loadItems();
        const index = all.findIndex((x) => x.id === it.id);
        if (index >= 0) {
            all[index] = it;
        }
        else {
            all.push(it);
        }
        saveItems(all);
        return it;
    },
    removeItem(id) {
        const all = loadItems().filter((x) => x.id !== id);
        saveItems(all);
    },
    move(id, dir, qty) {
        if (!qty || qty <= 0)
            return;
        const all = loadItems();
        const index = all.findIndex((x) => x.id === id);
        if (index === -1)
            return;
        const it = normalizeItem(all[index]);
        const delta = dir === "IN" ? qty : -qty;
        it.stock = Math.max(0, (it.stock || 0) + delta);
        it.updatedAt = Date.now();
        all[index] = it;
        saveItems(all);
        return it;
    },
    exportCSV(rows) {
        const header = "id;name;sku;location;price;stock;minStock";
        const body = rows
            .map((r) => {
            const it = normalizeItem(r);
            return [
                it.id,
                esc(asString(it.name)),
                esc(asString(it.sku)),
                esc(asString(it.location)),
                it.price ?? 0,
                it.stock ?? 0,
                it.minStock ?? 0,
            ].join(";");
        })
            .join("\n");
        return header + "\n" + body;
    },
    /* ================= PURCHASE ORDERS ================= */
    listPOs() {
        return loadPOs()
            .map(normalizePO)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    createPO(projectId) {
        const base = {
            id: crypto.randomUUID(),
            number: `PO-${Date.now()}`,
            vendor: "",
            status: "Entwurf",
            deliveryDate: "",
            lines: [],
            updatedAt: Date.now(),
        };
        const pid = asOptionalString(projectId);
        if (pid)
            base.projectId = pid;
        const po = normalizePO(base);
        const all = loadPOs();
        all.push(po);
        savePOs(all);
        return po;
    },
    upsertPO(po) {
        const p = normalizePO(po);
        const all = loadPOs();
        const index = all.findIndex((x) => x.id === p.id);
        if (index >= 0) {
            all[index] = p;
        }
        else {
            all.push(p);
        }
        savePOs(all);
        return p;
    },
    removePO(id) {
        const all = loadPOs().filter((x) => x.id !== id);
        savePOs(all);
    },
};
