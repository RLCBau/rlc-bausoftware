import { rlcClass } from "../../ui/rlcRuntimeStyle";import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import { listDocuments, getDocumentViewUrl, initDocument, uploadFileDirect, detectKind, type DocumentDto } from "../../api/files";
import { accountingApi, getAccountingProject } from "./accountingApi";

type ReportTyp =
"Rechnung" |
"Regiebericht" |
"Nachtrag" |
"Abrechnung" |
"Prüfbericht" |
"Sonstiges";

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
!n ?
"–" :
n < 1024 ?
`${n} B` :
n < 1024 * 1024 ?
`${(n / 1024).toFixed(1)} KB` :
`${(n / 1024 / 1024).toFixed(1)} MB`;

const fmtDate = (d = new Date()) => d.toLocaleDateString("de-DE");

function safeTrim(v: unknown) {
  return String(v ?? "").trim();
}

function escapeHtml(str: string) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (m) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[m]!
  );
}

const parseDE = (s: string) => {
  const value = safeTrim(s);
  if (!value) return new Date("1970-01-01");

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
    const [d, m, y] = value.split(".").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? new Date("1970-01-01") : dt;
};

const withinDays = (d: Date, days: number) => {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - days);
  return d >= from;
};

const isSameMonth = (d: Date, ref: Date) =>
d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();

