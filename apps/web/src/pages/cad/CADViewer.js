import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
// UTM_DIRECT_SELECTION_V15_7_1
import { API_BASE } from "../../lib/apiBase";
import React, { useEffect, useMemo, useRef, useState, } from "react";
import { useProject } from "../../store/useProject";
import { createPortal } from "react-dom";
import L from "leaflet";
import proj4 from "proj4";
import "leaflet/dist/leaflet.css";
import { cloneCadFeatures, createCadId, createCadDocument, duplicateCadFeatures, findCadSnap, normalizeCadFeatures, offsetCadFeatures, parseAsciiDxf, recalculateCadFeature, rebaseCadPoint, rebaseCadViewBox, restoreCadPoint, rotateCadFeatures, scaleCadFeatures, translateCadFeatures, zoomCadViewBox, } from "./rlcCadEngine";
/* UTM_GROUP_SELECTION_ESC_V15_8 */
/* UTM_X_SYMBOL_ZOOM_V15_9 */
/* UTM_X_VISIBILITY_FIX_V15_9_1 */
/* UTM_X_VISIBILITY_FIX_V15_9_2 */
/* UTM_WHITE_SYMBOL_TEXT_V15_9_3 */
/* UTM_UNIFORM_ZOOM_SCALE_V15_9_4 */
/* UTM_X_CONTRAST_CENTER_TEXT_V15_9_5 */
/* UTM_PROPERTIES_GLOBAL_SCALE_V15_10 */
/* UTM_MULTI_PROPERTIES_SELECTION_MARKER_V15_11 */
/* UTM_SYMBOL_TEXT_VISIBILITY_V15_12 */
/* UTM_GERMAN_TEXT_FIX_V15_12_1 */
/* UTM_SCALE_MIN_01_V15_12_2 */
/* LAYER_MANAGER_BRICSCAD_STYLE_V15_13 */
/* GENERAL_RLC_CAD_DIALOG_V15_14 */
/* LAYER_MANAGER_COMPACT_V15_15 */
/* LAYER_MANAGER_TRUE_COMPACT_V15_15_1 */
/* EDITING_PANEL_RESIZE_HANDLE_V15_16 */
/* LAYER_MANAGER_COLUMN_WIDTH_FIX_V15_16_1 */
/* PROPERTIES_EDITABLE_STYLE_V15_17 */
/* LINEWEIGHT_GLOBAL_WIDTH_V15_18 */
/* ROTATE_BASEPOINT_LIVE_V15_19 */
/* ROTATE_VIEWER_TOOL_TYPE_FIX_V15_19_1 */
/* SCALE_BASEPOINT_LIVE_V15_20 */
/* MODIFY_COMMAND_FIRST_SELECTION_V15_21 */
/* OFFSET_DIRECTION_LIVE_V15_22 */
/* TRIM_MULTI_CONTINUOUS_V15_23 */
/* DEHNEN_MULTI_CONTINUOUS_V15_24 */
/* RIGHTCLICK_REPEAT_UNDO_REDO_V15_25 */
/* LARGE_DWG_VIEWPORT_PERFORMANCE_V15_28 */
/* INTERACTION_ENGINE_V15_29 */
/* AGGRESSIVE_INTERACTION_PERFORMANCE_V15_30 */
/* DXF_DIMENSION_ARRAY_GUARD_V15_31 */
/* NATIVE_PIXEL_CURSOR_FIX_V15_28_3 */
/* DETERMINISTIC_LOD_NO_DISAPPEAR_V15_33 */
/* =========================================================
   RLC CAD V1.10 Â· Fullscreen, Direct Selection and Workspace Restore
   - Autonomous RLC geometry engine
   - Direct ASCII DXF import without BricsCAD
   - Layer control, selection, snap, zoom, pan, fit, grid and labels
   - Drawing, copy, move, rotate, scale, offset, vertex editing and history
   - Distance / area / point measurement tools
   - UTM point visualization
   - LV mapping and transfer to AufmaÃŸ
   - GeoJSON / CSV export
   ========================================================= */
/* ================== GEOREFERENCE ================== */
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs");
proj4.defs("EPSG:32632", "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs");
function cadUtmToLatLng(x, y, crs) {
    try {
        const [lng, lat] = proj4(crs, "EPSG:4326", [x, y]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 35 || lat > 65 || lng < -10 || lng > 30)
            return null;
        return [lat, lng];
    }
    catch {
        return null;
    }
}
function polygonSignedArea(points) {
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        area += current.x * next.y - next.x * current.y;
    }
    return area / 2;
}
function pointInsidePolygon(point, polygon) {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
        const a = polygon[index];
        const b = polygon[previous];
        const intersects = a.y > point.y !== b.y > point.y &&
            point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-12) + a.x;
        if (intersects)
            inside = !inside;
    }
    return inside;
}
function boundaryPolygonAtPoint(features, click, tolerance) {
    const direct = [];
    const graphPoints = new Map();
    const adjacency = new Map();
    const keyFor = (point) => `${Math.round(point.x / tolerance)}:${Math.round(point.y / tolerance)}`;
    const addEdge = (a, b) => {
        if (Math.hypot(a.x - b.x, a.y - b.y) <= tolerance * 0.1)
            return;
        const aKey = keyFor(a);
        const bKey = keyFor(b);
        graphPoints.set(aKey, graphPoints.get(aKey) || a);
        graphPoints.set(bKey, graphPoints.get(bKey) || b);
        if (!adjacency.has(aKey))
            adjacency.set(aKey, new Set());
        if (!adjacency.has(bKey))
            adjacency.set(bKey, new Set());
        adjacency.get(aKey).add(bKey);
        adjacency.get(bKey).add(aKey);
    };
    for (const feature of features) {
        const kind = String(feature.kind || '').toLowerCase();
        if (kind === 'text' || kind === 'point' || kind === 'hatch')
            continue;
        const pts = Array.isArray(feature.pts) ? feature.pts.filter(Boolean) : [];
        if (kind === 'circle' && pts[0] && Number(feature.radius || 0) > 0) {
            const circle = [];
            for (let index = 0; index < 64; index += 1) {
                const angle = (Math.PI * 2 * index) / 64;
                circle.push({
                    x: pts[0].x + Math.cos(angle) * Number(feature.radius),
                    y: pts[0].y + Math.sin(angle) * Number(feature.radius),
                });
            }
            direct.push(circle);
            continue;
        }
        if (pts.length < 2)
            continue;
        const closed = Boolean(feature.closed || kind === 'polygon');
        if (closed && pts.length >= 3)
            direct.push(pts.map((point) => ({ ...point })));
        for (let index = 1; index < pts.length; index += 1)
            addEdge(pts[index - 1], pts[index]);
        if (closed)
            addEdge(pts[pts.length - 1], pts[0]);
    }
    const visited = new Set();
    const faces = [...direct];
    const directedKey = (a, b) => `${a}>${b}`;
    for (const [startA, neighbors] of adjacency.entries()) {
        for (const startB of neighbors) {
            const firstKey = directedKey(startA, startB);
            if (visited.has(firstKey))
                continue;
            const keys = [startA];
            let previous = startA;
            let current = startB;
            let closed = false;
            for (let guard = 0; guard < 2000; guard += 1) {
                visited.add(directedKey(previous, current));
                keys.push(current);
                const currentPoint = graphPoints.get(current);
                const previousPoint = graphPoints.get(previous);
                const available = [...(adjacency.get(current) || [])];
                if (!available.length)
                    break;
                available.sort((left, right) => {
                    const lp = graphPoints.get(left);
                    const rp = graphPoints.get(right);
                    return Math.atan2(lp.y - currentPoint.y, lp.x - currentPoint.x) -
                        Math.atan2(rp.y - currentPoint.y, rp.x - currentPoint.x);
                });
                const incomingAngle = Math.atan2(previousPoint.y - currentPoint.y, previousPoint.x - currentPoint.x);
                let incomingIndex = 0;
                let bestDifference = Number.POSITIVE_INFINITY;
                available.forEach((candidate, index) => {
                    const point = graphPoints.get(candidate);
                    const angle = Math.atan2(point.y - currentPoint.y, point.x - currentPoint.x);
                    let difference = Math.abs(angle - incomingAngle);
                    difference = Math.min(difference, Math.PI * 2 - difference);
                    if (difference < bestDifference) {
                        bestDifference = difference;
                        incomingIndex = index;
                    }
                });
                const next = available[(incomingIndex - 1 + available.length) % available.length];
                previous = current;
                current = next;
                if (previous === startA && current === startB) {
                    closed = true;
                    break;
                }
            }
            if (closed && keys.length >= 4) {
                const polygon = keys.slice(0, -1).map((key) => graphPoints.get(key));
                if (Math.abs(polygonSignedArea(polygon)) > tolerance * tolerance)
                    faces.push(polygon);
            }
        }
    }
    const containing = faces
        .filter((polygon) => polygon.length >= 3 && pointInsidePolygon(click, polygon))
        .map((polygon) => ({ polygon, area: Math.abs(polygonSignedArea(polygon)) }))
        .sort((left, right) => left.area - right.area);
    return containing[0]?.polygon || null;
}
/* ================== API ================== */
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
function getAuthToken() {
    return (localStorage.getItem("rlc_token") ||
        localStorage.getItem("token") ||
        sessionStorage.getItem("rlc_token") ||
        sessionStorage.getItem("token") ||
        "");
}
function authHeaders(extra) {
    const token = getAuthToken();
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(extra || {}),
    };
}
function cadViewToProjectedBounds(view, sourceCrs, targetCrs = "EPSG:25832") {
    const west = view.x;
    const east = view.x + view.width;
    const north = -view.y;
    const south = -(view.y + view.height);
    const corners = [
        [west, south],
        [west, north],
        [east, south],
        [east, north],
    ];
    try {
        const projected = corners.map(([easting, northing]) => {
            if (sourceCrs === targetCrs)
                return [easting, northing];
            return proj4(sourceCrs, targetCrs, [easting, northing]);
        });
        if (projected.some(([easting, northing]) => !Number.isFinite(easting) || !Number.isFinite(northing))) {
            return null;
        }
        const eastings = projected.map(([easting]) => easting);
        const northings = projected.map(([, northing]) => northing);
        return {
            minE: Math.min(...eastings),
            minN: Math.min(...northings),
            maxE: Math.max(...eastings),
            maxN: Math.max(...northings),
        };
    }
    catch {
        return null;
    }
}
function buildBayernWmsUrl(options) {
    if (!options.bounds || options.width <= 0 || options.height <= 0)
        return "";
    const params = new URLSearchParams({
        SERVICE: "WMS",
        REQUEST: "GetMap",
        VERSION: "1.3.0",
        LAYERS: options.layer,
        STYLES: "",
        CRS: "EPSG:25832",
        BBOX: [
            options.bounds.minE,
            options.bounds.minN,
            options.bounds.maxE,
            options.bounds.maxN,
        ]
            .map((value) => value.toFixed(3))
            .join(","),
        WIDTH: String(Math.max(1, Math.round(options.width))),
        HEIGHT: String(Math.max(1, Math.round(options.height))),
        FORMAT: options.format,
        TRANSPARENT: options.transparent ? "TRUE" : "FALSE",
        EXCEPTIONS: "INIMAGE",
        RLC_REFRESH: String(options.refreshToken || 0),
    });
    return `${options.endpoint.replace(/[?&]+$/, "")}?${params.toString()}`;
}
function GeoWmsImageLayer({ requestUrl, requestBounds, currentBounds, width, height, opacity, zIndex, }) {
    const [loaded, setLoaded] = React.useState(null);
    React.useEffect(() => {
        if (!requestUrl || !requestBounds)
            return;
        let cancelled = false;
        const preload = new Image();
        preload.decoding = "async";
        preload.onload = () => {
            if (!cancelled) {
                setLoaded({ url: requestUrl, bounds: { ...requestBounds } });
            }
        };
        preload.src = requestUrl;
        return () => {
            cancelled = true;
        };
    }, [
        requestUrl,
        requestBounds?.minE,
        requestBounds?.minN,
        requestBounds?.maxE,
        requestBounds?.maxN,
    ]);
    if (!loaded || !currentBounds || width <= 0 || height <= 0)
        return null;
    const loadedWidth = Math.max(0.000001, loaded.bounds.maxE - loaded.bounds.minE);
    const loadedHeight = Math.max(0.000001, loaded.bounds.maxN - loaded.bounds.minN);
    const currentWidth = Math.max(0.000001, currentBounds.maxE - currentBounds.minE);
    const currentHeight = Math.max(0.000001, currentBounds.maxN - currentBounds.minN);
    const scaleX = loadedWidth / currentWidth;
    const scaleY = loadedHeight / currentHeight;
    const translateX = ((loaded.bounds.minE - currentBounds.minE) / currentWidth) * width;
    const translateY = ((currentBounds.maxN - loaded.bounds.maxN) / currentHeight) * height;
    return (_jsx("img", { src: loaded.url, alt: "", draggable: false, "aria-hidden": "true", style: {
            position: "absolute",
            left: 0,
            top: 0,
            width,
            height,
            maxWidth: "none",
            transformOrigin: "0 0",
            transform: `matrix(${scaleX}, 0, 0, ${scaleY}, ${translateX}, ${translateY})`,
            opacity,
            zIndex,
            pointerEvents: "none",
            userSelect: "none",
        } }));
}
/* ================== UI ================== */
const ui = {
    bg: "#eef1f5",
    panel: "#ffffff",
    panel2: "#f8fafc",
    border: "#d9dee7",
    text: "#172033",
    sub: "#667085",
    shadow: "0 10px 30px rgba(16,24,40,0.08)",
    accent: "#0b4f8a",
    accent2: "#0e6fb8",
    accentSoft: "#e8f2fb",
    danger: "#b42318",
    success: "#067647",
    warning: "#b54708",
    cadBg: "#10151d",
    cadGrid: "#273242",
};
const cadPalette = {
    bg: "#2a3038",
    bg2: "#232a33",
    header: "#20262e",
    border: "#46515e",
    text: "#eef2f6",
    sub: "#aeb9c6",
    accent: "#42a9e6",
    accentSoft: "#173d57",
};
const cadPaletteInputStyle = {
    background: "#20262e",
    border: `1px solid ${cadPalette.border}`,
    color: cadPalette.text,
};
const projectDockTheme = {
    bg: "#171d25",
    surface: "#1c232c",
    surface2: "#222b36",
    surface3: "#27323e",
    border: "#3d4957",
    borderSoft: "#303b47",
    text: "#e8eef6",
    sub: "#91a0b2",
    muted: "#6f7e91",
    accent: "#1591d2",
    accentStrong: "#0f5f97",
    accentSoft: "#163e59",
    success: "#62d89e",
    successSoft: "rgba(16, 124, 78, .24)",
};
const projectDockInputStyle = {
    height: 36,
    borderRadius: 6,
    border: `1px solid ${projectDockTheme.border}`,
    background: "#141a22",
    color: projectDockTheme.text,
    boxShadow: "inset 0 1px 2px rgba(0,0,0,.38)",
};
const projectDockButtonStyle = {
    height: 32,
    borderRadius: 5,
    border: `1px solid ${projectDockTheme.border}`,
    background: projectDockTheme.surface2,
    color: projectDockTheme.text,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.035)",
    fontSize: 11,
};
const projectDockPrimaryButtonStyle = {
    ...projectDockButtonStyle,
    border: "1px solid #187eb8",
    background: "#0f5f97",
    color: "#ffffff",
};
const editingPanelMinWidth = 280;
const editingPanelDefaultWidth = 318;
const editingPanelMaxWidth = 560;
const rlcPanelButtonStyle = {
    minHeight: 26,
    border: "1px solid rgba(148,163,184,.36)",
    borderRadius: 4,
    padding: "3px 7px",
    background: "rgba(30,41,59,.92)",
    color: "#e5edf6",
    fontSize: 9.5,
    fontWeight: 800,
    cursor: "pointer",
};
function Btn({ children, onClick, title, disabled, style, primary, active, }) {
    return (_jsx("button", { type: "button", title: title, onClick: onClick, disabled: disabled, style: {
            height: 36,
            padding: "0 12px",
            borderRadius: 9,
            border: `1px solid ${active ? ui.accent2 : primary ? ui.accent : ui.border}`,
            background: disabled
                ? "#f2f4f7"
                : active
                    ? ui.accentSoft
                    : primary
                        ? ui.accent
                        : ui.panel,
            color: disabled
                ? "#98a2b3"
                : primary
                    ? "#fff"
                    : active
                        ? ui.accent
                        : ui.text,
            fontSize: 13,
            fontWeight: 800,
            cursor: disabled ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            whiteSpace: "nowrap",
            ...style,
        }, children: children }));
}
function IconBtn({ children, onClick, title, disabled, active, }) {
    return (_jsx(Btn, { onClick: onClick, title: title, disabled: disabled, active: active, style: { width: 38, padding: 0 }, children: children }));
}
function CadIcon({ name }) {
    const common = {
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.25,
        strokeLinecap: "square",
        strokeLinejoin: "miter",
        vectorEffect: "non-scaling-stroke",
    };
    const glyphs = {
        rlcPanel: (_jsxs(_Fragment, { children: [_jsx("rect", { ...common, x: "2.5", y: "3", width: "15", height: "14", rx: "1" }), _jsx("path", { ...common, d: "M7 3v14M9.5 6h5M9.5 10h5M9.5 14h3" }), _jsx("circle", { cx: "4.8", cy: "6", r: ".9", fill: "currentColor" }), _jsx("circle", { cx: "4.8", cy: "10", r: ".9", fill: "currentColor" })] })),
        select: _jsx("path", { ...common, d: "M5 3l10 9-5 .7 2.6 5.2-2.2 1.1-2.5-5.1L5 17V3z" }),
        pan: (_jsx(_Fragment, { children: _jsx("path", { ...common, d: "M7 11V6.7a1 1 0 012 0V10 5.4a1 1 0 012 0V10 6a1 1 0 012 0v4-2.4a1 1 0 012 0v5.2c0 3.5-2 5.2-5 5.2H9c-2 0-3.1-1.1-4-2.5L3.6 13a1.1 1.1 0 011.8-1.2L7 14" }) })),
        move: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M10 3v14M3 10h14" }), _jsx("path", { ...common, d: "M10 3L8 5m2-2l2 2M17 10l-2-2m2 2l-2 2M10 17l-2-2m2 2l2-2M3 10l2-2m-2 2l2 2" })] })),
        copy: (_jsxs(_Fragment, { children: [_jsx("rect", { ...common, x: "7", y: "7", width: "9", height: "9" }), _jsx("path", { ...common, d: "M5 13H4V4h9v1" })] })),
        vertex: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M5 15l4-8 6 6" }), _jsx("rect", { ...common, x: "3.5", y: "13.5", width: "3", height: "3" }), _jsx("rect", { ...common, x: "7.5", y: "5.5", width: "3", height: "3" }), _jsx("rect", { ...common, x: "13.5", y: "11.5", width: "3", height: "3" })] })),
        line: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M4 16L16 4" }), _jsx("rect", { x: "2.8", y: "14.8", width: "2.6", height: "2.6", fill: "currentColor" }), _jsx("rect", { x: "14.6", y: "2.8", width: "2.6", height: "2.6", fill: "currentColor" })] })),
        polyline: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M3 15l4-8 5 5 5-8" }), _jsx("circle", { cx: "3", cy: "15", r: "1.25", fill: "currentColor" }), _jsx("circle", { cx: "7", cy: "7", r: "1.25", fill: "currentColor" }), _jsx("circle", { cx: "12", cy: "12", r: "1.25", fill: "currentColor" }), _jsx("circle", { cx: "17", cy: "4", r: "1.25", fill: "currentColor" })] })),
        rectangle: (_jsxs(_Fragment, { children: [_jsx("rect", { ...common, x: "3.5", y: "5", width: "13", height: "10" }), _jsx("rect", { x: "2.7", y: "13.8", width: "2.4", height: "2.4", fill: "currentColor" }), _jsx("rect", { x: "15.3", y: "3.8", width: "2.4", height: "2.4", fill: "currentColor" })] })),
        circle: (_jsxs(_Fragment, { children: [_jsx("circle", { ...common, cx: "10", cy: "10", r: "6.5" }), _jsx("circle", { cx: "10", cy: "10", r: "1.15", fill: "currentColor" })] })),
        text: (_jsx(_Fragment, { children: _jsx("path", { ...common, d: "M4 5h12M10 5v11M7 16h6" }) })),
        rotate: (_jsx(_Fragment, { children: _jsx("path", { ...common, d: "M15 7V3l3 3-3 3V7a6 6 0 10.8 5" }) })),
        scale: (_jsx(_Fragment, { children: _jsx("path", { ...common, d: "M4 8V4h4M12 16h4v-4M5 5l10 10" }) })),
        offset: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M4 14l7-9 5 4-7 9" }), _jsx("path", { ...common, d: "M2 11l7-9M11 18l7-9" })] })),
        delete: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M5 6h10M8 6V4h4v2m2 0l-1 11H7L6 6" }), _jsx("path", { ...common, d: "M9 9v5m2-5v5" })] })),
        undo: _jsx("path", { ...common, d: "M8 6L4 10l4 4M5 10h6a5 5 0 015 5" }),
        redo: _jsx("path", { ...common, d: "M12 6l4 4-4 4m3-4H9a5 5 0 00-5 5" }),
        distance: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M4 15L16 5" }), _jsx("path", { ...common, d: "M3 12v4h4M13 4h4v4" })] })),
        area: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M4 15l3-10 9 3-2 8z" }), _jsx("circle", { cx: "4", cy: "15", r: "1.2", fill: "currentColor" }), _jsx("circle", { cx: "7", cy: "5", r: "1.2", fill: "currentColor" }), _jsx("circle", { cx: "16", cy: "8", r: "1.2", fill: "currentColor" }), _jsx("circle", { cx: "14", cy: "16", r: "1.2", fill: "currentColor" })] })),
        point: (_jsxs(_Fragment, { children: [_jsx("circle", { ...common, cx: "10", cy: "10", r: "3" }), _jsx("path", { ...common, d: "M10 3v3m0 8v3M3 10h3m8 0h3" })] })),
        zoomIn: (_jsxs(_Fragment, { children: [_jsx("circle", { ...common, cx: "8.5", cy: "8.5", r: "5" }), _jsx("path", { ...common, d: "M12.2 12.2L17 17M8.5 6v5m-2.5-2.5h5" })] })),
        zoomOut: (_jsxs(_Fragment, { children: [_jsx("circle", { ...common, cx: "8.5", cy: "8.5", r: "5" }), _jsx("path", { ...common, d: "M12.2 12.2L17 17M6 8.5h5" })] })),
        fit: (_jsx(_Fragment, { children: _jsx("path", { ...common, d: "M4 8V4h4M12 4h4v4M16 12v4h-4M8 16H4v-4" }) })),
        fullscreen: (_jsx(_Fragment, { children: _jsx("path", { ...common, d: "M3.5 8V3.5H8M12 3.5h4.5V8M16.5 12v4.5H12M8 16.5H3.5V12" }) })),
        grid: (_jsx(_Fragment, { children: _jsx("path", { ...common, d: "M4 4h12v12H4zM8 4v12m4-12v12M4 8h12M4 12h12" }) })),
        label: (_jsx(_Fragment, { children: _jsx("path", { ...common, d: "M4 5h12M10 5v11M7 16h6" }) })),
        utm: (_jsxs(_Fragment, { children: [_jsx("circle", { ...common, cx: "10", cy: "10", r: "7" }), _jsx("path", { ...common, d: "M3 10h14M10 3c2 2 3 4.3 3 7s-1 5-3 7c-2-2-3-4.3-3-7s1-5 3-7z" })] })),
        snap: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M4.5 4v8a5.5 5.5 0 0011 0V4" }), _jsx("path", { ...common, d: "M4.5 8h4m3 0h4M4.5 4h4m3 0h4" }), _jsx("rect", { x: "8.4", y: "12.4", width: "3.2", height: "3.2", fill: "currentColor" })] })),
        ortho: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M4 16V4h12" }), _jsx("path", { ...common, d: "M7 13h6V7" }), _jsx("rect", { x: "3", y: "15", width: "2.5", height: "2.5", fill: "currentColor" }), _jsx("rect", { x: "14.5", y: "2.5", width: "2.5", height: "2.5", fill: "currentColor" })] })),
        dimLinear: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M4 14h12M6 6v8M14 6v8" }), _jsx("path", { ...common, d: "M4 14l2-1.7M4 14l2 1.7M16 14l-2-1.7M16 14l-2 1.7" })] })),
        dimAligned: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M5 15L15 5M6.8 6.8l-2.2 8.1M13.2 13.2l2.2-8.1" }), _jsx("path", { ...common, d: "M5 15l2-.3M5 15l.3-2M15 5l-2 .3M15 5l-.3 2" })] })),
        hatch: (_jsxs(_Fragment, { children: [_jsx("rect", { ...common, x: "4", y: "4", width: "12", height: "12" }), _jsx("path", { ...common, d: "M5 12l7-7M5 16l11-11M9 16l7-7M13 16l3-3" })] })),
        boundary: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M4 7l4-3 5 2 3 5-4 5H6l-2-4z" }), _jsx("circle", { cx: "8", cy: "4", r: "1", fill: "currentColor" }), _jsx("circle", { cx: "16", cy: "11", r: "1", fill: "currentColor" })] })),
        trim: (_jsx(_Fragment, { children: _jsx("path", { ...common, d: "M3 6h14M7 3l6 12M13 3L7 15" }) })),
        extend: (_jsx(_Fragment, { children: _jsx("path", { ...common, d: "M4 14h5M9 14l7-7M12 7h4v4" }) })),
        join: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M4 14l4-4M12 10l4-4" }), _jsx("circle", { ...common, cx: "4", cy: "14", r: "1.3" }), _jsx("circle", { ...common, cx: "8", cy: "10", r: "1.3" }), _jsx("circle", { ...common, cx: "12", cy: "10", r: "1.3" }), _jsx("circle", { ...common, cx: "16", cy: "6", r: "1.3" })] })),
        fillet: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M5 15V8h7" }), _jsx("path", { ...common, d: "M12 8a4 4 0 014 4" })] })),
        mirror: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M10 3v14" }), _jsx("path", { ...common, d: "M7 6L4 9l3 3M13 6l3 3-3 3" })] })),
        explode: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M8 8L4 4M12 8l4-4M8 12l-4 4M12 12l4 4" }), _jsx("path", { ...common, d: "M4 7V4h3M13 4h3v3M4 13v3h3M16 13v3h-3" }), _jsx("rect", { x: "8.2", y: "8.2", width: "3.6", height: "3.6", fill: "none", stroke: "currentColor", strokeWidth: "1.2" })] })),
        newLayer: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M10 4l6 3-6 3-6-3 6-3zM4 10l6 3 6-3M4 13l6 3 6-3" }), _jsx("path", { ...common, d: "M16 3v5M13.5 5.5h5" })] })),
        clear: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M5 14l7-9 3 3-7 9H5z" }), _jsx("path", { ...common, d: "M10 15h6" })] })),
    };
    return (_jsx("svg", { viewBox: "0 0 20 20", width: "17", height: "17", "aria-hidden": "true", style: { display: "block" }, children: glyphs[name] }));
}
function CadToolButton({ icon, title, active, disabled, onClick, tone = "neutral", }) {
    const semanticAccent = {
        neutral: "#c9d2dc",
        blue: "#a9d8f5",
        green: "#b8dec9",
        amber: "#e1ca98",
        violet: "#cdbce1",
        red: "#e1b3b7",
    }[tone];
    return (_jsx("button", { type: "button", title: title, "aria-label": title, "aria-pressed": active, disabled: disabled, onClick: onClick, style: {
            width: 29,
            height: 29,
            flex: "0 0 29px",
            padding: 0,
            borderRadius: 3,
            border: `1px solid ${active
                ? "#39a9e8"
                : disabled
                    ? "#27313d"
                    : "#44505e"}`,
            background: disabled
                ? "#111821"
                : active
                    ? "linear-gradient(180deg,#176fa8 0%,#0c4f7e 100%)"
                    : "linear-gradient(180deg,#252e39 0%,#1a222c 100%)",
            color: disabled ? "#4b5968" : active ? "#ffffff" : semanticAccent,
            display: "grid",
            placeItems: "center",
            cursor: disabled ? "not-allowed" : "pointer",
            boxShadow: active
                ? "inset 0 1px 0 rgba(255,255,255,.18),0 0 0 1px rgba(57,169,232,.14)"
                : "inset 0 1px 0 rgba(255,255,255,.045)",
            transition: "border-color .12s ease, background .12s ease, color .12s ease",
        }, onMouseEnter: (event) => {
            if (disabled || active)
                return;
            event.currentTarget.style.borderColor = "#657383";
            event.currentTarget.style.background =
                "linear-gradient(180deg,#2b3642 0%,#202934 100%)";
        }, onMouseLeave: (event) => {
            if (disabled || active)
                return;
            event.currentTarget.style.borderColor = "#44505e";
            event.currentTarget.style.background =
                "linear-gradient(180deg,#252e39 0%,#1a222c 100%)";
        }, children: _jsx(CadIcon, { name: icon }) }));
}
function CadToolbarGroup({ label, children, }) {
    return (_jsxs("div", { style: {
            display: "flex",
            alignItems: "center",
            gap: 4,
            paddingRight: 6,
            marginRight: 4,
            borderRight: "1px solid #3a4654",
        }, children: [_jsx("span", { style: {
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    color: "#9fb0c2",
                    minWidth: 58,
                }, children: label }), _jsx("div", { style: { display: "flex", alignItems: "center", gap: 3 }, children: children })] }));
}
function Card({ title, subtitle, children, style, action, tone = "default", compact = false, }) {
    const dark = tone === "cadDark";
    return (_jsxs("section", { style: {
            border: `1px solid ${dark ? cadPalette.border : ui.border}`,
            borderRadius: 14,
            background: dark ? cadPalette.bg : ui.panel,
            color: dark ? cadPalette.text : ui.text,
            boxShadow: ui.shadow,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            ...style,
        }, children: [_jsxs("header", { style: {
                    minHeight: compact ? 32 : 50,
                    flex: "0 0 auto",
                    padding: compact ? "0 10px" : "0 14px",
                    borderBottom: `1px solid ${dark ? cadPalette.border : ui.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    background: dark ? cadPalette.header : ui.panel,
                }, children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: {
                                    fontSize: compact ? 12 : 14,
                                    fontWeight: 950,
                                    color: dark ? cadPalette.text : ui.text,
                                }, children: title }), subtitle && !compact ? (_jsx("div", { style: {
                                    marginTop: 2,
                                    fontSize: 11,
                                    color: dark ? cadPalette.sub : ui.sub,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }, children: subtitle })) : null] }), action] }), _jsx("div", { style: {
                    flex: "1 1 auto",
                    minHeight: 0,
                    background: dark ? cadPalette.bg : undefined,
                }, children: children })] }));
}
function Input(props) {
    return (_jsx("input", { ...props, style: {
            width: "100%",
            height: 36,
            borderRadius: 9,
            border: `1px solid ${ui.border}`,
            padding: "0 10px",
            fontSize: 13,
            color: ui.text,
            outline: "none",
            background: ui.panel,
            boxSizing: "border-box",
            ...(props.style || {}),
        } }));
}
function Select(props) {
    return (_jsx("select", { ...props, style: {
            width: "100%",
            height: 36,
            borderRadius: 9,
            border: `1px solid ${ui.border}`,
            padding: "0 10px",
            fontSize: 13,
            color: ui.text,
            outline: "none",
            background: ui.panel,
            boxSizing: "border-box",
            ...(props.style || {}),
        } }));
}
function Badge({ children, tone = "neutral", }) {
    const colors = {
        neutral: { bg: "#f2f4f7", fg: "#475467" },
        success: { bg: "#ecfdf3", fg: ui.success },
        warning: { bg: "#fffaeb", fg: ui.warning },
        danger: { bg: "#fef3f2", fg: ui.danger },
        blue: { bg: ui.accentSoft, fg: ui.accent },
    }[tone];
    return (_jsx("span", { style: {
            display: "inline-flex",
            alignItems: "center",
            minHeight: 24,
            borderRadius: 999,
            padding: "0 9px",
            background: colors.bg,
            color: colors.fg,
            fontSize: 11,
            fontWeight: 850,
        }, children: children }));
}
function CadRibbonIcon({ name }) {
    const common = {
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.45,
        strokeLinecap: "round",
        strokeLinejoin: "round",
    };
    const icons = {
        project: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M2.8 6.2h5l1.5 1.8h7.9v7.7H2.8z" }), _jsx("path", { ...common, d: "M2.8 6.2V4.4h5.4l1.4 1.8" })] })),
        newDrawing: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M5 2.8h6.7l3.3 3.3v11.1H5z" }), _jsx("path", { ...common, d: "M11.7 2.8v3.4H15" }), _jsx("path", { ...common, d: "M10 8v6M7 11h6" })] })),
        openProject: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M2.8 6.5h5.1l1.4 1.7h7.9l-2.1 7.2H4.4z" }), _jsx("path", { ...common, d: "M3.2 6.5V4.6h5l1.4 1.9" })] })),
        openCad: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M5 2.8h6.7l3.3 3.3v11.1H5z" }), _jsx("path", { ...common, d: "M11.7 2.8v3.4H15" }), _jsx("path", { ...common, d: "M7.3 13.8l2.1-4.3 3.2 2.2" })] })),
        openPoints: (_jsxs(_Fragment, { children: [_jsx("circle", { ...common, cx: "10", cy: "10", r: "4.2" }), _jsx("path", { ...common, d: "M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3" }), _jsx("circle", { cx: "10", cy: "10", r: "1.15", fill: "currentColor" })] })),
        save: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M4 3.2h10.3l2 2v11.6H4z" }), _jsx("path", { ...common, d: "M6.3 3.2v4.2h6.9V3.2M6.8 16.8v-5.5h6.4v5.5" })] })),
        saveAs: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M3.5 3.2h9.4l1.9 1.9v6.1" }), _jsx("path", { ...common, d: "M3.5 3.2v13.6h7" }), _jsx("path", { ...common, d: "M5.8 3.2v4h6.1v-4M6.2 16.8v-5.2h4.8" }), _jsx("path", { ...common, d: "M11.3 15.8l4.3-4.3 1.5 1.5-4.3 4.3-2 .5z" })] })),
        dxf: (_jsxs(_Fragment, { children: [_jsx("path", { ...common, d: "M5 2.8h6.5l3.5 3.5v10.9H5z" }), _jsx("path", { ...common, d: "M11.5 2.8v3.5H15" }), _jsx("text", { x: "6.2", y: "14.2", fill: "currentColor", fontSize: "4.7", fontWeight: "900", children: "DXF" })] })),
        geojson: (_jsxs(_Fragment, { children: [_jsx("circle", { ...common, cx: "10", cy: "10", r: "6.6" }), _jsx("path", { ...common, d: "M3.6 10h12.8M10 3.4c2 2 3 4.2 3 6.6s-1 4.6-3 6.6c-2-2-3-4.2-3-6.6s1-4.6 3-6.6z" }), _jsx("path", { ...common, d: "M2.5 5.7l-1.3 1.2 1.3 1.2M17.5 11.9l1.3 1.2-1.3 1.2" })] })),
        csv: (_jsxs(_Fragment, { children: [_jsx("rect", { ...common, x: "3", y: "3.7", width: "14", height: "12.6", rx: "1" }), _jsx("path", { ...common, d: "M3 8h14M3 12h14M7.6 3.7v12.6M12.3 3.7v12.6" })] })),
    };
    return (_jsx("svg", { viewBox: "0 0 20 20", width: "16", height: "16", "aria-hidden": "true", style: { display: "block" }, children: icons[name] }));
}
function CadRibbonButton({ icon, label, onClick, disabled, primary, active, title, }) {
    return (_jsxs("button", { type: "button", title: title || label, "aria-label": title || label, disabled: disabled, onClick: onClick, style: {
            minWidth: 0,
            height: 32,
            padding: "0 8px",
            borderRadius: 4,
            border: `1px solid ${active || primary ? "#2f9bd1" : "rgba(255,255,255,.14)"}`,
            background: disabled
                ? "rgba(15,23,42,.38)"
                : active || primary
                    ? "#0f5f97"
                    : "#202a36",
            color: disabled ? "#617084" : "#e8eef6",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontSize: 10.5,
            fontWeight: 850,
            cursor: disabled ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
            boxShadow: active || primary
                ? "inset 0 1px 0 rgba(255,255,255,.12)"
                : "inset 0 1px 0 rgba(255,255,255,.035)",
        }, children: [_jsx(CadRibbonIcon, { name: icon }), _jsx("span", { style: { overflow: "hidden", textOverflow: "ellipsis" }, children: label })] }));
}
function CadRibbonGroup({ title, children, style, }) {
    return (_jsxs("section", { style: {
            minWidth: 0,
            padding: "4px 5px 5px",
            border: "1px solid rgba(255,255,255,.10)",
            borderRadius: 5,
            background: "#18212b",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.025)",
            ...style,
        }, children: [_jsx("div", { style: {
                    height: 15,
                    padding: "0 2px",
                    color: "#8090a4",
                    fontSize: 8.5,
                    fontWeight: 900,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                }, children: title }), _jsx("div", { style: {
                    display: "grid",
                    gridAutoFlow: "column",
                    gridAutoColumns: "minmax(0, max-content)",
                    justifyContent: "start",
                    alignItems: "center",
                    gap: 4,
                    minHeight: 32,
                }, children: children })] }));
}
/* ================== Utils ================== */
function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
}
function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
function polylineLength(pts, closed = false) {
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++)
        s += dist(pts[i], pts[i + 1]);
    if (closed && pts.length > 2)
        s += dist(pts[pts.length - 1], pts[0]);
    return s;
}
function polyArea(pts) {
    if (pts.length < 3)
        return 0;
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        s += p.x * q.y - q.x * p.y;
    }
    return Math.abs(s) / 2;
}
function centroid(pts) {
    if (!pts.length)
        return { x: 0, y: 0 };
    const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / pts.length, y: sum.y / pts.length };
}
function cadToCanvas(point) {
    return { x: point.x, y: -point.y };
}
function canvasToCad(point) {
    return { x: point.x, y: -point.y };
}
function expandBounds(bounds, paddingRatio = 0.05) {
    const w = Math.max(1, bounds.maxX - bounds.minX);
    const h = Math.max(1, bounds.maxY - bounds.minY);
    const px = w * paddingRatio;
    const py = h * paddingRatio;
    return {
        minX: bounds.minX - px,
        minY: bounds.minY - py,
        maxX: bounds.maxX + px,
        maxY: bounds.maxY + py,
    };
}
function boundsFromPoints(points) {
    if (!points.length)
        return null;
    let minX = points[0].x;
    let minY = points[0].y;
    let maxX = points[0].x;
    let maxY = points[0].y;
    for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY };
}
function featureBounds(feature) {
    const points = [...(feature.pts || [])];
    if (feature.kind === "circle" &&
        feature.pts?.[0] &&
        Number(feature.radius || 0) > 0) {
        const center = feature.pts[0];
        const radius = Number(feature.radius || 0);
        points.push({ x: center.x - radius, y: center.y - radius }, { x: center.x + radius, y: center.y + radius });
    }
    return boundsFromPoints(points);
}
function normalizedBounds(a, b) {
    return {
        minX: Math.min(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxX: Math.max(a.x, b.x),
        maxY: Math.max(a.y, b.y),
    };
}
function boundsIntersect(a, b) {
    return !(a.maxX < b.minX ||
        a.minX > b.maxX ||
        a.maxY < b.minY ||
        a.minY > b.maxY);
}
function centerOfFeatures(features) {
    const points = features.flatMap((feature) => {
        const bounds = featureBounds(feature);
        return bounds
            ? [
                { x: bounds.minX, y: bounds.minY },
                { x: bounds.maxX, y: bounds.maxY },
            ]
            : [];
    });
    const bounds = boundsFromPoints(points);
    return bounds
        ? {
            x: (bounds.minX + bounds.maxX) / 2,
            y: (bounds.minY + bounds.maxY) / 2,
        }
        : { x: 0, y: 0 };
}
function boundsToViewBox(b) {
    return {
        x: b.minX,
        y: b.minY,
        width: Math.max(1, b.maxX - b.minX),
        height: Math.max(1, b.maxY - b.minY),
    };
}
function boundsToAspectViewBox(b, aspect) {
    const base = boundsToViewBox(b);
    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    const currentAspect = base.width / base.height;
    if (Math.abs(currentAspect - safeAspect) < 0.0001)
        return base;
    const centerX = base.x + base.width / 2;
    const centerY = base.y + base.height / 2;
    if (currentAspect < safeAspect) {
        const width = base.height * safeAspect;
        return {
            x: centerX - width / 2,
            y: base.y,
            width,
            height: base.height,
        };
    }
    const height = base.width / safeAspect;
    return {
        x: base.x,
        y: centerY - height / 2,
        width: base.width,
        height,
    };
}
function formatNumber(n, digits = 3) {
    return Number.isFinite(n)
        ? n.toLocaleString("de-DE", {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        })
        : "0,000";
}
function getCurrentProject(ctx) {
    return (ctx?.currentProject ??
        ctx?.selectedProject ??
        ctx?.current ??
        ctx?.project ??
        (typeof ctx?.getCurrentProject === "function"
            ? ctx.getCurrentProject()
            : null));
}
function hashColor(value) {
    const palette = [
        "#4cc9f0",
        "#f72585",
        "#b8f2e6",
        "#ffd166",
        "#90be6d",
        "#c77dff",
        "#ff9f1c",
        "#7bdff2",
        "#f28482",
        "#bde0fe",
        "#e9c46a",
        "#8ecae6",
    ];
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return palette[Math.abs(hash) % palette.length];
}
function featureColor(feature) {
    const dxfColor = String(feature.style?.color || feature.meta?.color || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(dxfColor))
        return dxfColor;
    if (/^[0-9a-f]{6}$/i.test(dxfColor))
        return `#${dxfColor}`;
    if (/^rgba?\(/i.test(dxfColor))
        return dxfColor;
    if (/^\d{1,3}[,;]\d{1,3}[,;]\d{1,3}$/.test(dxfColor)) {
        const [r, g, b] = dxfColor.split(/[,;]/).map(Number);
        return `rgb(${clamp(r, 0, 255)},${clamp(g, 0, 255)},${clamp(b, 0, 255)})`;
    }
    return hashColor(String(feature.layer || "0"));
}
function featureLineWeightMm(feature) {
    const raw = Number(feature.style?.lineWeight ??
        feature.style?.strokeWidth ??
        feature.meta?.lineWeight ??
        feature.meta?.lineweight ??
        0);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
}
function featureGlobalWidth(feature) {
    const raw = Number(feature.style?.globalWidth ??
        feature.meta?.globalWidth ??
        feature.meta?.constantWidth ??
        0);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
}
function featureStrokeWidth(feature, active = false) {
    const raw = featureLineWeightMm(feature);
    const base = raw > 0
        ? clamp(raw > 10 ? raw / 25 : raw * 4, 0.85, 6)
        : 1.15;
    return active ? Math.max(base, 2.4) : base;
}
function featureDashArray(feature) {
    const explicit = feature.style?.dashArray ??
        feature.meta?.dashArray ??
        feature.meta?.linetypePattern;
    if (Array.isArray(explicit) && explicit.length) {
        return explicit
            .map((value) => Math.max(1, Math.abs(Number(value) || 0)))
            .join(" ");
    }
    if (typeof explicit === "string" && explicit.trim())
        return explicit;
    const linetype = String(feature.style?.lineType ??
        feature.style?.linetype ??
        feature.meta?.lineType ??
        feature.meta?.linetype ??
        "").toLowerCase();
    if (/dashdot|strichpunkt/.test(linetype))
        return "10 4 2 4";
    if (/center|achse/.test(linetype))
        return "12 4 3 4";
    if (/hidden|dashed|gestrichelt/.test(linetype))
        return "8 5";
    if (/dot|punkt/.test(linetype))
        return "2 4";
    return undefined;
}
function featureOpacity(feature) {
    const raw = Number(feature.style?.opacity ?? feature.meta?.opacity ?? 1);
    return Number.isFinite(raw) ? clamp(raw, 0.18, 1) : 1;
}
function featureTextLines(feature) {
    return String(feature.text || feature.name || "Text")
        .replace(/\\P/gi, "\n")
        .replace(/\\~/g, " ")
        .replace(/%%d/gi, "Â°")
        .replace(/%%p/gi, "Â±")
        .replace(/%%c/gi, "Ã˜")
        .replace(/\r/g, "")
        .split("\n");
}
function isPresentationLayer(feature) {
    return Boolean(feature.meta?.paperSpace);
}
/* DXF_DIMENSION_ARRAY_GUARD_V15_31
 * In DXF, group codes 70/71 have a different meaning for DIMENSION than for
 * INSERT. The current geometry engine expands both through the INSERT-array
 * path, so a DIMENSION flag such as 32 can incorrectly become 32 columns and
 * an attachment value such as 5 can become 5 rows. On real drawings this
 * multiplies a few hundred dimensions into hundreds of thousands of objects.
 * Normalize only DIMENSION 70/71 before parsing; true INSERT arrays remain
 * untouched.
 */
/* DXF_VISUAL_ARTIFACT_FILTER_V15_34
 * The lightweight SVG engine does not yet reproduce several AutoCAD helper
 * entities faithfully. Parsing them as ordinary polygons/polylines creates
 * giant white triangles and yellow radial lines that do not exist in the
 * original drawing. Remove only these raw DXF entity records before geometry
 * conversion; normal LINE/LWPOLYLINE/POLYLINE/ARC/CIRCLE/TEXT/INSERT entities
 * remain untouched.
 */
function sanitizeDxfVisualArtifacts(source) {
    const blockedTypes = new Set([
        "SOLID",
        "TRACE",
        "3DFACE",
        "LEADER",
        "MLEADER",
        "HATCH",
        "WIPEOUT",
        "IMAGE",
        "IMAGEDEF",
        "UNDERLAY",
        "PDFUNDERLAY",
        "DGNUNDERLAY",
        "DWFUNDERLAY",
    ]);
    const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
    const output = [];
    const removedByType = {};
    let skipCurrentEntity = false;
    for (let index = 0; index + 1 < lines.length; index += 2) {
        const codeLine = lines[index];
        const valueLine = lines[index + 1];
        const code = Number(String(codeLine || "").trim());
        if (code === 0) {
            const entityType = String(valueLine || "").trim().toUpperCase();
            skipCurrentEntity = blockedTypes.has(entityType);
            if (skipCurrentEntity) {
                removedByType[entityType] = (removedByType[entityType] || 0) + 1;
                continue;
            }
        }
        if (!skipCurrentEntity) {
            output.push(codeLine, valueLine);
        }
    }
    if (lines.length % 2)
        output.push(lines[lines.length - 1]);
    return {
        text: output.join("\n"),
        removedByType,
        removed: Object.values(removedByType).reduce((sum, count) => sum + count, 0),
    };
}
function sanitizeDxfDimensionArrayCodes(source) {
    const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
    let entityType = "";
    for (let index = 0; index + 1 < lines.length; index += 2) {
        const code = Number(lines[index].trim());
        if (!Number.isFinite(code))
            continue;
        if (code === 0) {
            entityType = String(lines[index + 1] || "").trim().toUpperCase();
            continue;
        }
        if (entityType === "DIMENSION" && (code === 70 || code === 71)) {
            lines[index + 1] = "1";
        }
    }
    return lines.join("\n");
}
/* DXF_SPATIAL_CLUSTER_FIX_V15_32
 * Some survey DXF files contain WIPEOUT/HATCH/IMAGE helper coordinates,
 * malformed block geometry or local UCS coordinates far away from the actual
 * georeferenced drawing. They must not participate in Zoom Extents, otherwise
 * the real plan collapses into a few dots. Keep the dominant spatial cluster
 * only when the total spread is clearly pathological.
 */
function medianNumber(values) {
    if (!values.length)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}
function sanitizeDxfSpatialOutliers(features) {
    if (features.length < 50) {
        return { features, removed: 0 };
    }
    const located = features
        .map((feature) => {
        const bounds = featureBounds(feature);
        if (!bounds)
            return null;
        const center = {
            x: (bounds.minX + bounds.maxX) / 2,
            y: (bounds.minY + bounds.maxY) / 2,
        };
        if (!Number.isFinite(center.x) || !Number.isFinite(center.y))
            return null;
        return { feature, bounds, center };
    })
        .filter((entry) => Boolean(entry));
    if (located.length < 50) {
        return { features, removed: 0 };
    }
    const medianX = medianNumber(located.map((entry) => entry.center.x));
    const medianY = medianNumber(located.map((entry) => entry.center.y));
    const distances = located.map((entry) => Math.hypot(entry.center.x - medianX, entry.center.y - medianY));
    const medianDistance = medianNumber(distances);
    const robustRadius = Math.max(1000, medianDistance * 40);
    const totalBounds = boundsFromPoints(located.flatMap((entry) => [
        { x: entry.bounds.minX, y: entry.bounds.minY },
        { x: entry.bounds.maxX, y: entry.bounds.maxY },
    ]));
    const totalSpan = totalBounds
        ? Math.max(totalBounds.maxX - totalBounds.minX, totalBounds.maxY - totalBounds.minY)
        : 0;
    // Only activate this safety filter when the global extent is wildly larger
    // than the robust drawing radius. Normal large-area drawings stay untouched.
    if (totalSpan < Math.max(50000, robustRadius * 20)) {
        return { features, removed: 0 };
    }
    const keepIds = new Set(located
        .filter((entry) => {
        const distance = Math.hypot(entry.center.x - medianX, entry.center.y - medianY);
        const width = entry.bounds.maxX - entry.bounds.minX;
        const height = entry.bounds.maxY - entry.bounds.minY;
        const pathologicalOwnExtent = Math.max(width, height) > Math.max(50000, robustRadius * 10);
        return distance <= robustRadius && !pathologicalOwnExtent;
    })
        .map((entry) => String(entry.feature.id || "")));
    const cleaned = features.filter((feature) => {
        const id = String(feature.id || "");
        const bounds = featureBounds(feature);
        return !bounds || keepIds.has(id);
    });
    // Never accept an over-aggressive cleanup.
    if (cleaned.length < Math.max(25, features.length * 0.35)) {
        return { features, removed: 0 };
    }
    return { features: cleaned, removed: features.length - cleaned.length };
}
async function decodeDxfFile(file) {
    const bytes = await file.arrayBuffer();
    const signature = new Uint8Array(bytes.slice(0, 22));
    const signatureText = Array.from(signature)
        .map((value) => String.fromCharCode(value))
        .join("");
    if (signatureText.startsWith("AutoCAD Binary DXF")) {
        throw new Error("BinÃ¤res DXF erkannt. Bitte die Zeichnung als ASCII-DXF speichern.");
    }
    try {
        const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (!utf8.includes("\uFFFD"))
            return utf8;
    }
    catch {
        // Older German CAD exports commonly use ANSI / Windows-1252.
    }
    return new TextDecoder("windows-1252").decode(bytes);
}
function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    downloadBlob(filename, blob);
}
function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
}
/* ================== CAD drawing library ================== */
function cadDrawingSafeId(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9Ã¤Ã¶Ã¼ÃŸ._-]+/gi, "_")
        .replace(/^_+|_+$/g, "") || "zeichnung";
}
function createCadDrawingId(name) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${cadDrawingSafeId(name)}_${timestamp}_${random}`;
}
function cadDrawingLocalIndexKey(projectId) {
    return `rlc_cad_drawing_index_${projectId.trim()}`;
}
function cadDrawingLocalDataKey(projectId, id) {
    return `rlc_cad_drawing_data_${projectId.trim()}_${id}`;
}
function unwrapCadPayload(value) {
    return (value?.data?.document ??
        value?.data?.drawing ??
        value?.data?.takeoff ??
        value?.document ??
        value?.drawing ??
        value?.takeoff ??
        value?.data ??
        value ??
        {});
}
function extractCadDrawingList(value) {
    const candidates = [
        value?.drawings,
        value?.files,
        value?.items,
        value?.rows,
        value?.data?.drawings,
        value?.data?.files,
        value?.data?.items,
        value?.data?.rows,
        value?.result?.drawings,
        value?.result?.files,
        value?.result?.items,
    ];
    const source = candidates.find(Array.isArray) || [];
    return source
        .map((entry, index) => {
        const embedded = unwrapCadPayload(entry);
        const embeddedCount = normalizeCadFeatures(embedded).length;
        const drawingName = String(entry?.drawingName ??
            entry?.name ??
            entry?.title ??
            embedded?.drawingName ??
            entry?.fileName ??
            embedded?.fileName ??
            `Zeichnung ${index + 1}`).trim();
        const fileName = String(entry?.fileName ?? embedded?.fileName ?? "").trim();
        const rawId = String(entry?.drawingId ??
            embedded?.drawingId ??
            entry?.id ??
            entry?.fileId ??
            entry?.key ??
            fileName ??
            drawingName).trim();
        if (!drawingName && !rawId)
            return null;
        const objectCount = Number(entry?.objectCount ??
            entry?.featureCount ??
            entry?.count ??
            embeddedCount);
        // Le righe restituite da /api/cad/drawings sono normalmente
        // solo metadati. drawingName/fileName non significano che la
        // geometria sia giÃ  incorporata.
        const hasEmbeddedData = embeddedCount > 0 ||
            Array.isArray(embedded?.features) ||
            Array.isArray(embedded?.utmPoints) ||
            Array.isArray(embedded?.points);
        return {
            id: rawId || cadDrawingSafeId(fileName || drawingName),
            drawingName: drawingName || fileName || "Zeichnung",
            fileName: fileName || undefined,
            updatedAt: String(entry?.updatedAt ??
                entry?.modifiedAt ??
                entry?.savedAt ??
                entry?.createdAt ??
                "").trim() || undefined,
            objectCount: Number.isFinite(objectCount) ? objectCount : undefined,
            data: hasEmbeddedData ? embedded : undefined,
            source: "server",
        };
    })
        .filter((item) => Boolean(item));
}
function readLocalCadDrawingList(projectId) {
    try {
        const raw = localStorage.getItem(cadDrawingLocalIndexKey(projectId));
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed))
            return [];
        return parsed
            .map((item) => {
            const id = String(item?.id || "").trim();
            const drawingName = String(item?.drawingName || item?.fileName || "").trim();
            if (!id || !drawingName)
                return null;
            return {
                id,
                drawingName,
                fileName: String(item?.fileName || "").trim() || undefined,
                updatedAt: String(item?.updatedAt || "").trim() || undefined,
                objectCount: Number.isFinite(Number(item?.objectCount))
                    ? Number(item.objectCount)
                    : undefined,
                localStorageId: id,
                source: "browser",
            };
        })
            .filter((item) => Boolean(item));
    }
    catch {
        return [];
    }
}
function readLocalCadDrawing(projectId, id) {
    try {
        const raw = localStorage.getItem(cadDrawingLocalDataKey(projectId, id));
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
function rememberLocalCadDrawing(projectId, document, explicitDrawingId) {
    const drawingName = String(document?.drawingName || "Zeichnung").trim() || "Zeichnung";
    const fileName = String(document?.fileName || "").trim();
    const id = String(explicitDrawingId || document?.drawingId || "").trim() ||
        createCadDrawingId(drawingName);
    const storedDocument = {
        ...document,
        drawingId: id,
        drawingName,
        fileName: fileName || `${cadDrawingSafeId(drawingName)}.rlccad.json`,
    };
    const objectCount = normalizeCadFeatures(storedDocument).length;
    const updatedAt = new Date().toISOString();
    try {
        localStorage.setItem(cadDrawingLocalDataKey(projectId, id), JSON.stringify(storedDocument));
        const previous = readLocalCadDrawingList(projectId).filter((item) => item.id !== id);
        const next = [
            {
                id,
                drawingName,
                fileName: storedDocument.fileName,
                updatedAt,
                objectCount,
            },
            ...previous,
        ].slice(0, 50);
        localStorage.setItem(cadDrawingLocalIndexKey(projectId), JSON.stringify(next));
    }
    catch {
        // Server storage remains authoritative when browser quota is exhausted.
    }
    return id;
}
/* ================== CSV / UTM ================== */
function parsePointNumber(value) {
    const raw = String(value ?? "")
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\s+/g, "")
        .replace(/m$/i, "");
    if (!raw)
        return undefined;
    let normalized = raw;
    if (raw.includes(",") && raw.includes(".")) {
        normalized =
            raw.lastIndexOf(",") > raw.lastIndexOf(".")
                ? raw.replace(/\./g, "").replace(",", ".")
                : raw.replace(/,/g, "");
    }
    else if (raw.includes(",")) {
        normalized = raw.replace(",", ".");
    }
    const direct = Number(normalized);
    if (Number.isFinite(direct))
        return direct;
    const match = normalized.match(/[-+]?\d+(?:\.\d+)?/);
    if (!match)
        return undefined;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : undefined;
}
function splitPointCsvLine(line, delimiter) {
    const output = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];
        if (char === '"') {
            if (quoted && next === '"') {
                current += '"';
                index += 1;
            }
            else {
                quoted = !quoted;
            }
            continue;
        }
        if (char === delimiter && !quoted) {
            output.push(current.trim());
            current = "";
            continue;
        }
        current += char;
    }
    output.push(current.trim());
    return output;
}
function detectPointDelimiter(lines) {
    const sample = lines.find((line) => line.trim()) || "";
    const candidates = [";", "\t", ","];
    const best = candidates
        .map((delimiter) => ({
        delimiter,
        count: splitPointCsvLine(sample, delimiter).length - 1,
    }))
        .sort((a, b) => b.count - a.count)[0];
    if (best && best.count > 0)
        return best.delimiter;
    return "__WHITESPACE__";
}
function pointHeaderKey(value) {
    return String(value ?? "")
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[-_]/g, "");
}
function parseUtmCsvFlexible(text) {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));
    if (!lines.length)
        return [];
    const delimiter = detectPointDelimiter(lines);
    const rows = lines.map((line) => delimiter === "__WHITESPACE__"
        ? line.split(/\s+/).filter(Boolean)
        : splitPointCsvLine(line, delimiter));
    const headerKeys = rows[0].map(pointHeaderKey);
    const eastingHeaderWords = new Set([
        "e", "east", "easting", "rechtswert", "rw", "x", "ost",
        "xcoord", "xkoordinate",
    ]);
    const northingHeaderWords = new Set([
        "n", "north", "northing", "hochwert", "hw", "y", "nord",
        "ycoord", "ykoordinate",
    ]);
    const pointNameHeaderWords = new Set([
        "punktname", "pointname", "punktnummer", "punktnr", "pointnumber",
        "nummer", "nr", "id", "name",
    ]);
    // Eine Datenzeile darf nicht nur wegen eines Punktcodes wie "ak-ls"
    // (normalisiert: "akls") irrtÃ¼mlich als Kopfzeile erkannt werden.
    // Header nur akzeptieren, wenn echte Koordinatenspalten vorhanden sind.
    const hasEastingHeader = headerKeys.some((key) => eastingHeaderWords.has(key));
    const hasNorthingHeader = headerKeys.some((key) => northingHeaderWords.has(key));
    const hasPointNameHeader = headerKeys.some((key) => pointNameHeaderWords.has(key));
    const hasHeader = (hasEastingHeader && hasNorthingHeader) ||
        (hasPointNameHeader && (hasEastingHeader || hasNorthingHeader));
    const findHeader = (variants) => headerKeys.findIndex((key) => variants.includes(key));
    const idIdx = hasHeader
        ? findHeader(["punktname", "pointname", "punktnummer", "punktnr", "pointnumber", "nummer", "nr", "id", "name"])
        : -1;
    const eIdx = hasHeader
        ? findHeader(["e", "east", "easting", "rechtswert", "rw", "x", "ost", "xcoord", "xkoordinate"])
        : -1;
    const nIdx = hasHeader
        ? findHeader(["n", "north", "northing", "hochwert", "hw", "y", "nord", "ycoord", "ykoordinate"])
        : -1;
    const hIdx = hasHeader
        ? findHeader(["height", "hoehe", "hÃ¶he", "z", "elevation", "altitude", "orthometricheight"])
        : -1;
    const codeIdx = hasHeader
        ? findHeader(["code", "punktcode", "pointcode", "artcode", "objektcode", "featurecode", "symbolcode", "kenncode", "akls"])
        : -1;
    const sourceRows = hasHeader ? rows.slice(1) : rows;
    const points = [];
    sourceRows.forEach((rawColumns) => {
        if (!rawColumns.length)
            return;
        // Toleranter Vermessungsparser wie im GPS-Modul: repariert u. a.
        // Punktname,Easting Northing,HÃ¶he,Code sowie gemischte Leerzeichen/Kommas.
        let columns = [...rawColumns];
        if (!hasHeader && columns.length === 4) {
            const pair = String(columns[1] ?? "").trim().split(/\s+/).filter(Boolean);
            if (pair.length >= 2) {
                columns = [columns[0], pair[0], pair[1], columns[2], columns[3]];
            }
        }
        let id = "";
        let code = "";
        let easting;
        let northing;
        let height;
        if (hasHeader) {
            id = idIdx >= 0 ? String(columns[idIdx] ?? "").trim() : "";
            code = codeIdx >= 0 ? String(columns[codeIdx] ?? "").trim() : "";
            easting = eIdx >= 0 ? parsePointNumber(columns[eIdx]) : undefined;
            northing = nIdx >= 0 ? parsePointNumber(columns[nIdx]) : undefined;
            height = hIdx >= 0 ? parsePointNumber(columns[hIdx]) : undefined;
        }
        else {
            // Standard survey format: Punktname, Rechtswert, Hochwert, HÃ¶he, Code.
            id = String(columns[0] ?? "").replace(/^\uFEFF/, "").trim();
            code = columns.length >= 2 ? String(columns[columns.length - 1] ?? "").trim() : "";
            if (columns.length >= 5) {
                easting = parsePointNumber(columns[1]);
                northing = parsePointNumber(columns[2]);
                height = parsePointNumber(columns[3]);
            }
            // Quoted combined coordinate field: Punktname,"Rechtswert Hochwert",HÃ¶he,Code.
            if ((!Number.isFinite(easting) || !Number.isFinite(northing)) && columns.length >= 4) {
                const pair = String(columns[1] ?? "").trim().split(/\s+/).filter(Boolean);
                if (pair.length >= 2) {
                    easting = parsePointNumber(pair[0]);
                    northing = parsePointNumber(pair[1]);
                    height = parsePointNumber(columns[2]);
                }
            }
            // Generic fallback: first two coordinate-sized numbers, then plausible height.
            if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
                const numeric = columns
                    .map((value, index) => ({ index, value: parsePointNumber(value) }))
                    .filter((item) => Number.isFinite(item.value));
                const coords = numeric.filter((item) => Math.abs(item.value) >= 10000);
                if (coords.length >= 2) {
                    easting = coords[0].value;
                    northing = coords[1].value;
                    height = numeric
                        .filter((item) => item.index !== coords[0].index && item.index !== coords[1].index)
                        .map((item) => item.value)
                        .find((value) => value > -1000 && value < 10000);
                }
            }
        }
        if (!Number.isFinite(easting) || !Number.isFinite(northing))
            return;
        const pointId = id || `P_${points.length + 1}`;
        points.push({
            id: pointId,
            x: Number(easting),
            y: Number(northing),
            height: Number.isFinite(height) ? Number(height) : undefined,
            code: code || undefined,
            label: pointId,
        });
    });
    return points;
}
/* ================== Fetch / LV helpers ================== */
async function fetchJson(url) {
    const res = await fetch(url, { credentials: "include", headers: authHeaders() });
    const txt = await res.text().catch(() => "");
    if (!res.ok)
        throw new Error(txt || `HTTP ${res.status}`);
    try {
        return txt ? JSON.parse(txt) : {};
    }
    catch {
        return {};
    }
}
function mapAnyToLvPositions(list) {
    const arr = Array.isArray(list) ? list : [];
    return arr.map((x, idx) => ({
        id: String(x.id ?? x.lvPosId ?? x.posId ?? idx),
        pos: String(x.pos ??
            x.position ??
            x.posNr ??
            x.nr ??
            x.positionsnummer ??
            x.positionsNummer ??
            ""),
        text: String(x.kurztext ?? x.shortText ?? x.text ?? x.title ?? x.langtext ?? "ohne Text"),
        longText: String(x.langtext ?? x.longText ?? x.description ?? x.text ?? ""),
        unit: String(x.unit ?? x.einheit ?? x.me ?? "m"),
        quantity: Number(x.soll ?? x.menge ?? x.quantity ?? x.qty ?? 0),
        ep: Number(x.ep ?? x.einheitspreis ?? x.price ?? x.unitPrice ?? 0),
    }));
}
function extractLvListFromNewEndpoint(data) {
    if (Array.isArray(data?.positions))
        return data.positions;
    if (Array.isArray(data?.items))
        return data.items;
    if (Array.isArray(data?.data?.positions))
        return data.data.positions;
    if (Array.isArray(data?.data?.items))
        return data.data.items;
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const latest = rows[0];
    return Array.isArray(latest?.positions) ? latest.positions : [];
}
function extractLvListFromOldEndpoint(data) {
    if (Array.isArray(data?.items))
        return data.items;
    if (Array.isArray(data?.lv))
        return data.lv;
    if (Array.isArray(data))
        return data;
    return [];
}
function normalizePositionKey(value) {
    return String(value ?? "")
        .trim()
        .split(/[.\s/-]+/)
        .filter(Boolean)
        .map((part) => (/^\d+$/.test(part) ? String(Number(part)) : part.toLowerCase()))
        .join(".");
}
function normalizeLvUnit(value) {
    const unitValue = String(value ?? "").trim().toLowerCase();
    if (unitValue === "mÂ²" || unitValue === "m2" || unitValue.includes("qm")) {
        return "m2";
    }
    if (unitValue === "stk" ||
        unitValue === "st" ||
        unitValue.includes("stÃ¼ck") ||
        unitValue.includes("stueck")) {
        return "Stk";
    }
    return "m";
}
function extractAufmassRows(data) {
    const candidates = [
        data,
        data?.rows,
        data?.items,
        data?.aufmass,
        data?.positions,
        data?.data,
        data?.data?.rows,
        data?.data?.items,
        data?.data?.aufmass,
        data?.result,
        data?.result?.rows,
    ];
    const source = candidates.find((candidate) => Array.isArray(candidate));
    if (!Array.isArray(source))
        return [];
    return source.map((row, index) => ({
        id: String(row.id ?? row.rowId ?? row.zeileId ?? `AM_${index + 1}`),
        pos: String(row.pos ??
            row.position ??
            row.posNr ??
            row.positionsnummer ??
            row.lvPos ??
            row.positionNumber ??
            ""),
        text: String(row.text ??
            row.kurztext ??
            row.bezeichnung ??
            row.description ??
            row.title ??
            ""),
        unit: String(row.unit ?? row.einheit ?? row.me ?? ""),
        qty: Number(row.istDelta ??
            row.istMenge ??
            row.ist ??
            row.qty ??
            row.quantity ??
            row.menge ??
            row.masse ??
            row.ergebnis ??
            row.result ??
            0),
        location: String(row.ort ?? row.location ?? row.unterort ?? row.beschriftung ?? ""),
        formula: String(row.rechenansatz ?? row.formula ?? row.ansatz ?? row.expression ?? ""),
        source: String(row.source ?? row.quelle ?? "AufmaÃŸ"),
    }));
}
/* ================== KI helpers ================== */
function normText(s) {
    return String(s || "")
        .toLowerCase()
        .replace(/[_\-./\\]+/g, " ")
        .replace(/[^a-z0-9Ã¤Ã¶Ã¼ÃŸ\s]+/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function tokens(s) {
    return normText(s)
        .split(" ")
        .filter((x) => x.length >= 3);
}
function scoreMatch(query, text) {
    const q = tokens(query);
    const t = tokens(text);
    if (!q.length || !t.length)
        return 0;
    const tset = new Set(t);
    let hit = 0;
    for (const w of q)
        if (tset.has(w))
            hit++;
    const nt = normText(text);
    let substr = 0;
    for (const w of q)
        if (nt.includes(w))
            substr++;
    return clamp(hit / q.length + Math.min(0.25, substr * 0.05), 0, 1);
}
function pickLayerGroup(layer) {
    const s = String(layer || "").trim();
    if (!s)
        return "â€”";
    const t = normText(s).split(" ").filter(Boolean);
    return t.slice(0, Math.min(2, t.length)).join(" ") || s;
}
function uiUnitLabel(u) {
    return u === "m2" ? "mÂ²" : u;
}
function snapKindLabel(kind) {
    if (kind === "endpoint")
        return "Endpunkt";
    if (kind === "midpoint")
        return "Mittelpunkt";
    if (kind === "center")
        return "Zentrum";
    if (kind === "vertex")
        return "StÃ¼tzpunkt";
    if (kind === "surveyPoint")
        return "Vermessungspunkt";
    return "Objektfang";
}
const CAD_WORKSPACE_CACHE_VERSION = 1;
function cadWorkspaceCacheKey(projectId) {
    return `rlc_cad_workspace_v${CAD_WORKSPACE_CACHE_VERSION}_${projectId.trim()}`;
}
/* ================== Component ================== */
export default function CADViewer() {
    const projectCtx = useProject();
    const current = getCurrentProject(projectCtx);
    const svgRef = useRef(null);
    const cadViewportRef = useRef(null);
    const pointerMoveFrameRef = useRef(null);
    const pendingPointerMoveRef = useRef(null);
    const smoothSelectCursorRef = useRef(null);
    const lastCursorStateUpdateRef = useRef(0);
    const lastInteractionGeometryUpdateRef = useRef(0);
    const lastInteractionUiUpdateRef = useRef(0);
    const cadFileInputRef = useRef(null);
    const pointFileInputRef = useRef(null);
    const lastAutoLoadedProjectRef = useRef("");
    const autoProjectId = String(current?.code || "").trim();
    const [projectId, setProjectId] = useState(() => {
        const urlPid = new URLSearchParams(window.location.search).get("projectId") || "";
        const lsPid = localStorage.getItem("rlc_projectId") ||
            localStorage.getItem("rlc_active_project") ||
            localStorage.getItem("projectId") ||
            "";
        return (autoProjectId || urlPid || lsPid || "").trim();
    });
    const [status, setStatus] = useState("Bereit");
    const [cadDialog, setCadDialog] = useState(null);
    const cadDialogResolverRef = useRef(null);
    const closeCadDialog = (value) => {
        const resolver = cadDialogResolverRef.current;
        cadDialogResolverRef.current = null;
        setCadDialog(null);
        resolver?.(value);
    };
    const cadAlert = (message, title = "RLC CAD") => new Promise((resolve) => {
        cadDialogResolverRef.current = () => resolve();
        setCadDialog({
            type: "alert",
            title,
            message: String(message || ""),
            value: "",
        });
    });
    const cadConfirm = (message, title = "BestÃ¤tigung") => new Promise((resolve) => {
        cadDialogResolverRef.current = (value) => resolve(value === true);
        setCadDialog({
            type: "confirm",
            title,
            message: String(message || ""),
            value: "",
        });
    });
    const cadPrompt = (message, initialValue = "", title = "RLC CAD") => new Promise((resolve) => {
        cadDialogResolverRef.current = (value) => resolve(typeof value === "string" ? value : null);
        setCadDialog({
            type: "prompt",
            title,
            message: String(message || ""),
            value: String(initialValue || ""),
        });
    });
    const [utmCsv, setUtmCsv] = useState("");
    const [utmPoints, setUtmPoints] = useState([]);
    const [takeoff, setTakeoff] = useState(null);
    const [features, setFeatures] = useState([]);
    const [selectedFeatureId, setSelectedFeatureId] = useState("");
    const [selectedFeatureIds, setSelectedFeatureIds] = useState([]);
    const [isolatedLayer, setIsolatedLayer] = useState("");
    const [activeLayer, setActiveLayer] = useState("0");
    const [layerColors, setLayerColors] = useState({});
    const [layerLocks, setLayerLocks] = useState({});
    const [activeLayerMenuOpen, setActiveLayerMenuOpen] = useState(false);
    const [activeLayerMenuPosition, setActiveLayerMenuPosition] = useState({
        left: 0,
        top: 0,
        width: 320,
    });
    const activeLayerMenuRef = useRef(null);
    const activeLayerPopupRef = useRef(null);
    const [drawingName, setDrawingName] = useState("Zeichnung 1");
    const [currentDrawingId, setCurrentDrawingId] = useState("");
    const [currentDrawingServerBacked, setCurrentDrawingServerBacked] = useState(false);
    const [isNewDrawing, setIsNewDrawing] = useState(false);
    const [drawingBrowserOpen, setDrawingBrowserOpen] = useState(false);
    const [drawingList, setDrawingList] = useState([]);
    const [drawingListState, setDrawingListState] = useState("idle");
    const [drawingListError, setDrawingListError] = useState("");
    const [openingDrawingId, setOpeningDrawingId] = useState("");
    const [leftTab, setLeftTab] = useState("takeoff");
    const [rightTab, setRightTab] = useState("properties");
    const [rlcPanelTab, setRlcPanelTab] = useState("takeoff");
    const [cadFullscreen, setCadFullscreen] = useState(false);
    const [viewportAspect, setViewportAspect] = useState(1.6);
    const [projectDockCollapsed, setProjectDockCollapsed] = useState(false);
    const [projectDockHeight, setProjectDockHeight] = useState(380);
    const [editingPanelWidthPx, setEditingPanelWidthPx] = useState(() => {
        if (typeof window === "undefined")
            return editingPanelDefaultWidth;
        const stored = Number(window.localStorage.getItem("rlc-cad-editing-panel-width") || editingPanelDefaultWidth);
        if (!Number.isFinite(stored))
            return editingPanelDefaultWidth;
        return Math.max(editingPanelMinWidth, Math.min(editingPanelMaxWidth, stored));
    });
    const [editingPanelResizing, setEditingPanelResizing] = useState(false);
    const editingPanelDragRef = useRef(null);
    const editingPanelWidth = `${editingPanelWidthPx}px`;
    const [tool, setTool] = useState("select");
    const lastCadCommandRef = useRef("line");
    const [showGrid, setShowGrid] = useState(true);
    const [showLabels, setShowLabels] = useState(false);
    const [showCadTexts, setShowCadTexts] = useState(true);
    const [showUtm, setShowUtm] = useState(true);
    const [showVertices, setShowVertices] = useState(false);
    const [layerVisibility, setLayerVisibility] = useState({});
    const [search, setSearch] = useState("");
    const [measurePts, setMeasurePts] = useState([]);
    const [dimensionDraft, setDimensionDraft] = useState(null);
    const [draftPts, setDraftPts] = useState([]);
    const [textValue, setTextValue] = useState("");
    const [textHeight, setTextHeight] = useState("2.5");
    const [textFont, setTextFont] = useState("Arial Narrow");
    const [showUtmLabels, setShowUtmLabels] = useState(true);
    const [showUtmSymbols, setShowUtmSymbols] = useState(true);
    const [utmSymbol, setUtmSymbol] = useState("crossCircle");
    const [utmSymbolSize, setUtmSymbolSize] = useState(1);
    const [selectedUtmIds, setSelectedUtmIds] = useState([]);
    const [geoLayers, setGeoLayers] = useState({
        osm: false,
        aerial: false,
        parcels: false,
        borders: false,
    });
    const [geoCrs, setGeoCrs] = useState("EPSG:25832");
    const [geoViewportSize, setGeoViewportSize] = useState({ width: 1, height: 1 });
    const [geoRefreshTick, setGeoRefreshTick] = useState(0);
    const geoMapHostRef = useRef(null);
    const geoMapRef = useRef(null);
    const geoOsmLayerRef = useRef(null);
    const [textAnchor, setTextAnchor] = useState(null);
    const [pendingHatchBoundary, setPendingHatchBoundary] = useState(null);
    const [hatchPattern, setHatchPattern] = useState("lines");
    const [cadContextMenu, setCadContextMenu] = useState(null);
    const [modifyPickIds, setModifyPickIds] = useState([]);
    const [mirrorAxisPts, setMirrorAxisPts] = useState([]);
    const [mirrorPhase, setMirrorPhase] = useState("idle");
    const [mirrorPreviewAngle, setMirrorPreviewAngle] = useState(180);
    const [rotateSession, setRotateSession] = useState({
        phase: "idle",
        base: null,
        referenceAngle: 0,
        angle: 0,
        original: null,
    });
    const [scaleSession, setScaleSession] = useState({
        phase: "idle",
        base: null,
        referenceDistance: 1,
        factor: 1,
        original: null,
    });
    const [offsetSession, setOffsetSession] = useState({
        phase: "idle",
        distance: 1,
        signedDistance: 1,
        original: null,
        createdIds: [],
    });
    const middleClickRef = useRef({ at: 0, x: 0, y: 0 });
    const [cursorWorld, setCursorWorld] = useState(null);
    const [snapEnabled, setSnapEnabled] = useState(true);
    const [orthoEnabled, setOrthoEnabled] = useState(false);
    const initialFitDoneRef = useRef(false);
    const [activeSnap, setActiveSnap] = useState(null);
    const [dirty, setDirty] = useState(false);
    const [historyTick, setHistoryTick] = useState(0);
    const [viewBox, setViewBox] = useState({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
    });
    const [geoRequestViewBox, setGeoRequestViewBox] = useState(() => ({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
    }));
    const [dragStart, setDragStart] = useState(null);
    const [selectionDrag, setSelectionDrag] = useState(null);
    const [objectDrag, setObjectDrag] = useState(null);
    const [vertexDrag, setVertexDrag] = useState(null);
    const undoStackRef = useRef([]);
    const redoStackRef = useRef([]);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    useEffect(() => {
        if (tool !== "select") {
            lastCadCommandRef.current = tool;
        }
    }, [tool]);
    useEffect(() => {
        if (typeof window === "undefined")
            return;
        window.localStorage.setItem("rlc-cad-editing-panel-width", String(editingPanelWidthPx));
    }, [editingPanelWidthPx]);
    useEffect(() => {
        if (!editingPanelResizing)
            return;
        const handleMove = (event) => {
            const drag = editingPanelDragRef.current;
            if (!drag)
                return;
            const delta = drag.startX - event.clientX;
            const nextWidth = Math.max(editingPanelMinWidth, Math.min(editingPanelMaxWidth, drag.startWidth + delta));
            setEditingPanelWidthPx(nextWidth);
        };
        const stopResize = () => {
            editingPanelDragRef.current = null;
            setEditingPanelResizing(false);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", stopResize);
        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", stopResize);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
    }, [editingPanelResizing]);
    const startEditingPanelResize = (event) => {
        event.preventDefault();
        event.stopPropagation();
        editingPanelDragRef.current = {
            startX: event.clientX,
            startWidth: editingPanelWidthPx,
        };
        setEditingPanelResizing(true);
    };
    const resetEditingPanelWidth = () => setEditingPanelWidthPx(editingPanelDefaultWidth);
    const syncHistoryButtons = () => {
        setCanUndo(undoStackRef.current.length > 0);
        setCanRedo(redoStackRef.current.length > 0);
    };
    const [numericCommand, setNumericCommand] = useState(null);
    const [pos, setPos] = useState("001");
    const [kurz, setKurz] = useState("RLC CAD AufmaÃŸ");
    const [unit, setUnit] = useState("m");
    const [factor, setFactor] = useState(1);
    const [lvPositions, setLvPositions] = useState([]);
    const [lvState, setLvState] = useState("idle");
    const [lvSearch, setLvSearch] = useState("");
    const [selectedLvId, setSelectedLvId] = useState("");
    const [positionAufmassRows, setPositionAufmassRows] = useState([]);
    const [positionAufmassState, setPositionAufmassState] = useState("idle");
    const [kiSelectedKey, setKiSelectedKey] = useState("");
    const [chosenLvPos, setChosenLvPos] = useState("");
    const [kiPos, setKiPos] = useState("001");
    const [kiText, setKiText] = useState("KI: â€”");
    const [kiUnit, setKiUnit] = useState("m");
    const [kiFactor, setKiFactor] = useState(1);
    const hasGeoLayers = geoLayers.osm || geoLayers.aerial || geoLayers.parcels || geoLayers.borders;
    const hasBayernWmsLayers = geoLayers.aerial || geoLayers.parcels || geoLayers.borders;
    useEffect(() => {
        if (autoProjectId && autoProjectId !== projectId) {
            setProjectId(autoProjectId);
        }
    }, [autoProjectId, projectId]);
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg)
            return;
        const updateAspect = () => {
            const rect = svg.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                setViewportAspect(rect.width / rect.height);
                const width = Math.max(1, Math.round(rect.width));
                const height = Math.max(1, Math.round(rect.height));
                setGeoViewportSize((previous) => previous.width === width && previous.height === height
                    ? previous
                    : { width, height });
            }
        };
        updateAspect();
        const observer = new ResizeObserver(updateAspect);
        observer.observe(svg);
        window.addEventListener("resize", updateAspect);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", updateAspect);
        };
    }, []);
    useEffect(() => {
        setViewBox((previous) => {
            const currentAspect = previous.width / Math.max(previous.height, 0.0001);
            if (Math.abs(currentAspect - viewportAspect) < 0.001)
                return previous;
            const centerX = previous.x + previous.width / 2;
            const width = previous.height * viewportAspect;
            return {
                x: centerX - width / 2,
                y: previous.y,
                width,
                height: previous.height,
            };
        });
    }, [viewportAspect]);
    useEffect(() => {
        if (!cadFullscreen)
            return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [cadFullscreen]);
    useEffect(() => {
        const targetProject = projectId.trim();
        if (!targetProject)
            return;
        try {
            const raw = localStorage.getItem(cadWorkspaceCacheKey(targetProject));
            if (!raw)
                return;
            const cached = JSON.parse(raw);
            const cachedFeatures = normalizeFeatures(cached?.drawing);
            if (cachedFeatures.length) {
                const restored = cachedFeatures.map((feature, index) => recalculateCadFeature(feature, index));
                setFeatures(restored);
                setTakeoff(cached?.drawing || { ok: true, features: restored });
                setDirty(false);
                setStatus(`CAD-Arbeitsstand wiederhergestellt (${restored.length} Objekte)`);
            }
            if (cached?.viewBox && Number(cached.viewBox.width) > 0 && Number(cached.viewBox.height) > 0) {
                setViewBox(cached.viewBox);
            }
            if (cached?.layerVisibility && typeof cached.layerVisibility === "object") {
                setLayerVisibility(cached.layerVisibility);
            }
            if (typeof cached?.activeLayer === "string")
                setActiveLayer(cached.activeLayer);
            if (cached?.layerColors && typeof cached.layerColors === "object")
                setLayerColors(cached.layerColors);
            if (cached?.layerLocks && typeof cached.layerLocks === "object")
                setLayerLocks(cached.layerLocks);
            if (typeof cached?.drawingName === "string" && cached.drawingName.trim())
                setDrawingName(cached.drawingName.trim());
            const cachedDrawingId = String(cached?.currentDrawingId || cached?.drawing?.drawingId || "").trim();
            if (cachedDrawingId)
                setCurrentDrawingId(cachedDrawingId);
            if (typeof cached?.currentDrawingServerBacked === "boolean") {
                setCurrentDrawingServerBacked(cached.currentDrawingServerBacked);
            }
            if (typeof cached?.isolatedLayer === "string")
                setIsolatedLayer(cached.isolatedLayer);
            if (Array.isArray(cached?.utmPoints))
                setUtmPoints(cached.utmPoints);
            if (typeof cached?.utmCsv === "string")
                setUtmCsv(cached.utmCsv);
            if (typeof cached?.showUtmLabels === "boolean")
                setShowUtmLabels(cached.showUtmLabels);
            if (typeof cached?.showUtmSymbols === "boolean")
                setShowUtmSymbols(cached.showUtmSymbols);
            if (["cross", "circle", "crossCircle"].includes(cached?.utmSymbol))
                setUtmSymbol(cached.utmSymbol);
            if (Number.isFinite(Number(cached?.utmSymbolSize)))
                setUtmSymbolSize(Number(cached.utmSymbolSize));
            if (cached?.geoLayers && typeof cached.geoLayers === "object") {
                setGeoLayers({
                    osm: Boolean(cached.geoLayers.osm),
                    aerial: Boolean(cached.geoLayers.aerial),
                    parcels: Boolean(cached.geoLayers.parcels),
                    borders: Boolean(cached.geoLayers.borders),
                });
            }
            else if (["none", "osm", "aerial", "parcels", "borders"].includes(cached?.mapLayer)) {
                const legacy = String(cached.mapLayer);
                setGeoLayers({
                    osm: legacy === "osm" || legacy === "parcels" || legacy === "borders",
                    aerial: legacy === "aerial",
                    parcels: legacy === "parcels",
                    borders: legacy === "borders",
                });
            }
            if (typeof cached?.showUtm === "boolean")
                setShowUtm(cached.showUtm);
            if (Array.isArray(cached?.selectedFeatureIds)) {
                setSelectedFeatureIds(cached.selectedFeatureIds.map(String));
                setSelectedFeatureId(String(cached.selectedFeatureId || cached.selectedFeatureIds[0] || ""));
            }
        }
        catch {
            // A damaged browser cache must never block the CAD viewer.
        }
        // Restore once when the active project changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);
    useEffect(() => {
        const targetProject = projectId.trim();
        if (!targetProject || !features.length)
            return;
        // GroÃŸe DXF/DWG-Zeichnungen niemals komplett in localStorage serialisieren.
        // JSON.stringify auf zehntausenden Objekten blockiert sonst den UI-Thread
        // und kann zusÃ¤tzlich die Browser-Quota Ã¼berschreiten.
        if (features.length > 25000)
            return;
        const timer = window.setTimeout(() => {
            try {
                localStorage.setItem(cadWorkspaceCacheKey(targetProject), JSON.stringify({
                    savedAt: new Date().toISOString(),
                    drawing: {
                        ...createCadDocument(targetProject, features, { format: "RLC-LOCAL-WORKSPACE" }),
                        drawingId: currentDrawingId || undefined,
                        drawingName,
                    },
                    currentDrawingId,
                    currentDrawingServerBacked,
                    viewBox,
                    layerVisibility,
                    activeLayer,
                    layerColors,
                    layerLocks,
                    drawingName,
                    isolatedLayer,
                    selectedFeatureId,
                    selectedFeatureIds,
                    utmPoints,
                    utmCsv,
                    showUtmLabels,
                    showUtmSymbols,
                    utmSymbol,
                    utmSymbolSize,
                    geoLayers,
                    mapLayer: geoLayers.aerial
                        ? "aerial"
                        : geoLayers.osm
                            ? "osm"
                            : geoLayers.parcels
                                ? "parcels"
                                : geoLayers.borders
                                    ? "borders"
                                    : "none",
                    showUtm,
                }));
            }
            catch {
                // Server persistence remains authoritative; local cache is the immediate fallback.
            }
        }, 180);
        return () => window.clearTimeout(timer);
    }, [
        projectId,
        features,
        currentDrawingId,
        currentDrawingServerBacked,
        viewBox,
        layerVisibility,
        activeLayer,
        layerColors,
        drawingName,
        isolatedLayer,
        selectedFeatureId,
        selectedFeatureIds,
        utmPoints,
        utmCsv,
        geoLayers,
        showUtm,
    ]);
    useEffect(() => {
        const viewport = cadViewportRef.current;
        if (!viewport)
            return;
        const handleWheel = (event) => {
            const target = event.target;
            if (target?.closest("[data-cad-control='true']"))
                return;
            const svg = svgRef.current;
            if (!svg)
                return;
            const rect = svg.getBoundingClientRect();
            if (event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            const deltaPixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE
                ? event.deltaY * 16
                : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                    ? event.deltaY * Math.max(rect.height, 1)
                    : event.deltaY;
            const factorZoom = Math.exp(clamp(deltaPixels, -220, 220) * 0.0018);
            const rx = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
            const ry = clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1);
            setViewBox((previous) => {
                return zoomCadViewBox(previous, factorZoom, { x: rx, y: ry });
            });
        };
        viewport.addEventListener("wheel", handleWheel, { passive: false });
        return () => viewport.removeEventListener("wheel", handleWheel);
    }, []);
    const selectedLvPosition = useMemo(() => lvPositions.find((position) => position.id === selectedLvId) ||
        lvPositions.find((position) => normalizePositionKey(position.pos) === normalizePositionKey(pos)) ||
        null, [lvPositions, selectedLvId, pos]);
    const filteredLvPositions = useMemo(() => {
        const query = normText(lvSearch);
        if (!query)
            return lvPositions;
        return lvPositions.filter((position) => normText(`${position.pos} ${position.text} ${position.longText} ${position.unit}`).includes(query));
    }, [lvPositions, lvSearch]);
    const selectedFeature = useMemo(() => features.find((f) => String(f.id || "") === selectedFeatureId) || null, [features, selectedFeatureId]);
    const selectedFeatures = useMemo(() => features.filter((f) => selectedFeatureIds.includes(String(f.id || ""))), [features, selectedFeatureIds]);
    const selectedUtmPoint = useMemo(() => selectedUtmIds.length === 1
        ? utmPoints.find((point) => point.id === selectedUtmIds[0]) || null
        : null, [utmPoints, selectedUtmIds]);
    const featureCoordinateValue = (feature, coordinate, pointIndex = 0) => {
        if (coordinate === "z") {
            const meta = (feature.meta || {});
            const value = meta.z ??
                meta.height ??
                meta.elevation ??
                feature.z ??
                0;
            return Number.isFinite(Number(value)) ? Number(value) : 0;
        }
        const point = feature.pts?.[pointIndex];
        return point && Number.isFinite(Number(point[coordinate]))
            ? Number(point[coordinate])
            : 0;
    };
    const updateSelectedFeatureCoordinate = (coordinate, value, pointIndex = 0) => {
        if (!selectedFeature || !Number.isFinite(value))
            return;
        const selectedId = String(selectedFeature.id || "");
        setFeatures((previous) => previous.map((feature, featureIndex) => {
            if (String(feature.id || "") !== selectedId)
                return feature;
            if (coordinate === "z") {
                return {
                    ...feature,
                    meta: {
                        ...(feature.meta || {}),
                        z: value,
                        height: value,
                        elevation: value,
                    },
                };
            }
            const points = Array.isArray(feature.pts)
                ? feature.pts.map((point) => ({ ...point }))
                : [];
            if (!points[pointIndex])
                return feature;
            points[pointIndex] = {
                ...points[pointIndex],
                [coordinate]: value,
            };
            return recalculateCadFeature({ ...feature, pts: points }, featureIndex);
        }));
        setDirty(true);
    };
    const updateSelectedFeatureRadius = (value) => {
        if (!selectedFeature || !Number.isFinite(value) || value < 0)
            return;
        const selectedId = String(selectedFeature.id || "");
        setFeatures((previous) => previous.map((feature, featureIndex) => String(feature.id || "") === selectedId
            ? recalculateCadFeature({ ...feature, radius: value }, featureIndex)
            : feature));
        setDirty(true);
    };
    const selectedFeatureStyleValue = (field) => {
        if (!selectedFeature)
            return "";
        const style = (selectedFeature.style || {});
        const meta = (selectedFeature.meta || {});
        if (field === "layer")
            return String(selectedFeature.layer || "0");
        if (field === "color") {
            return String(style.color || meta.color || "VonLayer");
        }
        if (field === "linetype") {
            return String(style.lineType || style.linetype || meta.lineType || meta.linetype || "VonLayer");
        }
        const rawLineWeight = style.lineWeight ??
            style.strokeWidth ??
            meta.lineWeight ??
            meta.lineweight;
        if (rawLineWeight === undefined || rawLineWeight === null || rawLineWeight === "") {
            return "VonLayer";
        }
        const numericLineWeight = Number(rawLineWeight);
        return Number.isFinite(numericLineWeight) && numericLineWeight > 0
            ? numericLineWeight.toFixed(2)
            : "VonLayer";
    };
    const updateSelectedFeatureStyle = (field, value) => {
        const selectedIds = new Set((selectedFeatureIds.length
            ? selectedFeatureIds
            : selectedFeature
                ? [String(selectedFeature.id || "")]
                : []).filter(Boolean));
        if (!selectedIds.size)
            return;
        setFeatures((previous) => previous.map((feature, featureIndex) => {
            if (!selectedIds.has(String(feature.id || "")))
                return feature;
            if (field === "layer") {
                return recalculateCadFeature({ ...feature, layer: value || "0" }, featureIndex);
            }
            const style = { ...(feature.style || {}) };
            const meta = { ...(feature.meta || {}) };
            if (field === "color") {
                if (value === "VonLayer") {
                    delete style.color;
                    delete meta.color;
                    meta.colorMode = "BYLAYER";
                }
                else {
                    style.color = value;
                    meta.color = value;
                    meta.colorMode = "OBJECT";
                }
            }
            if (field === "linetype") {
                if (value === "VonLayer") {
                    delete style.lineType;
                    delete style.linetype;
                    delete meta.lineType;
                    delete meta.linetype;
                    delete meta.dashArray;
                }
                else {
                    style.lineType = value;
                    meta.lineType = value;
                }
            }
            if (field === "lineweight") {
                if (value === "VonLayer") {
                    delete style.lineWeight;
                    delete style.strokeWidth;
                    delete meta.lineWeight;
                    delete meta.lineweight;
                }
                else {
                    const numeric = Number(value);
                    style.lineWeight = numeric;
                    meta.lineWeight = numeric;
                }
            }
            return recalculateCadFeature({ ...feature, style, meta }, featureIndex);
        }));
        setDirty(true);
        setStatus(`${field} geÃ¤ndert`);
    };
    const updateSelectedFeatureGlobalWidth = (value) => {
        const normalized = Math.max(0, Number.isFinite(value) ? value : 0);
        const selectedIds = new Set((selectedFeatureIds.length
            ? selectedFeatureIds
            : selectedFeature
                ? [String(selectedFeature.id || "")]
                : []).filter(Boolean));
        if (!selectedIds.size)
            return;
        setFeatures((previous) => previous.map((feature, featureIndex) => {
            if (!selectedIds.has(String(feature.id || "")))
                return feature;
            const kind = String(feature.kind || "").toLowerCase();
            if (kind !== "polyline" && kind !== "line")
                return feature;
            const style = { ...(feature.style || {}) };
            const meta = { ...(feature.meta || {}) };
            if (normalized <= 0) {
                delete style.globalWidth;
                delete meta.globalWidth;
                delete meta.constantWidth;
            }
            else {
                style.globalWidth = normalized;
                meta.globalWidth = normalized;
                meta.constantWidth = normalized;
            }
            return recalculateCadFeature({ ...feature, style, meta }, featureIndex);
        }));
        setDirty(true);
        setStatus(`Globale Breite: ${formatNumber(normalized)} m`);
    };
    const updateSelectedUtmPoint = (field, value) => {
        if (!selectedUtmPoint)
            return;
        setUtmPoints((previous) => previous.map((point) => point.id === selectedUtmPoint.id
            ? { ...point, [field]: value }
            : point));
        setDirty(true);
    };
    const selectedMeasurementBlock = useMemo(() => {
        if (!selectedFeatures.length)
            return null;
        const firstMeta = (selectedFeatures[0]?.meta || {});
        const groupId = String(firstMeta.dimensionGroupId || firstMeta.measurementGroupId || "").trim();
        if (!groupId)
            return null;
        const groupFeatures = features.filter((feature) => {
            const meta = (feature.meta || {});
            return String(meta.dimensionGroupId || meta.measurementGroupId || "").trim() === groupId;
        });
        if (!groupFeatures.length)
            return null;
        const groupMeta = (groupFeatures[0].meta || {});
        const textFeature = groupFeatures.find((feature) => String(feature.kind || "").toLowerCase() === "text");
        const textMeta = (textFeature?.meta || {});
        const blockType = String(groupMeta.blockType || "");
        const isDimension = blockType === "dimension" || Boolean(groupMeta.dimensionGroupId);
        const isArea = blockType === "area-measurement" || Boolean(groupMeta.measurementGroupId);
        return {
            groupId,
            features: groupFeatures,
            textFeature,
            isDimension,
            isArea,
            value: isDimension
                ? Number(groupMeta.dimensionValue || 0)
                : Number(groupMeta.measurementArea || 0),
            unit: isDimension ? "m" : "mÂ²",
            textHeight: Number(textMeta.height || textMeta.textHeight || groupMeta.textHeight || 2.5),
            typeLabel: isDimension
                ? String(groupMeta.generatedBy || "").includes("aligned")
                    ? "Ausgerichtete BemaÃŸung"
                    : "Lineare BemaÃŸung"
                : "FlÃ¤chenmessung",
            layer: String(groupFeatures[0].layer || "0"),
        };
    }, [features, selectedFeatures]);
    const updateSelectedMeasurementTextHeight = (nextValue) => {
        if (!selectedMeasurementBlock)
            return;
        const nextHeight = Math.max(0.05, Number(nextValue) || 0.05);
        const groupId = selectedMeasurementBlock.groupId;
        setFeatures((previous) => previous.map((feature) => {
            const meta = (feature.meta || {});
            const featureGroupId = String(meta.dimensionGroupId || meta.measurementGroupId || "").trim();
            if (featureGroupId !== groupId)
                return feature;
            if (String(feature.kind || "").toLowerCase() === "text") {
                return {
                    ...feature,
                    meta: {
                        ...(feature.meta || {}),
                        height: nextHeight,
                        textHeight: nextHeight,
                    },
                };
            }
            return {
                ...feature,
                meta: {
                    ...(feature.meta || {}),
                    textHeight: nextHeight,
                },
            };
        }));
        setDirty(true);
        setStatus(`TexthÃ¶he auf ${formatNumber(nextHeight)} gesetzt`);
    };
    useEffect(() => {
        if (!selectedFeature)
            return;
        const meta = (selectedFeature.meta || {});
        const linkedPos = String(meta.lvPos || meta.LvPos || selectedFeature.lvPos || "").trim();
        const explicitLinkedText = String(meta.lvText ||
            meta.LvText ||
            selectedFeature.lvText ||
            "").trim();
        const linkedText = explicitLinkedText ||
            (selectedFeatures.length === 1
                ? String(selectedFeature.name || "").trim()
                : "");
        if (linkedPos)
            setPos(linkedPos);
        if (linkedText)
            setKurz(linkedText);
        const totalArea = selectedFeatures.reduce((sum, feature) => sum + Number(feature.area || 0), 0);
        const totalLength = selectedFeatures.reduce((sum, feature) => sum + Number(feature.length || 0), 0);
        if (totalArea > 0)
            setUnit("m2");
        else if (totalLength > 0)
            setUnit("m");
        else
            setUnit("Stk");
    }, [selectedFeature?.id, selectedFeatureIds.join("|")]);
    const selectFeature = (id, additive = false) => {
        setSelectedFeatureId(id);
        setSelectedFeatureIds((prev) => {
            if (!additive)
                return id ? [id] : [];
            return prev.includes(id)
                ? prev.filter((x) => x !== id)
                : [...prev, id];
        });
    };
    const resetHistory = () => {
        undoStackRef.current = [];
        redoStackRef.current = [];
        syncHistoryButtons();
        setHistoryTick((value) => value + 1);
    };
    const replaceDrawing = (nextFeatures, nextPayload) => {
        const normalized = nextFeatures.map((feature, index) => recalculateCadFeature(feature, index));
        setFeatures(normalized);
        setTakeoff(nextPayload ||
            {
                ok: true,
                features: normalized,
            });
        const firstVisible = normalized.find((feature) => !isPresentationLayer(feature)) ||
            normalized[0];
        setSelectedFeatureId(firstVisible?.id || "");
        setSelectedFeatureIds(firstVisible?.id ? [String(firstVisible.id)] : []);
        const defaultVisibility = {};
        for (const feature of normalized) {
            const layer = String(feature.layer || "0");
            defaultVisibility[layer] = true;
        }
        setLayerVisibility(defaultVisibility);
        const initialFitPoints = normalized
            .filter((feature) => !isPresentationLayer(feature))
            .flatMap((feature) => {
            const points = (feature.pts || []).map(cadToCanvas);
            if (feature.kind === "circle" &&
                feature.pts?.[0] &&
                Number(feature.radius || 0) > 0) {
                const center = cadToCanvas(feature.pts[0]);
                const radius = Number(feature.radius || 0);
                points.push({ x: center.x - radius, y: center.y - radius }, { x: center.x + radius, y: center.y + radius });
            }
            return points;
        });
        const initialBounds = boundsFromPoints(initialFitPoints);
        if (initialBounds) {
            setViewBox(boundsToAspectViewBox(expandBounds(initialBounds, 0.08), viewportAspect));
        }
        setActiveLayer(String(firstVisible?.layer || "0"));
        setIsolatedLayer("");
        setSelectedFeatureId("");
        setSelectedFeatureIds([]);
        setShowLabels(false);
        setShowCadTexts(true);
        setShowVertices(false);
        setMeasurePts([]);
        resetHistory();
        setDirty(false);
        setIsNewDrawing(false);
    };
    const beginMutation = (original = features) => {
        undoStackRef.current.push(cloneCadFeatures(original));
        if (undoStackRef.current.length > 100)
            undoStackRef.current.shift();
        redoStackRef.current = [];
        syncHistoryButtons();
        setHistoryTick((value) => value + 1);
        setDirty(true);
    };
    const commitDrawing = (nextFeatures) => {
        beginMutation(features);
        setFeatures(nextFeatures.map((feature, index) => recalculateCadFeature(feature, index)));
    };
    const undoDrawing = () => {
        const previous = undoStackRef.current.pop();
        if (!previous)
            return;
        redoStackRef.current.push(cloneCadFeatures(features));
        setFeatures(cloneCadFeatures(previous));
        setSelectedFeatureIds([]);
        setSelectedFeatureId("");
        setDirty(true);
        syncHistoryButtons();
        setHistoryTick((value) => value + 1);
        setStatus("RÃ¼ckgÃ¤ngig");
    };
    const redoDrawing = () => {
        const next = redoStackRef.current.pop();
        if (!next)
            return;
        undoStackRef.current.push(cloneCadFeatures(features));
        setFeatures(cloneCadFeatures(next));
        setSelectedFeatureIds([]);
        setSelectedFeatureId("");
        setDirty(true);
        syncHistoryButtons();
        setHistoryTick((value) => value + 1);
        setStatus("Wiederholt");
    };
    const deleteSelection = () => {
        const featureIds = new Set(selectedFeatureIds);
        const pointIds = new Set(selectedUtmIds);
        if (!featureIds.size && !pointIds.size)
            return;
        if (featureIds.size) {
            commitDrawing(features.filter((feature) => !featureIds.has(String(feature.id || ""))));
        }
        if (pointIds.size) {
            setUtmPoints((previous) => previous.filter((point) => !pointIds.has(point.id)));
            setSelectedUtmIds([]);
            setDirty(true);
        }
        setSelectedFeatureIds([]);
        setSelectedFeatureId("");
        setStatus(`${featureIds.size + pointIds.size} Objekt(e)/Punkt(e) gelÃ¶scht`);
    };
    const explodeSelection = () => {
        if (!selectedFeatureIds.length) {
            setStatus("Explodieren: zuerst Objekt auswÃ¤hlen");
            return;
        }
        const selectedIds = new Set(selectedFeatureIds);
        const explodedIds = [];
        let explodedObjects = 0;
        let generatedObjects = 0;
        const createLineSegment = (source, start, end, segmentIndex) => {
            const id = createCadId("EXP");
            explodedIds.push(id);
            generatedObjects += 1;
            return {
                ...source,
                id,
                kind: "line",
                closed: false,
                pts: [
                    { x: start.x, y: start.y },
                    { x: end.x, y: end.y },
                ],
                radius: undefined,
                name: `${String(source.name || "Objekt")} Â· Segment ${segmentIndex + 1}`,
                meta: {
                    ...(source.meta || {}),
                    generatedBy: "explode",
                    explodedFrom: String(source.id || ""),
                    explodedSegment: segmentIndex + 1,
                },
            };
        };
        const nextFeatures = [];
        for (const feature of features) {
            const featureId = String(feature.id || "");
            if (!selectedIds.has(featureId)) {
                nextFeatures.push(feature);
                continue;
            }
            const kind = String(feature.kind || "").toLowerCase();
            const points = Array.isArray(feature.pts)
                ? feature.pts.filter((point) => Boolean(point &&
                    Number.isFinite(Number(point.x)) &&
                    Number.isFinite(Number(point.y))))
                : [];
            const meta = (feature.meta || {});
            const nestedCandidates = [
                meta.blockFeatures,
                meta.features,
                meta.entities,
                meta.children,
            ];
            const nested = nestedCandidates.find(Array.isArray);
            if (kind === "block" && nested?.length) {
                explodedObjects += 1;
                nested.forEach((child, childIndex) => {
                    const id = createCadId("EXP");
                    explodedIds.push(id);
                    generatedObjects += 1;
                    nextFeatures.push({
                        ...child,
                        id,
                        layer: child.layer || feature.layer,
                        meta: {
                            ...(feature.meta || {}),
                            ...(child.meta || {}),
                            generatedBy: "explode",
                            explodedFrom: featureId,
                            explodedChild: childIndex + 1,
                        },
                    });
                });
                continue;
            }
            if (kind === "circle" && points[0] && Number(feature.radius || 0) > 0) {
                explodedObjects += 1;
                const center = points[0];
                const radius = Number(feature.radius);
                const circlePoints = [];
                const segmentCount = 64;
                for (let index = 0; index < segmentCount; index += 1) {
                    const angle = (Math.PI * 2 * index) / segmentCount;
                    circlePoints.push({
                        x: center.x + Math.cos(angle) * radius,
                        y: center.y + Math.sin(angle) * radius,
                    });
                }
                for (let index = 0; index < circlePoints.length; index += 1) {
                    nextFeatures.push(createLineSegment(feature, circlePoints[index], circlePoints[(index + 1) % circlePoints.length], index));
                }
                continue;
            }
            const canExplodePath = points.length >= 2 &&
                (kind === "polyline" ||
                    kind === "polygon" ||
                    kind === "rectangle" ||
                    Boolean(feature.closed) ||
                    meta.generatedBy === "boundary" ||
                    meta.generatedBy === "hatch");
            if (canExplodePath) {
                explodedObjects += 1;
                for (let index = 0; index < points.length - 1; index += 1) {
                    nextFeatures.push(createLineSegment(feature, points[index], points[index + 1], index));
                }
                const shouldClose = Boolean(feature.closed) ||
                    kind === "polygon" ||
                    kind === "rectangle" ||
                    meta.generatedBy === "boundary" ||
                    meta.generatedBy === "hatch";
                if (shouldClose && points.length > 2) {
                    const first = points[0];
                    const last = points[points.length - 1];
                    if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-9) {
                        nextFeatures.push(createLineSegment(feature, last, first, points.length - 1));
                    }
                }
                continue;
            }
            // Nicht zerlegbare Einzelobjekte bleiben unverÃ¤ndert.
            nextFeatures.push(feature);
        }
        if (!explodedObjects) {
            setStatus("Explodieren: Auswahl enthÃ¤lt keine zerlegbaren Objekte");
            return;
        }
        commitDrawing(nextFeatures);
        setSelectedFeatureIds(explodedIds);
        setSelectedFeatureId(explodedIds[0] || "");
        setTool("select");
        setStatus(`${explodedObjects} Objekt(e) in ${generatedObjects} Einzelelemente zerlegt`);
    };
    const featurePathPoints = (feature) => Array.isArray(feature.pts)
        ? feature.pts
            .filter((point) => Boolean(point &&
            Number.isFinite(Number(point.x)) &&
            Number.isFinite(Number(point.y))))
            .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
        : [];
    const lineIntersection = (a1, a2, b1, b2) => {
        const dax = a2.x - a1.x;
        const day = a2.y - a1.y;
        const dbx = b2.x - b1.x;
        const dby = b2.y - b1.y;
        const denominator = dax * dby - day * dbx;
        if (Math.abs(denominator) < 1e-12)
            return null;
        const dx = b1.x - a1.x;
        const dy = b1.y - a1.y;
        const t = (dx * dby - dy * dbx) / denominator;
        return { x: a1.x + t * dax, y: a1.y + t * day };
    };
    const closestEndpointIndex = (points, target) => {
        if (!points.length)
            return -1;
        const firstDistance = dist(points[0], target);
        const lastDistance = dist(points[points.length - 1], target);
        return firstDistance <= lastDistance ? 0 : points.length - 1;
    };
    const replaceFeaturePoints = (source, featureId, points, kind) => source.map((feature, index) => String(feature.id || "") === featureId
        ? recalculateCadFeature({
            ...feature,
            kind: kind || feature.kind,
            closed: false,
            pts: points,
        }, index)
        : feature);
    const completeModifyCommand = () => {
        setModifyPickIds([]);
        setMirrorAxisPts([]);
        setMirrorPhase("idle");
        setMirrorPreviewAngle(180);
        setTool("select");
    };
    const runJoin = (firstId, secondId) => {
        const first = features.find((feature) => String(feature.id || "") === firstId);
        const second = features.find((feature) => String(feature.id || "") === secondId);
        if (!first || !second)
            return;
        const firstPts = featurePathPoints(first);
        const secondPts = featurePathPoints(second);
        if (firstPts.length < 2 || secondPts.length < 2) {
            setStatus("Verbinden: nur Linien und Polylinien mÃ¶glich");
            completeModifyCommand();
            return;
        }
        const variants = [
            { distance: dist(firstPts[firstPts.length - 1], secondPts[0]), points: [...firstPts, ...secondPts] },
            { distance: dist(firstPts[firstPts.length - 1], secondPts[secondPts.length - 1]), points: [...firstPts, ...[...secondPts].reverse()] },
            { distance: dist(firstPts[0], secondPts[0]), points: [...[...firstPts].reverse(), ...secondPts] },
            { distance: dist(firstPts[0], secondPts[secondPts.length - 1]), points: [...secondPts, ...firstPts] },
        ].sort((a, b) => a.distance - b.distance);
        const merged = variants[0].points.filter((point, index, array) => index === 0 || dist(point, array[index - 1]) > 1e-9);
        const joinedId = createCadId("JOIN");
        const joined = {
            ...first,
            id: joinedId,
            kind: "polyline",
            closed: false,
            pts: merged,
            name: "Verbundene Polylinie",
            meta: {
                ...(first.meta || {}),
                generatedBy: "join",
                joinedFrom: [firstId, secondId],
            },
        };
        commitDrawing([
            ...features.filter((feature) => ![firstId, secondId].includes(String(feature.id || ""))),
            joined,
        ]);
        setSelectedFeatureIds([joinedId]);
        setSelectedFeatureId(joinedId);
        setStatus("Zwei Objekte zu einer Polylinie verbunden");
        completeModifyCommand();
    };
    const runExtendOrTrim = (mode, boundaryId, targetId) => {
        const boundary = features.find((feature) => String(feature.id || "") === boundaryId);
        const target = features.find((feature) => String(feature.id || "") === targetId);
        if (!boundary || !target)
            return;
        const boundaryPts = featurePathPoints(boundary);
        const targetPts = featurePathPoints(target);
        if (boundaryPts.length < 2 || targetPts.length < 2) {
            setStatus(`${mode === "extend" ? "Dehnen" : "Stutzen"}: Linien/Polylinien erforderlich`);
            if (mode === "extend") {
                setModifyPickIds([boundaryId]);
                setSelectedFeatureIds([boundaryId]);
                setSelectedFeatureId(boundaryId);
            }
            return;
        }
        let best = null;
        const targetEnds = [
            { index: 0, adjacent: 1 },
            { index: targetPts.length - 1, adjacent: targetPts.length - 2 },
        ];
        for (let boundaryIndex = 0; boundaryIndex < boundaryPts.length - 1; boundaryIndex += 1) {
            for (const end of targetEnds) {
                const intersection = lineIntersection(boundaryPts[boundaryIndex], boundaryPts[boundaryIndex + 1], targetPts[end.index], targetPts[end.adjacent]);
                if (!intersection)
                    continue;
                const candidateDistance = dist(targetPts[end.index], intersection);
                if (!best || candidateDistance < best.distance) {
                    best = { point: intersection, targetIndex: end.index, distance: candidateDistance };
                }
            }
        }
        if (!best) {
            setStatus(`${mode === "extend" ? "Dehnen" : "Stutzen"}: kein Schnittpunkt gefunden`);
            if (mode === "extend") {
                setModifyPickIds([boundaryId]);
                setSelectedFeatureIds([boundaryId]);
                setSelectedFeatureId(boundaryId);
            }
            return;
        }
        const nextPts = targetPts.map((point) => ({ ...point }));
        if (mode === "extend") {
            nextPts[best.targetIndex] = best.point;
        }
        else {
            const keepStart = dist(targetPts[0], best.point) >= dist(targetPts[targetPts.length - 1], best.point);
            if (keepStart) {
                nextPts[nextPts.length - 1] = best.point;
            }
            else {
                nextPts[0] = best.point;
            }
        }
        commitDrawing(replaceFeaturePoints(features, targetId, nextPts));
        if (mode === "trim") {
            setModifyPickIds([boundaryId]);
            setSelectedFeatureIds([boundaryId]);
            setSelectedFeatureId(boundaryId);
            setStatus("Objekt gestutzt Â· weiteres Objekt wÃ¤hlen Â· Rechtsklick beendet Stutzen");
            return;
        }
        setModifyPickIds([boundaryId]);
        setSelectedFeatureIds([boundaryId]);
        setSelectedFeatureId(boundaryId);
        setStatus("Objekt gedehnt Â· weiteres Objekt wÃ¤hlen Â· Rechtsklick beendet Dehnen");
        return;
    };
    const runFillet = async (firstId, secondId) => {
        const first = features.find((feature) => String(feature.id || "") === firstId);
        const second = features.find((feature) => String(feature.id || "") === secondId);
        if (!first || !second)
            return;
        const radiusValue = await cadPrompt("Abrunden Â· Radius eingeben", "1.00");
        if (radiusValue === null) {
            completeModifyCommand();
            return;
        }
        const radius = Number(String(radiusValue).replace(",", "."));
        if (!Number.isFinite(radius) || radius <= 0) {
            setStatus("Abrunden: ungÃ¼ltiger Radius");
            completeModifyCommand();
            return;
        }
        const firstPts = featurePathPoints(first);
        const secondPts = featurePathPoints(second);
        if (firstPts.length < 2 || secondPts.length < 2) {
            setStatus("Abrunden: zwei Linien/Polylinien erforderlich");
            completeModifyCommand();
            return;
        }
        const intersection = lineIntersection(firstPts[0], firstPts[firstPts.length - 1], secondPts[0], secondPts[secondPts.length - 1]);
        if (!intersection) {
            setStatus("Abrunden: Linien sind parallel");
            completeModifyCommand();
            return;
        }
        const firstIndex = closestEndpointIndex(firstPts, intersection);
        const secondIndex = closestEndpointIndex(secondPts, intersection);
        const firstAdjacent = firstIndex === 0 ? firstPts[1] : firstPts[firstPts.length - 2];
        const secondAdjacent = secondIndex === 0 ? secondPts[1] : secondPts[secondPts.length - 2];
        const unitFromIntersection = (point) => {
            const length = Math.max(dist(point, intersection), 1e-9);
            return {
                x: (point.x - intersection.x) / length,
                y: (point.y - intersection.y) / length,
            };
        };
        const u1 = unitFromIntersection(firstAdjacent);
        const u2 = unitFromIntersection(secondAdjacent);
        const dot = clamp(u1.x * u2.x + u1.y * u2.y, -1, 1);
        const angle = Math.acos(dot);
        const tangentDistance = radius / Math.max(Math.tan(angle / 2), 1e-6);
        const tangent1 = {
            x: intersection.x + u1.x * tangentDistance,
            y: intersection.y + u1.y * tangentDistance,
        };
        const tangent2 = {
            x: intersection.x + u2.x * tangentDistance,
            y: intersection.y + u2.y * tangentDistance,
        };
        const firstNext = firstPts.map((point) => ({ ...point }));
        const secondNext = secondPts.map((point) => ({ ...point }));
        firstNext[firstIndex] = tangent1;
        secondNext[secondIndex] = tangent2;
        const bisectorLength = Math.max(Math.hypot(u1.x + u2.x, u1.y + u2.y), 1e-9);
        const bisector = {
            x: (u1.x + u2.x) / bisectorLength,
            y: (u1.y + u2.y) / bisectorLength,
        };
        const centerDistance = radius / Math.max(Math.sin(angle / 2), 1e-6);
        const center = {
            x: intersection.x + bisector.x * centerDistance,
            y: intersection.y + bisector.y * centerDistance,
        };
        let startAngle = Math.atan2(tangent1.y - center.y, tangent1.x - center.x);
        let endAngle = Math.atan2(tangent2.y - center.y, tangent2.x - center.x);
        let delta = endAngle - startAngle;
        while (delta > Math.PI)
            delta -= Math.PI * 2;
        while (delta < -Math.PI)
            delta += Math.PI * 2;
        const arcPts = [];
        const steps = 16;
        for (let index = 0; index <= steps; index += 1) {
            const angleValue = startAngle + (delta * index) / steps;
            arcPts.push({
                x: center.x + Math.cos(angleValue) * radius,
                y: center.y + Math.sin(angleValue) * radius,
            });
        }
        const arcId = createCadId("FILLET");
        const arc = {
            id: arcId,
            kind: "polyline",
            closed: false,
            pts: arcPts,
            layer: first.layer || second.layer || activeLayer,
            name: `Abrundung R=${radius}`,
            meta: {
                generatedBy: "fillet",
                radius,
                filletFrom: [firstId, secondId],
            },
        };
        let next = replaceFeaturePoints(features, firstId, firstNext);
        next = replaceFeaturePoints(next, secondId, secondNext);
        commitDrawing([...next, arc]);
        setSelectedFeatureIds([firstId, secondId, arcId]);
        setSelectedFeatureId(arcId);
        setStatus(`Abrundung mit Radius ${radius} erstellt`);
        completeModifyCommand();
    };
    const mirrorSelectedByPoint = (center, angleDegrees, keepOriginal) => {
        if (!selectedFeatureIds.length) {
            setStatus("Spiegeln: keine Objekte ausgewÃ¤hlt");
            completeModifyCommand();
            return;
        }
        const angleRadians = (angleDegrees * Math.PI) / 180;
        const cosine = Math.cos(angleRadians);
        const sine = Math.sin(angleRadians);
        const sourceIds = new Set(selectedFeatureIds);
        const transformPoint = (point) => {
            const dx = point.x - center.x;
            const dy = point.y - center.y;
            return {
                x: center.x + dx * cosine - dy * sine,
                y: center.y + dx * sine + dy * cosine,
            };
        };
        const mirroredIds = [];
        const mirrored = features
            .filter((feature) => sourceIds.has(String(feature.id || "")))
            .map((feature) => {
            const id = createCadId("MIRROR");
            mirroredIds.push(id);
            return {
                ...feature,
                id,
                pts: featurePathPoints(feature).map(transformPoint),
                meta: {
                    ...(feature.meta || {}),
                    generatedBy: "mirror",
                    mirroredFrom: String(feature.id || ""),
                    mirrorCenter: { x: center.x, y: center.y },
                    mirrorAngle: angleDegrees,
                },
            };
        });
        const base = keepOriginal
            ? features
            : features.filter((feature) => !sourceIds.has(String(feature.id || "")));
        commitDrawing([...base, ...mirrored]);
        setSelectedFeatureIds(mirroredIds);
        setSelectedFeatureId(mirroredIds[0] || "");
        setStatus(`${mirroredIds.length} Objekt(e) um ${angleDegrees}Â° gespiegelt`);
        completeModifyCommand();
    };
    const finishMirrorAtPoint = async () => {
        const center = mirrorAxisPts[0];
        if (!center) {
            setStatus("Spiegeln: zuerst Spiegelpunkt wÃ¤hlen");
            return;
        }
        const angleInput = await cadPrompt("Spiegelwinkel eingeben (normalerweise 180Â° oder 360Â°)", String(Math.round(mirrorPreviewAngle)));
        if (angleInput === null)
            return;
        const angle = Number(String(angleInput).replace(",", "."));
        if (!Number.isFinite(angle)) {
            setStatus("Spiegeln: ungÃ¼ltiger Winkel");
            return;
        }
        const keepOriginal = await cadConfirm("Originale Objekte beibehalten?\nOK = Ja Â· Abbrechen = Nein");
        mirrorSelectedByPoint(center, angle, keepOriginal);
    };
    const startModifyCommand = (command) => {
        setModifyPickIds([]);
        setMirrorAxisPts([]);
        setMirrorPreviewAngle(180);
        setTool(command);
        if (command === "mirror") {
            setMirrorPhase("confirm-selection");
            setStatus(selectedFeatureIds.length
                ? "Spiegeln: Auswahl mit rechter Maustaste bestÃ¤tigen"
                : "Spiegeln: Objekt mit dem Quadrat auswÃ¤hlen");
            return;
        }
        const labels = {
            trim: "Stutzen: Schneidkante wÃ¤hlen Â· danach mehrere Objekte Â· Rechtsklick beendet",
            extend: "Dehnen: Grenzkante wÃ¤hlen Â· danach mehrere Objekte Â· Rechtsklick beendet",
            join: "Verbinden: erstes und zweites Objekt wÃ¤hlen",
            fillet: "Abrunden: erste und zweite Linie wÃ¤hlen",
        };
        setStatus(labels[command]);
    };
    const startOffsetCommand = () => {
        setTool("offset");
        setOffsetSession({
            phase: selectedFeatureIds.length ? "distance" : "pick-object",
            distance: 1,
            signedDistance: 1,
            original: null,
            createdIds: [],
        });
        setNumericCommand(selectedFeatureIds.length
            ? { kind: "offset", value: "1.000" }
            : null);
        setStatus(selectedFeatureIds.length
            ? "Versetzen: Abstand eingeben"
            : "Versetzen: Objekt mit dem Quadrat auswÃ¤hlen");
    };
    const startExplodeCommand = () => {
        setTool("explode");
        setStatus(selectedFeatureIds.length
            ? "Explodieren: Auswahl wird zerlegt"
            : "Explodieren: Objekt mit dem Quadrat auswÃ¤hlen");
        if (selectedFeatureIds.length) {
            explodeSelection();
            setTool("select");
        }
    };
    const handleModifyFeaturePick = (featureId) => {
        if (!["trim", "extend", "join", "fillet"].includes(tool))
            return false;
        if (tool === "trim" || tool === "extend") {
            const boundaryId = modifyPickIds[0];
            const label = tool === "trim" ? "Stutzen" : "Dehnen";
            const boundaryLabel = tool === "trim" ? "Schneidkante" : "Grenzkante";
            const actionLabel = tool === "trim" ? "gestutzt" : "gedehnt";
            if (!boundaryId) {
                setModifyPickIds([featureId]);
                setSelectedFeatureIds([featureId]);
                setSelectedFeatureId(featureId);
                setStatus(`${label}: ${boundaryLabel} gewÃ¤hlt Â· jetzt mehrere Objekte wÃ¤hlen Â· Rechtsklick beendet`);
                return true;
            }
            if (featureId === boundaryId) {
                setStatus(`${label}: ${boundaryLabel} ist bereits gewÃ¤hlt`);
                return true;
            }
            setStatus(`${label}: Objekt wird ${actionLabel} â€¦`);
            runExtendOrTrim(tool, boundaryId, featureId);
            return true;
        }
        const nextIds = [...modifyPickIds.filter((id) => id !== featureId), featureId].slice(-2);
        setModifyPickIds(nextIds);
        setSelectedFeatureIds(nextIds);
        setSelectedFeatureId(featureId);
        if (nextIds.length < 2) {
            setStatus(tool === "join"
                ? "Verbinden: zweites Objekt wÃ¤hlen"
                : "Abrunden: zweite Linie wÃ¤hlen");
            return true;
        }
        if (tool === "join")
            runJoin(nextIds[0], nextIds[1]);
        else
            void runFillet(nextIds[0], nextIds[1]);
        return true;
    };
    const addPersistentDimension = async (start, rawEnd, mode, placementPoint) => {
        let end = { ...rawEnd };
        if (mode === "linear") {
            const dx = Math.abs(rawEnd.x - start.x);
            const dy = Math.abs(rawEnd.y - start.y);
            end =
                dx >= dy
                    ? { x: rawEnd.x, y: start.y }
                    : { x: start.x, y: rawEnd.y };
        }
        const length = dist(start, end);
        if (length < 1e-9) {
            setStatus("BemaÃŸung: Start- und Endpunkt sind identisch");
            return;
        }
        const textHeightInput = await cadPrompt("TexthÃ¶he der BemaÃŸung", String(Math.max(Number(textHeight) || 2.5, 0.1)));
        if (textHeightInput === null)
            return;
        const dimensionTextHeight = Math.max(0.05, Number(String(textHeightInput).replace(",", ".")) || 2.5);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const segmentLength = Math.max(Math.hypot(dx, dy), 1e-9);
        const nx = -dy / segmentLength;
        const ny = dx / segmentLength;
        let dimensionTextRotation = mode === "aligned" ? (Math.atan2(dy, dx) * 180) / Math.PI : 0;
        // CAD-Lesbarkeit: Text niemals kopfÃ¼ber darstellen.
        while (dimensionTextRotation > 180)
            dimensionTextRotation -= 360;
        while (dimensionTextRotation <= -180)
            dimensionTextRotation += 360;
        if (dimensionTextRotation > 90)
            dimensionTextRotation -= 180;
        if (dimensionTextRotation < -90)
            dimensionTextRotation += 180;
        const midpoint = {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2,
        };
        const offset = (placementPoint.x - midpoint.x) * nx +
            (placementPoint.y - midpoint.y) * ny;
        const dimStart = {
            x: start.x + nx * offset,
            y: start.y + ny * offset,
        };
        const dimEnd = {
            x: end.x + nx * offset,
            y: end.y + ny * offset,
        };
        const tick = Math.max(dimensionTextHeight * 0.8, segmentLength * 0.012);
        const textPoint = {
            x: (dimStart.x + dimEnd.x) / 2 + nx * dimensionTextHeight * 0.9,
            y: (dimStart.y + dimEnd.y) / 2 + ny * dimensionTextHeight * 0.9,
        };
        const groupId = createCadId(mode === "linear" ? "DIMLIN" : "DIMAL");
        const commonMeta = {
            generatedBy: mode === "linear" ? "dimension-linear" : "dimension-aligned",
            dimensionGroupId: groupId,
            logicalBlock: true,
            blockType: "dimension",
            dimensionValue: length,
            dimensionUnit: "m",
            textHeight: dimensionTextHeight,
            dimensionStart: start,
            dimensionEnd: end,
            dimensionOffset: offset,
        };
        const dimensionFeatures = [
            {
                id: `${groupId}_extension_start`,
                kind: "line",
                pts: [start, dimStart],
                layer: activeLayer,
                name: "BemaÃŸung Â· Hilfslinie",
                meta: commonMeta,
            },
            {
                id: `${groupId}_extension_end`,
                kind: "line",
                pts: [end, dimEnd],
                layer: activeLayer,
                name: "BemaÃŸung Â· Hilfslinie",
                meta: commonMeta,
            },
            {
                id: `${groupId}_line`,
                kind: "line",
                pts: [dimStart, dimEnd],
                layer: activeLayer,
                name: mode === "linear" ? "Lineare BemaÃŸung" : "Ausgerichtete BemaÃŸung",
                meta: commonMeta,
            },
            {
                id: `${groupId}_tick_start`,
                kind: "line",
                pts: [
                    { x: dimStart.x - nx * tick, y: dimStart.y - ny * tick },
                    { x: dimStart.x + nx * tick, y: dimStart.y + ny * tick },
                ],
                layer: activeLayer,
                name: "BemaÃŸungsstrich",
                meta: commonMeta,
            },
            {
                id: `${groupId}_tick_end`,
                kind: "line",
                pts: [
                    { x: dimEnd.x - nx * tick, y: dimEnd.y - ny * tick },
                    { x: dimEnd.x + nx * tick, y: dimEnd.y + ny * tick },
                ],
                layer: activeLayer,
                name: "BemaÃŸungsstrich",
                meta: commonMeta,
            },
            {
                id: `${groupId}_text`,
                kind: "text",
                pts: [textPoint],
                text: `${formatNumber(length)} m`,
                name: `${formatNumber(length)} m`,
                layer: activeLayer,
                rotation: dimensionTextRotation,
                meta: {
                    ...commonMeta,
                    height: dimensionTextHeight,
                    fontFamily: textFont || "Arial Narrow",
                    rotation: dimensionTextRotation,
                    textParallelToDimension: mode === "aligned",
                    attachmentPoint: 5,
                    horizontalJustification: 1,
                    verticalJustification: 2,
                },
            },
        ];
        commitDrawing([...features, ...dimensionFeatures]);
        setSelectedFeatureIds(dimensionFeatures.map((feature) => String(feature.id)));
        setSelectedFeatureId(String(dimensionFeatures[0].id));
        setMeasurePts([]);
        setDimensionDraft(null);
        setTool("select");
        setStatus(`${mode === "linear" ? "Lineare" : "Ausgerichtete"} BemaÃŸung als Block erstellt`);
    };
    const confirmClosedAreaMeasurement = async () => {
        if (tool !== "area" || measurePts.length < 3) {
            setStatus("FlÃ¤che messen: zuerst in eine geschlossene FlÃ¤che klicken");
            return;
        }
        const area = polyArea(measurePts);
        const signed = polygonSignedArea(measurePts);
        let center = centroid(measurePts);
        if (Math.abs(signed) > 1e-9) {
            let cx = 0;
            let cy = 0;
            for (let index = 0; index < measurePts.length; index += 1) {
                const current = measurePts[index];
                const next = measurePts[(index + 1) % measurePts.length];
                const cross = current.x * next.y - next.x * current.y;
                cx += (current.x + next.x) * cross;
                cy += (current.y + next.y) * cross;
            }
            center = {
                x: cx / (6 * signed),
                y: cy / (6 * signed),
            };
        }
        const textHeightInput = await cadPrompt("TexthÃ¶he der FlÃ¤chenmessung", String(Math.max(Number(textHeight) || 2.5, 0.1)));
        if (textHeightInput === null)
            return;
        const areaTextHeight = Math.max(0.05, Number(String(textHeightInput).replace(",", ".")) || 2.5);
        const groupId = createCadId("AREA");
        const areaFeatures = [
            {
                id: `${groupId}_boundary`,
                kind: "polyline",
                closed: true,
                pts: measurePts.map((point) => ({ ...point })),
                layer: activeLayer,
                name: "FlÃ¤chenmessung",
                meta: {
                    generatedBy: "area-measurement",
                    measurementGroupId: groupId,
                    measurementArea: area,
                    logicalBlock: true,
                    blockType: "area-measurement",
                    textHeight: areaTextHeight,
                    hatchFill: "rgba(56,189,248,.14)",
                },
            },
            {
                id: `${groupId}_text`,
                kind: "text",
                pts: [center],
                text: `${formatNumber(area)} mÂ²`,
                name: `${formatNumber(area)} mÂ²`,
                layer: activeLayer,
                meta: {
                    generatedBy: "area-measurement",
                    measurementGroupId: groupId,
                    measurementArea: area,
                    logicalBlock: true,
                    blockType: "area-measurement",
                    textHeight: areaTextHeight,
                    height: areaTextHeight,
                    fontFamily: textFont || "Arial Narrow",
                },
            },
        ];
        commitDrawing([...features, ...areaFeatures]);
        setSelectedFeatureIds(areaFeatures.map((feature) => String(feature.id)));
        setSelectedFeatureId(String(areaFeatures[0].id));
        setMeasurePts([]);
        setTool("select");
        setStatus(`FlÃ¤che bestÃ¤tigt: ${formatNumber(area)} mÂ²`);
    };
    const addFeature = (feature) => {
        const nextFeature = recalculateCadFeature({
            ...feature,
            id: feature.id || createCadId("RLC"),
            layer: feature.layer || activeLayer || "0",
            meta: {
                ...(feature.meta || {}),
                source: "RLC CAD",
                createdInEditor: true,
            },
        }, features.length);
        commitDrawing([...features, nextFeature]);
        const id = String(nextFeature.id || "");
        setSelectedFeatureId(id);
        setSelectedFeatureIds(id ? [id] : []);
        setRightTab("properties");
        return nextFeature;
    };
    const finishPolyline = (closed = false) => {
        const minimum = closed ? 3 : 2;
        if (draftPts.length < minimum) {
            setStatus(closed
                ? "Polygon benÃ¶tigt mindestens 3 Punkte"
                : "Polylinie benÃ¶tigt mindestens 2 Punkte");
            return;
        }
        addFeature({
            kind: closed ? "polygon" : "polyline",
            closed,
            pts: draftPts,
            name: closed ? "Polygon" : "Polylinie",
        });
        setDraftPts([]);
        setStatus(closed ? "Polygon erstellt" : "Polylinie erstellt");
    };
    const commitBoundaryFromPoint = (point, mode) => {
        const tolerance = Math.max(viewBox.width, viewBox.height) * 0.00002;
        const polygon = boundaryPolygonAtPoint(visibleFeatures, point, Math.max(tolerance, 0.0001));
        if (!polygon) {
            setStatus("Keine geschlossene FlÃ¤che gefunden");
            return;
        }
        if (mode === "boundary") {
            // Eine Umgrenzung ist eine einzige geschlossene Polylinie,
            // kein separates Polygon-/FlÃ¤chenobjekt.
            addFeature({
                kind: "polyline",
                closed: true,
                pts: polygon,
                name: "Umgrenzungspolylinie",
                meta: {
                    generatedBy: "boundary",
                    boundarySource: "interior-click",
                    unifiedPolyline: true,
                },
            });
            setTool("select");
            setStatus("Geschlossene Umgrenzungspolylinie erstellt");
        }
        else {
            setPendingHatchBoundary(polygon);
            setStatus("Schraffurmuster auswÃ¤hlen");
        }
    };
    const commitHatch = () => {
        if (!pendingHatchBoundary?.length)
            return;
        const fill = hatchPattern === "solid"
            ? "rgba(148,163,184,.28)"
            : hatchPattern === "cross"
                ? "url(#rlcHatchCross)"
                : hatchPattern === "dots"
                    ? "url(#rlcHatchDots)"
                    : "url(#rlcHatchLines)";
        addFeature({
            kind: "polygon",
            closed: true,
            pts: pendingHatchBoundary,
            name: `Schraffur ${hatchPattern}`,
            meta: {
                hatchPattern,
                hatchFill: fill,
                generatedBy: "hatch",
                boundarySource: "interior-click",
            },
        });
        setPendingHatchBoundary(null);
        setTool("select");
        setStatus("Schraffur erstellt");
    };
    const commitText = () => {
        if (!textAnchor || !textValue.trim())
            return;
        addFeature({
            kind: "text",
            pts: [textAnchor],
            text: textValue.trim(),
            name: textValue.trim(),
            meta: {
                height: Math.max(0.05, Number(String(textHeight).replace(",", ".")) || 2.5),
                fontFamily: textFont || "Arial Narrow",
            },
        });
        setTextAnchor(null);
        setTextValue("");
        setSelectedFeatureId("");
        setSelectedFeatureIds([]);
        setStatus("Text erstellt");
    };
    const startRotateCommand = () => {
        setNumericCommand(null);
        setRotateSession({
            phase: selectedFeatureIds.length ? "pick-base" : "pick-object",
            base: null,
            referenceAngle: 0,
            angle: 0,
            original: null,
        });
        setTool("rotate");
        setStatus(selectedFeatureIds.length
            ? "Drehen: Drehpunkt im CAD anklicken"
            : "Drehen: Objekt mit dem Quadrat auswÃ¤hlen");
    };
    const startScaleCommand = () => {
        setNumericCommand(null);
        setScaleSession({
            phase: selectedFeatureIds.length ? "pick-base" : "pick-object",
            base: null,
            referenceDistance: 1,
            factor: 1,
            original: null,
        });
        setTool("scale");
        setStatus(selectedFeatureIds.length
            ? "Skalieren: Basispunkt im CAD anklicken"
            : "Skalieren: Objekt mit dem Quadrat auswÃ¤hlen");
    };
    const cancelCurrentCommand = () => {
        if (rotateSession.phase === "live" && rotateSession.original) {
            setFeatures(cloneCadFeatures(rotateSession.original));
        }
        if (scaleSession.phase === "live" && scaleSession.original) {
            setFeatures(cloneCadFeatures(scaleSession.original));
        }
        if (offsetSession.phase === "live" && offsetSession.original) {
            setFeatures(cloneCadFeatures(offsetSession.original));
        }
        setRotateSession({
            phase: "idle",
            base: null,
            referenceAngle: 0,
            angle: 0,
            original: null,
        });
        setScaleSession({
            phase: "idle",
            base: null,
            referenceDistance: 1,
            factor: 1,
            original: null,
        });
        setOffsetSession({
            phase: "idle",
            distance: 1,
            signedDistance: 1,
            original: null,
            createdIds: [],
        });
        setDraftPts([]);
        setTextAnchor(null);
        setNumericCommand(null);
        setMeasurePts([]);
        setDimensionDraft(null);
        setSelectionDrag(null);
        setActiveSnap(null);
        setStatus("Befehl abgebrochen");
    };
    const applyNumericEdit = () => {
        if (!numericCommand || !selectedFeatureIds.length)
            return;
        const value = Number(String(numericCommand.value).replace(",", "."));
        if (!Number.isFinite(value)) {
            setStatus("UngÃ¼ltiger Wert");
            return;
        }
        const center = centerOfFeatures(selectedFeatures);
        if (numericCommand.kind === "rotate" &&
            rotateSession.phase === "live" &&
            rotateSession.base &&
            rotateSession.original) {
            beginMutation(rotateSession.original);
            setFeatures(rotateCadFeatures(rotateSession.original, selectedFeatureIds, rotateSession.base, value));
            setRotateSession({
                phase: "idle",
                base: null,
                referenceAngle: 0,
                angle: 0,
                original: null,
            });
            setTool("select");
            setNumericCommand(null);
            setStatus(`Auswahl um ${formatNumber(value, 2)}Â° gedreht`);
            return;
        }
        if (numericCommand.kind === "scale" &&
            scaleSession.phase === "live" &&
            scaleSession.base &&
            scaleSession.original) {
            if (Math.abs(value) < 0.000001) {
                setStatus("Skalierfaktor darf nicht 0 sein");
                return;
            }
            beginMutation(scaleSession.original);
            setFeatures(scaleCadFeatures(scaleSession.original, selectedFeatureIds, scaleSession.base, value));
            setScaleSession({
                phase: "idle",
                base: null,
                referenceDistance: 1,
                factor: 1,
                original: null,
            });
            setTool("select");
            setNumericCommand(null);
            setStatus(`Auswahl mit Faktor ${formatNumber(value, 3)} skaliert`);
            return;
        }
        beginMutation(features);
        if (numericCommand.kind === "rotate") {
            setFeatures(rotateCadFeatures(features, selectedFeatureIds, center, value));
            setStatus(`Auswahl um ${formatNumber(value, 2)}Â° gedreht`);
        }
        else if (numericCommand.kind === "scale") {
            if (Math.abs(value) < 0.000001) {
                undoStackRef.current.pop();
                setStatus("Skalierfaktor darf nicht 0 sein");
                return;
            }
            setFeatures(scaleCadFeatures(features, selectedFeatureIds, center, value));
            setStatus(`Auswahl mit Faktor ${formatNumber(value, 3)} skaliert`);
        }
        else {
            const distance = Math.abs(value);
            if (distance < 0.000001) {
                undoStackRef.current.pop();
                setStatus("Versetzen: Abstand muss grÃ¶ÃŸer als 0 sein");
                return;
            }
            const original = cloneCadFeatures(features);
            const testResult = offsetCadFeatures(original, selectedFeatureIds, distance);
            if (!testResult.createdIds.length) {
                undoStackRef.current.pop();
                setStatus("Versetzen ist nur fÃ¼r Linien und Polylinien verfÃ¼gbar");
                return;
            }
            // No mutation is committed yet. The mouse chooses the side live.
            undoStackRef.current.pop();
            setOffsetSession({
                phase: "live",
                distance,
                signedDistance: distance,
                original,
                createdIds: [],
            });
            setNumericCommand(null);
            setStatus("Versetzen LIVE: Maus auf die gewÃ¼nschte Seite bewegen Â· Linksklick bestÃ¤tigt");
            return;
        }
        setNumericCommand(null);
    };
    const normalizeFeatures = (payload) => {
        return normalizeCadFeatures(payload);
    };
    const allGeometryPoints = useMemo(() => {
        const pts = [];
        const q = normText(search);
        const fitFeatures = features.filter((feature) => {
            const layer = String(feature.layer || "0");
            if (isPresentationLayer(feature))
                return false;
            if (layerVisibility[layer] === false)
                return false;
            if (isolatedLayer && layer !== isolatedLayer)
                return false;
            if (!q)
                return true;
            return normText(`${feature.id || ""} ${layer} ${feature.name || ""} ${feature.kind || ""}`).includes(q);
        });
        for (const f of fitFeatures) {
            if (Array.isArray(f.pts))
                pts.push(...f.pts.map(cadToCanvas));
            if (f.kind === "circle" && f.pts?.[0] && Number(f.radius || 0) > 0) {
                const center = cadToCanvas(f.pts[0]);
                const radius = Number(f.radius || 0);
                pts.push({ x: center.x - radius, y: center.y - radius }, { x: center.x + radius, y: center.y + radius });
            }
        }
        if (showUtm) {
            pts.push(...utmPoints.map((p) => cadToCanvas({ x: p.x, y: p.y })));
        }
        return pts;
    }, [
        features,
        utmPoints,
        showUtm,
        layerVisibility,
        isolatedLayer,
        search,
    ]);
    const drawingBounds = useMemo(() => boundsFromPoints(allGeometryPoints), [allGeometryPoints]);
    /*
     * Browser SVG engines lose sub-pixel precision when a tight viewBox is
     * combined with multi-million UTM coordinates. Keep the real CAD/UTM
     * coordinates in state and storage, but rebase only the main viewport near
     * zero. This floating origin prevents entities and text from disappearing
     * during deep zoom.
     */
    const renderOrigin = useMemo(() => {
        // Floating origin must follow the current camera, not the total drawing bounds.
        // After loading survey points the combined bounds can span millions of units;
        // centering on those bounds reintroduces SVG precision loss during deep zoom.
        return {
            x: viewBox.x + viewBox.width / 2,
            y: viewBox.y + viewBox.height / 2,
        };
    }, [viewBox.x, viewBox.y, viewBox.width, viewBox.height]);
    const toRenderPoint = (point) => {
        return rebaseCadPoint(cadToCanvas(point), renderOrigin);
    };
    const renderCanvasToCad = (point) => canvasToCad(restoreCadPoint(point, renderOrigin));
    const renderPointsAttribute = (points) => points
        .map(toRenderPoint)
        .map((point) => `${point.x},${point.y}`)
        .join(" ");
    const renderViewBox = rebaseCadViewBox(viewBox, renderOrigin);
    const georeferenceBounds = React.useMemo(() => {
        const west = viewBox.x;
        const east = viewBox.x + viewBox.width;
        const north = -viewBox.y;
        const south = -(viewBox.y + viewBox.height);
        const corners = [
            cadUtmToLatLng(west, south, geoCrs),
            cadUtmToLatLng(west, north, geoCrs),
            cadUtmToLatLng(east, south, geoCrs),
            cadUtmToLatLng(east, north, geoCrs),
        ].filter(Boolean);
        return corners.length === 4 ? L.latLngBounds(corners) : null;
    }, [viewBox.x, viewBox.y, viewBox.width, viewBox.height, geoCrs]);
    const geoProjectedBounds = React.useMemo(() => cadViewToProjectedBounds(viewBox, geoCrs, "EPSG:25832"), [viewBox.x, viewBox.y, viewBox.width, viewBox.height, geoCrs]);
    const geoRequestProjectedBounds = React.useMemo(() => cadViewToProjectedBounds(geoRequestViewBox, geoCrs, "EPSG:25832"), [
        geoRequestViewBox.x,
        geoRequestViewBox.y,
        geoRequestViewBox.width,
        geoRequestViewBox.height,
        geoCrs,
    ]);
    const geoWmsWidth = clamp(Math.round(geoViewportSize.width), 256, 2048);
    const geoWmsHeight = clamp(Math.round(geoViewportSize.height), 256, 2048);
    const aerialWmsUrl = React.useMemo(() => buildBayernWmsUrl({
        endpoint: "https://geoservices.bayern.de/od/wms/dop/v1/dop20?",
        layer: "by_dop20c",
        bounds: geoRequestProjectedBounds,
        width: geoWmsWidth,
        height: geoWmsHeight,
        format: "image/jpeg",
        transparent: false,
        refreshToken: geoRefreshTick,
    }), [
        geoRequestProjectedBounds?.minE,
        geoRequestProjectedBounds?.minN,
        geoRequestProjectedBounds?.maxE,
        geoRequestProjectedBounds?.maxN,
        geoWmsWidth,
        geoWmsHeight,
        geoRefreshTick,
    ]);
    const parcelsWmsUrl = React.useMemo(() => buildBayernWmsUrl({
        endpoint: "https://geoservices.bayern.de/od/wms/alkis/v1/parzellarkarte?",
        layer: "by_alkis_parzellarkarte_umr_schwarz",
        bounds: geoRequestProjectedBounds,
        width: geoWmsWidth,
        height: geoWmsHeight,
        format: "image/png",
        transparent: true,
        refreshToken: geoRefreshTick,
    }), [
        geoRequestProjectedBounds?.minE,
        geoRequestProjectedBounds?.minN,
        geoRequestProjectedBounds?.maxE,
        geoRequestProjectedBounds?.maxN,
        geoWmsWidth,
        geoWmsHeight,
        geoRefreshTick,
    ]);
    const bordersWmsUrl = React.useMemo(() => buildBayernWmsUrl({
        endpoint: "https://geoservices.bayern.de/od/wms/alkis/v1/verwaltungsgrenzen?",
        layer: "by_alkis_gmd_grenze",
        bounds: geoRequestProjectedBounds,
        width: geoWmsWidth,
        height: geoWmsHeight,
        format: "image/png",
        transparent: true,
        refreshToken: geoRefreshTick,
    }), [
        geoRequestProjectedBounds?.minE,
        geoRequestProjectedBounds?.minN,
        geoRequestProjectedBounds?.maxE,
        geoRequestProjectedBounds?.maxN,
        geoWmsWidth,
        geoWmsHeight,
        geoRefreshTick,
    ]);
    useEffect(() => {
        if (!hasBayernWmsLayers)
            return;
        const timer = window.setTimeout(() => {
            setGeoRequestViewBox({ ...viewBox });
        }, 90);
        return () => window.clearTimeout(timer);
    }, [
        viewBox.x,
        viewBox.y,
        viewBox.width,
        viewBox.height,
        geoCrs,
        geoRefreshTick,
        hasBayernWmsLayers,
    ]);
    const syncGeoMapToCadView = React.useCallback(() => {
        const map = geoMapRef.current;
        if (!map || !geoLayers.osm || !georeferenceBounds)
            return;
        map.invalidateSize({ animate: false, pan: false });
        map.fitBounds(georeferenceBounds, {
            animate: false,
            paddingTopLeft: L.point(0, 0),
            paddingBottomRight: L.point(0, 0),
            maxZoom: 22,
        });
    }, [georeferenceBounds, geoLayers.osm]);
    useEffect(() => {
        const host = geoMapHostRef.current;
        if (!host || geoMapRef.current)
            return;
        const map = L.map(host, {
            zoomControl: false,
            attributionControl: true,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false,
            touchZoom: false,
            preferCanvas: true,
            zoomSnap: 0,
            zoomDelta: 0.1,
            zoomAnimation: false,
            fadeAnimation: false,
            markerZoomAnimation: false,
            minZoom: 0,
            maxZoom: 22,
        }).setView([47.63, 12.98], 12);
        geoMapRef.current = map;
        window.setTimeout(() => map.invalidateSize({ animate: false, pan: false }), 50);
        return () => {
            map.remove();
            geoMapRef.current = null;
        };
    }, []);
    useEffect(() => {
        const map = geoMapRef.current;
        if (!map)
            return;
        if (geoOsmLayerRef.current) {
            map.removeLayer(geoOsmLayerRef.current);
            geoOsmLayerRef.current = null;
        }
        if (!geoLayers.osm)
            return;
        geoOsmLayerRef.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxNativeZoom: 19,
            maxZoom: 22,
            updateWhenZooming: true,
            keepBuffer: 4,
            attribution: "Â© OpenStreetMap",
            crossOrigin: true,
        }).addTo(map);
        map.invalidateSize({ animate: false, pan: false });
    }, [geoLayers.osm]);
    useEffect(() => {
        if (!geoLayers.osm || !georeferenceBounds)
            return;
        let secondFrame = 0;
        const firstFrame = window.requestAnimationFrame(() => {
            secondFrame = window.requestAnimationFrame(syncGeoMapToCadView);
        });
        return () => {
            window.cancelAnimationFrame(firstFrame);
            if (secondFrame)
                window.cancelAnimationFrame(secondFrame);
        };
    }, [
        syncGeoMapToCadView,
        geoLayers.osm,
        cadFullscreen,
        projectDockHeight,
        projectDockCollapsed,
    ]);
    const fitDrawing = () => {
        const b = drawingBounds;
        if (!b) {
            setViewBox({
                x: 0,
                y: 0,
                width: 100 * viewportAspect,
                height: 100,
            });
            return;
        }
        setViewBox(boundsToAspectViewBox(expandBounds(b, 0.08), viewportAspect));
    };
    useEffect(() => {
        // Fit exactly once when the first drawing is hydrated. Mutations such as
        // delete, draw, undo/redo or point import must never reset the camera.
        if (!initialFitDoneRef.current && drawingBounds) {
            initialFitDoneRef.current = true;
            fitDrawing();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [Boolean(drawingBounds)]);
    const layerStates = useMemo(() => {
        const counts = new Map();
        for (const f of features) {
            const layer = String(f.layer || "0");
            const current = counts.get(layer);
            counts.set(layer, {
                count: (current?.count || 0) + 1,
                color: current?.color || featureColor(f),
                length: (current?.length || 0) + Number(f.length || 0),
                area: (current?.area || 0) + Number(f.area || 0),
                textCount: (current?.textCount || 0) +
                    (String(f.kind || "").toLowerCase() === "text" ? 1 : 0),
            });
        }
        // Auch leere, neu angelegte Layer mÃ¼ssen in der Layerstruktur erscheinen.
        const knownLayerNames = new Set([
            "0",
            activeLayer || "0",
            ...Object.keys(layerVisibility),
            ...Object.keys(layerColors),
            ...counts.keys(),
        ]);
        for (const name of knownLayerNames) {
            if (!counts.has(name)) {
                counts.set(name, {
                    count: 0,
                    color: layerColors[name] || "#d7dde5",
                    length: 0,
                    area: 0,
                    textCount: 0,
                });
            }
        }
        return Array.from(counts.entries())
            .map(([name, info]) => ({
            name,
            count: info.count,
            visible: layerVisibility[name] !== false,
            color: layerColors[name] || info.color,
            length: info.length,
            area: info.area,
            textCount: info.textCount,
        }))
            .sort((a, b) => a.name.localeCompare(b.name, "de"));
    }, [features, layerVisibility, layerColors, activeLayer]);
    useEffect(() => {
        if (!activeLayerMenuOpen)
            return;
        const handlePointerDown = (event) => {
            const target = event.target;
            const insideTrigger = Boolean(activeLayerMenuRef.current &&
                target &&
                activeLayerMenuRef.current.contains(target));
            const insidePopup = Boolean(activeLayerPopupRef.current &&
                target &&
                activeLayerPopupRef.current.contains(target));
            if (!insideTrigger && !insidePopup) {
                setActiveLayerMenuOpen(false);
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === "Escape")
                setActiveLayerMenuOpen(false);
        };
        window.addEventListener("mousedown", handlePointerDown);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("mousedown", handlePointerDown);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [activeLayerMenuOpen]);
    const visibleFeatures = useMemo(() => {
        const q = normText(search);
        return features.filter((f) => {
            if (isPresentationLayer(f))
                return false;
            if (layerVisibility[String(f.layer || "0")] === false)
                return false;
            if (isolatedLayer && String(f.layer || "0") !== isolatedLayer)
                return false;
            if (!q)
                return true;
            return normText(`${f.id || ""} ${f.layer || ""} ${f.name || ""} ${f.kind || ""}`).includes(q);
        });
    }, [features, layerVisibility, isolatedLayer, search]);
    const renderedFeatures = useMemo(() => visibleFeatures.filter((feature) => showCadTexts ||
        String(feature.kind || "").toLowerCase() !== "text"), [visibleFeatures, showCadTexts]);
    /*
     * V15.28: render and snap only entities near the active viewport.
     * Large DWG files can contain tens of thousands of entities; mounting every
     * SVG node and scanning every feature on each pointer frame makes pan and
     * cursor movement stutter. The safety margin avoids pop-in at the edges.
     */
    const viewportFeatures = useMemo(() => {
        if (renderedFeatures.length < 2500)
            return renderedFeatures;
        const marginX = Math.max(viewBox.width * 0.12, 0.001);
        const marginY = Math.max(viewBox.height * 0.12, 0.001);
        const viewportBounds = {
            minX: viewBox.x - marginX,
            minY: -(viewBox.y + viewBox.height) - marginY,
            maxX: viewBox.x + viewBox.width + marginX,
            maxY: -viewBox.y + marginY,
        };
        const nearby = renderedFeatures.filter((feature) => {
            const bounds = featureBounds(feature);
            return bounds ? boundsIntersect(bounds, viewportBounds) : false;
        });
        // V15.33: niemals mehr nach Array-Index ausdÃ¼nnen. Bei weitem Zoom
        // verschwanden dadurch komplette StraÃŸen-/AchszÃ¼ge, weil zufÃ¤llig nur
        // Punkte oder kurze Hilfsgeometrien Ã¼brig blieben. Stattdessen werden die
        // visuell wichtigsten Objekte deterministisch nach ihrer BildschirmgrÃ¶ÃŸe
        // priorisiert. Beim Hineinzoomen erscheinen automatisch wieder alle Details.
        const maxViewportNodes = 5200;
        if (nearby.length <= maxViewportNodes)
            return nearby;
        const selected = new Set(selectedFeatureIds);
        const scored = nearby.map((feature, index) => {
            const id = String(feature.id || "");
            const kind = String(feature.kind || "").toLowerCase();
            const bounds = featureBounds(feature);
            const spanX = bounds
                ? Math.max(0, bounds.maxX - bounds.minX) / Math.max(viewBox.width, 1e-9)
                : 0;
            const spanY = bounds
                ? Math.max(0, bounds.maxY - bounds.minY) / Math.max(viewBox.height, 1e-9)
                : 0;
            const screenSpan = Math.max(spanX, spanY);
            const lengthScore = Math.log10(1 + Math.max(0, Number(feature.length || 0)));
            const areaScore = Math.log10(1 + Math.max(0, Number(feature.area || 0)));
            const kindScore = kind === "polyline" || kind === "line" ? 8 :
                kind === "circle" || kind === "polygon" || kind === "rectangle" ? 5 :
                    kind === "text" ? (screenSpan > 0.018 ? 2 : -8) :
                        kind === "point" ? -5 :
                            kind === "hatch" ? -10 : 0;
            const score = (selected.has(id) ? 1000000 : 0) +
                screenSpan * 10000 +
                lengthScore * 12 +
                areaScore * 4 +
                kindScore;
            return { feature, score, index };
        });
        scored.sort((left, right) => right.score - left.score || left.index - right.index);
        return scored
            .slice(0, maxViewportNodes)
            .sort((left, right) => left.index - right.index)
            .map((entry) => entry.feature);
    }, [
        renderedFeatures,
        viewBox.x,
        viewBox.y,
        viewBox.width,
        viewBox.height,
        selectedFeatureIds,
    ]);
    const interactionActive = Boolean(dragStart || selectionDrag || objectDrag || vertexDrag) ||
        (tool === "rotate" && rotateSession.phase === "live") ||
        (tool === "scale" && scaleSession.phase === "live") ||
        (tool === "offset" && offsetSession.phase === "live") ||
        ["line", "polyline", "rectangle", "circle", "distance", "area",
            "dimLinear", "dimAligned", "mirror", "trim", "extend", "join",
            "fillet", "hatch", "boundary"].includes(tool);
    const interactiveViewportFeatures = useMemo(() => {
        if (!interactionActive || viewportFeatures.length < 1200) {
            return viewportFeatures;
        }
        const selected = new Set(selectedFeatureIds);
        const important = [];
        const background = [];
        for (const feature of viewportFeatures) {
            const id = String(feature.id || "");
            const kind = String(feature.kind || "").toLowerCase();
            if (selected.has(id)) {
                important.push(feature);
                continue;
            }
            // Testi, tratteggi e riempimenti sono i nodi SVG piÃ¹ costosi.
            if (kind === "text" || kind === "hatch")
                continue;
            background.push(feature);
        }
        const maxBackground = 700;
        if (background.length <= maxBackground) {
            return [...background, ...important];
        }
        const step = Math.ceil(background.length / maxBackground);
        const sampled = background.filter((_, index) => index % step === 0);
        return [...sampled, ...important];
    }, [
        viewportFeatures,
        interactionActive,
        selectedFeatureIds,
    ]);
    useEffect(() => {
        const projectDbId = current?.id ? String(current.id) : "";
        if (!projectDbId) {
            setLvPositions([]);
            setLvState("idle");
            return;
        }
        let cancelled = false;
        const load = async () => {
            setLvState("loading");
            try {
                try {
                    const collected = [];
                    const seen = new Set();
                    for (let page = 1; page <= 100; page += 1) {
                        const data = await fetchJson(apiUrl(`/api/projects/${encodeURIComponent(projectDbId)}/lv?page=${page}&pageSize=200`));
                        const batch = mapAnyToLvPositions(extractLvListFromNewEndpoint(data));
                        let added = 0;
                        for (const position of batch) {
                            const key = position.id ||
                                `${normalizePositionKey(position.pos)}__${position.text}`;
                            if (seen.has(key))
                                continue;
                            seen.add(key);
                            collected.push(position);
                            added += 1;
                        }
                        if (batch.length < 200 || added === 0)
                            break;
                    }
                    if (!cancelled) {
                        setLvPositions(collected);
                        setSelectedLvId((previous) => {
                            if (collected.some((position) => position.id === previous)) {
                                return previous;
                            }
                            const linked = collected.find((position) => normalizePositionKey(position.pos) ===
                                normalizePositionKey(pos));
                            return linked?.id || collected[0]?.id || "";
                        });
                        setLvState("ok");
                    }
                    return;
                }
                catch {
                    // Legacy fallback.
                }
                const legacy = await fetchJson(apiUrl(`/api/project-lv/${encodeURIComponent(projectDbId)}`));
                const mappedLegacy = mapAnyToLvPositions(extractLvListFromOldEndpoint(legacy));
                if (!cancelled) {
                    setLvPositions(mappedLegacy);
                    setSelectedLvId((previous) => {
                        if (mappedLegacy.some((position) => position.id === previous)) {
                            return previous;
                        }
                        const linked = mappedLegacy.find((position) => normalizePositionKey(position.pos) ===
                            normalizePositionKey(pos));
                        return linked?.id || mappedLegacy[0]?.id || "";
                    });
                    setLvState("ok");
                }
            }
            catch {
                if (!cancelled) {
                    setLvPositions([]);
                    setLvState("error");
                }
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [current?.id]);
    const loadPositionAufmass = async (positionNumber) => {
        const targetPos = String(positionNumber ?? selectedLvPosition?.pos ?? pos).trim();
        const projectKey = String(current?.code || projectId || "").trim();
        const projectDbId = String(current?.id || "").trim();
        if (!targetPos || (!projectKey && !projectDbId)) {
            setPositionAufmassRows([]);
            setPositionAufmassState("idle");
            return;
        }
        setPositionAufmassState("loading");
        const endpoints = [
            projectKey
                ? `/api/aufmass/soll-ist/${encodeURIComponent(projectKey)}`
                : "",
            projectDbId
                ? `/api/projects/${encodeURIComponent(projectDbId)}/aufmass`
                : "",
            projectKey
                ? `/api/aufmass?projectId=${encodeURIComponent(projectKey)}`
                : "",
        ].filter(Boolean);
        let reachedEndpoint = false;
        for (const endpoint of endpoints) {
            try {
                const data = await fetchJson(apiUrl(endpoint));
                reachedEndpoint = true;
                const targetKey = normalizePositionKey(targetPos);
                const rows = extractAufmassRows(data).filter((row) => normalizePositionKey(row.pos) === targetKey);
                if (rows.length) {
                    setPositionAufmassRows(rows);
                    setPositionAufmassState("ok");
                    return;
                }
            }
            catch {
                // Continue with the next compatible AufmaÃŸ endpoint.
            }
        }
        setPositionAufmassRows([]);
        setPositionAufmassState(reachedEndpoint ? "ok" : "error");
    };
    useEffect(() => {
        if (!selectedLvPosition) {
            setPositionAufmassRows([]);
            setPositionAufmassState("idle");
            return;
        }
        setPos(selectedLvPosition.pos);
        setKurz(selectedLvPosition.text);
        setUnit(normalizeLvUnit(selectedLvPosition.unit));
        void loadPositionAufmass(selectedLvPosition.pos);
        // The selected stable LV id is the trigger; project changes reload the LV first.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedLvPosition?.id, projectId]);
    const mergeDrawingLists = (serverItems, localItems) => {
        const merged = new Map();
        for (const item of [...serverItems, ...localItems]) {
            const key = String(item.id || item.localStorageId || "").trim() ||
                cadDrawingSafeId(item.fileName || item.drawingName);
            const previous = merged.get(key);
            merged.set(key, {
                ...(previous || {}),
                ...item,
                data: previous?.data || item.data,
                localStorageId: previous?.localStorageId || item.localStorageId,
                source: previous?.source === "server" ? "server" : item.source,
            });
        }
        return Array.from(merged.values()).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    };
    const loadDrawingLibrary = async () => {
        const targetProject = projectId.trim();
        if (!targetProject) {
            void cadAlert("Kein Projekt gewÃ¤hlt.");
            return;
        }
        localStorage.setItem("rlc_projectId", targetProject);
        setDrawingBrowserOpen(true);
        setDrawingListState("loading");
        setDrawingListError("");
        const encodedProject = encodeURIComponent(targetProject);
        const projectDbId = String(current?.id || "").trim();
        const endpoints = [
            `/api/cad/drawings?projectId=${encodedProject}`,
            `/api/cad/list?projectId=${encodedProject}`,
            `/api/cad/files?projectId=${encodedProject}`,
            `/api/cad-compat/list?projectId=${encodedProject}`,
            projectDbId
                ? `/api/projects/${encodeURIComponent(projectDbId)}/cad/drawings`
                : "",
        ].filter(Boolean);
        const collected = [];
        const errors = [];
        for (const endpoint of endpoints) {
            try {
                const response = await fetchJson(apiUrl(endpoint));
                collected.push(...extractCadDrawingList(response));
            }
            catch (error) {
                errors.push(String(error?.message || error));
            }
        }
        const localItems = readLocalCadDrawingList(targetProject);
        let merged = mergeDrawingLists(collected, localItems);
        if (!merged.length && takeoff && !dirty) {
            const currentPayload = {
                ...takeoff,
                drawingId: currentDrawingId || takeoff?.drawingId,
                drawingName,
                fileName: String(takeoff?.fileName || "").trim() ||
                    `${cadDrawingSafeId(drawingName)}.rlccad.json`,
            };
            merged = [
                {
                    id: String(currentPayload.drawingId || "").trim() ||
                        cadDrawingSafeId(currentPayload.fileName || currentPayload.drawingName),
                    drawingName: currentPayload.drawingName || drawingName,
                    fileName: currentPayload.fileName,
                    objectCount: normalizeFeatures(currentPayload).length,
                    data: currentPayload,
                    source: "browser",
                },
            ];
        }
        // Legacy fallback: older servers expose only the last drawing.
        if (!merged.length) {
            try {
                const response = await fetchJson(apiUrl(`/api/cad/load?projectId=${encodedProject}`));
                const payload = unwrapCadPayload(response);
                const count = normalizeFeatures(payload).length;
                if (count) {
                    merged = [
                        {
                            id: String(payload.drawingId || "").trim() ||
                                cadDrawingSafeId(payload.fileName || payload.drawingName || drawingName),
                            drawingName: String(payload.drawingName || drawingName || "Zeichnung"),
                            fileName: payload.fileName,
                            objectCount: count,
                            data: payload,
                            source: "server",
                        },
                    ];
                }
            }
            catch (error) {
                errors.push(String(error?.message || error));
            }
        }
        setDrawingList(merged);
        setDrawingListState(merged.length ? "ok" : errors.length ? "error" : "ok");
        setDrawingListError(merged.length
            ? ""
            : "Keine gespeicherten Zeichnungen fÃ¼r dieses Projekt gefunden.");
    };
    const openSavedDrawing = async (item) => {
        if (dirty &&
            !await cadConfirm("Ungespeicherte Ã„nderungen verwerfen und eine andere Zeichnung Ã¶ffnen?")) {
            return;
        }
        const targetProject = projectId.trim();
        if (!targetProject)
            return;
        setOpeningDrawingId(item.id);
        setStatus(`Zeichnung â€ž${item.drawingName}â€ wird geÃ¶ffnetâ€¦`);
        try {
            let payload = null;
            // Solo una Browser-Sicherung puÃ² essere aperta direttamente dal localStorage.
            if (item.source === "browser" && item.localStorageId) {
                const localPayload = readLocalCadDrawing(targetProject, item.localStorageId);
                if (localPayload && normalizeFeatures(localPayload).length > 0) {
                    payload = localPayload;
                }
            }
            // Le voci Server sono sempre metadati: scaricare il documento completo.
            if (item.source === "server" || !payload) {
                const projectParam = encodeURIComponent(targetProject);
                const idParam = encodeURIComponent(item.id);
                const nameParam = encodeURIComponent(item.drawingName);
                const fileParam = encodeURIComponent(item.fileName || "");
                const cacheToken = `_rlc=${Date.now()}`;
                const endpoints = [
                    `/api/cad/load?projectId=${projectParam}&drawingId=${idParam}&${cacheToken}`,
                    `/api/cad/drawings/${idParam}?projectId=${projectParam}&${cacheToken}`,
                    item.fileName
                        ? `/api/cad/load?projectId=${projectParam}&fileName=${fileParam}&${cacheToken}`
                        : "",
                    `/api/cad/load?projectId=${projectParam}&drawingName=${nameParam}&${cacheToken}`,
                ].filter(Boolean);
                let lastError = "";
                for (const endpoint of endpoints) {
                    try {
                        const response = await fetch(apiUrl(endpoint), {
                            method: "GET",
                            credentials: "include",
                            cache: "no-store",
                            headers: authHeaders(),
                        });
                        const raw = await response.text().catch(() => "");
                        if (!response.ok) {
                            lastError = raw || `HTTP ${response.status}`;
                            continue;
                        }
                        let decoded = {};
                        try {
                            decoded = raw ? JSON.parse(raw) : {};
                        }
                        catch {
                            lastError = "UngÃ¼ltige JSON-Antwort";
                            continue;
                        }
                        const candidate = unwrapCadPayload(decoded);
                        const candidateFeatures = normalizeFeatures(candidate);
                        if (candidateFeatures.length > 0) {
                            payload = candidate;
                            break;
                        }
                        lastError =
                            `Server lieferte 0 Objekte fÃ¼r â€ž${item.drawingName}â€`;
                    }
                    catch (error) {
                        lastError = String(error?.message || error);
                    }
                }
                if (!payload) {
                    throw new Error(lastError ||
                        `Zeichnung â€ž${item.drawingName}â€ konnte nicht vollstÃ¤ndig geladen werden.`);
                }
            }
            const nextFeatures = normalizeFeatures(payload);
            if (!nextFeatures.length) {
                throw new Error(`Zeichnung â€ž${item.drawingName}â€ wurde geladen, enthÃ¤lt aber keine Geometrie.`);
            }
            replaceDrawing(nextFeatures, payload);
            const restoredPoints = Array.isArray(payload?.utmPoints)
                ? payload.utmPoints
                : Array.isArray(payload?.points)
                    ? payload.points
                    : [];
            setUtmPoints(restoredPoints);
            setUtmCsv(String(payload?.utmCsv || ""));
            setDrawingName(String(payload.drawingName || item.drawingName || "Zeichnung"));
            setCurrentDrawingId(String(payload.drawingId ||
                item.id ||
                item.localStorageId ||
                "").trim());
            setCurrentDrawingServerBacked(item.source === "server");
            setDirty(false);
            setIsNewDrawing(false);
            initialFitDoneRef.current = false;
            setDrawingBrowserOpen(false);
            // Sicherstellen, dass der neue Zeichnungsinhalt sofort sichtbar wird.
            window.requestAnimationFrame(() => {
                const points = nextFeatures
                    .filter((feature) => !isPresentationLayer(feature))
                    .flatMap((feature) => {
                    const result = (feature.pts || []).map(cadToCanvas);
                    if (feature.kind === "circle" &&
                        feature.pts?.[0] &&
                        Number(feature.radius || 0) > 0) {
                        const center = cadToCanvas(feature.pts[0]);
                        const radius = Number(feature.radius || 0);
                        result.push({ x: center.x - radius, y: center.y - radius }, { x: center.x + radius, y: center.y + radius });
                    }
                    return result;
                });
                const bounds = boundsFromPoints(points);
                if (bounds) {
                    setViewBox(boundsToAspectViewBox(expandBounds(bounds, 0.08), viewportAspect));
                }
                initialFitDoneRef.current = true;
            });
            setStatus(`Zeichnung â€ž${payload.drawingName || item.drawingName}â€ geÃ¶ffnet (${nextFeatures.length} Objekte)`);
        }
        catch (error) {
            setStatus("Zeichnung konnte nicht geÃ¶ffnet werden");
            void cadAlert(String(error?.message || error));
        }
        finally {
            setOpeningDrawingId("");
        }
    };
    const createNewDrawing = async () => {
        if (dirty && !await cadConfirm("Ungespeicherte Ã„nderungen verwerfen und eine neue Zeichnung beginnen?")) {
            return;
        }
        const knownDrawings = mergeDrawingLists(drawingList, readLocalCadDrawingList(projectId.trim()));
        const usedNumbers = [drawingName, ...knownDrawings.map((item) => item.drawingName)]
            .map((name) => String(name || "").match(/^Zeichnung\s+(\d+)$/i))
            .filter((match) => Boolean(match))
            .map((match) => Number(match[1]))
            .filter(Number.isFinite);
        const proposed = `Zeichnung ${Math.max(0, ...usedNumbers) + 1}`;
        const requested = await cadPrompt("Name der neuen Zeichnung", proposed);
        if (requested === null)
            return;
        const nextName = String(requested || proposed).trim() || proposed;
        const nextDrawingId = createCadDrawingId(nextName);
        setFeatures([]);
        setTakeoff(null);
        setUtmPoints([]);
        setUtmCsv("");
        setSelectedFeatureId("");
        setSelectedFeatureIds([]);
        setSelectedUtmIds([]);
        setLayerVisibility({});
        setLayerColors({});
        setIsolatedLayer("");
        setActiveLayer("0");
        setDrawingName(nextName);
        setCurrentDrawingId(nextDrawingId);
        setCurrentDrawingServerBacked(false);
        setViewBox({ x: 0, y: 0, width: 100 * viewportAspect, height: 100 });
        setMeasurePts([]);
        setDraftPts([]);
        setIsNewDrawing(true);
        setDirty(true);
        initialFitDoneRef.current = false;
        resetHistory();
        setDrawingBrowserOpen(false);
        setStatus(`Neue ungespeicherte Zeichnung â€ž${nextName}â€`);
    };
    const loadUtm = async (silent = false) => {
        if (!projectId)
            return void cadAlert("Kein Projekt gewÃ¤hlt.");
        setStatus("UTM-Punkte werden geladenâ€¦");
        try {
            const j = await fetchJson(apiUrl(`/api/bricscad/utm?projectId=${encodeURIComponent(projectId)}`));
            if (!j?.ok)
                throw new Error(j?.message || "UTM konnte nicht geladen werden.");
            const csv = String(j.csv || "");
            const pts = parseUtmCsvFlexible(csv);
            setUtmCsv(csv);
            setUtmPoints(pts);
            setStatus(`UTM geladen (${pts.length} Punkte)`);
        }
        catch (e) {
            if (!silent) {
                setStatus("UTM Fehler");
                void cadAlert(String(e?.message || e));
            }
        }
    };
    const loadTakeoff = async (silent = false) => {
        if (!projectId)
            return void cadAlert("Kein Projekt gewÃ¤hlt.");
        setStatus("CAD-Daten werden geladenâ€¦");
        try {
            let payload = null;
            let sourceLabel = "";
            let lastError = "";
            const sources = [
                {
                    label: "RLC CAD",
                    url: `/api/cad/load?projectId=${encodeURIComponent(projectId)}`,
                },
                {
                    label: "RLC CAD KompatibilitÃ¤t",
                    url: `/api/cad-compat/load?projectId=${encodeURIComponent(projectId)}`,
                },
                {
                    label: "RLC Mengenermittlung",
                    url: `/api/cad/takeoff?projectId=${encodeURIComponent(projectId)}`,
                },
                {
                    label: "Mengenermittlung-Import",
                    url: `/api/bricscad/takeoff?projectId=${encodeURIComponent(projectId)}`,
                },
                {
                    label: "Letzter CAD-Import",
                    url: `/api/bricscad/latest-import?projectId=${encodeURIComponent(projectId)}`,
                },
            ];
            for (const source of sources) {
                try {
                    const response = await fetchJson(apiUrl(source.url));
                    const candidate = (response?.data ||
                        response?.document ||
                        response?.takeoff ||
                        response);
                    if (normalizeFeatures(candidate).length) {
                        payload = candidate;
                        sourceLabel = source.label;
                        break;
                    }
                    lastError = response?.message || "keine Geometrie";
                }
                catch (error) {
                    lastError = String(error?.message || error);
                }
            }
            if (!payload) {
                throw new Error(`Keine CAD-Geometrie in den Projekt- oder Mengenermittlungsdaten gefunden.${lastError ? `\n${lastError}` : ""}`);
            }
            const feats = normalizeFeatures(payload);
            replaceDrawing(feats, payload);
            const loadedDrawingName = String(payload.drawingName || drawingName || "Zeichnung").trim();
            setDrawingName(loadedDrawingName);
            setCurrentDrawingId(String(payload.drawingId || "").trim() ||
                cadDrawingSafeId(payload.fileName || loadedDrawingName));
            setCurrentDrawingServerBacked(true);
            const restoredPoints = Array.isArray(payload?.utmPoints)
                ? payload.utmPoints
                : Array.isArray(payload?.points)
                    ? payload.points
                    : [];
            if (restoredPoints.length) {
                setUtmPoints(restoredPoints);
                setUtmCsv(String(payload?.utmCsv || ""));
                setShowUtm(true);
            }
            setStatus(`${sourceLabel} geladen (${feats.length} Objekte${restoredPoints.length ? ` Â· ${restoredPoints.length} Punkte` : ""})`);
            return true;
        }
        catch (e) {
            setStatus(silent ? "Keine gespeicherte CAD-Zeichnung" : "CAD Fehler");
            if (!silent)
                void cadAlert(String(e?.message || e));
            return false;
        }
    };
    const persistCadDrawing = async (drawingFeatures, options) => {
        const silent = Boolean(options?.silent);
        if (!projectId) {
            if (!silent)
                void cadAlert("Kein Projekt gewÃ¤hlt.");
            return false;
        }
        const activeDrawingId = currentDrawingId || createCadDrawingId(drawingName || "Zeichnung");
        const document = {
            ...createCadDocument(projectId, drawingFeatures, {
                format: "RLC",
                importedAt: new Date().toISOString(),
                ...(options?.source || {}),
            }),
            drawingId: activeDrawingId,
            points: utmPoints,
            utmPoints,
            utmCsv,
            drawingName,
            fileName: (!isNewDrawing && String(takeoff?.fileName || "").trim()) ||
                `${cadDrawingSafeId(drawingName || "Zeichnung")}.rlccad.json`,
            layerColors,
        };
        setStatus(silent
            ? "Ã„nderungen werden automatisch gespeichertâ€¦"
            : "RLC CAD wird gespeichertâ€¦");
        try {
            let savedOnServer = false;
            let lastError = "";
            const saveEndpoints = isNewDrawing || !currentDrawingServerBacked
                ? ["/api/cad/save-as"]
                : ["/api/cad/save", "/api/cad-compat/save"];
            for (const endpoint of saveEndpoints) {
                try {
                    const res = await fetch(apiUrl(endpoint), {
                        method: "POST",
                        credentials: "include",
                        headers: authHeaders({ "Content-Type": "application/json" }),
                        body: JSON.stringify({
                            projectId,
                            drawingId: activeDrawingId,
                            drawingName: document.drawingName,
                            fileName: document.fileName,
                            createNew: isNewDrawing,
                            data: document,
                        }),
                    });
                    const text = await res.text().catch(() => "");
                    let result = {};
                    try {
                        result = text ? JSON.parse(text) : {};
                    }
                    catch {
                        result = {};
                    }
                    if (res.ok && result?.ok !== false) {
                        savedOnServer = true;
                        break;
                    }
                    lastError =
                        result?.error ||
                            result?.message ||
                            text ||
                            `HTTP ${res.status}`;
                }
                catch (error) {
                    lastError = String(error?.message || error);
                }
            }
            const storedId = rememberLocalCadDrawing(projectId, document, activeDrawingId);
            setTakeoff({ ...document, drawingId: storedId });
            setCurrentDrawingId(storedId);
            setCurrentDrawingServerBacked(savedOnServer);
            setIsNewDrawing(false);
            setDirty(false);
            setStatus(savedOnServer
                ? `${silent ? "Automatisch gespeichert" : "Gespeichert"} (${drawingFeatures.length} Objekte)`
                : `Im Browser separat gespeichert Â· Server-Mehrfachspeicherung nicht verfÃ¼gbar`);
            return true;
        }
        catch (error) {
            setStatus(silent
                ? "Automatisches Speichern fehlgeschlagen"
                : "Speichern fehlgeschlagen");
            if (!silent) {
                void cadAlert(`RLC CAD konnte nicht serverseitig gespeichert werden.\n${String(error?.message || error)}`);
            }
            return false;
        }
    };
    const saveCadDrawing = async () => persistCadDrawing(features, { silent: false });
    const saveCadDrawingAs = async () => {
        if (!projectId.trim()) {
            void cadAlert("Kein Projekt gewÃ¤hlt.");
            return;
        }
        const requested = await cadPrompt("Name der Zeichnung", drawingName || "Zeichnung 1");
        const nextName = String(requested || "").trim();
        if (!nextName)
            return;
        const nextDrawingId = createCadDrawingId(nextName);
        setDrawingName(nextName);
        setCurrentDrawingId(nextDrawingId);
        setCurrentDrawingServerBacked(false);
        const document = {
            ...createCadDocument(projectId, features, {
                format: "RLC",
                importedAt: new Date().toISOString(),
            }),
            drawingId: nextDrawingId,
            drawingName: nextName,
            fileName: `${nextName.replace(/[^a-zA-Z0-9._-]+/g, "_")}.rlccad.json`,
            points: utmPoints,
            utmPoints,
            utmCsv,
            layerColors,
        };
        setStatus(`Speichern unter: ${nextName}â€¦`);
        let saved = false;
        let lastError = "";
        for (const endpoint of ["/api/cad/save-as"]) {
            try {
                const res = await fetch(apiUrl(endpoint), {
                    method: "POST",
                    credentials: "include",
                    headers: authHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({
                        projectId,
                        drawingId: nextDrawingId,
                        drawingName: nextName,
                        fileName: document.fileName,
                        createNew: true,
                        data: document,
                    }),
                });
                const text = await res.text().catch(() => "");
                let result = {};
                try {
                    result = text ? JSON.parse(text) : {};
                }
                catch {
                    result = {};
                }
                if (res.ok && result?.ok !== false) {
                    saved = true;
                    break;
                }
                lastError = result?.error || result?.message || text || `HTTP ${res.status}`;
            }
            catch (error) {
                lastError = String(error?.message || error);
            }
        }
        const storedId = rememberLocalCadDrawing(projectId, document, nextDrawingId);
        setTakeoff({ ...document, drawingId: storedId });
        setCurrentDrawingId(storedId);
        setCurrentDrawingServerBacked(saved);
        setIsNewDrawing(false);
        setDirty(false);
        setStatus(saved
            ? `Gespeichert unter â€ž${nextName}â€`
            : `â€ž${nextName}â€ separat im Browser gespeichert Â· Server-Mehrfachspeicherung nicht verfÃ¼gbar`);
    };
    useEffect(() => {
        const targetProject = projectId.trim();
        if (!targetProject ||
            lastAutoLoadedProjectRef.current === targetProject) {
            return;
        }
        lastAutoLoadedProjectRef.current = targetProject;
        const timer = window.setTimeout(() => {
            void Promise.allSettled([loadUtm(true), loadTakeoff(true)]);
        }, 350);
        return () => window.clearTimeout(timer);
        // The project key is the only automatic load trigger.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);
    useEffect(() => {
        if (!dirty || (!features.length && !utmPoints.length) || !projectId.trim())
            return;
        // Bei groÃŸen Zeichnungen kein automatisches JSON.stringify/Upload im
        // Hauptthread. Manuelles Speichern bleibt verfÃ¼gbar.
        if (features.length > 25000)
            return;
        const timer = window.setTimeout(() => {
            void persistCadDrawing(features, {
                silent: true,
                source: { format: "RLC-AUTOSAVE" },
            });
        }, 1200);
        return () => window.clearTimeout(timer);
        // Save only after geometry has stopped changing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty, features, utmPoints, utmCsv, projectId, isNewDrawing]);
    const openPointFile = () => {
        if (!projectId) {
            void cadAlert("Kein Projekt gewÃ¤hlt.");
            return;
        }
        pointFileInputRef.current?.click();
    };
    const importPointFile = async (event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = "";
        if (!file)
            return;
        try {
            const csv = await file.text();
            const pts = parseUtmCsvFlexible(csv);
            if (!pts.length)
                throw new Error("Keine Punkte erkannt. Erwartet werden Punktname, Rechtswert, Hochwert, HÃ¶he und optional Code.");
            setUtmCsv(csv);
            setUtmPoints(pts);
            setShowUtm(true);
            setStatus(`Punktdatei geladen (${pts.length} Punkte) Â· Speichern erforderlich`);
            setDirty(true);
        }
        catch (error) {
            void cadAlert(String(error?.message || error));
        }
    };
    const openCadFile = () => {
        if (!projectId) {
            void cadAlert("Kein Projekt gewÃ¤hlt.");
            return;
        }
        cadFileInputRef.current?.click();
    };
    const importCadFile = async (event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = "";
        if (!file)
            return;
        if (!projectId) {
            void cadAlert("Kein Projekt gewÃ¤hlt.");
            return;
        }
        const extension = file.name.split(".").pop()?.toLowerCase() || "";
        try {
            setStatus(`CAD-Datei wird geÃ¶ffnet: ${file.name}`);
            if (extension === "json" || extension === "geojson") {
                const parsed = JSON.parse(await file.text());
                const payload = parsed;
                const feats = normalizeFeatures(payload);
                if (!feats.length) {
                    throw new Error("Keine RLC-Geometrie in der Datei gefunden.");
                }
                replaceDrawing(feats, payload);
                setDirty(true);
                const saved = await persistCadDrawing(feats, {
                    silent: false,
                    source: {
                        format: extension.toUpperCase(),
                        fileName: file.name,
                        importedAt: new Date().toISOString(),
                    },
                });
                setStatus(saved
                    ? `CAD-Datei geladen und gespeichert (${feats.length} Objekte)`
                    : `CAD-Datei geladen Â· Speichern erforderlich`);
                return;
            }
            if (extension === "dxf") {
                const decodedDxf = await decodeDxfFile(file);
                const visualCleanup = sanitizeDxfVisualArtifacts(decodedDxf);
                const document = parseAsciiDxf(sanitizeDxfDimensionArrayCodes(visualCleanup.text), file.name);
                const payload = {
                    ...document,
                    projectId,
                };
                const parsedFeatures = normalizeFeatures(payload);
                const spatialCleanup = sanitizeDxfSpatialOutliers(parsedFeatures);
                const feats = spatialCleanup.features;
                const cleanedPayload = {
                    ...payload,
                    features: feats,
                    source: {
                        ...(payload.source || {}),
                        spatialOutliersRemoved: spatialCleanup.removed,
                        visualArtifactsRemoved: visualCleanup.removed,
                        visualArtifactsRemovedByType: visualCleanup.removedByType,
                    },
                };
                replaceDrawing(feats, cleanedPayload);
                setDirty(true);
                const isLargeDxf = file.size > 20 * 1024 * 1024 || feats.length > 25000;
                // GroÃŸe DXF zuerst stabil anzeigen. Das unmittelbare Serialisieren und
                // Hochladen derselben Geometrie verdoppelt den Speicherbedarf und lÃ¤sst
                // Chrome bei 40â€“50 MB DXF hÃ¤ufig als â€žreagiert nichtâ€œ erscheinen.
                const saved = isLargeDxf
                    ? false
                    : await persistCadDrawing(feats, {
                        silent: false,
                        source: {
                            format: "DXF",
                            fileName: file.name,
                            importedAt: new Date().toISOString(),
                            modelSpaceCount: document.source?.modelSpaceCount,
                            paperSpaceCount: document.source?.paperSpaceCount,
                            unsupportedTypes: document.source?.unsupportedTypes,
                        },
                    });
                const paper = Number(document.source?.paperSpaceCount || 0);
                const unsupported = Array.isArray(document.source?.unsupportedTypes)
                    ? document.source?.unsupportedTypes.length
                    : 0;
                setStatus(`DXF geÃ¶ffnet${saved ? " und gespeichert" : ""} (${feats.length} Objekte${paper ? ` Â· ${paper} Layout-Objekte ausgeblendet` : ""}${unsupported ? ` Â· ${unsupported} nicht darstellbare Typen` : ""}${spatialCleanup.removed
                    ? ` Â· ${spatialCleanup.removed} rÃ¤umliche StÃ¶robjekte entfernt`
                    : ""}${visualCleanup.removed
                    ? ` Â· ${visualCleanup.removed} nicht unterstÃ¼tzte Hilfsobjekte ausgeblendet`
                    : ""}${isLargeDxf ? " Â· GroÃŸdatei-Modus: bitte manuell speichern" : ""})`);
                return;
            }
            if (["csv", "gsi", "txt"].includes(extension)) {
                const csv = await file.text();
                const pts = parseUtmCsvFlexible(csv);
                if (!pts.length) {
                    throw new Error("Keine vermessbaren Punkte erkannt.");
                }
                setUtmCsv(csv);
                setUtmPoints(pts);
                setShowUtm(true);
                setStatus(`${extension.toUpperCase()} geladen (${pts.length} Punkte)`);
                return;
            }
            if (!["dwg", "dgn", "xml", "landxml", "pdf"].includes(extension)) {
                throw new Error("UnterstÃ¼tzte Formate: DXF, DWG, DGN, LandXML/XML, PDF, JSON, GeoJSON, CSV, TXT und GSI.");
            }
            const formData = new FormData();
            formData.append("file", file);
            formData.append("projectId", projectId);
            const endpoints = [
                `/api/cad/import?projectId=${encodeURIComponent(projectId)}`,
                `/api/cad/upload?projectId=${encodeURIComponent(projectId)}`,
            ];
            let lastError = "";
            for (const endpoint of endpoints) {
                const res = await fetch(apiUrl(endpoint), {
                    method: "POST",
                    credentials: "include",
                    headers: authHeaders(),
                    body: formData,
                });
                const txt = await res.text().catch(() => "");
                let data = {};
                try {
                    data = txt ? JSON.parse(txt) : {};
                }
                catch {
                    data = {};
                }
                if (res.ok && data?.ok !== false) {
                    const payload = (data?.data || data?.document || data);
                    const imported = normalizeFeatures(payload);
                    if (imported.length) {
                        replaceDrawing(imported, payload);
                        setDirty(true);
                        await persistCadDrawing(imported, {
                            silent: false,
                            source: {
                                format: extension.toUpperCase(),
                                fileName: file.name,
                                importedAt: new Date().toISOString(),
                            },
                        });
                    }
                    else {
                        await loadTakeoff(false);
                    }
                    setStatus(`${file.name} in RLC Geometry importiert`);
                    return;
                }
                lastError = data?.message || txt || `HTTP ${res.status}`;
            }
            throw new Error(lastError ||
                "Der universelle Server-Konverter ist fÃ¼r dieses Format noch nicht verfÃ¼gbar.");
        }
        catch (error) {
            setStatus("CAD-Datei konnte nicht geÃ¶ffnet werden");
            void cadAlert(String(error?.message || error));
        }
    };
    const svgCanvasPointFromClient = (clientX, clientY) => {
        const svg = svgRef.current;
        if (!svg)
            return null;
        const matrix = svg.getScreenCTM();
        if (matrix) {
            const point = svg.createSVGPoint();
            point.x = clientX;
            point.y = clientY;
            const canvasPoint = point.matrixTransform(matrix.inverse());
            return { x: canvasPoint.x, y: canvasPoint.y };
        }
        const rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height)
            return null;
        return {
            x: renderViewBox.x +
                ((clientX - rect.left) / rect.width) * renderViewBox.width,
            y: renderViewBox.y +
                ((clientY - rect.top) / rect.height) * renderViewBox.height,
        };
    };
    const svgPointFromClient = (clientX, clientY) => {
        const canvasPoint = svgCanvasPointFromClient(clientX, clientY);
        return canvasPoint ? renderCanvasToCad(canvasPoint) : null;
    };
    const snapViewportFeatures = useMemo(() => {
        if (viewportFeatures.length <= 1400)
            return viewportFeatures;
        const selected = new Set(selectedFeatureIds);
        const priority = viewportFeatures.filter((feature) => selected.has(String(feature.id || "")));
        const remaining = viewportFeatures.filter((feature) => !selected.has(String(feature.id || "")));
        const maxRemaining = Math.max(0, 1400 - priority.length);
        const step = Math.max(1, Math.ceil(remaining.length / Math.max(maxRemaining, 1)));
        return [
            ...priority,
            ...remaining.filter((_, index) => index % step === 0).slice(0, maxRemaining),
        ];
    }, [viewportFeatures, selectedFeatureIds]);
    const minimapFeatures = useMemo(() => {
        const maxMiniMapNodes = 1200;
        if (renderedFeatures.length <= maxMiniMapNodes)
            return renderedFeatures;
        const selected = new Set(selectedFeatureIds);
        return renderedFeatures
            .map((feature, index) => {
            const id = String(feature.id || "");
            const kind = String(feature.kind || "").toLowerCase();
            const bounds = featureBounds(feature);
            const span = bounds
                ? Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
                : 0;
            const score = (selected.has(id) ? 1000000 : 0) +
                Math.log10(1 + Math.max(0, span)) * 20 +
                Math.log10(1 + Math.max(0, Number(feature.length || 0))) * 10 +
                (kind === "polyline" || kind === "line" ? 8 : 0) +
                (kind === "point" ? -6 : 0) +
                (kind === "text" ? -8 : 0) +
                (kind === "hatch" ? -12 : 0);
            return { feature, score, index };
        })
            .sort((left, right) => right.score - left.score || left.index - right.index)
            .slice(0, maxMiniMapNodes)
            .sort((left, right) => left.index - right.index)
            .map((entry) => entry.feature);
    }, [renderedFeatures, selectedFeatureIds]);
    const snappedWorldPoint = (point, excludedFeatureIds = []) => {
        if (!snapEnabled) {
            setActiveSnap(null);
            return point;
        }
        const svg = svgRef.current;
        const rect = svg?.getBoundingClientRect();
        const worldPerPixel = rect
            ? Math.max(viewBox.width / Math.max(rect.width, 1), viewBox.height / Math.max(rect.height, 1))
            : Math.max(viewBox.width, viewBox.height) / 800;
        const tolerance = worldPerPixel * 18;
        const cadSnap = findCadSnap(point, snapViewportFeatures, tolerance, excludedFeatureIds);
        // Objektfang gilt auch fÃ¼r geladene Vermessungspunkte.
        let pointSnap = null;
        if (showUtm) {
            const snapSurveyPoints = utmPoints.length <= 2000
                ? utmPoints
                : utmPoints.filter((_, index) => index % Math.ceil(utmPoints.length / 2000) === 0);
            for (const surveyPoint of snapSurveyPoints) {
                const dx = point.x - surveyPoint.x;
                const dy = point.y - surveyPoint.y;
                const candidateDistance = Math.hypot(dx, dy);
                if (candidateDistance > tolerance)
                    continue;
                if (!pointSnap || candidateDistance < pointSnap.distance) {
                    pointSnap = {
                        point: { x: surveyPoint.x, y: surveyPoint.y },
                        kind: "surveyPoint",
                        featureId: `utm:${surveyPoint.id}`,
                        distance: candidateDistance,
                    };
                }
            }
        }
        const snap = !cadSnap
            ? pointSnap
            : !pointSnap
                ? cadSnap
                : pointSnap.distance < cadSnap.distance
                    ? pointSnap
                    : cadSnap;
        setActiveSnap(snap);
        return snap?.point || point;
    };
    const applyOrtho = (start, point) => {
        if (!orthoEnabled || !start)
            return point;
        const dx = Math.abs(point.x - start.x);
        const dy = Math.abs(point.y - start.y);
        return dx >= dy ? { x: point.x, y: start.y } : { x: start.x, y: point.y };
    };
    const beginObjectMove = (event, featureId) => {
        if (tool !== "move" && tool !== "copy")
            return false;
        event.preventDefault();
        event.stopPropagation();
        const start = svgPointFromClient(event.clientX, event.clientY);
        if (!start)
            return true;
        const sourceIds = selectedFeatureIds.includes(featureId)
            ? selectedFeatureIds
            : [featureId];
        if (!selectedFeatureIds.includes(featureId))
            selectFeature(featureId);
        const original = cloneCadFeatures(features);
        beginMutation(original);
        if (tool === "copy") {
            const duplicated = duplicateCadFeatures(features, sourceIds);
            setFeatures(duplicated.features);
            setSelectedFeatureIds(duplicated.copiedIds);
            setSelectedFeatureId(duplicated.copiedIds[0] || "");
            setObjectDrag({
                start,
                original: cloneCadFeatures(duplicated.features),
                ids: duplicated.copiedIds,
                mode: "copy",
            });
        }
        else {
            setObjectDrag({
                start,
                original,
                ids: sourceIds,
                mode: "move",
            });
        }
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setStatus(tool === "copy" ? "Kopie platzierenâ€¦" : "Objekt verschiebenâ€¦");
        return true;
    };
    const beginFeaturePointerDown = (event, featureId) => {
        if (tool === "rotate" && rotateSession.phase === "pick-object") {
            event.preventDefault();
            event.stopPropagation();
            selectFeature(featureId);
            setRotateSession((previous) => ({ ...previous, phase: "pick-base" }));
            setStatus("Drehen: Objekt gewÃ¤hlt Â· jetzt Drehpunkt anklicken");
            return;
        }
        if (tool === "scale" && scaleSession.phase === "pick-object") {
            event.preventDefault();
            event.stopPropagation();
            selectFeature(featureId);
            setScaleSession((previous) => ({ ...previous, phase: "pick-base" }));
            setStatus("Skalieren: Objekt gewÃ¤hlt Â· jetzt Basispunkt anklicken");
            return;
        }
        if (tool === "mirror" && !selectedFeatureIds.length) {
            event.preventDefault();
            event.stopPropagation();
            selectFeature(featureId);
            setMirrorPhase("confirm-selection");
            setStatus("Spiegeln: Objekt gewÃ¤hlt Â· Rechtsklick bestÃ¤tigt die Auswahl");
            return;
        }
        if (tool === "offset") {
            event.preventDefault();
            event.stopPropagation();
            selectFeature(featureId);
            setOffsetSession({
                phase: "distance",
                distance: 1,
                signedDistance: 1,
                original: null,
                createdIds: [],
            });
            setNumericCommand({ kind: "offset", value: "1.000" });
            setStatus("Versetzen: Abstand eingeben");
            return;
        }
        if (tool === "explode") {
            event.preventDefault();
            event.stopPropagation();
            setSelectedFeatureIds([featureId]);
            setSelectedFeatureId(featureId);
            // AusfÃ¼hrung im nÃ¤chsten Render-Takt, damit die Auswahl sicher gesetzt ist.
            window.setTimeout(() => {
                setSelectedFeatureIds([featureId]);
                setSelectedFeatureId(featureId);
                window.setTimeout(() => {
                    explodeSelection();
                    setTool("select");
                }, 0);
            }, 0);
            setStatus("Explodieren: Objekt gewÃ¤hlt");
            return;
        }
        if (beginObjectMove(event, featureId))
            return;
        if (handleModifyFeaturePick(featureId)) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (tool !== "select")
            return;
        event.preventDefault();
        event.stopPropagation();
        const clickedFeature = features.find((feature) => String(feature.id || "") === featureId);
        const clickedMeta = (clickedFeature?.meta || {});
        const blockGroupId = String(clickedMeta.dimensionGroupId ||
            clickedMeta.measurementGroupId ||
            "").trim();
        if (blockGroupId) {
            const blockIds = features
                .filter((feature) => {
                const meta = (feature.meta || {});
                return (String(meta.dimensionGroupId || meta.measurementGroupId || "") ===
                    blockGroupId);
            })
                .map((feature) => String(feature.id || ""))
                .filter(Boolean);
            setSelectedFeatureIds(blockIds);
            setSelectedFeatureId(blockIds[0] || "");
            setRightTab("properties");
            setStatus(`Messblock ausgewÃ¤hlt (${blockIds.length} Elemente)`);
            return;
        }
        selectFeature(featureId, event.ctrlKey || event.metaKey);
        setRightTab("properties");
        setStatus("1 Objekt ausgewÃ¤hlt");
    };
    const beginVertexMove = (event, featureId, vertexIndex) => {
        if (tool !== "select")
            return;
        event.preventDefault();
        event.stopPropagation();
        const original = cloneCadFeatures(features);
        beginMutation(original);
        setVertexDrag({ featureId, vertexIndex, original });
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setStatus(`Griff ${vertexIndex + 1} frei verschiebenâ€¦`);
    };
    const zoomAt = (factorZoom, anchorRatio) => {
        const rx = clamp(anchorRatio?.x ?? 0.5, 0, 1);
        const ry = clamp(anchorRatio?.y ?? 0.5, 0, 1);
        setViewBox((previous) => zoomCadViewBox(previous, factorZoom, { x: rx, y: ry }));
    };
    const onPointerDown = (e) => {
        // Der rechte Mausklick beendet Befehle ausschlieÃŸlich Ã¼ber onContextMenu.
        // Er darf niemals als zusÃ¤tzlicher Zeichenpunkt Ã¼bernommen werden.
        if (e.button === 2) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        const rawPoint = svgPointFromClient(e.clientX, e.clientY);
        if (!rawPoint)
            return;
        if (e.button === 1) {
            const now = Date.now();
            const previous = middleClickRef.current;
            const isDoubleMiddle = now - previous.at < 430 && Math.hypot(e.clientX - previous.x, e.clientY - previous.y) < 12;
            middleClickRef.current = { at: now, x: e.clientX, y: e.clientY };
            if (isDoubleMiddle) {
                e.preventDefault();
                fitDrawing();
                setStatus("Zeichnung an Bildschirm angepasst");
                return;
            }
        }
        if (tool === "pan" || e.button === 1 || e.shiftKey) {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragStart({
                clientX: e.clientX,
                clientY: e.clientY,
                viewBox: { ...viewBox },
            });
            return;
        }
        let p = snappedWorldPoint(rawPoint);
        if (["line", "polyline", "rectangle"].includes(tool) && draftPts.length) {
            p = applyOrtho(draftPts[draftPts.length - 1], p);
        }
        if (tool === "mirror") {
            if (mirrorPhase !== "pick-point") {
                setStatus("Spiegeln: zuerst Auswahl mit rechter Maustaste bestÃ¤tigen");
                return;
            }
            setMirrorAxisPts([p]);
            setMirrorPreviewAngle(180);
            setMirrorPhase("confirm-point");
            setStatus("Spiegeln LIVE Â· Maus bewegen fÃ¼r Winkel Â· Rechtsklick bestÃ¤tigt");
            return;
        }
        if (tool === "rotate") {
            if (rotateSession.phase === "pick-base") {
                setRotateSession({
                    phase: "confirm-base",
                    base: p,
                    referenceAngle: 0,
                    angle: 0,
                    original: null,
                });
                setStatus("Drehen: Drehpunkt gewÃ¤hlt Â· Rechtsklick bestÃ¤tigt");
                return;
            }
            if (rotateSession.phase === "live" &&
                rotateSession.base &&
                rotateSession.original) {
                beginMutation(rotateSession.original);
                setRotateSession({
                    phase: "idle",
                    base: null,
                    referenceAngle: 0,
                    angle: 0,
                    original: null,
                });
                setNumericCommand(null);
                setTool("select");
                setStatus(`Drehen bestÃ¤tigt Â· ${formatNumber(rotateSession.angle, 2)}Â°`);
                return;
            }
            setStatus("Drehen: zuerst Drehpunkt wÃ¤hlen und mit Rechtsklick bestÃ¤tigen");
            return;
        }
        if (tool === "scale") {
            if (scaleSession.phase === "pick-base") {
                setScaleSession({
                    phase: "confirm-base",
                    base: p,
                    referenceDistance: 1,
                    factor: 1,
                    original: null,
                });
                setStatus("Skalieren: Basispunkt gewÃ¤hlt Â· Rechtsklick bestÃ¤tigt");
                return;
            }
            if (scaleSession.phase === "live" &&
                scaleSession.base &&
                scaleSession.original) {
                beginMutation(scaleSession.original);
                setScaleSession({
                    phase: "idle",
                    base: null,
                    referenceDistance: 1,
                    factor: 1,
                    original: null,
                });
                setNumericCommand(null);
                setTool("select");
                setStatus(`Skalieren bestÃ¤tigt Â· Faktor ${formatNumber(scaleSession.factor, 3)}`);
                return;
            }
            setStatus("Skalieren: zuerst Basispunkt wÃ¤hlen und mit Rechtsklick bestÃ¤tigen");
            return;
        }
        if (tool === "offset" &&
            offsetSession.phase === "live" &&
            offsetSession.original) {
            beginMutation(offsetSession.original);
            const result = offsetCadFeatures(offsetSession.original, selectedFeatureIds, offsetSession.signedDistance);
            setFeatures(result.features);
            setSelectedFeatureIds(result.createdIds);
            setSelectedFeatureId(result.createdIds[0] || "");
            setOffsetSession({
                phase: "idle",
                distance: 1,
                signedDistance: 1,
                original: null,
                createdIds: [],
            });
            setTool("select");
            setStatus(`Versetzen ${formatNumber(Math.abs(offsetSession.signedDistance))} m bestÃ¤tigt`);
            return;
        }
        if (tool === "line") {
            if (!draftPts.length) {
                setDraftPts([p]);
                setStatus("Linie: Endpunkt wÃ¤hlen");
            }
            else {
                addFeature({
                    kind: "line",
                    pts: [draftPts[0], p],
                    name: "Linie",
                });
                setDraftPts([]);
                setStatus("Linie erstellt Â· nÃ¤chsten Startpunkt wÃ¤hlen");
            }
        }
        else if (tool === "polyline") {
            setDraftPts((prev) => {
                const last = prev[prev.length - 1];
                return last && dist(last, p) < 1e-9 ? prev : [...prev, p];
            });
            setStatus("Polylinie: weitere Punkte Â· Enter beendet");
        }
        else if (tool === "rectangle") {
            if (!draftPts.length) {
                setDraftPts([p]);
                setStatus("Rechteck: gegenÃ¼berliegende Ecke wÃ¤hlen");
            }
            else {
                const start = draftPts[0];
                addFeature({
                    kind: "polygon",
                    closed: true,
                    pts: [
                        start,
                        { x: p.x, y: start.y },
                        p,
                        { x: start.x, y: p.y },
                    ],
                    name: "Rechteck",
                });
                setDraftPts([]);
                setStatus("Rechteck erstellt");
            }
        }
        else if (tool === "circle") {
            if (!draftPts.length) {
                setDraftPts([p]);
                setStatus("Kreis: Radius wÃ¤hlen");
            }
            else {
                const center = draftPts[0];
                addFeature({
                    kind: "circle",
                    pts: [center],
                    radius: dist(center, p),
                    name: "Kreis",
                });
                setDraftPts([]);
                setStatus("Kreis erstellt");
            }
        }
        else if (tool === "text") {
            setTextAnchor(p);
            setStatus("Text eingeben und bestÃ¤tigen");
        }
        else if (tool === "distance") {
            setMeasurePts((previous) => {
                if (!previous.length || previous.length >= 2) {
                    setStatus("Strecke messen: Endpunkt wÃ¤hlen");
                    return [p];
                }
                const next = [previous[0], p];
                setStatus(`Strecke: ${formatNumber(dist(previous[0], p))} m`);
                return next;
            });
        }
        else if (tool === "area") {
            const tolerance = Math.max(viewBox.width, viewBox.height) * 0.00002;
            const polygon = boundaryPolygonAtPoint(visibleFeatures, p, Math.max(tolerance, 0.0001));
            if (!polygon) {
                setMeasurePts([]);
                setStatus("FlÃ¤che messen: keine geschlossene FlÃ¤che gefunden");
            }
            else {
                setMeasurePts(polygon.map((point) => ({ ...point })));
                setStatus(`FlÃ¤che erkannt: ${formatNumber(polyArea(polygon))} mÂ² Â· Rechtsklick bestÃ¤tigt`);
            }
        }
        else if (tool === "dimLinear" || tool === "dimAligned") {
            if (dimensionDraft?.placing) {
                void addPersistentDimension(dimensionDraft.start, dimensionDraft.end, dimensionDraft.mode, p);
                return;
            }
            setMeasurePts((previous) => {
                if (!previous.length) {
                    setStatus(tool === "dimLinear"
                        ? "Lineare BemaÃŸung: zweiten Punkt wÃ¤hlen"
                        : "Ausgerichtete BemaÃŸung: zweiten Punkt wÃ¤hlen");
                    return [p];
                }
                let endPoint = p;
                if (tool === "dimLinear") {
                    const startPoint = previous[0];
                    endPoint =
                        Math.abs(p.x - startPoint.x) >= Math.abs(p.y - startPoint.y)
                            ? { x: p.x, y: startPoint.y }
                            : { x: startPoint.x, y: p.y };
                }
                setDimensionDraft({
                    mode: tool === "dimLinear" ? "linear" : "aligned",
                    start: previous[0],
                    end: endPoint,
                    placing: false,
                });
                setStatus("BemaÃŸung: Rechtsklick, dann Linie live positionieren");
                return [previous[0], endPoint];
            });
        }
        else if (tool === "point") {
            setMeasurePts([p]);
        }
        else if (tool === "hatch" || tool === "boundary") {
            commitBoundaryFromPoint(p, tool);
        }
        else if (tool === "select") {
            e.currentTarget.setPointerCapture(e.pointerId);
            setSelectionDrag({
                start: rawPoint,
                current: rawPoint,
                additive: e.ctrlKey || e.metaKey,
            });
        }
    };
    useEffect(() => {
        return () => {
            if (pointerMoveFrameRef.current !== null) {
                cancelAnimationFrame(pointerMoveFrameRef.current);
            }
        };
    }, []);
    useEffect(() => {
        if (smoothSelectCursorRef.current) {
            smoothSelectCursorRef.current.style.visibility = "hidden";
        }
    }, [tool]);
    const processPointerMove = (clientX, clientY) => {
        const rawPoint = svgPointFromClient(clientX, clientY);
        if (!rawPoint)
            return;
        const frameNow = performance.now();
        const allowGeometryFrame = frameNow - lastInteractionGeometryUpdateRef.current >= 22;
        const allowUiFrame = frameNow - lastInteractionUiUpdateRef.current >= 125;
        // Fast pan path: no snap search, no cursor React state and no geometry work.
        // Only the camera is updated once per animation frame.
        if (dragStart && !objectDrag && !vertexDrag) {
            const svg = svgRef.current;
            if (!svg)
                return;
            const rect = svg.getBoundingClientRect();
            const dx = ((clientX - dragStart.clientX) / Math.max(1, rect.width)) *
                dragStart.viewBox.width;
            const dy = ((clientY - dragStart.clientY) / Math.max(1, rect.height)) *
                dragStart.viewBox.height;
            setActiveSnap(null);
            setViewBox({
                ...dragStart.viewBox,
                x: dragStart.viewBox.x - dx,
                y: dragStart.viewBox.y - dy,
            });
            return;
        }
        if (objectDrag) {
            if (!allowGeometryFrame)
                return;
            lastInteractionGeometryUpdateRef.current = frameNow;
            const p = snappedWorldPoint(rawPoint, objectDrag.ids);
            setCursorWorld(p);
            setFeatures(translateCadFeatures(objectDrag.original, objectDrag.ids, p.x - objectDrag.start.x, p.y - objectDrag.start.y));
            return;
        }
        if (vertexDrag) {
            if (!allowGeometryFrame)
                return;
            lastInteractionGeometryUpdateRef.current = frameNow;
            // Direkte freie Griffbearbeitung:
            // Nur der gewÃ¤hlte End-/StÃ¼tzpunkt bewegt sich.
            // Alle Ã¼brigen Punkte bleiben unverÃ¤ndert, damit sich die Linie
            // frei drehen und gleichzeitig verlÃ¤ngern/verkÃ¼rzen kann.
            const p = rawPoint;
            setActiveSnap(null);
            setCursorWorld(p);
            setFeatures(vertexDrag.original.map((feature, featureIndex) => {
                if (String(feature.id || "") !== vertexDrag.featureId) {
                    return feature;
                }
                const points = Array.isArray(feature.pts)
                    ? feature.pts.map((point) => ({ ...point }))
                    : [];
                if (vertexDrag.vertexIndex < 0 ||
                    vertexDrag.vertexIndex >= points.length) {
                    return feature;
                }
                points[vertexDrag.vertexIndex] = { x: p.x, y: p.y };
                return recalculateCadFeature({
                    ...feature,
                    pts: points,
                }, featureIndex);
            }));
            return;
        }
        if (tool === "rotate" &&
            rotateSession.phase === "live" &&
            rotateSession.base &&
            rotateSession.original) {
            if (!allowGeometryFrame)
                return;
            lastInteractionGeometryUpdateRef.current = frameNow;
            const p = snappedWorldPoint(rawPoint, selectedFeatureIds);
            const currentAngle = Math.atan2(p.y - rotateSession.base.y, p.x - rotateSession.base.x);
            let angle = ((currentAngle - rotateSession.referenceAngle) * 180) / Math.PI;
            angle = Math.round(angle * 10) / 10;
            setCursorWorld(p);
            if (allowUiFrame) {
                lastInteractionUiUpdateRef.current = frameNow;
                setRotateSession((previous) => ({ ...previous, angle }));
                setNumericCommand((previous) => previous?.kind === "rotate"
                    ? { ...previous, value: String(angle).replace(".", ",") }
                    : { kind: "rotate", value: String(angle).replace(".", ",") });
            }
            setFeatures(rotateCadFeatures(rotateSession.original, selectedFeatureIds, rotateSession.base, angle));
            if (allowUiFrame) {
                setStatus(`Drehen LIVE Â· ${formatNumber(angle, 1)}Â° Â· Linksklick bestÃ¤tigt`);
            }
            return;
        }
        if (tool === "scale" &&
            scaleSession.phase === "live" &&
            scaleSession.base &&
            scaleSession.original) {
            if (!allowGeometryFrame)
                return;
            lastInteractionGeometryUpdateRef.current = frameNow;
            const p = snappedWorldPoint(rawPoint, selectedFeatureIds);
            const currentDistance = Math.hypot(p.x - scaleSession.base.x, p.y - scaleSession.base.y);
            const referenceDistance = Math.max(scaleSession.referenceDistance, 1e-9);
            let factor = currentDistance / referenceDistance;
            factor = Math.max(0.001, Math.round(factor * 1000) / 1000);
            setCursorWorld(p);
            if (allowUiFrame) {
                lastInteractionUiUpdateRef.current = frameNow;
                setScaleSession((previous) => ({ ...previous, factor }));
                setNumericCommand((previous) => previous?.kind === "scale"
                    ? { ...previous, value: String(factor).replace(".", ",") }
                    : { kind: "scale", value: String(factor).replace(".", ",") });
            }
            setFeatures(scaleCadFeatures(scaleSession.original, selectedFeatureIds, scaleSession.base, factor));
            if (allowUiFrame) {
                setStatus(`Skalieren LIVE Â· Faktor ${formatNumber(factor, 3)} Â· Linksklick bestÃ¤tigt`);
            }
            return;
        }
        if (tool === "offset" &&
            offsetSession.phase === "live" &&
            offsetSession.original &&
            selectedFeatureIds.length) {
            if (!allowGeometryFrame)
                return;
            lastInteractionGeometryUpdateRef.current = frameNow;
            const p = rawPoint;
            const source = offsetSession.original.find((feature) => String(feature.id || "") === selectedFeatureIds[0]);
            const pts = source?.pts || [];
            let side = 1;
            let bestDistance = Number.POSITIVE_INFINITY;
            for (let index = 0; index < pts.length - 1; index += 1) {
                const a = pts[index];
                const b = pts[index + 1];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const lengthSquared = dx * dx + dy * dy;
                if (lengthSquared <= 1e-12)
                    continue;
                const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
                const nearestX = a.x + dx * t;
                const nearestY = a.y + dy * t;
                const distanceSquared = (p.x - nearestX) * (p.x - nearestX) +
                    (p.y - nearestY) * (p.y - nearestY);
                if (distanceSquared < bestDistance) {
                    bestDistance = distanceSquared;
                    const cross = dx * (p.y - a.y) - dy * (p.x - a.x);
                    side = cross >= 0 ? 1 : -1;
                }
            }
            const signedDistance = offsetSession.distance * side;
            const result = offsetCadFeatures(offsetSession.original, selectedFeatureIds, signedDistance);
            setCursorWorld(p);
            if (allowUiFrame) {
                lastInteractionUiUpdateRef.current = frameNow;
                setOffsetSession((previous) => ({
                    ...previous,
                    signedDistance,
                    createdIds: result.createdIds,
                }));
            }
            setFeatures(result.features);
            if (allowUiFrame) {
                setStatus(`Versetzen LIVE Â· ${formatNumber(offsetSession.distance)} m Â· Seite mit Maus wÃ¤hlen Â· Linksklick bestÃ¤tigt`);
            }
            return;
        }
        const snapPreviewTools = [
            "line", "polyline", "rectangle", "circle", "text",
            "distance", "area", "point", "dimLinear", "dimAligned",
            "hatch", "boundary", "mirror", "rotate", "scale", "trim", "extend", "join", "fillet",
        ];
        const showSnapPreview = snapEnabled && snapPreviewTools.includes(tool);
        let p = showSnapPreview ? snappedWorldPoint(rawPoint) : rawPoint;
        if (!showSnapPreview && activeSnap)
            setActiveSnap(null);
        // Ortho muss bereits wÃ¤hrend der Vorschau wirken:
        // Nach dem ersten Punkt folgt der Cursor sofort horizontal oder vertikal.
        if (orthoEnabled &&
            draftPts.length > 0 &&
            ["line", "polyline", "rectangle"].includes(tool)) {
            p = applyOrtho(draftPts[draftPts.length - 1], p);
        }
        if (tool === "select" && !selectionDrag && !dragStart) {
            // Native Bildschirm-Pixel-Cursor: keine CAD-Einheiten-SprÃ¼nge,
            // keine AbhÃ¤ngigkeit von SVG-Transform, UTM oder Objektfang.
            if (smoothSelectCursorRef.current) {
                smoothSelectCursorRef.current.style.visibility = "hidden";
            }
            const now = performance.now();
            if (now - lastCursorStateUpdateRef.current >= 100) {
                lastCursorStateUpdateRef.current = now;
                setCursorWorld(rawPoint);
            }
            return;
        }
        if (!allowGeometryFrame)
            return;
        lastInteractionGeometryUpdateRef.current = frameNow;
        setCursorWorld(p);
        if (tool === "mirror" &&
            mirrorPhase === "confirm-point" &&
            mirrorAxisPts[0]) {
            const center = mirrorAxisPts[0];
            const rawAngle = (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI;
            const normalized = ((rawAngle % 360) + 360) % 360;
            const snappedAngle = Math.round(normalized / 5) * 5;
            setMirrorPreviewAngle(snappedAngle);
            setStatus(`Spiegeln LIVE Â· Winkel ${snappedAngle}Â° Â· Rechtsklick bestÃ¤tigt`);
        }
        if (selectionDrag) {
            setSelectionDrag((previous) => previous ? { ...previous, current: rawPoint } : null);
            return;
        }
        if (!dragStart)
            return;
        const svg = svgRef.current;
        if (!svg)
            return;
        const rect = svg.getBoundingClientRect();
        const dx = ((clientX - dragStart.clientX) / Math.max(1, rect.width)) *
            dragStart.viewBox.width;
        const dy = ((clientY - dragStart.clientY) / Math.max(1, rect.height)) *
            dragStart.viewBox.height;
        setViewBox({
            ...dragStart.viewBox,
            x: dragStart.viewBox.x - dx,
            y: dragStart.viewBox.y - dy,
        });
    };
    const onPointerMove = (event) => {
        pendingPointerMoveRef.current = {
            clientX: event.clientX,
            clientY: event.clientY,
        };
        if (pointerMoveFrameRef.current !== null)
            return;
        pointerMoveFrameRef.current = requestAnimationFrame(() => {
            pointerMoveFrameRef.current = null;
            const pending = pendingPointerMoveRef.current;
            pendingPointerMoveRef.current = null;
            if (!pending)
                return;
            processPointerMove(pending.clientX, pending.clientY);
        });
    };
    const onPointerUp = () => {
        if (selectionDrag) {
            const bounds = normalizedBounds(selectionDrag.start, selectionDrag.current);
            const svg = svgRef.current;
            const rect = svg?.getBoundingClientRect();
            const clickTolerance = rect
                ? Math.max((viewBox.width / Math.max(rect.width, 1)) * 4, (viewBox.height / Math.max(rect.height, 1)) * 4)
                : Math.max(viewBox.width, viewBox.height) / 200;
            const isClick = Math.abs(bounds.maxX - bounds.minX) < clickTolerance &&
                Math.abs(bounds.maxY - bounds.minY) < clickTolerance;
            if (isClick) {
                if (!selectionDrag.additive) {
                    setSelectedFeatureId("");
                    setSelectedFeatureIds([]);
                }
            }
            else {
                const ids = renderedFeatures
                    .filter((feature) => {
                    const candidate = featureBounds(feature);
                    return candidate ? boundsIntersect(bounds, candidate) : false;
                })
                    .map((feature) => String(feature.id || ""))
                    .filter(Boolean);
                const utmIds = showUtm
                    ? utmPoints.filter((point) => point.x >= bounds.minX && point.x <= bounds.maxX &&
                        point.y >= bounds.minY && point.y <= bounds.maxY).map((point) => point.id)
                    : [];
                setSelectedUtmIds((previous) => selectionDrag.additive
                    ? Array.from(new Set([...previous, ...utmIds]))
                    : utmIds);
                setSelectedFeatureIds((previous) => {
                    const next = selectionDrag.additive
                        ? Array.from(new Set([...previous, ...ids]))
                        : ids;
                    setSelectedFeatureId(next[0] || "");
                    return next;
                });
                setStatus(`${ids.length} Objekte Â· ${utmIds.length} Punkte im Auswahlfenster`);
            }
        }
        if (objectDrag) {
            setStatus(objectDrag.mode === "copy" ? "Kopie erstellt" : "Objekt verschoben");
        }
        if (vertexDrag)
            setStatus("End-/StÃ¼tzpunkt geÃ¤ndert");
        setDragStart(null);
        setSelectionDrag(null);
        setObjectDrag(null);
        setVertexDrag(null);
        setActiveSnap(null);
    };
    const viewExtent = Math.max(viewBox.width, viewBox.height);
    const strokeWidth = viewExtent / 900;
    const pointRadius = (viewExtent / 420) * Math.max(0.45, Math.min(3, utmSymbolSize));
    const cadViewportWidth = Math.max(cadViewportRef.current?.clientWidth || 1000, 1);
    const cadViewportHeight = Math.max(cadViewportRef.current?.clientHeight || 700, 1);
    const cadWorldPerPixel = Math.max(renderViewBox.width / cadViewportWidth, renderViewBox.height / cadViewportHeight);
    // UTM-Punktsymbol als echte CAD-X:
    // SymbolgrÃ¶ÃŸe 1 = ungefÃ¤hr 1 Zeichnungseinheit GesamtgrÃ¶ÃŸe.
    // Dadurch wÃ¤chst die X beim Hineinzoomen und wird beim Herauszoomen kleiner.
    const utmXNominalHalfSize = Math.max(0.05, Math.min(50, Number(utmSymbolSize) || 1) * 0.5);
    // Einheitliche UTM-Darstellung: X, Text und Abstand verwenden dieselbe
    // visuelle Basiseinheit. Beim Zoomen bleiben alle Teile proportional.
    const utmVisualUnit = Math.max(utmXNominalHalfSize, cadWorldPerPixel * 5.5);
    const utmXHalfSize = utmVisualUnit;
    const adaptivePointLabelSize = utmVisualUnit * 1.05;
    const utmXHitRadius = Math.max(cadWorldPerPixel * 18, utmVisualUnit * 3.8);
    const gripVisibleSize = Math.max(pointRadius * 1.45, cadWorldPerPixel * 9);
    const gripHitSize = Math.max(gripVisibleSize * 2.8, cadWorldPerPixel * 24);
    const labelSize = viewExtent / 110;
    const adaptiveTextFloor = Math.max(0.05, Math.min(0.65, viewExtent / 520));
    const utmLabelOffsetX = utmVisualUnit * 2.35;
    const measurementLength = useMemo(() => polylineLength(measurePts, false), [measurePts]);
    const measurementArea = useMemo(() => (measurePts.length >= 3 ? polyArea(measurePts) : 0), [measurePts]);
    const qtyPreview = useMemo(() => {
        if (!selectedFeatures.length)
            return 0;
        const length = selectedFeatures.reduce((sum, feature) => sum + Number(feature.length || 0), 0);
        const area = selectedFeatures.reduce((sum, feature) => sum + Number(feature.area || 0), 0);
        const base = unit === "m"
            ? length
            : unit === "m2"
                ? area
                : selectedFeatures.length;
        return base * (Number.isFinite(factor) ? factor : 1);
    }, [selectedFeatures, unit, factor]);
    const pushToAufmass = async (override) => {
        const fsProjectKey = String(current?.code || projectId || "").trim();
        if (!fsProjectKey) {
            void cadAlert("Kein Projekt gewÃ¤hlt.");
            return false;
        }
        const finalPos = String(override?.pos ?? pos).trim();
        if (!finalPos) {
            void cadAlert("Positionsnummer fehlt.");
            return false;
        }
        if (!selectedFeatures.length && typeof override?.qty !== "number") {
            void cadAlert("Kein CAD-Objekt ausgewÃ¤hlt.");
            return false;
        }
        const length = selectedFeatures.reduce((sum, feature) => sum + Number(feature.length || 0), 0);
        const area = selectedFeatures.reduce((sum, feature) => sum + Number(feature.area || 0), 0);
        const finalUnit = override?.unit ?? unit;
        const baseQty = typeof override?.qty === "number"
            ? override.qty
            : finalUnit === "m"
                ? length
                : finalUnit === "m2"
                    ? area
                    : selectedFeatures.length;
        const finalFactor = typeof override?.qty === "number"
            ? 1
            : Number.isFinite(factor)
                ? factor
                : 1;
        const qtyFinal = baseQty * finalFactor;
        const finalText = String(override?.text ?? kurz ?? "RLC CAD AufmaÃŸ").trim();
        const row = {
            pos: finalPos,
            text: finalText,
            unit: finalUnit,
            qty: qtyFinal,
            source: "RLC CAD",
            meta: {
                takeoff: selectedFeatures.length
                    ? selectedFeatures.map((feature) => ({
                        featureId: feature.id,
                        kind: feature.kind,
                        layer: feature.layer,
                        name: feature.name,
                    }))
                    : undefined,
                objectCount: selectedFeatures.length,
                length,
                area,
                factor: finalFactor,
                ki: Boolean(override),
                lvPositionId: override?.lvPositionId || selectedLvPosition?.id || undefined,
            },
        };
        const token = localStorage.getItem("rlc_token") ||
            localStorage.getItem("token") ||
            "";
        const headers = {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const tryPost = async (url, body) => {
            const res = await fetch(url, {
                method: "POST",
                credentials: "include",
                headers,
                body: JSON.stringify(body),
            });
            const txt = await res.text().catch(() => "");
            let j = {};
            try {
                j = txt ? JSON.parse(txt) : {};
            }
            catch {
                j = {};
            }
            return {
                ok: res.ok &&
                    (j?.ok === true ||
                        j?.success === true ||
                        j?.status === "ok" ||
                        j?.error == null),
                res,
                j,
                txt,
            };
        };
        setStatus("Ãœbernahme in AufmaÃŸâ€¦");
        const attempts = [
            () => tryPost(apiUrl(`/api/aufmass/soll-ist/${encodeURIComponent(fsProjectKey)}/append`), {
                rows: [
                    {
                        pos: row.pos,
                        positionId: override?.lvPositionId || selectedLvPosition?.id || undefined,
                        lvPositionId: override?.lvPositionId || selectedLvPosition?.id || undefined,
                        text: row.text,
                        unit: row.unit,
                        istDelta: Number(row.qty || 0),
                        source: row.source,
                        meta: row.meta,
                    },
                ],
            }),
            () => tryPost(apiUrl(`/api/massen/apply`), {
                projectId: fsProjectKey,
                positionId: override?.lvPositionId || selectedLvPosition?.id || undefined,
                lvPositionId: override?.lvPositionId || selectedLvPosition?.id || undefined,
                position: row.pos,
                pos: row.pos,
                text: row.text,
                unit: row.unit,
                quantity: Number(row.qty || 0),
                qty: Number(row.qty || 0),
                source: row.source,
                cadObjectIds: selectedFeatures
                    .map((feature) => String(feature.id || ""))
                    .filter(Boolean),
                meta: row.meta,
            }),
            () => tryPost(apiUrl(`/api/aufmass/add-from-cad`), {
                projectId: fsProjectKey,
                row,
            }),
        ];
        let lastError = "";
        for (const attempt of attempts) {
            try {
                const r = await attempt();
                if (r.ok) {
                    setStatus("In AufmaÃŸ Ã¼bernommen");
                    void cadAlert(`${row.pos} â€“ ${row.text}\n${formatNumber(row.qty)} ${uiUnitLabel(row.unit)}\n\nIn AufmaÃŸ Ã¼bernommen.`);
                    void loadPositionAufmass(row.pos);
                    return true;
                }
                lastError = r.txt || `HTTP ${r.res.status}`;
            }
            catch (e) {
                lastError = String(e?.message || e);
            }
        }
        setStatus("Ãœbernahme fehlgeschlagen");
        void cadAlert(`Ãœbernahme fehlgeschlagen.\n${lastError}`);
        return false;
    };
    const kiRows = useMemo(() => {
        const map = new Map();
        for (const f of features) {
            const group = pickLayerGroup(f.layer);
            const lvPosGuess = String(f?.meta?.lvPos ?? pos ?? "001").trim() || "001";
            const inferredUnit = Number(f.area || 0) > 0 ? "m2" : f.kind === "point" ? "Stk" : "m";
            const qty = inferredUnit === "m2"
                ? Number(f.area || 0)
                : inferredUnit === "Stk"
                    ? 1
                    : Number(f.length || 0);
            const key = `${lvPosGuess}__${group}__${inferredUnit}`;
            const existing = map.get(key);
            if (!existing) {
                map.set(key, {
                    key,
                    lvPos: lvPosGuess,
                    layerGroup: group,
                    unit: inferredUnit,
                    qty,
                    confidenceA: 0.62,
                    exampleLayer: f.layer,
                    exampleName: f.name,
                });
            }
            else {
                existing.qty += qty;
                existing.confidenceA = clamp(existing.confidenceA + 0.02, 0.62, 0.9);
            }
        }
        return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
    }, [features, pos]);
    useEffect(() => {
        if (kiRows.length && !kiSelectedKey)
            setKiSelectedKey(kiRows[0].key);
    }, [kiRows, kiSelectedKey]);
    const kiSelected = useMemo(() => kiRows.find((r) => r.key === kiSelectedKey) || null, [kiRows, kiSelectedKey]);
    const lvSuggestions = useMemo(() => {
        if (!kiSelected || !lvPositions.length)
            return [];
        const query = `${kiSelected.layerGroup} ${kiSelected.exampleLayer || ""} ${kiSelected.exampleName || ""}`;
        return lvPositions
            .map((p) => ({
            pos: p.pos,
            text: p.text,
            unit: p.unit,
            score: Math.max(scoreMatch(query, `${p.pos} ${p.text}`), scoreMatch(kiSelected.layerGroup, p.text), scoreMatch(kiSelected.exampleLayer || "", p.text)),
        }))
            .filter((x) => x.score > 0.18)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);
    }, [kiSelected, lvPositions]);
    useEffect(() => setChosenLvPos(""), [kiSelectedKey]);
    useEffect(() => {
        if (!kiSelected)
            return;
        const chosen = lvSuggestions.find((s) => s.pos === chosenLvPos);
        let finalPos = kiSelected.lvPos;
        let finalText = `KI: ${kiSelected.layerGroup}`;
        let finalUnit = kiSelected.unit;
        if (chosen) {
            finalPos = chosen.pos;
            finalText = chosen.text;
            const u = String(chosen.unit || "").toLowerCase();
            if (u.includes("m2") || u.includes("mÂ²"))
                finalUnit = "m2";
            else if (u.includes("stk") || u === "st")
                finalUnit = "Stk";
            else
                finalUnit = "m";
        }
        setKiPos(finalPos || "001");
        setKiText(finalText || "KI: â€”");
        setKiUnit(finalUnit);
        setKiFactor(1);
    }, [kiSelected, chosenLvPos, lvSuggestions]);
    const kiQtyPreview = useMemo(() => Number(kiSelected?.qty || 0) *
        (Number.isFinite(kiFactor) ? kiFactor : 1), [kiSelected, kiFactor]);
    const exportGeoJson = () => {
        const geo = {
            type: "FeatureCollection",
            name: `RLC_${projectId || "CAD"}`,
            features: visibleFeatures.map((f) => {
                const pts = Array.isArray(f.pts) ? f.pts : [];
                const closed = Boolean(f.closed || f.kind === "polygon");
                const coordinates = pts.map((p) => [p.x, p.y]);
                const geometry = f.kind === "point" || pts.length === 1
                    ? {
                        type: "Point",
                        coordinates: coordinates[0] || [0, 0],
                    }
                    : closed
                        ? {
                            type: "Polygon",
                            coordinates: [
                                coordinates.length &&
                                    (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
                                        coordinates[0][1] !== coordinates[coordinates.length - 1][1])
                                    ? [...coordinates, coordinates[0]]
                                    : coordinates,
                            ],
                        }
                        : {
                            type: "LineString",
                            coordinates,
                        };
                return {
                    type: "Feature",
                    id: f.id,
                    properties: {
                        id: f.id,
                        layer: f.layer,
                        name: f.name,
                        kind: f.kind,
                        length: f.length,
                        area: f.area,
                    },
                    geometry,
                };
            }),
        };
        downloadText(`${projectId || "cad"}-mengenermittlung.geojson`, JSON.stringify(geo, null, 2), "application/geo+json");
    };
    const exportDxf = () => {
        // Robustes ASCII-DXF R12 (AC1009): derselbe elementare Entity-Satz,
        // den der RLC-Importer zuverlÃ¤ssig lesen kann und BricsCAD direkt Ã¶ffnet.
        const rows = [];
        const push = (...values) => values.forEach((value) => rows.push(String(value)));
        const num = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(6).replace(/\.?0+$/, "") : "0";
        const safe = (value) => String(value ?? "").replace(/[\r\n\0]/g, " ").replace(/[^\x20-\x7E]/g, "?").slice(0, 240);
        const layerNames = Array.from(new Set([...features.map((feature) => safe(feature.layer || "0")), ...(utmPoints.length ? ["RLC_PUNKTE", "RLC_PUNKT_TEXTE"] : []), "0"]));
        push(0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1009", 9, "$INSBASE", 10, 0, 20, 0, 30, 0, 0, "ENDSEC");
        push(0, "SECTION", 2, "TABLES", 0, "TABLE", 2, "LTYPE", 70, 1, 0, "LTYPE", 2, "CONTINUOUS", 70, 0, 3, "Solid line", 72, 65, 73, 0, 40, 0, 0, "ENDTAB");
        const hexToAci = (hex) => {
            const value = String(hex || "").toLowerCase();
            const map = {
                "#ff0000": 1, "#ffff00": 2, "#00ff00": 3, "#00ffff": 4,
                "#0000ff": 5, "#ff00ff": 6, "#ffffff": 7, "#808080": 8, "#c0c0c0": 9
            };
            return map[value] || 7;
        };
        push(0, "TABLE", 2, "LAYER", 70, layerNames.length);
        layerNames.forEach((layer) => push(0, "LAYER", 2, layer, 70, 0, 62, hexToAci(layerColors[layer] || "#ffffff"), 6, "CONTINUOUS"));
        push(0, "ENDTAB", 0, "TABLE", 2, "STYLE", 70, 1, 0, "STYLE", 2, "STANDARD", 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 2.5, 3, "txt", 4, "", 0, "ENDTAB", 0, "ENDSEC");
        push(0, "SECTION", 2, "ENTITIES");
        for (const feature of features) {
            const layer = safe(feature.layer || "0");
            const pts = Array.isArray(feature.pts) ? feature.pts : [];
            const kind = String(feature.kind || "").toLowerCase();
            if (kind === "text" && pts[0]) {
                const meta = (feature.meta || {});
                push(0, "TEXT", 8, layer, 10, num(pts[0].x), 20, num(pts[0].y), 30, 0, 40, num(meta.height || 0.2), 1, safe(feature.text || feature.name || ""), 50, num(feature.rotation || meta.rotation || 0), 7, "STANDARD");
            }
            else if (kind === "circle" && pts[0] && Number(feature.radius || 0) > 0) {
                push(0, "CIRCLE", 8, layer, 10, num(pts[0].x), 20, num(pts[0].y), 30, 0, 40, num(feature.radius || 0));
            }
            else if (pts.length === 2 && kind === "line") {
                push(0, "LINE", 8, layer, 10, num(pts[0].x), 20, num(pts[0].y), 30, 0, 11, num(pts[1].x), 21, num(pts[1].y), 31, 0);
            }
            else if (pts.length >= 2) {
                push(0, "POLYLINE", 8, layer, 66, 1, 70, (feature.closed || kind === "polygon") ? 1 : 0);
                pts.forEach((point) => push(0, "VERTEX", 8, layer, 10, num(point.x), 20, num(point.y), 30, 0, 70, 0));
                push(0, "SEQEND", 8, layer);
            }
            else if (pts[0]) {
                push(0, "POINT", 8, layer, 10, num(pts[0].x), 20, num(pts[0].y), 30, 0);
            }
        }
        for (const point of utmPoints) {
            const z = num(point.height || 0);
            const cross = Math.max(0.05, 0.5 * utmSymbolSize);
            push(0, "POINT", 8, "RLC_PUNKTE", 10, num(point.x), 20, num(point.y), 30, z);
            push(0, "LINE", 8, "RLC_PUNKTE", 10, num(point.x - cross), 20, num(point.y - cross), 30, z, 11, num(point.x + cross), 21, num(point.y + cross), 31, z);
            push(0, "LINE", 8, "RLC_PUNKTE", 10, num(point.x - cross), 20, num(point.y + cross), 30, z, 11, num(point.x + cross), 21, num(point.y - cross), 31, z);
            push(0, "TEXT", 8, "RLC_PUNKT_TEXTE", 10, num(point.x + cross * 1.9), 20, num(point.y + cross * 1.3), 30, z, 40, "0.20", 1, safe(`${point.label || point.id}${point.code ? ` ${point.code}` : ""}`), 7, "STANDARD");
        }
        push(0, "ENDSEC", 0, "EOF");
        downloadText(`${(drawingName || projectId || "cad").replace(/[^a-zA-Z0-9._-]+/g, "_")}-export.dxf`, `${rows.join("\r\n")}\r\n`, "application/dxf");
        setStatus(`DXF R12 exportiert (${features.length} Objekte Â· ${utmPoints.length} Punkte)`);
    };
    const exportCsv = () => {
        const rows = [
            ["ID", "Layer", "Typ", "Name", "Laenge_m", "Flaeche_m2"],
            ...visibleFeatures.map((f) => [
                String(f.id || ""),
                String(f.layer || ""),
                String(f.kind || ""),
                String(f.name || ""),
                String(Number(f.length || 0)),
                String(Number(f.area || 0)),
            ]),
        ];
        const csv = rows
            .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
            .join("\r\n");
        downloadText(`${projectId || "cad"}-mengenermittlung.csv`, csv, "text/csv;charset=utf-8");
    };
    const exportTakeoffJson = () => {
        const document = createCadDocument(String(current?.code || projectId || "").trim(), features, {
            fileName: `${projectId || "cad"}-mengenermittlung.json`,
            format: "RLC Mengenermittlung",
            importedAt: new Date().toISOString(),
        });
        downloadText(`${projectId || "cad"}-mengenermittlung.json`, JSON.stringify(document, null, 2), "application/json;charset=utf-8");
        setStatus("mengenermittlung.json exportiert");
    };
    const exportSnapshotPng = async () => {
        const svg = svgRef.current;
        if (!svg)
            return;
        setStatus("Snapshot wird erstelltâ€¦");
        try {
            const clone = svg.cloneNode(true);
            const rect = svg.getBoundingClientRect();
            const width = Math.max(1200, Math.round(rect.width * 1.5));
            const height = Math.max(700, Math.round(width * (Math.max(rect.height, 1) / Math.max(rect.width, 1))));
            clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            clone.setAttribute("width", String(width));
            clone.setAttribute("height", String(height));
            const source = new XMLSerializer().serializeToString(clone);
            const sourceUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
            const image = new Image();
            await new Promise((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = () => reject(new Error("SVG-Snapshot konnte nicht gerendert werden."));
                image.src = sourceUrl;
            });
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context)
                throw new Error("Canvas nicht verfÃ¼gbar.");
            context.fillStyle = ui.cadBg;
            context.fillRect(0, 0, width, height);
            context.drawImage(image, 0, 0, width, height);
            URL.revokeObjectURL(sourceUrl);
            const png = await new Promise((resolve, reject) => {
                canvas.toBlob((blob) => blob
                    ? resolve(blob)
                    : reject(new Error("PNG konnte nicht erstellt werden.")), "image/png");
            });
            downloadBlob(`${projectId || "cad"}-snapshot.png`, png);
            setStatus("snapshot.png exportiert");
        }
        catch (error) {
            setStatus("Snapshot fehlgeschlagen");
            void cadAlert(String(error?.message || error));
        }
    };
    const applyLvToCadSelection = () => {
        const targetIds = new Set(selectedFeatureIds.length
            ? selectedFeatureIds
            : visibleFeatures.map((feature) => String(feature.id || "")).filter(Boolean));
        if (!targetIds.size) {
            setStatus("Keine CAD-Objekte fÃ¼r die LV-Zuordnung");
            return;
        }
        commitDrawing(features.map((feature) => targetIds.has(String(feature.id || ""))
            ? {
                ...feature,
                meta: {
                    ...(feature.meta || {}),
                    lvPos: pos.trim(),
                    lvText: kurz.trim(),
                },
            }
            : feature));
        setStatus(`LV ${pos.trim() || "â€”"} auf ${targetIds.size} Objekte angewendet`);
    };
    const takeoffActiveLayer = () => {
        const ids = visibleFeatures
            .filter((feature) => String(feature.layer || "0") === activeLayer)
            .map((feature) => String(feature.id || ""))
            .filter(Boolean);
        setSelectedFeatureIds(ids);
        setSelectedFeatureId(ids[0] || "");
        setStatus(`${ids.length} Objekte aus Layer ${activeLayer} gemessen`);
    };
    const prepareSelectionTakeoff = () => {
        if (!selectedFeatureIds.length) {
            activateTool("select");
            setStatus("Mengenermittlung: Objekte im CAD auswÃ¤hlen");
            return;
        }
        setRightTab("aufmass");
        setStatus(`${selectedFeatureIds.length} Objekte fÃ¼r Mengenermittlung ausgewÃ¤hlt`);
    };
    const selectedFeatureCenter = selectedFeature?.pts?.length
        ? centroid(selectedFeature.pts)
        : null;
    const rlcTakeoffLength = selectedFeatures.reduce((sum, feature) => sum + Number(feature.length || 0), 0);
    const rlcTakeoffArea = selectedFeatures.reduce((sum, feature) => sum + Number(feature.area || 0), 0);
    const positionAufmassQty = positionAufmassRows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const selectedLvUnit = normalizeLvUnit(selectedLvPosition?.unit || unit);
    const selectedCadQty = selectedLvUnit === "m2"
        ? rlcTakeoffArea
        : selectedLvUnit === "Stk"
            ? selectedFeatures.length
            : rlcTakeoffLength;
    const assignSelectionToLvPosition = async () => {
        if (!selectedLvPosition) {
            setLeftTab("lv");
            return void cadAlert("Bitte zuerst eine LV-Position wÃ¤hlen.");
        }
        if (!selectedFeatures.length) {
            activateTool("select");
            return void cadAlert("Bitte zuerst CAD-Objekte oder einen Layer auswÃ¤hlen.");
        }
        const ids = new Set(selectedFeatures.map((feature) => String(feature.id || "")));
        const transferred = await pushToAufmass({
            pos: selectedLvPosition.pos,
            text: selectedLvPosition.text,
            unit: selectedLvUnit,
            qty: selectedCadQty,
            lvPositionId: selectedLvPosition.id,
        });
        if (transferred) {
            commitDrawing(features.map((feature) => ids.has(String(feature.id || ""))
                ? {
                    ...feature,
                    meta: {
                        ...(feature.meta || {}),
                        lvPositionId: selectedLvPosition.id,
                        lvPos: selectedLvPosition.pos,
                        lvText: selectedLvPosition.text,
                    },
                }
                : feature));
            setLeftTab("lv");
            setStatus(`Position ${selectedLvPosition.pos} zugeordnet Â· ${formatNumber(selectedCadQty)} ${uiUnitLabel(selectedLvUnit)}`);
        }
    };
    const zoomToSelection = () => {
        if (!selectedFeature?.pts?.length)
            return;
        const selectionPoints = [...selectedFeature.pts];
        if (selectedFeature.kind === "circle" &&
            selectedFeature.pts[0] &&
            Number(selectedFeature.radius || 0) > 0) {
            const center = selectedFeature.pts[0];
            const radius = Number(selectedFeature.radius || 0);
            selectionPoints.push({ x: center.x - radius, y: center.y - radius }, { x: center.x + radius, y: center.y + radius });
        }
        const b = boundsFromPoints(selectionPoints.map(cadToCanvas));
        if (b) {
            setViewBox(boundsToAspectViewBox(expandBounds(b, 0.25), viewportAspect));
        }
    };
    const toggleAllLayers = (visible) => {
        const next = {};
        for (const l of layerStates)
            next[l.name] = visible;
        setLayerVisibility(next);
    };
    const createNewLayer = async () => {
        setRightTab("layers");
        const requested = await cadPrompt("Name des neuen Layers", "RLC_NEU");
        if (requested === null)
            return;
        const nextName = String(requested || "").trim();
        if (!nextName) {
            setStatus("Layername fehlt");
            return;
        }
        const exists = layerStates.some((layer) => layer.name.toLowerCase() === nextName.toLowerCase());
        if (exists) {
            setActiveLayer(layerStates.find((layer) => layer.name.toLowerCase() === nextName.toLowerCase())?.name || nextName);
            setStatus(`Layer ${nextName} ist bereits vorhanden`);
            return;
        }
        setLayerVisibility((previous) => ({ ...previous, [nextName]: true }));
        setLayerColors((previous) => ({
            ...previous,
            [nextName]: previous[nextName] || "#d7dde5",
        }));
        setActiveLayer(nextName);
        setIsolatedLayer("");
        setDirty(true);
        setStatus(`Layer ${nextName} erstellt und aktiviert`);
    };
    const applyLayerColor = (layerName, color) => {
        setLayerColors((prev) => ({ ...prev, [layerName]: color }));
        setFeatures((prev) => prev.map((feature) => String(feature.layer || "0") === layerName
            ? {
                ...feature,
                color,
                meta: { ...(feature.meta || {}), color, colorMode: "BYLAYER" },
            }
            : feature));
        setDirty(true);
        setStatus(`Layerfarbe ${layerName} geÃ¤ndert`);
    };
    const deleteLayer = (layerName) => {
        const layer = layerStates.find((entry) => entry.name === layerName);
        if (!layer)
            return;
        if (layerName === "0") {
            setStatus("Layer 0 kann nicht gelÃ¶scht werden");
            return;
        }
        if (layer.count > 0) {
            setStatus(`Layer ${layerName} enthÃ¤lt ${layer.count} Objekte und kann nicht gelÃ¶scht werden`);
            return;
        }
        setLayerVisibility((previous) => {
            const next = { ...previous };
            delete next[layerName];
            return next;
        });
        setLayerColors((previous) => {
            const next = { ...previous };
            delete next[layerName];
            return next;
        });
        setLayerLocks((previous) => {
            const next = { ...previous };
            delete next[layerName];
            return next;
        });
        if (activeLayer === layerName)
            setActiveLayer("0");
        if (isolatedLayer === layerName)
            setIsolatedLayer("");
        setDirty(true);
        setStatus(`Layer ${layerName} gelÃ¶scht`);
    };
    const activateTool = (nextTool) => {
        setTool(nextTool);
        setDimensionDraft(null);
        setModifyPickIds([]);
        setMirrorAxisPts([]);
        setMirrorPhase("idle");
        setMirrorPreviewAngle(180);
        setDraftPts([]);
        setTextAnchor(null);
        setNumericCommand(null);
        if (nextTool === "select" ||
            nextTool === "pan" ||
            !["distance", "area", "point"].includes(nextTool)) {
            setMeasurePts([]);
        }
    };
    const repeatLastCadCommand = () => {
        const command = lastCadCommandRef.current;
        if (["trim", "extend", "join", "fillet", "mirror"].includes(command)) {
            startModifyCommand(command);
            return;
        }
        if (command === "rotate") {
            startRotateCommand();
            return;
        }
        if (command === "scale") {
            startScaleCommand();
            return;
        }
        if (command === "offset") {
            startOffsetCommand();
            return;
        }
        if (command === "explode") {
            startExplodeCommand();
            return;
        }
        if (command === "hatch") {
            setPendingHatchBoundary(null);
            activateTool("hatch");
            setStatus("Schraffieren: Innenpunkt einer geschlossenen FlÃ¤che wÃ¤hlen");
            return;
        }
        activateTool(command);
        setStatus(`Letzten Befehl wiederholt: ${command}`);
    };
    const toggleSnap = () => {
        setSnapEnabled((value) => {
            const next = !value;
            setActiveSnap(null);
            setStatus(next
                ? "Objektfang aktiv Â· Endpunkt, Mittelpunkt, Zentrum, StÃ¼tzpunkt, Vermessungspunkt"
                : "Objektfang ausgeschaltet");
            return next;
        });
    };
    const toggleOrtho = () => {
        setOrthoEnabled((value) => {
            const next = !value;
            setStatus(next ? "Ortho aktiv (F8) Â· horizontal/vertikal" : "Ortho ausgeschaltet (F8)");
            return next;
        });
    };
    useEffect(() => {
        const onKeyDown = (e) => {
            const target = e.target;
            const tag = target?.tagName?.toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable)
                return;
            if (e.key === "Escape") {
                if (cadFullscreen) {
                    setCadFullscreen(false);
                    return;
                }
                if (objectDrag || vertexDrag)
                    undoDrawing();
                e.preventDefault();
                setSelectedFeatureId("");
                setSelectedFeatureIds([]);
                setSelectedUtmIds([]);
                setMeasurePts([]);
                setSelectionDrag(null);
                setObjectDrag(null);
                setVertexDrag(null);
                setActiveSnap(null);
                setCadContextMenu(null);
                setActiveLayerMenuOpen(false);
                cancelCurrentCommand();
                setTool("select");
                setStatus("Auswahl aufgehoben");
                return;
            }
            if (e.key === "Enter") {
                if (tool === "polyline") {
                    e.preventDefault();
                    finishPolyline(false);
                    return;
                }
                if (tool === "text" && textAnchor && textValue.trim()) {
                    e.preventDefault();
                    commitText();
                    return;
                }
            }
            if (e.key === "F3") {
                e.preventDefault();
                toggleSnap();
                return;
            }
            if (e.key === "F8") {
                e.preventDefault();
                toggleOrtho();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                void saveCadDrawing();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey)
                    redoDrawing();
                else
                    undoDrawing();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
                e.preventDefault();
                redoDrawing();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
                e.preventDefault();
                const ids = visibleFeatures.map((f) => String(f.id || "")).filter(Boolean);
                setSelectedFeatureIds(ids);
                setSelectedFeatureId(ids[0] || "");
                return;
            }
            if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                deleteSelection();
                return;
            }
            const key = e.key.toLowerCase();
            if (key === "f")
                fitDrawing();
            else if (key === "g")
                setShowGrid((v) => !v);
            else if (key === "h")
                setShowLabels((v) => !v);
            else if (key === "s")
                activateTool("select");
            else if (key === "p")
                activateTool("pan");
            else if (key === "v")
                activateTool("move");
            else if (key === "k")
                activateTool("copy");
            else if (key === "e")
                activateTool("select");
            else if (key === "l")
                activateTool("line");
            else if (key === "b")
                activateTool("polyline");
            else if (key === "r")
                activateTool("rectangle");
            else if (key === "c")
                activateTool("circle");
            else if (key === "t")
                activateTool("text");
            else if (key === "m") {
                setMeasurePts([]);
                activateTool("distance");
            }
            else if (key === "a") {
                setMeasurePts([]);
                activateTool("area");
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [
        visibleFeatures,
        features,
        selectedFeatureIds,
        objectDrag,
        vertexDrag,
        historyTick,
        tool,
        draftPts,
        textAnchor,
        textValue,
        cadFullscreen,
    ]);
    return (_jsxs("div", { style: {
            minHeight: "calc(100vh - 112px)",
            background: ui.bg,
            padding: 8,
            color: ui.text,
            overflowX: "hidden",
            overflowY: "visible",
        }, children: [_jsxs("div", { style: {
                    border: `1px solid ${cadPalette.border}`,
                    borderBottom: 0,
                    borderRadius: "6px 6px 0 0",
                    background: "#111821",
                    boxShadow: "0 8px 22px rgba(15,23,42,.16)",
                    overflow: "hidden",
                    marginBottom: 0,
                }, children: [_jsxs("div", { style: {
                            minHeight: 30,
                            padding: "0 9px",
                            borderBottom: "1px solid rgba(255,255,255,.10)",
                            background: "#20262e",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                        }, children: [_jsxs("div", { style: {
                                    minWidth: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    color: cadPalette.text,
                                }, children: [_jsx("span", { style: {
                                            width: 21,
                                            height: 21,
                                            borderRadius: 4,
                                            background: "#0f5f97",
                                            color: "#fff",
                                            display: "grid",
                                            placeItems: "center",
                                            flex: "0 0 auto",
                                        }, children: _jsx(CadRibbonIcon, { name: "project" }) }), _jsx("b", { style: { fontSize: 11.5, whiteSpace: "nowrap" }, children: "Projekt & Datei" }), _jsx("span", { style: {
                                            minWidth: 0,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            color: cadPalette.sub,
                                            fontSize: 10,
                                        }, children: current
                                            ? `${current.code} â€“ ${current.name} Â· ${drawingName}`
                                            : `${projectId || "Kein Projekt gewÃ¤hlt"} Â· ${drawingName}` })] }), _jsxs("div", { style: {
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    flex: "0 0 auto",
                                    fontSize: 9.5,
                                    fontWeight: 850,
                                }, children: [_jsx("span", { style: {
                                            padding: "3px 7px",
                                            borderRadius: 999,
                                            border: `1px solid ${features.length ? "rgba(98,216,158,.35)" : "rgba(251,191,36,.30)"}`,
                                            background: features.length
                                                ? "rgba(16,124,78,.22)"
                                                : "rgba(180,83,9,.16)",
                                            color: features.length ? "#75e0ae" : "#f7c967",
                                        }, children: features.length ? `${features.length} Objekte` : "Keine CAD-Daten" }), _jsx("span", { style: {
                                            padding: "3px 7px",
                                            borderRadius: 999,
                                            border: `1px solid ${dirty ? "rgba(66,169,230,.45)" : "rgba(255,255,255,.12)"}`,
                                            background: dirty ? "rgba(15,95,151,.28)" : "#18212b",
                                            color: dirty ? "#8ed8ff" : cadPalette.sub,
                                        }, children: dirty ? "Ungespeichert" : "Gespeichert" })] })] }), _jsxs("div", { style: {
                            padding: 5,
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                            gap: 5,
                            background: "#111821",
                        }, children: [_jsxs(CadRibbonGroup, { title: "Projekt \u00C2\u00B7 Zeichnungen", children: [_jsx(Input, { value: projectId, onChange: (event) => setProjectId(event.target.value), onBlur: () => localStorage.setItem("rlc_projectId", projectId.trim()), placeholder: "Projektcode", title: "Aktuelles Projekt", style: {
                                            width: 128,
                                            height: 32,
                                            borderRadius: 4,
                                            border: "1px solid rgba(255,255,255,.17)",
                                            background: "#0f1620",
                                            color: "#eef2f6",
                                            padding: "0 8px",
                                            fontSize: 10.5,
                                            boxShadow: "inset 0 1px 2px rgba(0,0,0,.35)",
                                        } }), _jsx(CadRibbonButton, { icon: "newDrawing", label: "Neu", onClick: createNewDrawing, title: "Neue leere Zeichnung erstellen" }), _jsx(CadRibbonButton, { icon: "openProject", label: "\u00C3\u2013ffnen", onClick: () => void loadDrawingLibrary(), primary: true, title: "Gespeicherte Zeichnungen dieses Projekts \u00C3\u00B6ffnen" })] }), _jsxs(CadRibbonGroup, { title: "Dateien \u00C3\u00B6ffnen", children: [_jsx(CadRibbonButton, { icon: "openCad", label: "CAD-Datei", onClick: openCadFile, title: "CAD-Datei \u00C3\u00B6ffnen" }), _jsx(CadRibbonButton, { icon: "openPoints", label: "Punktdatei", onClick: openPointFile, title: "Punktdatei \u00C3\u00B6ffnen" })] }), _jsxs(CadRibbonGroup, { title: "Speichern", children: [_jsx(CadRibbonButton, { icon: "save", label: dirty ? "Speichern *" : "Speichern", onClick: () => void saveCadDrawing(), disabled: !projectId, primary: dirty, title: "Zeichnung speichern (Ctrl+S)" }), _jsx(CadRibbonButton, { icon: "saveAs", label: "Speichern unter", onClick: () => void saveCadDrawingAs(), disabled: !projectId })] }), _jsxs(CadRibbonGroup, { title: "Export", children: [_jsx(CadRibbonButton, { icon: "dxf", label: "DXF", onClick: exportDxf, disabled: !features.length && !utmPoints.length, title: "DXF exportieren" }), _jsx(CadRibbonButton, { icon: "geojson", label: "GeoJSON", onClick: exportGeoJson, disabled: !visibleFeatures.length }), _jsx(CadRibbonButton, { icon: "csv", label: "CSV", onClick: exportCsv, disabled: !visibleFeatures.length })] })] }), _jsx("input", { ref: pointFileInputRef, type: "file", accept: ".csv,.txt,.gsi", onChange: importPointFile, style: { display: "none" } }), _jsx("input", { ref: cadFileInputRef, type: "file", accept: ".dxf,.dwg,.dgn,.xml,.landxml,.pdf,.json,.geojson,.csv,.txt,.gsi", onChange: importCadFile, style: { display: "none" } })] }), cadDialog ? (_jsx("div", { role: "dialog", "aria-modal": "true", "aria-label": cadDialog.title, onMouseDown: (event) => {
                    if (event.currentTarget !== event.target)
                        return;
                    closeCadDialog(cadDialog.type === "confirm" ? false : null);
                }, onKeyDown: (event) => {
                    if (event.key === "Escape") {
                        event.preventDefault();
                        closeCadDialog(cadDialog.type === "confirm" ? false : null);
                    }
                    if (event.key === "Enter" && cadDialog.type === "prompt") {
                        event.preventDefault();
                        closeCadDialog(cadDialog.value);
                    }
                }, style: {
                    position: "fixed",
                    inset: 0,
                    zIndex: 2147483600,
                    display: "grid",
                    placeItems: "center",
                    padding: 18,
                    background: "rgba(3,8,15,.74)",
                    backdropFilter: "blur(3px)",
                }, children: _jsxs("div", { style: {
                        width: "min(480px, 94vw)",
                        overflow: "hidden",
                        border: `1px solid ${cadPalette.border}`,
                        borderRadius: 8,
                        background: "#171e27",
                        color: cadPalette.text,
                        boxShadow: "0 28px 80px rgba(0,0,0,.55)",
                    }, children: [_jsxs("div", { style: {
                                minHeight: 46,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 12,
                                padding: "0 14px",
                                borderBottom: `1px solid ${cadPalette.border}`,
                                background: "linear-gradient(180deg,#25303c 0%,#1d2630 100%)",
                            }, children: [_jsx("div", { style: { fontSize: 14, fontWeight: 950 }, children: cadDialog.title }), _jsx("button", { type: "button", onClick: () => closeCadDialog(cadDialog.type === "confirm" ? false : null), style: {
                                        width: 28,
                                        height: 28,
                                        border: 0,
                                        borderRadius: 4,
                                        background: "transparent",
                                        color: "#cbd5e1",
                                        fontSize: 18,
                                        cursor: "pointer",
                                    }, children: "\u00C3\u2014" })] }), _jsxs("div", { style: { padding: 16 }, children: [_jsx("div", { style: {
                                        color: "#dbe5ef",
                                        fontSize: 13,
                                        lineHeight: 1.55,
                                        whiteSpace: "pre-wrap",
                                    }, children: cadDialog.message }), cadDialog.type === "prompt" ? (_jsx("input", { autoFocus: true, value: cadDialog.value, onChange: (event) => setCadDialog((previous) => previous ? { ...previous, value: event.target.value } : previous), style: {
                                        width: "100%",
                                        height: 38,
                                        marginTop: 14,
                                        border: "1px solid #526173",
                                        borderRadius: 5,
                                        background: "#101720",
                                        color: "#f8fafc",
                                        padding: "0 11px",
                                        fontSize: 13,
                                        fontWeight: 800,
                                        outline: "none",
                                        boxSizing: "border-box",
                                    } })) : null] }), _jsxs("div", { style: {
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: 8,
                                padding: "11px 14px",
                                borderTop: `1px solid ${cadPalette.border}`,
                                background: "#141b23",
                            }, children: [cadDialog.type !== "alert" ? (_jsx("button", { type: "button", onClick: () => closeCadDialog(cadDialog.type === "confirm" ? false : null), style: {
                                        minWidth: 96,
                                        height: 34,
                                        border: "1px solid #465568",
                                        borderRadius: 5,
                                        background: "#252f3b",
                                        color: "#e5edf5",
                                        fontSize: 12,
                                        fontWeight: 900,
                                        cursor: "pointer",
                                    }, children: "Abbrechen" })) : null, _jsx("button", { type: "button", autoFocus: cadDialog.type !== "prompt", onClick: () => closeCadDialog(cadDialog.type === "prompt"
                                        ? cadDialog.value
                                        : cadDialog.type === "confirm"
                                            ? true
                                            : null), style: {
                                        minWidth: 96,
                                        height: 34,
                                        border: "1px solid #1787c8",
                                        borderRadius: 5,
                                        background: "linear-gradient(180deg,#1587c7 0%,#08649b 100%)",
                                        color: "#ffffff",
                                        fontSize: 12,
                                        fontWeight: 950,
                                        cursor: "pointer",
                                    }, children: cadDialog.type === "alert" ? "OK" : cadDialog.type === "confirm" ? "Ja" : "Ãœbernehmen" })] })] }) })) : null, drawingBrowserOpen ? (_jsx("div", { role: "dialog", "aria-modal": "true", "aria-label": "Gespeicherte Zeichnungen", onMouseDown: (event) => {
                    if (event.currentTarget === event.target)
                        setDrawingBrowserOpen(false);
                }, style: {
                    position: "fixed",
                    inset: 0,
                    zIndex: 2147482500,
                    display: "grid",
                    placeItems: "center",
                    padding: 18,
                    background: "rgba(3,8,15,.72)",
                    backdropFilter: "blur(3px)",
                }, children: _jsxs("div", { style: {
                        width: "min(860px, 96vw)",
                        maxHeight: "min(720px, 88vh)",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                        border: `1px solid ${cadPalette.border}`,
                        borderRadius: 8,
                        background: "#171e27",
                        color: cadPalette.text,
                        boxShadow: "0 28px 80px rgba(0,0,0,.48)",
                    }, children: [_jsxs("div", { style: {
                                minHeight: 48,
                                padding: "0 14px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 12,
                                borderBottom: `1px solid ${cadPalette.border}`,
                                background: "#202832",
                            }, children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: { fontSize: 14, fontWeight: 950 }, children: "Gespeicherte Zeichnungen" }), _jsxs("div", { style: { marginTop: 2, color: cadPalette.sub, fontSize: 10.5 }, children: ["Projekt ", projectId || "â€”", " \u00C2\u00B7 Zeichnung ausw\u00C3\u00A4hlen oder neu anlegen"] })] }), _jsxs("div", { style: { display: "flex", gap: 6 }, children: [_jsx(CadRibbonButton, { icon: "newDrawing", label: "Neu", onClick: createNewDrawing }), _jsx("button", { type: "button", title: "Liste aktualisieren", onClick: () => void loadDrawingLibrary(), style: {
                                                height: 32,
                                                padding: "0 10px",
                                                borderRadius: 4,
                                                border: "1px solid rgba(255,255,255,.14)",
                                                background: "#202a36",
                                                color: cadPalette.text,
                                                cursor: "pointer",
                                                fontSize: 11,
                                                fontWeight: 850,
                                            }, children: "Aktualisieren" }), _jsx("button", { type: "button", title: "Schlie\u00C3\u0178en", onClick: () => setDrawingBrowserOpen(false), style: {
                                                width: 32,
                                                height: 32,
                                                borderRadius: 4,
                                                border: "1px solid rgba(255,255,255,.14)",
                                                background: "#202a36",
                                                color: cadPalette.text,
                                                cursor: "pointer",
                                                fontSize: 17,
                                            }, children: "\u00C3\u2014" })] })] }), _jsx("div", { style: {
                                flex: "1 1 auto",
                                minHeight: 0,
                                overflowY: "auto",
                                padding: 10,
                                background: "#141a22",
                            }, children: drawingListState === "loading" ? (_jsx("div", { style: { padding: 24, textAlign: "center", color: cadPalette.sub }, children: "Zeichnungen werden geladen\u00E2\u20AC\u00A6" })) : drawingList.length ? (_jsx("div", { style: { display: "grid", gap: 7 }, children: drawingList.map((item) => (_jsxs("div", { style: {
                                        minHeight: 62,
                                        padding: "8px 9px 8px 12px",
                                        display: "grid",
                                        gridTemplateColumns: "minmax(0,1fr) auto",
                                        alignItems: "center",
                                        gap: 12,
                                        border: `1px solid ${cadPalette.border}`,
                                        borderRadius: 6,
                                        background: (currentDrawingId ? item.id === currentDrawingId : item.drawingName === drawingName)
                                            ? "#173d57"
                                            : "#1c242e",
                                    }, children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: {
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                        fontSize: 12.5,
                                                        fontWeight: 900,
                                                        color: (currentDrawingId ? item.id === currentDrawingId : item.drawingName === drawingName) ? "#8ed8ff" : cadPalette.text,
                                                    }, children: item.drawingName }), _jsxs("div", { style: {
                                                        marginTop: 5,
                                                        display: "flex",
                                                        flexWrap: "wrap",
                                                        gap: "4px 12px",
                                                        color: cadPalette.sub,
                                                        fontSize: 10,
                                                    }, children: [item.fileName ? _jsx("span", { children: item.fileName }) : null, Number.isFinite(item.objectCount) ? (_jsxs("span", { children: [item.objectCount, " Objekte"] })) : null, item.updatedAt ? (_jsx("span", { children: new Date(item.updatedAt).toLocaleString("de-DE") })) : null, _jsx("span", { children: item.source === "browser" ? "Browser-Sicherung" : "Server" })] })] }), _jsx(CadRibbonButton, { icon: "openProject", label: openingDrawingId === item.id ? "Ladenâ€¦" : "Ã–ffnen", onClick: () => void openSavedDrawing(item), disabled: Boolean(openingDrawingId), primary: (currentDrawingId ? item.id === currentDrawingId : item.drawingName === drawingName) })] }, `${item.source || "cad"}_${item.id}`))) })) : (_jsx("div", { style: {
                                    padding: 28,
                                    border: `1px dashed ${cadPalette.border}`,
                                    borderRadius: 6,
                                    textAlign: "center",
                                    color: cadPalette.sub,
                                    fontSize: 12,
                                }, children: drawingListError || "Keine gespeicherten Zeichnungen vorhanden." })) })] }) })) : null, _jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr)",
                    gridTemplateRows: cadFullscreen
                        ? "100dvh 0"
                        : `minmax(610px, 1fr) ${projectDockCollapsed ? 34 : projectDockHeight}px`,
                    gridTemplateAreas: '"cad" "structure"',
                    rowGap: 0,
                    minHeight: cadFullscreen ? "100dvh" : 1040,
                    height: cadFullscreen ? "100dvh" : "max(1040px, calc(100dvh - 118px))",
                    maxHeight: cadFullscreen ? "100dvh" : "none",
                    alignItems: "stretch",
                    position: cadFullscreen ? "fixed" : "relative",
                    inset: cadFullscreen ? 0 : undefined,
                    zIndex: cadFullscreen ? 2147483000 : undefined,
                    isolation: cadFullscreen ? "isolate" : undefined,
                    background: ui.cadBg,
                    border: cadFullscreen ? 0 : `1px solid ${cadPalette.border}`,
                    borderRadius: cadFullscreen ? 0 : "0 0 6px 6px",
                    borderTop: cadFullscreen ? 0 : "none",
                    overflow: "hidden",
                    boxShadow: cadFullscreen ? "none" : ui.shadow,
                }, children: [_jsx(Card, { title: "Projektstruktur", subtitle: `${features.length} Objekte Â· ${layerStates.length} Layer`, tone: "cadDark", compact: true, action: _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsxs("span", { style: { fontSize: 10, color: projectDockTheme.sub }, children: [features.length, " Objekte \u00C2\u00B7 ", layerStates.length, " Layer"] }), _jsx("button", { type: "button", title: projectDockCollapsed ? "Projektstruktur Ã¶ffnen" : "Projektstruktur minimieren", onClick: () => setProjectDockCollapsed((value) => !value), style: {
                                        width: 24,
                                        height: 24,
                                        border: `1px solid ${projectDockTheme.borderSoft}`,
                                        borderRadius: 4,
                                        background: projectDockTheme.surface,
                                        color: projectDockTheme.text,
                                        cursor: "pointer",
                                        fontSize: 13,
                                        lineHeight: 1,
                                    }, children: projectDockCollapsed ? "â–´" : "â–¾" })] }), style: {
                            gridArea: "structure",
                            minWidth: 0,
                            height: "100%",
                            display: cadFullscreen ? "none" : "flex",
                            position: "relative",
                            border: 0,
                            borderTop: `1px solid ${projectDockTheme.border}`,
                            borderRadius: 0,
                            boxShadow: "none",
                            background: projectDockTheme.bg,
                        }, children: !projectDockCollapsed ? (_jsxs("div", { style: {
                                height: "100%",
                                minHeight: 0,
                                display: "flex",
                                flexDirection: "column",
                                background: projectDockTheme.bg,
                                color: projectDockTheme.text,
                            }, children: [_jsx("div", { role: "separator", "aria-orientation": "horizontal", title: "H\u00C3\u00B6he der Projektstruktur \u00C3\u00A4ndern", onMouseDown: (event) => {
                                        event.preventDefault();
                                        const startY = event.clientY;
                                        const startHeight = projectDockHeight;
                                        const onMove = (moveEvent) => {
                                            const next = Math.max(300, Math.min(620, startHeight + startY - moveEvent.clientY));
                                            setProjectDockHeight(next);
                                        };
                                        const onUp = () => {
                                            window.removeEventListener("mousemove", onMove);
                                            window.removeEventListener("mouseup", onUp);
                                        };
                                        window.addEventListener("mousemove", onMove);
                                        window.addEventListener("mouseup", onUp);
                                    }, style: {
                                        position: "absolute",
                                        top: -4,
                                        left: 0,
                                        right: 0,
                                        height: 8,
                                        cursor: "ns-resize",
                                        zIndex: 20,
                                        background: "linear-gradient(to bottom, transparent 2px, #4c6073 2px, #4c6073 5px, transparent 5px)",
                                    } }), _jsx("div", { style: {
                                        flex: "0 0 auto",
                                        display: "grid",
                                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                        borderBottom: `1px solid ${projectDockTheme.border}`,
                                        background: projectDockTheme.surface,
                                    }, children: [
                                        ["lv", "LV Â· AufmaÃŸ"],
                                        ["takeoff", "Allgemeine Mengen"],
                                        ["utm", "UTM"],
                                    ].map(([key, label]) => {
                                        const active = leftTab === key;
                                        return (_jsx("button", { type: "button", onClick: () => setLeftTab(key), style: {
                                                height: 40,
                                                border: 0,
                                                borderRight: `1px solid ${projectDockTheme.border}`,
                                                borderBottom: active
                                                    ? `2px solid ${projectDockTheme.accent}`
                                                    : "2px solid transparent",
                                                background: active
                                                    ? projectDockTheme.accentSoft
                                                    : projectDockTheme.surface,
                                                color: active
                                                    ? "#75d0ff"
                                                    : projectDockTheme.sub,
                                                fontSize: 12,
                                                fontWeight: 900,
                                                cursor: "pointer",
                                                boxShadow: active
                                                    ? "inset 0 1px 0 rgba(255,255,255,.035)"
                                                    : "none",
                                            }, children: label }, key));
                                    }) }), leftTab !== "utm" ? (_jsx("div", { style: {
                                        flex: "0 0 auto",
                                        padding: "10px 12px",
                                        background: projectDockTheme.surface,
                                        borderBottom: `1px solid ${projectDockTheme.border}`,
                                    }, children: _jsx(Input, { value: leftTab === "lv" ? lvSearch : search, onChange: (event) => leftTab === "lv"
                                            ? setLvSearch(event.target.value)
                                            : setSearch(event.target.value), placeholder: leftTab === "lv"
                                            ? "LV-Position oder Text suchenâ€¦"
                                            : "Layer suchenâ€¦", style: projectDockInputStyle }) })) : null, _jsx("div", { style: {
                                        flex: "1 1 auto",
                                        minHeight: 0,
                                        overflow: "hidden",
                                        background: projectDockTheme.bg,
                                    }, children: leftTab === "takeoff" ? (_jsxs("div", { style: {
                                            height: "100%",
                                            minHeight: 0,
                                            overflowY: "auto",
                                            padding: 10,
                                            display: "grid",
                                            gridTemplateColumns: "repeat(auto-fill, minmax(285px, 1fr))",
                                            gap: 8,
                                            alignContent: "start",
                                            background: projectDockTheme.bg,
                                        }, children: [_jsx("div", { style: {
                                                    gridColumn: "1 / -1",
                                                    padding: "1px 2px 5px",
                                                    fontSize: 11,
                                                    lineHeight: 1.45,
                                                    color: projectDockTheme.sub,
                                                }, children: "Vollst\u00C3\u00A4ndige Mengen je Layer. Auswahl kann direkt dem Aufma\u00C3\u0178 \u00C3\u00BCbergeben werden." }), layerStates.map((layer) => {
                                                const layerFeatures = features.filter((feature) => String(feature.layer || "0") === layer.name);
                                                const ids = layerFeatures
                                                    .map((feature) => String(feature.id || ""))
                                                    .filter(Boolean);
                                                const texts = layerFeatures
                                                    .filter((feature) => feature.kind === "text")
                                                    .map((feature) => String(feature.text || feature.name || "").trim())
                                                    .filter(Boolean);
                                                const selected = ids.length > 0 &&
                                                    ids.every((id) => selectedFeatureIds.includes(id));
                                                const selectLayerForTakeoff = (openAufmass) => {
                                                    setSelectedFeatureIds(ids);
                                                    setSelectedFeatureId(ids[0] || "");
                                                    setActiveLayer(layer.name);
                                                    if (openAufmass) {
                                                        setKurz(layer.name);
                                                        setUnit(layer.area > 0
                                                            ? "m2"
                                                            : layer.length > 0
                                                                ? "m"
                                                                : "Stk");
                                                        setRightTab("aufmass");
                                                    }
                                                    else {
                                                        setRightTab("properties");
                                                    }
                                                };
                                                return (_jsxs("div", { style: {
                                                        minWidth: 0,
                                                        padding: "10px 11px",
                                                        border: `1px solid ${selected
                                                            ? projectDockTheme.accent
                                                            : projectDockTheme.borderSoft}`,
                                                        borderRadius: 7,
                                                        background: selected
                                                            ? projectDockTheme.accentSoft
                                                            : projectDockTheme.surface,
                                                        boxShadow: "inset 0 1px 0 rgba(255,255,255,.025)",
                                                    }, children: [_jsxs("div", { style: {
                                                                display: "grid",
                                                                gridTemplateColumns: "12px minmax(0,1fr) auto",
                                                                alignItems: "center",
                                                                gap: 8,
                                                            }, children: [_jsx("span", { style: {
                                                                        width: 10,
                                                                        height: 10,
                                                                        borderRadius: 2,
                                                                        background: layer.color,
                                                                        boxShadow: "0 0 0 1px rgba(255,255,255,.15)",
                                                                    } }), _jsx("button", { type: "button", onClick: () => selectLayerForTakeoff(false), style: {
                                                                        minWidth: 0,
                                                                        padding: 0,
                                                                        border: 0,
                                                                        background: "transparent",
                                                                        color: selected
                                                                            ? "#8ed8ff"
                                                                            : projectDockTheme.text,
                                                                        textAlign: "left",
                                                                        fontSize: 11,
                                                                        fontWeight: 900,
                                                                        overflow: "hidden",
                                                                        textOverflow: "ellipsis",
                                                                        whiteSpace: "nowrap",
                                                                        cursor: "pointer",
                                                                    }, children: layer.name }), _jsxs("span", { style: {
                                                                        fontSize: 10,
                                                                        color: projectDockTheme.sub,
                                                                    }, children: [layer.count, " Obj."] })] }), _jsxs("div", { style: {
                                                                marginTop: 8,
                                                                display: "grid",
                                                                gridTemplateColumns: "1fr 1fr 1fr",
                                                                gap: 6,
                                                                color: projectDockTheme.sub,
                                                                fontSize: 10,
                                                            }, children: [_jsxs("span", { children: ["L", " ", _jsx("b", { style: { color: projectDockTheme.text }, children: formatNumber(layer.length) }), " ", "m"] }), _jsxs("span", { children: ["F", " ", _jsx("b", { style: { color: projectDockTheme.text }, children: formatNumber(layer.area) }), " ", "m\u00C2\u00B2"] }), _jsxs("span", { children: ["T", " ", _jsx("b", { style: { color: projectDockTheme.text }, children: layer.textCount })] })] }), texts.length ? (_jsxs("details", { style: { marginTop: 7 }, children: [_jsx("summary", { style: {
                                                                        cursor: "pointer",
                                                                        color: projectDockTheme.sub,
                                                                        fontSize: 10,
                                                                        fontWeight: 800,
                                                                    }, children: "Texte anzeigen" }), _jsx("div", { style: {
                                                                        marginTop: 6,
                                                                        maxHeight: 90,
                                                                        overflow: "auto",
                                                                        padding: 4,
                                                                        border: `1px solid ${projectDockTheme.borderSoft}`,
                                                                        borderRadius: 5,
                                                                        background: "#141a22",
                                                                        fontSize: 10,
                                                                        color: projectDockTheme.text,
                                                                        lineHeight: 1.4,
                                                                    }, children: texts.slice(0, 50).map((text, index) => (_jsx("div", { children: text }, `${layer.name}_text_${index}`))) })] })) : null, _jsxs("div", { style: {
                                                                marginTop: 9,
                                                                display: "grid",
                                                                gridTemplateColumns: "1fr 1fr",
                                                                gap: 6,
                                                            }, children: [_jsx(Btn, { onClick: () => selectLayerForTakeoff(false), style: {
                                                                        ...projectDockButtonStyle,
                                                                        width: "100%",
                                                                    }, children: "Ausw\u00C3\u00A4hlen" }), _jsx(Btn, { primary: true, onClick: () => selectLayerForTakeoff(true), style: {
                                                                        ...projectDockPrimaryButtonStyle,
                                                                        width: "100%",
                                                                    }, children: "\u00E2\u2020\u2019 Aufma\u00C3\u0178" })] })] }, layer.name));
                                            }), !layerStates.length ? (_jsx("div", { style: {
                                                    gridColumn: "1 / -1",
                                                    padding: 14,
                                                    border: `1px dashed ${projectDockTheme.border}`,
                                                    borderRadius: 7,
                                                    color: projectDockTheme.sub,
                                                    fontSize: 12,
                                                    textAlign: "center",
                                                }, children: "Keine CAD-Mengen geladen." })) : null] })) : leftTab === "lv" ? (_jsxs("div", { style: {
                                            height: "100%",
                                            minHeight: 0,
                                            display: "grid",
                                            gridTemplateColumns: "minmax(300px,1.15fr) minmax(330px,1.35fr) minmax(310px,1.15fr)",
                                            background: projectDockTheme.bg,
                                        }, children: [_jsxs("div", { style: {
                                                    minWidth: 0,
                                                    minHeight: 0,
                                                    overflowY: "auto",
                                                    borderRight: `1px solid ${projectDockTheme.border}`,
                                                    background: projectDockTheme.surface,
                                                }, children: [_jsxs("div", { style: {
                                                            position: "sticky",
                                                            top: 0,
                                                            zIndex: 1,
                                                            minHeight: 34,
                                                            padding: "0 10px",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "space-between",
                                                            gap: 8,
                                                            borderBottom: `1px solid ${projectDockTheme.border}`,
                                                            background: projectDockTheme.surface2,
                                                            color: projectDockTheme.text,
                                                            fontSize: 11,
                                                            fontWeight: 900,
                                                        }, children: [_jsx("span", { children: "Projekt-LV" }), _jsx("span", { style: { color: projectDockTheme.sub }, children: lvState === "loading"
                                                                    ? "wird geladenâ€¦"
                                                                    : `${filteredLvPositions.length} / ${lvPositions.length}` })] }), filteredLvPositions.map((position) => {
                                                        const active = selectedLvPosition?.id === position.id;
                                                        return (_jsx("button", { type: "button", onClick: () => setSelectedLvId(position.id), style: {
                                                                width: "100%",
                                                                minHeight: 52,
                                                                padding: "7px 10px",
                                                                border: 0,
                                                                borderBottom: `1px solid ${projectDockTheme.borderSoft}`,
                                                                borderLeft: active
                                                                    ? `3px solid ${projectDockTheme.accent}`
                                                                    : "3px solid transparent",
                                                                background: active
                                                                    ? projectDockTheme.accentSoft
                                                                    : projectDockTheme.surface,
                                                                color: active
                                                                    ? "#8ed8ff"
                                                                    : projectDockTheme.text,
                                                                textAlign: "left",
                                                                cursor: "pointer",
                                                            }, children: _jsxs("div", { style: {
                                                                    display: "grid",
                                                                    gridTemplateColumns: "90px minmax(0,1fr) auto",
                                                                    alignItems: "center",
                                                                    gap: 8,
                                                                    fontSize: 11,
                                                                }, children: [_jsx("b", { children: position.pos || "â€”" }), _jsx("span", { style: {
                                                                            minWidth: 0,
                                                                            overflow: "hidden",
                                                                            textOverflow: "ellipsis",
                                                                            whiteSpace: "nowrap",
                                                                            fontWeight: 800,
                                                                        }, children: position.text }), _jsxs("span", { style: { color: projectDockTheme.sub }, children: [formatNumber(position.quantity), " ", position.unit] })] }) }, position.id));
                                                    }), lvState === "error" ? (_jsx("div", { style: {
                                                            padding: 12,
                                                            color: "#ff8b82",
                                                            fontSize: 11,
                                                        }, children: "Projekt-LV konnte nicht geladen werden." })) : null, lvState === "ok" && !filteredLvPositions.length ? (_jsx("div", { style: {
                                                            padding: 12,
                                                            color: projectDockTheme.sub,
                                                            fontSize: 11,
                                                        }, children: "Keine passende LV-Position gefunden." })) : null] }), _jsxs("div", { style: {
                                                    minWidth: 0,
                                                    minHeight: 0,
                                                    padding: 12,
                                                    overflowY: "auto",
                                                    borderRight: `1px solid ${projectDockTheme.border}`,
                                                    background: projectDockTheme.bg,
                                                    color: projectDockTheme.text,
                                                }, children: [_jsxs("div", { style: {
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "space-between",
                                                            gap: 10,
                                                        }, children: [_jsx("div", { style: {
                                                                    fontSize: 11,
                                                                    fontWeight: 950,
                                                                    color: projectDockTheme.sub,
                                                                }, children: "ZIELPOSITION" }), selectedLvPosition ? (_jsx("span", { style: {
                                                                    display: "inline-flex",
                                                                    alignItems: "center",
                                                                    minHeight: 24,
                                                                    padding: "0 9px",
                                                                    border: "1px solid #276d9a",
                                                                    borderRadius: 999,
                                                                    background: projectDockTheme.accentSoft,
                                                                    color: "#8ed8ff",
                                                                    fontSize: 10,
                                                                    fontWeight: 900,
                                                                }, children: selectedLvPosition.pos })) : null] }), selectedLvPosition ? (_jsxs(_Fragment, { children: [_jsx("div", { style: {
                                                                    marginTop: 8,
                                                                    fontSize: 13,
                                                                    fontWeight: 950,
                                                                    color: projectDockTheme.text,
                                                                }, children: selectedLvPosition.text }), selectedLvPosition.longText &&
                                                                selectedLvPosition.longText !==
                                                                    selectedLvPosition.text ? (_jsx("div", { style: {
                                                                    marginTop: 5,
                                                                    maxHeight: 62,
                                                                    overflowY: "auto",
                                                                    color: projectDockTheme.sub,
                                                                    fontSize: 10,
                                                                    lineHeight: 1.4,
                                                                }, children: selectedLvPosition.longText })) : null, _jsx("div", { style: {
                                                                    marginTop: 10,
                                                                    display: "grid",
                                                                    gridTemplateColumns: "repeat(3,1fr)",
                                                                    gap: 6,
                                                                }, children: [
                                                                    [
                                                                        "Soll",
                                                                        `${formatNumber(selectedLvPosition.quantity)} ${selectedLvPosition.unit}`,
                                                                    ],
                                                                    [
                                                                        "EP",
                                                                        `${formatNumber(selectedLvPosition.ep, 2)} â‚¬`,
                                                                    ],
                                                                    [
                                                                        "CAD-Auswahl",
                                                                        `${selectedFeatures.length} Obj.`,
                                                                    ],
                                                                ].map(([label, value]) => (_jsxs("div", { style: {
                                                                        padding: "7px 8px",
                                                                        border: `1px solid ${projectDockTheme.borderSoft}`,
                                                                        borderRadius: 6,
                                                                        background: projectDockTheme.surface,
                                                                    }, children: [_jsx("div", { style: {
                                                                                color: projectDockTheme.sub,
                                                                                fontSize: 7.5,
                                                                            }, children: label }), _jsx("div", { style: {
                                                                                marginTop: 2,
                                                                                color: projectDockTheme.text,
                                                                                fontSize: 11,
                                                                                fontWeight: 900,
                                                                            }, children: value })] }, label))) }), _jsxs("div", { style: {
                                                                    marginTop: 8,
                                                                    display: "grid",
                                                                    gridTemplateColumns: "1fr 1fr 1fr",
                                                                    gap: 6,
                                                                    color: projectDockTheme.sub,
                                                                    fontSize: 10,
                                                                }, children: [_jsxs("span", { children: ["L", " ", _jsx("b", { style: { color: projectDockTheme.text }, children: formatNumber(rlcTakeoffLength) }), " ", "m"] }), _jsxs("span", { children: ["F", " ", _jsx("b", { style: { color: projectDockTheme.text }, children: formatNumber(rlcTakeoffArea) }), " ", "m\u00C2\u00B2"] }), _jsxs("span", { children: ["Ziel", " ", _jsx("b", { style: { color: "#75d0ff" }, children: formatNumber(selectedCadQty) }), " ", uiUnitLabel(selectedLvUnit)] })] })] })) : (_jsx("div", { style: {
                                                            marginTop: 12,
                                                            color: projectDockTheme.sub,
                                                            fontSize: 11,
                                                        }, children: "Links eine Position aus dem Projekt-LV w\u00C3\u00A4hlen." }))] }), _jsxs("div", { style: {
                                                    minWidth: 0,
                                                    minHeight: 0,
                                                    padding: 12,
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    background: projectDockTheme.surface,
                                                    color: projectDockTheme.text,
                                                }, children: [_jsxs("div", { style: {
                                                            display: "flex",
                                                            justifyContent: "space-between",
                                                            alignItems: "center",
                                                            gap: 8,
                                                        }, children: [_jsx("div", { style: {
                                                                    fontSize: 11,
                                                                    fontWeight: 950,
                                                                    color: projectDockTheme.sub,
                                                                }, children: "AUFMASS DER POSITION" }), _jsx("button", { type: "button", onClick: () => void loadPositionAufmass(), disabled: !selectedLvPosition, style: {
                                                                    border: 0,
                                                                    background: "transparent",
                                                                    color: selectedLvPosition
                                                                        ? "#75d0ff"
                                                                        : projectDockTheme.muted,
                                                                    fontSize: 10,
                                                                    fontWeight: 900,
                                                                    cursor: selectedLvPosition
                                                                        ? "pointer"
                                                                        : "default",
                                                                }, children: "Aktualisieren" })] }), _jsxs("div", { style: {
                                                            marginTop: 7,
                                                            display: "grid",
                                                            gridTemplateColumns: "1fr 1fr",
                                                            gap: 6,
                                                        }, children: [_jsxs("div", { style: {
                                                                    padding: "7px 8px",
                                                                    border: "1px solid rgba(98,216,158,.25)",
                                                                    borderRadius: 6,
                                                                    background: projectDockTheme.successSoft,
                                                                    color: projectDockTheme.success,
                                                                }, children: [_jsx("div", { style: { fontSize: 9 }, children: "Bisheriges Ist" }), _jsxs("div", { style: {
                                                                            marginTop: 2,
                                                                            fontSize: 12,
                                                                            fontWeight: 950,
                                                                        }, children: [formatNumber(positionAufmassQty), " ", uiUnitLabel(selectedLvUnit)] })] }), _jsxs("div", { style: {
                                                                    padding: "7px 8px",
                                                                    border: "1px solid rgba(117,208,255,.25)",
                                                                    borderRadius: 6,
                                                                    background: projectDockTheme.accentSoft,
                                                                    color: "#8ed8ff",
                                                                }, children: [_jsx("div", { style: { fontSize: 9 }, children: "Nach Zuordnung" }), _jsxs("div", { style: {
                                                                            marginTop: 2,
                                                                            fontSize: 12,
                                                                            fontWeight: 950,
                                                                        }, children: [formatNumber(positionAufmassQty + selectedCadQty), " ", uiUnitLabel(selectedLvUnit)] })] })] }), _jsxs("div", { style: {
                                                            flex: "1 1 auto",
                                                            minHeight: 0,
                                                            marginTop: 7,
                                                            overflowY: "auto",
                                                            border: `1px solid ${projectDockTheme.borderSoft}`,
                                                            borderRadius: 6,
                                                            background: projectDockTheme.bg,
                                                        }, children: [positionAufmassRows.map((row) => (_jsxs("div", { style: {
                                                                    padding: "6px 8px",
                                                                    borderBottom: `1px solid ${projectDockTheme.borderSoft}`,
                                                                    display: "grid",
                                                                    gridTemplateColumns: "minmax(0,1fr) auto",
                                                                    gap: 8,
                                                                    color: projectDockTheme.text,
                                                                    fontSize: 10,
                                                                }, children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: {
                                                                                    overflow: "hidden",
                                                                                    textOverflow: "ellipsis",
                                                                                    whiteSpace: "nowrap",
                                                                                    color: projectDockTheme.text,
                                                                                    fontWeight: 800,
                                                                                }, children: row.location || row.text || row.source }), row.formula ? (_jsx("div", { style: {
                                                                                    marginTop: 2,
                                                                                    overflow: "hidden",
                                                                                    textOverflow: "ellipsis",
                                                                                    whiteSpace: "nowrap",
                                                                                    color: projectDockTheme.sub,
                                                                                }, children: row.formula })) : null] }), _jsxs("b", { children: [formatNumber(row.qty), " ", row.unit || selectedLvPosition?.unit] })] }, row.id))), positionAufmassState === "loading" ? (_jsx("div", { style: {
                                                                    padding: 9,
                                                                    color: projectDockTheme.sub,
                                                                    fontSize: 10,
                                                                }, children: "Aufma\u00C3\u0178 wird geladen\u00E2\u20AC\u00A6" })) : positionAufmassState === "error" ? (_jsx("div", { style: {
                                                                    padding: 9,
                                                                    color: "#ff8b82",
                                                                    fontSize: 10,
                                                                }, children: "Aufma\u00C3\u0178 konnte nicht geladen werden." })) : !positionAufmassRows.length ? (_jsx("div", { style: {
                                                                    padding: 9,
                                                                    color: projectDockTheme.sub,
                                                                    fontSize: 10,
                                                                }, children: "F\u00C3\u00BCr diese Position ist noch kein Aufma\u00C3\u0178 vorhanden." })) : null] }), _jsx(Btn, { primary: true, onClick: () => void assignSelectionToLvPosition(), disabled: !selectedLvPosition || !selectedFeatures.length, style: {
                                                            ...projectDockPrimaryButtonStyle,
                                                            marginTop: 7,
                                                            width: "100%",
                                                            height: 34,
                                                        }, children: "Position zuordnen" })] })] })) : (_jsxs("div", { style: {
                                            height: "100%",
                                            minHeight: 0,
                                            display: "grid",
                                            gridTemplateColumns: "280px minmax(0, 1fr)",
                                            background: projectDockTheme.bg,
                                        }, children: [_jsxs("div", { style: {
                                                    minHeight: 0,
                                                    overflowY: "auto",
                                                    padding: 10,
                                                    borderRight: `1px solid ${projectDockTheme.border}`,
                                                    background: projectDockTheme.surface,
                                                }, children: [_jsx("div", { style: {
                                                            marginBottom: 8,
                                                            fontSize: 10,
                                                            fontWeight: 950,
                                                            letterSpacing: ".04em",
                                                            color: projectDockTheme.sub,
                                                        }, children: "PUNKTE UND DARSTELLUNG" }), _jsxs("div", { style: {
                                                            display: "grid",
                                                            gridTemplateColumns: "1fr 1fr",
                                                            gap: 6,
                                                        }, children: [_jsx(Btn, { onClick: openPointFile, primary: true, style: {
                                                                    ...projectDockPrimaryButtonStyle,
                                                                    gridColumn: "1 / -1",
                                                                    width: "100%",
                                                                }, children: "Punktdatei \u00C3\u00B6ffnen" }), _jsx(Btn, { onClick: () => void loadUtm(), style: {
                                                                    ...projectDockButtonStyle,
                                                                    width: "100%",
                                                                }, children: "Vom Server laden" }), _jsx(Btn, { onClick: () => setShowUtmLabels((value) => !value), style: {
                                                                    ...projectDockButtonStyle,
                                                                    width: "100%",
                                                                }, children: showUtmLabels
                                                                    ? "Texte ausblenden"
                                                                    : "Texte einblenden" })] }), _jsxs("div", { style: {
                                                            marginTop: 10,
                                                            display: "grid",
                                                            gridTemplateColumns: "minmax(0,1fr) 78px",
                                                            gap: 6,
                                                        }, children: [_jsxs("select", { value: utmSymbol, onChange: (event) => setUtmSymbol(event.target.value), style: {
                                                                    ...projectDockInputStyle,
                                                                    width: "100%",
                                                                    padding: "0 9px",
                                                                    fontSize: 11,
                                                                }, children: [_jsx("option", { value: "crossCircle", children: "X + Kreis" }), _jsx("option", { value: "cross", children: "X" }), _jsx("option", { value: "circle", children: "Kreis" })] }), _jsx("input", { type: "number", min: "0.5", max: "3", step: "0.25", value: utmSymbolSize, onChange: (event) => setUtmSymbolSize(Math.max(0.5, Math.min(3, Number(event.target.value) || 1))), title: "Symbolgr\u00C3\u00B6\u00C3\u0178e", style: {
                                                                    ...projectDockInputStyle,
                                                                    width: "100%",
                                                                    padding: "0 9px",
                                                                    fontSize: 11,
                                                                } })] })] }), _jsxs("div", { style: {
                                                    minWidth: 0,
                                                    minHeight: 0,
                                                    overflowY: "auto",
                                                    padding: 10,
                                                    display: "grid",
                                                    gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))",
                                                    gap: 7,
                                                    alignContent: "start",
                                                    background: projectDockTheme.bg,
                                                }, children: [utmPoints.map((point) => (_jsxs("div", { style: {
                                                            minWidth: 0,
                                                            padding: "9px 10px",
                                                            border: `1px solid ${projectDockTheme.borderSoft}`,
                                                            borderRadius: 6,
                                                            background: projectDockTheme.surface,
                                                            boxShadow: "inset 0 1px 0 rgba(255,255,255,.025)",
                                                        }, children: [_jsx("div", { style: {
                                                                    fontSize: 12,
                                                                    fontWeight: 900,
                                                                    color: projectDockTheme.text,
                                                                }, children: point.id }), _jsxs("div", { style: {
                                                                    marginTop: 4,
                                                                    fontSize: 10,
                                                                    color: projectDockTheme.sub,
                                                                }, children: ["E ", formatNumber(point.x), " \u00C2\u00B7 N", " ", formatNumber(point.y)] }), _jsxs("div", { style: {
                                                                    marginTop: 2,
                                                                    fontSize: 10,
                                                                    color: projectDockTheme.sub,
                                                                }, children: ["H", " ", Number.isFinite(point.height)
                                                                        ? formatNumber(Number(point.height))
                                                                        : "â€”", point.code ? ` Â· Code ${point.code}` : ""] })] }, point.id))), !utmPoints.length ? (_jsx("div", { style: {
                                                            gridColumn: "1 / -1",
                                                            padding: 16,
                                                            border: `1px dashed ${projectDockTheme.border}`,
                                                            borderRadius: 7,
                                                            color: projectDockTheme.sub,
                                                            fontSize: 12,
                                                            lineHeight: 1.5,
                                                            textAlign: "center",
                                                        }, children: "Keine UTM-Punkte geladen." })) : null] })] })) })] })) : null }), _jsxs(Card, { title: "RLC CAD \u00C2\u00B7 Zeichenbereich", subtitle: "RLC Geometry \u00C2\u00B7 Projektdatei cad.json", tone: "cadDark", style: {
                            gridArea: "cad",
                            minWidth: 0,
                            height: "100%",
                            border: 0,
                            borderRadius: 0,
                            boxShadow: "none",
                        }, action: _jsx("div", { style: { display: "flex", gap: 6 }, children: _jsx(Badge, { tone: features.length ? "success" : "warning", children: features.length ? "CAD geladen" : "Keine CAD-Daten" }) }), children: [_jsxs("div", { style: {
                                    display: "none",
                                    minHeight: 48,
                                    padding: "6px 8px",
                                    borderBottom: `1px solid ${ui.border}`,
                                    alignItems: "center",
                                    gap: 6,
                                    flexWrap: "wrap",
                                    background: ui.panel2,
                                }, children: [_jsx(Btn, { active: tool === "select", onClick: () => activateTool("select"), children: "Auswahl" }), _jsx(Btn, { active: tool === "pan", onClick: () => activateTool("pan"), children: "Ansicht" }), _jsx(Btn, { active: tool === "move", onClick: () => activateTool("move"), children: "Objekt verschieben" }), _jsx(Btn, { onClick: deleteSelection, disabled: !selectedFeatureIds.length, title: "Entf", children: "L\u00C3\u00B6schen" }), _jsx(IconBtn, { onClick: undoDrawing, disabled: !canUndo, title: "R\u00C3\u00BCckg\u00C3\u00A4ngig (Ctrl+Z)", children: "\u00E2\u2020\u00B6" }), _jsx(IconBtn, { onClick: redoDrawing, disabled: !canRedo, title: "Wiederholen (Ctrl+Y)", children: "\u00E2\u2020\u00B7" }), _jsx(Btn, { active: tool === "distance", onClick: () => {
                                            setMeasurePts([]);
                                            activateTool("distance");
                                        }, children: "Strecke" }), _jsx(Btn, { active: tool === "area", onClick: () => {
                                            setMeasurePts([]);
                                            activateTool("area");
                                        }, children: "Fl\u00C3\u00A4che" }), _jsx(Btn, { active: tool === "point", onClick: () => {
                                            setMeasurePts([]);
                                            activateTool("point");
                                        }, children: "Punkt" }), _jsx("span", { style: {
                                            width: 1,
                                            height: 28,
                                            background: ui.border,
                                            margin: "0 2px",
                                        } }), _jsx(IconBtn, { onClick: () => zoomAt(0.8), title: "Vergr\u00C3\u00B6\u00C3\u0178ern", children: "+" }), _jsx(IconBtn, { onClick: () => zoomAt(1.25), title: "Verkleinern", children: "\u00E2\u02C6\u2019" }), _jsx(Btn, { onClick: fitDrawing, children: "Alles anzeigen" }), _jsx(Btn, { onClick: zoomToSelection, disabled: !selectedFeature, children: "Auswahl zoomen" }), _jsx("span", { style: {
                                            width: 1,
                                            height: 28,
                                            background: ui.border,
                                            margin: "0 2px",
                                        } }), _jsx(Btn, { active: showGrid, onClick: () => setShowGrid((v) => !v), children: "Raster" }), _jsx(Btn, { active: showLabels, onClick: () => setShowLabels((v) => !v), children: "Beschriftung" }), _jsx(Btn, { active: showVertices, onClick: () => setShowVertices((v) => !v), children: "Punkte" }), _jsx(Btn, { active: showUtm, onClick: () => setShowUtm((v) => !v), children: "UTM" }), _jsx(Btn, { active: snapEnabled, onClick: toggleSnap, children: "Snap" }), _jsx(Btn, { onClick: () => setMeasurePts([]), children: "Messung l\u00C3\u00B6schen" })] }), _jsxs("div", { ref: cadViewportRef, style: {
                                    position: "relative",
                                    height: "calc(100% - 38px)",
                                    minHeight: 0,
                                    background: ui.cadBg,
                                    overflow: "hidden",
                                    marginRight: editingPanelWidth,
                                    overscrollBehavior: "contain",
                                }, children: [_jsx("div", { "data-cad-control": "true", style: {
                                            position: "absolute",
                                            zIndex: 7,
                                            left: 0,
                                            right: 0,
                                            top: 0,
                                            height: 92,
                                            padding: "6px 8px",
                                            boxSizing: "border-box",
                                            borderBottom: "1px solid #394553",
                                            background: "linear-gradient(180deg,#151c25 0%,#0b1119 100%)",
                                            boxShadow: "0 7px 16px rgba(0,0,0,.30)",
                                            overflow: "hidden",
                                        }, children: _jsxs("div", { style: {
                                                display: "grid",
                                                gridTemplateRows: "29px 29px",
                                                rowGap: 14,
                                            }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 0 }, children: [_jsxs(CadToolbarGroup, { label: "Datei", children: [_jsx(CadToolButton, { icon: "rlcPanel", title: "RLC Panel", active: rightTab === "rlc", onClick: () => setRightTab("rlc") }), _jsx(CadToolButton, { icon: "newLayer", title: "Layerverwaltung \u00C3\u00B6ffnen", active: rightTab === "layers", onClick: () => setRightTab("layers") }), _jsxs("div", { ref: activeLayerMenuRef, "data-cad-control": "true", style: {
                                                                        position: "relative",
                                                                        height: 29,
                                                                        minWidth: 248,
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        gap: 0,
                                                                        marginLeft: 1,
                                                                        color: "#c9d2dc",
                                                                    }, children: [_jsxs("button", { type: "button", onClick: () => {
                                                                                const rect = activeLayerMenuRef.current?.getBoundingClientRect();
                                                                                if (rect) {
                                                                                    const popupWidth = 320;
                                                                                    const safeLeft = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - popupWidth - 8));
                                                                                    setActiveLayerMenuPosition({
                                                                                        left: safeLeft,
                                                                                        top: rect.bottom + 4,
                                                                                        width: popupWidth,
                                                                                    });
                                                                                }
                                                                                setActiveLayerMenuOpen((prev) => !prev);
                                                                            }, title: `Aktiver Layer: ${activeLayer}`, "aria-label": "Aktiver Layer", style: {
                                                                                width: "100%",
                                                                                height: "100%",
                                                                                display: "grid",
                                                                                gridTemplateColumns: "112px 1fr 24px",
                                                                                alignItems: "center",
                                                                                gap: 0,
                                                                                padding: 0,
                                                                                border: "1px solid #44505e",
                                                                                borderRadius: 3,
                                                                                background: "linear-gradient(180deg,#252e39 0%,#1a222c 100%)",
                                                                                overflow: "hidden",
                                                                                cursor: "pointer",
                                                                            }, children: [_jsx("span", { style: {
                                                                                        height: "100%",
                                                                                        display: "flex",
                                                                                        alignItems: "center",
                                                                                        padding: "0 10px",
                                                                                        borderRight: "1px solid #44505e",
                                                                                        fontSize: 7.5,
                                                                                        fontWeight: 850,
                                                                                        whiteSpace: "nowrap",
                                                                                        color: "#9fb0c2",
                                                                                    }, children: "Aktiver Layer" }), _jsx("span", { style: {
                                                                                        height: "100%",
                                                                                        display: "flex",
                                                                                        alignItems: "center",
                                                                                        padding: "0 10px",
                                                                                        background: "#111923",
                                                                                        color: "#eef2f6",
                                                                                        fontSize: 10,
                                                                                        fontWeight: 800,
                                                                                        overflow: "hidden",
                                                                                        textOverflow: "ellipsis",
                                                                                        whiteSpace: "nowrap",
                                                                                    }, children: activeLayer }), _jsx("span", { "aria-hidden": "true", style: {
                                                                                        height: "100%",
                                                                                        display: "flex",
                                                                                        alignItems: "center",
                                                                                        justifyContent: "center",
                                                                                        background: "#111923",
                                                                                        color: "#cbd5e1",
                                                                                        fontSize: 12,
                                                                                        borderLeft: "1px solid #44505e",
                                                                                    }, children: "\u00E2\u2013\u00BE" })] }), activeLayerMenuOpen
                                                                            ? createPortal(_jsxs("div", { ref: activeLayerPopupRef, "data-cad-control": "true", style: {
                                                                                    position: "fixed",
                                                                                    top: activeLayerMenuPosition.top,
                                                                                    left: activeLayerMenuPosition.left,
                                                                                    width: activeLayerMenuPosition.width,
                                                                                    maxHeight: Math.min(420, Math.max(180, window.innerHeight - activeLayerMenuPosition.top - 12)),
                                                                                    overflowY: "auto",
                                                                                    zIndex: 2147483000,
                                                                                    border: "1px solid #44505e",
                                                                                    borderRadius: 6,
                                                                                    background: "linear-gradient(180deg,#1b2430 0%,#111923 100%)",
                                                                                    boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
                                                                                    padding: 8,
                                                                                }, children: [_jsxs("div", { style: {
                                                                                            display: "flex",
                                                                                            alignItems: "center",
                                                                                            justifyContent: "space-between",
                                                                                            gap: 8,
                                                                                            marginBottom: 8,
                                                                                            paddingBottom: 6,
                                                                                            borderBottom: "1px solid #334155",
                                                                                        }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 10, fontWeight: 900, color: "#dbe6f2" }, children: "Layerliste" }), _jsx("div", { style: { fontSize: 10, color: "#8fa3b9" }, children: "Aktivieren, Farbe \u00C3\u00A4ndern, ein/aus" })] }), _jsx("button", { type: "button", onClick: (event) => {
                                                                                                    event.stopPropagation();
                                                                                                    createNewLayer();
                                                                                                }, style: {
                                                                                                    height: 22,
                                                                                                    padding: "0 9px",
                                                                                                    borderRadius: 4,
                                                                                                    border: "1px solid #3d4a5a",
                                                                                                    background: "#124f76",
                                                                                                    color: "#ffffff",
                                                                                                    fontSize: 11,
                                                                                                    fontWeight: 900,
                                                                                                    cursor: "pointer",
                                                                                                }, children: "+ Neu" })] }), _jsx("div", { style: { display: "grid", gap: 4 }, children: layerStates.map((layer) => {
                                                                                            const isActive = layer.name === activeLayer;
                                                                                            return (_jsxs("div", { style: {
                                                                                                    display: "grid",
                                                                                                    gridTemplateColumns: "28px 28px 1fr 58px",
                                                                                                    alignItems: "center",
                                                                                                    gap: 8,
                                                                                                    minHeight: 34,
                                                                                                    padding: "4px 6px",
                                                                                                    borderRadius: 4,
                                                                                                    border: `1px solid ${isActive ? "#2b78c5" : "#334155"}`,
                                                                                                    background: isActive ? "rgba(37, 99, 235, 0.18)" : "rgba(15, 23, 42, 0.65)",
                                                                                                }, children: [_jsx("button", { type: "button", title: layer.visible ? "Layer ausschalten" : "Layer einschalten", onClick: (event) => {
                                                                                                            event.stopPropagation();
                                                                                                            setLayerVisibility((prev) => ({
                                                                                                                ...prev,
                                                                                                                [layer.name]: !layer.visible,
                                                                                                            }));
                                                                                                        }, style: {
                                                                                                            width: 24,
                                                                                                            height: 24,
                                                                                                            borderRadius: 4,
                                                                                                            border: `1px solid ${layer.visible ? "#436381" : "#4b5563"}`,
                                                                                                            background: layer.visible ? "#0f2740" : "#111827",
                                                                                                            color: layer.visible ? "#7dd3fc" : "#6b7280",
                                                                                                            fontSize: 12,
                                                                                                            fontWeight: 900,
                                                                                                            cursor: "pointer",
                                                                                                        }, children: layer.visible ? "â—‰" : "â—‹" }), _jsx("input", { type: "color", value: layer.color || "#ffffff", title: "Layerfarbe \u00C3\u00A4ndern", onClick: (event) => event.stopPropagation(), onChange: (event) => {
                                                                                                            applyLayerColor(layer.name, event.target.value);
                                                                                                        }, style: {
                                                                                                            width: 24,
                                                                                                            height: 24,
                                                                                                            padding: 0,
                                                                                                            border: 0,
                                                                                                            background: "transparent",
                                                                                                            cursor: "pointer",
                                                                                                        } }), _jsx("button", { type: "button", onClick: () => {
                                                                                                            setActiveLayer(layer.name);
                                                                                                            setActiveLayerMenuOpen(false);
                                                                                                        }, title: `Layer aktiv setzen: ${layer.name}`, style: {
                                                                                                            minWidth: 0,
                                                                                                            textAlign: "left",
                                                                                                            border: "none",
                                                                                                            background: "transparent",
                                                                                                            color: isActive ? "#f8fbff" : "#d7e0ea",
                                                                                                            fontSize: 12,
                                                                                                            fontWeight: isActive ? 900 : 700,
                                                                                                            overflow: "hidden",
                                                                                                            textOverflow: "ellipsis",
                                                                                                            whiteSpace: "nowrap",
                                                                                                            cursor: "pointer",
                                                                                                            padding: 0,
                                                                                                        }, children: layer.name }), _jsxs("div", { style: {
                                                                                                            textAlign: "right",
                                                                                                            color: "#8fa3b9",
                                                                                                            fontSize: 10,
                                                                                                            fontWeight: 700,
                                                                                                            whiteSpace: "nowrap",
                                                                                                        }, children: [layer.count, " Obj."] })] }, layer.name));
                                                                                        }) })] }), document.body)
                                                                            : null] })] }), _jsxs(CadToolbarGroup, { label: "Verlauf", children: [_jsx(CadToolButton, { icon: "undo", title: "Zur\u00C3\u00BCck (Ctrl+Z)", disabled: !canUndo, onClick: undoDrawing }), _jsx(CadToolButton, { icon: "redo", title: "Nach vorne (Ctrl+Y)", disabled: !canRedo, onClick: redoDrawing })] }), _jsxs(CadToolbarGroup, { label: "Auswahl", children: [_jsx(CadToolButton, { icon: "select", title: "Auswahl (S)", active: tool === "select", onClick: () => activateTool("select") }), _jsx(CadToolButton, { icon: "pan", title: "Ansicht verschieben (P)", active: tool === "pan", onClick: () => activateTool("pan") }), _jsx(CadToolButton, { icon: "move", title: "Verschieben (V)", active: tool === "move", onClick: () => activateTool("move") }), _jsx(CadToolButton, { icon: "copy", title: "Kopieren (K)", active: tool === "copy", disabled: !selectedFeatureIds.length, onClick: () => activateTool("copy") }), _jsx(CadToolButton, { icon: "delete", tone: "red", title: "L\u00C3\u00B6schen (Entf)", disabled: !selectedFeatureIds.length, onClick: deleteSelection })] }), _jsxs(CadToolbarGroup, { label: "Zeichnen", children: [_jsx(CadToolButton, { icon: "line", tone: "green", title: "Linie (L)", active: tool === "line", onClick: () => activateTool("line") }), _jsx(CadToolButton, { icon: "polyline", tone: "green", title: "Polylinie (B)", active: tool === "polyline", onClick: () => activateTool("polyline") }), _jsx(CadToolButton, { icon: "rectangle", tone: "green", title: "Rechteck (R)", active: tool === "rectangle", onClick: () => activateTool("rectangle") }), _jsx(CadToolButton, { icon: "circle", tone: "green", title: "Kreis (C)", active: tool === "circle", onClick: () => activateTool("circle") }), _jsx(CadToolButton, { icon: "text", tone: "green", title: "Text (T)", active: tool === "text", onClick: () => activateTool("text") }), _jsx(CadToolButton, { icon: "hatch", tone: "green", title: "Schraffieren \u00C2\u00B7 Innenpunkt w\u00C3\u00A4hlen", active: tool === "hatch", onClick: () => {
                                                                        setPendingHatchBoundary(null);
                                                                        activateTool("hatch");
                                                                        setStatus("Schraffieren: Innenpunkt einer geschlossenen FlÃ¤che wÃ¤hlen");
                                                                    } }), _jsx(CadToolButton, { icon: "boundary", tone: "green", title: "Umgrenzungslinie \u00C2\u00B7 Innenpunkt w\u00C3\u00A4hlen", active: tool === "boundary", onClick: () => {
                                                                        activateTool("boundary");
                                                                        setStatus("Umgrenzung: Innenpunkt einer geschlossenen FlÃ¤che wÃ¤hlen");
                                                                    } })] })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 0 }, children: [_jsxs(CadToolbarGroup, { label: "Messen", children: [_jsx(CadToolButton, { icon: "distance", tone: "violet", title: "Strecke messen (M)", active: tool === "distance", onClick: () => {
                                                                        setMeasurePts([]);
                                                                        activateTool("distance");
                                                                        setStatus("Strecke messen: Startpunkt wÃ¤hlen");
                                                                    } }), _jsx(CadToolButton, { icon: "area", tone: "violet", title: "Fl\u00C3\u00A4che messen (A)", active: tool === "area", onClick: () => {
                                                                        setMeasurePts([]);
                                                                        activateTool("area");
                                                                        setStatus("FlÃ¤che messen: in eine geschlossene FlÃ¤che klicken");
                                                                    } }), _jsx(CadToolButton, { icon: "point", tone: "violet", title: "Punkt messen", active: tool === "point", onClick: () => {
                                                                        setMeasurePts([]);
                                                                        activateTool("point");
                                                                        setStatus("Punkt messen: Punkt wÃ¤hlen");
                                                                    } }), _jsx(CadToolButton, { icon: "dimLinear", tone: "violet", title: "Lineare Bema\u00C3\u0178ung", active: tool === "dimLinear", onClick: () => {
                                                                        setMeasurePts([]);
                                                                        activateTool("dimLinear");
                                                                        setStatus("Lineare BemaÃŸung: Startpunkt wÃ¤hlen");
                                                                    } }), _jsx(CadToolButton, { icon: "dimAligned", tone: "violet", title: "Ausgerichtete Bema\u00C3\u0178ung", active: tool === "dimAligned", onClick: () => {
                                                                        setMeasurePts([]);
                                                                        activateTool("dimAligned");
                                                                        setStatus("Ausgerichtete BemaÃŸung: Startpunkt wÃ¤hlen");
                                                                    } })] }), _jsxs(CadToolbarGroup, { label: "\u00C3\u201Endern", children: [_jsx(CadToolButton, { icon: "rotate", tone: "amber", title: "Drehen", active: tool === "rotate", onClick: startRotateCommand }), _jsx(CadToolButton, { icon: "scale", tone: "amber", title: "Skalieren", active: tool === "scale", onClick: startScaleCommand }), _jsx(CadToolButton, { icon: "offset", tone: "amber", title: "Versetzen", active: tool === "offset", onClick: startOffsetCommand }), _jsx(CadToolButton, { icon: "trim", tone: "amber", title: "Stutzen", active: tool === "trim", onClick: () => startModifyCommand("trim") }), _jsx(CadToolButton, { icon: "extend", tone: "amber", title: "Dehnen", active: tool === "extend", onClick: () => startModifyCommand("extend") }), _jsx(CadToolButton, { icon: "join", tone: "amber", title: "Verbinden", active: tool === "join", onClick: () => startModifyCommand("join") }), _jsx(CadToolButton, { icon: "fillet", tone: "amber", title: "Abrunden", active: tool === "fillet", onClick: () => startModifyCommand("fillet") }), _jsx(CadToolButton, { icon: "mirror", tone: "amber", title: "Spiegeln", active: tool === "mirror", onClick: () => startModifyCommand("mirror") }), _jsx(CadToolButton, { icon: "explode", tone: "amber", title: "Explodieren", active: tool === "explode", onClick: startExplodeCommand })] }), _jsxs(CadToolbarGroup, { label: "Ansicht", children: [_jsx(CadToolButton, { icon: "zoomIn", title: "Vergr\u00C3\u00B6\u00C3\u0178ern", onClick: () => zoomAt(0.8) }), _jsx(CadToolButton, { icon: "zoomOut", title: "Verkleinern", onClick: () => zoomAt(1.25) }), _jsx(CadToolButton, { icon: "fit", title: "Zeichnung einpassen (F)", onClick: fitDrawing }), _jsx(CadToolButton, { icon: "fullscreen", title: cadFullscreen ? "Vollbild schlieÃŸen" : "Vollbild Ã¶ffnen", active: cadFullscreen, onClick: () => setCadFullscreen((value) => !value) }), _jsx(CadToolButton, { icon: "grid", title: "Raster (G)", active: showGrid, onClick: () => setShowGrid((value) => !value) }), _jsx(CadToolButton, { icon: "label", title: "Beschriftung", active: showLabels, onClick: () => setShowLabels((value) => !value) }), _jsx(CadToolButton, { icon: "text", title: "DXF-Texte", active: showCadTexts, onClick: () => setShowCadTexts((value) => !value) }), _jsx(CadToolButton, { icon: "utm", title: "UTM-Punkte", active: showUtm, onClick: () => setShowUtm((value) => !value) }), _jsx(CadToolButton, { icon: "snap", title: `Objektfang F3 Â· ${snapEnabled ? "Ein" : "Aus"}`, active: snapEnabled, onClick: toggleSnap }), _jsx(CadToolButton, { icon: "ortho", title: `Ortho F8 Â· ${orthoEnabled ? "Ein" : "Aus"}`, active: orthoEnabled, onClick: toggleOrtho }), _jsx(CadToolButton, { icon: "clear", title: "Messung l\u00C3\u00B6schen", disabled: !measurePts.length, onClick: () => setMeasurePts([]) })] })] })] }) }), pendingHatchBoundary ? (_jsxs("div", { "data-cad-control": "true", style: {
                                            position: "absolute",
                                            zIndex: 19,
                                            top: 108,
                                            left: 18,
                                            width: 260,
                                            padding: 12,
                                            borderRadius: 8,
                                            border: "1px solid #526273",
                                            background: "#17212c",
                                            boxShadow: "0 14px 34px rgba(0,0,0,.45)",
                                            color: "#eef2f6",
                                        }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 900, marginBottom: 10 }, children: "Schraffurmuster" }), _jsxs("select", { value: hatchPattern, onChange: (event) => setHatchPattern(event.target.value), style: { width: "100%", height: 34, background: "#0f1720", color: "#fff", border: "1px solid #526273", borderRadius: 5, padding: "0 8px" }, children: [_jsx("option", { value: "solid", children: "Solid" }), _jsx("option", { value: "lines", children: "Linien 45\u00C2\u00B0" }), _jsx("option", { value: "cross", children: "Kreuzschraffur" }), _jsx("option", { value: "dots", children: "Punkte" })] }), _jsxs("div", { style: { display: "flex", gap: 8, marginTop: 10 }, children: [_jsx(Btn, { primary: true, onClick: commitHatch, style: { flex: 1 }, children: "Erstellen" }), _jsx(Btn, { onClick: () => { setPendingHatchBoundary(null); setTool("select"); }, style: { flex: 1 }, children: "Abbrechen" })] })] })) : null, numericCommand ? (_jsxs("div", { style: {
                                            position: "absolute",
                                            zIndex: 8,
                                            right: 10,
                                            top: 99,
                                            width: 248,
                                            padding: 10,
                                            borderRadius: 10,
                                            border: "1px solid rgba(125,211,252,.55)",
                                            background: "rgba(2,6,23,.92)",
                                            boxShadow: "0 12px 28px rgba(0,0,0,.35)",
                                            color: "#e2e8f0",
                                        }, children: [_jsx("div", { style: { marginBottom: 7, fontSize: 12, fontWeight: 900 }, children: numericCommand.kind === "rotate"
                                                    ? "Drehen â€“ Winkel Â° (optional)"
                                                    : numericCommand.kind === "scale"
                                                        ? "Skalieren â€“ Faktor"
                                                        : "Parallele / Offset â€“ Abstand m" }), _jsxs("div", { style: {
                                                    display: "grid",
                                                    gridTemplateColumns: "1fr auto auto",
                                                    gap: 6,
                                                }, children: [_jsx(Input, { autoFocus: true, value: numericCommand.value, onChange: (event) => setNumericCommand({
                                                            ...numericCommand,
                                                            value: event.target.value,
                                                        }), onKeyDown: (event) => {
                                                            if (event.key === "Enter")
                                                                applyNumericEdit();
                                                            if (event.key === "Escape")
                                                                setNumericCommand(null);
                                                        }, style: { height: 32 } }), _jsx(Btn, { primary: true, onClick: applyNumericEdit, style: { height: 32, padding: "0 10px" }, children: "OK" }), _jsx(Btn, { onClick: () => setNumericCommand(null), style: { height: 32, padding: "0 9px" }, children: "\u00C3\u2014" })] })] })) : null, tool === "text" ? (_jsxs("div", { style: {
                                            position: "absolute",
                                            zIndex: 7,
                                            right: 10,
                                            top: numericCommand ? 179 : 99,
                                            width: 290,
                                            padding: 10,
                                            borderRadius: 10,
                                            border: "1px solid rgba(255,255,255,.18)",
                                            background: "rgba(2,6,23,.9)",
                                            boxShadow: "0 12px 28px rgba(0,0,0,.3)",
                                        }, children: [_jsx("div", { style: {
                                                    marginBottom: 7,
                                                    color: "#e2e8f0",
                                                    fontSize: 11,
                                                    fontWeight: 850,
                                                }, children: textAnchor
                                                    ? "EinfÃ¼gepunkt gewÃ¤hlt"
                                                    : "EinfÃ¼gepunkt in der Zeichnung wÃ¤hlen" }), _jsxs("div", { style: { display: "grid", gap: 7 }, children: [_jsx(Input, { value: textValue, onChange: (event) => setTextValue(event.target.value), onKeyDown: (event) => {
                                                            if (event.key === "Enter")
                                                                commitText();
                                                        }, placeholder: "Text", style: { height: 32 } }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "90px 1fr auto", gap: 6 }, children: [_jsx(Input, { value: textHeight, onChange: (event) => setTextHeight(event.target.value), placeholder: "H\u00C3\u00B6he", title: "Texth\u00C3\u00B6he", style: { height: 32 } }), _jsxs(Select, { value: textFont, onChange: (event) => setTextFont(event.target.value), style: { height: 32 }, children: [_jsx("option", { value: "Arial Narrow", children: "Arial Narrow" }), _jsx("option", { value: "Arial", children: "Arial" }), _jsx("option", { value: "Roboto Condensed", children: "Roboto Condensed" }), _jsx("option", { value: "monospace", children: "Monospace" }), _jsx("option", { value: "serif", children: "Serif" })] }), _jsx(Btn, { primary: true, onClick: commitText, disabled: !textAnchor || !textValue.trim(), style: { height: 32, padding: "0 10px" }, children: "Setzen" })] })] })] })) : null, !features.length && !utmPoints.length ? (_jsx("div", { style: {
                                            position: "absolute",
                                            inset: 0,
                                            display: "grid",
                                            placeItems: "center",
                                            color: "#cbd5e1",
                                            textAlign: "center",
                                            padding: 30,
                                            zIndex: 2,
                                            pointerEvents: "none",
                                        }, children: _jsxs("div", { children: [_jsx("div", { style: { fontSize: 18, fontWeight: 950 }, children: "Keine Zeichnung geladen" }), _jsxs("div", { style: {
                                                        marginTop: 8,
                                                        fontSize: 13,
                                                        color: "#94a3b8",
                                                        lineHeight: 1.5,
                                                    }, children: ["Projekt \u00C3\u00B6ffnen oder \u00E2\u20AC\u017ECAD-Datei \u00C3\u00B6ffnen\u00E2\u20AC\u0153 w\u00C3\u00A4hlen.", _jsx("br", {}), "DXF wird direkt in RLC Geometry umgewandelt."] })] }) })) : null, cadContextMenu ? (_jsx("div", { style: {
                                            position: "fixed", left: cadContextMenu.x, top: cadContextMenu.y, zIndex: 100000,
                                            width: 210, padding: 4, borderRadius: 8, background: "#202833",
                                            border: "1px solid #526174", boxShadow: "0 12px 32px rgba(0,0,0,.42)",
                                            color: "white", fontSize: 13
                                        }, onPointerDown: (event) => event.stopPropagation(), children: [
                                            ["Esc Â· Befehl abbrechen", () => { cancelCurrentCommand(); setTool("select"); }],
                                            ["Auswahl lÃ¶schen", deleteSelection],
                                            ["RÃ¼ckgÃ¤ngig", undoDrawing],
                                            ["Wiederholen", redoDrawing],
                                            [`F3 Objektfang: ${snapEnabled ? "EIN" : "AUS"}`, toggleSnap],
                                            [`F8 Ortho: ${orthoEnabled ? "EIN" : "AUS"}`, toggleOrtho],
                                            ["Zeichnung einpassen", fitDrawing],
                                        ].map(([label, action]) => (_jsx("button", { type: "button", onClick: () => { action(); setCadContextMenu(null); }, style: { width: "100%", border: 0, borderRadius: 5, background: "transparent", color: "white", padding: "8px 10px", textAlign: "left", cursor: "pointer" }, children: label }, label))) })) : null, _jsx("div", { ref: geoMapHostRef, style: {
                                            position: "absolute",
                                            left: 0,
                                            right: 0,
                                            top: 50,
                                            bottom: 0,
                                            display: geoLayers.osm ? "block" : "none",
                                            zIndex: 0,
                                            background: ui.cadBg,
                                            pointerEvents: "none",
                                        } }), _jsxs("div", { "aria-hidden": "true", style: {
                                            position: "absolute",
                                            left: 0,
                                            right: 0,
                                            top: 50,
                                            bottom: 0,
                                            display: hasBayernWmsLayers ? "block" : "none",
                                            overflow: "hidden",
                                            zIndex: 1,
                                            background: geoLayers.osm ? "transparent" : ui.cadBg,
                                            pointerEvents: "none",
                                        }, children: [geoLayers.aerial ? (_jsx(GeoWmsImageLayer, { requestUrl: aerialWmsUrl, requestBounds: geoRequestProjectedBounds, currentBounds: geoProjectedBounds, width: geoViewportSize.width, height: geoViewportSize.height, opacity: geoLayers.osm ? 0.78 : 1, zIndex: 1 })) : null, geoLayers.parcels ? (_jsx(GeoWmsImageLayer, { requestUrl: parcelsWmsUrl, requestBounds: geoRequestProjectedBounds, currentBounds: geoProjectedBounds, width: geoViewportSize.width, height: geoViewportSize.height, opacity: 0.96, zIndex: 2 })) : null, geoLayers.borders ? (_jsx(GeoWmsImageLayer, { requestUrl: bordersWmsUrl, requestBounds: geoRequestProjectedBounds, currentBounds: geoProjectedBounds, width: geoViewportSize.width, height: geoViewportSize.height, opacity: 0.98, zIndex: 3 })) : null] }), _jsxs("svg", { ref: svgRef, viewBox: `${renderViewBox.x} ${renderViewBox.y} ${renderViewBox.width} ${renderViewBox.height}`, preserveAspectRatio: "xMidYMid meet", shapeRendering: "geometricPrecision", onPointerDown: (event) => { setCadContextMenu(null); onPointerDown(event); }, onPointerMove: onPointerMove, onPointerUp: onPointerUp, onAuxClick: (event) => event.preventDefault(), onContextMenu: (event) => {
                                            event.preventDefault();
                                            if (tool === "select" && !event.shiftKey) {
                                                setCadContextMenu(null);
                                                repeatLastCadCommand();
                                                return;
                                            }
                                            if (tool === "rotate") {
                                                setCadContextMenu(null);
                                                if (rotateSession.phase === "confirm-base" && rotateSession.base) {
                                                    const referencePoint = cursorWorld || {
                                                        x: rotateSession.base.x + 1,
                                                        y: rotateSession.base.y,
                                                    };
                                                    const referenceAngle = Math.atan2(referencePoint.y - rotateSession.base.y, referencePoint.x - rotateSession.base.x);
                                                    setRotateSession({
                                                        phase: "live",
                                                        base: rotateSession.base,
                                                        referenceAngle,
                                                        angle: 0,
                                                        original: cloneCadFeatures(features),
                                                    });
                                                    setNumericCommand({ kind: "rotate", value: "0" });
                                                    setStatus("Drehen LIVE Â· Maus bewegen Â· Linksklick bestÃ¤tigt Â· Winkel optional");
                                                    return;
                                                }
                                                if (rotateSession.phase === "live") {
                                                    setStatus("Drehen LIVE Â· Linksklick bestÃ¤tigt oder Winkel eingeben");
                                                    return;
                                                }
                                                setStatus("Drehen: zuerst Drehpunkt anklicken");
                                                return;
                                            }
                                            if (tool === "scale") {
                                                setCadContextMenu(null);
                                                if (scaleSession.phase === "confirm-base" && scaleSession.base) {
                                                    const selectionCenter = centerOfFeatures(selectedFeatures);
                                                    const referenceDistance = Math.max(Math.hypot(selectionCenter.x - scaleSession.base.x, selectionCenter.y - scaleSession.base.y), Math.max(viewBox.width, viewBox.height) * 0.005, 1e-6);
                                                    setScaleSession({
                                                        phase: "live",
                                                        base: scaleSession.base,
                                                        referenceDistance,
                                                        factor: 1,
                                                        original: cloneCadFeatures(features),
                                                    });
                                                    setNumericCommand({ kind: "scale", value: "1,000" });
                                                    setStatus("Skalieren LIVE Â· Maus bewegen Â· Linksklick bestÃ¤tigt Â· Faktor optional");
                                                    return;
                                                }
                                                if (scaleSession.phase === "live") {
                                                    setStatus("Skalieren LIVE Â· Linksklick bestÃ¤tigt oder Faktor eingeben");
                                                    return;
                                                }
                                                setStatus("Skalieren: zuerst Basispunkt anklicken");
                                                return;
                                            }
                                            if (tool === "mirror") {
                                                setCadContextMenu(null);
                                                if (mirrorPhase === "confirm-selection") {
                                                    if (!selectedFeatureIds.length) {
                                                        setStatus("Spiegeln: keine Auswahl vorhanden");
                                                        setTool("select");
                                                        setMirrorPhase("idle");
                                                        return;
                                                    }
                                                    setMirrorPhase("pick-point");
                                                    setStatus("Spiegeln Â· Punkt anklicken, an dem gespiegelt wird");
                                                    return;
                                                }
                                                if (mirrorPhase === "confirm-point") {
                                                    void finishMirrorAtPoint();
                                                    return;
                                                }
                                                setStatus("Spiegeln: zuerst Spiegelpunkt anklicken");
                                                return;
                                            }
                                            if (tool === "trim" || tool === "extend") {
                                                setCadContextMenu(null);
                                                if (!modifyPickIds[0]) {
                                                    setStatus(tool === "trim"
                                                        ? "Stutzen: keine Schneidkante gewÃ¤hlt"
                                                        : "Dehnen: keine Grenzkante gewÃ¤hlt");
                                                    completeModifyCommand();
                                                    return;
                                                }
                                                setStatus(tool === "trim" ? "Stutzen beendet" : "Dehnen beendet");
                                                completeModifyCommand();
                                                return;
                                            }
                                            if (tool === "area") {
                                                setCadContextMenu(null);
                                                void confirmClosedAreaMeasurement();
                                                return;
                                            }
                                            if ((tool === "dimLinear" || tool === "dimAligned") &&
                                                dimensionDraft) {
                                                setCadContextMenu(null);
                                                if (!dimensionDraft.placing) {
                                                    setDimensionDraft({
                                                        ...dimensionDraft,
                                                        placing: true,
                                                    });
                                                    setStatus("BemaÃŸung LIVE Â· Linie bewegen Â· Linksklick bestÃ¤tigt");
                                                }
                                                return;
                                            }
                                            if (tool === "polyline") {
                                                if (draftPts.length >= 2) {
                                                    finishPolyline(false);
                                                    setStatus("Polylinie am letzten bestÃ¤tigten Punkt beendet Â· Rechtsklick wiederholt");
                                                }
                                                else {
                                                    setDraftPts([]);
                                                    setStatus("Polylinie abgebrochen Â· Rechtsklick wiederholt");
                                                }
                                                setTool("select");
                                                setCadContextMenu(null);
                                                return;
                                            }
                                            if (tool !== "select") {
                                                const finishedCommand = tool;
                                                cancelCurrentCommand();
                                                setTool("select");
                                                setCadContextMenu(null);
                                                setStatus(`${finishedCommand} beendet Â· Rechtsklick wiederholt den Befehl`);
                                                return;
                                            }
                                            setCadContextMenu({ x: event.clientX, y: event.clientY });
                                        }, onPointerLeave: () => {
                                            if (!vertexDrag && !objectDrag) {
                                                setDragStart(null);
                                                setCursorWorld(null);
                                                setActiveSnap(null);
                                                if (smoothSelectCursorRef.current) {
                                                    smoothSelectCursorRef.current.style.visibility = "hidden";
                                                }
                                                pendingPointerMoveRef.current = null;
                                                if (pointerMoveFrameRef.current !== null) {
                                                    cancelAnimationFrame(pointerMoveFrameRef.current);
                                                    pointerMoveFrameRef.current = null;
                                                }
                                            }
                                        }, onDoubleClick: () => {
                                            if (tool === "polyline") {
                                                finishPolyline(false);
                                            }
                                            else if (tool === "area" && measurePts.length >= 3) {
                                                setTool("select");
                                            }
                                        }, style: {
                                            width: "100%",
                                            height: "calc(100% - 50px)",
                                            marginTop: 50,
                                            display: "block",
                                            background: hasGeoLayers ? "transparent" : ui.cadBg,
                                            position: "relative",
                                            zIndex: 2,
                                            cursor: tool === "pan"
                                                ? dragStart
                                                    ? "grabbing"
                                                    : "grab"
                                                : tool === "select"
                                                    ? "crosshair"
                                                    : ["line", "polyline", "rectangle", "circle", "text", "hatch", "boundary", "distance", "area", "point", "dimLinear", "dimAligned", "rotate", "scale"].includes(tool)
                                                        ? "crosshair"
                                                        : "default",
                                            touchAction: "none",
                                            userSelect: "none",
                                        }, children: [_jsxs("defs", { children: [_jsx("pattern", { id: "rlcHatchLines", width: "8", height: "8", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)", children: _jsx("line", { x1: "0", y1: "0", x2: "0", y2: "8", stroke: "#94a3b8", strokeWidth: "1" }) }), _jsx("pattern", { id: "rlcHatchCross", width: "8", height: "8", patternUnits: "userSpaceOnUse", children: _jsx("path", { d: "M0 0L8 8M8 0L0 8", stroke: "#94a3b8", strokeWidth: "0.8" }) }), _jsx("pattern", { id: "rlcHatchDots", width: "7", height: "7", patternUnits: "userSpaceOnUse", children: _jsx("circle", { cx: "3.5", cy: "3.5", r: "1", fill: "#94a3b8" }) }), _jsx("pattern", { id: "smallGrid", width: Math.max(viewBox.width / 40, 0.001), height: Math.max(viewBox.width / 40, 0.001), patternUnits: "userSpaceOnUse", children: _jsx("path", { d: `M ${Math.max(viewBox.width / 40, 0.001)} 0 L 0 0 0 ${Math.max(viewBox.width / 40, 0.001)}`, fill: "none", stroke: "#4b6078", strokeWidth: strokeWidth * 0.42, opacity: 0.92 }) })] }), _jsx("rect", { x: renderViewBox.x, y: renderViewBox.y, width: renderViewBox.width, height: renderViewBox.height, fill: hasGeoLayers ? "transparent" : ui.cadBg, pointerEvents: "none" }), showGrid ? (_jsx("rect", { x: renderViewBox.x, y: renderViewBox.y, width: renderViewBox.width, height: renderViewBox.height, fill: "url(#smallGrid)", pointerEvents: "none" })) : null, interactiveViewportFeatures.map((f) => {
                                                const pts = Array.isArray(f.pts) ? f.pts : [];
                                                if (!pts.length)
                                                    return null;
                                                const canvasPts = pts.map(toRenderPoint);
                                                const id = String(f.id || "");
                                                const active = selectedFeatureIds.includes(id);
                                                const color = featureColor(f);
                                                const kind = String(f.kind || "").toLowerCase();
                                                const lineWidth = featureStrokeWidth(f, active);
                                                const globalWidth = featureGlobalWidth(f);
                                                const renderedLineWidth = globalWidth > 0
                                                    ? active
                                                        ? Math.max(globalWidth, cadWorldPerPixel * 2.4)
                                                        : globalWidth
                                                    : lineWidth;
                                                const lineVectorEffect = globalWidth > 0 ? undefined : "non-scaling-stroke";
                                                const dashArray = featureDashArray(f);
                                                const opacity = featureOpacity(f);
                                                const pointsAttr = canvasPts
                                                    .map((point) => `${point.x},${point.y}`)
                                                    .join(" ");
                                                const featureMeta = (f.meta || {});
                                                const isHatch = featureMeta.generatedBy === "hatch";
                                                const hatchFill = typeof featureMeta.hatchFill === "string"
                                                    ? featureMeta.hatchFill
                                                    : `${color}22`;
                                                const isClosed = Boolean(f.closed || kind === "polygon" || isHatch);
                                                const textMeta = featureMeta;
                                                const attachmentPoint = Math.trunc(Number(textMeta.attachmentPoint || 0));
                                                const horizontalJustification = Math.trunc(Number(textMeta.horizontalJustification || 0));
                                                const verticalJustification = Math.trunc(Number(textMeta.verticalJustification || 0));
                                                const dxfTextAnchor = attachmentPoint > 0
                                                    ? attachmentPoint % 3 === 2
                                                        ? "middle"
                                                        : attachmentPoint % 3 === 0
                                                            ? "end"
                                                            : "start"
                                                    : horizontalJustification === 1 ||
                                                        horizontalJustification === 4
                                                        ? "middle"
                                                        : horizontalJustification === 2
                                                            ? "end"
                                                            : "start";
                                                const dxfDominantBaseline = attachmentPoint >= 1 && attachmentPoint <= 3
                                                    ? "hanging"
                                                    : attachmentPoint >= 4 && attachmentPoint <= 6
                                                        ? "central"
                                                        : verticalJustification === 3
                                                            ? "hanging"
                                                            : verticalJustification === 2
                                                                ? "central"
                                                                : "auto";
                                                const hitPointsAttr = isClosed
                                                    ? [...canvasPts, canvasPts[0]]
                                                        .map((point) => `${point.x},${point.y}`)
                                                        .join(" ")
                                                    : pointsAttr;
                                                const handleFeatureClick = (event) => {
                                                    event.stopPropagation();
                                                };
                                                return (_jsxs("g", { children: [pts.length > 1 &&
                                                            kind !== "circle" &&
                                                            kind !== "text" ? (_jsx("polyline", { points: hitPointsAttr, fill: "none", stroke: "transparent", strokeWidth: 12, vectorEffect: lineVectorEffect, pointerEvents: "stroke", onPointerDown: (event) => beginFeaturePointerDown(event, id), onClick: handleFeatureClick })) : null, kind === "circle" && pts[0] ? (_jsx("circle", { cx: canvasPts[0].x, cy: canvasPts[0].y, r: Math.max(Number(f.radius || 0), pointRadius), fill: active
                                                                ? "rgba(255,204,0,0.12)"
                                                                : "rgba(255,255,255,0.02)", stroke: active ? "#ffcc00" : color, strokeWidth: renderedLineWidth, strokeDasharray: dashArray, opacity: opacity, vectorEffect: lineVectorEffect, shapeRendering: "geometricPrecision", onPointerDown: (e) => beginFeaturePointerDown(e, id), onClick: (e) => {
                                                                handleFeatureClick(e);
                                                            } })) : kind === "text" && pts[0] ? (_jsx("text", { x: canvasPts[0].x, y: canvasPts[0].y, fill: active ? "#7dd3fc" : color, stroke: "none", strokeWidth: 0, paintOrder: "normal", opacity: opacity, fontSize: Math.max(Number(textMeta.height || 0.2), adaptiveTextFloor), textAnchor: dxfTextAnchor, dominantBaseline: dxfDominantBaseline, transform: Number(f.rotation ?? textMeta.rotation ?? 0)
                                                                ? `rotate(${-Number(f.rotation ?? textMeta.rotation ?? 0)} ${canvasPts[0].x} ${canvasPts[0].y})`
                                                                : undefined, style: {
                                                                fontFamily: textMeta.fontFamily || '"Arial Narrow", "Roboto Condensed", Arial, sans-serif',
                                                                cursor: tool === "pan"
                                                                    ? dragStart
                                                                        ? "grabbing"
                                                                        : "grab"
                                                                    : tool === "select"
                                                                        ? "crosshair"
                                                                        : ["line", "polyline", "rectangle", "circle", "text", "hatch", "boundary", "distance", "area", "point", "dimLinear", "dimAligned", "rotate", "scale"].includes(tool)
                                                                            ? "crosshair"
                                                                            : "default",
                                                            }, onPointerDown: (e) => beginFeaturePointerDown(e, id), onClick: (e) => {
                                                                handleFeatureClick(e);
                                                            }, children: featureTextLines(f).map((line, lineIndex) => (_jsx("tspan", { x: canvasPts[0].x, dy: lineIndex === 0 ? 0 : "1.15em", children: line }, `${id}_text_${lineIndex}`))) })) : pts.length === 1 || kind === "point" ? (_jsx("circle", { cx: canvasPts[0].x, cy: canvasPts[0].y, r: active ? pointRadius * 1.8 : pointRadius, fill: active ? "#ffffff" : color, stroke: active ? "#ffcc00" : color, strokeWidth: renderedLineWidth, opacity: opacity, vectorEffect: lineVectorEffect, onPointerDown: (e) => beginFeaturePointerDown(e, id), onClick: (e) => {
                                                                handleFeatureClick(e);
                                                            } })) : isClosed ? (_jsx("polygon", { points: pointsAttr, fill: active
                                                                ? "rgba(255,204,0,0.18)"
                                                                : isHatch
                                                                    ? hatchFill
                                                                    : "none", stroke: active ? "#ffcc00" : color, strokeWidth: renderedLineWidth, strokeDasharray: dashArray, opacity: opacity, vectorEffect: lineVectorEffect, strokeLinejoin: "round", onPointerDown: (e) => beginFeaturePointerDown(e, id), onClick: (e) => {
                                                                handleFeatureClick(e);
                                                            } })) : (_jsx("polyline", { points: pointsAttr, fill: "none", stroke: active ? "#ffcc00" : color, strokeWidth: renderedLineWidth, strokeDasharray: dashArray, opacity: opacity, vectorEffect: lineVectorEffect, strokeLinejoin: "round", strokeLinecap: "round", onPointerDown: (e) => beginFeaturePointerDown(e, id), onClick: (e) => {
                                                                handleFeatureClick(e);
                                                            } })), showVertices || (tool === "select" && active)
                                                            ? canvasPts.map((p, idx) => (_jsxs("g", { children: [tool === "select" && active ? (_jsx("rect", { x: p.x - gripHitSize / 2, y: p.y - gripHitSize / 2, width: gripHitSize, height: gripHitSize, fill: "rgba(0,0,0,0.001)", stroke: "none", pointerEvents: "all", style: { cursor: "none" }, onPointerDown: (event) => beginVertexMove(event, id, idx), onClick: (event) => {
                                                                            event.preventDefault();
                                                                            event.stopPropagation();
                                                                        } })) : null, _jsx("rect", { x: p.x - gripVisibleSize / 2, y: p.y - gripVisibleSize / 2, width: gripVisibleSize, height: gripVisibleSize, fill: tool === "select" && active ? "#22c55e" : "#ffffff", stroke: tool === "select" && active ? "#dcfce7" : color, strokeWidth: 1.25, vectorEffect: "non-scaling-stroke", pointerEvents: tool === "select" && active ? "all" : "none", style: { cursor: "none" }, onPointerDown: (event) => beginVertexMove(event, id, idx), onClick: (event) => {
                                                                            event.preventDefault();
                                                                            event.stopPropagation();
                                                                        } })] }, `${id}_v_${idx}`)))
                                                            : null, showLabels ? (_jsx("text", { x: centroid(canvasPts).x, y: centroid(canvasPts).y, fill: "#e2e8f0", fontSize: labelSize, textAnchor: "middle", pointerEvents: "none", children: f.name || f.id })) : null] }, id));
                                            }), tool === "rotate" && rotateSession.base ? (_jsx("g", { pointerEvents: "none", children: (() => {
                                                    const basePoint = toRenderPoint(rotateSession.base);
                                                    const size = Math.max(cadWorldPerPixel * 8, 0.2);
                                                    return (_jsxs(_Fragment, { children: [_jsx("circle", { cx: basePoint.x, cy: basePoint.y, r: size, fill: "none", stroke: "#facc15", strokeWidth: 2, vectorEffect: "non-scaling-stroke" }), _jsx("line", { x1: basePoint.x - size * 1.8, y1: basePoint.y, x2: basePoint.x + size * 1.8, y2: basePoint.y, stroke: "#facc15", strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" }), _jsx("line", { x1: basePoint.x, y1: basePoint.y - size * 1.8, x2: basePoint.x, y2: basePoint.y + size * 1.8, stroke: "#facc15", strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" })] }));
                                                })() })) : null, tool === "scale" && scaleSession.base ? (_jsx("g", { pointerEvents: "none", children: (() => {
                                                    const basePoint = toRenderPoint(scaleSession.base);
                                                    const size = Math.max(cadWorldPerPixel * 8, 0.2);
                                                    return (_jsxs(_Fragment, { children: [_jsx("rect", { x: basePoint.x - size, y: basePoint.y - size, width: size * 2, height: size * 2, fill: "none", stroke: "#22c55e", strokeWidth: 2, vectorEffect: "non-scaling-stroke" }), _jsx("line", { x1: basePoint.x - size * 1.8, y1: basePoint.y, x2: basePoint.x + size * 1.8, y2: basePoint.y, stroke: "#22c55e", strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" }), _jsx("line", { x1: basePoint.x, y1: basePoint.y - size * 1.8, x2: basePoint.x, y2: basePoint.y + size * 1.8, stroke: "#22c55e", strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" })] }));
                                                })() })) : null, tool === "mirror" &&
                                                mirrorPhase === "confirm-point" &&
                                                mirrorAxisPts[0] ? (_jsx("g", { pointerEvents: "none", children: (() => {
                                                    const center = mirrorAxisPts[0];
                                                    const radians = (mirrorPreviewAngle * Math.PI) / 180;
                                                    const cosine = Math.cos(radians);
                                                    const sine = Math.sin(radians);
                                                    const transformMirrorPoint = (point) => {
                                                        const dx = point.x - center.x;
                                                        const dy = point.y - center.y;
                                                        return {
                                                            x: center.x + dx * cosine - dy * sine,
                                                            y: center.y + dx * sine + dy * cosine,
                                                        };
                                                    };
                                                    const selectedIds = new Set(selectedFeatureIds);
                                                    const previewFeatures = features.filter((feature) => selectedIds.has(String(feature.id || "")));
                                                    return (_jsxs(_Fragment, { children: [previewFeatures.map((feature) => {
                                                                const points = featurePathPoints(feature).map(transformMirrorPoint);
                                                                const screenPoints = points.map(toRenderPoint);
                                                                const kind = String(feature.kind || "").toLowerCase();
                                                                if (kind === "circle" &&
                                                                    points[0] &&
                                                                    Number(feature.radius || 0) > 0) {
                                                                    const centerPoint = toRenderPoint(points[0]);
                                                                    return (_jsx("circle", { cx: centerPoint.x, cy: centerPoint.y, r: Number(feature.radius), fill: "rgba(34,211,238,0.08)", stroke: "#22d3ee", strokeWidth: 2, strokeDasharray: "7 5", vectorEffect: "non-scaling-stroke" }, `mirror_preview_${String(feature.id || "")}`));
                                                                }
                                                                if (screenPoints.length < 2)
                                                                    return null;
                                                                const pointsValue = screenPoints
                                                                    .map((point) => `${point.x},${point.y}`)
                                                                    .join(" ");
                                                                return feature.closed || kind === "polygon" ? (_jsx("polygon", { points: pointsValue, fill: "rgba(34,211,238,0.08)", stroke: "#22d3ee", strokeWidth: 2, strokeDasharray: "7 5", vectorEffect: "non-scaling-stroke" }, `mirror_preview_${String(feature.id || "")}`)) : (_jsx("polyline", { points: pointsValue, fill: "none", stroke: "#22d3ee", strokeWidth: 2, strokeDasharray: "7 5", vectorEffect: "non-scaling-stroke" }, `mirror_preview_${String(feature.id || "")}`));
                                                            }), _jsx("circle", { cx: toRenderPoint(center).x, cy: toRenderPoint(center).y, r: pointRadius * 1.8, fill: "#facc15", stroke: "#fff7ae", strokeWidth: 1.4, vectorEffect: "non-scaling-stroke" }), cursorWorld ? (_jsx("line", { x1: toRenderPoint(center).x, y1: toRenderPoint(center).y, x2: toRenderPoint(cursorWorld).x, y2: toRenderPoint(cursorWorld).y, stroke: "#facc15", strokeWidth: 1.3, strokeDasharray: "5 4", vectorEffect: "non-scaling-stroke" })) : null, _jsxs("text", { x: toRenderPoint(center).x + pointRadius * 3, y: toRenderPoint(center).y - pointRadius * 3, fill: "#fef08a", fontSize: Math.max(pointRadius * 3.3, 10), fontWeight: 900, paintOrder: "stroke", stroke: "#111827", strokeWidth: 2.4, children: [Math.round(mirrorPreviewAngle), "\u00C2\u00B0"] })] }));
                                                })() })) : null, draftPts.length && cursorWorld ? (_jsx("g", { pointerEvents: "none", children: tool === "circle" ? (_jsx("circle", { cx: toRenderPoint(draftPts[0]).x, cy: toRenderPoint(draftPts[0]).y, r: dist(draftPts[0], cursorWorld), fill: "none", stroke: "#38bdf8", strokeWidth: 1.4, vectorEffect: "non-scaling-stroke", strokeDasharray: "6 4" })) : tool === "rectangle" ? (_jsx("polygon", { points: renderPointsAttribute([
                                                        draftPts[0],
                                                        { x: cursorWorld.x, y: draftPts[0].y },
                                                        cursorWorld,
                                                        { x: draftPts[0].x, y: cursorWorld.y },
                                                    ]), fill: "rgba(56,189,248,.08)", stroke: "#38bdf8", strokeWidth: 1.4, vectorEffect: "non-scaling-stroke", strokeDasharray: "6 4" })) : tool === "line" || tool === "polyline" ? (_jsx("polyline", { points: renderPointsAttribute([
                                                        ...(tool === "line" ? [draftPts[0]] : draftPts),
                                                        cursorWorld,
                                                    ]), fill: "none", stroke: "#38bdf8", strokeWidth: 1.4, vectorEffect: "non-scaling-stroke", strokeDasharray: "6 4" })) : null })) : null, textAnchor ? (_jsxs("g", { pointerEvents: "none", children: [_jsx("line", { x1: toRenderPoint(textAnchor).x - pointRadius, y1: toRenderPoint(textAnchor).y, x2: toRenderPoint(textAnchor).x + pointRadius, y2: toRenderPoint(textAnchor).y, stroke: "#38bdf8", strokeWidth: 1.35, vectorEffect: "non-scaling-stroke" }), _jsx("line", { x1: toRenderPoint(textAnchor).x, y1: toRenderPoint(textAnchor).y - pointRadius, x2: toRenderPoint(textAnchor).x, y2: toRenderPoint(textAnchor).y + pointRadius, stroke: "#38bdf8", strokeWidth: 1.2, vectorEffect: "non-scaling-stroke" })] })) : null, tool === "mirror" && mirrorPhase !== "idle" ? (_jsxs("g", { pointerEvents: "none", children: [_jsx("rect", { x: renderViewBox.x + renderViewBox.width * 0.02, y: renderViewBox.y + renderViewBox.height * 0.025, width: renderViewBox.width * 0.38, height: renderViewBox.height * 0.055, rx: pointRadius * 1.4, fill: "rgba(8,15,25,0.92)", stroke: "#22d3ee", strokeWidth: 1.2, vectorEffect: "non-scaling-stroke" }), _jsx("text", { x: renderViewBox.x + renderViewBox.width * 0.035, y: renderViewBox.y + renderViewBox.height * 0.061, fill: "#e6faff", fontSize: renderViewBox.height * 0.018, fontWeight: 850, children: mirrorPhase === "confirm-selection"
                                                            ? "SPIEGELN Â· Rechtsklick: Auswahl bestÃ¤tigen"
                                                            : mirrorPhase === "pick-point"
                                                                ? "SPIEGELN Â· Spiegelpunkt anklicken"
                                                                : `SPIEGELN LIVE Â· ${Math.round(mirrorPreviewAngle)}Â° Â· Rechtsklick: bestÃ¤tigen` })] })) : null, _jsxs("g", { ref: smoothSelectCursorRef, pointerEvents: "none", style: { visibility: tool === "select" ? "visible" : "hidden" }, children: [_jsx("line", { x1: -pointRadius * 6, y1: 0, x2: pointRadius * 6, y2: 0, stroke: "#d7dde5", strokeWidth: 1, vectorEffect: "non-scaling-stroke" }), _jsx("line", { x1: 0, y1: -pointRadius * 6, x2: 0, y2: pointRadius * 6, stroke: "#d7dde5", strokeWidth: 1, vectorEffect: "non-scaling-stroke" }), _jsx("rect", { x: -pointRadius * 1.05, y: -pointRadius * 1.05, width: pointRadius * 2.1, height: pointRadius * 2.1, fill: "none", stroke: "#facc15", strokeWidth: 1.2, vectorEffect: "non-scaling-stroke" })] }), cursorWorld &&
                                                tool !== "select" &&
                                                tool !== "pan" &&
                                                ((tool === "rotate" && rotateSession.phase === "pick-object") ||
                                                    (tool === "scale" && scaleSession.phase === "pick-object") ||
                                                    (tool === "mirror" && !selectedFeatureIds.length) ||
                                                    tool === "offset" ||
                                                    tool === "explode" ||
                                                    !["line", "polyline", "rectangle", "circle", "text", "hatch", "boundary", "distance", "area", "point", "dimLinear", "dimAligned", "rotate", "scale"].includes(tool)) ? (_jsx("g", { pointerEvents: "none", children: _jsx("rect", { x: toRenderPoint(cursorWorld).x - pointRadius * 1.45, y: toRenderPoint(cursorWorld).y - pointRadius * 1.45, width: pointRadius * 2.9, height: pointRadius * 2.9, fill: "none", stroke: "#facc15", strokeWidth: 1.2, vectorEffect: "non-scaling-stroke" }) })) : null, selectionDrag ? (_jsx("rect", { x: Math.min(toRenderPoint(selectionDrag.start).x, toRenderPoint(selectionDrag.current).x), y: Math.min(toRenderPoint(selectionDrag.start).y, toRenderPoint(selectionDrag.current).y), width: Math.abs(toRenderPoint(selectionDrag.current).x -
                                                    toRenderPoint(selectionDrag.start).x), height: Math.abs(toRenderPoint(selectionDrag.current).y -
                                                    toRenderPoint(selectionDrag.start).y), fill: "rgba(56,189,248,.12)", stroke: "#38bdf8", strokeWidth: 1, vectorEffect: "non-scaling-stroke", strokeDasharray: "5 4", pointerEvents: "none" })) : null, showUtm
                                                ? utmPoints.map((p) => {
                                                    const renderPoint = toRenderPoint(p);
                                                    const selected = selectedUtmIds.includes(p.id);
                                                    const symbolStroke = "#ffffff";
                                                    // Spessore costante in pixel: la X resta bianca e nitida
                                                    // anche durante lo zoom profondo.
                                                    const symbolWidth = selected ? 2.8 : 2.1;
                                                    return (_jsxs("g", { "data-utm-point-id": p.id, style: {
                                                            cursor: tool === "pan"
                                                                ? dragStart
                                                                    ? "grabbing"
                                                                    : "grab"
                                                                : tool === "select"
                                                                    ? "crosshair"
                                                                    : ["line", "polyline", "rectangle", "circle", "text", "hatch", "boundary", "distance", "area", "point", "dimLinear", "dimAligned", "rotate", "scale"].includes(tool)
                                                                        ? "crosshair"
                                                                        : "default",
                                                        }, onPointerDown: (event) => {
                                                            if (tool !== "select" || event.button !== 0)
                                                                return;
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            setSelectionDrag(null);
                                                            setDragStart(null);
                                                            setSelectedUtmIds((previous) => {
                                                                const additive = event.ctrlKey || event.metaKey;
                                                                if (additive) {
                                                                    return previous.includes(p.id)
                                                                        ? previous.filter((id) => id !== p.id)
                                                                        : [...previous, p.id];
                                                                }
                                                                return [p.id];
                                                            });
                                                            setSelectedFeatureId("");
                                                            setSelectedFeatureIds([]);
                                                            setRightTab("properties");
                                                            setStatus(`Punkt ${p.id} ausgewÃ¤hlt`);
                                                        }, onClick: (event) => {
                                                            if (tool !== "select")
                                                                return;
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                        }, children: [selected ? (_jsx("rect", { x: renderPoint.x - utmXHalfSize * 1.35, y: renderPoint.y - utmXHalfSize * 1.35, width: utmXHalfSize * 2.7, height: utmXHalfSize * 2.7, fill: "none", stroke: "#38bdf8", strokeWidth: 1.8, strokeDasharray: "4 3", vectorEffect: "non-scaling-stroke", pointerEvents: "none" })) : null, _jsx("circle", { cx: renderPoint.x, cy: renderPoint.y, r: utmXHitRadius, fill: "rgba(0,0,0,0.001)", stroke: "none", pointerEvents: "all", style: { cursor: tool === "select" ? "none" : undefined } }), showUtmSymbols ? (_jsxs(_Fragment, { children: [_jsx("line", { x1: renderPoint.x - utmXHalfSize, y1: renderPoint.y - utmXHalfSize, x2: renderPoint.x + utmXHalfSize, y2: renderPoint.y + utmXHalfSize, stroke: symbolStroke, strokeWidth: symbolWidth, strokeLinecap: "round", strokeOpacity: 1, shapeRendering: "geometricPrecision", vectorEffect: "non-scaling-stroke" }), _jsx("line", { x1: renderPoint.x - utmXHalfSize, y1: renderPoint.y + utmXHalfSize, x2: renderPoint.x + utmXHalfSize, y2: renderPoint.y - utmXHalfSize, stroke: symbolStroke, strokeWidth: symbolWidth, strokeLinecap: "round", strokeOpacity: 1, shapeRendering: "geometricPrecision", vectorEffect: "non-scaling-stroke" })] })) : null, showUtmLabels ? (_jsxs("text", { x: renderPoint.x + utmLabelOffsetX, y: renderPoint.y, fill: "#ffffff", fontSize: adaptivePointLabelSize, fontWeight: 700, dominantBaseline: "middle", style: { fontFamily: '"Arial Narrow", Arial, sans-serif' }, children: [_jsx("tspan", { x: renderPoint.x + utmLabelOffsetX, dy: -adaptivePointLabelSize * 0.55, children: p.label || p.id }), _jsxs("tspan", { x: renderPoint.x + utmLabelOffsetX, dy: adaptivePointLabelSize * 1.05, children: ["H ", Number.isFinite(p.height) ? formatNumber(Number(p.height)) : "â€”", p.code ? ` Â· ${p.code}` : ""] })] })) : null] }, `utm_${p.id}`));
                                                })
                                                : null, measurePts.length ? (_jsxs("g", { pointerEvents: "none", children: [(tool === "distance" || tool === "dimLinear" || tool === "dimAligned") && measurePts[0] ? ((() => {
                                                        const sourceStart = measurePts[0];
                                                        const rawEnd = measurePts[1] ||
                                                            (cursorWorld ? cursorWorld : measurePts[0]);
                                                        const sourceEnd = tool === "dimLinear"
                                                            ? Math.abs(rawEnd.x - sourceStart.x) >= Math.abs(rawEnd.y - sourceStart.y)
                                                                ? { x: rawEnd.x, y: sourceStart.y }
                                                                : { x: sourceStart.x, y: rawEnd.y }
                                                            : rawEnd;
                                                        const baseDx = sourceEnd.x - sourceStart.x;
                                                        const baseDy = sourceEnd.y - sourceStart.y;
                                                        const baseLength = Math.max(Math.hypot(baseDx, baseDy), 1e-9);
                                                        const worldNx = -baseDy / baseLength;
                                                        const worldNy = baseDx / baseLength;
                                                        const baseMid = {
                                                            x: (sourceStart.x + sourceEnd.x) / 2,
                                                            y: (sourceStart.y + sourceEnd.y) / 2,
                                                        };
                                                        const liveOffset = dimensionDraft?.placing && cursorWorld
                                                            ? (cursorWorld.x - baseMid.x) * worldNx +
                                                                (cursorWorld.y - baseMid.y) * worldNy
                                                            : 0;
                                                        const start = {
                                                            x: sourceStart.x + worldNx * liveOffset,
                                                            y: sourceStart.y + worldNy * liveOffset,
                                                        };
                                                        const end = {
                                                            x: sourceEnd.x + worldNx * liveOffset,
                                                            y: sourceEnd.y + worldNy * liveOffset,
                                                        };
                                                        const sourceStartRender = toRenderPoint(sourceStart);
                                                        const sourceEndRender = toRenderPoint(sourceEnd);
                                                        const startRender = toRenderPoint(start);
                                                        const endRender = toRenderPoint(end);
                                                        const length = dist(sourceStart, sourceEnd);
                                                        const dx = endRender.x - startRender.x;
                                                        const dy = endRender.y - startRender.y;
                                                        const screenLength = Math.max(Math.hypot(dx, dy), 1e-9);
                                                        const nx = -dy / screenLength;
                                                        const ny = dx / screenLength;
                                                        const tickSize = Math.max(pointRadius * 1.4, cadWorldPerPixel * 8);
                                                        const labelOffset = Math.max(pointRadius * 3.2, cadWorldPerPixel * 18);
                                                        const midX = (startRender.x + endRender.x) / 2 + nx * labelOffset;
                                                        const midY = (startRender.y + endRender.y) / 2 + ny * labelOffset;
                                                        const finished = measurePts.length >= 2;
                                                        let previewTextRotation = tool === "dimAligned"
                                                            ? (Math.atan2(sourceEnd.y - sourceStart.y, sourceEnd.x - sourceStart.x) *
                                                                180) /
                                                                Math.PI
                                                            : 0;
                                                        while (previewTextRotation > 180)
                                                            previewTextRotation -= 360;
                                                        while (previewTextRotation <= -180)
                                                            previewTextRotation += 360;
                                                        if (previewTextRotation > 90)
                                                            previewTextRotation -= 180;
                                                        if (previewTextRotation < -90)
                                                            previewTextRotation += 180;
                                                        return (_jsxs(_Fragment, { children: [dimensionDraft?.placing ? (_jsxs(_Fragment, { children: [_jsx("line", { x1: sourceStartRender.x, y1: sourceStartRender.y, x2: startRender.x, y2: startRender.y, stroke: "#64748b", strokeWidth: 1, strokeDasharray: "4 3", vectorEffect: "non-scaling-stroke" }), _jsx("line", { x1: sourceEndRender.x, y1: sourceEndRender.y, x2: endRender.x, y2: endRender.y, stroke: "#64748b", strokeWidth: 1, strokeDasharray: "4 3", vectorEffect: "non-scaling-stroke" })] })) : null, _jsx("line", { x1: startRender.x, y1: startRender.y, x2: endRender.x, y2: endRender.y, stroke: finished ? "#38bdf8" : "#67e8f9", strokeWidth: Math.max(strokeWidth * 1.8, cadWorldPerPixel * 1.6), strokeDasharray: finished ? undefined : `${cadWorldPerPixel * 8} ${cadWorldPerPixel * 5}`, vectorEffect: "non-scaling-stroke" }), _jsx("line", { x1: startRender.x - nx * tickSize, y1: startRender.y - ny * tickSize, x2: startRender.x + nx * tickSize, y2: startRender.y + ny * tickSize, stroke: "#f8fafc", strokeWidth: 1.3, vectorEffect: "non-scaling-stroke" }), _jsx("line", { x1: endRender.x - nx * tickSize, y1: endRender.y - ny * tickSize, x2: endRender.x + nx * tickSize, y2: endRender.y + ny * tickSize, stroke: "#f8fafc", strokeWidth: 1.3, vectorEffect: "non-scaling-stroke" }), _jsx("circle", { cx: startRender.x, cy: startRender.y, r: Math.max(pointRadius * 0.8, cadWorldPerPixel * 4), fill: "#38bdf8", stroke: "#ffffff", strokeWidth: 1.2, vectorEffect: "non-scaling-stroke" }), _jsx("circle", { cx: endRender.x, cy: endRender.y, r: Math.max(pointRadius * 0.8, cadWorldPerPixel * 4), fill: finished ? "#38bdf8" : "#0f172a", stroke: "#ffffff", strokeWidth: 1.2, vectorEffect: "non-scaling-stroke" }), _jsxs("text", { x: midX, y: midY, fill: "#f8fafc", fontSize: Math.max(labelSize * 0.82, cadWorldPerPixel * 12), fontWeight: 900, textAnchor: "middle", dominantBaseline: "middle", paintOrder: "stroke", stroke: "#0b1119", strokeWidth: Math.max(strokeWidth * 3, cadWorldPerPixel * 3), vectorEffect: "non-scaling-stroke", transform: previewTextRotation
                                                                        ? `rotate(${-previewTextRotation} ${midX} ${midY})`
                                                                        : undefined, children: [formatNumber(length), " m"] })] }));
                                                    })()) : tool === "area" && measurePts.length >= 3 ? (_jsx("polygon", { points: renderPointsAttribute(measurePts), fill: "rgba(14,111,184,0.25)", stroke: "#38bdf8", strokeWidth: strokeWidth * 1.5 })) : measurePts.length >= 2 ? (_jsx("polyline", { points: renderPointsAttribute(measurePts), fill: "none", stroke: "#38bdf8", strokeWidth: strokeWidth * 1.5 })) : null, !["distance", "dimLinear", "dimAligned"].includes(tool)
                                                        ? measurePts.map((p, i) => (_jsx("circle", { cx: toRenderPoint(p).x, cy: toRenderPoint(p).y, r: pointRadius * 0.7, fill: "#38bdf8", stroke: "#ffffff", strokeWidth: strokeWidth }, `m_${i}`)))
                                                        : null] })) : null, activeSnap ? (_jsxs("g", { pointerEvents: "none", children: [_jsx("rect", { x: toRenderPoint(activeSnap.point).x - pointRadius * 0.65, y: toRenderPoint(activeSnap.point).y - pointRadius * 0.65, width: pointRadius * 1.3, height: pointRadius * 1.3, fill: "none", stroke: "#22d3ee", strokeWidth: strokeWidth * 1.4 }), _jsx("text", { x: toRenderPoint(activeSnap.point).x + pointRadius, y: toRenderPoint(activeSnap.point).y - pointRadius, fill: "#67e8f9", fontSize: labelSize * 0.7, children: snapKindLabel(activeSnap.kind) })] })) : null, selectedFeatureCenter ? (_jsx("circle", { cx: toRenderPoint(selectedFeatureCenter).x, cy: toRenderPoint(selectedFeatureCenter).y, r: pointRadius * 0.22, fill: "#ffcc00", pointerEvents: "none" })) : null] }), drawingBounds ? (_jsx("div", { style: {
                                            position: "absolute",
                                            right: 10,
                                            bottom: 42,
                                            width: 190,
                                            height: 125,
                                            borderRadius: 10,
                                            overflow: "hidden",
                                            border: "1px solid rgba(255,255,255,0.28)",
                                            background: "rgba(15,23,42,0.88)",
                                            boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
                                        }, title: "MiniMap \u00E2\u20AC\u201C klicken zum Zentrieren", children: _jsxs("svg", { viewBox: `${drawingBounds.minX} ${drawingBounds.minY} ${Math.max(1, drawingBounds.maxX - drawingBounds.minX)} ${Math.max(1, drawingBounds.maxY - drawingBounds.minY)}`, preserveAspectRatio: "xMidYMid meet", shapeRendering: "geometricPrecision", style: { width: "100%", height: "100%", display: "block", cursor: "crosshair" }, onClick: (e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const x = drawingBounds.minX + ((e.clientX - rect.left) / rect.width) * (drawingBounds.maxX - drawingBounds.minX);
                                                const y = drawingBounds.minY + ((e.clientY - rect.top) / rect.height) * (drawingBounds.maxY - drawingBounds.minY);
                                                setViewBox((prev) => ({ ...prev, x: x - prev.width / 2, y: y - prev.height / 2 }));
                                            }, children: [minimapFeatures.map((f) => {
                                                    const pts = Array.isArray(f.pts) ? f.pts : [];
                                                    if (!pts.length)
                                                        return null;
                                                    const canvasPts = pts.map(cadToCanvas);
                                                    const pa = canvasPts
                                                        .map((point) => `${point.x},${point.y}`)
                                                        .join(" ");
                                                    const closed = Boolean(f.closed || f.kind === "polygon");
                                                    return f.kind === "circle" && pts[0] ? (_jsx("circle", { cx: canvasPts[0].x, cy: canvasPts[0].y, r: Math.max(Number(f.radius || 0), 0.001), fill: "none", stroke: featureColor(f), strokeWidth: "1.2", vectorEffect: "non-scaling-stroke" }, `mini_${f.id}`)) : pts.length === 1 || f.kind === "point" ? (_jsx("circle", { cx: canvasPts[0].x, cy: canvasPts[0].y, r: Math.max((drawingBounds.maxX - drawingBounds.minX) / 300, 0.1), fill: featureColor(f) }, `mini_${f.id}`)) : closed ? (_jsx("polygon", { points: pa, fill: "none", stroke: featureColor(f), strokeWidth: "1.2", vectorEffect: "non-scaling-stroke" }, `mini_${f.id}`)) : (_jsx("polyline", { points: pa, fill: "none", stroke: featureColor(f), strokeWidth: "1.2", vectorEffect: "non-scaling-stroke" }, `mini_${f.id}`));
                                                }), _jsx("rect", { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height, fill: "rgba(56,189,248,0.08)", stroke: "#38bdf8", strokeWidth: "2", vectorEffect: "non-scaling-stroke" })] }) })) : null, _jsx("div", { style: {
                                            position: "absolute",
                                            left: 10,
                                            bottom: 10,
                                            minHeight: 30,
                                            padding: "6px 9px",
                                            borderRadius: 8,
                                            background: "rgba(15,23,42,0.82)",
                                            color: "#dbeafe",
                                            fontSize: 11,
                                            pointerEvents: "none",
                                        }, children: cursorWorld
                                            ? `X ${formatNumber(cursorWorld.x)} Â· Y ${formatNumber(cursorWorld.y)}`
                                            : "X â€” Â· Y â€”" }), _jsx("div", { style: {
                                            position: "absolute",
                                            right: 10,
                                            bottom: 10,
                                            minHeight: 30,
                                            padding: "6px 9px",
                                            borderRadius: 8,
                                            background: "rgba(15,23,42,0.82)",
                                            color: "#dbeafe",
                                            fontSize: 11,
                                            pointerEvents: "none",
                                        }, children: tool === "distance" && measurePts.length
                                            ? `Strecke: ${formatNumber(measurementLength)} m`
                                            : tool === "area" && measurePts.length
                                                ? `FlÃ¤che: ${formatNumber(measurementArea)} mÂ²`
                                                : tool === "point" && measurePts[0]
                                                    ? `Punkt: ${formatNumber(measurePts[0].x)} / ${formatNumber(measurePts[0].y)}`
                                                    : activeSnap
                                                        ? `F3 Â· ${snapKindLabel(activeSnap.kind)}`
                                                        : `Ansicht: ${formatNumber(viewBox.width, 1)} Ã— ${formatNumber(viewBox.height, 1)}` })] }), _jsxs("div", { style: {
                                    minHeight: 38,
                                    padding: "0 12px",
                                    borderTop: `1px solid ${cadPalette.border}`,
                                    borderBottom: `1px solid rgba(255,255,255,.05)`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    background: "#171e27",
                                    boxShadow: "inset 0 1px 0 rgba(255,255,255,.025)",
                                    fontSize: 11,
                                    color: cadPalette.sub,
                                    marginRight: editingPanelWidth,
                                }, children: [_jsxs("div", { children: ["Werkzeug: ", _jsx("b", { style: { color: cadPalette.text }, children: tool })] }), _jsxs("div", { children: ["Sichtbar:", " ", _jsx("b", { style: { color: cadPalette.text }, children: renderedFeatures.length }), " /", " ", features.length, !showCadTexts
                                                ? ` Â· ${visibleFeatures.length - renderedFeatures.length} Texte ausgeblendet`
                                                : ""] }), _jsxs("div", { children: ["Status: ", _jsx("b", { style: { color: cadPalette.text }, children: status })] })] })] }), _jsxs(Card, { title: "Bearbeitung", subtitle: selectedFeatureIds.length > 1 ? `${selectedFeatureIds.length} Objekte ausgewÃ¤hlt` : selectedFeature ? String(selectedFeature.id) : "Keine Auswahl", tone: "cadDark", style: {
                            gridArea: "cad",
                            position: "relative",
                            zIndex: 8,
                            justifySelf: "end",
                            transition: editingPanelResizing ? "none" : "width 120ms ease",
                            alignSelf: "stretch",
                            marginTop: 50,
                            width: editingPanelWidth,
                            minWidth: 280,
                            height: "calc(100% - 50px)",
                            overflowY: "auto",
                            borderTop: 0,
                            borderRight: 0,
                            borderBottom: 0,
                            borderRadius: "0 0 13px 0",
                            boxShadow: "-10px 0 24px rgba(0,0,0,.28)",
                        }, children: [_jsx("div", { onMouseDown: startEditingPanelResize, onDoubleClick: resetEditingPanelWidth, title: "Bearbeitung verbreitern oder verschm\u00C3\u00A4lern", style: {
                                    position: "absolute",
                                    left: 0,
                                    top: 0,
                                    bottom: 0,
                                    width: 16,
                                    zIndex: 2,
                                    cursor: "col-resize",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: editingPanelResizing ? "rgba(21,145,210,.08)" : "transparent",
                                }, children: _jsx("div", { style: {
                                        width: 8,
                                        height: 52,
                                        borderLeft: `2px solid ${editingPanelResizing ? "#5ec0f0" : "rgba(184,198,214,.55)"}`,
                                        borderRight: `2px solid ${editingPanelResizing ? "#5ec0f0" : "rgba(184,198,214,.55)"}`,
                                        borderRadius: 99,
                                        opacity: 0.95,
                                    } }) }), _jsx("div", { style: {
                                    display: "grid",
                                    gridTemplateColumns: "repeat(3, 1fr)",
                                    borderBottom: `1px solid ${cadPalette.border}`,
                                }, children: [
                                    ["properties", "Eigenschaften"],
                                    ["layers", "Layer"],
                                    ["aufmass", "AufmaÃŸ"],
                                    ["ki", "KI"],
                                    ["rlc", "RLC"],
                                    ["geo", "Georeferenz"],
                                ].map(([key, label]) => (_jsx("button", { type: "button", onClick: () => setRightTab(key), style: {
                                        height: 40,
                                        border: 0,
                                        borderRight: `1px solid ${cadPalette.border}`,
                                        background: rightTab === key
                                            ? cadPalette.accentSoft
                                            : cadPalette.bg2,
                                        color: rightTab === key
                                            ? "#79c8f5"
                                            : cadPalette.sub,
                                        fontSize: 11,
                                        fontWeight: 900,
                                        cursor: "pointer",
                                    }, children: label }, key))) }), rightTab === "properties" ? (_jsxs("div", { style: {
                                    padding: 12,
                                    color: cadPalette.text,
                                    background: cadPalette.bg,
                                }, children: [selectedMeasurementBlock ? (_jsxs("div", { style: { marginBottom: 12, padding: 10, borderRadius: 7, background: cadPalette.accentSoft, color: "#8bd2f8", fontSize: 12, fontWeight: 900 }, children: [selectedMeasurementBlock.typeLabel, " \u00C2\u00B7 ", formatNumber(selectedMeasurementBlock.value), " ", selectedMeasurementBlock.unit] })) : selectedFeatureIds.length > 1 ? (_jsxs("div", { style: { marginBottom: 12, padding: 10, borderRadius: 7, background: cadPalette.accentSoft, color: "#8bd2f8", fontSize: 12, fontWeight: 900 }, children: [selectedFeatureIds.length, " Objekte ausgew\u00C3\u00A4hlt \u00C2\u00B7 Gesamtl\u00C3\u00A4nge ", formatNumber(selectedFeatures.reduce((s, f) => s + Number(f.length || 0), 0)), " m \u00C2\u00B7 Gesamtfl\u00C3\u00A4che ", formatNumber(selectedFeatures.reduce((s, f) => s + Number(f.area || 0), 0)), " m\u00C2\u00B2"] })) : null, selectedUtmIds.length > 1 ? (_jsx("div", { style: { display: "grid", gap: 8 }, children: _jsxs("div", { style: { border: `1px solid ${cadPalette.border}`, borderRadius: 5, overflow: "hidden" }, children: [_jsx("div", { style: { padding: "7px 9px", background: "#202833", color: "#dce6f0", fontSize: 12, fontWeight: 900 }, children: "UTM \u00C2\u00B7 Mehrfachauswahl" }), _jsxs("div", { style: { padding: 10, display: "grid", gap: 10, borderTop: `1px solid ${cadPalette.border}` }, children: [_jsxs("div", { style: { padding: 10, borderRadius: 5, background: cadPalette.accentSoft, color: "#8bd2f8", fontSize: 12, fontWeight: 900 }, children: [selectedUtmIds.length, " Punkte ausgew\u00C3\u00A4hlt"] }), _jsxs("label", { style: { display: "grid", gridTemplateColumns: "112px 1fr 62px", alignItems: "center", gap: 8, fontSize: 12 }, children: [_jsx("span", { style: { color: cadPalette.sub }, children: "Gr\u00C3\u00B6\u00C3\u0178e X/Text" }), _jsx("input", { type: "range", min: "0.1", max: "2.5", step: "0.05", value: Number(utmSymbolSize) || 1, onChange: (event) => setUtmSymbolSize(Number(event.target.value)), style: { width: "100%" } }), _jsx("input", { type: "number", min: "0.1", max: "2.5", step: "0.05", value: Number(utmSymbolSize) || 1, onChange: (event) => setUtmSymbolSize(Number(event.target.value)), style: {
                                                                        width: "100%",
                                                                        height: 32,
                                                                        borderRadius: 4,
                                                                        border: `1px solid ${cadPalette.border}`,
                                                                        background: cadPalette.bg2,
                                                                        color: cadPalette.text,
                                                                        padding: "0 8px",
                                                                        fontSize: 12,
                                                                        fontWeight: 800,
                                                                        outline: "none",
                                                                    } })] }), _jsxs("div", { style: {
                                                                display: "grid",
                                                                gridTemplateColumns: "1fr 1fr",
                                                                gap: 8,
                                                            }, children: [_jsxs("label", { style: {
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        justifyContent: "space-between",
                                                                        gap: 8,
                                                                        minHeight: 34,
                                                                        padding: "0 9px",
                                                                        border: `1px solid ${cadPalette.border}`,
                                                                        borderRadius: 4,
                                                                        background: cadPalette.bg2,
                                                                        color: cadPalette.text,
                                                                        fontSize: 12,
                                                                        fontWeight: 800,
                                                                    }, children: [_jsx("span", { children: "X anzeigen" }), _jsx("input", { type: "checkbox", checked: showUtmSymbols, onChange: (event) => {
                                                                                setShowUtmSymbols(event.target.checked);
                                                                                setDirty(true);
                                                                                setStatus(event.target.checked
                                                                                    ? "UTM-X eingeblendet"
                                                                                    : "UTM-X ausgeblendet");
                                                                            } })] }), _jsxs("label", { style: {
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        justifyContent: "space-between",
                                                                        gap: 8,
                                                                        minHeight: 34,
                                                                        padding: "0 9px",
                                                                        border: `1px solid ${cadPalette.border}`,
                                                                        borderRadius: 4,
                                                                        background: cadPalette.bg2,
                                                                        color: cadPalette.text,
                                                                        fontSize: 12,
                                                                        fontWeight: 800,
                                                                    }, children: [_jsx("span", { children: "Text anzeigen" }), _jsx("input", { type: "checkbox", checked: showUtmLabels, onChange: (event) => {
                                                                                setShowUtmLabels(event.target.checked);
                                                                                setDirty(true);
                                                                                setStatus(event.target.checked
                                                                                    ? "UTM-Text eingeblendet"
                                                                                    : "UTM-Text ausgeblendet");
                                                                            } })] })] }), _jsx("div", { style: { fontSize: 11, color: cadPalette.sub, lineHeight: 1.45 }, children: "\u00C3\u201Endert X-Symbol und Text der ausgew\u00C3\u00A4hlten Punkte gemeinsam, ohne die Koordinaten zu ver\u00C3\u00A4ndern." }), _jsx(Btn, { onClick: () => {
                                                                setSelectedUtmIds([]);
                                                                setStatus("UTM-Auswahl aufgehoben");
                                                            }, children: "Auswahl aufheben" })] })] }) })) : !selectedFeature && !selectedUtmPoint ? (_jsx("div", { style: {
                                            fontSize: 12,
                                            color: cadPalette.sub,
                                            lineHeight: 1.5,
                                        }, children: "Objekt in der Zeichnung oder Objektliste ausw\u00C3\u00A4hlen." })) : selectedUtmPoint ? (_jsxs("div", { style: { display: "grid", gap: 8 }, children: [_jsxs("div", { style: { border: `1px solid ${cadPalette.border}`, borderRadius: 5, overflow: "hidden" }, children: [_jsx("div", { style: { padding: "7px 9px", background: "#202833", color: "#dce6f0", fontSize: 12, fontWeight: 900 }, children: "Allgemein \u00C2\u00B7 XYZ" }), [
                                                        ["Punktname", "label", selectedUtmPoint.label || selectedUtmPoint.id],
                                                        ["Code", "code", selectedUtmPoint.code || ""],
                                                    ].map(([label, field, value]) => (_jsxs("label", { style: { display: "grid", gridTemplateColumns: "112px 1fr", alignItems: "center", minHeight: 34, borderTop: `1px solid ${cadPalette.border}`, fontSize: 12 }, children: [_jsx("span", { style: { padding: "0 9px", color: cadPalette.sub }, children: label }), _jsx("input", { value: String(value), onChange: (event) => updateSelectedUtmPoint(field, event.target.value), style: { height: 32, border: 0, borderLeft: `1px solid ${cadPalette.border}`, background: cadPalette.bg2, color: cadPalette.text, padding: "0 9px", outline: "none", fontWeight: 800 } })] }, String(field))))] }), _jsxs("div", { style: { border: `1px solid ${cadPalette.border}`, borderRadius: 5, overflow: "hidden" }, children: [_jsx("div", { style: { padding: "7px 9px", background: "#202833", color: "#dce6f0", fontSize: 12, fontWeight: 900 }, children: "Position" }), [
                                                        ["Rechtswert X", "x", selectedUtmPoint.x],
                                                        ["Hochwert Y", "y", selectedUtmPoint.y],
                                                        ["HÃ¶he Z", "height", selectedUtmPoint.height ?? 0],
                                                    ].map(([label, field, value]) => (_jsxs("label", { style: { display: "grid", gridTemplateColumns: "112px 1fr", alignItems: "center", minHeight: 34, borderTop: `1px solid ${cadPalette.border}`, fontSize: 12 }, children: [_jsx("span", { style: { padding: "0 9px", color: cadPalette.sub }, children: label }), _jsx("input", { type: "number", step: "0.001", value: Number(value), onChange: (event) => updateSelectedUtmPoint(field, Number(event.target.value)), style: { height: 32, border: 0, borderLeft: `1px solid ${cadPalette.border}`, background: cadPalette.bg2, color: cadPalette.text, padding: "0 9px", outline: "none", fontWeight: 800 } })] }, String(field))))] }), _jsxs("div", { style: { border: `1px solid ${cadPalette.border}`, borderRadius: 5, overflow: "hidden" }, children: [_jsx("div", { style: { padding: "7px 9px", background: "#202833", color: "#dce6f0", fontSize: 12, fontWeight: 900 }, children: "UTM \u00C2\u00B7 Darstellung" }), _jsxs("div", { style: { padding: 10, display: "grid", gap: 10, borderTop: `1px solid ${cadPalette.border}` }, children: [_jsx(Btn, { onClick: () => {
                                                                    const allIds = utmPoints.map((point) => point.id);
                                                                    setSelectedUtmIds(allIds);
                                                                    setSelectedFeatureId("");
                                                                    setSelectedFeatureIds([]);
                                                                    setRightTab("properties");
                                                                    setStatus(`${allIds.length} UTM-Punkte ausgewÃ¤hlt`);
                                                                }, primary: true, children: "Alle Punkte ausw\u00C3\u00A4hlen" }), _jsxs("label", { style: { display: "grid", gridTemplateColumns: "112px 1fr 62px", alignItems: "center", gap: 8, fontSize: 12 }, children: [_jsx("span", { style: { color: cadPalette.sub }, children: "Gr\u00C3\u00B6\u00C3\u0178e X/Text" }), _jsx("input", { type: "range", min: "0.1", max: "2.5", step: "0.05", value: Number(utmSymbolSize) || 1, onChange: (event) => setUtmSymbolSize(Number(event.target.value)), style: { width: "100%" } }), _jsx("input", { type: "number", min: "0.1", max: "2.5", step: "0.05", value: Number(utmSymbolSize) || 1, onChange: (event) => setUtmSymbolSize(Number(event.target.value)), style: {
                                                                            width: "100%",
                                                                            height: 32,
                                                                            borderRadius: 4,
                                                                            border: `1px solid ${cadPalette.border}`,
                                                                            background: cadPalette.bg2,
                                                                            color: cadPalette.text,
                                                                            padding: "0 8px",
                                                                            fontSize: 12,
                                                                            fontWeight: 800,
                                                                            outline: "none",
                                                                        } })] }), _jsxs("div", { style: {
                                                                    display: "grid",
                                                                    gridTemplateColumns: "1fr 1fr",
                                                                    gap: 8,
                                                                }, children: [_jsxs("label", { style: {
                                                                            display: "flex",
                                                                            alignItems: "center",
                                                                            justifyContent: "space-between",
                                                                            gap: 8,
                                                                            minHeight: 34,
                                                                            padding: "0 9px",
                                                                            border: `1px solid ${cadPalette.border}`,
                                                                            borderRadius: 4,
                                                                            background: cadPalette.bg2,
                                                                            color: cadPalette.text,
                                                                            fontSize: 12,
                                                                            fontWeight: 800,
                                                                        }, children: [_jsx("span", { children: "X anzeigen" }), _jsx("input", { type: "checkbox", checked: showUtmSymbols, onChange: (event) => {
                                                                                    setShowUtmSymbols(event.target.checked);
                                                                                    setDirty(true);
                                                                                    setStatus(event.target.checked
                                                                                        ? "UTM-X eingeblendet"
                                                                                        : "UTM-X ausgeblendet");
                                                                                } })] }), _jsxs("label", { style: {
                                                                            display: "flex",
                                                                            alignItems: "center",
                                                                            justifyContent: "space-between",
                                                                            gap: 8,
                                                                            minHeight: 34,
                                                                            padding: "0 9px",
                                                                            border: `1px solid ${cadPalette.border}`,
                                                                            borderRadius: 4,
                                                                            background: cadPalette.bg2,
                                                                            color: cadPalette.text,
                                                                            fontSize: 12,
                                                                            fontWeight: 800,
                                                                        }, children: [_jsx("span", { children: "Text anzeigen" }), _jsx("input", { type: "checkbox", checked: showUtmLabels, onChange: (event) => {
                                                                                    setShowUtmLabels(event.target.checked);
                                                                                    setDirty(true);
                                                                                    setStatus(event.target.checked
                                                                                        ? "UTM-Text eingeblendet"
                                                                                        : "UTM-Text ausgeblendet");
                                                                                } })] })] }), _jsx("div", { style: { fontSize: 11, color: cadPalette.sub, lineHeight: 1.45 }, children: "Verkleinert oder vergr\u00C3\u00B6\u00C3\u0178ert X-Symbol und UTM-Text gemeinsam, ohne die urspr\u00C3\u00BCnglichen Punktkoordinaten zu ver\u00C3\u00A4ndern." })] })] }), _jsx(Btn, { onClick: () => {
                                                    const renderPoint = cadToCanvas({ x: selectedUtmPoint.x, y: selectedUtmPoint.y });
                                                    const size = Math.max(viewBox.width, viewBox.height) * 0.04;
                                                    setViewBox(boundsToAspectViewBox({ minX: renderPoint.x - size, minY: renderPoint.y - size, maxX: renderPoint.x + size, maxY: renderPoint.y + size }, viewportAspect));
                                                }, primary: true, children: "Punkt anzeigen" })] })) : selectedMeasurementBlock ? (_jsxs("div", { style: { display: "grid", gap: 10 }, children: [[
                                                ["ID", selectedMeasurementBlock.groupId],
                                                ["Layer", selectedMeasurementBlock.layer],
                                                ["Typ", selectedMeasurementBlock.typeLabel],
                                                [
                                                    selectedMeasurementBlock.isArea ? "FlÃ¤che" : "MaÃŸ",
                                                    `${formatNumber(selectedMeasurementBlock.value)} ${selectedMeasurementBlock.unit}`,
                                                ],
                                                ["Elemente", String(selectedMeasurementBlock.features.length)],
                                            ].map(([label, value]) => (_jsxs("div", { style: {
                                                    display: "grid",
                                                    gridTemplateColumns: "100px 1fr",
                                                    gap: 8,
                                                    paddingBottom: 8,
                                                    borderBottom: `1px solid ${cadPalette.border}`,
                                                    fontSize: 12,
                                                }, children: [_jsx("div", { style: { color: cadPalette.sub }, children: label }), _jsx("div", { style: { color: cadPalette.text, fontWeight: 800, wordBreak: "break-word" }, children: value })] }, label))), _jsxs("label", { style: {
                                                    display: "grid",
                                                    gridTemplateColumns: "100px 1fr",
                                                    gap: 8,
                                                    alignItems: "center",
                                                    paddingBottom: 8,
                                                    borderBottom: `1px solid ${cadPalette.border}`,
                                                    fontSize: 12,
                                                }, children: [_jsx("span", { style: { color: cadPalette.sub }, children: "Texth\u00C3\u00B6he" }), _jsx("input", { type: "number", min: "0.05", step: "0.1", value: selectedMeasurementBlock.textHeight, onChange: (event) => updateSelectedMeasurementTextHeight(Number(String(event.target.value).replace(",", "."))), style: {
                                                            width: "100%",
                                                            height: 32,
                                                            borderRadius: 4,
                                                            border: `1px solid ${cadPalette.border}`,
                                                            background: cadPalette.bg2,
                                                            color: cadPalette.text,
                                                            padding: "0 9px",
                                                            fontSize: 12,
                                                            fontWeight: 800,
                                                            outline: "none",
                                                        } })] }), _jsx(Btn, { onClick: zoomToSelection, primary: true, children: "Messblock anzeigen" })] })) : selectedFeature ? (_jsxs("div", { style: { display: "grid", gap: 8 }, children: [_jsxs("div", { style: { border: `1px solid ${cadPalette.border}`, borderRadius: 5, overflow: "hidden" }, children: [_jsx("div", { style: { padding: "7px 9px", background: "#202833", color: "#dce6f0", fontSize: 12, fontWeight: 900 }, children: "Allgemein \u00C2\u00B7 XYZ" }), _jsxs("label", { style: { display: "grid", gridTemplateColumns: "112px 1fr", alignItems: "center", minHeight: 38, borderTop: `1px solid ${cadPalette.border}`, fontSize: 12 }, children: [_jsx("span", { style: { padding: "0 9px", color: cadPalette.sub }, children: "Farbe" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 36px", gap: 6, padding: "4px 7px", borderLeft: `1px solid ${cadPalette.border}` }, children: [_jsxs("select", { value: selectedFeatureStyleValue("color") === "VonLayer" ? "VonLayer" : "Objektfarbe", onChange: (event) => {
                                                                            if (event.target.value === "VonLayer")
                                                                                updateSelectedFeatureStyle("color", "VonLayer");
                                                                        }, style: { height: 30, borderRadius: 4, border: `1px solid ${cadPalette.border}`, background: cadPalette.bg2, color: cadPalette.text, padding: "0 7px", outline: "none", fontWeight: 800 }, children: [_jsx("option", { value: "VonLayer", children: "VonLayer" }), _jsx("option", { value: "Objektfarbe", children: "Objektfarbe" })] }), _jsx("input", { type: "color", title: "Objektfarbe", value: /^#[0-9a-f]{6}$/i.test(selectedFeatureStyleValue("color")) ? selectedFeatureStyleValue("color") : "#ffffff", onChange: (event) => updateSelectedFeatureStyle("color", event.target.value), style: { width: 34, height: 30, padding: 2, borderRadius: 4, border: `1px solid ${cadPalette.border}`, background: cadPalette.bg2, cursor: "pointer" } })] })] }), _jsxs("label", { style: { display: "grid", gridTemplateColumns: "112px 1fr", alignItems: "center", minHeight: 38, borderTop: `1px solid ${cadPalette.border}`, fontSize: 12 }, children: [_jsx("span", { style: { padding: "0 9px", color: cadPalette.sub }, children: "Layer" }), _jsx("select", { value: String(selectedFeature.layer || "0"), onChange: (event) => updateSelectedFeatureStyle("layer", event.target.value), style: { height: 34, border: 0, borderLeft: `1px solid ${cadPalette.border}`, background: cadPalette.bg2, color: cadPalette.text, padding: "0 9px", outline: "none", fontWeight: 800 }, children: layerStates.map((layer) => (_jsx("option", { value: layer.name, children: layer.name }, layer.name))) })] }), _jsxs("label", { style: { display: "grid", gridTemplateColumns: "112px 1fr", alignItems: "center", minHeight: 38, borderTop: `1px solid ${cadPalette.border}`, fontSize: 12 }, children: [_jsx("span", { style: { padding: "0 9px", color: cadPalette.sub }, children: "Linientyp" }), _jsxs("select", { value: selectedFeatureStyleValue("linetype"), onChange: (event) => updateSelectedFeatureStyle("linetype", event.target.value), style: { height: 34, border: 0, borderLeft: `1px solid ${cadPalette.border}`, background: cadPalette.bg2, color: cadPalette.text, padding: "0 9px", outline: "none", fontWeight: 800 }, children: [_jsx("option", { value: "VonLayer", children: "VonLayer" }), _jsx("option", { value: "Continuous", children: "Continuous" }), _jsx("option", { value: "Dashed", children: "Dashed" }), _jsx("option", { value: "Dotted", children: "Dotted" }), _jsx("option", { value: "Center", children: "Center" })] })] }), _jsxs("label", { style: { display: "grid", gridTemplateColumns: "112px 1fr", alignItems: "center", minHeight: 38, borderTop: `1px solid ${cadPalette.border}`, fontSize: 12 }, children: [_jsx("span", { style: { padding: "0 9px", color: cadPalette.sub }, children: "Linienst\u00C3\u00A4rke" }), _jsxs("select", { value: selectedFeatureStyleValue("lineweight"), onChange: (event) => updateSelectedFeatureStyle("lineweight", event.target.value), style: { height: 34, border: 0, borderLeft: `1px solid ${cadPalette.border}`, background: cadPalette.bg2, color: cadPalette.text, padding: "0 9px", outline: "none", fontWeight: 800 }, children: [_jsx("option", { value: "VonLayer", children: "VonLayer" }), _jsx("option", { value: "0.13", children: "0,13 mm" }), _jsx("option", { value: "0.18", children: "0,18 mm" }), _jsx("option", { value: "0.25", children: "0,25 mm" }), _jsx("option", { value: "0.35", children: "0,35 mm" }), _jsx("option", { value: "0.50", children: "0,50 mm" }), _jsx("option", { value: "0.70", children: "0,70 mm" }), _jsx("option", { value: "1.00", children: "1,00 mm" })] })] })] }), _jsxs("div", { style: { border: `1px solid ${cadPalette.border}`, borderRadius: 5, overflow: "hidden" }, children: [_jsx("div", { style: { padding: "7px 9px", background: "#202833", color: "#dce6f0", fontSize: 12, fontWeight: 900 }, children: "Geometrie" }), [
                                                        ["Typ", selectedFeature.kind || "â€”"],
                                                        ["Geschlossen", selectedFeature.closed ? "Ja" : "Nein"],
                                                        ["StÃ¼tzpunkte", String(selectedFeature.pts?.length || 0)],
                                                        ["LÃ¤nge", `${formatNumber(Number(selectedFeature.length || 0))} m`],
                                                        ["FlÃ¤che", `${formatNumber(Number(selectedFeature.area || 0))} mÂ²`],
                                                        ...(String(selectedFeature.kind || "").toLowerCase() === "circle"
                                                            ? [["Radius", `${formatNumber(Number(selectedFeature.radius || 0))} m`]]
                                                            : []),
                                                    ].map(([label, value]) => (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "112px 1fr", alignItems: "center", minHeight: 34, borderTop: `1px solid ${cadPalette.border}`, fontSize: 12 }, children: [_jsx("span", { style: { padding: "0 9px", color: cadPalette.sub }, children: label }), _jsx("span", { style: { padding: "0 9px", color: cadPalette.text, fontWeight: 800 }, children: value })] }, String(label)))), String(selectedFeature.kind || "").toLowerCase() === "circle" ? (_jsxs("label", { style: { display: "grid", gridTemplateColumns: "112px 1fr", alignItems: "center", minHeight: 34, borderTop: `1px solid ${cadPalette.border}`, fontSize: 12 }, children: [_jsx("span", { style: { padding: "0 9px", color: cadPalette.sub }, children: "Radius \u00C3\u00A4ndern" }), _jsx("input", { type: "number", step: "0.001", min: "0", value: Number(selectedFeature.radius || 0), onChange: (event) => updateSelectedFeatureRadius(Number(event.target.value)), style: { height: 32, border: 0, borderLeft: `1px solid ${cadPalette.border}`, background: cadPalette.bg2, color: cadPalette.text, padding: "0 9px", outline: "none", fontWeight: 800 } })] })) : null, ["polyline", "line"].includes(String(selectedFeature.kind || "").toLowerCase()) ? (_jsxs("label", { style: { display: "grid", gridTemplateColumns: "112px 1fr", alignItems: "center", minHeight: 34, borderTop: `1px solid ${cadPalette.border}`, fontSize: 12 }, children: [_jsx("span", { style: { padding: "0 9px", color: cadPalette.sub }, children: "Globale Breite" }), _jsx("input", { type: "number", step: "0.01", min: "0", value: featureGlobalWidth(selectedFeature), onChange: (event) => updateSelectedFeatureGlobalWidth(Number(String(event.target.value).replace(",", "."))), title: "0 = keine globale Breite", style: {
                                                                    height: 32,
                                                                    border: 0,
                                                                    borderLeft: `1px solid ${cadPalette.border}`,
                                                                    background: cadPalette.bg2,
                                                                    color: cadPalette.text,
                                                                    padding: "0 9px",
                                                                    outline: "none",
                                                                    fontWeight: 800,
                                                                } })] })) : null] }), _jsxs("div", { style: { border: `1px solid ${cadPalette.border}`, borderRadius: 5, overflow: "hidden" }, children: [_jsx("div", { style: { padding: "7px 9px", background: "#202833", color: "#dce6f0", fontSize: 12, fontWeight: 900 }, children: "Position" }), ["x", "y", "z"].map((coordinate) => (_jsxs("label", { style: { display: "grid", gridTemplateColumns: "112px 1fr", alignItems: "center", minHeight: 34, borderTop: `1px solid ${cadPalette.border}`, fontSize: 12 }, children: [_jsx("span", { style: { padding: "0 9px", color: cadPalette.sub }, children: coordinate.toUpperCase() }), _jsx("input", { type: "number", step: "0.001", value: featureCoordinateValue(selectedFeature, coordinate, 0), onChange: (event) => updateSelectedFeatureCoordinate(coordinate, Number(event.target.value), 0), style: { height: 32, border: 0, borderLeft: `1px solid ${cadPalette.border}`, background: cadPalette.bg2, color: cadPalette.text, padding: "0 9px", outline: "none", fontWeight: 800 } })] }, coordinate)))] }), selectedFeature.pts && selectedFeature.pts.length > 1 ? (_jsxs("div", { style: { border: `1px solid ${cadPalette.border}`, borderRadius: 5, overflow: "hidden" }, children: [_jsx("div", { style: { padding: "7px 9px", background: "#202833", color: "#dce6f0", fontSize: 12, fontWeight: 900 }, children: "Endpunkt" }), ["x", "y", "z"].map((coordinate) => (_jsxs("label", { style: { display: "grid", gridTemplateColumns: "112px 1fr", alignItems: "center", minHeight: 34, borderTop: `1px solid ${cadPalette.border}`, fontSize: 12 }, children: [_jsx("span", { style: { padding: "0 9px", color: cadPalette.sub }, children: coordinate.toUpperCase() }), _jsx("input", { type: "number", step: "0.001", value: featureCoordinateValue(selectedFeature, coordinate, Math.max(0, (selectedFeature.pts?.length || 1) - 1)), onChange: (event) => updateSelectedFeatureCoordinate(coordinate, Number(event.target.value), Math.max(0, (selectedFeature.pts?.length || 1) - 1)), disabled: coordinate === "z", style: { height: 32, border: 0, borderLeft: `1px solid ${cadPalette.border}`, background: cadPalette.bg2, color: cadPalette.text, padding: "0 9px", outline: "none", fontWeight: 800, opacity: coordinate === "z" ? 0.65 : 1 } })] }, coordinate)))] })) : null, _jsxs("div", { style: { border: `1px solid ${cadPalette.border}`, borderRadius: 5, overflow: "hidden" }, children: [_jsx("div", { style: { padding: "7px 9px", background: "#202833", color: "#dce6f0", fontSize: 12, fontWeight: 900 }, children: "Verschiedenes" }), [
                                                        ["ID", selectedFeature.id || "â€”"],
                                                        ["Name", selectedFeature.name || "â€”"],
                                                    ].map(([label, value]) => (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "112px 1fr", alignItems: "center", minHeight: 34, borderTop: `1px solid ${cadPalette.border}`, fontSize: 12 }, children: [_jsx("span", { style: { padding: "0 9px", color: cadPalette.sub }, children: label }), _jsx("span", { style: { padding: "0 9px", color: cadPalette.text, fontWeight: 800, wordBreak: "break-word" }, children: value })] }, label)))] }), _jsx(Btn, { onClick: zoomToSelection, primary: true, children: "Objekt anzeigen" })] })) : null, _jsxs("div", { style: {
                                            marginTop: 16,
                                            paddingTop: 12,
                                            borderTop: `1px solid ${cadPalette.border}`,
                                        }, children: [_jsx("div", { style: {
                                                    marginBottom: 8,
                                                    fontSize: 12,
                                                    fontWeight: 900,
                                                }, children: "RLC CAD Engine" }), _jsxs("div", { style: { display: "grid", gap: 7, fontSize: 11 }, children: [_jsxs("div", { children: ["Dokument: ", _jsx("b", { children: dirty ? "nicht gespeichert" : "gespeichert" })] }), _jsxs("div", { children: ["Verlauf: ", _jsx("b", { children: undoStackRef.current.length }), " r\u00C3\u00BCckg\u00C3\u00A4ngig \u00C2\u00B7", " ", _jsx("b", { children: redoStackRef.current.length }), " wiederholen"] }), _jsxs("div", { children: ["Objektfang: ", _jsx("b", { children: snapEnabled ? "aktiv" : "aus" }), _jsx("br", {}), "Ortho F8: ", _jsx("b", { children: orthoEnabled ? "aktiv" : "aus" })] })] })] })] })) : rightTab === "layers" ? (_jsxs("div", { style: {
                                    height: "100%",
                                    display: "grid",
                                    gridTemplateRows: "auto auto auto 1fr",
                                    overflow: "hidden",
                                    color: cadPalette.text,
                                    background: "#242b33",
                                }, children: [_jsxs("div", { style: {
                                            display: "grid",
                                            gridTemplateColumns: "1fr 24px",
                                            gap: 4,
                                            padding: 4,
                                            borderBottom: `1px solid ${cadPalette.border}`,
                                        }, children: [_jsx(Input, { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Layer suchen\u00E2\u20AC\u00A6", style: {
                                                    ...cadPaletteInputStyle,
                                                    height: 22,
                                                    borderRadius: 2,
                                                    background: "#1b222a",
                                                    boxShadow: "inset 0 1px 1px rgba(0,0,0,.35)",
                                                    fontSize: 7.5,
                                                } }), _jsx("button", { type: "button", title: "Suche zur\u00C3\u00BCcksetzen", onClick: () => setSearch(""), style: {
                                                    height: 22,
                                                    border: `1px solid ${cadPalette.border}`,
                                                    borderRadius: 2,
                                                    background: "#1b222a",
                                                    color: "#cbd5e1",
                                                    cursor: "pointer",
                                                    fontSize: 7.5,
                                                    fontWeight: 900,
                                                }, children: "\u00C3\u2014" })] }), _jsxs("div", { style: {
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 4,
                                            padding: "3px 4px",
                                            borderBottom: `1px solid ${cadPalette.border}`,
                                            background: "#20262e",
                                        }, children: [_jsx("button", { type: "button", title: "Neuer Layer", onClick: createNewLayer, style: {
                                                    width: 20,
                                                    height: 18,
                                                    border: `1px solid ${cadPalette.border}`,
                                                    borderRadius: 2,
                                                    background: "#27313b",
                                                    color: "#dbeafe",
                                                    fontSize: 14,
                                                    lineHeight: 1,
                                                    cursor: "pointer",
                                                }, children: "+" }), _jsx("button", { type: "button", title: "Aktiven Layer l\u00C3\u00B6schen", onClick: () => deleteLayer(activeLayer), style: {
                                                    width: 20,
                                                    height: 18,
                                                    border: `1px solid ${cadPalette.border}`,
                                                    borderRadius: 2,
                                                    background: "#27313b",
                                                    color: "#fca5a5",
                                                    fontSize: 7.5,
                                                    cursor: "pointer",
                                                }, children: "\u00F0\u0178\u2014\u2018" }), _jsx("button", { type: "button", title: "Alle Layer einschalten", onClick: () => toggleAllLayers(true), style: {
                                                    height: 17,
                                                    padding: "0 2px",
                                                    border: `1px solid ${cadPalette.border}`,
                                                    borderRadius: 2,
                                                    background: "#27313b",
                                                    color: "#dbeafe",
                                                    fontSize: 7,
                                                    fontWeight: 800,
                                                    cursor: "pointer",
                                                }, children: "Alle ein" }), _jsx("button", { type: "button", title: "Alle Layer ausschalten", onClick: () => toggleAllLayers(false), style: {
                                                    height: 17,
                                                    padding: "0 2px",
                                                    border: `1px solid ${cadPalette.border}`,
                                                    borderRadius: 2,
                                                    background: "#27313b",
                                                    color: "#dbeafe",
                                                    fontSize: 7,
                                                    fontWeight: 800,
                                                    cursor: "pointer",
                                                }, children: "Alle aus" })] }), _jsxs("div", { style: {
                                            display: "grid",
                                            gridTemplateColumns: "18px 18px 18px 18px minmax(72px,1fr) 84px 74px",
                                            alignItems: "center",
                                            minHeight: 19,
                                            padding: "0 2px",
                                            borderBottom: `1px solid ${cadPalette.border}`,
                                            background: "#171d24",
                                            color: "#cbd5e1",
                                            fontSize: 7,
                                            fontWeight: 900,
                                            position: "sticky",
                                            top: 0,
                                            zIndex: 2,
                                        }, children: [_jsx("span", { title: "Aktiver Layer", children: "\u00E2\u2014\u008F" }), _jsx("span", { title: "Ein/Aus", children: "\u00E2\u02DC\u00BC" }), _jsx("span", { title: "Sperren", children: "\u00F0\u0178\u201D\u2019" }), _jsx("span", { title: "Farbe", children: "\u00E2\u2013\u00A0" }), _jsx("span", { children: "Name" }), _jsx("span", { children: "Linientyp" }), _jsx("span", { children: "Linienst\u00C3\u00A4rke" })] }), _jsx("div", { style: { overflow: "auto", minHeight: 0 }, children: layerStates
                                            .filter((layer) => !search.trim() ||
                                            layer.name.toLowerCase().includes(search.trim().toLowerCase()))
                                            .map((layer) => {
                                            const isActive = activeLayer === layer.name;
                                            const isLocked = Boolean(layerLocks[layer.name]);
                                            return (_jsxs("div", { onDoubleClick: () => setActiveLayer(layer.name), style: {
                                                    display: "grid",
                                                    gridTemplateColumns: "18px 18px 18px 18px minmax(72px,1fr) 84px 74px",
                                                    alignItems: "center",
                                                    minHeight: 19,
                                                    padding: "0 2px",
                                                    borderBottom: "1px solid #303842",
                                                    background: isActive ? "#334150" : "#242b33",
                                                    color: "#f1f5f9",
                                                    fontSize: 7.5,
                                                }, children: [_jsx("button", { type: "button", title: "Als aktiven Layer setzen", onClick: () => {
                                                            setActiveLayer(layer.name);
                                                            setStatus(`Aktiver Layer: ${layer.name}`);
                                                        }, style: {
                                                            width: 15,
                                                            height: 15,
                                                            border: 0,
                                                            background: "transparent",
                                                            color: isActive ? "#fbbf24" : "#64748b",
                                                            cursor: "pointer",
                                                            fontSize: 7.5,
                                                        }, children: isActive ? "â—" : "â—‹" }), _jsx("button", { type: "button", title: layer.visible ? "Layer ausschalten" : "Layer einschalten", onClick: () => setLayerVisibility((previous) => ({
                                                            ...previous,
                                                            [layer.name]: !layer.visible,
                                                        })), style: {
                                                            width: 15,
                                                            height: 15,
                                                            border: 0,
                                                            background: "transparent",
                                                            color: layer.visible ? "#fbbf24" : "#64748b",
                                                            cursor: "pointer",
                                                            fontSize: 7.5,
                                                        }, children: layer.visible ? "â˜¼" : "â—‹" }), _jsx("button", { type: "button", title: isLocked ? "Layer entsperren" : "Layer sperren", onClick: () => setLayerLocks((previous) => ({
                                                            ...previous,
                                                            [layer.name]: !isLocked,
                                                        })), style: {
                                                            width: 15,
                                                            height: 15,
                                                            border: 0,
                                                            background: "transparent",
                                                            color: isLocked ? "#f8fafc" : "#64748b",
                                                            cursor: "pointer",
                                                            fontSize: 10,
                                                        }, children: isLocked ? "ðŸ”’" : "ðŸ”“" }), _jsx("label", { title: "Layerfarbe \u00C3\u00A4ndern", style: {
                                                            position: "relative",
                                                            width: 12,
                                                            height: 12,
                                                            display: "block",
                                                            justifySelf: "center",
                                                            border: "1px solid #94a3b8",
                                                            borderRadius: 1,
                                                            background: layer.color || "#ffffff",
                                                            cursor: "pointer",
                                                            overflow: "hidden",
                                                        }, children: _jsx("input", { type: "color", value: layer.color || "#ffffff", onChange: (event) => applyLayerColor(layer.name, event.target.value), style: {
                                                                position: "absolute",
                                                                inset: 0,
                                                                width: "100%",
                                                                height: "100%",
                                                                opacity: 0,
                                                                cursor: "pointer",
                                                            } }) }), _jsx("button", { type: "button", title: `${layer.name} aktiv setzen`, onClick: () => setActiveLayer(layer.name), style: {
                                                            minWidth: 0,
                                                            border: 0,
                                                            background: "transparent",
                                                            color: isActive ? "#ffffff" : "#e2e8f0",
                                                            textAlign: "left",
                                                            padding: "0 2px",
                                                            fontSize: 7.5,
                                                            fontWeight: isActive ? 900 : 700,
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                            cursor: "pointer",
                                                        }, children: layer.name }), _jsxs("select", { title: "Linientyp", defaultValue: "Continuous", onChange: () => setDirty(true), style: {
                                                            width: "100%",
                                                            height: 17,
                                                            border: 0,
                                                            background: "transparent",
                                                            color: "#e2e8f0",
                                                            fontSize: 8,
                                                            fontWeight: 700,
                                                            outline: "none",
                                                        }, children: [_jsx("option", { value: "Continuous", children: "Continuous" }), _jsx("option", { value: "Dashed", children: "Dashed" }), _jsx("option", { value: "Dotted", children: "Dotted" }), _jsx("option", { value: "Center", children: "Center" })] }), _jsxs("select", { title: "Linienst\u00C3\u00A4rke", defaultValue: "VonLayer", onChange: () => setDirty(true), style: {
                                                            width: "100%",
                                                            height: 17,
                                                            border: 0,
                                                            background: "transparent",
                                                            color: "#e2e8f0",
                                                            fontSize: 8,
                                                            fontWeight: 700,
                                                            outline: "none",
                                                        }, children: [_jsx("option", { value: "VonLayer", children: "VonLayer" }), _jsx("option", { value: "0.13", children: "0,13 mm" }), _jsx("option", { value: "0.18", children: "0,18 mm" }), _jsx("option", { value: "0.25", children: "0,25 mm" }), _jsx("option", { value: "0.35", children: "0,35 mm" }), _jsx("option", { value: "0.50", children: "0,50 mm" })] })] }, layer.name));
                                        }) })] })) : rightTab === "aufmass" ? (_jsxs("div", { style: {
                                    padding: 12,
                                    display: "grid",
                                    gap: 10,
                                    color: cadPalette.text,
                                    background: cadPalette.bg,
                                }, children: [_jsx("div", { style: { fontSize: 12, color: cadPalette.sub, lineHeight: 1.5 }, children: "Ausgew\u00C3\u00A4hltes CAD-Objekt direkt als Aufma\u00C3\u0178zeile speichern." }), _jsx(Input, { value: pos, onChange: (e) => setPos(e.target.value), placeholder: "LV-Position", style: cadPaletteInputStyle }), _jsx(Input, { value: kurz, onChange: (e) => setKurz(e.target.value), placeholder: "Kurztext", style: cadPaletteInputStyle }), _jsxs("div", { style: {
                                            display: "grid",
                                            gridTemplateColumns: "1fr 1fr",
                                            gap: 8,
                                        }, children: [_jsxs(Select, { value: unit, onChange: (e) => setUnit(e.target.value), style: cadPaletteInputStyle, children: [_jsx("option", { value: "m", children: "m" }), _jsx("option", { value: "m2", children: "m\u00C2\u00B2" }), _jsx("option", { value: "Stk", children: "Stk" })] }), _jsx(Input, { value: String(factor), onChange: (e) => setFactor(clamp(Number(e.target.value) || 1, 0.0001, 1e9)), inputMode: "decimal", placeholder: "Faktor", style: cadPaletteInputStyle })] }), _jsxs("div", { style: {
                                            borderRadius: 10,
                                            padding: 12,
                                            background: cadPalette.bg2,
                                            border: `1px solid ${cadPalette.border}`,
                                        }, children: [_jsx("div", { style: { fontSize: 11, color: cadPalette.sub }, children: "Menge" }), _jsxs("div", { style: {
                                                    marginTop: 4,
                                                    fontSize: 20,
                                                    fontWeight: 950,
                                                    color: "#75c8f5",
                                                }, children: [formatNumber(qtyPreview), " ", uiUnitLabel(unit)] })] }), _jsx(Btn, { primary: true, onClick: () => void pushToAufmass(), disabled: !selectedFeature || !pos.trim() || !projectId, style: { height: 46 }, children: "In Aufma\u00C3\u0178 \u00C3\u00BCbernehmen" }), _jsx("div", { style: { fontSize: 11, color: cadPalette.sub }, children: "Speicherung erfolgt serverseitig \u00C3\u00BCber den Aufma\u00C3\u0178-Endpunkt." })] })) : rightTab === "ki" ? (_jsxs("div", { style: {
                                    padding: 12,
                                    display: "grid",
                                    gap: 10,
                                    color: cadPalette.text,
                                    background: cadPalette.bg,
                                }, children: [_jsx("div", { style: { fontSize: 12, color: cadPalette.sub, lineHeight: 1.5 }, children: "Layer und Objektname werden mit dem Projekt-LV verglichen." }), _jsx(Select, { value: kiSelectedKey, onChange: (e) => setKiSelectedKey(e.target.value), disabled: !kiRows.length, style: cadPaletteInputStyle, children: !kiRows.length ? (_jsx("option", { value: "", children: "Keine KI-Gruppen" })) : (kiRows.map((r) => (_jsxs("option", { value: r.key, children: [r.layerGroup, " \u00C2\u00B7 ", formatNumber(r.qty), " ", uiUnitLabel(r.unit)] }, r.key)))) }), _jsxs("div", { style: {
                                            borderRadius: 10,
                                            border: `1px solid ${cadPalette.border}`,
                                            background: cadPalette.bg2,
                                            padding: 10,
                                            fontSize: 11,
                                            lineHeight: 1.55,
                                        }, children: [_jsxs("div", { children: ["Gruppe: ", _jsx("b", { children: kiSelected?.layerGroup || "â€”" })] }), _jsxs("div", { children: ["Menge:", " ", _jsxs("b", { children: [formatNumber(Number(kiSelected?.qty || 0)), " ", uiUnitLabel(kiSelected?.unit || "m")] })] }), _jsxs("div", { children: ["Sicherheit:", " ", _jsx("b", { children: kiSelected
                                                            ? `${Math.round(kiSelected.confidenceA * 100)} %`
                                                            : "â€”" })] })] }), _jsx("div", { style: { fontSize: 11, fontWeight: 900 }, children: "LV-Vorschl\u00C3\u00A4ge" }), _jsxs("div", { style: {
                                            maxHeight: 170,
                                            overflow: "auto",
                                            border: `1px solid ${cadPalette.border}`,
                                            borderRadius: 9,
                                        }, children: [lvSuggestions.map((s) => (_jsxs("button", { type: "button", onClick: () => setChosenLvPos(s.pos), style: {
                                                    width: "100%",
                                                    padding: "8px 9px",
                                                    border: 0,
                                                    borderBottom: `1px solid ${cadPalette.border}`,
                                                    background: chosenLvPos === s.pos
                                                        ? cadPalette.accentSoft
                                                        : cadPalette.bg2,
                                                    color: cadPalette.text,
                                                    textAlign: "left",
                                                    cursor: "pointer",
                                                }, children: [_jsxs("div", { style: {
                                                            display: "flex",
                                                            justifyContent: "space-between",
                                                            gap: 8,
                                                            fontSize: 11,
                                                        }, children: [_jsx("b", { children: s.pos }), _jsxs("span", { style: { color: cadPalette.sub }, children: [Math.round(s.score * 100), " %"] })] }), _jsx("div", { style: {
                                                            marginTop: 3,
                                                            fontSize: 10,
                                                            color: cadPalette.sub,
                                                            lineHeight: 1.35,
                                                        }, children: s.text })] }, s.pos))), !lvSuggestions.length ? (_jsx("div", { style: {
                                                    padding: 10,
                                                    fontSize: 11,
                                                    color: cadPalette.sub,
                                                }, children: lvState === "loading"
                                                    ? "LV wird geladenâ€¦"
                                                    : "Keine passenden Positionen." })) : null] }), _jsx(Input, { value: kiPos, onChange: (e) => setKiPos(e.target.value), placeholder: "LV-Position", style: cadPaletteInputStyle }), _jsx(Input, { value: kiText, onChange: (e) => setKiText(e.target.value), placeholder: "Text", style: cadPaletteInputStyle }), _jsxs("div", { style: {
                                            display: "grid",
                                            gridTemplateColumns: "1fr 1fr",
                                            gap: 8,
                                        }, children: [_jsxs(Select, { value: kiUnit, onChange: (e) => setKiUnit(e.target.value), style: cadPaletteInputStyle, children: [_jsx("option", { value: "m", children: "m" }), _jsx("option", { value: "m2", children: "m\u00C2\u00B2" }), _jsx("option", { value: "Stk", children: "Stk" })] }), _jsx(Input, { value: String(kiFactor), onChange: (e) => setKiFactor(clamp(Number(e.target.value) || 1, 0.0001, 1e9)), style: cadPaletteInputStyle })] }), _jsxs("div", { style: { fontSize: 12 }, children: ["Vorschau:", " ", _jsxs("b", { children: [formatNumber(kiQtyPreview), " ", uiUnitLabel(kiUnit)] })] }), _jsx(Btn, { primary: true, disabled: !projectId || !kiSelected, onClick: () => void pushToAufmass({
                                            pos: kiPos,
                                            text: kiText,
                                            unit: kiUnit,
                                            qty: kiQtyPreview,
                                        }), style: { height: 46 }, children: "KI-Ergebnis \u00C3\u00BCbernehmen" })] })) : rightTab === "geo" ? (_jsxs("div", { style: {
                                    padding: 10,
                                    display: "grid",
                                    gap: 10,
                                    color: cadPalette.text,
                                    background: cadPalette.bg,
                                }, children: [_jsxs("div", { style: {
                                            padding: "8px 9px",
                                            border: `1px solid ${cadPalette.border}`,
                                            borderRadius: 6,
                                            background: cadPalette.bg2,
                                        }, children: [_jsx("div", { style: {
                                                    fontSize: 10,
                                                    fontWeight: 950,
                                                    letterSpacing: ".05em",
                                                    color: cadPalette.sub,
                                                }, children: "KARTENEBENEN \u00C2\u00B7 MEHRFACHAUSWAHL" }), _jsx("div", { style: {
                                                    marginTop: 7,
                                                    display: "grid",
                                                    gridTemplateColumns: "1fr 1fr",
                                                    gap: 6,
                                                }, children: [
                                                    ["osm", "OpenStreetMap", "Basis"],
                                                    ["aerial", "Bayern Luftbild", "Basis Â· UTM-genau"],
                                                    ["parcels", "Flurkarte / Parzellen", "Overlay Â· UTM-genau"],
                                                    ["borders", "Verwaltungsgrenzen", "Overlay Â· UTM-genau"],
                                                ].map(([key, label, detail]) => {
                                                    const active = geoLayers[key];
                                                    return (_jsxs("button", { type: "button", "aria-pressed": active, onClick: () => setGeoLayers((previous) => ({
                                                            ...previous,
                                                            [key]: !previous[key],
                                                        })), style: {
                                                            minHeight: 54,
                                                            padding: "7px 8px",
                                                            border: `1px solid ${active ? cadPalette.accent : cadPalette.border}`,
                                                            borderRadius: 5,
                                                            background: active
                                                                ? cadPalette.accentSoft
                                                                : "#171e27",
                                                            color: active ? "#8ed8ff" : cadPalette.text,
                                                            cursor: "pointer",
                                                            textAlign: "left",
                                                            display: "grid",
                                                            gridTemplateColumns: "18px minmax(0,1fr)",
                                                            alignItems: "center",
                                                            gap: 7,
                                                        }, children: [_jsx("span", { style: {
                                                                    width: 16,
                                                                    height: 16,
                                                                    borderRadius: 3,
                                                                    border: `1px solid ${active ? cadPalette.accent : cadPalette.border}`,
                                                                    background: active ? "#0f6ca6" : "#111821",
                                                                    color: "#fff",
                                                                    display: "grid",
                                                                    placeItems: "center",
                                                                    fontSize: 11,
                                                                    fontWeight: 950,
                                                                }, children: active ? "âœ“" : "" }), _jsxs("span", { style: { minWidth: 0 }, children: [_jsx("span", { style: {
                                                                            display: "block",
                                                                            fontSize: 10.5,
                                                                            fontWeight: 900,
                                                                            lineHeight: 1.25,
                                                                        }, children: label }), _jsx("span", { style: {
                                                                            display: "block",
                                                                            marginTop: 2,
                                                                            color: cadPalette.sub,
                                                                            fontSize: 7.5,
                                                                            lineHeight: 1.2,
                                                                        }, children: detail })] })] }, key));
                                                }) }), _jsx("div", { style: {
                                                    marginTop: 7,
                                                    color: cadPalette.sub,
                                                    fontSize: 9.5,
                                                    lineHeight: 1.4,
                                                }, children: "Ebenen k\u00C3\u00B6nnen kombiniert werden. Bei gleichzeitigem OSM und Luftbild wird das Luftbild transparent eingeblendet." })] }), _jsxs("div", { style: {
                                            padding: "8px 9px",
                                            border: `1px solid ${cadPalette.border}`,
                                            borderRadius: 6,
                                            background: cadPalette.bg2,
                                        }, children: [_jsx("div", { style: {
                                                    fontSize: 10,
                                                    fontWeight: 950,
                                                    letterSpacing: ".05em",
                                                    color: cadPalette.sub,
                                                }, children: "KOORDINATENSYSTEM" }), _jsxs(Select, { value: geoCrs, onChange: (event) => setGeoCrs(event.target.value), style: {
                                                    ...cadPaletteInputStyle,
                                                    width: "100%",
                                                    height: 34,
                                                    marginTop: 7,
                                                    borderRadius: 5,
                                                    background: "#171e27",
                                                    fontSize: 11,
                                                }, title: "Koordinatensystem", children: [_jsx("option", { value: "EPSG:25832", children: "ETRS89 / UTM 32N (EPSG:25832)" }), _jsx("option", { value: "EPSG:32632", children: "WGS84 / UTM 32N (EPSG:32632)" })] })] }), _jsx("div", { style: {
                                            padding: 9,
                                            border: `1px solid ${!hasGeoLayers
                                                ? cadPalette.border
                                                : geoProjectedBounds
                                                    ? "rgba(66,169,230,.55)"
                                                    : "rgba(248,113,113,.45)"}`,
                                            borderRadius: 6,
                                            background: !hasGeoLayers
                                                ? cadPalette.bg2
                                                : geoProjectedBounds
                                                    ? "rgba(23,61,87,.72)"
                                                    : "rgba(127,29,29,.22)",
                                            color: !hasGeoLayers
                                                ? cadPalette.sub
                                                : geoProjectedBounds
                                                    ? "#8ed8ff"
                                                    : "#fca5a5",
                                            fontSize: 10,
                                            lineHeight: 1.45,
                                        }, children: !hasGeoLayers
                                            ? "Keine Kartenebene aktiv."
                                            : !geoProjectedBounds
                                                ? "Keine gÃ¼ltige Georeferenz erkannt. Erwartet werden UTM-Koordinaten im gewÃ¤hlten System."
                                                : hasBayernWmsLayers
                                                    ? "Bayern Luftbild, Flurkarte und Grenzen werden direkt in EPSG:25832 fÃ¼r den exakten CAD-BBOX angefordert. Dadurch entfallen die bisherigen Web-Mercator-Verschiebungen."
                                                    : "OpenStreetMap wird automatisch mit Zoom und Pan synchronisiert. OSM ist kartografisch orientierend; amtliche Genauigkeit liefern die Bayern-WMS-Ebenen." }), _jsx("button", { type: "button", onClick: () => {
                                            if (!hasGeoLayers) {
                                                setStatus("Bitte zuerst mindestens eine Kartenebene aktivieren.");
                                                return;
                                            }
                                            if (!geoProjectedBounds) {
                                                setStatus("Keine gÃ¼ltigen UTM-Koordinaten fÃ¼r die Georeferenz erkannt.");
                                                return;
                                            }
                                            setGeoRequestViewBox({ ...viewBox });
                                            setGeoRefreshTick((value) => value + 1);
                                            if (geoLayers.osm)
                                                syncGeoMapToCadView();
                                            setStatus("Kartenebenen exakt mit CAD-Ausschnitt synchronisiert");
                                        }, style: {
                                            ...rlcPanelButtonStyle,
                                            minHeight: 34,
                                            background: cadPalette.accentSoft,
                                            borderColor: cadPalette.accent,
                                            color: "#8ed8ff",
                                        }, children: "\u00E2\u0152\u2013 Mit CAD-Ausschnitt synchronisieren" }), _jsx("button", { type: "button", onClick: () => setGeoLayers({
                                            osm: false,
                                            aerial: false,
                                            parcels: false,
                                            borders: false,
                                        }), disabled: !hasGeoLayers, style: {
                                            ...rlcPanelButtonStyle,
                                            minHeight: 32,
                                            opacity: hasGeoLayers ? 1 : 0.45,
                                            cursor: hasGeoLayers ? "pointer" : "not-allowed",
                                        }, children: "Alle Kartenebenen ausblenden" }), _jsx("div", { style: {
                                            paddingTop: 8,
                                            borderTop: `1px solid ${cadPalette.border}`,
                                            color: cadPalette.sub,
                                            fontSize: 10,
                                            lineHeight: 1.5,
                                        }, children: "Bayern-WMS-Ebenen werden im UTM-System des CAD angefordert und pixelgenau auf den Zeichenbereich gelegt. OpenStreetMap bleibt eine erg\u00C3\u00A4nzende Webkarte." })] })) : (_jsxs("div", { style: {
                                    padding: 8,
                                    display: "grid",
                                    gap: 8,
                                    color: cadPalette.text,
                                    background: cadPalette.bg,
                                }, children: [_jsx("div", { style: {
                                            display: "grid",
                                            gridTemplateColumns: "1fr 1fr",
                                            gap: 5,
                                        }, children: [
                                            ["takeoff", "Mengen"],
                                            ["utm", "UTM"],
                                        ].map(([key, label]) => (_jsx("button", { type: "button", onClick: () => setRlcPanelTab(key), style: {
                                                height: 30,
                                                border: `1px solid ${cadPalette.border}`,
                                                borderRadius: 5,
                                                background: rlcPanelTab === key
                                                    ? cadPalette.accentSoft
                                                    : cadPalette.bg2,
                                                color: rlcPanelTab === key ? "#79c8f5" : cadPalette.sub,
                                                fontSize: 10,
                                                fontWeight: 900,
                                                cursor: "pointer",
                                            }, children: label }, key))) }), rlcPanelTab === "takeoff" ? (_jsxs("div", { style: { display: "grid", gap: 6 }, children: [_jsxs("div", { style: {
                                                    display: "grid",
                                                    gridTemplateColumns: "1fr auto",
                                                    gap: 6,
                                                    padding: "7px 8px",
                                                    border: `1px solid ${cadPalette.border}`,
                                                    borderRadius: 6,
                                                    background: cadPalette.bg2,
                                                    fontSize: 10,
                                                    lineHeight: 1.35,
                                                }, children: [_jsx("span", { style: { color: cadPalette.sub }, children: "Projekt" }), _jsx("b", { children: projectId || "â€”" }), _jsx("span", { style: { color: cadPalette.sub }, children: "LV-Ziel" }), _jsx("b", { children: selectedLvPosition?.pos || "unten wÃ¤hlen" })] }), _jsx("button", { type: "button", onClick: () => setLeftTab("lv"), style: rlcPanelButtonStyle, children: "LV \u00C2\u00B7 Aufma\u00C3\u0178 \u00C3\u00B6ffnen" }), _jsx("button", { type: "button", onClick: prepareSelectionTakeoff, style: rlcPanelButtonStyle, children: "Auswahl messen" }), _jsxs("button", { type: "button", onClick: takeoffActiveLayer, style: rlcPanelButtonStyle, children: ["Layer \u00E2\u20AC\u017E", activeLayer, "\u00E2\u20AC\u009D messen"] }), _jsxs("div", { style: {
                                                    display: "grid",
                                                    gridTemplateColumns: "1fr 1fr 1fr",
                                                    gap: 4,
                                                    padding: "7px 8px",
                                                    border: `1px solid ${cadPalette.border}`,
                                                    borderRadius: 6,
                                                    background: cadPalette.bg2,
                                                    color: cadPalette.sub,
                                                    fontSize: 10,
                                                }, children: [_jsxs("span", { children: ["Auswahl ", _jsx("b", { children: selectedFeatures.length })] }), _jsxs("span", { children: ["L ", _jsx("b", { children: formatNumber(rlcTakeoffLength) }), " m"] }), _jsxs("span", { children: ["F ", _jsx("b", { children: formatNumber(rlcTakeoffArea) }), " m\u00C2\u00B2"] })] }), _jsx("button", { type: "button", onClick: () => void assignSelectionToLvPosition(), disabled: !selectedFeatures.length || !selectedLvPosition || !projectId, style: {
                                                    ...rlcPanelButtonStyle,
                                                    minHeight: 32,
                                                    background: cadPalette.accentSoft,
                                                    borderColor: cadPalette.accent,
                                                    color: "#79c8f5",
                                                }, children: "Position zuordnen" }), _jsxs("details", { children: [_jsx("summary", { style: { padding: "6px 2px", color: cadPalette.sub, fontSize: 10, fontWeight: 900, cursor: "pointer" }, children: "Export" }), _jsxs("div", { style: { display: "grid", gap: 5, marginTop: 4 }, children: [_jsx("button", { type: "button", onClick: exportTakeoffJson, disabled: !features.length, style: rlcPanelButtonStyle, children: "mengenermittlung.json" }), _jsx("button", { type: "button", onClick: exportCsv, disabled: !visibleFeatures.length, style: rlcPanelButtonStyle, children: "mengenermittlung.csv" }), _jsx("button", { type: "button", onClick: () => void exportSnapshotPng(), disabled: !features.length, style: rlcPanelButtonStyle, children: "snapshot.png" })] })] })] })) : (_jsxs("div", { style: { display: "grid", gap: 6 }, children: [_jsx("button", { type: "button", onClick: openPointFile, style: rlcPanelButtonStyle, children: "Punktdatei \u00C3\u00B6ffnen" }), _jsx("button", { type: "button", onClick: () => void loadUtm(), style: rlcPanelButtonStyle, children: "Punkte vom Server laden" }), _jsxs("button", { type: "button", onClick: () => setShowUtm((value) => !value), style: {
                                                    ...rlcPanelButtonStyle,
                                                    background: showUtm ? cadPalette.accentSoft : cadPalette.bg2,
                                                    color: showUtm ? "#79c8f5" : cadPalette.text,
                                                }, children: ["UTM im CAD ", showUtm ? "ausblenden" : "anzeigen"] }), _jsxs("div", { style: {
                                                    padding: 8,
                                                    border: `1px solid ${cadPalette.border}`,
                                                    borderRadius: 6,
                                                    background: cadPalette.bg2,
                                                    color: cadPalette.sub,
                                                    fontSize: 10,
                                                }, children: [utmPoints.length, " UTM-Punkte geladen"] }), _jsx("div", { style: { display: "grid", gap: 4, maxHeight: 360, overflowY: "auto" }, children: utmPoints.slice(0, 80).map((point) => (_jsxs("button", { type: "button", onClick: () => setViewBox((previous) => ({
                                                        ...previous,
                                                        x: point.x - previous.width / 2,
                                                        y: -point.y - previous.height / 2,
                                                    })), style: {
                                                        ...rlcPanelButtonStyle,
                                                        textAlign: "left",
                                                        padding: "5px 7px",
                                                    }, children: [_jsx("b", { children: point.id }), " \u00C2\u00B7 E ", formatNumber(point.x), " \u00C2\u00B7 N ", formatNumber(point.y)] }, `rlc_panel_${point.id}`))) })] }))] }))] })] }), _jsxs("div", { style: {
                    display: "none",
                    gridTemplateColumns: "1.2fr 1fr",
                    gap: 10,
                    marginTop: 10,
                }, children: [_jsx(Card, { title: "CAD Engine", subtitle: "RLC CAD V1 \u00C2\u00B7 aktive Komponenten", children: _jsx("div", { style: {
                                padding: 12,
                                display: "grid",
                                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                gap: 8,
                            }, children: [
                                ["Geometry", `${features.length} Objekte`],
                                ["Layers", `${layerStates.length} Layer`],
                                ["Renderer", "SVG Vektor"],
                                ["Selection", `${selectedFeatureIds.length} gewÃ¤hlt`],
                                ["Snap", snapEnabled ? "Aktiv" : "Aus"],
                                ["Camera", "Zoom / Pan / Fit"],
                                ["Import", "DXF direkt"],
                                ["Export", "RLC / GeoJSON / CSV"],
                                [
                                    "History",
                                    `${undoStackRef.current.length} / ${redoStackRef.current.length}`,
                                ],
                            ].map(([label, value]) => (_jsxs("div", { style: {
                                    minHeight: 62,
                                    padding: 10,
                                    borderRadius: 9,
                                    border: `1px solid ${ui.border}`,
                                    background: ui.panel2,
                                }, children: [_jsx("div", { style: { fontSize: 10, color: ui.sub }, children: label }), _jsx("div", { style: {
                                            marginTop: 5,
                                            fontSize: 12,
                                            color: ui.text,
                                            fontWeight: 900,
                                        }, children: value })] }, label))) }) }), _jsx(Card, { title: "Allgemeine Mengen", subtitle: "Summen der sichtbaren CAD-Objekte", children: _jsxs("div", { style: { padding: 12 }, children: [Array.from(visibleFeatures.reduce((map, f) => {
                                    const layer = String(f.layer || "0");
                                    const row = map.get(layer) || {
                                        layer,
                                        count: 0,
                                        length: 0,
                                        area: 0,
                                    };
                                    row.count += 1;
                                    row.length += Number(f.length || 0);
                                    row.area += Number(f.area || 0);
                                    map.set(layer, row);
                                    return map;
                                }, new Map()))
                                    .map(([, row]) => row)
                                    .sort((a, b) => a.layer.localeCompare(b.layer, "de"))
                                    .map((row) => (_jsxs("div", { style: {
                                        display: "grid",
                                        gridTemplateColumns: "1fr 70px 100px 100px",
                                        gap: 8,
                                        minHeight: 34,
                                        alignItems: "center",
                                        borderBottom: `1px solid ${ui.border}`,
                                        fontSize: 11,
                                    }, children: [_jsx("div", { style: { fontWeight: 850 }, children: row.layer }), _jsxs("div", { style: { color: ui.sub }, children: [row.count, " Obj."] }), _jsxs("div", { style: { textAlign: "right" }, children: [formatNumber(row.length), " m"] }), _jsxs("div", { style: { textAlign: "right" }, children: [formatNumber(row.area), " m\u00C2\u00B2"] })] }, row.layer))), !visibleFeatures.length ? (_jsx("div", { style: { color: ui.sub, fontSize: 12 }, children: "Keine sichtbaren Objekte." })) : null] }) })] }), _jsxs("div", { style: {
                    display: "none",
                    marginTop: 10,
                    minHeight: 40,
                    borderRadius: 12,
                    border: `1px solid ${ui.border}`,
                    background: ui.panel,
                    boxShadow: ui.shadow,
                    padding: "0 12px",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                    fontSize: 11,
                    color: ui.sub,
                }, children: [_jsxs("div", { children: ["Projekt: ", _jsx("b", { style: { color: ui.text }, children: projectId || "â€”" })] }), _jsxs("div", { children: ["LV:", " ", _jsx("b", { style: { color: ui.text }, children: lvState === "ok"
                                    ? `${lvPositions.length} Positionen`
                                    : lvState })] }), _jsxs("div", { children: ["Zeichnung:", " ", _jsx("b", { style: { color: ui.text }, children: takeoff ? `${features.length} Objekte` : "nicht geladen" })] }), _jsxs("div", { children: ["Serverstatus: ", _jsx("b", { style: { color: ui.text }, children: status })] }), _jsxs("div", { title: "Tastaturk\u00C3\u00BCrzel", children: ["K\u00C3\u00BCrzel: ", _jsx("b", { style: { color: ui.text }, children: "F" }), " Fit \u00C2\u00B7 ", _jsx("b", { style: { color: ui.text }, children: "S" }), " Auswahl \u00C2\u00B7 ", _jsx("b", { style: { color: ui.text }, children: "V" }), " Verschieben \u00C2\u00B7 ", _jsx("b", { style: { color: ui.text }, children: "E" }), " St\u00C3\u00BCtzpunkt \u00C2\u00B7 ", _jsx("b", { style: { color: ui.text }, children: "Entf" }), " L\u00C3\u00B6schen \u00C2\u00B7 ", _jsx("b", { style: { color: ui.text }, children: "Ctrl+Z" }), " Zur\u00C3\u00BCck \u00C2\u00B7 ", _jsx("b", { style: { color: ui.text }, children: "Ctrl+Y" }), " Nach vorne \u00C2\u00B7 ", _jsx("b", { style: { color: ui.text }, children: "Rechtsklick" }), " Beenden/Wiederholen \u00C2\u00B7 ", _jsx("b", { style: { color: ui.text }, children: "Ctrl+S" }), " Speichern"] })] })] }));
}
