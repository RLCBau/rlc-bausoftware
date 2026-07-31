import React from "react";

export default function Machine() {
  return (
    <div className="page p-6">
      <h1 className="page-title">Maschinensteuerung</h1>
      <p className="page-subtitle">
        Modell-Export (Trimble, Leica, iCON, L3D) und Statusübersicht.
      </p>

      <div className="card mt-4">
        <div className="card-header">Modelle</div>
        <div className="card-body overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Format</th>
                <th>Erstellt</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Trasse_A_Modell</td>
                <td>TTM (Trimble)</td>
                <td>02.10.2025 08:40</td>
                <td>bereit</td>
              </tr>
              <tr>
                <td>Leitung_NW200</td>
                <td>iCON</td>
                <td>02.10.2025 08:55</td>
                <td>übertragen</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 flex gap-2">
            <button className="btn">Export Trimble</button>
            <button className="btn">Export Leica</button>
            <button className="btn">Export iCON</button>
          </div>
        </div>
      </div>
    </div>
  );
}
