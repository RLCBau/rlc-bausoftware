import React from "react";
import { Link, useLocation } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import { groupByMobileEmployee, resolveMobileEmployee } from "./mobileEmployee";

type WorkflowStage = "inbox" | "approved" | "final";

type GeoStamp = {
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  altitude?: number | null;
  capturedAt?: number;
};

type TimeEvent = {
  id?: string;
  type?: string;
  timestamp?: number;
  time?: string;
  gps?: GeoStamp;
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
};

type Row = Record<string, any> & {
  id: string;
  docId?: string;
  employee?: string;
  employeeName?: string;
  date?: string;
  start?: string;
  end?: string;
  breakMinutes?: number;
  hours?: number;
  activity?: string;
  machines?: string;
  materials?: string;
  note?: string;
  workflowStatus?: string;
  events?: TimeEvent[];
  timeEvents?: TimeEvent[];
  submittedBy?: Record<string, any>;
  approvedAt?: number;
  submittedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  __stage?: WorkflowStage;
};

type StageRows = {
  inbox: Row[];
  approved: Row[];
  final: Row[];
};

const EMPTY_STAGE_ROWS: StageRows = { inbox: [], approved: [], final: [] };

function authHeaders(): Record<string, string> {
  for (const key of [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc_auth_token",
    "rlc_mobile_token",
  ]) {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (token?.trim()) return { Authorization: `Bearer ${token.trim()}` };
  }
  return {};
}

async function get(path: string) {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
  }
  return payload;
}

function itemsOf(payload: any): Row[] {
  const candidates = [
    payload,
    payload?.items,
    payload?.rows,
    payload?.documents,
    payload?.reports,
    payload?.data,
    payload?.data?.items,
    payload?.data?.rows,
    payload?.data?.documents,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as Row[];
  }
  return [];
}

function normalizeRow(raw: any, stage: WorkflowStage): Row {
  const source = raw?.document || raw?.item || raw?.data || raw || {};
  const identity = resolveMobileEmployee(source);
  return {
    ...source,
    id: String(source?.id || source?.docId || raw?.id || raw?.docId || ""),
    docId: String(source?.docId || source?.id || raw?.docId || raw?.id || ""),
    employee: String(
      source?.employee ||
        source?.employeeName ||
        identity.employeeName ||
        identity.label ||
        ""
    ),
    employeeName: String(source?.employeeName || identity.employeeName || ""),
    date: String(source?.date || source?.datum || "").slice(0, 10),
    start: String(source?.start || source?.arbeitsbeginn || ""),
    end: String(source?.end || source?.arbeitsende || ""),
    breakMinutes: Number(source?.breakMinutes ?? source?.pauseMinutes ?? 0),
    hours: Number(source?.hours ?? source?.netHours ?? source?.nettoHours ?? 0),
    activity: String(source?.activity || source?.taetigkeit || ""),
    machines: String(source?.machines || source?.maschinen || ""),
    materials: String(source?.materials || source?.material || ""),
    note: String(source?.note || source?.bemerkung || source?.bemerkungen || ""),
    events: Array.isArray(source?.events)
      ? source.events
      : Array.isArray(source?.timeEvents)
        ? source.timeEvents
        : [],
    __stage: stage,
  };
}

function eventTypeLabel(type?: string) {
  const value = String(type || "").toUpperCase();
  if (value === "START") return "Arbeitsbeginn";
  if (value === "PAUSE_START") return "Pause begonnen";
  if (value === "PAUSE_END") return "Arbeit fortgesetzt";
  if (value === "END") return "Arbeitsende";
  return type || "Zeitereignis";
}

