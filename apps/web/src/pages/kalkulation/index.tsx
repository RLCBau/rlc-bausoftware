// apps/web/src/pages/kalkulation/index.tsx
import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

type NavItem = {
  label: string;
  to: string;
  desc?: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    title: "Projekt & Import",
    items: [
      {
        label: "Projekt",
        to: "/kalkulation/projekt",
        desc: "Projekt wÃ¤hlen / erstellen",
      },
      {
        label: "LV hochladen / erstellen",
        to: "/kalkulation/lvUpload",
        desc: "LV manuell, CSV, Formeln",
      },
      {
        label: "GAEB Import / Export",
        to: "/kalkulation/gaeb",
        desc: "X83 / X84 / GAEB prÃ¼fen",
      },
    ],
  },
  {
    title: "Kalkulation",
    items: [
      {
        label: "Kalkulation mit KI",
        to: "/kalkulation/mit-ki",
        desc: "Elite-KI Kalkulator",
      },
      {
        label: "Kalkulation manuell",
        to: "/kalkulation/manuell",
        desc: "Manuelle LV-Bearbeitung",
      },
      {
        label: "Rezepte / Kalkulationsbausteine",
        to: "/kalkulation/recipes",
        desc: "Vorlagen, Varianten, Ãœbergabe an KI",
      },
      {
        label: "Preise einfÃ¼gen",
        to: "/kalkulation/preise",
        desc: "Material / Arbeit / Maschinen",
      },
      {
        label: "AufschlÃ¤ge / Rabatte",
        to: "/kalkulation/aufschlag",
        desc: "Preisstrategie anwenden",
      },
    ],
  },
  {
    title: "Angebot & PrÃ¼fung",
    items: [
      {
        label: "Angebot / Export",
        to: "/kalkulation/angebot",
        desc: "PDF, Excel und Nachträge",
      },
      {
        label: "Versionsvergleich",
        to: "/kalkulation/vergleich",
        desc: "Angebotsanalyse",
      },
      {
        label: "NachtrÃ¤ge",
        to: "/kalkulation/nachtraege",
        desc: "NachtrÃ¤ge erstellen / prÃ¼fen",
      },
      {
        label: "LV ohne Preise",
        to: "/kalkulation/lvOhnePreis",
        desc: "Ausschreibungs-LV exportieren",
      },
    ],
  },
  {
    title: "Vertrieb",
    items: [
      {
        label: "CRM-Verfolgung",
        to: "/kalkulation/crm",
        desc: "Angebote nachverfolgen",
      },
    ],
  },
];

function isActive(pathname: string, target: string): boolean {
  if (pathname === target) return true;
  return pathname.startsWith(`${target}/`);
}

export default function KalkulationIndex() {
  const loc = useLocation();

  return (
    <div style={shell}>
      <aside style={aside}>
        <div style={brandBox}>
          <div style={brandEyebrow}>RLC Bausoftware</div>
          <div style={brandTitle}>Kalkulation</div>
          <div style={brandText}>
            LV, Preise, KI-Kalkulation, Angebot und NachtrÃ¤ge.
          </div>
        </div>

        <nav style={nav}>
          {groups.map((group) => (
            <div key={group.title} style={groupBox}>
              <div style={groupTitle}>{group.title}</div>

              {group.items.map((entry) => {
                const active = isActive(loc.pathname, entry.to);

                return (
                  <Link
                    key={entry.to}
                    to={entry.to}
                    style={{
                      ...item,
                      ...(active ? itemActive : null),
                    }}
                  >
                    <span style={itemLabel}>{entry.label}</span>
                    {entry.desc ? (
                      <span style={itemDesc}>{entry.desc}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main style={main}>
        <Outlet />
      </main>
    </div>
  );
}

/* ===================== STYLES ===================== */

const shell: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "290px minmax(0, 1fr)",
  height: "100vh",
  background: "#F8FAFC",
  color: "#0F172A",
  fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, Arial",
};

const aside: React.CSSProperties = {
  borderRight: "1px solid #E2E8F0",
  background: "#FFFFFF",
  padding: 14,
  overflowY: "auto",
};

const main: React.CSSProperties = {
  overflow: "auto",
  minWidth: 0,
  background: "#F8FAFC",
};

const brandBox: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 14,
  background: "linear-gradient(135deg,#0F172A,#1E3A8A)",
  color: "#FFFFFF",
  marginBottom: 14,
  boxShadow: "0 12px 28px rgba(15,23,42,0.16)",
};

const brandEyebrow: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.78,
};

const brandTitle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 22,
  fontWeight: 900,
};

const brandText: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  lineHeight: 1.45,
  opacity: 0.85,
};

const nav: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const groupBox: React.CSSProperties = {
  display: "grid",
  gap: 5,
};

const groupTitle: React.CSSProperties = {
  margin: "4px 4px 4px",
  color: "#64748B",
  fontWeight: 900,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
};

const item: React.CSSProperties = {
  display: "grid",
  gap: 2,
  padding: "10px 11px",
  borderRadius: 12,
  color: "#0F172A",
  textDecoration: "none",
  border: "1px solid transparent",
  background: "transparent",
  transition: "background .15s ease, border-color .15s ease, color .15s ease",
};

const itemActive: React.CSSProperties = {
  background: "#EFF6FF",
  border: "1px solid #BFDBFE",
  color: "#1D4ED8",
};

const itemLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 850,
  lineHeight: 1.25,
};

const itemDesc: React.CSSProperties = {
  fontSize: 11,
  color: "#64748B",
  lineHeight: 1.3,
};
