import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import React from "react";
import L from "leaflet";
// @ts-ignore
import "leaflet.gridlayer.googlemutant";
import "leaflet/dist/leaflet.css";
function clampPts(pts, max = 20000) {
    if (!Array.isArray(pts))
        return [];
    return pts.length > max ? pts.slice(0, max) : pts;
}
const cardStyle = {
    padding: 0,
    overflow: "hidden",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff"
};
const hintStyle = {
    padding: 10,
    fontSize: 12,
    opacity: 0.8
};
export const CadGeoMap = React.forwardRef(function CadGeoMap({ initialCenter = { lat: 48.14, lng: 11.58 }, initialZoom = 12, shape = null, autoFit = true, onMapClick, height = "75vh" }, ref) {
    const containerRef = React.useRef(null);
    const mapRef = React.useRef(null);
    const geomLayerRef = React.useRef(null);
    const [localShape, setLocalShape] = React.useState(shape ?? null);
    React.useEffect(() => {
        setLocalShape(shape ?? null);
    }, [shape]);
    React.useEffect(() => {
        const container = containerRef.current;
        if (!container || mapRef.current)
            return;
        const map = L.map(container, {
            zoomControl: true,
            preferCanvas: true,
            maxZoom: 22
        }).setView([initialCenter.lat, initialCenter.lng], initialZoom);
        const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "© OpenStreetMap",
            crossOrigin: true
        }).addTo(map);
        const bayernLuftbild = L.tileLayer.wms("https://geoservices.bayern.de/od/wms/dop/v1/dop20?", {
            layers: "by_dop20c",
            format: "image/jpeg",
            transparent: false,
            version: "1.3.0",
            tiled: true,
            maxZoom: 21,
            attribution: "© Bayerische Vermessungsverwaltung",
            crossOrigin: true
        });
        const baseLayers = {
            OSM: osm,
            "Bayern Luftbild (WMS)": bayernLuftbild
        };
        try {
            const key = import.meta?.env?.VITE_GOOGLE_MAPS_KEY;
            if (key && L.gridLayer?.googleMutant) {
                baseLayers["Google Road"] = L.gridLayer.googleMutant({
                    type: "roadmap",
                    maxZoom: 21,
                    apiKey: key
                });
                baseLayers["Google Sat"] = L.gridLayer.googleMutant({
                    type: "satellite",
                    maxZoom: 21,
                    apiKey: key
                });
            }
        }
        catch (e) {
            console.warn("Google layers disabled:", e);
        }
        const overlayParzellen = L.tileLayer.wms("https://geoservices.bayern.de/od/wms/alkis/v1/parzellarkarte?", {
            layers: "by_alkis_parzellarkarte_umr_schwarz",
            format: "image/png",
            transparent: true,
            version: "1.3.0",
            tiled: true,
            maxZoom: 21,
            attribution: "© Bayerische Vermessungsverwaltung (ALKIS® OpenData)",
            crossOrigin: true
        });
        const overlayGrenzen = L.tileLayer.wms("https://geoservices.bayern.de/od/wms/alkis/v1/verwaltungsgrenzen?", {
            layers: "by_alkis_gmd_grenze",
            format: "image/png",
            transparent: true,
            version: "1.3.0",
            tiled: true,
            maxZoom: 21,
            attribution: "© Bayerische Vermessungsverwaltung (ALKIS® OpenData)",
            crossOrigin: true
        });
        const overlays = {
            "Flurkarte / Parzellen (WMS)": overlayParzellen,
            "Grenzen (WMS)": overlayGrenzen
        };
        L.control.layers(baseLayers, overlays).addTo(map);
        overlayParzellen.addTo(map);
        overlayGrenzen.addTo(map);
        geomLayerRef.current = L.layerGroup().addTo(map);
        map.on("click", (e) => {
            onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
        });
        mapRef.current = map;
        setTimeout(() => {
            map.invalidateSize();
        }, 200);
        return () => {
            map.off();
            map.remove();
            mapRef.current = null;
            geomLayerRef.current = null;
        };
    }, [initialCenter.lat, initialCenter.lng, initialZoom, onMapClick]);
    const clearGeom = React.useCallback(() => {
        geomLayerRef.current?.clearLayers();
    }, []);
    const drawGeom = React.useCallback((s) => {
        const map = mapRef.current;
        const layer = geomLayerRef.current;
        if (!map || !layer)
            return;
        clearGeom();
        if (!s)
            return;
        const pts = clampPts(s.pts, 20000);
        if (!pts.length)
            return;
        if (s.type === "points") {
            pts.forEach((p) => {
                L.circleMarker([p.lat, p.lng], { radius: 4 }).addTo(layer);
            });
        }
        else if (s.type === "line") {
            pts.forEach((p) => {
                L.circleMarker([p.lat, p.lng], { radius: 3 }).addTo(layer);
            });
            if (pts.length >= 2) {
                L.polyline(pts.map((p) => [p.lat, p.lng]), { weight: 3 }).addTo(layer);
            }
        }
        else if (s.type === "polygon") {
            pts.forEach((p) => {
                L.circleMarker([p.lat, p.lng], { radius: 3 }).addTo(layer);
            });
            if (pts.length >= 3) {
                L.polygon(pts.map((p) => [p.lat, p.lng]), { weight: 2, fillOpacity: 0.12 }).addTo(layer);
            }
        }
        if (autoFit) {
            try {
                const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng]));
                map.fitBounds(bounds, { padding: [30, 30] });
            }
            catch {
                // ignore
            }
        }
    }, [autoFit, clearGeom]);
    React.useEffect(() => {
        drawGeom(localShape);
    }, [localShape, drawGeom]);
    const exportSnapshotPngDataUrl = React.useCallback(async () => {
        const el = containerRef.current;
        const map = mapRef.current;
        if (!el || !map)
            return null;
        try {
            map.invalidateSize();
            await new Promise((r) => setTimeout(r, 250));
            const { default: html2canvas } = await import("html2canvas");
            const canvas = await html2canvas(el, {
                useCORS: true,
                allowTaint: false,
                backgroundColor: "#ffffff",
                scale: 2,
                logging: false
            });
            return canvas.toDataURL("image/png");
        }
        catch (e) {
            console.warn("Map snapshot failed:", e);
            return null;
        }
    }, []);
    React.useImperativeHandle(ref, () => ({
        fitToShape: () => {
            const map = mapRef.current;
            const pts = localShape?.pts;
            if (!map || !pts?.length)
                return;
            const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng]));
            map.fitBounds(bounds, { padding: [30, 30] });
        },
        clear: () => setLocalShape(null),
        exportSnapshotPngDataUrl,
        setShape: (s) => setLocalShape(s)
    }), [localShape, exportSnapshotPngDataUrl]);
    return (_jsxs("div", { className: rlcClass(null, cardStyle), children: [_jsx("div", { ref: containerRef, className: rlcClass(null, {
                    width: "100%",
                    height
                }) }), _jsx("div", { className: rlcClass(null, hintStyle), children: "Hinweis: Bei aktivem Google-Layer kann der Snapshot leer oder schwarz sein (CORS). F\u00FCr sichere Exporte besser OSM/WMS verwenden." })] }));
});
