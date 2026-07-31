// apps/web/src/lib/buchhaltung/store.ts
// Stato "Buchhaltung" minimale ma completo, senza dipendenze esterne.
// Espone: BH.getState(), BH.setState(), BH.subscribe(), BH.use(selector),
// e alcuni selettori/utility per la pagina "reports".

import { useEffect, useMemo, useReducer } from "react";

/* ----------------------------- Tipi di dominio ---------------------------- */

export type Currency = number; // memorizziamo EUR come numero (2 decimali nel render)

export interface Invoice {
  id: string;
  projectId: string;
  date: string; // ISO yyyy-mm-dd
  dueDate: string; // ISO
  customer: string;
  net: Currency;
  vat: Currency; // es. 0.19 * net
  gross: Currency; // net + vat
  paid: Currency; // somma pagamenti registrati
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

/* ------------------------------ Dati di demo ------------------------------ */

const demoProjects: Project[] = [
  { id: "P001", name: "TW-BA-III – Erneuerung Trinkwasserleitung BA III", customer: "Stadtwerke" },
  { id: "P002", name: "Asphaltdecke Sanierung", customer: "Tiefbauamt" },
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
  { id: "Z-0001", invoiceId: "RE-2025-0002", date: "2025-09-25", amount: 12000, method: "bank" },
];

/* ------------------------------ Store semplice --------------------------- */

type Listener = () => void;

const listeners = new Set<Listener>();

let state: State = {
  invoices: demoInvoices,
  payments: demoPayments,
  projects: demoProjects,
  lastUpdated: new Date().toISOString(),
};

function notify() {
  state.lastUpdated = new Date().toISOString();
  listeners.forEach((l) => l());
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/* --------------------------- API di mutazione/base ------------------------ */

function getState(): State {
  return state;
}

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  recompute(); // riallinea status fatture dopo ogni modifica
  notify();
}

function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ------------------------------ Logica/derive ---------------------------- */

function recompute() {
  // ricalcola 'paid' e 'status' delle fatture
  const paidByInv = new Map<string, number>();
  for (const p of state.payments) {
    paidByInv.set(p.invoiceId, round2((paidByInv.get(p.invoiceId) || 0) + p.amount));
  }
  state.invoices = state.invoices.map((inv) => {
    const paid = paidByInv.get(inv.id) || 0;
    const status: Invoice["status"] = paid >= inv.gross ? "paid" : paid > 0 ? "partial" : "open";
    return { ...inv, paid: round2(paid), status };
  });
}

recompute();

/* ------------------------------ Selettori utili -------------------------- */

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
  const rows = Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, v]) => ({
      month,
      billed: round2(v.billed),
      paid: round2(v.paid),
      openDelta: round2(v.billed - v.paid),
    }));
  return rows;
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

/* ------------------------------ Operazioni API --------------------------- */

function addInvoice(inv: Omit<Invoice, "paid" | "status">) {
  const exists = state.invoices.some((i) => i.id === inv.id);
  if (exists) throw new Error("Invoice ID bereits vorhanden.");
  state.invoices = state.invoices.concat({ ...inv, paid: 0, status: "open" });
  notify();
}

function recordPayment(p: Payment) {
  state.payments = state.payments.concat(p);
  recompute();
  notify();
}

/* ------------------------------ Hook React -------------------------------- */

function useBH<T>(selector: (s: State) => T): T {
  // trigger re-render su ogni notify()
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    return subscribe(() => force());
  }, []);
  return useMemo(() => selector(state), [state.lastUpdated]); // dipende dall’ultimo update
}

/* --------------------------------- Export --------------------------------- */

export const BH = {
  // stato / base
  getState,
  setState,
  subscribe,

  // hook
  use: useBH,

  // selettori
  openItems,
  overdue,
  totals,
  monthlySummary,
  kpi,

  // operazioni
  addInvoice,
  recordPayment,
};

export default BH;
