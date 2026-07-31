import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/cad/Editor2DCanvas.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
/** ===================== Utils ===================== */
const uid = (() => { let i = 0; return () => String(++i); })();
const rad = (deg) => deg * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const len = (a) => Math.hypot(a.x, a.y);
const norm = (a) => { const L = len(a) || 1; return { x: a.x / L, y: a.y / L }; };
const rot = (v, m) => ({ x: m.c * v.x - m.s * v.y, y: m.s * v.x + m.c * v.y });
const rotA = (v, ang) => rot(v, { c: Math.cos(ang), s: Math.sin(ang) });
const dist = (a, b) => len(sub(a, b));
const centroid = (pts) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
function segInt(a1, a2, b1, b2) {
    const dax = a2.x - a1.x, day = a2.y - a1.y, dbx = b2.x - b1.x, dby = b2.y - b1.y;
    const D = dax * dby - day * dbx;
    if (Math.abs(D) < 1e-9)
        return null;
    const s = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / D;
    const t = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / D;
    if (s < 0 || s > 1 || t < 0 || t > 1)
        return null;
    return { x: a1.x + s * dax, y: a1.y + s * day };
}
/** Catmull-Rom to polyline */
function catmullRom(points, segs = 8) {
    if (points.length < 2)
        return points.slice();
    const P = [points[0], ...points, points[points.length - 1]];
    const out = [];
    for (let i = 0; i < P.length - 3; i++) {
        const p0 = P[i], p1 = P[i + 1], p2 = P[i + 2], p3 = P[i + 3];
        for (let j = 0; j <= segs; j++) {
            const t = j / segs;
            const t2 = t * t, t3 = t2 * t;
            const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
            const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
            out.push({ x, y });
        }
    }
    return out;
}
/** ===================== Component ===================== */
export default function Editor2DCanvas() {
    const canvasRef = useRef(null);
    // Scene
    const [ents, setEnts] = useState([]);
    const [blocks, setBlocks] = useState([{ name: "_STD_BLOCK", ents: [] }]);
    const [layers, setLayers] = useState(["0"]);
    const [curLayer, setCurLayer] = useState("0");
    // Viewport + UCS
    const view = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
    const [ucs, setUcs] = useState({ origin: { x: 0, y: 0 }, ang: 0 }); // UCS origin+angle (radians)
    // UI
    const [tool, setTool] = useState("select");
    const [status, setStatus] = useState("Bereit");
    const [showGrid, setShowGrid] = useState(true);
    const [snapOn, setSnapOn] = useState({ endpoint: true, midpoint: true, intersection: true, center: true }); // F3
    const [ortho, setOrtho] = useState(false); // F8
    const [selection, setSelection] = useState([]);
    const [mouseW, setMouseW] = useState({ x: 0, y: 0 });
    const [clipboard, setClipboard] = useState(null);
    const [zoomStack, setZoomStack] = useState([]);
    // state for input
    const start = useRef(null);
    const nextPt = useRef(null);
    const polyPts = useRef([]);
    const panning = useRef(false);
    const panStart = useRef(null);
    const zoomSel = useRef(null);
    const opBase = useRef(null); // base point for move/rotate/mirror/scale etc.
    const opAngle = useRef(0);
    /* DPI/ctx helpers */
    const getCtx = () => {
        const c = canvasRef.current;
        const dpr = window.devicePixelRatio || 1;
        const r = c.getBoundingClientRect();
        if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
            c.width = Math.max(1, Math.round(r.width * dpr));
            c.height = Math.max(1, Math.round(r.height * dpr));
        }
        const ctx = c.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 1;
        return { ctx, rect: r };
    };
    /* World<->Screen and UCS transforms */
    const scr2w_raw = (x, y) => {
        const { rect } = getCtx();
        const z = view.current.zoom;
        return { x: (x - rect.left) / z + view.current.pan.x, y: (rect.height - (y - rect.top)) / z + view.current.pan.y };
    };
    const w2scr = (p) => {
        const { rect } = getCtx();
        const z = view.current.zoom;
        return { x: (p.x - view.current.pan.x) * z, y: rect.height - (p.y - view.current.pan.y) * z };
    };
    const u2w = (u) => add(rot(u, { c: Math.cos(ucs.ang), s: Math.sin(ucs.ang) }), ucs.origin);
    const w2u = (w) => rot(sub(w, ucs.origin), { c: Math.cos(-ucs.ang), s: Math.sin(-ucs.ang) });
    const scr2u = (x, y) => w2u(scr2w_raw(x, y));
    const u2scr = (u) => w2scr(u2w(u));
    /* Snap */
    const nearestSnap = (w) => {
        const px = 10;
        let best = null;
        const push = (pt, kind) => { const d = Math.hypot(w2scr(pt).x - w2scr(w).x, w2scr(pt).y - w2scr(w).y); if (d <= px && (!best || d < best.d))
            best = { pt, kind, d }; };
        for (const e of ents) {
            if (e.kind === "LINE") {
                if (snapOn.endpoint) {
                    push(e.p1, "endpoint");
                    push(e.p2, "endpoint");
                }
                if (snapOn.midpoint)
                    push({ x: (e.p1.x + e.p2.x) / 2, y: (e.p1.y + e.p2.y) / 2 }, "midpoint");
            }
            if (e.kind === "LWPOLYLINE") {
                for (let i = 0; i < e.pts.length; i++) {
                    const a = e.pts[i], b = e.pts[(i + 1) % e.pts.length];
                    if (snapOn.endpoint)
                        push(a, "endpoint");
                    if ((i < e.pts.length - 1 || e.closed) && snapOn.midpoint)
                        push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, "midpoint");
                }
            }
            if (e.kind === "CIRCLE" && snapOn.center) {
                push(e.c, "center");
            }
            if (e.kind === "ARC" && snapOn.center) {
                push(e.c, "center");
            }
            if (e.kind === "ELLIPSE" && snapOn.center) {
                push(e.c, "center");
            }
        }
        if (snapOn.intersection) {
            const lines = ents.filter(e => e.kind === "LINE");
            for (let i = 0; i < lines.length; i++)
                for (let j = i + 1; j < lines.length; j++) {
                    const p = segInt(lines[i].p1, lines[i].p2, lines[j].p1, lines[j].p2);
                    if (p)
                        push(p, "intersection");
                }
        }
        return best ?? { pt: w, kind: "none", d: Infinity };
    };
    const applyOrtho = (base, p) => {
        const dx = p.x - base.x, dy = p.y - base.y;
        const a = deg(Math.atan2(dy, dx));
        const ua = (Math.round((a - deg(ucs.ang)) / 90) * 90) + deg(ucs.ang);
        const ang = rad(ua);
        const L = Math.hypot(dx, dy);
        return { x: base.x + Math.cos(ang) * L, y: base.y + Math.sin(ang) * L };
    };
    /* Drawing primitives */
    const path = (ctx, pts) => {
        if (!pts.length)
            return;
        const s = w2scr(pts[0]);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        for (let i = 1; i < pts.length; i++) {
            const p = w2scr(pts[i]);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    };
    const ellipsePath = (ctx, e) => {
        const c = u2scr(w2u(e.c)); // still ok
        ctx.beginPath();
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(-ucs.ang - e.rot);
        ctx.scale(e.rx * view.current.zoom, e.ry * view.current.zoom);
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.restore();
        ctx.stroke();
    };
    const circleDraw = (ctx, c, r) => { const C = w2scr(c); ctx.beginPath(); ctx.arc(C.x, C.y, r * view.current.zoom, 0, Math.PI * 2); ctx.stroke(); };
    /* Draw entire scene */
    const draw = useCallback((preview) => {
        const { ctx, rect } = getCtx();
        ctx.clearRect(0, 0, rect.width, rect.height);
        // bg
        ctx.fillStyle = "#0f1317";
        ctx.fillRect(0, 0, rect.width, rect.height);
        // grid
        if (showGrid) {
            const z = view.current.zoom;
            const step = Math.max(10, Math.floor(50 * z) / z);
            const minX = view.current.pan.x - rect.width / z, maxX = view.current.pan.x + rect.width / z;
            const minY = view.current.pan.y - rect.height / z, maxY = view.current.pan.y + rect.height / z;
            ctx.strokeStyle = "#1b2229";
            ctx.beginPath();
            for (let x = Math.floor(minX / step) * step; x <= maxX; x += step) {
                const sx = w2scr({ x, y: 0 }).x;
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, rect.height);
            }
            for (let y = Math.floor(minY / step) * step; y <= maxY; y += step) {
                const sy = w2scr({ x: 0, y }).y;
                ctx.moveTo(0, sy);
                ctx.lineTo(rect.width, sy);
            }
            ctx.stroke();
        }
        // UCS triad
        const o = w2scr(ucs.origin), x1 = w2scr(add(ucs.origin, rot({ x: 20 / view.current.zoom, y: 0 }, { c: Math.cos(ucs.ang), s: Math.sin(ucs.ang) })));
        const y1 = w2scr(add(ucs.origin, rot({ x: 0, y: 20 / view.current.zoom }, { c: Math.cos(ucs.ang), s: Math.sin(ucs.ang) })));
        ctx.strokeStyle = "#9fe870";
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(x1.x, x1.y);
        ctx.stroke();
        ctx.strokeStyle = "#6cb6ff";
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(y1.x, y1.y);
        ctx.stroke();
        ctx.fillStyle = "#9aa6b2";
        ctx.font = "12px system-ui";
        ctx.fillText("U", o.x - 8, o.y + 14);
        // ents
        for (const e of ents) {
            ctx.setLineDash([]);
            ctx.lineWidth = 1;
            ctx.strokeStyle = e.color || "#d1e7ff";
            ctx.fillStyle = e.color || "#d1e7ff";
            if (e.kind === "LINE") {
                path(ctx, [e.p1, e.p2]);
            }
            else if (e.kind === "LWPOLYLINE") {
                path(ctx, e.closed ? e.pts.concat([e.pts[0]]) : e.pts);
            }
            else if (e.kind === "CIRCLE") {
                circleDraw(ctx, e.c, e.r);
            }
            else if (e.kind === "ARC") {
                const C = w2scr(e.c);
                ctx.beginPath();
                ctx.arc(C.x, C.y, e.r * view.current.zoom, -(e.a1 + ucs.ang), -(e.a0 + ucs.ang), true);
                ctx.stroke();
            }
            else if (e.kind === "ELLIPSE") {
                ellipsePath(ctx, e);
            }
            else if (e.kind === "SPLINE") {
                const pl = catmullRom(e.pts, 8);
                path(ctx, pl);
            }
            else if (e.kind === "POINT") {
                const p = w2scr(e.p);
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
            else if (e.kind === "HATCH") {
                if (e.solid) {
                    ctx.fillStyle = "rgba(255,255,255,0.15)";
                    ctx.beginPath();
                    const s = w2scr(e.boundary[0]);
                    ctx.moveTo(s.x, s.y);
                    for (let i = 1; i < e.boundary.length; i++) {
                        const q = w2scr(e.boundary[i]);
                        ctx.lineTo(q.x, q.y);
                    }
                    ctx.closePath();
                    ctx.fill();
                }
            }
            else if (e.kind === "TEXT") {
                const p = w2scr(e.p);
                ctx.fillStyle = e.color || "#e6edf3";
                ctx.font = `${Math.max(10, e.h * view.current.zoom)}px system-ui`;
                ctx.fillText(e.value, p.x, p.y);
            }
            else if (e.kind === "DIMLINEAR") {
                const a = e.p1, b = e.p2, off = e.off;
                const na = add(a, { x: 0, y: off }), nb = add(b, { x: 0, y: off });
                ctx.strokeStyle = "#ffd580";
                path(ctx, [a, na]);
                path(ctx, [b, nb]);
                path(ctx, [na, nb]);
                const mid = { x: (na.x + nb.x) / 2, y: (na.y + nb.y) / 2 };
                const mp = w2scr(mid);
                const t = e.text ?? `${dist(a, b).toFixed(2)}`;
                ctx.fillStyle = "#ffd580";
                ctx.font = `${Math.max(10, 2.5 * view.current.zoom)}px system-ui`;
                ctx.fillText(t, mp.x + 4, mp.y - 4);
            }
            else if (e.kind === "DIMRADIAL") {
                const p = e.p;
                ctx.strokeStyle = "#ffd580";
                path(ctx, [e.c, p]);
                const t = e.text ?? `${dist(e.c, p).toFixed(2)}`;
                const mp = w2scr(lerp(e.c, p, 0.6));
                ctx.fillStyle = "#ffd580";
                ctx.fillText(t, mp.x + 4, mp.y - 4);
            }
            else if (e.kind === "DIMANGULAR") {
                const a1 = sub(e.p1, e.c), a2 = sub(e.p2, e.c);
                const r = Math.max(10, Math.min(len(a1), len(a2)));
                const ang0 = Math.atan2(a1.y, a1.x), ang1 = Math.atan2(a2.y, a2.x);
                const C = w2scr(e.c);
                ctx.beginPath();
                ctx.strokeStyle = "#ffd580";
                ctx.arc(C.x, C.y, r * view.current.zoom, -ang0, -ang1, false);
                ctx.stroke();
                const t = e.text ?? `${Math.abs(deg(ang1 - ang0)).toFixed(1)}°`;
                const mp = w2scr(add(e.c, rot({ x: r * 0.7, y: 0 }, { c: Math.cos((ang0 + ang1) / 2), s: Math.sin((ang0 + ang1) / 2) })));
                ctx.fillStyle = "#ffd580";
                ctx.fillText(t, mp.x + 4, mp.y - 4);
            }
            else if (e.kind === "INSERT") {
                const blk = blocks.find(b => b.name === e.name);
                if (blk) {
                    const M = { c: Math.cos(e.rot + ucs.ang), s: Math.sin(e.rot + ucs.ang) };
                    for (const be of blk.ents) {
                        const map = (p) => add(e.p, rot(mul(sub(p, { x: 0, y: 0 }), e.scale), M));
                        const clone = structuredClone(be);
                        // apply transform on a shallow level
                        if (clone.kind === "LINE") {
                            clone.p1 = map(clone.p1);
                            clone.p2 = map(clone.p2);
                        }
                        else if (clone.kind === "LWPOLYLINE") {
                            clone.pts = clone.pts.map(map);
                        }
                        else if (clone.kind === "CIRCLE") {
                            clone.c = map(clone.c);
                            clone.r *= e.scale;
                        }
                        else if (clone.kind === "ARC") {
                            clone.c = map(clone.c);
                            clone.r *= e.scale;
                            clone.a0 += e.rot;
                            clone.a1 += e.rot;
                        }
                        else if (clone.kind === "TEXT") {
                            clone.p = map(clone.p);
                            clone.h *= e.scale;
                        }
                        else if (clone.kind === "POINT") {
                            clone.p = map(clone.p);
                        }
                        else if (clone.kind === "ELLIPSE") {
                            clone.c = map(clone.c);
                            clone.rx *= e.scale;
                            clone.ry *= e.scale;
                            clone.rot += e.rot;
                        }
                        else if (clone.kind === "SPLINE") {
                            clone.pts = clone.pts.map(map);
                        }
                        else if (clone.kind === "HATCH") {
                            clone.boundary = clone.boundary.map(map);
                        }
                        if (clone.kind !== "INSERT") { // avoid recursion
                            // draw transformed
                            draw({}); // noop to get ctx? we'll just draw via code duplication:
                            ctx.setLineDash([]);
                            ctx.strokeStyle = "#cde3ff";
                            ctx.fillStyle = "#cde3ff";
                            if (clone.kind === "LINE") {
                                path(ctx, [clone.p1, clone.p2]);
                            }
                            else if (clone.kind === "LWPOLYLINE") {
                                path(ctx, clone.closed ? clone.pts.concat([clone.pts[0]]) : clone.pts);
                            }
                            else if (clone.kind === "CIRCLE") {
                                circleDraw(ctx, clone.c, clone.r);
                            }
                            else if (clone.kind === "ARC") {
                                const CC = w2scr(clone.c);
                                ctx.beginPath();
                                ctx.arc(CC.x, CC.y, clone.r * view.current.zoom, -(clone.a1 + ucs.ang), -(clone.a0 + ucs.ang), true);
                                ctx.stroke();
                            }
                            else if (clone.kind === "TEXT") {
                                const p = w2scr(clone.p);
                                ctx.font = `${Math.max(10, clone.h * view.current.zoom)}px system-ui`;
                                ctx.fillText(clone.value, p.x, p.y);
                            }
                            else if (clone.kind === "POINT") {
                                const p = w2scr(clone.p);
                                ctx.beginPath();
                                ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                                ctx.fill();
                            }
                            else if (clone.kind === "ELLIPSE") {
                                ellipsePath(ctx, clone);
                            }
                            else if (clone.kind === "SPLINE") {
                                const pl = catmullRom(clone.pts, 8);
                                path(ctx, pl);
                            }
                            else if (clone.kind === "HATCH") {
                                if (clone.solid) {
                                    ctx.fillStyle = "rgba(255,255,255,0.15)";
                                    ctx.beginPath();
                                    const s = w2scr(clone.boundary[0]);
                                    ctx.moveTo(s.x, s.y);
                                    for (let i = 1; i < clone.boundary.length; i++) {
                                        const q = w2scr(clone.boundary[i]);
                                        ctx.lineTo(q.x, q.y);
                                    }
                                    ctx.closePath();
                                    ctx.fill();
                                }
                            }
                        }
                    }
                }
            }
        }
        // selection overlay
        if (selection.length) {
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = "#00d2ff";
            for (const id of selection) {
                const e = ents.find(x => x.id === id);
                if (!e)
                    continue;
                if (e.kind === "LINE") {
                    path(ctx, [e.p1, e.p2]);
                }
                else if (e.kind === "LWPOLYLINE") {
                    path(ctx, e.closed ? e.pts.concat([e.pts[0]]) : e.pts);
                }
                else if (e.kind === "CIRCLE") {
                    circleDraw(ctx, e.c, e.r);
                }
                else if (e.kind === "ARC") {
                    const C = w2scr(e.c);
                    ctx.beginPath();
                    ctx.arc(C.x, C.y, e.r * view.current.zoom, -(e.a1 + ucs.ang), -(e.a0 + ucs.ang), true);
                    ctx.stroke();
                }
            }
            ctx.setLineDash([]);
        }
        // preview
        if (preview) {
            ctx.strokeStyle = "#66ccff";
            ctx.setLineDash([5, 5]);
            if (preview.kind === "line" && preview.a && preview.b)
                path(ctx, [preview.a, preview.b]);
            if (preview.kind === "rect" && preview.a && preview.b) {
                const a = preview.a, b = preview.b;
                path(ctx, [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a]);
            }
            if (preview.kind === "circle" && preview.center && preview.r)
                circleDraw(ctx, preview.center, preview.r);
            if (preview.kind === "poly" && preview.poly)
                path(ctx, preview.poly);
            if (preview.kind === "zoomw" && preview.a && preview.b) {
                const A = w2scr(preview.a), B = w2scr(preview.b);
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = "#9aa6b2";
                ctx.strokeRect(Math.min(A.x, B.x), Math.min(A.y, B.y), Math.abs(B.x - A.x), Math.abs(B.y - A.y));
            }
            ctx.setLineDash([]);
        }
        // snap marker
        const s = nearestSnap(mouseW);
        if (s.kind !== "none") {
            const p = w2scr(s.pt);
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        // status
        ctx.fillStyle = "#9aa6b2";
        ctx.font = "12px system-ui";
        ctx.fillText(`Layer: ${curLayer} | Tool: ${tool} | OSNAP(F3): ${snapOn.endpoint ? "AN" : "AUS"} | ORTHO(F8): ${ortho ? "AN" : "AUS"} | Raster(F7): ${showGrid ? "AN" : "AUS"} | UCS: O(${ucs.origin.x.toFixed(2)},${ucs.origin.y.toFixed(2)}) A=${deg(ucs.ang).toFixed(1)}° | Maus: ${mouseW.x.toFixed(2)}, ${mouseW.y.toFixed(2)} | ${status}`, 8, rect.height - 8);
    }, [ents, selection, mouseW, curLayer, tool, status, showGrid, snapOn, ortho, ucs, blocks]);
    const redraw = useCallback((p) => draw(p), [draw]);
    useEffect(() => { redraw(); }, [redraw]);
    /* Picking */
    const pick = (w) => {
        const tol = 8;
        let best = null;
        const segDistPx = (a, b, p) => { const A = w2scr(a), B = w2scr(b), P = w2scr(p); const ABx = B.x - A.x, ABy = B.y - A.y, APx = P.x - A.x, APy = P.y - A.y; const t = Math.max(0, Math.min(1, (APx * ABx + APy * ABy) / (ABx * ABx + ABy * ABy))); const X = A.x + t * ABx, Y = A.y + t * ABy; return Math.hypot(P.x - X, P.y - Y); };
        const push = (e, d) => { if (d < tol && (!best || d < best.d))
            best = { e, d }; };
        for (const e of ents) {
            if (e.kind === "LINE")
                push(e, segDistPx(e.p1, e.p2, w));
            else if (e.kind === "LWPOLYLINE") {
                for (let i = 0; i < e.pts.length - (e.closed ? 0 : 1); i++)
                    push(e, segDistPx(e.pts[i], e.pts[(i + 1) % e.pts.length], w));
            }
            else if (e.kind === "CIRCLE")
                push(e, Math.abs(dist(w, e.c) - e.r) * view.current.zoom);
            else if (e.kind === "ARC")
                push(e, Math.abs(dist(w, e.c) - e.r) * view.current.zoom);
            else if (e.kind === "POINT")
                push(e, Math.hypot(w2scr(w).x - w2scr(e.p).x, w2scr(w).y - w2scr(e.p).y));
            else if (e.kind === "TEXT")
                push(e, Math.hypot(w2scr(w).x - w2scr(e.p).x, w2scr(w).y - w2scr(e.p).y));
            else if (e.kind === "ELLIPSE")
                push(e, Math.abs(dist(w, e.c) - Math.max(e.rx, e.ry)) * view.current.zoom);
            else if (e.kind === "SPLINE") {
                for (let i = 1; i < e.pts.length; i++)
                    push(e, segDistPx(e.pts[i - 1], e.pts[i], w));
            }
        }
        return best?.e ?? null;
    };
    /* DXF Import */
    const onImportDXF = async (file) => {
        const text = await file.text();
        // @ts-ignore
        const DxfParser = (await import("dxf-parser")).default || (await import("dxf-parser"));
        const parser = new DxfParser();
        const dxf = parser.parseSync(text);
        const add = [];
        const addLayer = (n) => { if (!layers.includes(n))
            setLayers(v => [...v, n]); };
        for (const en of dxf.entities ?? []) {
            const layer = en.layer || "0";
            addLayer(layer);
            if (en.type === "LINE")
                add.push({ id: uid(), kind: "LINE", p1: { x: en.startPoint.x, y: en.startPoint.y }, p2: { x: en.endPoint.x, y: en.endPoint.y }, layer });
            else if (en.type === "LWPOLYLINE" && en.vertices)
                add.push({ id: uid(), kind: "LWPOLYLINE", pts: en.vertices.map((v) => ({ x: v.x, y: v.y })), closed: !!en.shape, layer });
            else if (en.type === "CIRCLE")
                add.push({ id: uid(), kind: "CIRCLE", c: { x: en.center.x, y: en.center.y }, r: en.radius, layer });
            else if (en.type === "ARC")
                add.push({ id: uid(), kind: "ARC", c: { x: en.center.x, y: en.center.y }, r: en.radius, a0: en.startAngle, a1: en.endAngle, layer });
        }
        setEnts(prev => [...prev, ...add]);
        setStatus(`DXF importiert: ${add.length} Elemente`);
    };
    /* Actions */
    const pushEnt = (e) => setEnts(prev => [...prev, e]);
    const replaceEnts = (ids, transform) => {
        setEnts(prev => prev.map(e => ids.includes(e.id) ? transform(e) : e));
    };
    const removeEnts = (ids) => setEnts(prev => prev.filter(e => !ids.includes(e.id)));
    /* Mouse handlers */
    useEffect(() => {
        const c = canvasRef.current;
        let lastClick = 0;
        const onMove = (ev) => {
            const raw = scr2w_raw(ev.clientX, ev.clientY);
            setMouseW(raw);
            let w = raw;
            // apply snap
            const snap = nearestSnap(raw).pt;
            // apply ortho to preview endpoints
            if ((tool === "line" || tool === "rect" || tool === "circle" || tool === "arc" || tool === "ellipse") && start.current) {
                w = ortho ? applyOrtho(start.current, snap) : snap;
            }
            else if ((tool === "polyline" || tool === "spline") && polyPts.current.length) {
                w = ortho ? applyOrtho(polyPts.current[polyPts.current.length - 1], snap) : snap;
            }
            else {
                w = snap;
            }
            // pan drag
            if (tool === "pan" && panning.current && panStart.current) {
                const now = raw;
                view.current.pan.x += panStart.current.x - now.x;
                view.current.pan.y += panStart.current.y - now.y;
                panStart.current = now;
                redraw();
                return;
            }
            // previews
            if (tool === "line" && start.current) {
                redraw({ kind: "line", a: start.current, b: w });
                return;
            }
            if (tool === "rect" && start.current) {
                redraw({ kind: "rect", a: start.current, b: w });
                return;
            }
            if (tool === "circle" && start.current) {
                redraw({ kind: "circle", center: start.current, r: dist(start.current, w) });
                return;
            }
            if (tool === "polyline" && polyPts.current.length) {
                redraw({ kind: "poly", poly: [...polyPts.current, w] });
                return;
            }
            if (tool === "spline" && polyPts.current.length) {
                redraw({ kind: "poly", poly: catmullRom([...polyPts.current, w], 8) });
                return;
            }
            if (tool === "zoomw" && zoomSel.current?.a) {
                redraw({ kind: "zoomw", a: zoomSel.current.a, b: raw });
                return;
            }
            if (tool === "dimlinear" && (start.current)) {
                redraw({ kind: "line", a: start.current, b: w });
                return;
            }
            if (tool === "trim" || tool === "extend") { /* no-op preview */ }
            redraw();
        };
        const onDown = (ev) => {
            const now = Date.now();
            const dbl = now - lastClick < 300;
            lastClick = now;
            const raw = scr2w_raw(ev.clientX, ev.clientY);
            if (tool === "pan") {
                panning.current = true;
                panStart.current = raw;
                return;
            }
            if (tool === "zoomw") {
                if (!zoomSel.current)
                    zoomSel.current = { a: raw };
                else
                    zoomSel.current.b = raw;
                return;
            }
            const w = nearestSnap(raw).pt;
            if (tool === "select") {
                const hit = pick(w);
                setSelection(hit ? [hit.id] : []);
                setStatus(hit ? `Ausgewählt: ${hit.kind}` : "Nichts ausgewählt");
                redraw();
                return;
            }
            if (tool === "erase") {
                const hit = pick(w);
                if (hit) {
                    removeEnts([hit.id]);
                }
                redraw();
                return;
            }
            if (tool === "move") {
                if (!opBase.current) {
                    opBase.current = w;
                    setStatus("Zielpunkt wählen…");
                    return;
                }
                const delta = sub(w, opBase.current);
                replaceEnts(selection, (e) => {
                    const tr = (p) => add(p, delta);
                    const clone = { ...e };
                    if (e.kind === "LINE") {
                        clone.p1 = tr(e.p1);
                        clone.p2 = tr(e.p2);
                    }
                    else if (e.kind === "LWPOLYLINE") {
                        clone.pts = e.pts.map(tr);
                    }
                    else if (e.kind === "CIRCLE") {
                        clone.c = tr(e.c);
                    }
                    else if (e.kind === "ARC") {
                        clone.c = tr(e.c);
                    }
                    else if (e.kind === "TEXT") {
                        clone.p = tr(e.p);
                    }
                    else if (e.kind === "POINT") {
                        clone.p = tr(e.p);
                    }
                    else if (e.kind === "ELLIPSE") {
                        clone.c = tr(e.c);
                    }
                    else if (e.kind === "SPLINE") {
                        clone.pts = e.pts.map(tr);
                    }
                    else if (e.kind === "HATCH") {
                        clone.boundary = e.boundary.map(tr);
                    }
                    return clone;
                });
                opBase.current = null;
                setStatus("Bereit");
                redraw();
                return;
            }
            if (tool === "rotate") {
                if (!opBase.current) {
                    opBase.current = w;
                    setStatus("Winkel wählen…");
                    return;
                }
                if (!start.current) {
                    start.current = w;
                    setStatus("Endwinkel…");
                    return;
                }
                const a0 = Math.atan2(start.current.y - opBase.current.y, start.current.x - opBase.current.x);
                const a1 = Math.atan2(w.y - opBase.current.y, w.x - opBase.current.x);
                const da = a1 - a0;
                replaceEnts(selection, (e) => {
                    const R = (p) => add(opBase.current, rot(sub(p, opBase.current), { c: Math.cos(da), s: Math.sin(da) }));
                    const clone = { ...e };
                    if (e.kind === "LINE") {
                        clone.p1 = R(e.p1);
                        clone.p2 = R(e.p2);
                    }
                    else if (e.kind === "LWPOLYLINE") {
                        clone.pts = e.pts.map(R);
                    }
                    else if (e.kind === "CIRCLE") {
                        clone.c = R(e.c);
                    }
                    else if (e.kind === "ARC") {
                        clone.c = R(e.c);
                        clone.a0 += da;
                        clone.a1 += da;
                    }
                    else if (e.kind === "TEXT") {
                        clone.p = R(e.p);
                    }
                    else if (e.kind === "POINT") {
                        clone.p = R(e.p);
                    }
                    else if (e.kind === "ELLIPSE") {
                        clone.c = R(e.c);
                        clone.rot += da;
                    }
                    else if (e.kind === "SPLINE") {
                        clone.pts = e.pts.map(R);
                    }
                    else if (e.kind === "HATCH") {
                        clone.boundary = e.boundary.map(R);
                    }
                    return clone;
                });
                start.current = null;
                opBase.current = null;
                setStatus("Bereit");
                redraw();
                return;
            }
            if (tool === "mirror") {
                if (!opBase.current) {
                    opBase.current = w;
                    setStatus("Zweites Spiegel-Punkt…");
                    return;
                }
                const p0 = opBase.current;
                const p1 = w;
                const v = norm(sub(p1, p0));
                const n = { x: -v.y, y: v.x };
                replaceEnts(selection, (e) => {
                    const M = (p) => { const r = sub(p, p0); const rv = dot(r, v), rn = dot(r, n); const r2 = { x: rv * v.x - rn * n.x, y: rv * v.y - rn * n.y }; return add(p0, r2); };
                    const clone = { ...e };
                    if (e.kind === "LINE") {
                        clone.p1 = M(e.p1);
                        clone.p2 = M(e.p2);
                    }
                    else if (e.kind === "LWPOLYLINE") {
                        clone.pts = e.pts.map(M);
                    }
                    else if (e.kind === "CIRCLE") {
                        clone.c = M(e.c);
                    }
                    else if (e.kind === "ARC") {
                        clone.c = M(e.c);
                        clone.a0 = -e.a0;
                        clone.a1 = -e.a1;
                    }
                    else if (e.kind === "TEXT") {
                        clone.p = M(e.p);
                    }
                    else if (e.kind === "POINT") {
                        clone.p = M(e.p);
                    }
                    else if (e.kind === "ELLIPSE") {
                        clone.c = M(e.c);
                        clone.rot = -e.rot;
                    }
                    else if (e.kind === "SPLINE") {
                        clone.pts = e.pts.map(M);
                    }
                    else if (e.kind === "HATCH") {
                        clone.boundary = e.boundary.map(M);
                    }
                    return clone;
                });
                opBase.current = null;
                setStatus("Bereit");
                redraw();
                return;
            }
            if (tool === "scale") {
                if (!opBase.current) {
                    opBase.current = w;
                    setStatus("Faktor wählen…");
                    return;
                }
                if (!start.current) {
                    start.current = w;
                    setStatus("Zweiten Punkt (Referenz)…");
                    return;
                }
                const d0 = dist(opBase.current, start.current) || 1;
                const d1 = dist(opBase.current, w) || 1;
                const f = d1 / d0;
                replaceEnts(selection, (e) => {
                    const S = (p) => add(opBase.current, mul(sub(p, opBase.current), f));
                    const clone = { ...e };
                    if (e.kind === "LINE") {
                        clone.p1 = S(e.p1);
                        clone.p2 = S(e.p2);
                    }
                    else if (e.kind === "LWPOLYLINE") {
                        clone.pts = e.pts.map(S);
                    }
                    else if (e.kind === "CIRCLE") {
                        clone.c = S(e.c);
                        clone.r *= f;
                    }
                    else if (e.kind === "ARC") {
                        clone.c = S(e.c);
                        clone.r *= f;
                    }
                    else if (e.kind === "TEXT") {
                        clone.p = S(e.p);
                        clone.h *= f;
                    }
                    else if (e.kind === "POINT") {
                        clone.p = S(e.p);
                    }
                    else if (e.kind === "ELLIPSE") {
                        clone.c = S(e.c);
                        clone.rx *= f;
                        clone.ry *= f;
                    }
                    else if (e.kind === "SPLINE") {
                        clone.pts = e.pts.map(S);
                    }
                    else if (e.kind === "HATCH") {
                        clone.boundary = e.boundary.map(S);
                    }
                    return clone;
                });
                start.current = null;
                opBase.current = null;
                setStatus("Bereit");
                redraw();
                return;
            }
            if (tool === "explode") {
                const hit = pick(w);
                if (hit) {
                    if (hit.kind === "LWPOLYLINE") {
                        const segs = [];
                        for (let i = 1; i < hit.pts.length; i++)
                            segs.push({ id: uid(), kind: "LINE", p1: hit.pts[i - 1], p2: hit.pts[i], layer: hit.layer });
                        if (hit.closed)
                            segs.push({ id: uid(), kind: "LINE", p1: hit.pts[hit.pts.length - 1], p2: hit.pts[0], layer: hit.layer });
                        setEnts(prev => prev.filter(e => e.id !== hit.id).concat(segs));
                    }
                    // INSERT explode could be implemented by inlining block ents (omitted for brevity)
                }
                redraw();
                return;
            }
            if (tool === "offset") {
                const hit = pick(w);
                if (hit) {
                    const d = parseFloat(prompt("Offset-Abstand:", "1") || "0") || 0;
                    if (hit.kind === "LINE") {
                        const v = norm(sub(hit.p2, hit.p1));
                        const n = { x: -v.y, y: v.x };
                        const o = mul(n, d);
                        pushEnt({ id: uid(), kind: "LINE", p1: add(hit.p1, o), p2: add(hit.p2, o), layer: hit.layer });
                    }
                    else if (hit.kind === "LWPOLYLINE") {
                        const npts = hit.pts.map((p, i, arr) => add(p, { x: 0, y: d })); // simplified placeholder: shift in UCS Y
                        pushEnt({ id: uid(), kind: "LWPOLYLINE", pts: npts, closed: hit.closed, layer: hit.layer });
                    }
                }
                redraw();
                return;
            }
            if (tool === "trim" || tool === "extend") {
                // simple line-line trim/extend
                const hit = pick(w);
                if (hit && hit.kind === "LINE") {
                    const other = ents.find(e => e.id !== hit.id && e.kind === "LINE");
                    if (other) {
                        const P = segInt(hit.p1, hit.p2, other.p1, other.p2);
                        if (P) {
                            if (tool === "trim") {
                                // trim the nearest endpoint to cursor
                                if (dist(w, hit.p1) < dist(w, hit.p2))
                                    hit.p1 = P;
                                else
                                    hit.p2 = P;
                                setEnts(prev => prev.map(e => e.id === hit.id ? { ...hit } : e));
                            }
                            else {
                                // extend is same but choose farther endpoint
                                if (dist(w, hit.p1) > dist(w, hit.p2))
                                    hit.p1 = P;
                                else
                                    hit.p2 = P;
                                setEnts(prev => prev.map(e => e.id === hit.id ? { ...hit } : e));
                            }
                        }
                    }
                }
                redraw();
                return;
            }
            if (tool === "text") {
                const v = prompt("Text eingeben:", "Text") || "";
                if (v) {
                    pushEnt({ id: uid(), kind: "TEXT", p: w, value: v, h: 2.5, layer: curLayer });
                    redraw();
                }
                return;
            }
            if (tool === "point") {
                pushEnt({ id: uid(), kind: "POINT", p: w, layer: curLayer });
                redraw();
                return;
            }
            if (tool === "hatch") {
                if (polyPts.current.length >= 2 && dbl) {
                    pushEnt({ id: uid(), kind: "HATCH", boundary: [...polyPts.current], solid: true, layer: curLayer });
                    polyPts.current = [];
                    setStatus("Bereit");
                    redraw();
                    return;
                }
                polyPts.current.push(w);
                setStatus("Grenzpunkte klicken (Doppelklick beenden)…");
                redraw();
                return;
            }
            if (tool === "dimlinear") {
                if (!start.current) {
                    start.current = w;
                    setStatus("Zweiten Punkt wählen…");
                    return;
                }
                pushEnt({ id: uid(), kind: "DIMLINEAR", p1: start.current, p2: w, off: (w.y - start.current.y) / 2, layer: curLayer });
                start.current = null;
                setStatus("Bereit");
                redraw();
                return;
            }
            if (tool === "dimradial") {
                pushEnt({ id: uid(), kind: "DIMRADIAL", c: w, p: add(w, { x: 5, y: 0 }), layer: curLayer });
                redraw();
                return;
            }
            if (tool === "dimangular") {
                if (!start.current) {
                    start.current = w;
                    setStatus("Zweiten Punkt wählen…");
                    return;
                }
                pushEnt({ id: uid(), kind: "DIMANGULAR", c: w, p1: start.current, p2: add(w, { x: 10, y: 0 }), layer: curLayer });
                start.current = null;
                redraw();
                return;
            }
            if (tool === "ellipse") {
                if (!start.current) {
                    start.current = w;
                    setStatus("Zweiten Punkt (Rx)…");
                    return;
                }
                if (!nextPt.current) {
                    nextPt.current = w;
                    setStatus("Dritten Punkt (Ry)…");
                    return;
                }
                const rx = dist(start.current, w);
                const ry = dist(start.current, nextPt.current || w);
                pushEnt({ id: uid(), kind: "ELLIPSE", c: start.current, rx, ry, rot: 0, layer: curLayer });
                start.current = null;
                nextPt.current = null;
                setStatus("Bereit");
                redraw();
                return;
            }
            if (tool === "spline") {
                if (dbl && polyPts.current.length >= 2) {
                    pushEnt({ id: uid(), kind: "SPLINE", pts: [...polyPts.current], layer: curLayer });
                    polyPts.current = [];
                    setStatus("Bereit");
                    redraw();
                    return;
                }
                polyPts.current.push(w);
                setStatus("Punkte hinzufügen (Doppelklick zum Beenden)…");
                redraw();
                return;
            }
            if (tool === "blockInsert") {
                const name = prompt("Blockname:", "_STD_BLOCK") || "_STD_BLOCK";
                pushEnt({ id: uid(), kind: "INSERT", name, p: w, scale: 1, rot: 0, layer: curLayer });
                redraw();
                return;
            }
            // Two-point primitives
            if (!start.current) {
                start.current = w;
                setStatus("Zweiten Punkt wählen…");
                redraw();
                return;
            }
            const a = start.current, b = w;
            if (tool === "line")
                pushEnt({ id: uid(), kind: "LINE", p1: a, p2: b, layer: curLayer });
            if (tool === "rect")
                pushEnt({ id: uid(), kind: "LWPOLYLINE", pts: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], closed: true, layer: curLayer });
            if (tool === "circle")
                pushEnt({ id: uid(), kind: "CIRCLE", c: a, r: dist(a, b), layer: curLayer });
            if (tool === "arc") {
                const ang0 = Math.atan2(a.y - b.y, a.x - b.x);
                const ang1 = ang0 + Math.PI / 2;
                pushEnt({ id: uid(), kind: "ARC", c: a, r: dist(a, b), a0: 0, a1: Math.PI / 2, layer: curLayer });
            } // simple quarter arc
            start.current = null;
            setStatus("Bereit");
            redraw();
        };
        const onUp = () => {
            if (tool === "pan") {
                panning.current = false;
                panStart.current = null;
            }
            if (tool === "zoomw" && zoomSel.current?.a && zoomSel.current?.b) {
                const a = zoomSel.current.a, b = zoomSel.current.b;
                setZoomStack(prev => [...prev, { zoom: view.current.zoom, pan: { ...view.current.pan } }]);
                const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
                const { rect } = getCtx();
                const zw = rect.width / (Math.abs(b.x - a.x));
                const zh = rect.height / (Math.abs(b.y - a.y));
                view.current.zoom = Math.min(zw, zh);
                view.current.pan.x = cx - rect.width / (2 * view.current.zoom);
                view.current.pan.y = cy - rect.height / (2 * view.current.zoom);
                zoomSel.current = null;
                redraw();
            }
        };
        const onWheel = (ev) => {
            const factor = ev.deltaY > 0 ? 0.9 : 1.1;
            const mw = scr2w_raw(ev.clientX, ev.clientY);
            setZoomStack(prev => [...prev, { zoom: view.current.zoom, pan: { ...view.current.pan } }]);
            view.current.pan.x = mw.x - (mw.x - view.current.pan.x) * factor;
            view.current.pan.y = mw.y - (mw.y - view.current.pan.y) * factor;
            view.current.zoom *= factor;
            redraw();
        };
        c.addEventListener("mousemove", onMove);
        c.addEventListener("mousedown", onDown);
        window.addEventListener("mouseup", onUp);
        c.addEventListener("wheel", onWheel, { passive: false });
        return () => { c.removeEventListener("mousemove", onMove); c.removeEventListener("mousedown", onDown); window.removeEventListener("mouseup", onUp); c.removeEventListener("wheel", onWheel); };
    }, [tool, curLayer, showGrid, ortho, ucs, selection, draw, redraw]);
    /* Keyboard */
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "F3") {
                e.preventDefault();
                setSnapOn(s => ({ endpoint: !s.endpoint, midpoint: !s.midpoint, intersection: !s.intersection, center: !s.center }));
                setStatus("Fangen (F3) umgeschaltet");
                redraw();
            }
            if (e.key === "F7") {
                e.preventDefault();
                setShowGrid(g => !g);
                setStatus("Raster (F7) umgeschaltet");
                redraw();
            }
            if (e.key === "F8") {
                e.preventDefault();
                setOrtho(o => !o);
                setStatus("ORTHO (F8) umgeschaltet");
                redraw();
            }
            if (e.key === "Escape") {
                start.current = null;
                polyPts.current = [];
                opBase.current = null;
                setStatus("Abgebrochen");
                redraw();
            }
            if ((e.key === "Delete" || e.key === "Backspace") && selection.length) {
                setEnts(prev => prev.filter(x => !selection.includes(x.id)));
                setSelection([]);
                redraw();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
                if (selection.length) {
                    setClipboard(ents.filter(e => selection.includes(e.id)).map(e => ({ ...e, id: uid() })));
                    setStatus("Kopiert");
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
                if (selection.length) {
                    setClipboard(ents.filter(e => selection.includes(e.id)).map(e => ({ ...e, id: uid() })));
                    removeEnts(selection);
                    setSelection([]);
                    setStatus("Ausgeschnitten");
                    redraw();
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
                if (clipboard) {
                    const off = { x: 1, y: 1 };
                    setEnts(prev => [...prev, ...clipboard.map(e => { const c = { ...e, id: uid() }; if ("p1" in c)
                            c.p1 = add(c.p1, off); if ("p2" in c)
                            c.p2 = add(c.p2, off); if ("c" in c)
                            c.c = add(c.c, off); if ("p" in c)
                            c.p = add(c.p, off); if ("pts" in c)
                            c.pts = c.pts.map((p) => add(p, off)); if ("boundary" in c)
                            c.boundary = c.boundary.map((p) => add(p, off)); return c; })]);
                    setStatus("Eingefügt");
                    redraw();
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                const prev = zoomStack[zoomStack.length - 1];
                if (prev) {
                    view.current.zoom = prev.zoom;
                    view.current.pan = { ...prev.pan };
                    setZoomStack(s => s.slice(0, -1));
                    redraw();
                }
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selection, clipboard, zoomStack, redraw, ents]);
    /* UI helpers */
    const Btn = ({ title, icon, onClick, active, disabled }) => (_jsx("button", { title: title, onClick: onClick, disabled: disabled, style: { width: 28, height: 28, margin: 2, borderRadius: 4, border: active ? "1px solid #4dabf7" : "1px solid #2b3036",
            background: disabled ? "#0f0f12" : active ? "#1c2733" : "#151a20", display: "grid", placeItems: "center", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1 }, children: _jsx("svg", { viewBox: "0 0 16 16", width: "16", height: "16", stroke: "#e6edf3", fill: "none", strokeWidth: "1.5", children: icon }) }));
    // Minimal icons
    const I = {
        file: _jsx("path", { d: "M3 2 H11 L13 4 V14 H3 Z M11 2 V4 H13" }),
        open: _jsx("path", { d: "M2 6 H14 V14 H2 Z M3 3 H9 L11 6" }),
        save: _jsx("path", { d: "M3 3 H13 V13 H3 Z M5 3 V7 H11 V3" }),
        undo: _jsx("path", { d: "M3 8 H9 A4 4 0 1 1 5 12 M3 8 L5 6" }),
        redo: _jsx("path", { d: "M13 8 H7 A4 4 0 1 0 11 12 M13 8 L11 6" }),
        cut: _jsx("path", { d: "M2 4 L14 12 M6 10 A2 2 0 1 0 6 14 M10 6 A2 2 0 1 0 10 2" }),
        copy: _jsx("path", { d: "M5 5 H13 V13 H5 Z M3 3 H9 V9 H3 Z" }),
        paste: _jsx("path", { d: "M4 2 H8 V4 H12 V14 H4 Z" }),
        select: _jsx("path", { d: "M3 3 L11 13 L9 8 L14 7 Z" }),
        line: _jsx("path", { d: "M2 14 L14 2" }),
        poly: _jsx("path", { d: "M2 12 L5 4 L11 5 L14 12 Z", fill: "none" }),
        rect: _jsx("rect", { x: "3", y: "3", width: "10", height: "10", fill: "none" }),
        circle: _jsx("circle", { cx: "8", cy: "8", r: "5", fill: "none" }),
        arc: _jsx("path", { d: "M3 12 A6 6 0 0 1 13 4", fill: "none" }),
        ellipse: _jsx("ellipse", { cx: "8", cy: "8", rx: "5", ry: "3", fill: "none" }),
        spline: _jsx("path", { d: "M2 12 C6 2, 10 14, 14 4", fill: "none" }),
        point: _jsx("circle", { cx: "8", cy: "8", r: "2" }),
        hatch: _jsx("path", { d: "M3 13 L13 13 L13 3 Z", fill: "none" }),
        text: _jsx("path", { d: "M4 3 H12 M8 3 V13" }),
        dim: _jsx("path", { d: "M2 12 H14 M2 4 L6 12 M14 4 L10 12" }),
        dimrad: _jsx("path", { d: "M8 8 L14 8 M8 8 A6 6 0 0 1 14 8", fill: "none" }),
        dimang: _jsx("path", { d: "M8 8 A5 5 0 0 1 14 8", fill: "none" }),
        block: _jsx("path", { d: "M3 3 H13 V13 H3 Z M6 6 H10 V10 H6 Z" }),
        explode: _jsx("path", { d: "M3 8 H13 M8 3 V13" }),
        mirror: _jsx("path", { d: "M8 2 V14 M3 5 L13 11" }),
        rotate: _jsx("path", { d: "M8 3 A5 5 0 1 0 12 7 M12 7 L14 7" }),
        move: _jsx("path", { d: "M8 1 L10 3 L9 3 L9 7 L13 7 L13 6 L15 8 L13 10 L13 9 L9 9 L9 13 L10 13 L8 15 L6 13 L7 13 L7 9 L3 9 L3 10 L1 8 L3 6 L3 7 L7 7 L7 3 L6 3 Z" }),
        scale: _jsx("path", { d: "M3 13 L13 3 M3 3 H7 V7 H3 Z M9 9 H13 V13 H9 Z" }),
        offset: _jsx("path", { d: "M2 14 L14 2 M5 15 L15 5" }),
        trim: _jsx("path", { d: "M2 8 H10 M8 6 V12" }),
        extend: _jsx("path", { d: "M2 8 H14 M10 4 V12" }),
        erase: _jsx("path", { d: "M3 11 L8 6 L13 11 L10 14 L5 14 Z M10 5 L14 1", fill: "none" }),
        pan: _jsx("circle", { cx: "8", cy: "8", r: "2" }),
        zoomw: _jsx("path", { d: "M3 3 H10 V10 H3 Z M11 11 L15 15", fill: "none" }),
        zoomext: _jsx("path", { d: "M2 2 H14 V14 H2 Z M4 4 L12 4 L12 12 L4 12 Z", fill: "none" }),
        zoomprev: _jsx("path", { d: "M3 8 H7 M5 6 L3 8 L5 10" }),
        layer: _jsx("path", { d: "M3 6 L8 3 L13 6 L8 9 Z M3 9 L8 12 L13 9", fill: "none" }),
        props: _jsx("path", { d: "M3 4 H13 V6 H3 Z M3 8 H10 V10 H3 Z M3 12 H7 V14 H3 Z" }),
        import: _jsx("path", { d: "M3 12 H13 V14 H3 Z M8 2 V10 M5 7 L8 10 L11 7" }),
        export: _jsx("path", { d: "M3 12 H13 V14 H3 Z M8 10 V2 M5 5 L8 2 L11 5" }),
        ortho: _jsx("path", { d: "M2 8 H14 M8 2 V14" }),
        snap: _jsx("path", { d: "M2 8 L8 2 L14 8 L8 14 Z", fill: "none" }),
        grid: _jsx("path", { d: "M2 2 H14 M2 5 H14 M2 8 H14 M2 11 H14 M2 14 H14 M2 2 V14 M5 2 V14 M8 2 V14 M11 2 V14 M14 2 V14", opacity: ".7" }),
        ucs: _jsx("path", { d: "M3 13 L8 13 L8 3" }),
        view3d: _jsx("path", { d: "M3 12 L8 4 L13 12 Z", fill: "none" }),
        layout: _jsx("path", { d: "M2 4 H14 V12 H2 Z M4 6 H8 V10 H4 Z" }),
        cmd: _jsx("path", { d: "M3 6 L7 10 M7 6 L3 10 M9 6 H13" }),
    };
    // File ops (JSON)
    const saveJSON = () => {
        const data = { ents, layers, blocks, ucs };
        const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "drawing.json";
        a.click();
        URL.revokeObjectURL(url);
    };
    const openJSON = (f) => {
        f.text().then(t => {
            try {
                const obj = JSON.parse(t);
                setEnts(obj.ents || []);
                setLayers(obj.layers || ["0"]);
                setBlocks(obj.blocks || []);
                setUcs(obj.ucs || { origin: { x: 0, y: 0 }, ang: 0 });
                setStatus("Geöffnet");
            }
            catch {
                alert("Ungültige Datei");
            }
        });
    };
    // Layout
    return (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "42px 1fr 320px", gridTemplateRows: "34px 1fr 26px", height: "100%", background: "#0f1317", color: "#e6edf3", fontFamily: "system-ui" }, children: [_jsxs("div", { style: { gridColumn: "1 / span 3", display: "flex", alignItems: "center", borderBottom: "1px solid #222b33", padding: "4px 8px", gap: 6 }, children: [_jsx(Btn, { title: "Neu", icon: I.file, onClick: () => { setEnts([]); setStatus("Neu"); } }), _jsxs("label", { title: "\u00D6ffnen (JSON)", children: [_jsx("svg", { viewBox: "0 0 16 16", width: "16", height: "16", stroke: "#e6edf3", fill: "none", strokeWidth: "1.5", style: { margin: "4px 6px 0 6px" }, children: I.open }), _jsx("input", { type: "file", accept: ".json", style: { display: "none" }, onChange: e => { const f = e.target.files?.[0]; if (f)
                                    openJSON(f); } })] }), _jsx(Btn, { title: "Speichern (JSON)", icon: I.save, onClick: saveJSON }), _jsx(Btn, { title: "R\u00FCckg\u00E4ngig (Ansicht)", icon: I.undo, onClick: () => { const prev = zoomStack[zoomStack.length - 1]; if (prev) {
                            view.current.zoom = prev.zoom;
                            view.current.pan = { ...prev.pan };
                            setZoomStack(s => s.slice(0, -1));
                            redraw();
                        } } }), _jsx(Btn, { title: "Wiederherstellen (N/V)", icon: I.redo, onClick: () => { } }), _jsx(Btn, { title: "Ausschneiden", icon: I.cut, onClick: () => { if (selection.length) {
                            setClipboard(ents.filter(e => selection.includes(e.id)));
                            removeEnts(selection);
                            setSelection([]);
                            setStatus("Ausgeschnitten");
                            redraw();
                        } } }), _jsx(Btn, { title: "Kopieren", icon: I.copy, onClick: () => { if (selection.length) {
                            setClipboard(ents.filter(e => selection.includes(e.id)));
                            setStatus("Kopiert");
                        } } }), _jsx(Btn, { title: "Einf\u00FCgen", icon: I.paste, onClick: () => { if (clipboard) {
                            setEnts(prev => [...prev, ...clipboard.map(e => ({ ...e, id: uid() }))]);
                            setStatus("Eingefügt");
                            redraw();
                        } } }), _jsx("span", { style: { width: 10 } }), _jsx("svg", { viewBox: "0 0 16 16", width: "16", height: "16", stroke: "#9aa6b2", fill: "none", strokeWidth: "1.5", children: I.layer }), _jsx("select", { value: curLayer, onChange: e => setCurLayer(e.target.value), style: { background: "#151a20", color: "#e6edf3", border: "1px solid #2b3036", borderRadius: 4, padding: "2px 6px" }, children: layers.map(l => _jsx("option", { value: l, children: l }, l)) }), _jsx("button", { onClick: () => { const n = prompt("Neuer Layer-Name:", "A"); if (n) {
                            if (!layers.includes(n))
                                setLayers(v => [...v, n]);
                            setCurLayer(n);
                        } }, style: { background: "#151a20", color: "#e6edf3", border: "1px solid #2b3036", borderRadius: 4, padding: "2px 6px" }, children: "Layer +" }), _jsx(Btn, { title: "Linienfarbe/Linienst\u00E4rke (vom Layer)", icon: I.props, onClick: () => alert("Eigenschaftssteuerung pro Layer (Placeholder)") }), _jsx(Btn, { title: "Bema\u00DFungs-/Beschriftungsstil", icon: I.dim, onClick: () => alert("Stile nicht implementiert (Placeholder)") }), _jsx(Btn, { title: "Bl\u00F6cke/XRefs einf\u00FCgen", icon: I.block, onClick: () => setTool("blockInsert"), active: tool === "blockInsert" }), _jsx(Btn, { title: "Orthomodus (F8)", icon: I.ortho, onClick: () => setOrtho(o => !o), active: ortho }), _jsx(Btn, { title: "Fangen (F3)", icon: I.snap, onClick: () => setSnapOn(s => ({ endpoint: !s.endpoint, midpoint: !s.midpoint, intersection: !s.intersection, center: !s.center })) }), _jsx(Btn, { title: "Rasteranzeige (F7)", icon: I.grid, onClick: () => setShowGrid(g => !g), active: showGrid }), _jsx(Btn, { title: "3D-Ansicht / Drahtmodell", icon: I.view3d, onClick: () => alert("Nur 2D in diesem Editor") }), _jsxs("label", { title: "Import / Export", children: [_jsx("svg", { viewBox: "0 0 16 16", width: "16", height: "16", stroke: "#e6edf3", fill: "none", strokeWidth: "1.5", style: { margin: "4px 6px 0 6px" }, children: I.import }), _jsx("input", { type: "file", accept: ".dxf", style: { display: "none" }, onChange: e => { const f = e.target.files?.[0]; if (f)
                                    onImportDXF(f); } })] }), _jsx(Btn, { title: "Export (PDF/DWG - Platzhalter)", icon: I.export, onClick: () => alert("Export PDF/DWG nicht enthalten. DXF-Import ist vorhanden.") }), _jsx(Btn, { title: "Layouts (Modell/A4/A3)", icon: I.layout, onClick: () => alert("Layouts UI Placeholder") }), _jsx(Btn, { title: "Befehlszeile/Koordinaten", icon: I.cmd, onClick: () => alert("Befehlszeile nicht implementiert") })] }), _jsxs("div", { style: { gridRow: "2 / span 1", borderRight: "1px solid #222b33", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 6, overflow: "auto" }, children: [_jsx(Btn, { title: "Linie \u2013 Linie zeichnen", icon: I.line, onClick: () => setTool("line"), active: tool === "line" }), _jsx(Btn, { title: "Polylinie \u2013 Polylinie erstellen", icon: I.poly, onClick: () => setTool("polyline"), active: tool === "polyline" }), _jsx(Btn, { title: "Kreis \u2013 Kreis mit Mittelpunkt und Radius", icon: I.circle, onClick: () => setTool("circle"), active: tool === "circle" }), _jsx(Btn, { title: "Bogen \u2013 Bogen zeichnen", icon: I.arc, onClick: () => setTool("arc"), active: tool === "arc" }), _jsx(Btn, { title: "Ellipse / Kreisabschnitt", icon: I.ellipse, onClick: () => setTool("ellipse"), active: tool === "ellipse" }), _jsx(Btn, { title: "Rechteck \u2013 Rechteck erstellen", icon: I.rect, onClick: () => setTool("rect"), active: tool === "rect" }), _jsx(Btn, { title: "Spline / Freihandkurve", icon: I.spline, onClick: () => setTool("spline"), active: tool === "spline" }), _jsx(Btn, { title: "Punkt setzen \u2013 Punktobjekt", icon: I.point, onClick: () => setTool("point"), active: tool === "point" }), _jsx(Btn, { title: "Schraffur (Hatch) \u2013 Fl\u00E4che schraffieren", icon: I.hatch, onClick: () => setTool("hatch"), active: tool === "hatch" }), _jsx(Btn, { title: "Text / MText \u2013 Text einf\u00FCgen", icon: I.text, onClick: () => setTool("text"), active: tool === "text" }), _jsx(Btn, { title: "Bema\u00DFung linear", icon: I.dim, onClick: () => setTool("dimlinear"), active: tool === "dimlinear" }), _jsx(Btn, { title: "Bema\u00DFung radial", icon: I.dimrad, onClick: () => setTool("dimradial"), active: tool === "dimradial" }), _jsx(Btn, { title: "Bema\u00DFung Winkel", icon: I.dimang, onClick: () => setTool("dimangular"), active: tool === "dimangular" }), _jsx(Btn, { title: "Block einf\u00FCgen \u2013 Blockreferenz", icon: I.block, onClick: () => setTool("blockInsert"), active: tool === "blockInsert" }), _jsx(Btn, { title: "Explodieren \u2013 Block/Polylinie aufl\u00F6sen", icon: I.explode, onClick: () => setTool("explode"), active: tool === "explode" }), _jsx(Btn, { title: "Spiegeln \u2013 Objekt spiegeln", icon: I.mirror, onClick: () => setTool("mirror"), active: tool === "mirror" }), _jsx(Btn, { title: "Drehen \u2013 Objekt drehen", icon: I.rotate, onClick: () => setTool("rotate"), active: tool === "rotate" }), _jsx(Btn, { title: "Verschieben \u2013 Objekt verschieben", icon: I.move, onClick: () => setTool("move"), active: tool === "move" }), _jsx(Btn, { title: "Skalieren \u2013 Objekt skalieren", icon: I.scale, onClick: () => setTool("scale"), active: tool === "scale" }), _jsx(Btn, { title: "Trimmen", icon: I.trim, onClick: () => setTool("trim"), active: tool === "trim" }), _jsx(Btn, { title: "Erweitern", icon: I.extend, onClick: () => setTool("extend"), active: tool === "extend" }), _jsx(Btn, { title: "Offset \u2013 Parallele Linie erstellen", icon: I.offset, onClick: () => setTool("offset"), active: tool === "offset" }), _jsx(Btn, { title: "L\u00F6schen \u2013 Objekt l\u00F6schen", icon: I.erase, onClick: () => setTool("erase"), active: tool === "erase" }), _jsx(Btn, { title: "Pan (Hand) \u2013 Ansicht verschieben", icon: I.pan, onClick: () => setTool("pan"), active: tool === "pan" }), _jsx(Btn, { title: "Zoom Fenster", icon: I.zoomw, onClick: () => { setTool("zoomw"); zoomSel.current = null; }, active: tool === "zoomw" }), _jsx(Btn, { title: "Zoom Gesamt (Extents)", icon: I.zoomext, onClick: () => {
                            if (ents.length === 0) {
                                return;
                            }
                            setZoomStack(prev => [...prev, { zoom: view.current.zoom, pan: { ...view.current.pan } }]);
                            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                            const addPt = (p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); };
                            for (const e of ents) {
                                if (e.kind === "LINE") {
                                    addPt(e.p1);
                                    addPt(e.p2);
                                }
                                if (e.kind === "LWPOLYLINE") {
                                    e.pts.forEach(addPt);
                                }
                                if (e.kind === "CIRCLE") {
                                    addPt({ x: e.c.x - e.r, y: e.c.y - e.r });
                                    addPt({ x: e.c.x + e.r, y: e.c.y + e.r });
                                }
                            }
                            const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
                            const { rect } = getCtx();
                            const zw = rect.width / (Math.max(1, maxX - minX));
                            const zh = rect.height / (Math.max(1, maxY - minY));
                            view.current.zoom = Math.min(zw, zh) * 0.9;
                            view.current.pan.x = cx - rect.width / (2 * view.current.zoom);
                            view.current.pan.y = cy - rect.height / (2 * view.current.zoom);
                            redraw();
                        } }), _jsx(Btn, { title: "Zoom Vorher/Nachher", icon: I.zoomprev, onClick: () => { const prev = zoomStack[zoomStack.length - 1]; if (prev) {
                            view.current.zoom = prev.zoom;
                            view.current.pan = { ...prev.pan };
                            setZoomStack(s => s.slice(0, -1));
                            redraw();
                        } }, active: tool === "zoomprev" }), _jsx(Btn, { title: "UCS \u2013 Benutzerdefiniertes Koordinatensystem", icon: I.ucs, onClick: () => setTool("ucs"), active: tool === "ucs" }), _jsx(Btn, { title: "Raster/Ortho/Snap \u2013 Schnellzugriff", icon: I.grid, onClick: () => { setShowGrid(g => !g); setOrtho(o => !o); setSnapOn(s => ({ endpoint: !s.endpoint, midpoint: !s.midpoint, intersection: !s.intersection, center: !s.center })); } }), _jsx(Btn, { title: "Eigenschaften \u2013 Eigenschaftenfenster", icon: I.props, onClick: () => alert("Eigenschaften rechts") })] }), _jsx("div", { style: { position: "relative" }, children: _jsx("canvas", { ref: canvasRef, style: { width: "100%", height: "100%", display: "block", cursor: tool === "pan" ? "grab" : "crosshair" } }) }), _jsxs("div", { style: { borderLeft: "1px solid #222b33", padding: 10, display: "flex", flexDirection: "column", gap: 10 }, children: [_jsx("h4", { style: { margin: 0, color: "#9aa6b2" }, children: "Eigenschaften" }), selection.length === 0 ? _jsx("div", { style: { color: "#9aa6b2" }, children: "Keine Auswahl" }) :
                        _jsx("div", { style: { fontSize: 13, overflow: "auto" }, children: selection.map(id => {
                                const e = ents.find(x => x.id === id);
                                return (_jsxs("div", { style: { border: "1px solid #2b3036", borderRadius: 6, padding: 8, marginBottom: 8 }, children: [_jsxs("div", { children: [_jsx("b", { children: "Typ:" }), " ", e.kind] }), _jsxs("div", { children: [_jsx("b", { children: "Layer:" }), " ", e.layer] }), "p1" in e && "p2" in e && (_jsxs("div", { children: [_jsx("b", { children: "L\u00E4nge:" }), " ", dist(e.p1, e.p2).toFixed(2)] })), "r" in e && (_jsxs("div", { children: [_jsx("b", { children: "Radius:" }), " ", e.r.toFixed(2)] })), "value" in e && (_jsxs("div", { children: [_jsx("b", { children: "Text:" }), " ", e.value] })), "h" in e && (_jsxs("div", { children: [_jsx("b", { children: "H\u00F6he:" }), " ", e.h.toFixed(2)] })), "c" in e && !e.p && (_jsxs("div", { children: [_jsx("b", { children: "Mittelpunkt:" }), " ", e.c.x.toFixed(2), ", ", e.c.y.toFixed(2)] }))] }, id));
                            }) }), _jsx("div", { style: { marginTop: "auto", color: "#9aa6b2", fontSize: 12 }, children: status })] }), _jsxs("div", { style: { gridColumn: "1 / span 3", borderTop: "1px solid #222b33", padding: "4px 8px", fontSize: 12, color: "#9aa6b2" }, children: ["X: ", mouseW.x.toFixed(3), "  Y: ", mouseW.y.toFixed(3), " | Layer: ", curLayer, " | OSNAP(F3): ", snapOn.endpoint ? "AN" : "AUS", " | ORTHO(F8): ", ortho ? "AN" : "AUS", " | Raster(F7): ", showGrid ? "AN" : "AUS"] })] }));
}
