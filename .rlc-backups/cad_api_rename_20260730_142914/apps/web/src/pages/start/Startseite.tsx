// apps/web/src/pages/start/Startseite.tsx
export default function Startseite() {
  return (
    <section className="landing full-bleed">
      <h1 style={{ fontSize: "2.2rem", marginBottom: 16 }}>RLC Bausoftware</h1>

      <p style={{ fontSize: "1.05rem", lineHeight: 1.8, maxWidth: 1400 }}>
        Mit <b>RLC Bausoftware</b> bauen wir eine durchgängige, praxisnahe Lösung
        für Bauunternehmen: von <b>Kalkulation</b> und <b>Mengenermittlung</b> über
        <b> CAD/As-Built</b> bis zu <b>Büro &amp; Buchhaltung</b>. Unser Ziel ist
        maximale Effizienz und Transparenz über alle Projektphasen – mit klarer
        Bedienung, KI-gestützten Assistenten, professionellen Import/Export-
        Schnittstellen (GAEB, DATEV, LandXML, IFC) und einer stabilen Struktur,
        die sich an den besten Lösungen am Markt orientiert, aber schneller und
        fokussierter ist.
      </p>

      <p style={{ fontSize: "1.05rem", lineHeight: 1.8, marginTop: 16, maxWidth: 1400 }}>
        Damit ermöglichen wir Bauleitern, Kalkulatoren und Geschäftsführern
        ein Werkzeug, das den gesamten Projektablauf digital abbildet, Nachträge
        automatisiert erkennt, Regieberichte revisionssicher erstellt und
        Abrechnungen in Echtzeit nachvollziehbar macht.
      </p>
    </section>
  );
}


