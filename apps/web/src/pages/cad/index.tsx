import { NavLink, Outlet } from "react-router-dom";
import type { CSSProperties } from "react";

const shellStyle: CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 16,
  minHeight: "100%",
  width: "100%",
  boxSizing: "border-box",
};

const asideStyle: CSSProperties = {
  width: 280,
  padding: 14,
  borderRight: "1px solid #e5e7eb",
  background: "#fafafa",
  flexShrink: 0,
  boxSizing: "border-box",
};

const titleStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: 16,
  marginBottom: 12,
  color: "#111827",
};

const groupTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  margin: "14px 0 8px",
};

const mainStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: "border-box",
};

function getLinkStyle(isActive: boolean): CSSProperties {
  return {
    display: "block",
    padding: "10px 12px",
    borderRadius: 10,
    textDecoration: "none",
    color: isActive ? "#0b57d0" : "#374151",
    background: isActive ? "rgba(11,87,208,0.10)" : "transparent",
    border: isActive
      ? "1px solid rgba(11,87,208,0.18)"
      : "1px solid transparent",
    fontWeight: isActive ? 600 : 500,
    marginBottom: 6,
    transition: "all 0.15s ease",
  };
}

function MenuLink({
  to,
  label,
  end = false,
}: {
  to: string;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink to={to} end={end} style={({ isActive }) => getLinkStyle(isActive)}>
      {label}
    </NavLink>
  );
}

export default function CadLayout() {
  return (
    <div style={shellStyle}>
      <aside style={asideStyle}>
        <div style={titleStyle}>CAD / Viewer</div>

        <MenuLink to="/cad" label="Übersicht" end />

        <div style={groupTitleStyle}>Viewer</div>
        <MenuLink to="/cad/viewer" label="CAD Viewer" />
        <MenuLink to="/cad/pdf-viewer" label="PDF Viewer" />
        <MenuLink to="/cad/map" label="CAD mit Karte" />

        <div style={groupTitleStyle}>Auswertung</div>
        <MenuLink to="/cad/asbuild" label="As-Built" />
        <MenuLink to="/cad/tools" label="Layer & Eigenschaften" />
      </aside>

      <main style={mainStyle}>
        <Outlet />
      </main>
    </div>
  );
}





