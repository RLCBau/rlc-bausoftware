import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

/**
 * Impostazione:
 *  - per default showNav = false  → NIENTE sidebar KI (sparisce la “doppia”)
 *  - se un domani vuoi riattivarla solo in certe installazioni:
 *      <KILayout showNav />
 */
type Props = { showNav?: boolean };

const items = [
  { to: "/ki", label: "Übersicht", end: true },
  { to: "/ki/auto-lv", label: "Automatische Erstellung LV" },
  { to: "/ki/vorschlaege", label: "KI-Vorschläge aus LV-Datenbank" },
  { to: "/ki/fotoerkennung", label: "Fotoerkennung (Leistung/Material/Mengen)" },
  { to: "/ki/sprachsteuerung", label: "Sprachsteuerung (Regieberichte diktieren)" },
  { to: "/ki/widersprueche", label: "Widersprüche im LV/Angebot" },
  { to: "/ki/bewertung-analyse", label: "Bewertung & Angebotsanalyse" },
  { to: "/ki/auto-abrechnung", label: "Automatische Abrechnung" },
  { to: "/ki/regie-auto", label: "Regieberichte automatisch generieren" },
  { to: "/ki/optimierung", label: "Optimierung Bauzeiten & Ressourcen" },
  { to: "/ki/maengel", label: "Mängelmanagement KI-gestützt" },
];

export default function KILayout({ showNav = false }: Props) {
  const { pathname } = useLocation();

  // Modalità SENZA sidebar KI → rimane solo la sidebar di progetto a sinistra
  if (!showNav) {
    return (
      <div style={{ padding: 20, overflow: "auto", height: "100%" }}>
        <Outlet />
      </div>
    );
  }

  // Modalità CON sidebar KI (riattivabile passando showNav={true})
  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "100%" }}>
      <aside style={{ borderRight: "1px solid #e5e7eb", padding: 16, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>5&nbsp; KI</div>
        <nav>
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              style={({ isActive }) => ({
                display: "block",
                padding: "8px 10px",
                marginBottom: 6,
                borderRadius: 8,
                textDecoration: "none",
                color: isActive ? "#111827" : "#374151",
                background: isActive ? "#e5e7eb" : "transparent",
                fontWeight: pathname === it.to || isActive ? 600 : 500,
              })}
            >
              {it.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main style={{ padding: 20, overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
