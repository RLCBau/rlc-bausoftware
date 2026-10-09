import React from "react";

import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

type ViewMode = "month" | "week" | "day" | "list";

type CalendarEvent = {
  id: string;
  companyId: string;
  projectId?: string | null;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string | null;
  attendees: string[];
  notes?: string | null;
  category?: string | null;
  busyStatus: string;
  reminderMinutes?: number | null;
  source: string;
  externalId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  createdAt: string;
  updatedAt: string;
  project?: {
    id: string;
    code?: string | null;
    name?: string | null;
  } | null;
};

type Draft = {
  title: string;
  projectId: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  attendees: string;
  notes: string;
  category: string;
  busyStatus: string;
  reminderMinutes: string;
  sourceType: string;
  sourceId: string;
};

const WEEKDAYS = [
  "Mo",
  "Di",
  "Mi",
  "Do",
  "Fr",
  "Sa",
  "So"
];

const HOURS = Array.from(
  { length: 12 },
  (_, index) => index + 7
);

function getToken() {
  const directKeys = [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc_auth_token",
    "rlc_access_token",
    "rlc.auth.token",
    "rlc_mobile_token"
  ];

  for (const key of directKeys) {
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
        const parsed = JSON.parse(raw);

        const token =
          parsed?.token ??
          parsed?.accessToken ??
          parsed?.authToken ??
          parsed?.jwt ??
          parsed?.data?.token ??
          parsed?.data?.accessToken;

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

  const response = await fetch(`${API_BASE}${path}`, {
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

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.ok === false) {
    throw new Error(
      data?.error ||
      data?.message ||
      `HTTP ${response.status}`
    );
  }

  return data as T;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localInput(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
    value.getDate()
  )}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function startOfDay(value: Date) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(value: Date) {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(value: Date, days: number) {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(value: Date, months: number) {
  const d = new Date(value);
  d.setMonth(d.getMonth() + months);
  return d;
}

function startOfWeek(value: Date) {
  const d = startOfDay(value);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

function startOfMonth(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    1
  );
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function splitList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function newDraft(
  date: Date,
  projectId: string
): Draft {
  const start = new Date(date);
  start.setHours(9, 0, 0, 0);

  const end = new Date(start);
  end.setHours(10, 0, 0, 0);

  return {
    title: "",
    projectId,
    start: localInput(start),
    end: localInput(end),
    allDay: false,
    location: "",
    attendees: "",
    notes: "",
    category: "Projekt",
    busyStatus: "busy",
    reminderMinutes: "15",
    sourceType: "",
    sourceId: ""
  };
}

function eventDraft(event: CalendarEvent): Draft {
  return {
    title: event.title || "",
    projectId: event.projectId || "",
    start: localInput(new Date(event.start)),
    end: localInput(new Date(event.end)),
    allDay: Boolean(event.allDay),
    location: event.location || "",
    attendees: (event.attendees || []).join(", "),
    notes: event.notes || "",
    category: event.category || "",
    busyStatus: event.busyStatus || "busy",
    reminderMinutes:
      event.reminderMinutes === null ||
      event.reminderMinutes === undefined
        ? ""
        : String(event.reminderMinutes),
    sourceType: event.sourceType || "",
    sourceId: event.sourceId || ""
  };
}

function monthTitle(value: Date) {
  return value.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric"
  });
}

function dayTitle(value: Date) {
  return value.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function shortTime(value: string) {
  return new Date(value).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function dateTime(value: string) {
  return new Date(value).toLocaleString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function OutlookKalender() {
  const { getSelectedProject } = useProject();
  const selectedProject = getSelectedProject();

  const defaultProjectId =
    String(selectedProject?.id || "").trim();

  const [view, setView] =
    React.useState<ViewMode>("month");

  const [cursor, setCursor] =
    React.useState(new Date());

  const [events, setEvents] =
    React.useState<CalendarEvent[]>([]);

  const [selectedId, setSelectedId] =
    React.useState<string | null>(null);

  const [draft, setDraft] =
    React.useState<Draft>(
      newDraft(new Date(), defaultProjectId)
    );

  const [query, setQuery] =
    React.useState("");

  const [projectFilter, setProjectFilter] =
    React.useState("");

  const [loading, setLoading] =
    React.useState(false);

  const [saving, setSaving] =
    React.useState(false);

  const [error, setError] =
    React.useState("");

  const [prefillNotice, setPrefillNotice] =
    React.useState("");

  const selected =
    events.find((event) => event.id === selectedId) ||
    null;

  const range = React.useMemo(() => {
    if (view === "month") {
      const first = startOfWeek(startOfMonth(cursor));
      return {
        start: first,
        end: addDays(first, 42)
      };
    }

    if (view === "week") {
      const first = startOfWeek(cursor);
      return {
        start: first,
        end: addDays(first, 7)
      };
    }

    if (view === "day") {
      return {
        start: startOfDay(cursor),
        end: addDays(startOfDay(cursor), 1)
      };
    }

    return {
      start: addDays(startOfDay(cursor), -60),
      end: addDays(startOfDay(cursor), 180)
    };
  }, [cursor, view]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        rangeStart: range.start.toISOString(),
        rangeEnd: range.end.toISOString()
      });

      if (projectFilter) {
        params.set("projectId", projectFilter);
      }

      const data = await request<{
        ok: true;
        items: CalendarEvent[];
      }>(`/api/calendar?${params.toString()}`);

      setEvents(
        Array.isArray(data.items)
          ? data.items
          : []
      );
    } catch (e: any) {
      setError(
        e?.message ||
        "Kalender konnte nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }, [range.start.getTime(), range.end.getTime(), projectFilter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const raw =
      sessionStorage.getItem("rlc.calendar.prefill");

    if (!raw) return;

    sessionStorage.removeItem("rlc.calendar.prefill");

    try {
      const value = JSON.parse(raw);

      setSelectedId(null);

      setPrefillNotice(
        value?.sourceType === "communication"
          ? "Termin aus Kommunikation übernommen. Bitte Datum/Uhrzeit prüfen und speichern."
          : value?.sourceType === "note"
            ? "Termin aus Notiz übernommen. Bitte Datum/Uhrzeit prüfen und speichern."
            : ""
      );

      setDraft((current) => ({
        ...current,
        projectId:
          String(value?.projectId || current.projectId || ""),
        title:
          String(value?.title || ""),
        attendees:
          String(value?.attendees || ""),
        notes:
          String(value?.notes || ""),
        category:
          String(value?.category || "Besprechung"),
        sourceType:
          String(value?.sourceType || ""),
        sourceId:
          String(value?.sourceId || ""),
        start:
          value?.start
            ? localInput(new Date(value.start))
            : current.start,
        end:
          value?.end
            ? localInput(new Date(value.end))
            : current.end
      }));
    } catch {}
  }, []);

  React.useEffect(() => {
    if (selected) {
      setDraft(eventDraft(selected));
    }
  }, [selectedId, selected?.updatedAt]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return events;

    return events.filter((event) =>
      [
        event.title,
        event.location || "",
        event.project?.code || "",
        event.project?.name || "",
        event.notes || "",
        ...(event.attendees || [])
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [events, query]);

  const projectOptions = React.useMemo(() => {
    const map = new Map<
      string,
      { id: string; label: string }
    >();

    for (const event of events) {
      if (!event.project?.id) continue;

      map.set(event.project.id, {
        id: event.project.id,
        label:
          [event.project.code, event.project.name]
            .filter(Boolean)
            .join(" · ") ||
          event.project.id
      });
    }

    if (selectedProject?.id) {
      map.set(String(selectedProject.id), {
        id: String(selectedProject.id),
        label:
          [selectedProject.code, selectedProject.name]
            .filter(Boolean)
            .join(" · ") ||
          String(selectedProject.id)
      });
    }

    return Array.from(map.values());
  }, [events, selectedProject]);

  function createAt(date: Date) {
    setSelectedId(null);
    setDraft(
      newDraft(
        date,
        projectFilter || defaultProjectId
      )
    );
  }

  async function save() {
    if (!draft.title.trim()) {
      window.alert("Bitte einen Titel eingeben.");
      return;
    }

    const start = new Date(draft.start);
    const end = new Date(draft.end);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end.getTime() < start.getTime()
    ) {
      window.alert("Beginn und Ende prüfen.");
      return;
    }

    setSaving(true);
    setError("");

    const body = {
      title: draft.title.trim(),
      projectId: draft.projectId || null,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: draft.allDay,
      location: draft.location || null,
      attendees: splitList(draft.attendees),
      notes: draft.notes || null,
      category: draft.category || null,
      busyStatus: draft.busyStatus,
      reminderMinutes:
        draft.reminderMinutes === ""
          ? null
          : Number(draft.reminderMinutes),
      sourceType: draft.sourceType || null,
      sourceId: draft.sourceId || null
    };

    try {
      if (selected) {
        await request(
          `/api/calendar/${encodeURIComponent(selected.id)}`,
          {
            method: "PUT",
            body: JSON.stringify(body)
          }
        );
      } else {
        const result = await request<{
          ok: true;
          item: CalendarEvent;
        }>("/api/calendar", {
          method: "POST",
          body: JSON.stringify(body)
        });

        setSelectedId(result.item.id);
      }

      await load();
    } catch (e: any) {
      setError(
        e?.message ||
        "Termin konnte nicht gespeichert werden."
      );
    } finally {
      setSaving(false);
    }
  }

  async function createTaskFromEvent() {
    if (!selected) {
      window.alert("Bitte zuerst einen gespeicherten Termin auswählen.");
      return;
    }

    if (!selected.projectId) {
      window.alert("Der Termin ist keinem Projekt zugeordnet.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await request("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          projectId: selected.projectId,
          title: selected.title,
          description: selected.notes || "",
          due: selected.start,
          priority: "med",
          tags: ["Kalender"],
          sourceType: "calendar",
          sourceId: selected.id
        })
      });

      window.alert("Aufgabe wurde erstellt.");
    } catch (e: any) {
      setError(
        e?.message ||
        "Aufgabe konnte nicht erstellt werden."
      );
    } finally {
      setSaving(false);
    }
  }

  async function createCommunicationFromEvent() {
    if (!selected) {
      window.alert("Bitte zuerst einen gespeicherten Termin auswählen.");
      return;
    }

    if (!selected.projectId) {
      window.alert("Der Termin ist keinem Projekt zugeordnet.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const result = await request<{
        ok: true;
        item: { id: string };
      }>("/api/communication", {
        method: "POST",
        body: JSON.stringify({
          projectId: selected.projectId,
          subject: selected.title,
          participants: selected.attendees || []
        })
      });

      if (selected.notes?.trim()) {
        await request(
          `/api/communication/${encodeURIComponent(result.item.id)}/messages`,
          {
            method: "POST",
            body: JSON.stringify({
              fromName: "RLC Kalender",
              toList: selected.attendees || [],
              ccList: [],
              subject: selected.title,
              body: selected.notes
            })
          }
        );
      }

      window.location.assign("/buro/kommunikation");
    } catch (e: any) {
      setError(
        e?.message ||
        "Kommunikation konnte nicht erstellt werden."
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selected) return;

    if (
      !window.confirm(
        `Termin "${selected.title}" wirklich löschen?`
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      await request(
        `/api/calendar/${encodeURIComponent(selected.id)}`,
        { method: "DELETE" }
      );

      setSelectedId(null);
      setDraft(
        newDraft(cursor, defaultProjectId)
      );

      await load();
    } finally {
      setSaving(false);
    }
  }

  function navigate(direction: number) {
    if (view === "month") {
      setCursor((current) =>
        addMonths(current, direction)
      );
      return;
    }

    if (view === "week") {
      setCursor((current) =>
        addDays(current, 7 * direction)
      );
      return;
    }

    setCursor((current) =>
      addDays(current, direction)
    );
  }

  function exportICS() {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//RLC Bausoftware//Kalender//DE"
    ];

    for (const event of filtered) {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${event.id}@rlcbausoftware`);
      lines.push(
        `DTSTART:${icsDate(new Date(event.start))}`
      );
      lines.push(
        `DTEND:${icsDate(new Date(event.end))}`
      );
      lines.push(
        `SUMMARY:${icsEscape(event.title)}`
      );

      if (event.location) {
        lines.push(
          `LOCATION:${icsEscape(event.location)}`
        );
      }

      if (event.notes) {
        lines.push(
          `DESCRIPTION:${icsEscape(event.notes)}`
        );
      }

      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    downloadText(
      lines.join("\r\n"),
      "RLC_Kalender.ics"
    );
  }

  async function importICS() {
    pickFile(async (file) => {
      const text = await file.text();
      const imported = parseICS(text);

      let count = 0;

      for (const item of imported) {
        try {
          await request("/api/calendar", {
            method: "POST",
            body: JSON.stringify({
              ...item,
              projectId:
                projectFilter ||
                defaultProjectId ||
                null
            })
          });

          count += 1;
        } catch {}
      }

      await load();

      window.alert(
        `${count} Termin(e) importiert.`
      );
    });
  }

  const title =
    view === "month"
      ? monthTitle(cursor)
      : view === "week"
        ? `${startOfWeek(cursor).toLocaleDateString("de-DE")} – ${addDays(
            startOfWeek(cursor),
            6
          ).toLocaleDateString("de-DE")}`
        : view === "day"
          ? dayTitle(cursor)
          : "Terminübersicht";

  return (
    <div className="card">
      <header className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Büro & Verwaltung
          </div>

          <h1>Outlook & Kalender</h1>

          <p>
            Gemeinsamer Firmenkalender für alle Benutzer der Firma
            · Termine, Besprechungen und Projekttermine zentral organisieren.
          </p>
        </div>

        <div className="rlc-page-hero__actions">
          <button
            className="rlc-page-hero__button"
            onClick={() => createAt(cursor)}
          >
            + Neuer Termin
          </button>

          <button
            className="rlc-page-hero__button"
            onClick={importICS}
          >
            Import .ics
          </button>

          <button
            className="rlc-page-hero__button"
            onClick={exportICS}
          >
            Export .ics
          </button>
        </div>
      </header>

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

      {prefillNotice ? (
        <div
          className="card"
          style={{
            marginBottom: 10,
            borderColor: "#2563eb",
            background: "#eff6ff"
          }}
        >
          <strong>{prefillNotice}</strong>
        </div>
      ) : null}

      <div className="rlc-page-toolbar">
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center"
          }}
        >
          <button
            className="btn"
            onClick={() => navigate(-1)}
          >
            ‹
          </button>

          <button
            className="btn"
            onClick={() => setCursor(new Date())}
          >
            Heute
          </button>

          <button
            className="btn"
            onClick={() => navigate(1)}
          >
            ›
          </button>
        </div>

        <strong
          style={{
            minWidth: 220,
            fontSize: 17
          }}
        >
          {title}
        </strong>

        <input
          className="rlc-page-toolbar__search"
          value={query}
          onChange={(e) =>
            setQuery(e.target.value)
          }
          placeholder="Termin, Ort, Teilnehmer suchen..."
        />

        <select
          value={projectFilter}
          onChange={(e) =>
            setProjectFilter(e.target.value)
          }
        >
          <option value="">
            Alle Projekte
          </option>

          {projectOptions.map((project) => (
            <option
              key={project.id}
              value={project.id}
            >
              {project.label}
            </option>
          ))}
        </select>

        <div
          style={{
            display: "flex",
            gap: 4,
            marginLeft: "auto"
          }}
        >
          <ViewButton
            active={view === "month"}
            onClick={() => setView("month")}
          >
            Monat
          </ViewButton>

          <ViewButton
            active={view === "week"}
            onClick={() => setView("week")}
          >
            Woche
          </ViewButton>

          <ViewButton
            active={view === "day"}
            onClick={() => setView("day")}
          >
            Tag
          </ViewButton>

          <ViewButton
            active={view === "list"}
            onClick={() => setView("list")}
          >
            Liste
          </ViewButton>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "195px minmax(620px,1fr) 310px",
          gap: 10,
          alignItems: "start"
        }}
      >
        <aside className="card">
          <MiniCalendar
            cursor={cursor}
            onSelect={(date) => {
              setCursor(date);

              if (view === "month") {
                setView("day");
              }
            }}
          />

          <div
            style={{
              borderTop: "1px solid #e2e8f0",
              marginTop: 14,
              paddingTop: 14
            }}
          >
            <strong>Meine Kalender</strong>

            <div
              style={{
                display: "grid",
                gap: 9,
                marginTop: 12,
                fontSize: 13
              }}
            >
              <label>
                <input
                  type="checkbox"
                  checked
                  readOnly
                />{" "}
                RLC Kalender
              </label>

              <label>
                <input
                  type="checkbox"
                  checked
                  readOnly
                />{" "}
                Projekttermine
              </label>
            </div>
          </div>

          <div
            style={{
              borderTop: "1px solid #e2e8f0",
              marginTop: 16,
              paddingTop: 14,
              fontSize: 12,
              color: "#64748b"
            }}
          >
            {loading
              ? "Kalender wird geladen…"
              : `${filtered.length} Termin(e) im Zeitraum`}
          </div>
        </aside>

        <main
          className="card"
          style={{
            padding: 0,
            overflow: "hidden"
          }}
        >
          {view === "month" ? (
            <MonthView
              cursor={cursor}
              events={filtered}
              onSelectEvent={setSelectedId}
              onCreate={createAt}
            />
          ) : null}

          {view === "week" ? (
            <WeekView
              cursor={cursor}
              events={filtered}
              onSelectEvent={setSelectedId}
              onCreate={createAt}
            />
          ) : null}

          {view === "day" ? (
            <DayView
              cursor={cursor}
              events={filtered}
              onSelectEvent={setSelectedId}
              onCreate={createAt}
            />
          ) : null}

          {view === "list" ? (
            <ListView
              events={filtered}
              onSelectEvent={setSelectedId}
            />
          ) : null}
        </main>

        <aside
          className="card"
          style={{
            padding: 0,
            overflow: "hidden",
            position: "sticky",
            top: 12,
            maxHeight: "calc(100vh - 24px)",
            overflowY: "auto"
          }}
        >
          <div className="rlc-page-section-head">
            <strong>
              {selected
                ? "Termin bearbeiten"
                : "Neuer Termin"}
            </strong>

            {selected ? (
              <span>
                {dateTime(selected.start)}
              </span>
            ) : null}
          </div>

          <div
            style={{
              padding: 12,
              display: "grid",
              gap: 9
            }}
          >
            <Field label="Titel">
              <input
                value={draft.title}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    title: e.target.value
                  })
                }
                placeholder="Besprechung, Abnahme..."
              />
            </Field>

            <Field label="Projekt">
              <select
                value={draft.projectId}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    projectId: e.target.value
                  })
                }
              >
                <option value="">
                  Kein Projekt
                </option>

                {projectOptions.map((project) => (
                  <option
                    key={project.id}
                    value={project.id}
                  >
                    {project.label}
                  </option>
                ))}
              </select>
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
                checked={draft.allDay}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    allDay: e.target.checked
                  })
                }
              />

              Ganztägig
            </label>

            <Field label="Beginn">
              <input
                type="datetime-local"
                value={draft.start}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    start: e.target.value
                  })
                }
              />
            </Field>

            <Field label="Ende">
              <input
                type="datetime-local"
                value={draft.end}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    end: e.target.value
                  })
                }
              />
            </Field>

            <Field label="Ort">
              <input
                value={draft.location}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    location: e.target.value
                  })
                }
                placeholder="Büro, Baustelle, Teams..."
              />
            </Field>

            <Field label="Teilnehmer">
              <input
                value={draft.attendees}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    attendees: e.target.value
                  })
                }
                placeholder="mail1@..., mail2@..."
              />
            </Field>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8
              }}
            >
              <Field label="Kategorie">
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      category: e.target.value
                    })
                  }
                >
                  <option value="Projekt">
                    Projekt
                  </option>
                  <option value="Besprechung">
                    Besprechung
                  </option>
                  <option value="Baustelle">
                    Baustelle
                  </option>
                  <option value="Frist">
                    Frist
                  </option>
                  <option value="Intern">
                    Intern
                  </option>
                </select>
              </Field>

              <Field label="Status">
                <select
                  value={draft.busyStatus}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      busyStatus: e.target.value
                    })
                  }
                >
                  <option value="busy">
                    Beschäftigt
                  </option>
                  <option value="free">
                    Frei
                  </option>
                  <option value="tentative">
                    Mit Vorbehalt
                  </option>
                </select>
              </Field>
            </div>

            <Field label="Erinnerung">
              <select
                value={draft.reminderMinutes}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    reminderMinutes: e.target.value
                  })
                }
              >
                <option value="">
                  Keine
                </option>
                <option value="5">
                  5 Minuten
                </option>
                <option value="15">
                  15 Minuten
                </option>
                <option value="30">
                  30 Minuten
                </option>
                <option value="60">
                  1 Stunde
                </option>
                <option value="1440">
                  1 Tag
                </option>
              </select>
            </Field>

            <Field label="Beschreibung">
              <textarea
                value={draft.notes}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    notes: e.target.value
                  })
                }
                style={{
                  minHeight: 110,
                  resize: "vertical"
                }}
              />
            </Field>
          </div>

          <div
            style={{
              display: "flex",
              gap: 7,
              padding: "0 12px 12px"
            }}
          >
            <button
              className="btn btn-primary"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving
                ? "Speichert..."
                : "Speichern"}
            </button>

            {selected ? (
              <>
                <button
                  className="btn"
                  onClick={() =>
                    void createTaskFromEvent()
                  }
                  disabled={saving}
                >
                  Aufgabe erstellen
                </button>

                <button
                  className="btn"
                  onClick={() =>
                    void createCommunicationFromEvent()
                  }
                  disabled={saving}
                >
                  Kommunikation
                </button>

                <button
                  className="btn"
                  onClick={() => void remove()}
                >
                  Löschen
                </button>

                <button
                  className="btn"
                  onClick={() => createAt(cursor)}
                >
                  Neu
                </button>
              </>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ViewButton({
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

function MiniCalendar({
  cursor,
  onSelect
}: {
  cursor: Date;
  onSelect: (date: Date) => void;
}) {
  const first =
    startOfWeek(startOfMonth(cursor));

  const days =
    Array.from(
      { length: 42 },
      (_, index) => addDays(first, index)
    );

  return (
    <div>
      <div
        style={{
          fontWeight: 700,
          marginBottom: 10,
          textTransform: "capitalize"
        }}
      >
        {monthTitle(cursor)}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(7,minmax(0,1fr))",
          gap: 3,
          fontSize: 11,
          textAlign: "center"
        }}
      >
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            style={{
              fontWeight: 700,
              color: "#64748b",
              paddingBottom: 5
            }}
          >
            {day}
          </div>
        ))}

        {days.map((day) => {
          const today = sameDay(day, new Date());
          const active = sameDay(day, cursor);
          const currentMonth =
            day.getMonth() === cursor.getMonth();

          return (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => onSelect(day)}
              style={{
                border: 0,
                borderRadius: 999,
                height: 26,
                background:
                  active
                    ? "#0b5bd3"
                    : today
                      ? "#dbeafe"
                      : "transparent",
                color:
                  active
                    ? "#fff"
                    : currentMonth
                      ? "#0f172a"
                      : "#94a3b8",
                cursor: "pointer"
              }}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({
  cursor,
  events,
  onSelectEvent,
  onCreate
}: {
  cursor: Date;
  events: CalendarEvent[];
  onSelectEvent: (id: string) => void;
  onCreate: (date: Date) => void;
}) {
  const first =
    startOfWeek(startOfMonth(cursor));

  const days =
    Array.from(
      { length: 42 },
      (_, index) => addDays(first, index)
    );

  const weeks =
    Array.from(
      { length: 6 },
      (_, index) =>
        days.slice(index * 7, index * 7 + 7)
    );

  function isMultiDay(event: CalendarEvent) {
    return !sameDay(
      new Date(event.start),
      new Date(event.end)
    );
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(7,minmax(0,1fr))",
          borderBottom: "1px solid #e2e8f0"
        }}
      >
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            style={{
              padding: "9px 10px",
              fontSize: 12,
              fontWeight: 700,
              color: "#475569",
              textAlign: "center"
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {weeks.map((week, weekIndex) => {
        const weekStart = startOfDay(week[0]);
        const weekEnd = endOfDay(week[6]);

        const multiEvents =
          events
            .filter((event) => {
              if (!isMultiDay(event)) {
                return false;
              }

              const eventStart =
                new Date(event.start);

              const eventEnd =
                new Date(event.end);

              return (
                eventStart <= weekEnd &&
                eventEnd >= weekStart
              );
            })
            .sort(
              (a, b) =>
                new Date(a.start).getTime() -
                new Date(b.start).getTime()
            );

        const lanes: number[] = [];

        const segments =
          multiEvents.map((event) => {
            const eventStart =
              startOfDay(new Date(event.start));

            const eventEnd =
              startOfDay(new Date(event.end));

            const segmentStart =
              eventStart < weekStart
                ? weekStart
                : eventStart;

            const segmentEnd =
              eventEnd > weekEnd
                ? startOfDay(week[6])
                : eventEnd;

            const startCol = Math.max(
              0,
              Math.round(
                (
                  segmentStart.getTime() -
                  weekStart.getTime()
                ) /
                86400000
              )
            );

            const endCol = Math.min(
              6,
              Math.round(
                (
                  segmentEnd.getTime() -
                  weekStart.getTime()
                ) /
                86400000
              )
            );

            let lane = 0;

            while (
              lanes[lane] !== undefined &&
              lanes[lane] >= startCol
            ) {
              lane += 1;
            }

            lanes[lane] = endCol;

            return {
              event,
              startCol,
              endCol,
              lane
            };
          });

        const maxLane =
          segments.length
            ? Math.max(
                ...segments.map(
                  (segment) => segment.lane
                )
              )
            : -1;

        const rowHeight =
          Math.max(
            112,
            48 + (maxLane + 1) * 24
          );

        return (
          <div
            key={weekIndex}
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns:
                "repeat(7,minmax(0,1fr))",
              minHeight: rowHeight
            }}
          >
            {week.map((day) => {
              const currentMonth =
                day.getMonth() ===
                cursor.getMonth();

              const today =
                sameDay(day, new Date());

              const dayEvents =
                events.filter((event) => {
                  if (isMultiDay(event)) {
                    return false;
                  }

                  return sameDay(
                    new Date(event.start),
                    day
                  );
                });

              return (
                <div
                  key={day.toISOString()}
                  onDoubleClick={() =>
                    onCreate(day)
                  }
                  style={{
                    minHeight: rowHeight,
                    padding: 6,
                    borderRight:
                      "1px solid #e2e8f0",
                    borderBottom:
                      "1px solid #e2e8f0",
                    background:
                      currentMonth
                        ? "#fff"
                        : "#f8fafc"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "flex-end",
                      marginBottom:
                        maxLane >= 0
                          ? 28 + maxLane * 24
                          : 5
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onCreate(day)
                      }
                      style={{
                        width: 27,
                        height: 27,
                        borderRadius: 999,
                        border: 0,
                        background:
                          today
                            ? "#0b5bd3"
                            : "transparent",
                        color:
                          today
                            ? "#fff"
                            : currentMonth
                              ? "#0f172a"
                              : "#94a3b8",
                        cursor: "pointer"
                      }}
                    >
                      {day.getDate()}
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 3
                    }}
                  >
                    {dayEvents
                      .slice(0, 3)
                      .map((event) => (
                        <EventChip
                          key={event.id}
                          event={event}
                          onClick={() =>
                            onSelectEvent(
                              event.id
                            )
                          }
                        />
                      ))}
                  </div>
                </div>
              );
            })}

            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                gridTemplateColumns:
                  "repeat(7,minmax(0,1fr))",
                gridTemplateRows:
                  `38px repeat(${Math.max(1, maxLane + 1)},24px)`,
                pointerEvents: "none",
                zIndex: 5
              }}
            >
              {segments.map(
                ({
                  event,
                  startCol,
                  endCol,
                  lane
                }) => (
                  <button
                    key={`${event.id}-${weekIndex}`}
                    type="button"
                    onClick={() =>
                      onSelectEvent(event.id)
                    }
                    title={`${event.title} · ${dateTime(event.start)} – ${dateTime(event.end)}`}
                    style={{
                      gridColumn:
                        `${startCol + 1} / ${endCol + 2}`,
                      gridRow:
                        `${lane + 2}`,
                      alignSelf: "start",
                      height: 20,
                      margin: "0 4px",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      border:
                        "1px solid #60a5fa",
                      borderLeft:
                        "4px solid #0b5bd3",
                      borderRadius: 5,
                      background: "#dbeafe",
                      color: "#0f3f82",
                      padding: "2px 7px",
                      fontSize: 11,
                      fontWeight: 650,
                      textAlign: "left",
                      cursor: "pointer",
                      pointerEvents: "auto"
                    }}
                  >
                    {event.title}
                  </button>
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekView({
  cursor,
  events,
  onSelectEvent,
  onCreate
}: {
  cursor: Date;
  events: CalendarEvent[];
  onSelectEvent: (id: string) => void;
  onCreate: (date: Date) => void;
}) {
  const first = startOfWeek(cursor);

  const days =
    Array.from(
      { length: 7 },
      (_, index) => addDays(first, index)
    );

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "62px repeat(7,minmax(0,1fr))",
          borderBottom: "1px solid #e2e8f0"
        }}
      >
        <div />

        {days.map((day) => (
          <div
            key={day.toISOString()}
            style={{
              padding: 10,
              textAlign: "center",
              fontWeight: sameDay(day, new Date())
                ? 800
                : 600
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#64748b"
              }}
            >
              {day.toLocaleDateString("de-DE", {
                weekday: "short"
              })}
            </div>

            <div>
              {day.getDate()}.
            </div>
          </div>
        ))}
      </div>

      {HOURS.map((hour) => (
        <div
          key={hour}
          style={{
            display: "grid",
            gridTemplateColumns:
              "62px repeat(7,minmax(0,1fr))",
            minHeight: 58
          }}
        >
          <div
            style={{
              padding: "6px 8px",
              fontSize: 11,
              color: "#64748b",
              borderRight: "1px solid #e2e8f0",
              borderBottom: "1px solid #e2e8f0"
            }}
          >
            {pad(hour)}:00
          </div>

          {days.map((day) => {
            const cellEvents =
              events.filter((event) => {
                const start =
                  new Date(event.start);

                return (
                  sameDay(start, day) &&
                  start.getHours() === hour
                );
              });

            return (
              <div
                key={`${day.toISOString()}-${hour}`}
                onDoubleClick={() => {
                  const date = new Date(day);
                  date.setHours(hour, 0, 0, 0);
                  onCreate(date);
                }}
                style={{
                  padding: 3,
                  borderRight:
                    "1px solid #e2e8f0",
                  borderBottom:
                    "1px solid #e2e8f0",
                  display: "grid",
                  gap: 3,
                  alignContent: "start"
                }}
              >
                {cellEvents.map((event) => (
                  <EventChip
                    key={event.id}
                    event={event}
                    onClick={() =>
                      onSelectEvent(event.id)
                    }
                  />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function DayView({
  cursor,
  events,
  onSelectEvent,
  onCreate
}: {
  cursor: Date;
  events: CalendarEvent[];
  onSelectEvent: (id: string) => void;
  onCreate: (date: Date) => void;
}) {
  const dayEvents =
    events.filter((event) =>
      sameDay(
        new Date(event.start),
        cursor
      )
    );

  return (
    <div>
      <div
        style={{
          padding: 14,
          borderBottom: "1px solid #e2e8f0",
          fontWeight: 700
        }}
      >
        {dayTitle(cursor)}
      </div>

      {HOURS.map((hour) => {
        const cellEvents =
          dayEvents.filter(
            (event) =>
              new Date(event.start).getHours() === hour
          );

        return (
          <div
            key={hour}
            onDoubleClick={() => {
              const date = new Date(cursor);
              date.setHours(hour, 0, 0, 0);
              onCreate(date);
            }}
            style={{
              display: "grid",
              gridTemplateColumns: "75px 1fr",
              minHeight: 62,
              borderBottom: "1px solid #e2e8f0"
            }}
          >
            <div
              style={{
                padding: 10,
                fontSize: 12,
                color: "#64748b",
                borderRight: "1px solid #e2e8f0"
              }}
            >
              {pad(hour)}:00
            </div>

            <div
              style={{
                padding: 5,
                display: "grid",
                gap: 4
              }}
            >
              {cellEvents.map((event) => (
                <EventChip
                  key={event.id}
                  event={event}
                  onClick={() =>
                    onSelectEvent(event.id)
                  }
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({
  events,
  onSelectEvent
}: {
  events: CalendarEvent[];
  onSelectEvent: (id: string) => void;
}) {
  const sorted =
    [...events].sort(
      (a, b) =>
        new Date(a.start).getTime() -
        new Date(b.start).getTime()
    );

  return (
    <div>
      <div className="rlc-page-section-head">
        <strong>Terminübersicht</strong>
        <span>{events.length} Termine</span>
      </div>

      <div
        style={{
          display: "grid"
        }}
      >
        {sorted.map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={() =>
              onSelectEvent(event.id)
            }
            style={{
              border: 0,
              borderBottom: "1px solid #e2e8f0",
              background: "#fff",
              padding: "12px 14px",
              textAlign: "left",
              display: "grid",
              gridTemplateColumns:
                "170px minmax(200px,1fr) 180px 130px",
              gap: 12,
              cursor: "pointer"
            }}
          >
            <span>
              {dateTime(event.start)}
            </span>

            <strong>
              {event.title}
            </strong>

            <span>
              {event.location || "—"}
            </span>

            <span>
              {event.project?.code || "—"}
            </span>
          </button>
        ))}

        {!sorted.length ? (
          <div
            style={{
              padding: 30,
              textAlign: "center",
              color: "#64748b"
            }}
          >
            Keine Termine im gewählten Zeitraum.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EventChip({
  event,
  onClick
}: {
  event: CalendarEvent;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`${event.title} · ${dateTime(event.start)}`}
      style={{
        border: 0,
        borderLeft: "3px solid #0b5bd3",
        borderRadius: 4,
        background: "#eaf2ff",
        color: "#0f3f82",
        padding: "3px 5px",
        fontSize: 10.5,
        textAlign: "left",
        cursor: "pointer",
        overflow: "hidden"
      }}
    >
      <strong>
        {shortTime(event.start)}
      </strong>{" "}
      {event.title}
    </button>
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

function icsDate(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function icsEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function downloadText(
  text: string,
  filename: string
) {
  const blob = new Blob(
    [text],
    { type: "text/calendar;charset=utf-8" }
  );

  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

function pickFile(
  onPick: (file: File) => void
) {
  const input =
    document.createElement("input");

  input.type = "file";
  input.accept = ".ics,text/calendar";

  input.onchange = () => {
    const file =
      input.files?.[0];

    if (file) {
      onPick(file);
    }
  };

  input.click();
}

function parseICS(text: string) {
  const events: any[] = [];

  const blocks =
    text.split("BEGIN:VEVENT").slice(1);

  for (const block of blocks) {
    const body =
      block.split("END:VEVENT")[0];

    const lines =
      body.split(/\r?\n/);

    const get = (key: string) => {
      const line =
        lines.find((entry) =>
          entry.startsWith(`${key}:`) ||
          entry.startsWith(`${key};`)
        );

      if (!line) return "";

      return line.slice(
        line.indexOf(":") + 1
      );
    };

    const start =
      parseICSDate(get("DTSTART"));

    const end =
      parseICSDate(
        get("DTEND") ||
        get("DTSTART")
      );

    const title =
      get("SUMMARY")
        .replace(/\\,/g, ",")
        .replace(/\\n/g, "\n")
        .replace(/\\;/g, ";");

    if (!title || !start || !end) {
      continue;
    }

    events.push({
      title,
      start,
      end,
      allDay: false,
      location:
        get("LOCATION") || null,
      attendees: [],
      notes:
        get("DESCRIPTION") || null,
      category: "Import",
      busyStatus: "busy",
      reminderMinutes: 15
    });
  }

  return events;
}

function parseICSDate(value: string) {
  if (!value) return "";

  const cleaned =
    value.trim();

  const match =
    cleaned.match(
      /^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?$/
    );

  if (!match) return "";

  const [, y, m, d, hh, mm, ss] =
    match;

  const date =
    cleaned.endsWith("Z")
      ? new Date(
          Date.UTC(
            Number(y),
            Number(m) - 1,
            Number(d),
            Number(hh || 0),
            Number(mm || 0),
            Number(ss || 0)
          )
        )
      : new Date(
          Number(y),
          Number(m) - 1,
          Number(d),
          Number(hh || 0),
          Number(mm || 0),
          Number(ss || 0)
        );

  return date.toISOString();
}
