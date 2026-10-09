
import React, { useEffect, useState } from "react";
import { accountingApi, euro } from "./accountingApi";
import "./styles.css";

export default function Uebersicht() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setError("");
      setData(await accountingApi("/api/accounting/summary"));
    } catch (e: any) {
      setError(e?.message || "Fehler");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const cards = [
    ["Ausgangsrechnungen", data?.invoicesGross],
    ["Eingangsrechnungen", data?.billsGross],
    ["Zahlungseingänge", data?.incoming],
    ["Offene Forderungen", data?.openReceivables],
    ["Offene Verbindlichkeiten", data?.openPayables],
    ["Cashflow", data?.cashflow]
  ];

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <div>
          <h2>Übersicht</h2>
          <div className="bh-note">
            Projekt: {data?.project?.code || "—"} · {data?.project?.name || ""}
          </div>
        </div>

        <button className="bh-btn ghost" onClick={load}>
          Aktualisieren
        </button>
      </div>

      {error && <div className="bh-note">{error}</div>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6,minmax(0,1fr))",
          gap: 10
        }}
      >
        {cards.map(([label, value]) => (
          <div className="bh-card" key={label as string}>
            <div className="bh-note">{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {euro(value)} €
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
