import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  listDocuments,
  initDocument,
  getUploadUrl,
  putToStorage,
  detectKind,
  type DocumentDto,
} from "../../api/files";
import "./documents.css";

type Props = {
  projectId: string;
};

type UploadItem = {
  file: File;
  progress: number; // 0..100
  status: "wartend" | "lade" | "fertig" | "fehler";
  error?: string;
};

const prettyDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

export default function DocumentManager({ projectId }: Props) {
  const [docs, setDocs] = useState<DocumentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await listDocuments(projectId);
      // neueste zuerst
      data.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      setDocs(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [projectId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return docs;
    return docs.filter(d => d.name.toLowerCase().includes(s) || String(d.kind).toLowerCase().includes(s));
  }, [docs, q]);

  function onChooseFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
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
    const list = files.map<UploadItem>(f => ({ file: f, progress: 0, status: "wartend" }));
    setUploads(prev => [...list, ...prev]);
    // sofort starten
    list.forEach(startUpload);
  }

  async function startUpload(item: UploadItem) {
    const file = item.file;
    const contentType = file.type || "application/octet-stream";
    const kind = detectKind(file);

    setUploads(prev =>
      prev.map(u => (u === item ? { ...u, status: "lade", progress: 5 } : u))
    );

    try {
      // 1) DB-Dokument anlegen
      const { documentId } = await initDocument(projectId, kind, file.name);

      // 2) Presigned-URL holen (legt Version an)
      const { uploadUrl } = await getUploadUrl(documentId, file.name, contentType);

      // 3) PUT nach MinIO (progress simuliert, da fetch kein progress-Event hat)
      // Workaround: wir "ticken" progress, bis der Request resolved.
      const tick = setInterval(() => {
        setUploads(prev =>
          prev.map(u =>
            u === item ? { ...u, progress: Math.min(u.progress + 5, 90) } : u
          )
        );
      }, 200);

      await putToStorage(uploadUrl, file, contentType);
      clearInterval(tick);

      setUploads(prev =>
        prev.map(u => (u === item ? { ...u, progress: 100, status: "fertig" } : u))
      );

      // 4) Liste neu laden
      refresh();
    } catch (e: any) {
      setUploads(prev =>
        prev.map(u =>
          u === item ? { ...u, status: "fehler", error: e?.message || String(e) } : u
        )
      );
    }
  }

  async function openPreview(doc: DocumentDto) {
    // Für PDFs/Images können wir direkt /files/{storageId} zeigen (Server stellt /files/ bereit)
    const last = doc.versions?.[doc.versions.length - 1] ?? null;
    if (!last) return;
    // Backend speichert Dateien unter /files/{projectId}/storage/{storageId}
    const url = `${import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:4000"}/files/${projectId}/storage/${last.storageId}`;
    setPreview({ url, name: doc.name });
  }

  return (
    <div className="docmgr">
      <div className="docmgr-header">
        <div>
          <h2>Dokumentenverwaltung</h2>
          <p className="muted">Projekt: <code>{projectId}</code></p>
        </div>
        <div className="docmgr-actions">
          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={onChooseFiles}
            style={{ display: "none" }}
          />
          <input
            className="search"
            placeholder="Suche (Name/Typ)…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <button className="btn" onClick={() => inputRef.current?.click()}>Dateien wählen</button>
          <button className="btn ghost" onClick={refresh}>Aktualisieren</button>
        </div>
      </div>

      <div
        className="dropzone"
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
      >
        <span>Dateien hierher ziehen oder oben auswählen</span>
      </div>

      {uploads.length > 0 && (
        <div className="uploadlist">
          {uploads.map((u, i) => (
            <div key={i} className={`upload ${u.status}`}>
              <div className="name">{u.file.name}</div>
              <div className="bar">
                <div className="fill" style={{ width: `${u.progress}%` }} />
              </div>
              <div className="status">{u.status}{u.error ? `: ${u.error}` : ""}</div>
            </div>
          ))}
        </div>
      )}

      <div className="table">
        <div className="thead">
          <div>Datei</div>
          <div>Typ</div>
          <div>Versionen</div>
          <div>Aktualisiert</div>
          <div>Aktion</div>
        </div>
        {loading ? (
          <div className="row muted">Lade…</div>
        ) : filtered.length === 0 ? (
          <div className="row muted">Keine Dokumente gefunden.</div>
        ) : (
          filtered.map(d => (
            <div key={d.id} className="row">
              <div className="cell name">{d.name}</div>
              <div className="cell">{String(d.kind)}</div>
              <div className="cell">{d.versions?.length ?? 0}</div>
              <div className="cell">{prettyDate(d.updatedAt)}</div>
              <div className="cell">
                <button className="btn small" onClick={() => openPreview(d)}>Ansehen</button>
              </div>
            </div>
          ))
        )}
      </div>

      {preview && (
        <div className="modal" onClick={() => setPreview(null)}>
          <div className="modal-body" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="title">{preview.name}</div>
              <button className="btn small ghost" onClick={() => setPreview(null)}>Schließen</button>
            </div>
            <iframe title="preview" src={preview.url} className="frame" />
          </div>
        </div>
      )}
    </div>
  );
}
