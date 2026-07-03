import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";

export default function BueroUebersicht() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        breadcrumb="RLC Module / Büro"
        title="🗂️ Büro / Verwaltung – Übersicht"
        subtitle="Zentrale Steuerung aller administrativen und organisatorischen Prozesse im Projekt."
      />

      <Card>
        <ul className="ml-5 space-y-2 text-sm list-disc leading-relaxed">
          <li>
            <b>Projektverwaltung:</b> Projekte anlegen, Metadaten pflegen,
            Berechtigungen verwalten.
          </li>

          <li>
            <b>Dokumentenverwaltung:</b> Versionierung, OCR-Suche, .msg-Import,
            Freigaben.
          </li>

          <li>
            <b>Vertragsverwaltung:</b> Verträge, Nachträge, Laufzeiten und
            digitale Signaturen.
          </li>

          <li>
            <b>Kommunikation / Aufgaben:</b> To-Dos, Kommentare, Erwähnungen,
            Benachrichtigungen.
          </li>

          <li>
            <b>Outlook / Kalender:</b> Termin-Sync, Erinnerungen,
            Aufgabenplanung.
          </li>

          <li>
            <b>Nutzerverwaltung:</b> Rollen- und Rechtevergabe (Lesen /
            Schreiben / Signieren).
          </li>
        </ul>
      </Card>
    </div>
  );
}





