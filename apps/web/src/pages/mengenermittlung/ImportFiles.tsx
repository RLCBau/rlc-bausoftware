// apps/web/src/pages/mengenermittlung/ImportFiles.tsx
import React from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min?url";

// ⚙️ API-Basis wie in ManuellFoto.tsx
const API_BASE =
  (import.meta as any)?.env?.VITE_API_URL || "http://localhost:4000/api";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// ==== Typen ====
type PreviewItem = {
  pos: string;
  type: string;
  descr: string;
  unit?: string;
  qty?: number;
  layer?: string;
  source?: string;
};

type DxfOverlays = {
  bbox: { min: { x: number; y: number }; max: { x: number; y: number } };
  lines?: { a: { x: number; y: number }; b: { x: number; y: number }; layer?: string }[];
  lwpolylines?: { pts: { x: number; y: number }[]; closed?: boolean; layer?: string }[];
  circles?: { c: { x: number; y: number }; r: number; layer?: string }[];
  arcs?: { c: { x: number; y: number }; r: number; start: number; end: number; layer?: string }[];
  layers?: { name: string; count: number }[];
  meta?: { insUnits?: number; scaleUnitsToM?: number; userScale?: number; scaleApplied?: number };
};

// ==== Hilfsfunktionen ====
const isPdf = (f?: File | null) => !!f && f.name.toLowerCase().endsWith(".pdf");
const isDxf = (f?: File | null) => !!f && f.name.toLowerCase().endsWith(".dxf");

// ==== PDF Preview (Seite 1 + Zoom) ====
function PdfPreview({ file, zoom }: { file: File; zoom: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const buf = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: buf });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const ctx = canvas.getContext("2d")!;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        console.error("PDF preview error:", err);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [file, zoom]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "auto", border: "1px solid var(--line)" }}
    />
  );
}

