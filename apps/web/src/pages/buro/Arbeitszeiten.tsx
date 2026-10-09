import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

type Row = Record<string, any>;

function authHeaders(): Record<string, string> {
  for (const key of ["rlc_token", "token", "authToken", "accessToken", "rlc_auth_token"]) {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (token?.trim()) return { Authorization: `Bearer ${token.trim()}` };
  }
  return {};
}

async function get(path: string) {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...authHeaders(),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
  }

  return payload;
}

function itemsOf(payload: any): Row[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function employeeOf(row: Row) {
  return String(
    row.employeeName ||
    row.employee ||
    row.mitarbeiter ||
    row.worker ||
    row.submittedBy?.employeeName ||
    row.submittedBy?.displayName ||
    row.submittedBy?.userName ||
    "Unbekannt"
  );
}

function hoursOf(row: Row) {
  const value = Number(row.hours ?? row.netHours ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export default function Arbeitszeiten() {
  const embedded =
    window.location.pathname === "/buro/personalverwaltung";
  const [searchParams] = useSearchParams();
  const employeeFilter = String(
    searchParams.get("mitarbeiter") || ""
  ).trim();

  const { getSelectedProject } = useProject();
  const project = getSelectedProject();

  const projectKey = String(project?.code || project?.id || "").trim();

  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    if (!projectKey) {
      setRows([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = await get(
        `/api/inbox/${encodeURIComponent(projectKey)}/ARBEITSZEIT/final`
      );
      setRows(itemsOf(payload));
    } catch (e: any) {
      setError(e?.message || "Arbeitszeiten konnten nicht geladen werden.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visibleRows = React.useMemo(() => {
    if (!employeeFilter) return rows;

    return rows.filter(
      (row) =>
        employeeOf(row)
          .trim()
          .toLocaleLowerCase("de-DE") ===
        employeeFilter
          .toLocaleLowerCase("de-DE")
    );
  }, [rows, employeeFilter]);

  const totalHours = visibleRows.reduce(
    (sum, row) => sum + hoursOf(row),
    0
  );

  const employees = new Set(
    visibleRows.map(employeeOf)
  ).size;

  return (
    <div className="card">

      {!embedded && (
      <header className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Personal · Fachmodul
          </div>

          <h1>Arbeitszeiten</h1>

          <p>
            Freigegebene Arbeitszeitnachweise ·
            Projekt {projectKey || "—"}
            {employeeFilter
              ? ` · Mitarbeiter ${employeeFilter}`
              : ""}
          </p>
        </div>

        <div className="rlc-page-hero__actions">
          <button
            type="button"
            className="rlc-page-hero__button"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Wird geladen …" : "Aktualisieren"}
          </button>

          {employeeFilter && (
            <Link
              className="rlc-page-hero__button"
              to={`/buro/personalverwaltung?mitarbeiter=${encodeURIComponent(
                employeeFilter
              )}`}
            >
              Personalakte
            </Link>
          )}

          <Link
            className="rlc-page-hero__button"
            to="/mobile/pruefung/ARBEITSZEIT"
          >
            Eingangsprüfung →
          </Link>
        </div>
      </header>
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 12,
          marginBottom: 14
        }}
      >
        <div className="card">
          <div className="muted">Nachweise</div>
          <strong style={{ fontSize: 24 }}>{visibleRows.length}</strong>
        </div>

        <div className="card">
          <div className="muted">Gesamtstunden</div>
          <strong style={{ fontSize: 24 }}>
            {totalHours.toFixed(2).replace(".", ",")} h
          </strong>
        </div>

        <div className="card">
          <div className="muted">Mitarbeiter</div>
          <strong style={{ fontSize: 24 }}>{employees}</strong>
        </div>
      </section>

      {error ? (
        <div className="empty">
          <h3>Fehler</h3>
          <p>{error}</p>
        </div>
      ) : null}

      {!error && loading ? (
        <div className="empty">
          <h3>Arbeitszeiten werden geladen …</h3>
        </div>
      ) : null}

      {!error && !loading && visibleRows.length === 0 ? (
        <div className="empty">
          <h3>Noch keine freigegebenen Arbeitszeiten</h3>
          <p>
            Eingereichte Arbeitszeiten erscheinen nach der Freigabe
            in der Eingangsprüfung hier.
          </p>
        </div>
      ) : null}

      {!loading && visibleRows.length > 0 ? (
        <section className="card">
          <div className="rlc-page-section-head">
            <strong>Arbeitszeitnachweise</strong>
            <span>{visibleRows.length} Nachweise</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Mitarbeiter</th>
                  <th>Zeit</th>
                  <th>Pause</th>
                  <th>Netto</th>
                  <th>Tätigkeit</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((row, index) => (
                  <tr key={String(row.id || row.docId || index)}>
                    <td>
                      {String(row.date || row.datum || "—").slice(0, 10)}
                    </td>

                    <td>
                      <strong>{employeeOf(row)}</strong>
                    </td>

                    <td>
                      {row.start || row.arbeitsbeginn || "—"}–
                      {row.end || row.arbeitsende || "—"}
                    </td>

                    <td>
                      {Number(
                        row.breakMinutes ??
                        row.pauseMinutes ??
                        0
                      )} Min.
                    </td>

                    <td>
                      <strong>
                        {hoursOf(row).toFixed(2).replace(".", ",")} h
                      </strong>
                    </td>

                    <td>
                      {row.activity ||
                       row.taetigkeit ||
                       row.note ||
                       "—"}
                    </td>

                    <td>
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "3px 9px",
                          borderRadius: 999,
                          background: "#dcfce7",
                          color: "#166534",
                          fontSize: 11,
                          fontWeight: 650
                        }}
                      >
                        Freigegeben
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

    </div>
  );
}