function csvEscape(v: unknown) {
  const raw = String(v ?? "");
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(raw) && !/^-?\d+(?:[.,]\d+)?$/.test(raw.trim()) ? "'" + raw : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function Reports() {
  // No fictional accounting reports in the production workspace.
  const [rows, setRows] = useState<Report[]>([]);
  const [dmsRows, setDmsRows] = useState<DocumentDto[]>([]);
  const [dmsBusy, setDmsBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dmsError, setDmsError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const projectKey = getAccountingProject();
  const [projectId, setProjectId] = useState("");
  useEffect(() => {
    let active = true;
    setProjectId(""); setDmsRows([]);
    accountingApi("/api/accounting/projects").then(result => {
      if (!active) return;
      const found = (result.items || []).find((p: any) => p.id === projectKey || p.code === projectKey);
      if (!found?.id) throw new Error("Projekt nicht verfügbar oder kein Zugriff.");
      setProjectId(String(found.id));
    }).catch(error => { if (active) setDmsError(error?.message || "Projekt nicht verfügbar"); });
    return () => { active = false; };
  }, [projectKey]);
  const reloadDms = async () => {
    if (!projectId) return;
    setDmsBusy(true); setDmsError("");
    try { setDmsRows((await listDocuments(projectId)).filter(d => !d.deletedAt)); }
    catch (error: any) { setDmsRows([]); setDmsError(error?.message || "DMS nicht erreichbar"); }
    finally { setDmsBusy(false); }
  };
  useEffect(() => { void reloadDms(); }, [projectId]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const openDmsDocument = async (id: string, name: string) => {
    if (downloadingId) return;
    setDownloadingId(id); setDmsError(""); setUploadMessage("");
    try {
      const result = await getDocumentViewUrl(id);
      if (!result?.url) throw new Error("Download-Link nicht verfügbar.");
      const link = document.createElement("a");
      link.href = result.url;
      link.download = name.replace(/[\\/]/g, "_") || "dokument";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setUploadMessage(`Download für ${name} an den Browser übergeben.`);
      window.setTimeout(() => URL.revokeObjectURL(result.url), 60000);
    } catch (error: any) {
      setDmsError(error?.message || "Dokument konnte nicht heruntergeladen werden.");
    } finally { setDownloadingId(null); }
  };

  const [zeitraum, setZeitraum] = useState<Zeitraum>("THIS_MONTH");
  const [typ, setTyp] = useState<ReportTyp | "ALL">("ALL");
  const [status, setStatus] = useState<"ALL" | Report["status"]>("ALL");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let arr = rows.slice();

    arr = arr.filter((r) => {
      const d = parseDE(r.datum);
      switch (zeitraum) {
        case "30":
          return withinDays(d, 30);
        case "60":
          return withinDays(d, 60);
        case "90":
          return withinDays(d, 90);
        case "THIS_MONTH":
          return isSameMonth(d, new Date());
        case "YTD":
          return d.getFullYear() === new Date().getFullYear();
        default:
          return true;
      }
    });

    if (typ !== "ALL") arr = arr.filter((r) => r.typ === typ);
    if (status !== "ALL") arr = arr.filter((r) => r.status === status);

    if (query.trim()) {
      const q = query.toLowerCase().trim();
      arr = arr.filter((r) =>
      [
      r.titel,
      r.nummer,
      r.projekt || "",
      r.kostenstelle || "",
      r.dateiname || "",
      r.bearbeiter || ""].

      join(" ").
      toLowerCase().
      includes(q)
      );
    }

    arr.sort((a, b) => parseDE(b.datum).getTime() - parseDE(a.datum).getTime());
    return arr;
  }, [rows, zeitraum, typ, status, query]);

  const total = filtered.length;

  const fileRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || uploading) return;
    if (!projectId) { setDmsError("Bitte zuerst ein verfügbares Projekt auswählen."); return; }
    setUploading(true);
    setDmsError("");
    setUploadMessage("");
    const errors: string[] = [];
    let saved = 0;
    try {
      for (const file of Array.from(files)) {
        try {
          const created = await initDocument(projectId, detectKind(file), file.name);
          if (!created.documentId) throw new Error("Dokument-ID fehlt");
          await uploadFileDirect(created.documentId, file);
          saved += 1;
        } catch (error: any) { errors.push(`${file.name}: ${error?.message || "Upload fehlgeschlagen"}`); }
      }
      await reloadDms();
      if (saved) setUploadMessage(`${saved} Datei(en) im Projekt-DMS gespeichert.`);
      if (errors.length) setDmsError(errors.join(" · "));
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHover(false);
    addFiles(e.dataTransfer.files);
  };

  const exportCSV = (useFiltered: boolean) => {
    const list = useFiltered ? filtered : rows;
    if (!list.length) {
      alert("Keine Daten für den Export vorhanden.");
      return;
    }

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
      Größe: fmtSize(r.size)
    }));

    const headers = Object.keys(data[0]);
    const csv = [
    headers.map(csvEscape).join(";"),
    ...data.map((d) =>
    headers.map((h) => csvEscape((d as Record<string, unknown>)[h])).join(";")
    )].
    join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = useFiltered ? "reports_gefiltert.csv" : "reports_alle.csv";
    a.click();
    URL.revokeObjectURL(href);
  };

  function openPrint(html: string) {
    const w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
    if (!w) {
      alert("Pop-ups blockiert – bitte zulassen!");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      try {
        w.print();
      } catch {}
    }, 400);
  }

  const printList = (useFiltered: boolean) =>
  openPrint(printableHTML(useFiltered ? filtered : rows));

  const remove = (id: number) => {
    setRows((p) => {
      const found = p.find((r) => r.id === id);
      if (found?.url?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(found.url);
        } catch {}
      }
      return p.filter((r) => r.id !== id);
    });
  };

  const update = <K extends keyof Report,>(i: number, key: K, val: Report[K]) => {
    setRows((p) => {
      const c = [...p];
      if (!c[i]) return p;
      c[i] = { ...c[i], [key]: val };
      return c;
    });
  };

  const [preview, setPreview] = useState<{url: string;name: string;} | null>(null);

  useEffect(() => {
    return () => {
      rows.forEach((r) => {
        if (r.url?.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(r.url);
          } catch {}
        }
      });
    };
  }, [rows]);

  const isPdfPreview = preview ? /\.pdf$/i.test(preview.name) : false;

  return (
    <div className="bh-page">
      <section className="bh-card">
        <div className="bh-header-row"><h3>Projekt-DMS · gespeicherte Dokumente</h3><button className="bh-btn ghost" disabled={dmsBusy} onClick={() => void reloadDms()}>Aktualisieren</button></div>
        <div className="bh-note">Projekt: {projectId} · Dokumente aus dem zentralen DMS. Neue Dateien werden über den gesicherten DMS-Upload gespeichert; die Report-Arbeitsliste darunter ist separat.</div>
        {uploadMessage && <div role="status" className="bh-note">{uploadMessage}</div>}
        {dmsError && <div role="alert" className="bh-note">{dmsError}</div>}
        <div style={{overflowX:"auto"}}><table className="bh-table"><thead><tr><th>Dokument</th><th>Typ</th><th>Aktualisiert</th><th>Aktion</th></tr></thead><tbody>
          {dmsRows.map(doc => <tr key={doc.id}><td>{doc.name}</td><td>{doc.kind}</td><td>{doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString("de-DE") : "—"}</td><td><button className="bh-btn ghost" disabled={!!downloadingId} onClick={() => void openDmsDocument(doc.id, doc.name)}>{downloadingId === doc.id ? "Lädt…" : "Herunterladen"}</button></td></tr>)}
          {!dmsRows.length && <tr><td colSpan={4}>{dmsBusy ? "Lade Dokumente…" : "Keine gespeicherten Dokumente gefunden."}</td></tr>}
        </tbody></table></div>
      </section>
      <div className="bh-header-row">
        <h2>Report-Arbeitsliste · temporäre Einträge</h2>
        <div className="bh-actions">
          <button className="bh-btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? "DMS-Upload läuft…" : "+ Im DMS speichern"}
          </button>
          <button className="bh-btn ghost" onClick={() => exportCSV(true)}>
            Export CSV (gefiltert)
          </button>
          <button className="bh-btn ghost" onClick={() => printList(true)}>
            PDF Liste (gefiltert)
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple

        onChange={(e) => addFiles(e.target.files)} className="rlc-migrated-pages-buchhaltung-reports-tsx-283" />
      

      <div

        onDragEnter={(e) => {
          setHover(true);
          e.preventDefault();
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setHover(false)}
        onDrop={onDrop} className={rlcClass("bh-dropzone",
          {
            border: "1px dashed #ccc",
            borderRadius: 6,
            padding: 14,
            marginBottom: 12,
            background: hover ? "rgba(0,0,0,0.05)" : "transparent",
            cursor: "pointer"
          })}
        onClick={() => fileRef.current?.click()}>
        
        📎 Datei hier ablegen oder klicken, um im Projekt-DMS zu speichern
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
          <select value={typ} onChange={(e) => setTyp(e.target.value as ReportTyp | "ALL")}>
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
          <select value={status} onChange={(e) => setStatus(e.target.value as "ALL" | Report["status"])}>
            <option value="ALL">Alle</option>
            <option value="offen">Offen</option>
            <option value="in Prüfung">In Prüfung</option>
            <option value="abgeschlossen">Abgeschlossen</option>
          </select>
        </div>

        <div>
          <label>Suche</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Titel / Projekt / Kostenstelle" />
          
        </div>

        <div className="rlc-migrated-pages-buchhaltung-reports-tsx-284">{total} Reports</div>
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
                  <button
                    className="bh-btn rlc-migrated-pages-buchhaltung-reports-tsx-285"

                    onClick={() => remove(r.id)}>
                    
                    Löschen
                  </button>
                </td>

                <td>{r.nummer}</td>

                <td>
                  <input
                    type="text"
                    value={r.titel}
                    onChange={(e) => update(i, "titel", e.target.value)} className="rlc-migrated-pages-buchhaltung-reports-tsx-286" />

                  
                </td>

                <td>{r.typ}</td>

                <td>
                  <input
                    type="text"
                    value={r.projekt || ""}
                    onChange={(e) => update(i, "projekt", e.target.value)} className="rlc-migrated-pages-buchhaltung-reports-tsx-287" />

                  
                </td>

                <td>
                  <input
                    type="text"
                    value={r.kostenstelle || ""}
                    onChange={(e) => update(i, "kostenstelle", e.target.value)} className="rlc-migrated-pages-buchhaltung-reports-tsx-288" />

                  
                </td>

                <td>{r.datum}</td>

                <td className="rlc-migrated-pages-buchhaltung-reports-tsx-289">{r.version}</td>

                <td>{r.bearbeiter}</td>

                <td>
                  <select
                    value={r.status}
                    onChange={(e) => update(i, "status", e.target.value as Report["status"])}>
                    
                    <option value="offen">offen</option>
                    <option value="in Prüfung">in Prüfung</option>
                    <option value="abgeschlossen">abgeschlossen</option>
                  </select>
                </td>

                <td>{r.dateiname || "–"}</td>
                <td className="right">{fmtSize(r.size)}</td>

                <td>
                  {r.url ?
                  <button
                    className="bh-btn ghost"
                    onClick={() =>
                    setPreview({
                      url: r.url!,
                      name: r.dateiname || r.titel
                    })
                    }>
                    
                      Öffnen
                    </button> :

                  <span className="bh-text-muted">–</span>
                  }
                </td>
              </tr>);

          })}

          {filtered.length === 0 &&
          <tr>
              <td colSpan={13} className="rlc-migrated-pages-buchhaltung-reports-tsx-290">
                Keine Reports im aktuellen Filter.
              </td>
            </tr>
          }
        </tbody>
      </table>

      {preview &&
      <div









        onClick={() => setPreview(null)} className="rlc-migrated-pages-buchhaltung-reports-tsx-291">
        
          <div









          onClick={(e) => e.stopPropagation()} className="rlc-migrated-pages-buchhaltung-reports-tsx-292">
          
            <div className="rlc-migrated-pages-buchhaltung-reports-tsx-293">






            
              <strong>{preview.name}</strong>
              <button className="bh-btn" onClick={() => setPreview(null)}>
                Schließen
              </button>
            </div>

            <div className="rlc-migrated-pages-buchhaltung-reports-tsx-294">
              {isPdfPreview ?
            <iframe
              src={preview.url}

              title="Report PDF" className="rlc-migrated-pages-buchhaltung-reports-tsx-295" /> :


            <img
              src={preview.url}
              alt="Preview" className="rlc-migrated-pages-buchhaltung-reports-tsx-296" />


            }
            </div>
          </div>
        </div>
      }
    </div>);

}

function printableHTML(list: Report[]) {
  const body = list.
  map(
    (r) => `
    <tr>
      <td>${escapeHtml(r.nummer)}</td>
      <td>${escapeHtml(r.titel)}</td>
      <td>${escapeHtml(r.typ)}</td>
      <td>${escapeHtml(r.projekt || "")}</td>
      <td>${escapeHtml(r.kostenstelle || "")}</td>
      <td>${escapeHtml(r.datum)}</td>
      <td>${escapeHtml(r.status)}</td>
      <td>${escapeHtml(r.bearbeiter || "")}</td>
    </tr>`
  ).
  join("");

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
    <tbody>${body || `<tr><td colspan="8">Keine Daten.</td></tr>`}</tbody>
  </table>
  <div style="margin-top:10px;color:#555">Erstellt am ${new Date().toLocaleString("de-DE")}</div>
  </body></html>`;
}
