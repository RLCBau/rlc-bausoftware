import React from "react";
import { useNavigate } from "react-router-dom";

const modules = [
  {title:"Geräteverrechnung",text:"Tatsächliche Geräteeinsätze mit festen Stundensätzen und Kostenstellen buchen.",to:"/buro/geraeteverrechnung"},
  {title:"Geräte / Freimeldungen",text:"Einsatzende, Gerätezustand und Verfügbarkeit mit der Einsatzplanung abstimmen.",to:"/buro/freimeldungen"},
  {
    title: "Versanderfassung", text: "Sendungen, Zustellungen und Belege projektbezogen erfassen.", to: "/buro/versanderfassung"
  },
  {
    title: "Bürgschaftsverwaltung",
    text: "Bürgschaften, Fristen und Rückgaben projektbezogen verwalten.",
    to: "/buro/buergschaften"
  },
  {
    title: "NU-Management / Nachweise",
    text: "Nachunternehmer- und Lieferantennachweise mit Verträgen und Projektunterlagen verbinden.",
    to: "/buro/nachunternehmer"
  },
  {
    title: "Angebote",
    text: "Angebote erstellen und verwalten.",
    to: "/buro/angebote"
  },
  {
    title: "Dokumentenverwaltung",
    text: "Dokumente, Versionen und Projektunterlagen verwalten.",
    to: "/buro/dokumente"
  },
  {
    title: "Vertragsverwaltung",
    text: "Verträge, Nachträge und digitale Signaturen.",
    to: "/buro/vertraege"
  },
  {
    title: "Kommunikation & Notizen",
    text: "Projektkommunikation und interne Abstimmungen.",
    to: "/buro/kommunikation"
  },
  {
    title: "Aufgaben",
    text: "Aufgaben, Fristen und Verantwortlichkeiten.",
    to: "/buro/tasks"
  },
  {
    title: "Outlook & Kalender",
    text: "Termine, Erinnerungen und Kalenderintegration.",
    to: "/buro/outlook"
  }
];

export default function BueroKommunikation() {
  const navigate = useNavigate();

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Verwaltung · Büro
          </div>
          <h1 style={{ margin: "3px 0 4px" }}>
            Büro & Kommunikation
          </h1>
          <div style={{ opacity: .9 }}>
            Dokumente, Verträge, Kommunikation, Aufgaben und Termine zentral organisieren.
          </div>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 12
        }}
      >
        {modules.map((m) => (
          <button
            key={m.to}
            className="card"
            onClick={() => navigate(m.to)}
            style={{
              textAlign: "left",
              cursor: "pointer",
              minHeight: 125,
              border: "1px solid #dbe3ee",
              background: "#fff"
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 750 }}>
              {m.title}
            </div>
            <div className="muted" style={{ marginTop: 7 }}>
              {m.text}
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 12,
                fontWeight: 700,
                color: "#146ef5"
              }}
            >
              Öffnen →
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}
