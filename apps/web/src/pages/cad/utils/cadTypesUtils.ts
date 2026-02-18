// =========================================================
// cadTypesUtils.ts  —  Tipi, Utils, Geometria, DXF I/O, Draw
// =========================================================

/* =============== TIPI DI BASE =============== */
export type V2 = { x: number; y: number };
export type Units = "mm" | "cm" | "m";

export type Style = {
  color: string;
  lineWidth: number;
  lineType?: "continuous" | "dashed" | "dotted";
  textHeight?: number;
  font?: string;
};

export type Layer = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  lineWidth: number;
};

export type BaseEnt = { id: string; layerId: string; style: Style; selected?: boolean };
export type LineEnt = BaseEnt & { kind: "LINE"; a: V2; b: V2 };
export type PolyEnt = BaseEnt & { kind: "POLYLINE"; pts: V2[]; closed?: boolean };
export type RectEnt = BaseEnt & { kind: "RECT"; a: V2; b: V2 };
export type CircleEnt = BaseEnt & { kind: "CIRCLE"; c: V2; r: number };
export type ArcEnt = BaseEnt & { kind: "ARC"; c: V2; r: number; a0: number; a1: number; ccw?: boolean };
export type EllipseEnt = BaseEnt & { kind: "ELLIPSE"; c: V2; rx: number; ry: number; rot: number };
export type TextEnt = BaseEnt & { kind: "TEXT"; p: V2; text: string; height: number; rotation?: number };
export type DimEnt = BaseEnt & { kind: "DIM_LINEAR"; a: V2; b: V2; off: number; text?: string };
export type Entity = LineEnt | PolyEnt | RectEnt | CircleEnt | ArcEnt | EllipseEnt | TextEnt | DimEnt;

export type Tool =
  | "select" | "pan" | "line" | "polyline" | "rect" | "circle" | "erase" | "move"
  | "offset" | "trim" | "extend" | "mirror" | "transform" | "insert" | "join";

export type Snap = { on: boolean; endpoint: boolean; midpoint: boolean; nearest: boolean; ortho: boolean; grid: boolean };
export type View = { pan: V2; zoom: number; background: string; grid: { show: boolean; step: number; majorEvery: number } };
export type Command =
  | { kind: "add"; e: Entity }
  | { kind: "remove"; e: Entity }
  | { kind: "update"; before: Entity; after: Entity }
  | { kind: "batch"; ops: Command[] };

export type Doc = {
  name: string; units: Units;
  layers: Layer[]; currentLayerId: string;
  entities: Entity[]; styles: { default: Style };
  modifiedAt: number;
  blocks?: Record<string, { base: V2; ents: Entity[] }>;
};

/* =============== UTILS =============== */
export const uid = () => Math.random().toString(36).slice(2);

export const v = {
  add: (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y }),
  mul: (a: V2, s: number): V2 => ({ x: a.x * s, y: a.y * s }),
  len: (a: V2) => Math.hypot(a.x, a.y),
  dist: (a: V2, b: V2) => Math.hypot(a.x - b.x, a.y - b.y),
  dot: (a: V2, b: V2) => a.x * b.x + a.y * b.y,
  mid: (a: V2, b: V2) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
};
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export const g = {
  perp: (a: V2) => ({ x: -a.y, y: a.x }),
  norm: (a: V2) => { const L = Math.hypot(a.x, a.y) || 1; return { x: a.x / L, y: a.y / L }; },
  rot: (p: V2, c: V2, deg: number) => {
    const r = (deg * Math.PI) / 180, s = Math.sin(r), co = Math.cos(r);
    const dx = p.x - c.x, dy = p.y - c.y;
    return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co };
  },
  scale: (p: V2, c: V2, k: number) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }),
  reflectPointAcrossLine: (p: V2, a: V2, b: V2) => {
    const ap=v.sub(p,a), ab=v.sub(b,a); const t=v.dot(ap,ab)/(v.dot(ab,ab)||1);
    const proj=v.add(a,v.mul(ab,t)); const d=v.sub(proj,p); return v.add(p,v.mul(d,2));
  },
  segSeg: (a1:V2,a2:V2,b1:V2,b2:V2) => {
    const x1=a1.x,y1=a1.y,x2=a2.x,y2=a2.y,x3=b1.x,y3=b1.y,x4=b2.x,y4=b2.y;
    const den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4); if(Math.abs(den)<1e-9) return null;
    const px=((x1*y2-y1*x2)*(x3-x4)-(x1-x2)*(x3*y4-y3*x4))/den;
    const py=((x1*y2-y1*x2)*(y3-y4)-(y1-y2)*(x3*y4-y3*x4))/den;
    const onSeg=(x:number,y:number,xA:number,yA:number,xB:number,yB:number)=>{
      const minX=Math.min(xA,xB)-1e-6,maxX=Math.max(xA,xB)+1e-6,minY=Math.min(yA,yB)-1e-6,maxY=Math.max(yA,yB)+1e-6;
      return x>=minX&&x<=maxX&&y>=minY&&y<=maxY;
    };
    return (onSeg(px,py,x1,y1,x2,y2)&&onSeg(px,py,x3,y3,x4,y4)) ? {x:px,y:py} : null;
  },
  bboxOfPts: (pts: V2[]) => {
    const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
    return { min:{x:Math.min(...xs), y:Math.min(...ys)}, max:{x:Math.max(...xs), y:Math.max(...ys)} };
  }
};

