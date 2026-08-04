import { rlcClass } from "../../ui/rlcRuntimeStyle"; // apps/web/src/pages/ki/Fotoerkennung.tsx

import React from "react";
import { useProject } from "../../store/useProject";
import { saveProjectLvPosition } from "../../api/projectLvCompat";

type Box = {
  id: string;
  label: string;
  score: number; // 0..1
  qty: number;
  unit: string; // "m²", "m", ...
  box: [number, number, number, number];
};

type Position = {
  id: string;
  kurztext: string;
  einheit: string;
  typ: "sichtbar" | "implizit";
  status: "bestehend" | "nachtrag";
  match?: {
    id: string;
    kurztext: string;
    einheit?: string;
    score?: number;
  };
};

type AnalyzeOut = {
  positions?: Position[];
  boxes?: Box[];
  summary?: string;
};

type ProjectLike = {
  id?: string;
  code?: string;
};

const card: React.CSSProperties = {
  display: "grid",
  gap: 10,
  border: "1px solid var(--line)",
  borderRadius: 10,
  padding: 16,
  background: "#fff"
};

const inp: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14
};

const tbl: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 8,
  background: "#fff"
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: 6,
  borderBottom: "1px solid #e5e7eb"
};

const thC: React.CSSProperties = {
  ...th,
  textAlign: "center"
};

const td: React.CSSProperties = {
  padding: 6,
  borderBottom: "1px solid #f0f0f0"
};

const tdC: React.CSSProperties = {
  ...td,
  textAlign: "center"
};

