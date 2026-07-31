import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";

export default function BueroUebersicht() {
  return (
    <div className="space-y-3 p-4">
      <PageHeader
        breadcrumb="RLC Module / Büro"
        title="🗂️ Büro / Verwaltung – Übersicht"
        subtitle="Zentrale Steuerung aller administrativen und organisatorischen Prozesse im Projekt."
      />
      <Card>
        <ul className="list-disc ml-5 space-y-1">
          <li><b>Projektverwaltung:</b> Projekte anlegen, Metadaten pflegen, Berechtigungen verwalten.</li>
          <li><b>Dokumentenverwaltung:</b> Versionierung, OCR-Suche, .msg-Import, Freigaben.</li>
          <li><b>Vertragsverwaltung:</b> Verträge, Nachträge, Laufzeiten und digitale Signaturen.</li>
          <li><b>Kommunikation / Aufgaben:</b> To-Dos, Kommentare, Erwähnungen, Benachrichtigungen.</li>
          <li><b>Outlook / Kalender:</b> Termin-Sync, Erinnerungen, Aufgabenplanung.</li>
          <li><b>Nutzerverwaltung:</b> Rollen- und Rechtevergabe (Lesen / Schreiben / Signieren).</li>
        </ul>
      </Card>
    </div>
  );
}
