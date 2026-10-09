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

type DashboardCard = {
  key: string;
  title: string;
  inbox: any[];
  approved: any[];
  final: any[];
  files?: ProjectDetail["documents"];
};
type ProjectDashboard = { project: Project; cards: DashboardCard[] };

const roles: Role[] = [
  "ADMIN",
  "BAULEITER",
  "CAPOCANTIERE",
  "MITARBEITER",
  "KALKULATOR",
  "BUCHHALTUNG",
  "GAST",
];

const roleLabels: Record<Role, string> = {
  ADMIN: "Administrator",
  BAULEITER: "Bauleiter",
  CAPOCANTIERE: "Polier",
  MITARBEITER: "Mitarbeiter",
  KALKULATOR: "Kalkulator",
  BUCHHALTUNG: "Buchhaltung",
  GAST: "Gast",
};

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
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function fileExtension(name: string) {
  const clean = String(name || "").split("?")[0];
  const index = clean.lastIndexOf(".");

  if (index < 0 || index === clean.length - 1) {
    return "DATEI";
  }

  return clean.slice(index + 1).toUpperCase();
}

function cloudAreaForFileName(value: unknown): string | null {
  const name = String(value || "").toLowerCase();
  if (!name) return null;

  if (/\.(png|jpe?g|webp|gif|heic)$/i.test(name) || /(^|[_-])(img|camera)[_-]/i.test(name)) {
    return "fotos";
  }
  if (/regiebericht|regie/.test(name)) return "regieberichte";
  if (/lieferschein/.test(name)) return "lieferscheine";
  if (/tagesbericht/.test(name)) return "tagesberichte";
  if (/bautagebuch/.test(name)) return "bautagebuch";
  if (/arbeitszeit|stundennachweis|(^|[_-])az[_-]/.test(name)) return "arbeitszeiten";
  if (/aufma[ßs]|mengenermittlung|leistungsverzeichnis|(^|[_-])lv[_-]|reb|\.x31$|\.d11$/.test(name)) {
    return "mengenermittlung";
  }
  if (/abschlag/.test(name)) return "abschlagsrechnungen";
  if (/schlussrechnung|rechnung|^re[-_]/.test(name)) return "rechnungen";
  if (/angebot|offerte/.test(name)) return "angebote";
  if (/nachtrag|versionsvergleich|kalkulation|urkalkulation|gaeb|\.x83$|\.x84$|\.d83$|\.p83$/.test(name)) {
    return "kalkulation";
  }
  if (/verwaltung|projektverwaltung/.test(name)) return "projektverwaltung";
  return null;
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
  const [dashboard, setDashboard] = React.useState<ProjectDashboard | null>(null);
  const [openArea, setOpenArea] = React.useState<string | null>(null);
  const [projectPeople, setProjectPeople] = React.useState<ProjectPerson[]>([]);
  const [view, setView] = React.useState<"projects" | "members" | "entries">("projects");
  const [menu, setMenu] = React.useState<"projects" | "members" | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const [entryUserId, setEntryUserId] = React.useState("");
  const [entryDateFrom, setEntryDateFrom] = React.useState("");
  const [entryDateTo, setEntryDateTo] = React.useState("");
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<Role>("MITARBEITER");
  const [inviteCode, setInviteCode] = React.useState("");
  const [projectSearch, setProjectSearch] = React.useState("");
  const [homeDateFrom, setHomeDateFrom] = React.useState("");
  const [homeDateTo, setHomeDateTo] = React.useState("");

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
      setDashboard(await request<ProjectDashboard>(`/api/cloud/projects/${projectId}/dashboard`));
      setOpenArea(null);
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
      const token = authToken();

      const response = await fetch(
        apiUrl(
          `/api/cloud/projects/${detail.project.id}/documents/${encodeURIComponent(
            documentId
          )}/download`
        ),
        {
          headers: {
            ...(token
              ? { Authorization: `Bearer ${token}` }
              : {}),
          },
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          String(
            payload?.error ||
            `Download nicht möglich (${response.status})`
          )
        );
      }

      const contentType =
        response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const result = await response.json();

        if (result?.downloadUrl) {
          window.location.assign(result.downloadUrl);
          return;
        }

        throw new Error("Download-URL fehlt");
      }

      const blob = await response.blob();
      const disposition =
        response.headers.get("content-disposition") || "";

      const match = disposition.match(
        /filename\*?=(?:UTF-8''|")?([^";]+)/i
      );

      const filename = match?.[1]
        ? decodeURIComponent(match[1].replace(/"/g, ""))
        : "download";

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setError(
        String(e?.message || "Download nicht möglich")
      );
    }
  }
  async function openEntry(entry: CloudData["submissions"][number]) {
    const kind = String(entry.kind || "").toUpperCase();
    const cloudAreaByKind: Record<string, string> = {
      BAUTAGEBUCH: "bautagebuch",
      ARBEITSZEIT: "arbeitszeiten",
      TAGESBERICHT: "tagesberichte",
      REGIE: "regieberichte",
      LIEFERSCHEIN: "lieferscheine",
      FOTOS: "fotos",
      FOTO: "fotos",
    };

    const area = cloudAreaByKind[kind];
    const projectId = String(entry.project?.id || "").trim();

    if (!area || !projectId) {
      setMessage("Für diesen Eingang ist kein Cloud-Projektbereich verfügbar.");
      return;
    }

    await openProject(projectId);
    setOpenArea(area);
    setMessage("Projektbereich in der Cloud geöffnet.");
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

  const homeProjects = React.useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    return [...(data?.projects || [])]
      .filter((project) => {
        if (!query) return true;
        return [project.code, project.name, project.client, project.place]
          .some((value) => String(value || "").toLowerCase().includes(query));
      })
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }, [data?.projects, projectSearch]);

  const homeEntries = React.useMemo(() => {
    return (data?.submissions || [])
      .filter((entry) => {
        const day = String(entry.createdAt || "").slice(0, 10);
        return (!homeDateFrom || day >= homeDateFrom) &&
          (!homeDateTo || day <= homeDateTo);
      })
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }, [data?.submissions, homeDateFrom, homeDateTo]);

  const categorizedDocumentIds = React.useMemo(() => {
    const ids = new Set<string>();

    for (const area of dashboard?.cards || []) {
      for (const file of area.files || []) {
        if (file?.id) ids.add(String(file.id));
      }
    }

    for (const document of detail?.documents || []) {
      if (document?.id && cloudAreaForFileName(document.name)) {
        ids.add(String(document.id));
      }
    }

    return ids;
  }, [dashboard, detail]);

  const additionalDocuments = React.useMemo(() => {
    if (!detail) return [];

    const seen = new Set<string>();

    return detail.documents.filter((document) => {
      const id = String(document.id || "");

      if (!id || categorizedDocumentIds.has(id)) {
        return false;
      }

      const signature = [
        String(document.name || "").trim().toLowerCase(),
        String(document.size || ""),
      ].join("|");

      if (seen.has(signature)) {
        return false;
      }

      seen.add(signature);
      return true;
    });
  }, [detail, categorizedDocumentIds]);

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

          <div aria-label="Cloud-Navigation" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
                      Mitarbeiterverwaltung
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
          </div>
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
                  <div style={{ padding: "22px 24px 26px", display: "grid", gap: 20 }}>
                    <section style={{ background: "linear-gradient(115deg, #0b3d91, #1671ed)", color: "#fff", borderRadius: 16, padding: "24px 26px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".08em", opacity: .85 }}>CLOUD-ZENTRALE</div>
                        <h1 style={{ margin: "6px 0 7px", fontSize: 27 }}>Projekte & aktuelle Vorgänge</h1>
                        <div style={{ opacity: .9 }}>Projekt auswählen, Eingänge prüfen und Dateien zentral verwalten.</div>
                      </div>
                      <div style={{ padding: "11px 14px", borderRadius: 10, background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.25)" }}>
                        <strong>{homeEntries.length}</strong> Vorgänge im Zeitraum
                      </div>
                    </section>

                    <section style={{ ...card, padding: 18, overflow: "visible" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
                        <div>
                          <strong style={{ fontSize: 16 }}>Projekt- und Zeitfilter</strong>
                          <div style={{ color: "#64748b", fontSize: 13, marginTop: 3 }}>Die Datumswahl gilt für die aktuellen Vorgänge unten.</div>
                        </div>
                        <button type="button" onClick={() => { setProjectSearch(""); setHomeDateFrom(""); setHomeDateTo(""); }} style={{ ...button, padding: "8px 11px" }}>
                          Zurücksetzen
                        </button>
                      </div>

                      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
                        <label style={{ display: "grid", gap: 6, minWidth: 250, flex: "1 1 290px", color: "#334155", fontSize: 13, fontWeight: 800 }}>
                          Projekt suchen
                          <input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Projekt, Code, Auftraggeber oder Ort" style={{ padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
                        </label>
                        <label style={{ display: "grid", gap: 6, color: "#334155", fontSize: 13, fontWeight: 800 }}>
                          Von
                          <input type="date" value={homeDateFrom} onChange={(event) => setHomeDateFrom(event.target.value)} style={{ padding: "9px 11px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
                        </label>
                        <label style={{ display: "grid", gap: 6, color: "#334155", fontSize: 13, fontWeight: 800 }}>
                          Bis
                          <input type="date" value={homeDateTo} onChange={(event) => setHomeDateTo(event.target.value)} style={{ padding: "9px 11px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
                        </label>
                        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                          <button type="button" onClick={() => { const d = new Date().toISOString().slice(0, 10); setHomeDateFrom(d); setHomeDateTo(d); }} style={{ ...button, padding: "9px 11px" }}>Heute</button>
                          <button type="button" onClick={() => { const end = new Date(); const start = new Date(); start.setDate(end.getDate() - 6); setHomeDateFrom(start.toISOString().slice(0, 10)); setHomeDateTo(end.toISOString().slice(0, 10)); }} style={{ ...button, padding: "9px 11px" }}>7 Tage</button>
                          <button type="button" onClick={() => { const end = new Date(); const start = new Date(); start.setDate(end.getDate() - 29); setHomeDateFrom(start.toISOString().slice(0, 10)); setHomeDateTo(end.toISOString().slice(0, 10)); }} style={{ ...button, padding: "9px 11px" }}>30 Tage</button>
                        </div>
                      </div>
                    </section>

                    <section>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 11 }}>
                        <div>
                          <strong style={{ fontSize: 17 }}>Projekte</strong>
                          <div style={{ color: "#64748b", fontSize: 13, marginTop: 3 }}>{homeProjects.length} von {data.projects.length} Projekten</div>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
                        {homeProjects.map((project) => (
                          <button key={project.id} type="button" onClick={() => void openProject(project.id)} style={{ ...card, padding: 18, textAlign: "left", cursor: "pointer", color: "#0b2545", font: "inherit" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                              <strong style={{ fontSize: 16 }}>{project.name}</strong>
                              <span style={{ color: "#2563eb", fontWeight: 900 }}>→</span>
                            </div>
                            <div style={{ color: "#2563eb", fontWeight: 800, marginTop: 7 }}>{project.code}</div>
                            <div style={{ color: "#64748b", marginTop: 12, minHeight: 38, fontSize: 13 }}>
                              {project.client || "Kein Auftraggeber"}<br />{project.place || "Kein Ort"}
                            </div>
                            <div style={{ color: "#94a3b8", borderTop: "1px solid #e2e8f0", paddingTop: 10, marginTop: 12, fontSize: 12 }}>Angelegt: {formatDate(project.createdAt)}</div>
                          </button>
                        ))}
                        {!homeProjects.length ? <div style={{ ...card, padding: 20, color: "#64748b" }}>Kein Projekt zum Suchbegriff gefunden.</div> : null}
                      </div>
                    </section>

                    <section style={{ ...card, overflow: "hidden" }}>
                      <div style={{ padding: "15px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                        <div><strong>Aktuelle Eingänge</strong><div style={{ color: "#64748b", fontSize: 13, marginTop: 3 }}>Direkt in den jeweiligen Cloud-Projektbereich öffnen.</div></div>
                        <button type="button" onClick={() => setView("entries")} style={{ ...button, padding: "8px 11px" }}>Alle Eingänge</button>
                      </div>
                      <div>
                        {homeEntries.slice(0, 5).map((entry) => (
                          <button key={entry.id} type="button" onClick={() => void openEntry(entry)} style={{ width: "100%", border: 0, borderTop: "1px solid #e2e8f0", background: "#fff", padding: "13px 18px", display: "grid", gridTemplateColumns: "150px 1fr auto", gap: 14, alignItems: "center", textAlign: "left", color: "#0b2545", cursor: "pointer", font: "inherit" }}>
                            <span style={{ color: "#64748b", fontSize: 13 }}>{formatDate(entry.createdAt)}</span>
                            <span><strong>{entry.title || entry.kind}</strong><br /><small style={{ color: "#64748b" }}>{entry.project.name} · {entry.source} · {entry.kind}</small></span>
                            <span style={{ color: "#2563eb", fontWeight: 900 }}>Öffnen →</span>
                          </button>
                        ))}
                        {!homeEntries.length ? <div style={{ padding: 20, color: "#64748b" }}>Keine Eingänge im gewählten Zeitraum.</div> : null}
                      </div>
                    </section>
                  </div>                ) : (
                  <div style={{ padding: 18 }}>
                    <div style={{ marginBottom: 20, color: "#475569" }}>
                      {detail.project.code} · {detail.project.client || "Kein Auftraggeber"} ·{" "}
                      {detail.project.place || "Kein Ort"}
                    </div>

                    <section
                      style={{
                        background: "linear-gradient(110deg, #0759d9, #2387ff)",
                        color: "#fff",
                        borderRadius: 18,
                        padding: "22px 22px 20px",
                        marginBottom: 26,
                        boxShadow: "0 12px 30px rgba(37,99,235,.16)",
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          border: "1px solid rgba(255,255,255,.35)",
                          background: "rgba(255,255,255,.10)",
                          borderRadius: 999,
                          padding: "6px 11px",
                          fontSize: 13,
                          fontWeight: 800,
                          marginBottom: 10,
                        }}
                      >
                        Cloud-Zentrale
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 20,
                          flexWrap: "wrap",
                          alignItems: "flex-end",
                        }}
                      >
                        <div>
                          <h2 style={{ margin: 0, fontSize: 30 }}>
                            Projektdateien & Freigaben
                          </h2>

                          <p
                            style={{
                              margin: "6px 0 0",
                              maxWidth: 850,
                              color: "rgba(255,255,255,.92)",
                            }}
                          >
                            Alle Inhalte des Projekts zentral nach Fachbereich.
                            Dateien werden in der Cloud direkt heruntergeladen.
                          </p>

                          <div style={{ marginTop: 22, fontWeight: 800 }}>
                            Projekt: {detail.project.code} · {detail.project.name}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => void openProject(detail.project.id)}
                          style={{
                            ...button,
                            background: "rgba(255,255,255,.12)",
                            color: "#fff",
                            borderColor: "rgba(255,255,255,.35)",
                          }}
                        >
                          Aktualisieren
                        </button>
                      </div>
                    </section>



                    {data.isCompanyAdmin ? (
                      <>
                        <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-end",
                              gap: 16,
                              marginBottom: 14,
                              flexWrap: "wrap",
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  color: "#2563eb",
                                  fontSize: 12,
                                  fontWeight: 900,
                                  textTransform: "uppercase",
                                  letterSpacing: ".04em",
                                }}
                              >
                                Projektverwaltung
                              </div>

                              <h2 style={{ margin: "4px 0 0", fontSize: 22 }}>
                                Mitarbeiter &amp; Rechte
                              </h2>

                              <div
                                style={{
                                  marginTop: 5,
                                  color: "#64748b",
                                  fontSize: 13,
                                }}
                              >
                                Zugriff, Projektrolle und Downloadberechtigung verwalten.
                              </div>
                            </div>

                            <div
                              style={{
                                background: "#eff6ff",
                                color: "#1d4ed8",
                                border: "1px solid #bfdbfe",
                                borderRadius: 999,
                                padding: "6px 10px",
                                fontSize: 12,
                                fontWeight: 850,
                              }}
                            >
                              {projectPeople.length} Mitarbeiter
                            </div>
                          </div>
                        <div
                            style={{
                              overflowX: "auto",
                              border: "1px solid #e2e8f0",
                              borderRadius: 14,
                              background: "#fff",
                              marginBottom: 28,
                              boxShadow: "0 6px 20px rgba(15,23,42,.04)",
                            }}
                          >
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
                                      {roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
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



                    {(() => {
                      const cards = Array.from(
                          new Map(
                            (dashboard?.cards || []).map((area) => [area.key, area])
                          ).values()
                        );

                      const inboxTotal = cards.reduce(
                        (sum, area) => sum + (area.inbox?.length || 0),
                        0
                      );

                      const approvedTotal = cards.reduce(
                        (sum, area) => sum + (area.approved?.length || 0),
                        0
                      );

                      const finalTotal = cards.reduce(
                        (sum, area) => sum + (area.final?.length || 0),
                        0
                      );

                      return (
                        <section
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                            gap: 14,
                            marginBottom: 28,
                          }}
                        >
                          {[
                            ["1. Eingang", inboxTotal, "Vom Baustellenteam eingereicht"],
                            ["2. Freigegeben", approvedTotal, "Durch Bauleitung oder Büro geprüft"],
                            ["3. Final", finalTotal, "Registriert oder fachlich archiviert"],
                          ].map(([label, value, text]) => (
                            <div
                              key={String(label)}
                              style={{
                                ...card,
                                padding: 18,
                                minHeight: 82,
                              }}
                            >
                              <div
                                style={{
                                  color: "#64748b",
                                  fontSize: 13,
                                  fontWeight: 800,
                                }}
                              >
                                {label}
                              </div>

                              <strong
                                style={{
                                  display: "block",
                                  fontSize: 28,
                                  marginTop: 8,
                                }}
                              >
                                {value}
                              </strong>

                              <div
                                style={{
                                  color: "#64748b",
                                  fontSize: 12,
                                  marginTop: 5,
                                }}
                              >
                                {text}
                              </div>
                            </div>
                          ))}
                        </section>
                      );
                    })()}

                    <div
                        style={{
                          margin: "32px 0 16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-end",
                          gap: 16,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              color: "#2563eb",
                              fontSize: 12,
                              fontWeight: 900,
                              textTransform: "uppercase",
                              letterSpacing: ".04em",
                            }}
                          >
                            Dokumentenmanagement
                          </div>

                          <h2 style={{ margin: "4px 0 0", fontSize: 23 }}>
                            Projektbereiche
                          </h2>

                          <div
                            style={{
                              marginTop: 5,
                              color: "#64748b",
                              fontSize: 13,
                            }}
                          >
                            Dokumente, Freigaben und Exporte nach Fachbereich.
                          </div>
                        </div>
                      </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
                        gap: 14,
                          alignItems: "start",
                        marginBottom: 28,
                      }}
                    >
                      {[
                          {
                            key: "baustelle",
                            title: "Baustelle & Dokumentation",
                            text: "Tagesdokumentation, Nachweise, Fotos und Lieferungen.",
                            keys: ["regieberichte", "lieferscheine", "fotos", "tagesberichte", "bautagebuch", "arbeitszeiten"],
                          },
                          {
                            key: "kaufmaennisch",
                            title: "Kalkulation & Büro",
                            text: "Mengen, Kalkulation, Angebote und Rechnungen.",
                            keys: ["mengenermittlung", "kalkulation", "angebote", "abschlagsrechnungen", "rechnungen"],
                          },
                          {
                            key: "verwaltung",
                            title: "Projektverwaltung",
                            text: "Projektbezogene Verwaltungsdokumente.",
                            keys: ["projektverwaltung"],
                          },
                        ].map((group) => {
                          const groupAreas = Array.from(
                            new Map(
                              (dashboard?.cards || []).map((area: DashboardCard) => [
                                area.key,
                                area,
                              ])
                            ).values()
                          ).filter((area: DashboardCard) =>
                            group.keys.includes(area.key)
                          );
                          if (!groupAreas.length) return null;

                          return (
                            <section key={group.key} style={{ gridColumn: "1 / -1" }}>
                              <div style={{ margin: "8px 0 10px" }}>
                                <h3 style={{ margin: 0, fontSize: 18 }}>{group.title}</h3>
                                <div style={{ color: "#64748b", fontSize: 13, marginTop: 3 }}>
                                  {group.text}
                                </div>
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
                                  gap: 14,
                                  alignItems: "start",
                                }}
                              >
                                {groupAreas.map((area: DashboardCard) => {
                        const opened = openArea === area.key;

                        const areaFiles = Array.from(
                            new Map(
                              [
                                ...(area.files || []),
                                ...(detail?.documents || []).filter(
                                  (document) =>
                                    cloudAreaForFileName(document.name) === area.key
                                ),
                              ].map((document) => [String(document.id), document])
                            ).values()
                          );

                          const rows = [
                          ...(area.inbox || []).map((row) => ({
                            ...row,
                            __state: "Eingang",
                          })),
                          ...(area.approved || []).map((row) => ({
                            ...row,
                            __state: "Freigegeben",
                          })),
                          ...(area.final || []).map((row) => ({
                            ...row,
                            __state: "Final",
                          })),
                        ];

                        const normalize = (value: unknown) =>
                          String(value || "")
                            .toLowerCase()
                            .replace(/[^a-z0-9äöüß]/g, "");

                        const downloadWorkflowRow = (
                          row: any,
                          areaTitle: string
                        ) => {
                          const clean = (value: unknown) =>
                            String(value || "")
                              .trim()
                              .replace(/[^a-zA-Z0-9äöüÄÖÜß._-]+/g, "_")
                              .replace(/^_+|_+$/g, "");

                          const rowId =
                            clean(
                              row?.documentId ||
                              row?.fileId ||
                              row?.entityId ||
                              row?.docId ||
                              row?.id
                            ) || "datensatz";

                          const title =
                            clean(
                              row?.title ||
                              row?.name ||
                              row?.number ||
                              areaTitle
                            ) || "Cloud";

                          const payload = {
                            project: {
                              id: detail.project.id,
                              code: detail.project.code,
                              name: detail.project.name,
                            },
                            area: areaTitle,
                            workflowState: row?.__state || null,
                            data: row,
                          };

                          const blob = new Blob(
                            [JSON.stringify(payload, null, 2)],
                            { type: "application/json;charset=utf-8" }
                          );

                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");

                          const fileName = `${title}_${rowId}.json`;
                          a.href = url;
                          a.download = fileName;

                          document.body.appendChild(a);
                          a.click();
                          a.remove();

                          setTimeout(() => URL.revokeObjectURL(url), 1000);

                          const dmsProjectId = String(detail.project?.id || "").trim();
                          if (dmsProjectId) {
                            void import("../../lib/dmsArchive")
                              .then(({ archiveWebFile }) => archiveWebFile(dmsProjectId, fileName, blob))
                              .catch((error) => console.warn("[cloud:json:dms]", error));
                          }
                        };

                        const findDocument = (row: any) => {
                          const rowId = String(
                            row?.documentId ||
                            row?.fileId ||
                            row?.entityId ||
                            row?.id ||
                            ""
                          );

                          const direct = detail.documents.find(
                            (doc) => String(doc.id) === rowId
                          );

                          if (direct) return direct;

                          const candidates: unknown[] = [
                            row?.fileName,
                            row?.filename,
                            row?.pdfFileName,
                            row?.pdfFilename,
                            row?.pdfUrl,
                            row?.publicUrl,
                            row?.url,
                            row?.name,
                            row?.title,
                            row?.number,
                          ];

                          const addFiles = (items: any) => {
                            if (!Array.isArray(items)) return;

                            items.forEach((file) => {
                              candidates.push(
                                file?.name,
                                file?.file,
                                file?.filename,
                                file?.publicUrl,
                                file?.url,
                                file?.uri
                              );
                            });
                          };

                          addFiles(row?.files);
                          addFiles(row?.attachments);
                          addFiles(row?.photos);

                          if (row?.main) {
                            candidates.push(
                              row.main?.name,
                              row.main?.file,
                              row.main?.filename,
                              row.main?.publicUrl,
                              row.main?.url
                            );
                          }

                          const names = candidates
                            .map((value) => {
                              const raw = String(value || "")
                                .split("?")[0]
                                .split("#")[0];

                              const base = raw.split("/").pop() || raw;
                              return normalize(base);
                            })
                            .filter(Boolean);

                          if (!names.length) return undefined;

                          return detail.documents.find((doc) => {
                            const docText = normalize(doc.name);

                            return names.some(
                              (candidate) =>
                                docText === candidate ||
                                (
                                  candidate.length >= 6 &&
                                  (
                                    docText.includes(candidate) ||
                                    candidate.includes(docText)
                                  )
                                )
                            );
                          });
                        };

                        return (
                          <section
                            key={area.key}
                            style={{
                              border: "1px solid #dbe5f3",
                              borderRadius: 16,
                              background: "#fff",
                              overflow: "hidden",
                              minWidth: 0,
                              maxWidth: "100%",
                                gridColumn: opened ? "1 / -1" : "auto",
                              boxShadow: opened
                                  ? "0 16px 40px rgba(37,99,235,.12)"
                                  : "0 8px 24px rgba(15,40,90,.05)",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setOpenArea(opened ? null : area.key)
                              }
                              style={{
                                width: "100%",
                                border: 0,
                                background: "#fff",
                                padding: 17,
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: 12,
                                }}
                              >
                                <strong style={{ fontSize: 17 }}>
                                  {area.title}
                                </strong>

                                <span
                                  style={{
                                    background: "#dcfce7",
                                    border: "1px solid #bbf7d0",
                                    color: "#166534",
                                    borderRadius: 999,
                                    padding: "4px 8px",
                                    fontSize: 11,
                                    fontWeight: 800,
                                  }}
                                >
                                  Cloud
                                </span>
                                  <span
                                    style={{
                                      background: "#eff6ff",
                                      border: "1px solid #bfdbfe",
                                      color: "#1d4ed8",
                                      borderRadius: 999,
                                      padding: "4px 8px",
                                      fontSize: 11,
                                      fontWeight: 800,
                                    }}
                                  >
                                    {areaFiles.length} Dateien
                                  </span>
                              </div>

                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(3, 1fr)",
                                  gap: 8,
                                  marginTop: 15,
                                }}
                              >
                                {(area.key === "projektverwaltung"
                                    ? [["Dateien", areaFiles.length]]
                                    : [
                                  ["Inbox", area.inbox?.length || 0],
                                  ["Freigegeben", area.approved?.length || 0],
                                  ["Final", area.final?.length || 0],
                                ]).map(([label, value]) => (
                                  <div
                                    key={String(label)}
                                    style={{
                                      border: "1px solid #e2e8f0",
                                      borderRadius: 10,
                                      background: "#f8fafc",
                                      padding: 10,
                                    }}
                                  >
                                    <div
                                      style={{
                                        color: "#64748b",
                                        fontSize: 11,
                                        fontWeight: 800,
                                      }}
                                    >
                                      {label}
                                    </div>
                                    <strong
                                      style={{
                                        display: "block",
                                        marginTop: 4,
                                        fontSize: 18,
                                      }}
                                    >
                                      {value}
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            </button>

                            {opened ? (
                              <div
                                style={{
                                  borderTop: "1px solid #e2e8f0",
                                  padding: 12,
                                  maxHeight: 440,
                                  overflowY: "auto",
                                  overflowX: "hidden",
                                  width: "100%",
                                  minWidth: 0,
                                  boxSizing: "border-box",
                                  background: "#fbfdff",
                                }}
                              >
                                {areaFiles.length ? (
                                  <div
                                    style={{
                                      display: "grid",
                                      gap: 8,
                                      marginBottom: rows.length ? 14 : 0,
                                    }}
                                  >
                                    {areaFiles.map((file) => (
                                      <div
                                        key={file.id}
                                        style={{
                                          background: "#fff",
                                          border: "1px solid #bfdbfe",
                                          borderRadius: 10,
                                          padding: 12,
                                          display: "flex",
                                          justifyContent: "space-between",
                                          gap: 12,
                                          alignItems: "center",
                                          minWidth: 0,
                                        }}
                                      >
                                        <div style={{ minWidth: 0 }}>
                                          <div
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              flexWrap: "wrap",
                                              gap: 7,
                                            }}
                                          >
                                            <strong
                                              style={{
                                                overflowWrap: "anywhere",
                                              }}
                                            >
                                              {file.name}
                                            </strong>

                                            <span
                                              style={{
                                                fontSize: 11,
                                                fontWeight: 900,
                                                borderRadius: 999,
                                                padding: "3px 8px",
                                                background:
                                                  fileExtension(file.name) === "PDF"
                                                    ? "#fee2e2"
                                                    : "#e0f2fe",
                                                color:
                                                  fileExtension(file.name) === "PDF"
                                                    ? "#991b1b"
                                                    : "#075985",
                                              }}
                                            >
                                              {fileExtension(file.name)}
                                            </span>
                                          </div>

                                          <div
                                            style={{
                                              color: "#64748b",
                                              fontSize: 12,
                                              marginTop: 4,
                                            }}
                                          >
                                            {formatDate(file.updatedAt)}
                                            {" · "}
                                            {formatSize(file.size)}
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            void downloadDocument(file.id)
                                          }
                                          disabled={!detail.canDownload}
                                          style={{
                                            ...button,
                                            flexShrink: 0,
                                          }}
                                        >
                                          Herunterladen
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}

                                {rows.length ? (
                                  rows.map((row: any, index) => {
                                    const doc = findDocument(row);

                                    return (
                                      <div
                                        key={String(row?.id || index)}
                                        style={{
                                          background: "#fff",
                                          border: "1px solid #e2e8f0",
                                          borderRadius: 10,
                                          padding: 12,
                                          marginBottom: 8,
                                          display: "flex",
                                          justifyContent: "space-between",
                                          gap: 14,
                                          alignItems: "center",
                                        }}
                                      >
                                        <div style={{ minWidth: 0 }}>
                                          <div
                                            style={{
                                              display: "flex",
                                              gap: 7,
                                              flexWrap: "wrap",
                                              alignItems: "center",
                                            }}
                                          >
                                            <strong
                                              style={{
                                                overflowWrap: "anywhere",
                                                wordBreak: "break-word",
                                              }}
                                            >
                                              {String(
                                                row?.title ||
                                                row?.name ||
                                                row?.number ||
                                                doc?.name ||
                                                row?.id ||
                                                "Dokument"
                                              )}
                                            </strong>

                                            <span
                                              style={{
                                                fontSize: 11,
                                                fontWeight: 800,
                                                borderRadius: 999,
                                                padding: "3px 7px",
                                                background: "#eff6ff",
                                                color: "#1d4ed8",
                                              }}
                                            >
                                              {row.__state}
                                            </span>
                                          </div>

                                          <div
                                            style={{
                                              color: "#64748b",
                                              fontSize: 12,
                                              marginTop: 4,
                                            }}
                                          >
                                            {formatDate(
                                              String(
                                                row?.date ||
                                                row?.createdAt ||
                                                row?.updatedAt ||
                                                doc?.updatedAt ||
                                                ""
                                              )
                                            )}
                                            {doc
                                              ? ` · ${formatSize(doc.size)}`
                                              : ""}
                                          </div>
                                        </div>

                                        {doc ? (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void downloadDocument(doc.id)
                                            }
                                            disabled={!detail.canDownload}
                                            style={{
                                              ...button,
                                              flexShrink: 0,
                                              opacity: detail.canDownload
                                                ? 1
                                                : 0.45,
                                              cursor: detail.canDownload
                                                ? "pointer"
                                                : "not-allowed",
                                            }}
                                          >
                                            {detail.canDownload
                                              ? "Herunterladen"
                                              : "Nicht freigegeben"}
                                          </button>
                                        ) : (
                                          <span
                                            style={{
                                              color: "#64748b",
                                              fontSize: 12,
                                              flexShrink: 0,
                                            }}
                                          >
                                            Export siehe oben
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })
                                ) : (
                                  <span style={{ color: "#64748b" }}>
                                    Keine Dokumente.
                                  </span>
                                )}
                              </div>
                            ) : null}
                          </section>
                        );
                      })}
                              </div>
                            </section>
                          );
                        })}
                    </div>

                    {additionalDocuments.length ? (
                      <>
                        <div style={{ margin: "34px 0 14px" }}>
                          <div
                            style={{
                              color: "#64748b",
                              fontSize: 12,
                              fontWeight: 900,
                              textTransform: "uppercase",
                              letterSpacing: ".04em",
                            }}
                          >
                            Ablage
                          </div>

                          <h2 style={{ margin: "4px 0 0", fontSize: 21 }}>
                            Sonstige Dateien
                          </h2>

                          <div
                            style={{
                              marginTop: 5,
                              color: "#64748b",
                              fontSize: 13,
                            }}
                          >
                            Dateien ohne eindeutige Zuordnung zu einem Projektbereich.
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(300px, 1fr))",
                            gap: 10,
                            marginBottom: 28,
                          }}
                        >
                          {additionalDocuments.map((document) => (
                            <div
                              key={document.id}
                              style={{
                                ...card,
                                padding: 14,
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 12,
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <strong
                                  style={{
                                    display: "block",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {document.name}
                                </strong>

                                <small style={{ color: "#64748b" }}>
                                  {document.kind} ·{" "}
                                  {formatDate(document.updatedAt)} ·{" "}
                                  {formatSize(document.size)}
                                </small>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  void downloadDocument(document.id)
                                }
                                disabled={!detail.canDownload}
                                style={{
                                  ...button,
                                  flexShrink: 0,
                                  opacity: detail.canDownload ? 1 : 0.45,
                                  cursor: detail.canDownload
                                    ? "pointer"
                                    : "not-allowed",
                                }}
                              >
                                Herunterladen
                              </button>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </section>
            ) : null}

            {view === "members" ? (
              <section style={{ display: "grid", gap: 18 }}>
                <div style={{ ...card, padding: "22px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap", background: "linear-gradient(135deg, #ffffff, #f5f9ff)" }}>
                  <div>
                    <div style={{ color: "#2563eb", fontSize: 12, fontWeight: 900, letterSpacing: ".08em" }}>UNTERNEHMEN</div>
                    <h1 style={{ margin: "5px 0 6px", fontSize: 25 }}>Mitarbeiterverwaltung</h1>
                    <div style={{ color: "#64748b" }}>Rollen, Status und Projektzugriffe zentral verwalten.</div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eff6ff", color: "#1d4ed8" }}><strong>{data.members.filter((person) => person.active).length}</strong> aktiv</div>
                    <div style={{ padding: "10px 14px", borderRadius: 10, background: "#f8fafc", color: "#475569" }}><strong>{data.members.length}</strong> gesamt</div>
                  </div>
                </div>

                {data.isCompanyAdmin ? (
                  <form onSubmit={createInvite} style={{ ...card, padding: 22, display: "grid", gridTemplateColumns: "minmax(220px, 1.5fr) minmax(180px, .8fr) auto", gap: 12, alignItems: "end" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <strong style={{ fontSize: 17 }}>Mitarbeiter einladen</strong>
                      <div style={{ color: "#64748b", marginTop: 4 }}>E-Mail-Adresse und Standardrolle festlegen. Den Projektzugriff vergeben Sie anschließend unter Projekte.</div>
                    </div>
                    <label style={{ display: "grid", gap: 6, color: "#334155", fontWeight: 700, fontSize: 13 }}>
                      E-Mail-Adresse
                      <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@firma.de" style={{ padding: "11px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: 15 }} />
                    </label>
                    <label style={{ display: "grid", gap: 6, color: "#334155", fontWeight: 700, fontSize: 13 }}>
                      Rolle
                      <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)} style={{ padding: "11px 12px", borderRadius: 9, border: "1px solid #cbd5e1", fontSize: 15 }}>
                        {roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                      </select>
                    </label>
                    <button type="submit" style={{ ...button, minHeight: 44 }}>Einladung erstellen</button>
                    {inviteCode ? <div style={{ gridColumn: "1 / -1", padding: "10px 12px", borderRadius: 9, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>Einladungscode: <strong>{inviteCode}</strong></div> : null}
                  </form>
                ) : null}

                <div style={{ ...card, overflow: "hidden" }}>
                  <div style={{ padding: "17px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <strong style={{ fontSize: 17 }}>Mitarbeiter</strong>
                      <div style={{ color: "#64748b", marginTop: 3, fontSize: 13 }}>Änderungen an Rolle und Aktivstatus werden sofort gespeichert.</div>
                    </div>
                    <span style={{ color: "#475569", fontSize: 13 }}>{data.members.length} Einträge</span>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left", background: "#f8fafc", color: "#475569", fontSize: 13 }}>
                          {["Mitarbeiter", "Rolle", "Status", "Projektzugriff"].map((label) => <th key={label} style={{ padding: "12px 20px", fontWeight: 800 }}>{label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {data.members.map((person) => {
                          const isCurrentUser = person.userId === data.currentUserId;
                          return (
                            <tr key={person.userId} style={{ borderTop: "1px solid #e2e8f0" }}>
                              <td style={{ padding: "16px 20px" }}>
                                <strong>{displayName(person.user)}</strong>{isCurrentUser ? <span style={{ marginLeft: 8, color: "#1d4ed8", fontSize: 12, fontWeight: 800 }}>Sie</span> : null}
                                <br /><small style={{ color: "#64748b" }}>{person.user.email}</small>
                              </td>
                              <td style={{ padding: "16px 20px" }}>
                                {data.isCompanyAdmin ? (
                                  <select value={person.role} disabled={isCurrentUser} onChange={(event) => void saveMember(person, { role: event.target.value as Role })} style={{ padding: "9px 10px", border: "1px solid #cbd5e1", borderRadius: 8 }}>
                                    {roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                                  </select>
                                ) : <strong>{roleLabels[person.role]}</strong>}
                              </td>
                              <td style={{ padding: "16px 20px" }}>
                                {data.isCompanyAdmin ? (
                                  <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                                    <input type="checkbox" checked={person.active} disabled={isCurrentUser} onChange={(event) => void saveMember(person, { active: event.target.checked })} />
                                    <span style={{ padding: "5px 9px", borderRadius: 999, fontWeight: 800, fontSize: 12, color: person.active ? "#166534" : "#64748b", background: person.active ? "#dcfce7" : "#e2e8f0" }}>{person.active ? "Aktiv" : "Inaktiv"}</span>
                                  </label>
                                ) : <span style={{ color: person.active ? "#166534" : "#64748b", fontWeight: 800 }}>{person.active ? "Aktiv" : "Inaktiv"}</span>}
                              </td>
                              <td style={{ padding: "16px 20px", color: "#475569" }}>{data.isCompanyAdmin ? "Projektzugriff unter Projekte verwalten" : "Nur zugewiesene Projekte sichtbar"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}

            {view === "entries" ? (
              <section style={{ display: "grid", gap: 18 }}>
                <div style={{ ...card, padding: "22px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", background: "linear-gradient(135deg, #ffffff, #f5f9ff)" }}>
                  <div>
                    <div style={{ color: "#2563eb", fontSize: 12, fontWeight: 900, letterSpacing: ".08em" }}>PRÜFUNG & WEITERBEARBEITUNG</div>
                    <h1 style={{ margin: "5px 0 6px", fontSize: 25 }}>Eingänge</h1>
                    <div style={{ color: "#64748b" }}>Neue Meldungen aus Mobile und Web. Eintrag anklicken, um den passenden Projektbereich direkt in der Cloud zu öffnen.</div>
                  </div>
                  <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eff6ff", color: "#1d4ed8" }}>
                    <strong>{entries.filter((entry) => {
                      const day = String(entry.createdAt || "").slice(0, 10);
                      return (!entryUserId || entry.user?.id === entryUserId) && (!entryDateFrom || day >= entryDateFrom) && (!entryDateTo || day <= entryDateTo);
                    }).length}</strong> angezeigt
                  </div>
                </div>

                <div style={{ ...card, overflow: "hidden" }}>
                  <div style={{ padding: "17px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
                    <label style={{ display: "grid", gap: 6, color: "#334155", fontWeight: 700, fontSize: 13 }}>
                      Mitarbeiter
                      <select value={entryUserId} onChange={(event) => setEntryUserId(event.target.value)} style={{ minWidth: 190, padding: "10px 11px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff" }}>
                        <option value="">Alle Mitarbeiter</option>
                        {data.members.map((person) => <option key={person.userId} value={person.userId}>{displayName(person.user)}</option>)}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 6, color: "#334155", fontWeight: 700, fontSize: 13 }}>
                      Von
                      <input type="date" value={entryDateFrom} onChange={(event) => setEntryDateFrom(event.target.value)} style={{ padding: "9px 11px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
                    </label>
                    <label style={{ display: "grid", gap: 6, color: "#334155", fontWeight: 700, fontSize: 13 }}>
                      Bis
                      <input type="date" value={entryDateTo} onChange={(event) => setEntryDateTo(event.target.value)} style={{ padding: "9px 11px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
                    </label>
                    <button type="button" onClick={() => { setEntryUserId(""); setEntryDateFrom(""); setEntryDateTo(""); }} style={{ ...button, padding: "10px 13px" }}>
                      Filter zurücksetzen
                    </button>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left", background: "#f8fafc", color: "#475569", fontSize: 13 }}>
                          {["Zeit", "Mitarbeiter", "Projekt", "Bereich", "Titel", ""].map((label, index) => <th key={`${label}-${index}`} style={{ padding: "12px 20px", fontWeight: 800 }}>{label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {entries.filter((entry) => {
                          const day = String(entry.createdAt || "").slice(0, 10);
                          return (!entryUserId || entry.user?.id === entryUserId) && (!entryDateFrom || day >= entryDateFrom) && (!entryDateTo || day <= entryDateTo);
                        }).map((entry) => (
                          <tr key={entry.id} onClick={() => openEntry(entry)} title="Projektbereich in der Cloud öffnen" style={{ borderTop: "1px solid #e2e8f0", cursor: "pointer", background: "#fff" }}>
                            <td style={{ padding: "15px 20px", whiteSpace: "nowrap" }}>{formatDate(entry.createdAt)}</td>
                            <td style={{ padding: "15px 20px", fontWeight: 700 }}>{displayName(entry.user)}</td>
                            <td style={{ padding: "15px 20px" }}>{entry.project.name}<br /><small style={{ color: "#64748b" }}>{entry.project.code}</small></td>
                            <td style={{ padding: "15px 20px" }}><span style={{ padding: "5px 8px", borderRadius: 999, fontSize: 12, fontWeight: 800, color: "#1d4ed8", background: "#eff6ff" }}>{entry.source} · {entry.kind}</span></td>
                            <td style={{ padding: "15px 20px" }}>{entry.title || "—"}</td>
                            <td style={{ padding: "15px 20px", color: "#2563eb", fontWeight: 800, whiteSpace: "nowrap" }}>In Cloud öffnen →</td>
                          </tr>
                        ))}
                        {!entries.filter((entry) => {
                          const day = String(entry.createdAt || "").slice(0, 10);
                          return (!entryUserId || entry.user?.id === entryUserId) && (!entryDateFrom || day >= entryDateFrom) && (!entryDateTo || day <= entryDateTo);
                        }).length ? <tr><td colSpan={6} style={{ padding: 24, color: "#64748b", textAlign: "center" }}>Keine Eingänge für den gewählten Filter vorhanden.</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
