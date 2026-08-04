import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/KILayout.tsx

import React from "react";
import { NavLink, Outlet } from "react-router-dom";

/**
 * Impostazione:
 * - default: showNav = false
 *   => nessuna sidebar KI, resta solo la sidebar progetto principale
 * - se in futuro vuoi riattivarla:
 *   <KILayout showNav />
 */
type Props = {showNav?: boolean;};

const items = [
{ to: "/ki", label: "Übersicht", end: true },
{ to: "/ki/fotoerkennung", label: "Fotoerkennung (Leistung / Material / Mengen)" },
{ to: "/ki/sprachsteuerung", label: "Sprachsteuerung (Regieberichte diktieren)" },
{ to: "/ki/auto-abrechnung", label: "Automatische Abrechnung" },
{ to: "/ki/regie-auto", label: "Regieberichte automatisch generieren" },
{ to: "/ki/optimierung", label: "Optimierung Bauzeiten & Ressourcen" },
{ to: "/ki/maengel", label: "Mängelmanagement KI-gestützt" }];


const shellNoNav: React.CSSProperties = {
  padding: 20,
  overflow: "auto",
  height: "100%"
};

const shellWithNav: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "280px 1fr",
  height: "100%"
};

const aside: React.CSSProperties = {
  borderRight: "1px solid #e5e7eb",
  padding: 16,
  overflowY: "auto",
  background: "#fff"
};

const main: React.CSSProperties = {
  padding: 20,
  overflow: "auto",
  background: "#f8fafc"
};

const title: React.CSSProperties = {
  fontWeight: 600,
  marginBottom: 12,
  fontSize: 14,
  color: "#111827"
};

export default function KILayout({ showNav = false }: Props) {
  if (!showNav) {
    return (
      <div className={rlcClass(null, shellNoNav)}>
        <Outlet />
      </div>);

  }

  return (
    <div className={rlcClass(null, shellWithNav)}>
      <aside className={rlcClass(null, aside)}>
        <div className={rlcClass(null, title)}>KI</div>

        <nav>
          {items.map((it) =>
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
              fontWeight: isActive ? 600 : 500,
              transition: "all 0.15s ease"
            })}>
            
              {it.label}
            </NavLink>
          )}
        </nav>
      </aside>

      <main className={rlcClass(null, main)}>
        <Outlet />
      </main>
    </div>);

}
