import React from "react";

import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

type Zoom = "day" | "week" | "month";

type PlanTask = {
  id: string;
  name: string;
  dauerTage: number;
  start: string | null;
  end: string | null;
  progress: number;
  notes: string;
  assignee: string;
  milestone: boolean;
  deps: string[];
  ressourcen: Record<string, number>;
};

type LoadResponse = {
  start?: string;
  tasks?: PlanTask[];
  capacity?: Record<string, number>;
  version?: string;
  canEdit?: boolean;
};

function getToken() {
  try {
    return (
      localStorage.getItem("rlc_token") ||
      JSON.parse(
        localStorage.getItem("rlc_auth") || "{}"
      )?.token ||
      ""
    );
  } catch {
    return "";
  }
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = getToken();

  const res = await fetch(apiUrl(path), {
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

  const text = await res.text();

  let data: any = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      text ||
      `HTTP ${res.status}`
    );
  }

  return data as T;
}

function uuid() {
  return crypto.randomUUID();
}

function dateInput(value?: string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function isoDate(value: string) {
  if (!value) return null;

  return new Date(
    `${value}T12:00:00.000Z`
  ).toISOString();
}

function addDays(value: Date, days: number) {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d;
}

function dayDiff(a: string, b: string) {
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();

  return Math.max(
    1,
    Math.round(
      (end - start) / 86400000
    ) + 1
  );
}

function clamp(value: number) {
  return Math.max(
    0,
    Math.min(100, value)
  );
}

function weekNumber(date: Date) {
  const d = new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    )
  );

  const day =
    (d.getUTCDay() + 6) % 7;

  d.setUTCDate(
    d.getUTCDate() - day + 3
  );

  const first =
    new Date(
      Date.UTC(
        d.getUTCFullYear(),
        0,
        4
      )
    );

  return (
    1 +
    Math.round(
      (
        (
          d.getTime() -
          first.getTime()
        ) /
        86400000 -
        3 +
        (
          first.getUTCDay() + 6
        ) %
        7
      ) /
      7
    )
  );
}

function displayDate(value?: string | null) {
  if (!value) return "—";

  return new Date(value)
    .toLocaleDateString("de-DE");
}

