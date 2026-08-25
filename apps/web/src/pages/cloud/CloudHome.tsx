import React from "react";
import { apiUrl } from "../../lib/apiBase";

type Role =
  | "ADMIN"
  | "BAULEITER"
  | "CAPOCANTIERE"
  | "MITARBEITER"
  | "KALKULATOR"
  | "BUCHHALTUNG"
  | "GAST";

type Person = {
  id: string;
  userId: string;
  role: Role;
  active: boolean;
  user: { id: string; name?: string | null; email: string };
};

type Project = {
  id: string;
  code: string;
  name: string;
  client?: string | null;
  place?: string | null;
  status: string;
  createdAt: string;
};

type CloudData = {
  company: { id: string; name: string; code?: string | null };
  subscription: {
    status: string;
    mobileSeatsPurchased?: number | null;
    webSeatsPurchased?: number | null;
  };
  currentUserId: string;
  isCompanyAdmin: boolean;
  members: Person[];
  projects: Project[];
  submissions: Array<{
    id: string;
    source: string;
    kind: string;
    title?: string | null;
    createdAt: string;
    project: { id: string; code: string; name: string };
    user?: { id: string; name?: string | null; email: string } | null;
  }>;
};

type ProjectDetail = {
  project: Project;
  canDownload: boolean;
  documents: Array<{
    id: string;
    name: string;
    kind: string;
    updatedAt: string;
    versionId: string;
    size: string;
    mime: string;
  }>;
};

type ProjectPerson = Person & {
  assigned: boolean;
  projectRole: Role;
  canDownload: boolean;
};

const roles: Role[] = [
  "ADMIN",
  "BAULEITER",
  "CAPOCANTIERE",
  "MITARBEITER",
  "KALKULATOR",
  "BUCHHALTUNG",
  "GAST",
];

function authToken() {
  const direct = localStorage.getItem("rlc_token");
  if (direct?.trim()) return direct.trim();

  try {
    const auth = JSON.parse(localStorage.getItem("rlc_auth") || "{}");
    return String(auth?.token || auth?.accessToken || "").trim();
  } catch {
    return "";
  }
}

