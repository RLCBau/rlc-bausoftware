import React, { useMemo, useState } from "react";
import { BuroAPI } from "../../lib/buro/store";

const shell: React.CSSProperties = {
  maxWidth: 1000,
  margin: "0 auto",
  padding: "16px 20px",
  fontFamily: "Inter, system-ui, Arial",
};

const h1: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  margin: "0 0 14px 0",
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  marginBottom: 12,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const head: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #e3e3e3",
  background: "#fafafa",
  fontWeight: 600,
};

const cell: React.CSSProperties = {
  padding: "8px",
  borderBottom: "1px solid #efefef",
  verticalAlign: "top",
};

const badge: React.CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  background: "#eef2ff",
  border: "1px solid #dbe1ff",
};

export default function TasksPage() {
  const [query, setQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);

  const tasks = BuroAPI.use((s) => s.tasks);
  const filtered = useMemo(() => {
    let list = tasks;
    if (openOnly) list = list.filter((t) => !t.done);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.assignee || "").toLowerCase().includes(q) ||
          (t.projectId || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [tasks, query, openOnly]);

  const addQuick = () => {
    const title = prompt("Neue Aufgabe:");
    if (!title) return;
    BuroAPI.addTask({ title });
  };

  return (
    <div style={shell}>
      <h1 style={h1}>Büro → Aufgaben</h1>

      <div style={toolbar}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suche: Titel / Verantwortlich / Projekt …"
          style={{ padding: "6px 8px", fontSize: 13, minWidth: 280 }}
        />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
          />
          Nur offene
        </label>
        <button onClick={addQuick} style={{ padding: "6px 10px" }}>
          + Neue Aufgabe
        </button>
        <div style={{ marginLeft: "auto", ...badge }}>
          Offen: {tasks.filter((t) => !t.done).length}
        </div>
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={head}>Titel</th>
            <th style={head}>Fällig</th>
            <th style={head}>Projekt</th>
            <th style={head}>Zuständig</th>
            <th style={head}>Prio</th>
            <th style={head}>Erledigt</th>
            <th style={head}>Aktion</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((t) => (
            <tr key={t.id}>
              <td style={cell}>{t.title}</td>
              <td style={cell}>{t.due || "—"}</td>
              <td style={cell}>{t.projectId || "—"}</td>
              <td style={cell}>{t.assignee || "—"}</td>
              <td style={cell}>{t.priority || "—"}</td>
              <td style={cell}>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => BuroAPI.toggleTask(t.id)}
                />
              </td>
              <td style={cell}>
                <button
                  onClick={() =>
                    BuroAPI.updateTask(t.id, {
                      title: prompt("Titel ändern:", t.title) || t.title,
                    })
                  }
                  style={{ marginRight: 6 }}
                >
                  Bearbeiten
                </button>
                <button
                  onClick={() => BuroAPI.updateTask(t.id, { done: true })}
                  disabled={t.done}
                  style={{ marginRight: 6 }}
                >
                  ✓ Abschließen
                </button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td style={cell} colSpan={7}>
                Keine Aufgaben gefunden.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
