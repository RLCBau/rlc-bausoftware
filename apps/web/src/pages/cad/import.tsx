import React, { useState } from "react";
import { CadDoc, Entity } from "../../lib/cad/types";
import { loadDoc, saveDoc } from "../../lib/cad/store";

const shell = { maxWidth: 900, margin:"0 auto", padding:"12px 16px 40px", fontFamily:"Inter, system-ui, Arial", color:"#0f172a" } as const;
const btn = { padding:"6px 10px", border:"1px solid #cbd5e1", background:"#fff", borderRadius:6, fontSize:13, cursor:"pointer" } as const;

export default function CADImport() {
  const [log, setLog] = useState("");

  const importJSON = (f: File) => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const next = JSON.parse(String(rd.result)) as CadDoc;
        if (!next.layers || !next.entities) throw new Error("Ungültiges CAD JSON");
        saveDoc(next);
        setLog(`Import OK: ${next.name}, Entities: ${next.entities.length}, Layers: ${next.layers.length}`);
      } catch (e: any) {
        setLog("Fehler: " + e.message);
      }
    };
    rd.readAsText(f, "utf-8");
  };

  const importCSVPoints = (f: File) => {
    const rd = new FileReader();
    rd.onload = () => {
      const text = String(rd.result || "");
      // Format: x;y (metri)
      const lines = text.split(/\r?\n/).filter(Boolean);
      const doc = loadDoc();
      const layerId = doc.layers[0].id;
      const ents: Entity[] = lines.map((ln, i) => {
        const [xs, ys] = ln.split(";"); const x = Number(xs), y = Number(ys);
        return { id: `pt-${i}`, type: "point", layerId, p: { x, y } } as Entity;
      });
      doc.entities.push(...ents);
      saveDoc(doc);
      setLog(`Import Punkte OK: ${ents.length}`);
    };
    rd.readAsText(f, "utf-8");
  };

  return (
    <div style={shell}>
      <h2 style={{ margin:"4px 0 12px", fontSize:20, fontWeight:700 }}>Import</h2>
      <p style={{ color:"#64748b" }}>Unterstützt: <b>RLC CAD JSON</b>, <b>CSV Punkte</b> (x;y). DXF/DWG Parser folgt.</p>
      <div style={{ display:"flex", gap:8 }}>
        <label style={btn}>Import JSON
          <input type="file" accept="application/json" onChange={e=>{const f=e.target.files?.[0]; if(f) importJSON(f); e.currentTarget.value="";}} style={{display:"none"}}/>
        </label>
        <label style={btn}>Import CSV Punkte
          <input type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0]; if(f) importCSVPoints(f); e.currentTarget.value="";}} style={{display:"none"}}/>
        </label>
      </div>
      <pre style={{ marginTop:12, padding:10, border:"1px solid #e2e8f0", borderRadius:8, background:"#fafafa", fontSize:12 }}>{log}</pre>
    </div>
  );
}
