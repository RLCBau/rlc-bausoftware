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
{ to: "/buchhaltung/lieferscheine", label: "Lieferscheine (Kosten)" }];


function normalizePath(path: string) {
  return String(path || "").replace(/\/+$/, "") || "/";
}

function isActivePath(pathname: string, to: string) {
  const current = normalizePath(pathname);
  const target = normalizePath(to);

  if (target === "/buchhaltung") {
    return current === "/buchhaltung";
  }

  return current === target || current.startsWith(`${target}/`);
}

export default function BuchhaltungLayout() {
  const { pathname } = useLocation();

  return (
    <div className="bh-page">
      <header className="rlc-page-hero">






        
        <h1 className="rlc-migrated-pages-buchhaltung-buchhaltunglayout-tsx-164">7. Buchhaltung</h1>
        <div className="rlc-migrated-pages-buchhaltung-buchhaltunglayout-tsx-165">
          Übersicht, Rechnungen, Zahlungen, Kostenstellen, Belege und Exporte
        </div>
      </header>

      <div
        className="bh-module-nav rlc-migrated-pages-buchhaltung-buchhaltunglayout-tsx-166">










        
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
                border: active ? "1px solid var(--line, #d0d7de)" : undefined,
                background: active ? "rgba(59,130,246,0.08)" : undefined,
                fontWeight: active ? 700 : 600
              }}>
              
              {it.label}
            </NavLink>);

        })}
      </div>

      <Outlet />
    </div>);

}
