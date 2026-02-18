import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { listLVItems, updateLVItem, type LVItem } from '../lib/api';

type Ctx = { activeProject: string | null };

export default function Preise() {
  const { activeProject } = useOutletContext<Ctx>();
  const [items, setItems] = useState<LVItem[]>([]);

  useEffect(() => {
    if (!activeProject) return;
    listLVItems(activeProject).then(setItems);
  }, [activeProject]);

  const save = async (id: string, unitPrice: number, quantity: number) => {
    const u = await updateLVItem(id, { unitPrice, quantity });
    setItems(s => s.map(it => it.id === id ? u : it));
  };

  const total = (it: LVItem) => (it.unitPrice * it.quantity);

  return (
    <div className="card">
      <div style={{fontWeight:600, marginBottom:8}}>Preise & Mengen</div>
      <table className="mono" style={{width:'100%', borderCollapse:'collapse'}}>
        <thead><tr><th align="left">Pos</th><th align="left">Text</th><th>Einheit</th><th>EP</th><th>Menge</th><th>Summe</th><th></th></tr></thead>
        <tbody>
          {items.map(it => (
            <tr key={it.id}>
              <td>{it.positionNumber}</td>
              <td>{it.shortText}</td>
              <td align="center">{it.unit}</td>
              <td><input type="number" defaultValue={it.unitPrice} onChange={e => (it.unitPrice = Number(e.target.value))} style={{width:100}}/></td>
              <td><input type="number" defaultValue={it.quantity} onChange={e => (it.quantity = Number(e.target.value))} style={{width:100}}/></td>
              <td align="right">{total(it).toFixed(2)}</td>
              <td><button onClick={() => save(it.id, it.unitPrice, it.quantity)}>Speichern</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
