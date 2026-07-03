// apps/web/src/pages/ki/Optimierung.tsx
import { apiUrl } from "../../lib/apiBase";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../../store/useProject";

type Task = {
  id: string;
  name: string;
  dauerTage: number;
  deps: string[];
  ressourcen: Record<string, number>;
};

type Capacity = Record<string, number>;

type PlanTask = Task & {
  es: number;
  ef: number;
  ls: number;
  lf: number;
  startDate: string;
  endDate: string;
  krit: boolean;
};

type PlanResult = {
  start: string;
  ende: string;
  tasks: PlanTask[];
  usage: Array<{ tag: string; ressourcen: Record<string, number> }>;
};

type ProjectLike = {
  id?: string;
  code?: string;
};

const shell: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 24,
};

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 16,
  background: "#fff",
};

const input: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
};

const btn: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 8,
  fontSize: 13,
  cursor: "pointer",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  borderBottom: "1px solid #ccc",
  textAlign: "left",
  padding: 8,
  background: "#f8fafc",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: 6,
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
};

export default function Optimierung() {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const projectCtx = useProject() as unknown as {
    currentProject?: ProjectLike | null;
  };

  const currentProject = projectCtx?.currentProject ?? null;
  const storeProjectId = currentProject?.id ?? "";
  const projectCode = currentProject?.code ?? "";

  const [projectInput, setProjectInput] = useState("");
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: "A",
      name: "Baustelleneinrichtung",
      dauerTage: 1,
      deps: [],
      ressourcen: { Facharbeiter: 2 },
    },
    {
      id: "B",
      name: "Graben herstellen",
      dauerTage: 3,
      deps: ["A"],
      ressourcen: { Bagger20t: 1, Facharbeiter: 2 },
    },
    {
      id: "C",
      name: "Leitung verlegen",
      dauerTage: 2,
      deps: ["B"],
      ressourcen: { Facharbeiter: 2 },
    },
    {
      id: "D",
      name: "Wiederverfüllen",
      dauerTage: 2,
      deps: ["C"],
      ressourcen: { Radlader: 1, Facharbeiter: 1 },
    },
  ]);

  const [capacity, setCapacity] = useState<Capacity>({
    Facharbeiter: 4,
    Bagger20t: 1,
    Radlader: 1,
  });

  const [capacityText, setCapacityText] = useState("Facharbeiter:4;Bagger20t:1;Radlader:1");
  const [result, setResult] = useState<PlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveProjectId = useMemo(
    () => projectInput.trim() || storeProjectId || projectCode || "",
    [projectInput, storeProjectId, projectCode]
  );

  const canRun = useMemo(
    () => Boolean(effectiveProjectId && tasks.length > 0),
    [effectiveProjectId, tasks]
  );

  useEffect(() => {
    setCapacityText(capacityToString(capacity));
  }, [capacity]);

  function addTask() {
    const n = tasks.length + 1;
    setTasks((t) => [
      ...t,
      {
        id: `T${n}`,
        name: `Vorgang ${n}`,
        dauerTage: 1,
        deps: [],
        ressourcen: {},
      },
    ]);
  }

  function updateTask(i: number, patch: Partial<Task>) {
    setTasks((arr) =>
      arr.map((t, idx) =>
        idx === i
          ? normalizeTask({
              ...t,
              ...patch,
            })
          : t
      )
    );
  }

  function removeTask(i: number) {
    setTasks((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function runOptimization() {
    if (!canRun) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(apiUrl("/api/ki/optimierung/run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: effectiveProjectId,
          projectCode: projectCode || "",
          start,
          tasks,
          capacity,
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = (await res.json()) as PlanResult;
      setResult(normalizePlanResult(data));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Optimierung fehlgeschlagen";
      setError(msg);
      window.alert(`Optimierung fehlgeschlagen: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    if (!result) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(apiUrl("/api/ki/optimierung/pdf"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: effectiveProjectId, plan: result }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = (await res.json()) as { url?: string };
      if (data.url) window.open(data.url, "_blank");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "PDF-Export fehlgeschlagen";
      setError(msg);
      window.alert(`PDF-Export fehlgeschlagen: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadFromBuero() {
    if (!effectiveProjectId) {
      window.alert("Projekt-ID fehlt.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const r = await fetch(apiUrl("/api/buero/bauzeitenplan/load"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: effectiveProjectId }),
      });

      if (!r.ok) throw new Error(await r.text());

      const d = (await r.json()) as {
        start?: string;
        tasks?: unknown[];
        capacity?: unknown;
        result?: unknown;
      };

      if (d.start) setStart(String(d.start).slice(0, 10));
      if (Array.isArray(d.tasks)) setTasks(d.tasks.map(normalizeTask));
      if (d.capacity && typeof d.capacity === "object") {
        setCapacity(normalizeCapacity(d.capacity));
      }

      if (d.result) setResult(normalizePlanResult(d.result));

      window.alert("Daten aus Büro geladen.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Laden fehlgeschlagen";
      setError(msg);
      window.alert(`Laden fehlgeschlagen: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveToBuero() {
    if (!effectiveProjectId) {
      window.alert("Projekt-ID fehlt.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const r = await fetch(apiUrl("/api/buero/bauzeitenplan/save"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: effectiveProjectId,
          start,
          tasks,
          capacity,
          result,
        }),
      });

      if (!r.ok) throw new Error(await r.text());
      window.alert("In Büro gespeichert.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Speichern fehlgeschlagen";
      setError(msg);
      window.alert(`Speichern fehlgeschlagen: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}")) as {
          tasks?: unknown[];
          capacity?: unknown;
          start?: string;
          result?: unknown;
        };

        if (parsed.tasks && Array.isArray(parsed.tasks)) {
          setTasks(parsed.tasks.map(normalizeTask));
        }
        if (parsed.capacity && typeof parsed.capacity === "object") {
          setCapacity(normalizeCapacity(parsed.capacity));
        }
        if (parsed.start) {
          setStart(String(parsed.start).slice(0, 10));
        }
        if (parsed.result) {
          setResult(normalizePlanResult(parsed.result));
        }

        setError(null);
      } catch {
        window.alert("Ungültige Datei. Erwartet JSON mit {start, tasks, capacity}.");
      }

      if (fileRef.current) fileRef.current.value = "";
    };

    reader.readAsText(f);
  }

  const pxPerDay = 24;
  const minDate = result?.start ? new Date(result.start) : new Date(start);

  const daysBetween = (d1: string, d2: string) =>
    Math.round((+new Date(d2) - +new Date(d1)) / 86400000);

  return (
    <div style={shell}>
      <h1>Optimierung Bauzeiten & Ressourcen</h1>

      <div style={card}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label>
            Projekt-ID:&nbsp;
            <input
              style={input}
              value={projectInput}
              onChange={(e) => setProjectInput(e.target.value)}
              placeholder="P-2025-001"
            />
          </label>

          <label>
            Start:&nbsp;
            <input
              style={input}
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>

          <button style={btn} onClick={addTask}>
            Vorgang hinzufügen
          </button>

          <input ref={fileRef} type="file" accept=".json" onChange={importFile} />

          <button style={btn} onClick={runOptimization} disabled={!canRun || busy}>
            {busy ? "Rechne..." : "Optimieren"}
          </button>

          <button style={btn} onClick={exportPdf} disabled={!result || busy}>
            Gantt als PDF
          </button>

          <button style={btn} onClick={loadFromBuero} disabled={!effectiveProjectId || busy}>
            Aus Büro laden
          </button>

          <button style={btn} onClick={saveToBuero} disabled={!effectiveProjectId || busy}>
            In Büro speichern
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Kapazitäten</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              style={{ ...input, flex: 1 }}
              value={capacityText}
              placeholder="Facharbeiter:4;Bagger20t:1;Radlader:1"
              onChange={(e) => setCapacityText(e.target.value)}
              onBlur={() => setCapacity(parseResourceString(capacityText))}
            />
            <button
              style={btn}
              onClick={() => setCapacity(parseResourceString(capacityText))}
            >
              Übernehmen
            </button>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
          Aktiv: {effectiveProjectId || "kein Projekt gewählt"}
        </div>

        {error && (
          <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <table style={table}>
          <thead>
            <tr>
              {["ID", "Vorgang", "Dauer", "Vorgänger", "Ressourcen (k:v;...)", ""].map(
                (h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {tasks.map((t, i) => (
              <tr key={t.id}>
                <td style={{ ...td, width: 120 }}>
                  <input
                    style={input}
                    value={t.id}
                    onChange={(e) => updateTask(i, { id: e.target.value })}
                  />
                </td>

                <td style={td}>
                  <input
                    style={input}
                    value={t.name}
                    onChange={(e) => updateTask(i, { name: e.target.value })}
                  />
                </td>

                <td style={{ ...td, width: 120 }}>
                  <input
                    style={input}
                    type="number"
                    min={1}
                    value={t.dauerTage}
                    onChange={(e) =>
                      updateTask(i, {
                        dauerTage: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </td>

                <td style={td}>
                  <input
                    style={input}
                    value={t.deps.join(",")}
                    onChange={(e) =>
                      updateTask(i, {
                        deps: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </td>

                <td style={td}>
                  <input
                    style={input}
                    placeholder="Facharbeiter:2;Bagger20t:1"
                    value={Object.entries(t.ressourcen)
                      .map(([k, v]) => `${k}:${v}`)
                      .join(";")}
                    onChange={(e) =>
                      updateTask(i, {
                        ressourcen: parseResourceString(e.target.value),
                      })
                    }
                  />
                </td>

                <td style={{ ...td, width: 60 }}>
                  <button style={btn} onClick={() => removeTask(i)}>
                    Entf.
                  </button>
                </td>
              </tr>
            ))}

            {tasks.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 8, color: "#777" }}>
                  Keine Vorgänge.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {result && (
        <div style={card}>
          <div>
            Start: <b>{result.start}</b> – Ende: <b>{result.ende}</b>
          </div>

          <div style={{ marginTop: 8, border: "1px solid #ddd", padding: 8 }}>
            {result.tasks.map((t) => {
              const offset =
                daysBetween(minDate.toISOString().slice(0, 10), t.startDate) * pxPerDay;
              const width = Math.max(1, t.dauerTage) * pxPerDay;

              return (
                <div
                  key={t.id}
                  style={{ display: "flex", alignItems: "center", marginBottom: 6 }}
                >
                  <div style={{ width: 260 }}>
                    {t.id} – {t.name} {t.krit ? "★" : ""}
                  </div>

                  <div
                    style={{
                      position: "relative",
                      height: 18,
                      flex: 1,
                      background: "#f7f7f7",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: offset,
                        width,
                        height: 18,
                        background: t.krit ? "#c33" : "#3a6",
                        opacity: 0.9,
                      }}
                    />
                  </div>

                  <div style={{ width: 180, textAlign: "right" }}>
                    {t.startDate} → {t.endDate}
                  </div>
                </div>
              );
            })}
          </div>

          {!!result.usage.length && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Ressourcenauslastung</div>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Tag</th>
                    <th style={th}>Ressourcen</th>
                  </tr>
                </thead>
                <tbody>
                  {result.usage.map((u) => (
                    <tr key={u.tag}>
                      <td style={td}>{u.tag}</td>
                      <td style={td}>
                        {Object.entries(u.ressourcen)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function normalizeTask(t: unknown): Task {
  const x = (t ?? {}) as Partial<Task>;
  return {
    id: String(x.id || crypto.randomUUID()),
    name: String(x.name || "Vorgang"),
    dauerTage: Math.max(1, Number(x.dauerTage) || 1),
    deps: Array.isArray(x.deps)
      ? x.deps.map((item) => String(item).trim()).filter(Boolean)
      : [],
    ressourcen: normalizeCapacity(x.ressourcen || {}),
  };
}

function normalizeCapacity(cap: unknown): Capacity {
  const out: Capacity = {};
  if (!cap || typeof cap !== "object") return out;

  for (const [k, v] of Object.entries(cap)) {
    const n = Number(v);
    if (String(k).trim() && Number.isFinite(n) && n > 0) {
      out[String(k).trim()] = n;
    }
  }
  return out;
}

function parseResourceString(value: string): Record<string, number> {
  const obj: Record<string, number> = {};

  value
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((kv) => {
      const [k, v] = kv.split(":");
      const key = String(k || "").trim();
      const num = Number(v);
      if (key && Number.isFinite(num) && num > 0) {
        obj[key] = num;
      }
    });

  return obj;
}

function capacityToString(cap: Capacity): string {
  return Object.entries(cap)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

function normalizePlanResult(r: unknown): PlanResult {
  const x = (r ?? {}) as Partial<PlanResult> & {
    tasks?: unknown[];
    usage?: Array<{ tag?: unknown; ressourcen?: unknown }>;
  };

  return {
    start: String(x.start || new Date().toISOString().slice(0, 10)),
    ende: String(x.ende || new Date().toISOString().slice(0, 10)),
    tasks: Array.isArray(x.tasks)
      ? x.tasks.map((t) => {
          const base = normalizeTask(t);
          const raw = (t ?? {}) as Partial<PlanTask>;
          return {
            ...base,
            es: Number(raw.es) || 0,
            ef: Number(raw.ef) || 0,
            ls: Number(raw.ls) || 0,
            lf: Number(raw.lf) || 0,
            startDate: String(raw.startDate || ""),
            endDate: String(raw.endDate || ""),
            krit: Boolean(raw.krit),
          };
        })
      : [],
    usage: Array.isArray(x.usage)
      ? x.usage.map((u) => ({
          tag: String(u?.tag || ""),
          ressourcen: normalizeCapacity(u?.ressourcen || {}),
        }))
      : [],
  };
}