async function request<T>(path: string, init: RequestInit = {}) {
  const token = authToken();
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((init.headers as Record<string, string> | undefined) || {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(String(data?.error || `Cloud-Fehler (${response.status})`));
  }

  return data as T;
}

function displayName(person?: { name?: string | null; email: string } | null) {
  return String(person?.name || person?.email || "Unbekannt");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSize(value: string) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #dbe5f3",
  borderRadius: 16,
  overflow: "hidden",
};

const button: React.CSSProperties = {
  border: "1px solid #bed0ed",
  borderRadius: 9,
  background: "#fff",
  color: "#0b2545",
  fontWeight: 800,
  padding: "10px 14px",
  cursor: "pointer",
};

export default function CloudHome() {
  const [data, setData] = React.useState<CloudData | null>(null);
  const [detail, setDetail] = React.useState<ProjectDetail | null>(null);
  const [projectPeople, setProjectPeople] = React.useState<ProjectPerson[]>([]);
  const [view, setView] = React.useState<"projects" | "members" | "entries">("projects");
  const [menu, setMenu] = React.useState<"projects" | "members" | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const [entryUserId, setEntryUserId] = React.useState("");
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<Role>("MITARBEITER");
  const [inviteCode, setInviteCode] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await request<CloudData>("/api/cloud/me");
      setData(next);
    } catch (e: any) {
      setError(String(e?.message || "Cloud konnte nicht geladen werden"));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function openProject(projectId: string) {
    try {
      setError("");
      setMessage("");
      const next = await request<ProjectDetail>(`/api/cloud/projects/${projectId}`);
      setDetail(next);
      setView("projects");
      setMenu(null);

      if (data?.isCompanyAdmin) {
        const rights = await request<{ members: ProjectPerson[] }>(
          `/api/cloud/projects/${projectId}/members`
        );
        setProjectPeople(rights.members);
      } else {
        setProjectPeople([]);
      }
    } catch (e: any) {
      setError(String(e?.message || "Projekt konnte nicht geöffnet werden"));
    }
  }

  async function saveProjectAccess(person: ProjectPerson, patch: Partial<ProjectPerson>) {
    if (!detail) return;

    const next = { ...person, ...patch };
    try {
      await request(
        `/api/cloud/projects/${detail.project.id}/members/${person.userId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            assigned: next.assigned,
            role: next.projectRole,
            canDownload: next.assigned && next.canDownload,
          }),
        }
      );

      setProjectPeople((old) =>
        old.map((row) => (row.userId === person.userId ? next : row))
      );
      setMessage("Projekt-Rechte gespeichert.");
    } catch (e: any) {
      setError(String(e?.message || "Projekt-Rechte konnten nicht gespeichert werden"));
    }
  }

  async function saveMember(person: Person, patch: Partial<Person>) {
    const next = { ...person, ...patch };
    try {
      await request(`/api/cloud/members/${person.userId}`, {
        method: "PUT",
        body: JSON.stringify({ role: next.role, active: next.active }),
      });
      setData((old) =>
        old
          ? {
              ...old,
              members: old.members.map((row) =>
                row.userId === person.userId ? next : row
              ),
            }
          : old
      );
      setMessage("Mitarbeiter gespeichert.");
    } catch (e: any) {
      setError(String(e?.message || "Mitarbeiter konnte nicht gespeichert werden"));
    }
  }

  async function createInvite(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await request<{ invite: { code: string } }>("/api/company/invites", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail.trim() || undefined,
          role: inviteRole,
          ttlHours: 168,
          maxUses: 1,
        }),
      });
      setInviteCode(result.invite.code);
      setInviteEmail("");
      setMessage("Einladung erstellt. Den Code dem Mitarbeiter geben.");
    } catch (e: any) {
      setError(String(e?.message || "Einladung konnte nicht erstellt werden"));
    }
  }

  async function downloadDocument(documentId: string) {
    if (!detail) return;
    try {
      const result = await request<{ downloadUrl: string }>(
        `/api/cloud/projects/${detail.project.id}/documents/${documentId}/download`
      );
      window.location.assign(result.downloadUrl);
    } catch (e: any) {
      setError(String(e?.message || "Download nicht möglich"));
    }
  }

  function logout() {
    for (const key of [
      "rlc_token",
      "rlc_auth",
      "token",
      "authToken",
      "accessToken",
      "rlc_company_id",
      "rlc_company",
      "rlc_projectId",
      "rlc_active_project",
      "rlc_active_project_id",
    ]) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }

    window.location.replace("/login?release=cloud-v2");
  }

  const entries = !entryUserId
    ? data?.submissions || []
    : (data?.submissions || []).filter((entry) => entry.user?.id === entryUserId);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f5f8fd",
        color: "#0b2545",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <header
        style={{
          background: "linear-gradient(110deg, #0b285d, #2563eb)",
          color: "#fff",
          padding: "20px clamp(18px, 5vw, 70px)",
        }}
      >
        <div
          style={{
            maxWidth: 1500,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".05em" }}>
              RLC CLOUD · {data?.company.code || "FIRMA"}
            </div>
            <div style={{ fontSize: 27, fontWeight: 900, marginTop: 4 }}>
              {data?.company.name || "RLC Cloud"}
            </div>
          </div>

          <nav style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setMenu(menu === "projects" ? null : "projects")}
                style={button}
              >
                Projekte ▾
              </button>
              {menu === "projects" ? (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 46,
                    zIndex: 10,
                    minWidth: 270,
                    maxHeight: 360,
                    overflowY: "auto",
                    background: "#fff",
                    borderRadius: 12,
                    boxShadow: "0 14px 30px rgba(15, 40, 90, .22)",
                    padding: 8,
                  }}
                >
                  {(data?.projects || []).map((project) => (
                    <button
                      type="button"
                      key={project.id}
                      onClick={() => void openProject(project.id)}
                      style={{
                        width: "100%",
                        border: 0,
                        background: "transparent",
                        color: "#0b2545",
                        cursor: "pointer",
                        textAlign: "left",
                        padding: 10,
                        borderRadius: 8,
                      }}
                    >
                      <strong>{project.name}</strong>
                      <br />
                      <small>{project.code}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setMenu(menu === "members" ? null : "members")}
                style={button}
              >
                Mitarbeiter ▾
              </button>
              {menu === "members" ? (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 46,
                    zIndex: 10,
                    minWidth: 230,
                    background: "#fff",
                    borderRadius: 12,
                    boxShadow: "0 14px 30px rgba(15, 40, 90, .22)",
                    padding: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setView("members");
                      setMenu(null);
                    }}
                    style={{ ...button, width: "100%", textAlign: "left", border: 0 }}
                  >
                    Mitarbeiter verwalten
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setView("members");
                      setMenu(null);
                    }}
                    style={{ ...button, width: "100%", textAlign: "left", border: 0 }}
                  >
                    Mitarbeiter einladen
                  </button>
                </div>
              ) : null}
            </div>

            <button type="button" onClick={() => setView("entries")} style={button}>
              Eingänge
            </button>
            <button
              type="button"
              onClick={logout}
              style={{ ...button, color: "#c81e1e", borderColor: "#f4b8b8" }}
            >
              Abmelden
            </button>
          </nav>
        </div>
      </header>

      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "26px clamp(18px, 4vw, 56px)" }}>
        {loading ? <p>Cloud lädt…</p> : null}

        {error ? (
          <div style={{ ...card, padding: 18, color: "#9f1239", background: "#fff1f2", marginBottom: 18 }}>
            <strong>Hinweis:</strong> {error}
          </div>
        ) : null}

        {message ? (
          <div style={{ ...card, padding: 14, color: "#166534", background: "#f0fdf4", marginBottom: 18 }}>
            {message}
          </div>
        ) : null}

        {data && !loading ? (
          <>
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 14,
                marginBottom: 22,
              }}
            >
              {[
                ["Projekte", data.projects.length],
                ["Aktive Mitarbeiter", data.members.filter((person) => person.active).length],
                ["Mobile-Lizenzen", data.subscription.mobileSeatsPurchased ?? 0],
                ["Web-Lizenzen", data.subscription.webSeatsPurchased ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} style={{ ...card, padding: 18 }}>
                  <div style={{ color: "#64748b" }}>{label}</div>
                  <strong style={{ display: "block", fontSize: 28, marginTop: 6 }}>{value}</strong>
                </div>
              ))}
            </section>

            {view === "projects" ? (
              <section style={card}>
                <div style={{ padding: 18, borderBottom: "1px solid #e2e8f0" }}>
                  <strong>{detail ? `Projekt · ${detail.project.name}` : "Projekte"}</strong>
                </div>

                {!detail ? (
                  <div style={{ padding: 18 }}>
                    <p style={{ marginTop: 0, color: "#64748b" }}>
                      Wähle oben unter <strong>Projekte ▾</strong> ein Projekt aus.
                    </p>
                    {data.projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => void openProject(project.id)}
                        style={{
                          ...button,
                          margin: "0 10px 10px 0",
                          textAlign: "left",
                        }}
                      >
                        {project.name} · {project.code}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: 18 }}>
                    <div style={{ marginBottom: 20, color: "#475569" }}>
                      {detail.project.code} · {detail.project.client || "Kein Auftraggeber"} ·{" "}
                      {detail.project.place || "Kein Ort"}
                    </div>

                    <h3>Dateien</h3>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ textAlign: "left", background: "#f8fafc" }}>
                            {["Datei", "Typ", "Aktualisiert", "Größe", "Download"].map((label) => (
                              <th key={label} style={{ padding: 12 }}>{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.documents.map((document) => (
                            <tr key={document.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                              <td style={{ padding: 12, fontWeight: 700 }}>{document.name}</td>
                              <td style={{ padding: 12 }}>{document.kind}</td>
                              <td style={{ padding: 12 }}>{formatDate(document.updatedAt)}</td>
                              <td style={{ padding: 12 }}>{formatSize(document.size)}</td>
                              <td style={{ padding: 12 }}>
                                <button
                                  type="button"
                                  onClick={() => void downloadDocument(document.id)}
                                  disabled={!detail.canDownload}
                                  style={{
                                    ...button,
                                    opacity: detail.canDownload ? 1 : 0.45,
                                    cursor: detail.canDownload ? "pointer" : "not-allowed",
                                  }}
                                >
                                  {detail.canDownload ? "Herunterladen" : "Nicht freigegeben"}
                                </button>
                              </td>
                            </tr>
                          ))}
                          {!detail.documents.length ? (
                            <tr>
                              <td colSpan={5} style={{ padding: 16, color: "#64748b" }}>
                                Für dieses Projekt sind noch keine Dateien in der Cloud gespeichert.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>

                    {data.isCompanyAdmin ? (
                      <>
                        <h3 style={{ marginTop: 30 }}>Mitarbeiterrechte für dieses Projekt</h3>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ textAlign: "left", background: "#f8fafc" }}>
                                {["Mitarbeiter", "Projektzugriff", "Rolle", "Download"].map((label) => (
                                  <th key={label} style={{ padding: 12 }}>{label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {projectPeople.map((person) => (
                                <tr key={person.userId} style={{ borderTop: "1px solid #e2e8f0" }}>
                                  <td style={{ padding: 12 }}>
                                    <strong>{displayName(person.user)}</strong>
                                    <br />
                                    <small>{person.user.email}</small>
                                  </td>
                                  <td style={{ padding: 12 }}>
                                    <input
                                      type="checkbox"
                                      checked={person.assigned}
                                      disabled={!person.active}
                                      onChange={(event) =>
                                        void saveProjectAccess(person, {
                                          assigned: event.target.checked,
                                        })
                                      }
                                    />{" "}
                                    Zugang
                                  </td>
                                  <td style={{ padding: 12 }}>
                                    <select
                                      value={person.projectRole}
                                      disabled={!person.assigned}
                                      onChange={(event) =>
                                        void saveProjectAccess(person, {
                                          projectRole: event.target.value as Role,
                                        })
                                      }
                                    >
                                      {roles.map((role) => <option key={role}>{role}</option>)}
                                    </select>
                                  </td>
                                  <td style={{ padding: 12 }}>
                                    <input
                                      type="checkbox"
                                      checked={person.canDownload}
                                      disabled={!person.assigned}
                                      onChange={(event) =>
                                        void saveProjectAccess(person, {
                                          canDownload: event.target.checked,
                                        })
                                      }
                                    />{" "}
                                    Download erlauben
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </section>
            ) : null}

            {view === "members" ? (
              <section style={card}>
                <div style={{ padding: 18, borderBottom: "1px solid #e2e8f0" }}>
                  <strong>Mitarbeiter der Firma</strong>
                </div>

                {data.isCompanyAdmin ? (
                  <form
                    onSubmit={createInvite}
                    style={{
                      padding: 18,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="E-Mail des Mitarbeiters"
                      style={{ minWidth: 250, padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
                    />
                    <select
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value as Role)}
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" }}
                    >
                      {roles.map((role) => <option key={role}>{role}</option>)}
                    </select>
                    <button type="submit" style={button}>Einladung erstellen</button>
                    {inviteCode ? (
                      <strong style={{ alignSelf: "center", color: "#166534" }}>
                        Code: {inviteCode}
                      </strong>
                    ) : null}
                  </form>
                ) : null}

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", background: "#f8fafc" }}>
                        {["Mitarbeiter", "Rolle", "Aktiv", "Projektzugriff"].map((label) => (
                          <th key={label} style={{ padding: 12 }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.members.map((person) => (
                        <tr key={person.userId} style={{ borderTop: "1px solid #e2e8f0" }}>
                          <td style={{ padding: 12 }}>
                            <strong>{displayName(person.user)}</strong>
                            <br />
                            <small>{person.user.email}</small>
                          </td>
                          <td style={{ padding: 12 }}>
                            {data.isCompanyAdmin ? (
                              <select
                                value={person.role}
                                disabled={person.userId === data.currentUserId}
                                onChange={(event) =>
                                  void saveMember(person, { role: event.target.value as Role })
                                }
                              >
                                {roles.map((role) => <option key={role}>{role}</option>)}
                              </select>
                            ) : person.role}
                          </td>
                          <td style={{ padding: 12 }}>
                            {data.isCompanyAdmin ? (
                              <input
                                type="checkbox"
                                checked={person.active}
                                disabled={person.userId === data.currentUserId}
                                onChange={(event) =>
                                  void saveMember(person, { active: event.target.checked })
                                }
                              />
                            ) : person.active ? "Aktiv" : "Inaktiv"}
                          </td>
                          <td style={{ padding: 12 }}>
                            {data.isCompanyAdmin
                              ? "Im Projekt unter Projekte ▾ vergeben"
                              : "Nur eigene Projekte sichtbar"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {view === "entries" ? (
              <section style={card}>
                <div
                  style={{
                    padding: 18,
                    borderBottom: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <strong>Eingänge aus Mobile und Web</strong>
                  <select
                    value={entryUserId}
                    onChange={(event) => setEntryUserId(event.target.value)}
                    style={{ padding: 9, border: "1px solid #cbd5e1", borderRadius: 8 }}
                  >
                    <option value="">Alle Mitarbeiter</option>
                    {data.members.map((person) => (
                      <option key={person.userId} value={person.userId}>
                        {displayName(person.user)}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", background: "#f8fafc" }}>
                        {["Zeit", "Mitarbeiter", "Projekt", "Bereich", "Titel"].map((label) => (
                          <th key={label} style={{ padding: 12 }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={entry.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                          <td style={{ padding: 12, whiteSpace: "nowrap" }}>{formatDate(entry.createdAt)}</td>
                          <td style={{ padding: 12 }}>{displayName(entry.user)}</td>
                          <td style={{ padding: 12 }}>{entry.project.name}</td>
                          <td style={{ padding: 12 }}>{entry.source} · {entry.kind}</td>
                          <td style={{ padding: 12 }}>{entry.title || "—"}</td>
                        </tr>
                      ))}
                      {!entries.length ? (
                        <tr>
                          <td colSpan={5} style={{ padding: 16, color: "#64748b" }}>
                            Keine Eingänge vorhanden.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}