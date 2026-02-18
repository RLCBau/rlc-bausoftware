import React from "react";
import { useProject } from "../../store/useProject";

/* ===== Types ===== */
type Row = { id: string; pos: string; text: string; qty: number; unit: string };
type Version = {
  id: string;
  projectId: string;
  createdAt: number;
  user: string;
  note?: string;
  data: Row[];
};

const API_BASE =
  (import.meta as any)?.env?.VITE_API_URL ||
  (import.meta as any)?.env?.VITE_BACKEND_URL ||
  "http://localhost:4000";

const rid = () =>
  (crypto as any)?.randomUUID ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random()}`;
const fmt = (ts: number) => new Date(ts).toLocaleString();

/* ===== API ===== */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

/* ===== Normalizer (robust) ===== */
function normalizeRows(input: any): Row[] {
  const arr = Array.isArray(input) ? input : [];
  return arr.map((x: any, i: number) => {
    const id =
      String(x?.id || x?.rowId || x?.uuid || "") ||
      `${Date.now()}-${i}-${Math.random()}`;

    const pos = String(x?.pos || x?.position || x?.nr || x?.Positionsnummer || "").trim();
    const text = String(x?.text || x?.kurztext || x?.Kurztext || x?.langtext || x?.Text || "").trim();

    // qty: prova ist/soll/qty/menge/quantity
    const qtyRaw =
      x?.qty ?? x?.menge ?? x?.quantity ?? x?.ist ?? x?.Ist ?? x?.soll ?? x?.Soll ?? 0;

    const qty = Number(qtyRaw || 0);

    const unit = String(x?.unit || x?.einheit || x?.Einheit || x?.uom || "").trim();

    return { id, pos, text, qty: Number.isFinite(qty) ? qty : 0, unit };
  });
}

/* ===== Diff ===== */
function diff(a: Row[], b: Row[]) {
  const A = new Map(a.map((x) => [x.id, x]));
  const B = new Map(b.map((x) => [x.id, x]));
  const added: Row[] = [];
  const removed: Row[] = [];
  const changed: { before: Row; after: Row }[] = [];

  for (const [id, v] of B) if (!A.has(id)) added.push(v);
  for (const [id, v] of A) if (!B.has(id)) removed.push(v);

  for (const [id, oldV] of A) {
    const nv = B.get(id);
    if (!nv) continue;
    if (
      oldV.qty !== nv.qty ||
      oldV.text !== nv.text ||
      oldV.unit !== nv.unit ||
      oldV.pos !== nv.pos
    ) {
      changed.push({ before: oldV, after: nv });
    }
  }
  return { added, removed, changed };
}

/* ===== Page ===== */
export default function HistoriePage() {
  const store: any = useProject();

  // "id" può essere UUID, "name" è BA-2025-DEMO (come nel tuo header)
  const projectName =
    store?.project?.name || store?.project?.title || store?.activeProjectName || "BA-2025-DEMO";

  const projectIdFromStore =
    store?.projectId ||
    store?.activeProjectId ||
    store?.selectedProjectId ||
    store?.project?.id ||
    store?.project?.projectId ||
    "";

  // per chiamate API uso sempre quello che arriva dallo store (anche se UUID),
  // perché il backend ormai risolve e salva nella cartella canonica.
  const [projectId, setProjectId] = React.useState<string>(projectIdFromStore || "BA-2025-DEMO");

  // label mostrata all’utente: BA-2025-DEMO
  const [projectLabel, setProjectLabel] = React.useState<string>(projectName || "BA-2025-DEMO");

  const [versions, setVersions] = React.useState<Version[]>([]);
  const [current, setCurrent] = React.useState<Row[]>([]);
  const [sel, setSel] = React.useState<string[]>([]);
  const [compare, setCompare] = React.useState<{ left?: Version; right?: Version } | null>(null);
  const [note, setNote] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (projectIdFromStore && projectIdFromStore !== projectId) setProjectId(projectIdFromStore);
    if (projectName && projectName !== projectLabel) setProjectLabel(projectName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdFromStore, projectName]);

  async function loadAll() {
    const pid = String(projectId || "").trim();
    if (!pid) {
      setError("Projekt-ID fehlt");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [hist, cur] = await Promise.all([
        api<{ ok: boolean; items: Version[]; resolvedProjectId?: string }>(
          `/api/historie?projectId=${encodeURIComponent(pid)}`
        ),
        api<{ ok: boolean; rows: any[]; resolvedProjectId?: string }>(
          `/api/historie/current?projectId=${encodeURIComponent(pid)}`
        ),
      ]);

      setVersions(hist.items || []);
      setCurrent(normalizeRows(cur.rows || []));

      // se il backend ci dice “BA-2025-DEMO” come resolved, mostralo come label
      if (hist.resolvedProjectId) setProjectLabel(hist.resolvedProjectId);
    } catch (e) {
      console.warn("Offline fallback", e);
      setError("Offline gespeichert (LS)");

      const lsHist = localStorage.getItem(`sollist-hist:${pid}`);
      const lsCur = localStorage.getItem(`sollist:${pid}`);

      setVersions(lsHist ? JSON.parse(lsHist) : []);
      setCurrent(lsCur ? JSON.parse(lsCur) : []);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  React.useEffect(() => {
    const pid = String(projectId || "").trim();
    if (!pid) return;
    localStorage.setItem(`sollist-hist:${pid}`, JSON.stringify(versions));
  }, [projectId, versions]);

  React.useEffect(() => {
    const pid = String(projectId || "").trim();
    if (!pid) return;
    localStorage.setItem(`sollist:${pid}`, JSON.stringify(current));
  }, [projectId, current]);

  async function saveSnapshot() {
    const pid = String(projectId || "").trim();
    if (!pid) return alert("Projekt-ID fehlt");

    const v: Version = {
      id: rid(),
      projectId: pid,
      createdAt: Date.now(),
      user: "Bauleiter",
      note: note?.trim() || undefined,
      data: JSON.parse(JSON.stringify(current)),
    };

    setVersions((prev) => [v, ...prev]);
    setNote("");

    try {
      await api(`/api/historie`, { method: "POST", body: JSON.stringify(v) });
      setError(null);
    } catch {
      setError("Offline gespeichert (LS)");
    }
  }

  async function saveCurrent() {
    const pid = String(projectId || "").trim();
    if (!pid) return alert("Projekt-ID fehlt");
    try {
      await api(`/api/historie/current?projectId=${encodeURIComponent(pid)}`, {
        method: "POST",
        body: JSON.stringify({ rows: current }),
      });
      setError(null);
      alert("Soll-Ist gespeichert");
    } catch (e) {
      console.error(e);
      alert("Fehler beim Speichern");
    }
  }

  async function restoreVersion(v: Version) {
    try {
      await api(`/api/historie/restore`, { method: "POST", body: JSON.stringify(v) });
      setCurrent(v.data || []);
      alert("Version erfolgreich wiederhergestellt.");
    } catch (e) {
      console.error(e);
      alert("Fehler beim Wiederherstellen");
    }
  }

  async function deleteVersion(v: Version) {
    const pid = String(projectId || "").trim();
    if (!pid) return;

    if (!confirm("Version wirklich löschen?")) return;

    // optimistic
    setVersions((prev) => prev.filter((x) => x.id !== v.id));
    setSel((prev) => prev.filter((id) => id !== v.id));

    try {
      await api(`/api/historie/${encodeURIComponent(v.id)}?projectId=${encodeURIComponent(pid)}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.warn("Delete failed (offline?)", e);
      setError("Offline: gelöscht nur lokal (LS)");
    }
  }

  function toggleSelect(id: string) {
    setSel((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length === 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  function openCompare() {
    if (sel.length < 2) return alert("Bitte 2 Versionen auswählen");
    const [a, b] = sel;
    const left = versions.find((v) => v.id === a)!;
    const right = versions.find((v) => v.id === b)!;
    setCompare({ left, right });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}>
      {/* LEFT */}
      <div className="card" style={{ padding: 14 }}>
        <h3 style={{ margin: 0 }}>Historie / Soll-Ist-Versionierung</h3>

        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>Projekt</label>
          {/* Mostra nome progetto, non UUID */}
          <input value={projectLabel} readOnly />
          {/* ID tecnico (UUID) nascosto ma usato per API */}
          <input value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ display: "none" }} />
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>Notiz (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z.B. Stand nach Ortsbesichtigung"
          />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <button className="btn" onClick={saveSnapshot} disabled={loading}>
            Version speichern
          </button>
          <button className="btn" onClick={saveCurrent} disabled={loading}>
            Speichern
          </button>
          <button className="btn" onClick={openCompare} disabled={sel.length < 2}>
            Vergleichen
          </button>
          <button className="btn" onClick={loadAll} disabled={loading}>
            Neu laden
          </button>
        </div>

        {loading && <div style={{ color: "var(--muted)", marginTop: 8 }}>Laden…</div>}
        {error && <div style={{ color: "crimson", marginTop: 8 }}>{error}</div>}

        <div
          style={{
            marginTop: 10,
            maxHeight: 420,
            overflow: "auto",
            border: "1px solid var(--line)",
            borderRadius: 8,
          }}
        >
          {versions.length === 0 && (
            <div style={{ padding: 10, color: "var(--muted)" }}>Keine Versionen</div>
          )}

          {versions.map((v) => (
            <div
              key={v.id}
              style={{
                padding: 10,
                borderBottom: "1px solid var(--line)",
                background: sel.includes(v.id) ? "rgba(0,0,0,.05)" : undefined,
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                alignItems: "center",
                gap: 8,
              }}
            >
              <input
                type="checkbox"
                checked={sel.includes(v.id)}
                onChange={() => toggleSelect(v.id)}
              />

              <div>
                <div>
                  <strong>{fmt(v.createdAt)}</strong> · {v.user}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{v.note || "—"}</div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => restoreVersion(v)}>
                  Wiederherstellen
                </button>
                <button className="btn" onClick={() => deleteVersion(v)}>
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT */}
      <div className="card" style={{ padding: 14 }}>
        <h4 style={{ marginTop: 0 }}>Aktuelle Soll-Ist-Daten</h4>
        <SimpleTable rows={current} />

        {compare && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: 0 }}>
              Vergleich • {fmt(compare.left!.createdAt)} ↔ {fmt(compare.right!.createdAt)}
            </h4>
            <DiffView a={compare.left!.data} b={compare.right!.data} />
            <div style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => setCompare(null)}>
                Schließen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== UI Components ===== */
function SimpleTable({ rows }: { rows: Row[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <Th>Pos</Th>
          <Th>Text</Th>
          <Th style={{ textAlign: "right" }}>Menge</Th>
          <Th>Einheit</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <Td colSpan={4} style={{ color: "var(--muted)" }}>
              —
            </Td>
          </tr>
        ) : (
          rows.map((r) => (
            <tr key={r.id}>
              <Td>{r.pos}</Td>
              <Td>{r.text}</Td>
              <Td style={{ textAlign: "right" }}>{r.qty}</Td>
              <Td>{r.unit}</Td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function DiffView({ a, b }: { a: Row[]; b: Row[] }) {
  const d = diff(a, b);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
      <Card title={`Neu (+${d.added.length})`}>
        {d.added.length ? d.added.map((x) => <Line key={x.id} text={`${x.pos} ${x.text}`} color="#1a7f37" />) : <Empty />}
      </Card>
      <Card title={`Entfernt (${d.removed.length})`}>
        {d.removed.length ? d.removed.map((x) => <Line key={x.id} text={`${x.pos} ${x.text}`} color="#b42318" />) : <Empty />}
      </Card>
      <Card title={`Geändert (${d.changed.length})`}>
        {d.changed.length ? d.changed.map((x) => (
          <Line key={x.after.id} text={`${x.after.pos} ${x.after.text}: ${x.before.qty} → ${x.after.qty}`} color="#956400" />
        )) : <Empty />}
      </Card>
    </div>
  );
}

function Card({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}
function Line({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ fontSize: 13, padding: "4px 6px", borderRadius: 6, background: `${color}20`, color }}>
      {text}
    </div>
  );
}
function Empty() { return <div style={{ color: "var(--muted)" }}>—</div>; }
function Th(p: any) { return <th {...p} style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)", textAlign: "left" }} />; }
function Td(p: any) { return <td {...p} style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)", verticalAlign: "top" }} />; }
