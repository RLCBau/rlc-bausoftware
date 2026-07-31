import { rlcClass } from "../../ui/rlcRuntimeStyle";import { apiUrl } from "../../lib/apiBase";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from
"react";
import { useProject } from "../../store/useProject";
import MengPageHeader from "./MengPageHeader";

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

type HistorySnapshot = {
  ts: number;
  count: number;
  rows: Row[];
};

/* ========== util ========== */
const fmtEUR = (v: number) => `€ ${isFinite(v) ? v.toFixed(2) : "0.00"}`;
const toNum = (v: any) =>
typeof v === "number" ?
v :
Number(String(v ?? "").replace(",", ".").trim()) || 0;



function safeTrim(v: any) {
  return String(v ?? "").trim();
}

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
    ep: Number(r.ep ?? 0)
  }));
}

function toAufmassJson(rows: Row[]): AufmassJsonRow[] {
  return (rows || []).map((r) => ({
    pos: String(r.pos ?? ""),
    text: String(r.text ?? ""),
    unit: String(r.unit ?? "m"),
    soll: Number(r.soll ?? 0),
    ist: Number(r.ist ?? 0),
    ep: Number(r.ep ?? 0)
  }));
}

function byPosAsc(a: Row, b: Row) {
  return String(a.pos ?? "").localeCompare(String(b.pos ?? ""), "de-DE", {
    numeric: true,
    sensitivity: "base"
  });
}

function mergeServerRowsByPos(a: AufmassJsonRow[], b: AufmassJsonRow[]): AufmassJsonRow[] {
  const map = new Map<string, AufmassJsonRow>();
  const norm = (p: any) => String(p ?? "").trim();

  const put = (r: any) => {
    const k = norm(r?.pos);
    if (!k) return;

    const prev = map.get(k);
    if (!prev) {
      map.set(k, {
        pos: k,
        text: String(r?.text ?? ""),
        unit: String(r?.unit ?? "m"),
        soll: Number(r?.soll ?? 0),
        ist: Number(r?.ist ?? 0),
        ep: Number(r?.ep ?? 0)
      });
      return;
    }

    const next: AufmassJsonRow = { ...prev };
    if (!safeTrim(next.text) && safeTrim(r?.text)) next.text = String(r.text);
    if (!safeTrim(next.unit) && safeTrim(r?.unit)) next.unit = String(r.unit);
    if (!Number(next.ep) && Number(r?.ep)) next.ep = Number(r.ep);
    if (!Number(next.soll) && Number(r?.soll)) next.soll = Number(r.soll);
    next.ist = Math.max(Number(next.ist ?? 0), Number(r?.ist ?? 0));

    map.set(k, next);
  };

  (Array.isArray(a) ? a : []).forEach(put);
  (Array.isArray(b) ? b : []).forEach(put);

  return Array.from(map.values()).sort((x, y) => byPosAsc(fromAufmassJson([x])[0], fromAufmassJson([y])[0]));
}

async function fetchRowsForKey(key: string): Promise<AufmassJsonRow[]> {
  if (!safeTrim(key)) return [];
  const url = apiUrl(`/api/aufmass/soll-ist/${encodeURIComponent(key)}`);
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.rows) ? data.rows as AufmassJsonRow[] : [];
}

