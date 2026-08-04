const KEY = "rlc-komms-db";
/* ================= LOAD / SAVE ================= */
function load() {
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
}
function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
}
/* ================= HELPERS ================= */
function normalizeThread(t) {
    return {
        id: t.id || crypto.randomUUID(),
        subject: t.subject || "",
        projectId: t.projectId || undefined, // future API ready
        participants: Array.isArray(t.participants) ? t.participants : [],
        messages: Array.isArray(t.messages) ? t.messages : [],
        attachments: Array.isArray(t.attachments) ? t.attachments : [],
        unreadCount: Number.isFinite(t.unreadCount) ? t.unreadCount : 0,
        updatedAt: t.updatedAt || Date.now(),
    };
}
/* ================= DB ================= */
export const KommsDB = {
    list() {
        return load()
            .map(normalizeThread)
            .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    createThread(projectId) {
        const thread = normalizeThread({
            id: crypto.randomUUID(),
            subject: "",
            projectId,
            participants: [],
            messages: [],
            attachments: [],
            unreadCount: 0,
            updatedAt: Date.now(),
        });
        const all = load();
        all.push(thread);
        save(all);
        return thread;
    },
    removeThread(id) {
        const all = load().filter((x) => x.id !== id);
        save(all);
    },
    upsertThread(thread) {
        const t = normalizeThread(thread);
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
    addMessage(threadId, msg) {
        const all = load();
        const index = all.findIndex((x) => x.id === threadId);
        if (index === -1)
            return;
        const t = normalizeThread(all[index]);
        const message = {
            ...msg,
            id: msg.id || crypto.randomUUID(),
            createdAt: msg.createdAt || Date.now(),
        };
        t.messages = [message, ...(t.messages ?? [])];
        t.unreadCount = 0;
        t.updatedAt = Date.now();
        all[index] = t;
        save(all);
        return message;
    },
    markAsRead(threadId) {
        const all = load();
        const index = all.findIndex((x) => x.id === threadId);
        if (index === -1)
            return;
        const t = normalizeThread(all[index]);
        t.unreadCount = 0;
        all[index] = t;
        save(all);
    },
    async attach(threadId, file) {
        const all = load();
        const index = all.findIndex((x) => x.id === threadId);
        if (index === -1)
            return null;
        const t = normalizeThread(all[index]);
        const buf = await file.arrayBuffer();
        const blob = new Blob([buf], { type: file.type });
        const dataURL = await new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.readAsDataURL(blob);
        });
        const att = {
            id: crypto.randomUUID(),
            name: file.name,
            mime: file.type,
            size: file.size,
            dataURL,
        };
        t.attachments = [att, ...(t.attachments ?? [])];
        t.updatedAt = Date.now();
        all[index] = t;
        save(all);
        return att;
    },
};
