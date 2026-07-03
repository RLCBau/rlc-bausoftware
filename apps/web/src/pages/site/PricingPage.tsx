import React, { useMemo, useRef, useState } from "react";

type PlanKey =
  | "mobile-local"
  | "mobile-cloud"
  | "mobile-web-cloud"
  | "enterprise";

const COLORS = {
  bg: "#f6f8fb",
  card: "#ffffff",
  cardAlt: "#f9fbff",
  text: "#142033",
  sub: "#5f6b7a",
  border: "#d9e1ea",
  accent: "#1f6feb",
  accentSoft: "#eaf2ff",
  accentDark: "#124ea8",
  success: "#0f766e",
  dark: "#0f172a",
  darkCard: "#111827",
  white: "#ffffff",
  shadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
};

const CONTACT_EMAIL = "info@rlcbausoftware.com";

const shell: React.CSSProperties = {
  minHeight: "100vh",
  background: COLORS.bg,
  color: COLORS.text,
  fontFamily: "Inter, system-ui, Arial, sans-serif",
};

const container: React.CSSProperties = {
  maxWidth: 1320,
  margin: "0 auto",
  padding: "0 20px",
};

const heroWrap: React.CSSProperties = {
  padding: "56px 0 28px",
};

const heroGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.1fr 0.9fr",
  gap: 24,
  alignItems: "center",
};

const badge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 999,
  background: COLORS.accentSoft,
  color: COLORS.accentDark,
  fontSize: 13,
  fontWeight: 700,
  border: `1px solid ${COLORS.border}`,
};

const heroTitle: React.CSSProperties = {
  fontSize: "clamp(34px, 5vw, 58px)",
  lineHeight: 1.04,
  margin: "18px 0 14px",
  fontWeight: 800,
  letterSpacing: -1.2,
  maxWidth: 900,
};

const heroSub: React.CSSProperties = {
  fontSize: 18,
  lineHeight: 1.6,
  color: COLORS.sub,
  maxWidth: 860,
  margin: 0,
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 22,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  letterSpacing: -0.5,
  margin: "0 0 10px",
};

const sectionSub: React.CSSProperties = {
  margin: 0,
  color: COLORS.sub,
  fontSize: 16,
  lineHeight: 1.6,
};

const cardsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 18,
  marginTop: 28,
};

const cardBase: React.CSSProperties = {
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 22,
  padding: 22,
  boxShadow: COLORS.shadow,
  position: "relative",
  display: "flex",
  flexDirection: "column",
  minHeight: 470,
};

const cardFeatured: React.CSSProperties = {
  ...cardBase,
  background: COLORS.cardAlt,
  border: `2px solid ${COLORS.accent}`,
  transform: "translateY(-2px)",
};

const cardEnterprise: React.CSSProperties = {
  ...cardBase,
  background: `linear-gradient(180deg, ${COLORS.darkCard} 0%, #172033 100%)`,
  color: COLORS.white,
  border: "1px solid rgba(255,255,255,0.12)",
};

const miniBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#CBD5E1",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 700,
  background: "#FFFFFF",
};

const cardTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  margin: "0 0 8px",
  letterSpacing: -0.4,
};

const cardDesc: React.CSSProperties = {
  color: COLORS.sub,
  fontSize: 14,
  lineHeight: 1.6,
  margin: "0 0 18px",
  minHeight: 66,
};

const priceText: React.CSSProperties = {
  fontSize: 42,
  fontWeight: 900,
  letterSpacing: -1.5,
  lineHeight: 1,
  margin: "4px 0 4px",
};

const priceSub: React.CSSProperties = {
  color: COLORS.sub,
  fontSize: 13,
  marginBottom: 18,
};

const list: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "0 0 20px",
  display: "grid",
  gap: 10,
};

const listItem: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  fontSize: 14,
  lineHeight: 1.45,
};

const ctaPrimary: React.CSSProperties = {
  marginTop: "auto",
  border: "none",
  background: COLORS.accent,
  color: COLORS.white,
  fontWeight: 800,
  fontSize: 14,
  borderRadius: 12,
  padding: "14px 16px",
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const ctaSecondary: React.CSSProperties = {
  ...ctaPrimary,
  background: COLORS.white,
  color: COLORS.text,
  border: `1px solid ${COLORS.border}`,
};

const ctaDark: React.CSSProperties = {
  ...ctaPrimary,
  background: COLORS.white,
  color: COLORS.dark,
};

const panel: React.CSSProperties = {
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 22,
  boxShadow: COLORS.shadow,
  padding: 22,
};

const tableShell: React.CSSProperties = {
  overflowX: "auto",
  borderRadius: 16,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.white,
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 480,
};

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 13,
  color: COLORS.sub,
  fontWeight: 700,
  padding: "14px 16px",
  borderBottom: `1px solid ${COLORS.border}`,
  background: "#fbfcfe",
};

