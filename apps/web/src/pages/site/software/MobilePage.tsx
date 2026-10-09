import React from "react";
import { Link } from "react-router-dom";

const features = [
  {
    title: "Regieberichte",
    text: "Regiearbeiten direkt auf der Baustelle erfassen, unterschreiben und als PDF weiterleiten."
  },
  {
    title: "Lieferscheine",
    text: "Lieferscheine fotografieren, prüfen, Projekten zuordnen und zentral archivieren."
  },
  {
    title: "Bautagebuch",
    text: "Tagesablauf, Wetter, Personal, Geräte, Leistungen und besondere Vorkommnisse dokumentieren."
  },
  {
    title: "Arbeitszeiten",
    text: "Arbeitszeiten je Mitarbeiter und Projekt erfassen und zur Prüfung an das Büro senden."
  },
  {
    title: "Fotos und Notizen",
    text: "Baustellenfotos direkt mit Projekt, Datum, Beschreibung und Dokumentation verbinden."
  },
  {
    title: "Offline und mit Server",
    text: "Lokal ohne Server arbeiten oder alle Daten automatisch mit Büro und Cloud synchronisieren."
  }
];

const workflow = [
  "Dokument auf Smartphone oder Tablet erfassen",
  "Fotos, Unterschriften und Projektdaten ergänzen",
  "An den Server oder die lokale Inbox übertragen",
  "Im Büro prüfen und freigeben",
  "Automatisch dem richtigen Fachmodul zuordnen"
];

