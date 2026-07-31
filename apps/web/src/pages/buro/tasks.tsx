import { rlcClass } from "../../ui/rlcRuntimeStyle";import React, { useMemo, useState } from "react";
import { BuroAPI } from "../../lib/buro/store";

/* ================= STYLES ================= */

const shell: React.CSSProperties = {
  maxWidth: 1000,
  margin: "0 auto",
  padding: "16px 20px",
  fontFamily: "Inter, system-ui, Arial"
};

const h1: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  margin: "0 0 14px 0"
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  marginBottom: 12
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13
};

const head: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #e3e3e3",
  background: "#fafafa",
  fontWeight: 600
};

const cell: React.CSSProperties = {
  padding: "8px",
  borderBottom: "1px solid #efefef",
  verticalAlign: "top"
};

const badge: React.CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  background: "#eef2ff",
  border: "1px solid #dbe1ff"
};

/* ================= COMPONENT ================= */

export default function TasksPage() {
  const [query, setQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);

  const tasks = BuroAPI.use((s) => s.tasks);

  /* ================= FILTER ================= */

  const filtered = useMemo(() => {
    let list = [...tasks];

    if (openOnly) {
      list = list.filter((t) => !t.done);
    }

    if (query.trim()) {
      const q = query.toLowerCase();

      list = list.filter((t) =>
      [
      t.title,
      t.assignee || "",
      t.projectId || ""].

      join(" ").
      toLowerCase().
      includes(q)
      );
    }

    return list;
  }, [tasks, query, openOnly]);

  /* ================= ACTIONS ================= */

  const addQuick = () => {
    const title = prompt("Neue Aufgabe:");
    if (!title?.trim()) return;

    BuroAPI.addTask({
      title: title.trim(),
      done: false
    });
  };

  const editTask = (t: any) => {
    const title = prompt("Titel ändern:", t.title);
    if (!title) return;

    BuroAPI.updateTask(t.id, { title: title.trim() });
  };

  const openCount = tasks.filter((t) => !t.done).length;

  /* ================= UI ================= */

  return (
    <div className={rlcClass(null, shell)}>
      <h1 className={rlcClass(null, h1)}>Büro → Aufgaben</h1>

      <div className={rlcClass(null, toolbar)}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suche: Titel / Verantwortlich / Projekt …" className="rlc-migrated-pages-buro-tasks-tsx-645" />

        

        <label className="rlc-migrated-pages-buro-tasks-tsx-646">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)} />
          
          Nur offene
        </label>

        <button onClick={addQuick} className="rlc-migrated-pages-buro-tasks-tsx-647">
          + Neue Aufgabe
        </button>

        <div className={rlcClass(null, { marginLeft: "auto", ...badge })}>
          Offen: {openCount}
        </div>
      </div>

      <table className={rlcClass(null, tableStyle)}>
        <thead>
          <tr>
            <th className={rlcClass(null, head)}>Titel</th>
            <th className={rlcClass(null, head)}>Fällig</th>
            <th className={rlcClass(null, head)}>Projekt</th>
            <th className={rlcClass(null, head)}>Zuständig</th>
            <th className={rlcClass(null, head)}>Prio</th>
            <th className={rlcClass(null, head)}>Erledigt</th>
            <th className={rlcClass(null, head)}>Aktion</th>
          </tr>
        </thead>

        <tbody>
          {filtered.map((t) =>
          <tr key={t.id}>
              <td className={rlcClass(null, cell)}>{t.title || "—"}</td>
              <td className={rlcClass(null, cell)}>{t.due || "—"}</td>
              <td className={rlcClass(null, cell)}>{t.projectId || "—"}</td>
              <td className={rlcClass(null, cell)}>{t.assignee || "—"}</td>
              <td className={rlcClass(null, cell)}>{t.priority || "—"}</td>

              <td className={rlcClass(null, cell)}>
                <input
                type="checkbox"
                checked={!!t.done}
                onChange={() => BuroAPI.toggleTask(t.id)} />
              
              </td>

              <td className={rlcClass(null, cell)}>
                <button
                onClick={() => editTask(t)} className="rlc-migrated-pages-buro-tasks-tsx-648">

                
                  Bearbeiten
                </button>

                <button
                onClick={() =>
                BuroAPI.updateTask(t.id, { done: true })
                }
                disabled={t.done} className="rlc-migrated-pages-buro-tasks-tsx-649">

                
                  ✓ Abschließen
                </button>
              </td>
            </tr>
          )}

          {filtered.length === 0 &&
          <tr>
              <td className={rlcClass(null, cell)} colSpan={7}>
                Keine Aufgaben gefunden.
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>);

}
