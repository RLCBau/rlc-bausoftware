import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/mengenermittlung/index.tsx
import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

const shell: React.CSSProperties = {
  maxWidth: 1480,
  margin: "0 auto",
  padding: "16px 18px 40px",
  fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
  color: "#0f172a",
  background:
  "radial-gradient(circle at top left, rgba(37,99,235,0.06), transparent 30%), #f6f8fc",
  minHeight: "100%"
};

const aside: React.CSSProperties = {
  borderRight: "1px solid #e2e8f0",
  padding: "10px",
  fontFamily: "Inter, system-ui, Arial, Helvetica, sans-serif",
  fontSize: 13
};

const main: React.CSSProperties = {
  overflow: "auto"
};

const groupTitle: React.CSSProperties = {
  margin: "14px 6px 8px",
  color: "#334155",
  fontWeight: 600,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.4
};

const item: React.CSSProperties = {
  display: "block",
  padding: "8px 10px",
  margin: "4px 6px",
  borderRadius: 6,
  color: "#0f172a",
  textDecoration: "none"
};

export default function MengenermittlungIndex() {
  const loc = useLocation();

  const is = (p: string) =>
  loc.pathname === p ? { background: "#f1f5f9", fontWeight: 600 } : {};

  return (
    <div className={rlcClass(null, shell)}>
      <aside className={rlcClass(null, aside)}>
        <div className={rlcClass(null, groupTitle)}>AufmaÃŸ</div>

        <Link
          style={{ ...item, ...is("/mengenermittlung/aufmasseditor") }}
          to="/mengenermittlung/aufmasseditor">
          
          AufmaÃŸeditor
        </Link>

        <Link
          style={{ ...item, ...is("/mengenermittlung/abrechnungskreise") }}
          to="/mengenermittlung/abrechnungskreise">
          
          Abrechnungskreise
        </Link>

        <Link
          style={{ ...item, ...is("/mengenermittlung/bilder") }}
          to="/mengenermittlung/bilder">
          
          Bilder zum AufmaÃŸ
        </Link>

        <div className={rlcClass(null, groupTitle)}>Funktionen</div>
      </aside>

      <main className={rlcClass(null, main)}>
        <Outlet />
      </main>
    </div>);

}
