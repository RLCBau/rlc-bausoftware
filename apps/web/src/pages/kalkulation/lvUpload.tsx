import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/lvUpload.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";
import { LV, type LVPos } from "./store.lv";
import { saveKiHandoff } from "./recipesHandoff";

type LVRow = {
  id: string;
  position: string;
  kurztext: string;
  langtext: string;
  einheit: string;
  menge: string;
  ep: number;
};

type ParsedRow = LVRow & {
  mengeNum: number;
  einheitNorm: string;
  zeilenpreis: number;
  error?: string;
};

type ProjectLike = {
  id?: string;
  code?: string;
  projectCode?: string;
  number?: string;
  name?: string;
  projectName?: string;
  client?: string;
  place?: string;
  location?: string;
};

const CURRENT_KEY = "rlc_lvupload_current_v2";
const MWST_KEY = "rlc_lvupload_mwst_v2";

function storageKey(projectKey: string) {
  return `rlc_lvupload_v2:${projectKey || "NO_PROJECT"}`;
}

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `lv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

function getAuthToken(): string {
  try {
    const keys = [
    "token",
    "authToken",
    "accessToken",
    "rlc_token",
    "rlc_auth_token",
    "rlc_access_token"];


    for (const key of keys) {
      const v = localStorage.getItem(key);
      if (v?.trim()) return v.trim();
    }

    const jsonKeys = ["auth", "user", "session", "rlc_auth", "rlc_session"];
    for (const key of jsonKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const j = JSON.parse(raw);
        const token =
        j?.token ??
        j?.accessToken ??
        j?.authToken ??
        j?.jwt ??
        j?.data?.token ??
        j?.data?.accessToken;

        if (typeof token === "string" && token.trim()) return token.trim();
      } catch {


        //
      }}} catch {


    //
  }return "";
}

function authHeaders(extra?: Record<string, string>): HeadersInit {
  const token = getAuthToken();

  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function getProject(ctx: any): ProjectLike | null {
  return (
    ctx?.currentProject ||
    ctx?.project ||
    ctx?.selectedProject ||
    ctx?.current ||
    null);

}

function getProjectKey(ctx: any): string {
  const p = getProject(ctx);

  return String(
    p?.code ||
    p?.projectCode ||
    p?.number ||
    ctx?.projectCode ||
    p?.id ||
    ctx?.projectId ||
    ctx?.id ||
    ""
  ).
  trim().
  toUpperCase();
}

function safeNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;

  const s = String(v).
  trim().
  replace(/\s/g, "").
  replace(/\.(?=\d{3}(?:[.,]|$))/g, "").
  replace(",", ".");

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function evalFormula(expr: string): {value: number;error?: string;} {
  const raw = String(expr || "").trim();
  if (!raw) return { value: 0 };

  const s = raw.replace(/,/g, ".").replace(/\s+/g, "");

  if (!/^[0-9+\-*/().]*$/.test(s)) {
    return { value: 0, error: "Ungültige Formel" };
  }

  try {
    // bewusst begrenzt: nur Zahlen und Rechenoperatoren erlaubt
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${s});`)();
    const n = Number(value);

    return Number.isFinite(n) ?
    { value: n } :
    { value: 0, error: "Formel ergibt keine Zahl" };
  } catch {
    return { value: 0, error: "Formel konnte nicht berechnet werden" };
  }
}

function mapEinheit(einheit: string, text: string): string {
  const e = String(einheit || "").trim().toLowerCase();

  if (e === "m2" || e === "m²" || e === "qm") return "m²";
  if (e === "m3" || e === "m³" || e === "cbm") return "m³";
  if (e === "stk" || e === "stück" || e === "st") return "Stk";
  if (e === "std" || e === "stunden") return "h";
  if (e === "to" || e === "tonnen") return "t";
  if (e === "ps" || e === "pauschal") return "PS";
  if (e === "m") return "m";
  if (e) return einheit.trim();

  const t = String(text || "").toLowerCase();

  if (/\bm²|\bm2|fläche|belag|schicht|pflaster|asphalt/.test(t)) return "m²";
  if (/\bm³|\bm3|kubatur|aushub|volumen|boden/.test(t)) return "m³";
  if (/\bstk|stück|schacht|anschluss|abzweig|bogen\b/.test(t)) return "Stk";
  if (/\bstunden|std|lohn|arbeiter|facharbeiter/.test(t)) return "h";

  return "m";
}

