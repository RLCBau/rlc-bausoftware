import React from "react";
import { UserDB } from "./store.users";
import { RlcUser } from "./types";

const th={textAlign:"left",padding:"8px 10px",borderBottom:"1px solid var(--line)",fontSize:13,whiteSpace:"nowrap"};
const td={padding:"6px 10px",borderBottom:"1px solid var(--line)",fontSize:13,verticalAlign:"middle"};
const inp={border:"1px solid var(--line)",borderRadius:6,padding:"6px 8px",fontSize:13};
const lbl={fontSize:12,opacity:.8};

export default function Nutzerverwaltung(){
  const [all,setAll]=React.useState<RlcUser[]>(UserDB.list());
  const [sel,setSel]=React.useState<RlcUser|null>(null);
  const refresh=()=>setAll(UserDB.list());
  const newUser=()=>{const u=UserDB.create();refresh();setSel(u);};
  const del=()=>{if(!sel)return;if(!confirm("Benutzer löschen?"))return;UserDB.remove(sel.id);refresh();setSel(null);};
  const update=(p:Partial<RlcUser>)=>{if(!sel)return;UserDB.upsert({...sel,...p});refresh();};

  return(
    <div style={{display:"grid",gridTemplateRows:"auto 1fr",gap:10,padding:10}}>
      <div className="card" style={{padding:"8px 10px",display:"flex",gap:8,alignItems:"center"}}>
        <button className="btn" onClick={newUser}>+ Neuer Benutzer</button>
        <button className="btn" onClick={del} disabled={!sel}>Löschen</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr min(40vw,600px)",gap:10}}>
        <div className="card" style={{padding:0,overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>
              <th style={th}>Name</th><th style={th}>Rolle</th><th style={th}>E-Mail</th><th style={th}>Aktiv</th>
            </tr></thead>
            <tbody>
              {all.map(u=>(
                <tr key={u.id} onClick={()=>setSel(u)} style={{cursor:"pointer",background:sel?.id===u.id?"#f1f5ff":undefined}}>
                  <td style={td}>{u.name}</td>
                  <td style={td}>{u.role}</td>
                  <td style={td}>{u.email}</td>
                  <td style={td}>{u.active?"✔️":"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{padding:12}}>
          {!sel?(<div style={{opacity:.7}}>Links Benutzer auswählen oder neu anlegen.</div>):(
          <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:10}}>
            <label style={lbl}>Name</label>
            <input style={inp} value={sel.name} onChange={e=>update({name:e.target.value})}/>
            <label style={lbl}>E-Mail</label>
            <input style={inp} value={sel.email} onChange={e=>update({email:e.target.value})}/>
            <label style={lbl}>Rolle</label>
            <select style={inp} value={sel.role} onChange={e=>update({role:e.target.value as any})}>
              <option>Admin</option><option>Bauleiter</option><option>Polier</option>
              <option>Mitarbeiter</option><option>Leser</option>
            </select>
            <label style={lbl}>Aktiv</label>
            <input type="checkbox" checked={sel.active} onChange={e=>update({active:e.target.checked})}/>
            <label style={lbl}>Berechtigungen</label>
            <textarea style={{...inp,gridColumn:"1 / -1",minHeight:80}}
              value={(sel.rights??[]).join(", ")}
              onChange={e=>update({rights:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})}/>
          </div>)}
        </div>
      </div>
    </div>
  );
}
