import React from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";

const API =
  (import.meta as any)?.env?.VITE_API_URL ||
  (import.meta as any)?.env?.VITE_BACKEND_URL ||
  "http://localhost:4000";

/* ================= TYPES ================= */

type LinkRow = {
  id: string;
  lvPos: string;
  text: string;
  unit: string;

  soll: number;
  ist: number;
  ep: number;

  diff: number;
  status: "OK" | "UEBERMASS" | "FEHLMENGE" | string;

  nachtragNr?: string | null;
  nachtragStatus?: string | null;
  nachtragTotal?: number | null;

  abschlagNr?: number | null;
};

type KPI = {
  sollSum: number;
  istSum: number;
  offenNachtragEUR: number;
  abrechenbarEUR: number;
};

type ListResponse = {
  ok: boolean;
  items: LinkRow[];
  kpi?: KPI;
  sourceSollIstFile?: string;
  error?: string;
};

type AbschlagResponse = {
  ok: boolean;
  nr?: number;
  total?: number;
  error?: string;
};

/* ================= STYLES ================= */

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
  flexWrap: "wrap",
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
  "€ " +
  (Number.isFinite(v)
    ? v.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "0,00");

const num = (v: any, d = 3) => {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString("de-DE", { maximumFractionDigits: d })
    : "0";
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const base = String(API || "").replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(text || `Server-Fehler (${res.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    // se server risponde plain text
    return text as any as T;
  }
}

/* ================= COMPONENT ================= */

export default function VerknuepfungNachtraegeAbrechnung() {
  const navigate = useNavigate();
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();

  // IMPORTANT: per la Verknüpfung usiamo il project CODE come folder key (data/projects/<code>)
  const projectKey = (project?.code || "").trim();

  const [rows, setRows] = React.useState<LinkRow[]>([]);
  const [kpi, setKpi] = React.useState<KPI>({
    sollSum: 0,
    istSum: 0,
    offenNachtragEUR: 0,
    abrechenbarEUR: 0,
  });

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [sourceFile, setSourceFile] = React.useState<string | null>(null);

  // selection by lvPos
  const [sel, setSel] = React.useState<Record<string, boolean>>({});

  const selectedLvPos = React.useMemo(
    () => Object.keys(sel).filter((k) => sel[k]),
    [sel]
  );

  const canAct = !!projectKey && selectedLvPos.length > 0 && !loading;

  function toggleAll(v: boolean) {
    const next: Record<string, boolean> = {};
    if (v) rows.forEach((r) => (next[r.lvPos] = true));
    setSel(next);
  }

  function toggleOne(lvPos: string, v: boolean) {
    setSel((s0) => ({ ...s0, [lvPos]: v }));
  }

  async function load() {
    if (!projectKey) {
      setRows([]);
      setSel({});
      setErr("Kein Projekt gewählt.");
      setInfo(null);
      setSourceFile(null);
      return;
    }

    setLoading(true);
    setErr(null);
    setInfo(null);
    setSourceFile(null);

    try {
      let data: ListResponse | null = null;

      try {
        data = await apiJson<ListResponse>(
          `/api/verknuepfung/list/${encodeURIComponent(projectKey)}`
        );
      } catch {
        data = await apiJson<ListResponse>(
          `/api/verknuepfung/list?projectKey=${encodeURIComponent(projectKey)}`
        );
      }

      if (!data || data.ok === false) {
        throw new Error(data?.error || "Fehler beim Laden (ok=false)");
      }

      const items = Array.isArray(data.items) ? data.items : [];
      setRows(items);
      setSel({});
      setSourceFile(data.sourceSollIstFile || null);

      if (data.kpi) {
        setKpi(data.kpi);
      } else {
        let sollSum = 0,
          istSum = 0,
          offenNachtragEUR = 0,
          abrechenbarEUR = 0;

        for (const r of items) {
          sollSum += Number(r.soll || 0);
          istSum += Number(r.ist || 0);
          if (Number(r.diff || 0) > 0 && !r.nachtragNr) {
            offenNachtragEUR += Number(r.diff || 0) * Number(r.ep || 0);
          }
          abrechenbarEUR += Number(r.ist || 0) * Number(r.ep || 0);
        }
        setKpi({ sollSum, istSum, offenNachtragEUR, abrechenbarEUR });
      }
    } catch (e: any) {
      const msg = e?.message || "Fehler beim Laden";
      setErr(`${msg}\n\nAPI: ${String(API)}`);
      setRows([]);
      setSel({});
      setSourceFile(null);
      setKpi({
        sollSum: 0,
        istSum: 0,
        offenNachtragEUR: 0,
        abrechenbarEUR: 0,
      });
    } finally {
      setLoading(false);
    }
  }

  async function freigeben() {
    if (!canAct) return;
    setLoading(true);
    setErr(null);
    setInfo(null);
    try {
      await apiJson(`/api/verknuepfung/freigeben/${encodeURIComponent(projectKey)}`, {
        method: "POST",
        body: JSON.stringify({ lvPos: selectedLvPos }),
      });
      await load();
      setInfo(`Freigabe gesetzt für ${selectedLvPos.length} Position(en).`);
    } catch (e: any) {
      setErr((e?.message || "Fehler beim Freigeben") + `\n\nAPI: ${String(API)}`);
    } finally {
      setLoading(false);
    }
  }

  async function alsNachtragAnlegen() {
    if (!canAct) return;
    setLoading(true);
    setErr(null);
    setInfo(null);
    try {
      await apiJson(`/api/verknuepfung/nachtrag/${encodeURIComponent(projectKey)}`, {
        method: "POST",
        body: JSON.stringify({ lvPos: selectedLvPos }),
      });
      await load();
      setInfo(`Nachtrag erstellt für ${selectedLvPos.length} Position(en).`);
      navigate("/kalkulation/nachtraege");
    } catch (e: any) {
      setErr(
        (e?.message || "Fehler beim Erstellen der Nachträge") + `\n\nAPI: ${String(API)}`
      );
    } finally {
      setLoading(false);
    }
  }

  async function inAbschlagUebernehmen() {
    if (!canAct) return;

    const raw = prompt("Abschlagsrechnung Nummer (leer = neue):", "");
    const n = raw ? Number(String(raw).trim()) : NaN;
    const nr = Number.isFinite(n) && n > 0 ? n : null;

    setLoading(true);
    setErr(null);
    setInfo(null);

    try {
      const resp = await apiJson<AbschlagResponse>(
        `/api/verknuepfung/abschlag/${encodeURIComponent(projectKey)}`,
        {
          method: "POST",
          body: JSON.stringify({ lvPos: selectedLvPos, nr }),
        }
      );

      if (!resp || resp.ok === false) {
        throw new Error(resp?.error || "Fehler (ok=false)");
      }

      const usedNr = typeof resp.nr === "number" ? resp.nr : nr ?? undefined;

      // Flag per la pagina Abschlagsrechnungen (auto-load / focus)
      try {
        localStorage.setItem(
          `rlc_abschlaege_focus_${projectKey}`,
          JSON.stringify({ nr: usedNr ?? null, ts: Date.now() })
        );
      } catch {}

      await load();

      setInfo(
        `In Abschlag übernommen: ${selectedLvPos.length} Position(en)` +
          (usedNr ? ` → Abschlagsrechnung #${usedNr}` : "")
      );

      // Vai alla lista Buchhaltung
      navigate("/buchhaltung/abschlagsrechnungen");
    } catch (e: any) {
      setErr(
        (e?.message || "Fehler beim Übernehmen in Abschlag") + `\n\nAPI: ${String(API)}`
      );
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  const badge = (st: string) => {
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
        <span
          style={{
            ...base,
            background: "#ECFDF3",
            borderColor: "#BBF7D0",
            color: "#166534",
          }}
        >
          OK
        </span>
      );
    if (st === "UEBERMASS")
      return (
        <span
          style={{
            ...base,
            background: "#FEF3C7",
            borderColor: "#FDE68A",
            color: "#92400E",
          }}
        >
          Übermaß
        </span>
      );
    if (st === "FEHLMENGE")
      return (
        <span
          style={{
            ...base,
            background: "#FEE2E2",
            borderColor: "#FECACA",
            color: "#991B1B",
          }}
        >
          Fehlmenge
        </span>
      );

    return (
      <span style={{ ...base, background: "#F3F4F6", borderColor: "#E5E7EB" }}>
        {st || "—"}
      </span>
    );
  };

  const allChecked = rows.length > 0 && selectedLvPos.length === rows.length;

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

      {/* KPI */}
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
        <Kpi label="Offene Nachträge (€)" value={fmtEUR(kpi.offenNachtragEUR)} />
        <Kpi label="Abrechenbar (€)" value={fmtEUR(kpi.abrechenbarEUR)} />
      </div>

      <section style={card}>
        <div style={cardTitleRow}>
          <div>
            <div style={cardTitle}>Positionen (Soll/Ist, Nachtrag, Abschlag)</div>
            <div style={cardHint}>
              Diese Seite liest <b>soll-ist.json</b> und erzeugt daraus Nachträge/Abschläge.
              {sourceFile ? (
                <span style={{ marginLeft: 8 }}>
                  Quelle: <span style={{ color: "#6B7280" }}>{sourceFile}</span>
                </span>
              ) : null}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>
            {loading ? "Lädt…" : `${rows.length} Zeile(n)`}
          </div>
        </div>

        <div style={toolbar}>
          <button style={btn} onClick={() => void load()} disabled={loading || !projectKey}>
            Laden
          </button>

          <button style={btn} disabled={!canAct} onClick={() => void freigeben()}>
            Freigeben
          </button>

          <button style={btn} disabled={!canAct} onClick={() => void alsNachtragAnlegen()}>
            Als Nachtrag anlegen
          </button>

          <button style={btn} disabled={!canAct} onClick={() => void inAbschlagUebernehmen()}>
            In Abschlag übernehmen
          </button>

          <div style={{ flex: 1 }} />

          <button
            style={btn}
            onClick={() => navigate("/buchhaltung/abschlagsrechnungen")}
            disabled={!projectKey || loading}
          >
            Abschlagsrechnungen
          </button>

          <button style={btn} onClick={() => toggleAll(true)} disabled={!rows.length || loading}>
            Alle wählen
          </button>

          <button style={btn} onClick={() => toggleAll(false)} disabled={!rows.length || loading}>
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

        {info && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #BBF7D0",
              background: "#ECFDF3",
              color: "#166534",
              fontSize: 13,
              whiteSpace: "pre-wrap",
            }}
          >
            {info}
          </div>
        )}

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
              whiteSpace: "pre-wrap",
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
                    checked={allChecked}
                    onChange={(e) => toggleAll(e.target.checked)}
                    disabled={!rows.length}
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
                    Keine Daten. Entweder ist soll-ist.json leer/nicht vorhanden oder noch nicht erzeugt.
                  </td>
                </tr>
              ) : (
                rows.map((r0) => (
                  <tr key={r0.id} style={{ background: "#FFFFFF" }}>
                    <td style={td}>
                      <input
                        type="checkbox"
                        checked={!!sel[r0.lvPos]}
                        onChange={(e) => toggleOne(r0.lvPos, e.target.checked)}
                      />
                    </td>

                    <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 600 }}>{r0.lvPos}</td>
                    <td style={td}>{r0.text}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{r0.unit}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{num(r0.soll, 3)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700 }}>{num(r0.ist, 3)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700 }}>{num(r0.diff, 3)}</td>
                    <td style={td}>{badge(String(r0.status || ""))}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{num(r0.ep, 2)} €</td>

                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {r0.nachtragNr ? (
                        <span title={r0.nachtragStatus || ""}>
                          NT {r0.nachtragNr}
                          {typeof r0.nachtragTotal === "number" ? ` (${fmtEUR(r0.nachtragTotal)})` : ""}
                        </span>
                      ) : (
                        <span style={{ color: "#6B7280" }}>-</span>
                      )}
                    </td>

                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {typeof r0.abschlagNr === "number" ? `#${r0.abschlagNr}` : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#6B7280" }}>
          Hinweis: Voraussetzung ist, dass <b>soll-ist.json</b> vorher im Aufmaßvergleich (oder per Server-Import)
          erzeugt/gespeichert wurde.
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
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{value}</div>
    </div>
  );
}
