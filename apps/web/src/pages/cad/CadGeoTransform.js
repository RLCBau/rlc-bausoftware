// apps/web/src/pages/cad/cadGeoTransform.ts
const R = 6378137; // WebMercator sphere radius (meters)
const MAX_LAT = 85.05112878;
function clampLat(lat) {
    return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}
export function isValidSimilarity(t) {
    return !!t &&
        Number.isFinite(t.s) &&
        Number.isFinite(t.cos) &&
        Number.isFinite(t.sin) &&
        Number.isFinite(t.tx) &&
        Number.isFinite(t.ty) &&
        Math.abs(t.s) > 1e-12;
}
export function latLngToMercator(p) {
    const lat = clampLat(p.lat);
    const x = (p.lng * Math.PI) / 180;
    const y = (lat * Math.PI) / 180;
    return {
        x: R * x,
        y: R * Math.log(Math.tan(Math.PI / 4 + y / 2)),
    };
}
export function mercatorToLatLng(m) {
    const lng = (m.x / R) * (180 / Math.PI);
    const lat = (2 * Math.atan(Math.exp(m.y / R)) - Math.PI / 2) * (180 / Math.PI);
    return {
        lat: clampLat(lat),
        lng,
    };
}
/**
 * Calibrazione con 2 punti:
 * world A,B (CAD) -> mercator A,B (map)
 * Risolve una trasformazione di similitudine: M = s * R(theta) * W + T
 */
export function solveSimilarity2Points(worldA, worldB, mapA, mapB) {
    const mA = latLngToMercator(mapA);
    const mB = latLngToMercator(mapB);
    const vW = {
        x: worldB.x - worldA.x,
        y: worldB.y - worldA.y,
    };
    const vM = {
        x: mB.x - mA.x,
        y: mB.y - mA.y,
    };
    const lenW = Math.hypot(vW.x, vW.y);
    const lenM = Math.hypot(vM.x, vM.y);
    if (!Number.isFinite(lenW) || !Number.isFinite(lenM) || lenW < 1e-9 || lenM < 1e-9) {
        return null;
    }
    const s = lenM / lenW;
    let cos = (vW.x * vM.x + vW.y * vM.y) / (lenW * lenM);
    let sin = (vW.x * vM.y - vW.y * vM.x) / (lenW * lenM);
    // normalizzazione numerica
    const norm = Math.hypot(cos, sin) || 1;
    cos /= norm;
    sin /= norm;
    const rwA = {
        x: s * (cos * worldA.x - sin * worldA.y),
        y: s * (sin * worldA.x + cos * worldA.y),
    };
    return {
        s,
        cos,
        sin,
        tx: mA.x - rwA.x,
        ty: mA.y - rwA.y,
    };
}
export function worldToMercator(w, t) {
    return {
        x: t.s * (t.cos * w.x - t.sin * w.y) + t.tx,
        y: t.s * (t.sin * w.x + t.cos * w.y) + t.ty,
    };
}
export function worldToLatLng(w, t) {
    return mercatorToLatLng(worldToMercator(w, t));
}
export function mercatorToWorld(m, t) {
    const dx = m.x - t.tx;
    const dy = m.y - t.ty;
    // inversa di s * R
    return {
        x: (t.cos * dx + t.sin * dy) / t.s,
        y: (-t.sin * dx + t.cos * dy) / t.s,
    };
}
export function latLngToWorld(p, t) {
    return mercatorToWorld(latLngToMercator(p), t);
}
