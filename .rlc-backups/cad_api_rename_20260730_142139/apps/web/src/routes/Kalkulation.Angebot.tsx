import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { listLVItems, type LVItem } from '../lib/api';

type Ctx = { activeProject: string | null };

export default function Angebot() {
  const { activeProject } = useOutletContext<Ctx>();
  const [items, setItems] = useState<LVItem[]>([]);

  useEffect(() => { if (activeProject) listLVItems(activeProject).then(setItems); }, [activeProject]);

  const exportCSV = () => {
    const rows = [['Pos','Kurztext','Einheit','Menge','EP','Summe'], ...items.map(i => [
      i.positionNumber, i.shortText, i.unit, i.quantity, i.unitPrice, (i.quantity*i.unitPrice).toFixed(2)
    ])];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Angebot.csv';
    a.click();
  };

  return (
    <div className="card grid">
      <div style={{fontWeight:600}}>Angebot generieren</div>
      <button onClick={exportCSV}>Export CSV (Excel)</button>
      <div className="muted">PDF renderer verrà aggiunto; ora export CSV compatibile Excel.</div>
    </div>
  );
}
