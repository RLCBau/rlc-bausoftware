// apps/web/src/pages/buro/dokumente.tsx
import React from "react";
import { DocsDB } from "./store.docs";
import { Dokument, DocVersion } from "./types";
import { useNavigate } from "react-router-dom";
import { useProject } from "../../store/useProject";

// === API server ===
import {
  listDocuments as srvList,
  initDocument as srvInit,
  getUploadUrl as srvGetUrl,
  putToStorage as srvPut,
  detectKind as srvDetectKind,
  softDeleteDocument as srvSoftDelete,
  restoreDocument as srvRestore,
  updateDocument as srvUpdate,
} from "../../api/files";

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--line)",
  fontSize: 13,
  verticalAlign: "middle",
};
const lbl: React.CSSProperties = { fontSize: 13, opacity: 0.8 };
const inp: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13,
};

export default function Dokumente() {
  const [all, setAll] = React.useState<Dokument[]>(DocsDB.list());
  const [selId, setSelId] = React.useState<string | null>(all[0]?.id ?? null);
  const [q, setQ] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState("");
  const [zoom, setZoom] = React.useState(1);

  // Globaler Store (Projekt + aktuell geöffnetes Dokument)
  const navigate = useNavigate();
  const { projectId: projectIdGlobal, setProjectId: setProjectIdGlobal, setCurrentDoc } = useProject();

  // --- Server state
  const [projectId, setProjectId] = React.useState<string>(
    localStorage.getItem("currentProjectId") || projectIdGlobal || ""
  );
  const [serverDocs, setServerDocs] = React.useState<any[]>([]);
  const [serverBusy, setServerBusy] = React.useState(false);

  const API_BASE = (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:4000";

  const sel = all.find((d) => d.id === selId) ?? null;
  const cur: DocVersion | undefined = sel?.versions[0];
  const refresh = () => setAll(DocsDB.list());

  React.useEffect(() => {
    if (!projectId && projectIdGlobal) {
      setProjectId(projectIdGlobal);
    }
  }, [projectIdGlobal]);

  // --- Local actions (immutati)
  const addDoc = () => {
    const d = DocsDB.create();
    refresh();
    setSelId(d.id);
  };
  const delDoc = () => {
    if (!sel) return;
    if (!confirm("Dokument wirklich löschen?")) return;
    DocsDB.remove(sel.id);
    refresh();
    setSelId(DocsDB.list()[0]?.id ?? null);
  };
  const update = (patch: Partial<Dokument>) => {
    if (!sel) return;
    DocsDB.upsert({ ...sel, ...patch });
    refresh();
  };

  const uploadNewVersion = async () =>
    pickFile(async (f) => {
      if (!sel) return;
      await DocsDB.addVersion(sel.id, f);
      refresh();
    });
  const onDrop = async (ev: React.DragEvent) => {
    ev.preventDefault();
    if (!sel) return;
    const f = ev.dataTransfer.files?.[0];
    if (!f) return;
    await DocsDB.addVersion(sel.id, f);
    refresh();
  };

  const download = (v: DocVersion) => {
    const a = document.createElement("a");
    a.href = v.dataURL;
    a.download = v.fileName;
    a.click();
  };
  const copyDataURL = async (v: DocVersion) => {
    await navigator.clipboard.writeText(v.dataURL);
    alert("Data-URL kopiert.");
  };

  const doExportCSV = () => downloadBlob(DocsDB.exportCSV(filtered()), "dokumente.csv", "text/csv;charset=utf-8");
  const doImportCSV = async () =>
    pickFile(async (f) => {
      const n = DocsDB.importCSV(await f.text());
      alert(`${n} Dokumente importiert.`);
      refresh();
    });
  const doExportJSON = () => downloadBlob(DocsDB.exportJSON(), "dokumente_backup.json", "application/json");
  const doImportJSON = async () =>
    pickFile(async (f) => {
      const n = DocsDB.importJSON(await f.text());
      alert(`Backup importiert: ${n} Elemente.`);
      refresh();
    });

  // --- Filtri locali
  const filtered = (): Dokument[] =>
    all.filter((d) => {
      const s = (d.title + " " + (d.tags ?? []).join(" ")).toLowerCase();
      const okQ = !q || s.includes(q.toLowerCase());
      const okT = !tagFilter || (d.tags ?? []).map((t) => t.toLowerCase()).includes(tagFilter.toLowerCase());
      return okQ && okT;
    });
  const allTags = Array.from(new Set(all.flatMap((d) => d.tags ?? []))).sort();

  // --- Server: load list
  async function loadFromServer() {
    if (!projectId) {
      alert("Bitte Project-ID setzen.");
      return;
    }
    setServerBusy(true);
    try {
      const list = await srvList(projectId);
      setServerDocs(list);
      localStorage.setItem("currentProjectId", projectId);
      setProjectIdGlobal(projectId);
    } finally {
      setServerBusy(false);
    }
  }

  // --- Server: upload versione selezionata
  async function uploadSelectionToServer() {
    if (!sel || !cur) {
      alert("Wähle ein Dokument mit einer Version aus.");
      return;
    }
    if (!projectId) {
      alert("Bitte Project-ID setzen.");
      return;
    }
    setServerBusy(true);
    try {
      const blob = dataURLtoBlob(cur.dataURL);
      const file = new File([blob], cur.fileName, { type: cur.mime || "application/octet-stream" });
      const kind = srvDetectKind(file);
      const { documentId } = await srvInit(projectId, kind as any, file.name);
      const { uploadUrl } = await srvGetUrl(documentId, file.name, file.type || "application/octet-stream");
      await srvPut(uploadUrl, file, file.type || "application/octet-stream");
      await loadFromServer();
      setCurrentDoc({ id: documentId, name: file.name, kind });
      alert("Upload zum Server abgeschlossen.");
    } catch (e: any) {
      alert(e?.message || "Upload zum Server fehlgeschlagen.");
    } finally {
      setServerBusy(false);
    }
  }

  // --- Server: soft delete / restore
  async function softDelete(docId: string) {
    if (!confirm("Dieses Dokument serverseitig (soft) löschen?")) return;
    setServerBusy(true);
    try {
      await srvSoftDelete(docId);
      await loadFromServer();
    } finally {
      setServerBusy(false);
    }
  }
  async function restore(docId: string) {
    setServerBusy(true);
    try {
      await srvRestore(docId);
      await loadFromServer();
    } finally {
      setServerBusy(false);
    }
  }

  // --- Server: update meta (rename + tags)
  function EditableMeta({ row }: { row: any }) {
    const [name, setName] = React.useState<string>(row.name || "");
    const [tags, setTags] = React.useState<string>((row.meta?.tags ?? []).join(", "));
    const saving = React.useRef(false);

    const save = async () => {
      if (saving.current) return;
      saving.current = true;
      try {
        const parsedTags = tags
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean);
        await srvUpdate(row.id, { name, tags: parsedTags });
        await loadFromServer();
      } finally {
        saving.current = false;
      }
    };

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
        <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <input style={inp} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags, komma, getrennt" />
        <button className="btn" onClick={save}>
          Speichern
        </button>
      </div>
    );
  }

  // --- Presigned URL holen und im passenden Viewer öffnen
  async function openInViewer(row: any) {
    if (!projectId) {
      alert("Bitte Project-ID setzen.");
      return;
    }
    try {
      setCurrentDoc({ id: row.id, name: row.name, kind: row.kind });
      const kind = String(row.kind || "").toUpperCase();
      if (kind === "PDF") navigate("/cad/pdf-viewer");
      else if (["DWG", "DXF"].includes(kind)) navigate("/cad/viewer");
      else navigate("/buro/dokumente");
    } catch (e: any) {
      alert(e?.message || "Öffnen fehlgeschlagen.");
    }
  }

  // --- Schnellnavigation (Büro ↔ Lieferscheine ↔ Buchhaltung)
  function goToLieferscheine() {
    // offizielle Route laut App.tsx
    navigate("/mengenermittlung/lieferscheine");
  }
  function goToBuchhaltungBelege() {
    // Buchhaltung -> "Dokumente & Belege verwalten" = reports
    navigate("/buchhaltung/reports");
  }
  function quickFilterLieferschein() {
    // Helfer: setze Suchfeld/Tagfilter schnell auf "Lieferschein"
    // (funktioniert für lokale Dokumente über Titel/Tags)
    setQ("lieferschein");
    setTagFilter("");
  }

  // --- Anteprima locale
  const renderPreview = (v?: DocVersion) => {
    if (!v) return <div style={{ opacity: 0.6 }}>Keine Version vorhanden.</div>;
    const isPDF = (v.mime || "").includes("pdf") || /\.pdf$/i.test(v.fileName);
    const isImg =
      (v.mime || "").startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(v.fileName);
    const openNew = () => {
      const w = window.open(v.dataURL, "_blank");
      if (!w) alert("Popup blockiert.");
    };

    return (
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 8, height: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={v.fileName}
          >
            {v.fileName}
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>
            -
          </button>
          <div style={{ minWidth: 60, textAlign: "center" }}>{Math.round(zoom * 100)}%</div>
          <button className="btn" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
            +
          </button>
          <button className="btn" onClick={openNew}>
            In neuem Tab öffnen
          </button>
        </div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "auto", background: "#fff" }}>
          {isPDF ? (
            <iframe
              title="pdf"
              src={v.dataURL}
              style={{
                width: "100%",
                height: "100%",
                border: "0",
                transform: `scale(${zoom})`,
                transformOrigin: "0 0",
              }}
            />
          ) : isImg ? (
            <div style={{ overflow: "auto" }}>
              <img
                src={v.dataURL}
                alt={v.fileName}
                style={{ width: `${zoom * 100}%`, height: "auto", display: "block" }}
              />
            </div>
          ) : (
            <div style={{ padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Vorschau nicht unterstützt.</div>
              <div style={{ opacity: 0.7, marginBottom: 8 }}>Typ: {v.mime || "—"}</div>
              <button className="btn" onClick={openNew}>
                Öffnen / Download
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 10, padding: 10 }}>
      <div
        className="card"
        style={{ padding: "8px 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
      >
        {/* ✅ Schnell-Buttons oben (wie gewünscht, aber in Dokumente statt Übersicht) */}
        <button className="btn" onClick={goToLieferscheine}>
          → Lieferscheine
        </button>
        <button className="btn" onClick={goToBuchhaltungBelege}>
          → Buchhaltung: Dokumente &amp; Belege
        </button>
        <button className="btn" onClick={quickFilterLieferschein} title="Filter lokal nach 'Lieferschein'">
          Filter: Lieferschein
        </button>

        <div style={{ width: 1, height: 24, background: "var(--line)", margin: "0 6px" }} />

        <button className="btn" onClick={addDoc}>
          + Dokument
        </button>
        <button className="btn" onClick={delDoc} disabled={!sel}>
          Löschen
        </button>
        <div style={{ flex: 1 }} />
        <input placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inp, width: 200 }} />
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ ...inp, width: 160 }}>
          <option value="">Alle Tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button className="btn" onClick={uploadNewVersion} disabled={!sel}>
          Neue Version
        </button>
        <button className="btn" onClick={doImportCSV}>
          Import CSV
        </button>
        <button className="btn" onClick={doExportCSV}>
          Export CSV
        </button>
        <button className="btn" onClick={doImportJSON}>
          Import JSON
        </button>
        <button className="btn" onClick={doExportJSON}>
          Export JSON
        </button>

        <div style={{ width: 1, height: 24, background: "var(--line)", margin: "0 6px" }} />
        <input
          placeholder="Project-ID (Server)"
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setProjectIdGlobal(e.target.value);
          }}
          style={{ ...inp, width: 280 }}
        />
        <button className="btn" onClick={loadFromServer} disabled={!projectId || serverBusy}>
          Server: Laden
        </button>
        <button className="btn" onClick={uploadSelectionToServer} disabled={!projectId || !sel || !cur || serverBusy}>
          Auswahl → Server
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr min(42vw, 640px)", gap: 10, minHeight: "60vh" }}>
        <div style={{ display: "grid", gridTemplateRows: "minmax(200px, 40vh) auto", gap: 10 }}>
          <div className="card" style={{ padding: 0, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Titel</th>
                  <th style={th}>Tags</th>
                  <th style={th}>Letzte Version</th>
                  <th style={th}>Größe</th>
                  <th style={th}>Geändert</th>
                </tr>
              </thead>
              <tbody>
                {filtered().map((d) => {
                  const v = d.versions[0];
                  return (
                    <tr
                      key={d.id}
                      onClick={() => {
                        setSelId(d.id);
                        setZoom(1);
                      }}
                      style={{
                        cursor: "pointer",
                        background: d.id === selId ? "#f1f5ff" : undefined,
                      }}
                    >
                      <td style={td}>{d.title}</td>
                      <td style={td}>{(d.tags ?? []).join(", ")}</td>
                      <td style={td}>{v ? v.fileName : <i>—</i>}</td>
                      <td style={td}>{v ? (v.size / 1024).toFixed(1) + " KB" : "—"}</td>
                      <td style={td}>{new Date(d.updatedAt).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card" onDragOver={(e) => e.preventDefault()} onDrop={onDrop} style={{ padding: 12 }}>
            {!sel ? (
              <div style={{ opacity: 0.7 }}>Wähle links ein Dokument aus oder erstelle ein neues.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 150px 1fr", gap: 10 }}>
                <label style={lbl}>Titel</label>
                <input style={{ ...inp, width: "100%" }} value={sel.title} onChange={(e) => update({ title: e.target.value })} />

                <label style={lbl}>Tags</label>
                <input
                  style={{ ...inp, width: "100%" }}
                  placeholder="kommagetrennt"
                  value={(sel.tags ?? []).join(", ")}
                  onChange={(e) =>
                    update({
                      tags: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />

                <label style={lbl}>Projekt-ID</label>
                <input style={inp} value={sel.projektId ?? ""} onChange={(e) => update({ projektId: e.target.value })} />

                <label style={{ ...lbl, gridColumn: "1 / -1" }}>Versionen (Drag&Drop Datei hier)</label>
                <div style={{ gridColumn: "1 / -1" }}>
                  {!sel.versions.length ? (
                    <div style={{ opacity: 0.7 }}>Noch keine Version hochgeladen.</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={th}>Datei</th>
                          <th style={th}>Typ</th>
                          <th style={th}>Größe</th>
                          <th style={th}>Hochgeladen</th>
                          <th style={th}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sel.versions.map((v, i) => (
                          <tr key={v.id} style={{ background: i === 0 ? "#eef8f0" : undefined }}>
                            <td style={td} title={v.fileName}>
                              {v.fileName}
                            </td>
                            <td style={td}>{v.mime || "—"}</td>
                            <td style={td}>{(v.size / 1024).toFixed(1)} KB</td>
                            <td style={td}>{new Date(v.uploadedAt).toLocaleString()}</td>
                            <td style={{ ...td, whiteSpace: "nowrap" }}>
                              <button className="btn" onClick={() => download(v)}>
                                Download
                              </button>
                              <button className="btn" onClick={() => copyDataURL(v)}>
                                Data-URL kopieren
                              </button>
                              {i > 0 && (
                                <button
                                  className="btn"
                                  onClick={() => {
                                    DocsDB.restoreVersion(sel.id, v.id);
                                    refresh();
                                  }}
                                >
                                  Wiederherstellen
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Server-Dokumente</div>
              <div style={{ flex: 1 }} />
              <button className="btn" onClick={loadFromServer} disabled={!projectId || serverBusy}>
                Aktualisieren
              </button>
            </div>

            {!projectId ? (
              <div style={{ opacity: 0.7, marginTop: 8 }}>Bitte eine Project-ID eingeben, um Server-Dokumente zu sehen.</div>
            ) : serverDocs.length === 0 ? (
              <div style={{ opacity: 0.7, marginTop: 8 }}>{serverBusy ? "Lade…" : "Keine Dokumente auf dem Server gefunden."}</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                <thead>
                  <tr>
                    <th style={th}>Name / Meta</th>
                    <th style={th}>Typ</th>
                    <th style={th}>Versionen</th>
                    <th style={th}>Geändert</th>
                    <th style={th}>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {serverDocs.map((d: any) => {
                    const last = d.versions?.[d.versions.length - 1] || null;
                    const storageUrl = last ? `${API_BASE}/files/${projectId}/storage/${last.storageId}` : null;
                    const isCAD = d.name?.toLowerCase()?.endsWith(".dwg") || d.name?.toLowerCase()?.endsWith(".dxf");
                    const deleted = !!d.deletedAt;

                    return (
                      <tr key={d.id} style={{ opacity: deleted ? 0.55 : 1 }}>
                        <td style={td}>
                          <EditableMeta row={d} />
                        </td>
                        <td style={td}>{String(d.kind)}</td>
                        <td style={td}>{d.versions?.length ?? 0}</td>
                        <td style={td}>{new Date(d.updatedAt).toLocaleString()}</td>
                        <td style={{ ...td, whiteSpace: "nowrap", display: "flex", gap: 6 }}>
                          {storageUrl ? (
                            <a className="btn" href={storageUrl} target="_blank" rel="noreferrer">
                              Öffnen (direkt)
                            </a>
                          ) : (
                            <span style={{ opacity: 0.6 }}>—</span>
                          )}
                          <button className="btn" onClick={() => openInViewer(d)}>
                            Im Viewer öffnen
                          </button>
                          {!deleted ? (
                            <button className="btn" onClick={() => softDelete(d.id)}>
                              Löschen
                            </button>
                          ) : (
                            <button className="btn" onClick={() => restore(d.id)}>
                              Wiederherstellen
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 12, minHeight: 300 }}>
          {renderPreview(cur)}
        </div>
      </div>
    </div>
  );
}

function pickFile(onPick: (f: File) => void) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.onchange = () => {
    const f = inp.files?.[0];
    if (f) onPick(f);
  };
  inp.click();
}
function downloadBlob(text: string, name: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
function dataURLtoBlob(dataURL: string): Blob {
  const [meta, b64] = dataURL.split(",");
  const mime = /data:([^;]+);base64/.exec(meta)?.[1] || "application/octet-stream";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
