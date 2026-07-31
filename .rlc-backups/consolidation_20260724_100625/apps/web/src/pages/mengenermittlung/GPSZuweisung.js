import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/web/src/pages/mengenermittlung/GPSZuweisung.tsx
import React from "react";
import L from "leaflet";
import Papa from "papaparse";
import proj4 from "proj4";
// @ts-ignore
import "leaflet.gridlayer.googlemutant";
import { gpx, kml } from "@tmcw/togeojson";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import "leaflet/dist/leaflet.css";
import { useProject } from "../../store/useProject";
/* ------------------ PROJEKTIONEN ------------------ */
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
proj4.defs("EPSG:32632", "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs");
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs");
proj4.defs("EPSG:31466", "+proj=tmerc +lat_0=0 +lon_0=6 +k=1 +x_0=2500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs");
proj4.defs("EPSG:31467", "+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs");
proj4.defs("EPSG:31468", "+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs");
proj4.defs("EPSG:31469", "+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=5500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs");
function toWGS84(e, n, crs) {
    const [lng, lat] = proj4(proj4(crs), proj4("EPSG:4326"), [e, n]);
    return { lat, lng };
}
function normKey(s) {
    return String(s || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[-_]/g, "");
}
function toNum(v) {
    if (v === null || v === undefined)
        return NaN;
    const s = String(v).trim().replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
}
function clampPts(pts) {
    const MAX = 20000;
    if (pts.length <= MAX)
        return pts;
    return pts.slice(0, MAX);
}
function isPlausibleWGS84(p) {
    // grob: DACH / Mitteleuropa
    return p.lat >= 35 && p.lat <= 65 && p.lng >= -10 && p.lng <= 30;
}
function pad2(n) {
    return String(n).padStart(2, "0");
}
function tsForFilename(t = Date.now()) {
    const d = new Date(t);
    return (d.getFullYear() +
        "-" +
        pad2(d.getMonth() + 1) +
        "-" +
        pad2(d.getDate()) +
        "_" +
        pad2(d.getHours()) +
        "-" +
        pad2(d.getMinutes()) +
        "-" +
        pad2(d.getSeconds()));
}
/**
 * jsPDF può produrre:
 *  - data:application/pdf;base64,....
 *  - data:application/pdf;filename=generated.pdf;base64,....
 * Il backend spesso valida solo la prima.
 */
