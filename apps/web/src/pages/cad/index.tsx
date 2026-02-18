import { NavLink, Outlet } from "react-router-dom";

export default function CadLayout() {
  const link = (to: string, label: string) => (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: "block",
        padding: "10px 12px",
        borderRadius: 8,
        textDecoration: "none",
        color: isActive ? "#0b57d0" : "#333",
        background: isActive ? "rgba(11,87,208,0.08)" : "transparent",
        fontWeight: 500,
        marginBottom: 6,
      })}
    >
      {label}
    </NavLink>
  );

  return (
    <div style={{ display: "flex", height: "100%", gap: 16 }}>
      <aside style={{ width: 280, padding: 12, borderRight: "1px solid #eee" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>CAD</div>
        {link("/cad/editor2d", "2D-Zeichnungsmodul")}
        {/* altre voci future… */}
      </aside>
      <main style={{ flex: 1, minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  );
}
