import React from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import { groupByMobileEmployee, resolveMobileEmployee } from "./mobileEmployee";

type SourceConfig = {
  key: string;
  title: string;
  to: string;
  endpoints: string[];
};

const SOURCES: SourceConfig[] = [
  { key: "ARBEITSZEIT", title: "Arbeitszeiten", to: "/mobile/pruefung/ARBEITSZEIT", endpoints: ["/api/inbox/{project}/ARBEITSZEIT"] },
  { key: "REGIE", title: "Regieberichte", to: "/buro/regieberichte", endpoints: ["/api/regie/inbox/list?projectId={project}"] },
  { key: "LIEFERSCHEIN", title: "Lieferscheine", to: "/buro/lieferscheine", endpoints: ["/api/ls/inbox/list?projectId={project}"] },
  { key: "FOTOS", title: "Fotos / Notizen", to: "/buro/fotos", endpoints: ["/api/fotos/inbox/list?projectId={project}", "/api/photos/inbox/list?projectId={project}"] },
  { key: "TAGESBERICHT", title: "Tagesberichte", to: "/buro/tagesberichte", endpoints: ["/api/tagesbericht/inbox/list?projectId={project}", "/api/regie/inbox/list?projectId={project}"] },
  { key: "BAUTAGEBUCH", title: "Bautagebuch", to: "/buro/bautagebuch", endpoints: ["/api/regie/inbox/list?projectId={project}"] },
  { key: "MENGENERMITTLUNG", title: "Mengenermittlung", to: "/mobile/pruefung/MENGENERMITTLUNG", endpoints: ["/api/inbox/{project}/MENGENERMITTLUNG"] },
];

function authHeaders(): Record<string, string> {
  for (const key of ["rlc_token", "token", "authToken", "accessToken", "rlc_auth_token"]) {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (token?.trim()) return { Authorization: `Bearer ${token.trim()}` };
  }
  return {};
}

function extractRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ["items", "rows", "documents", "data", "results"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

async function loadFirst(projectKey: string, endpoints: string[]) {
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(apiUrl(endpoint.split("{project}").join(encodeURIComponent(projectKey))), {
        credentials: "include",
        headers: { Accept: "application/json", ...authHeaders() },
      });
      if (!response.ok) continue;
      const payload = await response.json().catch(() => null);
      const rows = extractRows(payload);
      if (rows.length || payload?.ok !== false) return rows;
    } catch {
      // nächste kompatible Route versuchen
    }
  }
  return [];
}

