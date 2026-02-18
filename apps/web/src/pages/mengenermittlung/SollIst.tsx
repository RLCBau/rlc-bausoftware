import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useProject } from "../../store/useProject";

/* ========== tipi ========== */
interface Row {
  pos: string;
  text: string;
  unit: string;
  soll: number;
  ist: number;
  ep: number;
}

type ParsedItem = {
  pos?: string;
  type?: string;
  descr?: string;
  kurztext?: string;
  text?: string;
  unit?: string;
  einheit?: string;
  qty?: number | string;
  lvMenge?: number | string;
  ist?: number | string;
  ep?: number | string;
};

type HistoryEntry = {
  ts: number;
  count: number;
};

/* ========== util ========== */
const fmtEUR = (v: number) => `€ ${isFinite(v) ? v.toFixed(2) : "0.00"}`;
const toNum = (v: any) =>
  typeof v === "number"
    ? v
    : Number(String(v ?? "").replace(",", ".").trim()) || 0;

const API_BASE =
  (import.meta as any)?.env?.VITE_API_URL || "http://localhost:4000/api";

/* ====== AUFMASS.JSON format (server: /api/aufmass/aufmass/:projectId) ====== */
type AufmassJsonRow = {
  pos: string;
  text: string;
  unit: string;
  soll: number;
  ist: number;
  ep: number;
};

function fromAufmassJson(rows: AufmassJsonRow[]): Row[] {
  return (rows || []).map((r) => ({
    pos: String(r.pos ?? ""),
    text: String(r.text ?? ""),
    unit: String(r.unit ?? "m"),
    soll: Number(r.soll ?? 0),
    ist: Number(r.ist ?? 0),
    ep: Number(r.ep ?? 0),
  }));
}

function toAufmassJson(rows: Row[]): AufmassJsonRow[] {
  return (rows || []).map((r) => ({
    pos: String(r.pos ?? ""),
    text: String(r.text ?? ""),
    unit: String(r.unit ?? "m"),
    soll: Number(r.soll ?? 0),
    ist: Number(r.ist ?? 0),
    ep: Number(r.ep ?? 0),
  }));
}

/* ========== piccolo grafico SVG (nessuna dipendenza) ========== */
function SollIstChart({ rows }: { rows: Row[] }) {
  const W = 920;
  const H = 220;
  const PAD = 30;

  const data = rows.map((r) => ({ soll: r.soll, ist: r.ist, label: r.pos }));
  const maxV = Math.max(1, ...data.map((d) => Math.max(d.soll, d.ist)));
  const barW = Math.max(8, (W - PAD * 2) / Math.max(data.length, 1) - 6);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="Soll-Ist Balkendiagramm"
    >
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#ccc" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#ccc" />

      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = H - PAD - (H - PAD * 2) * t;
        const v = (maxV * t).toFixed(0);
        return (
          <g key={t}>
            <line x1={PAD} x2={W - PAD} y1={y} y2={y} stroke="#f1f1f1" />
            <text x={6} y={y + 4} fontSize="10" fill="#777">
              {v}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const x0 = PAD + i * (barW * 2 + 6) + 2;
        const hSoll = (H - PAD * 2) * (d.soll / maxV);
        const hIst = (H - PAD * 2) * (d.ist / maxV);
        return (
          <g key={i}>
            <rect
              x={x0}
              y={H - PAD - hSoll}
              width={barW}
              height={hSoll}
              fill="#9ec5fe"
            />
            <rect
              x={x0 + barW}
              y={H - PAD - hIst}
              width={barW}
              height={hIst}
              fill="#f3a7a7"
            />
            <text
              x={x0 + barW}
              y={H - 8}
              fontSize="9"
              textAnchor="middle"
              fill="#444"
            >
              {d.label}
            </text>
          </g>
        );
      })}

      <g transform={`translate(${W - 170},${PAD - 8})`}>
        <rect x={0} y={0} width={12} height={12} fill="#9ec5fe" />
        <text x={18} y={10} fontSize="12" fill="#333">
          Soll
        </text>
        <rect x={70} y={0} width={12} height={12} fill="#f3a7a7" />
        <text x={88} y={10} fontSize="12" fill="#333">
          Ist
        </text>
      </g>
    </svg>
  );
}

