
import React, { useEffect, useMemo, useState } from "react";
import { accountingApi, dateDe, euro } from "./accountingApi";
import "./styles.css";

export default function USt() {
  const [data, setData] = useState<any>({
    rows: [],
    umsatzsteuer: 0,
    vorsteuer: 0,
    zahllast: 0
  });

  const [error, setError] = useState("");

  const load = async () => {
    try {
      setError("");
      setData(await accountingApi("/api/accounting/ust"));
    } catch (e:any) {
      setError(e?.message || "Fehler");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, any>();

    for (const row of data.rows || []) {
      const key = String(row.taxRate || 0);

      const g = map.get(key) || {
        rate: row.taxRate || 0,
        revenueNet: 0,
        revenueTax: 0,
        expenseNet: 0,
        expenseTax: 0
      };

      if (row.type === "Einnahme") {
        g.revenueNet += Number(row.netAmount || 0);
        g.revenueTax += Number(row.taxAmount || 0);
      } else {
        g.expenseNet += Number(row.netAmount || 0);
        g.expenseTax += Number(row.taxAmount || 0);
      }

      map.set(key, g);
    }

    return [...map.values()];
  }, [data.rows]);

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>Umsatzsteuer-Übersicht</h2>
        <button className="bh-btn ghost" onClick={load}>
          Aktualisieren
        </button>
      </div>

      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(3,minmax(0,1fr))",
        gap:10
      }}>
        <div className="bh-card">
          <div className="bh-note">Umsatzsteuer</div>
          <b>{euro(data.umsatzsteuer)} €</b>
        </div>

        <div className="bh-card">
          <div className="bh-note">Vorsteuer</div>
          <b>{euro(data.vorsteuer)} €</b>
        </div>

        <div className="bh-card">
          <div className="bh-note">Zahllast</div>
          <b>{euro(data.zahllast)} €</b>
        </div>
      </div>

      {error && <div className="bh-note">{error}</div>}

      <h3>Belege</h3>

      <table className="bh-table">
        <thead>
          <tr>
            <th>Typ</th>
            <th>Datum</th>
            <th>Beleg</th>
            <th>Netto</th>
            <th>Steuersatz</th>
            <th>USt./VSt.</th>
            <th>Brutto</th>
          </tr>
        </thead>

        <tbody>
          {(data.rows || []).map((row:any) => (
            <tr key={row.id}>
              <td>{row.type}</td>
              <td>{dateDe(row.date)}</td>
              <td>{row.number}</td>
              <td>{euro(row.netAmount)} €</td>
              <td>{row.taxRate}%</td>
              <td>{euro(row.taxAmount)} €</td>
              <td>{euro(row.grossAmount)} €</td>
            </tr>
          ))}

          {!data.rows?.length && (
            <tr>
              <td colSpan={7}>Keine steuerrelevanten Belege vorhanden.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Nach Steuersatz</h3>

      <table className="bh-table">
        <thead>
          <tr>
            <th>Satz</th>
            <th>Umsatz Netto</th>
            <th>USt.</th>
            <th>Ausgaben Netto</th>
            <th>Vorsteuer</th>
            <th>Saldo</th>
          </tr>
        </thead>

        <tbody>
          {groups.map((g:any) => (
            <tr key={g.rate}>
              <td>{g.rate}%</td>
              <td>{euro(g.revenueNet)} €</td>
              <td>{euro(g.revenueTax)} €</td>
              <td>{euro(g.expenseNet)} €</td>
              <td>{euro(g.expenseTax)} €</td>
              <td>{euro(g.revenueTax - g.expenseTax)} €</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
