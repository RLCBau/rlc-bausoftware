const KEY = "rlc.cad.doc";
function newid() {
    return Math.random().toString(36).slice(2, 10);
}
export function loadDoc() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw)
            return JSON.parse(raw);
    }
    catch { }
    return {
        id: "CAD-001",
        name: "Zeichnung 1",
        layers: [
            { id: "L1", name: "0", color: "#22c55e", visible: true, locked: false },
            { id: "L2", name: "Bestand", color: "#60a5fa", visible: true, locked: false },
        ],
        entities: [],
        view: { cx: 0, cy: 0, zoom: 1 },
        updatedAt: new Date().toISOString(),
    };
}
export function saveDoc(doc) {
    try {
        localStorage.setItem(KEY, JSON.stringify({ ...doc, updatedAt: new Date().toISOString() }));
    }
    catch { }
}
export const CadAPI = {
    newid,
    getActiveLayerId(doc) {
        // usa il primo layer visibile come "attivo"
        const first = doc.layers.find(l => l.visible && !l.locked);
        return first?.id ?? doc.layers[0].id;
    },
    addLayer(doc, name = "Layer " + (doc.layers.length + 1), color = "#f59e0b") {
        doc.layers.push({ id: newid(), name, color, visible: true, locked: false });
    },
    removeLayer(doc, id) {
        doc.entities = doc.entities.filter(e => e.layerId !== id);
        doc.layers = doc.layers.filter(l => l.id !== id);
    },
    addEntity(doc, e) {
        doc.entities.push(e);
    },
    removeEntity(doc, id) {
        doc.entities = doc.entities.filter(e => e.id !== id);
    },
    hitTest(doc, p, tol = 6) {
        // pixel tolerance handled outside via world->screen; qui usiamo distanza euclidea
        const t = tol;
        const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= t;
        for (let i = doc.entities.length - 1; i >= 0; i--) {
            const e = doc.entities[i];
            const lay = doc.layers.find(l => l.id === e.layerId);
            if (!lay?.visible)
                continue;
            if (e.type === "point") {
                if (near(e.p, p))
                    return e;
            }
            else if (e.type === "line") {
                // distanza punto-linea segment
                const d = distPointToSegment(p, e.a, e.b);
                if (d <= t)
                    return e;
            }
            else if (e.type === "polyline") {
                for (let j = 0; j < e.points.length - 1; j++) {
                    const d = distPointToSegment(p, e.points[j], e.points[j + 1]);
                    if (d <= t)
                        return e;
                }
                if (e.closed && e.points.length > 2) {
                    const d = distPointToSegment(p, e.points[0], e.points[e.points.length - 1]);
                    if (d <= t)
                        return e;
                }
            }
        }
        return null;
    },
};
function distPointToSegment(p, a, b) {
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const ap = { x: p.x - a.x, y: p.y - a.y };
    const ab2 = ab.x * ab.x + ab.y * ab.y;
    const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / ab2));
    const proj = { x: a.x + t * ab.x, y: a.y + t * ab.y };
    return Math.hypot(p.x - proj.x, p.y - proj.y);
}