/* ========== componente principale ========== */
export default function SollIst() {
  const { currentProject } = useProject() as any;

  const projectId: string | undefined = currentProject?.id;
  const projectKey: string | undefined =
    currentProject?.code || currentProject?.id || undefined;

  const storageKey: string | null = projectKey ? `sollist-${projectKey}` : null;

  const [rows, setRows] = useState<Row[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const fileAufmassRef = useRef<HTMLInputElement>(null);
  const filePdfRef = useRef<HTMLInputElement>(null);
  const fileJsonRef = useRef<HTMLInputElement>(null);

  /* ========== LOAD da localStorage per progetto ========== */
  useEffect(() => {
    if (!storageKey) return;

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed: Row[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRows(parsed);
          return;
        }
      }
    } catch {
      // ignora
    }

    setRows([
      { pos: "001.001", text: "Neue Position", unit: "m", soll: 0, ist: 0, ep: 0 },
    ]);
  }, [storageKey]);

  /* ========== SAVE su localStorage ========== */
  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(rows));
    } catch {
      // ignore
    }
  }, [rows, storageKey]);

  /* ========== LOAD / SAVE su SERVER (STESSO FILE di AufmassEditor) ========== */

  const loadFromServer = useCallback(async () => {
    if (!projectKey) return;

    try {
      setBusy(true);

      // stesso endpoint usato dall’AufmassEditor nuovo
      const url = `${API_BASE}/aufmass/aufmass/${encodeURIComponent(projectKey)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API ${url} -> HTTP ${res.status}`);

      const data = await res.json();
      const serverRows = Array.isArray(data?.rows) ? (data.rows as AufmassJsonRow[]) : [];
      setRows(fromAufmassJson(serverRows));

      // aufmass.json non ha history: teniamo history “leggera” locale
      setHistory((prev) => {
        if (!serverRows.length) return prev;
        const snap = { ts: Date.now(), count: serverRows.length };
        const next = [snap, ...prev].slice(0, 20);
        return next;
      });
    } catch (err) {
      console.error(err);
      alert("Aufmaßdaten vom Server laden fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }, [projectKey]);

  useEffect(() => {
    if (!projectKey) return;
    loadFromServer();
  }, [projectKey, loadFromServer]);

  async function saveToServer() {
    if (!projectKey) {
      alert("Kein Projekt ausgewählt. Bitte zuerst ein Projekt wählen.");
      return;
    }
    try {
      setBusy(true);

      // salva nello stesso file: data/projects/<projectKey>/aufmass.json
      const url = `${API_BASE}/aufmass/aufmass/${encodeURIComponent(projectKey)}`;
      const payloadRows = toAufmassJson(rows);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payloadRows }),
      });

      if (!res.ok) throw new Error(`API ${url} -> HTTP ${res.status}`);

      // snapshot locale per UI “Verlauf”
      setHistory((prev) => {
        const snap = { ts: Date.now(), count: rows.length };
        const next = [snap, ...prev].slice(0, 20);
        return next;
      });
    } catch (err) {
      console.error(err);
      alert("Aufmaßdaten am Server speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  /* ========== somme ========== */
  const sumSoll = useMemo(() => rows.reduce((a, r) => a + r.soll, 0), [rows]);
  const sumIst = useMemo(() => rows.reduce((a, r) => a + r.ist, 0), [rows]);
  const sumDiff = useMemo(() => sumSoll - sumIst, [sumSoll, sumIst]);
  const sumEUR = useMemo(() => rows.reduce((a, r) => a + r.ist * r.ep, 0), [rows]);

  /* ========== mutazioni riga ========== */
  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        pos: `001.${String(prev.length + 1).padStart(3, "0")}`,
        text: "Neue Position",
        unit: "m",
        soll: 0,
        ist: 0,
        ep: 0,
      },
    ]);

  const delRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  /* ========== helper CSV (Aufmaß-Datei) ========== */
  function parseCsvWithHeader(text: string): ParsedItem[] {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return [];

    const sep = lines[0].includes(";") ? ";" : ",";
    const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
    const dataLines = lines.slice(1);

    return dataLines.map((line) => {
      const cols = line.split(sep).map((c) => c.replace(/^"(.*)"$/, "$1").trim());
      const item: ParsedItem = {};
      header.forEach((h, idx) => {
        const v = cols[idx];
        if (/^pos/.test(h)) item.pos = v;
        else if (/kurz|beschr|text/.test(h)) {
          item.descr = v;
          item.kurztext = v;
          item.text = v;
        } else if (/einheit|unit/.test(h)) item.unit = v;
        else if (/lv|soll/.test(h)) item.qty = v;
        else if (/ist|abgerechnet/.test(h)) item.ist = v;
        else if (/ep|preis/.test(h)) item.ep = v;
      });
      return item;
    });
  }

  /* ========== Aus Aufmaß laden (Datei) ========== */
  const pickAufmassFile = () => fileAufmassRef.current?.click();

  const onPickAufmassFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    try {
      setBusy(true);
      const text = await f.text();
      const items = parseCsvWithHeader(text);

      const mapped: Row[] = items.map((it, idx) => ({
        pos: it.pos || `AUF.${String(idx + 1).padStart(3, "0")}`,
        text:
          it.descr || it.kurztext || it.text || it.type || "Aufmaß-Position",
        unit: it.unit || it.einheit || "m",
        soll: toNum(it.qty ?? 0),
        ist: toNum(it.ist ?? 0),
        ep: toNum(it.ep ?? 0),
      }));

      setRows(mapped);
    } catch (err) {
      console.error(err);
      alert("Aufmaß-Import (Datei) fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  /* ========== Import aus LV (Projekt) – DB → /api/project-lv/:projectId ========== */
  async function importFromLV() {
    if (!projectId) {
      alert("Kein Projekt ausgewählt. Bitte zuerst ein Projekt wählen.");
      return;
    }

    try {
      setBusy(true);

      const url = `${API_BASE}/project-lv/${encodeURIComponent(projectId)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API ${url} -> HTTP ${res.status}`);

      const payload = await res.json();
      const list: ParsedItem[] = payload.items || [];

      if (!Array.isArray(list) || !list.length) {
        alert("Im LV wurden keine Positionen gefunden.");
        return;
      }

      const mapped: Row[] = list.map((it: any, idx: number) => ({
        pos: it.pos || it.position || `LV.${String(idx + 1).padStart(3, "0")}`,
        text: it.text || it.kurztext || it.descr || it.Kurztext || "LV-Position",
        unit: it.unit || it.einheit || it.Einheit || "m",
        soll: toNum(
          it.quantity ??
            it.qty ??
            it.menge ??
            it.lvMenge ??
            it.soll ??
            it.Soll ??
            0
        ),
        ist: 0,
        ep: toNum(it.ep ?? it.einzelpreis ?? it.preis ?? 0),
      }));

      setRows((prev) => {
        const map = new Map<string, Row>();
        prev.forEach((r) => map.set(r.pos, r));
        mapped.forEach((m) => {
          const ex = map.get(m.pos);
          if (ex) {
            map.set(m.pos, {
              ...ex,
              text: m.text || ex.text,
              unit: m.unit || ex.unit,
              soll: m.soll,
              ep: m.ep || ex.ep,
            });
          } else {
            map.set(m.pos, m);
          }
        });
        return Array.from(map.values());
      });
    } catch (err: any) {
      console.error(err);
      alert(
        `LV-Import fehlgeschlagen. Prüfe /api/project-lv/:projectId.\nDetails: ${
          err?.message || ""
        }`
      );
    } finally {
      setBusy(false);
    }
  }

  /* ========== Import aus PDF (Plan) ========== */
  const pickPdfFile = () => filePdfRef.current?.click();

  async function onPickPdfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    try {
      setBusy(true);
      const fd = new FormData();
      fd.append("file", f);
      fd.append("note", "Soll-Ist Import");
      fd.append("scale", "1");

      const url = `${API_BASE}/import/parse`;
      const res = await fetch(url, { method: "POST", body: fd }); // ✅ FIX
      if (!res.ok) throw new Error(`Import API ${res.status}`);
      const data = await res.json();
      const items: ParsedItem[] = data.items || [];

      const mapped: Row[] = items.map((it, idx) => ({
        pos: it.pos || `PDF.${String(idx + 1).padStart(3, "0")}`,
        text: it.descr || it.text || it.type || "PDF-Zeile",
        unit: it.unit || "m",
        soll: toNum(it.qty ?? 0),
        ist: 0,
        ep: 0,
      }));

      setRows((prev) => [...prev, ...mapped]);
    } catch (err) {
      console.error(err);
      alert("PDF-Import fehlgeschlagen. Prüfe /api/import/parse.");
    } finally {
      setBusy(false);
    }
  }

  /* ========== Laden von JSON-Datei (aufmass.json o array righe) ========== */
  const pickJsonFile = () => fileJsonRef.current?.click();

  async function onPickJsonFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    try {
      setBusy(true);
      const text = await f.text();
      const parsed: any = JSON.parse(text);

      // oggetto { rows: [...] } (aufmass.json wrapper)
      if (!Array.isArray(parsed) && parsed && typeof parsed === "object") {
        const objRows = Array.isArray(parsed.rows) ? parsed.rows : [];
        // può essere Row[] o AufmassJsonRow[]
        if (objRows.length && typeof objRows[0]?.soll !== "undefined") {
          setRows(fromAufmassJson(objRows as AufmassJsonRow[]));
          return;
        }
      }

      // direttamente array
      if (Array.isArray(parsed)) {
        // tenta come AufmassJsonRow
        if (parsed.length && typeof parsed[0]?.soll !== "undefined") {
          setRows(fromAufmassJson(parsed as AufmassJsonRow[]));
          return;
        }
        setRows(parsed as Row[]);
        return;
      }

      alert("JSON-Format wird nicht erkannt.");
    } catch (err) {
      console.error(err);
      alert("JSON-Datei konnte nicht geladen werden.");
    } finally {
      setBusy(false);
    }
  }

  /* ========== stili ========== */
  const tdStyle: React.CSSProperties = {
    padding: "6px 8px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
  };
  const thStyle: React.CSSProperties = {
    ...tdStyle,
    fontWeight: 700,
    background: "#f7f7f7",
  };
  const inp: React.CSSProperties = {
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "4px 6px",
    fontSize: 13,
  };

  /* ========== render ========== */
  return (
    <div className="card" style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Aufmaßvergleich · Soll–Ist</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button className="btn" onClick={addRow} disabled={busy}>
          + Zeile
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={pickAufmassFile} disabled={busy}>
          Aus Aufmaß laden
        </button>
        <button className="btn" onClick={importFromLV} disabled={busy}>
          Import aus LV
        </button>
        <button className="btn" onClick={pickPdfFile} disabled={busy}>
          Import aus PDF
        </button>
        <button className="btn" onClick={loadFromServer} disabled={busy || !projectKey}>
          Vom Server laden
        </button>
        <button className="btn" onClick={saveToServer} disabled={busy || !projectKey}>
          Speichern
        </button>
        <button className="btn" onClick={pickJsonFile} disabled={busy}>
          Laden (JSON)
        </button>

        <input
          ref={fileAufmassRef}
          type="file"
          accept=".csv,text/csv,application/vnd.ms-excel"
          style={{ display: "none" }}
          onChange={onPickAufmassFile}
        />
        <input
          ref={filePdfRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={onPickPdfFile}
        />
        <input
          ref={fileJsonRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={onPickJsonFile}
        />
      </div>

      <div className="card" style={{ padding: 10, marginBottom: 12 }}>
        <SollIstChart rows={rows} />
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Pos.</th>
              <th style={thStyle}>Beschreibung</th>
              <th style={thStyle}>Einheit</th>
              <th style={thStyle}>LV (Soll)</th>
              <th style={thStyle}>Ist (Abgerechnet)</th>
              <th style={thStyle}>Differenz (Soll–Ist)</th>
              <th style={thStyle}>EP (€)</th>
              <th style={thStyle}>Gesamt (€)</th>
              <th style={thStyle}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const diff = r.soll - r.ist;
              const total = r.ist * r.ep;
              return (
                <tr key={r.pos + i}>
                  <td style={tdStyle}>{r.pos}</td>
                  <td style={tdStyle}>
                    <input
                      style={{ ...inp, width: "100%" }}
                      value={r.text}
                      onChange={(e) => updateRow(i, { text: e.target.value })}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      style={{ ...inp, width: 60 }}
                      value={r.unit}
                      onChange={(e) => updateRow(i, { unit: e.target.value })}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.01"
                      style={{ ...inp, width: 110 }}
                      value={r.soll}
                      onChange={(e) => updateRow(i, { soll: Number(e.target.value) })}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.01"
                      style={{ ...inp, width: 110 }}
                      value={r.ist}
                      onChange={(e) => updateRow(i, { ist: Number(e.target.value) })}
                    />
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>
                    {diff.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.01"
                      style={{ ...inp, width: 100 }}
                      value={r.ep}
                      onChange={(e) => updateRow(i, { ep: Number(e.target.value) })}
                    />
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{fmtEUR(total)}</td>
                  <td style={tdStyle}>
                    <button className="btn" onClick={() => delRow(i)}>
                      Löschen
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...tdStyle, fontWeight: 700 }} colSpan={3}>
                Summen
              </td>
              <td style={{ ...tdStyle, fontWeight: 700 }}>
                {sumSoll.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
              <td style={{ ...tdStyle, fontWeight: 700 }}>
                {sumIst.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
              <td style={{ ...tdStyle, fontWeight: 700 }}>
                {sumDiff.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
              <td style={{ ...tdStyle, fontWeight: 700 }} colSpan={2}>
                {fmtEUR(sumEUR)}
              </td>
              <td style={tdStyle}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="card" style={{ marginTop: 12, padding: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Verlauf</div>
        {!projectKey && (
          <div style={{ fontSize: 13 }}>
            Kein Projekt gewählt. Verlauf steht erst nach Projektauswahl zur Verfügung.
          </div>
        )}
        {projectKey && history.length === 0 && (
          <div style={{ fontSize: 13 }}>
            Noch keine gespeicherten Stände. Mit <b>Speichern</b> wird ein Snapshot erzeugt.
          </div>
        )}
        {projectKey && history.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {history.map((h) => (
              <button
                key={h.ts}
                className="btn"
                style={{ fontSize: 11, padding: "4px 8px" }}
                onClick={loadFromServer}
              >
                {new Date(h.ts).toLocaleString()} · {h.count} Pos.
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
