// apps/web/src/lib/cad/types.ts
export type Vec2 = { x: number; y: number };

export type Layer = {
  id: string;
  name: string;
  color: string;       // CSS color
  visible: boolean;
  locked: boolean;
};

export type BaseEntity = {
  id: string;
  layerId: string;
  type: "point" | "line" | "polyline";
};

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
  closed: boolean;
};

export type Entity = PointEntity | LineEntity | PolylineEntity;

export type CadDoc = {
  id: string;
  name: string;
  layers: Layer[];
  entities: Entity[];
  view: { cx: number; cy: number; zoom: number };
  updatedAt: string;
};
