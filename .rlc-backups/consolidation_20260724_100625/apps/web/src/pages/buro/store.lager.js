const KEY_ITEMS = "rlc-lager-items";
const KEY_POS = "rlc-lager-pos";
const loadI = () => JSON.parse(localStorage.getItem(KEY_ITEMS) || "[]");
const saveI = (a) => localStorage.setItem(KEY_ITEMS, JSON.stringify(a));
const loadP = () => JSON.parse(localStorage.getItem(KEY_POS) || "[]");
const saveP = (a) => localStorage.setItem(KEY_POS, JSON.stringify(a));
export const LagerDB = {
    // Items
    listItems() { return loadI().sort((a, b) => (a.name || "").localeCompare(b.name || "")); },
    createItem() {
        const it = { id: crypto.randomUUID(), name: "", sku: "", location: "", price: 0, stock: 0, minStock: 0, updatedAt: Date.now() };
        const all = loadI();
        all.push(it);
        saveI(all);
        return it;
    },
    upsertItem(it) { const all = loadI(); const i = all.findIndex(x => x.id === it.id); if (i >= 0)
        all[i] = it;
    else
        all.push(it); saveI(all); },
    removeItem(id) { saveI(loadI().filter(x => x.id !== id)); },
    move(id, dir, qty) { const all = loadI(); const it = all.find(x => x.id === id); if (!it)
        return; it.stock = (it.stock || 0) + (dir === "IN" ? qty : -qty); it.updatedAt = Date.now(); saveI(all); },
    exportCSV(rows) {
        const h = "id;name;sku;location;price;stock;minStock";
        const b = rows.map(r => [r.id, esc(r.name || ""), esc(r.sku || ""), esc(r.location || ""), r.price ?? 0, r.stock ?? 0, r.minStock ?? 0].join(";")).join("\n");
        return h + "\n" + b;
    },
    // POs
    listPOs() { return loadP().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); },
    createPO() {
        const p = { id: crypto.randomUUID(), number: `PO-${Date.now()}`, vendor: "", status: "Entwurf", deliveryDate: "", lines: [], updatedAt: Date.now() };
        const all = loadP();
        all.push(p);
        saveP(all);
        return p;
    },
    upsertPO(po) { const all = loadP(); const i = all.findIndex(x => x.id === po.id); if (i >= 0)
        all[i] = po;
    else
        all.push(po); saveP(all); },
    removePO(id) { saveP(loadP().filter(x => x.id !== id)); },
};
function esc(s) { return (s || "").replace(/;/g, ","); }
