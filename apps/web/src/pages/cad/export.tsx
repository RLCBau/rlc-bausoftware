import React from "react";

export default function CADExport() {
  return (
    <div className="page p-6">
      <h1 className="page-title">CAD Export</h1>
      <p className="page-subtitle">
        DWG / DXF / LandXML / IFC Export aus ausgewählten Layern.
      </p>

      <div className="card mt-4">
        <div className="card-header">Einstellungen</div>
        <div className="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="form-row">
            <span>Ziel-Format</span>
            <select className="inp">
              <option>DWG</option>
              <option>DXF</option>
              <option>LandXML</option>
              <option>IFC</option>
            </select>
          </label>
          <label className="form-row">
            <span>Koordinatensystem</span>
            <select className="inp">
              <option>ETRS89 / UTM 32</option>
              <option>ETRS89 / UTM 33</option>
              <option>GK 3</option>
            </select>
          </label>
          <label className="form-row md:col-span-2">
            <span>Layer / Elemente</span>
            <input className="inp" placeholder="TRASSE, KANTE, ACHSE, …" />
          </label>
          <div className="md:col-span-2">
            <button className="btn-primary">Export starten</button>
          </div>
        </div>
      </div>
    </div>
  );
}
