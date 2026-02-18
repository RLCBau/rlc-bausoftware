import React from "react";

type Box = {
  id: string;
  label: string;
  score: number; // 0..1
  qty: number;
  unit: string;  // "m²", "m", ...
  box: [number, number, number, number];
};

type Position = {
  id: string;
  kurztext: string;
  einheit: string;
  typ: "sichtbar" | "implizit";
  status: "bestehend" | "nachtrag";
  match?: { id: string; kurztext: string; einheit?: string; score?: number };
};

type AnalyzeOut = {
  positions?: Position[];
  boxes?: Box[];
  summary?: string;
};

const card: React.CSSProperties = { display:"grid", gap:10, border:"1px solid var(--line)", borderRadius:10, padding:16, background:"#fff" };
const inp:  React.CSSProperties = { border:"1px solid var(--line)", borderRadius:8, padding:"8px 10px", fontSize:14 };
const tbl:  React.CSSProperties = { width:"100%", borderCollapse:"collapse", marginTop:8, background:"#fff" };
const th:   React.CSSProperties = { textAlign:"left", padding:6, borderBottom:"1px solid #e5e7eb" };
const thR:  React.CSSProperties = { ...th, textAlign:"right" as const };
const thC:  React.CSSProperties = { ...th, textAlign:"center" as const };
const td:   React.CSSProperties = { padding:6, borderBottom:"1px solid #f0f0f0" };
const tdR:  React.CSSProperties = { ...td, textAlign:"right" as const };
const tdC:  React.CSSProperties = { ...td, textAlign:"center" as const };

