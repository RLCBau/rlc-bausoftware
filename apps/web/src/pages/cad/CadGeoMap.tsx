import React from "react";
import L from "leaflet";
// @ts-ignore
import "leaflet.gridlayer.googlemutant";
import "leaflet/dist/leaflet.css";

export type LatLng = { lat: number; lng: number };
export type GeoShape =
  | { type: "points"; pts: LatLng[] }
  | { type: "line"; pts: LatLng[] }
  | { type: "polygon"; pts: LatLng[] };

type Props = {
  /** opzionale: centro iniziale */
  initialCenter?: LatLng;
  initialZoom?: number;

  /** se passi shape, viene disegnata */
  shape?: GeoShape | null;

  /** se true, fa fit automatico quando cambia shape */
  autoFit?: boolean;

  /** callback se l’utente clicca sulla mappa (per picking / ancoraggi CAD) */
  onMapClick?: (p: LatLng) => void;

  /** altezza contenitore */
  height?: string | number;
};

export type CadGeoMapHandle = {
  fitToShape: () => void;
  clear: () => void;
  exportSnapshotPngDataUrl: () => Promise<string | null>;
  setShape: (s: GeoShape | null) => void;
};

function clampPts<T>(pts: T[], max = 20000) {
  if (!pts) return [];
  return pts.length > max ? pts.slice(0, max) : pts;
}

export const CadGeoMap = React.forwardRef<CadGeoMapHandle, Props>(function CadGeoMap(
  {
    initialCenter = { lat: 48.14, lng: 11.58 },
    initialZoom = 12,
    shape = null,
    autoFit = true,
    onMapClick,
    height = "75vh",
  },
  ref
) {
  const mapRef = React.useRef<L.Map | null>(null);
  const baseLayersRef = React.useRef<Record<string, L.Layer>>({});
  const overlayLayersRef = React.useRef<Record<string, L.Layer>>({});
  const geomLayerRef = React.useRef<L.LayerGroup | null>(null);

  const [localShape, setLocalShape] = React.useState<GeoShape | null>(shape ?? null);

  // keep local in sync
  React.useEffect(() => setLocalShape(shape ?? null), [shape]);

  React.useEffect(() => {
    if (mapRef.current) return;

    const m = L.map("cad-geo-map", {
      zoomControl: true,
      preferCanvas: true,
      maxZoom: 22,
    }).setView([initialCenter.lat, initialCenter.lng], initialZoom);

    // ========== BASE LAYERS ==========
    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
      crossOrigin: true,
    }).addTo(m);

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
        crossOrigin: true,
      }
    );

    const base: Record<string, L.Layer> = {
      OSM: osm,
      "Bayern Luftbild (WMS)": bayernLuftbild,
    };

    // Google Mutant (opzionale)
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

    // ========== OVERLAYS (Parzellen + Grenzen) ==========
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
        crossOrigin: true,
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
        crossOrigin: true,
      }
    );

    const overlays: Record<string, L.Layer> = {
      "Flurkarte / Parzellen (WMS)": overlayParzellen,
      "Grenzen (WMS)": overlayGrenzen,
    };

    baseLayersRef.current = base;
    overlayLayersRef.current = overlays;

    L.control.layers(base, overlays).addTo(m);

    // default ON
    overlayParzellen.addTo(m);
    overlayGrenzen.addTo(m);

    // geometry layer
    geomLayerRef.current = L.layerGroup().addTo(m);

    // click callback
    m.on("click", (e: any) => {
      onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapRef.current = m;
    setTimeout(() => m.invalidateSize(), 200);
  }, [initialCenter.lat, initialCenter.lng, initialZoom, onMapClick]);

  function clearGeom() {
    geomLayerRef.current?.clearLayers();
  }

  function drawGeom(s: GeoShape | null) {
    const m = mapRef.current;
    if (!m) return;

    clearGeom();
    if (!s) return;

    const lg = geomLayerRef.current!;
    const pts = clampPts(s.pts || [], 20000);

    if (!pts.length) return;

    if (s.type === "points") {
      pts.forEach((p) => L.circleMarker([p.lat, p.lng], { radius: 4 }).addTo(lg));
    } else if (s.type === "line") {
      pts.forEach((p) => L.circleMarker([p.lat, p.lng], { radius: 3 }).addTo(lg));
      if (pts.length >= 2) L.polyline(pts.map((p) => [p.lat, p.lng]) as any, { weight: 3 }).addTo(lg);
    } else if (s.type === "polygon") {
      pts.forEach((p) => L.circleMarker([p.lat, p.lng], { radius: 3 }).addTo(lg));
      if (pts.length >= 3) {
        L.polygon(pts.map((p) => [p.lat, p.lng]) as any, { weight: 2, fillOpacity: 0.12 }).addTo(lg);
      }
    }

    if (autoFit) {
      try {
        const b = L.latLngBounds(pts.map((p) => [p.lat, p.lng]) as any);
        m.fitBounds(b, { padding: [30, 30] });
      } catch {}
    }
  }

  React.useEffect(() => {
    drawGeom(localShape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localShape]);

  async function exportSnapshotPngDataUrl(): Promise<string | null> {
    const el = document.getElementById("cad-geo-map");
    const m = mapRef.current;
    if (!el || !m) return null;

    // html2canvas è più affidabile se importato dinamicamente (evita bundle issues)
    try {
      m.invalidateSize();
      await new Promise((r) => setTimeout(r, 250));
      const { default: html2canvas } = await import("html2canvas");

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

  React.useImperativeHandle(ref, () => ({
    fitToShape: () => {
      const m = mapRef.current;
      if (!m || !localShape?.pts?.length) return;
      const pts = localShape.pts;
      const b = L.latLngBounds(pts.map((p) => [p.lat, p.lng]) as any);
      m.fitBounds(b, { padding: [30, 30] });
    },
    clear: () => setLocalShape(null),
    exportSnapshotPngDataUrl,
    setShape: (s) => setLocalShape(s),
  }));

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div id="cad-geo-map" style={{ width: "100%", height }} />
      <div style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>
        Hinweis: Bei aktivem Google-Layer kann der Snapshot leer/schwarz sein (CORS). Für sichere Exporte: OSM/WMS.
      </div>
    </div>
  );
});
