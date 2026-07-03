// src/components/Sidebar.tsx
import React from "react";
import { NavLink, useLocation } from "react-router-dom";

type Item = { to: string; label: string; icon?: string };

const topItems: Item[] = [
  { to: "/start", label: "Start (Projekt auswählen)", icon: "🚀" },
  { to: "/projekt/uebersicht", label: "Projekt-Übersicht", icon: "📁" },
];

const moduleItems: Item[] = [
  { to: "/kalkulation", label: "Kalkulation", icon: "🧮" },
  { to: "/mengenermittlung", label: "Mengenermittlung", icon: "📏" },
  { to: "/cad", label: "CAD / PDF", icon: "✏️" },
  { to: "/buro", label: "Büro / Verwaltung", icon: "🏢" },
  { to: "/ki", label: "KI", icon: "🧠" },
  { to: "/info", label: "Info / Hilfe", icon: "ℹ️" },
  { to: "/buchhaltung", label: "Buchhaltung", icon: "📊" },
];

const buchhaltungItems: Item[] = [
  { to: "/buchhaltung", label: "Übersicht" },
  { to: "/buchhaltung/kostenuebersicht", label: "Kostenübersicht pro Projekt (live)" },
  { to: "/buchhaltung/rechnungen", label: "Rechnungen / Abschläge" },
  { to: "/buchhaltung/abschlagsrechnungen", label: "Abschlagsrechnungen" },
  { to: "/buchhaltung/zahlungen", label: "Zahlungseingänge / Offene Posten" },
  { to: "/buchhaltung/eingang", label: "Eingangsrechnungen" },
  { to: "/buchhaltung/kassenbuch", label: "Kassenbuch" },
  { to: "/buchhaltung/kostenstellen", label: "Projekt-Kostenstellenstruktur" },
  { to: "/buchhaltung/mahnwesen", label: "Mahnwesen" },
  { to: "/buchhaltung/reports", label: "Dokumente & Belege verwalten" },
  { to: "/buchhaltung/datev", label: "DATEV / Lexware / SAP Export" },
  { to: "/buchhaltung/ust", label: "USt.-Übersicht" },
  { to: "/buchhaltung/lieferscheine", label: "Lieferscheine (Kosten)" },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const inBuchhaltung = pathname.startsWith("/buchhaltung");

  return (
    <nav style={{ display: "grid", gap: 8 }}>
      {/* PROJEKT */}
      <div className="card" style={{ padding: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Projekt</div>

        {topItems.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === "/start" || it.to === "/projekt/uebersicht"}
            className={({ isActive }) => "row" + (isActive ? " active" : "")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            {it.icon && <span style={{ fontSize: 16 }}>{it.icon}</span>}
            <span style={{ fontWeight: 700 }}>{it.label}</span>
          </NavLink>
        ))}
      </div>

      {/* MODULE */}
      <div className="card" style={{ padding: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>RLC – Module</div>

        <div style={{ display: "grid", gap: 6 }}>
          {moduleItems.map((it, i) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                "row card" + (isActive ? " active" : "")
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: 8,
                textDecoration: "none",
              }}
            >
              <span style={{ width: 22, textAlign: "center" }}>{i + 1}</span>
              <span style={{ fontSize: 16 }}>{it.icon}</span>
              <span style={{ fontWeight: 600 }}>{it.label}</span>
            </NavLink>
          ))}
        </div>
      </div>

      {/* BUCHHALTUNG – submenu contestuale */}
      {inBuchhaltung && (
        <div className="card" style={{ padding: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>7. Buchhaltung</div>

          <div style={{ display: "grid", gap: 6 }}>
            {buchhaltungItems.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === "/buchhaltung"}
                className={({ isActive }) => "row" + (isActive ? " active" : "")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "6px 8px",
                  borderRadius: 6,
                  textDecoration: "none",
                }}
              >
                {it.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}





