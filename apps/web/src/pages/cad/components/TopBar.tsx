import React, { useRef } from "react";
import { useCadStore } from "./store";
import {
  Upload, FileDown, Pointer, Hand, Minus, Plus, Trash2, RotateCcw, RotateCw,
  PenLine, RectangleHorizontal, Route, Ruler, Frame, Layers, Save
} from "lucide-react";
import { saveAs } from "file-saver";

function TopBar() {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    setTool, zoomIn, zoomOut, exportJSON, exportSVG,
    undo, redo, deleteSelection, importAny, bringToFront, sendToBack
  } = useCadStore();

  return (
    <div className="cad-topbar">
      <div className="cad-topbar-left">
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Upload size={16}/> Import
        </button>
        <input
          ref={fileRef} type="file" style={{display:"none"}}
          accept=".svg,.dxf,.json,.SVG,.DXF,.JSON"
          onChange={async (e) => {
            const f = e.target.files?.[0]; if(!f) return;
            const buf = await f.arrayBuffer();
            const text = new TextDecoder().decode(new Uint8Array(buf));
            importAny({name:f.name, text});
            e.currentTarget.value = "";
          }}
        />
        <button className="btn" onClick={() => saveAs(new Blob([exportJSON()],{type:"application/json"}), "scene.json")}>
          <FileDown size={16}/> Export JSON
        </button>
        <button className="btn" onClick={() => saveAs(new Blob([exportSVG()],{type:"image/svg+xml"}), "scene.svg")}>
          <Save size={16}/> Export SVG
        </button>
      </div>

      <div className="cad-topbar-center">
        <button className="btn" onClick={() => setTool("select")}><Pointer size={16}/> Seleziona</button>
        <button className="btn" onClick={() => setTool("pan")}><Hand size={16}/> Pan</button>
        <div className="sep"/>
        <button className="btn" onClick={() => setTool("line")}><PenLine size={16}/> Linea</button>
        <button className="btn" onClick={() => setTool("rect")}><RectangleHorizontal size={16}/> Rettangolo</button>
        <button className="btn" onClick={() => setTool("polyline")}><Route size={16}/> Polilinea</button>
        <button className="btn" onClick={() => setTool("dim")}><Ruler size={16}/> Quota</button>
        <button className="btn" onClick={() => setTool("measure")}><Frame size={16}/> Misura</button>
        <div className="sep"/>
        <button className="btn" onClick={sendToBack}><Layers size={16}/> Back</button>
        <button className="btn" onClick={bringToFront}><Layers size={16}/> Front</button>
      </div>

      <div className="cad-topbar-right">
        <button className="btn" onClick={undo}><RotateCcw size={16}/></button>
        <button className="btn" onClick={redo}><RotateCw size={16}/></button>
        <button className="btn" onClick={zoomOut}><Minus size={16}/></button>
        <button className="btn" onClick={zoomIn}><Plus size={16}/></button>
        <button className="btn danger" onClick={deleteSelection}><Trash2 size={16}/></button>
      </div>
    </div>
  );
}

export default TopBar;

