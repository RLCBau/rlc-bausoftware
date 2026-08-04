const KEY = "rlc-gantt-db";
/* ================= LOAD / SAVE ================= */
const load = () => {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed;
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
function normalizeTask(t) {
    return {
        id: t.id || crypto.randomUUID(),
        name: t.name || "Neuer Vorgang",
        projectId: t.projectId || undefined,
        start: t.start || new Date().toISOString(),
        end: t.end || new Date().toISOString(),
        progress: Number.isFinite(t.progress) ? t.progress : 0,
        dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
        notes: t.notes || "",
    };
}
/* ================= DB ================= */
export const GanttDB = {
    list() {
        return load();
    },
    create(projectId) {
        const now = new Date();
        const end = new Date(now.getTime() + 3 * 86400000);
        const task = normalizeTask({
            id: crypto.randomUUID(),
            name: "Neuer Vorgang",
            projectId,
            start: now.toISOString(),
            end: end.toISOString(),
            progress: 0,
            dependsOn: [],
            notes: "",
        });
        const all = load();
        all.push(task);
        save(all);
        return task;
    },
    remove(id) {
        const all = load().filter((x) => x.id !== id);
        save(all);
    },
    upsert(task) {
        const t = normalizeTask(task);
        const all = load();
        const index = all.findIndex((x) => x.id === t.id);
        if (index >= 0) {
            all[index] = t;
        }
        else {
            all.push(t);
        }
        save(all);
        return t;
    },
    /* ================= CSV ================= */
    exportCSV(rows) {
        const header = "id;name;projectId;start;end;progress;dependsOn;notes";
        const body = rows
            .map((r) => {
            const t = normalizeTask(r);
            return [
                t.id,
                esc(t.name),
                t.projectId ?? "",
                t.start,
                t.end,
                t.progress ?? 0,
                (t.dependsOn ?? []).join("|"),
                esc(t.notes ?? ""),
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
                const task = normalizeTask({
                    id: r[0] || crypto.randomUUID(),
                    name: unesc(r[1] || ""),
                    projectId: r[2] || undefined,
                    start: r[3] || new Date().toISOString(),
                    end: r[4] || new Date().toISOString(),
                    progress: Number(r[5] || 0),
                    dependsOn: (r[6] || "").split("|").filter(Boolean),
                    notes: unesc(r[7] || ""),
                });
                const index = all.findIndex((x) => x.id === task.id);
                if (index >= 0) {
                    all[index] = task;
                }
                else {
                    all.push(task);
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
};
