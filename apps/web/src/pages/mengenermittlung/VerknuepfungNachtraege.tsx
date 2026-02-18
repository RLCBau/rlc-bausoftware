// apps/web/src/pages/mengenermittlung/VerknuepfungNachtraegeAbrechnung.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";

const API =
  (import.meta as any)?.env?.VITE_API_URL ||
  (import.meta as any)?.env?.VITE_BACKEND_URL ||
  "http://localhost:4000";

/* ================= TYPES ================= */

type AufmassRow = {
  id: string;
  pos: string;
  text: string;
  unit: string;
  ep: number;
  soll: number;
  formula: string;
  ist: number;
  note?: string;
  factor?: number;
};

type Datei = { id: string; name: string; url: string; type: string };

type Nachtrag = {
  id?: string;
  projectId: string;
  lvPosId?: string | null;
  lvPos?: string | null;
  number?: string;
  title?: string;
  qty?: number;
  unit?: string;
  ep?: number;
  total?: number;
  status?: "offen" | "inBearbeitung" | "freigegeben" | "abgelehnt";
  note?: string;
  attachments?: Datei[];
};

type LinkRow = {
  id: string;
  lvPos: string;
  text: string;
  unit: string;
  soll: number;
  ist: number;
  ep: number;
  diff: number;

  status: "OK" | "UEBERMASS" | "FEHLMENGE";

  // Nachtrag linkage
  nachtragNr?: string;
  nachtragStatus?: string;
  nachtragTotal?: number;

  // placeholder Abschlag
  abschlagNr?: number | null;
};

/* ================= STYLES (copiati come AufmassEditor) ================= */

const pageContainer: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "1.5rem 1.75rem 2rem",
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 12,
  border: "1px solid #E5E7EB",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  padding: "1.25rem 1.5rem 1.5rem",
};

const cardTitleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "0.75rem",
};

const cardTitle: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  color: "#111827",
};

const cardHint: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "#9CA3AF",
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "6px 10px 10px",
  borderBottom: "1px solid #E5E7EB",
  alignItems: "center",
};

const btn: React.CSSProperties = {
  fontSize: "0.8rem",
  borderRadius: 999,
  padding: "0.35rem 0.9rem",
  border: "1px solid #D1D5DB",
  background: "#F9FAFB",
  color: "#374151",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: "#2563EB",
  borderColor: "#1D4ED8",
  color: "#FFFFFF",
  fontWeight: 500,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #E5E7EB",
  fontSize: 12,
  whiteSpace: "nowrap",
  background: "#F9FAFB",
  color: "#4B5563",
};

const td: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #E5E7EB",
  fontSize: 13,
  verticalAlign: "middle",
};

const fmtEUR = (v: number) =>
  "€ " + (Number.isFinite(v) ? v.toFixed(2) : "0.00");

const num = (v: any, d = 3) => {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString("de-DE", { maximumFractionDigits: d })
    : "0";
};

/* ================= LOCAL STORAGE HELPERS ================= */

