import React from "react";
import { apiUrl } from "../../lib/apiBase";

type CloudData = {
  company: { id: string; name: string; code?: string | null };
  subscription: {
    status: string;
    cloudEnabled: boolean;
    webSeatsPurchased?: number | null;
    mobileSeatsPurchased?: number | null;
  };
  currentUserId: string;
  members: Array<{
    id: string;
    userId: string;
    role: string;
    user: { id: string; name?: string | null; email: string };
  }>;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    client?: string | null;
    place?: string | null;
    status: string;
    createdAt: string;
  }>;
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

function token() {
  const direct = localStorage.getItem("rlc_token");
  if (direct?.trim()) return direct.trim();

  try {
    const auth = JSON.parse(localStorage.getItem("rlc_auth") || "{}");
    return String(auth?.token || auth?.accessToken || "").trim();
  } catch {
    return "";
  }
}

function fmtDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function userName(user?: { name?: string | null; email: string } | null) {
  return String(user?.name || user?.email || "Unbekannt");
}

export default function CloudHome() {
  const [data, setData] = React.useState<CloudData | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [selectedUserId, setSelectedUserId] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(apiUrl("/api/cloud/me"), {
        headers: {
          Accept: "application/json",
          ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        },
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(
          String(payload?.error || "Cloud konnte nicht geladen werden")
        );
      }

      setData(payload);
    } catch (e: any) {
      setData(null);
      setError(String(e?.message || "Cloud konnte nicht geladen werden"));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

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

    window.location.replace("/login?release=cloud-v1");
  }

  const visibleSubmissions = !selectedUserId
    ? data?.submissions || []
    : (data?.submissions || []).filter(
        (submission) => submission.user?.id === selectedUserId
      );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f6f8fc",
        color: "#0b2545",
        padding: "32px clamp(16px, 4vw, 56px)",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <section
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          background: "linear-gradient(110deg, #0b285d, #2563eb)",
          color: "#fff",
          borderRadius: 24,
          padding: "30px",
          boxShadow: "0 16px 40px rgba(15, 40, 90, .16)",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: ".04em" }}>
          RLC CLOUD
        </div>
        <h1 style={{ margin: "10px 0 8px", fontSize: 34 }}>
          {data?.company?.name || "Ihre Bauprojekte"}
        </h1>
        <p style={{ margin: 0, opacity: 0.94 }}>
          Projekte, Eingänge und Mobile-Meldungen Ihrer Firma zentral im Blick.
        </p>
        <button
          type="button"
          onClick={logout}
          style={{
            marginTop: 22,
            background: "#fff",
            color: "#c81e1e",
            border: 0,
            borderRadius: 10,
            padding: "12px 20px",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Abmelden
        </button>
      </section>

      {loading ? <p style={{ padding: 24 }}>Cloud lädt…</p> : null}

      {error ? (
        <section
          style={{
            maxWidth: 1440,
            margin: "22px auto",
            padding: 20,
            borderRadius: 16,
            background: "#fff1f2",
            color: "#9f1239",
          }}
        >
          <strong>Cloud nicht verfügbar.</strong>
          <div style={{ marginTop: 6 }}>{error}</div>
          <button type="button" onClick={load} style={{ marginTop: 14 }}>
            Erneut versuchen
          </button>
        </section>
      ) : null}

      {data ? (
        <div style={{ maxWidth: 1440, margin: "22px auto" }}>
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
              ["Aktive Mitarbeiter", data.members.length],
              ["Mobile-Lizenzen", data.subscription.mobileSeatsPurchased ?? 0],
              ["Web-Lizenzen", data.subscription.webSeatsPurchased ?? 0],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                style={{
                  background: "#fff",
                  border: "1px solid #dce5f3",
                  borderRadius: 16,
                  padding: 20,
                }}
              >
                <div style={{ color: "#64748b", fontSize: 14 }}>{label}</div>
                <div style={{ marginTop: 6, fontSize: 28, fontWeight: 800 }}>
                  {value}
                </div>
              </div>
            ))}
          </section>

          <section
            style={{
              background: "#fff",
              border: "1px solid #dce5f3",
              borderRadius: 16,
              overflow: "hidden",
              marginBottom: 22,
            }}
          >
            <div style={{ padding: 20, borderBottom: "1px solid #e2e8f0" }}>
              <strong>Projekte Ihrer Firma</strong>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                    {["Projekt", "Code", "Auftraggeber", "Ort", "Status"].map(
                      (label) => (
                        <th key={label} style={{ padding: 14 }}>{label}</th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((project) => (
                    <tr key={project.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                      <td style={{ padding: 14, fontWeight: 700 }}>{project.name}</td>
                      <td style={{ padding: 14 }}>{project.code}</td>
                      <td style={{ padding: 14 }}>{project.client || "—"}</td>
                      <td style={{ padding: 14 }}>{project.place || "—"}</td>
                      <td style={{ padding: 14 }}>{project.status}</td>
                    </tr>
                  ))}
                  {!data.projects.length ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 18, color: "#64748b" }}>
                        Noch keine Projekte vorhanden.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section
            style={{
              background: "#fff",
              border: "1px solid #dce5f3",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: 20,
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <strong>Letzte Eingänge</strong>
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
              >
                <option value="">Alle Mitarbeiter</option>
                {data.members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {userName(member.user)}
                  </option>
                ))}
              </select>
              <button type="button" onClick={load}>
                Aktualisieren
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                    {["Zeit", "Mitarbeiter", "Projekt", "Bereich", "Titel"].map(
                      (label) => (
                        <th key={label} style={{ padding: 14 }}>{label}</th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleSubmissions.map((entry) => (
                    <tr key={entry.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                      <td style={{ padding: 14, whiteSpace: "nowrap" }}>{fmtDate(entry.createdAt)}</td>
                      <td style={{ padding: 14 }}>{userName(entry.user)}</td>
                      <td style={{ padding: 14 }}>{entry.project.name}</td>
                      <td style={{ padding: 14 }}>{entry.source} · {entry.kind}</td>
                      <td style={{ padding: 14 }}>{entry.title || "—"}</td>
                    </tr>
                  ))}
                  {!visibleSubmissions.length ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 18, color: "#64748b" }}>
                        Keine Eingänge für diese Auswahl vorhanden.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}