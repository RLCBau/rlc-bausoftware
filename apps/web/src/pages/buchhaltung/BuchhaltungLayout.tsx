import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import "./styles.css";

type NavItem = {
  to: string;
  label: string;
};

const navItems: NavItem[] = [
  { to: "/buchhaltung", label: "Übersicht" },
  { to: "/buchhaltung/kostenuebersicht", label: "Kostenübersicht (live)" },
  { to: "/buchhaltung/rechnungen", label: "Rechnungen / Abschläge" },
  { to: "/buchhaltung/abschlagsrechnungen", label: "Abschlagsrechnungen" },
  { to: "/buchhaltung/zahlungen", label: "Zahlungen" },
  { to: "/buchhaltung/eingang", label: "Eingangsrechnungen" },
  { to: "/buchhaltung/kassenbuch", label: "Kassenbuch" },
  { to: "/buchhaltung/kostenstellen", label: "Kostenstellen" },
  { to: "/buchhaltung/mahnwesen", label: "Mahnwesen" },
  { to: "/buchhaltung/reports", label: "Belege / Reports" },
  { to: "/buchhaltung/datev", label: "DATEV Export" },
  { to: "/buchhaltung/ust", label: "USt.-Übersicht" },

  // ✅ ora è una pagina BUCHHALTUNG vera
  { to: "/buchhaltung/lieferscheine", label: "Lieferscheine (Kosten)" },
];

function isActivePath(pathname: string, to: string) {
  if (to === "/buchhaltung") return pathname === "/buchhaltung";
  return pathname.startsWith(to);
}

export default function BuchhaltungLayout() {
  const { pathname } = useLocation();

  return (
    <div className="bh-page">
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>7. Buchhaltung</h1>
        <div style={{ opacity: 0.7, fontSize: 13 }}>
          Übersicht, Rechnungen, Zahlungen, Kostenstellen, Belege und Exporte
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: 10,
          marginTop: 10,
          marginBottom: 12,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {navItems.map((it) => {
          const active = isActivePath(pathname, it.to);

          return (
            <NavLink
              key={it.to}
              to={it.to}
              className={`bh-btn ghost ${active ? "active" : ""}`}
              style={{
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: active ? "1px solid var(--line)" : undefined,
                background: active ? "rgba(59,130,246,0.08)" : undefined,
                fontWeight: active ? 700 : 600,
              }}
            >
              {it.label}
            </NavLink>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
