
import React, { useEffect, useMemo, useState } from "react";
import { accountingApi, dateDe, euro } from "./accountingApi";
import "./styles.css";

function csv(value:any) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function DATEV() {
  const [data, setData] = useState<any>({
    items: [],
    project: null
  });

  const [error, setError] = useState("");

  const load = async () => {
    try {
      setError("");
      setData(await accountingApi("/api/accounting/datev"));
    } catch (e:any) {
      setError(e?.message || "Fehler");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const totals = useMemo(() => {
    let soll = 0;
    let haben = 0;

    for (const row of data.items || []) {
      const amount = Number(row.amount || 0);

      if (amount < 0) soll += Math.abs(amount);
      else haben += amount;
    }

    return { soll, haben };
  }, [data.items]);

  const exportCsv = () => {
    const header = [
      "Umsatz",
      "Soll/Haben",
      "Konto",
      "Gegenkonto",
      "Buchungsdatum",
      "Buchungstext"
    ];

    const lines = [
      header.map(csv).join(";"),
      ...(data.items || []).map((row:any) => {
        const amount = Number(row.amount || 0);

        return [
          Math.abs(amount).toFixed(2).replace(".", ","),
          amount < 0 ? "S" : "H",
          row.account,
          row.contraAccount,
          dateDe(row.date),
          row.text || ""
        ].map(csv).join(";");
      })
    ];

    const blob = new Blob(
      [lines.join("\n")],
      { type:"text/csv;charset=utf-8" }
    );

    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);

    const fileName = `DATEV_${data.project?.code || "Projekt"}.csv`;
    a.href = href;
    a.download = fileName;

    a.click();
    URL.revokeObjectURL(href);

    const dmsProjectId = String(data.project?.id || "").trim();
    if (dmsProjectId) {
      void import("../../lib/dmsArchive")
        .then(({ archiveWebFile }) => archiveWebFile(dmsProjectId, fileName, blob))
        .catch((error) => console.warn("[datev:csv:dms]", error));
    }
  };

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <div>
          <h2>DATEV / Export</h2>
          <div className="bh-note">
            Projekt: {data.project?.code || "—"} ·
            Soll {euro(totals.soll)} € ·
            Haben {euro(totals.haben)} €
          </div>
        </div>

        <div className="bh-actions">
          <button className="bh-btn ghost" onClick={load}>
            Aktualisieren
          </button>

          <button className="bh-btn" onClick={exportCsv}>
            DATEV CSV
          </button>
        </div>
      </div>

      {error && <div className="bh-note">{error}</div>}

      <table className="bh-table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Konto</th>
            <th>Gegenkonto</th>
            <th>Text</th>
            <th>Betrag</th>
            <th>S/H</th>
          </tr>
        </thead>

        <tbody>
          {(data.items || []).map((row:any) => (
            <tr key={row.id}>
              <td>{dateDe(row.date)}</td>
              <td>{row.account}</td>
              <td>{row.contraAccount}</td>
              <td>{row.text || "—"}</td>
              <td>{euro(Math.abs(Number(row.amount)))} €</td>
              <td>{Number(row.amount) < 0 ? "S" : "H"}</td>
            </tr>
          ))}

          {!data.items?.length && (
            <tr>
              <td colSpan={6}>Keine Journalbuchungen vorhanden.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
