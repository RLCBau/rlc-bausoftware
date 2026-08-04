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
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    if (!projectKey) return setRows([]);
    setLoading(true);
    setError("");
    try {
      const result = await Promise.all(
        SOURCES.map(async (source) =>
          (await loadFirst(projectKey, source.endpoints)).map((doc) => ({ ...doc, __source: source }))
        )
      );
      setRows(result.flat());
    } catch (err: any) {
      setError(err?.message || "Eingänge konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  React.useEffect(() => { void load(); }, [load]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de-DE");
    if (!needle) return rows;
    return rows.filter((row) => {
      const employee = resolveMobileEmployee(row);
      return `${employee.label} ${employee.employeeId} ${row?.title || ""} ${row?.id || ""}`
        .toLocaleLowerCase("de-DE")
        .includes(needle);
    });
  }, [rows, query]);

  const groups = React.useMemo(() => groupByMobileEmployee(filtered), [filtered]);

  return (
    <div style={{ display: "grid", gap: 16, paddingBottom: 28 }}>
      <section style={{ borderRadius: 20, padding: 22, color: "white", background: "linear-gradient(135deg,#0f2f8f,#2563eb)" }}>
        <div style={{ fontSize: 12, fontWeight: 900, opacity: .9 }}>Mobile-Zentrale</div>
        <h1 style={{ margin: "8px 0 6px" }}>Eingänge nach Mitarbeiter</h1>
        <div style={{ opacity: .92 }}>Alle Mobile-Eingänge des Projekts werden anhand Mitarbeiter-ID bzw. Login eindeutig gruppiert.</div>
      </section>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
              {SOURCES.filter((source) => (counts.get(source.key) || 0) > 0).map((source) => (
                <Link key={source.key} to={source.to} style={{ textDecoration: "none", color: "inherit", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
                  <div style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>{source.title}</div>
                  <div style={{ marginTop: 4, fontSize: 22, fontWeight: 950 }}>{counts.get(source.key)}</div>
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
