import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import { useNavigate } from "react-router-dom";

import { API_BASE } from "../../lib/apiBase";
import { useProject } from "../../store/useProject";

import {
  listDocuments,
  initDocument,
  getUploadUrl,
  putToStorage,
  completeUpload,
  detectKind,
  getDocumentVersions,
  restoreDocumentVersion,
  type DocumentVersionHistoryDto,
} from "../../api/files";

type ServerDocVersion = {
  id?: string;
  storageId?: string | null;
  version?: number;
  uploadedAt?: string;
  createdAt?: string;
};

type ServerDocument = {
  id: string;
  name?: string;
  kind?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  currentVid?: string | null;
  versions?: ServerDocVersion[];
  meta?: {
    tags?: string[];
  } | null;
};

type Filter =
  | "ALL"
  | "ANGEBOT"
  | "RECHNUNG"
  | "ABSCHLAG"
  | "REGIE"
  | "TAGESBERICHT"
  | "BAUTAGEBUCH"
  | "ARBEITSZEIT"
  | "LIEFERSCHEIN"
  | "AUFMASS"
  | "KALKULATION"
  | "IMAGE"
  | "SONSTIGE";

const CURRENT_DOC_KEY = "rlc.currentDoc";
const CURRENT_PROJECT_ID_KEY = "currentProjectId";

function apiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

function pickFile(cb: (file: File) => void) {
  const input = document.createElement("input");
  input.type = "file";

  input.onchange = () => {
    const file = input.files?.[0];
    if (file) cb(file);
  };

  input.click();
}

function latestVersion(doc: ServerDocument) {
  const versions = Array.isArray(doc.versions)
    ? doc.versions
    : [];

  if (!versions.length) return null;

  return [...versions].sort(
    (a, b) =>
      Number(a.version || 0) -
      Number(b.version || 0)
  )[versions.length - 1];
}

function currentVersion(doc: ServerDocument) {
  const versions = Array.isArray(doc.versions)
    ? doc.versions
    : [];

  const currentId = String(doc.currentVid || "").trim();

  if (currentId) {
    const current = versions.find(
      (version) => version.id === currentId
    );

    if (current) return current;
  }

  return latestVersion(doc);
}

function documentStorageUrl(
  projectId: string,
  doc: ServerDocument
) {
  const version = currentVersion(doc);

  if (!version?.storageId || !projectId) return "";

  return apiUrl(
    `/files/${encodeURIComponent(
      projectId
    )}/storage/${encodeURIComponent(
      version.storageId
    )}`
  );
}


function getAuthToken(): string {
  try {
    const keys = [
      "rlc_token",
      "token",
      "authToken",
      "accessToken",
      "rlc_auth_token"
    ];

    for (const storage of [localStorage, sessionStorage]) {
      for (const key of keys) {
        const value = storage.getItem(key);

        if (value && value.trim()) {
          return value.trim();
        }
      }
    }

    return "";
  } catch {
    return "";
  }
}


type AccountingDmsLink = {
  projectId?: string | null;
  documentId?: string | null;
  document?: {
    id?: string;
    name?: string;
    projectId?: string;
  } | null;
};

async function resolveAccountingDms(
  sourceType: string,
  sourceId: string
): Promise<AccountingDmsLink> {
  const token = getAuthToken();

  const query = new URLSearchParams({
    sourceType,
    sourceId
  });

  const response = await fetch(
    apiUrl(`/api/accounting/dms/resolve?${query.toString()}`),
    {
      credentials: "include",
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {}
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.ok === false) {
    throw new Error(
      data?.error ||
      `DMS-Verknüpfung konnte nicht geladen werden (${response.status})`
    );
  }

  return data || {};
}

async function linkAccountingDms(
  sourceType: string,
  sourceId: string,
  documentId: string
) {
  const token = getAuthToken();

  const response = await fetch(
    apiUrl("/api/accounting/dms/link"),
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {})
      },
      body: JSON.stringify({
        sourceType,
        sourceId,
        documentId
      })
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.ok === false) {
    throw new Error(
      data?.error ||
      `DMS-Verknüpfung fehlgeschlagen (${response.status})`
    );
  }

  return data;
}


