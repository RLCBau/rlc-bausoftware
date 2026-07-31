import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { createNote, listNotes, listLVItems, type LVItem, type Note } from '../lib/api';

type Ctx = { activeProject: string | null };

export default function DDT() {
  const { activeProject } = useOutletContext<Ctx>();
  const [rows, setRows] = useState<Note[]>([]);
  const [lv, setLv] = useState<LVItem[]>([]);
  const [form, setForm] = useState<Partial<Note>>({ date: new Date().toISOString().slice(0,10) });

  useEffect(() => {
    if (!activeProject) return;
    listNotes(activeProject).then(setRows);
    listLVItems(activeProject).then(setLv);
  }, [activeProject]);

  const submit = async () => {
    if (!activeProject) return;
    const row = await createNote(activeProject, form);
    setRows(s => [row, ...s]);
  };

  return (
    <div className="card grid">
      <div style={{fontWeight:600}}>Lieferscheine</div>
      <div className="row">
        <input type="date" value={form.date as string} onChange={e => setForm({ ...form, date: e.target.value })}/>
        <input placeholder="Lieferant" onChange={e => setForm({ ...form, supplier: e.target.value })}/>
        <input placeholder="Material" onChange={e => setForm({ ...form, material: e.target.value })}/>
        <input type="number" placeholder="Menge" onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} style={{width:120}}/>
        <input placeholder="Einheit" onChange={e => setForm({ ...form, unit: e.target.value })} style={{width:100}}/>
        <input placeholder="Lieferscheinnummer" onChange={e => setForm({ ...form, documentNo: e.target.value })}/>
      </div>
      <div className="row">
        <select onChange={e => setForm({ ...form, lvItemId: e.target.value || null })} defaultValue="">
          <option value="">(ohne LV-Verknüpfung)</option>
          {lv.map(i => <option key={i.id} value={i.id}>{i.positionNumber} — {i.shortText}</option>)}
        </select>
        <button onClick={submit}>Hinzufügen</button>
      </div>

      <table className="mono" style={{width:'100%', marginTop:8}}>
        <thead><tr><th>Datum</th><th>Lieferant</th><th>Material</th><th>Menge</th><th>Einheit</th><th>LS-Nr</th><th>LV</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{String(r.date).slice(0,10)}</td>
              <td>{r.supplier}</td><td>{r.material}</td><td>{r.quantity}</td><td>{r.unit}</td>
              <td>{r.documentNo ?? ''}</td>
              <td>{lv.find(i => i.id === r.lvItemId)?.positionNumber ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