/* =============== DOC DEFAULT + STORAGE =============== */
export function defaultDoc(): Doc {
  const layer0: Layer = { id: "0", name: "0", color: "#00AEEF", visible: true, locked: false, lineWidth: 1 };
  const defp: Layer = { id: "DEFPOINTS", name: "DEFPOINTS", color: "#888888", visible: true, locked: true, lineWidth: 1 };
  return { name: "Untitled", units: "m", layers: [layer0, defp], currentLayerId: layer0.id, entities: [], styles: { default: { color: "#222222", lineWidth: 1, textHeight: 2.5, font: "Inter, Arial" } }, modifiedAt: Date.now(), blocks:{} };
}

const LS_KEY = "RLC_CAD_DOC_V2";
export const saveLocal = (doc: Doc) => localStorage.setItem(LS_KEY, JSON.stringify(doc));
export const loadLocal = (): Doc | null => { try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) as Doc : null; } catch { return null; } };
// Alias compatibili con altri file
export const saveDocLocal = saveLocal;
export const loadDocLocal = loadLocal;

/* =============== DXF I/O (BASIC) =============== */
export function exportDXF(doc: Doc): string {
  const enc = (g: number, v: string | number) => `${g}\n${v}\n`;
  let out = "0\nSECTION\n2\nENTITIES\n";
  const layerById = new Map(doc.layers.map(l => [l.id, l]));
  const lname = (id: string) => layerById.get(id)?.name ?? "0";
  for (const e of doc.entities) {
    if (e.kind === "LINE") out += "0\nLINE\n" + enc(8, lname(e.layerId)) + enc(10, e.a.x) + enc(20, e.a.y) + enc(11, e.b.x) + enc(21, e.b.y);
    else if (e.kind === "LWPOLYLINE" || e.kind === "POLYLINE") { const P=e as PolyEnt;
      out += "0\nLWPOLYLINE\n" + enc(8, lname(e.layerId)) + enc(90, P.pts.length) + enc(70, P.closed ? 1 : 0);
      P.pts.forEach(p => (out += enc(10, p.x) + enc(20, p.y)));
    }
    else if (e.kind === "CIRCLE") out += "0\nCIRCLE\n" + enc(8, lname(e.layerId)) + enc(10, e.c.x) + enc(20, e.c.y) + enc(40, e.r);
    else if (e.kind === "ARC") out += "0\nARC\n" + enc(8, lname(e.layerId)) + enc(10, e.c.x) + enc(20, e.c.y) + enc(40, e.r) + enc(50, e.a0) + enc(51, e.a1);
    else if (e.kind === "TEXT") { const t = e as TextEnt; out += "0\nTEXT\n" + enc(8, lname(e.layerId)) + enc(10, t.p.x) + enc(20, t.p.y) + enc(40, t.height ?? 2.5) + enc(1, t.text); }
    else if (e.kind === "RECT") { const r = e as RectEnt; const pts = [{x:r.a.x,y:r.a.y},{x:r.b.x,y:r.a.y},{x:r.b.x,y:r.b.y},{x:r.a.x,y:r.b.y},{x:r.a.x,y:r.a.y}];
      out += "0\nLWPOLYLINE\n" + enc(8, lname(e.layerId)) + enc(90, pts.length) + enc(70, 1); pts.forEach(p => (out += enc(10, p.x) + enc(20, p.y))); }
  }
  out += "0\nENDSEC\n0\nEOF\n"; return out;
}
// Alias richiesto da alcuni file
export const toDXF = exportDXF;

