import { rlcClass } from "../../ui/rlcRuntimeStyle";import React from "react";
import MengPageHeader from "./MengPageHeader";
import { apiUrl } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

type Row = {
  id: string;
  pos: string;
  text: string;
  qty: number;
  unit: string;
  ep: number;
  factor: number;
};

type VersionStatus =
"ENTWURF" |
"GESPEICHERT" |
"VERSENDET" |
"FREIGEGEBEN";

type Version = {
  id: string;
  projectId: string;
  createdAt: number;
  updatedAt?: number;
  sentAt?: number;
  approvedAt?: number;
  createdBy?: string;
  user?: string;
  note?: string;
  recipient?: string;
  status?: VersionStatus;
  documentName?: string;
  pdfUrl?: string;
  data: Row[];
};

type MessageState = {
  title: string;
  text: string;
  tone: "info" | "success" | "error";
} | null;

const rid = () =>
globalThis.crypto?.randomUUID?.() ??
`${Date.now()}-${Math.random().toString(36).slice(2)}`;

const formatDateTime = (value?: number) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
};

const formatMoney = (value: number) =>
new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR"
}).format(Number.isFinite(value) ? value : 0);

const formatNumber = (value: number) =>
new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 3
}).format(Number.isFinite(value) ? value : 0);

function getHistorieAuthHeaders(): Record<string, string> {
  const keys = [
  "rlc_token",
  "token",
  "authToken",
  "accessToken",
  "rlc.auth.token",
  "rlc_mobile_token",
  "rlc_auth_token",
  "rlc_access_token"];


  for (const key of keys) {
    const token =
    localStorage.getItem(key) ||
    sessionStorage.getItem(key);

    if (token?.trim()) {
      return { Authorization: `Bearer ${token.trim()}` };
    }
  }

  try {
    const raw =
    localStorage.getItem("auth") ||
    localStorage.getItem("rlc_auth") ||
    localStorage.getItem("user");

    if (raw) {
      const parsed = JSON.parse(raw);
      const token =
      parsed?.token ||
      parsed?.accessToken ||
      parsed?.authToken ||
      parsed?.data?.token ||
      parsed?.data?.accessToken;

      if (typeof token === "string" && token.trim()) {
        return { Authorization: `Bearer ${token.trim()}` };
      }
    }
  } catch {


    // Keine gespeicherten Auth-Daten.
  }return {};
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getHistorieAuthHeaders(),
      ...(init?.headers || {})
    },
    ...init
  });

  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : {};

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
  }

  return data as T;
}

function normalizeRows(input: unknown): Row[] {
  const source = Array.isArray(input) ?
  input :
  Array.isArray((input as any)?.rows) ?
  (input as any).rows :
  Array.isArray((input as any)?.items) ?
  (input as any).items :
  [];

  return source.map((value: any, index: number) => {
    const pos = String(
      value?.pos ??
      value?.posNr ??
      value?.position ??
      value?.nr ??
      value?.Positionsnummer ??
      ""
    ).trim();

    const text = String(
      value?.text ??
      value?.kurztext ??
      value?.Kurztext ??
      value?.langtext ??
      value?.Text ??
      ""
    ).trim();

    const qty = Number(
      value?.qty ??
      value?.menge ??
      value?.quantity ??
      value?.ist ??
      value?.Ist ??
      value?.soll ??
      value?.Soll ??
      0
    );

    const ep = Number(
      value?.ep ??
      value?.unitPrice ??
      value?.unitPriceNet ??
      value?.rlcKiUnitPrice ??
      0
    );

    const factor = Number(value?.factor ?? 1);

    return {
      id:
      String(value?.id ?? value?.rowId ?? value?.uuid ?? "").trim() ||
      `${pos || "row"}-${index}`,
      pos,
      text,
      qty: Number.isFinite(qty) ? qty : 0,
      unit: String(
        value?.unit ?? value?.einheit ?? value?.Einheit ?? value?.uom ?? ""
      ).trim(),
      ep: Number.isFinite(ep) ? ep : 0,
      factor: Number.isFinite(factor) && factor !== 0 ? factor : 1
    };
  });
}

