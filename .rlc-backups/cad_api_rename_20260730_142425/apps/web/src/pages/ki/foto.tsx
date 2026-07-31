import React, { useState } from "react";

const shell={maxWidth:800,margin:"0 auto",padding:"12px 16px",fontFamily:"Inter,system-ui,Arial"} as const;
const input={margin:"8px 0"} as const;

export default function Foto() {
  const [result,setResult]=useState<string[]>([]);

  const handleFile=(e:React.ChangeEvent<HTMLInputElement>)=>{
    if (!e.target.files?.length) return;
    setResult(["Gefundene Objekte: Rohr DN 100","Bogen 45°","Graben 1,2 m tief"]);
  };

  return (
    <div style={shell}>
      <h2>Fotoerkennung</h2>
      <input type="file" style={input} onChange={handleFile}/>
      <ul>{result.map((r,i)=><li key={i}>{r}</li>)}</ul>
    </div>
  );
}
