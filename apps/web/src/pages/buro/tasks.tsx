import React from "react";

import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import BuroWorkTabs from "./BuroWorkTabs";

type Task = {
  id: string;
  projectId: string;
  title: string;
  due?: string | null;
  done: boolean;
  assignee?: string | null;
  priority: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

function getToken() {
  const keys = [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc_auth_token",
    "rlc_access_token",
    "rlc.auth.token",
    "rlc_mobile_token"
  ];

  for (const key of keys) {
    for (const storage of [localStorage, sessionStorage]) {
      const value = storage.getItem(key);
      if (value?.trim()) return value.trim();
    }
  }

  for (const key of [
    "rlc_auth",
    "auth",
    "user",
    "session",
    "rlc_session"
  ]) {
    for (const storage of [localStorage, sessionStorage]) {
      const raw = storage.getItem(key);
      if (!raw) continue;

      try {
        const value = JSON.parse(raw);
        const token =
          value?.token ??
          value?.accessToken ??
          value?.authToken ??
          value?.jwt ??
          value?.data?.token ??
          value?.data?.accessToken;

        if (typeof token === "string" && token.trim()) {
          return token.trim();
        }
      } catch {}
    }
  }

  return "";
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {}),
      ...(init?.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.ok === false) {
    throw new Error(
      data?.error ||
      data?.message ||
      `HTTP ${res.status}`
    );
  }

  return data as T;
}

function dateOnly(value?: string | null) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

