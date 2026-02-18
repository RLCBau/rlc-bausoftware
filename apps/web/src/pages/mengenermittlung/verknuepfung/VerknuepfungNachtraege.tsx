// apps/web/src/pages/mengenermittlung/VerknuepfungNachtraege.tsx
import React from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { exportNachtragPdf } from "../../../api/pdf";
import * as XLSX from "xlsx";


/* ===== Types ===== */
type LVPos = { id: string; pos: string; shortText?: string; unit?: string; ep?: number };
type Datei = { id: string; name: string; url: string; type: string };
type Nachtrag = {
  id?: string;
  projectId: string;
  lvPosId?: string | null;
  lvPos?: string | null;
  number?: string;
  title?: string;
  qty?: number;
  unit?: string;
  ep?: number;
  total?: number;
  status?: "offen" | "inBearbeitung" | "freigegeben" | "abgelehnt";
  note?: string;
  attachments?: Datei[];
};

/* ===== Utils ===== */
const rid = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}
const num = (v: any, d = 2) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "";
};
const isImg = (t?: string) => !!t && t.startsWith("image/");
const isPdf = (t?: string) => t === "application/pdf";
const guessType = (name: string) => {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["jpg","jpeg","png","gif","webp","bmp","heic","heif"].includes(ext)) return `image/${ext==="jpg"?"jpeg":ext}`;
  if (ext==="pdf") return "application/pdf";
  return "application/octet-stream";
};
async function urlToDataURL(url: string, prefer = "image/jpeg"): Promise<string|null> {
  try {
    const res = await fetch(url); const blob = await res.blob();
    try {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      c.getContext("2d")!.drawImage(bmp, 0, 0);
      return c.toDataURL(prefer);
    } catch {
      if (blob.type.startsWith("image/")) {
        const r = new FileReader();
        return await new Promise<string>(resolve => { r.onload = () => resolve(r.result as string); r.readAsDataURL(blob); });
      }
      return null;
    }
  } catch { return null; }
}