function normalizeVersions(input: unknown): Version[] {
  const source = Array.isArray(input) ?
  input :
  Array.isArray((input as any)?.items) ?
  (input as any).items :
  [];

  return source.
  map((value: any): Version => ({
    id: String(value?.id || rid()),
    projectId: String(value?.projectId || ""),
    createdAt: Number(value?.createdAt || Date.now()),
    updatedAt: value?.updatedAt ? Number(value.updatedAt) : undefined,
    sentAt: value?.sentAt ? Number(value.sentAt) : undefined,
    approvedAt: value?.approvedAt ? Number(value.approvedAt) : undefined,
    createdBy: String(value?.createdBy || value?.user || "Bauleitung"),
    user: String(value?.user || value?.createdBy || "Bauleitung"),
    note: value?.note ? String(value.note) : undefined,
    recipient: value?.recipient ? String(value.recipient) : undefined,
    status: normalizeStatus(value?.status, value?.sentAt, value?.approvedAt),
    documentName: value?.documentName ?
    String(value.documentName) :
    undefined,
    pdfUrl: value?.pdfUrl ? String(value.pdfUrl) : undefined,
    data: normalizeRows(value?.data || value?.rows || [])
  })).
  sort((a: Version, b: Version) => b.createdAt - a.createdAt);
}

function normalizeStatus(
status: unknown,
sentAt?: unknown,
approvedAt?: unknown)
: VersionStatus {
  const normalized = String(status || "").toUpperCase();

  if (approvedAt || normalized === "FREIGEGEBEN") return "FREIGEGEBEN";
  if (sentAt || normalized === "VERSENDET") return "VERSENDET";
  if (normalized === "ENTWURF") return "ENTWURF";
  return "GESPEICHERT";
}

function versionTotal(version: Version): number {
  return version.data.reduce(
    (sum, row) => sum + row.qty * row.ep * row.factor,
    0
  );
}

function currentTotal(rows: Row[]): number {
  return rows.reduce(
    (sum, row) => sum + row.qty * row.ep * row.factor,
    0
  );
}

function statusLabel(status?: VersionStatus): string {
  switch (status) {
    case "ENTWURF":
      return "Entwurf";
    case "VERSENDET":
      return "Versendet";
    case "FREIGEGEBEN":
      return "Freigegeben";
    default:
      return "Gespeichert";
  }
}

function statusStyle(status?: VersionStatus): React.CSSProperties {
  if (status === "FREIGEGEBEN") {
    return {
      color: "#166534",
      background: "#dcfce7",
      borderColor: "#bbf7d0"
    };
  }

  if (status === "VERSENDET") {
    return {
      color: "#0b5bd3",
      background: "#dbeafe",
      borderColor: "#bed6ff"
    };
  }

  if (status === "ENTWURF") {
    return {
      color: "#92400e",
      background: "#fef3c7",
      borderColor: "#fde68a"
    };
  }

  return {
    color: "#475569",
    background: "#f1f5f9",
    borderColor: "#e2e8f0"
  };
}

function diff(a: Row[], b: Row[]) {
  const before = new Map(a.map((row) => [row.id, row]));
  const after = new Map(b.map((row) => [row.id, row]));

  const added: Row[] = [];
  const removed: Row[] = [];
  const changed: Array<{before: Row;after: Row;}> = [];

  for (const [id, row] of after) {
    if (!before.has(id)) added.push(row);
  }

  for (const [id, row] of before) {
    if (!after.has(id)) removed.push(row);
  }

  for (const [id, oldRow] of before) {
    const newRow = after.get(id);
    if (!newRow) continue;

    if (
    oldRow.qty !== newRow.qty ||
    oldRow.text !== newRow.text ||
    oldRow.unit !== newRow.unit ||
    oldRow.pos !== newRow.pos)
    {
      changed.push({ before: oldRow, after: newRow });
    }
  }

  return { added, removed, changed };
}

