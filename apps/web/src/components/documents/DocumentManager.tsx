import { rlcClass } from "../../ui/rlcRuntimeStyle";import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  listDocuments,
  initDocument,
  getUploadUrl,
  putToStorage,
  detectKind,
  getDocumentViewUrl,
  type DocumentDto } from
"../../api/files";
import "./documents.css";

type Props = {
  projectId: string;
};

type UploadStatus = "wartend" | "lade" | "fertig" | "fehler";

type UploadItem = {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  error?: string;
};

const prettyDate = (iso?: string | null) =>
iso ?
new Date(iso).toLocaleString(undefined, {
  dateStyle: "short",
  timeStyle: "short"
}) :
"—";

function makeUploadId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().
  toString(36).
  slice(2, 8)}`;
}

export default function DocumentManager({ projectId }: Props) {
  const [docs, setDocs] = useState<DocumentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [preview, setPreview] = useState<{url: string;name: string;} | null>(
    null
  );

  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await listDocuments(projectId);

      const sorted = [...data].sort((a, b) => {
        const aTs = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTs = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTs - aTs;
      });

      setDocs(sorted);
    } catch (e) {
      console.error("Document refresh failed:", e);
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [projectId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return docs;

    return docs.filter(
      (d) =>
      d.name.toLowerCase().includes(s) ||
      String(d.kind).toLowerCase().includes(s)
    );
  }, [docs, q]);

  function updateUpload(id: string, patch: Partial<UploadItem>) {
    setUploads((prev) =>
    prev.map((u) => u.id === id ? { ...u, ...patch } : u)
    );
  }

  function onChooseFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    queueFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.dataTransfer.files?.length) {
      queueFiles(Array.from(e.dataTransfer.files));
    }
  }

  function queueFiles(files: File[]) {
    const list = files.map<UploadItem>((file) => ({
      id: makeUploadId(file),
      file,
      progress: 0,
      status: "wartend"
    }));

    setUploads((prev) => [...list, ...prev]);

    list.forEach((item) => {
      void startUpload(item);
    });
  }

  async function startUpload(item: UploadItem) {
    const { id, file } = item;
    const contentType = file.type || "application/octet-stream";
    const kind = detectKind(file);

    updateUpload(id, { status: "lade", progress: 5, error: undefined });

    let tick: number | null = null;

    try {
      const { documentId } = await initDocument(projectId, kind, file.name);
      const { uploadUrl } = await getUploadUrl(
        documentId,
        file.name,
        contentType
      );

      tick = window.setInterval(() => {
        setUploads((prev) =>
        prev.map((u) =>
        u.id === id ?
        { ...u, progress: Math.min(u.progress + 5, 90) } :
        u
        )
        );
      }, 200);

      await putToStorage(uploadUrl, file, contentType);

      if (tick) {
        window.clearInterval(tick);
      }

      updateUpload(id, {
        progress: 100,
        status: "fertig",
        error: undefined
      });

      await refresh();
    } catch (e: any) {
      if (tick) {
        window.clearInterval(tick);
      }

      updateUpload(id, {
        status: "fehler",
        error: e?.message || String(e)
      });
    }
  }

  async function openPreview(doc: DocumentDto) {
    try {
      const { url } = await getDocumentViewUrl(doc.id);
      if (!url) return;
      setPreview({ url, name: doc.name });
    } catch (e) {
      console.error("Preview failed:", e);
    }
  }

  return (
    <div className="docmgr">
      <div className="docmgr-header">
        <div>
          <h2>Dokumentenverwaltung</h2>
          <p className="muted">
            Projekt: <code>{projectId}</code>
          </p>
        </div>

        <div className="docmgr-actions">
          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={onChooseFiles} className="rlc-migrated-components-documents-documentmanager-tsx-56" />

          

          <input
            className="search"
            placeholder="Suche (Name/Typ)…"
            value={q}
            onChange={(e) => setQ(e.target.value)} />
          

          <button
            type="button"
            className="btn"
            onClick={() => inputRef.current?.click()}>
            
            Dateien wählen
          </button>

          <button
            type="button"
            className="btn ghost"
            onClick={() => void refresh()}>
            
            Aktualisieren
          </button>
        </div>
      </div>

      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}>
        
        <span>Dateien hierher ziehen oder oben auswählen</span>
      </div>

      {uploads.length > 0 &&
      <div className="uploadlist">
          {uploads.map((u) =>
        <div key={u.id} className={`upload ${u.status}`}>
              <div className="name">{u.file.name}</div>

              <div className="bar">
                <div className={rlcClass("fill", { width: `${u.progress}%` })} />
              </div>

              <div className="status">
                {u.status}
                {u.error ? `: ${u.error}` : ""}
              </div>
            </div>
        )}
        </div>
      }

      <div className="table">
        <div className="thead">
          <div>Datei</div>
          <div>Typ</div>
          <div>Versionen</div>
          <div>Aktualisiert</div>
          <div>Aktion</div>
        </div>

        {loading ?
        <div className="row muted">Lade…</div> :
        filtered.length === 0 ?
        <div className="row muted">Keine Dokumente gefunden.</div> :

        filtered.map((d) =>
        <div key={d.id} className="row">
              <div className="cell name">{d.name}</div>
              <div className="cell">{String(d.kind)}</div>
              <div className="cell">{d.versions?.length ?? 0}</div>
              <div className="cell">{prettyDate(d.updatedAt)}</div>
              <div className="cell">
                <button
              type="button"
              className="btn small"
              onClick={() => void openPreview(d)}>
              
                  Ansehen
                </button>
              </div>
            </div>
        )
        }
      </div>

      {preview &&
      <div
        className="modal"
        onClick={() => setPreview(null)}
        role="dialog"
        aria-modal="true">
        
          <div className="modal-body" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="title">{preview.name}</div>
              <button
              type="button"
              className="btn small ghost"
              onClick={() => setPreview(null)}>
              
                Schließen
              </button>
            </div>

            <iframe title="preview" src={preview.url} className="frame" />
          </div>
        </div>
      }
    </div>);

}
