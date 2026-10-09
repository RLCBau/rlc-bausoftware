import React from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";

type Employee = {
  id: string;
  name: string;
  projects?: string[];
};

type Machine = {
  id: string;
  name: string;
  serial?: string | null;
  projectId?: string | null;
};

type Assignment = {
  id: string;
  resourceType: "EMPLOYEE" | "MACHINE";
  resourceId: string;
  date: string;
  projectId?: string | null;
  hours: number;
  notes?: string | null;
  isNew?: boolean;
  updatedAt?: string;
};

type ActualTime = {
  date: string;
  employeeName: string;
  hours: number;
  projectId: string;
};

type ProjectRow = {
  id: string;
  code?: string | null;
  name?: string | null;
  number?: string | null;
  client?: string | null;
  place?: string | null;
};

function authHeaders(): Record<string, string> {
  for (const key of [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc_auth_token"
  ]) {
    const token =
      localStorage.getItem(key) ||
      sessionStorage.getItem(key);

    if (token?.trim()) {
      return { Authorization: `Bearer ${token.trim()}` };
    }
  }

  return {};
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(init?.headers || {})
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(
      payload?.message ||
      payload?.error ||
      `HTTP ${response.status}`
    );
  }

  return payload;
}

function monday(value = new Date()) {
  const date = new Date(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, amount: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function ymd(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function kw(value: Date) {
  const t = new Date(
    Date.UTC(
      value.getFullYear(),
      value.getMonth(),
      value.getDate()
    )
  );

  const n = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - n + 3);

  const first = new Date(
    Date.UTC(t.getUTCFullYear(), 0, 4)
  );

  return (
    1 +
    Math.round(
      (
        (t.getTime() - first.getTime()) / 86400000 -
        3 +
        (first.getUTCDay() + 6) % 7
      ) / 7
    )
  );
}

const field: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d7deea",
  borderRadius: 7,
  padding: "7px 8px",
  background: "#fff",
  fontSize: 12
};

function fmtHours(value: number) {
  return value.toFixed(2).replace(".", ",");
}

const projectPalette = [
  "#2563eb",
  "#059669",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#be123c",
  "#4f46e5",
  "#15803d",
  "#b45309",
  "#0369a1"
];

function projectColor(key: string) {
  let hash = 0;

  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }

  return projectPalette[Math.abs(hash) % projectPalette.length];
}

