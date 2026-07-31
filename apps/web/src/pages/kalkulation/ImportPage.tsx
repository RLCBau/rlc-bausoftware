import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/kalkulation/ImportPage.tsx
import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LV, type LVPos } from "./store.lv";
import { useProject } from "../../store/useProject";

type ImportType = "GAEB" | "CSV" | "LV" | "PREISE" | "CAD" | "UNKNOWN";

type ImportLog = {
  id: string;
  type: ImportType;
  fileName: string;
  count: number;
  status: "ok" | "warning" | "error";
  message: string;
  createdAt: string;
};

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `imp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function getProjectKey(projectCtx: any): string {
  const p =
  projectCtx?.project ||
  projectCtx?.currentProject ||
  projectCtx?.selectedProject ||
  projectCtx?.current ||
  projectCtx;

  return String(
    p?.code ||
    p?.projectCode ||
    p?.number ||
    projectCtx?.projectCode ||
    p?.id ||
    projectCtx?.projectId ||
    ""
  ).trim();
}

function detectType(fileName: string): ImportType {
  const n = fileName.toLowerCase();

  if (/\.(x80|x81|x82|x83|x84|x85|x86|x94|p81|p82|p83|p84|p85|p86|d81|d82|d83|d84|d85|d86|gaeb|xml)$/i.test(n)) {
    return "GAEB";
  }

  if (n.endsWith(".csv")) return "CSV";
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return "LV";
  if (n.endsWith(".dxf") || n.endsWith(".dwg") || n.endsWith(".landxml")) return "CAD";

  return "UNKNOWN";
}

function csvEscape(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function ImportPage() {
  const nav = useNavigate();
  const projectCtx: any = useProject() as any;
  const projectKey = getProjectKey(projectCtx);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [info, setInfo] = useState("");

  function addLog(log: Omit<ImportLog, "id" | "createdAt">) {
    setLogs((prev) => [
    {
      id: uid(),
      createdAt: new Date().toLocaleString("de-DE"),
      ...log
    },
    ...prev]
    );
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;

    setBusy(true);
    setInfo("");

    for (const file of Array.from(files)) {
      const type = detectType(file.name);

      try {
        if (type === "CSV") {
          const text = await file.text();
          const count = LV.importCSV(text);

          addLog({
            type,
            fileName: file.name,
            count,
            status: "ok",
            message: `${count} Positionen lokal ins LV importiert.`
          });

          setInfo(`CSV importiert: ${count} Positionen.`);
          continue;
        }

        if (type === "GAEB") {
          if (!projectKey) {
            addLog({
              type,
              fileName: file.name,
              count: 0,
              status: "error",
              message: "Projekt fehlt. GAEB-Import benötigt ein aktives Projekt."
            });
            continue;
          }

          const form = new FormData();
          form.append("file", file);

          const res = await fetch(
            `/api/project-lv/${encodeURIComponent(projectKey)}/import-file`,
            {
              method: "POST",
              body: form,
              credentials: "include"
            }
          );

          const json = await res.json().catch(() => null);

          if (!res.ok) {
            throw new Error(json?.error || `Serverfehler ${res.status}`);
          }

          const rows =
          json?.rows ||
          json?.items ||
          json?.positions ||
          json?.data?.rows ||
          json?.data?.items ||
          [];

          const mapped: LVPos[] = Array.isArray(rows) ?
          rows.map((r: any) => ({
            id: uid(),
            posNr: String(
              r.posNr ?? r.pos ?? r.position ?? r.positionsnummer ?? ""
            ),
            parentPosNr: String(r.parentPosNr ?? ""),
            kurztext: String(r.kurztext ?? r.shortText ?? r.text ?? ""),
            langtext: String(
              r.langtext ?? r.longText ?? r.description ?? ""
            ),
            bemerkung: String(r.bemerkung ?? r.note ?? ""),
            einheit: String(r.einheit ?? r.unit ?? r.me ?? ""),
            menge: Number(r.menge ?? r.quantity ?? r.qty ?? 0),
            preis:
            r.preis != null || r.ep != null ?
            Number(r.preis ?? r.ep) :
            undefined,
            gesamt:
            r.gesamt != null || r.total != null ?
            Number(r.gesamt ?? r.total) :
            undefined,
            waehrung: String(r.waehrung ?? r.currency ?? "EUR"),
            confidence:
            r.confidence != null ? Number(r.confidence) : undefined,
            source: "gaeb"
          })) :
          [];

          if (mapped.length) {
            LV.bulkUpsert(mapped);
          }

          addLog({
            type,
            fileName: file.name,
            count: mapped.length,
            status: mapped.length ? "ok" : "warning",
            message: mapped.length ?
            `${mapped.length} GAEB-Positionen übernommen.` :
            "GAEB erkannt, aber keine Positionen zurückgegeben."
          });

          setInfo(`GAEB verarbeitet: ${mapped.length} Positionen.`);
          continue;
        }

        addLog({
          type,
          fileName: file.name,
          count: 0,
          status: "warning",
          message:
          "Dateityp erkannt, aber dieser Import läuft über das Spezialmodul."
        });
      } catch (e: any) {
        addLog({
          type,
          fileName: file.name,
          count: 0,
          status: "error",
          message: e?.message || String(e)
        });
      }
    }

    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function exportLogCsv() {
    const head = "Datum;Typ;Datei;Anzahl;Status;Meldung";
    const body = logs.
    map((l) =>
    [
    csvEscape(l.createdAt),
    csvEscape(l.type),
    csvEscape(l.fileName),
    csvEscape(l.count),
    csvEscape(l.status),
    csvEscape(l.message)].
    join(";")
    ).
    join("\n");

    const blob = new Blob([`${head}\n${body}`], {
      type: "text/csv;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rlc_import_log.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={rlcClass(null, page)}>
      <section className={rlcClass("rlc-page-hero", hero)}>
        <div>
          <div className={rlcClass(null, eyebrow)}>RLC Kalkulation</div>
          <h1 className={rlcClass(null, title)}>Import-Zentrale</h1>
          <p className={rlcClass(null, subtitle)}>
            Zentrale Importseite für GAEB, CSV, LV-Dateien, Preise und CAD-Daten.
            Importierte LV-Positionen werden direkt mit der Kalkulation
            verbunden.
          </p>
        </div>

        <div className={rlcClass(null, heroActions)}>
          <button className={rlcClass(null, btnPrimary)} onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? "Import läuft…" : "Dateien importieren"}
          </button>

          <button className={rlcClass(null, btnSecondary)} onClick={() => nav("/kalkulation/gaeb")}>
            GAEB Spezialimport
          </button>

          <button className={rlcClass(null, btnSecondary)} onClick={() => nav("/kalkulation/lv-upload")}>
            LV hochladen / erstellen
          </button>

          <button className={rlcClass(null, btnSecondary)} onClick={() => nav("/kalkulation/preise")}>
            Preise einfügen
          </button>
        </div>

        <div className={rlcClass(null, meta)}>
          Projekt: <b>{projectKey || "—"}</b>
          {info ? <span> · {info}</span> : null}
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls,.xml,.x80,.x81,.x82,.x83,.x84,.x85,.x86,.x94,.p81,.p82,.p83,.p84,.p85,.p86,.d81,.d82,.d83,.d84,.d85,.d86,.gaeb,.dxf,.dwg,.landxml"

          onChange={(e) => handleFiles(e.target.files)} className="rlc-migrated-pages-kalkulation-importpage-tsx-821" />
        
      </section>

      <section className={rlcClass(null, grid)}>
        <ImportCard
          title="GAEB"
          text="X83, X84, X86, P83, D83 und XML projektbezogen importieren."
          action="GAEB öffnen"
          onClick={() => nav("/kalkulation/gaeb")} />
        
        <ImportCard
          title="CSV / LV"
          text="Einfache Positionslisten übernehmen und in Manuell oder KI weiterbearbeiten."
          action="LV öffnen"
          onClick={() => nav("/kalkulation/lv-upload")} />
        
        <ImportCard
          title="Preise"
          text="Material, Arbeiter und Maschinen in den Katalog oder Firmenpreise übernehmen."
          action="Preise öffnen"
          onClick={() => nav("/kalkulation/preise")} />
        
        <ImportCard
          title="KI-Kalkulation"
          text="Importierte Positionen direkt mit Elite-KI kalkulieren."
          action="KI öffnen"
          onClick={() => nav("/kalkulation/mit-ki")} />
        
      </section>

      <section className={rlcClass(null, card)}>
        <div className={rlcClass(null, sectionHead)}>
          <div>
            <h2 className={rlcClass(null, sectionTitle)}>Import-Protokoll</h2>
            <div className={rlcClass(null, sectionText)}>
              Übersicht der letzten Importvorgänge dieser Sitzung.
            </div>
          </div>

          <button className={rlcClass(null, btnSecondary)} onClick={exportLogCsv} disabled={!logs.length}>
            Protokoll CSV
          </button>
        </div>

        <div className={rlcClass(null, tableWrap)}>
          <table className={rlcClass(null, table)}>
            <thead>
              <tr>
                <th className={rlcClass(null, th)}>Datum</th>
                <th className={rlcClass(null, th)}>Typ</th>
                <th className={rlcClass(null, th)}>Datei</th>
                <th className={rlcClass(null, th)}>Positionen</th>
                <th className={rlcClass(null, th)}>Status</th>
                <th className={rlcClass(null, th)}>Meldung</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) =>
              <tr key={l.id}>
                  <td className={rlcClass(null, td)}>{l.createdAt}</td>
                  <td className={rlcClass(null, td)}>{l.type}</td>
                  <td className={rlcClass(null, td)}>{l.fileName}</td>
                  <td className={rlcClass(null, tdRight)}>{l.count}</td>
                  <td className={rlcClass(null, td)}>
                    <span className={rlcClass(null,

                  l.status === "ok" ?
                  badgeOk :
                  l.status === "warning" ?
                  badgeWarn :
                  badgeError)}>
                    
                    
                      {l.status}
                    </span>
                  </td>
                  <td className={rlcClass(null, td)}>{l.message}</td>
                </tr>
              )}

              {!logs.length ?
              <tr>
                  <td colSpan={6} className={rlcClass(null, { ...td, color: "#64748B" })}>
                    Noch kein Import durchgeführt.
                  </td>
                </tr> :
              null}
            </tbody>
          </table>
        </div>
      </section>
    </div>);

}

function ImportCard({
  title,
  text,
  action,
  onClick





}: {title: string;text: string;action: string;onClick: () => void;}) {
  return (
    <div className={rlcClass(null, card)}>
      <h2 className={rlcClass(null, sectionTitle)}>{title}</h2>
      <div className={rlcClass(null, sectionText)}>{text}</div>
      <button className={rlcClass(null, { ...btnSecondary, marginTop: 14 })} onClick={onClick}>
        {action}
      </button>
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
  gap: 14,
  boxShadow: "0 16px 40px rgba(15,23,42,0.18)"
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  opacity: 0.8,
  fontWeight: 700
};

const title: React.CSSProperties = {
  margin: "4px 0",
  fontSize: 30,
  fontWeight: 700
};

const subtitle: React.CSSProperties = {
  margin: 0,
  maxWidth: 850,
  opacity: 0.9,
  lineHeight: 1.55
};

const heroActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap"
};

const meta: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.9
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
  gap: 12
};

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
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
  color: "#64748B",
  lineHeight: 1.5
};

const btnBase: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  padding: "9px 13px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #146EF5",
  background: "#146EF5",
  color: "#FFFFFF"
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "#FFFFFF",
  color: "#0F172A"
};

const tableWrap: React.CSSProperties = {
  overflow: "auto",
  border: "1px solid #E5E7EB",
  borderRadius: 12
};

const table: React.CSSProperties = {
  width: "100%",
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
  textAlign: "right"
};

const badgeBase: React.CSSProperties = {
  display: "inline-flex",
  borderRadius: 999,
  padding: "4px 9px",
  fontSize: 11,
  fontWeight: 700
};

const badgeOk: React.CSSProperties = {
  ...badgeBase,
  border: "1px solid #BBF7D0",
  background: "#F0FDF4",
  color: "#15803D"
};

const badgeWarn: React.CSSProperties = {
  ...badgeBase,
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#B45309"
};

const badgeError: React.CSSProperties = {
  ...badgeBase,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#B91C1C"
};
