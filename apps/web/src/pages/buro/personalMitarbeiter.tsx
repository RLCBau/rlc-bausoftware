import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";

type RetentionMeta = {
  category: string;
  legalBasis: string;
  retentionUntil?: string | null;
  legalHold?: boolean;
  classifiedAt?: string | null;
  classifiedBy?: string | null;
};

type Certificate = {
  id: string;
  name: string;
  validUntil?: string | null;
  retention?: RetentionMeta;
};

type EmployeeDocument = {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  retention?: RetentionMeta;
};

type Employee = {
  id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  hourlyRate?: number;
  costCenter?: string | null;
  projects?: string[];
  employmentType?: string | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  vacationTotal?: number | null;
  vacationTaken?: number | null;
  certificates?: Certificate[];
  documents?: EmployeeDocument[];
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
      return {
        Authorization: `Bearer ${token.trim()}`
      };
    }
  }

  return {};
}

async function jsonRequest(
  path: string,
  init?: RequestInit
) {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...authHeaders(),
      ...(init?.headers || {})
    }
  });

  const payload = await response
    .json()
    .catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(
      payload?.error ||
      payload?.message ||
      `HTTP ${response.status}`
    );
  }

  return payload;
}

function dateInput(value?: string | null) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function toIso(value: string) {
  return value
    ? `${value}T12:00:00.000Z`
    : null;
}

function retentionDeleteAllowed(meta?: RetentionMeta) {
  if (!meta || !meta.category || meta.category === "UNCLASSIFIED" || meta.legalHold) return false;
  if (!String(meta.legalBasis || "").trim()) return false;
  if (meta.category === "NO_RETENTION_REQUIRED") return true;
  if (!meta.retentionUntil) return false;
  return new Date(meta.retentionUntil).getTime() <= Date.now();
}

function daysLeft(value?: string | null) {
  if (!value) return null;

  return Math.round((Date.parse(String(value).slice(0,10)+"T00:00:00Z")-Date.parse(new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())+"T00:00:00Z"))/86400000);
}

function fileSize(value: number) {
  if (!value) return "0 KB";
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d8dee8",
  borderRadius: 7,
  padding: "7px 9px",
  fontSize: 13,
  background: "#fff"
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 650,
  color: "#64748b",
  marginBottom: 4
};

