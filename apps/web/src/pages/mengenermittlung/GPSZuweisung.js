import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { savePdfWithCompanyHeader as saveRlcPdfWithCompanyHeader } from "../../lib/pdf/companyPdfHeader";
import { apiUrl } from "../../lib/apiBase";
import MengPageHeader from "./MengPageHeader";
import React from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import proj4 from "proj4";
// @ts-ignore
import "leaflet.gridlayer.googlemutant";
import { gpx, kml } from "@tmcw/togeojson";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import "leaflet/dist/leaflet.css";
import { useProject } from "../../store/useProject";
/* ===================== PROJEKTIONEN ===================== */
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
proj4.defs("EPSG:32632", "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs");
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs");
proj4.defs("EPSG:31466", "+proj=tmerc +lat_0=0 +lon_0=6 +k=1 +x_0=2500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs");
proj4.defs("EPSG:31467", "+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs");
proj4.defs("EPSG:31468", "+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs");
proj4.defs("EPSG:31469", "+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=5500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs");
function toWGS84(e, n, crs) {
    const [lng, lat] = proj4(crs, "EPSG:4326", [e, n]);
    return { lat, lng };
}
function crsDisplayName(crs) {
    const labels = {
        "EPSG:4326": "WGS 84 – geografische Koordinaten",
        "EPSG:25832": "ETRS89 / UTM Zone 32N",
        "EPSG:32632": "WGS 84 / UTM Zone 32N",
        "EPSG:31466": "DHDN / Gauß-Krüger Zone 2",
        "EPSG:31467": "DHDN / Gauß-Krüger Zone 3",
        "EPSG:31468": "DHDN / Gauß-Krüger Zone 4",
        "EPSG:31469": "DHDN / Gauß-Krüger Zone 5"
    };
    return labels[String(crs || "").trim()] || crs || "Nicht angegeben";
}
function projectedPointValues(point, fallbackCrs) {
    const crs = point.sourceCrs || fallbackCrs || "EPSG:25832";
    if (Number.isFinite(point.easting) &&
        Number.isFinite(point.northing)) {
        return {
            easting: Number(point.easting),
            northing: Number(point.northing),
            crs
        };
    }
    if (crs === "EPSG:4326") {
        return {
            easting: point.lng,
            northing: point.lat,
            crs
        };
    }
    try {
        const [easting, northing] = proj4("EPSG:4326", crs, [point.lng, point.lat]);
        return { easting, northing, crs };
    }
    catch {
        return {
            easting: point.lng,
            northing: point.lat,
            crs: "EPSG:4326"
        };
    }
}
function formatCoordinate(value, crs) {
    if (!Number.isFinite(value))
        return "?";
    return crs === "EPSG:4326" ?
        Number(value).toFixed(8) :
        Number(value).toFixed(3);
}
function formatHeight(value) {
    return Number.isFinite(value) ? Number(value).toFixed(3) : "";
}
/* ===================== GENERIC HELPERS ===================== */
function normKey(value) {
    return String(value || "").
        trim().
        toLowerCase().
        replace(/\s+/g, "").
        replace(/[-_]/g, "");
}
function toNum(value) {
    if (value === null || value === undefined)
        return Number.NaN;
    const raw = String(value).trim();
    if (!raw)
        return Number.NaN;
    const normalized = raw.includes(",") && raw.includes(".") ?
        raw.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".") :
        raw.replace(",", ".");
    const result = Number.parseFloat(normalized);
    return Number.isFinite(result) ? result : Number.NaN;
}
function clampPts(points) {
    const MAX = 20000;
    return points.length <= MAX ? points : points.slice(0, MAX);
}
function isPlausibleWGS84(point) {
    return point.lat >= 35 && point.lat <= 65 && point.lng >= -10 && point.lng <= 30;
}
function pointDisplayName(point, index) {
    const code = String(point.code || "").trim();
    const name = String(point.name || "").trim();
    if (name && code && name !== code)
        return `${name} • ${code}`;
    return name || code || `Punkt ${index + 1}`;
}
function pad2(value) {
    return String(value).padStart(2, "0");
}
function tsForFilename(timestamp = Date.now()) {
    const date = new Date(timestamp);
    return (date.getFullYear() +
        "-" +
        pad2(date.getMonth() + 1) +
        "-" +
        pad2(date.getDate()) +
        "_" +
        pad2(date.getHours()) +
        "-" +
        pad2(date.getMinutes()) +
        "-" +
        pad2(date.getSeconds()));
}
function normalizePdfDataUrl(value) {
    return String(value || "").replace(/^data:application\/pdf;filename=[^;]+;base64,/, "data:application/pdf;base64,");
}
function escapeHtml(value) {
    return String(value ?? "").
        replace(/&/g, "&amp;").
        replace(/</g, "&lt;").
        replace(/>/g, "&gt;").
        replace(/"/g, "&quot;").
        replace(/'/g, "&#039;");
}
function firstNonEmpty(...values) {
    for (const value of values) {
        const text = String(value ?? "").trim();
        if (text)
            return text;
    }
    return "";
}
function readCompanyProfile(context, project) {
    // Es geht hier um die AUSFÜHRENDE FIRMA / den Auftragnehmer,
    // nicht um RLC Bausoftware.
    const candidates = [
        project?.executingCompany,
        project?.contractor,
        project?.auftragnehmer,
        project?.bauunternehmen,
        project?.company,
        project?.firma,
        context?.executingCompany,
        context?.contractor,
        context?.auftragnehmer,
        context?.currentCompany,
        context?.selectedCompany,
        context?.company
    ];
    const storageKeys = [
        "rlc_executing_company",
        "rlc_contractor",
        "auftragnehmer",
        "bauunternehmen",
        "companyProfile",
        "rlc_company_profile",
        "rlc_company",
        "company",
        "firmenDaten",
        "firmendaten"
    ];
    for (const key of storageKeys) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw)
                continue;
            const parsed = JSON.parse(raw);
            candidates.push(parsed?.executingCompany ||
                parsed?.contractor ||
                parsed?.auftragnehmer ||
                parsed?.bauunternehmen ||
                parsed?.company ||
                parsed?.data ||
                parsed);
        }
        catch {
            // ignore invalid storage entry
        }
    }
    for (const value of candidates) {
        if (!value)
            continue;
        const logoCandidate = firstNonEmpty(value?.logoDataUrl, value?.logo, value?.branding?.logoDataUrl);
        const profile = {
            name: firstNonEmpty(value?.name, value?.companyName, value?.firmenname, value?.firma, value?.auftragnehmerName, value?.contractorName),
            street: firstNonEmpty(value?.street, value?.strasse, value?.straße, value?.address?.street, value?.adresse?.strasse),
            postalCode: firstNonEmpty(value?.postalCode, value?.zip, value?.plz, value?.address?.postalCode, value?.adresse?.plz),
            city: firstNonEmpty(value?.city, value?.ort, value?.address?.city, value?.adresse?.ort),
            phone: firstNonEmpty(value?.phone, value?.telefon, value?.mobile, value?.mobil),
            email: firstNonEmpty(value?.email, value?.mail),
            website: firstNonEmpty(value?.website, value?.web, value?.homepage),
            logoDataUrl: logoCandidate.startsWith("data:image/") ?
                logoCandidate :
                undefined
        };
        if (profile.name || profile.logoDataUrl) {
            return {
                ...profile,
                name: profile.name || "Ausführende Firma"
            };
        }
    }
    return { name: "Ausführende Firma nicht hinterlegt" };
}
function applyPointLabelZoomScale(map) {
    const zoom = map.getZoom();
    const container = map.getContainer();
    let level = "far";
    if (zoom >= 19)
        level = "max";
    else if (zoom >= 18)
        level = "near";
    else if (zoom >= 17)
        level = "medium";
    else if (zoom >= 16)
        level = "small";
    else if (zoom >= 15)
        level = "tiny";
    container.setAttribute("data-point-label-zoom", level);
}
/* ===================== GEOMETRY ===================== */
function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = (value) => value * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function polylineLengthMeters(points) {
    if (points.length < 2)
        return 0;
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        total += haversineMeters(points[index - 1], points[index]);
    }
    return total;
}
function polygonAreaMeters2(points) {
    if (points.length < 3)
        return 0;
    const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = 111320 * Math.cos(meanLat * Math.PI / 180);
    const local = points.map((point) => ({
        x: point.lng * metersPerDegreeLng,
        y: point.lat * metersPerDegreeLat
    }));
    let area = 0;
    for (let index = 0; index < local.length; index += 1) {
        const current = local[index];
        const next = local[(index + 1) % local.length];
        area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) / 2;
}
function formatDistance(value) {
    return value >= 1000 ? `${(value / 1000).toFixed(3)} km` : `${value.toFixed(2)} m`;
}
function formatArea(value) {
    return value >= 10000 ?
        `${(value / 10000).toFixed(4)} ha` :
        `${value.toFixed(2)} m²`;
}
/* ===================== CSV ===================== */
function splitCsvLine(line, delimiter) {
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
function detectDelimiter(lines) {
    const sample = lines.find((line) => line.trim()) || "";
    const candidates = [",", ";", "\t"];
    const best = candidates.
        map((delimiter) => ({
        delimiter,
        count: sample.split(delimiter).length - 1
    })).
        sort((a, b) => b.count - a.count)[0];
    if (best && best.count > 0)
        return best.delimiter;
    if (sample.trim().split(/\s+/).length >= 4)
        return "__WHITESPACE__";
    return ",";
}
function parseCsvText(fileText, withHeader) {
    const lines = fileText.
        split(/\r?\n/).
        map((line) => line.trim()).
        filter(Boolean);
    if (!lines.length)
        return [];
    const delimiter = detectDelimiter(lines);
    const rows = lines.map((line) => delimiter === "__WHITESPACE__" ?
        line.trim().split(/\s+/).map((value) => value.trim()) :
        splitCsvLine(line, delimiter));
    if (!withHeader)
        return rows;
    const headers = rows[0] || [];
    return rows.slice(1).map((row) => {
        const result = {};
        headers.forEach((header, index) => {
            result[header] = row[index] ?? "";
        });
        return result;
    });
}
function rowGetter(row) {
    const keys = Object.keys(row || {});
    return (variants) => {
        for (const key of keys) {
            if (variants.includes(normKey(key)))
                return row[key];
        }
        return undefined;
    };
}
function inferPointMeta(row, coordinateValues) {
    const entries = Object.entries(row || {});
    const get = rowGetter(row);
    const explicitCode = String(get([
        "code",
        "punktcode",
        "pointcode",
        "artcode",
        "objektcode",
        "featurecode",
        "symbolcode",
        "kenncode",
        "akls"
    ]) ?? "").trim();
    const explicitName = String(get([
        "punktname",
        "pointname",
        "punktnummer",
        "punktnr",
        "pointnumber",
        "nummer",
        "nr",
        "id",
        "name"
    ]) ?? "").trim();
    const coordinateStrings = new Set(coordinateValues.map((value) => String(value ?? "").trim()));
    const nonNumericValues = entries.
        map(([, value]) => String(value ?? "").trim()).
        filter(Boolean).
        filter((value) => !coordinateStrings.has(value)).
        filter((value) => !Number.isFinite(toNum(value)));
    const fallbackCode = nonNumericValues.length ?
        nonNumericValues[nonNumericValues.length - 1] :
        "";
    const integerCandidates = entries.
        map(([, value]) => String(value ?? "").trim()).
        filter(Boolean).
        filter((value) => !coordinateStrings.has(value)).
        filter((value) => /^\d{1,12}$/.test(value));
    const fallbackName = integerCandidates.length ?
        integerCandidates[integerCandidates.length - 1] :
        "";
    const explicitNameLooksLikeHeight = explicitName.includes(".") || explicitName.includes(",");
    const name = fallbackName && (!explicitName || explicitNameLooksLikeHeight) ?
        fallbackName :
        explicitName || fallbackName;
    const code = explicitCode || fallbackCode;
    return {
        name: name || undefined,
        code: code || undefined
    };
}
function parseSurveyNumber(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }
    const raw = String(value ?? "").
        trim().
        replace(/^["']|["']$/g, "").
        replace(/\s+/g, "").
        replace(/m$/i, "");
    if (!raw)
        return undefined;
    let normalized = raw;
    if (raw.includes(",") && raw.includes(".")) {
        const lastComma = raw.lastIndexOf(",");
        const lastDot = raw.lastIndexOf(".");
        normalized =
            lastComma > lastDot ?
                raw.replace(/\./g, "").replace(",", ".") :
                raw.replace(/,/g, "");
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
function parseObjectWgs84(row) {
    const get = rowGetter(row);
    const latRaw = get(["lat", "latitude", "breite", "latitudedeg", "ywgs", "ywgs84"]);
    const lngRaw = get([
        "lng",
        "lon",
        "long",
        "longitude",
        "laenge",
        "longitudedeg",
        "xwgs",
        "xwgs84"
    ]);
    const lat = toNum(latRaw);
    const lng = toNum(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
        return null;
    const meta = inferPointMeta(row, [latRaw, lngRaw]);
    return {
        lat,
        lng,
        height: parseSurveyNumber(get([
            "height",
            "hoehe",
            "höhe",
            "höhe",
            "z",
            "elevation",
            "altitude"
        ])),
        sourceCrs: "EPSG:4326",
        name: meta.name,
        code: meta.code
    };
}
function parseObjectEN(row) {
    const get = rowGetter(row);
    const eRaw = get([
        "e",
        "east",
        "easting",
        "rechtswert",
        "rw",
        "x",
        "ost",
        "xcoord",
        "xkoordinate"
    ]);
    const nRaw = get([
        "n",
        "north",
        "northing",
        "hochwert",
        "hw",
        "y",
        "nord",
        "ycoord",
        "ykoordinate"
    ]);
    const e = toNum(eRaw);
    const n = toNum(nRaw);
    if (!Number.isFinite(e) || !Number.isFinite(n))
        return null;
    const meta = inferPointMeta(row, [eRaw, nRaw]);
    const heightRaw = get([
        "height",
        "hoehe",
        "höhe",
        "z",
        "elevation",
        "altitude",
        "orthometricheight"
    ]);
    const height = parseSurveyNumber(heightRaw);
    return {
        e,
        n,
        height: Number.isFinite(height) ? height : undefined,
        name: meta.name,
        code: meta.code
    };
}
function parseArrayEN(row) {
    const values = row.map((value) => String(value ?? "").trim());
    if (!values.length)
        return null;
    const name = values[0] || undefined;
    const code = values.length >= 2 ? values[values.length - 1] || undefined : undefined;
    // Standard: Punktname, Rechtswert, Hochwert, Höhe, Code
    if (values.length >= 5) {
        const e = parseSurveyNumber(values[1]);
        const n = parseSurveyNumber(values[2]);
        const middleNumbers = values.
            slice(3, -1).
            map(parseSurveyNumber).
            filter((value) => Number.isFinite(value));
        const height = middleNumbers.find((value) => value > -1000 && value < 10000);
        if (Number.isFinite(e) && Number.isFinite(n)) {
            return {
                e: Number(e),
                n: Number(n),
                height,
                name,
                code
            };
        }
    }
    // Sonderfall:
    // Punktname,"Rechtswert Hochwert",Höhe,Code
    if (values.length >= 4) {
        const pair = values[1].split(/\s+/).filter(Boolean);
        if (pair.length >= 2) {
            const e = parseSurveyNumber(pair[0]);
            const n = parseSurveyNumber(pair[1]);
            const middleNumbers = values.
                slice(2, -1).
                map(parseSurveyNumber).
                filter((value) => Number.isFinite(value));
            const height = middleNumbers.find((value) => value > -1000 && value < 10000);
            if (Number.isFinite(e) && Number.isFinite(n)) {
                return {
                    e: Number(e),
                    n: Number(n),
                    height,
                    name,
                    code
                };
            }
        }
    }
    // Generischer Fallback: erste zwei großen Koordinaten + plausible Höhe
    const numeric = values.
        map((value, index) => ({
        index,
        value: parseSurveyNumber(value)
    })).
        filter((item) => Number.isFinite(item.value));
    const coordinateCandidates = numeric.filter((item) => Math.abs(item.value) >= 10000);
    if (coordinateCandidates.length >= 2) {
        const e = coordinateCandidates[0].value;
        const n = coordinateCandidates[1].value;
        const height = numeric.
            filter((item) => item.index !== coordinateCandidates[0].index &&
            item.index !== coordinateCandidates[1].index).
            map((item) => item.value).
            find((value) => value > -1000 && value < 10000);
        return { e, n, height, name, code };
    }
    return null;
}
function detectCrsForEN(sample) {
    const candidates = [
        "EPSG:25832",
        "EPSG:32632",
        "EPSG:31468",
        "EPSG:31467",
        "EPSG:31469"
    ];
    return candidates.
        map((crs) => {
        let plausible = 0;
        sample.forEach((item) => {
            try {
                if (isPlausibleWGS84(toWGS84(item.e, item.n, crs)))
                    plausible += 1;
            }
            catch {
                // ignore
            }
        });
        return { crs, plausible };
    }).
        sort((a, b) => b.plausible - a.plausible).
        filter((item) => item.plausible > 0).
        map((item) => item.crs);
}
function parseCsvToPointsAuto(rows, preferredCrs) {
    const direct = [];
    const enRows = [];
    rows.forEach((row) => {
        if (Array.isArray(row)) {
            const parsed = parseArrayEN(row);
            if (parsed)
                enRows.push(parsed);
            return;
        }
        const wgs = parseObjectWgs84(row);
        if (wgs && isPlausibleWGS84(wgs)) {
            direct.push(wgs);
            return;
        }
        const en = parseObjectEN(row);
        if (en)
            enRows.push(en);
    });
    if (direct.length) {
        return {
            pts: direct,
            usedCrs: "EPSG:4326",
            debug: `WGS84 direkt erkannt: ${direct.length} Punkte.`
        };
    }
    if (!enRows.length) {
        return {
            pts: [],
            usedCrs: preferredCrs,
            debug: "Keine Koordinatenspalten erkannt."
        };
    }
    const detected = detectCrsForEN(enRows.slice(0, 12));
    const order = Array.from(new Set([
        ...detected,
        preferredCrs,
        "EPSG:25832",
        "EPSG:32632",
        "EPSG:31468",
        "EPSG:31467",
        "EPSG:31469"
    ]));
    for (const crs of order) {
        const points = [];
        enRows.forEach((item) => {
            try {
                const converted = toWGS84(item.e, item.n, crs);
                if (isPlausibleWGS84(converted)) {
                    points.push({
                        ...converted,
                        easting: item.e,
                        northing: item.n,
                        height: item.height,
                        sourceCrs: crs,
                        code: item.code,
                        name: item.name
                    });
                }
            }
            catch {
                // ignore
            }
        });
        if (points.length >= Math.max(1, Math.floor(enRows.length * 0.6))) {
            return {
                pts: points,
                usedCrs: crs,
                debug: `CRS erkannt: ${crs} (${points.length}/${enRows.length}).`
            };
        }
    }
    return {
        pts: [],
        usedCrs: preferredCrs,
        debug: "Koordinaten erkannt, aber kein passendes CRS gefunden."
    };
}
/* ===================== API ===================== */
function getAuthHeaders() {
    const keys = [
        "rlc_token",
        "token",
        "authToken",
        "accessToken",
        "rlc.auth.token",
        "rlc_mobile_token",
        "rlc_auth_token",
        "rlc_access_token"
    ];
    for (const key of keys) {
        const token = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (token?.trim())
            return { Authorization: `Bearer ${token.trim()}` };
    }
    try {
        const raw = localStorage.getItem("auth") ||
            localStorage.getItem("rlc_auth") ||
            localStorage.getItem("user");
        if (raw) {
            const parsed = JSON.parse(raw);
            const token = parsed?.token ||
                parsed?.accessToken ||
                parsed?.authToken ||
                parsed?.jwt ||
                parsed?.data?.token ||
                parsed?.data?.accessToken ||
                parsed?.user?.token ||
                parsed?.user?.accessToken;
            if (typeof token === "string" && token.trim()) {
                return { Authorization: `Bearer ${token.trim()}` };
            }
        }
    }
    catch {
        // ignore
    }
    return {};
}
async function loadCompanyLogoForPdf() {
    try {
        const tokenKeys = [
            "rlc_token",
            "token",
            "authToken",
            "accessToken",
            "rlc_access_token"
        ];
        let token = "";
        for (const key of tokenKeys) {
            const value = localStorage.getItem(key) ||
                sessionStorage.getItem(key);
            if (value?.trim()) {
                token = value.trim();
                break;
            }
        }
        const headers = {};
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        const response = await fetch(apiUrl("/api/company/logo"), {
            method: "GET",
            headers,
            credentials: "include",
            cache: "no-store"
        });
        if (!response.ok) {
            return null;
        }
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) {
            return null;
        }
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === "string") {
                    resolve(reader.result);
                }
                else {
                    reject(new Error("Firmenlogo konnte nicht gelesen werden."));
                }
            };
            reader.onerror = () => reject(reader.error || new Error("Firmenlogo konnte nicht gelesen werden."));
            reader.readAsDataURL(blob);
        });
    }
    catch (error) {
        console.warn("Firmenlogo für PDF konnte nicht geladen werden:", error);
        return null;
    }
}
async function api(url, init) {
    const headers = new Headers(init?.headers || {});
    if (!headers.has("Content-Type") && init?.body) {
        headers.set("Content-Type", "application/json");
    }
    Object.entries(getAuthHeaders()).forEach(([key, value]) => {
        headers.set(key, value);
    });
    const response = await fetch(apiUrl(url), {
        ...init,
        credentials: "include",
        headers
    });
    const text = await response.text();
    if (!response.ok)
        throw new Error(text || `HTTP ${response.status}`);
    if (!text.trim())
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error(`Ungültige Serverantwort von ${url}`);
    }
}
function asArray(value) {
    if (Array.isArray(value))
        return value;
    if (Array.isArray(value?.items))
        return value.items;
    if (Array.isArray(value?.rows))
        return value.rows;
    if (Array.isArray(value?.data))
        return value.data;
    if (Array.isArray(value?.data?.items))
        return value.data.items;
    if (Array.isArray(value?.data?.rows))
        return value.data.rows;
    return [];
}
/* ===================== LOCAL LV ===================== */
function readLocalLvPositions(keys) {
    const storageKeys = Array.from(new Set(keys.filter(Boolean).flatMap((key) => [
        `rlc_lv_data_v1:${key}`,
        `rlc_gaeb_import_v1:${key}`,
        `RLC_AUFMASS_${key}`
    ])));
    for (const storageKey of storageKeys) {
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw)
                continue;
            const parsed = JSON.parse(raw);
            const rows = Array.isArray(parsed) ?
                parsed :
                Array.isArray(parsed?.rows) ?
                    parsed.rows :
                    Array.isArray(parsed?.items) ?
                        parsed.items :
                        [];
            const normalized = rows.
                map((row, index) => ({
                id: String(row?.id ?? row?.uuid ?? `${storageKey}-${index}`),
                position: String(row?.position ?? row?.pos ?? row?.posNr ?? row?.positionsnummer ?? "").trim(),
                kurztext: String(row?.kurztext ?? row?.Kurztext ?? row?.text ?? row?.description ?? "").trim(),
                langtext: String(row?.langtext ?? row?.Langtext ?? "").trim() || null
            })).
                filter((row) => row.position || row.kurztext);
            if (normalized.length)
                return normalized;
        }
        catch {
            // next key
        }
    }
    return [];
}
/* ===================== COMPONENT ===================== */
export default function GPSZuweisung() {
    const navigate = useNavigate();
    const context = useProject();
    const project = context?.getSelectedProject?.() ||
        context?.currentProject ||
        context?.selectedProject ||
        context?.project ||
        null;
    const projectCode = String(project?.code ||
        project?.baustellenNummer ||
        project?.baustelleNummer ||
        project?.projectCode ||
        project?.projektCode ||
        project?.slug ||
        project?.key ||
        "").trim();
    const projectDbId = String(project?.id || "").trim();
    const projectId = projectCode || projectDbId;
    const serverProjectId = projectDbId || projectId;
    const mapRef = React.useRef(null);
    const pointsLayerRef = React.useRef(null);
    const geometryLayerRef = React.useRef(null);
    const annotationLayerRef = React.useRef(null);
    const pointsRef = React.useRef([]);
    const measurementsRef = React.useRef([]);
    const areasRef = React.useRef([]);
    const annotationsRef = React.useRef([]);
    const activeDistanceRef = React.useRef([]);
    const activeAreaRef = React.useRef([]);
    const editorModeRef = React.useRef("POINT");
    const commentTextRef = React.useRef("");
    const commentFontSizeRef = React.useRef(14);
    const commentRotationRef = React.useRef(0);
    const selectedLVRef = React.useRef(null);
    const csvCrsRef = React.useRef("EPSG:25832");
    const showPointLabelsRef = React.useRef(false);
    const draftKeyRef = React.useRef("");
    const [points, setPoints] = React.useState([]);
    const [selectedLV, setSelectedLV] = React.useState(null);
    const [lvList, setLvList] = React.useState([]);
    const [assignments, setAssignments] = React.useState([]);
    const [csvCrs, setCsvCrs] = React.useState("EPSG:25832");
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState(null);
    const [lvSearch, setLvSearch] = React.useState("");
    const [editorMode, setEditorMode] = React.useState("POINT");
    const [activeDistanceIndexes, setActiveDistanceIndexes] = React.useState([]);
    const [activeAreaIndexes, setActiveAreaIndexes] = React.useState([]);
    const [measurements, setMeasurements] = React.useState([]);
    const [areas, setAreas] = React.useState([]);
    const [annotations, setAnnotations] = React.useState([]);
    const [commentText, setCommentText] = React.useState("");
    const [commentFontSize, setCommentFontSize] = React.useState(14);
    const [commentRotation, setCommentRotation] = React.useState(0);
    const [measurementComment, setMeasurementComment] = React.useState("");
    const [areaComment, setAreaComment] = React.useState("");
    const [showPointLabels, setShowPointLabels] = React.useState(true);
    const [printWithoutPointLabels, setPrintWithoutPointLabels] = React.useState(false);
    const [savePdfServer] = React.useState(true);
    const [serverPdfs, setServerPdfs] = React.useState([]);
    const [serverSaveStatus, setServerSaveStatus] = React.useState("Noch nicht am Server gespeichert");
    const [workspaceHydrated, setWorkspaceHydrated] = React.useState(false);
    const serverSaveTimerRef = React.useRef(null);
    React.useEffect(() => {
        pointsRef.current = points;
    }, [points]);
    React.useEffect(() => {
        measurementsRef.current = measurements;
    }, [measurements]);
    React.useEffect(() => {
        areasRef.current = areas;
    }, [areas]);
    React.useEffect(() => {
        annotationsRef.current = annotations;
    }, [annotations]);
    React.useEffect(() => {
        activeDistanceRef.current = activeDistanceIndexes;
    }, [activeDistanceIndexes]);
    React.useEffect(() => {
        activeAreaRef.current = activeAreaIndexes;
    }, [activeAreaIndexes]);
    React.useEffect(() => {
        editorModeRef.current = editorMode;
    }, [editorMode]);
    React.useEffect(() => {
        commentTextRef.current = commentText;
    }, [commentText]);
    React.useEffect(() => {
        commentFontSizeRef.current = commentFontSize;
    }, [commentFontSize]);
    React.useEffect(() => {
        commentRotationRef.current = commentRotation;
    }, [commentRotation]);
    React.useEffect(() => {
        selectedLVRef.current = selectedLV;
    }, [selectedLV]);
    React.useEffect(() => {
        csvCrsRef.current = csvCrs;
    }, [csvCrs]);
    React.useEffect(() => {
        showPointLabelsRef.current = showPointLabels;
    }, [showPointLabels]);
    const DRAFT_KEY = React.useMemo(() => {
        const key = (projectId || "no-project").replace(/[^\w.-]/g, "_");
        return `rlc_gpszuweisung_draft_v3_${key}`;
    }, [projectId]);
    React.useEffect(() => {
        draftKeyRef.current = DRAFT_KEY;
    }, [DRAFT_KEY]);
    const filteredLvList = React.useMemo(() => {
        const query = lvSearch.trim().toLowerCase();
        if (!query)
            return lvList;
        return lvList.filter((row) => `${row.position} ${row.kurztext} ${row.langtext || ""}`.
            toLowerCase().
            includes(query));
    }, [lvList, lvSearch]);
    const activeDistance = React.useMemo(() => polylineLengthMeters(activeDistanceIndexes.map((index) => points[index]).filter(Boolean)), [activeDistanceIndexes, points]);
    const activeArea = React.useMemo(() => polygonAreaMeters2(activeAreaIndexes.map((index) => points[index]).filter(Boolean)), [activeAreaIndexes, points]);
    const totalDistance = React.useMemo(() => measurements.reduce((sum, measurement) => sum +
        polylineLengthMeters(measurement.pointIndexes.map((index) => points[index]).filter(Boolean)), 0), [measurements, points]);
    const totalArea = React.useMemo(() => areas.reduce((sum, area) => sum +
        polygonAreaMeters2(area.pointIndexes.map((index) => points[index]).filter(Boolean)), 0), [areas, points]);
    function resolveCurrentLV() {
        if (selectedLVRef.current)
            return selectedLVRef.current;
        if (selectedLV)
            return selectedLV;
        const query = lvSearch.trim().toLowerCase();
        if (!query)
            return null;
        return (lvList.find((position) => {
            const full = `${position.position} ${position.kurztext}`.trim().toLowerCase();
            return full === query || query.startsWith(position.position.toLowerCase());
        }) || null);
    }
    async function saveWorkspaceToServer(payload) {
        if (!serverProjectId)
            return;
        const body = payload || {
            projectId: serverProjectId,
            selectedLvId: selectedLVRef.current?.id || "",
            selectedLv: selectedLVRef.current || null,
            csvCrs: csvCrsRef.current,
            points: pointsRef.current,
            measurements: measurementsRef.current,
            areas: areasRef.current,
            annotations: annotationsRef.current,
            activeDistanceIndexes: activeDistanceRef.current,
            activeAreaIndexes: activeAreaRef.current
        };
        try {
            const result = await api("/api/gps/state", {
                method: "POST",
                body: JSON.stringify(body)
            });
            const when = result?.data?.updatedAt || Date.now();
            setServerSaveStatus(`Server gespeichert: ${new Date(when).toLocaleString("de-DE")}`);
        }
        catch (error) {
            setServerSaveStatus(`Serverfehler: ${String(error?.message || error)}`);
        }
    }
    function queueWorkspaceServerSave() {
        if (!workspaceHydrated)
            return;
        if (serverSaveTimerRef.current)
            window.clearTimeout(serverSaveTimerRef.current);
        serverSaveTimerRef.current = window.setTimeout(() => {
            void saveWorkspaceToServer();
            serverSaveTimerRef.current = null;
        }, 450);
    }
    async function loadWorkspaceFromServer() {
        if (!serverProjectId)
            return false;
        try {
            const response = await api(`/api/gps/state?projectId=${encodeURIComponent(serverProjectId)}`);
            const data = response?.data;
            if (!data || !Array.isArray(data.points))
                return false;
            const restoredPoints = clampPts(data.points || []);
            const restoredMeasurements = Array.isArray(data.measurements) ? data.measurements : [];
            const restoredAreas = Array.isArray(data.areas) ? data.areas : [];
            const restoredAnnotations = Array.isArray(data.annotations) ? data.annotations : [];
            const restoredActiveDistance = Array.isArray(data.activeDistanceIndexes) ?
                data.activeDistanceIndexes :
                [];
            const restoredActiveArea = Array.isArray(data.activeAreaIndexes) ?
                data.activeAreaIndexes :
                [];
            updateAll(restoredPoints, restoredMeasurements, restoredAreas, restoredAnnotations, restoredActiveDistance, restoredActiveArea, true, false);
            if (data.csvCrs)
                setCsvCrs(String(data.csvCrs));
            if (data.selectedLvId) {
                const selected = lvList.find((position) => position.id === data.selectedLvId) || null;
                if (selected) {
                    selectedLVRef.current = selected;
                    setSelectedLV(selected);
                    setLvSearch(`${selected.position} ${selected.kurztext}`.trim());
                }
            }
            setServerSaveStatus(`Server geladen: ${new Date(data.updatedAt || Date.now()).toLocaleString("de-DE")}`);
            return true;
        }
        catch {
            return false;
        }
    }
    async function loadServerPdfs() {
        if (!serverProjectId)
            return;
        try {
            const response = await api(`/api/gps/pdfs?projectId=${encodeURIComponent(serverProjectId)}`);
            setServerPdfs(asArray(response));
        }
        catch {
            setServerPdfs([]);
        }
    }
    function saveDraft(args) {
        try {
            localStorage.setItem(draftKeyRef.current || DRAFT_KEY, JSON.stringify({
                projectId,
                points: args?.points ?? pointsRef.current,
                selectedLvId: args && "selectedLvId" in args ?
                    args.selectedLvId :
                    selectedLVRef.current?.id ?? null,
                csvCrs: args?.csvCrs ?? csvCrsRef.current,
                measurements: args?.measurements ?? measurementsRef.current,
                areas: args?.areas ?? areasRef.current,
                annotations: args?.annotations ?? annotationsRef.current,
                activeDistanceIndexes: args?.activeDistanceIndexes ?? activeDistanceRef.current,
                activeAreaIndexes: args?.activeAreaIndexes ?? activeAreaRef.current,
                savedAt: Date.now()
            }));
        }
        catch {
            // ignore
        }
    }
    function loadDraft() {
        try {
            const raw = localStorage.getItem(draftKeyRef.current || DRAFT_KEY);
            return raw ? JSON.parse(raw) : null;
        }
        catch {
            return null;
        }
    }
    function clearDraft() {
        try {
            localStorage.removeItem(draftKeyRef.current || DRAFT_KEY);
        }
        catch {
            // ignore
        }
    }
    function clearLayers() {
        pointsLayerRef.current?.clearLayers();
        geometryLayerRef.current?.clearLayers();
        annotationLayerRef.current?.clearLayers();
    }
    function updateAll(nextPoints = pointsRef.current, nextMeasurements = measurementsRef.current, nextAreas = areasRef.current, nextAnnotations = annotationsRef.current, nextActiveDistance = activeDistanceRef.current, nextActiveArea = activeAreaRef.current, fit = false, persist = true) {
        pointsRef.current = nextPoints;
        measurementsRef.current = nextMeasurements;
        areasRef.current = nextAreas;
        annotationsRef.current = nextAnnotations;
        activeDistanceRef.current = nextActiveDistance;
        activeAreaRef.current = nextActiveArea;
        setPoints(nextPoints);
        setMeasurements(nextMeasurements);
        setAreas(nextAreas);
        setAnnotations(nextAnnotations);
        setActiveDistanceIndexes(nextActiveDistance);
        setActiveAreaIndexes(nextActiveArea);
        redrawMap(nextPoints, nextMeasurements, nextAreas, nextAnnotations, nextActiveDistance, nextActiveArea, fit);
        if (persist) {
            saveDraft({
                points: nextPoints,
                measurements: nextMeasurements,
                areas: nextAreas,
                annotations: nextAnnotations,
                activeDistanceIndexes: nextActiveDistance,
                activeAreaIndexes: nextActiveArea
            });
            queueWorkspaceServerSave();
        }
    }
    function selectPoint(index) {
        const mode = editorModeRef.current;
        if (mode === "DISTANCE") {
            const current = activeDistanceRef.current;
            const next = current[current.length - 1] === index ? current : [...current, index];
            updateAll(pointsRef.current, measurementsRef.current, areasRef.current, annotationsRef.current, next, activeAreaRef.current);
            return;
        }
        if (mode === "AREA") {
            const current = activeAreaRef.current;
            const next = current[current.length - 1] === index ? current : [...current, index];
            updateAll(pointsRef.current, measurementsRef.current, areasRef.current, annotationsRef.current, activeDistanceRef.current, next);
        }
    }
    function redrawMap(mapPoints = pointsRef.current, mapMeasurements = measurementsRef.current, mapAreas = areasRef.current, mapAnnotations = annotationsRef.current, activeDistanceIds = activeDistanceRef.current, activeAreaIds = activeAreaRef.current, fit = false) {
        const map = mapRef.current;
        if (!map)
            return;
        clearLayers();
        const pointLayer = pointsLayerRef.current;
        const geometryLayer = geometryLayerRef.current;
        const annotationLayer = annotationLayerRef.current;
        if (!pointLayer || !geometryLayer || !annotationLayer)
            return;
        const distanceColors = ["#d97706", "#7c3aed", "#059669", "#dc2626", "#0891b2"];
        const areaColors = ["#dc2626", "#db2777", "#7c3aed", "#ea580c", "#146ef5"];
        mapPoints.forEach((point, index) => {
            const isDxfGeometryPoint = String(point.code || "").startsWith("DXF:");
            if (isDxfGeometryPoint)
                return;
            const selected = activeDistanceIds.includes(index) || activeAreaIds.includes(index);
            const marker = L.circleMarker([point.lat, point.lng], {
                radius: selected ? 4 : 2.6,
                weight: selected ? 1.5 : 0.8,
                opacity: 0.95,
                fillOpacity: 0.72,
                color: selected ? "#7f1d1d" : "#146ef5",
                fillColor: selected ? "#f43f5e" : "#3b82f6"
            }).addTo(pointLayer);
            const label = pointDisplayName(point, index);
            marker.bindTooltip(label, {
                direction: "top",
                offset: [0, -3],
                permanent: showPointLabelsRef.current,
                opacity: 0.88,
                className: "rlc-gps-point-label"
            });
            marker.on("click", (event) => {
                L.DomEvent.stopPropagation(event);
                selectPoint(index);
            });
        });
        mapMeasurements.forEach((measurement, index) => {
            const selectedPoints = measurement.pointIndexes.
                map((pointIndex) => mapPoints[pointIndex]).
                filter(Boolean);
            if (selectedPoints.length < 2)
                return;
            const color = measurement.color || distanceColors[index % distanceColors.length];
            const length = polylineLengthMeters(selectedPoints);
            L.polyline(selectedPoints.map((point) => [point.lat, point.lng]), {
                color,
                weight: 2,
                opacity: 0.9
            }).
                bindTooltip(`${measurement.name}: ${formatDistance(length)}${measurement.comment ? ` · ${measurement.comment}` : ""}`, { permanent: !String(measurement.comment || "").startsWith("DXF-Layer:"), direction: "top", opacity: 0.85 }).
                addTo(geometryLayer);
        });
        mapAreas.forEach((area, index) => {
            const selectedPoints = area.pointIndexes.
                map((pointIndex) => mapPoints[pointIndex]).
                filter(Boolean);
            if (selectedPoints.length < 3)
                return;
            const color = area.color || areaColors[index % areaColors.length];
            const size = polygonAreaMeters2(selectedPoints);
            L.polygon(selectedPoints.map((point) => [point.lat, point.lng]), {
                color,
                weight: 3,
                opacity: 1,
                fillColor: color,
                fillOpacity: 0.28,
                dashArray: "8 4"
            }).
                bindTooltip(`${area.name}: ${formatArea(size)}${area.comment ? ` · ${area.comment}` : ""}`, { permanent: !String(area.comment || "").startsWith("DXF-Layer:"), direction: "center", opacity: 0.85 }).
                addTo(geometryLayer);
        });
        const activeDistancePoints = activeDistanceIds.
            map((index) => mapPoints[index]).
            filter(Boolean);
        if (activeDistancePoints.length >= 2) {
            L.polyline(activeDistancePoints.map((point) => [point.lat, point.lng]), {
                color: "#eab308",
                weight: 1.8,
                opacity: 0.95,
                dashArray: "5 5"
            }).
                bindTooltip(`Aktuelle Strecke: ${formatDistance(polylineLengthMeters(activeDistancePoints))}`, { permanent: true, direction: "top", opacity: 0.85 }).
                addTo(geometryLayer);
        }
        const activeAreaPoints = activeAreaIds.
            map((index) => mapPoints[index]).
            filter(Boolean);
        if (activeAreaPoints.length >= 2) {
            const latLngs = activeAreaPoints.map((point) => [
                point.lat,
                point.lng
            ]);
            if (activeAreaPoints.length >= 3) {
                L.polygon(latLngs, {
                    color: "#dc2626",
                    weight: 3,
                    opacity: 1,
                    dashArray: "8 4",
                    fillColor: "#f43f5e",
                    fillOpacity: 0.26
                }).
                    bindTooltip(`Aktuelle Fläche: ${formatArea(polygonAreaMeters2(activeAreaPoints))}`, {
                    permanent: true,
                    direction: "center",
                    opacity: 0.85
                }).
                    addTo(geometryLayer);
            }
            else {
                L.polyline(latLngs, {
                    color: "#dc2626",
                    weight: 3,
                    opacity: 1,
                    dashArray: "8 4"
                }).addTo(geometryLayer);
            }
        }
        mapAnnotations.forEach((annotation) => {
            const fontSize = Math.max(8, Math.min(40, Number(annotation.fontSize) || 14));
            const rotation = Math.max(-180, Math.min(180, Number(annotation.rotation) || 0));
            const icon = L.divIcon({
                className: "rlc-map-comment-marker",
                html: `<div class="rlc-map-comment-content" style="
          transform: translate(-50%, -50%) rotate(${rotation}deg);
          transform-origin: center center;
          font-size: ${fontSize}px;
        ">${escapeHtml(annotation.text)}</div>`,
                iconSize: [1, 1],
                iconAnchor: [0, 0]
            });
            const marker = L.marker([annotation.lat, annotation.lng], {
                icon,
                interactive: true,
                draggable: true,
                keyboard: false,
                title: "Kommentar ziehen, um ihn exakt zu positionieren"
            }).addTo(annotationLayer);
            marker.on("dragend", () => {
                const nextPosition = marker.getLatLng();
                const nextAnnotations = annotationsRef.current.map((item) => item.id === annotation.id ?
                    { ...item, lat: nextPosition.lat, lng: nextPosition.lng } :
                    item);
                updateAll(pointsRef.current, measurementsRef.current, areasRef.current, nextAnnotations, activeDistanceRef.current, activeAreaRef.current);
            });
        });
        if (fit && mapPoints.length) {
            map.fitBounds(L.latLngBounds(mapPoints.map((point) => [point.lat, point.lng])), { padding: [30, 30] });
        }
    }
    React.useEffect(() => {
        if (mapRef.current)
            return;
        const map = L.map("gps-map", {
            zoomControl: true,
            preferCanvas: true,
            maxZoom: 22
        }).setView([47.63, 12.98], 12);
        const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "© OpenStreetMap",
            crossOrigin: true
        }).addTo(map);
        const aerial = L.tileLayer.wms("https://geoservices.bayern.de/od/wms/dop/v1/dop20?", {
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
            "Bayern Luftbild": aerial
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
        catch {
            // Google optional
        }
        const parcels = L.tileLayer.wms("https://geoservices.bayern.de/od/wms/alkis/v1/parzellarkarte?", {
            layers: "by_alkis_parzellarkarte_umr_schwarz",
            format: "image/png",
            transparent: true,
            version: "1.3.0",
            tiled: true,
            maxZoom: 21,
            attribution: "© Bayerische Vermessungsverwaltung (ALKIS® OpenData)",
            crossOrigin: true
        });
        const borders = L.tileLayer.wms("https://geoservices.bayern.de/od/wms/alkis/v1/verwaltungsgrenzen?", {
            layers: "by_alkis_gmd_grenze",
            format: "image/png",
            transparent: true,
            version: "1.3.0",
            tiled: true,
            maxZoom: 21,
            attribution: "© Bayerische Vermessungsverwaltung",
            crossOrigin: true
        });
        L.control.
            layers(baseLayers, {
            "Flurkarte / Parzellen": parcels,
            Grenzen: borders
        }).
            addTo(map);
        parcels.addTo(map);
        borders.addTo(map);
        pointsLayerRef.current = L.layerGroup().addTo(map);
        geometryLayerRef.current = L.layerGroup().addTo(map);
        annotationLayerRef.current = L.layerGroup().addTo(map);
        applyPointLabelZoomScale(map);
        map.on("zoom zoomend", () => {
            applyPointLabelZoomScale(map);
        });
        map.on("click", (event) => {
            const mode = editorModeRef.current;
            if (mode === "COMMENT") {
                const text = commentTextRef.current.trim();
                if (!text) {
                    setErr("Bitte zuerst einen Kommentar eingeben.");
                    return;
                }
                const nextAnnotations = [
                    ...annotationsRef.current,
                    {
                        id: crypto.randomUUID(),
                        lat: event.latlng.lat,
                        lng: event.latlng.lng,
                        text,
                        createdAt: Date.now(),
                        fontSize: commentFontSizeRef.current,
                        rotation: commentRotationRef.current
                    }
                ];
                updateAll(pointsRef.current, measurementsRef.current, areasRef.current, nextAnnotations);
                return;
            }
            const nextPoint = {
                lat: event.latlng.lat,
                lng: event.latlng.lng,
                ts: Date.now(),
                code: `M${String(pointsRef.current.length + 1).padStart(3, "0")}`,
                name: "Manueller Punkt"
            };
            const nextPoints = [...pointsRef.current, nextPoint];
            const newIndex = nextPoints.length - 1;
            if (mode === "DISTANCE") {
                updateAll(nextPoints, measurementsRef.current, areasRef.current, annotationsRef.current, [...activeDistanceRef.current, newIndex], activeAreaRef.current);
            }
            else if (mode === "AREA") {
                updateAll(nextPoints, measurementsRef.current, areasRef.current, annotationsRef.current, activeDistanceRef.current, [...activeAreaRef.current, newIndex]);
            }
            else {
                updateAll(nextPoints);
            }
        });
        mapRef.current = map;
        window.setTimeout(() => map.invalidateSize(), 200);
    }, []);
    React.useEffect(() => {
        redrawMap();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showPointLabels]);
    /* ===================== DATA LOAD ===================== */
    async function loadLV() {
        if (!projectDbId)
            return;
        setBusy(true);
        setErr(null);
        try {
            const response = await api(`/api/projects/${encodeURIComponent(projectDbId)}/lv?page=1&pageSize=20`);
            const lvRows = asArray(response);
            const latest = lvRows[0] || null;
            const serverPositions = asArray(latest?.positions ??
                latest?.data?.positions ??
                response?.positions ??
                response?.data?.positions);
            const localPositions = readLocalLvPositions([
                projectCode,
                projectDbId,
                projectId
            ]);
            const result = serverPositions.length ? serverPositions : localPositions;
            setLvList(result);
            if (!result.length) {
                setErr("Keine LV-Positionen gefunden.");
            }
            else if (!serverPositions.length) {
                setErr(`LV lokal geladen: ${result.length} Positionen.`);
            }
            const draft = loadDraft();
            if (draft?.selectedLvId) {
                const selected = result.find((position) => position.id === draft.selectedLvId) || null;
                if (selected) {
                    selectedLVRef.current = selected;
                    setSelectedLV(selected);
                }
            }
        }
        catch (error) {
            const localPositions = readLocalLvPositions([
                projectCode,
                projectDbId,
                projectId
            ]);
            setLvList(localPositions);
            setErr(localPositions.length ?
                `Server-LV nicht verfügbar; lokal geladen: ${localPositions.length} Positionen.` :
                String(error?.message || error));
        }
        finally {
            setBusy(false);
        }
    }
    async function loadAssignments() {
        if (!serverProjectId)
            return;
        setBusy(true);
        setErr(null);
        try {
            const response = await api(`/api/gps/list?projectId=${encodeURIComponent(serverProjectId)}`);
            const rows = asArray(response);
            setAssignments(rows);
        }
        catch (error) {
            setErr(String(error?.message || error));
        }
        finally {
            setBusy(false);
        }
    }
    React.useEffect(() => {
        let cancelled = false;
        async function hydrateWorkspace() {
            setWorkspaceHydrated(false);
            if (projectDbId)
                await loadLV();
            if (cancelled)
                return;
            if (serverProjectId) {
                await Promise.all([loadAssignments(), loadServerPdfs()]);
                if (cancelled)
                    return;
                const loadedFromServer = await loadWorkspaceFromServer();
                if (cancelled)
                    return;
                if (loadedFromServer) {
                    setWorkspaceHydrated(true);
                    return;
                }
            }
            const draft = loadDraft();
            if (draft?.csvCrs)
                setCsvCrs(draft.csvCrs);
            const restoredPoints = Array.isArray(draft?.points) ?
                clampPts(draft.points) :
                [];
            const restoredMeasurements = Array.isArray(draft?.measurements) ?
                draft.measurements :
                [];
            const restoredAreas = Array.isArray(draft?.areas) ? draft.areas : [];
            const restoredAnnotations = Array.isArray(draft?.annotations) ?
                draft.annotations :
                [];
            const restoredDistance = Array.isArray(draft?.activeDistanceIndexes) ?
                draft.activeDistanceIndexes :
                [];
            const restoredArea = Array.isArray(draft?.activeAreaIndexes) ?
                draft.activeAreaIndexes :
                [];
            updateAll(restoredPoints, restoredMeasurements, restoredAreas, restoredAnnotations, restoredDistance, restoredArea, Boolean(restoredPoints.length), false);
            setServerSaveStatus(restoredPoints.length ?
                "Server leer/nicht erreichbar – lokaler Entwurf geladen" :
                "Server leer – neuer GPS-Entwurf");
            setWorkspaceHydrated(true);
        }
        void hydrateWorkspace();
        return () => {
            cancelled = true;
            if (serverSaveTimerRef.current) {
                window.clearTimeout(serverSaveTimerRef.current);
                serverSaveTimerRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, projectDbId, serverProjectId]);
    /* ===================== EDITOR ACTIONS ===================== */
    function saveDistanceMeasurement() {
        if (activeDistanceIndexes.length < 2) {
            setErr("Für eine Strecke mindestens zwei Punkte wählen.");
            return;
        }
        const next = {
            id: crypto.randomUUID(),
            name: `Messung ${measurements.length + 1}`,
            pointIndexes: [...activeDistanceIndexes],
            createdAt: Date.now(),
            comment: measurementComment.trim() || undefined
        };
        updateAll(points, [...measurements, next], areas, annotations, [], activeAreaIndexes);
        setMeasurementComment("");
    }
    function saveAreaMeasurement() {
        if (activeAreaIndexes.length < 3) {
            setErr("Für eine Fläche mindestens drei Punkte wählen.");
            return;
        }
        const next = {
            id: crypto.randomUUID(),
            name: `Fläche ${areas.length + 1}`,
            pointIndexes: [...activeAreaIndexes],
            createdAt: Date.now(),
            comment: areaComment.trim() || undefined
        };
        updateAll(points, measurements, [...areas, next], annotations, activeDistanceIndexes, []);
        setAreaComment("");
    }
    function deleteMeasurement(id) {
        updateAll(points, measurements.filter((measurement) => measurement.id !== id), areas, annotations);
    }
    function deleteArea(id) {
        updateAll(points, measurements, areas.filter((area) => area.id !== id), annotations);
    }
    function deleteAnnotation(id) {
        updateAll(points, measurements, areas, annotations.filter((annotation) => annotation.id !== id));
    }
    function updateAnnotation(id, patch) {
        updateAll(points, measurements, areas, annotations.map((annotation) => annotation.id === id ? { ...annotation, ...patch } : annotation));
    }
    function clearCurrent() {
        if (!window.confirm("Punkte, Messungen, Flächen und Kommentare dieses Entwurfs löschen?")) {
            return;
        }
        updateAll([], [], [], [], [], []);
    }
    async function saveAssignment() {
        if (!serverProjectId) {
            setErr("Kein Projekt gewählt.");
            return;
        }
        const currentLV = resolveCurrentLV();
        if (!currentLV) {
            setErr("Bitte LV-Position wählen.");
            return;
        }
        selectedLVRef.current = currentLV;
        if (!selectedLV || selectedLV.id !== currentLV.id) {
            setSelectedLV(currentLV);
        }
        if (!points.length) {
            setErr("Keine Punkte vorhanden.");
            return;
        }
        setBusy(true);
        setErr(null);
        const localItem = {
            id: crypto.randomUUID(),
            projectId: serverProjectId,
            lvPosId: currentLV.id,
            lvPos: {
                position: currentLV.position,
                kurztext: currentLV.kurztext,
                langtext: currentLV.langtext
            },
            points: clampPts(points),
            measurements,
            areas,
            annotations,
            createdAt: Date.now()
        };
        try {
            const response = await api("/api/gps/assign", {
                method: "POST",
                body: JSON.stringify(localItem)
            });
            const saved = response?.item || response?.data?.item || localItem;
            setAssignments((previous) => [saved, ...previous]);
            clearDraft();
            setErr("Zuweisung am Server gespeichert.");
        }
        catch (error) {
            setErr(`Server-Speicherung fehlgeschlagen: ${String(error?.message || error)}`);
        }
        finally {
            setBusy(false);
        }
    }
    async function deleteAssignment(id) {
        if (!window.confirm("Zuweisung wirklich löschen?"))
            return;
        try {
            await api(`/api/gps/delete?id=${encodeURIComponent(id)}&projectId=${encodeURIComponent(serverProjectId)}`, { method: "DELETE" });
        }
        catch {
            // local removal still useful
        }
        setAssignments((previous) => previous.filter((item) => item.id !== id));
    }
    function loadAssignmentIntoCurrent(assignment) {
        const nextPoints = clampPts(assignment.points || []);
        updateAll(nextPoints, assignment.measurements || [], assignment.areas || [], assignment.annotations || [], [], [], true);
        const found = lvList.find((position) => position.id === assignment.lvPosId);
        if (found) {
            selectedLVRef.current = found;
            setSelectedLV(found);
            setLvSearch(`${found.position} ${found.kurztext}`.trim());
        }
    }
    /* ===================== IMPORT ===================== */
    async function importCSV(file) {
        setErr(null);
        const text = await file.text();
        // Prima senza intestazione: i file di rilievo hanno righe del tipo
        // Punktname,Easting,Northing,Höhe,Code
        // esempio: 1158,798...,528...,572...,ak-ls
        let result = parseCsvToPointsAuto(parseCsvText(text, false), csvCrs);
        // Solo fallback per CSV realmente dotati di intestazione.
        if (!result.pts.length) {
            result = parseCsvToPointsAuto(parseCsvText(text, true), csvCrs);
        }
        if (!result.pts.length) {
            setErr(result.debug);
            return;
        }
        const nextPoints = clampPts(result.pts);
        setCsvCrs(result.usedCrs);
        updateAll(nextPoints, [], [], [], [], [], true);
        saveDraft({
            points: nextPoints,
            measurements: [],
            areas: [],
            annotations: [],
            csvCrs: result.usedCrs
        });
        setErr(result.debug);
    }
    async function importXML(file) {
        const xml = new DOMParser().parseFromString(await file.text(), "application/xml");
        const featureCollection = file.name.toLowerCase().endsWith(".gpx") ?
            gpx(xml) :
            kml(xml);
        const imported = [];
        (featureCollection.features || []).forEach((feature) => {
            const properties = feature.properties || {};
            const name = String(properties.name || properties.title || "").trim();
            const code = String(properties.code || properties.id || properties.number || "").trim();
            if (feature.geometry?.type === "LineString") {
                feature.geometry.coordinates.forEach((coordinate) => {
                    imported.push({
                        lng: coordinate[0],
                        lat: coordinate[1],
                        name: name || undefined,
                        code: code || undefined
                    });
                });
            }
            else if (feature.geometry?.type === "Point") {
                imported.push({
                    lng: feature.geometry.coordinates[0],
                    lat: feature.geometry.coordinates[1],
                    name: name || undefined,
                    code: code || undefined
                });
            }
        });
        updateAll(clampPts([...pointsRef.current, ...imported]), undefined, undefined, undefined, undefined, undefined, true);
    }
    async function importGeoJSON(file) {
        const geoJson = JSON.parse(await file.text());
        const imported = [];
        (geoJson.features || []).forEach((feature) => {
            const properties = feature.properties || {};
            const name = String(properties.name || properties.title || "").trim();
            const code = String(properties.code || properties.id || properties.number || "").trim();
            if (feature.geometry?.type === "LineString") {
                feature.geometry.coordinates.forEach((coordinate) => {
                    imported.push({
                        lng: coordinate[0],
                        lat: coordinate[1],
                        name: name || undefined,
                        code: code || undefined
                    });
                });
            }
            else if (feature.geometry?.type === "Point") {
                imported.push({
                    lng: feature.geometry.coordinates[0],
                    lat: feature.geometry.coordinates[1],
                    name: name || undefined,
                    code: code || undefined
                });
            }
        });
        updateAll(clampPts([...pointsRef.current, ...imported]), undefined, undefined, undefined, undefined, undefined, true);
    }
    async function importDXF(file) {
        setBusy(true);
        setErr("DXF wird analysiert...");
        let worker = null;
        try {
            if (file.size > 30 * 1024 * 1024) {
                throw new Error("DXF ist größer als 30 MB.");
            }
            const source = await file.text();
            const dxf = await new Promise((resolve, reject) => {
                worker = new Worker(new URL("../../workers/dxfParser.worker.ts", import.meta.url), { type: "module" });
                const timeout = window.setTimeout(() => {
                    worker?.terminate();
                    reject(new Error("DXF-Analyse dauerte länger als 60 Sekunden."));
                }, 60000);
                worker.onmessage = (event) => {
                    window.clearTimeout(timeout);
                    if (event.data?.ok) {
                        resolve(event.data.dxf);
                    }
                    else {
                        reject(new Error(event.data?.error || "DXF konnte nicht gelesen werden."));
                    }
                };
                worker.onerror = () => {
                    window.clearTimeout(timeout);
                    reject(new Error("DXF-Worker ist fehlgeschlagen."));
                };
                worker.postMessage({ source });
            });
            const entities = Array.isArray(dxf?.entities) ?
                dxf.entities.slice(0, 5000) :
                [];
            const importedPoints = [];
            const importedMeasurements = [];
            const importedAreas = [];
            const importedAnnotations = [];
            const coordinateIndex = new Map();
            const yieldToBrowser = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
            const convertPoint = (xValue, yValue, zValue = 0, name, code) => {
                const x = Number(xValue);
                const y = Number(yValue);
                const z = Number(zValue);
                if (!Number.isFinite(x) || !Number.isFinite(y))
                    return null;
                let lng = x;
                let lat = y;
                if (csvCrs !== "EPSG:4326") {
                    const converted = proj4(csvCrs, "EPSG:4326", [x, y]);
                    lng = Number(converted[0]);
                    lat = Number(converted[1]);
                }
                if (!Number.isFinite(lat) || !Number.isFinite(lng))
                    return null;
                return {
                    lat,
                    lng,
                    height: Number.isFinite(z) ? z : undefined,
                    name: name || undefined,
                    code: code || undefined
                };
            };
            const addPoint = (xValue, yValue, zValue = 0, name, code) => {
                if (importedPoints.length >= 10000)
                    return null;
                const x = Number(xValue);
                const y = Number(yValue);
                const z = Number(zValue) || 0;
                if (!Number.isFinite(x) || !Number.isFinite(y))
                    return null;
                const key = `${x.toFixed(4)}|${y.toFixed(4)}|${z.toFixed(3)}`;
                const existing = coordinateIndex.get(key);
                if (existing !== undefined)
                    return existing;
                const point = convertPoint(x, y, z, name, code);
                if (!point)
                    return null;
                const index = importedPoints.length;
                importedPoints.push(point);
                coordinateIndex.set(key, index);
                return index;
            };
            for (let entityIndex = 0; entityIndex < entities.length; entityIndex += 1) {
                if (entityIndex % 100 === 0) {
                    setErr(`DXF wird importiert... ${entityIndex}/${entities.length}`);
                    await yieldToBrowser();
                }
                const entity = entities[entityIndex];
                const type = String(entity?.type || "").toUpperCase();
                const layer = String(entity?.layer || "DXF").trim() || "DXF";
                const allowedGeometryTypes = new Set([
                    "LINE",
                    "POLYLINE",
                    "LWPOLYLINE"
                ]);
                if (!allowedGeometryTypes.has(type)) {
                    continue;
                }
                // Beschriftungen, Bemaßungen und Führungslinien ausblenden.
                const ignoredLayer = /beschrift|text|bemass|bemaß|dimension|leader|fuehrung|führung|hinweis|symbol/i.test(layer);
                if (ignoredLayer) {
                    continue;
                }
                if (type === "POINT") {
                    const position = entity.position || entity.center || entity;
                    addPoint(position?.x, position?.y, position?.z, `DXF Punkt ${importedPoints.length + 1}`, layer);
                    continue;
                }
                if (type === "CIRCLE") {
                    if (layer === "RLC_PUNKTE")
                        continue;
                    const center = entity.center || entity.position;
                    if (center) {
                        addPoint(center.x, center.y, center.z, `Kreis ${importedPoints.length + 1}`, layer);
                    }
                    continue;
                }
                if (type === "TEXT" || type === "MTEXT") {
                    // DXF-Texte werden nicht als permanente Karten-Kommentare importiert.
                    continue;
                }
                if (type === "LINE" ||
                    type === "POLYLINE" ||
                    type === "LWPOLYLINE") {
                    if (layer === "RLC_PUNKTE")
                        continue;
                    const vertices = Array.isArray(entity.vertices) ?
                        entity.vertices.slice(0, 500) :
                        entity.startPoint && entity.endPoint ?
                            [entity.startPoint, entity.endPoint] :
                            [];
                    const indexes = vertices.
                        map((vertex) => addPoint(vertex.x, vertex.y, vertex.z, undefined, `DXF:${layer}`)).
                        filter((index) => index !== null);
                    if (indexes.length < 2)
                        continue;
                    const closed = entity.shape === true ||
                        entity.closed === true ||
                        (Number(entity.flags) & 1) === 1;
                    if (closed && indexes.length >= 3) {
                        importedAreas.push({
                            id: crypto.randomUUID(),
                            name: `${layer} Fläche ${importedAreas.length + 1}`,
                            pointIndexes: indexes,
                            comment: `DXF-Layer: ${layer}`
                        });
                    }
                    else {
                        importedMeasurements.push({
                            id: crypto.randomUUID(),
                            name: `${layer} Strecke ${importedMeasurements.length + 1}`,
                            pointIndexes: indexes,
                            comment: `DXF-Layer: ${layer}`
                        });
                    }
                }
            }
            const baseIndex = pointsRef.current.length;
            const nextPoints = clampPts([
                ...pointsRef.current,
                ...importedPoints
            ]);
            const shiftIndexes = (indexes) => indexes.
                map((index) => index + baseIndex).
                filter((index) => index < nextPoints.length);
            const nextMeasurements = [
                ...measurementsRef.current,
                ...importedMeasurements.map((measurement) => ({
                    ...measurement,
                    pointIndexes: shiftIndexes(measurement.pointIndexes)
                }))
            ].
                filter((measurement) => measurement.pointIndexes.length >= 2);
            const nextAreas = [
                ...areasRef.current,
                ...importedAreas.map((area) => ({
                    ...area,
                    pointIndexes: shiftIndexes(area.pointIndexes)
                }))
            ].
                filter((area) => area.pointIndexes.length >= 3);
            const nextAnnotations = [
                ...annotationsRef.current,
                ...importedAnnotations
            ];
            updateAll(nextPoints, nextMeasurements, nextAreas, nextAnnotations, [], [], false);
            const fitPoints = importedPoints.filter((point) => Number.isFinite(point.lat) &&
                Number.isFinite(point.lng) &&
                point.lat >= 35 &&
                point.lat <= 65 &&
                point.lng >= -10 &&
                point.lng <= 30);
            if (fitPoints.length && mapRef.current) {
                const sortedLat = fitPoints.map((point) => point.lat).sort((a, b) => a - b);
                const sortedLng = fitPoints.map((point) => point.lng).sort((a, b) => a - b);
                const medianLat = sortedLat[Math.floor(sortedLat.length / 2)];
                const medianLng = sortedLng[Math.floor(sortedLng.length / 2)];
                const clustered = fitPoints.filter((point) => haversineMeters({ lat: medianLat, lng: medianLng }, point) <= 5000);
                const visiblePoints = clustered.length >= 2 ? clustered : fitPoints;
                mapRef.current.fitBounds(L.latLngBounds(visiblePoints.map((point) => [point.lat, point.lng])), {
                    padding: [40, 40],
                    maxZoom: 19
                });
            }
            saveDraft({
                points: nextPoints,
                measurements: nextMeasurements,
                areas: nextAreas,
                annotations: nextAnnotations,
                csvCrs
            });
            setErr(`DXF importiert: ${importedPoints.length} Punkte, ` +
                `${importedMeasurements.length} Strecken, ` +
                `${importedAreas.length} Flächen, ` +
                `${importedAnnotations.length} Texte.`);
        }
        catch (error) {
            console.error("DXF import failed:", error);
            setErr(`DXF-Import fehlgeschlagen: ${String(error?.message || error)}`);
        }
        finally {
            worker?.terminate();
            setBusy(false);
        }
    }
    function onFileImport(file) {
        const extension = file.name.toLowerCase().split(".").pop();
        if (extension === "csv" || extension === "txt")
            void importCSV(file);
        else if (extension === "gpx" || extension === "kml")
            void importXML(file);
        else if (extension === "geojson" || extension === "json")
            void importGeoJSON(file);
        else if (extension === "dxf")
            void importDXF(file);
        else
            setErr("Format nicht unterstützt.");
    }
    /* ===================== DXF ===================== */
    function dxfNumber(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ?
            parsed.toFixed(4).replace(/\.?0+$/, "") :
            "0";
    }
    function dxfText(value) {
        return String(value ?? "").
            replace(/[\r\n]+/g, " ").
            replace(/[\u0000-\u001f]/g, "").
            replace(/[^\x20-\x7e]/g, (character) => {
            const code = character.charCodeAt(0).toString(16).toUpperCase();
            return `\\U+${code.padStart(4, "0")}`;
        }).
            trim();
    }
    function exportDxf() {
        const currentLV = resolveCurrentLV();
        if (!currentLV) {
            setErr("Bitte LV-Position wählen.");
            return;
        }
        if (!points.length &&
            !measurements.length &&
            !areas.length &&
            !annotations.length) {
            setErr("Keine Punkte oder Geometrien für den DXF-Export vorhanden.");
            return;
        }
        try {
            setBusy(true);
            setErr(null);
            const rows = [];
            const push = (...values) => {
                values.forEach((value) => rows.push(String(value)));
            };
            const projectPoint = (point) => {
                const projected = projectedPointValues(point, csvCrs);
                return {
                    x: Number(projected.easting) || 0,
                    y: Number(projected.northing) || 0,
                    z: Number(point?.height) || 0
                };
            };
            const validPoints = points.
                map((point, index) => ({
                point,
                index,
                projected: projectPoint(point)
            })).
                filter((entry) => Number.isFinite(entry.projected.x) &&
                Number.isFinite(entry.projected.y));
            const xValues = validPoints.map((entry) => entry.projected.x);
            const yValues = validPoints.map((entry) => entry.projected.y);
            const zValues = validPoints.map((entry) => entry.projected.z);
            const minX = xValues.length ? Math.min(...xValues) : 0;
            const minY = yValues.length ? Math.min(...yValues) : 0;
            const minZ = zValues.length ? Math.min(...zValues) : 0;
            const maxX = xValues.length ? Math.max(...xValues) : 0;
            const maxY = yValues.length ? Math.max(...yValues) : 0;
            const maxZ = zValues.length ? Math.max(...zValues) : 0;
            // HEADER
            push(0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1009", 9, "$EXTMIN", 10, dxfNumber(minX), 20, dxfNumber(minY), 30, dxfNumber(minZ), 9, "$EXTMAX", 10, dxfNumber(maxX), 20, dxfNumber(maxY), 30, dxfNumber(maxZ), 0, "ENDSEC");
            // LAYERS
            push(0, "SECTION", 2, "TABLES", 0, "TABLE", 2, "LAYER", 70, 4);
            const layers = [
                ["RLC_PUNKTE", 5],
                ["RLC_STRECKEN", 1],
                ["RLC_FLAECHEN", 3],
                ["RLC_TEXTE", 7]
            ];
            layers.forEach(([name, color]) => {
                push(0, "LAYER", 2, name, 70, 0, 62, color, 6, "CONTINUOUS");
            });
            push(0, "ENDTAB", 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES");
            // POINTS AND LABELS
            validPoints.forEach(({ point, index, projected }) => {
                const pointName = String(point.name || `Punkt ${index + 1}`);
                const pointCode = String(point.code || "").trim();
                const label = pointCode ?
                    `${pointName} ${pointCode}` :
                    pointName;
                const markerRadius = 0.18;
                const crossSize = 0.24;
                // Originaler Vermessungspunkt
                push(0, "POINT", 8, "RLC_PUNKTE", 10, dxfNumber(projected.x), 20, dxfNumber(projected.y), 30, dxfNumber(projected.z));
                // Sichtbarer Kreis
                push(0, "CIRCLE", 8, "RLC_PUNKTE", 10, dxfNumber(projected.x), 20, dxfNumber(projected.y), 30, dxfNumber(projected.z), 40, dxfNumber(markerRadius));
                // Horizontale Kreuzlinie
                push(0, "LINE", 8, "RLC_PUNKTE", 10, dxfNumber(projected.x - crossSize), 20, dxfNumber(projected.y), 30, dxfNumber(projected.z), 11, dxfNumber(projected.x + crossSize), 21, dxfNumber(projected.y), 31, dxfNumber(projected.z));
                // Vertikale Kreuzlinie
                push(0, "LINE", 8, "RLC_PUNKTE", 10, dxfNumber(projected.x), 20, dxfNumber(projected.y - crossSize), 30, dxfNumber(projected.z), 11, dxfNumber(projected.x), 21, dxfNumber(projected.y + crossSize), 31, dxfNumber(projected.z));
                push(0, "TEXT", 8, "RLC_TEXTE", 10, dxfNumber(projected.x + 0.15), 20, dxfNumber(projected.y + 0.15), 30, dxfNumber(projected.z), 40, "0.25", 1, dxfText(label), 7, "STANDARD");
            });
            const addPolyline = (selectedPoints, layer, closed) => {
                if (selectedPoints.length < 2)
                    return;
                push(0, "POLYLINE", 8, layer, 66, 1, 70, closed ? 9 : 8);
                selectedPoints.forEach((point) => {
                    const projected = projectPoint(point);
                    push(0, "VERTEX", 8, layer, 10, dxfNumber(projected.x), 20, dxfNumber(projected.y), 30, dxfNumber(projected.z), 70, 32);
                });
                push(0, "SEQEND", 8, layer);
            };
            // DISTANCES
            measurements.forEach((measurement) => {
                const selectedPoints = measurement.pointIndexes.
                    map((index) => points[index]).
                    filter(Boolean);
                addPolyline(selectedPoints, "RLC_STRECKEN", false);
                if (selectedPoints.length) {
                    const middlePoint = selectedPoints[Math.floor(selectedPoints.length / 2)];
                    const projected = projectPoint(middlePoint);
                    push(0, "TEXT", 8, "RLC_TEXTE", 10, dxfNumber(projected.x), 20, dxfNumber(projected.y), 30, dxfNumber(projected.z), 40, "0.30", 1, dxfText(`${measurement.name || "Strecke"} - ${formatDistance(polylineLengthMeters(selectedPoints))}`), 7, "STANDARD");
                }
            });
            // AREAS
            areas.forEach((area) => {
                const selectedPoints = area.pointIndexes.
                    map((index) => points[index]).
                    filter(Boolean);
                addPolyline(selectedPoints, "RLC_FLAECHEN", true);
                if (selectedPoints.length) {
                    const coordinates = selectedPoints.map(projectPoint);
                    const center = coordinates.reduce((result, point) => ({
                        x: result.x + point.x / coordinates.length,
                        y: result.y + point.y / coordinates.length,
                        z: result.z + point.z / coordinates.length
                    }), { x: 0, y: 0, z: 0 });
                    push(0, "TEXT", 8, "RLC_TEXTE", 10, dxfNumber(center.x), 20, dxfNumber(center.y), 30, dxfNumber(center.z), 40, "0.30", 1, dxfText(`${area.name || "Fläche"} - ${formatArea(polygonAreaMeters2(selectedPoints))}`), 7, "STANDARD");
                }
            });
            // COMMENTS
            annotations.forEach((annotation) => {
                const projected = projectPoint(annotation);
                const text = String(annotation.text || "").trim();
                if (!text)
                    return;
                push(0, "TEXT", 8, "RLC_TEXTE", 10, dxfNumber(projected.x), 20, dxfNumber(projected.y), 30, dxfNumber(projected.z), 40, "0.30", 1, dxfText(text), 7, "STANDARD");
            });
            push(0, "ENDSEC", 0, "EOF");
            const content = `${rows.join("\r\n")}\r\n`;
            const blob = new Blob([content], {
                type: "application/dxf"
            });
            const filename = `gps_aufmass_${String(currentLV.position || "lv").
                replace(/[^a-zA-Z0-9_-]+/g, "_")}_${tsForFilename()}.dxf`;
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            setErr(`DXF lokal gespeichert: ${filename}`);
        }
        catch (error) {
            console.error("DXF export failed:", error);
            setErr(`DXF-Export fehlgeschlagen: ${String(error?.message || error)}`);
        }
        finally {
            setBusy(false);
        }
    }
    /* ===================== PDF ===================== */
    async function captureMapSnapshotPngDataUrl() {
        const element = document.getElementById("gps-map");
        const map = mapRef.current;
        if (!element || !map)
            return null;
        try {
            map.invalidateSize();
            await new Promise((resolve) => window.setTimeout(resolve, 250));
            const canvas = await html2canvas(element, {
                useCORS: true,
                allowTaint: false,
                backgroundColor: "#ffffff",
                scale: 1.6,
                logging: false
            });
            return canvas.toDataURL("image/png");
        }
        catch (error) {
            console.warn("Map snapshot failed:", error);
            return null;
        }
    }
    function buildPdfDoc(mapImage, serverLogoDataUrl) {
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const margin = 14;
        const pageWidth = doc.internal.pageSize.getWidth();
        const company = readCompanyProfile(context, project);
        if (serverLogoDataUrl?.startsWith("data:image/")) {
            company.logoDataUrl = serverLogoDataUrl;
        }
        const pdfLV = resolveCurrentLV();
        let y = 14;
        // Firmenkopf: bewusst rein synchron, damit der PDF-Export stabil bleibt.
        if (company.logoDataUrl) {
            try {
                const props = doc.getImageProperties(company.logoDataUrl);
                const logoWidth = 32;
                const logoHeight = Math.min(18, props.height * logoWidth / props.width);
                doc.addImage(company.logoDataUrl, props.fileType || "PNG", margin, y, logoWidth, logoHeight, undefined, "FAST");
            }
            catch {
                // Logo überspringen, PDF trotzdem erstellen.
            }
        }
        const companyX = company.logoDataUrl ? margin + 38 : margin;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(company.name || "Ausführende Firma", companyX, y + 2);
        const companyLines = [
            [company.street, [company.postalCode, company.city].filter(Boolean).join(" ")].
                filter(Boolean).
                join(" · "),
            [company.phone ? `Tel. ${company.phone}` : "", company.email].
                filter(Boolean).
                join(" · "),
            company.website || ""
        ].
            filter(Boolean);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        companyLines.slice(0, 3).forEach((line, index) => {
            doc.text(String(line), companyX, y + 7 + index * 4);
        });
        doc.setDrawColor(203, 213, 225);
        doc.line(margin, y + 22, pageWidth - margin, y + 22);
        y += 31;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("GPS-Messprotokoll", margin, y);
        y += 8;
        autoTable(doc, {
            startY: y,
            head: [["Feld", "Wert"]],
            body: [
                ["Projekt", project?.name || project?.title || projectCode || "—"],
                ["Projekt-Code", projectCode || "—"],
                [
                    "LV-Position",
                    pdfLV ?
                        `${pdfLV.position} – ${pdfLV.kurztext}` :
                        "—"
                ],
                ["Lagebezug", crsDisplayName(csvCrs)],
                ["EPSG-Code", csvCrs || "?"],
                ["Höhensystem", "DHHN2016"],
                ["Geoidmodell", "GCG2016"],
                ["Messungen", String(measurements.length)],
                ["Gesamtlänge", formatDistance(totalDistance)],
                ["Flächen", String(areas.length)],
                ["Gesamtfläche", formatArea(totalArea)],
                ["Kommentare", String(annotations.length)],
                ["Erstellt", new Date().toLocaleString("de-DE")]
            ],
            styles: { fontSize: 9, cellPadding: 2 },
            headStyles: { fillColor: [235, 239, 245], textColor: [15, 23, 42] },
            columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 130 } },
            margin: { left: margin, right: margin }
        });
        y = doc.lastAutoTable?.finalY + 7 || y + 40;
        if (mapImage) {
            try {
                const props = doc.getImageProperties(mapImage);
                const width = pageWidth - margin * 2;
                const height = Math.min(110, props.height * width / props.width);
                if (y + height > 270) {
                    doc.addPage();
                    y = 14;
                }
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.text("Kartenausschnitt", margin, y);
                y += 5;
                doc.addImage(mapImage, "PNG", margin, y, width, height, undefined, "FAST");
                y += height + 7;
            }
            catch {
                // continue without map
            }
        }
        if (areas.length) {
            autoTable(doc, {
                startY: y,
                head: [["Fläche", "Eckpunkte", "Größe", "Kommentar"]],
                body: areas.map((area) => {
                    const selectedPoints = area.pointIndexes.
                        map((index) => points[index]).
                        filter(Boolean);
                    return [
                        area.name,
                        String(selectedPoints.length),
                        formatArea(polygonAreaMeters2(selectedPoints)),
                        area.comment || ""
                    ];
                }),
                styles: { fontSize: 8.5, cellPadding: 1.8 },
                headStyles: {
                    fillColor: [235, 239, 245],
                    textColor: [15, 23, 42]
                },
                margin: { left: margin, right: margin }
            });
            y = doc.lastAutoTable?.finalY + 7 || y + 25;
        }
        if (measurements.length) {
            autoTable(doc, {
                startY: y,
                head: [["Messung", "Punkte", "Länge", "Kommentar"]],
                body: measurements.map((measurement) => {
                    const selectedPoints = measurement.pointIndexes.
                        map((index) => points[index]).
                        filter(Boolean);
                    return [
                        measurement.name,
                        String(selectedPoints.length),
                        formatDistance(polylineLengthMeters(selectedPoints)),
                        measurement.comment || ""
                    ];
                }),
                styles: { fontSize: 8.5, cellPadding: 1.8 },
                headStyles: {
                    fillColor: [235, 239, 245],
                    textColor: [15, 23, 42]
                },
                margin: { left: margin, right: margin }
            });
            y = doc.lastAutoTable?.finalY + 7 || y + 25;
        }
        const commentRows = [];
        areas.forEach((area) => {
            const areaComment = String(area.comment || "").trim();
            if (!areaComment)
                return;
            const selectedPoints = area.pointIndexes.
                map((index) => points[index]).
                filter(Boolean);
            commentRows.push([
                areaComment,
                `Fläche: ${formatArea(polygonAreaMeters2(selectedPoints))}`
            ]);
        });
        measurements.forEach((measurement) => {
            const measurementComment = String(measurement.comment || "").trim();
            if (!measurementComment)
                return;
            const selectedPoints = measurement.pointIndexes.
                map((index) => points[index]).
                filter(Boolean);
            commentRows.push([
                measurementComment,
                `Länge: ${formatDistance(polylineLengthMeters(selectedPoints))}`
            ]);
        });
        annotations.forEach((annotation) => {
            let bestReference = "Kein Geometriebezug";
            let bestDistance = Number.POSITIVE_INFINITY;
            areas.forEach((area) => {
                const selectedPoints = area.pointIndexes.
                    map((index) => points[index]).
                    filter(Boolean);
                selectedPoints.forEach((point) => {
                    const distance = haversineMeters(annotation, point);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestReference =
                            `Fläche: ${formatArea(polygonAreaMeters2(selectedPoints))}`;
                    }
                });
            });
            measurements.forEach((measurement) => {
                const selectedPoints = measurement.pointIndexes.
                    map((index) => points[index]).
                    filter(Boolean);
                selectedPoints.forEach((point) => {
                    const distance = haversineMeters(annotation, point);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestReference =
                            `Länge: ${formatDistance(polylineLengthMeters(selectedPoints))}`;
                    }
                });
            });
            const annotationText = String(annotation.text || "").trim();
            if (annotationText) {
                commentRows.push([annotationText, bestReference]);
            }
        });
        if (commentRows.length) {
            autoTable(doc, {
                startY: y,
                head: [["Kommentar", "Bezug / Menge"]],
                body: commentRows,
                styles: { fontSize: 8.5, cellPadding: 1.8 },
                headStyles: {
                    fillColor: [235, 239, 245],
                    textColor: [15, 23, 42]
                },
                columnStyles: {
                    0: { cellWidth: 105 },
                    1: { cellWidth: 70 }
                },
                margin: { left: margin, right: margin }
            });
            y = doc.lastAutoTable?.finalY + 8 || y + 25;
        }
        if (points.length) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.text("Punktliste", margin, y);
            y += 5;
            autoTable(doc, {
                startY: y,
                head: [[
                        "Nr.",
                        "Punktname",
                        "Rechtswert",
                        "Hochwert",
                        "Höhe",
                        "Code"
                    ]],
                body: points.map((point, index) => {
                    const projected = projectedPointValues(point, csvCrs);
                    return [
                        String(index + 1),
                        point.name || `Punkt ${index + 1}`,
                        formatCoordinate(projected.easting, projected.crs),
                        formatCoordinate(projected.northing, projected.crs),
                        formatHeight(point.height),
                        point.code || ""
                    ];
                }),
                styles: {
                    fontSize: 7.4,
                    cellPadding: 1.5,
                    overflow: "linebreak"
                },
                headStyles: {
                    fillColor: [235, 239, 245],
                    textColor: [15, 23, 42],
                    fontStyle: "bold"
                },
                columnStyles: {
                    0: { cellWidth: 10, halign: "left" },
                    1: { cellWidth: 30, halign: "left" },
                    2: { cellWidth: 38, halign: "left" },
                    3: { cellWidth: 38, halign: "left" },
                    4: { cellWidth: 24, halign: "left" },
                    5: { cellWidth: 32, halign: "left" }
                },
                margin: { left: margin, right: margin },
                showHead: "everyPage"
            });
            y = doc.lastAutoTable?.finalY + 7 || y + 30;
        }
        // Unterschriften
        if (y > 238) {
            doc.addPage();
            y = 24;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("Bestätigung", margin, y);
        y += 20;
        const signatureWidth = 78;
        const rightX = pageWidth - margin - signatureWidth;
        doc.setDrawColor(100, 116, 139);
        doc.line(margin, y, margin + signatureWidth, y);
        doc.line(rightX, y, rightX + signatureWidth, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.text("Ort, Datum / Bauleiter", margin, y + 5);
        doc.text("Ort, Datum / Bauherr / Auftraggeber", rightX, y + 5);
        const pages = doc.getNumberOfPages();
        for (let page = 1; page <= pages; page += 1) {
            doc.setPage(page);
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.text(`${company.name || "Ausführende Firma"} · GPS-Messprotokoll · Seite ${page}/${pages}`, margin, 290);
        }
        return doc;
    }
    async function savePdfToServer(doc, filename) {
        const dataUrl = normalizePdfDataUrl(doc.output("datauristring"));
        return api("/api/gps/export-pdf", {
            method: "POST",
            body: JSON.stringify({
                projectId: serverProjectId,
                filenameHint: filename,
                pdfDataUrl: dataUrl
            })
        });
    }
    async function exportPdf() {
        const currentLV = resolveCurrentLV();
        if (!currentLV) {
            setErr("Bitte LV-Position wählen.");
            return;
        }
        selectedLVRef.current = currentLV;
        if (!selectedLV || selectedLV.id !== currentLV.id) {
            setSelectedLV(currentLV);
        }
        if (!points.length && !measurements.length && !areas.length && !annotations.length) {
            setErr("Keine Messung, Fläche oder Kommentar für den PDF-Export vorhanden.");
            return;
        }
        setBusy(true);
        setErr(null);
        try {
            const [mapImage, serverLogoDataUrl] = await Promise.all([
                captureMapSnapshotPngDataUrl(),
                loadCompanyLogoForPdf()
            ]);
            const doc = buildPdfDoc(mapImage, serverLogoDataUrl);
            const filename = `gps_messprotokoll_${currentLV.position}_${tsForFilename()}.pdf`;
            saveRlcPdfWithCompanyHeader(doc, filename);
            const result = await savePdfToServer(doc, filename);
            setErr(`PDF lokal und am Server gespeichert: ${result?.filename || filename}`);
            await loadServerPdfs();
        }
        catch (error) {
            setErr(`PDF-Export fehlgeschlagen: ${String(error?.message || error)}`);
        }
        finally {
            setBusy(false);
        }
    }
    async function transferToAufmassEditor() {
        if (!serverProjectId || !selectedLV) {
            setErr("Projekt und LV-Position müssen gewählt sein.");
            return;
        }
        const items = [];
        measurements.forEach((measurement, index) => {
            const selectedPoints = measurement.pointIndexes.
                map((pointIndex) => points[pointIndex]).
                filter(Boolean);
            const qty = polylineLengthMeters(selectedPoints);
            if (qty > 0) {
                items.push({
                    id: measurement.id,
                    type: "DISTANCE",
                    label: measurement.name || `Messung ${index + 1}`,
                    qty,
                    unit: "m",
                    comment: measurement.comment || ""
                });
            }
        });
        areas.forEach((area, index) => {
            const selectedPoints = area.pointIndexes.
                map((pointIndex) => points[pointIndex]).
                filter(Boolean);
            const qty = polygonAreaMeters2(selectedPoints);
            if (qty > 0) {
                items.push({
                    id: area.id,
                    type: "AREA",
                    label: area.name || `Fläche ${index + 1}`,
                    qty,
                    unit: "m²",
                    comment: area.comment || ""
                });
            }
        });
        if (!items.length) {
            setErr("Keine gespeicherten Strecken oder Flächen zum Übertragen vorhanden.");
            return;
        }
        setBusy(true);
        try {
            const transferId = crypto.randomUUID();
            await api("/api/gps/aufmass-transfer", {
                method: "POST",
                body: JSON.stringify({
                    projectId: serverProjectId,
                    transferId,
                    lvPosId: selectedLV.id,
                    lvPosition: selectedLV.position,
                    lvKurztext: selectedLV.kurztext,
                    items,
                    createdAt: Date.now()
                })
            });
            await saveWorkspaceToServer();
            setErr(`${items.length} GPS-Aufmaßzeile(n) am Server für den AufmaßEditor gespeichert.`);
            navigate("/mengenermittlung/aufmasseditor?import=gps");
        }
        catch (error) {
            setErr(`Übertragung fehlgeschlagen: ${String(error?.message || error)}`);
        }
        finally {
            setBusy(false);
        }
    }
    function printMap() {
        const previousLabels = showPointLabelsRef.current;
        setPrintWithoutPointLabels(true);
        showPointLabelsRef.current = false;
        setShowPointLabels(false);
        window.setTimeout(() => {
            redrawMap();
            window.print();
            window.setTimeout(() => {
                setPrintWithoutPointLabels(false);
                showPointLabelsRef.current = previousLabels;
                setShowPointLabels(previousLabels);
                redrawMap();
            }, 250);
        }, 150);
    }
    /* ===================== UI ===================== */
    const modeButton = (mode, label) => _jsx("button", { type: "button", onClick: () => {
            setEditorMode(mode);
            editorModeRef.current = mode;
        }, className: rlcClass("btn", editorMode === mode ?
            {
                borderColor: "#146ef5",
                background: "#eaf2ff",
                color: "#0b5bd3",
                fontWeight: 700
            } :
            undefined), children: label });
    return (_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1287", children: [_jsx("style", { children: `
        .leaflet-tooltip.rlc-gps-point-label {
          padding: 0 2px !important;
          border-radius: 2px !important;
          font-size: 8px !important;
          line-height: 1 !important;
          font-weight: 700 !important;
          white-space: nowrap !important;
          color: rgba(15, 23, 42, 0.90) !important;
          background: rgba(255, 255, 255, 0.10) !important;
          border: 1px solid rgba(100, 116, 139, 0.16) !important;
          box-shadow: none !important;
          pointer-events: none !important;
          transition:
            font-size 90ms linear,
            opacity 90ms linear,
            padding 90ms linear,
            background-color 90ms linear,
            border-color 90ms linear !important;
        }

        #gps-map[data-point-label-zoom="far"] .leaflet-tooltip.rlc-gps-point-label {
          font-size: 2px !important;
          padding: 0 !important;
          opacity: 0.10 !important;
          background: transparent !important;
          border-color: transparent !important;
        }

        #gps-map[data-point-label-zoom="tiny"] .leaflet-tooltip.rlc-gps-point-label {
          font-size: 3px !important;
          padding: 0 !important;
          opacity: 0.18 !important;
          background: transparent !important;
          border-color: transparent !important;
        }

        #gps-map[data-point-label-zoom="small"] .leaflet-tooltip.rlc-gps-point-label {
          font-size: 4px !important;
          padding: 0 1px !important;
          opacity: 0.32 !important;
          background: rgba(255, 255, 255, 0.02) !important;
          border-color: transparent !important;
        }

        #gps-map[data-point-label-zoom="medium"] .leaflet-tooltip.rlc-gps-point-label {
          font-size: 5.5px !important;
          padding: 0 1px !important;
          opacity: 0.52 !important;
          background: rgba(255, 255, 255, 0.05) !important;
          border-color: rgba(100, 116, 139, 0.08) !important;
        }

        #gps-map[data-point-label-zoom="near"] .leaflet-tooltip.rlc-gps-point-label {
          font-size: 7px !important;
          padding: 0 2px !important;
          opacity: 0.76 !important;
          background: rgba(255, 255, 255, 0.08) !important;
          border-color: rgba(100, 116, 139, 0.12) !important;
        }

        #gps-map[data-point-label-zoom="max"] .leaflet-tooltip.rlc-gps-point-label {
          font-size: 9px !important;
          padding: 1px 3px !important;
          opacity: 0.96 !important;
          background: rgba(255, 255, 255, 0.14) !important;
          border-color: rgba(100, 116, 139, 0.18) !important;
        }


        #gps-map[data-print-without-point-labels="true"] .leaflet-tooltip.rlc-gps-point-label {
          display: none !important;
        }

        .leaflet-tooltip-top.rlc-gps-point-label::before {
          border-top-color: transparent !important;
        }


        .rlc-map-comment-marker {
          background: transparent !important;
          border: 0 !important;
        }

        .rlc-map-comment-content {
          display: inline-block;
          width: max-content;
          max-width: 420px;
          padding: 3px 6px;
          border: 1px solid rgba(71, 85, 105, 0.42);
          border-radius: 5px;
          background: rgba(255, 255, 255, 0.74);
          color: #0f172a;
          font-family: system-ui, sans-serif;
          font-weight: 700;
          line-height: 1.15;
          white-space: pre-wrap;
          box-shadow: 0 2px 7px rgba(15, 23, 42, 0.15);
          cursor: move;
          user-select: none;
        }

        @media print {
          .rlc-map-comment-content {
            background: rgba(255, 255, 255, 0.55) !important;
            box-shadow: none !important;
          }
        }


        @media print {
          body * {
            visibility: hidden !important;
          }

          #gps-map,
          #gps-map * {
            visibility: visible !important;
          }

          #gps-map {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            min-height: 0 !important;
            border: 0 !important;
          }

          .leaflet-control-container,
          .leaflet-tooltip.rlc-gps-point-label {
            display: none !important;
          }
        }
      ` }), _jsx(MengPageHeader, { title: "GPS-Zuweisung", subtitle: "GPS-Punkte, Strecken, Fl\u00E4chen und Kommentare einer LV-Position zuordnen." }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1288", children: [_jsxs("div", { className: "card rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1289", children: [_jsx("h3", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1290", children: "GPS-Messeditor" }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1291", children: [_jsx("strong", { children: project?.name || project?.title || "Neues Projekt" }), _jsx("br", {}), "Projekt-Code: ", projectCode || "—"] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1292", children: [_jsx("button", { className: "btn", onClick: () => void loadLV(), disabled: busy, children: "LV laden" }), _jsx("button", { className: "btn", onClick: () => void loadAssignments(), disabled: busy, children: "Zuweisungen laden" }), _jsx("button", { className: "btn", onClick: clearCurrent, disabled: busy, children: "Entwurf l\u00F6schen" })] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1293", children: [_jsx("label", { className: rlcClass(null, labelStyle), children: "LV-Position" }), _jsx("input", { value: lvSearch, onChange: (event) => setLvSearch(event.target.value), placeholder: "Positionsnummer oder Text suchen\u2026", className: rlcClass(null, inputStyle) }), _jsx("div", { className: rlcClass(null, listStyle), children: !lvList.length ?
                                            _jsx("div", { className: rlcClass(null, emptyStyle), children: "Keine LV-Positionen geladen." }) :
                                            !filteredLvList.length ?
                                                _jsx("div", { className: rlcClass(null, emptyStyle), children: "Keine passende LV-Position." }) :
                                                filteredLvList.map((position) => _jsxs("button", { type: "button", onClick: () => {
                                                        selectedLVRef.current = position;
                                                        setSelectedLV(position);
                                                        setLvSearch(`${position.position} ${position.kurztext}`.trim());
                                                        saveDraft({ selectedLvId: position.id });
                                                    }, className: rlcClass(null, {
                                                        ...listButtonStyle,
                                                        background: selectedLV?.id === position.id ? "#eef2ff" : "white"
                                                    }), children: [_jsx("strong", { children: position.position }), _jsx("span", { children: position.kurztext || position.langtext || "" })] }, position.id)) })] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1294", children: [_jsx("label", { className: rlcClass(null, labelStyle), children: "Punktdatei" }), _jsxs("select", { value: csvCrs, onChange: (event) => {
                                            setCsvCrs(event.target.value);
                                            saveDraft({ csvCrs: event.target.value });
                                        }, className: rlcClass(null, inputStyle), children: [_jsx("option", { value: "EPSG:4326", children: "WGS84" }), _jsx("option", { value: "EPSG:25832", children: "UTM32 ETRS89" }), _jsx("option", { value: "EPSG:32632", children: "UTM32 WGS84" }), _jsx("option", { value: "EPSG:31466", children: "DHDN GK2" }), _jsx("option", { value: "EPSG:31467", children: "DHDN GK3" }), _jsx("option", { value: "EPSG:31468", children: "DHDN GK4" }), _jsx("option", { value: "EPSG:31469", children: "DHDN GK5" })] }), _jsx("input", { type: "file", id: "gps-import-file-input", accept: ".csv,.txt,.gpx,.kml,.geojson,.json,.dxf", onChange: (event) => {
                                            const file = event.target.files?.[0];
                                            if (file)
                                                onFileImport(file);
                                            event.currentTarget.value = "";
                                        }, className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1295" }), _jsx("button", { type: "button", className: "btn rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1296", disabled: busy, onClick: () => document.getElementById("gps-import-file-input")?.click(), children: "DXF importieren" })] }), _jsxs("div", { className: rlcClass(null, editorCardStyle), children: [_jsx("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1297", children: "Mini-Editor" }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1298", children: [modeButton("POINT", "Punkt"), modeButton("DISTANCE", "Strecke"), modeButton("AREA", "Fläche"), modeButton("COMMENT", "Kommentar")] }), _jsxs("label", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1299", children: [_jsx("input", { type: "checkbox", checked: showPointLabels, onChange: (event) => setShowPointLabels(event.target.checked) }), "Punktnamen dauerhaft anzeigen"] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1300", children: [_jsx("button", { className: "btn", type: "button", onClick: () => setShowPointLabels((current) => !current), children: showPointLabels ? "Punkttexte ausschalten" : "Punkttexte einschalten" }), _jsx("button", { className: "btn", type: "button", onClick: printMap, children: "Drucken" })] }), editorMode === "DISTANCE" ?
                                        _jsxs(_Fragment, { children: [_jsx("input", { value: measurementComment, onChange: (event) => setMeasurementComment(event.target.value), placeholder: "Kommentar zur Strecke", className: rlcClass(null, inputStyle) }), _jsxs("div", { className: rlcClass(null, statusStyle), children: ["Punkte: ", activeDistanceIndexes.length, " \u00B7", " ", formatDistance(activeDistance)] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1301", children: [_jsx("button", { className: "btn", type: "button", onClick: saveDistanceMeasurement, disabled: activeDistanceIndexes.length < 2, children: "Strecke speichern" }), _jsx("button", { className: "btn", type: "button", onClick: () => updateAll(points, measurements, areas, annotations, [], activeAreaIndexes), disabled: !activeDistanceIndexes.length, children: "Abbrechen" })] })] }) :
                                        null, editorMode === "AREA" ?
                                        _jsxs(_Fragment, { children: [_jsx("input", { value: areaComment, onChange: (event) => setAreaComment(event.target.value), placeholder: "Kommentar zur Fl\u00E4che", className: rlcClass(null, inputStyle) }), _jsxs("div", { className: rlcClass(null, statusStyle), children: ["Eckpunkte: ", activeAreaIndexes.length, " \u00B7 ", formatArea(activeArea)] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1302", children: [_jsx("button", { className: "btn", type: "button", onClick: saveAreaMeasurement, disabled: activeAreaIndexes.length < 3, children: "Fl\u00E4che schlie\u00DFen & speichern" }), _jsx("button", { className: "btn", type: "button", onClick: () => updateAll(points, measurements, areas, annotations, activeDistanceIndexes, []), disabled: !activeAreaIndexes.length, children: "Abbrechen" })] })] }) :
                                        null, editorMode === "COMMENT" ?
                                        _jsxs(_Fragment, { children: [_jsx("textarea", { value: commentText, onChange: (event) => setCommentText(event.target.value), placeholder: "Kommentar eingeben und anschlie\u00DFend die genaue Position auf der Karte anklicken", className: rlcClass(null, { ...inputStyle, minHeight: 58, resize: "vertical" }) }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1303", children: [_jsxs("label", { className: rlcClass(null, labelStyle), children: ["Textgr\u00F6\u00DFe", _jsx("input", { type: "number", min: 8, max: 40, step: 1, value: commentFontSize, onChange: (event) => setCommentFontSize(Math.max(8, Math.min(40, Number(event.target.value) || 14))), className: rlcClass(null, { ...inputStyle, marginTop: 4 }) })] }), _jsxs("label", { className: rlcClass(null, labelStyle), children: ["Drehung (\u00B0)", _jsx("input", { type: "number", min: -180, max: 180, step: 5, value: commentRotation, onChange: (event) => setCommentRotation(Math.max(-180, Math.min(180, Number(event.target.value) || 0))), className: rlcClass(null, { ...inputStyle, marginTop: 4 }) })] })] }), _jsx("div", { className: rlcClass(null, statusStyle), children: "Karte anklicken: Der Klickpunkt ist jetzt exakt die Mitte des Kommentars. Danach kann der Kommentar mit der Maus verschoben werden." })] }) :
                                        null] }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1304", children: ["Punkte: ", _jsx("strong", { children: points.length }), " \u00B7 Strecken:", " ", _jsx("strong", { children: measurements.length }), " (", formatDistance(totalDistance), ") \u00B7 Fl\u00E4chen: ", _jsx("strong", { children: areas.length }), " (", formatArea(totalArea), ")"] }), measurements.length ?
                                _jsx("div", { className: rlcClass(null, resultListStyle), children: measurements.map((measurement, index) => {
                                        const selectedPoints = measurement.pointIndexes.
                                            map((pointIndex) => points[pointIndex]).
                                            filter(Boolean);
                                        return (_jsxs("div", { className: rlcClass(null, resultRowStyle), children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1305", children: [_jsx("strong", { children: measurement.name || `Messung ${index + 1}` }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1306", children: [formatDistance(polylineLengthMeters(selectedPoints)), measurement.comment ? ` · ${measurement.comment}` : ""] })] }), _jsx("button", { className: "btn", type: "button", onClick: () => deleteMeasurement(measurement.id), children: "L\u00F6schen" })] }, measurement.id));
                                    }) }) :
                                null, areas.length ?
                                _jsx("div", { className: rlcClass(null, resultListStyle), children: areas.map((area, index) => {
                                        const selectedPoints = area.pointIndexes.
                                            map((pointIndex) => points[pointIndex]).
                                            filter(Boolean);
                                        return (_jsxs("div", { className: rlcClass(null, resultRowStyle), children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1307", children: [_jsx("strong", { children: area.name || `Fläche ${index + 1}` }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1308", children: [formatArea(polygonAreaMeters2(selectedPoints)), area.comment ? ` · ${area.comment}` : ""] })] }), _jsx("button", { className: "btn", type: "button", onClick: () => deleteArea(area.id), children: "L\u00F6schen" })] }, area.id));
                                    }) }) :
                                null, annotations.length ?
                                _jsx("div", { className: rlcClass(null, resultListStyle), children: annotations.map((annotation) => _jsxs("div", { className: rlcClass(null, {
                                            ...resultRowStyle,
                                            alignItems: "flex-end",
                                            flexWrap: "wrap"
                                        }), children: [_jsxs("label", { className: rlcClass(null, { ...labelStyle, flex: "1 1 180px", marginBottom: 0 }), children: ["Kommentar", _jsx("input", { value: annotation.text, onChange: (event) => updateAnnotation(annotation.id, { text: event.target.value }), className: rlcClass(null, { ...inputStyle, marginTop: 4 }) })] }), _jsxs("label", { className: rlcClass(null, { ...labelStyle, width: 82, marginBottom: 0 }), children: ["Gr\u00F6\u00DFe", _jsx("input", { type: "number", min: 8, max: 40, value: annotation.fontSize || 14, onChange: (event) => updateAnnotation(annotation.id, {
                                                            fontSize: Math.max(8, Math.min(40, Number(event.target.value) || 14))
                                                        }), className: rlcClass(null, { ...inputStyle, marginTop: 4 }) })] }), _jsxs("label", { className: rlcClass(null, { ...labelStyle, width: 88, marginBottom: 0 }), children: ["Drehung", _jsx("input", { type: "number", min: -180, max: 180, step: 5, value: annotation.rotation || 0, onChange: (event) => updateAnnotation(annotation.id, {
                                                            rotation: Math.max(-180, Math.min(180, Number(event.target.value) || 0))
                                                        }), className: rlcClass(null, { ...inputStyle, marginTop: 4 }) })] }), _jsx("button", { className: "btn", type: "button", onClick: () => deleteAnnotation(annotation.id), children: "L\u00F6schen" })] }, annotation.id)) }) :
                                null, _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1309", children: [_jsx("button", { className: "btn", onClick: () => void saveAssignment(), disabled: busy, children: "Zuweisen & speichern" }), _jsx("button", { className: "btn", onClick: () => void exportPdf(), disabled: busy, children: "PDF exportieren" }), _jsx("button", { className: "btn", onClick: () => exportDxf(), disabled: busy, children: "DXF exportieren" }), _jsx("button", { className: "btn", onClick: () => void transferToAufmassEditor(), disabled: busy, children: "Ins Aufma\u00DFEditor \u00FCbertragen" })] }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1310", children: serverSaveStatus }), serverPdfs.length ?
                                _jsx("div", { className: rlcClass(null, { ...resultListStyle, marginTop: 8 }), children: serverPdfs.map((pdf) => _jsxs("div", { className: rlcClass(null, resultRowStyle), children: [_jsx("span", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1311", children: pdf.name }), _jsx("span", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1312", children: new Date(pdf.mtime).toLocaleString("de-DE") }), _jsx("a", { className: "btn", href: apiUrl(pdf.url), target: "_blank", rel: "noreferrer", children: "\u00D6ffnen" })] }, pdf.name)) }) :
                                null, err ?
                                _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1313", children: err }) :
                                null, _jsx("hr", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1314" }), _jsx("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1315", children: "Gespeicherte Zuweisungen" }), !assignments.length ?
                                _jsx("div", { className: rlcClass(null, emptyStyle), children: "Keine gespeicherten Zuweisungen." }) :
                                _jsx("div", { className: rlcClass(null, resultListStyle), children: assignments.map((assignment) => _jsxs("div", { className: rlcClass(null, resultRowStyle), children: [_jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1316", children: [_jsx("strong", { children: assignment.lvPos?.position || assignment.lvPosId }), _jsxs("div", { className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1317", children: [assignment.points?.length || 0, " Punkte"] })] }), _jsx("button", { className: "btn", onClick: () => loadAssignmentIntoCurrent(assignment), children: "Laden" }), _jsx("button", { className: "btn", onClick: () => void deleteAssignment(assignment.id), children: "L\u00F6schen" })] }, assignment.id)) })] }), _jsx("div", { className: "card rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1318", children: _jsx("div", { id: "gps-map", "data-print-without-point-labels": printWithoutPointLabels ? "true" : "false", className: "rlc-migrated-pages-mengenermittlung-gpszuweisung-tsx-1319" }) })] })] }));
}
/* ===================== STYLES ===================== */
const labelStyle = {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
    marginBottom: 5
};
const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 9px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "white",
    fontSize: 13
};
const listStyle = {
    maxHeight: 175,
    overflow: "auto",
    border: "1px solid #dbe2ea",
    borderRadius: 8,
    marginTop: 6
};
const listButtonStyle = {
    width: "100%",
    border: 0,
    borderBottom: "1px solid #edf1f5",
    padding: 8,
    textAlign: "left",
    display: "grid",
    gap: 2,
    cursor: "pointer"
};
const emptyStyle = {
    padding: 9,
    fontSize: 12,
    opacity: 0.7
};
const editorCardStyle = {
    display: "grid",
    gap: 8,
    marginTop: 12,
    padding: 10,
    border: "1px solid #dbe4ef",
    borderRadius: 10,
    background: "#f8fafc"
};
const statusStyle = {
    fontSize: 12,
    color: "#475569"
};
const resultListStyle = {
    display: "grid",
    gap: 5,
    marginTop: 8,
    padding: 7,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    background: "#f8fafc"
};
const resultRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: 5,
    borderBottom: "1px solid #e8edf3",
    fontSize: 12
};
