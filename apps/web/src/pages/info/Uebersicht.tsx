import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";

export default function InfoUebersicht() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        breadcrumb="RLC Module / Info"
        title="ℹ️ Info / Hilfe / Videoerklärung – Übersicht"
        subtitle="Zentrale Anlaufstelle für Hilfe, Tutorials und Support der RLC Bausoftware."
      />

      <Card>
        <ul className="list-disc ml-5 space-y-1">
          <li>
            <b>Kurzanleitungen:</b> Schritt-für-Schritt-Hilfen für alle Module
            (Kalkulation, Mengenermittlung, CAD, Buchhaltung).
          </li>
          <li>
            <b>Video-Tutorials:</b> Kompakte Erklärvideos zu wichtigen
            Funktionen (in Vorbereitung).
          </li>
          <li>
            <b>FAQ & Suche:</b> Schneller Zugriff auf häufige Fragen und Lösungen.
          </li>
          <li>
            <b>Systemstatus:</b> Überblick über Verbindung, API und lokale Daten.
          </li>
          <li>
            <b>Kontakt / Support:</b> Direkte Hilfe bei Problemen oder Fragen.
          </li>
        </ul>
      </Card>

      {/* SUPPORT BOX */}
      <Card>
        <div className="flex flex-col gap-3">
          <div className="font-semibold text-lg">
            💬 Support & Hilfe
          </div>

          <div className="text-sm text-gray-600">
            Bei Problemen mit Synchronisation, Uploads, Projekten oder Bedienung
            kannst du direkt den Support kontaktieren.
          </div>

          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded bg-sky-500 text-white font-semibold hover:bg-sky-600 transition"
              onClick={() => navigate("/info/support")}
            >
              Support Chat öffnen
            </button>

            <button
              className="px-4 py-2 rounded border border-gray-300 bg-white hover:bg-gray-50 transition"
              onClick={() => navigate("/info/faq")}
            >
              FAQ öffnen
            </button>
          </div>
        </div>
      </Card>

      {/* FUTURE BLOCK */}
      <Card>
        <div className="text-sm text-gray-500">
          Hinweis: Weitere Funktionen wie Video-Tutorials, KI-Assistenz und
          erweiterte Hilfe werden kontinuierlich integriert.
        </div>
      </Card>
    </div>
  );
}





