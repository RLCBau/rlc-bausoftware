import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useRef, useState, useCallback } from "react";
const THEME = {
    bg: "#1b1b1c",
    gridMajor: "#2a2b2c",
    gridMinor: "#222324",
    axisX: "#ff4e4e",
    axisY: "#51d36a",
    crosshair: "#ffffff",
    draft: "#2ea1ff",
    text: "#e6e6e6",
    panelBg: "#232426",
    panelBorder: "#2e3033",
    controlBg: "#2b2d30",
    controlBorder: "#3a3d41",
};
/** ================== Utils ================== */
const uid = () => Math.random().toString(36).slice(2, 10);
const add2 = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub2 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mul2 = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot2 = (a, b) => a.x * b.x + a.y * b.y;
const len2 = (a) => Math.hypot(a.x, a.y);
const unit2 = (a) => { const n = len2(a) || 1; return { x: a.x / n, y: a.y / n }; };
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const add3 = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub3 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul3 = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const proj = (p, cam) => {
    // rotazione ay intorno Y, poi ax intorno X
    const cosy = Math.cos(cam.ay), siny = Math.sin(cam.ay);
    const x1 = p.x * cosy + p.z * siny;
    const z1 = -p.x * siny + p.z * cosy;
    const cosx = Math.cos(cam.ax), sinx = Math.sin(cam.ax);
    const y2 = p.y * cosx - z1 * sinx;
    // ortho: ignora profondità (solo per sorting opzionale)
    return { x: x1, y: y2 };
};
/** World<->Screen (2D plane) */
const worldToScreen = (p, o, s) => ({ x: (p.x - o.x) * s, y: (p.y - o.y) * s });
const screenToWorld = (p, o, s) => ({ x: p.x / s + o.x, y: p.y / s + o.y });
const snapGrid = (p, g) => ({ x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g });
/** Segmenti 2D da entità 2D (per snap/trim) */
function segs2D(e) {
    if (e.type === "line")
        return [{ p: e.a, q: e.b }];
    if (e.type === "rect") {
        const A = e.a, B = e.b, P = [A, { x: B.x, y: A.y }, B, { x: A.x, y: B.y }];
        return [{ p: P[0], q: P[1] }, { p: P[1], q: P[2] }, { p: P[2], q: P[3] }, { p: P[3], q: P[0] }];
    }
    if (e.type === "polyline") {
        const out = [];
        for (let i = 1; i < e.pts.length; i++)
            out.push({ p: e.pts[i - 1], q: e.pts[i] });
        if (e.closed && e.pts.length > 2)
            out.push({ p: e.pts[e.pts.length - 1], q: e.pts[0] });
        return out;
    }
    return [];
}
function segIntersect(a, b, c, d) {
    const r = sub2(b, a), s = sub2(d, c);
    const rxs = r.x * s.y - r.y * s.x, qpxr = (c.x - a.x) * r.y - (c.y - a.y) * r.x;
    if (Math.abs(rxs) < 1e-9 && Math.abs(qpxr) < 1e-9)
        return null;
    if (Math.abs(rxs) < 1e-9)
        return null;
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / rxs;
    const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / rxs;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1)
        return { p: add2(a, mul2(r, t)), t };
    return null;
}
/** OSNAP: end/mid/intersection/perp/tangent + grid fallback */
function osnapPoint(ents, w, tol) {
    let best = null;
    const push = (pt) => { const d = dist2(pt, w); if (d <= tol && (!best || d < best.d))
        best = { p: pt, d }; };
    for (const e of ents) {
        if (e.type === "line") {
            push(e.a);
            push(e.b);
            push({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 });
        }
        if (e.type === "rect" || e.type === "polyline")
            segs2D(e).forEach(s => { push(s.p); push(s.q); push({ x: (s.p.x + s.q.x) / 2, y: (s.p.y + s.q.y) / 2 }); });
        if (e.type === "circle") {
            push(e.c);
        }
        if (e.type === "text") {
            push(e.p);
        }
    }
    // INTERSECTION
    for (let i = 0; i < ents.length; i++)
        for (let j = i + 1; j < ents.length; j++)
            for (const s1 of segs2D(ents[i]))
                for (const s2 of segs2D(ents[j])) {
                    const I = segIntersect(s1.p, s1.q, s2.p, s2.q);
                    if (I)
                        push(I.p);
                }
    // PERPENDICULAR
    for (const e of ents)
        for (const s of segs2D(e)) {
            const v = sub2(s.q, s.p), u = sub2(w, s.p);
            const t = dot2(u, v) / (dot2(v, v) || 1);
            if (t >= 0 && t <= 1)
                push(add2(s.p, mul2(v, t)));
        }
    // TANGENT (appross.: punti su circonferenza vicini alla direzione mouse)
    for (const e of ents)
        if (e.type === "circle") {
            const dir = unit2(sub2(w, e.c));
            const tan = { x: -dir.y, y: dir.x };
            push(add2(e.c, mul2(tan, e.r)));
            push(add2(e.c, mul2({ x: -tan.x, y: -tan.y }, e.r)));
        }
    return best?.p ?? null;
}
/** ================== Component ================== */
export default function Editor2D() {
    const canvasRef = useRef(null);
    const wrapRef = useRef(null);
    const [ents, setEnts] = useState([]);
    const [blocks, setBlocks] = useState([]);
    const [tool, setTool] = useState("select");
    const [origin, setOrigin] = useState({ x: -200, y: -120 });
    const [scale, setScale] = useState(1);
    const [mouse, setMouse] = useState({ x: 0, y: 0 });
    const [draft, setDraft] = useState(null);
    const [selection, setSel] = useState(new Set());
    const [panning, setPan] = useState(false);
    const [orbiting, setOrbit] = useState(false);
    const [cam, setCam] = useState({ ax: -0.6, ay: 0.8, scale: 1 });
    const [layers, setLayers] = useState([
        { name: "0", color: "#d6d6d6", lw: 1, visible: true, locked: false },
        { name: "Leitungen", color: "#2ea1ff", lw: 1, visible: true, locked: false },
        { name: "Schichten", color: "#5bd688", lw: 1, visible: true, locked: false },
    ]);
    const [activeLayer, setActiveLayer] = useState("0");
    const [ortho, setOrtho] = useState(false);
    const [osnap, setOsnap] = useState(true);
    const [gridOn, setGridOn] = useState(true);
    const [grid, setGrid] = useState(10);
    const [offsetDist, setOffsetDist] = useState(10);
    const undo = useRef([]), redo = useRef([]);
    const push = (c) => { undo.current.push(c); redo.current = []; };
    const apply = (c, dir) => setEnts(prev => {
        const arr = [...prev];
        if (c.kind === "add")
            return dir === 1 ? [...arr, c.ent] : arr.filter(e => e.id !== c.ent.id);
        if (c.kind === "remove")
            return dir === 1 ? arr.filter(e => e.id !== c.id) : [...arr, c.before];
        const i = arr.findIndex(e => e.id === c.id);
        if (i >= 0)
            arr[i] = dir === 1 ? c.after : c.before;
        return arr;
    });
    const doUndo = () => { const c = undo.current.pop(); if (!c)
        return; redo.current.push(c); apply(c, -1); };
    const doRedo = () => { const c = redo.current.pop(); if (!c)
        return; undo.current.push(c); apply(c, +1); };
    /** ===== Resize & Render ===== */
    useEffect(() => {
        const fit = () => {
            const cv = canvasRef.current, w = wrapRef.current;
            if (!cv || !w)
                return;
            const dpr = window.devicePixelRatio || 1;
            cv.width = w.clientWidth * dpr;
            cv.height = w.clientHeight * dpr;
            cv.style.width = w.clientWidth + "px";
            cv.style.height = w.clientHeight + "px";
            const ctx = cv.getContext("2d");
            if (ctx)
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            render();
        };
        const ro = new ResizeObserver(fit);
        if (wrapRef.current)
            ro.observe(wrapRef.current);
        fit();
        return () => ro.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ents, draft, selection, origin, scale, cam, gridOn, grid, tool, osnap, ortho]);
    const drawPrim2D = (ctx, e, active) => {
        const lay = layers.find(l => l.name === e.layer);
        if (!lay || !lay.visible)
            return;
        const color = e.color ?? lay.color;
        const lw = e.lw ?? lay.lw;
        ctx.save();
        ctx.strokeStyle = active ? THEME.draft : color;
        ctx.fillStyle = active ? "rgba(46,161,255,.12)" : "transparent";
        ctx.lineWidth = lw * (scale >= 1 ? 1 : scale);
        if (e.type === "line") {
            const A = worldToScreen(e.a, origin, scale), B = worldToScreen(e.b, origin, scale);
            ctx.beginPath();
            ctx.moveTo(A.x, A.y);
            ctx.lineTo(B.x, B.y);
            ctx.stroke();
        }
        else if (e.type === "polyline") {
            if (e.pts.length > 1) {
                ctx.beginPath();
                const P0 = worldToScreen(e.pts[0], origin, scale);
                ctx.moveTo(P0.x, P0.y);
                for (let i = 1; i < e.pts.length; i++) {
                    const P = worldToScreen(e.pts[i], origin, scale);
                    ctx.lineTo(P.x, P.y);
                }
                if (e.closed)
                    ctx.closePath();
                ctx.stroke();
            }
        }
        else if (e.type === "rect") {
            const A = worldToScreen(e.a, origin, scale), B = worldToScreen(e.b, origin, scale);
            const x = Math.min(A.x, B.x), y = Math.min(A.y, B.y), w = Math.abs(A.x - B.x), h = Math.abs(A.y - B.y);
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.stroke();
            if (active)
                ctx.fill();
        }
        else if (e.type === "circle") {
            const C = worldToScreen(e.c, origin, scale);
            ctx.beginPath();
            ctx.arc(C.x, C.y, e.r * scale, 0, Math.PI * 2);
            ctx.stroke();
        }
        else if (e.type === "text") {
            const P = worldToScreen(e.p, origin, scale);
            ctx.fillStyle = color;
            ctx.font = `${Math.max(6, e.size * scale)}px ui-monospace, Menlo, Consolas, monospace`;
            ctx.textBaseline = "alphabetic";
            ctx.fillText(e.text, P.x, P.y);
        }
        else if (e.type === "blockref") {
            const def = blocks.find(b => b.name === e.name);
            if (!def) {
                ctx.restore();
                return;
            }
            const sc = e.scale ?? 1;
            const ang = (e.rot ?? 0) * Math.PI / 180;
            const R = (p) => ({ x: p.x * Math.cos(ang) - p.y * Math.sin(ang), y: p.x * Math.sin(ang) + p.y * Math.cos(ang) });
            const T = (p) => add2(e.at, mul2(R(p), sc));
            for (const prim of def.ents) {
                const tmp = prim.type === "line" ? { ...prim, id: "_", layer: e.layer, a: T(prim.a), b: T(prim.b), color: e.color } :
                    prim.type === "polyline" ? { ...prim, id: "_", layer: e.layer, pts: prim.pts.map(T), color: e.color } :
                        prim.type === "rect" ? { ...prim, id: "_", layer: e.layer, a: T(prim.a), b: T(prim.b), color: e.color } :
                            prim.type === "circle" ? { ...prim, id: "_", layer: e.layer, c: T(prim.c), r: prim.r * sc, color: e.color } :
                                prim.type === "text" ? { ...prim, id: "_", layer: e.layer, p: T(prim.p), size: prim.size * sc, color: e.color } :
                                    null;
                if (tmp)
                    drawPrim2D(ctx, tmp, active);
            }
        }
        ctx.restore();
    };
    const drawPrim3DWire = (ctx, e, active) => {
        const lay = layers.find(l => l.name === e.layer);
        if (!lay || !lay.visible)
            return;
        const color = e.color ?? lay.color;
        const lw = e.lw ?? lay.lw;
        ctx.save();
        ctx.strokeStyle = active ? THEME.draft : color;
        ctx.lineWidth = lw * (scale >= 1 ? 1 : scale);
        const lin = (A, B) => {
            const a = proj(A, cam), b = proj(B, cam);
            const A2 = worldToScreen(a, origin, scale), B2 = worldToScreen(b, origin, scale);
            ctx.beginPath();
            ctx.moveTo(A2.x, A2.y);
            ctx.lineTo(B2.x, B2.y);
            ctx.stroke();
        };
        if (e.type === "line3d")
            lin(e.a, e.b);
        if (e.type === "face3d") {
            lin(e.a, e.b);
            lin(e.b, e.c);
            lin(e.c, e.d ?? e.a);
            lin(e.d ?? e.a, e.a);
        }
        ctx.restore();
    };
    const render = useCallback(() => {
        const cv = canvasRef.current;
        if (!cv)
            return;
        const ctx = cv.getContext("2d");
        if (!ctx)
            return;
        const w = cv.clientWidth, h = cv.clientHeight;
        ctx.clearRect(0, 0, w, h);
        // bg
        ctx.fillStyle = THEME.bg;
        ctx.fillRect(0, 0, w, h);
        // grid
        if (gridOn) {
            const step = grid * scale;
            const ox = -origin.x * scale, oy = -origin.y * scale;
            for (let x = (ox % step + step) % step; x < w; x += step)
                for (let y = (oy % step + step) % step; y < h; y += step) {
                    ctx.fillStyle = (((x + y) / step) % 5 === 0) ? THEME.gridMajor : THEME.gridMinor;
                    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
                }
        }
        // axes XY
        const AX = worldToScreen({ x: 0, y: 0 }, origin, scale);
        ctx.strokeStyle = THEME.axisX;
        ctx.beginPath();
        ctx.moveTo(0, AX.y + 0.5);
        ctx.lineTo(w, AX.y + 0.5);
        ctx.stroke();
        ctx.strokeStyle = THEME.axisY;
        ctx.beginPath();
        ctx.moveTo(AX.x + 0.5, 0);
        ctx.lineTo(AX.x + 0.5, h);
        ctx.stroke();
        // draw entities (2D first)
        for (const e of ents)
            if (e.type !== "line3d" && e.type !== "face3d")
                drawPrim2D(ctx, e, selection.has(e.id));
        // then 3D
        for (const e of ents)
            if (e.type === "line3d" || e.type === "face3d")
                drawPrim3DWire(ctx, e, selection.has(e.id));
        // draft preview
        if (draft && draft.type !== "blockref") {
            ctx.save();
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = THEME.draft;
            drawPrim2D(ctx, draft, true);
            ctx.restore();
        }
        // crosshair
        ctx.save();
        ctx.strokeStyle = THEME.crosshair;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(0, mouse.y + 0.5);
        ctx.lineTo(w, mouse.y + 0.5);
        ctx.moveTo(mouse.x + 0.5, 0);
        ctx.lineTo(mouse.x + 0.5, h);
        ctx.stroke();
        ctx.restore();
    }, [ents, draft, origin, scale, mouse, gridOn, grid, selection, cam]);
    /** ===== Mouse / Wheel ===== */
    useEffect(() => {
        const cv = canvasRef.current;
        if (!cv)
            return;
        const onWheel = (e) => {
            e.preventDefault();
            const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
            const before = screenToWorld({ x: mx, y: my }, origin, scale);
            const ns = Math.min(8, Math.max(0.1, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
            setScale(ns);
            setOrigin({ x: before.x - mx / ns, y: before.y - my / ns });
        };
        const onMove = (e) => {
            const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
            setMouse({ x: mx, y: my });
            if (panning)
                setOrigin(o => ({ x: o.x - e.movementX / scale, y: o.y - e.movementY / scale }));
            if (orbiting)
                setCam(c => ({ ...c, ay: c.ay + e.movementX * 0.01, ax: c.ax + e.movementY * 0.01 }));
            const w = screenToWorld({ x: mx, y: my }, origin, scale);
            const tol = 8 / scale;
            const visible = ents.filter(en => layers.find(l => l.name === en.layer)?.visible);
            const wSnap = (osnap && osnapPoint(visible, w, tol)) ?? snapGrid(w, grid);
            if (draft?.type === "line")
                setDraft({ ...draft, b: ortho ? { x: wSnap.x, y: draft.a.y } : wSnap });
            if (draft?.type === "polyline") {
                const pts = [...draft.pts];
                pts[pts.length - 1] = wSnap;
                setDraft({ ...draft, pts });
            }
            if (draft?.type === "rect")
                setDraft({ ...draft, b: wSnap });
            if (draft?.type === "circle")
                setDraft({ ...draft, r: dist2(wSnap, draft.c) });
            if (draft?.type === "move")
                setDraft({ ...draft, moved: { x: wSnap.x - draft.start.x, y: wSnap.y - draft.start.y } });
            if (tool === "insert" && draft?.type === "blockref")
                setDraft({ ...draft, at: wSnap });
            if (tool === "text" && draft?.type === "text")
                setDraft({ ...draft, p: wSnap });
        };
        const onDown = (e) => {
            const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
            const w = screenToWorld({ x: mx, y: my }, origin, scale);
            if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
                setPan(true);
                return;
            }
            if (e.button === 2) {
                setOrbit(true);
                return;
            }
            // clicks
            if (tool === "select") {
                const hit = [...ents].reverse().find(en => {
                    const lay = layers.find(l => l.name === en.layer);
                    if (!lay?.visible)
                        return false;
                    if (en.type === "line")
                        return pickSeg(en.a, en.b, w, 0.6 / scale);
                    if (en.type === "polyline")
                        return en.pts.some((p, i) => i && pickSeg(en.pts[i - 1], p, w, 0.6 / scale));
                    if (en.type === "rect") {
                        const s = segs2D(en);
                        return s.some(sg => pickSeg(sg.p, sg.q, w, 0.6 / scale));
                    }
                    if (en.type === "circle")
                        return Math.abs(dist2(w, en.c) - en.r) <= 0.6 / scale;
                    if (en.type === "text")
                        return dist2(w, en.p) <= 4 / scale;
                    if (en.type === "blockref")
                        return dist2(w, en.at) <= 6 / scale;
                    if (en.type === "line3d")
                        return false;
                    if (en.type === "face3d")
                        return false;
                    return false;
                });
                if (hit) {
                    setSel(S => {
                        const n = new Set(S);
                        if (e.ctrlKey || e.metaKey) {
                            n.has(hit.id) ? n.delete(hit.id) : n.add(hit.id);
                        }
                        else {
                            n.clear();
                            n.add(hit.id);
                        }
                        return n;
                    });
                }
                else
                    setSel(new Set());
            }
            if (tool === "move") {
                const tol = 0.6 / scale;
                const hit = [...ents].reverse().find(en => {
                    if (en.type === "line")
                        return pickSeg(en.a, en.b, w, tol);
                    if (en.type === "polyline")
                        return en.pts.some((p, i) => i && pickSeg(en.pts[i - 1], p, w, tol));
                    if (en.type === "rect")
                        return segs2D(en).some(s => pickSeg(s.p, s.q, w, tol));
                    if (en.type === "circle")
                        return Math.abs(dist2(w, en.c) - en.r) <= tol;
                    if (en.type === "text")
                        return dist2(w, en.p) <= 4 / scale;
                    if (en.type === "blockref")
                        return dist2(w, en.at) <= 6 / scale;
                    return false;
                });
                if (hit) {
                    if (!selection.has(hit.id))
                        setSel(new Set([hit.id]));
                    setDraft({ type: "move", start: w, moved: { x: 0, y: 0 } });
                }
            }
            if (tool === "line") {
                !draft ? setDraft({ type: "line", a: w, b: w, id: uid(), layer: activeLayer })
                    : (commitAdd(draft), setDraft(null));
            }
            if (tool === "polyline") {
                !draft ? setDraft({ type: "polyline", pts: [w, w], closed: false, id: uid(), layer: activeLayer })
                    : setDraft((d) => ({ ...d, pts: [...d.pts.slice(0, -1), w, w] }));
            }
            if (tool === "rect") {
                !draft ? setDraft({ type: "rect", a: w, b: w, id: uid(), layer: activeLayer })
                    : (commitAdd(draft), setDraft(null));
            }
            if (tool === "circle") {
                !draft ? setDraft({ type: "circle", c: w, r: 0, id: uid(), layer: activeLayer })
                    : (draft.r > 0 && commitAdd(draft), setDraft(null));
            }
            if (tool === "text") {
                const text = window.prompt?.("Testo:", "Text") ?? "Text";
                const size = Number(window.prompt?.("Altezza (unità):", "10")) || 10;
                const ent = { id: uid(), type: "text", p: w, text, size: Math.max(1, size), layer: activeLayer };
                commitAdd(ent);
            }
            if (tool === "insert" && draft?.type === "blockref") {
                const ent = { ...draft, id: uid(), layer: activeLayer };
                commitAdd(ent);
                setDraft(null);
            }
            if (tool === "trim")
                handleTrim(w);
            if (tool === "extend")
                handleExtend(w);
            if (tool === "offset")
                handleOffset(w);
            if (tool === "dim")
                handleDim(w);
        };
        const onUp = () => {
            setPan(false);
            setOrbit(false);
            if (tool === "polyline" && draft?.type === "polyline") {
                commitAdd(draft);
                setDraft(null);
            }
            if (tool === "move" && draft?.type === "move") {
                const { x, y } = draft.moved;
                if (x || y)
                    selection.forEach(id => {
                        const before = ents.find(e => e.id === id);
                        const after = moveEntity(before, x, y);
                        push({ kind: "update", id, before, after });
                        apply({ kind: "update", id, before, after }, +1);
                    });
                setDraft(null);
            }
        };
        const onCtx = (e) => { e.preventDefault(); };
        cv.addEventListener("wheel", onWheel, { passive: false });
        cv.addEventListener("mousemove", onMove);
        cv.addEventListener("mousedown", onDown);
        window.addEventListener("mouseup", onUp);
        cv.addEventListener("contextmenu", onCtx);
        return () => {
            cv.removeEventListener("wheel", onWheel);
            cv.removeEventListener("mousemove", onMove);
            cv.removeEventListener("mousedown", onDown);
            window.removeEventListener("mouseup", onUp);
            cv.removeEventListener("contextmenu", onCtx);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ents, draft, tool, selection, panning, orbiting, origin, scale, cam, activeLayer, layers, grid, osnap, ortho]);
    const pickSeg = (a, b, p, tol) => {
        const AB = sub2(b, a), AP = sub2(p, a);
        const ab2 = dot2(AB, AB) || 1;
        const t = Math.max(0, Math.min(1, dot2(AP, AB) / ab2));
        const q = add2(a, mul2(AB, t));
        return dist2(p, q) <= tol;
    };
    const moveEntity = (e, x, y) => {
        if (e.type === "line")
            return { ...e, a: add2(e.a, { x, y }), b: add2(e.b, { x, y }) };
        if (e.type === "polyline")
            return { ...e, pts: e.pts.map(p => add2(p, { x, y })) };
        if (e.type === "rect")
            return { ...e, a: add2(e.a, { x, y }), b: add2(e.b, { x, y }) };
        if (e.type === "circle")
            return { ...e, c: add2(e.c, { x, y }) };
        if (e.type === "text")
            return { ...e, p: add2(e.p, { x, y }) };
        if (e.type === "blockref")
            return { ...e, at: add2(e.at, { x, y }) };
        if (e.type === "line3d")
            return { ...e, a: add3(e.a, { x, y, z: 0 }), b: add3(e.b, { x, y, z: 0 }) };
        if (e.type === "face3d")
            return { ...e, a: add3(e.a, { x, y, z: 0 }), b: add3(e.b, { x, y, z: 0 }), c: add3(e.c, { x, y, z: 0 }), d: e.d ? add3(e.d, { x, y, z: 0 }) : undefined };
        return e;
    };
    const commitAdd = (ent) => { push({ kind: "add", ent }); apply({ kind: "add", ent }, +1); };
    /** ===== TRIM / EXTEND / OFFSET / DIM (lite) ===== */
    const handleTrim = (w) => {
        const vis = ents.filter(e => layers.find(l => l.name === e.layer)?.visible);
        const hit = [...vis].reverse().find(e => (e.type === "line" && pickSeg(e.a, e.b, w, 0.6 / scale))
            || (e.type === "rect" && segs2D(e).some(s => pickSeg(s.p, s.q, w, 0.6 / scale)))
            || (e.type === "polyline" && e.pts.some((p, i) => i && pickSeg(e.pts[i - 1], p, w, 0.6 / scale)))
            || e.type === "circle");
        if (!hit)
            return;
        if (hit.type === "line") {
            const s = { p: hit.a, q: hit.b };
            const cuts = [];
            vis.filter(o => o.id !== hit.id).forEach(o => segs2D(o).forEach(s2 => { const I = segIntersect(s.p, s.q, s2.p, s2.q); if (I)
                cuts.push(I); }));
            if (!cuts.length)
                return;
            const clickT = (() => { const v = sub2(s.q, s.p); return Math.max(0, Math.min(1, dot2(sub2(w, s.p), v) / (dot2(v, v) || 1))); })();
            let best = cuts[0];
            let bestd = Math.abs(best.t - clickT);
            cuts.forEach(I => { const d0 = Math.abs(I.t - clickT); if (d0 < bestd) {
                best = I;
                bestd = d0;
            } });
            const before = hit;
            const after = Math.abs(best.t - 0) < Math.abs(1 - best.t) ? { ...hit, a: best.p } : { ...hit, b: best.p };
            push({ kind: "update", id: hit.id, before, after });
            apply({ kind: "update", id: hit.id, before, after }, +1);
        }
        // (rect/polyline/circle: come versioni precedenti → per brevità lasciamo la base)
    };
    const handleExtend = (w) => {
        const vis = ents.filter(e => layers.find(l => l.name === e.layer)?.visible);
        const hit = [...vis].reverse().find(e => e.type === "line" && pickSeg(e.a, e.b, w, 0.6 / scale));
        if (!hit)
            return;
        const closerA = dist2(w, hit.a) <= dist2(w, hit.b);
        const ray = closerA ? { p: hit.a, dir: unit2(sub2(hit.b, hit.a)) } : { p: hit.b, dir: unit2(sub2(hit.a, hit.b)) };
        let best = null, bestD = Infinity;
        vis.filter(o => o.id !== hit.id).forEach(o => segs2D(o).forEach(s2 => {
            const far = add2(ray.p, mul2(ray.dir, 1e6));
            const I = segIntersect(ray.p, far, s2.p, s2.q);
            if (I) {
                const d = dist2(I.p, ray.p);
                if (d > 1e-6 && d < bestD) {
                    bestD = d;
                    best = I.p;
                }
            }
        }));
        if (!best)
            return;
        const before = hit;
        const after = closerA ? { ...hit, a: best } : { ...hit, b: best };
        push({ kind: "update", id: hit.id, before, after });
        apply({ kind: "update", id: hit.id, before, after }, +1);
    };
    const handleOffset = (w) => {
        const vis = ents.filter(e => layers.find(l => l.name === e.layer)?.visible);
        const hit = [...vis].reverse().find(e => (e.type === "line" && pickSeg(e.a, e.b, w, 0.6 / scale)) ||
            (e.type === "rect" && segs2D(e).some(s => pickSeg(s.p, s.q, w, 0.6 / scale))) ||
            (e.type === "polyline" && e.pts.some((p, i) => i && pickSeg(e.pts[i - 1], p, w, 0.6 / scale))));
        if (!hit)
            return;
        if (hit.type === "line") {
            const v = unit2(sub2(hit.b, hit.a)), n = { x: -v.y, y: v.x };
            const side = Math.sign(dot2(sub2(w, hit.a), n)) || 1;
            const off = mul2(n, offsetDist * side);
            commitAdd({ id: uid(), type: "line", a: add2(hit.a, off), b: add2(hit.b, off), layer: activeLayer });
        }
        else if (hit.type === "rect") {
            const minx = Math.min(hit.a.x, hit.b.x), maxx = Math.max(hit.a.x, hit.b.x);
            const miny = Math.min(hit.a.y, hit.b.y), maxy = Math.max(hit.a.y, hit.b.y);
            const inside = (p) => p.x >= minx && p.x <= maxx && p.y >= miny && p.y <= maxy;
            const expand = !inside(w), d = offsetDist, dx = expand ? d : -d, dy = expand ? d : -d;
            commitAdd({ id: uid(), type: "rect", a: { x: minx - dx, y: miny - dy }, b: { x: maxx + dx, y: maxy + dy }, layer: activeLayer });
        }
        else if (hit.type === "polyline") {
            // offset lite
            const pts = hit.pts;
            if (pts.length < 2)
                return;
            const res = [];
            const offsetSeg = (a, b) => {
                const v = unit2(sub2(b, a)), n = { x: -v.y, y: v.x };
                const side = Math.sign(dot2(sub2(w, a), n)) || 1;
                const off = mul2(n, offsetDist * side);
                return { p: add2(a, off), q: add2(b, off) };
            };
            const off = pts.slice(1).map((_, i) => offsetSeg(pts[i], pts[i + 1]));
            res.push(off[0].p);
            for (let i = 1; i < off.length; i++) {
                const A = off[i - 1], B = off[i];
                const I = lineLine(A.p, A.q, B.p, B.q);
                res.push(I ?? A.q);
            }
            res.push(off[off.length - 1].q);
            commitAdd({ id: uid(), type: "polyline", pts: res, closed: false, layer: activeLayer, color: hit.color, lw: hit.lw });
        }
    };
    const lineLine = (a, b, c, d) => {
        const r = sub2(b, a), s = sub2(d, c);
        const rxs = r.x * s.y - r.y * s.x;
        if (Math.abs(rxs) < 1e-9)
            return null;
        const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / rxs;
        return add2(a, mul2(r, t));
    };
    const handleDim = (w) => {
        // DIM lineare: seleziona 2 punti (click-clic). Usa draft per primo punto.
        if (!draft || draft.kind !== "dim1")
            setDraft({ kind: "dim1", p1: w });
        else {
            const p1 = draft.p1, p2 = w;
            const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            const len = dist2(p1, p2).toFixed(2);
            commitAdd({ id: uid(), type: "line", a: p1, b: p2, layer: activeLayer, color: "#bbbbbb" });
            commitAdd({ id: uid(), type: "text", p: add2(mid, { x: 4, y: -4 }), text: len, size: 10, layer: activeLayer, color: "#c9e1ff" });
            setDraft(null);
        }
    };
    /** ===== Keys & Commands ===== */
    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                doUndo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
                e.preventDefault();
                doRedo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
                e.preventDefault();
                setSel(new Set(ents.map(e => e.id)));
            }
            if (e.key === "Escape") {
                setDraft(null);
            }
            if (e.key === "Delete" && selection.size) {
                const ids = Array.from(selection);
                ids.forEach(id => { const before = ents.find(e => e.id === id); push({ kind: "remove", id, before }); apply({ kind: "remove", id, before }, +1); });
                setSel(new Set());
            }
            const k = e.key.toLowerCase();
            if (k === "f8")
                setOrtho(o => !o);
            if (k === "f3")
                setOsnap(s => !s);
            if (k === "g")
                setGridOn(v => !v);
            if (k === "l")
                setTool("line");
            if (k === "p")
                setTool("polyline");
            if (k === "r")
                setTool("rect");
            if (k === "c")
                setTool("circle");
            if (k === "v")
                setTool("select");
            if (k === "m")
                setTool("move");
            if (k === "t")
                setTool("trim");
            if (k === "e")
                setTool("extend");
            if (k === "o")
                setTool("offset");
            if (k === "x")
                setTool("text");
            if (k === "d")
                setTool("dim");
            if (k === "i")
                setTool("insert");
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [ents, selection]);
    /** ===== Import / Export ===== */
    const openFile = async (accept) => await new Promise(res => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = accept; inp.onchange = () => res(inp.files?.[0] ?? null); inp.click(); });
    // DXF client parser (lite)
    const parseDXF = async (file) => {
        const text = await file.text();
        const lines = text.split(/\r?\n/);
        const get = (i) => ({ code: lines[i]?.trim(), val: lines[i + 1]?.trim() });
        const out = [];
        let i = 0;
        while (i < lines.length - 1) {
            const g = get(i);
            if (g.code !== "0") {
                i += 2;
                continue;
            }
            const type = g.val?.toUpperCase();
            if (type === "LINE") {
                let a = { x: 0, y: 0 }, b = { x: 0, y: 0 }, layer = "0";
                i += 2;
                while (i < lines.length - 1) {
                    const c = get(i);
                    if (c.code === "0")
                        break;
                    if (c.code === "8")
                        layer = c.val;
                    if (c.code === "10")
                        a.x = Number(c.val);
                    if (c.code === "20")
                        a.y = Number(c.val);
                    if (c.code === "11")
                        b.x = Number(c.val);
                    if (c.code === "21")
                        b.y = Number(c.val);
                    i += 2;
                }
                out.push({ id: uid(), type: "line", a, b, layer });
                continue;
            }
            if (type === "LWPOLYLINE" || type === "POLYLINE") {
                i += 2;
                let pts = [];
                let layer = "0";
                let closed = false;
                while (i < lines.length - 1) {
                    const c = get(i);
                    if (c.code === "0")
                        break;
                    if (c.code === "8")
                        layer = c.val;
                    if (c.code === "70")
                        closed = (Number(c.val) & 1) === 1;
                    if (c.code === "10") {
                        const x = Number(c.val);
                        const y = Number(get(i + 2).val);
                        pts.push({ x, y });
                        i += 4;
                        continue;
                    }
                    i += 2;
                }
                out.push({ id: uid(), type: "polyline", pts, closed, layer });
                continue;
            }
            if (type === "CIRCLE") {
                i += 2;
                let cpt = { x: 0, y: 0 }, r = 0, layer = "0";
                while (i < lines.length - 1) {
                    const c = get(i);
                    if (c.code === "0")
                        break;
                    if (c.code === "8")
                        layer = c.val;
                    if (c.code === "10")
                        cpt.x = Number(c.val);
                    if (c.code === "20")
                        cpt.y = Number(c.val);
                    if (c.code === "40")
                        r = Number(c.val);
                    i += 2;
                }
                out.push({ id: uid(), type: "circle", c: cpt, r, layer });
                continue;
            }
            if (type === "TEXT") {
                i += 2;
                let p = { x: 0, y: 0 }, size = 10, text = "", layer = "0";
                while (i < lines.length - 1) {
                    const c = get(i);
                    if (c.code === "0")
                        break;
                    if (c.code === "8")
                        layer = c.val;
                    if (c.code === "10")
                        p.x = Number(c.val);
                    if (c.code === "20")
                        p.y = Number(c.val);
                    if (c.code === "40")
                        size = Number(c.val);
                    if (c.code === "1")
                        text = c.val ?? "";
                    i += 2;
                }
                out.push({ id: uid(), type: "text", p, text, size, layer });
                continue;
            }
            if (type === "3DFACE") {
                i += 2;
                let ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0, cx = 0, cy = 0, cz = 0, dx = 0, dy = 0, dz = 0, layer = "0";
                while (i < lines.length - 1) {
                    const c = get(i);
                    if (c.code === "0")
                        break;
                    if (c.code === "8")
                        layer = c.val;
                    if (c.code === "10")
                        ax = Number(c.val);
                    if (c.code === "20")
                        ay = Number(c.val);
                    if (c.code === "30")
                        az = Number(c.val);
                    if (c.code === "11")
                        bx = Number(c.val);
                    if (c.code === "21")
                        by = Number(c.val);
                    if (c.code === "31")
                        bz = Number(c.val);
                    if (c.code === "12")
                        cx = Number(c.val);
                    if (c.code === "22")
                        cy = Number(c.val);
                    if (c.code === "32")
                        cz = Number(c.val);
                    if (c.code === "13")
                        dx = Number(c.val);
                    if (c.code === "23")
                        dy = Number(c.val);
                    if (c.code === "33")
                        dz = Number(c.val);
                    i += 2;
                }
                out.push({ id: uid(), type: "face3d", a: { x: ax, y: ay, z: az }, b: { x: bx, y: by, z: bz }, c: { x: cx, y: cy, z: cz }, d: { x: dx, y: dy, z: dz }, layer });
                continue;
            }
            if (type === "VERTEX" || type === "SEQEND") {
                i += 2;
                continue;
            }
            // default advance
            i += 2;
        }
        setEnts(e => [...e, ...out]);
    };
    const doImportDXF = async () => {
        const f = await openFile(".dxf");
        if (!f)
            return;
        await parseDXF(f);
    };
    const doImportDWG = async () => {
        const f = await openFile(".dwg");
        if (!f)
            return;
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/import/dwg", { method: "POST", body: fd });
        if (!res.ok) {
            alert("DWG non supportato sul server (501 o errore).");
            return;
        }
        const data = await res.json(); // { entities: EntityLike[] }
        setEnts(e => [...e, ...mapServerEntities(data.entities)]);
    };
    const doImportPDF = async () => {
        const f = await openFile(".pdf");
        if (!f)
            return;
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/import/pdf", { method: "POST", body: fd });
        if (!res.ok) {
            alert("PDF non convertibile sul server (501 o errore).");
            return;
        }
        // ritorna {imageDataUrl:string, bounds?:{minx,miny,maxx,maxy}}
        const data = await res.json();
        // Inserisci come “raster” simulato: rectangle + nota
        const a = { x: origin.x + 20 / scale, y: origin.y + 20 / scale };
        const b = { x: a.x + 200, y: a.y + 140 };
        commitAdd({ id: uid(), type: "rect", a, b, layer: activeLayer, color: "#666" });
        commitAdd({ id: uid(), type: "text", p: add2(a, { x: 4, y: -4 }), text: "PDF raster import (server)", size: 10, layer: activeLayer, color: "#aaa" });
        // (Se vuoi, salviamo data.imageDataUrl nello stato e lo disegniamo sul canvas come background)
    };
    const mapServerEntities = (arr) => arr.map((o) => {
        if (o.type === "line")
            return { id: uid(), type: "line", a: o.a, b: o.b, layer: o.layer || activeLayer };
        if (o.type === "polyline")
            return { id: uid(), type: "polyline", pts: o.pts, closed: !!o.closed, layer: o.layer || activeLayer };
        if (o.type === "circle")
            return { id: uid(), type: "circle", c: o.c, r: o.r, layer: o.layer || activeLayer };
        if (o.type === "text")
            return { id: uid(), type: "text", p: o.p, text: o.text, size: o.size || 10, layer: o.layer || activeLayer };
        if (o.type === "line3d")
            return { id: uid(), type: "line3d", a: o.a, b: o.b, layer: o.layer || activeLayer };
        if (o.type === "face3d")
            return { id: uid(), type: "face3d", a: o.a, b: o.b, c: o.c, d: o.d, layer: o.layer || activeLayer };
        return null;
    }).filter(Boolean);
    const exportPNG = () => { const cv = canvasRef.current; if (!cv)
        return; const a = document.createElement("a"); a.href = cv.toDataURL("image/png"); a.download = "cad.png"; a.click(); };
    const exportJSON = () => {
        const data = JSON.stringify({ ents, layers, blocks }, null, 2);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
        a.download = "cad.json";
        a.click();
    };
    const exportDXF = () => {
        const head = ["0", "SECTION", "2", "ENTITIES"], body = [];
        for (const e of ents) {
            if (e.type === "line")
                body.push("0", "LINE", "8", e.layer, "10", String(e.a.x), "20", String(e.a.y), "11", String(e.b.x), "21", String(e.b.y));
            else if (e.type === "circle")
                body.push("0", "CIRCLE", "8", e.layer, "10", String(e.c.x), "20", String(e.c.y), "40", String(e.r));
            else if (e.type === "rect") {
                const p = [e.a, { x: e.b.x, y: e.a.y }, e.b, { x: e.a.x, y: e.b.y }];
                body.push("0", "LWPOLYLINE", "8", e.layer, "90", "4", "70", "1", ...p.flatMap(pt => ["10", String(pt.x), "20", String(pt.y)]));
            }
            else if (e.type === "polyline")
                body.push("0", "LWPOLYLINE", "8", e.layer, "90", String(e.pts.length), "70", e.closed ? "1" : "0", ...e.pts.flatMap(pt => ["10", String(pt.x), "20", String(pt.y)]));
            else if (e.type === "text")
                body.push("0", "TEXT", "8", e.layer, "10", String(e.p.x), "20", String(e.p.y), "40", String(e.size), "1", e.text);
            else if (e.type === "line3d")
                body.push("0", "LINE", "8", e.layer, "10", String(e.a.x), "20", String(e.a.y), "30", String(e.a.z), "11", String(e.b.x), "21", String(e.b.y), "31", String(e.b.z));
            else if (e.type === "face3d")
                body.push("0", "3DFACE", "8", e.layer, "10", String(e.a.x), "20", String(e.a.y), "30", String(e.a.z), "11", String(e.b.x), "21", String(e.b.y), "31", String(e.b.z), "12", String(e.c.x), "22", String(e.c.y), "32", String(e.c.z), ...(e.d ? ["13", String(e.d.x), "23", String(e.d.y), "33", String(e.d.z)] : []));
        }
        const dxf = [...head, ...body, "0", "ENDSEC", "0", "EOF"].join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([dxf], { type: "application/dxf" }));
        a.download = "cad.dxf";
        a.click();
    };
    /** ===== UI ===== */
    const Btn = ({ name, active, onClick }) => (_jsx("button", { onClick: onClick, style: { padding: "8px 10px", border: active ? `2px solid ${THEME.draft}` : `1px solid ${THEME.controlBorder}`,
            background: active ? "rgba(46,161,255,.12)" : THEME.controlBg, borderRadius: 6, cursor: "pointer", color: THEME.text }, children: name }));
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", color: THEME.text }, children: [_jsxs("div", { style: { display: "flex", gap: 8, padding: "8px 10px", borderBottom: `1px solid ${THEME.panelBorder}`, alignItems: "center", background: THEME.panelBg }, children: [_jsx("strong", { children: "BricsCAD-Lite (Canvas)" }), _jsx("div", { style: { flex: 1 } }), _jsx(Btn, { name: "Select (V)", active: tool === "select", onClick: () => setTool("select") }), _jsx(Btn, { name: "Move (M)", active: tool === "move", onClick: () => setTool("move") }), _jsx(Btn, { name: "Line (L)", active: tool === "line", onClick: () => setTool("line") }), _jsx(Btn, { name: "Polyline (P)", active: tool === "polyline", onClick: () => setTool("polyline") }), _jsx(Btn, { name: "Rect (R)", active: tool === "rect", onClick: () => setTool("rect") }), _jsx(Btn, { name: "Circle (C)", active: tool === "circle", onClick: () => setTool("circle") }), _jsx(Btn, { name: "Text (X)", active: tool === "text", onClick: () => setTool("text") }), _jsx(Btn, { name: "Trim (T)", active: tool === "trim", onClick: () => setTool("trim") }), _jsx(Btn, { name: "Extend (E)", active: tool === "extend", onClick: () => setTool("extend") }), _jsx(Btn, { name: "Offset (O)", active: tool === "offset", onClick: () => setTool("offset") }), _jsx(Btn, { name: "DIM (D)", active: tool === "dim", onClick: () => setTool("dim") }), _jsx(Btn, { name: "Insert (I)", active: tool === "insert", onClick: () => setTool("insert") }), _jsx("button", { onClick: doImportDXF, style: { padding: "8px 10px", border: `1px solid ${THEME.controlBorder}`, background: THEME.controlBg, color: THEME.text, borderRadius: 6 }, children: "Import DXF" }), _jsx("button", { onClick: doImportDWG, style: { padding: "8px 10px", border: `1px solid ${THEME.controlBorder}`, background: THEME.controlBg, color: THEME.text, borderRadius: 6 }, children: "Import DWG" }), _jsx("button", { onClick: doImportPDF, style: { padding: "8px 10px", border: `1px solid ${THEME.controlBorder}`, background: THEME.controlBg, color: THEME.text, borderRadius: 6 }, children: "Import PDF" }), _jsx("button", { onClick: exportPNG, style: { padding: "8px 10px", border: `1px solid ${THEME.controlBorder}`, background: THEME.controlBg, color: THEME.text, borderRadius: 6 }, children: "Export PNG" }), _jsx("button", { onClick: exportDXF, style: { padding: "8px 10px", border: `1px solid ${THEME.controlBorder}`, background: THEME.controlBg, color: THEME.text, borderRadius: 6 }, children: "Export DXF" }), _jsx("button", { onClick: exportJSON, style: { padding: "8px 10px", border: `1px solid ${THEME.controlBorder}`, background: THEME.controlBg, color: THEME.text, borderRadius: 6 }, children: "Save JSON" })] }), _jsxs("div", { style: { flex: 1, display: "flex", minHeight: 0 }, children: [_jsx("div", { ref: wrapRef, style: { flex: 1 }, children: _jsx("canvas", { ref: canvasRef, style: { display: "block", width: "100%", height: "100%", cursor: (panning || orbiting) ? "grabbing" : "crosshair" } }) }), _jsxs("aside", { style: { width: 320, borderLeft: `1px solid ${THEME.panelBorder}`, background: THEME.panelBg }, children: [_jsx("div", { style: { padding: 10, borderBottom: `1px solid ${THEME.panelBorder}`, fontWeight: 700 }, children: "Layer" }), _jsx("div", { style: { padding: 8, maxHeight: 220, overflow: "auto" }, children: layers.map(l => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 4px" }, children: [_jsx("input", { type: "radio", checked: activeLayer === l.name, onChange: () => setActiveLayer(l.name) }), _jsx("div", { style: { width: 14, height: 14, borderRadius: 2, background: l.color, border: "1px solid #000" } }), _jsx("div", { style: { flex: 1 }, children: l.name }), _jsx("button", { onClick: () => setLayers(ls => ls.map(x => x.name === l.name ? { ...x, visible: !x.visible } : x)), style: { border: `1px solid ${THEME.controlBorder}`, background: THEME.controlBg, color: THEME.text, borderRadius: 4 }, children: l.visible ? "👁️" : "🚫" }), _jsx("button", { onClick: () => setLayers(ls => ls.map(x => x.name === l.name ? { ...x, locked: !x.locked } : x)), style: { border: `1px solid ${THEME.controlBorder}`, background: THEME.controlBg, color: THEME.text, borderRadius: 4 }, children: l.locked ? "🔒" : "🔓" })] }, l.name))) }), _jsx("div", { style: { padding: 10, borderTop: `1px solid ${THEME.panelBorder}`, borderBottom: `1px solid ${THEME.panelBorder}`, fontWeight: 700 }, children: "Propriet\u00E0" }), _jsxs("div", { style: { padding: 10, display: "grid", gridTemplateColumns: "110px 1fr", gap: 8 }, children: [_jsx("span", { children: "Selezione" }), _jsxs("b", { children: [selection.size, " entit\u00E0"] }), _jsx("span", { children: "Offset dist" }), _jsx("input", { type: "number", value: offsetDist, onChange: e => setOffsetDist(Math.max(1, Number(e.target.value) || 10)), style: { background: THEME.controlBg, color: THEME.text, border: `1px solid ${THEME.controlBorder}`, borderRadius: 4 } }), _jsx("span", { children: "Ortho" }), _jsx("button", { onClick: () => setOrtho(o => !o), style: { border: `1px solid ${THEME.controlBorder}`, background: THEME.controlBg, color: THEME.text, borderRadius: 4 }, children: ortho ? "ON" : "OFF" }), _jsx("span", { children: "OSNAP" }), _jsx("button", { onClick: () => setOsnap(o => !o), style: { border: `1px solid ${THEME.controlBorder}`, background: THEME.controlBg, color: THEME.text, borderRadius: 4 }, children: osnap ? "ON" : "OFF" }), _jsx("span", { children: "Grid" }), _jsx("button", { onClick: () => setGridOn(g => !g), style: { border: `1px solid ${THEME.controlBorder}`, background: THEME.controlBg, color: THEME.text, borderRadius: 4 }, children: gridOn ? `${grid}` : "OFF" })] })] })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "6px 10px", borderTop: `1px solid ${THEME.panelBorder}`, background: THEME.panelBg }, children: [_jsxs("span", { children: ["Layer: ", _jsx("b", { children: activeLayer })] }), _jsxs("span", { children: ["Scala: ", scale.toFixed(2)] }), _jsxs("span", { children: ["XY: ", ((mouse.x / scale) + origin.x).toFixed(2), " , ", ((mouse.y / scale) + origin.y).toFixed(2)] }), _jsx("span", { children: "Orbit: RMB (press & drag)" }), _jsx("div", { style: { marginLeft: "auto", display: "flex", gap: 8 }, children: _jsx("button", { onClick: () => setTool("orbit"), style: { border: `1px solid ${THEME.controlBorder}`, background: THEME.controlBg, color: THEME.text, borderRadius: 4 }, children: "Orbit (RMB)" }) })] })] }));
}
