import { useEffect, useMemo, useRef, useState } from 'react';
import { listProjects, listLVItems, updateLVItem, type Project, type LVItem } from '../lib/api';
import { Card, Row } from '../ui/kit';
import DataSheet, { Col } from '../ui/DataSheet';
import { exportToXlsx } from '../utils/excel';

type PriceRow = { codice: string; descrizione: string; unita: string; prezzo: number; fornitore?: string; note?: string; };
type VersionRow = { versione: string; data: string; autore: string; totale: number; stato: string; note?: string; };
type NachtragRow = { numero: string; descrizione: string; importo: number; stato: string; };

export default function Kalkulation() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [lv, setLv] = useState<LVItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const importTextRef = useRef<HTMLTextAreaElement>(null);

  // list projects + default selection
  useEffect(() => {
    listProjects().then(p => { setProjects(p); if (p.length) setProjectId(p[0].id); })
      .catch(e => setErr(String(e)));
  }, []);

  // load LV
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    listLVItems(projectId).then(setLv).catch(e => setErr(String(e))).finally(()=>setLoading(false));
  }, [projectId]);

  const lvCols: Col<LVItem & { totale:number }>[] = [
    { key:'positionNumber', header:'Pos.', width:100, editable:false },
    { key:'shortText', header:'Testo', width:360, editable:false },
    { key:'unit', header:'UM', width:70 },
    { key:'unitPrice', header:'Prezzo', width:100, align:'right', type:'number' },
    { key:'quantity', header:'Q.tà', width:100, align:'right', type:'number', editable:true },
    { key:'totale', header:'Totale', width:120, align:'right', type:'number' }
  ];

  const lvView = useMemo(() =>
    lv.map(r => ({ ...r, totale: (r.unitPrice||0)*(r.quantity||0) })), [lv]
  );

  const lvTotal = useMemo(()=> lvView.reduce((a,r)=>a+(r.totale||0),0), [lvView]);

  async function setQty(id: string, qty: number) {
    const updated = await updateLVItem(id, { quantity: qty });
    setLv(prev => prev.map(r => (r.id===id ? updated : r)));
  }

  async function importJsonAsLV() {
    if (!projectId || !importTextRef.current) return;
    const txt = importTextRef.current.value.trim();
    if (!txt) return;
    const items = JSON.parse(txt);
    const res = await fetch(`${(import.meta as any).env.VITE_API_URL || 'http://localhost:4000'}/projects/${projectId}/lv-items`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ items })
    });
    if (!res.ok) { alert(await res.text()); return; }
    listLVItems(projectId).then(setLv);
    importTextRef.current.value = '';
  }

  function exportLvNoPrices() {
    const out = lv.map(r => ({ positionNumber:r.positionNumber, shortText:r.shortText, longText:r.longText||'', unit:r.unit }));
    exportToXlsx('LV_senza_prezzi', out);
  }

  // ======= Prezzi catalogs (Materiali/Operai/Macchine) =======
  const [mat, setMat] = useState<PriceRow[]>([]);
  const [man, setMan] = useState<PriceRow[]>([]);
  const [mac, setMac] = useState<PriceRow[]>([]);
  const priceCols: Col<PriceRow>[] = [
    { key:'codice', header:'Codice', width:120, editable:true },
    { key:'descrizione', header:'Descrizione', width:360, editable:true },
    { key:'unita', header:'UM', width:80, editable:true },
    { key:'prezzo', header:'Prezzo', width:120, align:'right', type:'number', editable:true },
    { key:'fornitore', header:'Fornitore', width:180, editable:true },
    { key:'note', header:'Note', width:200, editable:true }
  ];

  // ======= Versioni & Analisi =======
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const versionCols: Col<VersionRow>[] = [
    { key:'versione', header:'Versione', width:120, editable:true },
    { key:'data', header:'Data', width:120, editable:true },
    { key:'autore', header:'Autore', width:180, editable:true },
    { key:'totale', header:'Totale', width:120, align:'right', type:'number', editable:true },
    { key:'stato', header:'Stato', width:140, editable:true },
    { key:'note', header:'Note', width:240, editable:true }
  ];

  // ======= Nachträge (varianti) =======
  const [nach, setNach] = useState<NachtragRow[]>([]);
  const nachCols: Col<NachtragRow>[] = [
    { key:'numero', header:'Nr.', width:100, editable:true },
    { key:'descrizione', header:'Descrizione', width:420, editable:true },
    { key:'importo', header:'Importo', width:140, align:'right', type:'number', editable:true },
    { key:'stato', header:'Stato', width:160, editable:true }
  ];

  return (
    <>
      <Card title="1. Kalkulation">
        <Row>
          <div className="muted">Progetto:</div>
          <select className="input" value={projectId} onChange={e=>setProjectId(e.target.value)}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
          </select>
          {loading && <span className="muted">carico…</span>}
          <button className="input" onClick={()=>listLVItems(projectId).then(setLv)}>Aggiorna LV</button>
          <button className="input" onClick={exportLvNoPrices}>Esporta LV senza prezzi (XLSX)</button>
        </Row>

        <DataSheet
          title="LV – Voci (edit quantità)"
          columns={lvCols}
          rows={lvView}
          onChange={(rows)=>{ // solo colonna quantity è editabile -> commit su API
            const next = rows as (LVItem & {totale:number})[];
            next.forEach((r,i)=> {
              const old = lv[i]; if(!old) return;
              if (old.quantity !== r.quantity) setQty(old.id, Number(r.quantity||0));
            });
          }}
          sumKeys={['totale']}
          actions={<span className="muted">Totale: {lvTotal.toFixed(2)}</span>}
        />
      </Card>

      <Card title="Import LV (JSON)">
        <p className="muted">Incolla JSON con array: positionNumber, shortText, longText, unit, unitPrice (facoltativo), quantity (facoltativo).</p>
        <textarea ref={importTextRef} className="input" rows={6} style={{width:'100%'}}
          placeholder='[{"positionNumber":"001.001","shortText":"Scavo","unit":"m","unitPrice":10,"quantity":5}]' />
        <Row><button className="input" onClick={importJsonAsLV}>Importa nel progetto</button></Row>
      </Card>

      <DataSheet title="Prezzi Materiali"   columns={priceCols} rows={mat} onChange={setMat}   sumKeys={['prezzo']} />
      <DataSheet title="Prezzi Operai"      columns={priceCols} rows={man} onChange={setMan}   sumKeys={['prezzo']} />
      <DataSheet title="Prezzi Macchine"    columns={priceCols} rows={mac} onChange={setMac}   sumKeys={['prezzo']} />
      <DataSheet title="Versioni & Analisi" columns={versionCols} rows={versions} onChange={setVersions} sumKeys={['totale']} />
      <DataSheet title="Nachträge (Varianti)" columns={nachCols} rows={nach} onChange={setNach} sumKeys={['importo']} />
    </>
  );
}


