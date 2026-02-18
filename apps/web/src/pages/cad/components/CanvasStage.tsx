import React, { useEffect, useRef } from "react";
import * as fabric from "fabric";
import useCadStore from "./store";

export default function CanvasStage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const setCanvas = useCadStore((s) => s.setCanvas);
  const resizeCanvas = useCadStore((s) => s.resizeCanvas);
  const refreshGrid = useCadStore((s) => s.refreshGrid);

  useEffect(() => {
    if (!canvasRef.current) return;

    // evita doppia init (React StrictMode)
    const prev = (canvasRef.current as any).__fabric as fabric.Canvas | undefined;
    if (prev) prev.dispose();

    const c = new fabric.Canvas(canvasRef.current, {
      selection: true,
      preserveObjectStacking: true,
    });
    (canvasRef.current as any).__fabric = c;

    const doResize = () => {
      const w = Math.max(300, wrapRef.current?.clientWidth || 800);
      const h = Math.max(300, wrapRef.current?.clientHeight || 600);
      resizeCanvas(w, h);
    };

    setCanvas(c);
    doResize();
    refreshGrid();

    // Zoom rotellina
    c.on("mouse:wheel", (opt) => {
      const evt = opt.e as WheelEvent;
      let zoom = c.getZoom();
      zoom *= 0.999 ** evt.deltaY;
      zoom = Math.min(5, Math.max(0.2, zoom));
      const p = c.getPointer(evt);
      c.zoomToPoint({ x: p.x, y: p.y }, zoom);
      evt.preventDefault();
      evt.stopPropagation();
    });

    // Pan con tasto destro
    let panning = false;
    c.on("mouse:down", (opt) => {
      const evt = opt.e as MouseEvent;
      if (evt.button === 2) { panning = true; c.setCursor("grab"); }
    });
    c.on("mouse:move", (opt) => {
      if (!panning || !opt.e) return;
      const e = opt.e as MouseEvent;
      const v = c.viewportTransform!;
      v[4] += e.movementX;
      v[5] += e.movementY;
      c.requestRenderAll();
    });
    c.on("mouse:up", (opt) => {
      const evt = opt.e as MouseEvent;
      if (evt.button === 2) { panning = false; c.setCursor("default"); }
    });

    (c.upperCanvasEl as HTMLCanvasElement).oncontextmenu = (e) => e.preventDefault();

    const ro = new ResizeObserver(doResize);
    if (wrapRef.current) ro.observe(wrapRef.current);

    return () => {
      ro.disconnect();
      c.dispose();
      setCanvas(null);
      if (canvasRef.current) (canvasRef.current as any).__fabric = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        height: "calc(100vh - 180px)",
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