const shell: React.CSSProperties = {
  display: "grid",
  gap: 16
};

const card: React.CSSProperties = {
  border: "1px solid #dce5f2",
  background: "#ffffff",
  borderRadius: 18,
  boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
  padding: 16
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12
};

const summaryCard: React.CSSProperties = {
  ...card,
  minHeight: 104
};

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d9e2f1",
  borderRadius: 10,
  padding: "9px 10px",
  background: "#ffffff",
  color: "#0f172a"
};

const btn: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid #d7e2f0",
  background: "#ffffff",
  borderRadius: 11,
  fontWeight: 700,
  cursor: "pointer"
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  color: "#ffffff",
  background: "#0f4ec9",
  borderColor: "#0f4ec9"
};

export default function AufmassHistorie() {
  const { getSelectedProject } = useProject();
  const project = getSelectedProject();

  const projectId = String(project?.code || project?.id || "").trim();
  const projectLabel = String(
    project?.code || project?.name || project?.id || ""
  ).trim();

  const [versions, setVersions] = React.useState<Version[]>([]);
  const [current, setCurrent] = React.useState<Row[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [openedVersion, setOpenedVersion] = React.useState<Version | null>(null);
  const [comparison, setComparison] = React.useState<{
    left: Version;
    right: Version;
  } | null>(null);
  const [note, setNote] = React.useState("");
  const [recipient, setRecipient] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [offline, setOffline] = React.useState(false);
  const [message, setMessage] = React.useState<MessageState>(null);

  const loadAll = React.useCallback(async () => {
    if (!projectId) {
      setVersions([]);
      setCurrent([]);
      return;
    }

    setLoading(true);
    setOffline(false);

    try {
      const [historyResult, currentResult] = await Promise.all([
      api<{ok: boolean;items?: unknown[];}>(
        `/api/historie?projectId=${encodeURIComponent(projectId)}`
      ),
      api<{ok: boolean;rows?: unknown[];}>(
        `/api/historie/current?projectId=${encodeURIComponent(projectId)}`
      )]
      );

      const serverVersions = normalizeVersions(historyResult.items || []);
      const serverCurrent = normalizeRows(currentResult.rows || []);

      setVersions(serverVersions);
      setCurrent(serverCurrent);
    } catch (error: any) {
      console.warn("Aufmaß-Historie: Server nicht erreichbar", error);
      setOffline(true);
      setVersions([]);
      setCurrent([]);
      setMessage({
        title: "Server nicht erreichbar",
        text:
        error?.message ||
        "Aufmaß-Historie und aktueller Aufmaßstand konnten nicht vom Server geladen werden.",
        tone: "error"
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);


  const latestSaved = versions[0];
  const latestSent = versions.
  filter(
    (version) =>
    version.status === "VERSENDET" ||
    version.status === "FREIGEGEBEN" ||
    Boolean(version.sentAt)
  ).
  sort((a, b) => (b.sentAt || b.createdAt) - (a.sentAt || a.createdAt))[0];

  const saveVersion = React.useCallback(async () => {
    if (!projectId) {
      setMessage({
        title: "Kein Projekt gewählt",
        text: "Bitte zuerst ein Projekt auswählen.",
        tone: "error"
      });
      return;
    }

    if (!current.length) {
      setMessage({
        title: "Keine Aufmaßdaten",
        text: "Im aktuellen Projekt wurden keine Aufmaßdaten gefunden.",
        tone: "error"
      });
      return;
    }

    const version: Version = {
      id: rid(),
      projectId,
      createdAt: Date.now(),
      createdBy: "Bauleitung",
      user: "Bauleitung",
      note: note.trim() || undefined,
      recipient: recipient.trim() || undefined,
      status: "GESPEICHERT",
      documentName: `Aufmaß ${versions.length + 1}`,
      data: JSON.parse(JSON.stringify(current)) as Row[]
    };

    try {
      await api("/api/historie", {
        method: "POST",
        body: JSON.stringify(version)
      });

      setVersions((previous) => [version, ...previous]);
      setNote("");
      setRecipient("");
      setOffline(false);
      setMessage({
        title: "Aufmaß gespeichert",
        text: "Der aktuelle Aufmaßstand wurde auf dem Server gespeichert.",
        tone: "success"
      });
    } catch (error: any) {
      setOffline(true);
      setMessage({
        title: "Speichern fehlgeschlagen",
        text:
        error?.message ||
        "Der Aufmaßstand konnte nicht auf dem Server gespeichert werden.",
        tone: "error"
      });
    }
  }, [projectId, current, note, recipient, versions.length]);

  const markAsSent = React.useCallback(
    async (version: Version) => {
      const updated: Version = {
        ...version,
        status: "VERSENDET",
        sentAt: Date.now(),
        updatedAt: Date.now()
      };

      try {
        await api("/api/historie", {
          method: "POST",
          body: JSON.stringify(updated)
        });

        setVersions((previous) =>
        previous.map((item) => item.id === version.id ? updated : item)
        );
        setOffline(false);
        setMessage({
          title: "Als versendet markiert",
          text: "Die Versendung wurde auf dem Server dokumentiert.",
          tone: "success"
        });
      } catch (error: any) {
        setOffline(true);
        setMessage({
          title: "Statusänderung fehlgeschlagen",
          text:
          error?.message ||
          "Der Status konnte nicht auf dem Server aktualisiert werden.",
          tone: "error"
        });
      }
    },
    []
  );

  const restoreVersion = React.useCallback(async (version: Version) => {
    try {
      await api("/api/historie/restore", {
        method: "POST",
        body: JSON.stringify(version)
      });

      setCurrent(version.data || []);
      setMessage({
        title: "Aufmaß wiederhergestellt",
        text: "Der ausgewählte Aufmaßstand wurde wiederhergestellt.",
        tone: "success"
      });
    } catch (error: any) {
      setMessage({
        title: "Wiederherstellung fehlgeschlagen",
        text:
        error?.message || "Der Aufmaßstand konnte nicht wiederhergestellt werden.",
        tone: "error"
      });
    }
  }, []);

  const deleteVersion = React.useCallback(
    async (version: Version) => {
      if (!projectId) return;

      try {
        await api(
          `/api/historie/${encodeURIComponent(
            version.id
          )}?projectId=${encodeURIComponent(projectId)}`,
          { method: "DELETE" }
        );

        setVersions((previous) =>
        previous.filter((item) => item.id !== version.id)
        );
        setSelectedIds((previous) =>
        previous.filter((id) => id !== version.id)
        );
        setOpenedVersion((currentVersion) =>
        currentVersion?.id === version.id ? null : currentVersion
        );
        setOffline(false);
      } catch (error: any) {
        setOffline(true);
        setMessage({
          title: "Löschen fehlgeschlagen",
          text:
          error?.message ||
          "Die Aufmaß-Version konnte nicht auf dem Server gelöscht werden.",
          tone: "error"
        });
      }
    },
    [projectId]
  );

  function toggleSelection(id: string) {
    setSelectedIds((previous) => {
      if (previous.includes(id)) {
        return previous.filter((item) => item !== id);
      }

      if (previous.length === 2) {
        return [previous[1], id];
      }

      return [...previous, id];
    });
  }

  function openComparison() {
    if (selectedIds.length !== 2) return;

    const left = versions.find((version) => version.id === selectedIds[0]);
    const right = versions.find((version) => version.id === selectedIds[1]);

    if (left && right) {
      setComparison({ left, right });
    }
  }

  return (
    <div className={rlcClass(null, shell)}>
      <MengPageHeader
        title="Aufmaß-Historie"
        subtitle="Gespeicherte, versendete und freigegebene Aufmaßstände dokumentieren." />
      

      <section className={rlcClass(null, summaryGrid)}>
        <SummaryCard
          label="Letztes Aufmaß"
          value={latestSaved ? formatDateTime(latestSaved.createdAt) : "Noch keines"}
          detail={
          latestSaved ?
          `${latestSaved.data.length} Positionen · ${formatMoney(
            versionTotal(latestSaved)
          )}` :
          "Keine Version gespeichert"
          } />
        

        <SummaryCard
          label="Letzte Versendung"
          value={
          latestSent ?
          formatDateTime(latestSent.sentAt || latestSent.createdAt) :
          "Noch nicht versendet"
          }
          detail={
          latestSent?.recipient ?
          `Empfänger: ${latestSent.recipient}` :
          "Kein Empfänger dokumentiert"
          } />
        

        <SummaryCard
          label="Gespeicherte Versionen"
          value={String(versions.length)}
          detail={`${versions.filter((v) => v.status === "VERSENDET").length} versendet`} />
        

        <SummaryCard
          label="Aktueller Abrechnungsstand"
          value={formatMoney(currentTotal(current))}
          detail={`${current.filter((row) => row.qty !== 0).length} Positionen mit Menge`} />
        
      </section>

      <section className={rlcClass(null, card)}>
        <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1405">






          
          <label className="rlc-migrated-pages-mengenermittlung-historie-tsx-1406">
            Notiz zum Aufmaß
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="z. B. Aufmaßstand Juli 2026" className={rlcClass(null,
              input)} />
            
          </label>

          <label className="rlc-migrated-pages-mengenermittlung-historie-tsx-1407">
            Empfänger (optional)
            <input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="z. B. Auftraggeber / Bauleitung" className={rlcClass(null,
              input)} />
            
          </label>

          <button
            type="button" className={rlcClass(null,
            btnPrimary)}
            onClick={saveVersion}
            disabled={loading || !projectId}>
            
            Aktuellen Aufmaßstand speichern
          </button>
        </div>

        <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1408">








          
          <div className={rlcClass(null,
          {
            color: offline ? "#b45309" : "#166534",
            fontSize: 12,
            fontWeight: 700
          })}>
            
            Projekt: {projectLabel || "Kein Projekt gewählt"} ·{" "}
            {offline ? "Server nicht erreichbar" : "Server verbunden"}
          </div>

          <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1409">
            <button
              type="button" className={rlcClass(null,
              btn)}
              onClick={openComparison}
              disabled={selectedIds.length !== 2}>
              
              Versionen vergleichen
            </button>
            <button
              type="button" className={rlcClass(null,
              btn)}
              onClick={() => void loadAll()}
              disabled={loading}>
              
              Neu laden
            </button>
          </div>
        </div>
      </section>

      <section className={rlcClass(null, card)}>
        <h2 className="rlc-migrated-pages-mengenermittlung-historie-tsx-1410">
          Verlauf der Aufmaßstände
        </h2>

        {!versions.length ?
        <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1411">
            Noch keine Aufmaß-Version gespeichert.
          </div> :

        <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1412">
            <table className="rlc-migrated-pages-mengenermittlung-historie-tsx-1413">
              <thead>
                <tr>
                  <Th />
                  <Th>Datum</Th>
                  <Th>Bezeichnung</Th>
                  <Th>Status</Th>
                  <Th>Positionen</Th>
                  <Th style={{ textAlign: "right" }}>Netto</Th>
                  <Th>Erstellt von</Th>
                  <Th>Empfänger</Th>
                  <Th>Aktionen</Th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) =>
              <tr key={version.id}>
                    <Td>
                      <input
                    type="checkbox"
                    checked={selectedIds.includes(version.id)}
                    onChange={() => toggleSelection(version.id)} />
                  
                    </Td>
                    <Td>{formatDateTime(version.createdAt)}</Td>
                    <Td>
                      <strong>
                        {version.documentName ||
                    `Aufmaß ${versions.indexOf(version) + 1}`}
                      </strong>
                      <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1414">
                        {version.note || "Ohne Notiz"}
                      </div>
                    </Td>
                    <Td>
                      <span className={rlcClass(null,
                  {
                    display: "inline-flex",
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid",
                    fontSize: 12,
                    fontWeight: 700,
                    ...statusStyle(version.status)
                  })}>
                    
                        {statusLabel(version.status)}
                      </span>
                    </Td>
                    <Td>{version.data.length}</Td>
                    <Td style={{ textAlign: "right" }}>
                      {formatMoney(versionTotal(version))}
                    </Td>
                    <Td>{version.createdBy || version.user || "Bauleitung"}</Td>
                    <Td>{version.recipient || "—"}</Td>
                    <Td>
                      <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1415">
                        <button
                      type="button" className={rlcClass(null,
                      btn)}
                      onClick={() => setOpenedVersion(version)}>
                      
                          Öffnen
                        </button>

                        {version.pdfUrl ?
                    <a
                      href={version.pdfUrl}
                      target="_blank"
                      rel="noreferrer" className={rlcClass(null,
                      { ...btn, textDecoration: "none" })}>
                      
                            PDF anzeigen
                          </a> :
                    null}

                        {version.status !== "VERSENDET" &&
                    version.status !== "FREIGEGEBEN" ?
                    <button
                      type="button" className={rlcClass(null,
                      btn)}
                      onClick={() => void markAsSent(version)}>
                      
                            Als versendet markieren
                          </button> :
                    null}

                        <button
                      type="button" className={rlcClass(null,
                      btn)}
                      onClick={() => void restoreVersion(version)}>
                      
                          Wiederherstellen
                        </button>

                        <button
                      type="button" className={rlcClass(null,
                      { ...btn, color: "#b91c1c" })}
                      onClick={() => void deleteVersion(version)}>
                      
                          Löschen
                        </button>
                      </div>
                    </Td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        }
      </section>

      {openedVersion ?
      <section className={rlcClass(null, card)}>
          <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1416">







          
            <div>
              <h2 className="rlc-migrated-pages-mengenermittlung-historie-tsx-1417">
                {openedVersion.documentName || "Aufmaß-Version"}
              </h2>
              <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1418">
                {formatDateTime(openedVersion.createdAt)} ·{" "}
                {statusLabel(openedVersion.status)}
              </div>
            </div>
            <button
            type="button" className={rlcClass(null,
            btn)}
            onClick={() => setOpenedVersion(null)}>
            
              Schließen
            </button>
          </div>

          <VersionTable rows={openedVersion.data} />
        </section> :
      null}

      {comparison ?
      <section className={rlcClass(null, card)}>
          <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1419">







          
            <div>
              <h2 className="rlc-migrated-pages-mengenermittlung-historie-tsx-1420">Versionsvergleich</h2>
              <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1421">
                {formatDateTime(comparison.left.createdAt)} ↔{" "}
                {formatDateTime(comparison.right.createdAt)}
              </div>
            </div>
            <button
            type="button" className={rlcClass(null,
            btn)}
            onClick={() => setComparison(null)}>
            
              Vergleich schließen
            </button>
          </div>

          <DiffView a={comparison.left.data} b={comparison.right.data} />
        </section> :
      null}

      {message ?
      <div
        role="dialog"
        aria-modal="true"
        onClick={() => setMessage(null)} className="rlc-migrated-pages-mengenermittlung-historie-tsx-1422">









        
          <div
          onClick={(event) => event.stopPropagation()} className="rlc-migrated-pages-mengenermittlung-historie-tsx-1423">







          
            <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1424">
              {message.title}
            </div>
            <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1425">
              {message.text}
            </div>
            <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1426">
              <button
              type="button" className={rlcClass(null,
              btnPrimary)}
              onClick={() => setMessage(null)}>
              
                OK
              </button>
            </div>
          </div>
        </div> :
      null}
    </div>);

}

function SummaryCard({
  label,
  value,
  detail




}: {label: string;value: string;detail: string;}) {
  return (
    <div className={rlcClass(null, summaryCard)}>
      <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1427">
        {label}
      </div>
      <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1428">{value}</div>
      <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1429">
        {detail}
      </div>
    </div>);

}

function VersionTable({ rows }: {rows: Row[];}) {
  return (
    <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1430">
      <table className="rlc-migrated-pages-mengenermittlung-historie-tsx-1431">
        <thead>
          <tr>
            <Th>Pos.</Th>
            <Th>Text</Th>
            <Th>Einheit</Th>
            <Th style={{ textAlign: "right" }}>Menge</Th>
            <Th style={{ textAlign: "right" }}>EP netto</Th>
            <Th style={{ textAlign: "right" }}>Gesamt netto</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
          <tr key={row.id}>
              <Td>{row.pos || "—"}</Td>
              <Td>{row.text || "—"}</Td>
              <Td>{row.unit || "—"}</Td>
              <Td style={{ textAlign: "right" }}>{formatNumber(row.qty)}</Td>
              <Td style={{ textAlign: "right" }}>{formatMoney(row.ep)}</Td>
              <Td style={{ textAlign: "right" }}>
                {formatMoney(row.qty * row.ep * row.factor)}
              </Td>
            </tr>
          )}
        </tbody>
      </table>
    </div>);

}

function DiffView({ a, b }: {a: Row[];b: Row[];}) {
  const result = diff(a, b);

  return (
    <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1432">





      
      <DiffCard title={`Neu (${result.added.length})`}>
        {result.added.length ?
        result.added.map((row) =>
        <DiffLine
          key={row.id}
          text={`${row.pos} ${row.text}`}
          color="#166534" />

        ) :

        <Empty />
        }
      </DiffCard>

      <DiffCard title={`Entfernt (${result.removed.length})`}>
        {result.removed.length ?
        result.removed.map((row) =>
        <DiffLine
          key={row.id}
          text={`${row.pos} ${row.text}`}
          color="#b91c1c" />

        ) :

        <Empty />
        }
      </DiffCard>

      <DiffCard title={`Geändert (${result.changed.length})`}>
        {result.changed.length ?
        result.changed.map(({ before, after }) =>
        <DiffLine
          key={after.id}
          text={`${after.pos} ${after.text}: ${before.qty} → ${after.qty}`}
          color="#92400e" />

        ) :

        <Empty />
        }
      </DiffCard>
    </div>);

}

function DiffCard({
  title,
  children
}: React.PropsWithChildren<{title: string;}>) {
  return (
    <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1433">
      <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1434">{title}</div>
      {children}
    </div>);

}

function DiffLine({ text, color }: {text: string;color: string;}) {
  return (
    <div className={rlcClass(null,
    {
      fontSize: 12,
      padding: "5px 7px",
      borderRadius: 7,
      marginBottom: 5,
      background: `${color}14`,
      color
    })}>
      
      {text}
    </div>);

}

function Empty() {
  return <div className="rlc-migrated-pages-mengenermittlung-historie-tsx-1435">—</div>;
}

function Th(
props: React.ThHTMLAttributes<HTMLTableCellElement> & {
  children?: React.ReactNode;
})
{
  const { children, style, ...rest } = props;

  return (
    <th
      {...rest} className={rlcClass(null,
      {
        padding: "8px",
        borderBottom: "1px solid #dce5f2",
        textAlign: "left",
        color: "#475569",
        fontSize: 12,
        whiteSpace: "nowrap",
        ...style
      })}>
      
      {children}
    </th>);

}

function Td(
props: React.TdHTMLAttributes<HTMLTableCellElement> & {
  children?: React.ReactNode;
})
{
  const { children, style, ...rest } = props;

  return (
    <td
      {...rest} className={rlcClass(null,
      {
        padding: "8px",
        borderBottom: "1px solid #edf2f7",
        verticalAlign: "top",
        fontSize: 13,
        ...style
      })}>
      
      {children}
    </td>);

}
