import DataSheet, { Col } from '../ui/DataSheet';
import { Card } from '../ui/kit';

type GuideRow = { modulo:string; titolo:string; link:string; tipo:string; };
export default function Hilfe(){
  const cols: Col<GuideRow>[] = [
    { key:'modulo', header:'Modulo', width:200, editable:true },
    { key:'titolo', header:'Titolo', width:320, editable:true },
    { key:'link', header:'Link', width:360, editable:true },
    { key:'tipo', header:'Tipo', width:140, editable:true }
  ];
  return (
    <>
      <Card title="6. Info / Hilfe / Videoerklärung"><p className="muted">Materiale di supporto.</p></Card>
      <DataSheet title="Guide / Video" columns={cols} rows={[]} onChange={()=>{}}/>
    </>
  );
}
