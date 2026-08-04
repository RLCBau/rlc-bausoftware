const KEY = "rlc_buro_projekte_v1";
/* ================= LOAD / SAVE ================= */
function read() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw)
            return demo();
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(normalize) : demo();
    }
    catch {
        return demo();
    }
}
function write(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
}
/* ================= HELPERS ================= */
function nowISO() {
    return new Date().toISOString();
}
function normalize(p) {
    const now = nowISO();
    return {
        id: p.id || crypto.randomUUID(),
        name: p.name || "Neues Projekt",
        baustellenNummer: p.baustellenNummer || "",
        bauleiter: p.bauleiter || "",
        ort: p.ort || "",
        status: p.status === "archiv" ? "archiv" : "aktiv",
        createdAt: p.createdAt || now,
        updatedAt: p.updatedAt || now,
    };
}
function demo() {
    const now = nowISO();
    return [
        normalize({
            id: crypto.randomUUID(),
            name: "TW-Leitung BA III – Musterstadt",
            baustellenNummer: "2025-0123",
            bauleiter: "M. Huber",
            ort: "Musterstadt",
            status: "aktiv",
            createdAt: now,
            updatedAt: now,
        }),
        normalize({
            id: crypto.randomUUID(),
            name: "Parkplatz Sanierung Süd",
            baustellenNummer: "2025-0042",
            bauleiter: "A. König",
            ort: "Bergdorf",
            status: "archiv",
            createdAt: now,
            updatedAt: now,
        }),
    ];
}
/* ================= DB ================= */
export const ProjekteDB = {
    list() {
        return read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    get(id) {
        return read().find((p) => p.id === id);
    },
    upsert(project) {
        const p = normalize(project);
        const all = read();
        const index = all.findIndex((x) => x.id === p.id);
        if (index >= 0) {
            all[index] = { ...p, updatedAt: nowISO() };
        }
        else {
            all.unshift({
                ...p,
                createdAt: nowISO(),
                updatedAt: nowISO(),
            });
        }
        write(all);
        return p;
    },
    create(partial) {
        const now = nowISO();
        const p = normalize({
            id: crypto.randomUUID(),
            name: partial?.name ?? "Neues Projekt",
            baustellenNummer: partial?.baustellenNummer ?? "",
            bauleiter: partial?.bauleiter ?? "",
            ort: partial?.ort ?? "",
            status: partial?.status ?? "aktiv",
            createdAt: now,
            updatedAt: now,
        });
        const all = read();
        all.unshift(p);
        write(all);
        return p;
    },
    remove(id) {
        const all = read().filter((p) => p.id !== id);
        write(all);
    },
    /* ================= CSV ================= */
    importCSV(csv) {
        if (!csv)
            return 0;
        const rows = csv.split(/\r?\n/).filter(Boolean).slice(1);
        const all = read();
        let count = 0;
        for (const line of rows) {
            try {
                const cols = line
                    .split(";")
                    .map((c) => c.replace(/^"|"$/g, "").replace(/""/g, `"`));
                const [name, nr, ort, bauleiter, status] = cols;
                const p = normalize({
                    id: crypto.randomUUID(),
                    name: name || "Importiertes Projekt",
                    baustellenNummer: nr || "",
                    ort: ort || "",
                    bauleiter: bauleiter || "",
                    status: status === "archiv" ? "archiv" : "aktiv",
                    createdAt: nowISO(),
                    updatedAt: nowISO(),
                });
                all.unshift(p);
                count++;
            }
            catch {
                // skip row
            }
        }
        write(all);
        return count;
    },
    exportCSV(list) {
        const header = `"Name";"BaustellenNr";"Ort";"Bauleiter";"Status";"Erstellt";"Geändert"`;
        const lines = list.map((p) => {
            const pr = normalize(p);
            return [
                pr.name,
                pr.baustellenNummer ?? "",
                pr.ort ?? "",
                pr.bauleiter ?? "",
                pr.status,
                pr.createdAt,
                pr.updatedAt,
            ]
                .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                .join(";");
        });
        return [header, ...lines].join("\r\n");
    },
};