function loadAufmassLocal(projectKey: string): AufmassRow[] {
  if (!projectKey) return [];
  try {
    const key = `RLC_AUFMASS_${projectKey}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AufmassRow[]) : [];
  } catch {
    return [];
  }
}

function loadNachtraegeLocal(projectId: string): Nachtrag[] {
  if (!projectId) return [];
  try {
    const raw = localStorage.getItem(`nt:${projectId}`);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as Nachtrag[]) : [];
  } catch {
    return [];
  }
}

/* ================= OPTIONAL API (non rompe se assente) ================= */

async function tryApi<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ================= COMPONENT ================= */

export default function VerknuepfungNachtraegeAbrechnung() {
  const navigate = useNavigate();
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();

  const projectKey = (project?.code || project?.id || "").trim();
  const projectId = project?.id || "";

  const [rows, setRows] = React.useState<LinkRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [sel, setSel] = React.useState<Record<string, boolean>>({});

  const selectedIds = React.useMemo(
    () => Object.keys(sel).filter((k) => sel[k]),
    [sel]
  );

  function toggleAll(v: boolean) {
    const next: Record<string, boolean> = {};
    rows.forEach((r) => (next[r.id] = v));
    setSel(next);
  }

  function toggleOne(id: string, v: boolean) {
    setSel((s) => ({ ...s, [id]: v }));
  }

  function buildRows(aufmass: AufmassRow[], nts: Nachtrag[]): LinkRow[] {
    const ntByLvPos = new Map<string, Nachtrag[]>();
    for (const n of nts) {
      const k = String(n.lvPos || "").trim();
      if (!k) continue;
      const arr = ntByLvPos.get(k) || [];
      arr.push({ ...n, total: (n.qty || 0) * (n.ep || 0) });
      ntByLvPos.set(k, arr);
    }

    return (aufmass || []).map((r) => {
      const diff = Number(r.ist || 0) - Number(r.soll || 0);
      const status: LinkRow["status"] =
        diff === 0 ? "OK" : diff > 0 ? "UEBERMASS" : "FEHLMENGE";

      const lvPos = String(r.pos || "").trim();
      const matches = ntByLvPos.get(lvPos) || [];
      const best = matches[0]; // semplice: primo

      return {
        id: r.id || `${lvPos}-${Math.random()}`,
        lvPos,
        text: String(r.text || ""),
        unit: String(r.unit || ""),
        soll: Number(r.soll || 0),
        ist: Number(r.ist || 0),
        ep: Number(r.ep || 0),
        diff,
        status,
        nachtragNr: best?.number || undefined,
        nachtragStatus: best?.status || undefined,
        nachtragTotal: best?.total || undefined,
        abschlagNr: null,
      };
    });
  }

  async function load() {
    if (!projectKey) {
      setRows([]);
      setSel({});
      setErr("Kein Projekt gewählt.");
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      // 1) optional server (se esiste, non obbligatorio)
      // TODO: se implementi endpoint, qui puoi usarli senza cambiare UI.
      // const server = await tryApi<{ ok: boolean; items: LinkRow[] }>(`/api/linking/list?projectId=${encodeURIComponent(projectId)}`);

      // 2) local fallback: Aufmaß + Nachträge LS
      const aufmass = loadAufmassLocal(projectKey);
      const nachtraege = projectId ? loadNachtraegeLocal(projectId) : [];

      const built = buildRows(aufmass, nachtraege);
      setRows(built);
      setSel({});
    } catch (e: any) {
      setErr(e?.message || "Fehler beim Laden");
      setRows([]);
      setSel({});
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey, projectId]);

  const kpi = React.useMemo(() => {
    let sollSum = 0;
    let istSum = 0;
    let offenNachtrag = 0;
    let abrechenbar = 0;

    for (const r of rows) {
      sollSum += r.soll || 0;
      istSum += r.ist || 0;

      // “offen nachtrag”: Übermaß ohne Nachtrag-Nr.
      if (r.diff > 0 && !r.nachtragNr) {
        offenNachtrag += r.diff * (r.ep || 0);
      }

      // “abrechenbar”: tutto ist * ep (placeholder finché non c’è Abschlag)
      abrechenbar += (r.ist || 0) * (r.ep || 0);
    }

    return { sollSum, istSum, offenNachtrag, abrechenbar };
  }, [rows]);

  const badge = (st: LinkRow["status"]) => {
    const base: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 12,
      border: "1px solid",
      whiteSpace: "nowrap",
    };

    if (st === "OK")
      return (
        <span style={{ ...base, background: "#ECFDF3", borderColor: "#BBF7D0", color: "#166534" }}>
          OK
        </span>
      );
    if (st === "UEBERMASS")
      return (
        <span style={{ ...base, background: "#FEF3C7", borderColor: "#FDE68A", color: "#92400E" }}>
          Übermaß
        </span>
      );
    return (
      <span style={{ ...base, background: "#FEE2E2", borderColor: "#FECACA", color: "#991B1B" }}>
        Fehlmenge
      </span>
    );
  };

  return (
    <div style={pageContainer}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
          RLC / 2. Mengenermittlung / Verknüpfung mit Nachträgen & Abrechnung
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>
          Verknüpfung mit Nachträgen & Abrechnung
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: "#4B5563" }}>
          Mengenermittlung → LV-Positionen → Nachträge → Abschlagsrechnungen
        </div>
        {project && (
          <div style={{ marginTop: 6, fontSize: 13, color: "#4B5563" }}>
            <b>{project.code}</b> — {project.name}
            {project.client ? ` • ${project.client}` : ""}
            {project.place ? ` • ${project.place}` : ""}
          </div>
        )}
      </div>

      {/* KPI row (stile AufmassEditor: semplice, pulito) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Kpi label="Soll (Summe)" value={num(kpi.sollSum, 3)} />
        <Kpi label="Ist (Summe)" value={num(kpi.istSum, 3)} />
        <Kpi label="Offene Nachträge (€)" value={fmtEUR(kpi.offenNachtrag)} />
        <Kpi label="Abrechenbar (€)" value={fmtEUR(kpi.abrechenbar)} />
      </div>

      <section style={card}>
        <div style={cardTitleRow}>
          <div>
            <div style={cardTitle}>Positionen (Soll/Ist, Nachtrag, Abschlag)</div>
            <div style={cardHint}>
              Daten kommen aktuell aus Aufmaß (localStorage) + Nachträge (localStorage). Server optional.
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>
            {loading ? "Lädt…" : `${rows.length} Zeile(n)`}
          </div>
        </div>

        <div style={toolbar}>
          <button style={btn} onClick={() => void load()} disabled={loading}>
            Laden
          </button>

          <button
            style={btn}
            disabled={selectedIds.length === 0}
            onClick={() => alert("Freigeben: API-Endpunkt fehlt noch (TODO).")}
          >
            Freigeben
          </button>

          <button
            style={btn}
            disabled={selectedIds.length === 0}
            onClick={() =>
              alert(
                "Als Nachtrag anlegen: Öffne den Nachträge-Editor (falls du ihn routest) oder implementiere API.\n\nTipp: Route z.B. /mengenermittlung/nachtraege"
              )
            }
          >
            Als Nachtrag anlegen
          </button>

          <button
            style={btn}
            disabled={selectedIds.length === 0}
            onClick={() => alert("In Abschlag übernehmen: API-Endpunkt fehlt noch (TODO).")}
          >
            In Abschlag übernehmen
          </button>

          <div style={{ flex: 1 }} />

          <button style={btn} onClick={() => toggleAll(true)} disabled={!rows.length}>
            Alle wählen
          </button>
          <button style={btn} onClick={() => toggleAll(false)} disabled={!rows.length}>
            Auswahl löschen
          </button>

          <button
            style={btnPrimary}
            onClick={() => navigate("/mengenermittlung/aufmasseditor")}
            title="Zurück zum Aufmaß-Editor"
          >
            ↩︎ Aufmaß-Editor
          </button>
        </div>

        {err && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #FECACA",
              background: "#FEF2F2",
              color: "#991B1B",
              fontSize: 13,
            }}
          >
            {err}
          </div>
        )}

        <div
          style={{
            marginTop: 10,
            borderRadius: 10,
            border: "1px solid #E5E7EB",
            overflow: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedIds.length === rows.length}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th style={th}>LV-Pos</th>
                <th style={th}>Kurztext</th>
                <th style={th}>Einheit</th>
                <th style={th}>Soll</th>
                <th style={th}>Ist</th>
                <th style={th}>Diff</th>
                <th style={th}>Status</th>
                <th style={th}>EP (€)</th>
                <th style={th}>Nachtrag</th>
                <th style={th}>Abschlag</th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td style={{ ...td, color: "#6B7280" }} colSpan={11}>
                    Keine Daten. Bitte im Aufmaß-Editor speichern oder „Laden“ drücken.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} style={{ background: "#FFFFFF" }}>
                    <td style={td}>
                      <input
                        type="checkbox"
                        checked={!!sel[r.id]}
                        onChange={(e) => toggleOne(r.id, e.target.checked)}
                      />
                    </td>

                    <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 600 }}>
                      {r.lvPos}
                    </td>

                    <td style={td}>{r.text}</td>

                    <td style={{ ...td, whiteSpace: "nowrap" }}>{r.unit}</td>

                    <td style={{ ...td, whiteSpace: "nowrap" }}>{num(r.soll, 3)}</td>

                    <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700 }}>
                      {num(r.ist, 3)}
                    </td>

                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {num(r.diff, 3)}
                    </td>

                    <td style={td}>{badge(r.status)}</td>

                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {num(r.ep, 2)} €
                    </td>

                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {r.nachtragNr ? (
                        <span title={r.nachtragStatus || ""}>
                          NT {r.nachtragNr}{" "}
                          {typeof r.nachtragTotal === "number"
                            ? `(${fmtEUR(r.nachtragTotal)})`
                            : ""}
                        </span>
                      ) : (
                        <span style={{ color: "#6B7280" }}>-</span>
                      )}
                    </td>

                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {typeof r.abschlagNr === "number" ? `#${r.abschlagNr}` : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#6B7280" }}>
          Hinweis: Derzeit ist die Verknüpfung nach LV-Pos (pos) → Nachtrag.lvPos umgesetzt (localStorage). Abschläge sind noch TODO.
        </div>
      </section>
    </div>
  );
}

/* ================= SMALL UI PARTS ================= */

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: 12,
        border: "1px solid #E5E7EB",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
        padding: "0.9rem 1rem",
      }}
    >
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>
        {value}
      </div>
    </div>
  );
}
