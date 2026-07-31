import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

const shell: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "260px 1fr",
  minHeight: "100vh",
  background: "#f8fafc"
};

const aside: React.CSSProperties = {
  borderRight: "1px solid #e2e8f0",
  padding: 12,
  fontFamily: "Inter, system-ui, Arial",
  fontSize: 13,
  background: "#ffffff"
};

const main: React.CSSProperties = {
  overflow: "auto",
  padding: 0
};

const item: React.CSSProperties = {
  display: "block",
  padding: "10px 12px",
  margin: "4px 6px",
  borderRadius: 8,
  color: "#0f172a",
  textDecoration: "none",
  transition: "all 0.15s ease"
};

const title: React.CSSProperties = {
  margin: "16px 6px 8px",
  color: "#334155",
  fontWeight: 600,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.4
};

const brand: React.CSSProperties = {
  margin: "4px 6px 14px",
  padding: "10px 12px",
  borderRadius: 10,
  background: "#f8fafc",
  border: "1px solid #e2e8f0"
};

const brandTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "#0f172a",
  marginBottom: 4
};

const brandSub: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.4
};

const supportBox: React.CSSProperties = {
  margin: "18px 6px 6px",
  padding: 12,
  borderRadius: 10,
  background: "#eaf2ff",
  border: "1px solid #bed6ff"
};

const supportTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#0f172a",
  marginBottom: 6
};

const supportText: React.CSSProperties = {
  fontSize: 12,
  color: "#334155",
  lineHeight: 1.45,
  marginBottom: 10
};

const supportBtn: React.CSSProperties = {
  width: "100%",
  border: "none",
  borderRadius: 8,
  background: "#0ea5e9",
  color: "#fff",
  padding: "10px 12px",
  fontWeight: 600,
  cursor: "pointer"
};

export default function InfoIndex() {
  const loc = useLocation();
  const navigate = useNavigate();

  const is = (p: string): React.CSSProperties =>
  loc.pathname === p ?
  {
    background: "#f1f5f9",
    fontWeight: 600,
    color: "#0f172a",
    border: "1px solid #e2e8f0"
  } :
  {};

  return (
    <div className={rlcClass(null, shell)}>
      <aside className={rlcClass(null, aside)}>
        <div className={rlcClass(null, brand)}>
          <div className={rlcClass(null, brandTitle)}>Info & Hilfe</div>
          <div className={rlcClass(null, brandSub)}>
            Anleitungen, FAQ, rechtliche Hinweise und direkter Support für die
            RLC Bausoftware.
          </div>
        </div>

        <div className={rlcClass(null, title)}>Info & Hilfe</div>
        <Link style={{ ...item, ...is("/info/hilfe") }} to="/info/hilfe">
          Hilfe / Anleitungen
        </Link>
        <Link style={{ ...item, ...is("/info/faq") }} to="/info/faq">
          FAQ
        </Link>
        <Link style={{ ...item, ...is("/info/shortcuts") }} to="/info/shortcuts">
          Tastenkürzel
        </Link>
        <Link style={{ ...item, ...is("/info/changelog") }} to="/info/changelog">
          Changelog
        </Link>
        <Link style={{ ...item, ...is("/info/system") }} to="/info/system">
          Systemstatus
        </Link>
        <Link style={{ ...item, ...is("/info/updates") }} to="/info/updates">
          Updates
        </Link>

        <div className={rlcClass(null, title)}>Rechtliches</div>
        <Link
          style={{ ...item, ...is("/info/datenschutz") }}
          to="/info/datenschutz">
          
          Datenschutz
        </Link>
        <Link style={{ ...item, ...is("/info/impressum") }} to="/info/impressum">
          Impressum
        </Link>

        <div className={rlcClass(null, title)}>Kontakt</div>
        <Link style={{ ...item, ...is("/info/support") }} to="/info/support">
          Support / Feedback
        </Link>
        <Link style={{ ...item, ...is("/info/ueber") }} to="/info/ueber">
          Über die App
        </Link>

        <div className={rlcClass(null, supportBox)}>
          <div className={rlcClass(null, supportTitle)}>Support Chat</div>
          <div className={rlcClass(null, supportText)}>
            Direkte Hilfe bei Fragen, Problemen mit Synchronisation, Uploads oder
            Bedienung.
          </div>
          <button className={rlcClass(null,
          supportBtn)}
          onClick={() => navigate("/info/support")}
          type="button">
            
            Support öffnen
          </button>
        </div>
      </aside>

      <main className={rlcClass(null, main)}>
        <Outlet />
      </main>
    </div>);

}