export default function MobilePage() {
  return (
    <div className="rlc-mobile-site">
      <style>{`
        * {
          box-sizing: border-box;
        }

        .rlc-mobile-site {
          min-height: 100vh;
          background: #f6f8fb;
          color: #142033;
          font-family: Inter, system-ui, Arial, sans-serif;
        }

        .rlc-mobile-container {
          width: min(100% - 40px, 1320px);
          margin: 0 auto;
        }

        .rlc-mobile-nav {
          min-height: 72px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .rlc-mobile-brand {
          font-size: 22px;
          font-weight: 800;
          color: #142033;
          text-decoration: none;
        }

        .rlc-mobile-navlinks {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .rlc-mobile-link,
        .rlc-mobile-button {
          min-height: 44px;
          padding: 11px 16px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          font-weight: 700;
          font-size: 15px;
        }

        .rlc-mobile-link {
          color: #142033;
        }

        .rlc-mobile-button {
          color: #ffffff;
          background: #1f6feb;
        }

        .rlc-mobile-hero {
          padding: clamp(48px, 7vw, 96px) 0 56px;
        }

        .rlc-mobile-hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr);
          gap: clamp(28px, 5vw, 72px);
          align-items: center;
        }

        .rlc-mobile-badge {
          display: inline-flex;
          padding: 8px 13px;
          border-radius: 999px;
          background: #eaf2ff;
          border: 1px solid #cfe0ff;
          color: #124ea8;
          font-size: 14px;
          font-weight: 700;
        }

        .rlc-mobile-title {
          max-width: 850px;
          margin: 18px 0 18px;
          font-size: clamp(40px, 6vw, 72px);
          line-height: 1.02;
          letter-spacing: -1.8px;
        }

        .rlc-mobile-subtitle {
          max-width: 760px;
          margin: 0;
          color: #5f6b7a;
          font-size: clamp(18px, 2vw, 22px);
          line-height: 1.65;
        }

        .rlc-mobile-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 28px;
        }

        .rlc-mobile-secondary {
          background: #ffffff;
          color: #142033;
          border: 1px solid #d9e1ea;
        }

        .rlc-mobile-phone {
          min-height: 520px;
          border-radius: 34px;
          padding: 22px;
          background: linear-gradient(145deg, #0f172a, #1f2937);
          box-shadow: 0 30px 70px rgba(15, 23, 42, .24);
        }

        .rlc-mobile-screen {
          height: 100%;
          min-height: 476px;
          padding: 20px;
          border-radius: 24px;
          background: #f8fafc;
          display: grid;
          gap: 14px;
          align-content: start;
        }

        .rlc-mobile-screen-head {
          padding: 18px;
          border-radius: 18px;
          color: white;
          background: linear-gradient(135deg, #1f6feb, #124ea8);
        }

        .rlc-mobile-screen-card {
          padding: 16px;
          border-radius: 16px;
          background: white;
          border: 1px solid #d9e1ea;
          box-shadow: 0 8px 22px rgba(15, 23, 42, .06);
        }

        .rlc-mobile-section {
          padding: clamp(58px, 7vw, 96px) 0;
        }

        .rlc-mobile-section-alt {
          background: #ffffff;
        }

        .rlc-mobile-section-title {
          max-width: 850px;
          margin: 0 0 14px;
          font-size: clamp(30px, 4vw, 48px);
          line-height: 1.12;
          letter-spacing: -1px;
        }

        .rlc-mobile-section-sub {
          max-width: 820px;
          margin: 0;
          color: #5f6b7a;
          font-size: clamp(17px, 1.7vw, 20px);
          line-height: 1.65;
        }

        .rlc-mobile-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
          margin-top: 34px;
        }

        .rlc-mobile-card {
          min-height: 210px;
          padding: 24px;
          border-radius: 22px;
          background: white;
          border: 1px solid #d9e1ea;
          box-shadow: 0 12px 32px rgba(15, 23, 42, .07);
        }

        .rlc-mobile-card h3 {
          margin: 0 0 10px;
          font-size: 22px;
        }

        .rlc-mobile-card p {
          margin: 0;
          color: #5f6b7a;
          font-size: 16px;
          line-height: 1.6;
        }

        .rlc-mobile-workflow {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 14px;
          margin-top: 34px;
        }

        .rlc-mobile-step {
          padding: 20px;
          border-radius: 18px;
          background: #f9fbff;
          border: 1px solid #d9e1ea;
        }

        .rlc-mobile-step-number {
          width: 34px;
          height: 34px;
          margin-bottom: 14px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          background: #1f6feb;
          font-weight: 800;
        }

        .rlc-mobile-gallery {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
          margin-top: 34px;
        }

        .rlc-mobile-image-box {
          aspect-ratio: 4 / 3;
          padding: 20px;
          border-radius: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          background: linear-gradient(145deg, #eaf2ff, #ffffff);
          border: 1px dashed #9dbcf0;
          color: #124ea8;
          font-weight: 700;
        }

        .rlc-mobile-cta {
          padding: 38px;
          border-radius: 28px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 24px;
          align-items: center;
          color: white;
          background: linear-gradient(135deg, #0f172a, #1e3a5f);
        }

        .rlc-mobile-cta h2 {
          margin: 0 0 10px;
          font-size: clamp(28px, 4vw, 44px);
        }

        .rlc-mobile-cta p {
          margin: 0;
          color: rgba(255,255,255,.76);
          font-size: 17px;
          line-height: 1.6;
        }

        .rlc-mobile-footer {
          padding: 32px 0 48px;
          color: #5f6b7a;
          text-align: center;
        }

        @media (min-width: 2200px) {
          .rlc-mobile-container {
            width: min(100% - 80px, 1680px);
          }

          .rlc-mobile-site {
            font-size: 18px;
          }

          .rlc-mobile-card p,
          .rlc-mobile-step,
          .rlc-mobile-link,
          .rlc-mobile-button {
            font-size: 17px;
          }
        }

        @media (max-width: 1000px) {
          .rlc-mobile-hero-grid,
          .rlc-mobile-cta {
            grid-template-columns: 1fr;
          }

          .rlc-mobile-grid,
          .rlc-mobile-gallery {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .rlc-mobile-workflow {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 650px) {
          .rlc-mobile-container {
            width: min(100% - 28px, 1320px);
          }

          .rlc-mobile-nav {
            align-items: flex-start;
            flex-direction: column;
            padding: 18px 0;
          }

          .rlc-mobile-navlinks {
            width: 100%;
          }

          .rlc-mobile-link,
          .rlc-mobile-button {
            flex: 1;
          }

          .rlc-mobile-grid,
          .rlc-mobile-gallery,
          .rlc-mobile-workflow {
            grid-template-columns: 1fr;
          }

          .rlc-mobile-phone {
            min-height: 440px;
          }

          .rlc-mobile-screen {
            min-height: 396px;
          }

          .rlc-mobile-cta {
            padding: 26px;
          }
        }
      `}</style>

      <header>
        <div className="rlc-mobile-container rlc-mobile-nav">
          <Link to="/" className="rlc-mobile-brand">
            RLC Bausoftware
          </Link>

          <nav className="rlc-mobile-navlinks">
            <Link to="/" className="rlc-mobile-link">
              Preise
            </Link>
            <Link to="/login" className="rlc-mobile-button">
              Login
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="rlc-mobile-hero">
          <div className="rlc-mobile-container rlc-mobile-hero-grid">
            <div>
              <span className="rlc-mobile-badge">RLC Mobile</span>

              <h1 className="rlc-mobile-title">
                Baustelle und Büro in Echtzeit verbinden
              </h1>

              <p className="rlc-mobile-subtitle">
                Dokumente, Fotos, Regieberichte, Lieferscheine, Bautagebuch und
                Arbeitszeiten direkt auf Smartphone oder Tablet erfassen.
              </p>

              <div className="rlc-mobile-actions">
                <Link to="/preise" className="rlc-mobile-button">
                  Preise ansehen
                </Link>

                <a
                  href="mailto:info@rlcbausoftware.com?subject=Demo%20RLC%20Mobile"
                  className="rlc-mobile-button rlc-mobile-secondary"
                >
                  Demo anfragen
                </a>
              </div>
            </div>

            <div className="rlc-mobile-phone">
              <div className="rlc-mobile-screen">
                <div className="rlc-mobile-screen-head">
                  <strong>RLC Mobile</strong>
                  <div style={{ marginTop: 8, opacity: 0.8 }}>
                    Projekt BA-2026-028
                  </div>
                </div>

                <div className="rlc-mobile-screen-card">
                  <strong>Regieberichte</strong>
                  <div style={{ marginTop: 6, color: "#5f6b7a" }}>
                    Erfassen, unterschreiben und senden
                  </div>
                </div>

                <div className="rlc-mobile-screen-card">
                  <strong>Lieferscheine</strong>
                  <div style={{ marginTop: 6, color: "#5f6b7a" }}>
                    Fotografieren und Projekt zuordnen
                  </div>
                </div>

                <div className="rlc-mobile-screen-card">
                  <strong>Arbeitszeiten</strong>
                  <div style={{ marginTop: 6, color: "#5f6b7a" }}>
                    Mitarbeiterbezogene Zeiterfassung
                  </div>
                </div>

                <div className="rlc-mobile-screen-card">
                  <strong>Bautagebuch</strong>
                  <div style={{ marginTop: 6, color: "#5f6b7a" }}>
                    Vollständige Baustellendokumentation
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rlc-mobile-section rlc-mobile-section-alt">
          <div className="rlc-mobile-container">
            <h2 className="rlc-mobile-section-title">
              Alle wichtigen Baustellenprozesse in einer App
            </h2>

            <p className="rlc-mobile-section-sub">
              RLC Mobile ersetzt Papierformulare und verbindet die Dokumentation
              auf der Baustelle direkt mit dem Büro.
            </p>

            <div className="rlc-mobile-grid">
              {features.map((feature) => (
                <article key={feature.title} className="rlc-mobile-card">
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="rlc-mobile-section">
          <div className="rlc-mobile-container">
            <h2 className="rlc-mobile-section-title">
              Vom Smartphone direkt in das Fachmodul
            </h2>

            <p className="rlc-mobile-section-sub">
              Dokumente werden nicht nur gespeichert, sondern geprüft,
              freigegeben und automatisch dem richtigen Bereich zugeordnet.
            </p>

            <div className="rlc-mobile-workflow">
              {workflow.map((step, index) => (
                <div key={step} className="rlc-mobile-step">
                  <div className="rlc-mobile-step-number">{index + 1}</div>
                  <strong>{step}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rlc-mobile-section rlc-mobile-section-alt">
          <div className="rlc-mobile-container">
            <h2 className="rlc-mobile-section-title">
              Einblicke in RLC Mobile
            </h2>

            <p className="rlc-mobile-section-sub">
              Hier werden anschließend die echten Screenshots der einzelnen
              Mobile-Funktionen eingefügt.
            </p>

            <div className="rlc-mobile-gallery">
              <div className="rlc-mobile-image-box">
                Screenshot Mobile Dashboard
              </div>
              <div className="rlc-mobile-image-box">
                Screenshot Regiebericht
              </div>
              <div className="rlc-mobile-image-box">
                Screenshot Arbeitszeiten
              </div>
              <div className="rlc-mobile-image-box">
                Screenshot Lieferschein
              </div>
              <div className="rlc-mobile-image-box">
                Screenshot Bautagebuch
              </div>
              <div className="rlc-mobile-image-box">
                Screenshot Eingangsprüfung
              </div>
            </div>
          </div>
        </section>

        <section className="rlc-mobile-section">
          <div className="rlc-mobile-container">
            <div className="rlc-mobile-cta">
              <div>
                <h2>RLC Mobile live kennenlernen</h2>
                <p>
                  Für Smartphone, Tablet, lokale Nutzung, Cloud oder vollständige
                  Verbindung mit RLC Web.
                </p>
              </div>

              <a
                href="mailto:info@rlcbausoftware.com?subject=Demo%20RLC%20Mobile"
                className="rlc-mobile-button"
              >
                Demo anfragen
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="rlc-mobile-footer">
        <div className="rlc-mobile-container">
          © 2026 RLC Bausoftware
        </div>
      </footer>
    </div>
  );
}
