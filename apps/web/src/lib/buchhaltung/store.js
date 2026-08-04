// apps/web/src/lib/buchhaltung/store.ts
// Stato "Buchhaltung" minimale ma completo, senza dipendenze esterne.
// Espone: BH.getState(), BH.setState(), BH.subscribe(), BH.use(selector),
// e alcuni selettori/utility per la pagina "reports".
import { useEffect, useReducer } from "react";
/* ------------------------------ Dati demo -------------------------------- */
const STORAGE_KEY = "rlc.buchhaltung.store.v1";
const demoProjects = [
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
const demoInvoices = [
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
const demoPayments = [
    {
        id: "Z-0001",
        invoiceId: "RE-2025-0002",
        date: "2025-09-25",
        amount: 12000,
        method: "bank",
    },
];
const listeners = new Set();
function round2(v) {
    return Math.round(v * 100) / 100;
}
function createDemoState() {
    return {
        invoices: demoInvoices,
        payments: demoPayments,
        projects: demoProjects,
        lastUpdated: new Date().toISOString(),
    };
}
function safeLoad() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.invoices) || !Array.isArray(parsed.payments) || !Array.isArray(parsed.projects)) {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function persist(next) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    catch {
        // ignore localStorage quota / private mode
    }
}
function recomputeState(base) {
    const paidByInv = new Map();
    for (const p of base.payments) {
        paidByInv.set(p.invoiceId, round2((paidByInv.get(p.invoiceId) || 0) + p.amount));
    }
    const invoices = base.invoices.map((inv) => {
        const paid = round2(paidByInv.get(inv.id) || 0);
        const status = paid >= inv.gross ? "paid" : paid > 0 ? "partial" : "open";
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
let state = recomputeState(safeLoad() || createDemoState());
function notify() {
    persist(state);
    listeners.forEach((l) => l());
}
function getState() {
    return state;
}
function setState(patch) {
    state = recomputeState({
        ...state,
        ...patch,
    });
    notify();
}
function subscribe(fn) {
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
function monthlyKey(isoDate) {
    return isoDate.slice(0, 7); // yyyy-mm
}
function monthlySummary(year) {
    const map = new Map();
    for (const inv of state.invoices) {
        const key = monthlyKey(inv.date);
        if (year && !key.startsWith(String(year)))
            continue;
        const bucket = map.get(key) || { billed: 0, paid: 0 };
        bucket.billed += inv.gross;
        map.set(key, bucket);
    }
    for (const p of state.payments) {
        const key = monthlyKey(p.date);
        if (year && !key.startsWith(String(year)))
            continue;
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
    const avgInvoice = state.invoices.length > 0 ? round2(t.invoicesGross / state.invoices.length) : 0;
    return {
        ...t,
        invoicesCount: state.invoices.length,
        openCount: open.length,
        overdueCount,
        avgInvoice,
    };
}
/* ------------------------------ Operazioni -------------------------------- */
function addInvoice(inv) {
    const exists = state.invoices.some((i) => i.id === inv.id);
    if (exists)
        throw new Error("Invoice ID bereits vorhanden.");
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
function recordPayment(p) {
    const invoiceExists = state.invoices.some((i) => i.id === p.invoiceId);
    if (!invoiceExists)
        throw new Error("Rechnung nicht gefunden.");
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
function useBH(selector) {
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
