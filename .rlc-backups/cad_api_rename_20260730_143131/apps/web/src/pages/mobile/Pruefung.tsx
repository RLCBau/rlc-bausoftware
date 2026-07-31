import React from "react";
import { Link, useParams } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

type WorkflowType =
  | "ANGEBOT"
  | "MENGENERMITTLUNG"
  | "ABSCHLAGSRECHNUNG"
  | "RECHNUNG";

type WorkflowDocument = Record<string, any> & {
  id: string;
  title?: string;
  workflowStatus?: string;
  submittedAt?: number;
  approvedAt?: number;
  rejectionReason?: string;
};

const CONFIG: Record<WorkflowType, { title: string; finalTo: string; finalLabel: string }> = {
  ANGEBOT: { title: "Angebote", finalTo: "/buro/angebote", finalLabel: "Angebotsverwaltung" },
  MENGENERMITTLUNG: {
    title: "Mengenermittlung",
    finalTo: "/mengenermittlung/aufmasseditor",
    finalLabel: "Aufmaß-Editor",
  },
  ABSCHLAGSRECHNUNG: {
    title: "Abschlagsrechnungen",
    finalTo: "/buchhaltung/abschlagsrechnungen",
    finalLabel: "Abschlagsrechnungen",
  },
  RECHNUNG: {
    title: "Rechnungen",
    finalTo: "/buchhaltung/rechnungen",
    finalLabel: "Rechnungsverwaltung",
  },
};

function authHeaders(): Record<string, string> {
  for (const key of ["rlc_token", "token", "authToken", "accessToken", "rlc_auth_token"]) {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (token?.trim()) return { Authorization: `Bearer ${token.trim()}` };
  }
  return {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
  }
  return payload as T;
}

function docTitle(doc: WorkflowDocument) {
  return String(
    doc.title || doc.angebotTitle || doc.angebotNr || doc.rechnungNr || doc.nr || doc.id
  );
}

function docDate(doc: WorkflowDocument) {
  const value = doc.submittedAt || doc.approvedAt || doc.updatedAt || doc.createdAt;
  if (typeof value === "number") return new Date(value).toLocaleString("de-DE");
  return String(doc.datum || doc.date || "—");
}

