import DataSheet, { Col } from '../ui/DataSheet';
import { Card } from '../ui/kit';

type LayerRow = { layer:string; descrizione:string; colore:string; spessore:number; visibile:string; };
type AsBuiltRow = { id?:string; elemento:string; coordinata:string; quota:number; note?:string; };

export default function CAD(){
  const layerCols: Col<LayerRow>[] = [
    { key:'layer', header:'Layer', width:160, editable:true },
    { key:'descrizione', header:'Descrizione', width:320, editable:true },
    { key:'colore', header:'Colore', width:120, editable:true },
    { key:'spessore', header:'Spessore', width:120, align:'right', type:'number', editable:true },
    { key:'visibile', header:'Visibile', width:120, editable:true },
  ];
  const asBuiltCols: Col<AsBuiltRow>[] = [
    { key:'elemento', header:'Elemento', width:240, editable:true },
    { key:'coordinata', header:'Coordinate', width:220, editable:true },
    { key:'quota', header:'Quota', width:120, align:'right', type:'number', editable:true },
    { key:'note', header:'Note', width:260, editable:true },
  ];
  return (
    <>
      <Card title="3. CAD"><p className="muted">Strumenti CAD con esportazioni/import.</p></Card>
      <DataSheet title="Layer / Struttura IFC" columns={layerCols} rows={[]} onChange={()=>{}}/>
      <DataSheet title="As-Built (rilievo)" columns={asBuiltCols} rows={[]} onChange={()=>{}}/>
    </>
  );
}

