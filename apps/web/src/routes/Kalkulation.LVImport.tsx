import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { createLVItems, type LVItem } from '../lib/api';

type Ctx = { activeProject: string | null };

export default function LVImport() {
  const { activeProject } = useOutletContext<Ctx>();
  const [text, setText] = useState('001.001;Speedpipe;Liefern & Verlegen;m;24.5\n001.002;Asphalt;Deckschicht;m²;39.9');
  const [count, setCount] = useState<number | null>(null);

  const parse = (raw: string) => raw
    .split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    .map(line => {
      const [positionNumber, shortText, longText, unit, unitPrice] = line.split(';');
      return { positionNumber, shortText, longText, unit, unitPrice: Number(unitPrice) } as Partial<LVItem>;
    });

  const send = async () => {
    if (!activeProject) return alert('Projekt wählen');
    const rows = parse(text);
    const res = await createLVItems(activeProject, rows);
    setCount(res.created ?? 0);
  };

  return (
    <div className="card grid">
      <div style={{fontWeight:600}}>LV Import (CSV; sep=;)</div>
      <textarea rows={8} value={text} onChange={e => setText(e.target.value)} className="mono" />
      <div className="row">
        <button onClick={send}>Importieren</button>
        {count !== null && <span className="pill">{count} Positionen erstellt</span>}
      </div>
      <div className="muted">Format: Positionsnummer;Kurztext;Langtext;Einheit;EP</div>
    </div>
  );
}
