import { Link } from "react-router-dom";

const shell: React.CSSProperties = {
  position: "relative",
  minHeight: "100vh",
  overflow: "hidden",
  color: "#fff",
  textAlign: "center",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const bg: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage: "url('/src/assets/construction-bg.jpg')",
  backgroundSize: "cover",
  backgroundPosition: "center",
  filter: "brightness(0.6)",
};

const gradient: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.65) 100%)",
};

const card: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  maxWidth: 980,
  padding: "48px 32px",
};

const title: React.CSSProperties = {
  fontSize: 56,
  lineHeight: 1.1,
  margin: "18px 0 12px",
  fontWeight: 800,
  letterSpacing: ".5px",
};

const subtitle: React.CSSProperties = {
  fontSize: 20,
  lineHeight: 1.7,
  opacity: 0.95,
  margin: "0 auto 32px",
};

const ctas: React.CSSProperties = {
  display: "flex",
  gap: 16,
  justifyContent: "center",
  flexWrap: "wrap",
};

const btn = (variant: "primary" | "ghost"): React.CSSProperties => ({
  padding: "11px 18px",
  borderRadius: 10,
  border: variant === "ghost" ? "1px solid rgba(255,255,255,.5)" : "none",
  background:
    variant === "ghost"
      ? "transparent"
      : "linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: ".2px",
  textDecoration: "none",
  boxShadow:
    variant === "ghost"
      ? "none"
      : "0 8px 30px rgba(34,197,94,.35), 0 4px 12px rgba(14,165,233,.25)",
});

export default function Startseite() {
  return (
    <main style={shell}>
      <div style={bg} />
      <div style={gradient} />

      <section style={card}>
        {/* Logo ufficiale (SVG a colori) con fallback PNG */}
        <img
          src="/src/assets/lo-curto.svg"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = "/src/assets/lo-curto.png";
          }}
          alt="Lo Curto – Wappen"
          style={{ width: 160, height: "auto", marginBottom: 8 }}
        />

        <h1 style={title}>RLC Bausoftware</h1>

        <p style={subtitle}>
          Die <b>RLC Bausoftware</b> ist die neue, intelligente Plattform für
          Kalkulation, Massenermittlung, CAD, Büro & Verwaltung, Abrechnung,
          KI-gestützte Assistenz sowie Info & Hilfe. Unser Ziel: die
          <b> leistungsstärkste und modernste Bausoftware</b> am Markt, die den
          kompletten Bauprozess – von Planung bis Abrechnung – effizient,
          transparent und teilweise automatisiert abbildet.
        </p>

        <div style={ctas}>
          <Link to="/kalkulation" style={btn("primary")}>→ Kalkulation starten</Link>
          <Link to="/mengenermittlung" style={btn("ghost")}>Mengenermittlung ansehen</Link>
          <Link to="/cad" style={btn("ghost")}>CAD / BIM</Link>
        </div>
      </section>
    </main>
  );
}
