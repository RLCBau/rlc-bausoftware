import React, { useEffect, useMemo, useState } from "react";
import {
  accountingApi,
  dateDe,
  euro,
  getAccountingProject
} from "./accountingApi";
import "./styles.css";

type PaymentForm = {
  date: string;
  direction: "IN" | "OUT";
  party: string;
  amount: number;
  method: string;
  purpose: string;
  refType: string;
  refId: string;
};

export default function Zahlungen() {
  const [rows, setRows] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null); // legacy UI state; gebuchte Zahlungen bleiben unveränderbar

  const empty = (): PaymentForm => ({
    date: new Date().toISOString().slice(0, 10),
    direction: "IN",
    party: "",
    amount: 0,
    method: "Überweisung",
    purpose: "",
    refType: "",
    refId: ""
  });

  const [form, setForm] = useState<PaymentForm>(empty());

  const load = async () => {
    try {
      setError("");
      const [payments, invoiceData, billData] = await Promise.all([
        accountingApi("/api/accounting/payments"),
        accountingApi("/api/accounting/invoices"),
        accountingApi("/api/accounting/vendor-bills")
      ]);
      const paymentRows = payments.items || [];
      const invoiceRows = invoiceData.items || [];
      const billRows = billData.items || [];

      setRows(paymentRows);
      setInvoices(invoiceRows);
      setBills(billRows);

      const invoiceId = new URLSearchParams(window.location.search).get("invoiceId");
      const invoice = invoiceId
        ? invoiceRows.find((row: any) => row.id === invoiceId)
        : null;

      if (invoice && Number(invoice.openAmount || 0) > 0.009) {
        setEditingId(null);
        setForm({
          date: new Date().toISOString().slice(0, 10),
          direction: "IN",
          party: invoice.customer?.name || "Unbekannter Kunde",
          amount: Number(invoice.openAmount || 0),
          method: "Überweisung",
          purpose: `Zahlung ${invoice.number}`,
          refType: "INVOICE",
          refId: invoice.id
        });
        window.history.replaceState({}, "", "/buchhaltung/zahlungen");
      }
    } catch (e: any) {
      setError(e?.message || "Daten konnten nicht geladen werden");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const allReferences = useMemo(() => {
    const source = form.direction === "IN" ? invoices : bills;
    const type = form.direction === "IN" ? "INVOICE" : "VENDOR_BILL";

    return source.map((row: any) => ({
      id: row.id,
      type,
      number: row.number,
      party: form.direction === "IN"
        ? row.customer?.name || "Unbekannter Kunde"
        : row.supplier?.name || "Unbekannter Lieferant",
      openAmount: Number(row.openAmount || 0),
      label: `${row.number} · ${form.direction === "IN" ? row.customer?.name || "—" : row.supplier?.name || "—"} · offen ${euro(row.openAmount)} €`
    }));
  }, [form.direction, invoices, bills]);

  const references = useMemo(
    () => allReferences.filter(ref => ref.openAmount > 0.009 || ref.id === form.refId),
    [allReferences, form.refId]
  );

  const totals = useMemo(() => ({
    incomingOpen: invoices.reduce((sum, row) => sum + Number(row.openAmount || 0), 0),
    outgoingOpen: bills.reduce((sum, row) => sum + Number(row.openAmount || 0), 0),
    payments: rows.length
  }), [invoices, bills, rows]);

  const openCustomerInvoices = useMemo(
    () => invoices.filter((invoice) => Number(invoice.openAmount || 0) > 0.009),
    [invoices]
  );

  const selectReference = (refId: string) => {
    const ref = allReferences.find(item => item.id === refId);

    setForm(current => ({
      ...current,
      refId,
      refType: ref?.type || "",
      party: ref?.party || current.party,
      amount: ref ? ref.openAmount : current.amount,
      purpose: ref ? `Zahlung ${ref.number}` : current.purpose
    }));
  };

  const registerInvoicePayment = (invoice: any) => {
    setEditingId(null);
    setForm({
      date: new Date().toISOString().slice(0, 10),
      direction: "IN",
      party: invoice.customer?.name || "Unbekannter Kunde",
      amount: Number(invoice.openAmount || 0),
      method: "Überweisung",
      purpose: `Zahlung ${invoice.number}`,
      refType: "INVOICE",
      refId: invoice.id
    });
    window.setTimeout(() => {
      document.getElementById("payment-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(empty());
    setError("");
  };

  const save = async () => {
    try {
      setError("");

      if (!form.party.trim()) {
        setError(form.direction === "IN" ? "Bitte Kunde angeben." : "Bitte Lieferant angeben.");
        return;
      }

      if (Number(form.amount) <= 0) {
        setError("Bitte einen Betrag größer als 0 eingeben.");
        return;
      }

      if (editingId) throw new Error("Gebuchte Zahlungen dürfen nicht geändert werden. Verwenden Sie Storno.");
      await accountingApi(
        "/api/accounting/payments",
        {
          method: "POST",
          body: JSON.stringify({
            ...form,
            amount: Number(form.amount),
            refType: form.refId ? form.refType : null,
            refId: form.refId || null
          })
        }
      );

      cancelEdit();
      await load();
    } catch (e: any) {
      setError(e?.message || "Zahlung konnte nicht gespeichert werden");
    }
  };

  const reversePayment = async (row: any) => {
    const meta = row.data || {};
    if (meta.reversesPaymentId) { setError("Eine Stornobuchung kann nicht nochmals storniert werden."); return; }
    if (meta.reversedByPaymentId) { setError("Diese Zahlung wurde bereits storniert."); return; }
    const reason = window.prompt("Grund der Stornobuchung:", "Fehlerhafte Zahlungserfassung");
    if (!reason?.trim()) return;
    try {
      await accountingApi(`/api/accounting/payments/${row.id}/reverse`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      await load();
    } catch (e: any) { setError(e?.message || "Stornobuchung fehlgeschlagen"); }
  };

  const referenceFor = (row: any) => {
    if (row.refType === "INVOICE") return invoices.find(invoice => invoice.id === row.refId);
    if (row.refType === "VENDOR_BILL") return bills.find(bill => bill.id === row.refId);
    return null;
  };

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <div>
          <h2>Zahlungen & Offene Posten</h2>
          <div className="bh-note">Projekt: {getAccountingProject()}</div>
        </div>
        <button className="bh-btn ghost" onClick={load}>Aktualisieren</button>
      </div>

      <div className="bh-filters" style={{ marginBottom: 18 }}>
        <div className="bh-note"><b>{euro(totals.incomingOpen)} €</b><br />Offene Kundenforderungen</div>
        <div className="bh-note"><b>{euro(totals.outgoingOpen)} €</b><br />Offene Lieferantenrechnungen</div>
        <div className="bh-note"><b>{totals.payments}</b><br />Erfasste Zahlungen</div>
      </div>

      <section className="bh-card" style={{ marginBottom: 18, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Offene Ausgangsrechnungen</strong>
          <div className="bh-note">Hier erscheinen Rechnungen automatisch nach ihrer Erstellung. Zahlung erst erfassen, wenn das Geld eingegangen ist.</div>
        </div>
        <table className="bh-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Rechnung</th><th>Kunde</th><th>Datum</th><th>Fällig</th><th>Brutto</th><th>Bezahlt</th><th>Offen</th><th></th>
            </tr>
          </thead>
          <tbody>
            {openCustomerInvoices.map((invoice) => {
              const meta = invoice.data || {};
              return (
                <tr key={invoice.id}>
                  <td><b>{invoice.number}</b></td>
                  <td>{invoice.customer?.name || "—"}</td>
                  <td>{dateDe(invoice.date)}</td>
                  <td>{meta.dueDate || "—"}</td>
                  <td>{euro(invoice.grossAmount)} €</td>
                  <td>{euro(invoice.paidAmount)} €</td>
                  <td><b>{euro(invoice.openAmount)} €</b></td>
                  <td><button className="bh-btn" onClick={() => registerInvoicePayment(invoice)}>Zahlung erfassen</button></td>
                </tr>
              );
            })}
            {!openCustomerInvoices.length ? <tr><td colSpan={8}>Keine offenen Ausgangsrechnungen.</td></tr> : null}
          </tbody>
        </table>
      </section>

      <div id="payment-form" className="bh-filters">
        <div>
          <label>Richtung</label>
          <select
            value={form.direction}
            onChange={e => setForm(current => ({
              ...current,
              direction: e.target.value === "OUT" ? "OUT" : "IN",
              refType: "",
              refId: ""
            }))}
          >
            <option value="IN">Zahlungseingang</option>
            <option value="OUT">Zahlungsausgang</option>
          </select>
        </div>

        <div>
          <label>Datum</label>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        </div>

        <div>
          <label>{form.direction === "IN" ? "Kunde" : "Lieferant"}</label>
          <input value={form.party} onChange={e => setForm({ ...form, party: e.target.value })} />
        </div>

        <div>
          <label>Betrag</label>
          <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
        </div>

        <div>
          <label>Methode</label>
          <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
            <option>Überweisung</option>
            <option>Bar</option>
            <option>Karte</option>
            <option>Lastschrift</option>
            <option>Sonstiges</option>
          </select>
        </div>

        <div>
          <label>{form.direction === "IN" ? "Ausgangsrechnung zuordnen" : "Eingangsrechnung zuordnen"}</label>
          <select value={form.refId} onChange={e => selectReference(e.target.value)}>
            <option value="">Nicht zugeordnet</option>
            {references.map(ref => <option key={ref.id} value={ref.id}>{ref.label}</option>)}
          </select>
        </div>

        <div>
          <label>Verwendungszweck</label>
          <input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} />
        </div>

        <div style={{ alignSelf: "end", display: "flex", gap: 8 }}>
          <button className="bh-btn" onClick={save}>+ Zahlung buchen</button>
        </div>
      </div>

      <div className="bh-note" style={{ marginTop: 10 }}>Gebuchte Zahlungen sind unveränderbar. Fehler werden ausschließlich über eine Stornobuchung korrigiert.</div>
      {error ? <div className="bh-note" style={{ marginTop: 10 }}>{error}</div> : null}

      <table className="bh-table" style={{ marginTop: 22 }}>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Richtung</th>
            <th>Kunde / Lieferant</th>
            <th>Betrag</th>
            <th>Methode</th>
            <th>Verwendungszweck</th>
            <th>Zuordnung</th>
            <th>Status</th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const meta = row.data || {};
            const reference = referenceFor(row);
            return (
              <tr key={row.id}>
                <td>{dateDe(row.date)}</td>
                <td>{row.direction === "OUT" ? "Ausgang" : "Eingang"}</td>
                <td>{meta.party || "—"}</td>
                <td>{euro(row.amount)} €</td>
                <td>{row.method}</td>
                <td>{meta.purpose || "—"}</td>
                <td>{reference?.number || "—"}</td>
                <td>{row.refId ? "zugeordnet" : "nicht zugeordnet"}</td>
                <td style={{ display: "flex", gap: 7 }}>
                  {meta.reversesPaymentId ? <span className="bh-note">Stornobuchung</span> : meta.reversedByPaymentId ? <span className="bh-note">Storniert</span> : <button className="bh-btn ghost" onClick={() => void reversePayment(row)}>Storno</button>}
                </td>
              </tr>
            );
          })}
          {!rows.length ? <tr><td colSpan={9}>Keine Zahlungen vorhanden.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}