export function importDXF(text: string, layerNameToId: (name: string) => string): Entity[] {
  const lines = text.split(/\r?\n/); let i = 0; const ents: Entity[] = [];
  while (i < lines.length - 1) {
    if (lines[i++].trim() !== "0") continue;
    const type = (lines[i++] ?? "").trim();
    if (type === "ENDSEC" || type === "EOF") break;
    if (!["LINE","LWPOLYLINE","CIRCLE","ARC","TEXT"].includes(type)) continue;
    let layer="0"; let a={x:0,y:0}, b={x:0,y:0}, c={x:0,y:0}; let r=0, a0=0, a1=0; let closed=false; const pts:V2[]=[];
    for (;;) {
      const code = Number(lines[i++]); const val = (lines[i++] ?? "").trim();
      if (isNaN(code)) break; if (code===0){ i-=2; break; }
      if (code===8) layer = val;
      else if (code===10){ if(type==="LINE"||type==="TEXT"){a.x=+val;} else if(type==="CIRCLE"||type==="ARC"){c.x=+val;} else if(type==="LWPOLYLINE"){ pts.push({x:+val,y:0}); } }
      else if (code===20){ if(type==="LINE"||type==="TEXT"){a.y=+val;} else if(type==="CIRCLE"||type==="ARC"){c.y=+val;} else if(type==="LWPOLYLINE"){ const last=pts[pts.length-1]; if(last) last.y=+val; } }
      else if (code===11 && type==="LINE") b.x=+val;
      else if (code===21 && type==="LINE") b.y=+val;
      else if (code===40){ if(type==="CIRCLE"||type==="ARC") r=+val; }
      else if (code===50 && type==="ARC") a0=+val;
      else if (code===51 && type==="ARC") a1=+val;
      else if (code===70 && type==="LWPOLYLINE") closed=(+val)===1;
    }
    const layerId = layerNameToId(layer);
    const style: Style = { color: "#222222", lineWidth: 1, textHeight: 2.5 };
    if (type==="LINE") ents.push({ id: uid(), kind:"LINE", a, b, layerId, style });
    else if (type==="LWPOLYLINE") ents.push({ id: uid(), kind:"POLYLINE", pts, closed, layerId, style });
    else if (type==="CIRCLE") ents.push({ id: uid(), kind:"CIRCLE", c, r, layerId, style });
    else if (type==="ARC") ents.push({ id: uid(), kind:"ARC", c, r, a0, a1, ccw:true, layerId, style });
    else if (type==="TEXT") ents.push({ id: uid(), kind:"TEXT", p:a, text:"", height:2.5, layerId, style });
  }
  return ents;
}