const td: React.CSSProperties = {
  padding: "14px 16px",
  fontSize: 14,
  borderBottom: `1px solid ${COLORS.border}`,
};

const split2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.15fr 0.85fr",
  gap: 18,
  marginTop: 18,
};

const inputLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: COLORS.sub,
  marginBottom: 8,
  display: "block",
};

const input: React.CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 12,
  border: `1px solid ${COLORS.border}`,
  padding: "0 14px",
  fontSize: 15,
  outline: "none",
  background: COLORS.white,
  boxSizing: "border-box",
};

const select: React.CSSProperties = {
  ...input,
  cursor: "pointer",
};

const calcRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const resultBox: React.CSSProperties = {
  background: COLORS.accentSoft,
  border: `1px solid #cfe0ff`,
  borderRadius: 18,
  padding: 20,
};

const resultPrice: React.CSSProperties = {
  fontSize: 38,
  fontWeight: 900,
  lineHeight: 1,
  margin: "8px 0 12px",
  color: COLORS.accentDark,
  letterSpacing: -1,
};

const resultList: React.CSSProperties = {
  display: "grid",
  gap: 8,
  fontSize: 14,
  color: COLORS.text,
};

const faqGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
  marginTop: 18,
};

const faqCard: React.CSSProperties = {
  ...panel,
  padding: 18,
};

const footerNote: React.CSSProperties = {
  color: COLORS.sub,
  fontSize: 13,
  marginTop: 12,
};

const contactGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 18,
  marginTop: 18,
};

const contactCardDark: React.CSSProperties = {
  background: `linear-gradient(180deg, ${COLORS.dark} 0%, #18243a 100%)`,
  color: COLORS.white,
  borderRadius: 22,
  padding: 24,
  boxShadow: COLORS.shadow,
};

const linkText: React.CSSProperties = {
  color: COLORS.accentDark,
  fontWeight: 700,
  textDecoration: "none",
};

function euro(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function webPricePerUser(count: number): number {
  if (count <= 0) return 0;
  return 49;
}

function planName(plan: PlanKey): string {
  switch (plan) {
    case "mobile-local":
      return "Mobile Local";
    case "mobile-cloud":
      return "Mobile + Cloud";
    case "mobile-web-cloud":
      return "Mobile + Web + Cloud";
    case "enterprise":
      return "RLC Enterprise";
    default:
      return "";
  }
}

function planMailSubject(plan: PlanKey): string {
  switch (plan) {
    case "mobile-local":
      return "Anfrage RLC Mobile Local";
    case "mobile-cloud":
      return "Anfrage RLC Mobile + Cloud";
    case "mobile-web-cloud":
      return "Anfrage RLC Mobile + Web + Cloud";
    case "enterprise":
      return "Anfrage RLC Enterprise";
    default:
      return "Anfrage RLC Bausoftware";
  }
}

function Check({ dark = false }: { dark?: boolean }) {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        minWidth: 18,
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: dark ? "rgba(255,255,255,0.14)" : "#e8f5ee",
        color: dark ? "#fff" : COLORS.success,
        fontSize: 12,
        fontWeight: 900,
        marginTop: 2,
      }}
    >
      ✓
    </span>
  );
}