export default function Fotoerkennung() {
  const projectCtx = useProject() as unknown as {
    currentProject?: ProjectLike | null;
  };

  const currentProject = projectCtx?.currentProject ?? null;
  const storeProjectId = currentProject?.id ?? "";
  const projectCode = currentProject?.code ?? "";

  const [file, setFile] = React.useState<File | null>(null);
  const [note, setNote] = React.useState("");
  const [result, setResult] = React.useState<AnalyzeOut | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [projectInput, setProjectInput] = React.useState("");

  const effectiveProjectId = projectInput.trim() || storeProjectId || projectCode || "";

  React.useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  async function handleAnalyze() {
    if (!file) {
      window.alert("Bitte ein Foto auswählen.");
      return;
    }

    if (!effectiveProjectId) {
      window.alert("Bitte ein Projekt auswählen oder Projekt-ID eingeben.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("note", note);
      form.append("projectId", storeProjectId || effectiveProjectId);
      form.append("projectCode", projectCode || "");

      const res = await fetch("/api/ki/photo-analyze", {
        method: "POST",
        body: form
      });

      if (!res.ok) {
        throw new Error((await res.text()) || "Analyse fehlgeschlagen");
      }

      const data = (await res.json()) as AnalyzeOut;

      setResult({
        positions: Array.isArray(data?.positions) ? data.positions : [],
        boxes: Array.isArray(data?.boxes) ? data.boxes : [],
        summary: typeof data?.summary === "string" ? data.summary : ""
      });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Analyse fehlgeschlagen";
      setError(msg);
      window.alert("Fehler bei Analyse.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddToLV(p: Position) {
    if (!effectiveProjectId) {
      window.alert("Kein Projekt gewählt.");
      return;
    }

    try {
      const payload = {
        projectId: storeProjectId || effectiveProjectId,
        projectCode: projectCode || undefined,
        posNr: p.match?.id || undefined,
        kurztext: p.match?.kurztext || p.kurztext,
        einheit: p.match?.einheit || p.einheit,
        quelle: "Fotoerkennung"
      };

      await saveProjectLvPosition(storeProjectId || effectiveProjectId, payload);

      window.alert(`'${payload.kurztext}' ins LV eingefügt ✅`);
    } catch (e) {
      console.error(e);
      window.alert("Fehler beim Einfügen ins LV");
    }
  }

  function handleNachtrag(p: Position) {
    const url =
    `/kalkulation/nachtraege?fromFoto=1` +
    `&projectId=${encodeURIComponent(storeProjectId || effectiveProjectId)}` +
    `&projectCode=${encodeURIComponent(projectCode || "")}` +
    `&kurztext=${encodeURIComponent(p.kurztext)}` +
    `&einheit=${encodeURIComponent(p.einheit)}`;

    window.location.href = url;
  }

  return (
    <div className="rlc-migrated-pages-ki-fotoerkennung-tsx-986">
      <h1>Fotoerkennung (Leistung/Material/Mengen)</h1>

      <div className={rlcClass(null, card)}>
        <div className="rlc-migrated-pages-ki-fotoerkennung-tsx-987">
          <div className="rlc-migrated-pages-ki-fotoerkennung-tsx-988">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setResult(null);
                setError(null);
              }} />
            

            <textarea
              placeholder="Notiz oder Beschreibung…"
              value={note}
              onChange={(e) => setNote(e.target.value)} className={rlcClass(null,
              { ...inp, minHeight: 80 })} />
            

            <div className="rlc-migrated-pages-ki-fotoerkennung-tsx-989">
              <label className="rlc-migrated-pages-ki-fotoerkennung-tsx-990">Projekt</label>
              <input className={rlcClass(null,
              { ...inp, flex: 1 })}
              placeholder="z. B. BA-2025-834"
              value={projectInput}
              onChange={(e) => setProjectInput(e.target.value)} />
              
            </div>

            <div className="rlc-migrated-pages-ki-fotoerkennung-tsx-991">
              Aktiv: {effectiveProjectId || "kein Projekt gewählt"}
            </div>
          </div>

          <div className="rlc-migrated-pages-ki-fotoerkennung-tsx-992">
            <button className="btn" onClick={handleAnalyze} disabled={loading || !file}>
              {loading ? "Analysiere…" : "Foto analysieren"}
            </button>

            {result &&
            <button className="btn" onClick={() => setResult(null)}>
                Ergebnis zurücksetzen
              </button>
            }
          </div>
        </div>

        {error && <div className="rlc-migrated-pages-ki-fotoerkennung-tsx-993">{error}</div>}
      </div>

      {previewUrl &&
      <div className={rlcClass(null, card)}>
          <h3 className="rlc-migrated-pages-ki-fotoerkennung-tsx-994">Vorschau</h3>
          <ImageWithBoxes src={previewUrl} boxes={result?.boxes || []} />
        </div>
      }

      {result?.positions &&
      <div className={rlcClass(null, card)}>
          <h3 className="rlc-migrated-pages-ki-fotoerkennung-tsx-995">Erkannte LV-Positionen</h3>
          <p className="rlc-migrated-pages-ki-fotoerkennung-tsx-996">{result.summary || "—"}</p>

          <table className={rlcClass(null, tbl)}>
            <thead>
              <tr className="rlc-migrated-pages-ki-fotoerkennung-tsx-997">
                <th className={rlcClass(null, th)}>Kurztext</th>
                <th className={rlcClass(null, thC)}>Einheit</th>
                <th className={rlcClass(null, thC)}>Typ</th>
                <th className={rlcClass(null, thC)}>Status</th>
                <th className={rlcClass(null, th)}>Match (falls vorhanden)</th>
                <th className={rlcClass(null, thC)}>Aktion</th>
              </tr>
            </thead>

            <tbody>
              {result.positions.map((p) =>
            <tr key={p.id}>
                  <td className={rlcClass(null, td)}>{p.kurztext}</td>

                  <td className={rlcClass(null, tdC)}>{p.einheit || "—"}</td>

                  <td className={rlcClass(null,
              {
                ...tdC,
                color: p.typ === "implizit" ? "#92400e" : "#065f46"
              })}>
                
                    {p.typ}
                  </td>

                  <td className={rlcClass(null,
              {
                ...tdC,
                fontWeight: 600,
                color: p.status === "bestehend" ? "#065f46" : "#9a3412"
              })}>
                
                    {p.status}
                  </td>

                  <td className={rlcClass(null, td)}>
                    {p.match ?
                <>
                        <div className="rlc-migrated-pages-ki-fotoerkennung-tsx-998">{p.match.kurztext}</div>
                        <div className="rlc-migrated-pages-ki-fotoerkennung-tsx-999">
                          {p.match.einheit || "—"} · Score:{" "}
                          {Math.round((p.match.score || 0) * 100)}%
                        </div>
                      </> :

                <span className="rlc-migrated-pages-ki-fotoerkennung-tsx-1000">—</span>
                }
                  </td>

                  <td className={rlcClass(null, { ...tdC, whiteSpace: "nowrap" })}>
                    {p.status === "bestehend" ?
                <button
                  className="btn rlc-migrated-pages-ki-fotoerkennung-tsx-1001"

                  onClick={() => handleAddToLV(p)}>
                  
                        In LV einfügen
                      </button> :

                <button
                  className="btn rlc-migrated-pages-ki-fotoerkennung-tsx-1002"

                  onClick={() => handleNachtrag(p)}>
                  
                        Nachtrag erstellen →
                      </button>
                }
                  </td>
                </tr>
            )}

              {result.positions.length === 0 &&
            <tr>
                  <td className={rlcClass(null, { ...td, opacity: 0.6 })} colSpan={6}>
                    Keine Positionen erkannt.
                  </td>
                </tr>
            }
            </tbody>
          </table>
        </div>
      }
    </div>);

}

/* ================== Image + Overlay ================== */

function ImageWithBoxes({ src, boxes }: {src: string;boxes: Box[];}) {
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const img = imgRef.current;
    const cv = canvasRef.current;
    if (!img || !cv) return;

    function draw() {
      if (!img || !cv) return;

      const rect = img.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      cv.width = Math.round(rect.width);
      cv.height = Math.round(rect.height);

      const ctx = cv.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.lineWidth = 2;
      ctx.font = "12px system-ui, sans-serif";

      boxes.forEach((b, i) => {
        const [x, y, w, h] = b.box || [0, 0, 0, 0];

        const normalized =
        x <= 1 && y <= 1 && w <= 1 && h <= 1 && x >= 0 && y >= 0 && w >= 0 && h >= 0;

        const X = normalized ? x * cv.width : x;
        const Y = normalized ? y * cv.height : y;
        const W = normalized ? w * cv.width : w;
        const H = normalized ? h * cv.height : h;

        const color = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"][i % 5];
        ctx.strokeStyle = color;
        ctx.fillStyle = color;

        ctx.strokeRect(X, Y, W, H);

        const label = `${b.label} • ${Math.round((b.score || 0) * 100)}% • ${b.qty} ${b.unit}`;
        const pad = 4;
        const textW = ctx.measureText(label).width + pad * 2;
        const textH = 16;
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
    <div className="rlc-migrated-pages-ki-fotoerkennung-tsx-1003">
      <img
        ref={imgRef}
        src={src}
        alt="preview" className="rlc-migrated-pages-ki-fotoerkennung-tsx-1004" />






      
      <canvas
        ref={canvasRef} className="rlc-migrated-pages-ki-fotoerkennung-tsx-1005" />





      
    </div>);

}
