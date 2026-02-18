import { useEffect, useMemo, useState } from 'react';

const API = (import.meta as any).env.VITE_API_URL || 'http://localhost:4000';

type Project = { id: string; name: string; code: string };
type LVItem = {
  id: string; projectId: string; positionNumber: string;
  shortText: string; unit: string; unitPrice: number; quantity: number;
};

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [items, setItems] = useState<LVItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    fetch(`${API}/projects`)
      .then(r => r.json())
      .then((p: Project[]) => {
        setProjects(p);
        if (p.length) setProjectId(p[0].id);
      })
      .catch(e => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`${API}/projects/${projectId}/lv-items`)
      .then(r => r.json())
      .then((rows: LVItem[]) => setItems(rows))
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [projectId]);

  const total = useMemo(
    () => items.reduce((s, r) => s + (r.quantity ?? 0) * (r.unitPrice ?? 0), 0),
    [items]
  );

  const saveQty = async (id: string, qty: number) => {
    const r = await fetch(`${API}/lv-items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: qty }),
    });
    const updated = await r.json();
    setItems(prev => prev.map(it => (it.id === id ? updated : it)));
  };

  return (
    <div>
      <h1>RLC – Progetti & LV</h1>

      {err && <div className="errbox">{err}</div>}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label>Progetto:</label>
        <select value={projectId} onChange={e => setProjectId(e.target.value)}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
        </select>
        {loading && <span>carico…</span>}
      </div>

      <table>
        <thead>
          <tr>
            <th>Pos.</th><th>Testo</th><th>UM</th><th>Prezzo</th><th>Q.tà</th><th>Totale</th>
          </tr>
        </thead>
        <tbody>
          {items.map(row => (
            <tr key={row.id}>
              <td>{row.positionNumber}</td>
              <td>{row.shortText}</td>
              <td>{row.unit}</td>
              <td style={{ textAlign:'right' }}>{row.unitPrice.toFixed(2)}</td>
              <td>
                <input
                  type="number"
                  defaultValue={row.quantity}
                  style={{ width: 90 }}
                  onBlur={async e => {
                    const v = Number(e.currentTarget.value);
                    if (Number.isFinite(v)) await saveQty(row.id, v);
                  }}
                />
              </td>
              <td style={{ textAlign:'right' }}>{(row.quantity * row.unitPrice).toFixed(2)}</td>
            </tr>
          ))}
          {!items.length && !loading && (
            <tr><td colSpan={6} style={{ padding: 12, textAlign:'center', color:'#666' }}>Nessuna voce.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} style={{ textAlign:'right' }}>Totale</td>
            <td style={{ textAlign:'right' }}>{total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
