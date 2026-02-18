import React from "react";
import { useCadStore } from "./store";

function LeftPanel() {
  const {
    currentTool, grid, setGrid, snap, setSnap, osnap, toggleOsnap,
    ortho, toggleOrtho, polar, togglePolar, addBlockSymbol
  } = useCadStore();

  return (
    <div className="cad-left">
      <div className="panel-title">Werkzeuge</div>
      {["select","pan","line","rect","polyline","dim","measure"].map(t => (
        <div key={t} className={`tool ${currentTool===t?"active":""}`}>{t}</div>
      ))}

      <div className="panel-title mt">Impostazioni</div>
      <label className="row"><input type="checkbox" checked={grid} onChange={e=>setGrid(e.target.checked)}/> Griglia</label>
      <label className="row"><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/> Snap griglia</label>
      <label className="row"><input type="checkbox" checked={ortho} onChange={toggleOrtho}/> Ortho (F8)</label>
      <label className="row"><input type="checkbox" checked={polar} onChange={togglePolar}/> Polar (F10)</label>

      <div className="panel-title mt">OSNAP</div>
      {(["endpoint","midpoint"] as const).map(k=>(
        <label key={k} className="row">
          <input type="checkbox" checked={osnap[k]} onChange={()=>toggleOsnap(k)} /> {k}
        </label>
      ))}

      <div className="panel-title mt">Blocchi</div>
      <button className="btn full" onClick={()=>addBlockSymbol()}>Inserisci SVG come blocco…</button>

      <div className="hint">ESC chiude polilinea/quote. CTRL+Z / CTRL+Y Undo/Redo.</div>
    </div>
  );
}

export default LeftPanel;