/* ===== Component ===== */
export default function VerknuepfungNachtraege() {
  const [projectId, setProjectId] = React.useState("");
  const [lvSearch, setLvSearch] = React.useState("");
  const [lvList, setLvList] = React.useState<LVPos[]>([]);
  const [selectedLV, setSelectedLV] = React.useState<LVPos | null>(null);

  const [rows, setRows] = React.useState<Nachtrag[]>([]);
  const [selIdx, setSelIdx] = React.useState<number | null>(null);

  const [form, setForm] = React.useState<Nachtrag>({
    projectId: "", status: "offen", qty: 0, ep: 0, total: 0, attachments: []
  });

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  /* Load LV */
  async function loadLV() {
    setError(null);
    if (!projectId) { setLvList([]); setSelectedLV(null); return; }
    setLoading(true);
    try {
      const res = await api<{ ok: boolean; items: LVPos[] }>(`/api/lv/positions?projectId=${encodeURIComponent(projectId)}`);
      setLvList(res.items || []);
    } catch (e) {
      console.warn("LV load fallback:", e);
      setLvList([]); // puoi inserire lvPos manualmente
    } finally { setLoading(false); }
  }

  /* Load Nachträge */
  const loadNachtraege = React.useCallback(async () => {
    setError(null);
    if (!projectId) { setRows([]); return; }
    setLoading(true);
    try {
      const url = selectedLV?.id
        ? `/api/nachtraege?projectId=${encodeURIComponent(projectId)}&lvPosId=${encodeURIComponent(selectedLV.id)}`
        : `/api/nachtraege?projectId=${encodeURIComponent(projectId)}`;
      const res = await api<{ ok: boolean; items: Nachtrag[] }>(url);
      const list = (res.items || []).map(n => ({ ...n, total: (n.qty||0) * (n.ep||0) }));
      setRows(list);
    } catch (e) {
      // fallback localStorage
      const key = `nt:${projectId}`;
      const list: Nachtrag[] = JSON.parse(localStorage.getItem(key) || "[]");
      setRows(selectedLV ? list.filter(n => n.lvPosId === selectedLV.id || n.lvPos === selectedLV.pos) : list);
      setError("Offline gespeichert (LS). Serverfehler.");
    } finally { setLoading(false); }
  }, [projectId, selectedLV]);

  React.useEffect(() => { if (projectId) loadNachtraege(); }, [projectId, selectedLV, loadNachtraege]);

  /* Helpers */
  function setF<K extends keyof Nachtrag>(k: K, v: Nachtrag[K]) {
    setForm(prev => {
      const next: Nachtrag = { ...prev, [k]: v };
      if (k === "qty" || k === "ep") next.total = (Number(next.qty)||0) * (Number(next.ep)||0);
      return next;
    });
  }
  function clearForm() {
    setSelIdx(null);
    setForm({
      projectId,
      lvPosId: selectedLV?.id ?? null,
      lvPos: selectedLV?.pos ?? null,
      number: "",
      title: "",
      qty: 0,
      unit: selectedLV?.unit ?? "",
      ep: selectedLV?.ep ?? 0,
      total: 0,
      status: "offen",
      note: "",
      attachments: [],
    });
  }
  function selectRow(i: number) {
    setSelIdx(i);
    setForm({ ...rows[i], attachments: rows[i].attachments || [] });
  }
  function persistLocal(next?: Nachtrag[]) {
    if (!projectId) return;
    localStorage.setItem(`nt:${projectId}`, JSON.stringify(next ?? rows));
  }

  /* Save / Delete */
  async function save() {
    if (!projectId) return alert("Projekt-ID fehlt.");
    const base: Nachtrag = {
      ...form,
      projectId,
      lvPosId: selectedLV?.id ?? form.lvPosId ?? null,
      lvPos: selectedLV?.pos ?? form.lvPos ?? null,
      total: (Number(form.qty)||0) * (Number(form.ep)||0)
    };

    try {
      setError(null);
      if (base.id) {
        setRows(prev => prev.map(r => (r.id === base.id ? base : r)));
        await api(`/api/nachtraege/${base.id}`, { method: "PUT", body: JSON.stringify(base) });
      } else {
        const optimisticId = rid();
        setRows(prev => [{ ...base, id: optimisticId }, ...prev]);
        const res = await api<{ ok: boolean; item: Nachtrag }>(`/api/nachtraege`, { method: "POST", body: JSON.stringify(base) });
        const saved = { ...res.item, total: (res.item.qty||0) * (res.item.ep||0) };
        setRows(prev => prev.map(r => (r.id === optimisticId ? saved : r)));
      }
      persistLocal();
      clearForm();
    } catch (e) {
      console.warn("Save fallback:", e);
      const withId = base.id ? base : { ...base, id: rid() };
      const next = [withId, ...rows];
      setRows(next);
      persistLocal(next);
      clearForm();
      setError("Offline gespeichert (LS). Serverfehler.");
    }
  }

  async function removeRow(r: Nachtrag, i: number) {
    const next = rows.filter((_, idx) => idx !== i);
    setRows(next);
    persistLocal(next);
    try { if (r.id) await api(`/api/nachtraege/${r.id}`, { method: "DELETE" }); } catch { /* ignore */ }
    if (selIdx === i) clearForm();
  }

  /* Attachments */
  function addFiles(list: FileList | null) {
    if (!list) return;
    const arr: Datei[] = Array.from(list).map(f => ({
      id: rid(), name: f.name, url: URL.createObjectURL(f), type: f.type || guessType(f.name)
    }));
    setForm(p => ({ ...p, attachments: [...(p.attachments || []), ...arr] }));
  }
  function removeAttachment(id: string) {
    setForm(p => ({ ...p, attachments: (p.attachments || []).filter(a => a.id !== id) }));
  }

  /* Export */
  function exportXlsx() {
    if (!rows.length) return alert("Keine Daten.");
    const data = rows.map(r => ({
      "NT-Nr.": r.number ?? "",
      Titel: r.title ?? "",
      "LV-Pos": r.lvPos ?? "",
      Menge: r.qty ?? 0,
      Einheit: r.unit ?? "",
      "EP (€)": r.ep ?? 0,
      "Gesamt (€)": r.total ?? 0,
      Status: r.status ?? "",
      Notiz: r.note ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nachtraege");
    XLSX.writeFile(wb, `Nachtraege_${projectId || "ohneProjekt"}_${selectedLV?.pos || "alle"}.xlsx`);
  }

  async function exportPdf(preview = false) {
    if (!rows.length) return alert("Keine Daten.");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm" });
    doc.setFontSize(14);
    doc.text(
      `Nachträge – Projekt: ${projectId || "-"}${selectedLV ? ` – LV-Pos ${selectedLV.pos}` : ""}`,
      14, 16
    );

    const body = rows.map(r => [
      r.number ?? "", r.title ?? "", r.lvPos ?? "",
      num(r.qty), r.unit ?? "", num(r.ep), num(r.total), (r.status ?? ""), (r.note ?? "").slice(0, 120)
    ]);

    autoTable(doc, {
      startY: 22,
      head: [["NT-Nr.","Titel","LV-Pos","Menge","Einheit","EP (€)","Gesamt (€)","Status","Notiz"]],
      body,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [20,20,20] }
    });

    // thumbnails immagini + elenco PDF
    const pageH = doc.internal.pageSize.getHeight();
    let y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : 30;
    const left = 14, gap = 4, thumbW = 50, thumbH = 38, perRow = 5;

    for (const r of rows) {
      const imgs = (r.attachments || []).filter(a => isImg(a.type));
      const pdfs = (r.attachments || []).filter(a => isPdf(a.type));
      if (!imgs.length && !pdfs.length) continue;

      if (y + 10 > pageH) { doc.addPage(); y = 14; }
      doc.setFontSize(12);
      doc.text(`Anhänge zu ${r.number ?? "-"} – ${r.title ?? "-"}`, left, y);
      y += 5;

      if (imgs.length) {
        let col = 0;
        for (const a of imgs) {
          const dataUrl = await urlToDataURL(a.url, "image/jpeg");
          if (!dataUrl) continue;
          if (col >= perRow) { col = 0; y += thumbH + gap; }
          if (y + thumbH + 10 > pageH) { doc.addPage(); y = 14; }
          const x = left + col * (thumbW + gap);
          doc.addImage(dataUrl, "JPEG", x, y, thumbW, thumbH);
          col++;
        }
        y += thumbH + 4;
      }

      if (pdfs.length) {
        if (y + 10 > pageH) { doc.addPage(); y = 14; }
        doc.setFontSize(11);
        doc.text("Anhänge – PDF:", left, y); y += 5;
        doc.setFontSize(9);
        for (const p of pdfs) {
          if (y + 5 > pageH) { doc.addPage(); y = 14; }
          doc.text(`• ${p.name}`, left + 2, y); y += 4;
        }
        y += 2;
      }
    }

    if (preview) {
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      return;
    }
    doc.save(`Nachtraege_${projectId || "ohneProjekt"}_${selectedLV?.pos || "alle"}.pdf`);
  }

  /* Render */
  return (
    <div style={{ display: "grid", gridTemplateColumns: "480px 1fr", gap: 16 }}>
      {/* Left column */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Verknüpfung mit Nachträgen</h3>

        {/* Project / LV search */}
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <Field label="Projekt-ID">
            <input value={projectId} onChange={e => setProjectId(e.target.value)} placeholder="z. B. PRJ-2025-001" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <Field label="LV-Position suchen">
              <input value={lvSearch} onChange={e => setLvSearch(e.target.value)} placeholder="Pos. oder Text…" />
            </Field>
            <button className="btn" style={{ alignSelf: "end", height: 36 }} onClick={loadLV} disabled={!projectId || loading}>LV laden</button>
          </div>
        </div>

        {/* LV list */}
        <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, marginTop: 8 }}>
          {lvList
            .filter(l =>
              !lvSearch ||
              l.pos?.toLowerCase().includes(lvSearch.toLowerCase()) ||
              (l.shortText || "").toLowerCase().includes(lvSearch.toLowerCase())
            )
            .map(l => (
              <div key={l.id}
                   onClick={() => { setSelectedLV(l); clearForm(); }}
                   style={{
                     padding: "8px 10px",
                     cursor: "pointer",
                     background: selectedLV?.id === l.id ? "rgba(0,0,0,0.05)" : undefined,
                     borderBottom: "1px solid var(--line)"
                   }}>
                <strong style={{ width: 90, display: "inline-block" }}>{l.pos}</strong>
                <span>{l.shortText}</span>
                <span style={{ float: "right", opacity: .7 }}>{l.unit} · EP {num(l.ep)}</span>
              </div>
            ))}
          {lvList.length === 0 && (
            <div style={{ padding: 10, color: "var(--muted)" }}>Keine LV-Positionen (oder nicht geladen).</div>
          )}
        </div>

        {/* Import attachments quick */}
        <div style={{ marginTop: 12 }}>
          <input id="ntImport" type="file" multiple accept="image/*,.pdf,.heic,.heif"
                 onChange={e => addFiles(e.target.files)} style={{ display: "none" }} />
          <label htmlFor="ntImport" className="btn">📥 PDF / Fotos importieren</label>
        </div>

        {/* Form Nachtrag */}
        <h4 style={{ marginTop: 16 }}>Nachtrag erfassen</h4>

        {/* Row 1: NT-Nr, Status */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="NT-Nr.">
            <input value={form.number ?? ""} onChange={e => setF("number", e.target.value)} placeholder="z. B. N01" />
          </Field>
          <Field label="Status">
            <select value={form.status ?? "offen"} onChange={e => setF("status", e.target.value as any)}>
              <option value="offen">offen</option>
              <option value="inBearbeitung">in Bearbeitung</option>
              <option value="freigegeben">freigegeben</option>
              <option value="abgelehnt">abgelehnt</option>
            </select>
          </Field>
        </div>

        {/* Row 2: Titel */}
        <Field label="Titel/Kurztext">
          <input value={form.title ?? ""} onChange={e => setF("title", e.target.value)} />
        </Field>

        {/* Row 3: LV-Pos */}
        <Field label="LV-Pos">
          <input value={form.lvPos ?? selectedLV?.pos ?? ""} onChange={e => setF("lvPos", e.target.value)} />
        </Field>

        {/* Row 4: Menge, Einheit, EP, Gesamt */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(130px,1fr))", gap: 12 }}>
          <Field label="Menge">
            <input type="number" step="0.01" value={form.qty ?? 0} onChange={e => setF("qty", Number(e.target.value))} />
          </Field>
          <Field label="Einheit">
            <input value={form.unit ?? ""} onChange={e => setF("unit", e.target.value)} />
          </Field>
          <Field label="EP (€)">
            <input type="number" step="0.01" value={form.ep ?? 0} onChange={e => setF("ep", Number(e.target.value))} />
          </Field>
          <Field label="Gesamt (€)">
            <input value={num((form.qty||0)*(form.ep||0))} disabled />
          </Field>
        </div>

        {/* Row 5: Notiz */}
        <Field label="Notiz">
          <textarea value={form.note ?? ""} onChange={e => setF("note", e.target.value)} style={{ height: 120, resize: "vertical" }} />
        </Field>

        {/* Attachments preview */}
        <Field label="Anhänge (Bilder & PDF)">
          <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
            {(form.attachments || []).map(a => (
              <div key={a.id} style={{ position:"relative", border:"1px solid var(--line)", borderRadius:10, overflow:"hidden", width:160, height:160, background:"#fafafa" }}>
                {isImg(a.type) ? (
                  <img src={a.url} onClick={()=>setPreviewUrl(a.url)} style={{ width:"100%", height:"100%", objectFit:"cover", cursor:"zoom-in" }}/>
                ) : isPdf(a.type) ? (
                  <a href={a.url} target="_blank" rel="noreferrer" style={{ display:"grid", placeItems:"center", width:"100%", height:"100%", textDecoration:"underline" }}>
                    {a.name}
                  </a>
                ) : (
                  <a href={a.url} target="_blank" rel="noreferrer" style={{ display:"grid", placeItems:"center", width:"100%", height:"100%" }}>FILE</a>
                )}
                <button onClick={()=>removeAttachment(a.id)} className="btn" style={{ position:"absolute", top:6, right:6, padding:"0 8px" }}>✕</button>
              </div>
            ))}
          </div>
        </Field>

        {/* Actions */}
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          <button className="btn" onClick={save}>{form.id ? "Änderungen speichern" : "Nachtrag anlegen"}</button>
          <button className="btn" onClick={clearForm}>Formular leeren</button>
          <button className="btn" onClick={loadNachtraege} disabled={!projectId || loading}>Neu laden</button>
          <button className="btn" disabled={!selectedLV} onClick={()=>alert(`Nachtrag wird mit LV-Position ${selectedLV?.pos || "-" } verknüpft`)}>
            🔗 Mit Aufmaß verknüpfen
          </button>
        </div>

        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:6 }}>
          <button className="btn" onClick={exportXlsx} disabled={!rows.length}>Export XLSX</button>
          <button className="btn" onClick={()=>exportPdf(false)} disabled={!rows.length}>Export PDF</button>
          <button className="btn" onClick={()=>exportPdf(true)} disabled={!rows.length}>PDF Vorschau</button>
        </div>

        {error && <div style={{ color:"crimson", marginTop:8 }}>{error}</div>}
      </div>

      {/* Right column – table */}
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>NT-Nr.</Th><Th>Titel</Th><Th>LV-Pos</Th>
              <Th>Menge</Th><Th>Einheit</Th><Th>EP (€)</Th><Th>Gesamt (€)</Th>
              <Th>Status</Th><Th>Notiz</Th><Th>Anhänge</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><Td colSpan={11} style={{ textAlign:"center" }}>{projectId ? "Keine Nachträge" : "Projekt-ID eingeben"}</Td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id ?? `nt-${i}`} style={{ background: selIdx === i ? "rgba(0,0,0,.04)" : undefined }}>
                <Td>{r.number}</Td>
                <Td style={{ maxWidth: 260, whiteSpace:"pre-wrap" }}>{r.title}</Td>
                <Td>{r.lvPos}</Td>
                <Td style={{ textAlign:"right" }}>{num(r.qty)}</Td>
                <Td>{r.unit}</Td>
                <Td style={{ textAlign:"right" }}>{num(r.ep)}</Td>
                <Td style={{ textAlign:"right", fontWeight:600 }}>{num(r.total)}</Td>
                <Td>{displayStatus(r.status)}</Td>
                <Td style={{ maxWidth: 320, whiteSpace:"pre-wrap" }}>{r.note}</Td>
                <Td>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", maxWidth:220 }}>
                    {(r.attachments||[]).slice(0,4).map(a => (
                      <a key={a.id} href={a.url}
                         onClick={(e)=>{ if(isImg(a.type)){ e.preventDefault(); setPreviewUrl(a.url); } }}
                         rel="noreferrer"
                         style={{ display:"block", width:60, height:60, border:"1px solid var(--line)", borderRadius:8, overflow:"hidden" }}>
                        {isImg(a.type) ? <img src={a.url} style={{ width:"100%", height:"100%", objectFit:"cover" }}/> :
                          <div style={{fontSize:10,display:"grid",placeItems:"center",height:"100%"}}>{isPdf(a.type)?"PDF":"FILE"}</div>}
                      </a>
                    ))}
                    {(r.attachments?.length||0) > 4 && <span style={{ fontSize:12, opacity:.7 }}>+{(r.attachments!.length-4)}</span>}
                  </div>
                </Td>
                <Td>
                  <div style={{ display:"flex", gap:6 }}>
                    <button className="btn" onClick={()=>selectRow(i)}>Bearbeiten</button>
                    <button className="btn" onClick={()=>removeRow(r, i)}>Löschen</button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lightbox */}
      {previewUrl && (
        <div onClick={()=>setPreviewUrl(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"grid", placeItems:"center", zIndex:9999 }}>
          <img src={previewUrl} style={{ maxWidth:"98vw", maxHeight:"98vh", borderRadius:12, boxShadow:"0 10px 30px rgba(0,0,0,.5)" }} />
        </div>
      )}
    </div>
  );
}

/* ===== UI helpers ===== */
function Field(props: React.PropsWithChildren<{ label: string }>) {
  return (
    <label style={{ display:"block" }}>
      <div style={{ fontSize:13, color:"var(--muted)", marginBottom:6 }}>{props.label}</div>
      <div>{props.children}</div>
    </label>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign:"left", padding:"8px 10px", borderBottom:"1px solid var(--line)", fontSize:13, whiteSpace:"nowrap" }}>{children}</th>;
}
function Td(props: React.HTMLAttributes<HTMLTableCellElement> & { children?: React.ReactNode }) {
  const { children, style, ...rest } = props;
  return <td {...rest} style={{ padding:"6px 10px", borderBottom:"1px solid var(--line)", verticalAlign:"top", fontSize:13, ...style }}>{children}</td>;
}
function displayStatus(s?: Nachtrag["status"]) {
  switch (s) {
    case "inBearbeitung": return "in Bearbeitung";
    case "freigegeben": return "freigegeben";
    case "abgelehnt": return "abgelehnt";
    default: return "offen";
  }
}

