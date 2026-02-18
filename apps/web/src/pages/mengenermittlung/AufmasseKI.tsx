import React from "react";

/**
 * AufmasseKI – riconoscimento linee/superfici/volumi da documento importato
 * MVP mock: carica lista documenti dal server, anteprima, chiama /api/ki/measure
 * e mostra le entità rilevate con lunghezze/aree/volumi.
 */

type DocInfo = { id: string; name: string; pages: number; previewUrl?: string };
type MeasItem =
  | { id: string; type: "line";   label: string; value: number; unit: "m" ; points?: [number,number][] }
  | { id: string; type: "area";   label: string; value: number; unit: "m²"; points?: [number,number][] }
  | { id: string; type: "volume"; label: string; value: number; unit: "m³"; points?: [number,number][] };

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13 };
const td: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13 };

export default function AufmasseKI() {
  const [docs, setDocs] = React.useState<DocInfo[]>([]);
  const [docId, setDocId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [unitScale, setUnitScale] = React.useState<number>(1); // fattore scala (metri/pixel, ecc.)
  const [items, setItems] = React.useState<MeasItem[]>([]);
  const current = docs.find(d => d.id === docId) || null;

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/docs");
        const j = await r.json();
        setDocs(j.docs || []);
        if (j.docs?.length && !docId) setDocId(j.docs[0].id);
      } catch (err) {
        console.error(err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyze = async () => {
    if (!docId) return;
    setLoading(true);
    try {
      const r = await fetch("/api/ki/measure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId, unitScale }),
      });
      const j = await r.json();
      setItems(j.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const totalByUnit = (u: "m" | "m²" | "m³") =>
    items.filter(i => i.unit === u).reduce((a, i) => a + i.value, 0);

  return (
    <div className="card" style={{ padding: 10 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <label style={{ fontSize: 13, opacity: .8 }}>Dokument</label>
        <select
          value={docId ?? ""}
          onChange={(e) => setDocId(e.target.value)}
          style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px" }}
        >
          {docs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <div style={{ width: 20 }} />

        <label style={{ fontSize: 13, opacity: .8 }}>Skalierungsfaktor</label>
        <input
          type="number"
          step="0.0001"
          value={unitScale}
          onChange={e => setUnitScale(Number(e.target.value) || 1)}
          style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", width: 120 }}
          title="z. B. Meter pro Pixel oder ein globaler Maßstab"
        />

        <div style={{ flex: 1 }} />

        <button className="btn" onClick={analyze} disabled={!docId || loading}>
          {loading ? "Analyse läuft …" : "KI erkennen"}
        </button>
      </div>

      {/* Viewer + Tabelle */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 40%) 1fr", gap: 10 }}>
        {/* Preview pannello */}
        <div className="card" style={{ padding: 0, minHeight: 360, display: "grid", placeItems: "center" }}>
          {current?.previewUrl ? (
            <img src={current.previewUrl} alt={current.name} style={{ maxWidth: "100%", maxHeight: 500, objectFit: "contain" }} />
          ) : (
            <div style={{ opacity: .7, padding: 12, fontSize: 13 }}>
              Keine Vorschau verfügbar. (Die Dateien werden in der nächsten Sektion <b>Import PDF / CAD / LandXML / GSI / CSV</b> geladen.)
            </div>
          )}
        </div>

        {/* Risultati */}
        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Typ</th>
                <th style={th}>Label</th>
                <th style={th}>Wert</th>
                <th style={th}>Einheit</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id}>
                  <td style={td}>{i.type}</td>
                  <td style={td}>{i.label}</td>
                  <td style={td}>{i.value.toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                  <td style={td}>{i.unit}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td style={{ ...td, opacity: .7 }} colSpan={4}>Noch keine Analyse durchgeführt.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={2}>Summen</td>
                <td style={{ ...td, fontWeight: 700 }} colSpan={2}>
                  {[
                    ["m",  totalByUnit("m")],
                    ["m²", totalByUnit("m²")],
                    ["m³", totalByUnit("m³")],
                  ]
                    .filter(([, v]) => v > 0)
                    .map(([u, v]) => `${v.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${u}`)
                    .join("   •   ")
                  }
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 10, opacity: .7, fontSize: 13 }}>
        Hinweis: Diese Seite nutzt aktuell Demo-Ergebnisse. Die echten Erkennungen werden aus den in
        <b> Import PDF / CAD / LandXML / GSI / CSV</b> hochgeladenen Dateien berechnet.
      </div>
    </div>
  );
}
