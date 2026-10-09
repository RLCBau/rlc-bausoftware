import React from "react";
import { useNavigate } from "react-router-dom";

const modules = [
  {
    title: "Regieberichte",
    text: "Regieberichte erfassen, prüfen und bearbeiten.",
    to: "/buro/regieberichte"
  },
  {
    title: "Lieferscheine",
    text: "Lieferscheine zentral prüfen und zuordnen.",
    to: "/buro/lieferscheine"
  },
  {
    title: "Projektakte / Fotos",
    text: "Fotos, Notizen und Projektnachweise verwalten.",
    to: "/buro/fotos"
  },
  {
    title: "Tagesberichte",
    text: "Tägliche Baustellendokumentation führen.",
    to: "/buro/tagesberichte"
  },
  {
    title: "Bautagebuch",
    text: "Chronologische Baustellendokumentation.",
    to: "/buro/bautagebuch"
  },
  {
    title: "Vorlagen-Center",
    text: "Formulare, Protokolle und Vorlagen verwenden.",
    to: "/buro/vorlagen"
  },
  {
    title: "Übergabe & Abnahme",
    text: "Übergaben und Abnahmeprotokolle organisieren.",
    to: "/buro/uebergabe"
  }
];

export default function Baustellendokumentation() {
  const navigate = useNavigate();

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Verwaltung · Dokumentation
          </div>
          <h1 style={{ margin: "3px 0 4px" }}>
            Baustellendokumentation
          </h1>
          <div style={{ opacity: .9 }}>
            Baustellenberichte, Nachweise, Fotos und Übergabedokumente zentral verwalten.
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
