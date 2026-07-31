import { rlcClass } from "../../ui/rlcRuntimeStyle";import React, { useMemo, useRef, useState } from "react";

type PlanKey =
"mobile-local" |
"mobile-cloud" |
"mobile-web-cloud" |
"enterprise";

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
  shadow: "0 10px 30px rgba(15, 23, 42, 0.08)"
};

const CONTACT_EMAIL = "info@rlcbausoftware.com";

const shell: React.CSSProperties = {
  minHeight: "100vh",
  background: COLORS.bg,
  color: COLORS.text,
  fontFamily: "Inter, system-ui, Arial, sans-serif"
};

const container: React.CSSProperties = {
  maxWidth: 1320,
  margin: "0 auto",
  padding: "0 20px"
};

const heroWrap: React.CSSProperties = {
  padding: "56px 0 28px"
};

const heroGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.1fr 0.9fr",
  gap: 24,
  alignItems: "center"
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
  fontWeight: 600,
  border: `1px solid ${COLORS.border}`
};

const heroTitle: React.CSSProperties = {
  color: "#FFFFFF", fontSize: "clamp(34px, 5vw, 58px)",
  lineHeight: 1.04,
  margin: "18px 0 14px",
  fontWeight: 700,
  letterSpacing: -1.2,
  maxWidth: 900
};

const heroSub: React.CSSProperties = {
  fontSize: 18,
  lineHeight: 1.6,
  color: COLORS.sub,
  maxWidth: 860,
  margin: 0
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 22
};

const sectionTitle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: -0.5,
  margin: "0 0 10px"
};

const sectionSub: React.CSSProperties = {
  margin: 0,
  color: COLORS.sub,
  fontSize: 16,
  lineHeight: 1.6
};

const cardsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 18,
  marginTop: 28
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
  minHeight: 470
};

const cardFeatured: React.CSSProperties = {
  ...cardBase,
  background: COLORS.cardAlt,
  border: `2px solid ${COLORS.accent}`,
  transform: "translateY(-2px)"
};

const cardEnterprise: React.CSSProperties = {
  ...cardBase,
  background: `linear-gradient(180deg, ${COLORS.darkCard} 0%, #172033 100%)`,
  color: COLORS.white,
  border: "1px solid rgba(255,255,255,0.12)"
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
  fontWeight: 600,
  background: "#FFFFFF"
};

const cardTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  margin: "0 0 8px",
  letterSpacing: -0.4
};

const cardDesc: React.CSSProperties = {
  color: COLORS.sub,
  fontSize: 14,
  lineHeight: 1.6,
  margin: "0 0 18px",
  minHeight: 66
};

const priceText: React.CSSProperties = {
  fontSize: 42,
  fontWeight: 700,
  letterSpacing: -1.5,
  lineHeight: 1,
  margin: "4px 0 4px"
};

const priceSub: React.CSSProperties = {
  color: COLORS.sub,
  fontSize: 13,
  marginBottom: 18
};

const list: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "0 0 20px",
  display: "grid",
  gap: 10
};

const listItem: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  fontSize: 14,
  lineHeight: 1.45
};

const ctaPrimary: React.CSSProperties = {
  marginTop: "auto",
  border: "none",
  background: COLORS.accent,
  color: COLORS.white,
  fontWeight: 700,
  fontSize: 14,
  borderRadius: 12,
  padding: "14px 16px",
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center"
};

const ctaSecondary: React.CSSProperties = {
  ...ctaPrimary,
  background: COLORS.white,
  color: COLORS.text,
  border: `1px solid ${COLORS.border}`
};

const ctaDark: React.CSSProperties = {
  ...ctaPrimary,
  background: COLORS.white,
  color: COLORS.dark
};

const panel: React.CSSProperties = {
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 22,
  boxShadow: COLORS.shadow,
  padding: 22
};

const tableShell: React.CSSProperties = {
  overflowX: "auto",
  borderRadius: 16,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.white
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 480
};

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 13,
  color: COLORS.sub,
  fontWeight: 600,
  padding: "14px 16px",
  borderBottom: `1px solid ${COLORS.border}`,
  background: "#fbfcfe"
};

const td: React.CSSProperties = {
  padding: "14px 16px",
  fontSize: 14,
  borderBottom: `1px solid ${COLORS.border}`
};

