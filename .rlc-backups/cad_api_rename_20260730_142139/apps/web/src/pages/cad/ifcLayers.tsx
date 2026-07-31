import React from "react";

export default function IFCLayers() {
  return (
    <div className="page p-6">
      <h1 className="page-title">IFC-Layer / BIM</h1>
      <p className="page-subtitle">
        Sichtbarkeiten, Mappings und Property-Sets verwalten.
      </p>

      <div className="card mt-4">
        <div className="card-header">Layerzuordnung</div>
        <div className="card-body overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>IFC-Klasse</th>
                <th>Layer</th>
                <th>Farbe</th>
                <th>Sichtbar</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>IfcRoad</td>
                <td>TRASSE</td>
                <td>#ff9900</td>
                <td>ja</td>
              </tr>
              <tr>
                <td>IfcPipeSegment</td>
                <td>LEITUNG</td>
                <td>#00aaff</td>
                <td>ja</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3">
            <button className="btn">Mapping exportieren</button>
            <button className="btn ml-2">Mapping importieren</button>
          </div>
        </div>
      </div>
    </div>
  );
}
