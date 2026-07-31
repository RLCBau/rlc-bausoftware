import React from "react";
import { NavLink } from "react-router-dom";

export default function BuroLayout({ children }: { children: React.ReactNode }) {
  const link = (to: string, label: string) => (
    <NavLink
      to={to}
      className={({ isActive }) => "navitem" + (isActive ? " active" : "")}
      style={{ display: "block", padding: "8px 10px", borderRadius: 6, textDecoration: "none" }}
    >
      {label}
    </NavLink>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 14 }}>
      <aside className="card" style={{ padding: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Büro / Verwaltung</div>
        {link("/buro/projekte", "Projektverwaltung")}
        {link("/buro/dokumente", "Dokumentenverwaltung")}
        {link("/buro/vertraege", "Vertragsverwaltung")}
        {link("/buro/tasks", "Kommunikation / Aufgaben")}
      </aside>

      <main className="card" style={{ padding: 0 }}>
        {children}
      </main>
    </div>
  );
}
