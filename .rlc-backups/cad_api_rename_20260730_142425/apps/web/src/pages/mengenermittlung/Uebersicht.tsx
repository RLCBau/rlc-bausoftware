import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";

export default function MengenermittlungUebersicht() {
  return (
    <div className="space-y-3">
      <PageHeader
        breadcrumb="RLC Module / Mengenermittlung"
        title="📏 Mengenermittlung – Übersicht"
        subtitle="Präzise, nachvollziehbare Aufmaße – direkt mit LV/Nachträgen verknüpft."
      />
      <Card>
        <ul className="list-disc ml-5 space-y-1">
          <li><b>Aufmaß-Editor:</b> Formeln, Teilmengen, Fotos/Notizen.</li>
          <li><b>Nach Position (LV-gestützt):</b> automatische Summierung.</li>
          <li><b>Manuell oder per Foto:</b> Eingabe oder KI-Erkennung.</li>
          <li><b>Import PDF/CAD/LandXML:</b> Mengen aus Plänen/Modellen.</li>
          <li><b>Soll-Ist-Vergleich:</b> Fortschritt je Position.</li>
          <li><b>Massenaufstellung:</b> zeilenweise Nachvollziehbarkeit, Export.</li>
          <li><b>Verknüpfung mit Abrechnung & Nachträgen:</b> direkte Übergabe.</li>
        </ul>
      </Card>
    </div>
  );
}
