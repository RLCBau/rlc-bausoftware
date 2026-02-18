import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";

export default function KIUebersicht() {
  return (
    <div className="space-y-3 p-4">
      <PageHeader
        breadcrumb="RLC Module / KI"
        title="🤖 KI – Übersicht"
        subtitle="Künstliche Intelligenz unterstützt Sie bei Analyse, Automatisierung und Optimierung."
      />
      <Card>
        <ul className="list-disc ml-5 space-y-1">
          <li><b>Automatische LV-Erstellung:</b> KI generiert Positionen nach Projektart und Region.</li>
          <li><b>Vorschläge & Optimierungen:</b> Intelligente Empfehlungen für Preise, Material, Geräte.</li>
          <li><b>Nachtragserkennung:</b> Abweichungen und Mehrleistungen automatisch identifizieren.</li>
          <li><b>LV-Analyse:</b> Plausibilitäts-, Mengen- und Preisprüfung.</li>
          <li><b>Fotoerkennung:</b> Objekte und Schichten aus Baustellenfotos erkennen.</li>
          <li><b>Sprachsteuerung:</b> Aufmaße / Regieberichte per Spracheingabe erfassen.</li>
        </ul>
      </Card>
    </div>
  );
}
