import DataSheet, { Col } from '../ui/DataSheet';
import { Card } from '../ui/kit';

type SuggestRow = { voce:string; conf:number; prezzoSug:number; fonte:string; note?:string; };
export default function KI(){
  const cols: Col<SuggestRow>[] = [
    { key:'voce', header:'Voce / Prompt', width:360, editable:true },
    { key:'conf', header:'Conf.', width:100, align:'right', type:'number', editable:true },
    { key:'prezzoSug', header:'Prezzo Sug.', width:140, align:'right', type:'number', editable:true },
    { key:'fonte', header:'Fonte', width:200, editable:true },
    { key:'note', header:'Note', width:240, editable:true },
  ];
  return (
    <>
      <Card title="5. KI"><p className="muted">Suggerimenti e automazioni (dataset reale quando disponibile).</p></Card>
      <DataSheet title="Suggerimenti LV (AI)" columns={cols} rows={[]} onChange={()=>{}}/>
    </>
  );
}

