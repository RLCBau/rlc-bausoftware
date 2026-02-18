// apps/web/src/pages/regie/Regie.tsx
import React from "react";
import { listRegie, createRegie, deleteRegie, RegieItem } from "../../api/regie";

export default function RegiePage() {
  const [rows, setRows] = React.useState<RegieItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // form state
  const [projectId, setProjectId] = React.useState("demo-project");
  const [date, setDate] = React.useState<string>(new Date().toISOString().slice(0, 10));
  const [worker, setWorker] = React.useState("");
  const [hours, setHours] = React.useState<string>("");
  const [machine, setMachine] = React.useState("");
  const [material, setMaterial] = React.useState("");
  const [quantity, setQuantity] = React.useState<string>("");
  const [unit, setUnit] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [lvItemId, setLvItemId] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listRegie(projectId || undefined);
      setRows(data);
    } catch (e: any) {
      setError(e?.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => { load(); }, [load]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const item = await createRegie({
        projectId,
        date: new Date(date).toISOString(),
        worker: empty(worker),
        hours: toNum(hours),
        machine: empty(machine),
        material: empty(material),
        quantity: toNum(quantity),
        unit: empty(unit),
        comment: empty(comment),
        lvItemId: empty(lvItemId),
      });
      setRows(r => [item, ...r]);
      // reset “soft”
      setWorker(""); setHours(""); setMachine(""); setMaterial("");
      setQuantity(""); setUnit(""); setComment(""); setLvItemId("");
    } catch (e: any) {
      setError(e?.message || "Speichern fehlgeschlagen");
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Eintrag löschen?")) return;
    try {
      await deleteRegie(id);
      setRows(r => r.filter(x => x.id !== id));
    } catch (e: any) {
      alert(e?.message || "Löschen fehlgeschlagen");
    }
  }

  const sumHours = rows.reduce((a, r) => a + (r.hours || 0), 0);
  const sumQty   = rows.reduce((a, r) => a + (r.quantity || 0), 0);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ margin: "0 0 12px" }}>Regieberichte</h2>

      {/* FILTER / PROJECT */}
      <div className="card" style={card}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label>
            <span style={lbl}>Projekt-ID</span>
            <input value={projectId} onChange={e => setProjectId(e.target.value)} style={inp}/>
          </label>
          <button className="btn" onClick={load}>Aktualisieren</button>
          {loading && <span>lädt…</span>}
          {error && <span style={{ color: "crimson" }}>{error}</span>}
        </div>
      </div>

      {/* FORM */}
      <form className="card" style={card} onSubmit={onSave}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 12 }}>
          <label><span style={lbl}>Datum</span>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp}/></label>

          <label><span style={lbl}>Mitarbeiter</span>
            <input value={worker} onChange={e=>setWorker(e.target.value)} style={inp}/></label>

          <label><span style={lbl}>Stunden</span>
            <input type="number" step="0.25" value={hours} onChange={e=>setHours(e.target.value)} style={inp}/></label>

          <label><span style={lbl}>Maschine</span>
            <input value={machine} onChange={e=>setMachine(e.target.value)} style={inp}/></label>

          <label><span style={lbl}>Material</span>
            <input value={material} onChange={e=>setMaterial(e.target.value)} style={inp}/></label>

          <label><span style={lbl}>Menge</span>
            <input type="number" step="0.01" value={quantity} onChange={e=>setQuantity(e.target.value)} style={inp}/></label>

          <label><span style={lbl}>Einheit</span>
            <input value={unit} onChange={e=>setUnit(e.target.value)} style={inp}/></label>

          <label><span style={lbl}>LV-Position (optional)</span>
            <input value={lvItemId} onChange={e=>setLvItemId(e.target.value)} style={inp}/></label>

          <label style={{ gridColumn: "1 / -1" }}><span style={lbl}>Bemerkung</span>
            <input value={comment} onChange={e=>setComment(e.target.value)} style={inp}/></label>
        </div>

        <div style={{ marginTop: 12 }}>
          <button className="btn">Speichern</button>
        </div>
      </form>

      {/* TABELLA */}
      <div className="card" style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Datum</th>
              <th style={th}>Mitarbeiter</th>
              <th style={th}>Std.</th>
              <th style={th}>Maschine</th>
              <th style={th}>Material</th>
              <th style={th}>Menge</th>
              <th style={th}>Einheit</th>
              <th style={th}>LV</th>
              <th style={th}>Bemerkung</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td style={{ ...td, textAlign: "center" }} colSpan={10}>Noch keine Einträge.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={td}>{(r.date || "").slice(0,10)}</td>
                <td style={td}>{r.worker || ""}</td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  {(r.hours ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td style={td}>{r.machine || ""}</td>
                <td style={td}>{r.material || ""}</td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  {(r.quantity ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                </td>
                <td style={td}>{r.unit || ""}</td>
                <td style={td}>{r.lvItemId || ""}</td>
                <td style={td}>{r.comment || ""}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button className="btn" onClick={() => onDelete(r.id)}>Löschen</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={td} colSpan={2}><b>Summen</b></td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                {sumHours.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
              <td style={td}></td>
              <td style={td}></td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                {sumQty.toLocaleString(undefined, { maximumFractionDigits: 3 })}
              </td>
              <td style={td}></td>
              <td style={td}></td>
              <td style={td}></td>
              <td style={td}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ===== UI helpers ===== */
const card: React.CSSProperties = { padding: 12, border: "1px solid var(--line, #ddd)", marginBottom: 12, borderRadius: 6, background: "#fff" };
const lbl: React.CSSProperties  = { display: "block", fontSize: 12, color: "#666", marginBottom: 4 };
const inp: React.CSSProperties  = { width: "100%", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 4 };
const th: React.CSSProperties   = { textAlign: "left", fontWeight: 700, padding: "8px 10px", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" };
const td: React.CSSProperties   = { padding: "6px 10px", borderBottom: "1px solid #eee", verticalAlign: "middle" };

function toNum(v: string): number | null {
  if (!v?.trim()) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function empty(v: string): string | undefined {
  return v?.trim() ? v.trim() : undefined;
}