// ==== DXF Preview (Canvas) ====
function DxfPreview({
  overlays,
  visible,
  zoom,
}: {
  overlays: DxfOverlays;
  visible: boolean;
  zoom: number;
}) {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (!visible || !overlays || !ref.current) return;

    const { bbox, lines = [], lwpolylines = [], circles = [], arcs = [] } = overlays;
    const canvas = ref.current;
    const ctx = canvas.getContext("2d")!;
    const pad = 10;

    // Arbeitsfläche
    const W = 1000;
    const H = 700;
    canvas.width = W;
    canvas.height = H;

    // world → screen
    const width = Math.max(1e-6, bbox.max.x - bbox.min.x);
    const height = Math.max(1e-6, bbox.max.y - bbox.min.y);
    const sx = (W - 2 * pad) / width;
    const sy = (H - 2 * pad) / height;
    const s = Math.min(sx, sy) * zoom;

    const tx = -bbox.min.x;
    const ty = -bbox.min.y;
    const X = (x: number) => (x + tx) * s + pad;
    const Y = (y: number) => H - ((y + ty) * s + pad);

    // render
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;

    // Linien
    ctx.beginPath();
    lines.forEach((l) => {
      ctx.moveTo(X(l.a.x), Y(l.a.y));
      ctx.lineTo(X(l.b.x), Y(l.b.y));
    });
    ctx.stroke();

    // LWPOLYLINE
    lwpolylines.forEach((p) => {
      ctx.beginPath();
      p.pts.forEach((pt, i) => {
        const xx = X(pt.x),
          yy = Y(pt.y);
        i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      });
      if (p.closed) ctx.closePath();
      ctx.stroke();
    });

    // Kreise
    circles.forEach((c) => {
      ctx.beginPath();
      ctx.arc(X(c.c.x), Y(c.c.y), c.r * s, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Bögen (einfach, ohne Bulges)
    arcs.forEach((a) => {
      const sa = (a.start * Math.PI) / 180;
      const ea = (a.end * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(X(a.c.x), Y(a.c.y), a.r * s, -ea, -sa, true); // invertierte Y-Achse
      ctx.stroke();
    });
  }, [overlays, visible, zoom]);

  return (
    <canvas
      ref={ref}
      style={{ width: "100%", height: "auto", border: "1px solid var(--line)" }}
    />
  );
}

// ==== Hauptkomponente ====
export default function ImportFiles() {
  const [file, setFile] = React.useState<File | null>(null);
  const [note, setNote] = React.useState("");
  const [scale, setScale] = React.useState<number>(1);
  const [zoom, setZoom] = React.useState<number>(1);
  const [items, setItems] = React.useState<PreviewItem[]>([]);
  const [dxfOverlay, setDxfOverlay] = React.useState<DxfOverlays | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

 async function analyze() {
  try {
    setLoading(true);
    setError(null);
    setItems([]);
    setDxfOverlay(null);

    if (!file) return;

    const fd = new FormData();
    fd.append("file", file);
    fd.append("note", note);
    fd.append("scale", String(scale));

    const res = await fetch(`${API_BASE}/import/parse`, {
      method: "POST",
      body: fd,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    setItems((data.items || []) as PreviewItem[]);
    if (data.dxfoverlay) setDxfOverlay(data.dxfoverlay as DxfOverlays);
  } catch (e: any) {
    console.error(e);
    setError(e?.message ?? "Analyse fehlgeschlagen");
  } finally {
    setLoading(false);
  }
}


  // ====== Styles für Tabelle ======
  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    padding: "6px 10px",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
    verticalAlign: "middle",
  };

  return (
    <div className="card" style={{ padding: 18 }}>
      {/* Kopfzeile */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <input
          type="number"
          step="0.01"
          value={scale}
          onChange={(e) => setScale(Number(e.target.value) || 1)}
          style={{ width: 80 }}
          title="Skalierungsfaktor (für PDF/DXF)"
        />
        <input
          type="text"
          placeholder="Sprachnotiz / Text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn" onClick={analyze} disabled={!file || loading}>
          KI analysieren
        </button>
      </div>

      {/* Zoom nur für PDF / DXF-Canvas */}
      {(isPdf(file) || isDxf(file)) && (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span>Zoom</span>
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ width: 180 }}
          />
          <span>{Math.round(zoom * 100)}%</span>
        </div>
      )}

      {/* Inhalte */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 16,
          marginTop: 12,
        }}
      >
        {/* Vorschau links */}
        <div className="card" style={{ padding: 10, minHeight: 420 }}>
          {!file && <div style={{ color: "#666" }}>Keine Datei ausgewählt.</div>}

          {file && isPdf(file) && <PdfPreview file={file} zoom={zoom} />}

          {file && isDxf(file) && dxfOverlay && (
            <DxfPreview overlays={dxfOverlay} visible={true} zoom={zoom} />
          )}

          {file && isDxf(file) && !dxfOverlay && (
            <div style={{ color: "#666" }}>
              DXF geladen. Bitte „KI analysieren“ klicken, um die Layer/Geometrie zu
              extrahieren.
            </div>
          )}

          {error && (
            <div style={{ marginTop: 8, color: "#c00" }}>Fehler: {error}</div>
          )}
        </div>

        {/* Ergebnisse rechts */}
        <div className="card" style={{ padding: 10, overflow: "auto" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            Vorschau (Ergebnisse)
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Pos.</th>
                <th style={th}>Typ</th>
                <th style={th}>Beschreibung</th>
                <th style={th}>Einheit</th>
                <th style={th}>Menge</th>
                <th style={th}>Layer</th>
                <th style={th}>Quelle</th>
              </tr>
            </thead>
            <tbody>
              {(items || []).length === 0 ? (
                <tr>
                  <td style={{ ...tdStyle, textAlign: "center" }} colSpan={7}>
                    Noch keine Ergebnisse.
                  </td>
                </tr>
              ) : (
                items.map((r, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{r.pos}</td>
                    <td style={tdStyle}>{r.type}</td>
                    <td style={tdStyle}>{r.descr}</td>
                    <td style={tdStyle}>{r.unit || ""}</td>
                    <td style={tdStyle}>{r.qty ?? ""}</td>
                    <td style={tdStyle}>{r.layer || ""}</td>
                    <td style={tdStyle}>{r.source || ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {loading && <div style={{ marginTop: 8 }}>Analyse läuft…</div>}
    </div>
  );
}
