
import React, { useEffect, useState } from "react";
import { accountingApi, dateDe, euro, getAccountingProject } from "./accountingApi";
import { renderRlcMahnPdf } from "./serverPdfCore";
import "./styles.css";

export default function Mahnwesen() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const createMahnPdf = async (row: any) => {
    if (Number(row.dunningLevel || 0) < 1) {
      setError("Bitte zuerst die Mahnstufe 1, 2 oder 3 auswählen.");
      return;
    }

    try {
      setError("");
      await renderRlcMahnPdf({
        projectId: getAccountingProject(),
        invoiceId: row.id,
        dunningLevel: Number(row.dunningLevel),
        fileName: `Mahnung_${row.number}.pdf`
      });
    } catch (e: any) {
      setError(e?.message || "Mahnung PDF konnte nicht erzeugt werden");
    }
  };

  const load = async () => {
    try {
      setError("");
      const data = await accountingApi("/api/accounting/mahnwesen");
      setRows(data.items || []);
    } catch (e:any) {
      setError(e?.message || "Fehler");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setLevel = async (row:any, level:number) => {
    if(saving) return;
    if(level<0||level>3||!Number.isInteger(level))return;
    if(Number(row.openAmount||0)<=0.009){setError("Vollständig bezahlte Rechnungen dürfen nicht gemahnt werden.");return;}
    const message = level === 0 ? "Mahnstufe für Rechnung "+row.number+" zurücksetzen?" : "Mahnstufe "+level+" für Rechnung "+row.number+" speichern? Gebühren und Zinsen bleiben unverändert und müssen gesondert geprüft werden.";
    if(!window.confirm(message))return;
    setSaving(String(row.id));setError("");
    try{
      await accountingApi(`/api/accounting/invoices/${row.id}/dunning`,{
        method:"POST",
        body:JSON.stringify({dunningLevel:level,lastDunningDate:level>0?new Date().toISOString():null,dunningFee:Number(row.dunningFee||0),interestRate:Number(row.interestRate||0)})
      });
      await load();
    }catch(e:any){setError(e?.message||"Mahnstufe konnte nicht gespeichert werden.");}
    finally{setSaving(null);}
  };

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>Mahnwesen</h2>
        <button className="bh-btn ghost" onClick={load}>
          Aktualisieren
        </button>
      </div>

      <div className="bh-note">Mahngebühren und Verzugszinsen werden nicht automatisch festgelegt. Bestehende Werte bleiben erhalten und müssen fachlich geprüft werden.</div>
      {error && <div className="bh-note" role="alert">{error}</div>}

      <table className="bh-table">
        <thead>
          <tr>
            <th>Rechnung</th>
            <th>Kunde</th>
            <th>Datum</th>
            <th>Brutto</th>
            <th>Bezahlt</th>
            <th>Offen</th>
            <th>Stufe</th>
            <th>Letzte Mahnung</th>
            <th>Gebühr</th>
            <th>Aktion</th>
          </tr>
        </thead>

        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td>{row.number}</td>
              <td>{row.customer?.name || "—"}</td>
              <td>{dateDe(row.date)}</td>
              <td>{euro(row.grossAmount)} €</td>
              <td>{euro(row.paidAmount)} €</td>
              <td>{euro(row.openAmount)} €</td>
              <td>{row.dunningLevel}</td>
              <td>{dateDe(row.lastDunningDate)}</td>
              <td>{euro(row.dunningFee)} €</td>
                <td>
                  <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      aria-label="Mahnstufe"
                      disabled={Boolean(saving)||Number(row.openAmount||0)<=0.009}
                      value={row.dunningLevel}
                      onChange={e=>setLevel(row, Number(e.target.value))}
                    >
                      <option value={0}>0 · Keine</option>
                      <option value={1}>1 · 1. Mahnung</option>
                      <option value={2}>2 · 2. Mahnung</option>
                      <option value={3}>3 · Letzte Mahnung</option>
                    </select>
                    <button
                      className="bh-btn ghost"
                      onClick={() => window.location.assign(`/buchhaltung/zahlungen?invoiceId=${encodeURIComponent(row.id)}`)}
                    >
                      Zahlung erfassen
                    </button>
                    <button
                      className="bh-btn ghost"
                      onClick={() => window.location.assign("/buchhaltung/rechnungen")}
                    >
                      Rechnung öffnen
                    </button>
                      <button
                        className="bh-btn"
                        disabled={Number(row.dunningLevel || 0) < 1}
                        onClick={() => void createMahnPdf(row)}
                      >
                        Mahnung PDF
                      </button>
                  </div>
                </td>
            </tr>
          ))}

          {!rows.length && (
            <tr>
              <td colSpan={10}>Keine Forderungen vorhanden.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