function normalizePdfDataUrl(u) {
    const s = String(u || "");
    if (!s)
        return s;
    return s.replace(/^data:application\/pdf;filename=[^;]+;base64,/, "data:application/pdf;base64,");
}
/* ------------------ DISTANCE (Haversine) ------------------ */
function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    return R * c;
}
function polylineLengthMeters(pts) {
    if (!pts || pts.length < 2)
        return 0;
    let sum = 0;
    for (let i = 1; i < pts.length; i++)
        sum += haversineMeters(pts[i - 1], pts[i]);
    return sum;
}
/* ------------------ API ------------------ */
async function api(url, init) {
    const base = import.meta?.env?.VITE_API_URL ||
        import.meta?.env?.VITE_BACKEND_URL ||
        "https://api.rlcbausoftware.com";
    const res = await fetch(base + url, {
        headers: { "Content-Type": "application/json" },
        ...init,
    });
    if (!res.ok)
        throw new Error(await res.text());
    return (await res.json());
}
/* =======================================================================
   CSV PARSING (ESTESO)
======================================================================== */
function tryParseRowObject(row) {
    const keys = Object.keys(row || {});
    const get = (variants) => {
        for (const k of keys) {
            const nk = normKey(k);
            if (variants.includes(nk))
                return row[k];
        }
        return undefined;
    };
    const lat = toNum(get(["lat", "latitude", "breite", "latitudedeg", "y_wgs", "y_wgs84"]));
    const lng = toNum(get(["lng", "lon", "long", "longitude", "laenge", "longitudedeg", "x_wgs", "x_wgs84"]));
    if (Number.isFinite(lat) && Number.isFinite(lng))
        return { lat, lng };
    return null;
}
function pickENFromArray(arr) {
    // Caso rilievo: [id, RW, HW, z, ...]
    if (arr.length >= 3) {
        const e = toNum(arr[1]);
        const n = toNum(arr[2]);
        if (Number.isFinite(e) && Number.isFinite(n))
            return { e, n };
    }
    // fallback: [RW, HW]
    if (arr.length >= 2) {
        const a0 = toNum(arr[0]);
        const a1 = toNum(arr[1]);
        if (Number.isFinite(a0) && Number.isFinite(a1))
            return { e: a0, n: a1 };
    }
    return null;
}
function detectCrsForEN(sample) {
    const candidates = ["EPSG:31468", "EPSG:31467", "EPSG:31469", "EPSG:25832", "EPSG:32632"];
    const scored = [];
    for (const crs of candidates) {
        let ok = 0;
        for (const s of sample) {
            try {
                const p = toWGS84(s.e, s.n, crs);
                if (isPlausibleWGS84(p))
                    ok++;
            }
            catch { }
        }
        scored.push({ crs, ok });
    }
    scored.sort((a, b) => b.ok - a.ok);
    return scored.filter((x) => x.ok > 0).map((x) => x.crs);
}
function parseCsvToPointsAuto(rawRows, preferredCrs) {
    // WGS84 diretti (solo se header vero e colonne lat/lng)
    const directWgs = [];
    for (const row of rawRows) {
        if (row && !Array.isArray(row) && typeof row === "object") {
            const p = tryParseRowObject(row);
            if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
                if (isPlausibleWGS84(p))
                    directWgs.push({ lat: p.lat, lng: p.lng });
            }
        }
    }
    if (directWgs.length > 0) {
        return {
            pts: directWgs,
            usedCrs: "EPSG:4326",
            debug: `WGS84 direkt erkannt (${directWgs.length}).`,
        };
    }
    // EN estrazione (NO-HEADER / array)
    const enRows = [];
    const sampleEN = [];
    for (const row of rawRows) {
        if (!row)
            continue;
        if (Array.isArray(row)) {
            const en = pickENFromArray(row);
            if (en) {
                enRows.push(en);
                if (sampleEN.length < 10)
                    sampleEN.push(en);
            }
        }
    }
    if (enRows.length === 0) {
        return {
            pts: [],
            usedCrs: preferredCrs,
            debug: "Keine RW/HW oder lat/lng gefunden (CSV-Spalten prüfen).",
        };
    }
    const detected = detectCrsForEN(sampleEN);
    const order = [
        ...detected,
        preferredCrs,
        "EPSG:31468",
        "EPSG:31467",
        "EPSG:31469",
        "EPSG:25832",
        "EPSG:32632",
    ].filter((v, i, a) => a.indexOf(v) === i);
    // Accetta se almeno 60% plausibili
    for (const crs of order) {
        const pts = [];
        let ok = 0;
        for (const en of enRows) {
            try {
                const p = toWGS84(en.e, en.n, crs);
                if (isPlausibleWGS84(p)) {
                    pts.push({ lat: p.lat, lng: p.lng });
                    ok++;
                }
            }
            catch { }
        }
        if (ok > 0 && ok >= Math.max(1, Math.floor(enRows.length * 0.6))) {
            return {
                pts,
                usedCrs: crs,
                debug: `CRS auto-detektiert: ${crs} (${ok}/${enRows.length}).`,
            };
        }
    }
    // fallback: anche parziale
    for (const crs of order) {
        const pts = [];
        let ok = 0;
        for (const en of enRows) {
            try {
                const p = toWGS84(en.e, en.n, crs);
                if (isPlausibleWGS84(p)) {
                    pts.push({ lat: p.lat, lng: p.lng });
                    ok++;
                }
            }
            catch { }
        }
        if (ok > 0) {
            return {
                pts,
                usedCrs: crs,
                debug: `CRS gewählt (Teilmenge): ${crs} (${ok}/${enRows.length}).`,
            };
        }
    }
    return {
        pts: [],
        usedCrs: preferredCrs,
        debug: "Koordinaten gefunden, aber CRS passt nicht (Dropdown wechseln).",
    };
}
/* ------------------ COMPONENT ------------------ */
export default function GPSZuweisung() {
    const ctx = useProject();
    const project = ctx?.currentProject || ctx?.selectedProject || ctx?.project || null;
    const projectCode = project?.code ||
        project?.baustellenNummer ||
        project?.baustelleNummer ||
        project?.projectCode ||
        project?.projektCode ||
        project?.slug ||
        project?.key ||
        "";
    const projectDbId = project?.id || "";
    const projectId = (projectCode || projectDbId || "").trim();
    const mapRef = React.useRef(null);
    const pointsLayerRef = React.useRef(null);
    const lineLayerRef = React.useRef(null);
    const [points, setPoints] = React.useState([]);
    const [selectedLV, setSelectedLV] = React.useState(null);
    const [lvList, setLvList] = React.useState([]);
    const [assignments, setAssignments] = React.useState([]);
    const [csvCrs, setCsvCrs] = React.useState("EPSG:31468"); // Bayern GK4 default
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState(null);
    // Draft-Persistenz (damit beim Seitenwechsel nichts verloren geht)
    const DRAFT_KEY = React.useMemo(() => {
        const key = (projectId || "no-project").replace(/[^\w.-]/g, "_");
        return `rlc_gpszuweisung_draft_v1_${key}`;
    }, [projectId]);
    function saveDraft(nextPoints, nextSelectedId, nextCsvCrs) {
        try {
            const payload = {
                projectId,
                points: nextPoints,
                selectedLvId: nextSelectedId ?? selectedLV?.id ?? null,
                csvCrs: nextCsvCrs ?? csvCrs,
                savedAt: Date.now(),
            };
            localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
        }
        catch { }
    }
    function loadDraft() {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw)
                return null;
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    function clearDraft() {
        try {
            localStorage.removeItem(DRAFT_KEY);
        }
        catch { }
    }
    /* ------------------ MAP INIT ------------------ */
    React.useEffect(() => {
        if (mapRef.current)
            return;
        const m = L.map("gps-map", {
            zoomControl: true,
            preferCanvas: true,
            maxZoom: 22,
        }).setView([48.14, 11.58], 12);
        // Base: OSM
        const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "© OpenStreetMap",
            crossOrigin: true, // ✅ per html2canvas
        }).addTo(m);
        // Base: Bayern Luftbild (WMS)
        const bayernLuftbild = L.tileLayer.wms("https://geoservices.bayern.de/od/wms/dop/v1/dop20?", {
            layers: "by_dop20c",
            format: "image/jpeg",
            transparent: false,
            version: "1.3.0",
            tiled: true,
            maxZoom: 21,
            attribution: "© Bayerische Vermessungsverwaltung",
            crossOrigin: true, // ✅
        });
        const base = {
            OSM: osm,
            "Bayern Luftbild (WMS)": bayernLuftbild,
        };
        // Optional: Google (ATTENZIONE: spesso blocca lo screenshot per CORS/licenza)
        try {
            const key = import.meta?.env?.VITE_GOOGLE_MAPS_KEY;
            if (key && L.gridLayer?.googleMutant) {
                const gRoad = L.gridLayer.googleMutant({
                    type: "roadmap",
                    maxZoom: 21,
                    apiKey: key,
                });
                const gSat = L.gridLayer.googleMutant({
                    type: "satellite",
                    maxZoom: 21,
                    apiKey: key,
                });
                base["Google Road"] = gRoad;
                base["Google Sat"] = gSat;
            }
        }
        catch (e) {
            console.warn("Google layers disabled:", e);
        }
        // OVERLAYS (Parzellen + Grenzen)
        const overlayParzellen = L.tileLayer.wms("https://geoservices.bayern.de/od/wms/alkis/v1/parzellarkarte?", {
            layers: "by_alkis_parzellarkarte_umr_schwarz",
            format: "image/png",
            transparent: true,
            version: "1.3.0",
            tiled: true,
            maxZoom: 21,
            attribution: "© Bayerische Vermessungsverwaltung (ALKIS® OpenData)",
            crossOrigin: true, // ✅
        });
        const overlayGrenzen = L.tileLayer.wms("https://geoservices.bayern.de/od/wms/alkis/v1/verwaltungsgrenzen?", {
            layers: "by_alkis_gmd_grenze",
            format: "image/png",
            transparent: true,
            version: "1.3.0",
            tiled: true,
            maxZoom: 21,
            attribution: "© Bayerische Vermessungsverwaltung (ALKIS® OpenData)",
            crossOrigin: true, // ✅
        });
        const overlays = {
            "Flurkarte / Parzellen (WMS)": overlayParzellen,
            "Grenzen (WMS)": overlayGrenzen,
        };
        L.control.layers(base, overlays).addTo(m);
        // Default ON
        overlayParzellen.addTo(m);
        overlayGrenzen.addTo(m);
        pointsLayerRef.current = L.layerGroup().addTo(m);
        lineLayerRef.current = L.layerGroup().addTo(m);
        m.on("click", (e) => {
            const p = { lat: e.latlng.lat, lng: e.latlng.lng, ts: Date.now() };
            setPoints((prev) => {
                const next = [...prev, p];
                redrawCurrent(next);
                saveDraft(next);
                return next;
            });
        });
        mapRef.current = m;
        setTimeout(() => m.invalidateSize(), 200);
    }, []);
    function clearLayers() {
        pointsLayerRef.current?.clearLayers();
        lineLayerRef.current?.clearLayers();
    }
    function redrawCurrent(pts) {
        const m = mapRef.current;
        if (!m)
            return;
        clearLayers();
        const lgPts = pointsLayerRef.current;
        const lgLine = lineLayerRef.current;
        if (pts.length) {
            for (const p of pts)
                L.circleMarker([p.lat, p.lng], { radius: 4 }).addTo(lgPts);
            if (pts.length >= 2) {
                L.polyline(pts.map((p) => [p.lat, p.lng]), { weight: 3 }).addTo(lgLine);
            }
            m.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])), { padding: [30, 30] });
        }
    }
    function drawAssignment(ass) {
        const m = mapRef.current;
        if (!m)
            return;
        clearLayers();
        const lgPts = pointsLayerRef.current;
        const lgLine = lineLayerRef.current;
        const pts = ass.points || [];
        for (const p of pts)
            L.circleMarker([p.lat, p.lng], { radius: 4 }).addTo(lgPts);
        if (pts.length >= 2) {
            L.polyline(pts.map((p) => [p.lat, p.lng]), { weight: 3 }).addTo(lgLine);
        }
        if (pts.length) {
            m.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])), { padding: [30, 30] });
        }
    }
    function resolveLvFromLists(lvPosId) {
        if (!lvPosId)
            return null;
        return lvList.find((x) => x.id === lvPosId) || null;
    }
    function loadAssignmentIntoCurrent(a) {
        const pts = clampPts(a.points || []);
        setPoints(pts);
        redrawCurrent(pts);
        saveDraft(pts, a.lvPosId ?? null, csvCrs);
        const found = resolveLvFromLists(a.lvPosId);
        if (found)
            setSelectedLV(found);
        setErr(`Zuweisung geladen: ${found?.position || a.lvPosId} (${pts.length} Punkte)`);
    }
    /* ------------------ DATA: LV / ASSIGNMENTS ------------------ */
    async function loadLV() {
        if (!projectDbId)
            return;
        setBusy(true);
        setErr(null);
        try {
            const res = await api(`/api/projects/${encodeURIComponent(projectDbId)}/lv?page=1&pageSize=20`);
            const latest = (res.rows || [])[0];
            setLvList((latest?.positions || []));
            // Draft restore selectedLV
            const d = loadDraft();
            if (d?.selectedLvId) {
                const found = (latest?.positions || []).find((p) => p.id === d.selectedLvId) || null;
                if (found)
                    setSelectedLV(found);
            }
        }
        catch (e) {
            setErr(String(e?.message || e));
        }
        finally {
            setBusy(false);
        }
    }
    async function loadAssignments() {
        if (!projectId)
            return;
        setBusy(true);
        setErr(null);
        try {
            const res = await api(`/api/gps/list?projectId=${encodeURIComponent(projectId)}`);
            // se backend non include lvPos, proviamo ad arricchirlo con lvList
            const enriched = (res.items || []).map((a) => {
                if (a.lvPos)
                    return a;
                const f = lvList.find((x) => x.id === a.lvPosId);
                if (!f)
                    return a;
                return {
                    ...a,
                    lvPos: {
                        position: f.position,
                        kurztext: f.kurztext,
                        langtext: f.langtext ?? null,
                    },
                };
            });
            setAssignments(enriched);
        }
        catch (e) {
            setErr(String(e?.message || e));
        }
        finally {
            setBusy(false);
        }
    }
    // Initial restore bozza + load server
    React.useEffect(() => {
        setPoints([]);
        setSelectedLV(null);
        setLvList([]);
        setAssignments([]);
        clearLayers();
        const d = loadDraft();
        if (d?.csvCrs)
            setCsvCrs(d.csvCrs);
        if (Array.isArray(d?.points) && d.points.length) {
            const restored = clampPts(d.points);
            setPoints(restored);
            setTimeout(() => redrawCurrent(restored), 200);
        }
        if (projectDbId)
            loadLV();
        if (projectId)
            loadAssignments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, projectDbId]);
    async function saveAssignment() {
        if (!projectId)
            return alert("Kein Projekt gewählt.");
        if (!selectedLV)
            return alert("Bitte LV-Position wählen.");
        if (!points.length)
            return alert("Keine Punkte vorhanden.");
        setBusy(true);
        setErr(null);
        try {
            const payload = {
                id: crypto.randomUUID(),
                projectId,
                lvPosId: selectedLV.id,
                points: clampPts(points),
                createdAt: Date.now(),
            };
            const res = await api("/api/gps/assign", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            const item = res.item?.lvPos
                ? res.item
                : {
                    ...res.item,
                    lvPos: {
                        position: selectedLV.position,
                        kurztext: selectedLV.kurztext,
                        langtext: selectedLV.langtext ?? null,
                    },
                };
            setAssignments((prev) => [item, ...prev]);
            clearDraft();
            alert("Gespeichert!");
        }
        catch (e) {
            setErr(String(e?.message || e));
            alert("Fehler beim Speichern.");
        }
        finally {
            setBusy(false);
        }
    }
    async function deleteAssignment(id) {
        if (!projectId)
            return;
        if (!confirm("Wirklich löschen?"))
            return;
        setBusy(true);
        setErr(null);
        try {
            await api(`/api/gps/delete?id=${encodeURIComponent(id)}&projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" });
            setAssignments((prev) => prev.filter((a) => a.id !== id));
        }
        catch (e) {
            setErr(String(e?.message || e));
            alert("Fehler beim Löschen.");
        }
        finally {
            setBusy(false);
        }
    }
    function clearCurrent() {
        setPoints([]);
        clearLayers();
        saveDraft([]);
    }
    /* ------------------ IMPORTS ------------------ */
    function importCSV(file, preferredCrs) {
        setErr(null);
        const parseNoHeader = () => {
            Papa.parse(file, {
                header: false,
                skipEmptyLines: true,
                delimiter: "",
                complete: (r2) => {
                    const rawRows = r2.data || [];
                    const out2 = parseCsvToPointsAuto(rawRows, preferredCrs);
                    const clean2 = clampPts(out2.pts);
                    setPoints((prev) => {
                        const next = [...prev, ...clean2];
                        redrawCurrent(next);
                        saveDraft(next, selectedLV?.id ?? null, csvCrs);
                        return next;
                    });
                    setErr(out2.debug);
                },
                error: (e) => setErr(String(e)),
            });
        };
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            delimiter: "",
            complete: (r) => {
                const rawRows = r.data || [];
                const out = parseCsvToPointsAuto(rawRows, preferredCrs);
                if ((out.pts || []).length === 0)
                    return parseNoHeader();
                const clean = clampPts(out.pts);
                setPoints((prev) => {
                    const next = [...prev, ...clean];
                    redrawCurrent(next);
                    saveDraft(next, selectedLV?.id ?? null, csvCrs);
                    return next;
                });
                setErr(out.debug);
            },
            error: (e) => setErr(String(e)),
        });
    }
    async function importXML(file) {
        setErr(null);
        const text = await file.text();
        const xml = new DOMParser().parseFromString(text, "application/xml");
        const fc = file.name.toLowerCase().endsWith(".gpx") ? gpx(xml) : kml(xml);
        const pts = [];
        (fc.features || []).forEach((f) => {
            if (f.geometry?.type === "LineString") {
                f.geometry.coordinates.forEach((c) => pts.push({ lng: c[0], lat: c[1] }));
            }
            else if (f.geometry?.type === "Point") {
                pts.push({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
            }
        });
        const clean = clampPts(pts);
        setPoints((prev) => {
            const next = [...prev, ...clean];
            redrawCurrent(next);
            saveDraft(next, selectedLV?.id ?? null, csvCrs);
            return next;
        });
    }
    async function importGeoJSON(file) {
        setErr(null);
        const gj = JSON.parse(await file.text());
        const pts = [];
        (gj.features || []).forEach((f) => {
            if (f.geometry?.type === "LineString") {
                f.geometry.coordinates.forEach((c) => pts.push({ lng: c[0], lat: c[1] }));
            }
            else if (f.geometry?.type === "Point") {
                pts.push({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
            }
        });
        const clean = clampPts(pts);
        setPoints((prev) => {
            const next = [...prev, ...clean];
            redrawCurrent(next);
            saveDraft(next, selectedLV?.id ?? null, csvCrs);
            return next;
        });
    }
    function onFileImport(file) {
        const ext = file.name.toLowerCase().split(".").pop();
        if (ext === "csv")
            return importCSV(file, csvCrs);
        if (ext === "gpx" || ext === "kml")
            return importXML(file);
        if (ext === "geojson" || ext === "json")
            return importGeoJSON(file);
        alert("Format nicht unterstützt");
    }
    /* ------------------ MAP SNAPSHOT ------------------ */
    async function captureMapSnapshotPngDataUrl() {
        const el = document.getElementById("gps-map");
        const m = mapRef.current;
        if (!el || !m)
            return null;
        try {
            // forza redraw prima dello screenshot
            m.invalidateSize();
            await new Promise((r) => setTimeout(r, 300));
            const canvas = await html2canvas(el, {
                useCORS: true,
                allowTaint: false,
                backgroundColor: "#ffffff",
                scale: 2,
                logging: false,
            });
            return canvas.toDataURL("image/png");
        }
        catch (e) {
            console.warn("Map snapshot failed:", e);
            return null;
        }
    }
    /* ------------------ PDF EXPORT (Print + Save Server) ------------------ */
    function buildPdfDoc(opts) {
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const marginX = 14;
        let y = 14;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("GPS-basierte Positionszuweisung", marginX, y);
        y += 8;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        const created = opts.createdAt ? new Date(opts.createdAt) : new Date();
        const lenM = polylineLengthMeters(opts.pts);
        const lenTxt = lenM >= 1000 ? `${(lenM / 1000).toFixed(3)} km` : `${lenM.toFixed(1)} m`;
        const metaRows = [
            ["Projekt", opts.projectTitle || "—"],
            ["Projekt-Code/ID (FS)", opts.projectId || "—"],
            ["Projekt-ID (DB)", opts.projectDbId || "—"],
            ["LV-Position", opts.lv?.position || "—"],
            ["Kurztext", opts.lv?.kurztext || "—"],
            ["Langtext", opts.lv?.langtext || "—"],
            ["Punkte", String(opts.pts?.length || 0)],
            ["Linienlänge", lenTxt],
            ["Erstellt am", created.toLocaleString()],
        ];
        autoTable(doc, {
            startY: y,
            head: [["Feld", "Wert"]],
            body: metaRows,
            styles: { fontSize: 9, cellPadding: 2 },
            headStyles: { fillColor: [240, 240, 240] },
            columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 130 } },
            margin: { left: marginX, right: marginX },
        });
        // @ts-ignore
        y = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 8 : y + 40;
        // ✅ Mappa screenshot nel PDF
        if (opts.mapPngDataUrl) {
            try {
                // @ts-ignore
                const imgProps = doc.getImageProperties(opts.mapPngDataUrl);
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const maxW = pageWidth - marginX * 2;
                const imgW = maxW;
                const imgH = (imgProps.height * imgW) / imgProps.width;
                if (y + imgH + 14 > pageHeight) {
                    doc.addPage();
                    y = 14;
                }
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.text("Kartenausschnitt (Snapshot)", marginX, y);
                y += 5;
                doc.addImage(opts.mapPngDataUrl, "PNG", marginX, y, imgW, imgH, undefined, "FAST");
                y += imgH + 8;
            }
            catch (e) {
                console.warn("PDF addImage failed:", e);
            }
        }
        const ptsBody = (opts.pts || []).slice(0, 5000).map((p, idx) => [
            String(idx + 1),
            p.lat.toFixed(7),
            p.lng.toFixed(7),
            p.ts ? new Date(p.ts).toLocaleString() : "",
        ]);
        autoTable(doc, {
            startY: y,
            head: [["#", "Lat", "Lng", "Zeit"]],
            body: ptsBody,
            styles: { fontSize: 8, cellPadding: 1.6 },
            headStyles: { fillColor: [240, 240, 240] },
            margin: { left: marginX, right: marginX },
            didDrawPage: () => {
                doc.setFontSize(8);
                doc.text(`RLC Bausoftware – GPSZuweisung   |   Seite ${doc.getNumberOfPages()}`, marginX, 290);
            },
        });
        return doc;
    }
    function openPrintPdf(doc) {
        const blob = doc.output("blob");
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank");
        if (!w) {
            alert("Popup blockiert. Bitte Popups erlauben.");
            return;
        }
        setTimeout(() => {
            try {
                w.focus();
            }
            catch { }
        }, 250);
    }
    async function savePdfToServer(doc, filenameHint) {
        if (!projectId)
            throw new Error("Kein projectId");
        let dataUrl = normalizePdfDataUrl(doc.output("datauristring"));
        if (!dataUrl.startsWith("data:application/pdf;base64,")) {
            throw new Error("PDF DataURL ist ungültig (kein data:application/pdf;base64, ...).");
        }
        return await api(`/api/gps/export-pdf`, {
            method: "POST",
            body: JSON.stringify({
                projectId,
                filenameHint,
                pdfDataUrl: dataUrl,
            }),
        });
    }
    async function exportCurrentPdf(printAlso = true) {
        if (!projectId)
            return alert("Kein Projekt gewählt.");
        if (!selectedLV)
            return alert("Bitte LV-Position wählen.");
        if (!points.length)
            return alert("Keine Punkte vorhanden.");
        setBusy(true);
        setErr(null);
        try {
            const pts = clampPts(points);
            // ✅ ensure map view is on the points before snapshot
            redrawCurrent(pts);
            const mapSnap = await captureMapSnapshotPngDataUrl();
            const doc = buildPdfDoc({
                projectTitle: project?.name || project?.title || projectCode || "—",
                projectId,
                projectDbId,
                lv: {
                    position: selectedLV.position,
                    kurztext: selectedLV.kurztext,
                    langtext: selectedLV.langtext || null,
                    lvPosId: selectedLV.id,
                },
                pts,
                createdAt: Date.now(),
                mapPngDataUrl: mapSnap,
            });
            const hint = `gpszuweisung_${selectedLV.position || selectedLV.id}_${tsForFilename()}.pdf`;
            const saved = await savePdfToServer(doc, hint);
            if (printAlso)
                openPrintPdf(doc);
            alert(`PDF gespeichert: ${saved.filename}`);
            window.open(saved.url, "_blank");
        }
        catch (e) {
            setErr(String(e?.message || e));
            alert("PDF Export fehlgeschlagen.");
        }
        finally {
            setBusy(false);
        }
    }
    async function exportAssignmentPdf(a) {
        if (!projectId)
            return alert("Kein Projekt gewählt.");
        if (!a?.points?.length)
            return alert("Keine Punkte in dieser Zuweisung.");
        setBusy(true);
        setErr(null);
        try {
            // ✅ ensure map view is on the assignment before snapshot
            drawAssignment(a);
            const mapSnap = await captureMapSnapshotPngDataUrl();
            const lvPos = a?.lvPos || null;
            const doc = buildPdfDoc({
                projectTitle: project?.name || project?.title || projectCode || "—",
                projectId,
                projectDbId,
                lv: {
                    position: lvPos?.position || a.lvPosId,
                    kurztext: lvPos?.kurztext || "",
                    langtext: lvPos?.langtext || null,
                    lvPosId: a.lvPosId,
                },
                pts: clampPts(a.points),
                createdAt: a.createdAt,
                mapPngDataUrl: mapSnap,
            });
            const hint = `gpszuweisung_${(lvPos?.position || a.lvPosId || "LV")}_${tsForFilename(a.createdAt)}.pdf`;
            const saved = await savePdfToServer(doc, hint);
            openPrintPdf(doc);
            window.open(saved.url, "_blank");
        }
        catch (e) {
            setErr(String(e?.message || e));
            alert("PDF Export fehlgeschlagen.");
        }
        finally {
            setBusy(false);
        }
    }
    /* ------------------ UI ------------------ */
    return (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }, children: [_jsxs("div", { className: "card", style: { padding: 12 }, children: [_jsx("h3", { style: { marginTop: 0 }, children: "GPS-basierte Positionszuweisung" }), _jsxs("div", { style: { marginBottom: 10, opacity: 0.9 }, children: [_jsx("div", { style: { fontSize: 12 }, children: "Projekt" }), _jsx("div", { style: { fontWeight: 700 }, children: project?.name || project?.title || projectCode || "—" }), _jsxs("div", { style: { fontSize: 12, opacity: 0.8 }, children: ["Projekt-Code (FS): ", _jsx("b", { children: projectCode || "—" })] }), _jsxs("div", { style: { fontSize: 12, opacity: 0.8 }, children: ["Projekt-ID (DB): ", projectDbId || "—"] })] }), _jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [_jsx("button", { className: "btn", onClick: loadLV, disabled: !projectDbId || busy, children: "LV laden" }), _jsx("button", { className: "btn", onClick: loadAssignments, disabled: !projectId || busy, children: "Zuweisungen laden" }), _jsx("button", { className: "btn", onClick: clearCurrent, disabled: busy, children: "Punkte l\u00F6schen" })] }), _jsxs("div", { style: { marginTop: 12 }, children: [_jsx("label", { children: "LV-Position w\u00E4hlen" }), _jsx("div", { style: {
                                    maxHeight: 170,
                                    overflow: "auto",
                                    border: "1px solid #ddd",
                                    borderRadius: 8,
                                    marginTop: 6,
                                }, children: lvList.length === 0 ? (_jsx("div", { style: { padding: 10, opacity: 0.8 }, children: "Keine LV-Positionen geladen." })) : (lvList.map((l) => (_jsxs("div", { onClick: () => {
                                        setSelectedLV(l);
                                        saveDraft(points, l.id, csvCrs);
                                    }, style: {
                                        padding: 8,
                                        cursor: "pointer",
                                        background: selectedLV?.id === l.id ? "#eef2ff" : "",
                                        borderBottom: "1px solid #eee",
                                    }, children: [_jsx("div", { style: { fontWeight: 700 }, children: l.position }), _jsx("div", { style: { fontSize: 12, opacity: 0.85 }, children: l.kurztext || l.langtext || "" })] }, l.id)))) })] }), _jsxs("div", { style: { marginTop: 12 }, children: [_jsx("label", { children: "Import-Datei (CSV / GPX / KML / GeoJSON)" }), _jsxs("div", { style: { display: "grid", gap: 8, marginTop: 6 }, children: [_jsxs("select", { value: csvCrs, onChange: (e) => {
                                            setCsvCrs(e.target.value);
                                            saveDraft(points, selectedLV?.id ?? null, e.target.value);
                                        }, children: [_jsx("option", { value: "EPSG:4326", children: "WGS84 (lat/lng)" }), _jsx("option", { value: "EPSG:32632", children: "UTM32 WGS84" }), _jsx("option", { value: "EPSG:25832", children: "UTM32 ETRS89" }), _jsx("option", { value: "EPSG:31466", children: "DHDN GK2" }), _jsx("option", { value: "EPSG:31467", children: "DHDN GK3" }), _jsx("option", { value: "EPSG:31468", children: "DHDN GK4" }), _jsx("option", { value: "EPSG:31469", children: "DHDN GK5" })] }), _jsx("input", { type: "file", accept: ".csv,.gpx,.kml,.geojson,.json", onChange: (e) => e.target.files?.[0] && onFileImport(e.target.files[0]) }), _jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [_jsx("button", { className: "btn", onClick: saveAssignment, disabled: busy, children: "Zuweisen & Speichern" }), _jsx("button", { className: "btn", onClick: () => exportCurrentPdf(true), disabled: busy || !selectedLV || points.length === 0, children: "PDF Export & Stampa" }), _jsxs("div", { style: { alignSelf: "center", fontSize: 12, opacity: 0.8 }, children: ["Punkte: ", _jsx("b", { children: points.length }), " | L\u00E4nge:", " ", _jsx("b", { children: (() => {
                                                            const m = polylineLengthMeters(points);
                                                            return m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${m.toFixed(1)} m`;
                                                        })() })] })] })] })] }), err ? _jsx("div", { style: { marginTop: 10, color: "#b91c1c", fontSize: 12 }, children: err }) : null, _jsx("hr", { style: { margin: "14px 0", borderColor: "#eee" } }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 6 }, children: "Gespeicherte Zuweisungen" }), assignments.length === 0 ? (_jsx("div", { style: { opacity: 0.8, fontSize: 12 }, children: "Keine gespeicherten Zuweisungen." })) : (_jsx("div", { style: { maxHeight: 220, overflow: "auto", border: "1px solid #ddd", borderRadius: 8 }, children: assignments.map((a) => {
                                    const lvFromList = resolveLvFromLists(a.lvPosId);
                                    const posLabel = a?.lvPos?.position || lvFromList?.position || a.lvPosId;
                                    const kurz = a?.lvPos?.kurztext || lvFromList?.kurztext || a?.lvPos?.langtext || "";
                                    return (_jsxs("div", { style: { padding: 10, borderBottom: "1px solid #eee", display: "grid", gap: 6 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 8 }, children: [_jsx("div", { style: { fontWeight: 700, fontSize: 13 }, children: posLabel }), _jsx("div", { style: { fontSize: 12, opacity: 0.8 }, children: new Date(a.createdAt).toLocaleString() })] }), kurz ? _jsx("div", { style: { fontSize: 12, opacity: 0.85 }, children: kurz }) : null, _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("button", { className: "btn", onClick: () => drawAssignment(a), disabled: busy, children: "Anzeigen" }), _jsx("button", { className: "btn", onClick: () => loadAssignmentIntoCurrent(a), disabled: busy, children: "Laden" }), _jsx("button", { className: "btn", onClick: () => exportAssignmentPdf(a), disabled: busy, children: "PDF" }), _jsx("button", { className: "btn", onClick: () => deleteAssignment(a.id), disabled: busy, children: "L\u00F6schen" }), _jsxs("div", { style: { fontSize: 12, opacity: 0.8 }, children: ["Punkte: ", _jsx("b", { children: a.points?.length || 0 })] })] })] }, a.id));
                                }) }))] }), _jsxs("div", { style: { marginTop: 10, fontSize: 12, opacity: 0.8 }, children: ["Tipp: Klick auf die Karte f\u00FCgt Punkte hinzu. Import erg\u00E4nzt Punkte. \u201CPunkte l\u00F6schen\u201D l\u00F6scht nur die aktuelle Auswahl (nicht gespeicherte Zuweisungen). Beim Seitenwechsel bleiben ungespeicherte Punkte als Entwurf erhalten.", _jsx("br", {}), "Hinweis: Die ALKIS\u00AE-Parzellarkarte enth\u00E4lt laut Dienstbeschreibung keine Flurst\u00FCcksnummern \u2013 daher sieht man nur Grenzen, nicht die Nummern.", _jsx("br", {}), "Snapshot-Hinweis: Wenn Google-Layer aktiv sind, kann der Screenshot im PDF leer/schwarz sein (CORS). F\u00FCr sicheren Snapshot: OSM/WMS nutzen."] })] }), _jsx("div", { className: "card", style: { padding: 0, overflow: "hidden" }, children: _jsx("div", { id: "gps-map", style: { width: "100%", height: "75vh" } }) })] }));
}