async function getVersionDownloadUrl(versionId: string): Promise<string> {
  const token = getAuthToken();

  const response = await fetch(
    apiUrl(`/api/files/download-url/${encodeURIComponent(versionId)}`),
    {
      credentials: "include",
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {}
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.downloadUrl) {
    throw new Error(
      data?.error || `Download-URL konnte nicht geladen werden (${response.status})`
    );
  }

  return String(data.downloadUrl);
}


function documentCategory(doc: ServerDocument): Filter {
  const name = String(doc.name || "").toLowerCase();
  const kind = String(doc.kind || "").toLowerCase();
  const tags = Array.isArray(doc.meta?.tags)
    ? doc.meta!.tags!.join(" ").toLowerCase()
    : "";

  const text = `${name} ${kind} ${tags}`;

  if (
    text.includes("abschlagsrechnung") ||
    text.includes("abschlag")
  ) return "ABSCHLAG";

  if (
    text.includes("rechnung") ||
    text.includes("invoice")
  ) return "RECHNUNG";

  if (
    text.includes("angebot") ||
    text.includes("offerte")
  ) return "ANGEBOT";

  if (
    text.includes("regiebericht") ||
    text.includes("regie")
  ) return "REGIE";

  if (
    text.includes("tagesbericht")
  ) return "TAGESBERICHT";

  if (
    text.includes("bautagebuch")
  ) return "BAUTAGEBUCH";

  if (
    text.includes("arbeitszeit") ||
    text.includes("stundennachweis")
  ) return "ARBEITSZEIT";

  if (
    text.includes("lieferschein") ||
    text.includes("lieferscheine")
  ) return "LIEFERSCHEIN";

  if (
    text.includes("aufmaß") ||
    text.includes("aufmass") ||
    text.includes("mengenermittlung") ||
    text.includes("mengen")
  ) return "AUFMASS";

  if (
    text.includes("kalkulation") ||
    text.includes("urkalkulation")
  ) return "KALKULATION";

  if (
    kind === "image" ||
    /\.(png|jpe?g|webp|gif|heic)$/i.test(name)
  ) return "IMAGE";

  return "SONSTIGE";
}

export default function Dokumente() {
  const navigate = useNavigate();

  const accountingSource = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);

    return {
      sourceType:
        String(params.get("sourceType") || "")
          .trim()
          .toUpperCase(),

      sourceId:
        String(params.get("sourceId") || "")
          .trim(),

      sourceNumber:
        String(params.get("sourceNumber") || "")
          .trim()
    };
  }, []);

  const projectContext: any = useProject();

  const currentProject =
    projectContext?.currentProject ||
    projectContext?.selectedProject ||
    projectContext?.getSelectedProject?.() ||
    null;

  const projectIdGlobal =
    String(currentProject?.id || "").trim();

  const projectLabel =
    String(
      currentProject?.code ||
      currentProject?.name ||
      ""
    ).trim();

  const [projectId, setProjectId] =
    React.useState(() => {
      try {
        return (
          localStorage.getItem(
            CURRENT_PROJECT_ID_KEY
          ) ||
          projectIdGlobal ||
          ""
        );
      } catch {
        return projectIdGlobal || "";
      }
    });

  const [documents, setDocuments] =
    React.useState<ServerDocument[]>([]);

  const [selectedId, setSelectedId] =
    React.useState<string>("");

  const [search, setSearch] =
    React.useState("");

  const [dateFrom, setDateFrom] =
    React.useState("");

  const [dateTo, setDateTo] =
    React.useState("");

  const [filter, setFilter] =
    React.useState<Filter>("ALL");

  const [busy, setBusy] =
    React.useState(false);

  const [selectedUrl, setSelectedUrl] =
    React.useState("");

  const [previewBusy, setPreviewBusy] =
    React.useState(false);

  const [historyDoc, setHistoryDoc] =
    React.useState<ServerDocument | null>(null);

  const [historyVersions, setHistoryVersions] =
    React.useState<DocumentVersionHistoryDto[]>([]);

  const [historyBusy, setHistoryBusy] =
    React.useState(false);

  React.useEffect(() => {
    if (!projectId && projectIdGlobal) {
      setProjectId(projectIdGlobal);
    }
  }, [projectId, projectIdGlobal]);

  const persistProject = React.useCallback(
    (pid: string) => {
      try {
        if (pid) {
          localStorage.setItem(
            CURRENT_PROJECT_ID_KEY,
            pid
          );
        }
      } catch {
        // ignore
      }
    },
    []
  );

  React.useEffect(() => {
    let cancelled = false;

    async function resolveLinkedDocument() {
      if (
        !accountingSource.sourceType ||
        !accountingSource.sourceId
      ) {
        return;
      }

      try {
        const link = await resolveAccountingDms(
          accountingSource.sourceType,
          accountingSource.sourceId
        );

        if (cancelled) return;

        const resolvedProjectId =
          String(
            link.projectId ||
            link.document?.projectId ||
            ""
          ).trim();

        if (
          resolvedProjectId &&
          resolvedProjectId !== projectId
        ) {
          setProjectId(resolvedProjectId);
          persistProject(resolvedProjectId);
        }

        const documentId =
          String(link.documentId || "").trim();

        if (documentId) {
          setSelectedId(documentId);
          setFilter("ALL");
          setSearch("");
        }
      } catch (error) {
        console.error(
          "[Dokumente] Accounting-DMS Resolve fehlgeschlagen",
          error
        );
      }
    }

    void resolveLinkedDocument();

    return () => {
      cancelled = true;
    };
  }, [
    accountingSource.sourceType,
    accountingSource.sourceId,
    projectId,
    persistProject
  ]);


  const loadDocuments =
    React.useCallback(async () => {
      const pid = projectId.trim();

      if (!pid) return;

      setBusy(true);

      try {
        const list = await listDocuments(pid);

        const rows = Array.isArray(list)
          ? (list as ServerDocument[])
          : [];

        setDocuments(rows);

        setSelectedId((old) => {
          if (
            old &&
            rows.some((row) => row.id === old)
          ) {
            return old;
          }

          return "";
        });

        persistProject(pid);
      } catch (error: any) {
        console.error(
          "[Dokumente] Laden fehlgeschlagen",
          error
        );

        alert(
          error?.message ||
            "Dokumente konnten nicht geladen werden."
        );
      } finally {
        setBusy(false);
      }
    }, [projectId, persistProject]);

  React.useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const filteredDocuments =
    React.useMemo(() => {
      const q = search
        .trim()
        .toLowerCase();

      return documents.filter((doc) => {
        if (doc.deletedAt) return false;

        const name = String(
          doc.name || ""
        ).toLowerCase();

        const kind = String(
          doc.kind || ""
        ).toUpperCase();

        const tags = Array.isArray(
          doc.meta?.tags
        )
          ? doc.meta!.tags!
              .join(" ")
              .toLowerCase()
          : "";

        if (
          q &&
          !name.includes(q) &&
          !kind
            .toLowerCase()
            .includes(q) &&
          !tags.includes(q)
        ) {
          return false;
        }

        const updatedAt = doc.updatedAt
          ? new Date(doc.updatedAt)
          : null;

        if (dateFrom) {
          const from = new Date(`${dateFrom}T00:00:00`);
          if (!updatedAt || updatedAt < from) return false;
        }

        if (dateTo) {
          const to = new Date(`${dateTo}T23:59:59.999`);
          if (!updatedAt || updatedAt > to) return false;
        }

        if (filter === "ALL") {
          return true;
        }

        return documentCategory(doc) === filter;
      });
    }, [documents, search, filter, dateFrom, dateTo]);

  const selected =
    React.useMemo(
      () =>
        documents.find(
          (doc) => doc.id === selectedId
        ) || null,
      [documents, selectedId]
    );

  const selectedKind = String(
    selected?.kind || ""
  ).toUpperCase();

  React.useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      setSelectedUrl("");

      if (!selected) return;

      const version = currentVersion(selected);

      if (!version?.id) return;

      setPreviewBusy(true);

      try {
        const url = await getVersionDownloadUrl(version.id);

        if (!cancelled) {
          setSelectedUrl(url);
        }
      } catch (error) {
        console.error("[Dokumente] Preview URL fehlgeschlagen", error);
      } finally {
        if (!cancelled) {
          setPreviewBusy(false);
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const createDocument =
    React.useCallback(() => {
      const pid = projectId.trim();

      if (!pid) {
        alert(
          "Kein Projekt ausgewählt."
        );
        return;
      }

      pickFile(async (file) => {
        setBusy(true);

        try {
          const kind = detectKind(file);

          const created =
            await initDocument(
              pid,
              kind,
              file.name
            );

          const documentId =
            String(
              created?.documentId || ""
            ).trim();

          if (!documentId) {
            throw new Error(
              "Dokument-ID fehlt."
            );
          }

          const upload =
            await getUploadUrl(
              documentId,
              file.name,
              file.type ||
                "application/octet-stream"
            );

          await putToStorage(
            upload.uploadUrl,
            file,
            file.type ||
              "application/octet-stream"
          );

          await completeUpload({
            documentId,
            key: upload.key,
            version: upload.version,
            contentType:
              upload.contentType ||
              file.type ||
              "application/octet-stream",
            size: file.size,
          });

          if (
            accountingSource.sourceType &&
            accountingSource.sourceId
          ) {
            await linkAccountingDms(
              accountingSource.sourceType,
              accountingSource.sourceId,
              documentId
            );
          }

          await loadDocuments();

          setSelectedId(documentId);
        } catch (error: any) {
          alert(
            error?.message ||
              "Dokument konnte nicht hochgeladen werden."
          );
        } finally {
          setBusy(false);
        }
      });
    }, [
      projectId,
      loadDocuments,
      accountingSource.sourceType,
      accountingSource.sourceId
    ]);

  const openViewer =
    React.useCallback(
      (doc: ServerDocument) => {
        try {
          sessionStorage.setItem(
            CURRENT_DOC_KEY,
            JSON.stringify({
              id: doc.id,
              name: doc.name || "",
              kind: doc.kind || "",
            })
          );
        } catch {
          // ignore
        }

        const kind = String(
          doc.kind || ""
        ).toUpperCase();

        if (kind === "PDF") {
          navigate("/cad/pdf-viewer");
          return;
        }

        if (
          kind === "CAD" ||
          kind === "DWG" ||
          kind === "DXF"
        ) {
          navigate("/cad/viewer");
          return;
        }

        setSelectedId(doc.id);
      },
      [navigate]
    );


  const downloadVersion = React.useCallback(
    async (
      versionId: string,
      fileName: string
    ) => {
      try {
        const url = await getVersionDownloadUrl(versionId);

        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.target = "_blank";
        a.rel = "noopener noreferrer";

        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (error: any) {
        alert(
          error?.message ||
            "Download konnte nicht gestartet werden."
        );
      }
    },
    []
  );

  const openHistory = React.useCallback(
    async (doc: ServerDocument) => {
      setHistoryDoc(doc);
      setHistoryVersions([]);
      setHistoryBusy(true);

      try {
        const result = await getDocumentVersions(doc.id);

        setHistoryVersions(
          Array.isArray(result?.versions)
            ? result.versions
            : []
        );
      } catch (error: any) {
        alert(
          error?.message ||
            "Versionshistorie konnte nicht geladen werden."
        );
        setHistoryDoc(null);
      } finally {
        setHistoryBusy(false);
      }
    },
    []
  );


  const restoreVersion = React.useCallback(
    async (
      doc: ServerDocument,
      version: DocumentVersionHistoryDto
    ) => {
      if (version.current) return;

      const confirmed = window.confirm(
        `Version V${version.version} von "${doc.name || "Dokument"}" als aktuelle Version setzen?`
      );

      if (!confirmed) return;

      setHistoryBusy(true);

      try {
        await restoreDocumentVersion(
          doc.id,
          version.id
        );

        await loadDocuments();

        const history =
          await getDocumentVersions(doc.id);

        setHistoryVersions(
          Array.isArray(history?.versions)
            ? history.versions
            : []
        );

        setSelectedId(doc.id);
      } catch (error: any) {
        alert(
          error?.message ||
            "Version konnte nicht wiederhergestellt werden."
        );
      } finally {
        setHistoryBusy(false);
      }
    },
    [loadDocuments]
  );

  const filterButtons: Array<{
    key: Filter;
    label: string;
  }> = [
    { key: "ALL", label: "Alle" },
    { key: "ANGEBOT", label: "Angebote" },
    { key: "RECHNUNG", label: "Rechnungen" },
    { key: "ABSCHLAG", label: "Abschlagsrechnungen" },
    { key: "REGIE", label: "Regieberichte" },
    { key: "TAGESBERICHT", label: "Tagesberichte" },
    { key: "BAUTAGEBUCH", label: "Bautagebuch" },
    { key: "ARBEITSZEIT", label: "Arbeitszeiten" },
    { key: "LIEFERSCHEIN", label: "Lieferscheine" },
    { key: "AUFMASS", label: "Aufmaß / Mengen" },
    { key: "KALKULATION", label: "Kalkulation" },
    { key: "IMAGE", label: "Bilder" },
    { key: "SONSTIGE", label: "Sonstige" },
  ];

  return (
    <div className="card">
      <header className="rlc-page-hero rlc-page-hero--split">
        <div>
          <div className="rlc-page-hero__eyebrow">
            Büro & Verwaltung
          </div>

          <h1>Dokumentenverwaltung</h1>

          <p>
            Alle projektbezogenen Dokumente, Versionen und Dateien zentral verwalten.
            Projekt {projectLabel || projectId || "—"}
          </p>

          {accountingSource.sourceId && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                fontWeight: 700,
                opacity: 0.9
              }}
            >
              Buchhaltung:
              {" "}
              {accountingSource.sourceType}
              {accountingSource.sourceNumber
                ? ` · ${accountingSource.sourceNumber}`
                : ""}
              {" · "}
              Ein neu hochgeladenes Dokument wird automatisch verknüpft.
            </div>
          )}
        </div>

        <div className="rlc-page-hero__actions">
          <button
            type="button"
            className="rlc-page-hero__button"
            onClick={createDocument}
            disabled={busy || !projectId}
          >
            + Dokument
          </button>
        </div>
      </header>

      <div className="rlc-page-toolbar">
        <input
          className="rlc-page-toolbar__search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Dokument suchen..."
        />

        <div className="rlc-page-toolbar__group">
          <label className="rlc-page-toolbar__field">
            <span>Von</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>

          <label className="rlc-page-toolbar__field">
            <span>Bis</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>

          {(dateFrom || dateTo) && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              Datum zurücksetzen
            </button>
          )}

          <button
            type="button"
            className="btn"
            onClick={() => void loadDocuments()}
            disabled={busy}
          >
            {busy ? "Lädt..." : "Aktualisieren"}
          </button>
        </div>
      </div>

      <div className="rlc-page-workspace">

        <aside className="rlc-page-sidebar">
          {filterButtons.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={
                filter === key
                  ? "rlc-page-category is-active"
                  : "rlc-page-category"
              }
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </aside>

        <section className="rlc-page-list">
          <div className="rlc-page-section-head">
            <strong>Dokumente</strong>
            <span>{filteredDocuments.length} Dokumente</span>
          </div>

          <div className="rlc-page-document-list">
            {filteredDocuments.length ? (
              filteredDocuments.map((doc) => {
                const version = currentVersion(doc);
                const active = selectedId === doc.id;
                const category = documentCategory(doc);

                return (
                  <button
                    key={doc.id}
                    type="button"
                    className={
                      active
                        ? "rlc-page-document-row is-active"
                        : "rlc-page-document-row"
                    }
                    onClick={() => setSelectedId(doc.id)}
                    onDoubleClick={() => openViewer(doc)}
                  >
                    <div className="rlc-page-document-icon">
                      {String(doc.kind || "DOC")
                        .toUpperCase()
                        .slice(0, 3)}
                    </div>

                    <div className="rlc-page-document-copy">
                      <strong>{doc.name || "Dokument"}</strong>

                      <div className="rlc-page-document-meta">
                        <span>{category}</span>

                        <span>
                          {doc.updatedAt
                            ? new Date(doc.updatedAt).toLocaleString("de-DE")
                            : "—"}
                        </span>
                      </div>
                    </div>

                    <div className="rlc-page-document-version">
                      V{Number(version?.version || 1)}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rlc-page-empty">
                <strong>Keine Dokumente gefunden</strong>
                <span>Filter oder Suchbegriff ändern.</span>
              </div>
            )}
          </div>
        </section>

        <section className="rlc-page-detail">
          {selected ? (
            <>
              <div className="rlc-page-detail-head">
                <div className="rlc-page-detail-kicker">
                  {documentCategory(selected)}
                </div>

                <h2>{selected.name || "Dokument"}</h2>

                <div className="rlc-page-document-meta">
                  <span>{selectedKind || "DOC"}</span>
                  <span>
                    Version {Number(currentVersion(selected)?.version || 1)}
                  </span>
                  <span>
                    {selected.updatedAt
                      ? new Date(selected.updatedAt).toLocaleString("de-DE")
                      : "—"}
                  </span>
                </div>
              </div>

              <div className="rlc-page-detail-actions">
                {currentVersion(selected)?.id ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={async () => {
                      try {
                        const version = currentVersion(selected);
                        if (!version?.id) return;

                        const url =
                          await getVersionDownloadUrl(version.id);

                        window.open(
                          url,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      } catch (error: any) {
                        alert(
                          error?.message ||
                          "Dokument konnte nicht geöffnet werden."
                        );
                      }
                    }}
                  >
                    Öffnen
                  </button>
                ) : null}

                {currentVersion(selected)?.id ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const version = currentVersion(selected);

                      if (version?.id) {
                        void downloadVersion(
                          version.id,
                          selected.name || "Dokument"
                        );
                      }
                    }}
                  >
                    Download
                  </button>
                ) : null}

                <button
                  type="button"
                  className="btn"
                  onClick={() => void openHistory(selected)}
                >
                  Versionen
                </button>
              </div>

              <div className="rlc-page-preview">
                {previewBusy ? (
                  <div className="rlc-page-empty">
                    Vorschau wird geladen...
                  </div>
                ) : selectedUrl && selectedKind === "PDF" ? (
                  <iframe
                    src={selectedUrl}
                    title={selected.name || "PDF"}
                  />
                ) : selectedUrl && selectedKind === "IMAGE" ? (
                  <img
                    src={selectedUrl}
                    alt={selected.name || "Dokument"}
                  />
                ) : (
                  <div className="rlc-page-empty">
                    <strong>Keine direkte Vorschau</strong>
                    <span>
                      Dokument öffnen oder herunterladen.
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rlc-page-empty">
              <strong>Dokument auswählen</strong>
              <span>
                Links ein Dokument auswählen, um Vorschau,
                Download und Versionen anzuzeigen.
              </span>
            </div>
          )}
        </section>

      </div>

      {historyDoc && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 24
          }}
          onClick={() => setHistoryDoc(null)}
        >
          <div
            style={{
              width: "min(820px, 96vw)",
              maxHeight: "80vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 14,
              boxShadow: "0 20px 60px rgba(15,23,42,.25)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "18px 20px",
                borderBottom: "1px solid #e2e8f0"
              }}
            >
              <div>
                <strong style={{ fontSize: 17 }}>
                  Versionshistorie
                </strong>

                <div
                  style={{
                    marginTop: 4,
                    color: "#64748b",
                    fontSize: 13
                  }}
                >
                  {historyDoc.name}
                </div>
              </div>

              <button
                type="button"
                className="btn"
                onClick={() => setHistoryDoc(null)}
              >
                ×
              </button>
            </div>

            {historyBusy ? (
              <div style={{ padding: 30 }}>
                Versionen werden geladen...
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse"
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ textAlign: "left", padding: 14 }}>
                      Version
                    </th>
                    <th style={{ textAlign: "left", padding: 14 }}>
                      Status
                    </th>
                    <th style={{ textAlign: "left", padding: 14 }}>
                      Datum
                    </th>
                    <th style={{ textAlign: "left", padding: 14 }}>
                      Größe
                    </th>
                    <th style={{ textAlign: "right", padding: 14 }}>
                      Aktionen
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {historyVersions.map((v) => (
                    <tr
                      key={v.id}
                      style={{
                        borderTop: "1px solid #e2e8f0"
                      }}
                    >
                      <td style={{ padding: 14 }}>
                        <strong>V{v.version}</strong>
                      </td>

                      <td style={{ padding: 14 }}>
                        {v.current ? (
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              background: "#dcfce7",
                              color: "#166534",
                              fontWeight: 700,
                              fontSize: 12
                            }}
                          >
                            Aktuell
                          </span>
                        ) : (
                          <span style={{ color: "#64748b" }}>
                            Historisch
                          </span>
                        )}
                      </td>

                      <td style={{ padding: 14 }}>
                        {v.createdAt
                          ? new Date(v.createdAt).toLocaleString("de-DE")
                          : "—"}
                      </td>

                      <td style={{ padding: 14 }}>
                        {typeof v.size === "number"
                          ? `${(v.size / 1024 / 1024).toFixed(2)} MB`
                          : "—"}
                      </td>

                      <td
                        style={{
                          padding: 14,
                          textAlign: "right"
                        }}
                      >
                        {v.exists !== false ? (
                          <>
                            <button
                              type="button"
                              className="btn"
                              onClick={async () => {
                                try {
                                  const url =
                                    await getVersionDownloadUrl(v.id);
                                  window.open(
                                    url,
                                    "_blank",
                                    "noopener,noreferrer"
                                  );
                                } catch (error: any) {
                                  alert(
                                    error?.message ||
                                      "Version konnte nicht geöffnet werden."
                                  );
                                }
                              }}
                            >
                              Öffnen
                            </button>

                            <button
                              type="button"
                              className="btn"
                              style={{ marginLeft: 6 }}
                              onClick={() =>
                                void downloadVersion(
                                  v.id,
                                  historyDoc.name || "Dokument"
                                )
                              }
                            >
                              Download
                            </button>

                            {!v.current ? (
                              <button
                                type="button"
                                className="btn"
                                style={{ marginLeft: 6 }}
                                onClick={() =>
                                  void restoreVersion(
                                    historyDoc,
                                    v
                                  )
                                }
                              >
                                Wiederherstellen
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <span style={{ color: "#dc2626" }}>
                            Datei fehlt
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {!historyVersions.length && (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          padding: 30,
                          textAlign: "center",
                          color: "#64748b"
                        }}
                      >
                        Keine Versionen vorhanden.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}