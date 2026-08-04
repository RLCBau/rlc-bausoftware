/*
 * RLC CAD Engine V1
 * Framework-independent geometry core used by the React editor.
 * BricsCAD is deliberately not referenced here.
 */
export function rebaseCadPoint(point, origin) {
    return {
        x: point.x - origin.x,
        y: point.y - origin.y,
    };
}
export function restoreCadPoint(point, origin) {
    return {
        x: point.x + origin.x,
        y: point.y + origin.y,
    };
}
export function rebaseCadViewBox(viewBox, origin) {
    return {
        x: viewBox.x - origin.x,
        y: viewBox.y - origin.y,
        width: viewBox.width,
        height: viewBox.height,
    };
}
export function zoomCadViewBox(previous, factor, anchorRatio) {
    const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
    const rx = Math.max(0, Math.min(1, Number(anchorRatio.x) || 0));
    const ry = Math.max(0, Math.min(1, Number(anchorRatio.y) || 0));
    const nextWidth = Math.max(0.001, Math.min(1e12, previous.width * safeFactor));
    const nextHeight = Math.max(0.001, Math.min(1e12, previous.height * safeFactor));
    const anchorX = previous.x + previous.width * rx;
    const anchorY = previous.y + previous.height * ry;
    return {
        x: anchorX - nextWidth * rx,
        y: anchorY - nextHeight * ry,
        width: nextWidth,
        height: nextHeight,
    };
}
const EPSILON = 1e-9;
function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
}
function featureLength(points, closed) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        total += distance(points[index - 1], points[index]);
    }
    if (closed && points.length > 2) {
        total += distance(points[points.length - 1], points[0]);
    }
    return total;
}
function featureArea(points) {
    if (points.length < 3)
        return 0;
    let sum = 0;
    for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        sum += current.x * next.y - next.x * current.y;
    }
    return Math.abs(sum) / 2;
}
function normalizePoint(point) {
    const candidate = point;
    const x = Number(candidate?.x);
    const y = Number(candidate?.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
export function createCadId(prefix = "CAD") {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `${prefix}_${Date.now().toString(36).toUpperCase()}_${random}`;
}
export function cloneCadFeatures(features) {
    return features.map((feature) => ({
        ...feature,
        pts: (feature.pts || []).map((point) => ({ ...point })),
        style: feature.style ? { ...feature.style } : undefined,
        meta: feature.meta ? { ...feature.meta } : undefined,
    }));
}
export function recalculateCadFeature(feature, fallbackIndex = 0) {
    const points = Array.isArray(feature.pts)
        ? feature.pts.map(normalizePoint).filter((point) => Boolean(point))
        : [];
    const kind = feature.kind ||
        (feature.closed ? "polygon" : points.length === 1 ? "point" : "polyline");
    const closed = Boolean(feature.closed || kind === "polygon");
    const radius = Math.max(0, finite(feature.radius));
    const suppliedLength = Math.max(0, finite(feature.length));
    const suppliedArea = Math.max(0, finite(feature.area));
    const length = kind === "circle"
        ? Math.PI * radius * 2
        : points.length > 1
            ? featureLength(points, closed)
            : suppliedLength;
    const area = kind === "circle"
        ? Math.PI * radius * radius
        : closed && points.length > 2
            ? featureArea(points)
            : suppliedArea;
    return {
        ...feature,
        id: String(feature.id || createCadId(`F${fallbackIndex + 1}`)),
        kind,
        layer: String(feature.layer || "0"),
        pts: points,
        closed,
        radius: kind === "circle" ? radius : feature.radius,
        length,
        area,
    };
}
export function normalizeCadFeatures(payload) {
    const source = payload;
    const candidates = Array.isArray(source?.features)
        ? source.features
        : Array.isArray(source?.normalized?.features)
            ? source.normalized.features
            : Array.isArray(source?.data?.features)
                ? source.data.features
                : Array.isArray(source?.data?.entities)
                    ? source.data.entities
                    : Array.isArray(source?.entities)
                        ? source.entities
                        : Array.isArray(source?.rows)
                            ? source.rows
                            : Array.isArray(source?.data?.rows)
                                ? source.data.rows
                                : Array.isArray(source?.takeoff)
                                    ? source.takeoff
                                    : [];
    return candidates.map((rawFeature, index) => {
        const rawPoints = rawFeature?.pts ||
            rawFeature?.points ||
            rawFeature?.vertices ||
            rawFeature?.geometry?.points ||
            rawFeature?.geometry?.coordinates ||
            [];
        const pts = Array.isArray(rawPoints)
            ? rawPoints
                .map((point) => Array.isArray(point)
                ? normalizePoint({ x: point[0], y: point[1] })
                : normalizePoint(point))
                .filter((point) => Boolean(point))
            : [];
        const rawType = String(rawFeature?.kind ||
            rawFeature?.type ||
            rawFeature?.entityType ||
            rawFeature?.EntityType ||
            "").toLowerCase();
        const kind = rawType.includes("circle") || rawType.includes("kreis")
            ? "circle"
            : rawType.includes("point") || rawType.includes("punkt")
                ? "point"
                : rawType.includes("text")
                    ? "text"
                    : rawType.includes("polygon") || Boolean(rawFeature?.closed)
                        ? "polygon"
                        : rawType.includes("line") && pts.length === 2
                            ? "line"
                            : "polyline";
        const lvPos = rawFeature?.meta?.lvPos ??
            rawFeature?.meta?.LvPos ??
            rawFeature?.lvPos ??
            rawFeature?.LvPos ??
            "";
        const lvText = rawFeature?.meta?.lvText ??
            rawFeature?.meta?.LvText ??
            rawFeature?.lvText ??
            rawFeature?.LvText ??
            "";
        return recalculateCadFeature({
            ...rawFeature,
            id: rawFeature?.id ||
                rawFeature?.handle ||
                rawFeature?.Handle ||
                `F_${index + 1}`,
            kind,
            layer: rawFeature?.layer || rawFeature?.Layer || "0",
            name: rawFeature?.name ||
                rawFeature?.Name ||
                rawFeature?.label ||
                lvText ||
                undefined,
            pts,
            closed: Boolean(rawFeature?.closed ||
                rawFeature?.Closed ||
                kind === "polygon"),
            radius: rawFeature?.radius ??
                rawFeature?.Radius ??
                rawFeature?.geometry?.radius,
            text: rawFeature?.text || rawFeature?.Text,
            length: rawFeature?.length ??
                rawFeature?.Length ??
                rawFeature?.laenge ??
                rawFeature?.Laenge,
            area: rawFeature?.area ??
                rawFeature?.Area ??
                rawFeature?.flaeche ??
                rawFeature?.Flaeche,
            meta: {
                ...(rawFeature?.meta || {}),
                ...(lvPos ? { lvPos: String(lvPos) } : {}),
                ...(lvText ? { lvText: String(lvText) } : {}),
                source: rawFeature?.meta?.source || "RLC Mengenermittlung",
            },
        }, index);
    });
}
export function createCadDocument(projectId, features, source) {
    return {
        schema: "rlc-cad",
        schemaVersion: 1,
        projectId,
        updatedAt: new Date().toISOString(),
        source,
        features: cloneCadFeatures(features).map(recalculateCadFeature),
    };
}
export function translateCadFeatures(features, selectedIds, dx, dy) {
    const selected = new Set(selectedIds);
    return features.map((feature, index) => {
        if (!selected.has(String(feature.id || "")))
            return feature;
        return recalculateCadFeature({
            ...feature,
            pts: (feature.pts || []).map((point) => ({
                x: point.x + dx,
                y: point.y + dy,
            })),
        }, index);
    });
}
export function setCadVertex(features, featureId, vertexIndex, point) {
    return features.map((feature, index) => {
        if (String(feature.id || "") !== featureId)
            return feature;
        const points = (feature.pts || []).map((candidate, candidateIndex) => candidateIndex === vertexIndex ? { ...point } : candidate);
        return recalculateCadFeature({ ...feature, pts: points }, index);
    });
}
export function duplicateCadFeatures(features, selectedIds, dx = 0, dy = 0) {
    const selected = new Set(selectedIds);
    const copies = [];
    const copiedIds = [];
    features.forEach((feature, index) => {
        if (!selected.has(String(feature.id || "")))
            return;
        const copiedId = createCadId("COPY");
        copiedIds.push(copiedId);
        copies.push(recalculateCadFeature({
            ...feature,
            id: copiedId,
            pts: (feature.pts || []).map((point) => ({
                x: point.x + dx,
                y: point.y + dy,
            })),
            style: feature.style ? { ...feature.style } : undefined,
            meta: {
                ...(feature.meta || {}),
                copiedFrom: String(feature.id || ""),
            },
        }, features.length + index));
    });
    return {
        features: [...features, ...copies],
        copiedIds,
    };
}
export function rotateCadFeatures(features, selectedIds, center, angleDegrees) {
    const selected = new Set(selectedIds);
    const angle = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return features.map((feature, index) => {
        if (!selected.has(String(feature.id || "")))
            return feature;
        return recalculateCadFeature({
            ...feature,
            rotation: Number(feature.rotation || 0) + angleDegrees,
            pts: (feature.pts || []).map((point) => {
                const x = point.x - center.x;
                const y = point.y - center.y;
                return {
                    x: center.x + x * cos - y * sin,
                    y: center.y + x * sin + y * cos,
                };
            }),
        }, index);
    });
}
export function scaleCadFeatures(features, selectedIds, center, factor) {
    if (!Number.isFinite(factor) || Math.abs(factor) < EPSILON)
        return features;
    const selected = new Set(selectedIds);
    return features.map((feature, index) => {
        if (!selected.has(String(feature.id || "")))
            return feature;
        const height = Number(feature.meta?.height || 0);
        return recalculateCadFeature({
            ...feature,
            radius: feature.kind === "circle"
                ? Math.abs(Number(feature.radius || 0) * factor)
                : feature.radius,
            pts: (feature.pts || []).map((point) => ({
                x: center.x + (point.x - center.x) * factor,
                y: center.y + (point.y - center.y) * factor,
            })),
            meta: {
                ...(feature.meta || {}),
                ...(height
                    ? { height: Math.abs(height * factor) }
                    : {}),
            },
        }, index);
    });
}
function unitNormal(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < EPSILON)
        return { x: 0, y: 0 };
    return { x: -dy / length, y: dx / length };
}
function offsetPolylinePoints(points, closed, amount) {
    if (points.length < 2 || Math.abs(amount) < EPSILON) {
        return points.map((point) => ({ ...point }));
    }
    const segmentCount = closed ? points.length : points.length - 1;
    const normals = Array.from({ length: segmentCount }, (_, index) => unitNormal(points[index], points[(index + 1) % points.length]));
    return points.map((point, index) => {
        if (!closed && index === 0) {
            return {
                x: point.x + normals[0].x * amount,
                y: point.y + normals[0].y * amount,
            };
        }
        if (!closed && index === points.length - 1) {
            const normal = normals[normals.length - 1];
            return {
                x: point.x + normal.x * amount,
                y: point.y + normal.y * amount,
            };
        }
        const previous = normals[(index - 1 + normals.length) % normals.length];
        const next = normals[index % normals.length];
        const sum = { x: previous.x + next.x, y: previous.y + next.y };
        const sumLength = Math.hypot(sum.x, sum.y);
        if (sumLength < EPSILON) {
            return {
                x: point.x + next.x * amount,
                y: point.y + next.y * amount,
            };
        }
        const miter = { x: sum.x / sumLength, y: sum.y / sumLength };
        const denominator = Math.max(0.25, Math.abs(miter.x * next.x + miter.y * next.y));
        const miterAmount = Math.min(Math.abs(amount) * 4, Math.abs(amount / denominator));
        const signedAmount = amount < 0 ? -miterAmount : miterAmount;
        return {
            x: point.x + miter.x * signedAmount,
            y: point.y + miter.y * signedAmount,
        };
    });
}
export function offsetCadFeatures(features, selectedIds, amount) {
    const selected = new Set(selectedIds);
    const created = [];
    const createdIds = [];
    features.forEach((feature, index) => {
        const id = String(feature.id || "");
        const points = feature.pts || [];
        if (!selected.has(id) ||
            points.length < 2 ||
            feature.kind === "circle" ||
            feature.kind === "point" ||
            feature.kind === "text") {
            return;
        }
        const createdId = createCadId("OFFSET");
        createdIds.push(createdId);
        created.push(recalculateCadFeature({
            ...feature,
            id: createdId,
            pts: offsetPolylinePoints(points, Boolean(feature.closed), amount),
            meta: {
                ...(feature.meta || {}),
                offsetFrom: id,
                offsetDistance: amount,
            },
        }, features.length + index));
    });
    return {
        features: [...features, ...created],
        createdIds,
    };
}
export function findCadSnap(cursor, features, tolerance, excludedFeatureIds = []) {
    const excluded = new Set(excludedFeatureIds);
    let best = null;
    const consider = (point, kind, featureId) => {
        const candidateDistance = distance(cursor, point);
        if (candidateDistance > tolerance)
            return;
        if (!best || candidateDistance < best.distance) {
            best = {
                point: { ...point },
                kind,
                featureId,
                distance: candidateDistance,
            };
        }
    };
    for (const feature of features) {
        const featureId = String(feature.id || "");
        if (!featureId || excluded.has(featureId))
            continue;
        const points = feature.pts || [];
        if (!points.length)
            continue;
        if (feature.kind === "circle" || feature.kind === "point") {
            consider(points[0], "center", featureId);
        }
        points.forEach((point, index) => {
            const endpoint = index === 0 || index === points.length - 1;
            consider(point, endpoint ? "endpoint" : "vertex", featureId);
        });
        for (let index = 1; index < points.length; index += 1) {
            consider({
                x: (points[index - 1].x + points[index].x) / 2,
                y: (points[index - 1].y + points[index].y) / 2,
            }, "midpoint", featureId);
        }
        if (feature.closed && points.length > 2) {
            consider({
                x: (points[points.length - 1].x + points[0].x) / 2,
                y: (points[points.length - 1].y + points[0].y) / 2,
            }, "midpoint", featureId);
        }
    }
    return best;
}
function parseDxfPairs(source) {
    const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
    const pairs = [];
    for (let index = 0; index + 1 < lines.length; index += 2) {
        const code = Number(lines[index].trim());
        if (!Number.isFinite(code))
            continue;
        pairs.push({ code, value: lines[index + 1].trim() });
    }
    return pairs;
}
function firstValue(pairs, code, fallback = "") {
    return pairs.find((pair) => pair.code === code)?.value ?? fallback;
}
function numericValue(pairs, code, fallback = 0) {
    return finite(firstValue(pairs, code), fallback);
}
function decodeDxfText(pairs) {
    const raw = pairs
        .filter((pair) => pair.code === 1 || pair.code === 3)
        .map((pair) => pair.value)
        .join("");
    return raw
        .replace(/\\U\+([0-9a-f]{4,8})/gi, (_match, hex) => {
        const codePoint = Number.parseInt(hex, 16);
        try {
            return Number.isFinite(codePoint)
                ? String.fromCodePoint(codePoint)
                : "";
        }
        catch {
            return "";
        }
    })
        .replace(/%%d/gi, "°")
        .replace(/%%p/gi, "±")
        .replace(/%%c/gi, "Ø")
        .replace(/\\P/gi, "\n")
        .replace(/\\S([^;]*?)[#^/]([^;]*);/gi, "$1/$2")
        .replace(/\\[ACFHQTW][^;]*;/gi, "")
        .replace(/\\[LlOoKk]/g, "")
        .replace(/\\~/g, " ")
        .replace(/\\\\/g, "\\")
        .replace(/[{}]/g, "")
        .replace(/\u0000/g, "")
        .trim();
}
function indexedPoint(pairs, xCode, yCode, scale) {
    const xPair = pairs.find((pair) => pair.code === xCode);
    const yPair = pairs.find((pair) => pair.code === yCode);
    if (!xPair || !yPair)
        return null;
    return {
        x: finite(xPair.value) * scale,
        y: finite(yPair.value) * scale,
    };
}
function repeatedVertices(pairs, scale) {
    const vertices = [];
    let current = null;
    const flush = () => {
        if (current && current.y !== null) {
            vertices.push({
                point: { x: current.x, y: current.y },
                bulge: current.bulge,
            });
        }
    };
    for (const pair of pairs) {
        if (pair.code === 10) {
            flush();
            current = {
                x: finite(pair.value) * scale,
                y: null,
                bulge: 0,
            };
        }
        else if (pair.code === 20 && current) {
            current.y = finite(pair.value) * scale;
        }
        else if (pair.code === 42 && current) {
            current.bulge = finite(pair.value);
        }
    }
    flush();
    return vertices;
}
function repeatedPoints(pairs, xCode, yCode, scale) {
    const points = [];
    let current = null;
    const flush = () => {
        if (current && current.y !== null) {
            points.push({ x: current.x, y: current.y });
        }
    };
    for (const pair of pairs) {
        if (pair.code === xCode) {
            flush();
            current = { x: finite(pair.value) * scale, y: null };
        }
        else if (pair.code === yCode && current) {
            current.y = finite(pair.value) * scale;
        }
    }
    flush();
    return points;
}
function dxfUnitScale(pairs) {
    const unitScales = {
        0: 1,
        1: 0.0254,
        2: 0.3048,
        3: 1609.344,
        4: 0.001,
        5: 0.01,
        6: 1,
        7: 1000,
        8: 0.0000000254,
        9: 0.0000254,
        10: 0.9144,
        11: 0.0000001,
        12: 0.000000001,
        13: 0.000000000001,
        14: 0.1,
        15: 10,
        16: 100,
        17: 1000000000,
        18: 149597870700,
        19: 9460730472580800,
        20: 30856775814913670,
    };
    for (let index = 0; index < pairs.length - 1; index += 1) {
        if (pairs[index].code !== 9 || pairs[index].value !== "$INSUNITS")
            continue;
        for (let lookAhead = index + 1; lookAhead < Math.min(index + 6, pairs.length); lookAhead += 1) {
            if (pairs[lookAhead].code === 70) {
                const unitCode = Math.trunc(finite(pairs[lookAhead].value));
                return { unitCode, scale: unitScales[unitCode] ?? 1 };
            }
        }
    }
    return { unitCode: 0, scale: 1 };
}
function dxfAciColor(value) {
    const aci = {
        1: "#ff4d4f",
        2: "#ffd43b",
        3: "#51cf66",
        4: "#22d3ee",
        5: "#4dabf7",
        6: "#e649f5",
        7: "#e5e7eb",
        8: "#94a3b8",
        9: "#d1d5db",
    };
    return aci[Math.abs(Math.trunc(value))] || undefined;
}
function dxfTrueColor(value) {
    const color = Math.max(0, Math.trunc(value));
    if (!color)
        return undefined;
    return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}
function dxfLayerStyles(pairs) {
    const styles = new Map();
    for (let index = 0; index < pairs.length; index += 1) {
        if (pairs[index].code !== 0 ||
            pairs[index].value.toUpperCase() !== "LAYER") {
            continue;
        }
        const entityPairs = [];
        index += 1;
        while (index < pairs.length && pairs[index].code !== 0) {
            entityPairs.push(pairs[index]);
            index += 1;
        }
        index -= 1;
        const name = firstValue(entityPairs, 2);
        if (!name)
            continue;
        const trueColor = numericValue(entityPairs, 420);
        const aciColor = numericValue(entityPairs, 62);
        styles.set(name, {
            color: dxfTrueColor(trueColor) || dxfAciColor(aciColor),
            lineType: firstValue(entityPairs, 6) || undefined,
            lineWeight: numericValue(entityPairs, 370) || undefined,
        });
    }
    return styles;
}
function extractEntityBlocks(pairs) {
    const entitiesMarker = pairs.findIndex((pair, index) => pair.code === 2 &&
        pair.value.toUpperCase() === "ENTITIES" &&
        pairs[index - 1]?.code === 0 &&
        pairs[index - 1]?.value.toUpperCase() === "SECTION");
    if (entitiesMarker < 0) {
        throw new Error("DXF ENTITIES-Sektion nicht gefunden.");
    }
    const blocks = [];
    let index = entitiesMarker + 1;
    while (index < pairs.length) {
        const pair = pairs[index];
        if (pair.code === 0 && pair.value.toUpperCase() === "ENDSEC")
            break;
        if (pair.code !== 0) {
            index += 1;
            continue;
        }
        const type = pair.value.toUpperCase();
        const entityPairs = [];
        index += 1;
        while (index < pairs.length && pairs[index].code !== 0) {
            entityPairs.push(pairs[index]);
            index += 1;
        }
        blocks.push({ type, pairs: entityPairs });
    }
    return blocks;
}
function extractBlockDefinitions(pairs, scale) {
    const definitions = new Map();
    const blocksMarker = pairs.findIndex((pair, index) => pair.code === 2 &&
        pair.value.toUpperCase() === "BLOCKS" &&
        pairs[index - 1]?.code === 0 &&
        pairs[index - 1]?.value.toUpperCase() === "SECTION");
    if (blocksMarker < 0)
        return definitions;
    let index = blocksMarker + 1;
    while (index < pairs.length) {
        const pair = pairs[index];
        if (pair.code === 0 && pair.value.toUpperCase() === "ENDSEC")
            break;
        if (pair.code !== 0 || pair.value.toUpperCase() !== "BLOCK") {
            index += 1;
            continue;
        }
        const header = [];
        index += 1;
        while (index < pairs.length && pairs[index].code !== 0) {
            header.push(pairs[index]);
            index += 1;
        }
        const name = firstValue(header, 2) || firstValue(header, 3);
        const basePoint = indexedPoint(header, 10, 20, scale) || { x: 0, y: 0 };
        const entities = [];
        while (index < pairs.length) {
            const marker = pairs[index];
            if (marker.code !== 0) {
                index += 1;
                continue;
            }
            const type = marker.value.toUpperCase();
            if (type === "ENDBLK") {
                index += 1;
                while (index < pairs.length && pairs[index].code !== 0)
                    index += 1;
                break;
            }
            const entityPairs = [];
            index += 1;
            while (index < pairs.length && pairs[index].code !== 0) {
                entityPairs.push(pairs[index]);
                index += 1;
            }
            entities.push({ type, pairs: entityPairs });
        }
        if (name) {
            definitions.set(name, { name, basePoint, entities });
        }
    }
    return definitions;
}
function baseDxfMeta(block, fileName, unitCode, layerStyle) {
    const layout = firstValue(block.pairs, 410);
    const paperSpace = Math.trunc(numericValue(block.pairs, 67)) === 1 ||
        Boolean(layout && layout.toLowerCase() !== "model");
    const entityTrueColor = numericValue(block.pairs, 420);
    const entityAciColor = numericValue(block.pairs, 62);
    return {
        source: "DXF",
        sourceFile: fileName,
        dxfType: block.type,
        dxfHandle: firstValue(block.pairs, 5),
        dxfUnitCode: unitCode,
        layout: layout || (paperSpace ? "Paper Space" : "Model"),
        paperSpace,
        color: dxfTrueColor(entityTrueColor) ||
            dxfAciColor(entityAciColor) ||
            layerStyle?.color,
        lineType: firstValue(block.pairs, 6) || layerStyle?.lineType,
        lineWeight: numericValue(block.pairs, 370) || layerStyle?.lineWeight || undefined,
    };
}
function arcPoints(center, radius, startDegrees, endDegrees) {
    let sweep = endDegrees - startDegrees;
    while (sweep <= 0)
        sweep += 360;
    const segments = Math.max(8, Math.min(144, Math.ceil(sweep / 5)));
    const points = [];
    for (let index = 0; index <= segments; index += 1) {
        const degrees = startDegrees + (sweep * index) / segments;
        const radians = (degrees * Math.PI) / 180;
        points.push({
            x: center.x + Math.cos(radians) * radius,
            y: center.y + Math.sin(radians) * radius,
        });
    }
    return points;
}
function bulgeArcPoints(start, end, bulge) {
    if (Math.abs(bulge) < EPSILON || distance(start, end) < EPSILON) {
        return [{ ...start }, { ...end }];
    }
    const chord = distance(start, end);
    const middle = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
    };
    const nx = -(end.y - start.y) / chord;
    const ny = (end.x - start.x) / chord;
    const centerDistance = (chord * (1 - bulge * bulge)) / (4 * bulge);
    const center = {
        x: middle.x + nx * centerDistance,
        y: middle.y + ny * centerDistance,
    };
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const sweep = 4 * Math.atan(bulge);
    const segments = Math.max(4, Math.min(180, Math.ceil(Math.abs(sweep) / (Math.PI / 36))));
    const radius = distance(center, start);
    const points = [];
    for (let index = 0; index <= segments; index += 1) {
        const angle = startAngle + (sweep * index) / segments;
        points.push({
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius,
        });
    }
    points[0] = { ...start };
    points[points.length - 1] = { ...end };
    return points;
}
function flattenBulgedPolyline(vertices, closed) {
    if (vertices.length < 2)
        return vertices.map((vertex) => vertex.point);
    const points = [{ ...vertices[0].point }];
    const segmentCount = closed ? vertices.length : vertices.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
        const start = vertices[index];
        const end = vertices[(index + 1) % vertices.length];
        const segment = bulgeArcPoints(start.point, end.point, start.bulge);
        points.push(...segment.slice(1));
    }
    if (closed &&
        points.length > 1 &&
        distance(points[0], points[points.length - 1]) < EPSILON) {
        points.pop();
    }
    return points;
}
const IDENTITY_MATRIX = {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: 0,
    f: 0,
};
function applyDxfMatrix(matrix, point) {
    return {
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    };
}
function multiplyDxfMatrices(parent, local) {
    return {
        a: parent.a * local.a + parent.c * local.b,
        b: parent.b * local.a + parent.d * local.b,
        c: parent.a * local.c + parent.c * local.d,
        d: parent.b * local.c + parent.d * local.d,
        e: parent.a * local.e + parent.c * local.f + parent.e,
        f: parent.b * local.e + parent.d * local.f + parent.f,
    };
}
function insertDxfMatrix(insertion, basePoint, scaleX, scaleY, rotationDegrees) {
    const angle = (rotationDegrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const a = cos * scaleX;
    const b = sin * scaleX;
    const c = -sin * scaleY;
    const d = cos * scaleY;
    return {
        a,
        b,
        c,
        d,
        e: insertion.x - a * basePoint.x - c * basePoint.y,
        f: insertion.y - b * basePoint.x - d * basePoint.y,
    };
}
function transformDxfFeature(feature, matrix, fallbackIndex) {
    const points = feature.pts || [];
    const rotationDelta = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
    if (feature.kind === "circle" && points[0] && Number(feature.radius || 0) > 0) {
        const center = points[0];
        const radius = Number(feature.radius || 0);
        const transformedCenter = applyDxfMatrix(matrix, center);
        const xRadius = distance(transformedCenter, applyDxfMatrix(matrix, { x: center.x + radius, y: center.y }));
        const yRadius = distance(transformedCenter, applyDxfMatrix(matrix, { x: center.x, y: center.y + radius }));
        if (Math.abs(xRadius - yRadius) <= Math.max(xRadius, yRadius) * 1e-6) {
            return recalculateCadFeature({
                ...feature,
                pts: [transformedCenter],
                radius: (xRadius + yRadius) / 2,
            }, fallbackIndex);
        }
        const ellipsePoints = Array.from({ length: 96 }, (_, index) => {
            const angle = (Math.PI * 2 * index) / 96;
            return applyDxfMatrix(matrix, {
                x: center.x + Math.cos(angle) * radius,
                y: center.y + Math.sin(angle) * radius,
            });
        });
        return recalculateCadFeature({
            ...feature,
            kind: "polygon",
            name: feature.name || "Ellipse",
            pts: ellipsePoints,
            closed: true,
            radius: undefined,
            meta: {
                ...(feature.meta || {}),
                transformedCircle: true,
            },
        }, fallbackIndex);
    }
    const height = Number(feature.meta?.height || 0);
    const xScale = Math.hypot(matrix.a, matrix.b);
    const yScale = Math.hypot(matrix.c, matrix.d);
    return recalculateCadFeature({
        ...feature,
        pts: points.map((point) => applyDxfMatrix(matrix, point)),
        rotation: feature.kind === "text"
            ? Number(feature.rotation || 0) + rotationDelta
            : feature.rotation,
        meta: {
            ...(feature.meta || {}),
            ...(height
                ? { height: height * Math.max((xScale + yScale) / 2, EPSILON) }
                : {}),
        },
    }, fallbackIndex);
}
function ellipsePoints(center, majorAxis, ratio, startParameter, endParameter) {
    let sweep = endParameter - startParameter;
    while (sweep <= 0)
        sweep += Math.PI * 2;
    const majorLength = Math.hypot(majorAxis.x, majorAxis.y);
    if (majorLength < EPSILON)
        return [];
    const minorAxis = {
        x: (-majorAxis.y / majorLength) * majorLength * ratio,
        y: (majorAxis.x / majorLength) * majorLength * ratio,
    };
    const segments = Math.max(24, Math.min(240, Math.ceil(Math.abs(sweep) / (Math.PI / 72))));
    return Array.from({ length: segments + 1 }, (_, index) => {
        const parameter = startParameter + (sweep * index) / segments;
        return {
            x: center.x +
                majorAxis.x * Math.cos(parameter) +
                minorAxis.x * Math.sin(parameter),
            y: center.y +
                majorAxis.y * Math.cos(parameter) +
                minorAxis.y * Math.sin(parameter),
        };
    });
}
function clampedUniformKnots(controlPointCount, degree) {
    const knotCount = controlPointCount + degree + 1;
    const finalValue = Math.max(1, controlPointCount - degree);
    return Array.from({ length: knotCount }, (_, index) => {
        if (index <= degree)
            return 0;
        if (index >= controlPointCount)
            return finalValue;
        return index - degree;
    });
}
function deBoorPoint(controlPoints, knots, degree, parameter) {
    const lastControlIndex = controlPoints.length - 1;
    const endParameter = knots[lastControlIndex + 1];
    let span = degree;
    if (parameter >= endParameter) {
        span = lastControlIndex;
    }
    else {
        for (let index = degree; index <= lastControlIndex; index += 1) {
            if (parameter >= knots[index] && parameter < knots[index + 1]) {
                span = index;
                break;
            }
        }
    }
    const work = Array.from({ length: degree + 1 }, (_, index) => ({
        ...controlPoints[span - degree + index],
    }));
    for (let level = 1; level <= degree; level += 1) {
        for (let index = degree; index >= level; index -= 1) {
            const knotIndex = span - degree + index;
            const denominator = knots[knotIndex + degree - level + 1] - knots[knotIndex];
            const alpha = Math.abs(denominator) < EPSILON
                ? 0
                : (parameter - knots[knotIndex]) / denominator;
            work[index] = {
                x: work[index - 1].x * (1 - alpha) + work[index].x * alpha,
                y: work[index - 1].y * (1 - alpha) + work[index].y * alpha,
            };
        }
    }
    return work[degree];
}
function splinePoints(pairs, scale) {
    const controlPoints = repeatedVertices(pairs, scale).map((vertex) => vertex.point);
    if (controlPoints.length < 2)
        return controlPoints;
    const requestedDegree = Math.trunc(numericValue(pairs, 71, 3));
    const degree = Math.max(1, Math.min(requestedDegree, controlPoints.length - 1));
    const rawKnots = pairs
        .filter((pair) => pair.code === 40)
        .map((pair) => finite(pair.value));
    const requiredKnotCount = controlPoints.length + degree + 1;
    const knots = rawKnots.length >= requiredKnotCount
        ? rawKnots.slice(0, requiredKnotCount)
        : clampedUniformKnots(controlPoints.length, degree);
    const start = knots[degree];
    const end = knots[controlPoints.length];
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return controlPoints;
    }
    const nonZeroSpans = Math.max(1, knots
        .slice(degree, controlPoints.length + 1)
        .filter((value, index, values) => index > 0 && value > values[index - 1])
        .length);
    const sampleCount = Math.max(24, Math.min(720, nonZeroSpans * 16));
    return Array.from({ length: sampleCount + 1 }, (_, index) => deBoorPoint(controlPoints, knots, degree, start + ((end - start) * index) / sampleCount));
}
export function parseAsciiDxf(source, fileName = "drawing.dxf") {
    if (!source.trim())
        throw new Error("Die DXF-Datei ist leer.");
    const pairs = parseDxfPairs(source);
    const { unitCode, scale } = dxfUnitScale(pairs);
    const layerStyles = dxfLayerStyles(pairs);
    const blocks = extractEntityBlocks(pairs);
    const blockDefinitions = extractBlockDefinitions(pairs, scale);
    const features = [];
    const unsupportedTypes = new Set();
    let modelSpaceCount = 0;
    let paperSpaceCount = 0;
    let generatedIndex = 0;
    const emitBlocks = (entityBlocks, inheritedLayer = "", matrix = IDENTITY_MATRIX, idPrefix = "DXF", depth = 0, inheritedPaperSpace = false, inheritedLayout = "Model") => {
        if (depth > 8)
            return;
        for (let index = 0; index < entityBlocks.length; index += 1) {
            const block = entityBlocks[index];
            const rawLayer = firstValue(block.pairs, 8, "0");
            const layer = inheritedLayer && rawLayer === "0" ? inheritedLayer : rawLayer;
            const handle = firstValue(block.pairs, 5, `${index + 1}`);
            const id = `${idPrefix}_${handle}_${generatedIndex + 1}`;
            const meta = baseDxfMeta(block, fileName, unitCode, layerStyles.get(layer));
            if (depth > 0) {
                meta.paperSpace = inheritedPaperSpace;
                meta.layout = inheritedLayout;
            }
            const style = {
                color: String(meta.color || "") || undefined,
                lineType: String(meta.lineType || "") || undefined,
                lineWeight: Number(meta.lineWeight || 0) || undefined,
            };
            if (depth === 0) {
                if (meta.paperSpace)
                    paperSpaceCount += 1;
                else
                    modelSpaceCount += 1;
            }
            const push = (feature) => {
                generatedIndex += 1;
                features.push(transformDxfFeature({
                    ...feature,
                    id,
                    layer,
                    style: feature.style || style,
                    meta: {
                        ...meta,
                        ...(feature.meta || {}),
                    },
                }, matrix, generatedIndex));
            };
            if (block.type === "LINE") {
                const start = indexedPoint(block.pairs, 10, 20, scale);
                const end = indexedPoint(block.pairs, 11, 21, scale);
                if (start && end)
                    push({ kind: "line", pts: [start, end] });
                continue;
            }
            if (block.type === "LWPOLYLINE") {
                const closed = (Math.trunc(numericValue(block.pairs, 70)) & 1) === 1;
                const vertices = repeatedVertices(block.pairs, scale);
                const points = flattenBulgedPolyline(vertices, closed);
                if (points.length) {
                    push({
                        kind: closed ? "polygon" : "polyline",
                        pts: points,
                        closed,
                        meta: {
                            bulgeSegments: vertices.filter((vertex) => Math.abs(vertex.bulge) > EPSILON).length,
                        },
                    });
                }
                continue;
            }
            if (block.type === "POLYLINE") {
                const vertices = [];
                const closed = (Math.trunc(numericValue(block.pairs, 70)) & 1) === 1;
                let cursor = index + 1;
                while (cursor < entityBlocks.length &&
                    entityBlocks[cursor].type === "VERTEX") {
                    const point = indexedPoint(entityBlocks[cursor].pairs, 10, 20, scale);
                    if (point) {
                        vertices.push({
                            point,
                            bulge: numericValue(entityBlocks[cursor].pairs, 42),
                        });
                    }
                    cursor += 1;
                }
                const points = flattenBulgedPolyline(vertices, closed);
                if (points.length) {
                    push({
                        kind: closed ? "polygon" : "polyline",
                        pts: points,
                        closed,
                        meta: {
                            bulgeSegments: vertices.filter((vertex) => Math.abs(vertex.bulge) > EPSILON).length,
                        },
                    });
                }
                index = Math.max(index, cursor - 1);
                continue;
            }
            if (block.type === "CIRCLE") {
                const center = indexedPoint(block.pairs, 10, 20, scale);
                const radius = numericValue(block.pairs, 40) * scale;
                if (center && radius > EPSILON) {
                    push({ kind: "circle", pts: [center], radius });
                }
                continue;
            }
            if (block.type === "ARC") {
                const center = indexedPoint(block.pairs, 10, 20, scale);
                const radius = numericValue(block.pairs, 40) * scale;
                if (center && radius > EPSILON) {
                    push({
                        kind: "polyline",
                        name: "Bogen",
                        pts: arcPoints(center, radius, numericValue(block.pairs, 50), numericValue(block.pairs, 51)),
                    });
                }
                continue;
            }
            if (block.type === "ELLIPSE") {
                const center = indexedPoint(block.pairs, 10, 20, scale);
                const majorAxis = indexedPoint(block.pairs, 11, 21, scale);
                if (center && majorAxis) {
                    const startParameter = numericValue(block.pairs, 41, 0);
                    const endParameter = numericValue(block.pairs, 42, Math.PI * 2);
                    const points = ellipsePoints(center, majorAxis, Math.abs(numericValue(block.pairs, 40, 1)), startParameter, endParameter);
                    const closed = Math.abs(endParameter - startParameter) >= Math.PI * 2 - 1e-6;
                    if (points.length) {
                        if (closed &&
                            distance(points[0], points[points.length - 1]) < EPSILON) {
                            points.pop();
                        }
                        push({
                            kind: closed ? "polygon" : "polyline",
                            name: "Ellipse",
                            pts: points,
                            closed,
                        });
                    }
                }
                continue;
            }
            if (block.type === "INSERT" || block.type === "DIMENSION") {
                const blockName = firstValue(block.pairs, 2);
                const definition = blockDefinitions.get(blockName);
                const insertion = indexedPoint(block.pairs, 10, 20, scale) || { x: 0, y: 0 };
                if (definition) {
                    const scaleX = numericValue(block.pairs, 41, 1) || 1;
                    const scaleY = numericValue(block.pairs, 42, 1) || 1;
                    const rotation = numericValue(block.pairs, 50);
                    const columns = Math.max(1, Math.trunc(numericValue(block.pairs, 70, 1)));
                    const rows = Math.max(1, Math.trunc(numericValue(block.pairs, 71, 1)));
                    const columnSpacing = numericValue(block.pairs, 44) * scale;
                    const rowSpacing = numericValue(block.pairs, 45) * scale;
                    const rotationRadians = (rotation * Math.PI) / 180;
                    const rotationCos = Math.cos(rotationRadians);
                    const rotationSin = Math.sin(rotationRadians);
                    for (let row = 0; row < rows; row += 1) {
                        for (let column = 0; column < columns; column += 1) {
                            const localOffsetX = column * columnSpacing * scaleX;
                            const localOffsetY = row * rowSpacing * scaleY;
                            const instancePoint = {
                                x: insertion.x +
                                    localOffsetX * rotationCos -
                                    localOffsetY * rotationSin,
                                y: insertion.y +
                                    localOffsetX * rotationSin +
                                    localOffsetY * rotationCos,
                            };
                            const local = insertDxfMatrix(instancePoint, definition.basePoint, scaleX, scaleY, rotation);
                            emitBlocks(definition.entities, layer, multiplyDxfMatrices(matrix, local), `${id}_${blockName}_${row}_${column}`, depth + 1, Boolean(meta.paperSpace), String(meta.layout || "Model"));
                        }
                    }
                }
                else {
                    push({
                        kind: "point",
                        name: blockName || "Block",
                        pts: [insertion],
                        meta: { unresolvedBlock: blockName || true },
                    });
                }
                continue;
            }
            if (block.type === "POINT") {
                const point = indexedPoint(block.pairs, 10, 20, scale);
                if (point)
                    push({ kind: "point", name: "Punkt", pts: [point] });
                continue;
            }
            if (block.type === "TEXT" ||
                block.type === "MTEXT" ||
                block.type === "ATTRIB" ||
                block.type === "ATTDEF") {
                const horizontalJustification = Math.trunc(numericValue(block.pairs, 72));
                const verticalJustification = Math.trunc(numericValue(block.pairs, 73));
                const usesAlignmentPoint = block.type !== "MTEXT" &&
                    (horizontalJustification !== 0 || verticalJustification !== 0);
                const insertionPoint = indexedPoint(block.pairs, 10, 20, scale);
                const alignmentPoint = indexedPoint(block.pairs, 11, 21, scale);
                const point = usesAlignmentPoint
                    ? alignmentPoint || insertionPoint
                    : insertionPoint || alignmentPoint;
                const text = decodeDxfText(block.pairs);
                const attributeTag = firstValue(block.pairs, 2);
                const explicitRotation = block.pairs.some((pair) => pair.code === 50);
                const directionX = numericValue(block.pairs, 11);
                const directionY = numericValue(block.pairs, 21);
                const rotation = block.type === "MTEXT" &&
                    !explicitRotation &&
                    (Math.abs(directionX) > EPSILON ||
                        Math.abs(directionY) > EPSILON)
                    ? (Math.atan2(directionY, directionX) * 180) / Math.PI
                    : numericValue(block.pairs, 50);
                if (point) {
                    push({
                        kind: "text",
                        name: text || attributeTag || "Text",
                        text: text || attributeTag,
                        rotation,
                        pts: [point],
                        meta: {
                            height: numericValue(block.pairs, 40) * scale,
                            width: numericValue(block.pairs, 41) * scale,
                            widthFactor: block.type === "MTEXT"
                                ? 1
                                : numericValue(block.pairs, 41, 1) || 1,
                            textStyle: firstValue(block.pairs, 7),
                            attachmentPoint: Math.trunc(numericValue(block.pairs, 71, 1)),
                            horizontalJustification,
                            verticalJustification,
                        },
                    });
                }
                continue;
            }
            if (block.type === "SPLINE") {
                const points = splinePoints(block.pairs, scale);
                if (points.length > 1) {
                    push({
                        kind: "polyline",
                        name: "Spline",
                        pts: points,
                        meta: { approximation: "de-boor" },
                    });
                }
                continue;
            }
            if (block.type === "MLINE") {
                const points = repeatedPoints(block.pairs, 11, 21, scale);
                const fallbackPoints = repeatedPoints(block.pairs, 10, 20, scale);
                const centerLine = points.length > 1 ? points : fallbackPoints;
                if (centerLine.length > 1) {
                    push({
                        kind: "polyline",
                        name: "Multilinie",
                        pts: centerLine,
                        meta: { approximation: "center-line" },
                    });
                }
                continue;
            }
            if (block.type === "HATCH" || block.type === "LEADER") {
                const points = repeatedVertices(block.pairs, scale).map((vertex) => vertex.point);
                if (points.length > 1) {
                    const closed = block.type === "HATCH" && points.length > 2;
                    push({
                        kind: closed ? "polygon" : "polyline",
                        name: block.type === "HATCH" ? "Schraffurgrenze" : "Führungslinie",
                        pts: points,
                        closed,
                        meta: { approximation: "boundary-points" },
                    });
                }
                continue;
            }
            if (block.type === "3DFACE" ||
                block.type === "SOLID" ||
                block.type === "TRACE") {
                const points = [10, 11, 12, 13]
                    .map((xCode) => indexedPoint(block.pairs, xCode, xCode + 10, scale))
                    .filter((point) => Boolean(point));
                const unique = points.filter((point, pointIndex) => pointIndex === 0 ||
                    distance(point, points[pointIndex - 1]) > EPSILON);
                if (unique.length >= 3) {
                    push({
                        kind: "polygon",
                        pts: unique,
                        closed: true,
                        style: {
                            ...style,
                            fill: block.type === "SOLID" || block.type === "TRACE",
                        },
                    });
                }
                continue;
            }
            if (!["VERTEX", "SEQEND"].includes(block.type)) {
                unsupportedTypes.add(block.type);
            }
        }
    };
    emitBlocks(blocks);
    const normalized = features.map(recalculateCadFeature);
    if (!normalized.length) {
        throw new Error("Die DXF-Datei enthält keine unterstützte 2D-Geometrie (LINE, POLYLINE, CIRCLE, ARC, ELLIPSE, INSERT, POINT, TEXT, SPLINE, MLINE).");
    }
    return createCadDocument("", normalized, {
        fileName,
        format: "DXF",
        importedAt: new Date().toISOString(),
        unitCode,
        unitScale: scale,
        modelSpaceCount,
        paperSpaceCount,
        unsupportedTypes: Array.from(unsupportedTypes).sort(),
        blockDefinitionCount: blockDefinitions.size,
    });
}