/* =============== DRAWING =============== */
function setCtxStyle(ctx: CanvasRenderingContext2D, style: Style) {
  ctx.lineWidth = style.lineWidth || 1;
  ctx.strokeStyle = style.color || "#222222";
  ctx.fillStyle = style.color || "#222222";
  ctx.setLineDash(style.lineType === "dashed" ? [6, 4] : style.lineType === "dotted" ? [2, 4] : []);
}
export function drawEntity(ctx: CanvasRenderingContext2D, e: Entity, zoom: number) {
  setCtxStyle(ctx, e.style);
  if (e.kind === "LINE") { ctx.beginPath(); ctx.moveTo(e.a.x, -e.a.y); ctx.lineTo(e.b.x, -e.b.y); ctx.stroke(); }
  else if (e.kind === "POLYLINE") { if (e.pts.length<2) return; ctx.beginPath(); ctx.moveTo(e.pts[0].x,-e.pts[0].y); for (let i=1;i<e.pts.length;i++) ctx.lineTo(e.pts[i].x,-e.pts[i].y); if (e.closed) ctx.closePath(); ctx.stroke(); }
  else if (e.kind === "RECT") { const x=Math.min(e.a.x,e.b.x), y=Math.min(e.a.y,e.b.y); const w=Math.abs(e.a.x-e.b.x), h=Math.abs(e.a.y-e.b.y); ctx.strokeRect(x,-y-h,w,h); }
  else if (e.kind === "CIRCLE") { ctx.beginPath(); ctx.arc(e.c.x,-e.c.y,e.r,0,Math.PI*2); ctx.stroke(); }
  else if (e.kind === "ARC") { ctx.beginPath(); ctx.arc(e.c.x,-e.c.y,e.r,(-e.a0*Math.PI)/180,(-e.a1*Math.PI)/180,!e.ccw); ctx.stroke(); }
  else if (e.kind === "ELLIPSE") { ctx.beginPath(); ctx.ellipse(e.c.x,-e.c.y,e.rx,e.ry,-e.rot,0,Math.PI*2); ctx.stroke(); }
  else if (e.kind === "TEXT") { const t=e as TextEnt; ctx.save(); ctx.translate(t.p.x,-t.p.y); if(t.rotation) ctx.rotate((-t.rotation*Math.PI)/180); const px=(t.height??2.5)*1.5; ctx.font=`${px}px ${t.style.font||"Inter, Arial"}`; ctx.scale(1,-1); ctx.fillText(t.text,0,0); ctx.restore(); }
  if ((e as any).selected) { ctx.save(); ctx.setLineDash([2/zoom,3/zoom]); ctx.strokeStyle="#ff006e";
    if (e.kind==="LINE"){ctx.beginPath();ctx.moveTo(e.a.x,-e.a.y);ctx.lineTo(e.b.x,-e.b.y);ctx.stroke();}
    else if (e.kind==="CIRCLE"){ctx.beginPath();ctx.arc(e.c.x,-e.c.y,e.r,0,Math.PI*2);ctx.stroke();}
    else if (e.kind==="POLYLINE"){ if(e.pts.length>=2){ ctx.beginPath(); ctx.moveTo(e.pts[0].x,-e.pts[0].y); for(let i=1;i<e.pts.length;i++) ctx.lineTo(e.pts[i].x,-e.pts[i].y); if(e.closed) ctx.closePath(); ctx.stroke(); } }
    else if (e.kind==="RECT"){ const x=Math.min(e.a.x,e.b.x),y=Math.min(e.a.y,e.b.y); const w=Math.abs(e.a.x-e.b.x),h=Math.abs(e.a.y-e.b.y); ctx.strokeRect(x,-y-h,w,h);}
    ctx.restore();
  }
}

export function hitDist(e: Entity, p: V2, _tol = 5): number {
  const nearSeg=(a:V2,b:V2,p:V2)=>{const ab=v.sub(b,a); const t=clamp((v.dot(v.sub(p,a),ab)/(v.dot(ab,ab)||1)),0,1); const q=v.add(a,v.mul(ab,t)); return v.dist(p,q);};
  if (e.kind==="LINE") return nearSeg(e.a,e.b,p);
  if (e.kind==="CIRCLE") return Math.abs(v.dist(p,e.c)-e.r);
  if (e.kind==="POLYLINE") { let d=Infinity; for(let i=0;i<e.pts.length-1;i++) d=Math.min(d,nearSeg(e.pts[i],e.pts[i+1],p)); if(e.closed && e.pts.length>2) d=Math.min(d,nearSeg(e.pts.at(-1)!,e.pts[0],p)); return d; }
  if (e.kind==="RECT") { const xs=[e.a.x,e.b.x], ys=[e.a.y,e.b.y]; const A={x:Math.min(...xs),y:Math.min(...ys)}, B={x:Math.max(...xs),y:Math.max(...ys)};
    const edges:[V2,V2][]= [[A,{x:B.x,y:A.y}],[{x:B.x,y:A.y},B],[B,{x:A.x,y:B.y}],[{x:A.x,y:B.y},A]]; return Math.min(...edges.map(([s,t])=>nearSeg(s,t,p))); }
  return 9999;
}

