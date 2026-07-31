import React, { useState } from "react";
const shell={maxWidth:700,margin:"0 auto",padding:"12px 16px 40px",fontFamily:"Inter,system-ui,Arial"} as const;
const input={width:"100%",border:"1px solid #cbd5e1",borderRadius:6,padding:"8px"} as const;
const btn={padding:"8px 12px",border:"1px solid #cbd5e1",background:"#fff",borderRadius:6,marginTop:8,cursor:"pointer"} as const;

export default function Support() {
  const [name,setName]=useState(localStorage.getItem("rlc.info.support.name")||"");
  const [email,setEmail]=useState(localStorage.getItem("rlc.info.support.email")||"");
  const [text,setText]=useState("");
  const [ok,setOk]=useState("");

  const send=()=>{
    const ticket={ id: Math.random().toString(36).slice(2,10), name, email, text, ts:new Date().toISOString() };
    const arr=JSON.parse(localStorage.getItem("rlc.info.support.tickets")||"[]"); arr.push(ticket);
    localStorage.setItem("rlc.info.support.tickets", JSON.stringify(arr));
    localStorage.setItem("rlc.info.support.name", name);
    localStorage.setItem("rlc.info.support.email", email);
    setOk("Feedback gespeichert (lokal).");
    setText("");
  };

  return (
    <div style={shell}>
      <h2>Support / Feedback</h2>
      <div style={{margin:"8px 0"}}>Wir antworten per E-Mail (Demo lokal).</div>
      <input style={input} placeholder="Name" value={name} onChange={e=>setName(e.target.value)}/>
      <div style={{height:8}}/>
      <input style={input} placeholder="E-Mail" value={email} onChange={e=>setEmail(e.target.value)}/>
      <div style={{height:8}}/>
      <textarea style={{...input,height:160}} placeholder="Beschreibe dein Anliegen…" value={text} onChange={e=>setText(e.target.value)}/>
      <button style={btn} onClick={send}>Senden</button>
      <div style={{marginTop:8,color:"#16a34a"}}>{ok}</div>
    </div>
  );
}