export default function Personalverwaltung() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const requestedEmployeeId = searchParams.get("employeeId") || "";
  const requestedEmployee = String(
    searchParams.get("mitarbeiter") || ""
  ).trim();

  const requestedProject = String(
    searchParams.get("projectId") || ""
  ).trim();

  const [employees, setEmployees] =
    React.useState<Employee[]>([]);

  const [selectedId, setSelectedId] =
    React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const [projectFilter, setProjectFilter] =
    React.useState(requestedProject);

  const [loading, setLoading] =
    React.useState(false);

  const [uploading, setUploading] =
    React.useState(false);

  const [error, setError] =
    React.useState("");

  const [draft, setDraft] =
    React.useState<Employee | null>(null);

  const [dirty, setDirty] =
    React.useState(false);

  const fileInput =
    React.useRef<HTMLInputElement | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload =
        await jsonRequest("/api/personal");

      const rows: Employee[] =
        Array.isArray(payload?.items)
          ? payload.items
          : [];

      setEmployees(rows);

      setSelectedId((current) => {
        if (
          current &&
          rows.some((row) => row.id === current)
        ) {
          return current;
        }

        return rows[0]?.id ?? null;
      });
    } catch (e: any) {
      setEmployees([]);
      setSelectedId(null);
      setError(
        e?.message ||
        "Personal konnte nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (requestedProject) {
      setProjectFilter(requestedProject);
    }

    if (requestedEmployeeId) {
      const match=employees.find(row=>row.id===requestedEmployeeId);setSelectedId(match?.id||null);if(match)setQuery(match.name);return;
    }
    if (requestedEmployee) {
      const match = employees.find(
        (row) =>
          row.name.trim().toLocaleLowerCase("de-DE") ===
          requestedEmployee.toLocaleLowerCase("de-DE")
      );

      if (match) {
        setSelectedId(match.id);
        setQuery(requestedEmployee);
      }
    }
  }, [
    requestedEmployeeId,
    requestedEmployee,
    requestedProject,
    employees
  ]);

  const selected = React.useMemo(
    () =>
      employees.find(
        (row) => row.id === selectedId
      ) ?? null,
    [employees, selectedId]
  );

  React.useEffect(() => {
    setDraft(selected ? { ...selected } : null);
    setDirty(false);
  }, [selected]);

  const projects = React.useMemo(
    () =>
      Array.from(
        new Set(
          employees.flatMap(
            (row) => row.projects || []
          )
        )
      ).sort(),
    [employees]
  );

  const filtered = React.useMemo(() => {
    const q = query
      .trim()
      .toLocaleLowerCase("de-DE");

    return employees.filter((row) => {
      const text = [
        row.name,
        row.role || "",
        row.email || "",
        ...(row.projects || [])
      ]
        .join(" ")
        .toLocaleLowerCase("de-DE");

      const matchesQuery =
        !q || text.includes(q);

      const matchesProject =
        !projectFilter ||
        (row.projects || []).includes(
          projectFilter
        );

      return matchesQuery && matchesProject;
    });
  }, [employees, query, projectFilter]);

  const patchDraft = React.useCallback(
    (patch: Partial<Employee>) => {
      setDraft((current) =>
        current
          ? {
              ...current,
              ...patch
            }
          : current
      );

      setDirty(true);
    },
    []
  );

  const saveEmployee = React.useCallback(
    async () => {
      if (!selected || !draft) return;

      setError("");

      try {
        const payload = await jsonRequest(
          `/api/personal/${encodeURIComponent(
            selected.id
          )}`,
          {
            method: "PUT",
            body: JSON.stringify(draft)
          }
        );

        if (payload?.item) {
          setEmployees((current) =>
            current.map((row) =>
              row.id === payload.item.id
                ? {
                    ...payload.item,
                    certificates:
                      selected.certificates || [],
                    documents:
                      selected.documents || []
                  }
                : row
            )
          );

          setDraft({
            ...payload.item,
            certificates:
              selected.certificates || [],
            documents:
              selected.documents || []
          });

          setDirty(false);
        }
      } catch (e: any) {
        setError(
          e?.message ||
          "Mitarbeiter konnte nicht gespeichert werden."
        );
      }
    },
    [selected, draft]
  );

  const addEmployee =
    React.useCallback(async () => {
      try {
        const payload = await jsonRequest(
          "/api/personal",
          {
            method: "POST",
            body: JSON.stringify({
              name: "Neuer Mitarbeiter",
              hourlyRate: 0,
              costCenter: "",
              projects: requestedProject
                ? [requestedProject]
                : [],
              employmentType: "Vollzeit",
              vacationTotal: 25,
              vacationTaken: 0
            })
          }
        );

        await refresh();

        if (payload?.item?.id) {
          setSelectedId(payload.item.id);
        }
      } catch (e: any) {
        setError(
          e?.message ||
          "Mitarbeiter konnte nicht angelegt werden."
        );
      }
    }, [refresh, requestedProject]);

  const deleteEmployee =
    React.useCallback(async () => {
      if (!selected) return;

      if (
        !window.confirm(
          `${activeEmployee?.name || ""} wirklich löschen?`
        )
      ) {
        return;
      }

      try {
        await jsonRequest(
          `/api/personal/${encodeURIComponent(
            selected.id
          )}`,
          {
            method: "DELETE"
          }
        );

        await refresh();
      } catch (e: any) {
        setError(
          e?.message ||
          "Mitarbeiter konnte nicht gelöscht werden."
        );
      }
    }, [selected, refresh]);

  const addCertificate =
    React.useCallback(async () => {
      if (!selected) return;

      try {
        await jsonRequest(
          `/api/personal/${encodeURIComponent(
            selected.id
          )}/certificates`,
          {
            method: "POST",
            body: JSON.stringify({
              name: "Neues Zertifikat",
              validUntil: null
            })
          }
        );

        await refresh();
      } catch (e: any) {
        setError(
          e?.message ||
          "Zertifikat konnte nicht angelegt werden."
        );
      }
    }, [selected, refresh]);

  const updateCertificate =
    React.useCallback(
      async (
        certificate: Certificate,
        patch: Partial<Certificate>
      ) => {
        if (!selected) return;

        try {
          await jsonRequest(
            `/api/personal/${encodeURIComponent(
              selected.id
            )}/certificates/${encodeURIComponent(
              certificate.id
            )}`,
            {
              method: "PUT",
              body: JSON.stringify({
                ...certificate,
                ...patch
              })
            }
          );

          setEmployees((current) =>
            current.map((row) =>
              row.id !== selected.id
                ? row
                : {
                    ...row,
                    certificates:
                      (
                        row.certificates || []
                      ).map((item) =>
                        item.id === certificate.id
                          ? {
                              ...item,
                              ...patch
                            }
                          : item
                      )
                  }
            )
          );
        } catch (e: any) {
          setError(
            e?.message ||
            "Zertifikat konnte nicht gespeichert werden."
          );
        }
      },
      [selected]
    );

  const saveRetention = React.useCallback(async (kind: "CERT" | "DOC", entityId: string, current: RetentionMeta | undefined, patch: Partial<RetentionMeta>) => {
    if (!selected) return;
    const next: RetentionMeta = {
      category: current?.category || "UNCLASSIFIED",
      legalBasis: current?.legalBasis || "",
      retentionUntil: current?.retentionUntil || null,
      legalHold: Boolean(current?.legalHold),
      ...patch
    };
    try {
      const path = kind === "CERT"
        ? `/api/personal/${encodeURIComponent(selected.id)}/certificates/${encodeURIComponent(entityId)}/retention`
        : `/api/personal/${encodeURIComponent(selected.id)}/documents/${encodeURIComponent(entityId)}/retention`;
      await jsonRequest(path, { method: "PUT", body: JSON.stringify(next) });
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Retention konnte nicht gespeichert werden.");
    }
  }, [selected, refresh]);

  const deleteCertificate =
    React.useCallback(
      async (certificateId: string) => {
        if (!selected) return;

        try {
          await jsonRequest(
            `/api/personal/${encodeURIComponent(
              selected.id
            )}/certificates/${encodeURIComponent(
              certificateId
            )}`,
            {
              method: "DELETE"
            }
          );

          await refresh();
        } catch (e: any) {
          setError(
            e?.message ||
            "Zertifikat konnte nicht gelöscht werden."
          );
        }
      },
      [selected, refresh]
    );

  const uploadDocument =
    React.useCallback(
      async (file: File) => {
        if (!selected) return;

        setUploading(true);
        setError("");

        try {
          const form = new FormData();
          form.append("file", file);

          const response = await fetch(
            apiUrl(
              `/api/personal/${encodeURIComponent(
                selected.id
              )}/documents`
            ),
            {
              method: "POST",
              credentials: "include",
              headers: {
                ...authHeaders()
              },
              body: form
            }
          );

          const payload =
            await response
              .json()
              .catch(() => null);

          if (
            !response.ok ||
            payload?.ok === false
          ) {
            throw new Error(
              payload?.error ||
              `HTTP ${response.status}`
            );
          }

          await refresh();
        } catch (e: any) {
          setError(
            e?.message ||
            "Dokument konnte nicht hochgeladen werden."
          );
        } finally {
          setUploading(false);
        }
      },
      [selected, refresh]
    );

  const openDocument =
    React.useCallback(
      async (documentId: string) => {
        if (!selected) return;

        try {
          const payload = await jsonRequest(
            `/api/personal/${encodeURIComponent(
              selected.id
            )}/documents/${encodeURIComponent(
              documentId
            )}/download`
          );

          if (payload?.downloadUrl) {
            window.open(
              payload.downloadUrl,
              "_blank",
              "noopener,noreferrer"
            );
          }
        } catch (e: any) {
          setError(
            e?.message ||
            "Dokument konnte nicht geöffnet werden."
          );
        }
      },
      [selected]
    );

  const deleteDocument =
    React.useCallback(
      async (documentId: string) => {
        if (!selected) return;

        if (
          !window.confirm(
            "Dokument wirklich löschen?"
          )
        ) {
          return;
        }

        try {
          await jsonRequest(
            `/api/personal/${encodeURIComponent(
              selected.id
            )}/documents/${encodeURIComponent(
              documentId
            )}`,
            {
              method: "DELETE"
            }
          );

          await refresh();
        } catch (e: any) {
          setError(
            e?.message ||
            "Dokument konnte nicht gelöscht werden."
          );
        }
      },
      [selected, refresh]
    );

  const expiringCount =
    employees.reduce((count, employee) => {
      const certificates =
        employee.certificates || [];

      const hasWarning =
        certificates.some((certificate) => {
          const days = daysLeft(
            certificate.validUntil
          );

          return (
            days !== null &&
            days >= 0 &&
            days <= 30
          );
        });

      return count + (hasWarning ? 1 : 0);
    }, 0);

  const activeEmployee = draft || selected;

  const vacationRemaining = activeEmployee
    ? Math.max(
        0,
        Number(
          activeEmployee.vacationTotal || 0
        ) -
          Number(
            activeEmployee.vacationTaken || 0
          )
      )
    : 0;

  const openArbeitszeiten = React.useCallback(() => {
    if (!activeEmployee) return;

    navigate(
      `/buro/arbeitszeiten?mitarbeiter=${encodeURIComponent(
        activeEmployee.name
      )}`
    );
  }, [navigate, activeEmployee]);

  const openKalender = React.useCallback(() => {
    if (!activeEmployee) return;

    navigate(
      `/buro/outlook?mitarbeiter=${encodeURIComponent(
        activeEmployee.name
      )}`
    );
  }, [navigate, activeEmployee]);

  return (
    <div
      style={{
        display: "grid",
        gap: 12
      }}
    >
      <section className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Büro · Organisation
          </div>

          <h1 style={{ margin: "3px 0 4px" }}>
            Personalverwaltung
          </h1>

          <div style={{ opacity: 0.9 }}>
            Mitarbeiter, Kosten, Verträge,
            Qualifikationen und Personalakten
            zentral verwalten.
          </div>
        </div>

        <div className="rlc-page-hero__actions">
          <button
            className="rlc-page-hero__button"
            onClick={addEmployee}
          >
            + Mitarbeiter
          </button>
        </div>
      </section>

      {error && (
        <div
          className="card"
          style={{
            padding: 10,
            color: "#b42318",
            background: "#fff7f6"
          }}
        >
          {error}
        </div>
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4,minmax(0,1fr))",
          gap: 10
        }}
      >
        {[
          ["Mitarbeiter", employees.length],
          ["Aktive Auswahl", filtered.length],
          ["Ablaufwarnungen", expiringCount],
          ["Projekte", projects.length]
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="card"
            style={{
              padding: "12px 14px"
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#64748b",
                fontWeight: 650
              }}
            >
              {label}
            </div>

            <div
              style={{
                marginTop: 3,
                fontSize: 23,
                fontWeight: 750
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </section>

      <section
        className="card"
        style={{
          padding: 10,
          display: "flex",
          gap: 8,
          alignItems: "center"
        }}
      >
        <input
          value={query}
          onChange={(event) =>
            setQuery(event.target.value)
          }
          placeholder="Name, Rolle, E-Mail oder Projekt suchen…"
          style={{
            ...fieldStyle,
            maxWidth: 360
          }}
        />

        <select
          value={projectFilter}
          onChange={(event) =>
            setProjectFilter(
              event.target.value
            )
          }
          style={{
            ...fieldStyle,
            width: 210
          }}
        >
          <option value="">
            Alle Projekte
          </option>

          {projects.map((project) => (
            <option
              key={project}
              value={project}
            >
              {project}
            </option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        {loading && (
          <span
            style={{
              fontSize: 12,
              color: "#64748b"
            }}
          >
            Wird geladen…
          </span>
        )}

        <button
          className="btn"
          onClick={() => void refresh()}
        >
          Aktualisieren
        </button>

        <button
          className="btn"
          disabled={!selected}
          onClick={deleteEmployee}
        >
          Löschen
        </button>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(460px,1.25fr) minmax(430px,0.75fr)",
          gap: 12,
          alignItems: "start"
        }}
      >
        <div
          className="card"
          style={{
            overflow: "hidden"
          }}
        >
          <div
            style={{
              padding: "11px 13px",
              borderBottom:
                "1px solid #e5e7eb",
              fontWeight: 700
            }}
          >
            Mitarbeiter
          </div>

          <div
            style={{
              maxHeight: 620,
              overflow: "auto"
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12
              }}
            >
              <thead>
                <tr>
                  {[
                    "Name",
                    "Rolle",
                    "Kostenstelle",
                    "Std.-Satz",
                    "Projekte",
                    "Status"
                  ].map((head) => (
                    <th
                      key={head}
                      style={{
                        textAlign: "left",
                        padding: "9px 10px",
                        borderBottom:
                          "1px solid #e5e7eb",
                        color: "#64748b",
                        fontSize: 11,
                        position: "sticky",
                        top: 0,
                        background: "#fff",
                        zIndex: 1
                      }}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filtered.map((employee) => {
                  const warning =
                    (
                      employee.certificates ||
                      []
                    ).some(
                      (certificate) => {
                        const days =
                          daysLeft(
                            certificate.validUntil
                          );

                        return (
                          days !== null &&
                          days >= 0 &&
                          days <= 30
                        );
                      }
                    );

                  return (
                    <tr
                      key={employee.id}
                      onClick={() =>
                        setSelectedId(
                          employee.id
                        )
                      }
                      style={{
                        cursor: "pointer",
                        background:
                          employee.id ===
                          selectedId
                            ? "#eef5ff"
                            : undefined
                      }}
                    >
                      <td
                        style={{
                          padding:
                            "9px 10px",
                          borderBottom:
                            "1px solid #eef0f3"
                        }}
                      >
                        <strong>
                          {employee.name}
                        </strong>

                        <div
                          style={{
                            fontSize: 11,
                            color: "#64748b"
                          }}
                        >
                          {employee.email ||
                            "Keine E-Mail"}
                        </div>
                      </td>

                      <td
                        style={{
                          padding:
                            "9px 10px",
                          borderBottom:
                            "1px solid #eef0f3"
                        }}
                      >
                        {employee.role || "—"}
                      </td>

                      <td
                        style={{
                          padding:
                            "9px 10px",
                          borderBottom:
                            "1px solid #eef0f3"
                        }}
                      >
                        {employee.costCenter ||
                          "—"}
                      </td>

                      <td
                        style={{
                          padding:
                            "9px 10px",
                          borderBottom:
                            "1px solid #eef0f3"
                        }}
                      >
                        {Number(
                          employee.hourlyRate ||
                            0
                        ).toFixed(2)}{" "}
                        €
                      </td>

                      <td
                        style={{
                          padding:
                            "9px 10px",
                          borderBottom:
                            "1px solid #eef0f3"
                        }}
                      >
                        {(
                          employee.projects ||
                          []
                        ).join(", ") || "—"}
                      </td>

                      <td
                        style={{
                          padding:
                            "9px 10px",
                          borderBottom:
                            "1px solid #eef0f3"
                        }}
                      >
                        {warning
                          ? "⚠ Prüfung"
                          : "Aktiv"}
                      </td>
                    </tr>
                  );
                })}

                {!filtered.length && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: 20,
                        textAlign:
                          "center",
                        color: "#64748b"
                      }}
                    >
                      Keine Mitarbeiter
                      gefunden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: 14,
            maxHeight: 720,
            overflow: "auto"
          }}
        >
          {!selected ? (
            <div
              style={{
                color: "#64748b",
                padding: 20
              }}
            >
              Mitarbeiter auswählen.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 15
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 10
                  }}
                >
                  <button className="btn btn-primary">
                    Personalakte
                  </button>

                  <button
                    className="btn"
                    onClick={openArbeitszeiten}
                  >
                    Arbeitszeiten
                  </button>

                  <button
                    className="btn"
                    onClick={openKalender}
                  >
                    Kalender
                  </button>
                </div>

                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 750
                  }}
                >
                  {activeEmployee?.name}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: "#64748b",
                    marginTop: 2
                  }}
                >
                  Personalakte
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 10
                  }}
                >
                  <button
                    className="btn btn-primary"
                    disabled={!dirty}
                    onClick={() => void saveEmployee()}
                  >
                    Speichern
                  </button>

                  {dirty && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#b45309",
                        alignSelf: "center"
                      }}
                    >
                      Ungespeicherte Änderungen
                    </span>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap: 9
                }}
              >
                {[
                  [
                    "Name",
                    activeEmployee?.name || "",
                    (value: string) =>
                      patchDraft({
                        name: value
                      })
                  ],
                  [
                    "Rolle",
                    activeEmployee?.role || "",
                    (value: string) =>
                      patchDraft({
                        role: value
                      })
                  ],
                  [
                    "E-Mail",
                    activeEmployee?.email || "",
                    (value: string) =>
                      patchDraft({
                        email: value
                      })
                  ],
                  [
                    "Telefon",
                    activeEmployee?.phone || "",
                    (value: string) =>
                      patchDraft({
                        phone: value
                      })
                  ],
                  [
                    "Kostenstelle",
                    activeEmployee?.costCenter || "",
                    (value: string) =>
                      patchDraft({
                        costCenter: value
                      })
                  ]
                ].map(
                  ([label, value, change]: any) => (
                    <label key={label}>
                      <div
                        style={
                          labelStyle
                        }
                      >
                        {label}
                      </div>

                      <input
                        value={value}
                        onChange={(event) =>
                          change(
                            event.target.value
                          )
                        }
                        style={
                          fieldStyle
                        }
                      />
                    </label>
                  )
                )}

                <label>
                  <div style={labelStyle}>
                    Std.-Satz (€)
                  </div>

                  <input
                    type="number"
                    step="0.01"
                    value={
                      activeEmployee?.hourlyRate || 0
                    }
                    onChange={(event) =>
                      patchDraft({
                        hourlyRate:
                          Number(
                            event.target.value
                          ) || 0
                      })
                    }
                    style={fieldStyle}
                  />
                </label>

                <label>
                  <div style={labelStyle}>
                    Anstellung
                  </div>

                  <select
                    value={
                      activeEmployee?.employmentType || "Vollzeit"
                    }
                    onChange={(event) =>
                      patchDraft({
                        employmentType:
                          event.target.value
                      })
                    }
                    style={fieldStyle}
                  >
                    <option>
                      Vollzeit
                    </option>
                    <option>
                      Teilzeit
                    </option>
                    <option>
                      Werkvertrag
                    </option>
                    <option>
                      Praktikum
                    </option>
                  </select>
                </label>

                <label>
                  <div style={labelStyle}>
                    Vertragsbeginn
                  </div>

                  <input
                    type="date"
                    value={dateInput(
                      activeEmployee?.contractStart
                    )}
                    onChange={(event) =>
                      patchDraft({
                        contractStart:
                          toIso(
                            event.target.value
                          )
                      })
                    }
                    style={fieldStyle}
                  />
                </label>

                <label>
                  <div style={labelStyle}>
                    Vertragsende
                  </div>

                  <input
                    type="date"
                    value={dateInput(
                      activeEmployee?.contractEnd
                    )}
                    onChange={(event) =>
                      patchDraft({
                        contractEnd:
                          toIso(
                            event.target.value
                          )
                      })
                    }
                    style={fieldStyle}
                  />
                </label>

                <label
                  style={{
                    gridColumn: "1 / -1"
                  }}
                >
                  <div style={labelStyle}>
                    Projekte
                  </div>

                  <input
                    value={(
                      activeEmployee?.projects || []
                    ).join(", ")}
                    onChange={(event) =>
                      patchDraft({
                        projects:
                          event.target.value
                            .split(",")
                            .map((value) =>
                              value.trim()
                            )
                            .filter(Boolean)
                      })
                    }
                    style={fieldStyle}
                  />
                </label>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(3,1fr)",
                  gap: 8
                }}
              >
                {[
                  [
                    "Urlaub gesamt",
                    activeEmployee?.vacationTotal || 0
                  ],
                  [
                    "Genommen",
                    activeEmployee?.vacationTaken || 0
                  ],
                  [
                    "Resturlaub",
                    vacationRemaining
                  ]
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    style={{
                      padding: 9,
                      border:
                        "1px solid #e5e7eb",
                      borderRadius: 7
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: "#64748b"
                      }}
                    >
                      {label}
                    </div>

                    <strong>
                      {value}
                    </strong>
                  </div>
                ))}
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: 8
                  }}
                >
                  <strong>
                    Zertifikate & Schulungen
                  </strong>

                  <div style={{ flex: 1 }} />

                  <button
                    className="btn"
                    onClick={
                      addCertificate
                    }
                  >
                    + Zertifikat
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 6
                  }}
                >
                  {(
                    selected.certificates ||
                    []
                  ).map((certificate) => {
                    const days =
                      daysLeft(
                        certificate.validUntil
                      );

                    const warning =
                      days !== null &&
                      days <= 30;

                    return (
                      <div
                        key={certificate.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "1fr 135px auto",
                          gap: 6,
                          alignItems:
                            "center",
                          padding: 7,
                          border:
                            "1px solid #e5e7eb",
                          borderRadius: 7,
                          background:
                            warning
                              ? "#fff7ed"
                              : "#fff"
                        }}
                      >
                        <div><strong>{certificate.name}</strong><div>{dateInput(certificate.validUntil)||"Ohne Ablaufdatum"}</div></div>
                        <button className="btn" onClick={()=>navigate("/buro/personalnachweise?certificateId="+encodeURIComponent(certificate.id))}>Bearbeiten</button>

                        <button
                          className="btn"
                          disabled={!retentionDeleteAllowed(certificate.retention)}
                          title={!retentionDeleteAllowed(certificate.retention) ? "Löschkonzept/Retention zuerst klassifizieren bzw. Frist abwarten." : "Nachweis löschen"}
                          onClick={() => void deleteCertificate(certificate.id)}
                        >
                          Entfernen
                        </button>

                        <div style={{gridColumn:"1 / -1",display:"grid",gridTemplateColumns:"180px 160px 1fr auto",gap:6,alignItems:"center",paddingTop:4,borderTop:"1px solid #eef2f7"}}>
                          <select
                            style={fieldStyle}
                            value={certificate.retention?.category || "UNCLASSIFIED"}
                            onChange={(e)=>void saveRetention("CERT",certificate.id,certificate.retention,{category:e.target.value})}
                          >
                            <option value="UNCLASSIFIED">Nicht klassifiziert</option>
                            <option value="PERSONNEL_GENERAL">Personalunterlage</option>
                            <option value="PAYROLL_TAX">Lohn/Steuer</option>
                            <option value="WORKTIME">Arbeitszeit</option>
                            <option value="SAFETY_QUALIFICATION">Arbeitsschutz/Qualifikation</option>
                            <option value="NO_RETENTION_REQUIRED">Keine weitere Aufbewahrung erforderlich</option>
                          </select>
                          <input type="date" style={fieldStyle} value={dateInput(certificate.retention?.retentionUntil)} onChange={(e)=>void saveRetention("CERT",certificate.id,certificate.retention,{retentionUntil:e.target.value||null})}/>
                          <input style={fieldStyle} defaultValue={certificate.retention?.legalBasis || ""} placeholder="Rechtsgrundlage / Löschbegründung" onBlur={(e)=>void saveRetention("CERT",certificate.id,certificate.retention,{legalBasis:e.target.value})}/>
                          <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11}}><input type="checkbox" checked={Boolean(certificate.retention?.legalHold)} onChange={(e)=>void saveRetention("CERT",certificate.id,certificate.retention,{legalHold:e.target.checked})}/>Legal Hold</label>
                        </div>
                      </div>
                    );
                  })}

                  {!selected.certificates
                    ?.length && (
                    <div
                      style={{
                        color: "#64748b",
                        fontSize: 12
                      }}
                    >
                      Keine Zertifikate
                      hinterlegt.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: 8
                  }}
                >
                  <strong>
                    Dokumente
                  </strong>

                  <div style={{ flex: 1 }} />

                  <input
                    ref={fileInput}
                    type="file"
                    hidden
                    onChange={(event) => {
                      const file =
                        event.target
                          .files?.[0];

                      if (file) {
                        void uploadDocument(
                          file
                        );
                      }

                      event.target.value =
                        "";
                    }}
                  />

                  <button
                    className="btn"
                    disabled={uploading}
                    onClick={() =>
                      fileInput.current?.click()
                    }
                  >
                    {uploading
                      ? "Upload…"
                      : "+ Dokument"}
                  </button>
                </div>

                <div
                  onDragOver={(event) =>
                    event.preventDefault()
                  }
                  onDrop={(event) => {
                    event.preventDefault();

                    const file =
                      event.dataTransfer
                        .files?.[0];

                    if (file) {
                      void uploadDocument(
                        file
                      );
                    }
                  }}
                  style={{
                    border:
                      "1px dashed #cbd5e1",
                    borderRadius: 8,
                    padding: 8,
                    display: "grid",
                    gap: 6
                  }}
                >
                  {(
                    selected.documents || []
                  ).map((document) => (
                    <div
                      key={document.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "1fr auto auto",
                        gap: 6,
                        alignItems:
                          "center",
                        borderBottom:
                          "1px solid #eef0f3",
                        padding:
                          "6px 3px"
                      }}
                    >
                      <div>
                        <strong
                          style={{
                            fontSize: 12
                          }}
                        >
                          {document.name}
                        </strong>

                        <div
                          style={{
                            fontSize: 10,
                            color: "#64748b"
                          }}
                        >
                          {fileSize(
                            document.size
                          )}
                        </div>
                      </div>

                      <button
                        className="btn"
                        onClick={() =>
                          void openDocument(
                            document.id
                          )
                        }
                      >
                        Öffnen
                      </button>

                      <button
                        className="btn"
                        disabled={!retentionDeleteAllowed(document.retention)}
                        title={!retentionDeleteAllowed(document.retention) ? "Löschkonzept/Retention zuerst klassifizieren bzw. Frist abwarten." : "Dokument löschen"}
                        onClick={() => void deleteDocument(document.id)}
                      >
                        Löschen
                      </button>

                      <div style={{gridColumn:"1 / -1",display:"grid",gridTemplateColumns:"180px 160px 1fr auto",gap:6,alignItems:"center",paddingTop:4}}>
                        <select style={fieldStyle} value={document.retention?.category || "UNCLASSIFIED"} onChange={(e)=>void saveRetention("DOC",document.id,document.retention,{category:e.target.value})}>
                          <option value="UNCLASSIFIED">Nicht klassifiziert</option>
                          <option value="PERSONNEL_GENERAL">Personalunterlage</option>
                          <option value="PAYROLL_TAX">Lohn/Steuer</option>
                          <option value="WORKTIME">Arbeitszeit</option>
                          <option value="SAFETY_QUALIFICATION">Arbeitsschutz/Qualifikation</option>
                          <option value="NO_RETENTION_REQUIRED">Keine weitere Aufbewahrung erforderlich</option>
                        </select>
                        <input type="date" style={fieldStyle} value={dateInput(document.retention?.retentionUntil)} onChange={(e)=>void saveRetention("DOC",document.id,document.retention,{retentionUntil:e.target.value||null})}/>
                        <input style={fieldStyle} defaultValue={document.retention?.legalBasis || ""} placeholder="Rechtsgrundlage / Löschbegründung" onBlur={(e)=>void saveRetention("DOC",document.id,document.retention,{legalBasis:e.target.value})}/>
                        <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11}}><input type="checkbox" checked={Boolean(document.retention?.legalHold)} onChange={(e)=>void saveRetention("DOC",document.id,document.retention,{legalHold:e.target.checked})}/>Legal Hold</label>
                      </div>
                    </div>
                  ))}

                  {!selected.documents
                    ?.length && (
                    <div
                      style={{
                        padding: 14,
                        textAlign:
                          "center",
                        color: "#64748b",
                        fontSize: 12
                      }}
                    >
                      Dateien hier ablegen
                      oder „+ Dokument“
                      verwenden.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