/* =============== ENTITY HELPERS =============== */
export function cloneEntity<T extends Entity>(e: T): T { return JSON.parse(JSON.stringify(e)); }

export function moveEntity<T extends Entity>(e: T, d: V2): T {
  const c=cloneEntity(e);
  if (c.kind==="LINE"){ c.a=v.add(c.a,d); c.b=v.add(c.b,d); }
  else if (c.kind==="RECT"){ c.a=v.add(c.a,d); c.b=v.add(c.b,d); }
  else if (c.kind==="CIRCLE"){ c.c=v.add(c.c,d); }
  else if (c.kind==="POLYLINE"){ c.pts=c.pts.map(p=>v.add(p,d)); }
  else if (c.kind==="ARC"||c.kind==="ELLIPSE"){ (c as any).c=v.add((c as any).c,d); }
  else if (c.kind==="TEXT"){ c.p=v.add(c.p,d); }
  else if (c.kind==="DIM_LINEAR"){ c.a=v.add(c.a,d); c.b=v.add(c.b,d); }
  return c;
}

export function rotateEntity<T extends Entity>(e: T, c: V2, deg: number): T {
  const R = (p:V2)=>g.rot(p,c,deg); const out=cloneEntity(e);
  if(out.kind==="LINE"){ out.a=R(out.a); out.b=R(out.b); }
  else if(out.kind==="RECT"){ out.a=R(out.a); out.b=R(out.b); }
  else if(out.kind==="CIRCLE"){ out.c=R(out.c); }
  else if(out.kind==="POLYLINE"){ out.pts=out.pts.map(R); }
  else if(out.kind==="ARC"||out.kind==="ELLIPSE"){ (out as any).c=R((out as any).c); }
  else if(out.kind==="TEXT"){ out.p=R(out.p); (out as any).rotation=((out as any).rotation||0)+deg; }
  return out;
}

export function scaleEntity<T extends Entity>(e: T, c: V2, k: number): T {
  const kk=(isFinite(k)&&k>0)?k:1; const S=(p:V2)=>g.scale(p,c,kk); const out=cloneEntity(e);
  if(out.kind==="LINE"){ out.a=S(out.a); out.b=S(out.b); }
  else if(out.kind==="RECT"){ out.a=S(out.a); out.b=S(out.b); }
  else if(out.kind==="CIRCLE"){ out.c=S(out.c); out.r*=kk; }
  else if(out.kind==="POLYLINE"){ out.pts=out.pts.map(S); }
  else if(out.kind==="ARC"){ (out as any).c=S((out as any).c); (out as any).r*=kk; }
  else if(out.kind==="ELLIPSE"){ (out as any).c=S((out as any).c); (out as any).rx*=kk; (out as any).ry*=kk; }
  else if(out.kind==="TEXT"){ out.p=S(out.p); (out as any).height*=kk; }
  return out;
}

export function mirrorEntity<T extends Entity>(e:T, a:V2, b:V2): T {
  const M=(p:V2)=>g.reflectPointAcrossLine(p,a,b); const c=cloneEntity(e);
  if(c.kind==="LINE"){ c.a=M(c.a); c.b=M(c.b); }
  else if(c.kind==="RECT"){ c.a=M(c.a); c.b=M(c.b); }
  else if(c.kind==="CIRCLE"){ c.c=M(c.c); }
  else if(c.kind==="POLYLINE"){ c.pts=c.pts.map(M); }
  else if(c.kind==="TEXT"){ c.p=M(c.p); }
  else if(c.kind==="ARC"||c.kind==="ELLIPSE"){ (c as any).c=M((c as any).c); }
  return c;
}

export function offsetLine(e: LineEnt, dist: number, side: 1 | -1): LineEnt {
  const d = v.sub(e.b,e.a); const n = g.norm(g.perp(d));
  const off = { x: n.x * dist * side, y: n.y * dist * side };
  return { ...cloneEntity(e), a: v.add(e.a, off), b: v.add(e.b, off) };
}

