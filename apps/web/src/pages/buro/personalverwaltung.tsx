import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import PersonalMitarbeiter from "./personalMitarbeiter";
import Einsatzplanung from "./ressourcenplanung";
const ArbeitszeitenVoll = React.lazy(() => import("../mobile/Arbeitszeiten"));

type Tab =
  | "overview"
  | "mitarbeiter"
  | "arbeitszeiten"
  | "einsatzplanung"
  | "nachweise"
  | "personalkosten";

type Certificate = {
  id: string;
  name: string;
  validUntil?: string | null;
};

type EmployeeDocument = {
  id: string;
  name: string;
  mime?: string | null;
  size?: number;
  createdAt?: string;
};

type Employee = {
  id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  hourlyRate?: number | null;
  costCenter?: string | null;
  projects?: string[];
  certificates?: Certificate[];
  documents?: EmployeeDocument[];
};

type LaborCostItem = {
  id: string;
  employeeId?: string | null;
  employeeName: string;
  hours: number;
  hourlyRate: number;
  costCenter?: string;
  personnelCost: number;
};

type LaborCosts = {
  totalHours: number;
  totalPersonnelCost: number;
  items: LaborCostItem[];
};

function authHeaders(): Record<string, string> {
  for (const key of [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc_auth_token"
  ]) {
    const value =
      localStorage.getItem(key) ||
      sessionStorage.getItem(key);

    if (value?.trim()) {
      return {
        Authorization: `Bearer ${value.trim()}`
      };
    }
  }

  return {};
}

async function request(
  path: string,
  init: RequestInit = {}
) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...authHeaders(),
    ...(init.headers as Record<string, string> || {})
  };

  if (
    init.body &&
    !(init.body instanceof FormData)
  ) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers
  });

  const payload = await response
    .json()
    .catch(() => null);

  if (
    !response.ok ||
    payload?.ok === false
  ) {
    throw new Error(
      payload?.error ||
      payload?.message ||
      `HTTP ${response.status}`
    );
  }

  return payload;
}

function daysLeft(value?: string | null) {
  if (!value) return null;

  return Math.round((Date.parse(String(value).slice(0,10)+"T00:00:00Z")-Date.parse(new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())+"T00:00:00Z"))/86400000);
}

function dateInput(value?: string | null) {
  return value
    ? String(value).slice(0, 10)
    : "";
}

function euro(value: number) {
  return Number(value || 0).toLocaleString(
    "de-DE",
    {
      style: "currency",
      currency: "EUR"
    }
  );
}

function hours(value: number) {
  return `${Number(value || 0).toLocaleString(
    "de-DE",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )} h`;
}

const inputStyle: React.CSSProperties = {
  border: "1px solid #d8dee8",
  borderRadius: 7,
  padding: "7px 9px",
  fontSize: 13,
  background: "#fff",
  width: "100%"
};

