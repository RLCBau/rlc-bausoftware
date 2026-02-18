import DataSheet, { Col } from '../ui/DataSheet';
import { Card } from '../ui/kit';

type InvoiceRow = { numero:string; data:string; cliente:string; imponibile:number; iva:number; totale:number; stato:string; };
type KPI = { kpi:string; valore:number; note?:string; };

export default function Buchhaltung(){
  const invCols: Col<InvoiceRow>[] = [
    { key:'numero', header:'Nr.', width:120, editable:true },
    { key:'data', header:'Data', width:120, editable:true },
    { key:'cliente', header:'Cliente', width:260, editable:true },
    { key:'imponibile', header:'Imponibile', width:120, align:'right', type:'number', editable:true },
    { key:'iva', header:'IVA', width:100, align:'right', type:'number', editable:true },
    { key:'totale', header:'Totale', width:120, align:'right', type:'number', editable:true },
    { key:'stato', header:'Stato', width:140, editable:true },
  ];
  const kpiCols: Col<KPI>[] = [
    { key:'kpi', header:'KPI', width:260, editable:true },
    { key:'valore', header:'Valore', width:120, align:'right', type:'number', editable:true },
    { key:'note', header:'Note', width:320, editable:true },
  ];
  return (
    <>
      <Card title="7. Buchhaltung"><p className="muted">Fatture, partite, export e KPI.</p></Card>
      <DataSheet title="Fatture / Abschläge" columns={invCols} rows={[]} onChange={()=>{}} sumKeys={['imponibile','iva','totale']}/>
      <DataSheet title="KPI Dashboard" columns={kpiCols} rows={[]} onChange={()=>{}}/>
    </>
  );
}