export function explodePolyline(e: PolyEnt): LineEnt[] {
  const lines: LineEnt[] = [];
  for(let i=0;i<e.pts.length-1;i++) lines.push({ id: uid(), kind:"LINE", a:e.pts[i], b:e.pts[i+1], layerId:e.layerId, style:e.style });
  if (e.closed && e.pts.length>2) lines.push({ id: uid(), kind:"LINE", a:e.pts.at(-1)!, b:e.pts[0], layerId:e.layerId, style:e.style });
  return lines;
}

export function extendLineToFirstIntersection(target: LineEnt, others: LineEnt[], toward: "a" | "b"): LineEnt {
  const A = target.a, B = target.b;
  let bestPt: V2 | null = null; let bestDist = Infinity;
  for (const o of others) {
    if (o.id === target.id) continue;
    const X = g.segSeg(A,B,o.a,o.b);
    if (!X) continue;
    const d = v.dist(toward === "a" ? A : B, X);
    if (d < bestDist - 1e-9) { bestDist = d; bestPt = X; }
  }
  if (!bestPt) return target;
  const out = cloneEntity(target);
  if (toward === "a") out.a = bestPt; else out.b = bestPt;
  return out;
}

export function joinCollinear(lines: LineEnt[], tol = 1e-6): LineEnt[] {
  // unione semplificata: due segmenti collineari con endpoint comune -> merge
  const used = new Set<string>(); const res: LineEnt[] = [];
  const isCollinear = (l1:LineEnt,l2:LineEnt) => {
    const d1=v.sub(l1.b,l1.a), d2=v.sub(l2.b,l2.a);
    const cross = Math.abs(d1.x*d2.y - d1.y*d2.x)/(v.len(d1)*v.len(d2)||1);
    return cross < tol;
  };
  const samePt = (p:V2,q:V2)=> v.dist(p,q)<tol;
  for (let i=0;i<lines.length;i++) {
    if (used.has(lines[i].id)) continue;
    let a=lines[i].a, b=lines[i].b; used.add(lines[i].id);
    for (let j=i+1;j<lines.length;j++) {
      if (used.has(lines[j].id)) continue;
      if (!isCollinear(lines[i], lines[j])) continue;
      if (samePt(a, lines[j].a)) { a=lines[j].b; used.add(lines[j].id); }
      else if (samePt(a, lines[j].b)) { a=lines[j].a; used.add(lines[j].id); }
      else if (samePt(b, lines[j].a)) { b=lines[j].b; used.add(lines[j].id); }
      else if (samePt(b, lines[j].b)) { b=lines[j].a; used.add(lines[j].id); }
    }
    res.push({ ...lines[i], id: uid(), a, b });
  }
  return res;
}

export function entityInBox(e: Entity, min: V2, max: V2): boolean {
  const inP=(p:V2)=> p.x>=min.x && p.x<=max.x && p.y>=min.y && p.y<=max.y;
  if (e.kind==="LINE") return inP(e.a)||inP(e.b);
  if (e.kind==="RECT") return inP(e.a)||inP(e.b);
  if (e.kind==="CIRCLE") return [ {x:e.c.x+e.r,y:e.c.y},{x:e.c.x-e.r,y:e.c.y},{x:e.c.x,y:e.c.y+e.r},{x:e.c.x,y:e.c.y-e.r} ].some(inP);
  if (e.kind==="POLYLINE") return e.pts.some(inP);
  if (e.kind==="TEXT") return inP((e as TextEnt).p);
  return false;
}

export function entityBounds(e: Entity): {min:V2; max:V2} | null {
  if (e.kind==="LINE") return g.bboxOfPts([e.a,e.b]);
  if (e.kind==="RECT") return g.bboxOfPts([e.a,e.b]);
  if (e.kind==="CIRCLE") return { min:{x:e.c.x-e.r,y:e.c.y-e.r}, max:{x:e.c.x+e.r,y:e.c.y+e.r} };
  if (e.kind==="POLYLINE") return e.pts.length? g.bboxOfPts(e.pts) : null;
  if (e.kind==="TEXT") return g.bboxOfPts([(e as TextEnt).p]);
  if (e.kind==="ARC") return { min:{x:e.c.x-e.r,y:e.c.y-e.r}, max:{x:e.c.x+e.r,y:e.c.y+e.r} };
  return null;
}
