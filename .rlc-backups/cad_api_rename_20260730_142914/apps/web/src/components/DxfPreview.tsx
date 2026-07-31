import React from "react";

export type DxfOverlays = {
  bbox?: { min: { x: number; y: number }; max: { x: number; y: number } };
  lines?: { a: { x: number; y: number }; b: { x: number; y: number }; layer?: string }[];
  lwpolylines?: {
    pts: { x: number; y: number }[];
    closed?: boolean;
    layer?: string;
  }[];
  circles?: { c: { x: number; y: number }; r: number; layer?: string }[];
  arcs?: {
    c: { x: number; y: number };
    r: number;
    start: number;
    end: number;
    layer?: string;
  }[];
  layers?: { name: string; count: number }[];
  meta?: { insUnits?: number; scaleUnitsToM?: number; userScale?: number; scaleApplied?: number };
};

type Props = {
  overlays: DxfOverlays | null;
  visibleLayers: Set<string>;
  zoom: number; // 1 = 100%
  height?: number; // altezza canvas in px (default 560)
};

export default function DxfPreview({ overlays, visibleLayers, zoom, height = 560 }: Props) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    // pulisci
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    if (!overlays) return;

    // dimensioni canvas
    const W = cvs.clientWidth || 800;
    const H = height;
    cvs.width = W;
    cvs.height = H;

    // calcola bbox
    const min = overlays.bbox?.min ?? { x: 0, y: 0 };
    const max = overlays.bbox?.max ?? { x: 100, y: 100 };
    const bw = max.x - min.x || 1;
    const bh = max.y - min.y || 1;

    // fit to canvas + zoom
    const pad = 20;
    const sx = (W - pad * 2) / bw;
    const sy = (H - pad * 2) / bh;
    const s = Math.min(sx, sy) * (zoom || 1);
    const ox = pad - min.x * s;
    const oy = H - pad + min.y * s; // Y verso l’alto

    // piccolo helper per trasformare
    const X = (x: number) => ox + x * s;
    const Y = (y: number) => oy - y * s;

    // sfondo quadrettato (aiuta a capire che sta disegnando)
    drawGrid(ctx, W, H);

    // stile base
    ctx.lineWidth = Math.max(1, 1 * zoom);
    ctx.strokeStyle = "#1f2937";

    const isVis = (layer?: string) => {
      if (!layer || visibleLayers.size === 0) return true;
      return visibleLayers.has(layer);
    };

    // LINEE
    (overlays.lines ?? []).forEach((ln) => {
      if (!isVis(ln.layer)) return;
      ctx.beginPath();
      ctx.moveTo(X(ln.a.x), Y(ln.a.y));
      ctx.lineTo(X(ln.b.x), Y(ln.b.y));
      ctx.stroke();
    });

    // LWPOLYLINE
    (overlays.lwpolylines ?? []).forEach((pl) => {
      if (!isVis(pl.layer)) return;
      if (!pl.pts || pl.pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(X(pl.pts[0].x), Y(pl.pts[0].y));
      for (let i = 1; i < pl.pts.length; i++) {
        ctx.lineTo(X(pl.pts[i].x), Y(pl.pts[i].y));
      }
      if (pl.closed) ctx.closePath();
      ctx.stroke();
      if (pl.closed) {
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = "#3b82f6";
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });

    // CIRCLE
    (overlays.circles ?? []).forEach((c) => {
      if (!isVis(c.layer)) return;
      ctx.beginPath();
      ctx.arc(X(c.c.x), Y(c.c.y), c.r * s, 0, Math.PI * 2);
      ctx.stroke();
    });

    // ARC (radianti)
    (overlays.arcs ?? []).forEach((a) => {
      if (!isVis(a.layer)) return;
      ctx.beginPath();
      ctx.arc(X(a.c.x), Y(a.c.y), a.r * s, -a.end, -a.start, true);
      ctx.stroke();
    });
  }, [overlays, visibleLayers, zoom, height]);

  return (
    <canvas
      ref={ref}
      style={{
        width: "100%",
        height,
        display: "block",
        border: "1px solid var(--line)",
        background: "#fff",
      }}
    />
  );
}

function drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = 0; x <= W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}


