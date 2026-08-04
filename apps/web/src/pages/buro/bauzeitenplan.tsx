import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import { GanttDB } from "./store.gantt";
import { GanttTask } from "./types";

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

export default function Bauzeitenplan() {
  const [all, setAll] = React.useState<GanttTask[]>(GanttDB.list());
  const [sel, setSel] = React.useState<GanttTask | null>(null);
  const [q, setQ] = React.useState("");
  const [proj, setProj] = React.useState("");
  const [zoom, setZoom] = React.useState<"day" | "week" | "month">("week");

  const refresh = React.useCallback(() => {
    setAll(GanttDB.list());
  }, []);

  const filtered = React.useMemo(() => {
    return all.filter((t) => {
      const s = `${t.name} ${t.projectId ?? ""}`.toLowerCase();
      const okQ = !q || s.includes(q.toLowerCase());
      const okP = !proj || (t.projectId ?? "") === proj;
      return okQ && okP;
    });
  }, [all, q, proj]);

  const projects = React.useMemo(
    () => Array.from(new Set(all.map((t) => t.projectId).filter(Boolean))) as string[],
    [all]
  );

  const newTask = React.useCallback(() => {
    const t = GanttDB.create();
    refresh();
    setSel(t);
  }, [refresh]);

  const del = React.useCallback(() => {
    if (!sel) return;
    if (!confirm("Vorgang löschen?")) return;
    GanttDB.remove(sel.id);
    refresh();
    setSel(null);
  }, [sel, refresh]);

  const update = React.useCallback(
    (p: Partial<GanttTask>) => {
      if (!sel) return;
      const next = { ...sel, ...p };
      GanttDB.upsert(next);
      setSel(next);
      refresh();
    },
    [sel, refresh]
  );

  const exportCSV = React.useCallback(() => {
    download(
      "text/csv;charset=utf-8",
      "bauzeitenplan.csv",
      GanttDB.exportCSV(filtered)
    );
  }, [filtered]);

  const importCSV = React.useCallback(() => {
    pickFile(async (f) => {
      const n = GanttDB.importCSV(await f.text());
      alert(`Import: ${n} Vorgänge.`);
      refresh();
    });
  }, [refresh]);

  const tasks = React.useMemo(() => {
    return filtered.
    slice().
    sort(
      (a, b) =>
      new Date(a.start).getTime() - new Date(b.start).getTime()
    );
  }, [filtered]);

  const minDate = tasks.length ?
  new Date(Math.min(...tasks.map((t) => new Date(t.start).getTime()))) :
  new Date();

  const maxDate = tasks.length ?
  new Date(Math.max(...tasks.map((t) => new Date(t.end).getTime()))) :
  new Date();

  const padDays = 7;
  const start = new Date(minDate.getTime() - padDays * 86400000);
  const end = new Date(maxDate.getTime() + padDays * 86400000);

  const dayWidth = zoom === "day" ? 28 : zoom === "week" ? 16 : 8;
  const totalDays = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / 86400000)
  );
  const width = totalDays * dayWidth + 140;
  const rowH = 28;

  const xFor = (iso: string) => {
    const d = new Date(iso);
    const days = (d.getTime() - start.getTime()) / 86400000;
    return 140 + days * dayWidth;
  };

  const wFor = (a: string, b: string) =>
  Math.max(
    6,
    (new Date(b).getTime() - new Date(a).getTime()) / 86400000 * dayWidth
  );

  const gridMarks = React.useMemo(() => {
    const marks: {x: number;label: string;}[] = [];
    const d = new Date(start);

    while (d <= end) {
      const x = 140 + (d.getTime() - start.getTime()) / 86400000 * dayWidth;
      let label = "";

      if (zoom === "day") label = `${d.getDate()}.${d.getMonth() + 1}.`;else
      if (zoom === "week") label = `KW ${weekNumber(d)}`;else
      label = `${d.getMonth() + 1}/${d.getFullYear()}`;

      marks.push({ x, label });

      if (zoom === "day") d.setDate(d.getDate() + 1);else
      if (zoom === "week") d.setDate(d.getDate() + 7);else
      {
        d.setMonth(d.getMonth() + 1);
        d.setDate(1);
      }
    }

    return marks;
  }, [start, end, dayWidth, zoom]);

  return (
    <div className="rlc-migrated-pages-buro-bauzeitenplan-tsx-439">






      
      <div
        className="card rlc-migrated-pages-buro-bauzeitenplan-tsx-440">

        
        <button className="btn" onClick={newTask}>
          + Neuer Vorgang
        </button>
        <button className="btn" onClick={del} disabled={!sel}>
          Löschen
        </button>
        <div className="rlc-migrated-pages-buro-bauzeitenplan-tsx-441" />
        <input
          placeholder="Suche Vorgang / Projekt…"
          value={q}
          onChange={(e) => setQ(e.target.value)} className={rlcClass(null,
          { ...inp, width: 280 })} />
        
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
        <select
          value={zoom}
          onChange={(e) => setZoom(e.target.value as "day" | "week" | "month")} className={rlcClass(null,
          { ...inp, width: 140 })}>
          
          <option value="day">Tag</option>
          <option value="week">Woche</option>
          <option value="month">Monat</option>
        </select>
        <button className="btn" onClick={importCSV}>
          Import CSV
        </button>
        <button className="btn" onClick={exportCSV}>
          Export CSV
        </button>
      </div>

      <div className="rlc-migrated-pages-buro-bauzeitenplan-tsx-442">






        
        <div className="card rlc-migrated-pages-buro-bauzeitenplan-tsx-443">
          <table className="rlc-migrated-pages-buro-bauzeitenplan-tsx-444">
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>Vorgang</th>
                <th className={rlcClass(null, th)}>Projekt</th>
                <th className={rlcClass(null, th)}>Start</th>
                <th className={rlcClass(null, th)}>Ende</th>
                <th className={rlcClass(null, th)}>Fortschritt</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) =>
              <tr
                key={t.id}
                onClick={() => setSel(t)} className={rlcClass(null,
                {
                  cursor: "pointer",
                  background: sel?.id === t.id ? "#f1f5ff" : undefined
                })}>
                
                  <td className={rlcClass(null, td)}>{t.name}</td>
                  <td className={rlcClass(null, td)}>{t.projectId || "—"}</td>
                  <td className={rlcClass(null, td)}>{fmt(t.start)}</td>
                  <td className={rlcClass(null, td)}>{fmt(t.end)}</td>
                  <td className={rlcClass(null, td)}>{t.progress ?? 0}%</td>
                </tr>
              )}
              {tasks.length === 0 &&
              <tr>
                  <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={5}>
                    Keine Vorgänge.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div className="card rlc-migrated-pages-buro-bauzeitenplan-tsx-445">
          {!sel ?
          <div className="rlc-migrated-pages-buro-bauzeitenplan-tsx-446">
              Links Vorgang wählen oder neu anlegen.
            </div> :

          <div className="rlc-migrated-pages-buro-bauzeitenplan-tsx-447">





            
              <label className={rlcClass(null, lbl)}>Vorgang</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.name}
            onChange={(e) => update({ name: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Projekt-ID</label>
              <input className={rlcClass(null,
            inp)}
            value={sel.projectId ?? ""}
            onChange={(e) => update({ projectId: e.target.value })} />
            

              <label className={rlcClass(null, lbl)}>Start</label>
              <input
              type="date" className={rlcClass(null,
              inp)}
              value={toDateInput(sel.start)}
              onChange={(e) => update({ start: fromDateInput(e.target.value) })} />
            

              <label className={rlcClass(null, lbl)}>Ende</label>
              <input
              type="date" className={rlcClass(null,
              inp)}
              value={toDateInput(sel.end)}
              onChange={(e) => update({ end: fromDateInput(e.target.value) })} />
            

              <label className={rlcClass(null, lbl)}>Fortschritt</label>
              <input
              type="number"
              min={0}
              max={100} className={rlcClass(null,
              inp)}
              value={sel.progress ?? 0}
              onChange={(e) =>
              update({ progress: clamp(Number(e.target.value), 0, 100) })
              } />
            

              <label className={rlcClass(null, lbl)}>Abhängigkeiten</label>
              <input className={rlcClass(null,
            inp)}
            placeholder="IDs kommagetrennt"
            value={(sel.dependsOn ?? []).join(", ")}
            onChange={(e) =>
            update({
              dependsOn: e.target.value.
              split(",").
              map((s) => s.trim()).
              filter(Boolean)
            })
            } />
            

              <label className={rlcClass(null, lbl)}>Notizen</label>
              <textarea className={rlcClass(null,
            { ...inp, gridColumn: "1 / -1", minHeight: 80 })}
            value={sel.notes ?? ""}
            onChange={(e) => update({ notes: e.target.value })} />
            
            </div>
          }
        </div>
      </div>

      <div className="card rlc-migrated-pages-buro-bauzeitenplan-tsx-448">
        <svg width={width} height={Math.max(120, (tasks.length + 1) * rowH + 40)}>
          <rect x={0} y={0} width={width} height={32} fill="#f7f8fb" />
          <rect x={0} y={0} width={140} height="100%" fill="#fafafa" stroke="var(--line)" />
          <text x={12} y={22} fontSize="12" fontWeight={700}>
            Vorgang
          </text>

          {gridMarks.map((m, i) =>
          <g key={i}>
              <line x1={m.x} y1={0} x2={m.x} y2={10000} stroke="#eceff3" />
              <text x={m.x + 4} y={22} fontSize="11" fill="#61708b">
                {m.label}
              </text>
            </g>
          )}

          {tasks.map((t, idx) =>
          <g key={t.id}>
              <line
              x1={0}
              y1={32 + idx * rowH}
              x2={width}
              y2={32 + idx * rowH}
              stroke="#f0f2f7" />
            
              <text x={12} y={32 + idx * rowH + 18} fontSize="12">
                {t.name}
              </text>
            </g>
          )}

          {tasks.map((t, idx) => {
            const x = xFor(t.start);
            const w = wFor(t.start, t.end);
            const y = 32 + idx * rowH + 6;
            const h = rowH - 12;
            const progW = Math.max(0, Math.min(100, t.progress ?? 0)) / 100 * w;

            return (
              <g key={t.id}>
                {(t.dependsOn || []).map((depId, i) => {
                  const dep = tasks.find((item) => item.id === depId);
                  if (!dep) return null;

                  const depIndex = tasks.findIndex((item) => item.id === dep.id);
                  if (depIndex < 0) return null;

                  const dx = xFor(dep.end);
                  const dy = 32 + depIndex * rowH + rowH / 2;
                  const tx = x;
                  const ty = y + h / 2;

                  return (
                    <path
                      key={i}
                      d={`M ${dx} ${dy} L ${tx - 6} ${ty}`}
                      stroke="#b7c3d6"
                      fill="none"
                      markerEnd="url(#arrow)" />);


                })}

                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={4}
                  ry={4}
                  fill="#dbe7ff"
                  stroke="#88aaff" />
                
                <rect
                  x={x}
                  y={y}
                  width={progW}
                  height={h}
                  rx={4}
                  ry={4}
                  fill="#9fc2ff" />
                
                <text x={x + 4} y={y + h / 2 + 4} fontSize="11">
                  {t.progress ?? 0}%
                </text>
              </g>);

          })}

          {(() => {
            const todayX = xFor(new Date().toISOString());
            return (
              <line
                x1={todayX}
                y1={0}
                x2={todayX}
                y2={10000}
                stroke="#ff6b6b"
                strokeDasharray="4 4" />);


          })()}

          <defs>
            <marker
              id="arrow"
              markerWidth="10"
              markerHeight="6"
              refX="10"
              refY="3"
              orient="auto">
              
              <path d="M 0 0 L 10 3 L 0 6 z" fill="#b7c3d6" />
            </marker>
          </defs>
        </svg>
      </div>
    </div>);

}

/* utils */
function fmt(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
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

function weekNumber(d: Date) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  return (
    1 +
    Math.round(
      ((dt.getTime() - first.getTime()) / 86400000 -
      3 +
      (first.getUTCDay() + 6) % 7) /
      7
    ));

}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
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
