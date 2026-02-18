import React from "react";
import { useCadStore } from "./store";

function RightPanel() {
  const {
    layers, addLayer, setActiveLayer, activeLayerId, renameLayer, toggleLayerVisible,
    selection, setStroke, setStrokeWidth, setFill, activeLayerName
  } = useCadStore();

  return (
    <div className="cad-right">
      <div className="panel-title">Layer</div>
      <div className="layers">
        {layers.map(l=>(
          <div key={l.id} className={`layer ${activeLayerId===l.id?"active":""}`}>
            <input value={l.name} onChange={e=>renameLayer(l.id, e.target.value)} />
            <label className="row">
              <input type="checkbox" checked={l.visible} onChange={()=>toggleLayerVisible(l.id)} /> vis.
            </label>
            <button className="btn xs" onClick={()=>setActiveLayer(l.id)}>attiva</button>
          </div>
        ))}
      </div>
      <button className="btn full" onClick={addLayer}>+ Nuovo layer</button>

      <div className="panel-title mt">Proprietà</div>
      {selection ? (
        <div className="props">
          <label className="row">Colore linea <input type="color" onChange={e=>setStroke(e.target.value)} /></label>
          <label className="row">Spessore <input type="number" min={0} step={0.5} onChange={e=>setStrokeWidth(parseFloat(e.target.value)||1)} /></label>
          <label className="row">Riempimento <input type="color" onChange={e=>setFill(e.target.value)} /></label>
        </div>
      ) : <div className="hint">Layer attivo: {activeLayerName}. Nessuna selezione.</div>}
    </div>
  );
}

export default RightPanel;
