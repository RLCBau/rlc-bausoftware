import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";

export default function KalkulationUebersicht() {
  return (
    <div className="space-y-3">
      <PageHeader
        breadcrumb="RLC Module / Kalkulation"
        title="🧮 Kalkulation – Übersicht"
        subtitle="Komplette Angebotskalkulation vom LV bis zum Export."
      />
      <Card>
        <ul className="list-disc ml-5 space-y-1">
          <li><b>Leistungsverzeichnis hochladen / erstellen:</b> Import/Neuanlage (GAEB, Excel, PDF).</li>
          <li><b>Kalkulation mit KI:</b> Preisvorschläge, Plausibilitäts- & Lückenanalyse.</li>
          <li><b>Kalkulation manuell:</b> Lohn/Material/Geräte manuell pflegen.</li>
          <li><b>Nachträge:</b> Varianten/Mehrleistungen erfassen und bewerten.</li>
          <li><b>Angebot (PDF/Excel):</b> Layout, Rabatte, Unterschrift.</li>
          <li><b>GAEB Import/Export:</b> X83/X84/D83/P83.</li>
          <li><b>Versionsvergleich / Angebotsanalyse:</b> Unterschiede je Stand.</li>
          <li><b>Preisaufschlag / Rabattfunktion:</b> global/selektiv.</li>
        </ul>
      </Card>
    </div>
  );
}
