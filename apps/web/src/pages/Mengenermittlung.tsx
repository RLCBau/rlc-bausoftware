import { useEffect, useState } from 'react';
import { listProjects, listRegie, listNotes, type Project } from '../lib/api';
import { Card, Row } from '../ui/kit';
import DataSheet, { Col } from '../ui/DataSheet';

type RegieRow = { id?:string; data:string; descrizione:string; ore:number; costo:number; progetto?:string; };
type NoteRow  = { id?:string; data:string; fornitore:string; ddt:string; materiale:string; quantita:number; costo:number; };

export default function Mengenermittlung(){
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [regie, setRegie] = useState<RegieRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);

  useEffect(()=>{ listProjects().then(p=>{setProjects(p); if(p.length) setProjectId(p[0].id);}); },[]);
  useEffect(()=>{ if(!projectId) return;
    listRegie(projectId).then(setRegie as any);
    listNotes(projectId).then(setNotes as any);
  },[projectId]);

  const regieCols: Col<RegieRow>[] = [
    { key:'data', header:'Data', width:120, editable:true },
    { key:'descrizione', header:'Descrizione', width:420, editable:true },
    { key:'ore', header:'Ore', width:100, align:'right', type:'number', editable:true },
    { key:'costo', header:'Costo', width:120, align:'right', type:'number', editable:true }
  ];

  const noteCols: Col<NoteRow>[] = [
    { key:'data', header:'Data', width:120, editable:true },
    { key:'fornitore', header:'Fornitore', width:200, editable:true },
    { key:'ddt', header:'DDT', width:140, editable:true },
    { key:'materiale', header:'Materiale', width:240, editable:true },
    { key:'quantita', header:'Q.tà', width:100, align:'right', type:'number', editable:true },
    { key:'costo', header:'Costo', width:120, align:'right', type:'number', editable:true }
  ];

  return (
    <>
      <Card title="2. Mengenermittlung">
        <Row>
          <div className="muted">Progetto:</div>
          <select className="input" value={projectId} onChange={e=>setProjectId(e.target.value)}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
          </select>
          <button className="input" onClick={()=>{listRegie(projectId).then(setRegie as any); listNotes(projectId).then(setNotes as any);}}>Aggiorna</button>
        </Row>
      </Card>

      <DataSheet title="Regieberichte" columns={regieCols} rows={regie} onChange={setRegie}/>
      <DataSheet title="Lieferscheine" columns={noteCols} rows={notes} onChange={setNotes}/>
    </>
  );
}

