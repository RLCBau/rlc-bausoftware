import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";

export default function CADUebersicht() {
  return (
    <div className="space-y-3">
      <PageHeader
        breadcrumb="RLC Module / CAD · PDF-Viewer"
        title="📐 CAD / PDF-Viewer – Übersicht"
        subtitle="Import, Ansicht und Übergabe relevanter Flächen/Daten an Aufmaß & Kalkulation."
      />
      <Card>
        <ul className="list-disc ml-5 space-y-1">
          <li><b>Import DWG/DXF/PDF/LandXML:</b> Pläne/Modelle einlesen.</li>
          <li><b>Flächen-/Leitungsanalyse:</b> Elemente erkennen und messen.</li>
          <li><b>Übergabe an Aufmaß:</b> Mengen aus Geometrien übernehmen.</li>
          <li><b>Übergabe an Kalkulation:</b> Objekte direkt LV-Positionen zuordnen.</li>
          <li><b>Viewer-Werkzeuge:</b> Zoomen, Messen, Layer ein/aus.</li>
          <li><b>Export/Übernahme:</b> als PDF oder LV-Eintrag.</li>
        </ul>
      </Card>
    </div>
  );
}