/* ========== piccolo grafico SVG (nessuna dipendenza) ========== */
function SollIstChart({ rows }: {rows: Row[];}) {
  const H = 220;
  const PAD = 34;
  const groupWidth = 34;
  const W = Math.max(920, PAD * 2 + rows.length * groupWidth);

  const data = rows.map((row) => {
    const localMax = Math.max(1, Math.abs(row.soll), Math.abs(row.ist));
    return {
      label: row.pos,
      soll: row.soll,
      ist: row.ist,
      sollRatio: Math.abs(row.soll) / localMax,
      istRatio: Math.abs(row.ist) / localMax
    };
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label="Soll-Ist Vergleich je Position in relativer Darstellung">
      
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#cbd5e1" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#cbd5e1" />

      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = H - PAD - (H - PAD * 2) * ratio;
        return (
          <g key={ratio}>
            <line x1={PAD} x2={W - PAD} y1={y} y2={y} stroke="#eef2f7" />
            <text x={4} y={y + 4} fontSize="10" fill="#64748b">
              {Math.round(ratio * 100)} %
            </text>
          </g>);

      })}

      {data.map((item, index) => {
        const x0 = PAD + index * groupWidth + 5;
        const barWidth = 10;
        const availableHeight = H - PAD * 2;
        const hSoll = availableHeight * item.sollRatio;
        const hIst = availableHeight * item.istRatio;

        return (
          <g key={`${item.label}-${index}`}>
            <title>{`${item.label}: Soll ${item.soll}, Ist ${item.ist}`}</title>
            <rect
              x={x0}
              y={H - PAD - hSoll}
              width={barWidth}
              height={hSoll}
              fill="#9ec5fe" />
            
            <rect
              x={x0 + barWidth + 2}
              y={H - PAD - hIst}
              width={barWidth}
              height={hIst}
              fill="#f3a7a7" />
            
            <text
              x={x0 + barWidth}
              y={H - 9}
              fontSize="9"
              textAnchor="middle"
              fill="#475569">
              
              {item.label}
            </text>
          </g>);

      })}

      <g transform={`translate(${W - 175},${PAD - 9})`}>
        <rect x={0} y={0} width={12} height={12} fill="#9ec5fe" />
        <text x={18} y={10} fontSize="12" fill="#334155">
          Soll
        </text>
        <rect x={70} y={0} width={12} height={12} fill="#f3a7a7" />
        <text x={88} y={10} fontSize="12" fill="#334155">
          Ist
        </text>
      </g>
    </svg>);

}