const split2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.15fr 0.85fr",
  gap: 18,
  marginTop: 18
};

const inputLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: COLORS.sub,
  marginBottom: 8,
  display: "block"
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
  boxSizing: "border-box"
};

const select: React.CSSProperties = {
  ...input,
  cursor: "pointer"
};

const calcRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14
};

const resultBox: React.CSSProperties = {
  background: COLORS.accentSoft,
  border: `1px solid #cfe0ff`,
  borderRadius: 18,
  padding: 20
};

const resultPrice: React.CSSProperties = {
  fontSize: 38,
  fontWeight: 700,
  lineHeight: 1,
  margin: "8px 0 12px",
  color: COLORS.accentDark,
  letterSpacing: -1
};

const resultList: React.CSSProperties = {
  display: "grid",
  gap: 8,
  fontSize: 14,
  color: COLORS.text
};

const faqGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
  marginTop: 18
};

const faqCard: React.CSSProperties = {
  ...panel,
  padding: 18
};

const footerNote: React.CSSProperties = {
  color: COLORS.sub,
  fontSize: 13,
  marginTop: 12
};

const contactGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 18,
  marginTop: 18
};

const contactCardDark: React.CSSProperties = {
  background: `linear-gradient(180deg, ${COLORS.dark} 0%, #18243a 100%)`,
  color: COLORS.white,
  borderRadius: 22,
  padding: 24,
  boxShadow: COLORS.shadow
};

const linkText: React.CSSProperties = {
  color: COLORS.accentDark,
  fontWeight: 600,
  textDecoration: "none"
};

