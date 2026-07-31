import React, { useEffect, useMemo, useRef, useState } from "react";
import { CadAPI, loadDoc, saveDoc } from "../../lib/cad/store";
import { CadDoc, Entity, LineEntity, PolylineEntity, Vec2 } from "../../lib/cad/types";

const shell = { height: "calc(100vh - 0px)", display: "grid", gridTemplateRows: "44px 1fr", fontFamily: "Inter, system-ui, Arial", color: "#0f172a" } as const;
const bar = { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid #e2e8f0" } as const;
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 13, cursor: "pointer" } as const;
const input = { border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px" } as const;
const canvasWrap = { background: "#ffffff", position: "relative" } as const;
const toolOn = (on: boolean) => ({ ...btn, background: on ? "#eef2ff" : "#fff", borderColor: on ? "#6366f1" : "#cbd5e1" });

type Tool = "select" | "line" | "polyline" | "pan" | "measure";

export default function Zeichner2D() {
  const [doc, setDoc] = useState<CadDoc>(loadDoc);
  const [tool, setTool] = useState<Tool>("select");
  const [grid, setGrid] = useState(1);       // 1 = 1m
  const [snap, setSnap] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);

  const cnvRef = useRef<HTMLCanvasElement | null>(null);
  const dragging = useRef(false);
  const last = useRef<Vec2>({ x: 0, y: 0 });
  const temp = useRef<Vec2[]>([]);

  // save on change (debounced)
  useEffect(() => {
    const t = setTimeout(() => saveDoc(doc), 150);
    return () => clearTimeout(t);
  }, [doc]);

  const activeLayer = useMemo(() => doc.layers.find(l => l.visible && !l.locked) ?? doc.layers[0], [doc]);

  function worldToScreen(p: Vec2): Vec2 {
    const { cx, cy, zoom } = doc.view;
    return { x: (p.x - cx) * zoom + width / 2, y: (p.y - cy) * zoom + height / 2 };
  }
  function screenToWorld(p: Vec2): Vec2 {
    const { cx, cy, zoom } = doc.view;
    return { x: (p.x - width / 2) / zoom + cx, y: (p.y - height / 2) / zoom + cy };
  }

  const width = window.innerWidth - 240; // sidebar width approx
  const height = window.innerHeight - 44;

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, tool, grid, snap, selId]);

  function draw() {
    const cnv = cnvRef.current!;
    const ctx = cnv.getContext("2d")!;
    ctx.clearRect(0, 0, cnv.width, cnv.height);

    // GRID
    ctx.save();
    const step = 50; // px
    ctx.strokeStyle = "#eef2f7";
    ctx.lineWidth = 1;
    for (let x = (width / 2) % step; x < width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = (height / 2) % step; y < height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    ctx.restore();

    // ENTITIES
    for (const e of doc.entities) {
      const lay = doc.layers.find(l => l.id === e.layerId);
      if (!lay?.visible) continue;
      ctx.strokeStyle = lay.color;
      ctx.fillStyle = lay.color;
      ctx.lineWidth = 2;

      if (e.type === "point") {
        const s = worldToScreen(e.p);
        ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === "line") {
        const a = worldToScreen(e.a), b = worldToScreen(e.b);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      } else {
        const pts = e.points.map(worldToScreen);
        ctx.beginPath();
        pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        if (e.closed && pts.length > 2) ctx.closePath();
        ctx.stroke();
      }

      if (selId === e.id) {
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = "#0ea5e9";
        if (e.type === "line") {
          const a = worldToScreen(e.a), b = worldToScreen(e.b);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        } else if (e.type === "polyline") {
          const pts = e.points.map(worldToScreen);
          ctx.beginPath(); pts.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
          if (e.closed && pts.length>2) ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // TEMP stroke (line/polyline)
    if ((tool === "line" || tool === "polyline") && temp.current.length > 0) {
      const pts = temp.current.map(worldToScreen);
      const ctx2 = ctx;
      ctx2.save();
      ctx2.strokeStyle = "#0ea5e9";
      ctx2.setLineDash([4, 4]);
      ctx2.beginPath();
      pts.forEach((p, i) => i ? ctx2.lineTo(p.x, p.y) : ctx2.moveTo(p.x, p.y));
      ctx2.stroke();
      ctx2.restore();
    }
  }

  function snapW(p: Vec2): Vec2 {
    if (!snap || grid <= 0) return p;
    const g = grid;
    return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
    }

  function onDown(e: React.MouseEvent) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const p = screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    if (tool === "pan") {
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (tool === "select") {
      const hit = CadAPI.hitTest(doc, p, 6 / doc.view.zoom);
      setSelId(hit?.id ?? null);
      return;
    }

    if (tool === "line") {
      if (temp.current.length === 0) {
        temp.current = [snapW(p)];
      } else {
        const a = temp.current[0];
        const b = snapW(p);
        if (distance(a, b) > 0) {
          const layerId = CadAPI.getActiveLayerId(doc);
          const le: LineEntity = { id: CadAPI.newid(), type: "line", layerId, a, b };
          setDoc(d => ({ ...d, entities: [...d.entities, le] }));
        }
        temp.current = [];
      }
      draw();
      return;
    }

    if (tool === "polyline") {
      if (e.detail === 2) {
        // doppio click -> chiudi/salva
        if (temp.current.length >= 2) {
          const layerId = CadAPI.getActiveLayerId(doc);
          const pe: PolylineEntity = { id: CadAPI.newid(), type: "polyline", layerId, points: [...temp.current, snapW(p)], closed: false };
          setDoc(d => ({ ...d, entities: [...d.entities, pe] }));
        }
        temp.current = [];
      } else {
        const last = temp.current[temp.current.length - 1];
        const np = snapW(p);
        if (!last || distance(last, np) > 0) temp.current.push(np);
      }
      draw();
      return;
    }

    if (tool === "measure") {
      // niente entità: solo temp polyline
      if (e.detail === 2) temp.current = [];
      else {
        const last = temp.current[temp.current.length - 1];
        const np = snapW(p);
        if (!last || distance(last, np) > 0) temp.current.push(np);
      }
      draw();
    }
  }

  function onMove(e: React.MouseEvent) {
    if (tool === "pan" && dragging.current) {
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      setDoc(d => ({ ...d, view: { ...d.view, cx: d.view.cx - dx / d.view.zoom, cy: d.view.cy - dy / d.view.zoom } }));
      return;
    }
  }

  function onUp() { dragging.current = false; }

  function onWheel(e: React.WheelEvent) {
    const s = Math.exp(-e.deltaY * 0.0015);
    setDoc(d => ({ ...d, view: { ...d.view, zoom: Math.min(10, Math.max(0.1, d.view.zoom * s)) } }));
  }

  function deleteSel() {
    if (!selId) return;
    setDoc(d => ({ ...d, entities: d.entities.filter(e => e.id !== selId) }));
    setSelId(null);
  }

  const measureInfo = useMemo(() => {
    if (tool !== "measure" || temp.current.length < 2) return "";
    let len = 0;
    for (let i = 0; i < temp.current.length - 1; i++) len += distance(temp.current[i], temp.current[i + 1]);
    if (temp.current.length >= 3) {
      const area = polygonArea(temp.current);
      return `Länge: ${fmt(len)} m · Fläche: ${fmt(area)} m²`;
    }
    return `Länge: ${fmt(len)} m`;
  }, [tool, doc.entities]); // eslint-disable-line

  return (
    <div style={shell}>
      {/* toolbar */}
      <div style={bar}>
        <button style={toolOn(tool === "select")} onClick={() => setTool("select")}>Auswahl</button>
        <button style={toolOn(tool === "line")} onClick={() => setTool("line")}>Linie</button>
        <button style={toolOn(tool === "polyline")} onClick={() => setTool("polyline")}>Polylinie</button>
        <button style={toolOn(tool === "measure")} onClick={() => { temp.current = []; setTool("measure"); }}>Messen</button>
        <button style={toolOn(tool === "pan")} onClick={() => setTool("pan")}>Pan</button>
        <span style={{ marginLeft: 12 }} />
        <label>Grid (m): <input style={{ ...input, width: 70, marginLeft: 6 }} type="number" step="0.1" value={grid} onChange={e => setGrid(Number(e.target.value) || 0)} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} />Snap</label>
        <span style={{ marginLeft: "auto" }} />
        <button style={{ ...btn, color: "#b91c1c" }} onClick={deleteSel} disabled={!selId}>Löschen</button>
        <span style={{ color: "#64748b", fontSize: 12, marginLeft: 12 }}>{measureInfo}</span>
      </div>

      {/* canvas */}
      <div style={canvasWrap}>
        <canvas
          ref={cnvRef}
          width={width}
          height={height}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onWheel={onWheel}
          style={{ display: "block", cursor: tool === "pan" ? "grab" : "crosshair" }}
        />
      </div>
    </div>
  );
}

function distance(a: Vec2, b: Vec2) { return Math.hypot(a.x - b.x, a.y - b.y); }
function polygonArea(pts: Vec2[]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(s) / 2;
}
function fmt(n: number) { return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(n || 0); }
