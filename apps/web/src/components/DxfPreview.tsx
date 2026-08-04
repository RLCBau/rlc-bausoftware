import { rlcClass } from "../ui/rlcRuntimeStyle";import React from "react";

export type DxfOverlays = {
  bbox?: {min: {x: number;y: number;};max: {x: number;y: number;};};
  lines?: {a: {x: number;y: number;};b: {x: number;y: number;};layer?: string;}[];
  lwpolylines?: {
    pts: {x: number;y: number;}[];
    closed?: boolean;
    layer?: string;
  }[];
  circles?: {c: {x: number;y: number;};r: number;layer?: string;}[];
  arcs?: {
    c: {x: number;y: number;};
    r: number;
    start: number;
    end: number;
    layer?: string;
  }[];
  layers?: {name: string;count: number;}[];
  meta?: {
    insUnits?: number;
    scaleUnitsToM?: number;
    userScale?: number;
    scaleApplied?: number;
  };
};

type Props = {
  overlays: DxfOverlays | null;
  visibleLayers: Set<string>;
  zoom: number; // 1 = 100%
  height?: number;
};

export default function DxfPreview({
  overlays,
  visibleLayers,
  zoom,
  height = 560
}: Props) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;

    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    const cssWidth = cvs.clientWidth || 800;
    const cssHeight = height;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    cvs.width = Math.floor(cssWidth * dpr);
    cvs.height = Math.floor(cssHeight * dpr);
    cvs.style.width = `${cssWidth}px`;
    cvs.style.height = `${cssHeight}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    drawGrid(ctx, cssWidth, cssHeight);

    if (!overlays) return;

    const min = overlays.bbox?.min ?? { x: 0, y: 0 };
    const max = overlays.bbox?.max ?? { x: 100, y: 100 };

    const bw = Math.max(1, max.x - min.x);
    const bh = Math.max(1, max.y - min.y);

    const pad = 20;
    const sx = (cssWidth - pad * 2) / bw;
    const sy = (cssHeight - pad * 2) / bh;
    const scale = Math.min(sx, sy) * Math.max(zoom || 1, 0.01);

    const ox = pad - min.x * scale;
    const oy = cssHeight - pad + min.y * scale; // Y nach oben

    const X = (x: number) => ox + x * scale;
    const Y = (y: number) => oy - y * scale;

    const isVis = (layer?: string) => {
      if (!layer || visibleLayers.size === 0) return true;
      return visibleLayers.has(layer);
    };

    ctx.strokeStyle = "#1f2937";
    ctx.fillStyle = "#3b82f6";
    ctx.lineWidth = 1;

    (overlays.lines ?? []).forEach((ln) => {
      if (!isVis(ln.layer)) return;
      ctx.beginPath();
      ctx.moveTo(X(ln.a.x), Y(ln.a.y));
      ctx.lineTo(X(ln.b.x), Y(ln.b.y));
      ctx.stroke();
    });

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
        ctx.save();
        ctx.globalAlpha = 0.06;
        ctx.fill();
        ctx.restore();
      }
    });

    (overlays.circles ?? []).forEach((c) => {
      if (!isVis(c.layer)) return;
      ctx.beginPath();
      ctx.arc(X(c.c.x), Y(c.c.y), c.r * scale, 0, Math.PI * 2);
      ctx.stroke();
    });

    (overlays.arcs ?? []).forEach((a) => {
      if (!isVis(a.layer)) return;
      ctx.beginPath();
      ctx.arc(X(a.c.x), Y(a.c.y), a.r * scale, -a.end, -a.start, true);
      ctx.stroke();
    });
  }, [overlays, visibleLayers, zoom, height]);

  return (
    <canvas
      ref={ref} className={rlcClass(null,
      {
        width: "100%",
        height,
        display: "block",
        border: "1px solid var(--line)",
        background: "#fff"
      })} />);


}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;

  const step = 40;

  for (let x = 0; x <= width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }

  ctx.restore();
}