export default function PricingPage() {
  const [plan, setPlan] = useState<PlanKey>("mobile-web-cloud");
  const [mobileUsers, setMobileUsers] = useState<number>(1);
  const [webUsers, setWebUsers] = useState<number>(1);

  const calcRef = useRef<HTMLDivElement | null>(null);
  const contactRef = useRef<HTMLDivElement | null>(null);

  const calc = useMemo(() => {
    const mCount = Math.max(0, Number(mobileUsers) || 0);
    const wCount = Math.max(0, Number(webUsers) || 0);

    let cloudBase = 0;
    let setup = 0;
    let monthlyBase = 0;
    let mobileTotal = 0;
    let webTotal = 0;
    let mobileRate = 9;
    let webRate = webPricePerUser(wCount);

    if (plan === "mobile-local") {
      mobileRate = 9;
      mobileTotal = mCount * mobileRate;
    }

    if (plan === "mobile-cloud") {
      cloudBase = 29;
      mobileRate = 9;
      mobileTotal = mCount * mobileRate;
    }

    if (plan === "mobile-web-cloud") {
      cloudBase = 29;
      mobileRate = 9;
      webRate = webPricePerUser(wCount);
      mobileTotal = mCount * mobileRate;
      webTotal = wCount * webRate;
    }

    if (plan === "enterprise") {
      setup = 3000;
      monthlyBase = 99;
      mobileRate = 9;
      webRate = webPricePerUser(wCount);
      mobileTotal = mCount * mobileRate;
      webTotal = wCount * webRate;
    }

    const total = cloudBase + monthlyBase + mobileTotal + webTotal;

    return {
      mobileRate,
      webRate,
      cloudBase,
      monthlyBase,
      setup,
      mobileTotal,
      webTotal,
      total,
      mCount,
      wCount,
    };
  }, [plan, mobileUsers, webUsers]);

  function scrollToCalculator(nextPlan?: PlanKey) {
    if (nextPlan) setPlan(nextPlan);
    calcRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToContact(nextPlan?: PlanKey) {
    if (nextPlan) setPlan(nextPlan);
    contactRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openMail(selectedPlan: PlanKey) {
    const subject = encodeURIComponent(planMailSubject(selectedPlan));
    const body = encodeURIComponent(
      [
        "Hallo RLC Team,",
        "",
        `ich interessiere mich für das Paket: ${planName(selectedPlan)}.`,
        "",
        "Bitte senden Sie mir weitere Informationen / eine Demo.",
        "",
        "Unternehmen:",
        "Ansprechpartner:",
        "Telefon:",
        "E-Mail:",
        "",
        "Mit freundlichen Grüßen",
      ].join("\n")
    );

    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <div style={shell}>
      <div style={container}>
        <section style={heroWrap}>
          <div style={heroGrid}>
            <div>
              <div style={badge}>RLC Bausoftware · Preisübersicht</div>
              <h1 style={heroTitle}>Preise für jede Unternehmensgröße</h1>
              <p style={heroSub}>
                Vom mobilen Baustelleneinsatz bis zur vollständigen Büro- und
                Cloud-Lösung. Starte einfach und erweitere dein System genau
                dann, wenn dein Unternehmen wächst.
              </p>

              <div style={heroActions}>
                <button
                  type="button"
                  style={ctaPrimary}
                  onClick={() => scrollToCalculator("mobile-web-cloud")}
                >
                  Preis berechnen
                </button>
                <button
                  type="button"
                  style={ctaSecondary}
                  onClick={() => scrollToContact("enterprise")}
                >
                  Demo anfragen
                </button>
              </div>
            </div>

            <div style={panel}>
              <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 22 }}>
                Klare Preislogik
              </h3>
              <p style={{ ...sectionSub, marginBottom: 14 }}>
                Keine unübersichtlichen Pakete. Die Struktur ist einfach:
              </p>
              <ul style={{ ...list, marginBottom: 0 }}>
                <li style={listItem}>
                  <Check /> Mobile Local: 9€ pro Nutzer / Monat
                </li>
                <li style={listItem}>
                  <Check /> Cloud-Basis: 29€ / Monat
                </li>
                <li style={listItem}>
                  <Check /> Web-Lizenz: 49€ pro Nutzer / Monat
                </li>
                <li style={listItem}>
                  <Check /> Enterprise mit privatem Server und Setup
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section style={{ padding: "8px 0 18px" }}>
          <div style={cardsGrid}>
            <div style={cardBase}>
              <div style={cardTitle}>Mobile Local</div>
              <p style={cardDesc}>
                Für kleine Teams oder Einzelunternehmer, die komplett lokal und
                offline auf dem Smartphone oder Tablet arbeiten möchten.
              </p>
              <div style={priceText}>9€</div>
              <div style={priceSub}>pro Mobile-Nutzer / Monat</div>

              <ul style={list}>
                <li style={listItem}>
                  <Check /> Regieberichte direkt auf dem Handy
                </li>
                <li style={listItem}>
                  <Check /> Lieferscheine, Fotos und PDF-Export
                </li>
                <li style={listItem}>
                  <Check /> Offline nutzbar ohne Server
                </li>
                <li style={listItem}>
                  <Check /> Ideal für den einfachen Einstieg
                </li>
              </ul>

              <button
                type="button"
                style={ctaSecondary}
                onClick={() => scrollToCalculator("mobile-local")}
              >
                Jetzt berechnen
              </button>
            </div>

            <div style={cardBase}>
              <div
                style={{
                  ...miniBadge,
                  background: "#e9f5ff",
                  color: COLORS.accentDark,
                }}
              >
                Beliebt für Baustellen
              </div>
              <div style={cardTitle}>Mobile + Cloud</div>
              <p style={cardDesc}>
                Zentrale Ablage und Synchronisierung für Unternehmen, die mobil
                arbeiten, aber noch keinen vollständigen Büro-Arbeitsplatz
                benötigen.
              </p>
              <div style={priceText}>29€</div>
              <div style={priceSub}>Cloud-Basis / Monat + 9€ pro Mobile-Nutzer</div>

              <ul style={list}>
                <li style={listItem}>
                  <Check /> Zentraler Cloud-Speicher für Projektdaten
                </li>
                <li style={listItem}>
                  <Check /> Geräte-Synchronisierung und Backups
                </li>
                <li style={listItem}>
                  <Check /> Web-Zugriff für Ansicht und Download
                </li>
                <li style={listItem}>
                  <Check /> Kein vollwertiger Web-Arbeitsplatz nötig
                </li>
              </ul>

              <button
                type="button"
                style={ctaSecondary}
                onClick={() => scrollToCalculator("mobile-cloud")}
              >
                Cloud-Kosten berechnen
              </button>
            </div>

            <div style={cardFeatured}>
              <div style={miniBadge}>Am beliebtesten</div>
              <div style={cardTitle}>Mobile + Web + Cloud</div>
              <p style={cardDesc}>
                Das vollständige System für Baustelle und Büro mit
                Mengenermittlung, Kalkulation, Projektstruktur und zentralem
                Datenzugriff.
              </p>
              <div style={priceText}>ab 78€</div>
              <div style={priceSub}>
                29€ Cloud + 49€ Web-Lizenz + 9€ pro Mobile-Nutzer
              </div>

              <ul style={list}>
                <li style={listItem}>
                  <Check /> Alles aus Mobile + Cloud
                </li>
                <li style={listItem}>
                  <Check /> Vollständige Web-App für Büro und Verwaltung
                </li>
                <li style={listItem}>
                  <Check /> Kalkulation und Mengenermittlung
                </li>
                <li style={listItem}>
                  <Check /> Mehrbenutzerfähig und skalierbar
                </li>
              </ul>

              <button
                type="button"
                style={ctaPrimary}
                onClick={() => scrollToCalculator("mobile-web-cloud")}
              >
                Komplettes System berechnen
              </button>
            </div>

            <div style={cardEnterprise}>
              <div
                style={{
                  ...miniBadge,
                  background: "rgba(255,255,255,0.12)",
                  color: COLORS.white,
                  border: "1px solid rgba(255,255,255,0.14)",
                }}
              >
                Enterprise
              </div>
              <div style={cardTitle}>RLC Enterprise</div>
              <p style={{ ...cardDesc, color: "rgba(255,255,255,0.74)" }}>
                Für Unternehmen mit eigener Infrastruktur, privatem Server,
                erweitertem Datenschutz und individueller Rollout-Strategie.
              </p>
              <div style={{ ...priceText, color: COLORS.white }}>3.000€</div>
              <div style={{ ...priceSub, color: "rgba(255,255,255,0.68)" }}>
                einmaliges Setup + 99€ / Monat
              </div>

              <ul style={list}>
                <li style={{ ...listItem, color: COLORS.white }}>
                  <Check dark /> Private Server / Self-Hosted
                </li>
                <li style={{ ...listItem, color: COLORS.white }}>
                  <Check dark /> Mobile + Web in eigener Infrastruktur
                </li>
                <li style={{ ...listItem, color: COLORS.white }}>
                  <Check dark /> Geeignet für größere Unternehmen
                </li>
                <li style={{ ...listItem, color: COLORS.white }}>
                  <Check dark /> Individuelle Einführung und IT-Abstimmung
                </li>
              </ul>

              <button
                type="button"
                style={ctaDark}
                onClick={() => openMail("enterprise")}
              >
                Enterprise anfragen
              </button>
            </div>
          </div>
        </section>

        <section style={{ padding: "34px 0 6px" }}>
          <h2 style={sectionTitle}>Lizenzübersicht</h2>
          <p style={sectionSub}>
            Klare, skalierbare Preisstruktur ohne komplizierte Pakete.
          </p>

          <div style={split2}>
            <div style={panel}>
              <h3 style={{ marginTop: 0, marginBottom: 14, fontSize: 20 }}>
                Basispreise
              </h3>
              <div style={tableShell}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Modell</th>
                      <th style={th}>Preis</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={td}>Mobile Local</td>
                      <td style={td}>9€ / Mobile-Nutzer / Monat</td>
                    </tr>
                    <tr>
                      <td style={td}>Cloud-Basis</td>
                      <td style={td}>29€ / Monat</td>
                    </tr>
                    <tr>
                      <td style={td}>Web-Lizenz</td>
                      <td style={td}>49€ / Web-Nutzer / Monat</td>
                    </tr>
                    <tr>
                      <td style={td}>Enterprise</td>
                      <td style={td}>3.000€ Setup + 99€ / Monat</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div style={panel}>
              <h3 style={{ marginTop: 0, marginBottom: 14, fontSize: 20 }}>
                Preislogik
              </h3>
              <div style={tableShell}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Paket</th>
                      <th style={th}>Berechnung</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={td}>Mobile Local</td>
                      <td style={td}>9€ × Mobile-Nutzer</td>
                    </tr>
                    <tr>
                      <td style={td}>Mobile + Cloud</td>
                      <td style={td}>29€ + (9€ × Mobile-Nutzer)</td>
                    </tr>
                    <tr>
                      <td style={td}>Mobile + Web + Cloud</td>
                      <td style={td}>29€ + (49€ × Web-Nutzer) + (9€ × Mobile-Nutzer)</td>
                    </tr>
                    <tr>
                      <td style={td}>Enterprise</td>
                      <td style={td}>99€ + (49€ × Web-Nutzer) + (9€ × Mobile-Nutzer) + Setup</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p style={footerNote}>
                Web-Lizenz: 49€ pro Web-Nutzer / Monat.
              </p>
            </div>
          </div>
        </section>

        <section ref={calcRef} style={{ padding: "34px 0 6px" }}>
          <h2 style={sectionTitle}>Preisrechner</h2>
          <p style={sectionSub}>Rechne dein Monatsmodell direkt durch.</p>

          <div style={split2}>
            <div style={panel}>
              <div style={{ marginBottom: 14 }}>
                <label style={inputLabel}>Paket</label>
                <select
                  style={select}
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as PlanKey)}
                >
                  <option value="mobile-local">Mobile Local</option>
                  <option value="mobile-cloud">Mobile + Cloud</option>
                  <option value="mobile-web-cloud">Mobile + Web + Cloud</option>
                  <option value="enterprise">RLC Enterprise</option>
                </select>
              </div>

              <div style={calcRow}>
                <div>
                  <label style={inputLabel}>Mobile-Nutzer</label>
                  <input
                    style={input}
                    type="number"
                    min={0}
                    value={mobileUsers}
                    onChange={(e) =>
                      setMobileUsers(Math.max(0, Number(e.target.value || 0)))
                    }
                  />
                </div>

                <div>
                  <label style={inputLabel}>Web-Nutzer</label>
                  <input
                    style={input}
                    type="number"
                    min={0}
                    value={webUsers}
                    onChange={(e) =>
                      setWebUsers(Math.max(0, Number(e.target.value || 0)))
                    }
                  />
                </div>
              </div>

              <p style={footerNote}>
                Web-Lizenz: 49€ pro Web-Nutzer / Monat.
              </p>

              <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={ctaPrimary}
                  onClick={() => openMail(plan)}
                >
                  Angebot anfragen
                </button>
                <button
                  type="button"
                  style={ctaSecondary}
                  onClick={() => scrollToContact(plan)}
                >
                  Kontakt aufnehmen
                </button>
              </div>
            </div>

            <div style={resultBox}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: COLORS.accentDark,
                }}
              >
                Berechnung
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
                {planName(plan)}
              </div>
              <div style={resultPrice}>{euro(calc.total)} / Monat</div>

              <div style={resultList}>
                {calc.cloudBase > 0 && <div>Cloud-Basis: {euro(calc.cloudBase)}</div>}
                {calc.monthlyBase > 0 && (
                  <div>Enterprise-Basis: {euro(calc.monthlyBase)}</div>
                )}
                {calc.mCount > 0 && (
                  <div>
                    Mobile: {calc.mCount} × {euro(calc.mobileRate)} = {euro(calc.mobileTotal)}
                  </div>
                )}
                {calc.wCount > 0 &&
                  (plan === "mobile-web-cloud" || plan === "enterprise") && (
                    <div>
                      Web: {calc.wCount} × {euro(calc.webRate)} = {euro(calc.webTotal)}
                    </div>
                  )}
                {plan === "enterprise" && (
                  <div>Einmaliges Setup: {euro(calc.setup)}</div>
                )}
              </div>

              <p style={{ ...footerNote, marginTop: 16 }}>
                Alle Preise monatlich, außer einmaligem Enterprise-Setup.
              </p>
            </div>
          </div>
        </section>

        <section style={{ padding: "34px 0 6px" }}>
          <h2 style={sectionTitle}>Häufige Fragen</h2>
          <p style={sectionSub}>
            Die wichtigsten Antworten direkt auf einen Blick.
          </p>

          <div style={faqGrid}>
            <div style={faqCard}>
              <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>
                Muss ich Web dazubuchen?
              </h3>
              <p style={{ margin: 0, color: COLORS.sub, lineHeight: 1.6 }}>
                Nein. Mobile + Cloud funktioniert auch ohne Web-Lizenzen. Du
                erhältst trotzdem zentralen Cloud-Speicher sowie Web-Zugriff für
                Datei-Ansicht und Downloads.
              </p>
            </div>

            <div style={faqCard}>
              <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>
                Kann ich später upgraden?
              </h3>
              <p style={{ margin: 0, color: COLORS.sub, lineHeight: 1.6 }}>
                Ja. Du kannst jederzeit von Mobile Local auf Cloud und später
                auf Mobile + Web + Cloud oder Enterprise wechseln.
              </p>
            </div>

            <div style={faqCard}>
              <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>
                Funktioniert die App offline?
              </h3>
              <p style={{ margin: 0, color: COLORS.sub, lineHeight: 1.6 }}>
                Ja. Besonders im Mobile-Bereich ist Offline-Nutzung zentral.
                Daten können lokal erfasst und später synchronisiert werden.
              </p>
            </div>

            <div style={faqCard}>
              <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>
                Gibt es eine private Server-Version?
              </h3>
              <p style={{ margin: 0, color: COLORS.sub, lineHeight: 1.6 }}>
                Ja. Für größere Unternehmen gibt es RLC Enterprise mit privatem
                Server, eigener Infrastruktur und individueller Einführung.
              </p>
            </div>
          </div>
        </section>

        <section ref={contactRef} style={{ padding: "34px 0 60px" }}>
          <h2 style={sectionTitle}>Kontakt & Demo</h2>
          <p style={sectionSub}>
            Du möchtest ein Angebot, eine Demo oder eine Enterprise-Abstimmung?
          </p>

          <div style={contactGrid}>
            <div style={panel}>
              <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 22 }}>
                Schnellkontakt
              </h3>
              <p style={{ ...sectionSub, marginBottom: 16 }}>
                Für Preisfragen, Demo-Termine und Projektgespräche.
              </p>

              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <strong>E-Mail:</strong>{" "}
                  <a href={`mailto:${CONTACT_EMAIL}`} style={linkText}>
                    {CONTACT_EMAIL}
                  </a>
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <a
                    href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                      "Demo-Anfrage RLC Bausoftware"
                    )}`}
                    style={ctaPrimary}
                  >
                    Demo per E-Mail anfragen
                  </a>

                  <button
                    type="button"
                    style={ctaSecondary}
                    onClick={() => openMail(plan)}
                  >
                    Paket anfragen
                  </button>
                </div>
              </div>

              <p style={footerNote}>
                Für Enterprise-Projekte kann die Einführung individuell geplant
                werden.
              </p>
            </div>

            <div style={contactCardDark}>
              <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 24 }}>
                RLC Enterprise
              </h3>
              <p
                style={{
                  margin: 0,
                  color: "rgba(255,255,255,0.78)",
                  lineHeight: 1.7,
                }}
              >
                Private Serverlösung für Unternehmen mit höherem Anspruch an
                Datenschutz, IT-Kontrolle und individueller Infrastruktur.
              </p>

              <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
                <div>
                  <Check dark /> Setup: 3.000€ einmalig
                </div>
                <div>
                  <Check dark /> Basis: 99€ / Monat
                </div>
                <div>
                  <Check dark /> Mobile-Nutzer separat skalierbar
                </div>
                <div>
                  <Check dark /> Web-Lizenz: 49€ / Nutzer / Monat
                </div>
              </div>

              <div style={{ marginTop: 22 }}>
                <button
                  type="button"
                  style={ctaDark}
                  onClick={() => openMail("enterprise")}
                >
                  Enterprise-Beratung anfragen
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}