function roundForUnit(v: number, einheit: string): number {
  const e = String(einheit || "").toLowerCase();

  if (e === "stk" || e === "stück") return Math.round(v);
  if (e === "m³" || e === "m3") return Math.round(v * 1000) / 1000;

  return Math.round(v * 100) / 100;
}

function fmtMoney(v: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(Number(v || 0));
}

function fmtQty(v: number, e: string): string {
  const unit = String(e || "");
  const low = unit.toLowerCase();

  const dec =
  low === "stk" || low === "stück" || low === "ps" ?
  0 :
  low === "m³" || low === "m3" ?
  3 :
  2;

  return `${Number(v || 0).toLocaleString("de-DE", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  })} ${unit}`;
}

function parseCsvLine(line: string, sep = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((x) => x.trim());
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");

  if (s.includes('"') || s.includes(";") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }

  return s;
}

function normalizeHeader(v: unknown): string {
  return String(v ?? "").
  trim().
  toLowerCase().
  replace(/\s+/g, "").
  replace(/[_-]/g, "");
}

function importCsvText(text: string): LVRow[] {
  const content = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!content) return [];

  const lines = content.split(/\r?\n/).filter((x) => x.trim());
  if (!lines.length) return [];

  const first = parseCsvLine(lines[0]).map(normalizeHeader);
  const hasHeader =
  first.includes("position") ||
  first.includes("posnr") ||
  first.includes("positionsnummer") ||
  first.includes("kurztext") ||
  first.includes("langtext") ||
  first.includes("einheit") ||
  first.includes("menge") ||
  first.includes("ep");

  const idx = (names: string[]) => first.findIndex((h) => names.includes(h));

  const iPos = hasHeader ? idx(["position", "posnr", "positionsnummer", "pos"]) : 0;
  const iKurz = hasHeader ? idx(["kurztext", "text", "bezeichnung"]) : 1;
  const iLang = hasHeader ? idx(["langtext", "beschreibung"]) : -1;
  const iEin = hasHeader ? idx(["einheit", "me", "unit", "eh"]) : 2;
  const iMenge = hasHeader ? idx(["menge", "formel", "qty", "quantity"]) : 3;
  const iEp = hasHeader ? idx(["ep", "einzelpreis", "preis", "einheitspreis"]) : 4;

  const body = hasHeader ? lines.slice(1) : lines;

  return body.
  map((line) => {
    const c = parseCsvLine(line);

    return {
      id: uid(),
      position: c[iPos >= 0 ? iPos : 0] || "",
      kurztext: c[iKurz >= 0 ? iKurz : 1] || "",
      langtext: c[iLang >= 0 ? iLang : -1] || "",
      einheit: c[iEin >= 0 ? iEin : 2] || "m",
      menge: c[iMenge >= 0 ? iMenge : 3] || "0",
      ep: safeNumber(c[iEp >= 0 ? iEp : 4])
    };
  }).
  filter(
    (r) =>
    r.position ||
    r.kurztext ||
    r.langtext ||
    r.einheit ||
    r.menge ||
    r.ep
  );
}

function toLvPos(r: ParsedRow): LVPos {
  return {
    id: uid(),
    posNr: r.position || "",
    parentPosNr: "",
    kurztext: r.kurztext || "",
    langtext: r.langtext || "",
    bemerkung: "",
    einheit: r.einheitNorm || "m",
    menge: r.mengeNum || 0,
    preis: r.ep || 0,
    gesamt: round2((r.mengeNum || 0) * (r.ep || 0)),
    waehrung: "EUR",
    confidence: undefined,
    source: "manual",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);

  a.href = url;
  a.download = name;
  a.click();

  URL.revokeObjectURL(url);
}