export default function Fotoerkennung() {
  const [file, setFile] = React.useState<File | null>(null);
  const [note, setNote] = React.useState("");
  const [result, setResult] = React.useState<AnalyzeOut | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // ProjectId da querystring o sessionStorage
  const [projectId, setProjectId] = React.useState<string>(() => {
    const q = new URLSearchParams(window.location.search).get("projectId") || "";
    const s = sessionStorage.getItem("projectId") || "";
    return q || s || "";
  });

  React.useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handleAnalyze() {
    if (!file) { alert("Bitte ein Foto auswählen."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("note", note);
      if (projectId) form.append("projectId", projectId);

      const res = await fetch("/api/ki/photo-analyze", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as AnalyzeOut;
      setResult(data);
    } catch (e: any) {
      console.error(e);
      setError("Analyse fehlgeschlagen");
      alert("Fehler bei Analyse.");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (projectId) sessionStorage.setItem("projectId", projectId);
  }, [projectId]);

  // --- AZIONI RIGHE ---
async function handleAddToLV(p: Position) {
  if (!projectId) return alert("Kein Projekt gewählt.");
  try {
    const res = await fetch("/api/lv/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        kurztext: p.kurztext,
        einheit: p.einheit,
        quelle: "Fotoerkennung",
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    alert(`'${p.kurztext}' ins LV eingefügt ✅`);
  } catch (e) {
    console.error(e);
    alert("Fehler beim Einfügen ins LV");
  }
}

function handleNachtrag(p: Position) {
  const url =
    `/kalkulation/nachtraege?fromFoto=1` +
    `&projectId=${encodeURIComponent(projectId)}` +
    `&kurztext=${encodeURIComponent(p.kurztext)}` +
    `&einheit=${encodeURIComponent(p.einheit)}`;
  window.location.href = url;               // ✅ ora va alla pagina corretta
}


  return (
    <div style={{ display:"grid", gap:16, padding:16 }}>
      <h1>Fotoerkennung (Leistung/Material/Mengen)</h1>

      {/* Parametri + upload */}
      <div style={card}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 220px", gap:12 }}>
          <div style={{ display:"grid", gap:10 }}>
            <input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0] || null)} />
            <textarea placeholder="Notiz oder Beschreibung…" value={note} onChange={e=>setNote(e.target.value)} style={{ ...inp, minHeight:80 }} />
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <label style={{ fontSize:12, opacity:.8, width:90 }}>Project ID</label>
              <input style={{ ...inp, flex:1 }} placeholder="z.B. 12345" value={projectId} onChange={e=>setProjectId(e.target.value)} />
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <button className="btn" onClick={handleAnalyze} disabled={loading || !file}>
              {loading ? "Analysiere…" : "Foto analysieren"}
            </button>
            {result && <button className="btn" onClick={()=>setResult(null)}>Ergebnis zurücksetzen</button>}
          </div>
        </div>
        {error && <div style={{ color:"#b91c1c", fontSize:13 }}>{error}</div>}
      </div>

      {/* Preview + overlay (se in futuro vuoi boxes) */}
      {previewUrl && (
        <div style={card}>
          <h3 style={{ margin:0 }}>Vorschau</h3>
          <ImageWithBoxes src={previewUrl} boxes={(result?.boxes || []) as Box[]} />
        </div>
      )}

      {/* Tabella posizioni LV riconosciute + BOTTONI */}
      {result?.positions && (
        <div style={card}>
          <h3 style={{ margin:0 }}>Erkannte LV-Positionen</h3>
          <p style={{ margin:"4px 0 8px" }}>{result.summary || "—"}</p>

          <table style={tbl}>
            <thead>
              <tr style={{ background:"#f7f7f7" }}>
                <th style={th}>Kurztext</th>
                <th style={thC}>Einheit</th>
                <th style={thC}>Typ</th>
                <th style={thC}>Status</th>
                <th style={th}>Match (falls vorhanden)</th>
                <th style={thC}>Aktion</th>{/* 🔹 nuova colonna */}
              </tr>
            </thead>
            <tbody>
              {result.positions.map((p) => (
                <tr key={p.id}>
                  <td style={td}>{p.kurztext}</td>
                  <td style={tdC}>{p.einheit || "—"}</td>
                  <td style={{ ...tdC, color: p.typ === "implizit" ? "#92400e" : "#065f46" }}>{p.typ}</td>
                  <td style={{ ...tdC, fontWeight:700, color: p.status === "bestehend" ? "#065f46" : "#9a3412" }}>{p.status}</td>
                  <td style={td}>
                    {p.match
                      ? <>
                          <div style={{ fontWeight:600 }}>{p.match.kurztext}</div>
                          <div style={{ opacity:.7, fontSize:12 }}>
                            {p.match.einheit || "—"} · Score: {Math.round((p.match.score || 0)*100)}%
                          </div>
                        </>
                      : <span style={{ opacity:.6 }}>—</span>}
                  </td>
                  <td style={{ ...tdC, whiteSpace:"nowrap" }}>
                    {p.status === "bestehend" ? (
                      <button className="btn" style={{ fontSize:12, padding:"4px 8px" }} onClick={() => handleAddToLV(p)}>
                        In LV einfügen
                      </button>
                    ) : (
                      <button className="btn" style={{ fontSize:12, padding:"4px 8px" }} onClick={() => handleNachtrag(p)}>
                        Nachtrag erstellen →
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {result.positions.length === 0 && (
                <tr><td style={{...td, opacity:.6}} colSpan={6}>Keine Positionen erkannt.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ================== Image + Overlay (facoltativo) ================== */
function ImageWithBoxes({ src, boxes }: { src: string; boxes: Box[] }) {
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const img = imgRef.current, cv = canvasRef.current;
    if (!img || !cv) return;

    function draw() {
      const rect = img.getBoundingClientRect();
      cv.width = Math.round(rect.width);
      cv.height = Math.round(rect.height);

      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.lineWidth = 2;
      ctx.font = "12px system-ui, sans-serif";

      boxes.forEach((b, i) => {
        const [x, y, w, h] = b.box;
        const X = x * cv.width, Y = y * cv.height, W = w * cv.width, H = h * cv.height;

        const color = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"][i % 5];
        ctx.strokeStyle = color;
        ctx.fillStyle = color;

        ctx.strokeRect(X, Y, W, H);

        const label = `${b.label} • ${Math.round(b.score*100)}% • ${b.qty} ${b.unit}`;
        const pad = 4; const textW = ctx.measureText(label).width + pad*2; const textH = 16;
        const labelY = Math.max(0, Y - textH);
        ctx.fillRect(X, labelY, textW, textH);

        ctx.fillStyle = "#fff";
        ctx.fillText(label, X + pad, labelY + 12);
      });
    }

    const obs = new ResizeObserver(draw);
    obs.observe(img);
    img.addEventListener("load", draw);
    window.addEventListener("resize", draw);
    draw();

    return () => {
      obs.disconnect();
      img.removeEventListener("load", draw);
      window.removeEventListener("resize", draw);
    };
  }, [boxes, src]);

  return (
    <div style={{ position:"relative", width:"100%", maxWidth:960 }}>
      <img ref={imgRef} src={src} alt="preview" style={{ width:"100%", height:"auto", display:"block", borderRadius:8 }} />
      <canvas ref={canvasRef} style={{ position:"absolute", inset:0, pointerEvents:"none" }} />
    </div>
  );
}
