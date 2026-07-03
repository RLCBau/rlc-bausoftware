// apps/web/src/pages/mengenermittlung/Uebersicht.tsx
import React from "react";
import PageHeader from "../../components/PageHeader";
import Card from "../../components/Card";

export default function MengenermittlungUebersicht() {
  return (
    <div className="space-y-3">
      <PageHeader
        breadcrumb="RLC / Mengenermittlung"
        title="Mengenermittlung – Übersicht"
        subtitle="Präzise und nachvollziehbare Aufmaße – direkt mit LV, Nachträgen und Abrechnung verknüpft."
      />

      <Card>
        <ul className="list-disc ml-5 space-y-1 text-sm">
          <li>
            <b>Aufmaß-Editor:</b> Formeln, Teilmengen, Fotos und Notizen direkt je Position.
          </li>
          <li>
            <b>Nach Position (LV-gestützt):</b> automatische Zuordnung und Summierung.
          </li>
          <li>
            <b>Manuell oder per Foto:</b> klassische Eingabe oder KI-gestützte Erkennung.
          </li>
          <li>
            <b>Import (PDF / CAD / LandXML):</b> Mengen direkt aus Plänen und Modellen übernehmen.
          </li>
          <li>
            <b>Soll-Ist-Vergleich:</b> Fortschritt und Abweichungen je Position analysieren.
          </li>
          <li>
            <b>Massenaufstellung:</b> vollständige, prüfbare Darstellung aller Mengen inkl. Export.
          </li>
          <li>
            <b>Verknüpfung mit Abrechnung & Nachträgen:</b> direkte Übergabe ohne doppelte Eingabe.
          </li>
        </ul>
      </Card>
    </div>
  );
}