export default function TasksPage() {
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();

  const projectId = String(project?.id || "").trim();

  const projectLabel =
    [project?.code, project?.name]
      .filter(Boolean)
      .join(" · ") ||
    projectId ||
    "—";

  const [items, setItems] = React.useState<Task[]>([]);
  const [selectedId, setSelectedId] =
    React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const [openOnly, setOpenOnly] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const selected =
    items.find((item) => item.id === selectedId) || null;

  const [form, setForm] = React.useState({
    title: "",
    due: "",
    assignee: "",
    priority: "med",
    tags: ""
  });

  const load = React.useCallback(async () => {
    if (!projectId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await request<{
        ok: true;
        items: Task[];
      }>(
        `/api/tasks?projectId=${encodeURIComponent(projectId)}`
      );

      setItems(data.items || []);

      setSelectedId((current) => {
        if (
          current &&
          data.items?.some((item) => item.id === current)
        ) {
          return current;
        }

        return data.items?.[0]?.id || null;
      });
    } catch (e: any) {
      setError(e?.message || "Aufgaben konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!selected) {
      setForm({
        title: "",
        due: "",
        assignee: "",
        priority: "med",
        tags: ""
      });
      return;
    }

    setForm({
      title: selected.title || "",
      due: dateOnly(selected.due),
      assignee: selected.assignee || "",
      priority: selected.priority || "med",
      tags: (selected.tags || []).join(", ")
    });
  }, [selectedId, selected?.updatedAt]);

  async function createTask() {
    if (!projectId) return;

    setSaving(true);

    try {
      const data = await request<{
        ok: true;
        item: Task;
      }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          title: "Neue Aufgabe",
          priority: "med",
          tags: []
        })
      });

      await load();
      setSelectedId(data.item.id);
    } catch (e: any) {
      setError(e?.message || "Aufgabe konnte nicht erstellt werden.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTask() {
    if (!selected) return;

    setSaving(true);

    try {
      await request(
        `/api/tasks/${encodeURIComponent(selected.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            title: form.title,
            due: form.due || null,
            assignee: form.assignee || null,
            priority: form.priority,
            tags: form.tags
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
          })
        }
      );

      await load();
    } catch (e: any) {
      setError(e?.message || "Aufgabe konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(task: Task) {
    await request(
      `/api/tasks/${encodeURIComponent(task.id)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          done: !task.done
        })
      }
    );

    await load();
  }

  async function moveTaskToCalendar() {
    if (!selected) return;

    if (!selected.due) {
      window.alert("Bitte zuerst ein Fälligkeitsdatum festlegen.");
      return;
    }

    const start = new Date(selected.due);

    if (Number.isNaN(start.getTime())) {
      window.alert("Das Fälligkeitsdatum ist ungültig.");
      return;
    }

    start.setHours(9, 0, 0, 0);

    const end = new Date(start);
    end.setHours(10, 0, 0, 0);

    try {
      await request("/api/calendar", {
        method: "POST",
        body: JSON.stringify({
          projectId: selected.projectId,
          title: selected.title,
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: false,
          attendees: [],
          notes: (selected as any).description || "",
          category: "Projekt",
          busyStatus: "busy",
          reminderMinutes: 15,
          sourceType: "task",
          sourceId: selected.id
        })
      });

      window.location.assign("/buro/outlook");
    } catch (e: any) {
      setError(
        e?.message ||
        "Termin konnte nicht erstellt werden."
      );
    }
  }

  async function removeTask() {
    if (!selected) return;

    if (!window.confirm(`Aufgabe "${selected.title}" löschen?`)) {
      return;
    }

    await request(
      `/api/tasks/${encodeURIComponent(selected.id)}`,
      { method: "DELETE" }
    );

    setSelectedId(null);
    await load();
  }

  const filtered = items.filter((item) => {
    const q = query.toLowerCase().trim();

    const text = [
      item.title,
      item.assignee || "",
      ...(item.tags || [])
    ].join(" ").toLowerCase();

    return (
      (!q || text.includes(q)) &&
      (!openOnly || !item.done)
    );
  });

  const openCount =
    items.filter((item) => !item.done).length;

  return (
    <div className="card">
      <header className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Büro & Verwaltung
          </div>

          <h1>Aufgaben</h1>

          <p>
            Aufgaben, Zuständigkeiten und Termine zentral verwalten
            · Projekt {projectLabel}
          </p>
        </div>

        <div className="rlc-page-hero__actions">
          <button
            className="rlc-page-hero__button"
            onClick={() => void createTask()}
            disabled={!projectId || saving}
          >
            + Neue Aufgabe
          </button>
        </div>
      </header>

      <BuroWorkTabs active="aufgaben" />

      {error ? (
        <div className="card">{error}</div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 10,
          marginBottom: 12
        }}
      >
        <Kpi label="Gesamt" value={items.length} />
        <Kpi label="Offen" value={openCount} />
        <Kpi
          label="Erledigt"
          value={items.length - openCount}
        />
      </div>

      <div className="rlc-page-toolbar">
        <input
          className="rlc-page-toolbar__search"
          placeholder="Aufgabe, Zuständiger oder Tag suchen..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <label>
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
          />{" "}
          Nur offene
        </label>

        <button className="btn" onClick={() => void load()}>
          Aktualisieren
        </button>
      </div>

      <div
        className="rlc-page-workspace"
        style={{
          gridTemplateColumns: "360px minmax(0,1fr)",
          alignItems: "start"
        }}
      >
        <section className="rlc-page-list">
          <div className="rlc-page-section-head">
            <strong>Aufgaben</strong>
            <span>{filtered.length} Einträge</span>
          </div>

          <div className="rlc-page-document-list">
            {filtered.map((task) => (
              <button
                key={task.id}
                className={
                  selectedId === task.id
                    ? "rlc-page-document-row is-active"
                    : "rlc-page-document-row"
                }
                onClick={() => setSelectedId(task.id)}
              >
                <div className="rlc-page-document-icon">
                  {task.done ? "✓" : "A"}
                </div>

                <div className="rlc-page-document-copy">
                  <strong>{task.title}</strong>

                  <div className="rlc-page-document-meta">
                    <span>{task.assignee || "Nicht zugewiesen"}</span>
                    <span>{dateOnly(task.due) || "Kein Termin"}</span>
                    <span>Prio {task.priority}</span>
                  </div>
                </div>
              </button>
            ))}

            {!loading && filtered.length === 0 ? (
              <div className="rlc-page-empty">
                Keine Aufgaben vorhanden.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rlc-page-detail">
          {!selected ? (
            <div className="rlc-page-empty">
              Aufgabe auswählen oder neu anlegen.
            </div>
          ) : (
            <>
              <div className="rlc-page-detail-head">
                <div className="rlc-page-detail-kicker">
                  Aufgabe
                </div>

                <h2>{selected.title}</h2>
              </div>

              <div className="rlc-page-detail-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => void saveTask()}
                >
                  Speichern
                </button>

                <button
                  className="btn"
                  onClick={() => void toggleDone(selected)}
                >
                  {selected.done
                    ? "Wieder öffnen"
                    : "Abschließen"}
                </button>

                <button
                  className="btn"
                  onClick={() => void moveTaskToCalendar()}
                >
                  In Kalender übernehmen
                </button>

                <button
                  className="btn"
                  onClick={() => void removeTask()}
                >
                  Löschen
                </button>
              </div>

              <div
                style={{
                  padding: 18,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14
                }}
              >
                <Field label="Titel">
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                  />
                </Field>

                <Field label="Fällig">
                  <input
                    type="date"
                    value={form.due}
                    onChange={(e) =>
                      setForm({ ...form, due: e.target.value })
                    }
                  />
                </Field>

                <Field label="Zuständig">
                  <input
                    value={form.assignee}
                    onChange={(e) =>
                      setForm({ ...form, assignee: e.target.value })
                    }
                  />
                </Field>

                <Field label="Priorität">
                  <select
                    value={form.priority}
                    onChange={(e) =>
                      setForm({ ...form, priority: e.target.value })
                    }
                  >
                    <option value="low">Niedrig</option>
                    <option value="med">Mittel</option>
                    <option value="high">Hoch</option>
                  </select>
                </Field>

                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Tags">
                    <input
                      value={form.tags}
                      onChange={(e) =>
                        setForm({ ...form, tags: e.target.value })
                      }
                      placeholder="kommagetrennt"
                    />
                  </Field>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <strong style={{ fontSize: 23 }}>{value}</strong>
    </div>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactElement<any>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <strong style={{ fontSize: 12 }}>{label}</strong>

      {React.cloneElement(children, {
        style: {
          width: "100%",
          boxSizing: "border-box",
          ...(children.props?.style || {})
        }
      })}
    </div>
  );
}