export default function Personalverwaltung() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] =
    useSearchParams();

  const area = String(
    searchParams.get("bereich") || ""
  );

  const resolveTab = (): Tab => {
    if (area === "mitarbeiter") {
      return "mitarbeiter";
    }

    if (area === "arbeitszeiten") {
      return "arbeitszeiten";
    }

    if (area === "einsatzplanung") {
      return "einsatzplanung";
    }

    if (area === "nachweise") {
      return "nachweise";
    }

    if (area === "personalkosten") {
      return "personalkosten";
    }

    return "overview";
  };

  const [tab, setTab] =
    React.useState<Tab>(resolveTab);

  const [employees, setEmployees] =
    React.useState<Employee[]>([]);

  const [loading, setLoading] =
    React.useState(false);

  const [error, setError] =
    React.useState("");

  const [costProject, setCostProject] =
    React.useState("");

  const [laborCosts, setLaborCosts] =
    React.useState<LaborCosts | null>(null);

  const [costLoading, setCostLoading] =
    React.useState(false);

  const [certificateFilter, setCertificateFilter] =
    React.useState<
      "ALL" | "DUE" | "EXPIRED"
    >("ALL");

  const [certificateEmployee, setCertificateEmployee] =
    React.useState<Employee | null>(null);

  const [certificateName, setCertificateName] =
    React.useState("");

  const [certificateValidUntil, setCertificateValidUntil] =
    React.useState("");

  const [certificateSaving, setCertificateSaving] =
    React.useState(false);

  const fileInput =
    React.useRef<HTMLInputElement | null>(null);

  const uploadEmployeeId =
    React.useRef<string>("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data =
        await request("/api/personal");

      setEmployees(
        Array.isArray(data?.items)
          ? data.items
          : []
      );
    } catch (e: any) {
      setError(
        e?.message ||
        "Personaldaten konnten nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setTab(resolveTab());
  }, [area]);

  const setArea = (next: Tab) => {
    setTab(next);

    const params =
      new URLSearchParams(searchParams);

    if (next === "overview") {
      params.delete("bereich");
    } else {
      params.set("bereich", next);
    }

    setSearchParams(params);
  };

  const projects = React.useMemo(
    () =>
      Array.from(
        new Set(
          employees.flatMap(
            (employee) =>
              employee.projects || []
          )
        )
      ).sort(),
    [employees]
  );

  React.useEffect(() => {
    if (!costProject && projects.length) {
      setCostProject(projects[0]);
    }
  }, [projects, costProject]);

  const certificates =
    employees.flatMap(
      (employee) =>
        (employee.certificates || []).map(
          (certificate) => ({
            ...certificate,
            employeeId: employee.id
          })
        )
    );

  const dueCertificates =
    certificates.filter((certificate) => {
      const days =
        daysLeft(certificate.validUntil);

      return (
        days !== null &&
        days <= 30
      );
    }).length;

  const employeesWithRate =
    employees.filter(
      (employee) =>
        Number(employee.hourlyRate || 0) > 0
    ).length;

  const saveEmployee = async (
    employee: Employee,
    patch: Partial<Employee>
  ) => {
    const payload = await request(
      `/api/personal/${encodeURIComponent(
        employee.id
      )}`,
      {
        method: "PUT",
        body: JSON.stringify(patch)
      }
    );

    setEmployees((current) =>
      current.map((row) =>
        row.id === employee.id
          ? {
              ...row,
              ...payload.item,
              certificates:
                row.certificates || [],
              documents:
                row.documents || []
            }
          : row
      )
    );
  };

  const addCertificate = (
    employee: Employee
  ) => {
    setCertificateEmployee(employee);
    setCertificateName("");
    setCertificateValidUntil("");
  };

  const closeCertificateDialog = () => {
    if (certificateSaving) return;

    setCertificateEmployee(null);
    setCertificateName("");
    setCertificateValidUntil("");
  };

  const createCertificate = async () => {
    if (!certificateEmployee) return;

    const name = certificateName.trim();

    if (!name) {
      setError("Bitte eine Bezeichnung für den Nachweis eingeben.");
      return;
    }

    setCertificateSaving(true);
    setError("");

    try {
      await request(
        `/api/personal/${encodeURIComponent(
          certificateEmployee.id
        )}/certificates`,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            validUntil:
              certificateValidUntil || null
          })
        }
      );

      closeCertificateDialog();
      setCertificateEmployee(null);
      setCertificateName("");
      setCertificateValidUntil("");

      await load();
    } catch (e: any) {
      setError(
        e?.message ||
        "Nachweis konnte nicht angelegt werden."
      );
    } finally {
      setCertificateSaving(false);
    }
  };

  const updateCertificate = async (
    employee: Employee,
    certificate: Certificate,
    patch: Partial<Certificate>
  ) => {
    await request(
      `/api/personal/${encodeURIComponent(
        employee.id
      )}/certificates/${encodeURIComponent(
        certificate.id
      )}`,
      {
        method: "PUT",
        body: JSON.stringify(patch)
      }
    );

    await load();
  };

  const deleteCertificate = async (
    employee: Employee,
    certificate: Certificate
  ) => {
    if (
      !window.confirm(
        `"${certificate.name}" wirklich löschen?`
      )
    ) {
      return;
    }

    await request(
      `/api/personal/${encodeURIComponent(
        employee.id
      )}/certificates/${encodeURIComponent(
        certificate.id
      )}`,
      {
        method: "DELETE"
      }
    );

    await load();
  };

  const uploadDocument = (
    employeeId: string
  ) => {
    uploadEmployeeId.current = employeeId;
    fileInput.current?.click();
  };

  const onDocumentSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0];

    const employeeId =
      uploadEmployeeId.current;

    event.target.value = "";

    if (!file || !employeeId) return;

    const form = new FormData();
    form.append("file", file);

    await request(
      `/api/personal/${encodeURIComponent(
        employeeId
      )}/documents`,
      {
        method: "POST",
        body: form
      }
    );

    await load();
  };

  const loadLaborCosts =
    React.useCallback(async () => {
      if (!costProject) {
        setLaborCosts(null);
        return;
      }

      setCostLoading(true);

      try {
        const data = await request(
          `/api/personal/labor-costs?projectId=${encodeURIComponent(
            costProject
          )}`
        );

        setLaborCosts({
          totalHours:
            Number(data?.totalHours || 0),
          totalPersonnelCost:
            Number(
              data?.totalPersonnelCost || 0
            ),
          items:
            Array.isArray(data?.items)
              ? data.items
              : []
        });
      } catch (e: any) {
        setError(
          e?.message ||
          "Personalkosten konnten nicht geladen werden."
        );
      } finally {
        setCostLoading(false);
      }
    }, [costProject]);

  React.useEffect(() => {
    if (
      tab === "personalkosten" &&
      costProject
    ) {
      void loadLaborCosts();
    }
  }, [
    tab,
    costProject,
    loadLaborCosts
  ]);

  const cards = [
    {
      key: "mitarbeiter" as Tab,
      title: "Mitarbeiter",
      value: employees.length,
      text:
        "Personalakten, Verträge und Stammdaten"
    },
    {
      key: "arbeitszeiten" as Tab,
      title: "Arbeitszeiten",
      value: "Ist",
      text:
        "Freigegebene Arbeitszeiten aus den Projekten"
    },
    {
      key: "einsatzplanung" as Tab,
      title: "Einsatzplanung",
      value: projects.length,
      text:
        "Mitarbeiter und Maschinen disponieren"
    },
    {
      key: "nachweise" as Tab,
      title: "Qualifikationen",
      value: certificates.length,
      text:
        `${dueCertificates} fällig oder abgelaufen`
    },
    {
      key: "personalkosten" as Tab,
      title: "Personalkosten",
      value: employeesWithRate,
      text:
        "Stundensätze und reale Projektkosten"
    }
  ];

  return (
    <div
      style={{
        display: "grid",
        gap: 14
      }}
    >
      <input
        ref={fileInput}
        type="file"
        style={{ display: "none" }}
        onChange={(event) =>
          void onDocumentSelected(event)
        }
      />

      <section className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Verwaltung · Personal
          </div>

          <h1
            style={{
              margin: "3px 0 4px"
            }}
          >
            Personalverwaltung
          </h1>

          <div style={{ opacity: 0.9 }}>
            Mitarbeiter, Arbeitszeiten,
            Einsatzplanung, Qualifikationen
            und Personalkosten zentral steuern.
          </div>
        </div>

        <div className="rlc-page-hero__actions">
          <button
            className="rlc-page-hero__button"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading
              ? "Wird geladen …"
              : "Aktualisieren"}
          </button>
        </div>
      </section>

      <section
        className="card"
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap"
        }}
      >
        {[
          ["overview", "Übersicht"],
          ["mitarbeiter", "Mitarbeiter"],
          ["arbeitszeiten", "Arbeitszeiten"],
          ["einsatzplanung", "Einsatzplanung"],
          [
            "nachweise",
            "Qualifikationen / Nachweise"
          ],
          [
            "personalkosten",
            "Personalkosten"
          ]
        ].map(([key, label]) => (
          <button
            key={key}
            className={
              tab === key
                ? "btn btn-primary"
                : "btn"
            }
            onClick={() =>
              setArea(key as Tab)
            }
          >
            {label}
          </button>
        ))}
      </section>

      {error && (
        <div
          className="card"
          style={{ color: "#b42318" }}
        >
          {error}
        </div>
      )}

      {tab === "overview" && (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(5,minmax(0,1fr))",
              gap: 10
            }}
          >
            {cards.map((card) => (
              <button
                key={card.key}
                className="card"
                onClick={() =>
                  setArea(card.key)
                }
                style={{
                  minHeight: 130,
                  textAlign: "left",
                  cursor: "pointer",
                  border:
                    "1px solid #dbe3ee",
                  background: "#fff"
                }}
              >
                <div className="muted">
                  {card.title}
                </div>

                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    marginTop: 5
                  }}
                >
                  {card.value}
                </div>

                <div
                  className="muted"
                  style={{ marginTop: 7 }}
                >
                  {card.text}
                </div>
              </button>
            ))}
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 1fr",
              gap: 12
            }}
          >
            <div className="card">
              <strong>
                Personalsteuerung
              </strong>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 1fr",
                  gap: 8,
                  marginTop: 12
                }}
              >
                {[
                  [
                    "mitarbeiter",
                    "Mitarbeiter"
                  ],
                  [
                    "arbeitszeiten",
                    "Arbeitszeiten"
                  ],
                  [
                    "einsatzplanung",
                    "Einsatzplanung"
                  ],
                  [
                    "personalkosten",
                    "Personalkosten"
                  ]
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className="btn"
                    onClick={() =>
                      setArea(key as Tab)
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="card">
              <strong>
                Nachweise & Fristen
              </strong>

              <div
                style={{
                  fontSize: 30,
                  fontWeight: 800,
                  marginTop: 10
                }}
              >
                {dueCertificates}
              </div>

              <div className="muted">
                Innerhalb 30 Tagen fällig
                oder bereits abgelaufen.
              </div>

              <button
                className="btn"
                style={{ marginTop: 12 }}
                onClick={() =>
                  setArea("nachweise")
                }
              >
                Nachweise öffnen
              </button>
            </div>
          </section>
        </>
      )}

      {tab === "mitarbeiter" && (
        <section className="rlc-personal-module">
          <div className="rlc-personal-module__embedded">
            <PersonalMitarbeiter />
          </div>
        </section>
      )}

      {tab === "arbeitszeiten" && (
        <section className="rlc-personal-module">
          <div className="rlc-personal-module__embedded rlc-personal-arbeitszeiten-full">
            <div className="rlc-personal-arbeitszeiten-full__body">
            <React.Suspense
              fallback={
                <div className="card">
                  Arbeitszeiten werden geladen …
                </div>
              }
            >
              <ArbeitszeitenVoll finalOnly embedded />
            </React.Suspense>
            </div>
          </div>
        </section>
      )}

      {tab === "einsatzplanung" && (
        <section className="rlc-personal-module">
          <div className="rlc-personal-module__embedded">
            <Einsatzplanung />
          </div>
        </section>
      )}

      {tab === "nachweise" && (
        <section
          className="card"
          style={{
            display: "grid",
            gap: 12
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "end",
              gap: 10,
              flexWrap: "wrap"
            }}
          >
            <div>
              <strong
                style={{ fontSize: 19 }}
              >
                Qualifikationen / Nachweise
              </strong>

              <div className="muted">
                Zertifikate verwalten,
                Fristen kontrollieren und
                Dokumente ablegen.
              </div>
            </div>

            <div style={{ flex: 1 }} />

            <button className="btn" onClick={()=>navigate("/buro/personalnachweise")}>Fristenübersicht / CSV</button>

            <select
              value={certificateFilter}
              onChange={(event) =>
                setCertificateFilter(
                  event.target.value as
                    | "ALL"
                    | "DUE"
                    | "EXPIRED"
                )
              }
              style={{
                ...inputStyle,
                width: 190
              }}
            >
              <option value="ALL">
                Alle Nachweise
              </option>
              <option value="DUE">
                Fällig ≤ 30 Tage
              </option>
              <option value="EXPIRED">
                Abgelaufen
              </option>
            </select>
          </div>

          {employees.map((employee) => {
            const visible =
              (
                employee.certificates || []
              ).filter((certificate) => {
                const days =
                  daysLeft(
                    certificate.validUntil
                  );

                if (
                  certificateFilter ===
                  "EXPIRED"
                ) {
                  return (
                    days !== null &&
                    days < 0
                  );
                }

                if (
                  certificateFilter ===
                  "DUE"
                ) {
                  return (
                    days !== null &&
                    days >= 0 &&
                    days <= 30
                  );
                }

                return true;
              });

            if (
              certificateFilter !== "ALL" &&
              visible.length === 0
            ) {
              return null;
            }

            return (
              <div
                key={employee.id}
                style={{
                  border:
                    "1px solid #e4eaf2",
                  borderRadius: 10,
                  padding: 12
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8
                  }}
                >
                  <div>
                    <b>{employee.name}</b>

                    <div className="muted">
                      {employee.role ||
                        "Mitarbeiter"}
                    </div>
                  </div>

                  <div style={{ flex: 1 }} />

                  <button
                    className="btn"
                    onClick={() =>
                      addCertificate(employee)
                    }
                  >
                    + Nachweis
                  </button>

                  <button
                    className="btn"
                    onClick={() =>
                      uploadDocument(
                        employee.id
                      )
                    }
                  >
                    + Dokument
                  </button>

                  <button
                    className="btn"
                    onClick={() =>
                      navigate(
                        `/buro/personalverwaltung?bereich=mitarbeiter&mitarbeiter=${encodeURIComponent(
                          employee.name
                        )}`
                      )
                    }
                  >
                    Personalakte
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 7,
                    marginTop: 12
                  }}
                >
                  {visible.map(
                    (certificate) => {
                      const days =
                        daysLeft(
                          certificate.validUntil
                        );

                      const expired =
                        days !== null &&
                        days < 0;

                      const due =
                        days !== null &&
                        days >= 0 &&
                        days <= 30;

                      return (
                        <div
                          key={
                            certificate.id
                          }
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "minmax(220px,1fr) 180px auto",
                            gap: 8,
                            alignItems:
                              "center",
                            padding:
                              "8px 10px",
                            borderRadius: 8,
                            background:
                              "#f8fafc"
                          }}
                        >
                          <strong>{certificate.name}</strong>
                          <div>{dateInput(certificate.validUntil)||"Ohne Ablaufdatum"}<button className="btn" onClick={()=>navigate("/buro/personalnachweise?certificateId="+encodeURIComponent(certificate.id))}>Bearbeiten / Verlauf</button></div>

                          <div
                            style={{
                              display: "flex",
                              alignItems:
                                "center",
                              gap: 8
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color:
                                  expired
                                    ? "#b42318"
                                    : due
                                      ? "#b54708"
                                      : "#15803d"
                              }}
                            >
                              {expired
                                ? "Abgelaufen"
                                : due
                                  ? `${days} Tage`
                                  : certificate.validUntil
                                    ? "Gültig"
                                    : "Ohne Frist"}
                            </span>

                            <button
                              className="btn"
                              onClick={() =>
                                void deleteCertificate(
                                  employee,
                                  certificate
                                ).catch((e:any)=>setError(e?.message||"Nachweis konnte nicht gelöscht werden."))
                              }
                            >
                              Löschen
                            </button>
                          </div>
                        </div>
                      );
                    }
                  )}

                  {visible.length === 0 && (
                    <div className="muted">
                      Keine Nachweise vorhanden.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {tab === "personalkosten" && (
        <section
          style={{
            display: "grid",
            gap: 12
          }}
        >
          <div
            className="card"
            style={{
              display: "flex",
              alignItems: "end",
              gap: 10,
              flexWrap: "wrap"
            }}
          >
            <div>
              <strong
                style={{ fontSize: 19 }}
              >
                Personalkosten
              </strong>

              <div className="muted">
                Stundensätze,
                Kostenstellen,
                Projektzuordnungen und
                tatsächliche Kosten.
              </div>
            </div>

            <div style={{ flex: 1 }} />

            <div
              style={{
                width: 230
              }}
            >
              <div
                className="muted"
                style={{
                  marginBottom: 4
                }}
              >
                Projekt für Ist-Kosten
              </div>

              <select
                value={costProject}
                onChange={(event) =>
                  setCostProject(
                    event.target.value
                  )
                }
                style={inputStyle}
              >
                <option value="">
                  Projekt wählen
                </option>

                {projects.map(
                  (project) => (
                    <option
                      key={project}
                      value={project}
                    >
                      {project}
                    </option>
                  )
                )}
              </select>
            </div>

            <button
              className="btn"
              disabled={
                !costProject ||
                costLoading
              }
              onClick={() =>
                void loadLaborCosts()
              }
            >
              {costLoading
                ? "Wird geladen …"
                : "Kosten aktualisieren"}
            </button>
          </div>

          {laborCosts && (
            <section
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(2,minmax(0,1fr))",
                gap: 10
              }}
            >
              <div className="card">
                <div className="muted">
                  Ist-Stunden · {costProject}
                </div>

                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    marginTop: 5
                  }}
                >
                  {hours(
                    laborCosts.totalHours
                  )}
                </div>
              </div>

              <div className="card">
                <div className="muted">
                  Personalkosten · {costProject}
                </div>

                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    marginTop: 5
                  }}
                >
                  {euro(
                    laborCosts
                      .totalPersonnelCost
                  )}
                </div>
              </div>
            </section>
          )}

          <div
            className="card"
            style={{
              overflowX: "auto"
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse"
              }}
            >
              <thead>
                <tr>
                  {[
                    "Mitarbeiter",
                    "Rolle",
                    "Std.-Satz",
                    "Kostenstelle",
                    "Projekte",
                    "Ist-Stunden",
                    "Ist-Kosten",
                    "Aktion"
                  ].map((title) => (
                    <th
                      key={title}
                      style={{
                        padding:
                          "9px 10px",
                        textAlign: "left",
                        fontSize: 12,
                        background:
                          "#f4f7fb",
                        borderBottom:
                          "1px solid #dde5ef"
                      }}
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {employees.map(
                  (employee) => {
                    const actual =
                      laborCosts?.items.filter(
                        (item) =>
                          item.employeeId ===
                            employee.id ||
                          item.employeeName
                            .trim()
                            .toLocaleLowerCase(
                              "de-DE"
                            ) ===
                            employee.name
                              .trim()
                              .toLocaleLowerCase(
                                "de-DE"
                              )
                      ) || [];

                    const actualHours =
                      actual.reduce(
                        (sum, item) =>
                          sum +
                          Number(
                            item.hours || 0
                          ),
                        0
                      );

                    const actualCost =
                      actual.reduce(
                        (sum, item) =>
                          sum +
                          Number(
                            item.personnelCost ||
                              0
                          ),
                        0
                      );

                    return (
                      <EmployeeCostRow
                        key={employee.id}
                        employee={employee}
                        actualHours={
                          actualHours
                        }
                        actualCost={
                          actualCost
                        }
                        onSave={
                          saveEmployee
                        }
                      />
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {certificateEmployee && (
        <div
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCertificateDialog();
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(15,23,42,.42)",
            display: "grid",
            placeItems: "center",
            padding: 20
          }}
        >
          <section
            className="card"
            style={{
              width: "min(540px,100%)",
              padding: 20,
              boxShadow: "0 24px 70px rgba(15,23,42,.24)"
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12
              }}
            >
              <div>
                <div
                  style={{
                    color: "#0b5bd3",
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: ".06em"
                  }}
                >
                  Personal · Nachweis
                </div>

                <h2
                  style={{
                    margin: "4px 0 4px"
                  }}
                >
                  Neuen Nachweis anlegen
                </h2>

                <div className="muted">
                  Mitarbeiter: {certificateEmployee.name}
                </div>
              </div>

              <div style={{ flex: 1 }} />

              <button
                className="btn"
                onClick={closeCertificateDialog}
                disabled={certificateSaving}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gap: 14,
                marginTop: 20
              }}
            >
              <label>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 5
                  }}
                >
                  Bezeichnung
                </div>

                <input
                  autoFocus
                  value={certificateName}
                  onChange={(event) =>
                    setCertificateName(event.target.value)
                  }
                  placeholder="z. B. Ersthelfer, Führerschein, SCC"
                  style={inputStyle}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void createCertificate();
                    }
                  }}
                />
              </label>

              <label>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 5
                  }}
                >
                  Gültig bis
                </div>

                <input
                  type="date"
                  value={certificateValidUntil}
                  onChange={(event) =>
                    setCertificateValidUntil(
                      event.target.value
                    )
                  }
                  style={inputStyle}
                />

                <div
                  className="muted"
                  style={{
                    fontSize: 11,
                    marginTop: 5
                  }}
                >
                  Optional – ohne Datum bleibt der Nachweis ohne Frist.
                </div>
              </label>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 22
              }}
            >
              <button
                className="btn"
                onClick={closeCertificateDialog}
                disabled={certificateSaving}
              >
                Abbrechen
              </button>

              <button
                className="btn btn-primary"
                onClick={() => void createCertificate()}
                disabled={
                  certificateSaving ||
                  !certificateName.trim()
                }
              >
                {certificateSaving
                  ? "Speichert …"
                  : "Nachweis speichern"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function EmployeeCostRow({
  employee,
  actualHours,
  actualCost,
  onSave
}: {
  employee: Employee;
  actualHours: number;
  actualCost: number;
  onSave: (
    employee: Employee,
    patch: Partial<Employee>
  ) => Promise<void>;
}) {
  const [rate, setRate] =
    React.useState(
      String(
        Number(employee.hourlyRate || 0)
      )
    );

  const [costCenter, setCostCenter] =
    React.useState(
      employee.costCenter || ""
    );

  const [projects, setProjects] =
    React.useState(
      (employee.projects || []).join(", ")
    );

  const [saving, setSaving] =
    React.useState(false);

  React.useEffect(() => {
    setRate(
      String(
        Number(employee.hourlyRate || 0)
      )
    );

    setCostCenter(
      employee.costCenter || ""
    );

    setProjects(
      (employee.projects || []).join(", ")
    );
  }, [employee]);

  const save = async () => {
    setSaving(true);

    try {
      await onSave(employee, {
        hourlyRate:
          Number(
            String(rate).replace(",", ".")
          ) || 0,
        costCenter:
          costCenter.trim() || null,
        projects: projects
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      });
    } finally {
      setSaving(false);
    }
  };

  const td: React.CSSProperties = {
    padding: "8px 10px",
    borderBottom:
      "1px solid #e5eaf1",
    fontSize: 13,
    verticalAlign: "middle"
  };

  return (
    <tr>
      <td style={td}>
        <strong>{employee.name}</strong>
      </td>

      <td style={td}>
        {employee.role || "—"}
      </td>

      <td style={td}>
        <input
          value={rate}
          onChange={(event) =>
            setRate(
              event.target.value
            )
          }
          style={{
            ...inputStyle,
            width: 105
          }}
        />
      </td>

      <td style={td}>
        <input
          value={costCenter}
          onChange={(event) =>
            setCostCenter(
              event.target.value
            )
          }
          placeholder="Kostenstelle"
          style={{
            ...inputStyle,
            width: 150
          }}
        />
      </td>

      <td style={td}>
        <input
          value={projects}
          onChange={(event) =>
            setProjects(
              event.target.value
            )
          }
          placeholder="BA-2026-028, ..."
          style={{
            ...inputStyle,
            minWidth: 210
          }}
        />
      </td>

      <td style={td}>
        {hours(actualHours)}
      </td>

      <td style={td}>
        <strong>
          {euro(actualCost)}
        </strong>
      </td>

      <td style={td}>
        <button
          className="btn btn-primary"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving
            ? "Speichert …"
            : "Speichern"}
        </button>
      </td>
    </tr>
  );
}