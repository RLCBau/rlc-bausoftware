// apps/web/src/lib/buchhaltung/store.ts
// Stato "Buchhaltung" minimale ma completo, senza dipendenze esterne.
// Espone: BH.getState(), BH.setState(), BH.subscribe(), BH.use(selector),
// e alcuni selettori/utility per la pagina "reports".

import { useEffect, useReducer } from "react";

/* ----------------------------- Tipi di dominio ---------------------------- */

export type Currency = number; // EUR come numero, formattato nel render

export interface Invoice {
  id: string;
  projectId: string;
  date: string; // ISO yyyy-mm-dd
  dueDate: string; // ISO
  customer: string;
  net: Currency;
  vat: Currency;
  gross: Currency;
  paid: Currency;
  status: "open" | "partial" | "paid";
  costCenter?: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  date: string; // ISO
  amount: Currency;
  method?: "bank" | "cash" | "other";
}

export interface Project {
  id: string;
  name: string;
  customer: string;
  costCenter?: string;
}

export interface State {
  invoices: Invoice[];
  payments: Payment[];
  projects: Project[];
  lastUpdated: string;
}

/* ------------------------------ Dati demo -------------------------------- */

const STORAGE_KEY = "rlc.buchhaltung.store.v1";

const demoProjects: Project[] = [
  {
    id: "P001",
    name: "TW-BA-III – Erneuerung Trinkwasserleitung BA III",
    customer: "Stadtwerke",
  },
  {
    id: "P002",
    name: "Asphaltdecke Sanierung",
    customer: "Tiefbauamt",
  },
];

const demoInvoices: Invoice[] = [
  {
    id: "RE-2025-0001",
    projectId: "P001",
    date: "2025-09-05",
    dueDate: "2025-10-05",
    customer: "Stadtwerke",
    net: 12500,
    vat: 2375,
    gross: 14875,
    paid: 0,
    status: "open",
    costCenter: "1000",
  },
  {
    id: "RE-2025-0002",
    projectId: "P002",
    date: "2025-09-18",
    dueDate: "2025-10-18",
    customer: "Tiefbauamt",
    net: 41000,
    vat: 7790,
    gross: 48790,
    paid: 12000,
    status: "partial",
    costCenter: "2000",
  },
];

const demoPayments: Payment[] = [
  {
    id: "Z-0001",
    invoiceId: "RE-2025-0002",
    date: "2025-09-25",
    amount: 12000,
    method: "bank",
  },
];

/* ------------------------------ Helpers ---------------------------------- */

type Listener = () => void;

const listeners = new Set<Listener>();

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function createDemoState(): State {
  return {
    invoices: demoInvoices,
    payments: demoPayments,
    projects: demoProjects,
    lastUpdated: new Date().toISOString(),
  };
}

function safeLoad(): State | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as State;
    if (!parsed || !Array.isArray(parsed.invoices) || !Array.isArray(parsed.payments) || !Array.isArray(parsed.projects)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persist(next: State) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore localStorage quota / private mode
  }
}

function recomputeState(base: State): State {
  const paidByInv = new Map<string, number>();

  for (const p of base.payments) {
    paidByInv.set(p.invoiceId, round2((paidByInv.get(p.invoiceId) || 0) + p.amount));
  }

  const invoices = base.invoices.map((inv) => {
    const paid = round2(paidByInv.get(inv.id) || 0);
    const status: Invoice["status"] =
      paid >= inv.gross ? "paid" : paid > 0 ? "partial" : "open";

    return {
      ...inv,
      paid,
      status,
    };
  });

  return {
    ...base,
    invoices,
    lastUpdated: new Date().toISOString(),
  };
}

/* ------------------------------ Store ------------------------------------ */

let state: State = recomputeState(safeLoad() || createDemoState());

function notify() {
  persist(state);
  listeners.forEach((l) => l());
}

function getState(): State {
  return state;
}

function setState(patch: Partial<State>) {
  state = recomputeState({
    ...state,
    ...patch,
  });
  notify();
}

function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/* ------------------------------ Selettori -------------------------------- */

function openItems() {
  return state.invoices.filter((i) => i.status !== "paid");
}

function overdue(referenceDate = new Date()) {
  const ref = referenceDate.toISOString().slice(0, 10);
  return state.invoices.filter((i) => i.status !== "paid" && i.dueDate < ref);
}

function totals() {
  const sumGross = state.invoices.reduce((a, i) => a + i.gross, 0);
  const sumPaid = state.invoices.reduce((a, i) => a + i.paid, 0);

  return {
    invoicesGross: round2(sumGross),
    invoicesPaid: round2(sumPaid),
    invoicesOpen: round2(sumGross - sumPaid),
  };
}

function monthlyKey(isoDate: string) {
  return isoDate.slice(0, 7); // yyyy-mm
}

function monthlySummary(year?: number) {
  const map = new Map<string, { billed: number; paid: number }>();

  for (const inv of state.invoices) {
    const key = monthlyKey(inv.date);
    if (year && !key.startsWith(String(year))) continue;

    const bucket = map.get(key) || { billed: 0, paid: 0 };
    bucket.billed += inv.gross;
    map.set(key, bucket);
  }

  for (const p of state.payments) {
    const key = monthlyKey(p.date);
    if (year && !key.startsWith(String(year))) continue;

    const bucket = map.get(key) || { billed: 0, paid: 0 };
    bucket.paid += p.amount;
    map.set(key, bucket);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      billed: round2(v.billed),
      paid: round2(v.paid),
      openDelta: round2(v.billed - v.paid),
    }));
}

function kpi() {
  const t = totals();
  const open = openItems();
  const overdueCount = overdue().length;
  const avgInvoice =
    state.invoices.length > 0 ? round2(t.invoicesGross / state.invoices.length) : 0;

  return {
    ...t,
    invoicesCount: state.invoices.length,
    openCount: open.length,
    overdueCount,
    avgInvoice,
  };
}

/* ------------------------------ Operazioni -------------------------------- */

function addInvoice(inv: Omit<Invoice, "paid" | "status">) {
  const exists = state.invoices.some((i) => i.id === inv.id);
  if (exists) throw new Error("Invoice ID bereits vorhanden.");

  state = recomputeState({
    ...state,
    invoices: state.invoices.concat({
      ...inv,
      paid: 0,
      status: "open",
    }),
  });

  notify();
}

function recordPayment(p: Payment) {
  const invoiceExists = state.invoices.some((i) => i.id === p.invoiceId);
  if (!invoiceExists) throw new Error("Rechnung nicht gefunden.");

  state = recomputeState({
    ...state,
    payments: state.payments.concat(p),
  });

  notify();
}

function resetDemo() {
  state = recomputeState(createDemoState());
  notify();
}

/* ------------------------------ Hook React -------------------------------- */

function useBH<T>(selector: (s: State) => T): T {
  const [, force] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    return subscribe(() => force());
  }, []);

  return selector(state);
}

/* -------------------------------- Export ---------------------------------- */

export const BH = {
  getState,
  setState,
  subscribe,

  use: useBH,

  openItems,
  overdue,
  totals,
  monthlySummary,
  kpi,

  addInvoice,
  recordPayment,
  resetDemo,
};

export default BH;





