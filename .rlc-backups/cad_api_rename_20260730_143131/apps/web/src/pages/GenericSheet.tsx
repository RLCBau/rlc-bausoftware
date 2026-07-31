import { useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import DataSheet from "../ui/DataSheet";
import { SHEETS } from "../schemas";
import { Card, Row } from "../ui/kit";
import { exportToCsv, exportToXlsx, importFromFile } from "../utils/excel";

export default function GenericSheet(){
  const { macro, sub } = useParams();
  const key = `${macro}/${sub}`;
  const config = SHEETS[key];
  const [rows, setRows] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  if(!config) return <p className="muted">Foglio non configurato: <code>{key}</code></p>;

  const sumKeys = config.sum || [];

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if(!f) return;
    const data = await importFromFile(f);
    setRows(prev => [...prev, ...data]);
    e.target.value = '';
  }

  const totals = useMemo(() =>
    sumKeys.reduce((acc, k) => ({...acc, [k]: rows.reduce((a,r)=>a+(Number(r[k])||0),0)}), {} as Record<string, number>)
  ,[rows, sumKeys]);

  return (
    <>
      <Card title={`${config.title}`}>
        <Row>
          <input type="file" accept=".xlsx,.csv" ref={fileRef} style={{display:'none'}} onChange={onImport}/>
          <button className="input" onClick={()=>fileRef.current?.click()}>Importa</button>
          <button className="input" onClick={()=>exportToXlsx(config.title, rows)}>Export XLSX</button>
          <button className="input" onClick={()=>exportToCsv(config.title, rows)}>Export CSV</button>
          {sumKeys.length>0 && (
            <span className="muted">Totali: {sumKeys.map(k=>`${k}=${(totals[k]||0).toFixed(2)}`).join(' • ')}</span>
          )}
        </Row>
      </Card>

      <DataSheet
        title={config.title}
        columns={config.columns}
        rows={rows}
        onChange={setRows}
        sumKeys={sumKeys as any}
      />
    </>
  );
}
