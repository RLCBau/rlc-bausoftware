import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { SafetyDB } from "./store.sicherheit";
import { SafetyRecord, SafetyAttachment } from "./types";

const inp: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  whiteSpace: "nowrap"
};

const td: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  verticalAlign: "middle"
};

const lbl: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.8
};

export default function Sicherheit() {
  const [all, setAll] = React.useState<SafetyRecord[]>(SafetyDB.list());
  const [selId, setSelId] = React.useState<string | null>(SafetyDB.list()[0]?.id ?? null);
  const [q, setQ] = React.useState("");

  const refresh = React.useCallback(() => {
    const next = SafetyDB.list();
    setAll(next);
    setSelId((prev) => {
      if (prev && next.some((x) => x.id === prev)) return prev;
      return next[0]?.id ?? null;
    });
  }, []);

  const sel = React.useMemo(
    () => all.find((x) => x.id === selId) ?? null,
    [all, selId]
  );

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();

    return all.filter((r) => {
      const s = `${r.title} ${r.person ?? ""} ${r.project ?? ""}`.toLowerCase();
      return !qq || s.includes(qq);
    });
  }, [all, q]);

  const add = React.useCallback(() => {
    const n = SafetyDB.create();
    refresh();
    setSelId(n.id);
  }, [refresh]);

  const del = React.useCallback(() => {
    if (!sel) return;
    if (!confirm("Unterweisung löschen?")) return;
    SafetyDB.remove(sel.id);
    refresh();
  }, [sel, refresh]);

  const up = React.useCallback(
    (p: Partial<SafetyRecord>) => {
      if (!sel) return;
      const next: SafetyRecord = { ...sel, ...p, updatedAt: Date.now() };
      SafetyDB.upsert(next);
      setSelId(next.id);
      refresh();
    },
    [sel, refresh]
  );

  const onDrop = React.useCallback(
    async (ev: React.DragEvent) => {
      ev.preventDefault();
      if (!sel) return;
      const f = ev.dataTransfer.files?.[0];
      if (!f) return;
      await SafetyDB.attach(sel.id, f);
      refresh();
    },
    [sel, refresh]
  );

  const open = React.useCallback((a: SafetyAttachment) => {
    const w = window.open(a.dataURL, "_blank");
    if (!w) alert("Popup blockiert.");
  }, []);

  const exportCSV = React.useCallback(() => {
    download(
      "text/csv;charset=utf-8",
      "sicherheit.csv",
      SafetyDB.exportCSV(filtered)
    );
  }, [filtered]);

  return (
    <div className="rlc-migrated-pages-buro-sicherheit-tsx-629">
      <div
        className="card rlc-migrated-pages-buro-sicherheit-tsx-630">

        
        <button className="btn" onClick={add}>
          + Unterweisung
        </button>
        <button className="btn" onClick={del} disabled={!sel}>
          Löschen
        </button>

        <div className="rlc-migrated-pages-buro-sicherheit-tsx-631" />

        <input
          placeholder="Suche Titel / Person / Projekt…"
          value={q}
          onChange={(e) => setQ(e.target.value)} className={rlcClass(null,
          { ...inp, width: 260 })} />
        

        <button className="btn" onClick={exportCSV}>
          Export CSV
        </button>
      </div>

      <div className="rlc-migrated-pages-buro-sicherheit-tsx-632">






        
        <div className="card rlc-migrated-pages-buro-sicherheit-tsx-633">
          <table className="rlc-migrated-pages-buro-sicherheit-tsx-634">
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>Titel</th>
                <th className={rlcClass(null, th)}>Person</th>
                <th className={rlcClass(null, th)}>Projekt</th>
                <th className={rlcClass(null, th)}>Datum</th>
                <th className={rlcClass(null, th)}>Nächste Unterweisung</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const warn = daysLeft(r.nextDate) <= 30;

                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelId(r.id)} className={rlcClass(null,
                    {
                      cursor: "pointer",
                      background: sel?.id === r.id ? "#f1f5ff" : undefined
                    })}>
                    
                    <td className={rlcClass(null, td)}>
                      <b>{r.title}</b>
                    </td>
                    <td className={rlcClass(null, td)}>{r.person || "—"}</td>
                    <td className={rlcClass(null, td)}>{r.project || "—"}</td>
                    <td className={rlcClass(null, td)}>{r.date ? fmt(r.date) : "—"}</td>
                    <td className={rlcClass(null, { ...td, color: warn ? "#c03" : undefined })}>
                      {r.nextDate ? fmt(r.nextDate) : "—"}
                    </td>
                  </tr>);

              })}

              {filtered.length === 0 &&
              <tr>
                  <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={5}>
                    Keine Unterweisungen.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div
          className="card rlc-migrated-pages-buro-sicherheit-tsx-635"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}>

          
          {!sel ?
          <div className="rlc-migrated-pages-buro-sicherheit-tsx-636">Links Unterweisung wählen oder neu anlegen.</div> :

          <div className="rlc-migrated-pages-buro-sicherheit-tsx-637">





            
              <label className={rlcClass(null, lbl)}>Titel</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.title}
            onChange={(e) => up({ title: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Projekt</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.project ?? ""}
            onChange={(e) => up({ project: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Person</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.person ?? ""}
            onChange={(e) => up({ person: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Datum</label>
              <input
              type="date" className={rlcClass(null,
              inp)}
              value={toDateInput(sel.date)}
              onChange={(e) => up({ date: fromDateInput(e.target.value) })} />
            

              <label className={rlcClass(null, lbl)}>Nächste Unterweisung</label>
              <input
              type="date" className={rlcClass(null,
              inp)}
              value={toDateInput(sel.nextDate)}
              onChange={(e) => up({ nextDate: fromDateInput(e.target.value) })} />
            

              <label className={rlcClass(null, lbl)}>Bemerkung</label>
              <textarea className={rlcClass(null,
            { ...inp, minHeight: 80, resize: "vertical", gridColumn: "1 / -1" })}
            value={sel.notes ?? ""}
            onChange={(e) => up({ notes: e.target.value })} />
            

              <label className={rlcClass(null, { ...lbl, gridColumn: "1 / -1" })}>
                Dokumente / Fotos (Drag&amp;Drop)
              </label>
              <div className="rlc-migrated-pages-buro-sicherheit-tsx-638">






              
                {(sel.attachments || []).map((a) =>
              <div
                key={a.id} className="rlc-migrated-pages-buro-sicherheit-tsx-639">






                
                    <div className="rlc-migrated-pages-buro-sicherheit-tsx-640">







                  
                      <b





                    title={a.name} className="rlc-migrated-pages-buro-sicherheit-tsx-641">
                    
                        {a.name}
                      </b>
                      <div className="rlc-migrated-pages-buro-sicherheit-tsx-642" />
                      <button className="btn" onClick={() => open(a)}>
                        Öffnen
                      </button>
                    </div>

                    {(a.mime || "").startsWith("image/") &&
                <img
                  src={a.dataURL}
                  alt={a.name} className="rlc-migrated-pages-buro-sicherheit-tsx-643" />


                }
                  </div>
              )}

                {(sel.attachments || []).length === 0 &&
              <div className="rlc-migrated-pages-buro-sicherheit-tsx-644">Keine Anhänge.</div>
              }
              </div>
            </div>
          }
        </div>
      </div>
    </div>);

}

function fmt(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

function daysLeft(iso?: string) {
  if (!iso) return Infinity;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function toDateInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fromDateInput(v: string) {
  if (!v) return "";
  return `${v}T12:00:00.000Z`;
}

function download(type: string, name: string, data: string) {
  const b = new Blob([data], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