/* ========== componente principale ========== */
export default function SollIst() {
  const projectStore = useProject() as any;
  const currentProject = projectStore?.currentProject;
  const getSelectedProject = projectStore?.getSelectedProject;

  const selectedProject =
  typeof getSelectedProject === "function" ? getSelectedProject() : null;

  const project = currentProject || selectedProject || null;

  const projectId: string | undefined = project?.id;
  const projectCode: string | undefined = project?.code;
  const projectKey: string | undefined = projectCode || projectId || undefined;

  const storageKey: string | null = projectKey ? `sollist:${projectKey}` : null;
  const legacyStorageKey: string | null = projectKey ? `sollist-${projectKey}` : null;
  const historyStorageKey: string | null = projectKey ?
  `sollist-snapshots:${projectKey}` :
  null;

  const [rows, setRows] = useState<Row[]>([]);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const fileAufmassRef = useRef<HTMLInputElement>(null);
  const filePdfRef = useRef<HTMLInputElement>(null);
  const fileJsonRef = useRef<HTMLInputElement>(null);

  /* ========== LOAD history locale ========== */
  useEffect(() => {
    if (!historyStorageKey) return;
    try {
      const raw = window.localStorage.getItem(historyStorageKey);
      if (!raw) {
        setHistory([]);
        return;
      }
      const parsed = JSON.parse(raw);
      const snapshots = Array.isArray(parsed) ?
      parsed.filter(
        (item): item is HistorySnapshot =>
        Boolean(item) &&
        typeof item.ts === "number" &&
        Array.isArray(item.rows)
      ) :
      [];
      setHistory(snapshots.slice(0, 5));
    } catch {
      setHistory([]);
    }
  }, [historyStorageKey]);

  /* ========== SAVE su localStorage ========== */
  useEffect(() => {
    if (!storageKey || !hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(rows));
      if (legacyStorageKey) window.localStorage.removeItem(legacyStorageKey);
    } catch (error) {
      console.warn("Soll/Ist: lokaler Speicher konnte nicht aktualisiert werden", error);
    }
  }, [hydrated, legacyStorageKey, rows, storageKey]);

  /* ========== SAVE history locale ========== */
  useEffect(() => {
    if (!historyStorageKey) return;
    try {
      window.localStorage.setItem(
        historyStorageKey,
        JSON.stringify(history.slice(0, 5))
      );
    } catch (error) {
      console.warn("Soll/Ist: lokale Snapshots konnten nicht gespeichert werden", error);
    }
  }, [history, historyStorageKey]);

  /* ========== LOAD / SAVE su SERVER (STESSO FILE di AufmassEditor) ========== */

  const loadFromServer = useCallback(async () => {
    if (!projectKey && !projectId) {
      setRows([]);
      setHydrated(true);
      return;
    }

    const loadLocalFallback = (): Row[] => {
      try {
        const raw =
        storageKey ?
        window.localStorage.getItem(storageKey) || (
        legacyStorageKey ?
        window.localStorage.getItem(legacyStorageKey) :
        null) :
        null;

        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed as Row[] : [];
      } catch {
        return [];
      }
    };

    try {
      setBusy(true);
      setHydrated(false);

      const byCode = projectCode ? await fetchRowsForKey(projectCode) : [];
      const byId =
      projectId && projectId !== projectCode ?
      await fetchRowsForKey(projectId) :
      [];

      const serverRows =
      byCode.length && !byId.length ?
      byCode :
      !byCode.length && byId.length ?
      byId :
      mergeServerRowsByPos(byCode, byId);

      if (serverRows.length > 0) {
        const loadedRows = fromAufmassJson(serverRows);
        setRows(loadedRows);

        setHistory((prev) => {
          const snapshot: HistorySnapshot = {
            ts: Date.now(),
            count: loadedRows.length,
            rows: loadedRows.map((row) => ({ ...row }))
          };
          return [snapshot, ...prev].slice(0, 5);
        });

        setHydrated(true);
        return;
      }

      const fallbackRows = loadLocalFallback();
      setRows(
        fallbackRows.length ?
        fallbackRows :
        [
        {
          pos: "001.001",
          text: "Neue Position",
          unit: "m",
          soll: 0,
          ist: 0,
          ep: 0
        }]

      );
      setHydrated(true);
    } catch (err) {
      console.error(err);

      const fallbackRows = loadLocalFallback();
      setRows(
        fallbackRows.length ?
        fallbackRows :
        [
        {
          pos: "001.001",
          text: "Neue Position",
          unit: "m",
          soll: 0,
          ist: 0,
          ep: 0
        }]

      );
      setHydrated(true);
    } finally {
      setBusy(false);
    }
  }, [
  legacyStorageKey,
  projectCode,
  projectId,
  projectKey,
  storageKey]
  );

  useEffect(() => {
    if (!projectKey && !projectId) return;
    loadFromServer();
  }, [projectKey, projectId, loadFromServer]);

  async function saveToServer() {
    if (!projectKey && !projectId) {
      alert("Kein Projekt ausgewählt. Bitte zuerst ein Projekt wählen.");
      return;
    }

    const payloadRows = toAufmassJson(rows);

    try {
      setBusy(true);

      const post = async (key: string) => {
        const url = apiUrl(`/api/aufmass/soll-ist/${encodeURIComponent(key)}`);
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: payloadRows })
        });
        if (!res.ok) throw new Error(`API ${url} -> HTTP ${res.status}`);
      };

      if (projectCode) {
        await post(projectCode);
      } else if (projectId) {
        await post(projectId);
      }

      if (projectId && projectId !== projectCode) {
        post(projectId).catch(() => void 0);
      }

      setHistory((prev) => {
        const snapshot: HistorySnapshot = {
          ts: Date.now(),
          count: rows.length,
          rows: rows.map((row) => ({ ...row }))
        };
        return [snapshot, ...prev].slice(0, 5);
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

  const suspiciousRows = useMemo(
    () =>
    rows.filter((row) => {
      const unit = safeTrim(row.unit).toLowerCase();
      const isLumpSum = ["psch", "pausch", "pauschal"].includes(unit);
      const overrun = row.soll > 0 && row.ist > row.soll * 2;
      return isLumpSum && overrun;
    }),
    [rows]
  );

  /* ========== mutazioni riga ========== */
  const updateRow = (i: number, patch: Partial<Row>) =>
  setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const addRow = () =>
  setRows((prev) => [
  ...prev,
  {
    pos: `001.${String(prev.length + 1).padStart(3, "0")}`,
    text: "Neue Position",
    unit: "m",
    soll: 0,
    ist: 0,
    ep: 0
  }]
  );

  const delRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  /* ========== helper CSV (Aufmaß-Datei) ========== */
  function parseCsvWithHeader(text: string): ParsedItem[] {
    const lines = text.
    split(/\r?\n/).
    map((l) => l.trim()).
    filter(Boolean);
    if (!lines.length) return [];

    const sep = lines[0].includes(";") ? ";" : ",";
    const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
    const dataLines = lines.slice(1);

    return dataLines.map((line) => {
      const cols = line.split(sep).map((c) => c.replace(/^"(.*)"$/, "$1").trim());
      const item: ParsedItem = {};
      header.forEach((h, idx) => {
        const v = cols[idx];
        if (/^pos/.test(h)) item.pos = v;else
        if (/kurz|beschr|text/.test(h)) {
          item.descr = v;
          item.kurztext = v;
          item.text = v;
        } else if (/einheit|unit/.test(h)) item.unit = v;else
        if (/lv|soll/.test(h)) item.qty = v;else
        if (/ist|abgerechnet/.test(h)) item.ist = v;else
        if (/ep|preis/.test(h)) item.ep = v;
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
        ep: toNum(it.ep ?? 0)
      }));

      setRows(mapped.length ? mapped : rows);
    } catch (err) {
      console.error(err);
      alert("Aufmaß-Import (Datei) fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  /* ========== Import aus LV (Projekt) – DB → /api/project-lv/:projectId ========== */
  async function importFromLV() {
    const candidateKeys = [projectId, projectKey].filter(
      (v, i, arr): v is string => !!v && arr.indexOf(v) === i
    );

    if (!candidateKeys.length) {
      alert("Kein Projekt ausgewählt. Bitte zuerst ein Projekt wählen.");
      return;
    }

    try {
      setBusy(true);

      let payload: any = null;
      let lastErr: any = null;

      for (const key of candidateKeys) {
        try {
          const url = apiUrl(`/api/project-lv/${encodeURIComponent(key)}`);
          const res = await fetch(url);
          if (!res.ok) throw new Error(`API ${url} -> HTTP ${res.status}`);
          payload = await res.json();
          break;
        } catch (e) {
          lastErr = e;
        }
      }

      if (!payload) throw lastErr || new Error("LV konnte nicht geladen werden.");

      const list: ParsedItem[] = payload.items || payload.lv || [];

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
        ep: toNum(it.ep ?? it.einzelpreis ?? it.preis ?? 0)
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
              ep: m.ep || ex.ep
            });
          } else {
            map.set(m.pos, m);
          }
        });
        return Array.from(map.values()).sort(byPosAsc);
      });
    } catch (err: any) {
      console.error(err);
      alert(
        `LV-Import fehlgeschlagen. Prüfe /api/project-lv/:projectId.\nDetails: ${
        err?.message || ""}`

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

      const url = apiUrl("/api/import/parse");
      const res = await fetch(url, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Import API ${res.status}`);
      const data = await res.json();
      const items: ParsedItem[] = data.items || [];

      const mapped: Row[] = items.map((it, idx) => ({
        pos: it.pos || `PDF.${String(idx + 1).padStart(3, "0")}`,
        text: it.descr || it.text || it.type || "PDF-Zeile",
        unit: it.unit || "m",
        soll: toNum(it.qty ?? 0),
        ist: 0,
        ep: 0
      }));

      setRows((prev) => [...prev, ...mapped].sort(byPosAsc));
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

      if (!Array.isArray(parsed) && parsed && typeof parsed === "object") {
        const objRows = Array.isArray(parsed.rows) ? parsed.rows : [];
        if (objRows.length && typeof objRows[0]?.soll !== "undefined") {
          setRows(fromAufmassJson(objRows as AufmassJsonRow[]));
          return;
        }
      }

      if (Array.isArray(parsed)) {
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
    padding: "8px 10px",
    borderBottom: "1px solid #eef2f7",
    color: "#0f172a",
    verticalAlign: "top"
  };
  const thStyle: React.CSSProperties = {
    padding: "9px 10px",
    borderBottom: "1px solid #e5eaf3",
    background: "#f8fafc",
    color: "#475569",
    fontWeight: 700,
    textAlign: "left",
    whiteSpace: "nowrap"
  };
  const inp: React.CSSProperties = {
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "4px 6px",
    fontSize: 13
  };

  /* ========== render ========== */
  return (
    <div className="card rlc-migrated-pages-mengenermittlung-sollist-tsx-1357">
      <MengPageHeader title="Soll/Ist Vergleich" subtitle="Vergleicht LV-Sollmengen mit erfassten Aufmaßmengen und zeigt Abweichungen." />
      <h2 className="rlc-migrated-pages-mengenermittlung-sollist-tsx-1358">Aufmaßvergleich · Soll–Ist</h2>

      <div className="rlc-migrated-pages-mengenermittlung-sollist-tsx-1359">
        <button className="btn" onClick={addRow} disabled={busy}>
          + Zeile
        </button>
        <div className="rlc-migrated-pages-mengenermittlung-sollist-tsx-1360" />
        <button className="btn" onClick={pickAufmassFile} disabled={busy}>
          Aus Aufmaß laden
        </button>
        <button className="btn" onClick={importFromLV} disabled={busy}>
          Import aus LV
        </button>
        <button className="btn" onClick={pickPdfFile} disabled={busy}>
          Import aus PDF
        </button>
        <button className="btn" onClick={loadFromServer} disabled={busy || !projectKey && !projectId}>
          Vom Server laden
        </button>
        <button className="btn" onClick={saveToServer} disabled={busy || !projectKey && !projectId}>
          Speichern
        </button>
        <button className="btn" onClick={pickJsonFile} disabled={busy}>
          Laden (JSON)
        </button>

        <input
          ref={fileAufmassRef}
          type="file"
          accept=".csv,text/csv,application/vnd.ms-excel"

          onChange={onPickAufmassFile} className="rlc-migrated-pages-mengenermittlung-sollist-tsx-1361" />
        
        <input
          ref={filePdfRef}
          type="file"
          accept="application/pdf"

          onChange={onPickPdfFile} className="rlc-migrated-pages-mengenermittlung-sollist-tsx-1362" />
        
        <input
          ref={fileJsonRef}
          type="file"
          accept="application/json,.json"

          onChange={onPickJsonFile} className="rlc-migrated-pages-mengenermittlung-sollist-tsx-1363" />
        
      </div>

      {suspiciousRows.length > 0 &&
      <div
        className="card rlc-migrated-pages-mengenermittlung-sollist-tsx-1364">








        
          Plausibilitätsprüfung: {suspiciousRows.length} Pauschalposition(en) mit
          Ist-Menge über 200 % des Solls. Bitte prüfen: {
        suspiciousRows.map((row) => row.pos).join(", ")
        }.
        </div>
      }

      <div className="card rlc-migrated-pages-mengenermittlung-sollist-tsx-1365">
        <SollIstChart rows={rows} />
      </div>

      <div className="card rlc-migrated-pages-mengenermittlung-sollist-tsx-1366">
        <table className="rlc-migrated-pages-mengenermittlung-sollist-tsx-1367">
          <thead>
            <tr>
              <th className={rlcClass(null, thStyle)}>Pos.</th>
              <th className={rlcClass(null, thStyle)}>Beschreibung</th>
              <th className={rlcClass(null, thStyle)}>Einheit</th>
              <th className={rlcClass(null, thStyle)}>LV (Soll)</th>
              <th className={rlcClass(null, thStyle)}>Ist (Abgerechnet)</th>
              <th className={rlcClass(null, thStyle)}>Differenz (Soll–Ist)</th>
              <th className={rlcClass(null, thStyle)}>EP (€)</th>
              <th className={rlcClass(null, thStyle)}>Gesamt (€)</th>
              <th className={rlcClass(null, thStyle)}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const diff = r.soll - r.ist;
              const total = r.ist * r.ep;
              return (
                <tr key={r.pos + i}>
                  <td className={rlcClass(null, tdStyle)}>{r.pos}</td>
                  <td className={rlcClass(null, tdStyle)}>
                    <input className={rlcClass(null,
                    { ...inp, width: "100%" })}
                    value={r.text}
                    onChange={(e) => updateRow(i, { text: e.target.value })} />
                    
                  </td>
                  <td className={rlcClass(null, tdStyle)}>
                    <input className={rlcClass(null,
                    { ...inp, width: 60 })}
                    value={r.unit}
                    onChange={(e) => updateRow(i, { unit: e.target.value })} />
                    
                  </td>
                  <td className={rlcClass(null, tdStyle)}>
                    <input
                      type="number"
                      step="0.01" className={rlcClass(null,
                      { ...inp, width: 110 })}
                      value={r.soll}
                      onChange={(e) => updateRow(i, { soll: Number(e.target.value) })} />
                    
                  </td>
                  <td className={rlcClass(null, tdStyle)}>
                    <input
                      type="number"
                      step="0.01" className={rlcClass(null,
                      { ...inp, width: 110 })}
                      value={r.ist}
                      onChange={(e) => updateRow(i, { ist: Number(e.target.value) })} />
                    
                  </td>
                  <td className={rlcClass(null, { ...tdStyle, fontWeight: 600 })}>
                    {diff.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  </td>
                  <td className={rlcClass(null, tdStyle)}>
                    <input
                      type="number"
                      step="0.01" className={rlcClass(null,
                      { ...inp, width: 100 })}
                      value={r.ep}
                      onChange={(e) => updateRow(i, { ep: Number(e.target.value) })} />
                    
                  </td>
                  <td className={rlcClass(null, { ...tdStyle, whiteSpace: "nowrap" })}>{fmtEUR(total)}</td>
                  <td className={rlcClass(null, tdStyle)}>
                    <button className="btn" onClick={() => delRow(i)}>
                      Löschen
                    </button>
                  </td>
                </tr>);

            })}
          </tbody>
          <tfoot>
            <tr>
              <td className={rlcClass(null, { ...tdStyle, fontWeight: 600 })} colSpan={3}>
                Summen
              </td>
              <td className={rlcClass(null, { ...tdStyle, fontWeight: 600 })}>
                {sumSoll.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
              <td className={rlcClass(null, { ...tdStyle, fontWeight: 600 })}>
                {sumIst.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
              <td className={rlcClass(null, { ...tdStyle, fontWeight: 600 })}>
                {sumDiff.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
              <td className={rlcClass(null, { ...tdStyle, fontWeight: 600 })} colSpan={2}>
                {fmtEUR(sumEUR)}
              </td>
              <td className={rlcClass(null, tdStyle)}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="card rlc-migrated-pages-mengenermittlung-sollist-tsx-1368">
        <div className="rlc-migrated-pages-mengenermittlung-sollist-tsx-1369">Verlauf</div>
        {!projectKey && !projectId &&
        <div className="rlc-migrated-pages-mengenermittlung-sollist-tsx-1370">
            Kein Projekt gewählt. Verlauf steht erst nach Projektauswahl zur Verfügung.
          </div>
        }
        {(projectKey || projectId) && history.length === 0 &&
        <div className="rlc-migrated-pages-mengenermittlung-sollist-tsx-1371">
            Noch keine gespeicherten Stände. Mit <b>Speichern</b> wird ein Snapshot erzeugt.
          </div>
        }
        {(projectKey || projectId) && history.length > 0 &&
        <div className="rlc-migrated-pages-mengenermittlung-sollist-tsx-1372">
            {history.map((h) =>
          <button
            key={h.ts}
            className="btn rlc-migrated-pages-mengenermittlung-sollist-tsx-1373"

            onClick={() => setRows(h.rows.map((row) => ({ ...row })))}
            title="Diesen lokalen Stand wiederherstellen">
            
                {new Date(h.ts).toLocaleString()} · {h.count} Pos.
              </button>
          )}
          </div>
        }
      </div>
    </div>);

}