export default function MitarbeiterEingaenge() {
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();
  const projectKey = String(project?.code || project?.id || "").trim();
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedEmployee, setSelectedEmployee] = React.useState("ALL");
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    if (!projectKey) return setRows([]);

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        apiUrl(`/api/company/projects/${encodeURIComponent(projectKey)}/submissions`),
        {
          credentials: "include",
          headers: {
            Accept: "application/json",
            ...authHeaders(),
          },
        }
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }

      const submissions = Array.isArray(payload?.submissions)
        ? payload.submissions
        : [];

      setRows(
        submissions.map((row: any) => {
          const sourceConfig =
            SOURCES.find(
              (source) =>
                source.key === String(row.kind || "").toUpperCase()
            ) || {
              key: String(row.kind || "UNKNOWN").toUpperCase(),
              title: String(row.kind || "Dokument"),
              to: "/mobile",
              endpoints: [],
            };

          return {
            ...row,
            id: row.entityId || row.id,
            employeeId: row.userId,
            employeeName: row.name,
            name: row.name,
            email: row.email,
            date: row.createdAt,
            title: row.title || sourceConfig.title,
            __source: sourceConfig,
          };
        })
      );
    } catch (err: any) {
      setError(err?.message || "Eingänge konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  React.useEffect(() => { void load(); }, [load]);

  const employeeOptions = React.useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();

    rows.forEach((row) => {
      const employee = resolveMobileEmployee(row);

      if (!map.has(employee.key)) {
        map.set(employee.key, {
          key: employee.key,
          label: employee.label,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "de")
    );
  }, [rows]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de-DE");

    return rows.filter((row) => {
      const employee = resolveMobileEmployee(row);

      if (
        selectedEmployee !== "ALL" &&
        employee.key !== selectedEmployee
      ) {
        return false;
      }

      if (!needle) return true;

      return `${employee.label} ${employee.employeeId} ${row?.title || ""} ${row?.id || ""}`
        .toLocaleLowerCase("de-DE")
        .includes(needle);
    });
  }, [rows, query, selectedEmployee]);

  const groups = React.useMemo(
    () => groupByMobileEmployee(filtered),
    [filtered]
  );

  function documentUrl(row: any) {
    const source = row?.__source;
    const docId = String(row?.entityId || row?.id || "").trim();

    if (!source || !docId) return "/mobile";

    const params =
      `projectId=${encodeURIComponent(projectKey)}` +
      `&docId=${encodeURIComponent(docId)}` +
      `&stage=inbox&source=mobile`;

    if (source.key === "REGIE") {
      return `/buro/regieberichte?${params}`;
    }

    if (source.key === "TAGESBERICHT") {
      return `/buro/tagesberichte?${params}`;
    }

    if (source.key === "BAUTAGEBUCH") {
      return `/buro/bautagebuch?${params}`;
    }

    if (source.key === "FOTOS") {
      return `/buro/fotos?${params}`;
    }

    return `${source.to}?${params}`;
  }

  return (
    <div style={{ display: "grid", gap: 16, paddingBottom: 28 }}>
      <section style={{ borderRadius: 20, padding: 22, color: "white", background: "linear-gradient(135deg,#0f2f8f,#2563eb)" }}>
        <div style={{ fontSize: 12, fontWeight: 900, opacity: .9 }}>Mobile-Zentrale</div>
        <h1 style={{ margin: "8px 0 6px" }}>Eingänge nach Mitarbeiter</h1>
        <div style={{ opacity: .92 }}>Alle Mobile-Eingänge des Projekts werden anhand Mitarbeiter-ID bzw. Login eindeutig gruppiert.</div>
      </section>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select
          value={selectedEmployee}
          onChange={(e) => setSelectedEmployee(e.target.value)}
          style={{
            minWidth: 250,
            border: "1px solid #cbd5e1",
            borderRadius: 11,
            padding: "10px 12px",
            background: "white",
          }}
        >
          <option value="ALL">Alle Mitarbeiter</option>
          {employeeOptions.map((employee) => (
            <option key={employee.key} value={employee.key}>
              {employee.label}
            </option>
          ))}
        </select>

        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Mitarbeiter, Personalnummer oder Dokument suchen…" style={{ flex: "1 1 320px", border: "1px solid #cbd5e1", borderRadius: 11, padding: "10px 12px" }} />
        <button onClick={() => void load()} disabled={loading || !projectKey} style={{ border: "1px solid #cbd5e1", borderRadius: 11, padding: "10px 14px", background: "white", fontWeight: 900 }}>{loading ? "Lädt…" : "Aktualisieren"}</button>
      </div>

      {error ? <div style={{ padding: 12, border: "1px solid #fecaca", borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{error}</div> : null}

      {groups.map(({ identity, rows: employeeRows }) => {
        const counts = new Map<string, number>();
        employeeRows.forEach((row) => counts.set(row.__source.key, (counts.get(row.__source.key) || 0) + 1));
        return (
          <section key={identity.key} style={{ border: "1px solid #dbe4f0", borderRadius: 16, background: "white", overflow: "hidden" }}>
            <header style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: 16, background: "#f8fafc", borderBottom: "1px solid #e2e8f0", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 950 }}>{identity.label}</div>
                <div style={{ color: "#64748b", fontSize: 12 }}>{identity.employeeId ? `Mitarbeiter-ID: ${identity.employeeId}` : identity.userId ? `Benutzer-ID: ${identity.userId}` : "Zuordnung über Namen"}</div>
              </div>
              <div style={{ fontWeight: 950 }}>{employeeRows.length} Eingänge</div>
            </header>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, padding: 14 }}>
              {employeeRows.map((row) => (
                <Link
                  key={`${row.__source.key}-${row.id}`}
                  to={documentUrl(row)}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>
                    {row.__source.title}
                  </div>

                  <div style={{ marginTop: 4, fontSize: 15, fontWeight: 950 }}>
                    {row.title || row.__source.title}
                  </div>

                  <div style={{ marginTop: 5, fontSize: 12, color: "#64748b" }}>
                    {row.createdAt
                      ? new Date(row.createdAt).toLocaleString("de-DE")
                      : ""}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {!loading && !groups.length ? <div style={{ padding: 18, border: "1px dashed #cbd5e1", borderRadius: 12, color: "#64748b" }}>Keine passenden Mobile-Eingänge gefunden.</div> : null}
    </div>
  );
}
