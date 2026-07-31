// apps/web/src/lib/buro/store.ts
// Store minimalista per il modulo "Büro / Verwaltung".
// Nessuna dipendenza: fornisce BuroAPI con stato, CRUD e un hook React reattivo.
import { useEffect, useMemo, useReducer } from "react";
/* ------------------------------- Dati demo ------------------------------- */
const now = () => new Date().toISOString();
const demoDocs = [
    {
        id: "D-0001",
        projectId: "P001",
        name: "Bauvertrag",
        fileName: "bauvertrag.pdf",
        mime: "application/pdf",
        size: 182400,
        uploadedAt: now(),
        tags: ["Vertrag", "P001"],
        author: "Büro",
        url: "#",
    },
    {
        id: "D-0002",
        projectId: "P001",
        name: "LV – Positionen",
        fileName: "lv_p001.xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 92311,
        uploadedAt: now(),
        tags: ["LV", "Kalkulation"],
        author: "Kalkulation",
        url: "#",
    },
    {
        id: "D-0003",
        projectId: "P002",
        name: "Fotodokumentation Woche 39",
        fileName: "fotos_w39.zip",
        mime: "application/zip",
        size: 8122933,
        uploadedAt: now(),
        tags: ["Foto", "Baustelle", "P002"],
        author: "Bauleitung",
        url: "#",
    },
];
const demoTasks = [
    { id: "T-0001", title: "Rechnung RE-2025-0002 prüfen", due: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), done: false, assignee: "Anna", priority: "high", tags: ["Buchhaltung"] },
    { id: "T-0002", title: "Bauzeitenplan aktualisieren", due: new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10), done: false, assignee: "Marco", projectId: "P001", priority: "med" },
    { id: "T-0003", title: "LV mit Auftraggeber abstimmen", done: true, assignee: "Luca", projectId: "P001", priority: "low", tags: ["LV"] },
];
const demoContacts = [
    { id: "C-001", name: "Stadtwerke – Vergabe", email: "vergabe@stadtwerke.de", phone: "+49 89 1234 567", company: "Stadtwerke", role: "AG" },
    { id: "C-002", name: "Ingenieurbüro PlanX", email: "info@planx.de", phone: "+49 89 555 77", company: "PlanX", role: "Planer" },
];
const demoNotes = [
    { id: "N-001", date: now(), text: "Jour Fixe Protokoll – Abstimmung Änderungsanzeige 3.", projectId: "P001", tags: ["Protokoll"], author: "Bauleitung" },
];
const demoEvents = [
    { id: "E-001", title: "Bauabnahme Teilabschnitt", start: new Date(Date.now() + 7 * 864e5).toISOString(), location: "Baustelle P002", projectId: "P002" },
];
const listeners = new Set();
let state = {
    docs: demoDocs,
    tasks: demoTasks,
    contacts: demoContacts,
    notes: demoNotes,
    events: demoEvents,
    lastUpdated: now(),
};
function notify() {
    state.lastUpdated = now();
    listeners.forEach((l) => l());
}
export function getState() {
    return state;
}
export function setState(patch) {
    state = { ...state, ...patch };
    notify();
}
export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
/* ------------------------------- Utilities ------------------------------- */
const id = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
function byProject(items, projectId) {
    return projectId ? items.filter((i) => i.projectId === projectId) : items;
}
/* --------------------------------- CRUD ---------------------------------- */
// Documenti
function addDocument(doc) {
    const newDoc = { id: id("D"), uploadedAt: now(), ...doc };
    state.docs = [newDoc, ...state.docs];
    notify();
    return newDoc;
}
function updateDocument(docId, patch) {
    state.docs = state.docs.map((d) => (d.id === docId ? { ...d, ...patch } : d));
    notify();
}
function removeDocument(docId) {
    state.docs = state.docs.filter((d) => d.id !== docId);
    notify();
}
function listDocuments(opts) {
    let items = state.docs.slice();
    if (opts?.projectId)
        items = items.filter((d) => d.projectId === opts.projectId);
    if (opts?.tag)
        items = items.filter((d) => d.tags.includes(opts.tag));
    if (opts?.text) {
        const q = opts.text.toLowerCase();
        items = items.filter((d) => d.name.toLowerCase().includes(q) ||
            d.fileName.toLowerCase().includes(q) ||
            d.tags.join(" ").toLowerCase().includes(q));
    }
    return items;
}
// Task
function addTask(t) {
    const task = { id: id("T"), done: false, ...t };
    state.tasks = [task, ...state.tasks];
    notify();
    return task;
}
function toggleTask(taskId, value) {
    state.tasks = state.tasks.map((t) => t.id === taskId ? { ...t, done: value ?? !t.done } : t);
    notify();
}
function updateTask(taskId, patch) {
    state.tasks = state.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t));
    notify();
}
function listTasks(filter) {
    let items = state.tasks.slice();
    if (filter?.projectId)
        items = items.filter((t) => t.projectId === filter.projectId);
    if (filter?.openOnly)
        items = items.filter((t) => !t.done);
    if (filter?.tag)
        items = items.filter((t) => (t.tags || []).includes(filter.tag));
    return items;
}
// Contatti
function addContact(c) {
    const contact = { id: id("C"), ...c };
    state.contacts = [contact, ...state.contacts];
    notify();
    return contact;
}
function updateContact(contactId, patch) {
    state.contacts = state.contacts.map((c) => (c.id === contactId ? { ...c, ...patch } : c));
    notify();
}
function listContacts(text) {
    let items = state.contacts.slice();
    if (text) {
        const q = text.toLowerCase();
        items = items.filter((c) => c.name.toLowerCase().includes(q) ||
            (c.company || "").toLowerCase().includes(q) ||
            (c.email || "").toLowerCase().includes(q));
    }
    return items;
}
// Note
function addNote(n) {
    const note = { id: id("N"), date: n.date ?? now(), ...n };
    state.notes = [note, ...state.notes];
    notify();
    return note;
}
function listNotes(projectId) {
    return byProject(state.notes, projectId);
}
// Eventi
function addEvent(e) {
    const ev = { id: id("E"), ...e };
    state.events = [ev, ...state.events];
    notify();
    return ev;
}
function listEvents(projectId) {
    return byProject(state.events, projectId);
}
/* --------------------------------- KPI ----------------------------------- */
function kpi() {
    const totalDocs = state.docs.length;
    const totalSize = state.docs.reduce((a, d) => a + (d.size || 0), 0);
    const openTasks = state.tasks.filter((t) => !t.done).length;
    const eventsNext7 = state.events.filter((e) => {
        const s = new Date(e.start).getTime();
        const now = Date.now();
        const in7 = now + 7 * 864e5;
        return s >= now && s <= in7;
    }).length;
    return {
        totalDocs,
        totalSize, // bytes
        openTasks,
        eventsNext7,
    };
}
/* ------------------------------- Hook React ------------------------------ */
function useBuro(selector) {
    const [, force] = useReducer((x) => x + 1, 0);
    useEffect(() => subscribe(() => force()), []);
    // Ricalcolo memorizzato: dipende solo dall'ultimo timestamp
    return useMemo(() => selector(state), [state.lastUpdated]);
}
/* --------------------------------- Export -------------------------------- */
export const BuroAPI = {
    // base
    getState,
    setState,
    subscribe,
    use: useBuro,
    // documenti
    addDocument,
    updateDocument,
    removeDocument,
    listDocuments,
    // tasks
    addTask,
    toggleTask,
    updateTask,
    listTasks,
    // contatti
    addContact,
    updateContact,
    listContacts,
    // note
    addNote,
    listNotes,
    // eventi
    addEvent,
    listEvents,
    // kpi
    kpi,
};
export default BuroAPI;