export default function Ressourcenplanung() {
  const navigate = useNavigate();

  const [week, setWeek] = React.useState(monday());
  const [people, setPeople] = React.useState<Employee[]>([]);
  const [machines, setMachines] = React.useState<Machine[]>([]);
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const assignmentsRef=React.useRef(assignments);assignmentsRef.current=assignments;
  const [actualTimes, setActualTimes] = React.useState<ActualTime[]>([]);
  const [serverProjects, setServerProjects] = React.useState<ProjectRow[]>([]);
  const [matrixDay, setMatrixDay] = React.useState(0);
  const [query, setQuery] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [showWeekend, setShowWeekend] = React.useState(false);
  const [dirty, setDirty] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [nonWorking,setNonWorking]=React.useState<any[]>([]);
  const [calendarError,setCalendarError]=React.useState("");
  const [calendarLoading,setCalendarLoading]=React.useState(true);
  const [calendarRange,setCalendarRange]=React.useState("");

  const allDays = React.useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(week, n)),
    [week]
  );

  const visibleDays = React.useMemo(
    () => showWeekend ? allDays : allDays.slice(0, 5),
    [allDays, showWeekend]
  );

  const allDayKeys = React.useMemo(
    () => allDays.map(ymd),
    [allDays]
  );

  const from = allDayKeys[0];
  const to = allDayKeys[6];

  React.useEffect(()=>{let live=true;setNonWorking([]);setCalendarError("");setCalendarLoading(true);request(`/api/calendar/non-working-days?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then(d=>{if(live)setNonWorking(d.items||[]);}).catch(e=>{if(live)setCalendarError(e.message);}).finally(()=>{if(live){setCalendarLoading(false);setCalendarRange(from+":"+to);}});return()=>{live=false;};},[from,to]);
  const loadBase = React.useCallback(async () => {
    setError("");

    try {
      const [personal, machineData, plan, projectData] = await Promise.all([
        request("/api/personal/directory"),
        request("/api/resource-costs/machines"),
        request(
          `/api/resource-costs/assignments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        ),
        request("/api/projects")
      ]);

      const nextPeople = Array.isArray(personal?.items)
        ? personal.items
        : [];

      const nextMachines = Array.isArray(machineData?.items)
        ? machineData.items
        : [];

      const nextAssignments = Array.isArray(plan?.items)
        ? plan.items
        : [];

      setPeople(nextPeople);
      setMachines(nextMachines);
      setAssignments(nextAssignments);
      setServerProjects(
        Array.isArray(projectData?.projects)
          ? projectData.projects
          : []
      );
      setDirty(new Set());

      const projectIds = new Set<string>();

      for (const employee of nextPeople) {
        for (const project of employee.projects || []) {
          if (project) projectIds.add(project);
        }
      }

      for (const machine of nextMachines) {
        if (machine.projectId) projectIds.add(machine.projectId);
      }

      for (const assignment of nextAssignments) {
        if (assignment.projectId) {
          projectIds.add(assignment.projectId);
        }
      }

      const labor = await Promise.all(
        Array.from(projectIds).map(async (projectId) => {
          try {
            const data = await request(
              `/api/personal/labor-costs?projectId=${encodeURIComponent(projectId)}`
            );

            return (Array.isArray(data?.items) ? data.items : []).map(
              (item: any) => ({
                date: String(item.date || "").slice(0, 10),
                employeeName: String(item.employeeName || "").trim(),
                hours: Number(item.hours || 0),
                projectId
              })
            );
          } catch {
            return [];
          }
        })
      );

      setActualTimes(labor.flat());
    } catch (e: any) {
      setError(
        e?.message ||
        "Einsatzplanung konnte nicht geladen werden."
      );
    }
  }, [from, to]);

  React.useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const projects = React.useMemo(() => {
    const values = new Set<string>();

    for (const project of serverProjects) {
      const key = String(
        project.code ||
        project.number ||
        project.id ||
        ""
      ).trim();

      if (key) values.add(key);
    }

    for (const assignment of assignments) {
      if (assignment.projectId) {
        values.add(assignment.projectId);
      }
    }

    return Array.from(values).sort();
  }, [serverProjects, assignments]);

  const matrixProjects = React.useMemo(() => {
    return serverProjects
      .map((project) => ({
        ...project,
        key: String(
          project.code ||
          project.number ||
          project.id ||
          ""
        ).trim()
      }))
      .filter((project) => Boolean(project.key));
  }, [serverProjects]);

  const filteredPeople = React.useMemo(() => {
    const q = query.trim().toLocaleLowerCase("de-DE");

    return people.filter(
      (person) =>
        !q ||
        person.name
          .toLocaleLowerCase("de-DE")
          .includes(q)
    );
  }, [people, query]);

  const filteredMachines = React.useMemo(() => {
    const q = query.trim().toLocaleLowerCase("de-DE");

    return machines.filter(
      (machine) =>
        !q ||
        String(machine.name || machine.serial || "")
          .toLocaleLowerCase("de-DE")
          .includes(q)
    );
  }, [machines, query]);

  const assignmentsFor = React.useCallback(
    (
      resourceType: "EMPLOYEE" | "MACHINE",
      resourceId: string,
      date: string
    ) =>
      assignments.filter(
        (item) =>
          item.resourceType === resourceType &&
          item.resourceId === resourceId &&
          item.date === date &&
          (
            !projectFilter ||
            item.projectId === projectFilter
          )
      ),
    [assignments, projectFilter]
  );

  const planHours = React.useCallback(
    (
      resourceType: "EMPLOYEE" | "MACHINE",
      resourceId: string,
      date: string
    ) =>
      assignmentsFor(resourceType, resourceId, date).reduce(
        (sum, item) => sum + Number(item.hours || 0),
        0
      ),
    [assignmentsFor]
  );

  const actualHours = React.useCallback(
    (
      employeeName: string,
      date: string,
      projectId?: string | null
    ) => {
      const normalized =
        employeeName.trim().toLocaleLowerCase("de-DE");

      return actualTimes
        .filter(
          (item) =>
            item.date === date &&
            item.employeeName
              .trim()
              .toLocaleLowerCase("de-DE") === normalized &&
            (
              !projectId ||
              item.projectId === projectId
            )
        )
        .reduce(
          (sum, item) => sum + Number(item.hours || 0),
          0
        );
    },
    [actualTimes]
  );

  const addAssignment = React.useCallback(
    (
      resourceType: "EMPLOYEE" | "MACHINE",
      resourceId: string,
      date: string
    ) => {
      const id = `new-${crypto.randomUUID()}`;

      const item: Assignment = {
        id,
        resourceType,
        resourceId,
        date,
        projectId: projectFilter || "",
        hours: 8,
        notes: "",
        isNew: true
      };

      setAssignments((current) => [...current, item]);

      setDirty((current) => {
        const next = new Set(current);
        next.add(id);
        return next;
      });
    },
    [projectFilter]
  );

  const updateAssignment = React.useCallback(
    (
      id: string,
      patch: Partial<Assignment>
    ) => {
      setAssignments((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, ...patch }
            : item
        )
      );

      setDirty((current) => {
        const next = new Set(current);
        next.add(id);
        return next;
      });
    },
    []
  );

  const matrixDate = ymd(allDays[matrixDay] || allDays[0]);

  const matrixHours = React.useCallback(
    (employeeId: string, projectId: string) =>
      assignments
        .filter(
          (item) =>
            item.resourceType === "EMPLOYEE" &&
            item.resourceId === employeeId &&
            item.date === matrixDate &&
            item.projectId === projectId
        )
        .reduce(
          (sum, item) => sum + Number(item.hours || 0),
          0
        ),
    [assignments, matrixDate]
  );

  const matrixClick = React.useCallback(
    (
      employee: Employee,
      projectId: string
    ) => {
      const existing = assignments.find(
        (item) =>
          item.resourceType === "EMPLOYEE" &&
          item.resourceId === employee.id &&
          item.date === matrixDate &&
          item.projectId === projectId
      );

      if (existing) {
        const next = Number(
          prompt(
            `${employee.name} · ${projectId}\nPlanstunden:`,
            String(existing.hours || 0)
          )
        );

        if (!Number.isFinite(next) || next < 0) return;

        updateAssignment(existing.id, {
          hours: next
        });

        return;
      }

      const used = assignments
        .filter(
          (item) =>
            item.resourceType === "EMPLOYEE" &&
            item.resourceId === employee.id &&
            item.date === matrixDate
        )
        .reduce(
          (sum, item) => sum + Number(item.hours || 0),
          0
        );

      const remaining = Math.max(0, 8 - used);

      if (remaining <= 0) {
        alert(
          `${employee.name} ist an diesem Tag bereits mit 8 Stunden eingeplant.`
        );
        return;
      }

      const id = `new-${crypto.randomUUID()}`;

      const item: Assignment = {
        id,
        resourceType: "EMPLOYEE",
        resourceId: employee.id,
        date: matrixDate,
        projectId,
        hours: remaining,
        notes: "",
        isNew: true
      };

      setAssignments((current) => [
        ...current,
        item
      ]);

      setDirty((current) => {
        const next = new Set(current);
        next.add(id);
        return next;
      });
    },
    [assignments, matrixDate, updateAssignment]
  );


  const deleteAssignment = React.useCallback(
    async (item: Assignment) => {
      if (!item.isNew) {
        await request(
          `/api/resource-costs/assignments/${encodeURIComponent(item.id)}`,
          { method: "DELETE" }
        );
      }

      setAssignments((current) =>
        current.filter((row) => row.id !== item.id)
      );

      setDirty((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    },
    []
  );

  const save = React.useCallback(async () => {
    const changed = assignments.filter(
      (item) => dirty.has(item.id)
    );

    if (!changed.length) return;

    setSaving(true);
    setError("");

    try {
      for (const item of changed) {
        const data=await request(
          item.isNew?"/api/resource-costs/assignments":`/api/resource-costs/assignments/${encodeURIComponent(item.id)}`,
          {method:item.isNew?"POST":"PUT",body:JSON.stringify(item)}
        );
        const saved=data?.item;
        if(!saved?.id)throw new Error("Einsatz konnte nicht bestätigt werden.");
        const latest=assignmentsRef.current.find(row=>row.id===item.id);
        const changedDuringSave=!!latest && ["resourceType","resourceId","date","projectId","hours","notes"].some(key=>String((latest as any)[key]??"")!==String((item as any)[key]??""));
        setAssignments(current=>current.map(row=>row.id===item.id
          ? (changedDuringSave?{...row,id:saved.id,updatedAt:saved.updatedAt,isNew:false}:{...saved,isNew:false})
          :row));
        setDirty(current=>{const next=new Set(current);next.delete(item.id);if(changedDuringSave)next.add(saved.id);return next;});
      }

    } catch (e: any) {
      setError(
        e?.message ||
        "Einsatzplanung konnte nicht gespeichert werden."
      );
    } finally {
      setSaving(false);
    }
  }, [assignments, dirty, loadBase]);

  const clearWeek = React.useCallback(async () => {
    if (!window.confirm("Diese Woche wirklich komplett leeren?")) {
      return;
    }

    await request(
      `/api/resource-costs/assignments/week?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { method: "DELETE" }
    );

    await loadBase();
  }, [from, to, loadBase]);

  const totalPlan = assignments.reduce(
    (sum, item) => sum + Number(item.hours || 0),
    0
  );

  const totalActual = actualTimes
    .filter(
      (item) =>
        item.date >= from &&
        item.date <= to
    )
    .reduce(
      (sum, item) => sum + Number(item.hours || 0),
      0
    );

  const conflicts = people.reduce(
    (count, employee) =>
      count +
      allDayKeys.filter(
        (date) =>
          planHours("EMPLOYEE", employee.id, date) > 8
      ).length,
    0
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Büro · Planung
          </div>

          <h1 style={{ margin: "3px 0 4px" }}>
            Einsatzplanung
          </h1>

          <div style={{ opacity: 0.9 }}>
            Personaleinsatz und Maschineneinsatz planen · Ist-Zeiten automatisch aus Arbeitszeiten.
          </div>
        </div>

        <div className="rlc-page-hero__actions">
          <button
            className="rlc-page-hero__button"
            onClick={() => void save()}
            disabled={!dirty.size || saving}
          >
            {saving ? "Speichern…" : "Speichern"}
          </button>

          <button
            className="rlc-page-hero__button"
            onClick={() => navigate("/buro/bauzeitenplan")}
          >
            Bauzeitenplan
          </button>
        </div>
      </section>

      <section className="card" style={{padding:12}}>
        <strong>Feiertage & Betriebsruhe · gewählte Woche</strong>
        <button className="btn" style={{marginLeft:10}} onClick={()=>{if(dirty.size&&!window.confirm("Ungespeicherte Planung verwerfen und Firmenkalender öffnen?"))return;navigate("/buro/feiertage");}}>Firmenkalender öffnen</button>
        {calendarLoading||calendarRange!==from+":"+to?<p className="muted">Firmenkalender wird geladen …</p>:calendarError?<p role="alert">Firmenkalender nicht verfügbar: {calendarError}. Ruhetage konnten nicht geprüft werden.</p>:nonWorking.filter(x=>x.date>=from&&x.date<=to).length?<><p className="muted">Konfigurierte Hinweise; Geltungsbereich am Einsatzort prüfen. Bestehende Einsätze bleiben erhalten.</p>{nonWorking.filter(x=>x.date>=from&&x.date<=to).map(x=><div key={x.id}><strong>{x.date}</strong> · {x.title} · {x.location||"Firmenweit"}</div>)}</>:<p className="muted">Keine konfigurierten Ruhetage in dieser Woche.</p>}
      </section>

      {error && (
        <div className="card" style={{ color: "#b42318" }}>
          {error}
        </div>
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5,minmax(0,1fr))",
          gap: 10
        }}
      >
        {[
          ["Mitarbeiter", people.length],
          ["Maschinen", machines.length],
          ["Plan", `${fmtHours(totalPlan)} h`],
          ["Ist", `${fmtHours(totalActual)} h`],
          ["Konflikte", conflicts]
        ].map(([label, value]) => (
          <div key={String(label)} className="card">
            <div className="muted">{label}</div>
            <strong style={{ fontSize: 22 }}>{value}</strong>
          </div>
        ))}
      </section>

      <section
        className="card"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap"
        }}
      >
        <button
          className="btn"
          onClick={() => setWeek((current) => addDays(current, -7))}
        >
          ◀ KW
        </button>

        <strong>
          KW {kw(week)} · {from} – {to}
        </strong>

        <button
          className="btn"
          onClick={() => setWeek((current) => addDays(current, 7))}
        >
          KW ▶
        </button>

        <div style={{ flex: 1 }} />

        <input
          style={{ ...field, width: 250 }}
          placeholder="Mitarbeiter / Maschine suchen…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <select
          style={{ ...field, width: 190 }}
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
        >
          <option value="">Alle Projekte</option>
          {projects.map((project) => (
            <option key={project} value={project}>
              {project}
            </option>
          ))}
        </select>

        <label
          className="btn"
          style={{
            display: "inline-flex",
            gap: 6,
            alignItems: "center"
          }}
        >
          <input
            type="checkbox"
            checked={showWeekend}
            onChange={(event) => setShowWeekend(event.target.checked)}
          />
          Wochenende
        </label>

        <button
          className="btn"
          onClick={() => navigate("/buro/arbeitszeiten")}
        >
          Arbeitszeiten
        </button>

        <button
          className="btn"
          onClick={() => void clearWeek()}
        >
          Woche leeren
        </button>
      </section>

      <section
        className="card"
        style={{
          display: "grid",
          gap: 10,
          padding: 12
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap"
          }}
        >
          <div>
            <strong style={{ fontSize: 16 }}>
              Disposition
            </strong>

            <div className="muted">
              Schnellübersicht Mitarbeiter × Projekt
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {allDays.slice(0, 5).map((day, index) => (
            <button
              key={ymd(day)}
              className={
                matrixDay === index
                  ? "btn btn-primary"
                  : "btn"
              }
              onClick={() => setMatrixDay(index)}
            >
              {day.toLocaleDateString("de-DE", {
                weekday: "short",
                day: "2-digit",
                month: "2-digit"
              })}
            </button>
          ))}
        </div>

        <div
          style={{
            overflowX: "auto",
            border: "1px solid #dbe3ee",
            borderRadius: 9
          }}
        >
          <table
            style={{
              width: "100%",
              minWidth: Math.max(
                900,
                190 + matrixProjects.length * 150
              ),
              borderCollapse: "collapse"
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 3,
                    background: "#f8fafc",
                    minWidth: 190,
                    padding: 10,
                    textAlign: "left",
                    borderBottom:
                      "1px solid #dbe3ee"
                  }}
                >
                  Mitarbeiter
                </th>

                {matrixProjects.map((project) => {
                  const color = projectColor(project.key);

                  return (
                    <th
                      key={project.key}
                      style={{
                        minWidth: 150,
                        padding: 8,
                        textAlign: "center",
                        borderBottom:
                          "1px solid #dbe3ee",
                        borderLeft:
                          "1px solid #edf1f6",
                        background: "#f8fafc"
                      }}
                    >
                      <div
                        style={{
                          height: 4,
                          borderRadius: 999,
                          background: color,
                          marginBottom: 6
                        }}
                      />

                      <strong>
                        {project.key}
                      </strong>

                      <div
                        className="muted"
                        style={{
                          fontSize: 10,
                          marginTop: 2,
                          maxWidth: 140,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                        title={project.name || ""}
                      >
                        {project.name || project.place || "—"}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {filteredPeople.map((employee) => (
                <tr key={employee.id}>
                  <td
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 2,
                      background: "#fff",
                      padding: 10,
                      borderBottom:
                        "1px solid #edf1f6"
                    }}
                  >
                    <strong>
                      {employee.name}
                    </strong>

                    <div className="muted">
                      {fmtHours(
                        planHours(
                          "EMPLOYEE",
                          employee.id,
                          matrixDate
                        )
                      )} h geplant
                    </div>
                  </td>

                  {matrixProjects.map((project) => {
                    const value = matrixHours(
                      employee.id,
                      project.key
                    );

                    const filled = value > 0;
                    const color = projectColor(
                      project.key
                    );

                    return (
                      <td
                        key={project.key}
                        onClick={() =>
                          matrixClick(
                            employee,
                            project.key
                          )
                        }
                        style={{
                          height: 62,
                          padding: 6,
                          textAlign: "center",
                          cursor: "pointer",
                          borderLeft:
                            "1px solid #edf1f6",
                          borderBottom:
                            "1px solid #edf1f6",
                          background: filled
                            ? `${color}18`
                            : "#fff"
                        }}
                        title={
                          filled
                            ? "Klicken zum Ändern"
                            : "Klicken zum Einplanen"
                        }
                      >
                        {filled ? (
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 66,
                              padding: "7px 10px",
                              borderRadius: 8,
                              background: color,
                              color: "#fff",
                              fontWeight: 700
                            }}
                          >
                            {fmtHours(value)} h
                          </div>
                        ) : (
                          <span
                            style={{
                              color: "#94a3b8",
                              fontSize: 18
                            }}
                          >
                            +
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          className="muted"
          style={{ fontSize: 11 }}
        >
          Klick auf eine freie Zelle: Mitarbeiter wird dem Projekt
          automatisch für den gewählten Tag zugeordnet.
        </div>
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <div className="rlc-page-section-head">
          <div>
            <strong>Mitarbeiter</strong>
            <div className="muted">
              Planstunden · Ist-Stunden · Abweichung
            </div>
          </div>
        </div>

        {filteredPeople.map((employee) => {
          const weekPlan = allDayKeys.reduce(
            (sum, date) =>
              sum + planHours("EMPLOYEE", employee.id, date),
            0
          );

          const weekActual = allDayKeys.reduce(
            (sum, date) =>
              sum + actualHours(employee.name, date),
            0
          );

          return (
            <article
              key={employee.id}
              className="card"
              style={{
                display: "grid",
                gap: 10,
                padding: 12
              }}
            >
              <header
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12
                }}
              >
                <div>
                  <strong style={{ fontSize: 16 }}>
                    {employee.name}
                  </strong>

                  <div className="muted">
                    Mitarbeiter
                  </div>
                </div>

                <div style={{ flex: 1 }} />

                <div style={{ textAlign: "right" }}>
                  <strong>
                    Plan {fmtHours(weekPlan)} h
                  </strong>

                  <div className="muted">
                    Ist {fmtHours(weekActual)} h · Δ{" "}
                    {fmtHours(weekActual - weekPlan)} h
                  </div>
                </div>
              </header>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${visibleDays.length}, minmax(190px,1fr))`,
                  gap: 8,
                  overflowX: "auto"
                }}
              >
                {visibleDays.map((day) => {
                  const date = ymd(day);
                  const items = assignmentsFor(
                    "EMPLOYEE",
                    employee.id,
                    date
                  );

                  return (
                    <div
                      key={date}
                      style={{
                        border: "1px solid #e1e7ef",
                        borderRadius: 9,
                        padding: 8,
                        background: "#f8fafc",
                        minHeight: 130
                      }}
                    >
                      <strong>
                        {day.toLocaleDateString("de-DE", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit"
                        })}
                      </strong>

                      {items.map((item) => {
                        const actual = actualHours(
                          employee.name,
                          date,
                          item.projectId
                        );

                        const delta =
                          actual - Number(item.hours || 0);

                        return (
                          <div
                            key={item.id}
                            style={{
                              marginTop: 7,
                              padding: 8,
                              borderRadius: 8,
                              background: "#fff",
                              border: "1px solid #dbe3ee"
                            }}
                          >
                            <select
                              style={field}
                              value={item.projectId || ""}
                              onChange={(event) =>
                                updateAssignment(item.id, {
                                  projectId: event.target.value
                                })
                              }
                            >
                              <option value="">Projekt wählen…</option>

                              {projects.map((project) => (
                                <option
                                  key={project}
                                  value={project}
                                >
                                  {project}
                                </option>
                              ))}
                            </select>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr 1fr",
                                gap: 6,
                                marginTop: 7
                              }}
                            >
                              <div>
                                <div className="muted">Plan</div>
                                <input
                                  type="number"
                                  min={0}
                                  max={24}
                                  step="0.5"
                                  style={field}
                                  value={item.hours}
                                  onChange={(event) =>
                                    updateAssignment(item.id, {
                                      hours:
                                        Number(event.target.value) || 0
                                    })
                                  }
                                />
                              </div>

                              <div>
                                <div className="muted">Ist</div>
                                <strong>
                                  {fmtHours(actual)} h
                                </strong>
                              </div>

                              <div>
                                <div className="muted">Δ</div>
                                <strong
                                  style={{
                                    color:
                                      delta < 0
                                        ? "#b42318"
                                        : delta > 0
                                          ? "#166534"
                                          : undefined
                                  }}
                                >
                                  {fmtHours(delta)} h
                                </strong>
                              </div>
                            </div>

                            <input
                              style={{
                                ...field,
                                marginTop: 7
                              }}
                              value={item.notes || ""}
                              placeholder="Notiz"
                              onChange={(event) =>
                                updateAssignment(item.id, {
                                  notes: event.target.value
                                })
                              }
                            />

                            <button
                              className="btn"
                              style={{ marginTop: 7 }}
                              onClick={() =>
                                void deleteAssignment(item)
                              }
                            >
                              Entfernen
                            </button>
                          </div>
                        );
                      })}

                      {items.length === 0 && (
                        <button
                          className="btn"
                          style={{ marginTop: 10 }}
                          onClick={() =>
                            addAssignment(
                              "EMPLOYEE",
                              employee.id,
                              date
                            )
                          }
                        >
                          + Einsatz planen
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <div className="rlc-page-section-head">
          <div>
            <strong>Maschinen</strong>
            <div className="muted">
              Maschineneinsatz getrennt vom Personal planen
            </div>
          </div>
        </div>

        {filteredMachines.map((machine) => {
          const weekPlan = allDayKeys.reduce(
            (sum, date) =>
              sum + planHours("MACHINE", machine.id, date),
            0
          );

          return (
            <article
              key={machine.id}
              className="card"
              style={{
                display: "grid",
                gap: 10,
                padding: 12
              }}
            >
              <header
                style={{
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <div>
                  <strong style={{ fontSize: 16 }}>
                    {machine.name || machine.serial || "Maschine"}
                  </strong>

                  <div className="muted">
                    Maschine
                    {machine.serial
                      ? ` · ${machine.serial}`
                      : ""}
                  </div>
                </div>

                <div style={{ flex: 1 }} />

                <strong>
                  Plan {fmtHours(weekPlan)} h
                </strong>
              </header>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${visibleDays.length}, minmax(190px,1fr))`,
                  gap: 8,
                  overflowX: "auto"
                }}
              >
                {visibleDays.map((day) => {
                  const date = ymd(day);
                  const items = assignmentsFor(
                    "MACHINE",
                    machine.id,
                    date
                  );

                  return (
                    <div
                      key={date}
                      style={{
                        border: "1px solid #e1e7ef",
                        borderRadius: 9,
                        padding: 8,
                        background: "#f8fafc",
                        minHeight: 120
                      }}
                    >
                      <strong>
                        {day.toLocaleDateString("de-DE", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit"
                        })}
                      </strong>

                      {items.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            marginTop: 7,
                            padding: 8,
                            background: "#fff",
                            border: "1px solid #dbe3ee",
                            borderRadius: 8
                          }}
                        >
                          <select
                            style={field}
                            value={item.projectId || ""}
                            onChange={(event) =>
                              updateAssignment(item.id, {
                                projectId: event.target.value
                              })
                            }
                          >
                            <option value="">Projekt wählen…</option>

                            {projects.map((project) => (
                              <option
                                key={project}
                                value={project}
                              >
                                {project}
                              </option>
                            ))}
                          </select>

                          <div
                            style={{
                              marginTop: 7,
                              display: "grid",
                              gridTemplateColumns: "1fr auto",
                              gap: 7
                            }}
                          >
                            <input
                              type="number"
                              min={0}
                              max={24}
                              step="0.5"
                              style={field}
                              value={item.hours}
                              onChange={(event) =>
                                updateAssignment(item.id, {
                                  hours:
                                    Number(event.target.value) || 0
                                })
                              }
                            />

                            <button
                              className="btn"
                              onClick={() =>
                                void deleteAssignment(item)
                              }
                            >
                              Entfernen
                            </button>
                          </div>
                        </div>
                      ))}

                      {items.length === 0 && (
                        <button
                          className="btn"
                          style={{ marginTop: 10 }}
                          onClick={() =>
                            addAssignment(
                              "MACHINE",
                              machine.id,
                              date
                            )
                          }
                        >
                          + Einsatz planen
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
