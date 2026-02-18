// apps/web/src/lib/buro/store.ts
// Store minimalista per il modulo "Büro / Verwaltung".
// Nessuna dipendenza: fornisce BuroAPI con stato, CRUD e un hook React reattivo.

import { useEffect, useMemo, useReducer } from "react";

/* ------------------------------- Tipi base ------------------------------- */

export type Id = string;

export interface Doc {
  id: Id;
  projectId?: Id;
  name: string;
  fileName: string;
  mime: string;
  size: number; // bytes
  uploadedAt: string; // ISO
  tags: string[];
  author?: string;
  url?: string; // se presente, link a file
}

export interface Task {
  id: Id;
  title: string;
  due?: string; // ISO date
  done: boolean;
  assignee?: string;
  projectId?: Id;
  priority?: "low" | "med" | "high";
  tags?: string[];
}

export interface Contact {
  id: Id;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  notes?: string;
}

export interface Note {
  id: Id;
  date: string;
  text: string;
  projectId?: Id;
  tags?: string[];
  author?: string;
}

export interface CalendarEvent {
  id: Id;
  title: string;
  start: string; // ISO
  end?: string;  // ISO
  location?: string;
  projectId?: Id;
}

export interface BuroState {
  docs: Doc[];
  tasks: Task[];
  contacts: Contact[];
  notes: Note[];
  events: CalendarEvent[];
  lastUpdated: string;
}

/* ------------------------------- Dati demo ------------------------------- */

const now = () => new Date().toISOString();

const demoDocs: Doc[] = [
  {
    id: "D-0001",
    projectId: "P001",
    name: "Bauvertrag",
    fileName: "bauvertrag.pdf",
    mime: "application/pdf",
    size: 182_400,
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
    size: 92_311,
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
    size: 8_122_933,
    uploadedAt: now(),
    tags: ["Foto", "Baustelle", "P002"],
    author: "Bauleitung",
    url: "#",
  },
];

const demoTasks: Task[] = [
  { id: "T-0001", title: "Rechnung RE-2025-0002 prüfen", due: new Date(Date.now()+3*864e5).toISOString().slice(0,10), done: false, assignee: "Anna", priority: "high", tags: ["Buchhaltung"] },
  { id: "T-0002", title: "Bauzeitenplan aktualisieren", due: new Date(Date.now()+6*864e5).toISOString().slice(0,10), done: false, assignee: "Marco", projectId: "P001", priority: "med" },
  { id: "T-0003", title: "LV mit Auftraggeber abstimmen", done: true, assignee: "Luca", projectId: "P001", priority: "low", tags: ["LV"] },
];

const demoContacts: Contact[] = [
  { id: "C-001", name: "Stadtwerke – Vergabe", email: "vergabe@stadtwerke.de", phone: "+49 89 1234 567", company: "Stadtwerke", role: "AG" },
  { id: "C-002", name: "Ingenieurbüro PlanX", email: "info@planx.de", phone: "+49 89 555 77", company: "PlanX", role: "Planer" },
];

const demoNotes: Note[] = [
  { id: "N-001", date: now(), text: "Jour Fixe Protokoll – Abstimmung Änderungsanzeige 3.", projectId: "P001", tags: ["Protokoll"], author: "Bauleitung" },
];

const demoEvents: CalendarEvent[] = [
  { id: "E-001", title: "Bauabnahme Teilabschnitt", start: new Date(Date.now()+7*864e5).toISOString(), location: "Baustelle P002", projectId: "P002" },
];

/* --------------------------------- Store -------------------------------- */

type Listener = () => void;
const listeners = new Set<Listener>();

let state: BuroState = {
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

export function getState(): BuroState {
  return state;
}

export function setState(patch: Partial<BuroState>) {
  state = { ...state, ...patch };
  notify();
}

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ------------------------------- Utilities ------------------------------- */

const id = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

function byProject<T extends { projectId?: Id }>(items: T[], projectId?: Id) {
  return projectId ? items.filter((i) => i.projectId === projectId) : items;
}

/* --------------------------------- CRUD ---------------------------------- */
// Documenti
function addDocument(doc: Omit<Doc, "id" | "uploadedAt">) {
  const newDoc: Doc = { id: id("D"), uploadedAt: now(), ...doc };
  state.docs = [newDoc, ...state.docs];
  notify();
  return newDoc;
}

function updateDocument(docId: Id, patch: Partial<Doc>) {
  state.docs = state.docs.map((d) => (d.id === docId ? { ...d, ...patch } : d));
  notify();
}

function removeDocument(docId: Id) {
  state.docs = state.docs.filter((d) => d.id !== docId);
  notify();
}

function listDocuments(opts?: {
  projectId?: Id;
  tag?: string;
  text?: string;
}) {
  let items = state.docs.slice();
  if (opts?.projectId) items = items.filter((d) => d.projectId === opts.projectId);
  if (opts?.tag) items = items.filter((d) => d.tags.includes(opts.tag!));
  if (opts?.text) {
    const q = opts.text.toLowerCase();
    items = items.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.fileName.toLowerCase().includes(q) ||
        d.tags.join(" ").toLowerCase().includes(q)
    );
  }
  return items;
}

// Task
function addTask(t: Omit<Task, "id" | "done"> & { done?: boolean }) {
  const task: Task = { id: id("T"), done: false, ...t };
  state.tasks = [task, ...state.tasks];
  notify();
  return task;
}

function toggleTask(taskId: Id, value?: boolean) {
  state.tasks = state.tasks.map((t) =>
    t.id === taskId ? { ...t, done: value ?? !t.done } : t
  );
  notify();
}

function updateTask(taskId: Id, patch: Partial<Task>) {
  state.tasks = state.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t));
  notify();
}

function listTasks(filter?: { projectId?: Id; openOnly?: boolean; tag?: string }) {
  let items = state.tasks.slice();
  if (filter?.projectId) items = items.filter((t) => t.projectId === filter.projectId);
  if (filter?.openOnly) items = items.filter((t) => !t.done);
  if (filter?.tag) items = items.filter((t) => (t.tags || []).includes(filter.tag!));
  return items;
}

// Contatti
function addContact(c: Omit<Contact, "id">) {
  const contact: Contact = { id: id("C"), ...c };
  state.contacts = [contact, ...state.contacts];
  notify();
  return contact;
}
function updateContact(contactId: Id, patch: Partial<Contact>) {
  state.contacts = state.contacts.map((c) => (c.id === contactId ? { ...c, ...patch } : c));
  notify();
}
function listContacts(text?: string) {
  let items = state.contacts.slice();
  if (text) {
    const q = text.toLowerCase();
    items = items.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q)
    );
  }
  return items;
}

// Note
function addNote(n: Omit<Note, "id" | "date"> & { date?: string }) {
  const note: Note = { id: id("N"), date: n.date ?? now(), ...n };
  state.notes = [note, ...state.notes];
  notify();
  return note;
}

function listNotes(projectId?: Id) {
  return byProject(state.notes, projectId);
}

// Eventi
function addEvent(e: Omit<CalendarEvent, "id">) {
  const ev: CalendarEvent = { id: id("E"), ...e };
  state.events = [ev, ...state.events];
  notify();
  return ev;
}
function listEvents(projectId?: Id) {
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
    totalSize,    // bytes
    openTasks,
    eventsNext7,
  };
}

/* ------------------------------- Hook React ------------------------------ */

function useBuro<T>(selector: (s: BuroState) => T): T {
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
