import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { createRegie, listRegie, listLVItems, type LVItem, type Regie } from '../lib/api';

type Ctx = { activeProject: string | null };

export default function Regie() {
  const { activeProject } = useOutletContext<Ctx>();
  const [rows, setRows] = useState<Regie[]>([]);
  const [lv, setLv] = useState<LVItem[]>([]);
  const [form, setForm] = useState<Partial<Regie>>({ date: new Date().toISOString().slice(0,10) });

  useEffect(() => {
    if (!activeProject) return;
    listRegie(activeProject).then(setRows);
    listLVItems(activeProject).then(setLv);
  }, [activeProject]);

  const submit = async () => {
    if (!activeProject) return;
    const row = await createRegie(activeProject, form);
    setRows(s => [row, ...s]);
  };

  return (
    <div className="card grid">
      <div style={{fontWeight:600}}>Regieberichte</div>
      <div className="row">
        <input type="date" value={form.date as string} onChange={e => setForm({ ...form, date: e.target.value })}/>
        <input placeholder="Mitarbeiter/Squadra" onChange={e => setForm({ ...form, worker: e.target.value })}/>
        <input type="number" placeholder="Stunden" onChange={e => setForm({ ...form, hours: Number(e.target.value) })} style={{width:120}}/>
      </div>
      <div className="row">
        <input placeholder="Maschine" onChange={e => setForm({ ...form, machine: e.target.value })}/>
        <input placeholder="Material" onChange={e => setForm({ ...form, material: e.target.value })}/>
        <input type="number" placeholder="Menge" onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} style={{width:120}}/>
        <input placeholder="Einheit" onChange={e => setForm({ ...form, unit: e.target.value })} style={{width:100}}/>
      </div>
      <div className="row">
        <select onChange={e => setForm({ ...form, lvItemId: e.target.value || null })} defaultValue="">
          <option value="">(ohne LV-Verknüpfung)</option>
          {lv.map(i => <option key={i.id} value={i.id}>{i.positionNumber} — {i.shortText}</option>)}
        </select>
        <input placeholder="Kommentar" onChange={e => setForm({ ...form, comment: e.target.value })} style={{flex:1}}/>
        <button onClick={submit}>Hinzufügen</button>
      </div>

      <table className="mono" style={{width:'100%', marginTop:8}}>
        <thead><tr><th>Datum</th><th>Worker</th><th>h</th><th>Maschine</th><th>Material</th><th>Menge</th><th>Einheit</th><th>LV</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{String(r.date).slice(0,10)}</td>
              <td>{r.worker ?? ''}</td><td>{r.hours ?? ''}</td><td>{r.machine ?? ''}</td>
              <td>{r.material ?? ''}</td><td>{r.quantity ?? ''}</td><td>{r.unit ?? ''}</td>
              <td>{lv.find(i => i.id === r.lvItemId)?.positionNumber ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
