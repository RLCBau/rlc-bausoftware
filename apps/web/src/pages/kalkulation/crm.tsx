import React, { useState } from "react";

/** ===== TYPES ===== */
type Offer = {
  id: number;
  projekt: string;
  kunde: string;
  betrag: number;
  datum: string;
  status: "Offen" | "Abgegeben" | "Nachverhandlung" | "Zuschlag" | "Abgelehnt";
  notiz?: string;
};

/** ===== COMPONENT ===== */
export default function CRMAngebotsverfolgungPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState<keyof Offer>("datum");

  const filtered = offers
    .filter(o =>
      o.projekt.toLowerCase().includes(filter.toLowerCase()) ||
      o.kunde.toLowerCase().includes(filter.toLowerCase())
    )
    .sort((a, b) =>
      sortBy === "betrag"
        ? b.betrag - a.betrag
        : (a[sortBy] > b[sortBy] ? -1 : 1)
    );

  const addOffer = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const item: Offer = {
      id: Date.now(),
      projekt: String(fd.get("projekt") || ""),
      kunde: String(fd.get("kunde") || ""),
      betrag: Number(fd.get("betrag") || 0),
      datum: new Date().toISOString().slice(0, 10),
      status: "Offen",
      notiz: String(fd.get("notiz") || ""),
    };
    setOffers(prev => [item, ...prev]);
    e.currentTarget.reset();
  };

  const changeStatus = (id: number, status: Offer["status"]) => {
    setOffers(prev => prev.map(o => (o.id === id ? { ...o, status } : o)));
  };

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 16 }}>CRM-Schnittstelle / Angebotsverfolgung</h2>

      {/* Neue Angebot */}
      <form onSubmit={addOffer} style={card}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <input name="projekt" required placeholder="Projektname" style={input} />
          <input name="kunde" required placeholder="Kunde / Auftraggeber" style={input} />
          <input name="betrag" type="number" step="0.01" required placeholder="Betrag (€)" style={input} />
          <input name="notiz" placeholder="Notiz (optional)" style={{ ...input, width: 260 }} />
          <button type="submit" style={btnPrimary}>Angebot hinzufügen</button>
        </div>
      </form>

      {/* Filter */}
      <div style={toolbar}>
        <input
          placeholder="Suche nach Projekt oder Kunde…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={searchInput}
        />
        <select value={sortBy} onChange={e => setSortBy(e.target.value as keyof Offer)} style={select}>
          <option value="datum">Datum</option>
          <option value="betrag">Betrag</option>
          <option value="projekt">Projekt</option>
        </select>
      </div>

      {/* Tabelle */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th style={th(140)}>Projekt</th>
              <th style={th(180)}>Kunde</th>
              <th style={th(90)}>Betrag (€)</th>
              <th style={th(100)}>Datum</th>
              <th style={th(160)}>Status</th>
              <th style={th(240)}>Notiz</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id}>
                <td style={td}>{o.projekt}</td>
                <td style={td}>{o.kunde}</td>
                <td style={tdRight}>{o.betrag.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                <td style={td}>{o.datum}</td>
                <td style={td}>
                  <select
                    value={o.status}
                    onChange={e => changeStatus(o.id, e.target.value as Offer["status"])}
                    style={select}
                  >
                    <option>Offen</option>
                    <option>Abgegeben</option>
                    <option>Nachverhandlung</option>
                    <option>Zuschlag</option>
                    <option>Abgelehnt</option>
                  </select>
                </td>
                <td style={td}>{o.notiz}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 12, color: "#6b7280" }}>
                  Noch keine Angebote erfasst.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** ===== STYLES ===== */
const card: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 16, background: "white" };
const toolbar: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 10 };
const input: React.CSSProperties = { padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, minWidth: 160 };
const select: React.CSSProperties = { padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 8, background: "white" };
const btnPrimary: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "white", fontWeight: 600, cursor: "pointer" };
const searchInput: React.CSSProperties = { width: 260, height: 36, borderRadius: 8, border: "1px solid #e5e7eb", padding: "0 10px" };
const th = (w: number): React.CSSProperties => ({ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e5e7eb", minWidth: w });
const td: React.CSSProperties = { padding: "8px", borderBottom: "1px solid #f1f5f9", fontSize: 13 };
const tdRight: React.CSSProperties = { ...td, textAlign: "right" };
