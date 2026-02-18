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
proj4.defs(
  "EPSG:25832",
  "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs"
);

proj4.defs(
  "EPSG:31466",
  "+proj=tmerc +lat_0=0 +lon_0=6 +k=1 +x_0=2500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs"
);
proj4.defs(
  "EPSG:31467",
  "+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs"
);
proj4.defs(
  "EPSG:31468",
  "+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs"
);
proj4.defs(
  "EPSG:31469",
  "+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=5500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs"
);

function toWGS84(e: number, n: number, crs: string) {
  const [lng, lat] = proj4(proj4(crs), proj4("EPSG:4326"), [e, n]);
  return { lat, lng };
}

function normKey(s: any) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "");
}

function toNum(v: any): number {
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim().replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

type GpsPoint = { lat: number; lng: number; ts?: number };

function clampPts(pts: GpsPoint[]) {
  const MAX = 20000;
  if (pts.length <= MAX) return pts;
  return pts.slice(0, MAX);
}

function isPlausibleWGS84(p: { lat: number; lng: number }) {
  // grob: DACH / Mitteleuropa
  return p.lat >= 35 && p.lat <= 65 && p.lng >= -10 && p.lng <= 30;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function tsForFilename(t = Date.now()) {
  const d = new Date(t);
  return (
    d.getFullYear() +
    "-" +
    pad2(d.getMonth() + 1) +
    "-" +
    pad2(d.getDate()) +
    "_" +
    pad2(d.getHours()) +
    "-" +
    pad2(d.getMinutes()) +
    "-" +
    pad2(d.getSeconds())
  );
}

/**
 * jsPDF può produrre:
 *  - data:application/pdf;base64,....
 *  - data:application/pdf;filename=generated.pdf;base64,....
 * Il backend spesso valida solo la prima.
 */
function normalizePdfDataUrl(u: string) {
  const s = String(u || "");
  if (!s) return s;
  return s.replace(
    /^data:application\/pdf;filename=[^;]+;base64,/,
    "data:application/pdf;base64,"
  );
}

/* ------------------ DISTANCE (Haversine) ------------------ */
function haversineMeters(a: GpsPoint, b: GpsPoint) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

function polylineLengthMeters(pts: GpsPoint[]) {
  if (!pts || pts.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += haversineMeters(pts[i - 1], pts[i]);
  return sum;
}

/* ------------------ API ------------------ */
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const base =
    (import.meta as any)?.env?.VITE_API_URL ||
    (import.meta as any)?.env?.VITE_BACKEND_URL ||
    "http://localhost:4000";

  const res = await fetch(base + url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

/* ------------------ TYPES ------------------ */
type LVPos = {
  id: string;
  position: string;
  kurztext: string;
  langtext?: string | null;
};

type Assignment = {
  id: string;
  projectId: string; // FS key (BA-2025-DEMO)
  lvPosId: string; // DB LVPosition.id
  lvPos?: { position: string; kurztext?: string; langtext?: string | null };
  points: GpsPoint[];
  createdAt: number;
};

/* =======================================================================
   CSV PARSING (ESTESO)
======================================================================== */

function tryParseRowObject(row: any): { lat: number; lng: number } | null {
  const keys = Object.keys(row || {});
  const get = (variants: string[]) => {
    for (const k of keys) {
      const nk = normKey(k);
      if (variants.includes(nk)) return row[k];
    }
    return undefined;
  };

  const lat = toNum(
    get(["lat", "latitude", "breite", "latitudedeg", "y_wgs", "y_wgs84"])
  );
  const lng = toNum(
    get(["lng", "lon", "long", "longitude", "laenge", "longitudedeg", "x_wgs", "x_wgs84"])
  );
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };

  return null;
}

function pickENFromArray(arr: any[]): { e: number; n: number } | null {
  // Caso rilievo: [id, RW, HW, z, ...]
  if (arr.length >= 3) {
    const e = toNum(arr[1]);
    const n = toNum(arr[2]);
    if (Number.isFinite(e) && Number.isFinite(n)) return { e, n };
  }
  // fallback: [RW, HW]
  if (arr.length >= 2) {
    const a0 = toNum(arr[0]);
    const a1 = toNum(arr[1]);
    if (Number.isFinite(a0) && Number.isFinite(a1)) return { e: a0, n: a1 };
  }
  return null;
}

function detectCrsForEN(sample: { e: number; n: number }[]): string[] {
  const candidates = ["EPSG:31468", "EPSG:31467", "EPSG:31469", "EPSG:25832", "EPSG:32632"];
  const scored: { crs: string; ok: number }[] = [];

  for (const crs of candidates) {
    let ok = 0;
    for (const s of sample) {
      try {
        const p = toWGS84(s.e, s.n, crs);
        if (isPlausibleWGS84(p)) ok++;
      } catch {}
    }
    scored.push({ crs, ok });
  }

  scored.sort((a, b) => b.ok - a.ok);
  return scored.filter((x) => x.ok > 0).map((x) => x.crs);
}

function parseCsvToPointsAuto(
  rawRows: any[],
  preferredCrs: string
): { pts: GpsPoint[]; usedCrs: string; debug: string } {
  // WGS84 diretti (solo se header vero e colonne lat/lng)
  const directWgs: GpsPoint[] = [];
  for (const row of rawRows) {
    if (row && !Array.isArray(row) && typeof row === "object") {
      const p = tryParseRowObject(row);
      if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
        if (isPlausibleWGS84(p)) directWgs.push({ lat: p.lat, lng: p.lng });
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
  const enRows: { e: number; n: number }[] = [];
  const sampleEN: { e: number; n: number }[] = [];

  for (const row of rawRows) {
    if (!row) continue;
    if (Array.isArray(row)) {
      const en = pickENFromArray(row);
      if (en) {
        enRows.push(en);
        if (sampleEN.length < 10) sampleEN.push(en);
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
    const pts: GpsPoint[] = [];
    let ok = 0;

    for (const en of enRows) {
      try {
        const p = toWGS84(en.e, en.n, crs);
        if (isPlausibleWGS84(p)) {
          pts.push({ lat: p.lat, lng: p.lng });
          ok++;
        }
      } catch {}
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
    const pts: GpsPoint[] = [];
    let ok = 0;
    for (const en of enRows) {
      try {
        const p = toWGS84(en.e, en.n, crs);
        if (isPlausibleWGS84(p)) {
          pts.push({ lat: p.lat, lng: p.lng });
          ok++;
        }
      } catch {}
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
  const ctx: any = useProject();
  const project = ctx?.currentProject || ctx?.selectedProject || ctx?.project || null;

  const projectCode =
    (project as any)?.code ||
    (project as any)?.baustellenNummer ||
    (project as any)?.baustelleNummer ||
    (project as any)?.projectCode ||
    (project as any)?.projektCode ||
    (project as any)?.slug ||
    (project as any)?.key ||
    "";

  const projectDbId = (project as any)?.id || "";
  const projectId = (projectCode || projectDbId || "").trim();

  const mapRef = React.useRef<L.Map | null>(null);
  const pointsLayerRef = React.useRef<L.LayerGroup | null>(null);
  const lineLayerRef = React.useRef<L.LayerGroup | null>(null);

  const [points, setPoints] = React.useState<GpsPoint[]>([]);
  const [selectedLV, setSelectedLV] = React.useState<LVPos | null>(null);
  const [lvList, setLvList] = React.useState<LVPos[]>([]);
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [csvCrs, setCsvCrs] = React.useState("EPSG:31468"); // Bayern GK4 default
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // Draft-Persistenz (damit beim Seitenwechsel nichts verloren geht)
  const DRAFT_KEY = React.useMemo(() => {
    const key = (projectId || "no-project").replace(/[^\w.-]/g, "_");
    return `rlc_gpszuweisung_draft_v1_${key}`;
  }, [projectId]);

  function saveDraft(nextPoints: GpsPoint[], nextSelectedId?: string | null, nextCsvCrs?: string) {
    try {
      const payload = {
        projectId,
        points: nextPoints,
        selectedLvId: nextSelectedId ?? selectedLV?.id ?? null,
        csvCrs: nextCsvCrs ?? csvCrs,
        savedAt: Date.now(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch {}
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  /* ------------------ MAP INIT ------------------ */
  React.useEffect(() => {
    if (mapRef.current) return;

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
    const bayernLuftbild = (L as any).tileLayer.wms(
      "https://geoservices.bayern.de/od/wms/dop/v1/dop20?",
      {
        layers: "by_dop20c",
        format: "image/jpeg",
        transparent: false,
        version: "1.3.0",
        tiled: true,
        maxZoom: 21,
        attribution: "© Bayerische Vermessungsverwaltung",
        crossOrigin: true, // ✅
      }
    );

    const base: any = {
      OSM: osm,
      "Bayern Luftbild (WMS)": bayernLuftbild,
    };

    // Optional: Google (ATTENZIONE: spesso blocca lo screenshot per CORS/licenza)
    try {
      const key = (import.meta as any)?.env?.VITE_GOOGLE_MAPS_KEY;
      if (key && (L as any).gridLayer?.googleMutant) {
        const gRoad = (L as any).gridLayer.googleMutant({
          type: "roadmap",
          maxZoom: 21,
          apiKey: key,
        });
        const gSat = (L as any).gridLayer.googleMutant({
          type: "satellite",
          maxZoom: 21,
          apiKey: key,
        });
        base["Google Road"] = gRoad;
        base["Google Sat"] = gSat;
      }
    } catch (e) {
      console.warn("Google layers disabled:", e);
    }

    // OVERLAYS (Parzellen + Grenzen)
    const overlayParzellen = (L as any).tileLayer.wms(
      "https://geoservices.bayern.de/od/wms/alkis/v1/parzellarkarte?",
      {
        layers: "by_alkis_parzellarkarte_umr_schwarz",
        format: "image/png",
        transparent: true,
        version: "1.3.0",
        tiled: true,
        maxZoom: 21,
        attribution: "© Bayerische Vermessungsverwaltung (ALKIS® OpenData)",
        crossOrigin: true, // ✅
      }
    );

    const overlayGrenzen = (L as any).tileLayer.wms(
      "https://geoservices.bayern.de/od/wms/alkis/v1/verwaltungsgrenzen?",
      {
        layers: "by_alkis_gmd_grenze",
        format: "image/png",
        transparent: true,
        version: "1.3.0",
        tiled: true,
        maxZoom: 21,
        attribution: "© Bayerische Vermessungsverwaltung (ALKIS® OpenData)",
        crossOrigin: true, // ✅
      }
    );

    const overlays: any = {
      "Flurkarte / Parzellen (WMS)": overlayParzellen,
      "Grenzen (WMS)": overlayGrenzen,
    };

    L.control.layers(base, overlays).addTo(m);

    // Default ON
    overlayParzellen.addTo(m);
    overlayGrenzen.addTo(m);

    pointsLayerRef.current = L.layerGroup().addTo(m);
    lineLayerRef.current = L.layerGroup().addTo(m);

    m.on("click", (e: any) => {
      const p: GpsPoint = { lat: e.latlng.lat, lng: e.latlng.lng, ts: Date.now() };
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

  function redrawCurrent(pts: GpsPoint[]) {
    const m = mapRef.current;
    if (!m) return;

    clearLayers();

    const lgPts = pointsLayerRef.current!;
    const lgLine = lineLayerRef.current!;

    if (pts.length) {
      for (const p of pts) L.circleMarker([p.lat, p.lng], { radius: 4 }).addTo(lgPts);
      if (pts.length >= 2) {
        L.polyline(
          pts.map((p) => [p.lat, p.lng]) as any,
          { weight: 3 }
        ).addTo(lgLine);
      }

      m.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng]) as any), { padding: [30, 30] });
    }
  }

  function drawAssignment(ass: Assignment) {
    const m = mapRef.current;
    if (!m) return;

    clearLayers();

    const lgPts = pointsLayerRef.current!;
    const lgLine = lineLayerRef.current!;
    const pts = ass.points || [];

    for (const p of pts) L.circleMarker([p.lat, p.lng], { radius: 4 }).addTo(lgPts);
    if (pts.length >= 2) {
      L.polyline(
        pts.map((p) => [p.lat, p.lng]) as any,
        { weight: 3 }
      ).addTo(lgLine);
    }

    if (pts.length) {
      m.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng]) as any), { padding: [30, 30] });
    }
  }

  function resolveLvFromLists(lvPosId: string): LVPos | null {
    if (!lvPosId) return null;
    return lvList.find((x) => x.id === lvPosId) || null;
  }

  function loadAssignmentIntoCurrent(a: Assignment) {
    const pts = clampPts(a.points || []);
    setPoints(pts);
    redrawCurrent(pts);
    saveDraft(pts, a.lvPosId ?? null, csvCrs);

    const found = resolveLvFromLists(a.lvPosId);
    if (found) setSelectedLV(found);

    setErr(`Zuweisung geladen: ${found?.position || a.lvPosId} (${pts.length} Punkte)`);
  }

  /* ------------------ DATA: LV / ASSIGNMENTS ------------------ */
  async function loadLV() {
    if (!projectDbId) return;
    setBusy(true);
    setErr(null);

    try {
      const res = await api<{
        ok: boolean;
        page: number;
        pageSize: number;
        total: number;
        rows: Array<{ id: string; title: string; version: number; positions: LVPos[] }>;
      }>(`/api/projects/${encodeURIComponent(projectDbId)}/lv?page=1&pageSize=20`);

      const latest = (res.rows || [])[0];
      setLvList((latest?.positions || []) as any);

      // Draft restore selectedLV
      const d = loadDraft();
      if (d?.selectedLvId) {
        const found = (latest?.positions || []).find((p: any) => p.id === d.selectedLvId) || null;
        if (found) setSelectedLV(found);
      }
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function loadAssignments() {
    if (!projectId) return;
    setBusy(true);
    setErr(null);

    try {
      const res = await api<{ ok: boolean; items: Assignment[] }>(
        `/api/gps/list?projectId=${encodeURIComponent(projectId)}`
      );

      // se backend non include lvPos, proviamo ad arricchirlo con lvList
      const enriched = (res.items || []).map((a) => {
        if (a.lvPos) return a;
        const f = lvList.find((x) => x.id === a.lvPosId);
        if (!f) return a;
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
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
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
    if (d?.csvCrs) setCsvCrs(d.csvCrs);
    if (Array.isArray(d?.points) && d.points.length) {
      const restored = clampPts(d.points as GpsPoint[]);
      setPoints(restored);
      setTimeout(() => redrawCurrent(restored), 200);
    }

    if (projectDbId) loadLV();
    if (projectId) loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, projectDbId]);

  async function saveAssignment() {
    if (!projectId) return alert("Kein Projekt gewählt.");
    if (!selectedLV) return alert("Bitte LV-Position wählen.");
    if (!points.length) return alert("Keine Punkte vorhanden.");

    setBusy(true);
    setErr(null);

    try {
      const payload: Assignment = {
        id: crypto.randomUUID(),
        projectId,
        lvPosId: selectedLV.id,
        points: clampPts(points),
        createdAt: Date.now(),
      };

      const res = await api<{ ok: boolean; item: Assignment }>("/api/gps/assign", {
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
    } catch (e: any) {
      setErr(String(e?.message || e));
      alert("Fehler beim Speichern.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAssignment(id: string) {
    if (!projectId) return;
    if (!confirm("Wirklich löschen?")) return;

    setBusy(true);
    setErr(null);

    try {
      await api<{ ok: boolean }>(
        `/api/gps/delete?id=${encodeURIComponent(id)}&projectId=${encodeURIComponent(projectId)}`,
        { method: "DELETE" }
      );
      setAssignments((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      setErr(String(e?.message || e));
      alert("Fehler beim Löschen.");
    } finally {
      setBusy(false);
    }
  }

  function clearCurrent() {
    setPoints([]);
    clearLayers();
    saveDraft([]);
  }

  /* ------------------ IMPORTS ------------------ */
  function importCSV(file: File, preferredCrs: string) {
    setErr(null);

    const parseNoHeader = () => {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        delimiter: "",
        complete: (r2) => {
          const rawRows = (r2.data as any[]) || [];
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
        const rawRows = (r.data as any[]) || [];
        const out = parseCsvToPointsAuto(rawRows, preferredCrs);
        if ((out.pts || []).length === 0) return parseNoHeader();

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

  async function importXML(file: File) {
    setErr(null);
    const text = await file.text();
    const xml = new DOMParser().parseFromString(text, "application/xml");
    const fc = file.name.toLowerCase().endsWith(".gpx") ? gpx(xml) : kml(xml);

    const pts: GpsPoint[] = [];
    (fc.features || []).forEach((f: any) => {
      if (f.geometry?.type === "LineString") {
        f.geometry.coordinates.forEach((c: any) => pts.push({ lng: c[0], lat: c[1] }));
      } else if (f.geometry?.type === "Point") {
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

  async function importGeoJSON(file: File) {
    setErr(null);
    const gj = JSON.parse(await file.text());
    const pts: GpsPoint[] = [];

    (gj.features || []).forEach((f: any) => {
      if (f.geometry?.type === "LineString") {
        f.geometry.coordinates.forEach((c: any) => pts.push({ lng: c[0], lat: c[1] }));
      } else if (f.geometry?.type === "Point") {
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

  function onFileImport(file: File) {
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext === "csv") return importCSV(file, csvCrs);
    if (ext === "gpx" || ext === "kml") return importXML(file);
    if (ext === "geojson" || ext === "json") return importGeoJSON(file);
    alert("Format nicht unterstützt");
  }

  /* ------------------ MAP SNAPSHOT ------------------ */
  async function captureMapSnapshotPngDataUrl(): Promise<string | null> {
    const el = document.getElementById("gps-map");
    const m = mapRef.current;
    if (!el || !m) return null;

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
    } catch (e) {
      console.warn("Map snapshot failed:", e);
      return null;
    }
  }

  /* ------------------ PDF EXPORT (Print + Save Server) ------------------ */
  function buildPdfDoc(opts: {
    projectTitle: string;
    projectId: string;
    projectDbId: string;
    lv?: { position?: string; kurztext?: string; langtext?: string | null; lvPosId?: string };
    pts: GpsPoint[];
    createdAt?: number;
    mapPngDataUrl?: string | null;
  }) {
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
    y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : y + 40;

    // ✅ Mappa screenshot nel PDF
    if (opts.mapPngDataUrl) {
      try {
        // @ts-ignore
        const imgProps = (doc as any).getImageProperties(opts.mapPngDataUrl);
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
      } catch (e) {
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
        doc.text(
          `RLC Bausoftware – GPSZuweisung   |   Seite ${doc.getNumberOfPages()}`,
          marginX,
          290
        );
      },
    });

    return doc;
  }

  function openPrintPdf(doc: jsPDF) {
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
      } catch {}
    }, 250);
  }

  async function savePdfToServer(doc: jsPDF, filenameHint: string) {
    if (!projectId) throw new Error("Kein projectId");

    let dataUrl = normalizePdfDataUrl(doc.output("datauristring"));
    if (!dataUrl.startsWith("data:application/pdf;base64,")) {
      throw new Error("PDF DataURL ist ungültig (kein data:application/pdf;base64, ...).");
    }

    return await api<{ ok: boolean; filename: string; url: string }>(`/api/gps/export-pdf`, {
      method: "POST",
      body: JSON.stringify({
        projectId,
        filenameHint,
        pdfDataUrl: dataUrl,
      }),
    });
  }

  async function exportCurrentPdf(printAlso = true) {
    if (!projectId) return alert("Kein Projekt gewählt.");
    if (!selectedLV) return alert("Bitte LV-Position wählen.");
    if (!points.length) return alert("Keine Punkte vorhanden.");

    setBusy(true);
    setErr(null);
    try {
      const pts = clampPts(points);

      // ✅ ensure map view is on the points before snapshot
      redrawCurrent(pts);

      const mapSnap = await captureMapSnapshotPngDataUrl();

      const doc = buildPdfDoc({
        projectTitle: (project as any)?.name || (project as any)?.title || projectCode || "—",
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

      if (printAlso) openPrintPdf(doc);

      alert(`PDF gespeichert: ${saved.filename}`);
      window.open(saved.url, "_blank");
    } catch (e: any) {
      setErr(String(e?.message || e));
      alert("PDF Export fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function exportAssignmentPdf(a: Assignment) {
    if (!projectId) return alert("Kein Projekt gewählt.");
    if (!a?.points?.length) return alert("Keine Punkte in dieser Zuweisung.");

    setBusy(true);
    setErr(null);
    try {
      // ✅ ensure map view is on the assignment before snapshot
      drawAssignment(a);

      const mapSnap = await captureMapSnapshotPngDataUrl();

      const lvPos = (a as any)?.lvPos || null;
      const doc = buildPdfDoc({
        projectTitle: (project as any)?.name || (project as any)?.title || projectCode || "—",
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

      const hint = `gpszuweisung_${(lvPos?.position || a.lvPosId || "LV")}_${tsForFilename(
        a.createdAt
      )}.pdf`;
      const saved = await savePdfToServer(doc, hint);

      openPrintPdf(doc);
      window.open(saved.url, "_blank");
    } catch (e: any) {
      setErr(String(e?.message || e));
      alert("PDF Export fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  /* ------------------ UI ------------------ */
  return (
    <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }}>
      <div className="card" style={{ padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>GPS-basierte Positionszuweisung</h3>

        <div style={{ marginBottom: 10, opacity: 0.9 }}>
          <div style={{ fontSize: 12 }}>Projekt</div>
          <div style={{ fontWeight: 700 }}>
            {(project as any)?.name || (project as any)?.title || projectCode || "—"}
          </div>

          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Projekt-Code (FS): <b>{projectCode || "—"}</b>
          </div>

          <div style={{ fontSize: 12, opacity: 0.8 }}>Projekt-ID (DB): {projectDbId || "—"}</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={loadLV} disabled={!projectDbId || busy}>
            LV laden
          </button>
          <button className="btn" onClick={loadAssignments} disabled={!projectId || busy}>
            Zuweisungen laden
          </button>
          <button className="btn" onClick={clearCurrent} disabled={busy}>
            Punkte löschen
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <label>LV-Position wählen</label>
          <div
            style={{
              maxHeight: 170,
              overflow: "auto",
              border: "1px solid #ddd",
              borderRadius: 8,
              marginTop: 6,
            }}
          >
            {lvList.length === 0 ? (
              <div style={{ padding: 10, opacity: 0.8 }}>Keine LV-Positionen geladen.</div>
            ) : (
              lvList.map((l) => (
                <div
                  key={l.id}
                  onClick={() => {
                    setSelectedLV(l);
                    saveDraft(points, l.id, csvCrs);
                  }}
                  style={{
                    padding: 8,
                    cursor: "pointer",
                    background: selectedLV?.id === l.id ? "#eef2ff" : "",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{l.position}</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>{l.kurztext || l.langtext || ""}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label>Import-Datei (CSV / GPX / KML / GeoJSON)</label>
          <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
            <select
              value={csvCrs}
              onChange={(e) => {
                setCsvCrs(e.target.value);
                saveDraft(points, selectedLV?.id ?? null, e.target.value);
              }}
            >
              <option value="EPSG:4326">WGS84 (lat/lng)</option>
              <option value="EPSG:32632">UTM32 WGS84</option>
              <option value="EPSG:25832">UTM32 ETRS89</option>
              <option value="EPSG:31466">DHDN GK2</option>
              <option value="EPSG:31467">DHDN GK3</option>
              <option value="EPSG:31468">DHDN GK4</option>
              <option value="EPSG:31469">DHDN GK5</option>
            </select>

            <input
              type="file"
              accept=".csv,.gpx,.kml,.geojson,.json"
              onChange={(e) => e.target.files?.[0] && onFileImport(e.target.files[0])}
            />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={saveAssignment} disabled={busy}>
                Zuweisen & Speichern
              </button>

              <button
                className="btn"
                onClick={() => exportCurrentPdf(true)}
                disabled={busy || !selectedLV || points.length === 0}
              >
                PDF Export & Stampa
              </button>

              <div style={{ alignSelf: "center", fontSize: 12, opacity: 0.8 }}>
                Punkte: <b>{points.length}</b> | Länge:{" "}
                <b>
                  {(() => {
                    const m = polylineLengthMeters(points);
                    return m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${m.toFixed(1)} m`;
                  })()}
                </b>
              </div>
            </div>
          </div>
        </div>

        {err ? <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 12 }}>{err}</div> : null}

        <hr style={{ margin: "14px 0", borderColor: "#eee" }} />

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Gespeicherte Zuweisungen</div>

          {assignments.length === 0 ? (
            <div style={{ opacity: 0.8, fontSize: 12 }}>Keine gespeicherten Zuweisungen.</div>
          ) : (
            <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
              {assignments.map((a) => {
                const lvFromList = resolveLvFromLists(a.lvPosId);
                const posLabel = (a as any)?.lvPos?.position || lvFromList?.position || a.lvPosId;
                const kurz =
                  (a as any)?.lvPos?.kurztext || lvFromList?.kurztext || (a as any)?.lvPos?.langtext || "";

                return (
                  <div key={a.id} style={{ padding: 10, borderBottom: "1px solid #eee", display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{posLabel}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{new Date(a.createdAt).toLocaleString()}</div>
                    </div>

                    {kurz ? <div style={{ fontSize: 12, opacity: 0.85 }}>{kurz}</div> : null}

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button className="btn" onClick={() => drawAssignment(a)} disabled={busy}>
                        Anzeigen
                      </button>

                      <button className="btn" onClick={() => loadAssignmentIntoCurrent(a)} disabled={busy}>
                        Laden
                      </button>

                      <button className="btn" onClick={() => exportAssignmentPdf(a)} disabled={busy}>
                        PDF
                      </button>

                      <button className="btn" onClick={() => deleteAssignment(a.id)} disabled={busy}>
                        Löschen
                      </button>

                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        Punkte: <b>{a.points?.length || 0}</b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          Tipp: Klick auf die Karte fügt Punkte hinzu. Import ergänzt Punkte. “Punkte löschen” löscht nur die aktuelle
          Auswahl (nicht gespeicherte Zuweisungen). Beim Seitenwechsel bleiben ungespeicherte Punkte als Entwurf
          erhalten.
          <br />
          Hinweis: Die ALKIS®-Parzellarkarte enthält laut Dienstbeschreibung keine Flurstücksnummern – daher sieht man
          nur Grenzen, nicht die Nummern.
          <br />
          Snapshot-Hinweis: Wenn Google-Layer aktiv sind, kann der Screenshot im PDF leer/schwarz sein (CORS). Für
          sicheren Snapshot: OSM/WMS nutzen.
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div id="gps-map" style={{ width: "100%", height: "75vh" }} />
      </div>
    </div>
  );
}
