const KEY = "rlc-komms-db";
function load() {
    try {
        const s = localStorage.getItem(KEY);
        return s ? JSON.parse(s) : [];
    }
    catch {
        return [];
    }
}
function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
}
export const KommsDB = {
    list() {
        return load().sort((a, b) => b.updatedAt - a.updatedAt);
    },
    createThread() {
        const t = {
            id: crypto.randomUUID(),
            subject: "",
            participants: [],
            messages: [],
            attachments: [],
            unreadCount: 0,
            updatedAt: Date.now(),
        };
        const all = load();
        all.push(t);
        save(all);
        return t;
    },
    removeThread(id) {
        const all = load().filter((x) => x.id !== id);
        save(all);
    },
    upsertThread(t) {
        const all = load();
        const i = all.findIndex((x) => x.id === t.id);
        if (i >= 0)
            all[i] = t;
        else
            all.push(t);
        save(all);
    },
    addMessage(threadId, msg) {
        const all = load();
        const t = all.find((x) => x.id === threadId);
        if (!t)
            return;
        t.messages.unshift(msg);
        t.unreadCount = 0;
        t.updatedAt = Date.now();
        save(all);
    },
    async attach(threadId, f) {
        const buf = await f.arrayBuffer();
        const blob = new Blob([buf], { type: f.type });
        const dataURL = await new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.readAsDataURL(blob);
        });
        const att = {
            id: crypto.randomUUID(),
            name: f.name,
            mime: f.type,
            size: f.size,
            dataURL,
        };
        const all = load();
        const t = all.find((x) => x.id === threadId);
        if (!t)
            return;
        t.attachments = [att, ...(t.attachments ?? [])];
        t.updatedAt = Date.now();
        save(all);
    },
};
