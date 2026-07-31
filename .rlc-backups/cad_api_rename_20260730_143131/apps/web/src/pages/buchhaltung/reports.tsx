import React, { useMemo, useRef, useState } from "react";
import "./styles.css";

type ReportTyp = "Rechnung" | "Regiebericht" | "Nachtrag" | "Abrechnung" | "Prüfbericht" | "Sonstiges";

type Report = {
  id: number;
  nummer: string;
  titel: string;
  typ: ReportTyp;
  projekt?: string;
  kostenstelle?: string;
  datum: string;
  version: number;
  bearbeiter?: string;
  status: "offen" | "in Prüfung" | "abgeschlossen";
  dateiname?: string;
  url?: string;
  size?: number;
};

type Zeitraum = "ALL" | "30" | "60" | "90" | "THIS_MONTH" | "YTD";

const fmtSize = (n?: number) =>
  !n ? "–" : n < 1024
    ? `${n} B`
    : n < 1024 * 1024
    ? `${(n / 1024).toFixed(1)} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;

const fmtDate = (d = new Date()) => d.toLocaleDateString("de-DE");

const parseDE = (s: string) => {
  if (!s) return new Date("1970-01-01");
  const [d, m, y] = s.split(".").map(Number);
  return new Date(y, m - 1, d);
};
const withinDays = (d: Date, days: number) => {
  const from = new Date();
  from.setDate(from.getDate() - days);
  return d >= from;
};
const isSameMonth = (d: Date, ref: Date) =>
  d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();

export default function Reports() {
  const [rows, setRows] = useState<Report[]>([
    { id: 1, nummer: "RPT-001", titel: "Abrechnung Oktober", typ: "Abrechnung", projekt: "BA III", kostenstelle: "Erdarbeiten", datum: "25.10.2025", version: 1, bearbeiter: "Müller", status: "in Prüfung" },
    { id: 2, nummer: "RPT-002", titel: "Regiebericht 12.10", typ: "Regiebericht", projekt: "Parkplatz Süd", kostenstelle: "Leitungen", datum: "12.10.2025", version: 1, bearbeiter: "Kraus", status: "abgeschlossen" },
    { id: 3, nummer: "RPT-003", titel: "Nachtrag DN200", typ: "Nachtrag", projekt: "BA IV", kostenstelle: "Rohrbau", datum: "20.10.2025", version: 2, bearbeiter: "Schmidt", status: "offen" },
  ]);

  const [zeitraum, setZeitraum] = useState<Zeitraum>("THIS_MONTH");
  const [typ, setTyp] = useState<ReportTyp | "ALL">("ALL");
  const [status, setStatus] = useState<"ALL" | Report["status"]>("ALL");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let arr = rows.slice();
    arr = arr.filter((r) => {
      const d = parseDE(r.datum);
      switch (zeitraum) {
        case "30": return withinDays(d, 30);
        case "60": return withinDays(d, 60);
        case "90": return withinDays(d, 90);
        case "THIS_MONTH": return isSameMonth(d, new Date());
        case "YTD": return d.getFullYear() === new Date().getFullYear();
        default: return true;
      }
    });
    if (typ !== "ALL") arr = arr.filter((r) => r.typ === typ);
    if (status !== "ALL") arr = arr.filter((r) => r.status === status);
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter(
        (r) =>
          r.titel.toLowerCase().includes(q) ||
          r.nummer.toLowerCase().includes(q) ||
          (r.projekt || "").toLowerCase().includes(q) ||
          (r.kostenstelle || "").toLowerCase().includes(q)
      );
    }
    arr.sort((a, b) => parseDE(b.datum).getTime() - parseDE(a.datum).getTime());
    return arr;
  }, [rows, zeitraum, typ, status, query]);

  const total = filtered.length;

  const fileRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    let nextId = rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
    const added: Report[] = Array.from(files).map((f) => ({
      id: nextId++,
      nummer: `RPT-${String(nextId).padStart(3, "0")}`,
      titel: f.name.replace(/\.[^.]+$/, ""),
      typ: "Sonstiges",
      datum: fmtDate(),
      version: 1,
      status: "offen",
      bearbeiter: "System",
      dateiname: f.name,
      size: f.size,
      url: URL.createObjectURL(f),
    }));
    setRows((p) => [...added, ...p]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHover(false);
    addFiles(e.dataTransfer.files);
  };

  const exportCSV = (useFiltered: boolean) => {
    const list = useFiltered ? filtered : rows;
    if (!list.length) return;
    const data = list.map((r) => ({
      Nummer: r.nummer,
      Titel: r.titel,
      Typ: r.typ,
      Projekt: r.projekt || "",
      Kostenstelle: r.kostenstelle || "",
      Datum: r.datum,
      Version: r.version,
      Bearbeiter: r.bearbeiter || "",
      Status: r.status,
      Datei: r.dateiname || "",
      Größe: fmtSize(r.size),
    }));
    const headers = Object.keys(data[0]);
    const csv = [headers.join(";"), ...data.map((d) => headers.map((h) => (d as any)[h]).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = useFiltered ? "reports_gefiltert.csv" : "reports_alle.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  function openPrint(html: string) {
    const w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
    if (!w) return alert("Pop-ups blockiert – bitte zulassen!");
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 400);
  }

  const printList = (useFiltered: boolean) => openPrint(printableHTML(useFiltered ? filtered : rows));

  const remove = (id: number) => setRows((p) => p.filter((r) => r.id !== id));
  const update = <K extends keyof Report>(i: number, key: K, val: Report[K]) => {
    setRows((p) => { const c = [...p]; (c[i] as any)[key] = val; return c; });
  };

  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  return (
    <div className="bh-page">
      <div className="bh-header-row">
        <h2>Reports verwalten</h2>
        <div className="bh-actions">
          <button className="bh-btn" onClick={() => fileRef.current?.click()}>+ Datei hochladen</button>
          <button className="bh-btn ghost" onClick={() => exportCSV(true)}>Export CSV (gefiltert)</button>
          <button className="bh-btn ghost" onClick={() => printList(true)}>PDF Liste (gefiltert)</button>
        </div>
      </div>

      <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />
      <div
        className="bh-dropzone"
        onDragEnter={(e) => { setHover(true); e.preventDefault(); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setHover(false)}
        onDrop={onDrop}
        style={{
          border: "1px dashed #ccc",
          borderRadius: 6,
          padding: 14,
          marginBottom: 12,
          background: hover ? "rgba(0,0,0,0.05)" : "transparent",
          cursor: "pointer",
        }}
        onClick={() => fileRef.current?.click()}
      >
        📎 Datei hier ablegen oder klicken zum Hochladen
      </div>

      <div className="bh-filters">
        <div>
          <label>Zeitraum</label>
          <select value={zeitraum} onChange={(e) => setZeitraum(e.target.value as Zeitraum)}>
            <option value="THIS_MONTH">Dieser Monat</option>
            <option value="30">Letzte 30 Tage</option>
            <option value="60">Letzte 60 Tage</option>
            <option value="90">Letzte 90 Tage</option>
            <option value="YTD">YTD</option>
            <option value="ALL">Alle</option>
          </select>
        </div>
        <div>
          <label>Typ</label>
          <select value={typ} onChange={(e) => setTyp(e.target.value as any)}>
            <option value="ALL">Alle</option>
            <option value="Abrechnung">Abrechnung</option>
            <option value="Regiebericht">Regiebericht</option>
            <option value="Nachtrag">Nachtrag</option>
            <option value="Prüfbericht">Prüfbericht</option>
            <option value="Rechnung">Rechnung</option>
            <option value="Sonstiges">Sonstiges</option>
          </select>
        </div>
        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="ALL">Alle</option>
            <option value="offen">Offen</option>
            <option value="in Prüfung">In Prüfung</option>
            <option value="abgeschlossen">Abgeschlossen</option>
          </select>
        </div>
        <div>
          <label>Suche</label>
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Titel / Projekt / Kostenstelle" />
        </div>
        <div style={{ alignSelf: "end", fontWeight: 600 }}>{total} Reports</div>
      </div>

      <table className="bh-table">
        <thead>
          <tr>
            <th>Aktionen</th>
            <th>Nummer</th>
            <th>Titel</th>
            <th>Typ</th>
            <th>Projekt</th>
            <th>Kostenstelle</th>
            <th>Datum</th>
            <th>Version</th>
            <th>Bearbeiter</th>
            <th>Status</th>
            <th>Datei</th>
            <th>Größe</th>
            <th>Preview</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const i = rows.findIndex((x) => x.id === r.id);
            return (
              <tr key={r.id}>
                <td>
                  <button className="bh-btn" style={{ background: "#e74c3c" }} onClick={() => remove(r.id)}>Löschen</button>
                </td>
                <td>{r.nummer}</td>
                <td><input type="text" value={r.titel} onChange={(e) => update(i, "titel", e.target.value)} style={{ minWidth: 180 }} /></td>
                <td>{r.typ}</td>
                <td><input type="text" value={r.projekt || ""} onChange={(e) => update(i, "projekt", e.target.value)} style={{ width: 140 }} /></td>
                <td><input type="text" value={r.kostenstelle || ""} onChange={(e) => update(i, "kostenstelle", e.target.value)} style={{ width: 140 }} /></td>
                <td>{r.datum}</td>
                <td style={{ textAlign: "center", fontWeight: 600 }}>{r.version}</td>
                <td>{r.bearbeiter}</td>
                <td>
                  <select value={r.status} onChange={(e) => update(i, "status", e.target.value as any)}>
                    <option value="offen">offen</option>
                    <option value="in Prüfung">in Prüfung</option>
                    <option value="abgeschlossen">abgeschlossen</option>
                  </select>
                </td>
                <td>{r.dateiname || "–"}</td>
                <td className="right">{fmtSize(r.size)}</td>
                <td>
                  {r.url ? (
                    <button className="bh-btn ghost" onClick={() => setPreview({ url: r.url!, name: r.dateiname || r.titel })}>
                      Öffnen
                    </button>
                  ) : (
                    <span className="bh-text-muted">–</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {preview && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setPreview(null)}
        >
          <div style={{ background: "#fff", width: "85vw", height: "85vh", borderRadius: 8, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: 10, display: "flex", justifyContent: "space-between", borderBottom: "1px solid #ccc" }}>
              <strong>{preview.name}</strong>
              <button className="bh-btn" onClick={() => setPreview(null)}>Schließen</button>
            </div>
            <div style={{ flex: 1 }}>
              {/\.pdf$/i.test(preview.name) ? (
                <iframe src={preview.url} style={{ width: "100%", height: "100%", border: 0 }} title="Report PDF" />
              ) : (
                <img src={preview.url} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function printableHTML(list: Report[]) {
  const body = list.map(
    (r) => `
    <tr>
      <td>${r.nummer}</td>
      <td>${r.titel}</td>
      <td>${r.typ}</td>
      <td>${r.projekt || ""}</td>
      <td>${r.kostenstelle || ""}</td>
      <td>${r.datum}</td>
      <td>${r.status}</td>
      <td>${r.bearbeiter || ""}</td>
    </tr>`
  ).join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Reports</title>
  <style>
  body{font-family:Arial, sans-serif;margin:32px;color:#222}
  h1{margin:0 0 12px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}
  th{background:#f5f5f5}
  </style></head><body>
  <h1>Reports – Übersicht</h1>
  <table>
    <thead><tr><th>Nummer</th><th>Titel</th><th>Typ</th><th>Projekt</th><th>Kostenstelle</th><th>Datum</th><th>Status</th><th>Bearbeiter</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <div style="margin-top:10px;color:#555">Erstellt am ${new Date().toLocaleString("de-DE")}</div>
  </body></html>`;
}
