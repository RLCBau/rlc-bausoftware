import React, { useEffect, useMemo, useState, useRef } from "react";
import { useProject } from "../../store/useProject";
import { apiUrl } from "../../lib/apiBase";
import { accountingApi, dateDe, euro, getAccountingProject } from "./accountingApi";
import "./styles.css";

type Period = "ALL" | "MONTH" | "YEAR";
const amount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const day = (value: unknown) => String(value || "").slice(0, 10);

function authHeaders(): Record<string, string> {
  try {
    for (const key of ["rlc_token", "token", "authToken", "accessToken", "rlc_auth_token"]) {
      const value = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (value) return { Authorization: `Bearer ${value}` };
    }
  } catch {}
  return {};
}

async function apiGet(path: string) {
  const response = await fetch(apiUrl(path), {
    credentials: "include", headers: { Accept: "application/json", ...authHeaders() }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload || {};
}

function inPeriod(value: unknown, period: Period) {
  if (period === "ALL") return true;
  const valueDay = day(value);
  if (!valueDay) return false;
  const now = new Date();
  const prefix = period === "YEAR"
    ? String(now.getFullYear())
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return valueDay.startsWith(prefix);
}

export default function Kostenuebersicht() {
  const { getSelectedProject } = useProject();
  const project = getSelectedProject?.();
  const projectKey = String(project?.code || project?.id || getAccountingProject() || "").trim();

  const [period, setPeriod] = useState<Period>("ALL");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [labor, setLabor] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [operationalMaterial, setOperationalMaterial] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const [loadedProject, setLoadedProject] = useState("");

  const load = async () => {
    const requestGeneration = ++generation.current;
    setLoadedProject("");
    setInvoices([]); setPayments([]); setBills([]); setLabor([]); setMachines([]); setOperationalMaterial([]);
    try {
      setLoading(true); setError("");
      const [invoiceData, paymentData, billData, laborData, resourceData] = await Promise.all([
        accountingApi("/api/accounting/invoices?projectId=" + encodeURIComponent(projectKey)),
        accountingApi("/api/accounting/payments?projectId=" + encodeURIComponent(projectKey)),
        accountingApi("/api/accounting/vendor-bills?projectId=" + encodeURIComponent(projectKey)),
        projectKey ? apiGet(`/api/personal/labor-costs?projectId=${encodeURIComponent(projectKey)}`) : Promise.resolve({}),
        projectKey ? apiGet(`/api/resource-costs/summary?projectId=${encodeURIComponent(projectKey)}`) : Promise.resolve({})
      ]);
      if (requestGeneration !== generation.current) return;
      setLoadedProject(projectKey);
      setInvoices(invoiceData.items || []);
      setPayments(paymentData.items || []);
      setBills(billData.items || []);
      setLabor(laborData.items || []);
      setMachines(resourceData.machineItems || []);
      setOperationalMaterial(resourceData.materialItems || []);
    } catch (e: any) {
      if (requestGeneration === generation.current) setError(e?.message || "Kosten konnten nicht geladen werden.");
    } finally { if (requestGeneration === generation.current) setLoading(false); }
  };

  useEffect(() => { void load(); return () => { generation.current++; }; }, [projectKey]);
  const ready = loadedProject === projectKey;
  const displayAmount = (v: unknown) => ready ? euro(v) + " €" : "–";

  const filteredInvoices = useMemo(() => invoices.filter((row) => inPeriod(row.date, period)), [invoices, period]);
  const filteredBills = useMemo(() => bills.filter((row) => inPeriod(row.date, period)), [bills, period]);
  const filteredLabor = useMemo(() => labor.filter((row) => inPeriod(row.date, period)), [labor, period]);
  const filteredMachines = useMemo(() => machines.filter((row) => inPeriod(row.date, period)), [machines, period]);
  const filteredMaterial = useMemo(() => operationalMaterial.filter((row) => inPeriod(row.date, period)), [operationalMaterial, period]);
  const filteredPayments = useMemo(() => payments.filter((row) => inPeriod(row.date, period)), [payments, period]);

  const revenue = useMemo(() => filteredInvoices.reduce((sum, row) => sum + amount(row.grossAmount), 0), [filteredInvoices]);
  const customerPayments = useMemo(() => filteredPayments
    .filter((row) => String(row.direction).toUpperCase() === "IN" && row.refType === "INVOICE")
    .reduce((sum, row) => sum + amount(row.amount), 0), [filteredPayments]);
  const supplierCosts = useMemo(() => filteredBills.reduce((sum, row) => sum + amount(row.grossAmount), 0), [filteredBills]);
  const supplierPaid = useMemo(() => filteredPayments
    .filter((row) => String(row.direction).toUpperCase() === "OUT" && row.refType === "VENDOR_BILL")
    .reduce((sum, row) => sum + amount(row.amount), 0), [filteredPayments]);
  const laborCosts = useMemo(() => filteredLabor.reduce((sum, row) => sum + amount(row.personnelCost), 0), [filteredLabor]);
  const machineCosts = useMemo(() => filteredMachines.reduce((sum, row) => sum + amount(row.amount), 0), [filteredMachines]);
  const materialInfo = useMemo(() => filteredMaterial.reduce((sum, row) => sum + amount(row.amount), 0), [filteredMaterial]);

  const actualCosts = supplierCosts + laborCosts + machineCosts;
  const grossMargin = revenue - actualCosts;
  const supplierOpen = Math.max(0, supplierCosts - supplierPaid);

  return (
    <div className="bh-page">
      <div className="bh-note">Gerätekosten berücksichtigen gebuchte tatsächliche Einsätze mit Datum, Kostenstelle und gespeichertem Stundensatz. Betriebsstundenzähler werden in der Maschinenverwaltung geführt.</div>
      <div className="bh-header-row">
        <div>
          <h2>Kostenübersicht</h2>
          <div className="bh-note">Projekt: {project?.code || projectKey} · Reale Buchungs- und Baustellendaten</div>
        </div>
        <button className="bh-btn ghost" onClick={() => void load()}>{loading ? "Lädt…" : "Aktualisieren"}</button>
      </div>

      <div className="bh-filters">
        <div>
          <label>Zeitraum</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <option value="ALL">Gesamtes Projekt</option>
            <option value="MONTH">Dieser Monat</option>
            <option value="YEAR">Dieses Jahr</option>
          </select>
        </div>
        <div className="bh-note" style={{ alignSelf: "end" }}>
          Lieferantenkosten stammen ausschließlich aus Eingangsrechnungen.
        </div>
      </div>

      {error ? <div className="bh-note">{error}</div> : null}

      <div className="bh-cards">
        <div className="bh-card"><div className="bh-note">Ausgangsrechnungen</div><b>{displayAmount(revenue)}</b></div>
        <div className="bh-card"><div className="bh-note">Kundenzahlungen</div><b>{displayAmount(customerPayments)}</b></div>
        <div className="bh-card"><div className="bh-note">Lieferantenkosten</div><b>{displayAmount(supplierCosts)}</b></div>
        <div className="bh-card"><div className="bh-note">Personalkosten</div><b>{displayAmount(laborCosts)}</b></div>
        <div className="bh-card"><div className="bh-note">Maschinenkosten</div><b>{displayAmount(machineCosts)}</b></div>
        <div className="bh-card"><div className="bh-note">Ist-Kosten gesamt</div><b>{displayAmount(actualCosts)}</b></div>
        <div className="bh-card"><div className="bh-note">Deckungsbeitrag vor Gemeinkosten</div><b>{displayAmount(grossMargin)}</b></div>
        <div className="bh-card"><div className="bh-note">Offene Lieferantenrechnungen</div><b>{displayAmount(supplierOpen)}</b></div>
      </div>

      <div className="bh-note" style={{ margin: "14px 0" }}>
        Materialeinsatz aus Baustellenerfassung: <b>{displayAmount(materialInfo)}</b> · nur Information,
        nicht nochmals in den Ist-Kosten addiert, damit eine bereits erfasste Eingangsrechnung nicht doppelt zählt.
      </div>

      <h3>Lieferantenkosten / Eingangsrechnungen</h3>
      <table className="bh-table">
        <thead><tr><th>Datum</th><th>Beleg</th><th>Lieferant</th><th>Lieferschein</th><th>Kostenstelle</th><th>Brutto</th><th>Bezahlt</th><th>Offen</th></tr></thead>
        <tbody>
          {(ready ? filteredBills : []).map((row) => {
            const meta = row.data || {};
            return <tr key={row.id}>
              <td>{dateDe(row.date)}</td><td>{row.number}</td><td>{row.supplier?.name || "—"}</td>
              <td>{meta.deliveryNoteNumber || "—"}</td><td>{meta.costCenter || "—"}</td>
              <td>{euro(row.grossAmount)} €</td><td>{euro(row.paidAmount)} €</td><td>{euro(row.openAmount)} €</td>
            </tr>;
          })}
          {(!ready || !filteredBills.length) ? <tr><td colSpan={8}>{loading ? "Daten werden geladen …" : !ready ? "Auswertung nicht verfügbar." : "Keine Eingangsrechnungen im gewählten Zeitraum."}</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}
