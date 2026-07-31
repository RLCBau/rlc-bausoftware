import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { MachinesDB } from "./store.machines";
import { Machine, MaintRecord, MachAttachment } from "./types";

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

const inp: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13
};

const lbl: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.8
};

export default function Maschinenverwaltung() {
  const [all, setAll] = React.useState<Machine[]>(MachinesDB.list());
  const [selId, setSelId] = React.useState<string | null>(MachinesDB.list()[0]?.id ?? null);
  const [q, setQ] = React.useState("");
  const [proj, setProj] = React.useState("");
  const [onlyDue, setOnlyDue] = React.useState(false);

  const refresh = React.useCallback(() => {
    const next = MachinesDB.list();
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

    return all.filter((m) => {
      const s = `${m.name} ${m.type ?? ""} ${m.serial ?? ""} ${m.projectId ?? ""}`.toLowerCase();
      const okQ = !qq || s.includes(qq);
      const okP = !proj || (m.projectId ?? "") === proj;
      const due = isDue(m);
      const okD = !onlyDue || due;
      return okQ && okP && okD;
    });
  }, [all, q, proj, onlyDue]);

  const projects = React.useMemo(
    () => Array.from(new Set(all.map((m) => m.projectId).filter(Boolean))) as string[],
    [all]
  );

  const add = React.useCallback(() => {
    const m = MachinesDB.create();
    refresh();
    setSelId(m.id);
  }, [refresh]);

  const del = React.useCallback(() => {
    if (!sel) return;
    if (!confirm("Maschine löschen?")) return;
    MachinesDB.remove(sel.id);
    refresh();
  }, [sel, refresh]);

  const up = React.useCallback(
    (p: Partial<Machine>) => {
      if (!sel) return;
      const next: Machine = { ...sel, ...p, updatedAt: Date.now() };
      MachinesDB.upsert(next);
      setSelId(next.id);
      refresh();
    },
    [sel, refresh]
  );

  const addMaint = React.useCallback(() => {
    if (!sel) return;
    const r: MaintRecord = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      hours: sel.hours || 0,
      notes: ""
    };
    up({ maintenance: [r, ...(sel.maintenance || [])] });
  }, [sel, up]);

  const delMaint = React.useCallback(
    (id: string) => {
      if (!sel) return;
      up({ maintenance: (sel.maintenance || []).filter((x) => x.id !== id) });
    },
    [sel, up]
  );

  const onDrop = React.useCallback(
    async (ev: React.DragEvent) => {
      ev.preventDefault();
      if (!sel) return;
      const f = ev.dataTransfer.files?.[0];
      if (!f) return;
      await MachinesDB.attach(sel.id, f);
      refresh();
    },
    [sel, refresh]
  );

  const open = React.useCallback((a: MachAttachment) => {
    const w = window.open(a.dataURL, "_blank");
    if (!w) alert("Popup blockiert.");
  }, []);

  const importCSV = React.useCallback(() => {
    pickFile(async (f) => {
      const n = MachinesDB.importCSV(await f.text());
      alert(`Import: ${n} Maschinen.`);
      refresh();
    });
  }, [refresh]);

  const exportCSV = React.useCallback(() => {
    download(
      "text/csv;charset=utf-8",
      "maschinen.csv",
      MachinesDB.exportCSV(filtered)
    );
  }, [filtered]);

  const exportJSON = React.useCallback(() => {
    download("application/json", "maschinen_backup.json", MachinesDB.exportJSON());
  }, []);

  const importJSON = React.useCallback(() => {
    pickFile(async (f) => {
      const n = MachinesDB.importJSON(await f.text());
      alert(`Backup importiert: ${n}.`);
      refresh();
    });
  }, [refresh]);

  const recalcNext = React.useCallback(() => {
    if (!sel) return;
    const last = sel.lastService ?? new Date().toISOString();
    const days = sel.serviceIntervalDays ?? 180;
    const next = new Date(new Date(last).getTime() + days * 86400000).toISOString();
    up({ nextService: next });
  }, [sel, up]);

  return (
    <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-536">
      <div
        className="card rlc-migrated-pages-buro-maschinenverwaltung-tsx-537">

        
        <button className="btn" onClick={add}>
          + Maschine
        </button>
        <button className="btn" onClick={del} disabled={!sel}>
          Löschen
        </button>

        <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-538" />

        <input
          placeholder="Suche Name / Typ / Seriennr. / Projekt…"
          value={q}
          onChange={(e) => setQ(e.target.value)} className={rlcClass(null,
          { ...inp, width: 300 })} />
        

        <select
          value={proj}
          onChange={(e) => setProj(e.target.value)} className={rlcClass(null,
          { ...inp, width: 160 })}>
          
          <option value="">Alle Projekte</option>
          {projects.map((p) =>
          <option key={p} value={p}>
              {p}
            </option>
          )}
        </select>

        <label className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-539">
          <input
            type="checkbox"
            checked={onlyDue}
            onChange={(e) => setOnlyDue(e.target.checked)} />
          
          <span className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-540">nur fällige</span>
        </label>

        <button className="btn" onClick={importCSV}>
          Import CSV
        </button>
        <button className="btn" onClick={exportCSV}>
          Export CSV
        </button>
        <button className="btn" onClick={importJSON}>
          Import JSON
        </button>
        <button className="btn" onClick={exportJSON}>
          Export JSON
        </button>
      </div>

      <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-541">






        
        <div className="card rlc-migrated-pages-buro-maschinenverwaltung-tsx-542">
          <table className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-543">
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>Name</th>
                <th className={rlcClass(null, th)}>Typ</th>
                <th className={rlcClass(null, th)}>Seriennr.</th>
                <th className={rlcClass(null, th)}>Projekt</th>
                <th className={rlcClass(null, th)}>Stunden</th>
                <th className={rlcClass(null, th)}>nächster Service</th>
                <th className={rlcClass(null, th)}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const due = isDue(m);
                const days = daysLeft(m.nextService);

                return (
                  <tr
                    key={m.id}
                    onClick={() => setSelId(m.id)} className={rlcClass(null,
                    {
                      cursor: "pointer",
                      background: sel?.id === m.id ? "#f1f5ff" : undefined
                    })}>
                    
                    <td className={rlcClass(null, td)}>
                      <b>{m.name}</b>
                    </td>
                    <td className={rlcClass(null, td)}>{m.type || "—"}</td>
                    <td className={rlcClass(null, td)}>{m.serial || "—"}</td>
                    <td className={rlcClass(null, td)}>{m.projectId || "—"}</td>
                    <td className={rlcClass(null, td)}>{m.hours ?? 0}</td>
                    <td className={rlcClass(null, td)}>
                      {m.nextService ? fmt(m.nextService) : "—"}
                      {m.nextService &&
                      <span className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-544">
                          ({days} Tg)
                        </span>
                      }
                    </td>
                    <td className={rlcClass(null, td)}>{due ? "⚠️ fällig" : m.status || "Betrieb"}</td>
                  </tr>);

              })}

              {filtered.length === 0 &&
              <tr>
                  <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={7}>
                    Keine Maschinen.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div
          className="card rlc-migrated-pages-buro-maschinenverwaltung-tsx-545"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}>

          
          {!sel ?
          <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-546">Links Maschine wählen oder neu anlegen.</div> :

          <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-547">





            
              <label className={rlcClass(null, lbl)}>Name</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.name}
            onChange={(e) => up({ name: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Typ</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.type ?? ""}
            onChange={(e) => up({ type: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Seriennr.</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.serial ?? ""}
            onChange={(e) => up({ serial: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Projekt-ID</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.projectId ?? ""}
            onChange={(e) => up({ projectId: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Standort</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.location ?? ""}
            onChange={(e) => up({ location: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Status</label>
              <select className={rlcClass(null,
            inp)}
            value={sel.status ?? "Betrieb"}
            onChange={(e) => up({ status: e.target.value as any })}>
              
                <option>Betrieb</option>
                <option>Wartung</option>
                <option>Außer Betrieb</option>
              </select>

              <label className={rlcClass(null, lbl)}>Betriebsstunden</label>
              <input
              type="number" className={rlcClass(null,
              inp)}
              value={sel.hours ?? 0}
              onChange={(e) => up({ hours: Number(e.target.value) || 0 })} />
            

              <label className={rlcClass(null, lbl)}>Letzter Service</label>
              <input
              type="date" className={rlcClass(null,
              inp)}
              value={toDateInput(sel.lastService)}
              onChange={(e) => up({ lastService: fromDateInput(e.target.value) })} />
            

              <label className={rlcClass(null, lbl)}>Intervall (Tage)</label>
              <input
              type="number" className={rlcClass(null,
              inp)}
              value={sel.serviceIntervalDays ?? 180}
              onChange={(e) =>
              up({ serviceIntervalDays: Number(e.target.value) || 0 })
              } />
            

              <label className={rlcClass(null, lbl)}>Nächster Service</label>
              <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-548">
                <input
                type="date" className={rlcClass(null,
                { ...inp, flex: 1 })}
                value={toDateInput(sel.nextService)}
                onChange={(e) => up({ nextService: fromDateInput(e.target.value) })} />
              
                <button className="btn" onClick={recalcNext}>
                  Berechnen
                </button>
              </div>

              <label className={rlcClass(null, { ...lbl, gridColumn: "1 / -1" })}>Wartungsprotokolle</label>
              <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-549">
                <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-550">
                  <button className="btn" onClick={addMaint}>
                    + Eintrag
                  </button>
                </div>

                <table className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-551">
                  <thead>
                    <tr>
                      <th className={rlcClass(null, th)}>Datum</th>
                      <th className={rlcClass(null, th)}>Std.</th>
                      <th className={rlcClass(null, th)}>Notizen</th>
                      <th className={rlcClass(null, th)}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sel.maintenance || []).map((r) =>
                  <tr key={r.id}>
                        <td className={rlcClass(null, td)}>
                          <input
                        type="date" className={rlcClass(null,
                        inp)}
                        value={toDateInput(r.date)}
                        onChange={(e) =>
                        up({
                          maintenance: (sel.maintenance || []).map((x) =>
                          x.id === r.id ?
                          { ...r, date: fromDateInput(e.target.value) } :
                          x
                          )
                        })
                        } />
                      
                        </td>
                        <td className={rlcClass(null, td)}>
                          <input
                        type="number" className={rlcClass(null,
                        inp)}
                        value={r.hours ?? 0}
                        onChange={(e) =>
                        up({
                          maintenance: (sel.maintenance || []).map((x) =>
                          x.id === r.id ?
                          { ...r, hours: Number(e.target.value) || 0 } :
                          x
                          )
                        })
                        } />
                      
                        </td>
                        <td className={rlcClass(null, td)}>
                          <input className={rlcClass(null,
                      { ...inp, width: "100%" })}
                      value={r.notes ?? ""}
                      onChange={(e) =>
                      up({
                        maintenance: (sel.maintenance || []).map((x) =>
                        x.id === r.id ? { ...r, notes: e.target.value } : x
                        )
                      })
                      } />
                      
                        </td>
                        <td className={rlcClass(null, { ...td, whiteSpace: "nowrap" })}>
                          <button className="btn" onClick={() => delMaint(r.id)}>
                            Entfernen
                          </button>
                        </td>
                      </tr>
                  )}

                    {(sel.maintenance || []).length === 0 &&
                  <tr>
                        <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={4}>
                          Keine Einträge.
                        </td>
                      </tr>
                  }
                  </tbody>
                </table>
              </div>

              <label className={rlcClass(null, { ...lbl, gridColumn: "1 / -1" })}>
                Dokumente / Fotos (Drag&amp;Drop)
              </label>
              <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-552">






              
                {(sel.attachments || []).map((a) =>
              <div
                key={a.id} className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-553">






                
                    <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-554">







                  
                      <b





                    title={a.name} className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-555">
                    
                        {a.name}
                      </b>
                      <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-556" />
                      <button className="btn" onClick={() => open(a)}>
                        Öffnen
                      </button>
                    </div>

                    {(a.mime || "").startsWith("image/") &&
                <img
                  src={a.dataURL}
                  alt={a.name} className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-557" />


                }
                  </div>
              )}

                {(sel.attachments || []).length === 0 &&
              <div className="rlc-migrated-pages-buro-maschinenverwaltung-tsx-558">Keine Anhänge.</div>
              }
              </div>
            </div>
          }
        </div>
      </div>
    </div>);

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

function fmt(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

function daysLeft(iso?: string) {
  if (!iso) return NaN;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function isDue(m: Machine) {
  const d = daysLeft(m.nextService);
  return !isNaN(d) && d <= 14 || m.status === "Wartung";
}

function pickFile(onPick: (f: File) => void) {
  const i = document.createElement("input");
  i.type = "file";
  i.onchange = () => {
    const f = i.files?.[0];
    if (f) onPick(f);
  };
  i.click();
}

function download(type: string, name: string, data: string) {
  const b = new Blob([data], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
