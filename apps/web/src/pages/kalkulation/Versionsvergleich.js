import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { savePdfWithCompanyHeader as saveRlcPdfWithCompanyHeader } from "../../lib/pdf/companyPdfHeader";
// apps/web/src/pages/kalkulation/Versionsvergleich.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiUrl } from "../../lib/apiBase";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useProject } from "../../store/useProject";
import { LV } from "./store.lv";
import Widersprueche from "../ki/Widersprueche";
import BewertungAnalyse from "../ki/BewertungAnalyse";
const STORE_PREFIX = "rlc_versionsvergleich_v3_";
/* ================= HELPERS ================= */
function safeId() {
    try {
        return crypto.randomUUID();
    }
    catch {
        return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
function n(value) {
    const raw = String(value ?? "").trim();
    const normalized = raw.includes(",") ?
        raw.replace(/\./g, "").replace(",", ".") :
        raw;
    const x = typeof value === "number" ? value : Number(normalized);
    return Number.isFinite(x) ? x : 0;
}
function money(value) {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR"
    }).format(n(value));
}
function qty(value) {
    return new Intl.NumberFormat("de-DE", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3
    }).format(n(value));
}
function dateDE(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
        return "—";
    return d.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}
function todayDE() {
    return new Date().toLocaleDateString("de-DE");
}
function getProject(ctx) {
    const p = ctx?.project ||
        ctx?.currentProject ||
        ctx?.selectedProject ||
        ctx?.current ||
        ctx;
    if (!p || typeof p !== "object")
        return null;
    return p;
}
function getProjectKey(project) {
    return String(project?.code ||
        project?.number ||
        project?.projektnummer ||
        project?.id ||
        "GLOBAL").
        trim().
        toUpperCase();
}
function getProjectName(project) {
    return String(project?.name || project?.projectName || "").trim();
}
function storeKey(projectKey) {
    return `${STORE_PREFIX}${projectKey || "GLOBAL"}`;
}
function looksLikeUuid(value) {
    const s = String(value || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
function isTrashRow(row, projectKey) {
    const pos = String(row.posNr || "").trim();
    const text = String(row.kurztext || row.langtext || "").trim();
    const unit = String(row.einheit || "").trim();
    const menge = n(row.menge);
    const preis = n(row.preis);
    if (!pos && !text && !unit && menge === 0 && preis === 0)
        return true;
    if (looksLikeUuid(pos))
        return true;
    if (projectKey && pos.toUpperCase() === projectKey.toUpperCase())
        return true;
    if (!text && looksLikeUuid(String(row.id || "")))
        return true;
    return false;
}
function normalizeLvRow(row, projectKey = "") {
    const menge = n(row.menge);
    const preis = n(row.preis);
    return {
        id: String(row.id || safeId()),
        posNr: String(row.posNr || "").trim(),
        parentPosNr: String(row.parentPosNr || "").trim(),
        sortIndex: row.sortIndex,
        kurztext: String(row.kurztext || "").trim(),
        langtext: String(row.langtext || "").trim(),
        bemerkung: String(row.bemerkung || "").trim(),
        einheit: String(row.einheit || "").trim() || "",
        menge,
        preis,
        gesamt: n(row.gesamt) || Number((menge * preis).toFixed(2)),
        waehrung: row.waehrung || "EUR",
        confidence: row.confidence,
        createdAt: row.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}
function cleanRows(rows, projectKey) {
    return rows.
        filter((r) => !isTrashRow(r, projectKey)).
        map((r) => normalizeLvRow(r, projectKey)).
        sort((a, b) => String(a.posNr || "").localeCompare(String(b.posNr || ""), "de", {
        numeric: true,
        sensitivity: "base"
    }));
}
function versionTextKey(row) {
    return [
        String(row?.kurztext || row?.shortText || row?.text || "").
            trim().
            toLowerCase().
            replace(/\s+/g, " "),
        String(row?.einheit || row?.unit || row?.me || "").
            trim().
            toLowerCase()
    ].
        join("|");
}
function extractStoredRows(parsed) {
    if (Array.isArray(parsed))
        return parsed;
    if (Array.isArray(parsed?.rows))
        return parsed.rows;
    if (Array.isArray(parsed?.items))
        return parsed.items;
    if (Array.isArray(parsed?.positions))
        return parsed.positions;
    if (Array.isArray(parsed?.data?.rows))
        return parsed.data.rows;
    return [];
}
function loadCanonicalLvRows(projectKey) {
    const keys = [
        `rlc_lv_data_v1:${projectKey}`,
        `rlc_gaeb_import_v1:${projectKey}`,
        `RLC_POSITIONLV_${projectKey}`
    ];
    for (const key of keys) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw)
                continue;
            const parsed = JSON.parse(raw);
            const rows = extractStoredRows(parsed);
            const valid = rows.filter((row) => {
                const pos = String(row?.posNr ??
                    row?.position ??
                    row?.positionsnummer ??
                    row?.oz ??
                    "").trim();
                return pos && String(row?.kurztext ?? row?.text ?? "").trim();
            });
            if (valid.length)
                return valid;
        }
        catch {
            //
        }
    }
    try {
        return LV.list();
    }
    catch {
        return [];
    }
}
function reconcileVersionPositions(inputRows, projectKey) {
    const canonical = loadCanonicalLvRows(projectKey);
    if (!canonical.length)
        return inputRows;
    const byText = new Map();
    for (const row of canonical) {
        const key = versionTextKey(row);
        if (!key || key === "|")
            continue;
        const list = byText.get(key) || [];
        list.push(row);
        byText.set(key, list);
    }
    const used = new Set();
    return inputRows.map((row, index) => {
        const currentPos = String(row.posNr || "").trim();
        // Eine bereits vollständige OZ bleibt unverändert.
        if (/^\d{1,3}(?:\.\d{1,4}){2,}$/.test(currentPos) ||
            /[A-Za-z].*\d|\d.*[A-Za-z]/.test(currentPos)) {
            return row;
        }
        const candidates = byText.get(versionTextKey(row)) || [];
        let canonicalRow = candidates.find((candidate) => !used.has(candidate));
        if (!canonicalRow) {
            const fallback = canonical[index];
            if (fallback && !used.has(fallback))
                canonicalRow = fallback;
        }
        if (!canonicalRow)
            return row;
        used.add(canonicalRow);
        const canonicalPos = String(canonicalRow?.posNr ??
            canonicalRow?.position ??
            canonicalRow?.positionsnummer ??
            canonicalRow?.oz ??
            "").trim();
        if (!canonicalPos)
            return row;
        return normalizeLvRow({
            ...row,
            posNr: canonicalPos,
            parentPosNr: canonicalRow?.parentPosNr ??
                canonicalRow?.parentPosition ??
                row.parentPosNr,
            sortIndex: canonicalRow?.sortIndex ?? row.sortIndex ?? index
        }, projectKey);
    });
}
function loadVersions(projectKey) {
    try {
        const raw = localStorage.getItem(storeKey(projectKey));
        const parsed = JSON.parse(raw || "[]");
        if (!Array.isArray(parsed))
            return [];
        return parsed.map((v) => ({
            id: String(v.id || safeId()),
            name: String(v.name || "Version"),
            createdAt: String(v.createdAt || new Date().toISOString()),
            source: v.source === "CSV" ? "CSV" : "LV",
            rows: reconcileVersionPositions(cleanRows(Array.isArray(v.rows) ? v.rows : [], projectKey), projectKey)
        }));
    }
    catch {
        return [];
    }
}
function saveVersions(projectKey, versions) {
    try {
        localStorage.setItem(storeKey(projectKey), JSON.stringify(versions));
    }
    catch {
        // Große Versionsvergleiche werden serverseitig gespeichert.
        // LocalStorage bleibt nur ein optionaler Browser-Cache.
    }
}
function analysisStoreKey(projectKey) { return `rlc_versionsvergleich_analysis_v1:${projectKey}`; }
function loadAnalysisResult(projectKey) {
    try {
        const raw = localStorage.getItem(analysisStoreKey(projectKey));
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.title !== "string")
            return null;
        return {
            title: String(parsed.title || ""),
            warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
            changes: Array.isArray(parsed.changes) ? parsed.changes.map(String) : [],
            unchanged: Array.isArray(parsed.unchanged) ? parsed.unchanged.map(String) : []
        };
    }
    catch {
        return null;
    }
}
function saveAnalysisResult(projectKey, result) {
    try {
        localStorage.setItem(analysisStoreKey(projectKey), JSON.stringify(result));
    }
    catch {
        //
    }
}
function getVersionAuthHeaders(extra = {}) {
    const token = localStorage.getItem("rlc_token") ||
        localStorage.getItem("token") ||
        localStorage.getItem("authToken") ||
        localStorage.getItem("accessToken") ||
        sessionStorage.getItem("rlc_token") ||
        sessionStorage.getItem("token") ||
        "";
    return {
        ...extra,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}
function extractServerVersions(data) {
    const raw = data?.data?.versions ||
        data?.versions ||
        data?.snapshot?.data?.versions ||
        [];
    return Array.isArray(raw) ? raw : [];
}
function extractServerAnalysis(data) {
    const raw = data?.data?.analysis ||
        data?.analysis ||
        data?.snapshot?.data?.analysis ||
        null;
    if (!raw || typeof raw.title !== "string")
        return null;
    return {
        title: String(raw.title || ""),
        warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
        changes: Array.isArray(raw.changes) ? raw.changes.map(String) : [],
        unchanged: Array.isArray(raw.unchanged) ? raw.unchanged.map(String) : []
    };
}
function extractRowsFromStoredCalc(parsed) {
    if (Array.isArray(parsed))
        return parsed;
    if (Array.isArray(parsed?.rows))
        return parsed.rows;
    if (Array.isArray(parsed?.items))
        return parsed.items;
    if (Array.isArray(parsed?.data?.rows))
        return parsed.data.rows;
    return [];
}
function toVersionLvRows(rawRows, projectKey) {
    const mapped = rawRows.map((r, index) => {
        const menge = n(r.menge ?? r.quantity ?? r.qty);
        const preis = n(r.rlcKiUnitPrice) ||
            n(r.finalUnitPrice) ||
            n(r.suggestedUnitPrice) ||
            n(r.unitPrice) ||
            n(r.preis) ||
            n(r.ep);
        const gesamt = n(r.rlcKiTotal) ||
            n(r.totalNet) ||
            n(r.gesamt) ||
            n(r.gp) ||
            Math.round(menge * preis * 100) / 100;
        return {
            id: String(r.id || `${projectKey}-${r.posNr || index}`),
            posNr: String(r.posNr ?? r.position ?? r.nr ?? "").trim(),
            parentPosNr: String(r.parentPosNr || "").trim(),
            sortIndex: r.sortIndex ?? index,
            kurztext: String(r.kurztext ?? r.shortText ?? r.title ?? "").trim(),
            langtext: String(r.langtext ?? r.longText ?? r.description ?? "").trim(),
            einheit: String(r.einheit ?? r.unit ?? r.me ?? "").trim(),
            menge,
            preis,
            gesamt
        };
    });
    return reconcileVersionPositions(cleanRows(mapped, projectKey), projectKey).filter((r) => String(r.posNr || r.kurztext || "").trim() && (n(r.menge) > 0 || n(r.preis) > 0 || n(r.gesamt) > 0));
}
function loadCurrentVersionRows(projectKey) {
    const keys = [
        { key: `rlc_kalkulation_mit_ki_elite_v1:${projectKey}`, label: "RLC-KI Kalkulation" },
        { key: `rlc_lv_data_v1:${projectKey}`, label: "LV / Positionen" },
        { key: `rlc_gaeb_import_v1:${projectKey}`, label: "GAEB Import" }
    ];
    for (const item of keys) {
        try {
            const raw = localStorage.getItem(item.key);
            if (!raw)
                continue;
            const parsed = JSON.parse(raw);
            const rows = toVersionLvRows(extractRowsFromStoredCalc(parsed), projectKey);
            if (rows.length)
                return { rows, sourceLabel: item.label };
        }
        catch {
            //
        }
    }
    return { rows: cleanRows(LV.list(), projectKey), sourceLabel: "LV Snapshot" };
}
function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
function splitCsvLine(line, sep) {
    const cells = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            if (quoted && line[i + 1] === '"') {
                cur += '"';
                i += 1;
            }
            else {
                quoted = !quoted;
            }
        }
        else if (!quoted && ch === sep) {
            cells.push(cur.trim());
            cur = "";
        }
        else {
            cur += ch;
        }
    }
    cells.push(cur.trim());
    return cells;
}
function parseCsv(text, projectKey) {
    const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = raw.split("\n").map((x) => x.trim()).filter(Boolean);
    if (!lines.length)
        return [];
    const sep = lines[0].includes(";") ? ";" : ",";
    const header = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase());
    const find = (...names) => header.findIndex((h) => names.some((name) => h.includes(name)));
    const idxPos = find("pos", "position", "posnr");
    const idxKurz = find("kurz", "text", "beschreibung");
    const idxLang = find("lang");
    const idxEinheit = find("einheit", "me", "unit");
    const idxMenge = find("menge", "qty");
    const idxPreis = find("preis", "ep", "unit price");
    const start = idxPos >= 0 || idxKurz >= 0 ? 1 : 0;
    return cleanRows(lines.slice(start).map((line, i) => {
        const c = splitCsvLine(line, sep);
        return {
            id: safeId(),
            posNr: c[idxPos >= 0 ? idxPos : 0] || String(i + 1),
            kurztext: c[idxKurz >= 0 ? idxKurz : 1] || "",
            langtext: idxLang >= 0 ? c[idxLang] || "" : "",
            einheit: idxEinheit >= 0 ? c[idxEinheit] || "" : "",
            menge: idxMenge >= 0 ? n(c[idxMenge]) : 0,
            preis: idxPreis >= 0 ? n(c[idxPreis]) : 0
        };
    }), projectKey);
}
function toCell(row) {
    if (!row)
        return null;
    return {
        posNr: String(row.posNr || ""),
        kurztext: String(row.kurztext || ""),
        langtext: String(row.langtext || ""),
        einheit: String(row.einheit || ""),
        menge: n(row.menge),
        preis: n(row.preis),
        gesamt: n(row.gesamt) || n(row.menge) * n(row.preis)
    };
}
function same(values) {
    const clean = values.map((v) => String(v ?? "").trim());
    return clean.every((v) => v === clean[0]);
}
function buildCompare(versions) {
    const keys = new Set();
    versions.forEach((v) => {
        v.rows.forEach((r) => {
            const key = String(r.posNr || r.kurztext || "").trim();
            if (key)
                keys.add(key);
        });
    });
    return Array.from(keys).
        sort((a, b) => a.localeCompare(b, "de", { numeric: true })).
        map((key) => {
        const cells = versions.map((v) => {
            const found = v.rows.find((r) => String(r.posNr || r.kurztext || "").trim() === key);
            return toCell(found);
        });
        const first = cells.find(Boolean);
        const kurztext = first?.kurztext || "";
        const posNr = first?.posNr || key;
        const textVals = cells.map((c) => c?.kurztext || "");
        const unitVals = cells.map((c) => c?.einheit || "");
        const qtyVals = cells.map((c) => c?.menge ?? "");
        const priceVals = cells.map((c) => c?.preis ?? "");
        return {
            key,
            posNr,
            kurztext,
            cells,
            diffText: !same(textVals),
            diffUnit: !same(unitVals),
            diffQty: !same(qtyVals),
            diffPrice: !same(priceVals)
        };
    });
}
function analyseVersion(v) {
    const rows = v.rows;
    const warnings = [];
    const changes = [];
    const unchanged = [];
    const missingText = rows.filter((r) => !r.kurztext && !r.langtext);
    const missingUnit = rows.filter((r) => !r.einheit);
    const missingQty = rows.filter((r) => n(r.menge) <= 0);
    const missingPrice = rows.filter((r) => n(r.preis) <= 0);
    const total = rows.reduce((sum, r) => sum + n(r.gesamt || n(r.menge) * n(r.preis)), 0);
    const expensive = [...rows].
        filter((r) => n(r.preis) > 0).
        sort((a, b) => n(b.preis) - n(a.preis)).
        slice(0, 8);
    if (missingText.length)
        warnings.push(`${missingText.length} Position(en) ohne Kurztext/Langtext.`);
    if (missingUnit.length)
        warnings.push(`${missingUnit.length} Position(en) ohne Einheit.`);
    if (missingQty.length)
        warnings.push(`${missingQty.length} Position(en) ohne Menge oder Menge 0.`);
    if (missingPrice.length)
        warnings.push(`${missingPrice.length} Position(en) ohne EP / Preis.`);
    changes.push(`Analysierte Version: ${v.name}.`);
    changes.push(`Positionen: ${rows.length}.`);
    changes.push(`Gesamtsumme: ${money(total)}.`);
    expensive.forEach((r) => {
        changes.push(`Hoher EP: Pos. ${r.posNr || "—"} · ${r.kurztext || "—"} · ${money(r.preis)}.`);
    });
    if (!warnings.length)
        unchanged.push("Keine offensichtlichen Datenqualitätsprobleme gefunden.");
    return {
        title: "Angebotsanalyse abgeschlossen",
        warnings,
        changes,
        unchanged
    };
}
function analyseCompare(rows, versions) {
    const price = rows.filter((r) => r.diffPrice);
    const qtyRows = rows.filter((r) => r.diffQty);
    const unit = rows.filter((r) => r.diffUnit);
    const text = rows.filter((r) => r.diffText);
    const missing = rows.filter((r) => r.cells.some((c) => !c));
    const warnings = [];
    const changes = [];
    const unchanged = [];
    changes.push(`Verglichen: ${versions.map((v) => v.name).join(" ↔ ")}.`);
    changes.push(`Positionen im Vergleich: ${rows.length}.`);
    changes.push(`Preisabweichungen: ${price.length}.`);
    changes.push(`Mengenabweichungen: ${qtyRows.length}.`);
    changes.push(`Einheitsabweichungen: ${unit.length}.`);
    changes.push(`Textabweichungen: ${text.length}.`);
    if (missing.length)
        warnings.push(`${missing.length} Position(en) fehlen in mindestens einer Version.`);
    price.slice(0, 10).forEach((r) => {
        const prices = r.cells.map((c) => c ? money(c.preis) : "—").join(" → ");
        warnings.push(`Preisabweichung Pos. ${r.posNr}: ${prices}`);
    });
    if (!price.length && !qtyRows.length && !unit.length && !text.length) {
        unchanged.push("Keine Abweichungen zwischen den ausgewählten Versionen gefunden.");
    }
    return {
        title: "Versionsvergleich abgeschlossen",
        warnings,
        changes,
        unchanged
    };
}
function exportCompareCsv(rows, versions, projectKey) {
    const header = [
        "PosNr",
        "Kurztext",
        ...versions.flatMap((v) => [
            `${v.name} Menge`,
            `${v.name} ME`,
            `${v.name} EP`,
            `${v.name} Gesamt`
        ]),
        "Diff Menge",
        "Diff ME",
        "Diff Preis",
        "Diff Text"
    ];
    const lines = rows.map((r) => [
        r.posNr,
        r.kurztext,
        ...r.cells.flatMap((c) => [
            c ? qty(c.menge) : "",
            c?.einheit || "",
            c ? money(c.preis) : "",
            c ? money(c.gesamt) : ""
        ]),
        r.diffQty ? "Ja" : "Nein",
        r.diffUnit ? "Ja" : "Nein",
        r.diffPrice ? "Ja" : "Nein",
        r.diffText ? "Ja" : "Nein"
    ].
        map(csvCell).
        join(";"));
    const blob = new Blob([[header.join(";"), ...lines].join("\n")], {
        type: "text/csv;charset=utf-8"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Versionsvergleich_${projectKey}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}
function exportComparePdf(rows, versions, projectKey, projectName, stats) {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const mx = 14;
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("Versionsvergleich / Angebotsanalyse", mx, 33);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Projekt: ${projectKey}${projectName ? " · " + projectName : ""}`, mx, 41);
    doc.text(`Datum: ${todayDE()}`, pageW - mx, 41, { align: "right" });
    doc.setDrawColor(203, 213, 225);
    doc.line(mx, 48, pageW - mx, 48);
    const kpis = [
        ["Positionen", String(stats.rows)],
        ["Preisabweichungen", String(stats.priceDiff)],
        ["Mengenabweichungen", String(stats.qtyDiff)],
        ["Einheitsabweichungen", String(stats.unitDiff)],
        ["Textabweichungen", String(stats.textDiff)],
        ["Versionen", String(versions.length)]
    ];
    const boxW = 42;
    const boxH = 18;
    const gap = 5;
    const y = 56;
    kpis.forEach(([label, value], i) => {
        const x = mx + i * (boxW + gap);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, y, boxW, boxH, 3, 3, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        doc.text(label, x + 3, y + 6);
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(value, x + 3, y + 14);
    });
    const body = rows.map((r) => {
        const a = r.cells[0];
        const b = r.cells[1];
        return [
            r.posNr || "—",
            r.kurztext || "—",
            a ? qty(a.menge) : "—",
            b ? qty(b.menge) : "—",
            a?.einheit || "—",
            b?.einheit || "—",
            a ? money(a.preis) : "—",
            b ? money(b.preis) : "—",
            [
                r.diffQty ? "Menge" : "",
                r.diffUnit ? "ME" : "",
                r.diffPrice ? "Preis" : "",
                r.diffText ? "Text" : ""
            ].
                filter(Boolean).
                join(", ") || "—"
        ];
    });
    autoTable(doc, {
        startY: 84,
        margin: { left: mx, right: mx },
        theme: "grid",
        head: [["PosNr", "Kurztext", "Menge V1", "Menge V2", "ME V1", "ME V2", "EP V1", "EP V2", "Abweichung"]],
        body,
        styles: {
            font: "helvetica",
            fontSize: 7.2,
            cellPadding: 1.8,
            lineColor: [226, 232, 240],
            lineWidth: 0.1,
            overflow: "linebreak",
            valign: "middle"
        },
        headStyles: {
            fillColor: [30, 64, 175],
            textColor: [255, 255, 255],
            fontStyle: "bold"
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        }
    });
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
        doc.setPage(i);
        doc.setDrawColor(226, 232, 240);
        doc.line(mx, pageH - 13, pageW - mx, pageH - 13);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text("RLC Bausoftware · Versionsvergleich", mx, pageH - 7);
        doc.text(`Seite ${i}/${pages}`, pageW - mx, pageH - 7, { align: "right" });
    }
    saveRlcPdfWithCompanyHeader(doc, `Versionsvergleich_${projectKey}.pdf`);
}
/* ================= COMPONENT ================= */
function VersionsvergleichCore() {
    const projectCtx = useProject();
    const project = getProject(projectCtx);
    const projectKey = getProjectKey(project);
    const projectName = getProjectName(project);
    const fileRef = useRef(null);
    const [versions, setVersions] = useState(() => loadVersions(projectKey));
    const [selected, setSelected] = useState({});
    const [query, setQuery] = useState("");
    const [info, setInfo] = useState("");
    const [viewMode, setViewMode] = useState("all");
    const [analysis, setAnalysis] = useState(() => loadAnalysisResult(projectKey));
    const [analysisBusy, setAnalysisBusy] = useState(false);
    useEffect(() => {
        setVersions(loadVersions(projectKey));
        setSelected({});
        setViewMode("all");
        setAnalysis(loadAnalysisResult(projectKey));
        setAnalysisBusy(false);
    }, [projectKey]);
    function persist(next) {
        setVersions(next);
        saveVersions(projectKey, next);
    }
    async function saveVersionsToServer() {
        try {
            setInfo("Speichere Versionsvergleich auf Server …");
            const res = await fetch(apiUrl(`/api/kalkulation/storage/versionsvergleich/${encodeURIComponent(projectKey || "NO_PROJECT")}/save`), {
                method: "POST",
                credentials: "include",
                headers: getVersionAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    data: {
                        versions,
                        selected,
                        viewMode,
                        savedAt: new Date().toISOString(),
                        projectKey,
                        projectName
                    }
                })
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || json?.ok === false) {
                setInfo(`Server-Speichern fehlgeschlagen: ${json?.error || res.status}`);
                return;
            }
            setInfo(`Versionsvergleich auf Server gespeichert · ${versions.length} Version(en).`);
        }
        catch (e) {
            setInfo(`Server-Speichern fehlgeschlagen: ${e?.message || "Unbekannter Fehler"}`);
        }
    }
    async function loadVersionsFromServer() {
        try {
            setInfo("Lade Versionsvergleich vom Server …");
            const res = await fetch(apiUrl(`/api/kalkulation/storage/versionsvergleich/${encodeURIComponent(projectKey || "NO_PROJECT")}`), {
                method: "GET",
                credentials: "include",
                headers: getVersionAuthHeaders()
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || json?.ok === false) {
                setInfo(`Server-Laden fehlgeschlagen: ${json?.error || res.status}`);
                return;
            }
            const serverVersions = extractServerVersions(json);
            if (!serverVersions.length) {
                setInfo("Keine Vergleichsversionen auf dem Server gefunden.");
                return;
            }
            const reconciledServerVersions = serverVersions.map((version) => ({
                ...version,
                rows: reconcileVersionPositions(cleanRows(Array.isArray(version.rows) ? version.rows : [], projectKey), projectKey)
            }));
            setVersions(reconciledServerVersions);
            setSelected(json?.data?.selected || {});
            setViewMode(json?.data?.viewMode || "all");
            setInfo(`Versionsvergleich vom Server geladen · ${serverVersions.length} Version(en). Lokaler Browser-Speicher wurde nicht überschrieben.`);
        }
        catch (e) {
            setInfo(`Server-Laden fehlgeschlagen: ${e?.message || "Unbekannter Fehler"}`);
        }
    }
    async function saveAnalysisToServer(resultOverride) {
        const current = resultOverride || analysis;
        if (!current) {
            setInfo("Keine Analyse vorhanden. Bitte zuerst Analyse starten.");
            return;
        }
        try {
            setInfo("Speichere Angebotsanalyse auf Server …");
            const res = await fetch(apiUrl(`/api/kalkulation/storage/angebotsanalyse/${encodeURIComponent(projectKey || "NO_PROJECT")}/save`), {
                method: "POST",
                credentials: "include",
                headers: getVersionAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    data: {
                        analysis: current,
                        selected,
                        selectedVersionIds: selectedVersions.map((v) => v.id),
                        savedAt: new Date().toISOString(),
                        projectKey,
                        projectName
                    }
                })
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || json?.ok === false) {
                setInfo(`Analyse-Server-Speichern fehlgeschlagen: ${json?.error || res.status}`);
                return;
            }
            setInfo("Angebotsanalyse auf Server gespeichert.");
        }
        catch (e) {
            setInfo(`Analyse-Server-Speichern fehlgeschlagen: ${e?.message || "Unbekannter Fehler"}`);
        }
    }
    async function loadAnalysisFromServer() {
        try {
            setInfo("Lade Angebotsanalyse vom Server …");
            const res = await fetch(apiUrl(`/api/kalkulation/storage/angebotsanalyse/${encodeURIComponent(projectKey || "NO_PROJECT")}`), {
                method: "GET",
                credentials: "include",
                headers: getVersionAuthHeaders()
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || json?.ok === false) {
                setInfo(`Analyse-Server-Laden fehlgeschlagen: ${json?.error || res.status}`);
                return;
            }
            const serverAnalysis = extractServerAnalysis(json);
            if (!serverAnalysis) {
                setInfo("Keine Angebotsanalyse auf dem Server gefunden.");
                return;
            }
            setAnalysis(serverAnalysis);
            saveAnalysisResult(projectKey, serverAnalysis);
            setInfo("Angebotsanalyse vom Server geladen.");
        }
        catch (e) {
            setInfo(`Analyse-Server-Laden fehlgeschlagen: ${e?.message || "Unbekannter Fehler"}`);
        }
    }
    function createSnapshot() {
        const loaded = loadCurrentVersionRows(projectKey);
        const lvRows = loaded.rows;
        if (!lvRows.length) {
            setInfo("Keine Kalkulations-/LV-Daten gefunden. Bitte zuerst LV importieren oder RLC-KI Kalkulation erstellen.");
            return;
        }
        const total = lvRows.reduce((sum, r) => sum + n(r.gesamt || n(r.menge) * n(r.preis)), 0);
        const version = {
            id: safeId(),
            name: `${loaded.sourceLabel} ${projectKey} · ${new Date().toLocaleString("de-DE")}`,
            createdAt: new Date().toISOString(),
            source: "LV",
            rows: lvRows
        };
        persist([version, ...versions]);
        setSelected({ [version.id]: true });
        setInfo(`Version gespeichert: ${loaded.sourceLabel} · ${lvRows.length} Positionen · ${money(total)} netto.`);
    }
    function importCsvFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            const rows = parseCsv(String(reader.result || ""), projectKey);
            if (!rows.length) {
                alert("CSV konnte nicht gelesen werden oder enthält keine gültigen Positionen.");
                return;
            }
            const version = {
                id: safeId(),
                name: file.name,
                createdAt: new Date().toISOString(),
                source: "CSV",
                rows
            };
            persist([version, ...versions]);
            setSelected((s) => ({ ...s, [version.id]: true }));
            setInfo(`CSV importiert: ${file.name} · ${rows.length} Positionen.`);
        };
        reader.readAsText(file, "utf-8");
    }
    function deleteVersion(id) {
        if (!confirm("Diese Version löschen?"))
            return;
        persist(versions.filter((v) => v.id !== id));
        setSelected((s) => {
            const copy = { ...s };
            delete copy[id];
            return copy;
        });
    }
    function clearAll() {
        if (!confirm("Alle gespeicherten Vergleichsversionen löschen?"))
            return;
        persist([]);
        setSelected({});
        setAnalysis(null);
        setAnalysisBusy(false);
        setInfo("Alle Vergleichsversionen und die gespeicherte Analyse wurden gelöscht.");
        try {
            localStorage.removeItem(analysisStoreKey(projectKey));
        }
        catch {
            //
        }
    }
    const selectedVersions = useMemo(() => versions.filter((v) => selected[v.id]), [versions, selected]);
    const compareRows = useMemo(() => selectedVersions.length >= 2 ? buildCompare(selectedVersions) : [], [selectedVersions]);
    const stats = useMemo(() => {
        const rows = compareRows;
        return {
            versions: versions.length,
            selected: selectedVersions.length,
            rows: selectedVersions.length === 1 ? selectedVersions[0]?.rows.length || 0 : rows.length,
            priceDiff: rows.filter((r) => r.diffPrice).length,
            qtyDiff: rows.filter((r) => r.diffQty).length,
            unitDiff: rows.filter((r) => r.diffUnit).length,
            textDiff: rows.filter((r) => r.diffText).length
        };
    }, [versions.length, selectedVersions, compareRows]);
    const filteredRows = useMemo(() => {
        const q = query.trim().toLowerCase();
        let rows = compareRows;
        if (viewMode === "price")
            rows = rows.filter((r) => r.diffPrice);
        if (viewMode === "qty")
            rows = rows.filter((r) => r.diffQty);
        if (viewMode === "unit")
            rows = rows.filter((r) => r.diffUnit);
        if (viewMode === "text")
            rows = rows.filter((r) => r.diffText);
        if (viewMode === "risk") {
            rows = rows.filter((r) => r.diffPrice ||
                r.diffQty ||
                r.cells.some((c) => !c || n(c.preis) <= 0 || n(c.menge) <= 0));
        }
        if (!q)
            return rows;
        return rows.filter((r) => [r.posNr, r.kurztext, ...r.cells.map((c) => c?.langtext || "")].
            join(" ").
            toLowerCase().
            includes(q));
    }, [compareRows, query, viewMode]);
    function runAnalysis() {
        setAnalysisBusy(true);
        setInfo("Analyse läuft…");
        window.setTimeout(() => {
            try {
                if (selectedVersions.length === 1) {
                    const result = analyseVersion(selectedVersions[0]);
                    setAnalysis(result);
                    saveAnalysisResult(projectKey, result);
                    void saveAnalysisToServer(result);
                    setInfo("Angebotsanalyse der ausgewählten Version erstellt und gespeichert.");
                    return;
                }
                if (selectedVersions.length >= 2) {
                    const result = analyseCompare(compareRows, selectedVersions);
                    setAnalysis(result);
                    saveAnalysisResult(projectKey, result);
                    void saveAnalysisToServer(result);
                    setInfo("Versionsvergleich der ausgewählten Versionen erstellt und gespeichert.");
                    return;
                }
                setInfo("Bitte zuerst eine Version für die Angebotsanalyse oder zwei Versionen für den Vergleich auswählen.");
            }
            finally {
                setAnalysisBusy(false);
            }
        }, 80);
    }
    function runRiskAnalysis() {
        setViewMode("risk");
        if (selectedVersions.length === 1) {
            const result = analyseVersion(selectedVersions[0]);
            setAnalysis({
                ...result,
                title: "Risikoanalyse abgeschlossen"
            });
            setInfo("Risikoanalyse der ausgewählten Version erstellt.");
            return;
        }
        if (selectedVersions.length >= 2) {
            const result = analyseCompare(compareRows, selectedVersions);
            setAnalysis({
                ...result,
                title: "Risikoanalyse Versionsvergleich abgeschlossen"
            });
            setInfo("Risikoanalyse für den Versionsvergleich erstellt.");
            return;
        }
        setInfo("Bitte zuerst eine oder zwei Versionen auswählen.");
    }
    function exportCurrentPdf() {
        if (selectedVersions.length < 2) {
            setInfo("PDF-Export benötigt mindestens zwei ausgewählte Versionen.");
            return;
        }
        exportComparePdf(filteredRows, selectedVersions, projectKey, projectName, stats);
    }
    useEffect(() => {
        function onVersionsCommand(event) {
            const detail = event.detail || {};
            const action = String(detail.action || "");
            const filter = String(detail.filter || "");
            if (action === "analyseCurrent" || action === "analyzeCurrent") {
                runAnalysis();
            }
            if (action === "compareSelected") {
                runAnalysis();
                setViewMode("all");
            }
            if (action === "showPriceDiffs" || filter === "price") {
                setViewMode("price");
                setInfo("Filter aktiv: Preisabweichungen.");
            }
            if (action === "showQtyDiffs" || filter === "qty") {
                setViewMode("qty");
                setInfo("Filter aktiv: Mengenabweichungen.");
            }
            if (action === "showUnitDiffs" || filter === "unit") {
                setViewMode("unit");
                setInfo("Filter aktiv: Einheitsabweichungen.");
            }
            if (action === "showTextDiffs" || filter === "text") {
                setViewMode("text");
                setInfo("Filter aktiv: Textabweichungen.");
            }
            if (action === "riskAnalysis") {
                runRiskAnalysis();
            }
            if (action === "exportPdf") {
                exportCurrentPdf();
            }
            if (action === "saveCurrentLv") {
                createSnapshot();
            }
            if (action === "importCsv") {
                fileRef.current?.click();
            }
        }
        window.addEventListener("rlc:versionsvergleich-command", onVersionsCommand);
        return () => {
            window.removeEventListener("rlc:versionsvergleich-command", onVersionsCommand);
        };
    }, [selectedVersions, compareRows, filteredRows, projectKey, projectName, stats]);
    return (_jsxs("div", { className: rlcClass(null, page), children: [_jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Angebotsanalyse" }), _jsx("h1", { className: rlcClass(null, title), children: "Versionsvergleich / Angebotsanalyse" }), _jsx("p", { className: rlcClass(null, subtitle), children: "Eine Version analysieren oder mehrere LV-/Angebotsversionen vergleichen: Preis-, Mengen-, Einheiten- und Textabweichungen werden sauber getrennt." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsx("button", { className: rlcClass(null, btnPrimary), onClick: createSnapshot, children: "Aktuelle Kalkulation als Version speichern" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => fileRef.current?.click(), children: "CSV-Version importieren" }), _jsx("button", { className: rlcClass(null, btnPrimary), disabled: !selectedVersions.length, onClick: runAnalysis, children: "Analyse starten" }), _jsx("button", { className: rlcClass(null, btnSecondary), disabled: !versions.length, onClick: saveVersionsToServer, children: "Server speichern" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: loadVersionsFromServer, children: "Server laden" }), _jsx("button", { className: rlcClass(null, btnSecondary), disabled: !analysis, onClick: () => saveAnalysisToServer(), children: "Analyse speichern" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: loadAnalysisFromServer, children: "Analyse laden" }), _jsx("button", { className: rlcClass(null, btnSecondary), disabled: selectedVersions.length < 2, onClick: () => exportCompareCsv(filteredRows, selectedVersions, projectKey), children: "CSV exportieren" }), _jsx("button", { className: rlcClass(null, btnSecondary), disabled: selectedVersions.length < 2, onClick: exportCurrentPdf, children: "PDF exportieren" }), _jsx("button", { className: rlcClass(null, btnDanger), onClick: clearAll, disabled: !versions.length, children: "Alles l\u00F6schen" }), _jsx("input", { ref: fileRef, type: "file", accept: ".csv", onChange: (e) => {
                                    const file = e.target.files?.[0];
                                    if (file)
                                        importCsvFile(file);
                                    if (fileRef.current)
                                        fileRef.current.value = "";
                                }, className: "rlc-migrated-pages-kalkulation-versionsvergleich-tsx-847" })] }), _jsxs("div", { className: rlcClass(null, heroMeta), children: ["Projekt: ", _jsx("b", { children: projectKey }), projectName ? _jsxs("span", { children: [" \u00B7 ", projectName] }) : null] })] }), info ? _jsx("div", { className: rlcClass(null, successBox), children: info }) : null, analysisBusy ? _jsx("div", { className: rlcClass(null, successBox), children: "Analyse l\u00E4uft\u2026 Bitte warten." }) : null, analysis ?
                _jsxs("section", { className: rlcClass(null, analysisBox), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: analysis.title }), _jsx("div", { className: rlcClass(null, sectionText), children: "KI-/Analyseprotokoll f\u00FCr diese Seite. Hier werden keine LV-Daten automatisch ver\u00E4ndert." })] }) }), analysis.changes.length ?
                            _jsx("div", { className: rlcClass(null, analysisList), children: analysis.changes.map((x, i) => _jsxs("div", { className: rlcClass(null, analysisOk), children: ["\u2713 ", x] }, `a-c-${i}`)) }) :
                            null, analysis.warnings.length ?
                            _jsx("div", { className: rlcClass(null, analysisList), children: analysis.warnings.map((x, i) => _jsxs("div", { className: rlcClass(null, analysisWarn), children: ["\u26A0\u00A0 ", x] }, `a-w-${i}`)) }) :
                            null, analysis.unchanged.length ?
                            _jsx("div", { className: rlcClass(null, analysisList), children: analysis.unchanged.map((x, i) => _jsxs("div", { className: rlcClass(null, analysisNeutral), children: ["\u2013 ", x] }, `a-u-${i}`)) }) :
                            null] }) :
                null, _jsxs("section", { className: rlcClass(null, grid4), children: [_jsx(Kpi, { label: "Versionen", value: String(stats.versions) }), _jsx(Kpi, { label: "Ausgew\u00E4hlt", value: String(stats.selected) }), _jsx(Kpi, { label: "Positionen", value: String(stats.rows) }), _jsx(Kpi, { label: "Preisabweichungen", value: String(stats.priceDiff), danger: stats.priceDiff > 0 }), _jsx(Kpi, { label: "Mengenabweichungen", value: String(stats.qtyDiff), danger: stats.qtyDiff > 0 }), _jsx(Kpi, { label: "Einheitsabweichungen", value: String(stats.unitDiff), danger: stats.unitDiff > 0 }), _jsx(Kpi, { label: "Textabweichungen", value: String(stats.textDiff), danger: stats.textDiff > 0 })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Gespeicherte Versionen" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Eine Version = Angebotsanalyse. Zwei oder mehr Versionen = Versionsvergleich." })] }) }), _jsxs("div", { className: rlcClass(null, versionGrid), children: [versions.map((v) => {
                                const active = !!selected[v.id];
                                return (_jsxs("label", { className: rlcClass(null, {
                                        ...versionItem,
                                        ...(active ? versionItemActive : {})
                                    }), children: [_jsx("input", { type: "checkbox", checked: active, onChange: (e) => setSelected((s) => ({ ...s, [v.id]: e.target.checked })) }), _jsxs("div", { className: "rlc-migrated-pages-kalkulation-versionsvergleich-tsx-848", children: [_jsx("div", { className: rlcClass(null, versionTitle), children: v.name }), _jsxs("div", { className: rlcClass(null, versionMeta), children: [v.source, " \u00B7 ", dateDE(v.createdAt), " \u00B7 ", v.rows.length, " Pos."] })] }), _jsx("button", { type: "button", className: rlcClass(null, btnMiniDanger), onClick: (e) => {
                                                e.preventDefault();
                                                deleteVersion(v.id);
                                            }, children: "L\u00F6schen" })] }, v.id));
                            }), !versions.length ?
                                _jsx("div", { className: rlcClass(null, emptyBox), children: "Noch keine Version gespeichert. Speichere zuerst die aktuelle Kalkulation oder importiere eine CSV-Version." }) :
                                null] })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Vergleichstabelle" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Rot markiert Abweichungen. Gr\u00FCn bedeutet gleiche Werte." })] }), _jsx("input", { className: rlcClass(null, searchInput), value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Suche PosNr / Text\u2026" })] }), _jsxs("div", { className: rlcClass(null, filterRow), children: [_jsx("button", { className: rlcClass(null, viewMode === "all" ? btnPrimary : btnSecondary), onClick: () => setViewMode("all"), children: "Alle" }), _jsx("button", { className: rlcClass(null, viewMode === "price" ? btnPrimary : btnSecondary), onClick: () => setViewMode("price"), children: "Preisabweichungen" }), _jsx("button", { className: rlcClass(null, viewMode === "qty" ? btnPrimary : btnSecondary), onClick: () => setViewMode("qty"), children: "Mengenabweichungen" }), _jsx("button", { className: rlcClass(null, viewMode === "unit" ? btnPrimary : btnSecondary), onClick: () => setViewMode("unit"), children: "Einheitsabweichungen" }), _jsx("button", { className: rlcClass(null, viewMode === "text" ? btnPrimary : btnSecondary), onClick: () => setViewMode("text"), children: "Textabweichungen" }), _jsx("button", { className: rlcClass(null, viewMode === "risk" ? btnPrimary : btnSecondary), onClick: runRiskAnalysis, children: "Risikoanalyse" })] }), selectedVersions.length < 2 ?
                        _jsx("div", { className: rlcClass(null, emptyBox), children: "F\u00FCr die Tabelle bitte mindestens zwei Versionen ausw\u00E4hlen. F\u00FCr eine einzelne Version nutze \u201EAnalyse starten\u201C." }) :
                        _jsx(CompareTable, { rows: filteredRows, versions: selectedVersions })] })] }));
}
function tabFromSearch(search) {
    const tab = new URLSearchParams(search).get("tab");
    if (tab === "pruefung")
        return "pruefung";
    if (tab === "ranking")
        return "ranking";
    return "vergleich";
}
export default function VersionsvergleichPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState(() => tabFromSearch(location.search));
    useEffect(() => {
        setActiveTab(tabFromSearch(location.search));
    }, [location.search]);
    function selectTab(tab) {
        setActiveTab(tab);
        const suffix = tab === "vergleich" ? "" : `?tab=${tab}`;
        navigate(`/kalkulation/versionsvergleich${suffix}`, { replace: true });
    }
    return (_jsxs("div", { className: rlcClass(null, moduleShell), children: [_jsxs("div", { className: rlcClass(null, moduleTabs), children: [_jsx("button", { type: "button", className: rlcClass(null, activeTab === "vergleich" ? moduleTabActive : moduleTab), onClick: () => selectTab("vergleich"), children: "Versionsvergleich" }), _jsx("button", { type: "button", className: rlcClass(null, activeTab === "pruefung" ? moduleTabActive : moduleTab), onClick: () => selectTab("pruefung"), children: "LV / Angebot pr\u00FCfen" }), _jsx("button", { type: "button", className: rlcClass(null, activeTab === "ranking" ? moduleTabActive : moduleTab), onClick: () => selectTab("ranking"), children: "Angebotsranking" })] }), activeTab === "vergleich" ? _jsx(VersionsvergleichCore, {}) : null, activeTab === "pruefung" ? _jsx(Widersprueche, { embedded: true }) : null, activeTab === "ranking" ? _jsx(BewertungAnalyse, { embedded: true }) : null] }));
}
/* ================= TABLE ================= */
function CompareTable({ rows, versions }) {
    return (_jsx("div", { className: rlcClass(null, tableWrap), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsxs("thead", { children: [_jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, thFixed), children: "PosNr" }), _jsx("th", { className: rlcClass(null, thText), children: "Kurztext" }), versions.map((v) => _jsx("th", { className: rlcClass(null, thGroup), colSpan: 4, children: v.name }, v.id))] }), _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, thFixed) }), _jsx("th", { className: rlcClass(null, thText) }), versions.map((v) => _jsxs(React.Fragment, { children: [_jsx("th", { className: rlcClass(null, thSmall), children: "Menge" }), _jsx("th", { className: rlcClass(null, thSmall), children: "ME" }), _jsx("th", { className: rlcClass(null, thSmall), children: "EP" }), _jsx("th", { className: rlcClass(null, thSmall), children: "Gesamt" })] }, `sub-${v.id}`))] })] }), _jsxs("tbody", { children: [rows.map((r, i) => _jsxs("tr", { className: rlcClass(null, { background: i % 2 ? "#FCFCFC" : "#FFFFFF" }), children: [_jsx("td", { className: rlcClass(null, tdStrong), children: r.posNr || "—" }), _jsx("td", { className: rlcClass(null, tdText), children: r.kurztext || "—" }), r.cells.map((c, idx) => _jsxs(React.Fragment, { children: [_jsx("td", { className: rlcClass(null, tdState(!r.diffQty)), children: c ? qty(c.menge) : "—" }), _jsx("td", { className: rlcClass(null, tdState(!r.diffUnit)), children: c?.einheit || "—" }), _jsx("td", { className: rlcClass(null, tdState(!r.diffPrice)), children: c ? money(c.preis) : "—" }), _jsx("td", { className: rlcClass(null, tdState(!r.diffPrice || !r.diffQty)), children: c ? money(c.gesamt) : "—" })] }, `${r.key}-${idx}`))] }, r.key)), !rows.length ?
                            _jsx("tr", { children: _jsx("td", { colSpan: 2 + versions.length * 4, className: rlcClass(null, emptyCell), children: "Keine Positionen gefunden." }) }) :
                            null] })] }) }));
}
/* ================= UI ================= */
function Kpi({ label, value, danger }) {
    return (_jsxs("div", { className: rlcClass(null, kpiCard), children: [_jsx("div", { className: rlcClass(null, kpiLabel), children: label }), _jsx("div", { className: rlcClass(null, { ...kpiValue, color: danger ? "#B91C1C" : "#0F172A" }), children: value })] }));
}
/* ================= STYLES ================= */
const moduleShell = {
    display: "grid",
    minWidth: 0
};
const moduleTabs = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    margin: "16px 16px 0",
    padding: 8,
    border: "1px solid #DCE5F0",
    borderRadius: 14,
    background: "#FFFFFF",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const moduleTab = {
    border: "1px solid transparent",
    borderRadius: 10,
    padding: "10px 14px",
    background: "transparent",
    color: "#334155",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer"
};
const moduleTabActive = {
    ...moduleTab,
    border: "1px solid #BED6FF",
    background: "#DBEAFE",
    color: "#123EA5"
};
const page = {
    display: "grid",
    gap: 16,
    padding: 16
};
const heroCard = {
    background: "linear-gradient(135deg, #0B5BD3 0%, #0B5BD3 48%, #146EF5 100%)",
    color: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
    display: "grid",
    gap: 14,
    boxShadow: "0 16px 40px rgba(15,23,42,0.18)"
};
const eyebrow = {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.8,
    fontWeight: 700
};
const title = {
    margin: "4px 0",
    fontSize: 30,
    fontWeight: 700
};
const subtitle = {
    margin: 0,
    maxWidth: 900,
    opacity: 0.88,
    lineHeight: 1.55
};
const heroActions = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
};
const heroMeta = {
    fontSize: 13,
    opacity: 0.9
};
const grid4 = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
    gap: 12
};
const card = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const sectionHead = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 12
};
const sectionTitle = {
    margin: 0,
    fontSize: 17,
    color: "#0F172A",
    fontWeight: 700
};
const sectionText = {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B"
};
const filterRow = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 12
};
const kpiCard = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16
};
const kpiLabel = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    textTransform: "uppercase"
};
const kpiValue = {
    marginTop: 6,
    fontSize: 22,
    fontWeight: 700
};
const searchInput = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 11px",
    fontSize: 13,
    width: 300
};
const btnBase = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 13px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap"
};
const btnPrimary = {
    ...btnBase,
    border: "1px solid #146EF5",
    background: "#146EF5",
    color: "#FFFFFF"
};
const btnSecondary = {
    ...btnBase,
    background: "#FFFFFF",
    color: "#0F172A"
};
const btnDanger = {
    ...btnBase,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C"
};
const btnMiniDanger = {
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 8,
    padding: "5px 8px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer"
};
const versionGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
    gap: 10
};
const versionItem = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 10,
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    background: "#FFFFFF"
};
const versionItemActive = {
    border: "1px solid #BED6FF",
    background: "#EAF2FF"
};
const versionTitle = {
    fontWeight: 700,
    fontSize: 13,
    color: "#0F172A",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
};
const versionMeta = {
    marginTop: 3,
    fontSize: 12,
    color: "#64748B"
};
const tableWrap = {
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    overflow: "auto",
    maxHeight: "72vh"
};
const table = {
    width: "100%",
    minWidth: 1250,
    borderCollapse: "collapse"
};
const thBase = {
    background: "#F8FAFC",
    color: "#475569",
    fontSize: 12,
    fontWeight: 700,
    padding: "9px",
    borderBottom: "1px solid #E5E7EB",
    textAlign: "left",
    whiteSpace: "nowrap"
};
const thFixed = {
    ...thBase,
    minWidth: 100
};
const thText = {
    ...thBase,
    minWidth: 300
};
const thGroup = {
    ...thBase,
    textAlign: "center",
    borderLeft: "1px solid #E5E7EB"
};
const thSmall = {
    ...thBase,
    textAlign: "right",
    minWidth: 95
};
const tdBase = {
    padding: "8px 9px",
    fontSize: 12,
    borderBottom: "1px solid #F1F5F9",
    verticalAlign: "middle"
};
const tdStrong = {
    ...tdBase,
    fontWeight: 700
};
const tdText = {
    ...tdBase,
    maxWidth: 420,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
};
function tdState(ok) {
    return {
        ...tdBase,
        textAlign: "right",
        whiteSpace: "nowrap",
        background: ok ? "#F0FDF4" : "#FEF2F2",
        color: ok ? "#166534" : "#B91C1C",
        fontWeight: ok ? 700 : 900
    };
}
const successBox = {
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#14532D",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 600
};
const analysisBox = {
    ...card,
    border: "1px solid #BED6FF",
    background: "#F8FAFC"
};
const analysisList = {
    display: "grid",
    gap: 6,
    marginTop: 8
};
const analysisOk = {
    fontSize: 13,
    color: "#166534",
    fontWeight: 700
};
const analysisWarn = {
    fontSize: 13,
    color: "#92400E",
    fontWeight: 700
};
const analysisNeutral = {
    fontSize: 13,
    color: "#64748B",
    fontWeight: 700
};
const emptyBox = {
    border: "1px dashed #CBD5E1",
    background: "#F8FAFC",
    borderRadius: 12,
    padding: 16,
    color: "#64748B",
    fontSize: 13
};
const emptyCell = {
    padding: 16,
    color: "#64748B",
    fontSize: 13
};
