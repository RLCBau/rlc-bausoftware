const KEY = "rlc-users-db";
const load = () => JSON.parse(localStorage.getItem(KEY) || "[]");
const save = (a) => localStorage.setItem(KEY, JSON.stringify(a));
export const UserDB = {
    list() { return load().sort((a, b) => a.name.localeCompare(b.name)); },
    create() {
        const u = {
            id: crypto.randomUUID(), name: "", email: "", role: "Mitarbeiter", active: true, rights: []
        };
        const all = load();
        all.push(u);
        save(all);
        return u;
    },
    remove(id) { save(load().filter(x => x.id !== id)); },
    upsert(u) {
        const all = load();
        const i = all.findIndex(x => x.id === u.id);
        if (i >= 0)
            all[i] = u;
        else
            all.push(u);
        save(all);
    }
};
