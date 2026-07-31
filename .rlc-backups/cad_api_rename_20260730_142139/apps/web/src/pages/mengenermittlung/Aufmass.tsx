import React from "react";
import { AUFMASS } from "./AufmassEditor"; // ⬅️ se serve, aggiorna il path

type InboxItem = {
  id: string;
  ts: number;
  layer: string;
  area: number;   // m²
  source: string; // "CAD"
  file: string;   // nome DXF
};

const card: React.CSSProperties = { background:"#fff", border:"1px solid var(--line)", borderRadius:8, padding:12 };

function useAufmassInbox() {
  const [items, setItems] = React.useState<InboxItem[]>([]);
  const reload = React.useCallback(() => {
    try {
      const list = JSON.parse(localStorage.getItem("AUFMASS_INBOX") || "[]");
      setItems(Array.isArray(list) ? list : []);
    } catch { setItems([]); }
  }, []);
  React.useEffect(() => { reload(); }, [reload]);
  const remove = (id: string) => {
    const rest = items.filter(x => x.id !== id);
    localStorage.setItem("AUFMASS_INBOX", JSON.stringify(rest));
    setItems(rest);
  };
  return { items, reload, remove };
}

export default function AufmassPage() {
  const [tab, setTab] = React.useState<"inbox"|"liste">("inbox");
  const { items, remove, reload } = useAufmassInbox();

  function importItem(it: InboxItem) {
    // inserisci nello store reale
    AUFMASS.add({
      id: crypto.randomUUID(),
      datum: new Date(it.ts).toISOString().slice(0,10),
      quelle: it.source,
      datei: it.file,
      layer: it.layer,
      menge: it.area,
      einheit: "m²",
      bemerkung: `Import CAD (${it.layer})`,
    });
    remove(it.id);
    alert(`Importato ${it.area.toFixed(2)} m² da ${it.file}`);
  }

  const list = AUFMASS.list ? AUFMASS.list() : []; // se il tuo store espone list()

  return (
    <div style={{ display:"grid", gridTemplateRows:"auto 1fr", gap:12, padding:12 }}>
      {/* Tabs */}
      <div className="card" style={{ ...card, display:"flex", gap:8, alignItems:"center" }}>
        <button className="btn" onClick={()=>setTab("inbox")} style={{ fontWeight: tab==="inbox"?700:500 }}>
          📥 CAD → Aufmaß Inbox
        </button>
        <button className="btn" onClick={()=>setTab("liste")} style={{ fontWeight: tab==="liste"?700:500 }}>
          📋 Aufmaß-Liste
        </button>
        <div style={{ flex:1 }} />
        {tab==="inbox" && <button className="btn" onClick={reload}>Aggiorna</button>}
      </div>

      {/* Content */}
      <div className="card" style={{ ...card }}>
        {tab==="inbox" ? (
          <InboxTable items={items} onImport={importItem} />
        ) : (
          <AufmassList items={list} />
        )}
      </div>
    </div>
  );
}

function InboxTable({ items, onImport }: { items: InboxItem[]; onImport:(it:InboxItem)=>void }) {
  if (!items.length) return <div style={{ opacity:.6 }}>Nessuna area in inbox. Vai in CAD → invia a Aufmaß.</div>;
  return (
    <table style={{ width:"100%", borderCollapse:"collapse" }}>
      <thead>
        <tr style={{ background:"#f5f6f8" }}>
          <th style={th}>Data/Ora</th>
          <th style={th}>Layer</th>
          <th style={th}>Area (m²)</th>
          <th style={th}>File</th>
          <th style={th}></th>
        </tr>
      </thead>
      <tbody>
        {items.map(it => (
          <tr key={it.id}>
            <td style={td}>{new Date(it.ts).toLocaleString()}</td>
            <td style={td}>{it.layer}</td>
            <td style={td}>{it.area.toFixed(2)}</td>
            <td style={td}>{it.file}</td>
            <td style={{ ...td, textAlign:"right" }}>
              <button className="btn" onClick={()=>onImport(it)}>Importa</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AufmassList({ items }: { items: any[] }) {
  if (!items?.length) return <div style={{ opacity:.6 }}>Nessuna voce Aufmaß.</div>;
  return (
    <table style={{ width:"100%", borderCollapse:"collapse" }}>
      <thead>
        <tr style={{ background:"#f5f6f8" }}>
          <th style={th}>Datum</th>
          <th style={th}>Quelle</th>
          <th style={th}>Datei/Layer</th>
          <th style={th}>Menge</th>
          <th style={th}>Einheit</th>
          <th style={th}>Bemerkung</th>
        </tr>
      </thead>
      <tbody>
        {items.map((r:any)=> (
          <tr key={r.id}>
            <td style={td}>{r.datum}</td>
            <td style={td}>{r.quelle}</td>
            <td style={td}>{r.datei} · {r.layer}</td>
            <td style={td}>{Number(r.menge ?? 0).toFixed(2)}</td>
            <td style={td}>{r.einheit}</td>
            <td style={td}>{r.bemerkung ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* styles tabella */
const th: React.CSSProperties = { textAlign:"left", padding:"8px 10px", borderBottom:"1px solid var(--line)", fontSize:13, whiteSpace:"nowrap" };
const td: React.CSSProperties = { padding:"6px 10px", borderBottom:"1px solid var(--line)", fontSize:13, verticalAlign:"middle" };