function euro(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
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

function Check({ dark = false }: {dark?: boolean;}) {
  return (
    <span className={rlcClass(null,
    {
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
      fontWeight: 700,
      marginTop: 2
    })}>
      
      ✓
    </span>);

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
      wCount
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
      "Mit freundlichen Grüßen"].
      join("\n")
    );

    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <div className={rlcClass(null, shell)}>
      <div className={rlcClass(null, container)}>
        <section className={rlcClass(null, heroWrap)}>
          <div className={rlcClass(null, heroGrid)}>
            <div>
              <div className={rlcClass(null, badge)}>RLC Bausoftware · Preisübersicht</div>
              <h1 className={rlcClass(null, heroTitle)}>Preise für jede Unternehmensgröße</h1>
              <p className={rlcClass(null, heroSub)}>
                Vom mobilen Baustelleneinsatz bis zur vollständigen Büro- und
                Cloud-Lösung. Starte einfach und erweitere dein System genau
                dann, wenn dein Unternehmen wächst.
              </p>

              <div className={rlcClass(null, heroActions)}>
                <button
                  type="button" className={rlcClass(null,
                  ctaPrimary)}
                  onClick={() => scrollToCalculator("mobile-web-cloud")}>
                  
                  Preis berechnen
                </button>
                <button
                  type="button" className={rlcClass(null,
                  ctaSecondary)}
                  onClick={() => scrollToContact("enterprise")}>
                  
                  Demo anfragen
                </button>
              </div>
            </div>

            <div className={rlcClass(null, panel)}>
              <h3 className="rlc-migrated-pages-site-pricingpage-tsx-1538">
                Klare Preislogik
              </h3>
              <p className={rlcClass(null, { ...sectionSub, marginBottom: 14 })}>
                Keine unübersichtlichen Pakete. Die Struktur ist einfach:
              </p>
              <ul className={rlcClass(null, { ...list, marginBottom: 0 })}>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Mobile Local: 9€ pro Nutzer / Monat
                </li>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Cloud-Basis: 29€ / Monat
                </li>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Web-Lizenz: 49€ pro Nutzer / Monat
                </li>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Enterprise mit privatem Server und Setup
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="rlc-migrated-pages-site-pricingpage-tsx-1539">
          <div className={rlcClass(null, cardsGrid)}>
            <div className={rlcClass(null, cardBase)}>
              <div className={rlcClass(null, cardTitle)}>Mobile Local</div>
              <p className={rlcClass(null, cardDesc)}>
                Für kleine Teams oder Einzelunternehmer, die komplett lokal und
                offline auf dem Smartphone oder Tablet arbeiten möchten.
              </p>
              <div className={rlcClass(null, priceText)}>9€</div>
              <div className={rlcClass(null, priceSub)}>pro Mobile-Nutzer / Monat</div>

              <ul className={rlcClass(null, list)}>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Regieberichte direkt auf dem Handy
                </li>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Lieferscheine, Fotos und PDF-Export
                </li>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Offline nutzbar ohne Server
                </li>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Ideal für den einfachen Einstieg
                </li>
              </ul>

              <button
                type="button" className={rlcClass(null,
                ctaSecondary)}
                onClick={() => scrollToCalculator("mobile-local")}>
                
                Jetzt berechnen
              </button>
            </div>

            <div className={rlcClass(null, cardBase)}>
              <div className={rlcClass(null,
              {
                ...miniBadge,
                background: "#e9f5ff",
                color: COLORS.accentDark
              })}>
                
                Beliebt für Baustellen
              </div>
              <div className={rlcClass(null, cardTitle)}>Mobile + Cloud</div>
              <p className={rlcClass(null, cardDesc)}>
                Zentrale Ablage und Synchronisierung für Unternehmen, die mobil
                arbeiten, aber noch keinen vollständigen Büro-Arbeitsplatz
                benötigen.
              </p>
              <div className={rlcClass(null, priceText)}>29€</div>
              <div className={rlcClass(null, priceSub)}>Cloud-Basis / Monat + 9€ pro Mobile-Nutzer</div>

              <ul className={rlcClass(null, list)}>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Zentraler Cloud-Speicher für Projektdaten
                </li>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Geräte-Synchronisierung und Backups
                </li>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Web-Zugriff für Ansicht und Download
                </li>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Kein vollwertiger Web-Arbeitsplatz nötig
                </li>
              </ul>

              <button
                type="button" className={rlcClass(null,
                ctaSecondary)}
                onClick={() => scrollToCalculator("mobile-cloud")}>
                
                Cloud-Kosten berechnen
              </button>
            </div>

            <div className={rlcClass(null, cardFeatured)}>
              <div className={rlcClass(null, miniBadge)}>Am beliebtesten</div>
              <div className={rlcClass(null, cardTitle)}>Mobile + Web + Cloud</div>
              <p className={rlcClass(null, cardDesc)}>
                Das vollständige System für Baustelle und Büro mit
                Mengenermittlung, Kalkulation, Projektstruktur und zentralem
                Datenzugriff.
              </p>
              <div className={rlcClass(null, priceText)}>ab 78€</div>
              <div className={rlcClass(null, priceSub)}>
                29€ Cloud + 49€ Web-Lizenz + 9€ pro Mobile-Nutzer
              </div>

              <ul className={rlcClass(null, list)}>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Alles aus Mobile + Cloud
                </li>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Vollständige Web-App für Büro und Verwaltung
                </li>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Kalkulation und Mengenermittlung
                </li>
                <li className={rlcClass(null, listItem)}>
                  <Check /> Mehrbenutzerfähig und skalierbar
                </li>
              </ul>

              <button
                type="button" className={rlcClass(null,
                ctaPrimary)}
                onClick={() => scrollToCalculator("mobile-web-cloud")}>
                
                Komplettes System berechnen
              </button>
            </div>

            <div className={rlcClass(null, cardEnterprise)}>
              <div className={rlcClass(null,
              {
                ...miniBadge,
                background: "rgba(255,255,255,0.12)",
                color: COLORS.white,
                border: "1px solid rgba(255,255,255,0.14)"
              })}>
                
                Enterprise
              </div>
              <div className={rlcClass(null, cardTitle)}>RLC Enterprise</div>
              <p className={rlcClass(null, { ...cardDesc, color: "rgba(255,255,255,0.74)" })}>
                Für Unternehmen mit eigener Infrastruktur, privatem Server,
                erweitertem Datenschutz und individueller Rollout-Strategie.
              </p>
              <div className={rlcClass(null, { ...priceText, color: COLORS.white })}>3.000€</div>
              <div className={rlcClass(null, { ...priceSub, color: "rgba(255,255,255,0.68)" })}>
                einmaliges Setup + 99€ / Monat
              </div>

              <ul className={rlcClass(null, list)}>
                <li className={rlcClass(null, { ...listItem, color: COLORS.white })}>
                  <Check dark /> Private Server / Self-Hosted
                </li>
                <li className={rlcClass(null, { ...listItem, color: COLORS.white })}>
                  <Check dark /> Mobile + Web in eigener Infrastruktur
                </li>
                <li className={rlcClass(null, { ...listItem, color: COLORS.white })}>
                  <Check dark /> Geeignet für größere Unternehmen
                </li>
                <li className={rlcClass(null, { ...listItem, color: COLORS.white })}>
                  <Check dark /> Individuelle Einführung und IT-Abstimmung
                </li>
              </ul>

              <button
                type="button" className={rlcClass(null,
                ctaDark)}
                onClick={() => openMail("enterprise")}>
                
                Enterprise anfragen
              </button>
            </div>
          </div>
        </section>

        <section className="rlc-migrated-pages-site-pricingpage-tsx-1540">
          <h2 className={rlcClass(null, sectionTitle)}>Lizenzübersicht</h2>
          <p className={rlcClass(null, sectionSub)}>
            Klare, skalierbare Preisstruktur ohne komplizierte Pakete.
          </p>

          <div className={rlcClass(null, split2)}>
            <div className={rlcClass(null, panel)}>
              <h3 className="rlc-migrated-pages-site-pricingpage-tsx-1541">
                Basispreise
              </h3>
              <div className={rlcClass(null, tableShell)}>
                <table className={rlcClass(null, table)}>
                  <thead>
                    <tr>
                      <th className={rlcClass(null, th)}>Modell</th>
                      <th className={rlcClass(null, th)}>Preis</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className={rlcClass(null, td)}>Mobile Local</td>
                      <td className={rlcClass(null, td)}>9€ / Mobile-Nutzer / Monat</td>
                    </tr>
                    <tr>
                      <td className={rlcClass(null, td)}>Cloud-Basis</td>
                      <td className={rlcClass(null, td)}>29€ / Monat</td>
                    </tr>
                    <tr>
                      <td className={rlcClass(null, td)}>Web-Lizenz</td>
                      <td className={rlcClass(null, td)}>49€ / Web-Nutzer / Monat</td>
                    </tr>
                    <tr>
                      <td className={rlcClass(null, td)}>Enterprise</td>
                      <td className={rlcClass(null, td)}>3.000€ Setup + 99€ / Monat</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className={rlcClass(null, panel)}>
              <h3 className="rlc-migrated-pages-site-pricingpage-tsx-1542">
                Preislogik
              </h3>
              <div className={rlcClass(null, tableShell)}>
                <table className={rlcClass(null, table)}>
                  <thead>
                    <tr>
                      <th className={rlcClass(null, th)}>Paket</th>
                      <th className={rlcClass(null, th)}>Berechnung</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className={rlcClass(null, td)}>Mobile Local</td>
                      <td className={rlcClass(null, td)}>9€ × Mobile-Nutzer</td>
                    </tr>
                    <tr>
                      <td className={rlcClass(null, td)}>Mobile + Cloud</td>
                      <td className={rlcClass(null, td)}>29€ + (9€ × Mobile-Nutzer)</td>
                    </tr>
                    <tr>
                      <td className={rlcClass(null, td)}>Mobile + Web + Cloud</td>
                      <td className={rlcClass(null, td)}>29€ + (49€ × Web-Nutzer) + (9€ × Mobile-Nutzer)</td>
                    </tr>
                    <tr>
                      <td className={rlcClass(null, td)}>Enterprise</td>
                      <td className={rlcClass(null, td)}>99€ + (49€ × Web-Nutzer) + (9€ × Mobile-Nutzer) + Setup</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className={rlcClass(null, footerNote)}>
                Web-Lizenz: 49€ pro Web-Nutzer / Monat.
              </p>
            </div>
          </div>
        </section>

        <section ref={calcRef} className="rlc-migrated-pages-site-pricingpage-tsx-1543">
          <h2 className={rlcClass(null, sectionTitle)}>Preisrechner</h2>
          <p className={rlcClass(null, sectionSub)}>Rechne dein Monatsmodell direkt durch.</p>

          <div className={rlcClass(null, split2)}>
            <div className={rlcClass(null, panel)}>
              <div className="rlc-migrated-pages-site-pricingpage-tsx-1544">
                <label className={rlcClass(null, inputLabel)}>Paket</label>
                <select className={rlcClass(null,
                select)}
                value={plan}
                onChange={(e) => setPlan(e.target.value as PlanKey)}>
                  
                  <option value="mobile-local">Mobile Local</option>
                  <option value="mobile-cloud">Mobile + Cloud</option>
                  <option value="mobile-web-cloud">Mobile + Web + Cloud</option>
                  <option value="enterprise">RLC Enterprise</option>
                </select>
              </div>

              <div className={rlcClass(null, calcRow)}>
                <div>
                  <label className={rlcClass(null, inputLabel)}>Mobile-Nutzer</label>
                  <input className={rlcClass(null,
                  input)}
                  type="number"
                  min={0}
                  value={mobileUsers}
                  onChange={(e) =>
                  setMobileUsers(Math.max(0, Number(e.target.value || 0)))
                  } />
                  
                </div>

                <div>
                  <label className={rlcClass(null, inputLabel)}>Web-Nutzer</label>
                  <input className={rlcClass(null,
                  input)}
                  type="number"
                  min={0}
                  value={webUsers}
                  onChange={(e) =>
                  setWebUsers(Math.max(0, Number(e.target.value || 0)))
                  } />
                  
                </div>
              </div>

              <p className={rlcClass(null, footerNote)}>
                Web-Lizenz: 49€ pro Web-Nutzer / Monat.
              </p>

              <div className="rlc-migrated-pages-site-pricingpage-tsx-1545">
                <button
                  type="button" className={rlcClass(null,
                  ctaPrimary)}
                  onClick={() => openMail(plan)}>
                  
                  Angebot anfragen
                </button>
                <button
                  type="button" className={rlcClass(null,
                  ctaSecondary)}
                  onClick={() => scrollToContact(plan)}>
                  
                  Kontakt aufnehmen
                </button>
              </div>
            </div>

            <div className={rlcClass(null, resultBox)}>
              <div className={rlcClass(null,
              {
                fontSize: 13,
                fontWeight: 700,
                color: COLORS.accentDark
              })}>
                
                Berechnung
              </div>
              <div className="rlc-migrated-pages-site-pricingpage-tsx-1546">
                {planName(plan)}
              </div>
              <div className={rlcClass(null, resultPrice)}>{euro(calc.total)} / Monat</div>

              <div className={rlcClass(null, resultList)}>
                {calc.cloudBase > 0 && <div>Cloud-Basis: {euro(calc.cloudBase)}</div>}
                {calc.monthlyBase > 0 &&
                <div>Enterprise-Basis: {euro(calc.monthlyBase)}</div>
                }
                {calc.mCount > 0 &&
                <div>
                    Mobile: {calc.mCount} × {euro(calc.mobileRate)} = {euro(calc.mobileTotal)}
                  </div>
                }
                {calc.wCount > 0 && (
                plan === "mobile-web-cloud" || plan === "enterprise") &&
                <div>
                      Web: {calc.wCount} × {euro(calc.webRate)} = {euro(calc.webTotal)}
                    </div>
                }
                {plan === "enterprise" &&
                <div>Einmaliges Setup: {euro(calc.setup)}</div>
                }
              </div>

              <p className={rlcClass(null, { ...footerNote, marginTop: 16 })}>
                Alle Preise monatlich, außer einmaligem Enterprise-Setup.
              </p>
            </div>
          </div>
        </section>

        <section className="rlc-migrated-pages-site-pricingpage-tsx-1547">
          <h2 className={rlcClass(null, sectionTitle)}>Häufige Fragen</h2>
          <p className={rlcClass(null, sectionSub)}>
            Die wichtigsten Antworten direkt auf einen Blick.
          </p>

          <div className={rlcClass(null, faqGrid)}>
            <div className={rlcClass(null, faqCard)}>
              <h3 className="rlc-migrated-pages-site-pricingpage-tsx-1548">
                Muss ich Web dazubuchen?
              </h3>
              <p className={rlcClass(null, { margin: 0, color: COLORS.sub, lineHeight: 1.6 })}>
                Nein. Mobile + Cloud funktioniert auch ohne Web-Lizenzen. Du
                erhältst trotzdem zentralen Cloud-Speicher sowie Web-Zugriff für
                Datei-Ansicht und Downloads.
              </p>
            </div>

            <div className={rlcClass(null, faqCard)}>
              <h3 className="rlc-migrated-pages-site-pricingpage-tsx-1549">
                Kann ich später upgraden?
              </h3>
              <p className={rlcClass(null, { margin: 0, color: COLORS.sub, lineHeight: 1.6 })}>
                Ja. Du kannst jederzeit von Mobile Local auf Cloud und später
                auf Mobile + Web + Cloud oder Enterprise wechseln.
              </p>
            </div>

            <div className={rlcClass(null, faqCard)}>
              <h3 className="rlc-migrated-pages-site-pricingpage-tsx-1550">
                Funktioniert die App offline?
              </h3>
              <p className={rlcClass(null, { margin: 0, color: COLORS.sub, lineHeight: 1.6 })}>
                Ja. Besonders im Mobile-Bereich ist Offline-Nutzung zentral.
                Daten können lokal erfasst und später synchronisiert werden.
              </p>
            </div>

            <div className={rlcClass(null, faqCard)}>
              <h3 className="rlc-migrated-pages-site-pricingpage-tsx-1551">
                Gibt es eine private Server-Version?
              </h3>
              <p className={rlcClass(null, { margin: 0, color: COLORS.sub, lineHeight: 1.6 })}>
                Ja. Für größere Unternehmen gibt es RLC Enterprise mit privatem
                Server, eigener Infrastruktur und individueller Einführung.
              </p>
            </div>
          </div>
        </section>

        <section ref={contactRef} className="rlc-migrated-pages-site-pricingpage-tsx-1552">
          <h2 className={rlcClass(null, sectionTitle)}>Kontakt & Demo</h2>
          <p className={rlcClass(null, sectionSub)}>
            Du möchtest ein Angebot, eine Demo oder eine Enterprise-Abstimmung?
          </p>

          <div className={rlcClass(null, contactGrid)}>
            <div className={rlcClass(null, panel)}>
              <h3 className="rlc-migrated-pages-site-pricingpage-tsx-1553">
                Schnellkontakt
              </h3>
              <p className={rlcClass(null, { ...sectionSub, marginBottom: 16 })}>
                Für Preisfragen, Demo-Termine und Projektgespräche.
              </p>

              <div className="rlc-migrated-pages-site-pricingpage-tsx-1554">
                <div>
                  <strong>E-Mail:</strong>{" "}
                  <a href={`mailto:${CONTACT_EMAIL}`} className={rlcClass(null, linkText)}>
                    {CONTACT_EMAIL}
                  </a>
                </div>

                <div className="rlc-migrated-pages-site-pricingpage-tsx-1555">
                  <a
                    href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                      "Demo-Anfrage RLC Bausoftware"
                    )}`} className={rlcClass(null,
                    ctaPrimary)}>
                    
                    Demo per E-Mail anfragen
                  </a>

                  <button
                    type="button" className={rlcClass(null,
                    ctaSecondary)}
                    onClick={() => openMail(plan)}>
                    
                    Paket anfragen
                  </button>
                </div>
              </div>

              <p className={rlcClass(null, footerNote)}>
                Für Enterprise-Projekte kann die Einführung individuell geplant
                werden.
              </p>
            </div>

            <div className={rlcClass(null, contactCardDark)}>
              <h3 className="rlc-migrated-pages-site-pricingpage-tsx-1556">
                RLC Enterprise
              </h3>
              <p className="rlc-migrated-pages-site-pricingpage-tsx-1557">





                
                Private Serverlösung für Unternehmen mit höherem Anspruch an
                Datenschutz, IT-Kontrolle und individueller Infrastruktur.
              </p>

              <div className="rlc-migrated-pages-site-pricingpage-tsx-1558">
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

              <div className="rlc-migrated-pages-site-pricingpage-tsx-1559">
                <button
                  type="button" className={rlcClass(null,
                  ctaDark)}
                  onClick={() => openMail("enterprise")}>
                  
                  Enterprise-Beratung anfragen
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>);

}