export default function MobilePruefung() {
  const { type: rawType = "" } = useParams();
  const type = rawType.toUpperCase() as WorkflowType;
  const config = CONFIG[type];
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();
  const projectKey = String(project?.code || project?.id || "").trim();

  const [inbox, setInbox] = React.useState<WorkflowDocument[]>([]);
  const [approved, setApproved] = React.useState<WorkflowDocument[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    if (!config || !projectKey) {
      setInbox([]);
      setApproved([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const base = `/api/inbox/${encodeURIComponent(projectKey)}/${encodeURIComponent(type)}`;
      const [incoming, released] = await Promise.all([
        request<any>(base),
        request<any>(`${base}/approved`),
      ]);
      setInbox(Array.isArray(incoming?.items) ? incoming.items : []);
      setApproved(Array.isArray(released?.items) ? released.items : []);
    } catch (e: any) {
      setError(e?.message || "Eingangsprüfung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [config, projectKey, type]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function approve(doc: WorkflowDocument) {
    if (!confirm(`„${docTitle(doc)}“ freigeben und ins Fachmodul übernehmen?`)) return;
    try {
      setLoading(true);
      await request(
        `/api/inbox/${encodeURIComponent(projectKey)}/${encodeURIComponent(type)}/${encodeURIComponent(doc.id)}/approve`,
        { method: "POST", body: JSON.stringify({}) }
      );
      await load();
    } catch (e: any) {
      setError(e?.message || "Freigabe fehlgeschlagen.");
      setLoading(false);
    }
  }

  async function reject(doc: WorkflowDocument) {
    const reason = prompt("Grund der Ablehnung:", doc.rejectionReason || "");
    if (!reason?.trim()) return;
    try {
      setLoading(true);
      await request(
        `/api/inbox/${encodeURIComponent(projectKey)}/${encodeURIComponent(type)}/${encodeURIComponent(doc.id)}/reject`,
        { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }
      );
      await load();
    } catch (e: any) {
      setError(e?.message || "Ablehnung fehlgeschlagen.");
      setLoading(false);
    }
  }

  if (!config) {
    return <div style={{ padding: 24 }}>Unbekanntes Prüfmodul.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 18, paddingBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>Mobile · Eingangsprüfung</div>
          <h1 style={{ margin: "5px 0" }}>{config.title}</h1>
          <div style={{ color: "#64748b" }}>Projekt: {projectKey || "Kein Projekt gewählt"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" onClick={() => void load()} disabled={loading || !projectKey} style={buttonStyle}>
            {loading ? "Lädt …" : "Aktualisieren"}
          </button>
          <Link to={config.finalTo} style={{ ...buttonStyle, textDecoration: "none", background: "#1d4ed8", color: "white" }}>
            {config.finalLabel} →
          </Link>
        </div>
      </div>

      {error ? <div style={errorStyle}>{error}</div> : null}
      {!projectKey ? <div style={errorStyle}>Bitte zuerst ein Projekt auswählen.</div> : null}

      <section>
        <h2 style={{ fontSize: 18 }}>Eingang ({inbox.length})</h2>
        <div style={gridStyle}>
          {inbox.map((doc) => (
            <article key={doc.id} style={cardStyle}>
              <div style={{ fontWeight: 900 }}>{docTitle(doc)}</div>
              <div style={metaStyle}>{docDate(doc)} · ID {doc.id}</div>
              {doc.rejectionReason ? <div style={{ color: "#b45309", fontSize: 12 }}>Abgelehnt: {doc.rejectionReason}</div> : null}
              <div style={{ color: "#475569", fontSize: 12 }}>
                {Array.isArray(doc.rows) ? `${doc.rows.length} Position(en)` : doc.workflowStatus || "EINGEREICHT"}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => void approve(doc)} disabled={loading} style={{ ...buttonStyle, background: "#166534", color: "white" }}>
                  Freigeben
                </button>
                <button type="button" onClick={() => void reject(doc)} disabled={loading} style={buttonStyle}>
                  Ablehnen
                </button>
              </div>
            </article>
          ))}
          {!inbox.length ? <div style={emptyStyle}>Keine Dokumente im Eingang.</div> : null}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18 }}>Freigegeben und übernommen ({approved.length})</h2>
        <div style={gridStyle}>
          {approved.map((doc) => (
            <article key={doc.id} style={cardStyle}>
              <div style={{ fontWeight: 900 }}>{docTitle(doc)}</div>
              <div style={metaStyle}>{docDate(doc)} · {doc.workflowStatus || "FREIGEGEBEN"}</div>
              <div style={{ color: "#166534", fontSize: 12, fontWeight: 800 }}>Im Fachmodul registriert</div>
            </article>
          ))}
          {!approved.length ? <div style={emptyStyle}>Noch keine freigegebenen Dokumente.</div> : null}
        </div>
      </section>
    </div>
  );
}

const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 };
const cardStyle: React.CSSProperties = { display: "grid", gap: 8, padding: 15, border: "1px solid #dbe4f0", borderRadius: 14, background: "white" };
const metaStyle: React.CSSProperties = { color: "#64748b", fontSize: 11 };
const buttonStyle: React.CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 9, background: "white", color: "#0f172a", padding: "8px 11px", fontWeight: 800, cursor: "pointer" };
const errorStyle: React.CSSProperties = { padding: 12, border: "1px solid #fecaca", borderRadius: 10, background: "#fef2f2", color: "#991b1b" };
const emptyStyle: React.CSSProperties = { padding: 16, border: "1px dashed #cbd5e1", borderRadius: 12, color: "#64748b" };
