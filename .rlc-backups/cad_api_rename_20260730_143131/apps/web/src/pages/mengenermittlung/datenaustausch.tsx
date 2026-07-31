import React, { useState } from "react";
import { loadAufmass, saveAufmass } from "../../lib/storage";
import { AufmassDokument, AufmassZeile } from "../../lib/types";

const shell: React.CSSProperties = { maxWidth: 900, margin:"0 auto", padding:"12px 16px 40px",
  fontFamily:"Inter, system-ui, Arial, Helvetica, sans-serif", color:"#0f172a" };
const btn: React.CSSProperties = { padding:"6px 10px", border:"1px solid #cbd5e1", background:"#fff", borderRadius:6, fontSize:13, cursor:"pointer" };
const input: React.CSSProperties = { width: 260, border:"1px solid #cbd5e1", borderRadius:6, padding:"6px 8px", marginRight:8 };
const area: React.CSSProperties = { width:"100%", height:280, border:"1px solid #e2e8f0", borderRadius:8, padding:10, fontSize:12, whiteSpace:"pre-wrap" };

export default function Datenaustausch() {
  const [projekt, setProjekt] = useState("PROJ-001");
  const [log, setLog] = useState("");

  const exportJSON = () => {
    const doc = loadAufmass(projekt);
    if (!doc) { setLog("Kein Aufmaß gefunden."); return; }
    const blob = new Blob([JSON.stringify(doc,null,2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `Aufmass_${projekt}.json`; a.click(); URL.revokeObjectURL(a.href);
  };

  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const doc = JSON.parse(r.result as string) as AufmassDokument;
        if (!doc || !doc.zeilen) throw new Error("Ungültiges Format");
        saveAufmass(doc); setLog(`Import OK – Projekt: ${doc.projektId}, Pos: ${doc.zeilen.length}`);
      } catch (err:any) {
        setLog("Fehler: " + err.message);
      }
    };
    r.readAsText(f, "utf-8");
    e.currentTarget.value = "";
  };

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const text = String(r.result || "");
      const lines = text.split(/\r?\n/).filter(Boolean);
      // Erwartet Kopf: PosNr;Kurztext;ME;EP;Formel
      const rows = lines.slice(1).map(l => l.split(";").map(s=>s.replace(/^"|"$/g,"")));
      const zeilen: AufmassZeile[] = rows.map((c,i)=>({
        id: `csv-${i}`, posNr: c[0]||"", kurztext: c[1]||"", einheit: c[2]||"m", ep: parseFloat(c[3]||"0"),
        variablen: {}, formel: c[4]||"=N", menge:0, betrag:0
      }));
      const doc: AufmassDokument = { projektId: projekt, titel:`Import aus CSV`, zeilen, nettoSumme:0, stand:new Date().toISOString() };
      saveAufmass(doc); setLog(`CSV importiert – ${zeilen.length} Positionen`);
    };
    r.readAsText(f, "utf-8");
    e.currentTarget.value = "";
  };

  return (
    <div style={shell}>
      <h2 style={{ margin:"4px 0 12px", fontSize:20, fontWeight:700 }}>Datenaustausch</h2>
      <div style={{ marginBottom:10 }}>
        <input value={projekt} onChange={(e)=>setProjekt(e.target.value)} style={input} />
        <button style={btn} onClick={exportJSON}>Export JSON</button>{" "}
        <label style={btn}>Import JSON<input type="file" accept="application/json" onChange={importJSON} style={{display:"none"}}/></label>{" "}
        <label style={btn}>Import CSV<input type="file" accept=".csv,text/csv" onChange={importCSV} style={{display:"none"}}/></label>
      </div>
      <div style={area as any}>{log}</div>
    </div>
  );
}
