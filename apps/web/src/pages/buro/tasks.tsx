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

  const [canEdit,setCanEdit]=React.useState(false),[dirty,setDirty]=React.useState(false),[history,setHistory]=React.useState<any>();
  const generation=React.useRef(0),owner=React.useRef(projectId),loadedOwner=React.useRef(''),writeGuard=React.useRef(false);owner.current=projectId;
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
    const n=++generation.current;loadedOwner.current='';setCanEdit(false);setItems([]);setSelectedId(null);setHistory(undefined);setDirty(false);
    if (!projectId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await request<{
        ok: true;
        items: Task[]; canEdit: boolean;
      }>(
        `/api/tasks?projectId=${encodeURIComponent(projectId)}`
      );

      if(n!==generation.current||owner.current!==projectId)return;
      loadedOwner.current=projectId;setCanEdit(data.canEdit===true);setItems(data.items || []);

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
      if(n===generation.current&&owner.current===projectId)setError(e?.message || 'Aufgaben konnten nicht geladen werden.');
    } finally {
      if(n===generation.current)setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setDirty(false);setHistory(undefined);
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

  async function mutate(operation:()=>Promise<void>){
    if(!canEdit||saving||writeGuard.current||loadedOwner.current!==projectId)return;
    writeGuard.current=true;setSaving(true);setError('');const id=projectId;
    try{await operation();}catch(e:any){if(owner.current===id)setError(e.message||'Änderung fehlgeschlagen.');}
    finally{writeGuard.current=false;setSaving(false);}
  }
  async function createTask(){
    if(dirty&&!window.confirm('Ungespeicherte Änderungen verwerfen?'))return;
    await mutate(async()=>{const data=await request<{item:Task}>('/api/tasks',{method:'POST',body:JSON.stringify({projectId,title:'Neue Aufgabe',priority:'med',tags:[]})});if(owner.current!==projectId)return;await load();if(owner.current===projectId)setSelectedId(data.item.id);});
  }
  async function saveTask(){if(!selected)return;await mutate(async()=>{
    const data=await request<{item:Task}>(`/api/tasks/${encodeURIComponent(selected.id)}`,{method:'PUT',body:JSON.stringify({expectedUpdatedAt:selected.updatedAt,title:form.title,due:form.due||null,assignee:form.assignee||null,priority:form.priority,tags:form.tags.split(',').map(x=>x.trim()).filter(Boolean)})});
    if(owner.current!==projectId)return;setItems(rows=>rows.map(row=>row.id===data.item.id?data.item:row));setDirty(false);
  });}
  async function toggleDone(task:Task){if(dirty){setError('Änderungen zuerst speichern.');return;}await mutate(async()=>{
    const data=await request<{item:Task}>(`/api/tasks/${encodeURIComponent(task.id)}`,{method:'PUT',body:JSON.stringify({done:!task.done,expectedUpdatedAt:task.updatedAt})});if(owner.current===projectId)setItems(rows=>rows.map(row=>row.id===data.item.id?data.item:row));
  });}
  async function moveTaskToCalendar(){if(!selected)return;if(dirty){setError('Änderungen zuerst speichern.');return;}await mutate(async()=>{
    const result=await request<{created:boolean}>(`/api/tasks/${encodeURIComponent(selected.id)}/calendar`,{method:'POST',body:JSON.stringify({expectedUpdatedAt:selected.updatedAt})});if(owner.current!==projectId)return;window.alert(result.created?'Ganztägiger Termin wurde erstellt.':'Termin ist bereits vorhanden. Änderungen im Kalender bleiben erhalten.');
  });}
  async function removeTask(){if(!selected||!window.confirm(`Aufgabe "${selected.title}" löschen? Zugehörige Termine bleiben erhalten.`))return;await mutate(async()=>{
    await request(`/api/tasks/${encodeURIComponent(selected.id)}`,{method:'DELETE',body:JSON.stringify({expectedUpdatedAt:selected.updatedAt})});if(owner.current===projectId)await load();
  });}
  async function showHistory(){if(!selected)return;const id=selected.id,p=projectId;try{const data=await request<{items:any[]}>(`/api/tasks/${encodeURIComponent(id)}/history`);if(owner.current===p)setHistory({id,items:data.items});}catch(e:any){if(owner.current===p)setError(e.message);}}
  React.useEffect(()=>{const fn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',fn);return()=>window.removeEventListener('beforeunload',fn);},[dirty]);

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
            disabled={!canEdit || !projectId || saving || loading}
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

        <button className="btn" onClick={() => {if(!dirty||window.confirm('Ungespeicherte Änderungen verwerfen?'))void load();}}>
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
                onClick={() => {if(!saving&&(!dirty||window.confirm('Ungespeicherte Änderungen verwerfen?')))setSelectedId(task.id);}}
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

              <fieldset disabled={!canEdit || saving || loading || loadedOwner.current!==projectId} onChangeCapture={()=>setDirty(true)} style={{border:0,padding:0,margin:0,minWidth:0}}>
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
              </fieldset>
              <button className="btn" onClick={()=>void showHistory()}>Änderungsverlauf</button>
              {dirty&&<p className="muted">Ungespeicherte Änderungen</p>}
              {history?.id===selected.id&&<div className="card">{history.items.length===0?'Noch keine protokollierten Änderungen.':history.items.map((h:any)=><div key={h.id}>{new Date(h.createdAt).toLocaleString('de-DE')} · {h.action}</div>)}</div>}
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
