import React, { useMemo, useRef, useState } from "react";

type Task = {
  id: string;
  name: string;
  dauerTage: number;
  deps: string[];
  ressourcen: Record<string, number>;
};
type Capacity = Record<string, number>;
type PlanResult = {
  start: string; ende: string;
  tasks: Array<Task & { es: number; ef: number; ls: number; lf: number; startDate: string; endDate: string; krit: boolean }>;
  usage: Array<{ tag: string; ressourcen: Record<string, number> }>;
};

const API = import.meta.env.VITE_API_URL || "";

export default function Optimierung() {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [projectId, setProjectId] = useState("");
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [tasks, setTasks] = useState<Task[]>([
    { id: "A", name: "Baustelleneinrichtung", dauerTage: 1, deps: [], ressourcen: { Facharbeiter: 2 } },
    { id: "B", name: "Graben herstellen", dauerTage: 3, deps: ["A"], ressourcen: { Bagger20t: 1, Facharbeiter: 2 } },
    { id: "C", name: "Leitung verlegen", dauerTage: 2, deps: ["B"], ressourcen: { Facharbeiter: 2 } },
    { id: "D", name: "Wiederverfüllen", dauerTage: 2, deps: ["C"], ressourcen: { Radlader: 1, Facharbeiter: 1 } },
  ]);
  const [capacity, setCapacity] = useState<Capacity>({ Facharbeiter: 4, Bagger20t: 1, Radlader: 1 });
  const [result, setResult] = useState<PlanResult | null>(null);
  const [busy, setBusy] = useState(false);

  const canRun = useMemo(() => projectId && tasks.length > 0, [projectId, tasks]);

  function addTask() {
    const n = tasks.length + 1;
    setTasks((t) => [...t, { id: `T${n}`, name: `Vorgang ${n}`, dauerTage: 1, deps: [], ressourcen: {} }]);
  }
  function updateTask(i: number, patch: Partial<Task>) {
    setTasks((arr) => arr.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function removeTask(i: number) {
    setTasks((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function runOptimization() {
    if (!canRun) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/ki/optimierung/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, start, tasks, capacity }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as PlanResult;
      setResult(data);
    } catch (e: any) {
      alert("Optimierung fehlgeschlagen: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    if (!result) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/ki/optimierung/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, plan: result }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch (e: any) {
      alert("PDF-Export fehlgeschlagen: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  // Büro <-> KI
  async function loadFromBuero() {
    try {
      const r = await fetch(`${API}/api/buero/bauzeitenplan/load`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId })
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      if (d.start) setStart(d.start);
      if (d.tasks?.length) setTasks(d.tasks);
      if (d.capacity) setCapacity(d.capacity);
      alert("Daten aus Büro geladen.");
    } catch (e:any) { alert("Laden fehlgeschlagen: " + e.message); }
  }
  async function saveToBuero() {
    try {
      const r = await fetch(`${API}/api/buero/bauzeitenplan/save`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, start, tasks, capacity, result })
      });
      if (!r.ok) throw new Error(await r.text());
      alert("In Büro gespeichert.");
    } catch (e:any) { alert("Speichern fehlgeschlagen: " + e.message); }
  }

  function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed.tasks) setTasks(parsed.tasks);
        if (parsed.capacity) setCapacity(parsed.capacity);
        if (parsed.start) setStart(parsed.start);
      } catch { alert("Ungültige Datei. Erwartet JSON mit {start, tasks, capacity}."); }
      if (fileRef.current) fileRef.current.value = "";
    };
    reader.readAsText(f);
  }

  // UI helper
  const pxPerDay = 24;
  const minDate = result?.start ? new Date(result.start) : new Date(start);
  const daysBetween = (d1: string, d2: string) => Math.round((+new Date(d2) - +new Date(d1)) / 86400000);

  return (
    <div style={{ padding: 24 }}>
      <h1>Optimierung Bauzeiten & Ressourcen</h1>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label>Projekt-ID:&nbsp;<input value={projectId} onChange={e => setProjectId(e.target.value)} placeholder="P-2025-001" /></label>
        <label>Start:&nbsp;<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
        <button onClick={addTask}>Vorgang hinzufügen</button>
        <input ref={fileRef} type="file" accept=".json" onChange={importFile} />
        <button onClick={runOptimization} disabled={!canRun || busy}>{busy ? "Rechne..." : "Optimieren"}</button>
        <button onClick={exportPdf} disabled={!result || busy}>Gantt als PDF</button>
        <button onClick={loadFromBuero} disabled={!projectId}>Aus Büro laden</button>
        <button onClick={saveToBuero} disabled={!projectId}>In Büro speichern</button>
      </div>

      {/* Tabelle Aufgaben */}
      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["ID", "Vorgang", "Dauer", "Vorgänger", "Ressourcen (k:v;...)",""].map(h =>
                <th key={h} style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: 8 }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {tasks.map((t, i) => (
              <tr key={t.id}>
                <td style={{ padding: 6, width: 120 }}>
                  <input value={t.id} onChange={e => updateTask(i, { id: e.target.value })} />
                </td>
                <td style={{ padding: 6 }}>
                  <input value={t.name} onChange={e => updateTask(i, { name: e.target.value })} />
                </td>
                <td style={{ padding: 6, width: 120 }}>
                  <input type="number" min={1} value={t.dauerTage} onChange={e => updateTask(i, { dauerTage: Number(e.target.value) })} />
                </td>
                <td style={{ padding: 6 }}>
                  <input value={t.deps.join(",")} onChange={e => updateTask(i, { deps: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} />
                </td>
                <td style={{ padding: 6 }}>
                  <input
                    placeholder="Facharbeiter:2;Bagger20t:1"
                    value={Object.entries(t.ressourcen).map(([k,v]) => `${k}:${v}`).join(";")}
                    onChange={e => {
                      const obj: Record<string, number> = {};
                      e.target.value.split(";").map(s => s.trim()).filter(Boolean).forEach(kv => {
                        const [k,v] = kv.split(":"); if (k && v) obj[k.trim()] = Number(v);
                      });
                      updateTask(i, { ressourcen: obj });
                    }}
                  />
                </td>
                <td style={{ padding: 6, width: 60 }}><button onClick={() => removeTask(i)}>Entf.</button></td>
              </tr>
            ))}
            {tasks.length === 0 && <tr><td colSpan={6} style={{ padding: 8, color: "#777" }}>Keine Vorgänge.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Gantt Ergebnis */}
      {result && (
        <div style={{ marginTop: 18 }}>
          <div>Start: <b>{result.start}</b> – Ende: <b>{result.ende}</b></div>
          <div style={{ marginTop: 8, border: "1px solid #ddd", padding: 8 }}>
            {result.tasks.map((t) => {
              const offset = daysBetween(minDate.toISOString().slice(0,10), t.startDate) * pxPerDay;
              const width = Math.max(1, t.dauerTage) * pxPerDay;
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ width: 220 }}>{t.id} – {t.name} {t.krit ? "★" : ""}</div>
                  <div style={{ position: "relative", height: 18, flex: 1, background: "#f7f7f7" }}>
                    <div style={{ position: "absolute", left: offset, width, height: 18, background: t.krit ? "#c33" : "#3a6", opacity: 0.9 }}/>
                  </div>
                  <div style={{ width: 160, textAlign: "right" }}>{t.startDate} → {t.endDate}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
