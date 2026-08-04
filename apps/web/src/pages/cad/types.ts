// apps/web/src/lib/cad/types.ts

/* ===================== BASIC ===================== */

export type Vec2 = {
  x: number;
  y: number;
};

/* ===================== LAYERS ===================== */

export type Layer = {
  id: string;
  name: string;
  color?: string; // opzionale (import CAD può non averlo)
  visible: boolean;
  locked: boolean;
};

/* ===================== ENTITY TYPES ===================== */

export type EntityType = "point" | "line" | "polyline";

/* ===================== BASE ===================== */

export type BaseEntity = {
  id: string;
  layerId: string;
  type: EntityType;

  // 🔥 utile per KI / CAD Viewer / Takeoff
  meta?: Record<string, any>;
};

/* ===================== ENTITIES ===================== */

export type PointEntity = BaseEntity & {
  type: "point";
  p: Vec2;
};

export type LineEntity = BaseEntity & {
  type: "line";
  a: Vec2;
  b: Vec2;
};

export type PolylineEntity = BaseEntity & {
  type: "polyline";
  points: Vec2[];
  closed?: boolean; // opzionale → non sempre presente da CAD
};

/* ===================== UNION ===================== */

export type Entity = PointEntity | LineEntity | PolylineEntity;

/* ===================== VIEW ===================== */

export type CadView = {
  cx: number; // center x
  cy: number; // center y
  zoom: number;
};

/* ===================== DOCUMENT ===================== */

export type CadDoc = {
  id: string;
  name: string;

  layers: Layer[];
  entities: Entity[];

  view: CadView;

  updatedAt: string;

  // 🔥 estendibile per futuro (CAD import / versioning)
  meta?: Record<string, any>;
};