function eventTimestamp(event: TimeEvent) {
  if (event.time) return event.time;
  if (event.timestamp) {
    return new Date(event.timestamp).toLocaleString("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  return "—";
}

function eventGps(event: TimeEvent) {
  const latitude = Number(event?.gps?.latitude ?? event?.latitude);
  const longitude = Number(event?.gps?.longitude ?? event?.longitude);
  const accuracy = event?.gps?.accuracy ?? event?.accuracy ?? null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, accuracy };
}

function stageLabel(stage?: WorkflowStage) {
  if (stage === "inbox") return "Eingang";
  if (stage === "approved") return "Freigegeben";
  return "Final";
}

function formatHours(value: unknown) {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function dateTime(value: unknown) {
  const numeric = Number(value || 0);
  if (!numeric) return "—";
  return new Date(numeric).toLocaleString("de-DE");
}

export default function Arbeitszeiten() {
  const { getSelectedProject } = useProject();
  const selectedProject = getSelectedProject();
  const location = useLocation();

  const search = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const projectFromUrl = String(search.get("projectId") || "").trim();
  const projectKey = String(
    projectFromUrl || selectedProject?.code || selectedProject?.id || ""
  ).trim();
  const requestedDocId = String(search.get("docId") || "").trim();
  const requestedStage = String(search.get("stage") || "approved").toLowerCase();

  const [stageRows, setStageRows] = React.useState<StageRows>(EMPTY_STAGE_ROWS);
  const [selected, setSelected] = React.useState<Row | null>(null);
  const [employeeFilter, setEmployeeFilter] = React.useState("");
  const [dateFilter, setDateFilter] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    if (!projectKey) return;
    setLoading(true);
    setError("");
    try {
      const base = `/api/inbox/${encodeURIComponent(projectKey)}/ARBEITSZEIT`;
      const results = await Promise.allSettled([
        get(base),
        get(`${base}/approved`),
        get(`${base}/final`),
      ]);

      const next: StageRows = {
        inbox:
          results[0].status === "fulfilled"
            ? itemsOf(results[0].value).map((row) => normalizeRow(row, "inbox"))
            : [],
        approved:
          results[1].status === "fulfilled"
            ? itemsOf(results[1].value).map((row) => normalizeRow(row, "approved"))
            : [],
        final:
          results[2].status === "fulfilled"
            ? itemsOf(results[2].value).map((row) => normalizeRow(row, "final"))
            : [],
      };

      setStageRows(next);

      if (requestedDocId) {
        const preferred =
          requestedStage === "inbox"
            ? next.inbox
            : requestedStage === "final"
              ? next.final
              : next.approved;
        const found =
          preferred.find((row) => row.id === requestedDocId || row.docId === requestedDocId) ||
          [...next.inbox, ...next.approved, ...next.final].find(
            (row) => row.id === requestedDocId || row.docId === requestedDocId
          );
        setSelected(found || null);
      }
    } catch (loadError: any) {
      setError(loadError?.message || "Arbeitszeiten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [projectKey, requestedDocId, requestedStage]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const allRows = React.useMemo(
    () => [...stageRows.approved, ...stageRows.final, ...stageRows.inbox],
    [stageRows]
  );

  const filteredRows = React.useMemo(() => {
    return allRows.filter((row) => {
      const identity = resolveMobileEmployee(row);
      const matchesEmployee =
        !employeeFilter ||
        identity.label.toLocaleLowerCase("de-DE").includes(
          employeeFilter.toLocaleLowerCase("de-DE")
        );
      const matchesDate = !dateFilter || row.date === dateFilter;
      return matchesEmployee && matchesDate;
    });
  }, [allRows, dateFilter, employeeFilter]);

  const employeeGroups = React.useMemo(
    () => groupByMobileEmployee(filteredRows),
    [filteredRows]
  );

  const totalHours = filteredRows.reduce((sum, row) => sum + Number(row.hours || 0), 0);
  const employeeCount = new Set(
    filteredRows.map((row) => resolveMobileEmployee(row).key)
  ).size;

  return (
    <div style={{ display: "grid", gap: 18, paddingBottom: 32 }}>
      <div style={hero}>
        <div>
          <div style={eyebrow}>PERSONAL · FACHMODUL</div>
          <h1 style={{ margin: "5px 0" }}>Arbeitszeiten</h1>
          <div style={muted}>
            Tagesnachweise, GPS-Zeitbuchungen und Mitarbeiterübersicht · Projekt{" "}
            {projectKey || "—"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button style={button} onClick={() => void load()}>
            {loading ? "Lädt …" : "Aktualisieren"}
          </button>
          <Link
            to="/mobile/pruefung/ARBEITSZEIT"
            style={{ ...button, background: "#1d4ed8", color: "white", textDecoration: "none" }}
          >
            Eingangsprüfung →
          </Link>
        </div>
      </div>

      <div style={stats}>
        <Stat label="Nachweise" value={String(filteredRows.length)} />
        <Stat label="Gesamtstunden" value={`${formatHours(totalHours)} h`} />
        <Stat label="Mitarbeiter" value={String(employeeCount)} />
      </div>

      <div style={filterBar}>
        <label style={filterLabel}>
          Mitarbeiter
          <input
            style={input}
            value={employeeFilter}
            onChange={(event) => setEmployeeFilter(event.target.value)}
            placeholder="Name suchen"
          />
        </label>
        <label style={filterLabel}>
          Datum
          <input
            style={input}
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />
        </label>
        <button
          style={button}
          onClick={() => {
            setEmployeeFilter("");
            setDateFilter("");
          }}
        >
          Filter löschen
        </button>
      </div>

      {error ? <div style={err}>{error}</div> : null}

      {selected ? (
        <DetailPanel row={selected} onClose={() => setSelected(null)} />
      ) : null}

      <div style={{ display: "grid", gap: 16 }}>
        {employeeGroups.map((group) => {
          const hours = group.rows.reduce((sum, row) => sum + Number(row.hours || 0), 0);
          return (
            <section key={group.identity.key} style={employeeCard}>
              <div style={employeeHeader}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: "#0f172a" }}>
                    {group.identity.label}
                  </div>
                  <div style={muted}>
                    {group.rows.length} Nachweis(e) · {formatHours(hours)} h
                  </div>
                </div>
              </div>

              <div style={tableWrap}>
                <table style={table}>
                  <thead>
                    <tr>
                      <Th>Datum</Th>
                      <Th>Zeit</Th>
                      <Th>Pause</Th>
                      <Th>Netto</Th>
                      <Th>Tätigkeit</Th>
                      <Th>GPS</Th>
                      <Th>Status</Th>
                      <Th>Aktion</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => {
                      const events = Array.isArray(row.events) ? row.events : [];
                      const gpsCount = events.filter((event) => eventGps(event)).length;
                      return (
                        <tr key={`${row.__stage}:${row.id}`}>
                          <Td>{row.date || "—"}</Td>
                          <Td>{row.start || "—"}–{row.end || "—"}</Td>
                          <Td>{Number(row.breakMinutes || 0)} Min.</Td>
                          <Td strong>{formatHours(row.hours)} h</Td>
                          <Td>{row.activity || "—"}</Td>
                          <Td>{gpsCount} / {events.length}</Td>
                          <Td>
                            <span style={badge}>{stageLabel(row.__stage)}</span>
                          </Td>
                          <Td>
                            <button style={smallButton} onClick={() => setSelected(row)}>
                              Details
                            </button>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        {!employeeGroups.length ? (
          <div style={empty}>
            Noch keine Arbeitszeiten für die aktuelle Auswahl vorhanden.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailPanel({ row, onClose }: { row: Row; onClose: () => void }) {
  const identity = resolveMobileEmployee(row);
  const events = Array.isArray(row.events) ? row.events : [];
  return (
    <section style={detailPanel}>
      <div style={detailHeader}>
        <div>
          <div style={eyebrow}>ARBEITSZEITNACHWEIS</div>
          <h2 style={{ margin: "4px 0 0" }}>
            {identity.label} · {row.date || "—"}
          </h2>
        </div>
        <button style={button} onClick={onClose}>Schließen</button>
      </div>

      <div style={detailGrid}>
        <Detail label="Mitarbeiter" value={identity.label} />
        <Detail label="Datum" value={row.date || "—"} />
        <Detail label="Arbeitsbeginn" value={row.start || "—"} />
        <Detail label="Arbeitsende" value={row.end || "—"} />
        <Detail label="Pause" value={`${Number(row.breakMinutes || 0)} Min.`} />
        <Detail label="Nettoarbeitszeit" value={`${formatHours(row.hours)} h`} />
        <Detail label="Tätigkeit" value={row.activity || "—"} />
        <Detail label="Maschinen" value={row.machines || "—"} />
        <Detail label="Material" value={row.materials || "—"} />
        <Detail label="Bemerkung" value={row.note || "—"} />
        <Detail label="Status" value={row.workflowStatus || stageLabel(row.__stage)} />
        <Detail label="Eingereicht" value={dateTime(row.submittedAt || row.createdAt)} />
      </div>

      <div style={{ marginTop: 18 }}>
        <h3 style={{ margin: "0 0 10px" }}>GPS-Zeitbuchungen</h3>
        <div style={{ display: "grid", gap: 9 }}>
          {events.map((event, index) => {
            const gps = eventGps(event);
            return (
              <div key={event.id || `${event.type}-${index}`} style={gpsCard}>
                <div>
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>
                    {index + 1}. {eventTypeLabel(event.type)}
                  </div>
                  <div style={muted}>{eventTimestamp(event)}</div>
                </div>
                <div>
                  {gps ? (
                    <>
                      <div style={{ fontWeight: 800 }}>
                        {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}
                      </div>
                      <div style={muted}>
                        Genauigkeit: {gps.accuracy != null ? `±${Math.round(Number(gps.accuracy))} m` : "—"}
                      </div>
                    </>
                  ) : (
                    <div style={muted}>Keine GPS-Position gespeichert.</div>
                  )}
                </div>
                {gps ? (
                  <a
                    style={mapLink}
                    href={`https://www.google.com/maps?q=${gps.latitude},${gps.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Position öffnen
                  </a>
                ) : null}
              </div>
            );
          })}
          {!events.length ? <div style={empty}>Keine GPS-Zeitbuchungen vorhanden.</div> : null}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={stat}>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={detailCell}>
      <div style={detailLabel}>{label}</div>
      <div style={detailValue}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={th}>{children}</th>;
}

function Td({
  children,
  strong,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return <td style={{ ...td, fontWeight: strong ? 800 : 500 }}>{children}</td>;
}

const hero: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1,
  color: "#2563eb",
};

const muted: React.CSSProperties = { fontSize: 12, color: "#64748b" };

const button: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  background: "white",
  padding: "9px 12px",
  fontWeight: 800,
  color: "#0f172a",
  cursor: "pointer",
};

const smallButton: React.CSSProperties = {
  ...button,
  padding: "6px 9px",
  fontSize: 12,
};

const stats: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3,minmax(160px,1fr))",
  gap: 10,
};

const stat: React.CSSProperties = {
  background: "white",
  border: "1px solid #dbe4f0",
  borderRadius: 14,
  padding: 16,
};

const filterBar: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "end",
  flexWrap: "wrap",
  padding: 14,
  background: "#ffffff",
  border: "1px solid #dbe4f0",
  borderRadius: 14,
};

const filterLabel: React.CSSProperties = {
  display: "grid",
  gap: 5,
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
};

const input: React.CSSProperties = {
  minWidth: 220,
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  padding: "9px 10px",
  font: "inherit",
};

const err: React.CSSProperties = {
  padding: 12,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 10,
};

const employeeCard: React.CSSProperties = {
  display: "grid",
  gap: 10,
  background: "#ffffff",
  border: "1px solid #dbe4f0",
  borderRadius: 14,
  overflow: "hidden",
};

const employeeHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 16px 0",
};

const tableWrap: React.CSSProperties = {
  overflowX: "auto",
  background: "white",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1100,
};

const th: React.CSSProperties = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: 11,
  color: "#475569",
  background: "#f8fafc",
  borderBottom: "1px solid #dbe4f0",
};

const td: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 13,
  color: "#334155",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
};

const badge: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  background: "#dcfce7",
  color: "#166534",
  fontWeight: 900,
  fontSize: 10,
};

const empty: React.CSSProperties = {
  padding: 24,
  textAlign: "center",
  color: "#64748b",
  background: "#ffffff",
  border: "1px dashed #cbd5e1",
  borderRadius: 12,
};

const detailPanel: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #bfdbfe",
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 14px 35px rgba(15,23,42,0.08)",
};

const detailHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const detailGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
  gap: 10,
  marginTop: 16,
};

const detailCell: React.CSSProperties = {
  border: "1px solid #dbe4f0",
  borderRadius: 11,
  padding: 12,
  background: "#f8fafc",
};

const detailLabel: React.CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 800,
  marginBottom: 5,
};

const detailValue: React.CSSProperties = {
  color: "#0f172a",
  fontWeight: 700,
  whiteSpace: "pre-wrap",
};

const gpsCard: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px,1fr) minmax(240px,1fr) auto",
  gap: 14,
  alignItems: "center",
  border: "1px solid #dbe4f0",
  borderRadius: 11,
  padding: 12,
  background: "#f8fafc",
};

const mapLink: React.CSSProperties = {
  ...button,
  textDecoration: "none",
  textAlign: "center",
  background: "#1d4ed8",
  color: "#ffffff",
};
