import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { useMemo, useRef, useState } from "react";
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
const shell = {
    minHeight: "100vh",
    background: COLORS.bg,
    color: COLORS.text,
    fontFamily: "Inter, system-ui, Arial, sans-serif"
};
const container = {
    maxWidth: 1320,
    margin: "0 auto",
    padding: "0 20px"
};
const heroWrap = {
    padding: "56px 0 28px"
};
const heroGrid = {
    display: "grid",
    gridTemplateColumns: "1.1fr 0.9fr",
    gap: 24,
    alignItems: "center"
};
const badge = {
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
const heroTitle = {
    color: COLORS.text, fontSize: "clamp(34px, 5vw, 58px)",
    lineHeight: 1.04,
    margin: "18px 0 14px",
    fontWeight: 700,
    letterSpacing: -1.2,
    maxWidth: 900
};
const heroSub = {
    fontSize: 18,
    lineHeight: 1.6,
    color: COLORS.sub,
    maxWidth: 860,
    margin: 0
};
const heroActions = {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 22
};
const sectionTitle = {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: -0.5,
    margin: "0 0 10px"
};
const sectionSub = {
    margin: 0,
    color: COLORS.sub,
    fontSize: 16,
    lineHeight: 1.6
};
const cardsGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 18,
    marginTop: 28
};
const cardBase = {
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
const cardFeatured = {
    ...cardBase,
    background: COLORS.cardAlt,
    border: `2px solid ${COLORS.accent}`,
    transform: "translateY(-2px)"
};
const cardEnterprise = {
    ...cardBase,
    background: `linear-gradient(180deg, ${COLORS.darkCard} 0%, #172033 100%)`,
    color: COLORS.white,
    border: "1px solid rgba(255,255,255,0.12)"
};
const miniBadge = {
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
const cardTitle = {
    fontSize: 22,
    fontWeight: 700,
    margin: "0 0 8px",
    letterSpacing: -0.4
};
const cardDesc = {
    color: COLORS.sub,
    fontSize: 14,
    lineHeight: 1.6,
    margin: "0 0 18px",
    minHeight: 66
};
const priceText = {
    fontSize: 42,
    fontWeight: 700,
    letterSpacing: -1.5,
    lineHeight: 1,
    margin: "4px 0 4px"
};
const priceSub = {
    color: COLORS.sub,
    fontSize: 13,
    marginBottom: 18
};
const list = {
    listStyle: "none",
    padding: 0,
    margin: "0 0 20px",
    display: "grid",
    gap: 10
};
const listItem = {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    fontSize: 14,
    lineHeight: 1.45
};
const ctaPrimary = {
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
const ctaSecondary = {
    ...ctaPrimary,
    background: COLORS.white,
    color: COLORS.text,
    border: `1px solid ${COLORS.border}`
};
const ctaDark = {
    ...ctaPrimary,
    background: COLORS.white,
    color: COLORS.dark
};
const panel = {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 22,
    boxShadow: COLORS.shadow,
    padding: 22
};
const tableShell = {
    overflowX: "auto",
    borderRadius: 16,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.white
};
const table = {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 480
};
const th = {
    textAlign: "left",
    fontSize: 13,
    color: COLORS.sub,
    fontWeight: 600,
    padding: "14px 16px",
    borderBottom: `1px solid ${COLORS.border}`,
    background: "#fbfcfe"
};
const td = {
    padding: "14px 16px",
    fontSize: 14,
    borderBottom: `1px solid ${COLORS.border}`
};
const split2 = {
    display: "grid",
    gridTemplateColumns: "1.15fr 0.85fr",
    gap: 18,
    marginTop: 18
};
const inputLabel = {
    fontSize: 13,
    fontWeight: 600,
    color: COLORS.sub,
    marginBottom: 8,
    display: "block"
};
const input = {
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
const select = {
    ...input,
    cursor: "pointer"
};
const calcRow = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14
};
const resultBox = {
    background: COLORS.accentSoft,
    border: `1px solid #cfe0ff`,
    borderRadius: 18,
    padding: 20
};
const resultPrice = {
    fontSize: 38,
    fontWeight: 700,
    lineHeight: 1,
    margin: "8px 0 12px",
    color: COLORS.accentDark,
    letterSpacing: -1
};
const resultList = {
    display: "grid",
    gap: 8,
    fontSize: 14,
    color: COLORS.text
};
const faqGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 16,
    marginTop: 18
};
const faqCard = {
    ...panel,
    padding: 18
};
const footerNote = {
    color: COLORS.sub,
    fontSize: 13,
    marginTop: 12
};
const contactGrid = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
    marginTop: 18
};
const contactCardDark = {
    background: `linear-gradient(180deg, ${COLORS.dark} 0%, #18243a 100%)`,
    color: COLORS.white,
    borderRadius: 22,
    padding: 24,
    boxShadow: COLORS.shadow
};
const linkText = {
    color: COLORS.accentDark,
    fontWeight: 600,
    textDecoration: "none"
};
function euro(value) {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0
    }).format(value);
}
function webPricePerUser(count) {
    if (count <= 0)
        return 0;
    return 49;
}
function planName(plan) {
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
function planMailSubject(plan) {
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
function Check({ dark = false }) {
    return (_jsx("span", { className: rlcClass(null, {
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
        }), children: "\u2713" }));
}
export default function PricingPage() {
    const [plan, setPlan] = useState("mobile-web-cloud");
    const [mobileUsers, setMobileUsers] = useState(1);
    const [webUsers, setWebUsers] = useState(1);
    const calcRef = useRef(null);
    const contactRef = useRef(null);
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
    function scrollToCalculator(nextPlan) {
        if (nextPlan)
            setPlan(nextPlan);
        calcRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    function scrollToContact(nextPlan) {
        if (nextPlan)
            setPlan(nextPlan);
        contactRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    function openMail(selectedPlan) {
        const subject = encodeURIComponent(planMailSubject(selectedPlan));
        const body = encodeURIComponent([
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
            "Mit freundlichen Grüßen"
        ].
            join("\n"));
        window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    }
    return (_jsx("div", { className: rlcClass(null, shell), children: _jsxs("div", { className: rlcClass(null, container), children: [_jsx("section", { className: rlcClass(null, heroWrap), children: _jsxs("div", { className: rlcClass(null, heroGrid), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, badge), children: "RLC Bausoftware \u00B7 Preis\u00FCbersicht" }), _jsx("h1", { className: rlcClass(null, heroTitle), children: "Eine Lizenzstruktur f\u00FCr Baustelle, B\u00FCro und CAD" }), _jsx("p", { className: rlcClass(null, heroSub), children: "Von der mobilen Baustellenerfassung bis zur vollst\u00E4ndigen Web-, CAD- und Cloud-L\u00F6sung. Alle Bereiche arbeiten in derselben Projektstruktur." }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { type: "button", className: rlcClass(null, ctaPrimary), onClick: () => scrollToCalculator("mobile-web-cloud"), children: "Preis berechnen" }), _jsx("button", { type: "button", className: rlcClass(null, ctaSecondary), onClick: () => scrollToContact("enterprise"), children: "Demo anfragen" })] })] }), _jsxs("div", { className: rlcClass(null, panel), children: [_jsx("h3", { className: "rlc-migrated-pages-site-pricingpage-tsx-1538", children: "Klare Preislogik" }), _jsx("p", { className: rlcClass(null, { ...sectionSub, marginBottom: 14 }), children: "Keine un\u00FCbersichtlichen Pakete. Die Struktur ist einfach:" }), _jsxs("ul", { className: rlcClass(null, { ...list, marginBottom: 0 }), children: [_jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Mobile Local: 9\u20AC pro Nutzer / Monat"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Cloud-Basis: 29\u20AC / Monat"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Web-Lizenz: 49\u20AC pro Nutzer / Monat"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Enterprise mit privatem Server und Setup"] })] })] })] }) }), _jsx("section", { className: "rlc-migrated-pages-site-pricingpage-tsx-1539", children: _jsxs("div", { className: rlcClass(null, cardsGrid), children: [_jsxs("div", { className: rlcClass(null, cardBase), children: [_jsx("div", { className: rlcClass(null, cardTitle), children: "Mobile Local" }), _jsx("p", { className: rlcClass(null, cardDesc), children: "F\u00FCr kleine Teams oder Einzelunternehmer, die komplett lokal und offline auf dem Smartphone oder Tablet arbeiten m\u00F6chten." }), _jsx("div", { className: rlcClass(null, priceText), children: "9\u20AC" }), _jsx("div", { className: rlcClass(null, priceSub), children: "pro Mobile-Nutzer / Monat" }), _jsxs("ul", { className: rlcClass(null, list), children: [_jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Regieberichte direkt auf dem Handy"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Lieferscheine, Fotos und PDF-Export"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Offline nutzbar ohne Server"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Ideal f\u00FCr den einfachen Einstieg"] })] }), _jsx("button", { type: "button", className: rlcClass(null, ctaSecondary), onClick: () => scrollToCalculator("mobile-local"), children: "Jetzt berechnen" })] }), _jsxs("div", { className: rlcClass(null, cardBase), children: [_jsx("div", { className: rlcClass(null, {
                                            ...miniBadge,
                                            background: "#e9f5ff",
                                            color: COLORS.accentDark
                                        }), children: "Beliebt f\u00FCr Baustellen" }), _jsx("div", { className: rlcClass(null, cardTitle), children: "Mobile + Cloud" }), _jsx("p", { className: rlcClass(null, cardDesc), children: "Zentrale Ablage und Synchronisierung f\u00FCr Unternehmen, die mobil arbeiten, aber noch keinen vollst\u00E4ndigen B\u00FCro-Arbeitsplatz ben\u00F6tigen." }), _jsx("div", { className: rlcClass(null, priceText), children: "29\u20AC" }), _jsx("div", { className: rlcClass(null, priceSub), children: "Cloud-Basis / Monat + 9\u20AC pro Mobile-Nutzer" }), _jsxs("ul", { className: rlcClass(null, list), children: [_jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Zentraler Cloud-Speicher f\u00FCr Projektdaten"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Ger\u00E4te-Synchronisierung und Backups"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Zentraler Web-Zugriff f\u00FCr Archiv und Download"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Kein vollwertiger Web-Arbeitsplatz n\u00F6tig"] })] }), _jsx("button", { type: "button", className: rlcClass(null, ctaSecondary), onClick: () => scrollToCalculator("mobile-cloud"), children: "Cloud-Kosten berechnen" })] }), _jsxs("div", { className: rlcClass(null, cardFeatured), children: [_jsx("div", { className: rlcClass(null, miniBadge), children: "Am beliebtesten" }), _jsx("div", { className: rlcClass(null, cardTitle), children: "Mobile + Web + Cloud" }), _jsx("p", { className: rlcClass(null, cardDesc), children: "Das vollst\u00E4ndige System f\u00FCr Baustelle und B\u00FCro mit professionellem CAD, Mengenermittlung, KI-Kalkulation, Verwaltung und zentralem Datenzugriff." }), _jsx("div", { className: rlcClass(null, priceText), children: "ab 78\u20AC" }), _jsx("div", { className: rlcClass(null, priceSub), children: "29\u20AC Cloud + 49\u20AC Web-Lizenz + 9\u20AC pro Mobile-Nutzer" }), _jsxs("ul", { className: rlcClass(null, list), children: [_jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Alles aus Mobile + Cloud"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Vollst\u00E4ndige Web-App f\u00FCr B\u00FCro, CAD und Verwaltung"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Kalkulation, LV, KI und Mengenermittlung"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " CAD: DXF/DWG, Layer, Objektfang, UTM und Georeferenzierung"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " REB-Aufma\u00DF, Regie, Lieferscheine, Fotos und Arbeitszeiten"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Angebote, Nachtr\u00E4ge, Rechnungen und Verwaltung"] }), _jsxs("li", { className: rlcClass(null, listItem), children: [_jsx(Check, {}), " Mehrbenutzerf\u00E4hig und skalierbar"] })] }), _jsx("button", { type: "button", className: rlcClass(null, ctaPrimary), onClick: () => scrollToCalculator("mobile-web-cloud"), children: "Komplettes System berechnen" })] }), _jsxs("div", { className: rlcClass(null, cardEnterprise), children: [_jsx("div", { className: rlcClass(null, {
                                            ...miniBadge,
                                            background: "rgba(255,255,255,0.12)",
                                            color: COLORS.white,
                                            border: "1px solid rgba(255,255,255,0.14)"
                                        }), children: "Enterprise" }), _jsx("div", { className: rlcClass(null, cardTitle), children: "RLC Enterprise" }), _jsx("p", { className: rlcClass(null, { ...cardDesc, color: "rgba(255,255,255,0.74)" }), children: "F\u00FCr Unternehmen mit eigener Infrastruktur, privatem Server, erweitertem Datenschutz und individueller Rollout-Strategie." }), _jsx("div", { className: rlcClass(null, { ...priceText, color: COLORS.white }), children: "3.000\u20AC" }), _jsx("div", { className: rlcClass(null, { ...priceSub, color: "rgba(255,255,255,0.68)" }), children: "einmaliges Setup + 99\u20AC / Monat" }), _jsxs("ul", { className: rlcClass(null, list), children: [_jsxs("li", { className: rlcClass(null, { ...listItem, color: COLORS.white }), children: [_jsx(Check, { dark: true }), " Private Server / Self-Hosted"] }), _jsxs("li", { className: rlcClass(null, { ...listItem, color: COLORS.white }), children: [_jsx(Check, { dark: true }), " Mobile + Web + CAD in eigener Infrastruktur"] }), _jsxs("li", { className: rlcClass(null, { ...listItem, color: COLORS.white }), children: [_jsx(Check, { dark: true }), " Geeignet f\u00FCr gr\u00F6\u00DFere Unternehmen"] }), _jsxs("li", { className: rlcClass(null, { ...listItem, color: COLORS.white }), children: [_jsx(Check, { dark: true }), " Individuelle Einf\u00FChrung und IT-Abstimmung"] })] }), _jsx("button", { type: "button", className: rlcClass(null, ctaDark), onClick: () => openMail("enterprise"), children: "Enterprise anfragen" })] })] }) }), _jsxs("section", { className: "rlc-migrated-pages-site-pricingpage-tsx-1540", children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Lizenz\u00FCbersicht" }), _jsx("p", { className: rlcClass(null, sectionSub), children: "Klare, skalierbare Preisstruktur ohne komplizierte Pakete." }), _jsxs("div", { className: rlcClass(null, split2), children: [_jsxs("div", { className: rlcClass(null, panel), children: [_jsx("h3", { className: "rlc-migrated-pages-site-pricingpage-tsx-1541", children: "Basispreise" }), _jsx("div", { className: rlcClass(null, tableShell), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Modell" }), _jsx("th", { className: rlcClass(null, th), children: "Preis" })] }) }), _jsxs("tbody", { children: [_jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: "Mobile Local" }), _jsx("td", { className: rlcClass(null, td), children: "9\u20AC / Mobile-Nutzer / Monat" })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: "Cloud-Basis" }), _jsx("td", { className: rlcClass(null, td), children: "29\u20AC / Monat" })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: "Web-Lizenz" }), _jsx("td", { className: rlcClass(null, td), children: "49\u20AC / Web-Nutzer / Monat" })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: "Enterprise" }), _jsx("td", { className: rlcClass(null, td), children: "3.000\u20AC Setup + 99\u20AC / Monat" })] })] })] }) })] }), _jsxs("div", { className: rlcClass(null, panel), children: [_jsx("h3", { className: "rlc-migrated-pages-site-pricingpage-tsx-1542", children: "Preislogik" }), _jsx("div", { className: rlcClass(null, tableShell), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Paket" }), _jsx("th", { className: rlcClass(null, th), children: "Berechnung" })] }) }), _jsxs("tbody", { children: [_jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: "Mobile Local" }), _jsx("td", { className: rlcClass(null, td), children: "9\u20AC \u00D7 Mobile-Nutzer" })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: "Mobile + Cloud" }), _jsx("td", { className: rlcClass(null, td), children: "29\u20AC + (9\u20AC \u00D7 Mobile-Nutzer)" })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: "Mobile + Web + Cloud" }), _jsx("td", { className: rlcClass(null, td), children: "29\u20AC + (49\u20AC \u00D7 Web-Nutzer) + (9\u20AC \u00D7 Mobile-Nutzer)" })] }), _jsxs("tr", { children: [_jsx("td", { className: rlcClass(null, td), children: "Enterprise" }), _jsx("td", { className: rlcClass(null, td), children: "99\u20AC + (49\u20AC \u00D7 Web-Nutzer) + (9\u20AC \u00D7 Mobile-Nutzer) + Setup" })] })] })] }) }), _jsx("p", { className: rlcClass(null, footerNote), children: "Web-Lizenz: 49\u20AC pro Web-Nutzer / Monat." })] })] })] }), _jsxs("section", { ref: calcRef, className: "rlc-migrated-pages-site-pricingpage-tsx-1543", children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Preisrechner" }), _jsx("p", { className: rlcClass(null, sectionSub), children: "Rechne dein Monatsmodell direkt durch." }), _jsxs("div", { className: rlcClass(null, split2), children: [_jsxs("div", { className: rlcClass(null, panel), children: [_jsxs("div", { className: "rlc-migrated-pages-site-pricingpage-tsx-1544", children: [_jsx("label", { className: rlcClass(null, inputLabel), children: "Paket" }), _jsxs("select", { className: rlcClass(null, select), value: plan, onChange: (e) => setPlan(e.target.value), children: [_jsx("option", { value: "mobile-local", children: "Mobile Local" }), _jsx("option", { value: "mobile-cloud", children: "Mobile + Cloud" }), _jsx("option", { value: "mobile-web-cloud", children: "Mobile + Web + Cloud" }), _jsx("option", { value: "enterprise", children: "RLC Enterprise" })] })] }), _jsxs("div", { className: rlcClass(null, calcRow), children: [_jsxs("div", { children: [_jsx("label", { className: rlcClass(null, inputLabel), children: "Mobile-Nutzer" }), _jsx("input", { className: rlcClass(null, input), type: "number", min: 0, value: mobileUsers, onChange: (e) => setMobileUsers(Math.max(0, Number(e.target.value || 0))) })] }), _jsxs("div", { children: [_jsx("label", { className: rlcClass(null, inputLabel), children: "Web-Nutzer" }), _jsx("input", { className: rlcClass(null, input), type: "number", min: 0, value: webUsers, onChange: (e) => setWebUsers(Math.max(0, Number(e.target.value || 0))) })] })] }), _jsx("p", { className: rlcClass(null, footerNote), children: "Web-Lizenz: 49\u20AC pro Web-Nutzer / Monat." }), _jsxs("div", { className: "rlc-migrated-pages-site-pricingpage-tsx-1545", children: [_jsx("button", { type: "button", className: rlcClass(null, ctaPrimary), onClick: () => openMail(plan), children: "Angebot anfragen" }), _jsx("button", { type: "button", className: rlcClass(null, ctaSecondary), onClick: () => scrollToContact(plan), children: "Kontakt aufnehmen" })] })] }), _jsxs("div", { className: rlcClass(null, resultBox), children: [_jsx("div", { className: rlcClass(null, {
                                                fontSize: 13,
                                                fontWeight: 700,
                                                color: COLORS.accentDark
                                            }), children: "Berechnung" }), _jsx("div", { className: "rlc-migrated-pages-site-pricingpage-tsx-1546", children: planName(plan) }), _jsxs("div", { className: rlcClass(null, resultPrice), children: [euro(calc.total), " / Monat"] }), _jsxs("div", { className: rlcClass(null, resultList), children: [calc.cloudBase > 0 && _jsxs("div", { children: ["Cloud-Basis: ", euro(calc.cloudBase)] }), calc.monthlyBase > 0 &&
                                                    _jsxs("div", { children: ["Enterprise-Basis: ", euro(calc.monthlyBase)] }), calc.mCount > 0 &&
                                                    _jsxs("div", { children: ["Mobile: ", calc.mCount, " \u00D7 ", euro(calc.mobileRate), " = ", euro(calc.mobileTotal)] }), calc.wCount > 0 && (plan === "mobile-web-cloud" || plan === "enterprise") &&
                                                    _jsxs("div", { children: ["Web: ", calc.wCount, " \u00D7 ", euro(calc.webRate), " = ", euro(calc.webTotal)] }), plan === "enterprise" &&
                                                    _jsxs("div", { children: ["Einmaliges Setup: ", euro(calc.setup)] })] }), _jsx("p", { className: rlcClass(null, { ...footerNote, marginTop: 16 }), children: "Alle Preise monatlich, au\u00DFer einmaligem Enterprise-Setup." })] })] })] }), _jsxs("section", { className: "rlc-migrated-pages-site-pricingpage-tsx-1547", children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "H\u00E4ufige Fragen" }), _jsx("p", { className: rlcClass(null, sectionSub), children: "Die wichtigsten Antworten direkt auf einen Blick." }), _jsxs("div", { className: rlcClass(null, faqGrid), children: [_jsxs("div", { className: rlcClass(null, faqCard), children: [_jsx("h3", { className: "rlc-migrated-pages-site-pricingpage-tsx-1548", children: "Muss ich Web dazubuchen?" }), _jsx("p", { className: rlcClass(null, { margin: 0, color: COLORS.sub, lineHeight: 1.6 }), children: "Nein. Mobile + Cloud funktioniert auch ohne Web-Lizenzen. Du erh\u00E4ltst trotzdem zentralen Cloud-Speicher sowie Web-Zugriff f\u00FCr Datei-Ansicht und Downloads." })] }), _jsxs("div", { className: rlcClass(null, faqCard), children: [_jsx("h3", { className: "rlc-migrated-pages-site-pricingpage-tsx-1549", children: "Kann ich sp\u00E4ter upgraden?" }), _jsx("p", { className: rlcClass(null, { margin: 0, color: COLORS.sub, lineHeight: 1.6 }), children: "Ja. Du kannst jederzeit von Mobile Local auf Cloud und sp\u00E4ter auf Mobile + Web + Cloud oder Enterprise wechseln." })] }), _jsxs("div", { className: rlcClass(null, faqCard), children: [_jsx("h3", { className: "rlc-migrated-pages-site-pricingpage-tsx-1550", children: "Funktioniert die App offline?" }), _jsx("p", { className: rlcClass(null, { margin: 0, color: COLORS.sub, lineHeight: 1.6 }), children: "Ja. Besonders im Mobile-Bereich ist Offline-Nutzung zentral. Daten k\u00F6nnen lokal erfasst und sp\u00E4ter synchronisiert werden." })] }), _jsxs("div", { className: rlcClass(null, faqCard), children: [_jsx("h3", { className: "rlc-migrated-pages-site-pricingpage-tsx-1551", children: "Gibt es eine private Server-Version?" }), _jsx("p", { className: rlcClass(null, { margin: 0, color: COLORS.sub, lineHeight: 1.6 }), children: "Ja. F\u00FCr gr\u00F6\u00DFere Unternehmen gibt es RLC Enterprise mit privatem Server, eigener Infrastruktur, CAD-Arbeitspl\u00E4tzen und individueller Einf\u00FChrung." })] })] })] }), _jsxs("section", { ref: contactRef, className: "rlc-migrated-pages-site-pricingpage-tsx-1552", children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Kontakt & Demo" }), _jsx("p", { className: rlcClass(null, sectionSub), children: "Du m\u00F6chtest ein Angebot, eine Demo oder eine Enterprise-Abstimmung?" }), _jsxs("div", { className: rlcClass(null, contactGrid), children: [_jsxs("div", { className: rlcClass(null, panel), children: [_jsx("h3", { className: "rlc-migrated-pages-site-pricingpage-tsx-1553", children: "Schnellkontakt" }), _jsx("p", { className: rlcClass(null, { ...sectionSub, marginBottom: 16 }), children: "F\u00FCr Preisfragen, Demo-Termine und Projektgespr\u00E4che." }), _jsxs("div", { className: "rlc-migrated-pages-site-pricingpage-tsx-1554", children: [_jsxs("div", { children: [_jsx("strong", { children: "E-Mail:" }), " ", _jsx("a", { href: `mailto:${CONTACT_EMAIL}`, className: rlcClass(null, linkText), children: CONTACT_EMAIL })] }), _jsxs("div", { className: "rlc-migrated-pages-site-pricingpage-tsx-1555", children: [_jsx("a", { href: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Demo-Anfrage RLC Bausoftware")}`, className: rlcClass(null, ctaPrimary), children: "Demo per E-Mail anfragen" }), _jsx("button", { type: "button", className: rlcClass(null, ctaSecondary), onClick: () => openMail(plan), children: "Paket anfragen" })] })] }), _jsx("p", { className: rlcClass(null, footerNote), children: "F\u00FCr Enterprise-Projekte kann die Einf\u00FChrung individuell geplant werden." })] }), _jsxs("div", { className: rlcClass(null, contactCardDark), children: [_jsx("h3", { className: "rlc-migrated-pages-site-pricingpage-tsx-1556", children: "RLC Enterprise" }), _jsx("p", { className: "rlc-migrated-pages-site-pricingpage-tsx-1557", children: "Private Serverl\u00F6sung f\u00FCr Unternehmen mit h\u00F6herem Anspruch an Datenschutz, IT-Kontrolle und individueller Infrastruktur." }), _jsxs("div", { className: "rlc-migrated-pages-site-pricingpage-tsx-1558", children: [_jsxs("div", { children: [_jsx(Check, { dark: true }), " Setup: 3.000\u20AC einmalig"] }), _jsxs("div", { children: [_jsx(Check, { dark: true }), " Basis: 99\u20AC / Monat"] }), _jsxs("div", { children: [_jsx(Check, { dark: true }), " Mobile-Nutzer separat skalierbar"] }), _jsxs("div", { children: [_jsx(Check, { dark: true }), " Web-Lizenz: 49\u20AC / Nutzer / Monat"] })] }), _jsx("div", { className: "rlc-migrated-pages-site-pricingpage-tsx-1559", children: _jsx("button", { type: "button", className: rlcClass(null, ctaDark), onClick: () => openMail("enterprise"), children: "Enterprise-Beratung anfragen" }) })] })] })] })] }) }));
}