export default function Bauzeitenplan() {
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();

  const projectId =
    String(project?.id || "").trim();

  const projectLabel =
    [project?.code, project?.name]
      .filter(Boolean)
      .join(" · ") ||
    projectId ||
    "—";

  const [tasks, setTasks] =
    React.useState<PlanTask[]>([]);

  const [capacity, setCapacity] =
    React.useState<Record<string, number>>({});

  const [planStart, setPlanStart] =
    React.useState(
      new Date()
        .toISOString()
        .slice(0, 10)
    );

  const [selectedId, setSelectedId] =
    React.useState<string | null>(null);

  const [query, setQuery] =
    React.useState("");

  const [zoom, setZoom] =
    React.useState<Zoom>("week");

  const [loading, setLoading] =
    React.useState(false);

  const [saving, setSaving] =
    React.useState(false);

  const [dirty, setDirty] =
    React.useState(false);

  const [error, setError] =
    React.useState("");

  const [version,setVersion]=React.useState(''),[canEdit,setCanEdit]=React.useState(false),[history,setHistory]=React.useState<any>();
  const generation=React.useRef(0),saveGuard=React.useRef(false),owner=React.useRef(projectId),versionRef=React.useRef(version),loadedOwner=React.useRef('');owner.current=projectId;versionRef.current=version;
  const signature=JSON.stringify({start:planStart,tasks,capacity}),signatureRef=React.useRef(signature);signatureRef.current=signature;
  const selected =
    tasks.find(
      (task) => task.id === selectedId
    ) || null;

  const load = React.useCallback(async () => {
    const n=++generation.current;loadedOwner.current="";setVersion("");setCanEdit(false);setTasks([]);setCapacity({});setDirty(false);setSelectedId(null);
    if (!projectId) {
      setTasks([]);
      setSelectedId(null);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data =
        await request<LoadResponse>(
          "/api/buero/bauzeitenplan/load",
          {
            method: "POST",
            body: JSON.stringify({
              projectId
            })
          }
        );

      if(n!==generation.current||owner.current!==projectId)return;
      setVersion(data.version||"");setCanEdit(data.canEdit===true);loadedOwner.current=projectId;
      const rows =
        Array.isArray(data.tasks)
          ? data.tasks.map((task) => ({
              id: task.id,
              name:
                task.name ||
                "Neuer Vorgang",
              dauerTage:
                Number(
                  task.dauerTage || 0
                ),
              start:
                task.start || null,
              end:
                task.end || null,
              progress:
                clamp(
                  Number(
                    task.progress || 0
                  )
                ),
              notes:
                task.notes || "",
              assignee:
                task.assignee || "",
              milestone:
                Boolean(
                  task.milestone
                ),
              deps:
                Array.isArray(task.deps)
                  ? task.deps
                  : [],
              ressourcen:
                task.ressourcen &&
                typeof task.ressourcen ===
                  "object"
                  ? task.ressourcen
                  : {}
            }))
          : [];

      setTasks(rows);
      setCapacity(
        data.capacity || {}
      );

      if (data.start) {
        setPlanStart(data.start);
      }

      setSelectedId((current) => {
        if (
          current &&
          rows.some(
            (task) =>
              task.id === current
          )
        ) {
          return current;
        }

        return rows[0]?.id || null;
      });

      setDirty(false);
    } catch (e: any) {
      if(n!==generation.current)return;
      setError(
        e?.message ||
        "Bauzeitenplan konnte nicht geladen werden."
      );
    } finally {
      if(n===generation.current)setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    setHistory(undefined);void load();return()=>{generation.current++;};
  }, [load]);

  function newTask() {
    if(!canEdit||loading||loadedOwner.current!==projectId)return;
    const start =
      new Date();

    const end =
      addDays(start, 4);

    const task: PlanTask = {
      id: uuid(),
      name: "Neuer Vorgang",
      dauerTage: 5,
      start: start.toISOString(),
      end: end.toISOString(),
      progress: 0,
      notes: "",
      assignee: "",
      milestone: false,
      deps: [],
      ressourcen: {}
    };

    setTasks((current) => [
      ...current,
      task
    ]);

    setSelectedId(task.id);
    setDirty(true);
  }

  function updateSelected(
    patch: Partial<PlanTask>
  ) {
    if (!selectedId||!canEdit||loading||loadedOwner.current!==projectId) return;

    setTasks((current) =>
      current.map((task) => {
        if (
          task.id !== selectedId
        ) {
          return task;
        }

        const next = {
          ...task,
          ...patch
        };

        if(patch.milestone===true&&next.start){next.end=next.start;}
        if (
          next.start &&
          next.end
        ) {
          next.dauerTage =
            dayDiff(
              next.start,
              next.end
            );
        }

        return next;
      })
    );

    setDirty(true);
  }

  async function handoffSelected(target: 'task'|'calendar') {
    if(!selected||saving||saveGuard.current||!canEdit||loadedOwner.current!==projectId)return;
    if(dirty){setError('Bitte Änderungen zuerst mit „Plan speichern“ speichern.');return;}
    saveGuard.current=true;setSaving(true);setError('');const ownerId=projectId;
    try {
      const result=await request<{created:boolean}>("/api/buero/bauzeitenplan/handoff",{method:'POST',body:JSON.stringify({projectId,taskId:selected.id,target,expectedVersion:versionRef.current})});
      if(owner.current!==ownerId)return;
      window.alert(result.created?(target==='task'?'Aufgabe wurde erstellt.':'Ganztägiger Termin wurde erstellt.'):'Verknüpfung ist bereits vorhanden. Änderungen im Zielmodul bleiben erhalten.');
    }catch(e:any){if(owner.current===ownerId)setError(e.message||'Übernahme fehlgeschlagen.');}
    finally{saveGuard.current=false;setSaving(false);}
  }

  function removeSelected() {
    if (!selected) return;

    if (
      !window.confirm(
        `Vorgang "${selected.name}" wirklich löschen?`
      )
    ) {
      return;
    }

    const remaining =
      tasks.filter(
        (task) =>
          task.id !== selected.id
      );

    setTasks(
      remaining.map((task) => ({
        ...task,
        deps:
          task.deps.filter(
            (id) =>
              id !== selected.id
          )
      }))
    );

    setSelectedId(
      remaining[0]?.id || null
    );

    setDirty(true);
  }

  async function save() {
    if (!projectId||!canEdit||loading||saveGuard.current||loadedOwner.current!==projectId||!versionRef.current) return;
    const sentSignature=signatureRef.current, sentVersion=versionRef.current;

    for (const task of tasks) {
      if (!task.name.trim()) {
        window.alert(
          "Jeder Vorgang benötigt einen Namen."
        );
        return;
      }

      if (
        task.start &&
        task.end &&
        new Date(task.end).getTime() <
          new Date(task.start).getTime()
      ) {
        window.alert(
          `Enddatum vor Startdatum: ${task.name}`
        );
        return;
      }
    }

    saveGuard.current=true;setSaving(true);
    setError("");

    try {
      const data=await request<LoadResponse>(
        "/api/buero/bauzeitenplan/save",
        {
          method: "POST",
          body: JSON.stringify({
            projectId,
            start: planStart,
            tasks,
            capacity,expectedVersion:sentVersion
          })
        }
      );

      if(owner.current!==projectId)return;
      versionRef.current=data.version||"";setVersion(data.version||"");
      if(signatureRef.current===sentSignature){setTasks(data.tasks||tasks);setCapacity(data.capacity||capacity);setDirty(false);}else{setDirty(true);}
    } catch (e: any) {
      if(owner.current!==projectId)return;
      setError(
        e?.message ||
        "Bauzeitenplan konnte nicht gespeichert werden."
      );
    } finally {
      saveGuard.current=false;setSaving(false);
    }
  }

  React.useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  async function showHistory(){const pid=projectId;try{const data:any=await request('/api/buero/bauzeitenplan/history',{method:'POST',body:JSON.stringify({projectId:pid})});if(owner.current===pid)setHistory(data);}catch(e:any){if(owner.current===pid)setError(e.message);}}

  const filtered =
    React.useMemo(() => {
      const q =
        query.trim().toLowerCase();

      return [...tasks]
        .filter((task) => {
          if (!q) return true;

          return [
            task.name,
            task.assignee,
            task.notes
          ]
            .join(" ")
            .toLowerCase()
            .includes(q);
        })
        .sort((a, b) => {
          const aa =
            a.start
              ? new Date(
                  a.start
                ).getTime()
              : Number.MAX_SAFE_INTEGER;

          const bb =
            b.start
              ? new Date(
                  b.start
                ).getTime()
              : Number.MAX_SAFE_INTEGER;

          return aa - bb;
        });
    }, [tasks, query]);

  const completed =
    tasks.filter(
      (task) =>
        task.progress >= 100
    ).length;

  const milestones =
    tasks.filter(
      (task) =>
        task.milestone
    ).length;

  const averageProgress =
    tasks.length
      ? Math.round(
          tasks.reduce(
            (sum, task) =>
              sum +
              Number(
                task.progress || 0
              ),
            0
          ) /
          tasks.length
        )
      : 0;

  return (
    <div className="card">
      <header className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Büro & Verwaltung
          </div>

          <h1>Bauzeitenplan</h1>

          <p>
            Vorgänge, Termine, Abhängigkeiten und Baufortschritt
            zentral steuern · Projekt {projectLabel}
          </p>
        </div>

        <div className="rlc-page-hero__actions">
          <button
            className="rlc-page-hero__button"
            onClick={newTask}
            disabled={!projectId||loading||!canEdit}
          >
            + Neuer Vorgang
          </button>

          <button
            className="rlc-page-hero__button"
            onClick={() =>
              void save()
            }
            disabled={
              !projectId || loading || !canEdit ||
              saving ||
              !dirty
            }
          >
            {saving
              ? "Speichert..."
              : dirty
                ? "Plan speichern"
                : "Gespeichert"}
          </button>
        </div>
      </header>

      <div className="rlc-page-toolbar"><span className="muted">{canEdit?'Änderungen mit „Plan speichern“ sichern. Neue Änderungen während des Speicherns bleiben lokal erhalten.':'Plan in Leseansicht.'}</span><button className="btn" disabled={loading||saving||!version} onClick={()=>void showHistory()}>Änderungsverlauf</button></div>
      {history&&<section className="card"><h2>Planverlauf</h2><button className="btn" onClick={()=>setHistory(undefined)}>Schließen</button><p className="muted">Bis zu 100 Änderungen und Kalenderübernahmen; ältere Pläne ab der nächsten Änderung.</p>{history.items.map((h:any)=><p key={h.id}>{new Date(h.createdAt).toLocaleString('de-DE',{timeZone:'Europe/Berlin'})} · {h.action==='PLAN_HANDOFF_CREATE'?`Kalenderübernahme: ${h.meta?.after?.sourceTask?.name||'Vorgang'}`:`${h.meta?.after?.tasks?.length||0} Vorgänge · Start ${h.meta?.before?.start||'–'} → ${h.meta?.after?.start||'–'}`}</p>)}</section>}
      {error ? (
        <div
          className="card"
          style={{
            marginBottom: 10,
            borderColor: "#dc2626"
          }}
        >
          {error}
        </div>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4,minmax(0,1fr))",
          gap: 10,
          marginBottom: 10
        }}
      >
        <Kpi
          label="Vorgänge"
          value={tasks.length}
        />

        <Kpi
          label="Erledigt"
          value={completed}
        />

        <Kpi
          label="Meilensteine"
          value={milestones}
        />

        <Kpi
          label="Fortschritt"
          value={`${averageProgress}%`}
        />
      </section>

      <div className="rlc-page-toolbar">
        <input
          className="rlc-page-toolbar__search"
          value={query}
          onChange={(e) =>
            setQuery(e.target.value)
          }
          placeholder="Vorgang, Verantwortlicher oder Notiz suchen..."
        />

        <div
          style={{
            display: "flex",
            gap: 5,
            marginLeft: "auto"
          }}
        >
          <ZoomButton
            active={zoom === "day"}
            onClick={() =>
              setZoom("day")
            }
          >
            Tag
          </ZoomButton>

          <ZoomButton
            active={zoom === "week"}
            onClick={() =>
              setZoom("week")
            }
          >
            Woche
          </ZoomButton>

          <ZoomButton
            active={zoom === "month"}
            onClick={() =>
              setZoom("month")
            }
          >
            Monat
          </ZoomButton>
        </div>

        <button
          className="btn"
          onClick={() => {if(dirty&&!window.confirm("Ungespeicherte Änderungen verwerfen und aktuellen Serverstand laden?"))return;void load();}}
          disabled={loading||saving}
        >
          Aktualisieren
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "300px minmax(620px,1fr) 315px",
          gap: 10,
          alignItems: "start"
        }}
      >
        <section
          className="card"
          style={{
            padding: 0,
            overflow: "hidden",
            height: 520,
            display: "flex",
            flexDirection: "column"
          }}
        >
          <div className="rlc-page-section-head">
            <strong>Vorgänge</strong>

            <span>
              {filtered.length}
            </span>
          </div>

          <div
            className="rlc-page-document-list"
            style={{
              flex: 1,
              overflowY: "auto"
            }}
          >
            {filtered.map((task) => (
              <button
                key={task.id}
                type="button"
                className={
                  selectedId === task.id
                    ? "rlc-page-document-row is-active"
                    : "rlc-page-document-row"
                }
                onClick={() =>
                  setSelectedId(
                    task.id
                  )
                }
              >
                <div className="rlc-page-document-icon">
                  {task.milestone
                    ? "◆"
                    : "V"}
                </div>

                <div className="rlc-page-document-copy">
                  <strong>
                    {task.name}
                  </strong>

                  <div className="rlc-page-document-meta">
                    <span>
                      {displayDate(
                        task.start
                      )}
                    </span>

                    <span>
                      {displayDate(
                        task.end
                      )}
                    </span>

                    <span>
                      {task.progress}%
                    </span>
                  </div>
                </div>
              </button>
            ))}

            {!loading &&
            !filtered.length ? (
              <div
                style={{
                  padding: 20,
                  textAlign: "center",
                  color: "#64748b"
                }}
              >
                Keine Vorgänge vorhanden.
              </div>
            ) : null}
          </div>
        </section>

        <section
          className="card"
          style={{
            padding: 0,
            overflow: "auto",
            height: 520
          }}
        >
          <Gantt
            tasks={filtered}
            zoom={zoom}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </section>

        <aside
          className="card"
          style={{
            padding: 0,
            position: "sticky",
            top: 10,
            height: 520,
            overflowY: "auto",
            overflowX: "hidden"
          }}
        >
          <fieldset disabled={!canEdit||loading} style={{border:0,padding:0,margin:0,minWidth:0}}>

          {!selected ? (
            <div
              style={{
                padding: 24,
                color: "#64748b",
                textAlign: "center"
              }}
            >
              Vorgang auswählen oder neu anlegen.
            </div>
          ) : (
            <>
              <div className="rlc-page-section-head">
                <strong>
                  Vorgang bearbeiten
                </strong>

                <span>
                  {selected.progress}%
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 14
                }}
              >
                <Field label="Vorgang">
                  <input
                    value={selected.name}
                    onChange={(e) =>
                      updateSelected({
                        name:
                          e.target.value
                      })
                    }
                  />
                </Field>

                <Field label="Verantwortlich">
                  <input
                    value={
                      selected.assignee
                    }
                    onChange={(e) =>
                      updateSelected({
                        assignee:
                          e.target.value
                      })
                    }
                    placeholder="Mitarbeiter / Bauleiter"
                  />
                </Field>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1fr 1fr",
                    gap: 8
                  }}
                >
                  <Field label="Start">
                    <input
                      type="date"
                      value={dateInput(
                        selected.start
                      )}
                      onChange={(e) =>
                        updateSelected({
                          start:
                            isoDate(
                              e.target.value
                            )
                        })
                      }
                    />
                  </Field>

                  <Field label="Ende">
                    <input
                      type="date"
                      value={dateInput(
                        selected.end
                      )}
                      onChange={(e) =>
                        updateSelected({
                          end:
                            isoDate(
                              e.target.value
                            )
                        })
                      }
                    />
                  </Field>
                </div>

                <Field label="Fortschritt">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1fr 60px",
                      gap: 8,
                      alignItems: "center"
                    }}
                  >
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={
                        selected.progress
                      }
                      onChange={(e) =>
                        updateSelected({
                          progress:
                            clamp(
                              Number(
                                e.target.value
                              )
                            )
                        })
                      }
                    />

                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={
                        selected.progress
                      }
                      onChange={(e) =>
                        updateSelected({
                          progress:
                            clamp(
                              Number(
                                e.target.value
                              )
                            )
                        })
                      }
                    />
                  </div>
                </Field>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: 13
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      selected.milestone
                    }
                    onChange={(e) =>
                      updateSelected({
                        milestone:
                          e.target.checked
                      })
                    }
                  />

                  Meilenstein
                </label>

                <Field label="Abhängigkeiten">
                  <select
                    multiple
                    value={
                      selected.deps
                    }
                    onChange={(e) =>
                      updateSelected({
                        deps:
                          Array.from(
                            e.target
                              .selectedOptions
                          ).map(
                            (option) =>
                              option.value
                          )
                      })
                    }
                    style={{
                      minHeight: 90
                    }}
                  >
                    {tasks
                      .filter(
                        (task) =>
                          task.id !==
                          selected.id
                      )
                      .map((task) => (
                        <option
                          key={task.id}
                          value={task.id}
                        >
                          {task.name}
                        </option>
                      ))}
                  </select>
                </Field>

                <Field label="Notizen">
                  <textarea
                    value={
                      selected.notes
                    }
                    onChange={(e) =>
                      updateSelected({
                        notes:
                          e.target.value
                      })
                    }
                    style={{
                      minHeight: 100,
                      resize: "vertical"
                    }}
                  />
                </Field>
              </div>

              <div
                style={{
                  padding:
                    "0 14px 14px",
                  display: "flex",
                  gap: 8
                }}
              >
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    void save()
                  }
                  disabled={
                    saving || !dirty
                  }
                >
                  Speichern
                </button>

                <button
                  className="btn"
                  onClick={() => void handoffSelected('calendar')}
                  disabled={saving || dirty}
                >
                  In Kalender übernehmen
                </button>

                <button
                  className="btn"
                  onClick={() =>
                    void handoffSelected('task')
                  }
                  disabled={saving || dirty}
                >
                  Als Aufgabe erstellen
                </button>

                <button
                  className="btn"
                  onClick={
                    removeSelected
                  }
                >
                  Löschen
                </button>
              </div>
            </>
          )}
          </fieldset>
        </aside>
      </div>
    </div>
  );
}

