import React, { useEffect, useMemo, useRef, useState } from "react";
import { Projects, type Project } from "./projectStore";
import { setCurrentProjectId } from "../../utils/project";
import { useNavigate } from "react-router-dom";

export default function ProjektPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Project[]>([]);
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setRows(Projects.list()); }, []);

  /** Converte un Project in un projectId numerico stabile (se manca dbId/projectId) */
  function asNumericProjectId(p: Project): number {
    const raw = (p as any).dbId ?? (p as any).projectId;
    if (raw !== undefined && !isNaN(Number(raw))) return Number(raw);
    const basis = String((p as any).id ?? (p as any).number ?? (p as any).name ?? "project");
    let h = 0;
    for (let i = 0; i < basis.length; i++) h = (((h << 5) - h) + basis.charCodeAt(i)) | 0;
    const pid = Math.abs(h % 9000000) + 1000000; // 7 cifre, deterministico
    return pid;
  }

  /** Apri Angebotsanalyse passando sempre ?projectId=NUM e salvandolo */
  function openAngebotsanalyse(p: Project) {
    const pid = asNumericProjectId(p);
    setCurrentProjectId(pid);
    navigate(`/kalkulation/versionsvergleich?projectId=${pid}`);
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(p =>
      (p.name||"").toLowerCase().includes(s) ||
      (p.number||"").toLowerCase().includes(s) ||
      (p.client||"").toLowerCase().includes(s) ||
      (p.location||"").toLowerCase().includes(s)
    );
  }, [rows, q]);

  const create = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const number = String(fd.get("number") || "").trim();
    const name = String(fd.get("name") || "").trim();

    if (!/^[A-Z0-9\-_.]+$/i.test(number)) { alert("BaustellenNummer: nur A-Z, 0-9, - _ ."); return; }
    if (name.length < 3) { alert("Projektname zu kurz."); return; }

    const item = Projects.upsert({
      number,
      name,
      client: String(fd.get("client") || "").trim(),
      location: String(fd.get("location") || "").trim(),
    });

    setRows(Projects.list());
    Projects.setCurrent(item.id);
    setCurrentProjectId(asNumericProjectId(item)); // salva subito il numeric id
    (e.currentTarget as HTMLFormElement).reset();
  };

  const del = (id: string) => {
    if (!confirm("Projekt wirklich löschen?")) return;
    Projects.remove(id);
    setRows(Projects.list());
  };

  const exportJSON = () => {
    const blob = new Blob([Projects.exportJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "rlc_projects.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = (text: string) => { Projects.importJSON(text); setRows(Projects.list()); };

  const cur = Projects.getCurrent?.();

  return (
    <div style={{ padding: 16, display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: 16 }}>
      {/* LISTA */}
      <section style={card()}>
        <header style={cardHead()}>
          <h2 style={{ margin: 0 }}>Projekt auswählen</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              placeholder="Suche: Name / BaustellenNr / Kunde / Ort"
              value={q}
              onChange={(e)=>setQ(e.target.value)}
              style={searchInput()}
            />
            <button onClick={exportJSON}>Export</button>
            <input
              ref={fileRef} type="file" accept="application/json" style={{ display: "none" }}
              onChange={(e)=>{
                const f=e.target.files?.[0]; if(!f) return;
                const r=new FileReader(); r.onload=()=>importJSON(String(r.result||"")); r.readAsText(f,"utf-8");
              }}
            />
            <button onClick={()=>fileRef.current?.click()}>Import</button>
          </div>
        </header>

        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14 }}>
            <thead>
              <tr>
                {["BaustellenNr","Projektname","Kunde","Ort","Erstellt am","Aktionen"].map((h,i)=>
                  <th key={i} style={th}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p=>(
                <tr key={p.id}>
                  <td style={td}>{p.number}</td>
                  <td style={td}>{p.name}</td>
                  <td style={td}>{p.client||"–"}</td>
                  <td style={td}>{p.location||"–"}</td>
                  <td style={td}>{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td style={tdRight}>
                    <button onClick={()=>navigate("/kalkulation/manuell")}>Öffnen (Manuell)</button>{" "}
                    <button onClick={()=>navigate("/kalkulation/mit-ki")}>Öffnen (KI)</button>{" "}
                    <button onClick={()=>openAngebotsanalyse(p)}>Angebotsanalyse</button>{" "}
                    <button onClick={()=>del(p.id)}>Löschen</button>
                  </td>
                </tr>
              ))}
              {filtered.length===0 && (
                <tr><td colSpan={6} style={{ padding:12, color:"#666" }}>Keine Projekte gefunden.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* CREAZIONE */}
      <aside style={card()}>
        <header style={cardHead()}><h2 style={{ margin: 0 }}>Projekt erstellen</h2></header>

        <form onSubmit={create} style={{ display:"grid", gap:10 }}>
          <div style={field()}>
            <label style={label()}>BaustellenNummer*</label>
            <input name="number" required placeholder="BA-2025-001" pattern="[A-Za-z0-9_.-]+"
                   title="Nur Buchstaben, Ziffern, -, _, ." />
            <small style={hint()}>z. B. Bauabschnitt/Angebotsnr. – eindeutig</small>
          </div>

          <div style={field()}>
            <label style={label()}>Projektname*</label>
            <input name="name" required placeholder="Erneuerung TWL BA III/IV" />
            <small style={hint()}>Kurze, eindeutige Bezeichnung des Projekts</small>
          </div>

          <div style={field()}>
            <label style={label()}>Auftraggeber</label>
            <input name="client" placeholder="Gemeinde X / Musterbau GmbH" />
          </div>

          <div style={field()}>
            <label style={label()}>Ort</label>
            <input name="location" placeholder="Bischofswiesen" />
          </div>

          <div style={{ display:"flex", gap:8, marginTop:6 }}>
            <button type="submit" style={{ fontWeight:600 }}>Projekt anlegen</button>
            <button type="button" onClick={()=>{
              const n = `BA-${new Date().getFullYear()}-${String(Math.floor(Math.random()*900)+100)}`;
              (document.querySelector('input[name="number"]') as HTMLInputElement).value = n;
            }}>Nummer vorschlagen</button>
          </div>
        </form>

        {/* Aktuelles Projekt */}
        <div style={{ marginTop:16, padding:12, border:"1px solid #eee", borderRadius:8, background:"#fafafa" }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>Aktuelles Projekt</div>
          <div style={{ marginBottom:8 }}>
            {cur ? `${cur.number} — ${cur.name}` : "Keines ausgewählt."}
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>{ if (cur) navigate("/kalkulation/manuell"); }} disabled={!cur}>
              In Manuell öffnen
            </button>
            <button onClick={()=>{ if (cur) navigate("/kalkulation/mit-ki"); }} disabled={!cur}>
              In KI öffnen
            </button>
            <button onClick={()=>{ if (cur) openAngebotsanalyse(cur as any); }} disabled={!cur}>
              Angebotsanalyse
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ——— Styles ——— */
const card = (): React.CSSProperties => ({ border:"1px solid #e6e6e6", borderRadius:10, background:"#fff" });
const cardHead = (): React.CSSProperties => ({ padding:"12px 14px", borderBottom:"1px solid #eee", background:"#fcfcfc" });
const th: React.CSSProperties = { textAlign:"left", padding:"10px 8px", borderBottom:"1px solid #eee", background:"#fafafa", fontWeight:600, whiteSpace:"nowrap" };
const td: React.CSSProperties = { padding:"8px", borderBottom:"1px solid #f5f5f5" };
const tdRight: React.CSSProperties = { ...td, textAlign:"right", whiteSpace:"nowrap" };
const field = (): React.CSSProperties => ({ display:"grid", gap:6 });
const label = (): React.CSSProperties => ({ fontSize:12, color:"#333", fontWeight:600 });
const hint = (): React.CSSProperties => ({ fontSize:11, color:"#777" });
const searchInput = (): React.CSSProperties => ({ padding:"6px 10px", minWidth:320, border:"1px solid #ddd", borderRadius:6 });