function escapeXml(s: string) {
  return String(s ?? "").
  replace(/&/g, "&amp;").
  replace(/</g, "&lt;").
  replace(/>/g, "&gt;").
  replace(/"/g, "&quot;");
}

export default function LVUpload() {
  const navigate = useNavigate();
  const projectCtx: any = useProject() as any;
  const activeProject = getProject(projectCtx);
  const activeProjectKey = getProjectKey(projectCtx);

  const [projectKey, setProjectKey] = useState<string>(() => {
    return (
    activeProjectKey ||
    localStorage.getItem(CURRENT_KEY) ||
    "BA-2026-DEMO").
    toUpperCase();
  });

  const [rows, setRows] = useState<LVRow[]>([]);
  const [mwst, setMwst] = useState<number>(() =>
  Number(localStorage.getItem(MWST_KEY) || 19)
  );
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeProjectKey && activeProjectKey !== projectKey) {
      setProjectKey(activeProjectKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectKey]);

  useEffect(() => {
    localStorage.setItem(CURRENT_KEY, projectKey);

    try {
      const raw = localStorage.getItem(storageKey(projectKey));
      setRows(raw ? JSON.parse(raw) : []);
    } catch {
      setRows([]);
    }
  }, [projectKey]);

  useEffect(() => {
    localStorage.setItem(storageKey(projectKey), JSON.stringify(rows));
  }, [rows, projectKey]);

  useEffect(() => {
    localStorage.setItem(MWST_KEY, String(mwst || 0));
  }, [mwst]);

  const parsedRows = useMemo<ParsedRow[]>(() => {
    return rows.map((r) => {
      const formula = evalFormula(r.menge);
      const einheitNorm = mapEinheit(r.einheit, `${r.kurztext} ${r.langtext}`);
      const mengeNum = roundForUnit(formula.value, einheitNorm);
      const ep = safeNumber(r.ep);
      const zeilenpreis = round2(mengeNum * ep);

      return {
        ...r,
        ep,
        einheitNorm,
        mengeNum,
        zeilenpreis,
        error: formula.error
      };
    });
  }, [rows]);

  const totals = useMemo(() => {
    const netto = round2(parsedRows.reduce((s, r) => s + r.zeilenpreis, 0));
    const steuer = round2(netto * ((mwst || 0) / 100));
    const brutto = round2(netto + steuer);

    return { netto, steuer, brutto };
  }, [parsedRows, mwst]);

  const errorsCount = parsedRows.filter((r) => r.error).length;

  function addRow() {
    setRows((prev) => [
    ...prev,
    {
      id: uid(),
      position: "",
      kurztext: "",
      langtext: "",
      einheit: "m",
      menge: "0",
      ep: 0
    }]
    );
  }

  function updateRow(id: string, patch: Partial<LVRow>) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }

  function deleteRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function clearAll() {
    if (!confirm("Alle LV-Zeilen löschen?")) return;
    setRows([]);
    setStatus("LV lokal geleert.");
  }

  function autoNumber() {
    let n = 1;

    setRows((prev) =>
    prev.map((r) => {
      const existing = String(r.position || "").trim();
      if (existing) return r;

      const next = `01.${String(n).padStart(4, "0")}`;
      n += 1;

      return { ...r, position: next };
    })
    );
  }

  function importCsv(file: File) {
    const reader = new FileReader();

    reader.onload = () => {
      const imported = importCsvText(String(reader.result || ""));
      setRows(imported);
      setStatus(`CSV importiert: ${imported.length.toLocaleString("de-DE")} Positionen.`);
    };

    reader.readAsText(file, "utf-8");
  }

  function pasteBulk() {
    const txt = prompt("Zeilen einfügen (CSV mit ; — Header optional):");
    if (!txt) return;

    const imported = importCsvText(txt);
    setRows(imported);
    setStatus(`Eingefügt: ${imported.length.toLocaleString("de-DE")} Positionen.`);
  }

  function exportCsv() {
    const header =
    "Position;Kurztext;Langtext;Einheit;Menge_Formel;Menge_Berechnet;EP;Zeilenpreis";

    const body = parsedRows.
    map((r) =>
    [
    csvEscape(r.position),
    csvEscape(r.kurztext),
    csvEscape(r.langtext),
    csvEscape(r.einheitNorm),
    csvEscape(r.menge),
    csvEscape(r.mengeNum),
    csvEscape(r.ep),
    csvEscape(r.zeilenpreis)].
    join(";")
    ).
    join("\n");

    downloadBlob(
      new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" }),
      `LV_${projectKey}.csv`
    );
  }

  function exportXlsx() {
    const xmlHeader =
    `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
    `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
    `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;

    const headRow =
    `<Row>` +
    [
    "Position",
    "Kurztext",
    "Langtext",
    "Einheit",
    "Menge",
    "EP",
    "Zeilenpreis"].

    map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).
    join("") +
    `</Row>`;

    const body = parsedRows.
    map(
      (r) =>
      `<Row>` +
      `<Cell><Data ss:Type="String">${escapeXml(r.position)}</Data></Cell>` +
      `<Cell><Data ss:Type="String">${escapeXml(r.kurztext)}</Data></Cell>` +
      `<Cell><Data ss:Type="String">${escapeXml(r.langtext)}</Data></Cell>` +
      `<Cell><Data ss:Type="String">${escapeXml(r.einheitNorm)}</Data></Cell>` +
      `<Cell><Data ss:Type="Number">${r.mengeNum}</Data></Cell>` +
      `<Cell><Data ss:Type="Number">${r.ep}</Data></Cell>` +
      `<Cell><Data ss:Type="Number">${r.zeilenpreis}</Data></Cell>` +
      `</Row>`
    ).
    join("");

    const foot =
    `<Row><Cell><Data ss:Type="String">Netto</Data></Cell><Cell/><Cell/><Cell/><Cell/><Cell/>` +
    `<Cell><Data ss:Type="Number">${totals.netto}</Data></Cell></Row>` +
    `<Row><Cell><Data ss:Type="String">MwSt %</Data></Cell><Cell/><Cell/><Cell/><Cell/><Cell/>` +
    `<Cell><Data ss:Type="Number">${mwst}</Data></Cell></Row>` +
    `<Row><Cell><Data ss:Type="String">Brutto</Data></Cell><Cell/><Cell/><Cell/><Cell/><Cell/>` +
    `<Cell><Data ss:Type="Number">${totals.brutto}</Data></Cell></Row>`;

    const xml =
    xmlHeader +
    `<Worksheet ss:Name="LV"><Table>` +
    headRow +
    body +
    foot +
    `</Table></Worksheet></Workbook>`;

    downloadBlob(
      new Blob([xml], { type: "application/vnd.ms-excel" }),
      `LV_${projectKey}.xls`
    );
  }

  function writeToLvStore(): LVPos[] {
    const mapped = parsedRows.map(toLvPos);
    LV.bulkUpsert(mapped);
    return mapped;
  }

  function sendToManuell() {
    const mapped = writeToLvStore();
    setStatus(`In LV übernommen: ${mapped.length.toLocaleString("de-DE")} Positionen.`);
    navigate("/kalkulation/manuell");
  }

  function sendToKi() {
    const mapped = writeToLvStore();

    saveKiHandoff({
      source: "rezepte",
      ts: Date.now(),
      projectCode: projectKey,
      projectId: String(activeProject?.id || ""),
      mwst,
      rows: mapped.map((r) => ({
        posNr: r.posNr,
        kurztext: r.kurztext,
        einheit: r.einheit,
        menge: r.menge,
        preis: r.preis ?? 0,
        confidence: r.confidence
      }))
    });

    setStatus(`In KI übergeben: ${mapped.length.toLocaleString("de-DE")} Positionen.`);
    navigate("/kalkulation/mit-ki?from=lv-upload");
  }

  function sendToAngebot() {
    writeToLvStore();
    navigate("/kalkulation/angebot");
  }

  async function saveToServer() {
    if (!projectKey.trim()) {
      alert("Projektcode fehlt.");
      return;
    }

    if (!parsedRows.length) {
      alert("Keine Positionen vorhanden.");
      return;
    }

    const items = parsedRows.
    filter((r) => r.position || r.kurztext || r.langtext).
    map((r) => ({
      pos: r.position,
      text: r.kurztext,
      langtext: r.langtext,
      unit: r.einheitNorm,
      quantity: r.mengeNum,
      ep: r.ep
    }));

    try {
      setBusy(true);
      setStatus("Speichere am Server …");

      const res = await fetch(
        apiUrl(`/api/project-lv/${encodeURIComponent(projectKey)}/import`),
        {
          method: "POST",
          credentials: "include",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            title: `LV ${projectKey}`,
            currency: "EUR",
            items
          })
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Server-Fehler (${res.status})`);
      }

      writeToLvStore();
      setStatus(
        `Server gespeichert: ${Number(json?.count || items.length).toLocaleString(
          "de-DE"
        )} Positionen.`
      );
    } catch (e: any) {
      setStatus(`Server-Fehler: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={rlcClass(null, page)}>
      <section className={rlcClass("rlc-page-hero", hero)}>
        <div>
          <div className={rlcClass(null, eyebrow)}>RLC Kalkulation</div>
          <h1 className={rlcClass(null, title)}>LV hochladen / erstellen</h1>
          <p className={rlcClass(null, subtitle)}>
            Leistungsverzeichnis manuell erfassen, CSV importieren, Mengenformeln berechnen
            und direkt an Manuell, KI, Angebot oder Server übergeben.
          </p>
        </div>

        <div className={rlcClass(null, heroMeta)}>
          Projekt: <b>{projectKey || "—"}</b>
          {activeProject?.name || activeProject?.projectName ?
          <span> · {activeProject.name || activeProject.projectName}</span> :
          null}
        </div>
      </section>

      <section className={rlcClass(null, grid4)}>
        <Kpi label="Positionen" value={String(parsedRows.length)} />
        <Kpi label="Fehler Formeln" value={String(errorsCount)} />
        <Kpi label="Netto" value={fmtMoney(totals.netto)} />
        <Kpi label="Brutto" value={fmtMoney(totals.brutto)} />
      </section>

      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, toolbar)}>
          <label className={rlcClass(null, fieldInline)}>
            Projektcode
            <input className={rlcClass(null,
            { ...input, width: 210 })}
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
            placeholder="BA-2026-DEMO" />
            
          </label>

          <label className={rlcClass(null, buttonSecondary)}>
            CSV Import
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"

              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCsv(f);
                if (fileRef.current) fileRef.current.value = "";
              }} className="rlc-migrated-pages-kalkulation-lvupload-tsx-917" />
            
          </label>

          <button className={rlcClass(null, buttonSecondary)} onClick={pasteBulk}>
            Zeilen einfügen
          </button>

          <button className={rlcClass(null, buttonSecondary)} onClick={exportCsv} disabled={!rows.length}>
            CSV
          </button>

          <button className={rlcClass(null, buttonSecondary)} onClick={exportXlsx} disabled={!rows.length}>
            XLS
          </button>

          <button className={rlcClass(null, buttonSecondary)} onClick={addRow}>
            + Zeile
          </button>

          <button className={rlcClass(null, buttonSecondary)} onClick={autoNumber} disabled={!rows.length}>
            Auto-Position
          </button>

          <label className={rlcClass(null, fieldInline)}>
            MwSt %
            <input
              type="number" className={rlcClass(null,
              { ...input, width: 80 })}
              value={mwst}
              onChange={(e) => setMwst(safeNumber(e.target.value))} />
            
          </label>

          <button className={rlcClass(null, buttonDanger)} onClick={clearAll} disabled={!rows.length}>
            Alles löschen
          </button>
        </div>

        <div className={rlcClass(null, toolbar)}>
          <button className={rlcClass(null, buttonPrimary)} onClick={sendToManuell} disabled={!rows.length}>
            → Kalkulation manuell
          </button>

          <button className={rlcClass(null, buttonPrimary)} onClick={sendToKi} disabled={!rows.length}>
            → Kalkulation mit KI
          </button>

          <button className={rlcClass(null, buttonPrimary)} onClick={sendToAngebot} disabled={!rows.length}>
            → Angebot
          </button>

          <button className={rlcClass(null,
          buttonServer)}
          onClick={saveToServer}
          disabled={busy || !rows.length || !projectKey}>
            
            {busy ? "Speichere …" : "Server speichern"}
          </button>

          {status ? <div className={rlcClass(null, statusBox)}>{status}</div> : null}
        </div>
      </section>

      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, sectionHead)}>
          <div>
            <h2 className={rlcClass(null, sectionTitle)}>LV-Positionen</h2>
            <div className={rlcClass(null, sectionText)}>
              Mengen können als Formel eingegeben werden, z. B. <b>12*3+5/2</b>.
            </div>
          </div>
        </div>

        <div className={rlcClass(null, tableWrap)}>
          <table className={rlcClass(null, table)}>
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>Position</th>
                <th className={rlcClass(null, th)}>Kurztext</th>
                <th className={rlcClass(null, th)}>Langtext</th>
                <th className={rlcClass(null, th)}>ME</th>
                <th className={rlcClass(null, th)}>Menge / Formel</th>
                <th className={rlcClass(null, th)}>Menge berechnet</th>
                <th className={rlcClass(null, th)}>EP netto</th>
                <th className={rlcClass(null, th)}>Zeilenpreis</th>
                <th className={rlcClass(null, th)}></th>
              </tr>
            </thead>

            <tbody>
              {parsedRows.map((r) =>
              <tr
                key={r.id} className={rlcClass(null,
                {
                  background: r.error ? "#FEF2F2" : "#FFFFFF"
                })}>
                
                  <td className={rlcClass(null, td)}>
                    <input className={rlcClass(null,
                  { ...cellInput, width: 110 })}
                  value={r.position}
                  onChange={(e) => updateRow(r.id, { position: e.target.value })} />
                  
                  </td>

                  <td className={rlcClass(null, td)}>
                    <input className={rlcClass(null,
                  { ...cellInput, width: "100%" })}
                  value={r.kurztext}
                  onChange={(e) => updateRow(r.id, { kurztext: e.target.value })} />
                  
                  </td>

                  <td className={rlcClass(null, td)}>
                    <input className={rlcClass(null,
                  { ...cellInput, width: "100%" })}
                  value={r.langtext}
                  onChange={(e) => updateRow(r.id, { langtext: e.target.value })} />
                  
                  </td>

                  <td className={rlcClass(null, td)}>
                    <input className={rlcClass(null,
                  { ...cellInput, width: 64 })}
                  value={r.einheit}
                  onChange={(e) => updateRow(r.id, { einheit: e.target.value })} />
                  
                  </td>

                  <td className={rlcClass(null, td)}>
                    <input className={rlcClass(null,
                  {
                    ...cellInput,
                    width: 140,
                    borderColor: r.error ? "#FCA5A5" : "#E5E7EB"
                  })}
                  value={r.menge}
                  onChange={(e) => updateRow(r.id, { menge: e.target.value })}
                  title={r.error || "Mengenformel"} />
                  
                    {r.error ? <div className={rlcClass(null, errorText)}>{r.error}</div> : null}
                  </td>

                  <td className={rlcClass(null, tdRight)}>{fmtQty(r.mengeNum, r.einheitNorm)}</td>

                  <td className={rlcClass(null, tdRight)}>
                    <input
                    type="number"
                    step="0.01" className={rlcClass(null,
                    { ...cellInput, width: 90, textAlign: "right" })}
                    value={r.ep}
                    onChange={(e) => updateRow(r.id, { ep: safeNumber(e.target.value) })} />
                  
                  </td>

                  <td className={rlcClass(null, { ...tdRight, fontWeight: 700 })}>
                    {fmtMoney(r.zeilenpreis)}
                  </td>

                  <td className={rlcClass(null, td)}>
                    <button className={rlcClass(null, buttonMiniDanger)} onClick={() => deleteRow(r.id)}>
                      Löschen
                    </button>
                  </td>
                </tr>
              )}

              {!parsedRows.length ?
              <tr>
                  <td colSpan={9} className={rlcClass(null, { ...td, color: "#64748B", padding: 18 })}>
                    Noch keine LV-Zeilen vorhanden. Importiere eine CSV oder füge manuell eine Zeile hinzu.
                  </td>
                </tr> :
              null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={rlcClass(null, totalsBar)}>
        <div className={rlcClass(null, sumBox)}>
          <div className={rlcClass(null, sumLabel)}>Netto</div>
          <div className={rlcClass(null, sumValue)}>{fmtMoney(totals.netto)}</div>
        </div>

        <div className={rlcClass(null, sumBox)}>
          <div className={rlcClass(null, sumLabel)}>MwSt</div>
          <div className={rlcClass(null, sumValue)}>{fmtMoney(totals.steuer)}</div>
        </div>

        <div className={rlcClass(null, sumBox)}>
          <div className={rlcClass(null, sumLabel)}>Brutto</div>
          <div className={rlcClass(null, sumValue)}>{fmtMoney(totals.brutto)}</div>
        </div>
      </section>
    </div>);

}

function Kpi({ label, value }: {label: string;value: string;}) {
  return (
    <div className={rlcClass(null, kpiCard)}>
      <div className={rlcClass(null, kpiLabel)}>{label}</div>
      <div className={rlcClass(null, kpiValue)}>{value}</div>
    </div>);

}

/* ================= STYLES ================= */

const page: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 16
};

const hero: React.CSSProperties = {
  background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
  color: "#FFFFFF",
  borderRadius: 18,
  padding: 22,
  display: "grid",
  gap: 12,
  boxShadow: "0 16px 40px rgba(15,23,42,0.18)"
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.82,
  fontWeight: 700
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  fontWeight: 700
};

const subtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 860,
  opacity: 0.9,
  lineHeight: 1.55
};

const heroMeta: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.92
};

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
  gap: 12
};

const kpiCard: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};

const kpiLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em"
};

const kpiValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 22,
  color: "#0F172A",
  fontWeight: 700
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap"
};

const fieldInline: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "#475569",
  fontWeight: 700
};

const input: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 13,
  background: "#FFFFFF",
  boxSizing: "border-box"
};

const buttonBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 13px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const buttonSecondary: React.CSSProperties = {
  ...buttonBase,
  background: "#FFFFFF",
  color: "#0F172A"
};

const buttonPrimary: React.CSSProperties = {
  ...buttonBase,
  background: "#146EF5",
  borderColor: "#146EF5",
  color: "#FFFFFF"
};

const buttonServer: React.CSSProperties = {
  ...buttonBase,
  background: "#0F766E",
  borderColor: "#0F766E",
  color: "#FFFFFF"
};

const buttonDanger: React.CSSProperties = {
  ...buttonBase,
  background: "#FEF2F2",
  borderColor: "#FECACA",
  color: "#B91C1C"
};

const buttonMiniDanger: React.CSSProperties = {
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer"
};

const statusBox: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  background: "#F8FAFC",
  border: "1px solid #E5E7EB",
  color: "#475569",
  fontSize: 13,
  fontWeight: 600
};

const sectionHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 17,
  color: "#0F172A",
  fontWeight: 700
};

const sectionText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#64748B"
};

const tableWrap: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #E5E7EB",
  borderRadius: 12
};

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 1180,
  borderCollapse: "collapse"
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 9px",
  fontSize: 12,
  color: "#475569",
  background: "#F8FAFC",
  borderBottom: "1px solid #E5E7EB",
  whiteSpace: "nowrap"
};

const td: React.CSSProperties = {
  padding: "8px 9px",
  fontSize: 12,
  borderBottom: "1px solid #F1F5F9",
  verticalAlign: "middle"
};

const tdRight: React.CSSProperties = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap"
};

const cellInput: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  background: "#FFFFFF",
  boxSizing: "border-box"
};

const errorText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: "#B91C1C",
  fontWeight: 600
};

const totalsBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
  flexWrap: "wrap"
};

const sumBox: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: "14px 16px",
  minWidth: 220,
  background: "#FFFFFF"
};

const sumLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em"
};

const sumValue: React.CSSProperties = {
  marginTop: 5,
  fontSize: 18,
  color: "#0F172A",
  fontWeight: 700
};
