import React from "react";
import {Link} from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";

function token() {
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of ["rlc_token","token","authToken","accessToken","rlc_auth_token"]) {
      const value = storage.getItem(key);
      if (value?.trim()) return value.trim();
    }
  }
  return "";
}

async function request(path: string) {
  const auth = token();

  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {})
    }
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  }

  return data;
}

export default function MaschinenKosten() {
  const [error,setError]=React.useState("");
  const [maintenanceIncluded,setMaintenanceIncluded]=React.useState(false);
  const [items,setItems] = React.useState<any[]>([]);
  const [totals,setTotals] = React.useState<any>({});

  const load = React.useCallback(async () => {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
    const to = now.toISOString().slice(0,10);

    const data = await request(
      `/api/resource-costs/machine-costs?from=${from}&to=${to}`
    );

    setItems(Array.isArray(data?.items) ? data.items : []);
    setTotals(data?.totals || {});setMaintenanceIncluded(!!data?.maintenanceIncluded);setError("");
  }, []);

  React.useEffect(() => {
    void load().catch((e:any)=>setError(e.message));
  }, [load]);

  return (
    <div style={{display:"grid",gap:12}}>
      {error&&<div className="card" role="alert">{error}</div>}
      <div className="rlc-page-toolbar"><Link className="btn" to="/buro/geraeteverrechnung">Geräteverrechnung</Link><Link className="btn" to="/buro/freimeldungen">Freimeldungen</Link></div>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,minmax(0,1fr))",
          gap: 10
        }}
      >
        <div className="card"><div className="muted">Planstunden</div><b style={{fontSize:24}}>{Number(totals.plannedHours||0).toFixed(1)}</b></div>
        <div className="card"><div className="muted">Einsatzkosten</div><b style={{fontSize:24}}>{Number(totals.usageCost||0).toFixed(2)} €</b></div>
        <div className="card"><div className="muted">Wartungskosten</div><b style={{fontSize:24}}>{Number(totals.maintenanceCost||0).toFixed(2)} €</b></div>
        <div className="card"><div className="muted">Gesamtkosten</div><b style={{fontSize:24}}>{Number(totals.totalCost||0).toFixed(2)} €</b></div>
      </section>

      <section className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            paddingBottom: 10,
            marginBottom: 10,
            borderBottom: "1px solid #e4eaf2"
          }}
        >
          <div>
            <strong style={{ fontSize: 18 }}>
              Maschinenkosten
            </strong>
            <div className="muted">
              Gebuchte tatsächliche Einsätze mit den zum Buchungszeitpunkt gespeicherten Stundensätzen. Betriebsstundenzähler bleiben in der Maschinenverwaltung sichtbar. {maintenanceIncluded?"Wartungskosten werden firmenweit im gewählten Zeitraum ausgewertet.":"Wartungskosten haben keine Projektzuordnung und sind in dieser Auswertung nicht enthalten."}
            </div>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            minWidth: 980,
            borderCollapse: "collapse"
          }}
        >
          <thead>
            <tr>
              <th>Maschine</th>
              <th>Projekt</th>
              <th>Plan-Std.</th>
              <th>Gebuchte Std.</th>
              <th>Aktueller Stammsatz</th>
              <th>Einsatz</th>
              <th>Wartung</th>
              <th>Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item=>(
              <tr key={item.machineId}>
                <td><b>{item.machineName}</b></td>
                <td>{item.projectId || "—"}</td>
                <td>{Number(item.plannedHours||0).toFixed(1)}</td>
                <td>{Number(item.operatingHours||0).toFixed(1)}</td>
                <td>{Number(item.hourlyRate||0).toFixed(2)} €</td>
                <td>{Number(item.usageCost||0).toFixed(2)} €</td>
                <td>{Number(item.maintenanceCost||0).toFixed(2)} €</td>
                <td><b>{Number(item.totalCost||0).toFixed(2)} €</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 24,
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid #e4eaf2"
          }}
        >
          <div>
            <div className="muted">Einsatz</div>
            <b>{Number(totals.usageCost || 0).toFixed(2)} €</b>
          </div>

          <div>
            <div className="muted">Wartung</div>
            <b>{Number(totals.maintenanceCost || 0).toFixed(2)} €</b>
          </div>

          <div>
            <div className="muted">Gesamt</div>
            <b style={{ fontSize: 20 }}>
              {Number(totals.totalCost || 0).toFixed(2)} €
            </b>
          </div>
        </div>
      </section>
    </div>
  );
}