function Gantt({
  tasks,
  zoom,
  selectedId,
  onSelect
}: {
  tasks: PlanTask[];
  zoom: Zoom;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const dated =
    tasks.filter(
      (task) =>
        task.start &&
        task.end
    );

  const today =
    new Date();

  const min =
    dated.length
      ? new Date(
          Math.min(
            ...dated.map(
              (task) =>
                new Date(
                  task.start!
                ).getTime()
            )
          )
        )
      : addDays(today, -7);

  const max =
    dated.length
      ? new Date(
          Math.max(
            ...dated.map(
              (task) =>
                new Date(
                  task.end!
                ).getTime()
            )
          )
        )
      : addDays(today, 21);

  const start =
    addDays(min, -5);

  const end =
    addDays(max, 7);

  const dayWidth =
    zoom === "day"
      ? 34
      : zoom === "week"
        ? 17
        : 8;

  const totalDays =
    Math.max(
      1,
      Math.ceil(
        (
          end.getTime() -
          start.getTime()
        ) /
        86400000
      )
    );

  const labelWidth = 150;

  const width =
    labelWidth +
    totalDays * dayWidth;

  const rowHeight = 42;

  const xFor = (
    value: string
  ) =>
    labelWidth +
    (
      (
        new Date(value).getTime() -
        start.getTime()
      ) /
      86400000
    ) *
      dayWidth;

  const marks: {
    x: number;
    label: string;
  }[] = [];

  const cursor =
    new Date(start);

  while (cursor <= end) {
    const x =
      labelWidth +
      (
        (
          cursor.getTime() -
          start.getTime()
        ) /
        86400000
      ) *
        dayWidth;

    let label = "";

    if (zoom === "day") {
      label =
        cursor.toLocaleDateString(
          "de-DE",
          {
            day: "2-digit",
            month: "2-digit"
          }
        );

      cursor.setDate(
        cursor.getDate() + 1
      );
    } else if (zoom === "week") {
      label =
        `KW ${weekNumber(cursor)}`;

      cursor.setDate(
        cursor.getDate() + 7
      );
    } else {
      label =
        cursor.toLocaleDateString(
          "de-DE",
          {
            month: "short",
            year: "2-digit"
          }
        );

      cursor.setMonth(
        cursor.getMonth() + 1,
        1
      );
    }

    marks.push({
      x,
      label
    });
  }

  const height =
    Math.max(
      518,
      38 +
      tasks.length *
        rowHeight
    );

  return (
    <svg
      width={width}
      height={height}
      style={{
        display: "block",
        minWidth: "100%"
      }}
    >
      <rect
        x={0}
        y={0}
        width={width}
        height={36}
        fill="#f8fafc"
      />

      <rect
        x={0}
        y={0}
        width={labelWidth}
        height={height}
        fill="#fff"
        stroke="#e2e8f0"
      />

      <text
        x={12}
        y={23}
        fontSize="12"
        fontWeight="700"
        fill="#334155"
      >
        Vorgang
      </text>

      {marks.map(
        (mark, index) => (
          <g key={index}>
            <line
              x1={mark.x}
              y1={0}
              x2={mark.x}
              y2={height}
              stroke="#e8eef5"
            />

            <text
              x={mark.x + 5}
              y={23}
              fontSize="10"
              fill="#64748b"
            >
              {mark.label}
            </text>
          </g>
        )
      )}

      {tasks.map(
        (task, index) => {
          const y =
            36 +
            index *
              rowHeight;

          const selected =
            task.id ===
            selectedId;

          return (
            <g
              key={task.id}
              onClick={() =>
                onSelect(task.id)
              }
              style={{
                cursor: "pointer"
              }}
            >
              <rect
                x={0}
                y={y}
                width={width}
                height={rowHeight}
                fill={
                  selected
                    ? "#f3f7ff"
                    : index % 2
                      ? "#fbfdff"
                      : "#fff"
                }
              />

              <line
                x1={0}
                y1={y + rowHeight}
                x2={width}
                y2={y + rowHeight}
                stroke="#edf2f7"
              />

              <text
                x={12}
                y={y + 25}
                fontSize="11"
                fontWeight={
                  selected
                    ? "700"
                    : "500"
                }
                fill="#0f172a"
              >
                {task.name.length > 20
                  ? task.name.slice(
                      0,
                      18
                    ) + "…"
                  : task.name}
              </text>

              {task.start &&
              task.end ? (
                task.milestone ? (
                  <Milestone
                    x={xFor(
                      task.start
                    )}
                    y={
                      y +
                      rowHeight / 2
                    }
                  />
                ) : (
                  <TaskBar
                    task={task}
                    x={xFor(
                      task.start
                    )}
                    y={y + 10}
                    width={Math.max(
                      9,
                      (
                        (
                          new Date(
                            task.end
                          ).getTime() -
                          new Date(
                            task.start
                          ).getTime()
                        ) /
                        86400000 +
                        1
                      ) *
                        dayWidth
                    )}
                  />
                )
              ) : null}
            </g>
          );
        }
      )}

      {(() => {
        const x =
          labelWidth +
          (
            (
              today.getTime() -
              start.getTime()
            ) /
            86400000
          ) *
            dayWidth;

        return (
          <line
            x1={x}
            y1={0}
            x2={x}
            y2={height}
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        );
      })()}
    </svg>
  );
}

function TaskBar({
  task,
  x,
  y,
  width
}: {
  task: PlanTask;
  x: number;
  y: number;
  width: number;
}) {
  const progressWidth =
    width *
    clamp(task.progress) /
    100;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={22}
        rx={5}
        fill="#dbeafe"
        stroke="#60a5fa"
      />

      <rect
        x={x}
        y={y}
        width={progressWidth}
        height={22}
        rx={5}
        fill="#60a5fa"
      />

      <text
        x={x + 6}
        y={y + 15}
        fontSize="10"
        fontWeight="600"
        fill="#0f3f82"
      >
        {task.progress}%
      </text>
    </g>
  );
}

function Milestone({
  x,
  y
}: {
  x: number;
  y: number;
}) {
  const size = 8;

  return (
    <polygon
      points={`
        ${x},${y - size}
        ${x + size},${y}
        ${x},${y + size}
        ${x - size},${y}
      `}
      fill="#2563eb"
    />
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
    <div
      style={{
        display: "grid",
        gap: 5
      }}
    >
      <label
        style={{
          fontSize: 12,
          fontWeight: 650,
          color: "#334155"
        }}
      >
        {label}
      </label>

      {React.cloneElement(
        children,
        {
          style: {
            width: "100%",
            boxSizing:
              "border-box",
            ...(children.props
              ?.style || {})
          }
        }
      )}
    </div>
  );
}

function Kpi({
  label,
  value
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="muted">
        {label}
      </div>

      <strong
        style={{
          fontSize: 23
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function ZoomButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={
        active
          ? "btn btn-primary"
          : "btn"
      }
      onClick={onClick}
    >
      {children}
    </button>
  );
}
