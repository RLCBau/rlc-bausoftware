// apps/web/src/pages/mengenermittlung/index.tsx
import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

const shell: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "240px 1fr",
  height: "calc(100vh - 0px)",
};

const aside: React.CSSProperties = {
  borderRight: "1px solid #e2e8f0",
  padding: "10px",
  fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
  fontSize: 13,
};

const main: React.CSSProperties = {
  overflow: "auto",
};

const groupTitle: React.CSSProperties = {
  margin: "14px 6px 8px",
  color: "#334155",
  fontWeight: 700,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const item: React.CSSProperties = {
  display: "block",
  padding: "8px 10px",
  margin: "4px 6px",
  borderRadius: 6,
  color: "#0f172a",
  textDecoration: "none",
};

export default function MengenermittlungIndex() {
  const loc = useLocation();
  const is = (p: string) => (loc.pathname === p ? { background: "#f1f5f9", fontWeight: 600 } : {});
  return (
    <div style={shell}>
      <aside style={aside}>
        <div style={groupTitle}>Aufmaß</div>
        <Link style={{ ...item, ...is("/mengenermittlung/auftragsliste") }} to="/mengenermittlung/auftragsliste">Auftragsliste</Link>
        <Link style={{ ...item, ...is("/mengenermittlung/aufmaseditor") }} to="/mengenermittlung/aufmaseditor">Aufmaßeditor</Link>
        <Link style={{ ...item, ...is("/mengenermittlung/raumbuch") }} to="/mengenermittlung/raumbuch">Raumbuch / Raumaufmaße</Link>
        <Link style={{ ...item, ...is("/mengenermittlung/abrechnungskreise") }} to="/mengenermittlung/abrechnungskreise">Abrechnungskreise</Link>
        <Link style={{ ...item, ...is("/mengenermittlung/bilder") }} to="/mengenermittlung/bilder">Bilder zum Aufmaß</Link>

        <div style={groupTitle}>Funktionen</div>
        <Link style={{ ...item, ...is("/mengenermittlung/neuberechnung") }} to="/mengenermittlung/neuberechnung">Neuberechnung</Link>
        <Link style={{ ...item, ...is("/mengenermittlung/ausdrucke") }} to="/mengenermittlung/ausdrucke">Ausdrucke</Link>
        <Link style={{ ...item, ...is("/mengenermittlung/datenaustausch") }} to="/mengenermittlung/datenaustausch">Datenaustausch</Link>
        <Link style={{ ...item, ...is("/mengenermittlung/stammdaten") }} to="/mengenermittlung/stammdaten">Stammdaten</Link>
      </aside>
      <main style={main}>
        <Outlet />
      </main>
    </div>
  );
}
