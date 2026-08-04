// apps/web/src/pages/ki/Uebersicht.tsx

import React from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";

type Item = {
  title: string;
  desc: string;
  path: string;
  icon: string;
};

const items: Item[] = [
{
  title: "Automatische LV-Erstellung",
  desc: "KI generiert automatisch Positionen aus Beschreibung oder Projekt.",
  path: "/ki/auto-lv",
  icon: "📄"
},
{
  title: "Vorschläge & Optimierungen",
  desc: "Preise, Materialien und Geräte intelligent optimieren.",
  path: "/ki/vorschlaege",
  icon: "💡"
},
{
  title: "Nachtragserkennung",
  desc: "Abweichungen zwischen LV und Angebot automatisch erkennen.",
  path: "/kalkulation/nachtraege",
  icon: "⚠️"
},
{
  title: "LV-Analyse",
  desc: "Mengen-, Preis- und Plausibilitätsprüfung.",
  path: "/ki/bewertung-analyse",
  icon: "📊"
},
{
  title: "Fotoerkennung",
  desc: "Baustellenbilder analysieren (Rohre, Graben, Materialien).",
  path: "/ki/fotoerkennung",
  icon: "📷"
},
{
  title: "Sprachsteuerung",
  desc: "Regieberichte per Sprache diktieren und automatisch erstellen.",
  path: "/ki/sprachsteuerung",
  icon: "🎤"
}];


export default function KIUebersicht() {
  const nav = useNavigate();

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        breadcrumb="RLC Module / KI"
        title="🤖 KI – Übersicht"
        subtitle="Künstliche Intelligenz unterstützt Sie bei Analyse, Automatisierung und Optimierung." />
      

      {/* GRID MODULE */}
      <div className="rlc-migrated-pages-ki-uebersicht-tsx-1052">





        
        {items.map((it) =>
        <Card
          key={it.path}
          style={{
            cursor: "pointer",
            transition: "0.2s"
          }}
          onClick={() => nav(it.path)}>
          
            <div className="rlc-migrated-pages-ki-uebersicht-tsx-1053">
              <div className="rlc-migrated-pages-ki-uebersicht-tsx-1054">
                {it.icon} <b>{it.title}</b>
              </div>
              <div className="rlc-migrated-pages-ki-uebersicht-tsx-1055">
                {it.desc}
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* INFO */}
      <Card>
        <div className="rlc-migrated-pages-ki-uebersicht-tsx-1056">
          <b>Hinweis:</b><br />
          Die KI-Module arbeiten direkt mit Ihren Projektdaten (LV, Regie,
          Fotos, Angebote). Alle Ergebnisse können sofort weiterverarbeitet
          werden (Kalkulation, Abrechnung, Nachträge).
        </div>
      </Card>
    </div>);

}
