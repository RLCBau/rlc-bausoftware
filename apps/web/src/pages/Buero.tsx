import DataSheet, { Col } from '../ui/DataSheet';
import { Card } from '../ui/kit';

type DocRow = { numero:string; titolo:string; versione:string; stato:string; link?:string; };
type TaskRow = { data:string; assegnato:string; descrizione:string; stato:string; };

export default function Buero(){
  const docCols: Col<DocRow>[] = [
    { key:'numero', header:'Nr.', width:120, editable:true },
    { key:'titolo', header:'Titolo', width:320, editable:true },
    { key:'versione', header:'Ver.', width:80, editable:true },
    { key:'stato', header:'Stato', width:140, editable:true },
    { key:'link', header:'Link', width:240, editable:true },
  ];
  const taskCols: Col<TaskRow>[] = [
    { key:'data', header:'Data', width:120, editable:true },
    { key:'assegnato', header:'Assegnato a', width:220, editable:true },
    { key:'descrizione', header:'Descrizione', width:420, editable:true },
    { key:'stato', header:'Stato', width:140, editable:true },
  ];
  return (
    <>
      <Card title="4. Büro / Verwaltung"><p className="muted">Documenti, note, persone.</p></Card>
      <DataSheet title="Documenti (versioning)" columns={docCols} rows={[]} onChange={()=>{}}/>
      <DataSheet title="Attività / Note" columns={taskCols} rows={[]} onChange={()=>{}}/>
    </>
  );
}

