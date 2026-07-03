import React from "react";
import { NavLink } from "react-router-dom";

type Props = {
  children: React.ReactNode;
};

const sidebarStyle: React.CSSProperties = {
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const mainStyle: React.CSSProperties = {
  padding: 0,
  minWidth: 0,
};

const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  marginBottom: 8,
};

const groupLabelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  marginTop: 10,
  marginBottom: 4,
  padding: "0 4px",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

export default function BuroLayout({ children }: Props) {
  const link = (to: string, label: string) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) => "navitem" + (isActive ? " active" : "")}
      style={{
        display: "block",
        padding: "8px 10px",
        borderRadius: 6,
        textDecoration: "none",
      }}
    >
      {label}
    </NavLink>
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        gap: 14,
        minWidth: 0,
      }}
    >
      <aside className="card" style={sidebarStyle}>
        <div style={sectionTitleStyle}>Büro / Verwaltung</div>

        <div style={groupLabelStyle}>Basis</div>
        {link("/buro/projekte", "Projektverwaltung")}
        {link("/buro/dokumente", "Dokumentenverwaltung")}
        {link("/buro/vertraege", "Vertragsverwaltung")}
        {link("/buro/tasks", "Kommunikation / Aufgaben")}
        {link("/buro/kommunikation", "Kommunikation")}
        {link("/buro/outlookKalender", "Outlook / Kalender")}
        {link("/buro/nutzerverwaltung", "Nutzerverwaltung")}

        <div style={groupLabelStyle}>Planung</div>
        {link("/buro/bauzeitenplan", "Bauzeitenplan")}
        {link("/buro/personalverwaltung", "Personalverwaltung")}
        {link("/buro/ressourcenplanung", "Ressourcenplanung")}
        {link("/buro/uebergabe", "Übergabe")}

        <div style={groupLabelStyle}>Ressourcen</div>
        {link("/buro/maschinenverwaltung", "Maschinenverwaltung")}
        {link("/buro/materialverwaltung", "Materialverwaltung")}
        {link("/buro/lager", "Lager")}
        {link("/buro/sicherheit", "Sicherheit")}
      </aside>

      <main className="card" style={mainStyle}>
        {children}
      </main>
    </div>
  );
}





