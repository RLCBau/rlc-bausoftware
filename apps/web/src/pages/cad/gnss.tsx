import React from "react";

export default function GNSS() {
  return (
    <div className="page p-6">
      <h1 className="page-title">GNSS / Totalstation</h1>
      <p className="page-subtitle">
        Import von CSV / GSI, Punktverwaltung und Messreihen.
      </p>

      <div className="card mt-4">
        <div className="card-header">Messpunkte</div>
        <div className="card-body overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Bezeichnung</th>
                <th>Rechts [m]</th>
                <th>Hoch [m]</th>
                <th>Höhe [m]</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>101</td>
                <td>Achspunkt 1</td>
                <td>443215.123</td>
                <td>5234101.987</td>
                <td>412.550</td>
              </tr>
              <tr>
                <td>102</td>
                <td>Achspunkt 2</td>
                <td>443230.456</td>
                <td>5234110.221</td>
                <td>412.575</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 flex gap-2">
            <button className="btn">CSV Import</button>
            <button className="btn">GSI Import</button>
            <button className="btn">Export CSV</button>
          </div>
        </div>
      </div>
    </div>
  );
}

