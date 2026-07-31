import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";

export default function InfoUebersicht() {
  return (
    <div className="space-y-3 p-4">
      <PageHeader
        breadcrumb="RLC Module / Info"
        title="ℹ️ Info / Hilfe / Videoerklärung – Übersicht"
        subtitle="Alle Anleitungen, Lernvideos und Support-Funktionen zur RLC Bausoftware."
      />
      <Card>
        <ul className="list-disc ml-5 space-y-1">
          <li><b>Kurzanleitungen:</b> Schritt-für-Schritt-Hilfen pro Modul.</li>
          <li><b>Video-Tutorials:</b> Kompakte Lernvideos zu zentralen Funktionen.</li>
          <li><b>Suchfunktion:</b> Schneller Zugriff auf Hilfethemen und FAQs.</li>
          <li><b>Kontakt / Support:</b> Tickets, Fernhilfe, Software-Updates.</li>
        </ul>
      </Card>
    </div>
  );
}
