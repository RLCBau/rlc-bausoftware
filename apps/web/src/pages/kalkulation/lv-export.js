import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
import { savePdfWithCompanyHeader as saveRlcPdfWithCompanyHeader } from "../../lib/pdf/companyPdfHeader";
// apps/web/src/pages/kalkulation/lvOhnePreis.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { LV } from "./store.lv";
import { useProject } from "../../store/useProject";
const API = import.meta?.env?.VITE_API_URL ||
    import.meta?.env?.VITE_BACKEND_URL ||
    "";
function apiUrl(path) {
    const cleanApi = String(API || "").replace(/\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return cleanApi ? `${cleanApi}${cleanPath}` : cleanPath;
}
function getAuthToken() {
    try {
        const keys = [
            "token",
            "authToken",
            "accessToken",
            "rlc_token",
            "rlc_auth_token",
            "rlc_access_token"
        ];
        for (const key of keys) {
            const value = localStorage.getItem(key);
            if (value?.trim())
                return value.trim();
        }
        const jsonKeys = ["auth", "user", "session", "rlc_auth", "rlc_session"];
        for (const key of jsonKeys) {
            const raw = localStorage.getItem(key);
            if (!raw)
                continue;
            try {
                const parsed = JSON.parse(raw);
                const token = parsed?.token ??
                    parsed?.accessToken ??
                    parsed?.authToken ??
                    parsed?.jwt ??
                    parsed?.data?.token ??
                    parsed?.data?.accessToken;
                if (typeof token === "string" && token.trim())
                    return token.trim();
            }
            catch {
                //
            }
        }
    }
    catch {
        //
    }
    return "";
}
function authHeaders(extra) {
    const token = getAuthToken();
    return {
        ...(extra || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}
function getCurrentProject(projectCtx) {
    return (projectCtx?.project ||
        projectCtx?.currentProject ||
        projectCtx?.selectedProject ||
        projectCtx?.current ||
        projectCtx ||
        null);
}
function getProjectKey(projectCtx) {
    const p = getCurrentProject(projectCtx);
    return String(p?.code ||
        p?.projectCode ||
        p?.number ||
        p?.projektnummer ||
        p?.id ||
        "").
        trim().
        toUpperCase();
}
function getProjectName(projectCtx) {
    const p = getCurrentProject(projectCtx);
    return String(p?.name || p?.projectName || p?.projektname || "").trim();
}
function getProjectClient(projectCtx) {
    const p = getCurrentProject(projectCtx);
    return String(p?.client || p?.auftraggeber || p?.kunde || "").trim();
}
function getProjectPlace(projectCtx) {
    const p = getCurrentProject(projectCtx);
    return String(p?.place || p?.ort || p?.location || "").trim();
}
function csvEscape(value) {
    const s = String(value ?? "");
    if (s.includes('"') || s.includes(";") || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}
function n(value) {
    const x = typeof value === "number" ?
        value :
        Number(String(value ?? "").replace(",", ".").trim());
    return Number.isFinite(x) ? x : 0;
}
function fmtNumber(value, digits = 3) {
    return new Intl.NumberFormat("de-DE", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(n(value));
}
function safeFileName(value) {
    return String(value || "Projekt").
        replace(/[^\w.-]+/g, "_").
        replace(/_+/g, "_").
        slice(0, 120);
}
function todayDE() {
    return new Date().toLocaleDateString("de-DE");
}
function cleanRows(rows) {
    return rows.
        filter((r) => {
        const pos = String(r.posNr || "").trim();
        const text = String(r.kurztext || r.langtext || "").trim();
        const unit = String(r.einheit || "").trim();
        const qty = n(r.menge);
        if (!pos && !text && !unit && qty === 0)
            return false;
        if (pos.toUpperCase().startsWith("BA-"))
            return false;
        return true;
    }).
        map((r) => ({
        ...r,
        posNr: String(r.posNr || "").trim(),
        kurztext: String(r.kurztext || "").trim(),
        langtext: String(r.langtext || "").trim(),
        bemerkung: String(r.bemerkung || "").trim(),
        einheit: String(r.einheit || "").trim(),
        menge: n(r.menge),
        preis: 0,
        gesamt: 0
    }));
}
function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}
function downloadCsv(rows, projectKey) {
    const header = [
        "Position",
        "ParentPosition",
        "Kurztext",
        "Langtext",
        "Bemerkung",
        "ME",
        "Menge",
        "EP_Manuell"
    ];
    const body = rows.map((r) => [
        csvEscape(r.posNr),
        csvEscape(r.parentPosNr || ""),
        csvEscape(r.kurztext),
        csvEscape(r.langtext || ""),
        csvEscape(r.bemerkung || ""),
        csvEscape(r.einheit),
        csvEscape(fmtNumber(r.menge)),
        ""
    ].
        join(";"));
    const csv = [header.join(";"), ...body].join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `LV_ohne_Preise_${safeFileName(projectKey)}.csv`);
}
function xmlEscape(value) {
    return String(value ?? "").
        replace(/&/g, "&amp;").
        replace(/</g, "&lt;").
        replace(/>/g, "&gt;").
        replace(/"/g, "&quot;");
}
function buildGaebXml(rows, projectKey, projectName, mode) {
    const phase = mode.toUpperCase();
    const positions = rows.
        map((r, i) => {
        const pos = xmlEscape(r.posNr || String(i + 1).padStart(3, "0"));
        const short = xmlEscape(r.kurztext || "Position ohne Kurztext");
        const long = xmlEscape(r.langtext || r.bemerkung || "");
        const unit = xmlEscape(r.einheit || "m");
        const qty = String(n(r.menge)).replace(",", ".");
        return `
      <Item ID="${pos}">
        <ItemNo>${pos}</ItemNo>
        <Qty>${qty}</Qty>
        <QU>${unit}</QU>
        <UP>0</UP>
        <IT>0</IT>
        <Description>
          <CompleteText>
            <DetailTxt>
              <Text>${long || short}</Text>
            </DetailTxt>
            <OutlineText>
              <OutlTxt>${short}</OutlTxt>
            </OutlineText>
          </CompleteText>
        </Description>
      </Item>`;
    }).
        join("");
    return `<?xml version="1.0" encoding="UTF-8"?>
<GAEB DA="${phase}">
  <PrjInfo>
    <NamePrj>${xmlEscape(projectName || projectKey || "Projekt")}</NamePrj>
    <PrjNo>${xmlEscape(projectKey)}</PrjNo>
  </PrjInfo>
  <Award>
    <BoQ>
      <BoQInfo>
        <Name>${xmlEscape(projectName || "Leistungsverzeichnis ohne Preise")}</Name>
      </BoQInfo>
      <BoQBody>${positions}
      </BoQBody>
    </BoQ>
  </Award>
</GAEB>`;
}
async function exportGaebViaServer(rows, projectKey, projectName, mode) {
    const payload = {
        project: {
            code: projectKey,
            number: projectKey,
            name: projectName
        },
        rows: rows.map((r) => ({
            id: r.id,
            posNr: r.posNr,
            parentPosNr: r.parentPosNr || "",
            kurztext: r.kurztext || "",
            langtext: r.langtext || "",
            bemerkung: r.bemerkung || "",
            einheit: r.einheit || "",
            menge: n(r.menge),
            preis: 0,
            ep: 0,
            gesamt: 0,
            total: 0,
            waehrung: "EUR"
        })),
        options: {
            withoutPrices: true,
            mode
        }
    };
    try {
        const res = await fetch(apiUrl("/api/gaeb/export"), {
            method: "POST",
            credentials: "include",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                format: mode.toUpperCase(),
                ...payload
            })
        });
        if (!res.ok) {
            throw new Error(`GAEB Server Export fehlgeschlagen (${res.status})`);
        }
        const blob = await res.blob();
        downloadBlob(blob, `LV_ohne_Preise_${safeFileName(projectKey)}.${mode}`);
    }
    catch {
        const xml = buildGaebXml(rows, projectKey, projectName, mode);
        downloadBlob(new Blob([xml], { type: "application/xml;charset=utf-8" }), `LV_ohne_Preise_${safeFileName(projectKey)}.${mode}`);
    }
}
function exportPdf(rows, projectKey, projectName, client, place) {
    const doc = new jsPDF({
        unit: "mm",
        format: "a4",
        orientation: "portrait"
    });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 12;
    doc.setDrawColor(218, 226, 236);
    doc.setLineWidth(0.25);
    doc.rect(8, 8, pageW - 16, pageH - 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42);
    doc.text("Leistungsverzeichnis ohne Preise", marginX, 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Projekt: ${projectKey || "—"}${projectName ? ` · ${projectName}` : ""}`, marginX, 38);
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    if (client) {
        doc.text(`Auftraggeber: ${client}`, marginX, 47);
    }
    if (place) {
        doc.text(`Ort / Baustelle: ${place}`, marginX, client ? 54 : 47);
    }
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`Datum: ${todayDE()}`, pageW - marginX, 38, { align: "right" });
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text("Export ohne Einheitspreise und Gesamtpreise", pageW - marginX, 48, {
        align: "right"
    });
    doc.text("Spalte „EP / Preis“ ist für handschriftliche Preise vorgesehen.", pageW - marginX, 55, {
        align: "right"
    });
    autoTable(doc, {
        startY: place || client ? 66 : 60,
        margin: { left: marginX, right: marginX },
        theme: "grid",
        head: [["Pos.", "Leistungsbeschreibung", "ME", "Menge", "EP / Preis"]],
        body: rows.map((r) => [
            r.posNr || "—",
            [
                r.kurztext || "—",
                r.langtext ? `\n${r.langtext}` : "",
                r.bemerkung ? `\nBemerkung: ${r.bemerkung}` : ""
            ].
                filter(Boolean).
                join(""),
            r.einheit || "—",
            fmtNumber(r.menge),
            ""
        ]),
        styles: {
            font: "helvetica",
            fontSize: 7.8,
            cellPadding: 2.1,
            overflow: "linebreak",
            lineColor: [215, 224, 235],
            lineWidth: 0.12,
            minCellHeight: 9.5,
            textColor: [15, 23, 42]
        },
        headStyles: {
            fillColor: [239, 246, 255],
            textColor: [30, 58, 138],
            fontStyle: "bold",
            minCellHeight: 10
        },
        alternateRowStyles: {
            fillColor: [250, 252, 255]
        },
        columnStyles: {
            0: { cellWidth: 24 },
            1: { cellWidth: 94 },
            2: { cellWidth: 16, halign: "center" },
            3: { cellWidth: 24, halign: "right" },
            4: { cellWidth: 34, halign: "left" }
        },
        didDrawPage: () => {
            doc.setDrawColor(218, 226, 236);
            doc.setLineWidth(0.25);
            doc.rect(8, 8, pageW - 16, pageH - 16);
        }
    });
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`RLC Bausoftware · LV ohne Preise · Seite ${i}/${pages}`, marginX, 292);
    }
    saveRlcPdfWithCompanyHeader(doc, `LV_ohne_Preise_${safeFileName(projectKey)}.pdf`);
}
export default function LVOhnePreis() {
    const navigate = useNavigate();
    const projectCtx = useProject();
    const projectKey = getProjectKey(projectCtx);
    const projectName = getProjectName(projectCtx);
    const projectClient = getProjectClient(projectCtx);
    const projectPlace = getProjectPlace(projectCtx);
    const [rows, setRows] = useState(() => cleanRows(LV.list()));
    const [query, setQuery] = useState("");
    const [format, setFormat] = useState("pdf");
    const [status, setStatus] = useState("");
    useEffect(() => {
        const refresh = () => setRows(cleanRows(LV.list()));
        refresh();
        window.addEventListener("focus", refresh);
        window.addEventListener("storage", refresh);
        return () => {
            window.removeEventListener("focus", refresh);
            window.removeEventListener("storage", refresh);
        };
    }, []);
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q)
            return rows;
        return rows.filter((r) => {
            const hay = `${r.posNr || ""} ${r.kurztext || ""} ${r.langtext || ""} ${r.einheit || ""}`.
                toLowerCase();
            return hay.includes(q);
        });
    }, [rows, query]);
    const totals = useMemo(() => {
        const positions = rows.length;
        const withQty = rows.filter((r) => n(r.menge) > 0).length;
        const withShortText = rows.filter((r) => String(r.kurztext || "").trim()).length;
        const withLongText = rows.filter((r) => String(r.langtext || "").trim()).length;
        const withoutText = rows.filter((r) => !String(r.kurztext || r.langtext || "").trim()).length;
        return { positions, withQty, withShortText, withLongText, withoutText };
    }, [rows]);
    async function exportNow() {
        if (!filtered.length) {
            alert("Keine Positionen zum Exportieren vorhanden.");
            return;
        }
        setStatus("Export wird erstellt…");
        try {
            if (format === "csv") {
                downloadCsv(filtered, projectKey);
            }
            if (format === "pdf") {
                exportPdf(filtered, projectKey, projectName, projectClient, projectPlace);
            }
            if (format === "gaeb-x83") {
                await exportGaebViaServer(filtered, projectKey, projectName, "x83");
            }
            if (format === "gaeb-x84") {
                await exportGaebViaServer(filtered, projectKey, projectName, "x84");
            }
            setStatus("Export erfolgreich erstellt.");
            setTimeout(() => setStatus(""), 2500);
        }
        catch (e) {
            setStatus("");
            alert(`Export fehlgeschlagen: ${e?.message || e}`);
        }
    }
    return (_jsxs("div", { className: rlcClass(null, page), children: [_jsxs("section", { className: rlcClass("rlc-page-hero", heroCard), children: [_jsxs("div", { children: [_jsx("div", { className: rlcClass(null, eyebrow), children: "RLC Ausschreibung / LV" }), _jsx("h1", { className: rlcClass(null, title), children: "LV ohne Preise exportieren" }), _jsx("p", { className: rlcClass(null, subtitle), children: "Erstellt ein professionelles Leistungsverzeichnis ohne Einheitspreise und Gesamtpreise. Im PDF wird zus\u00E4tzlich eine leere Preisspalte f\u00FCr handschriftliche Eintragungen ausgegeben." })] }), _jsxs("div", { className: rlcClass(null, heroActions), children: [_jsxs("select", { className: rlcClass(null, select), value: format, onChange: (e) => setFormat(e.target.value), children: [_jsx("option", { value: "pdf", children: "PDF ohne Preise + Preisspalte" }), _jsx("option", { value: "csv", children: "CSV ohne Preise" }), _jsx("option", { value: "gaeb-x83", children: "GAEB X83 ohne Preise" }), _jsx("option", { value: "gaeb-x84", children: "GAEB X84 ohne Preise" })] }), _jsx("button", { className: rlcClass(null, btnPrimary), onClick: exportNow, disabled: !filtered.length, children: "Export erstellen" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => navigate("/kalkulation/lv-import"), children: "\u21E2 LV bearbeiten" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => navigate("/kalkulation/gaeb"), children: "\u21E2 GAEB Modul" }), _jsx("button", { className: rlcClass(null, btnSecondary), onClick: () => navigate("/kalkulation/angebot"), children: "\u21E2 Angebot" })] }), _jsxs("div", { className: rlcClass(null, heroMeta), children: ["Projekt: ", _jsx("b", { children: projectKey || "—" }), projectName ? _jsxs("span", { children: [" \u00B7 ", projectName] }) : null, status ? _jsxs("span", { children: [" \u00B7 ", status] }) : null] })] }), _jsxs("section", { className: rlcClass(null, grid4), children: [_jsx(Kpi, { label: "Positionen gesamt", value: String(totals.positions) }), _jsx(Kpi, { label: "Mit Menge", value: String(totals.withQty) }), _jsx(Kpi, { label: "Mit Kurztext", value: String(totals.withShortText) }), _jsx(Kpi, { label: "Ohne Text", value: String(totals.withoutText), danger: totals.withoutText > 0 })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsxs("div", { className: rlcClass(null, sectionHead), children: [_jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Export-Einstellungen" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Preise werden nicht exportiert. Im PDF bleibt rechts eine freie Spalte \u201EEP / Preis\u201C zum manuellen Ausf\u00FCllen." })] }), _jsx("input", { className: rlcClass(null, searchInput), value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Suche PosNr / Text / ME\u2026" })] }), _jsxs("div", { className: rlcClass(null, infoGrid), children: [_jsx(Info, { label: "Format", value: format.toUpperCase() }), _jsx(Info, { label: "Exportiert", value: `${filtered.length} von ${rows.length}` }), _jsx(Info, { label: "Langtexte", value: String(totals.withLongText) }), _jsx(Info, { label: "Auftraggeber", value: projectClient || "—" })] })] }), _jsxs("section", { className: rlcClass(null, card), children: [_jsx("div", { className: rlcClass(null, sectionHead), children: _jsxs("div", { children: [_jsx("h2", { className: rlcClass(null, sectionTitle), children: "Export-Vorschau" }), _jsx("div", { className: rlcClass(null, sectionText), children: "Vorschau des LV ohne Preise. Die PDF-Ausgabe enth\u00E4lt zus\u00E4tzlich eine leere Preisspalte." })] }) }), _jsx("div", { className: rlcClass(null, tableWrap), children: _jsxs("table", { className: rlcClass(null, table), children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: rlcClass(null, th), children: "Pos." }), _jsx("th", { className: rlcClass(null, th), children: "Kurztext" }), _jsx("th", { className: rlcClass(null, th), children: "Langtext" }), _jsx("th", { className: rlcClass(null, th), children: "ME" }), _jsx("th", { className: rlcClass(null, thRight), children: "Menge" }), _jsx("th", { className: rlcClass(null, th), children: "EP / Preis" })] }) }), _jsxs("tbody", { children: [filtered.map((r, i) => _jsxs("tr", { className: rlcClass(null, { background: i % 2 ? "#FCFCFC" : "#FFFFFF" }), children: [_jsx("td", { className: rlcClass(null, tdStrong), children: r.posNr || "—" }), _jsx("td", { className: rlcClass(null, td), children: r.kurztext || "—" }), _jsx("td", { className: rlcClass(null, tdMuted), children: r.langtext ? String(r.langtext).slice(0, 220) : "—" }), _jsx("td", { className: rlcClass(null, td), children: r.einheit || "—" }), _jsx("td", { className: rlcClass(null, tdRight), children: fmtNumber(r.menge) }), _jsx("td", { className: rlcClass(null, tdMuted), children: "leer f\u00FCr Handschrift" })] }, r.id || `${r.posNr}-${i}`)), !filtered.length ?
                                            _jsx("tr", { children: _jsx("td", { colSpan: 6, className: rlcClass(null, { ...td, color: "#64748B" }), children: "Kein LV vorhanden oder kein Treffer im Filter." }) }) :
                                            null] })] }) })] })] }));
}
function Kpi({ label, value, danger }) {
    return (_jsxs("div", { className: rlcClass(null, kpiCard), children: [_jsx("div", { className: rlcClass(null, kpiLabel), children: label }), _jsx("div", { className: rlcClass(null, { ...kpiValue, color: danger ? "#B91C1C" : "#0F172A" }), children: value })] }));
}
function Info({ label, value }) {
    return (_jsxs("div", { className: rlcClass(null, infoBox), children: [_jsx("div", { className: rlcClass(null, infoLabel), children: label }), _jsx("div", { className: rlcClass(null, infoValue), children: value })] }));
}
/* ================= STYLES ================= */
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
    maxWidth: 920,
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
    gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
    gap: 12
};
const kpiCard = {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
};
const kpiLabel = {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em"
};
const kpiValue = {
    marginTop: 6,
    fontSize: 22,
    fontWeight: 700
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
    color: "#64748B",
    lineHeight: 1.45
};
const searchInput = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 11px",
    fontSize: 13,
    width: 280,
    boxSizing: "border-box"
};
const select = {
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    padding: "9px 13px",
    fontSize: 13,
    fontWeight: 700,
    background: "#FFFFFF",
    color: "#0F172A"
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
const infoGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
    gap: 10
};
const infoBox = {
    border: "1px solid #E5E7EB",
    background: "#F8FAFC",
    borderRadius: 12,
    padding: 12
};
const infoLabel = {
    fontSize: 11,
    color: "#64748B",
    fontWeight: 700,
    textTransform: "uppercase"
};
const infoValue = {
    marginTop: 4,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: 700
};
const tableWrap = {
    overflowX: "auto",
    border: "1px solid #E5E7EB",
    borderRadius: 12
};
const table = {
    width: "100%",
    minWidth: 1080,
    borderCollapse: "collapse"
};
const th = {
    textAlign: "left",
    padding: "10px 9px",
    fontSize: 12,
    color: "#475569",
    background: "#F8FAFC",
    borderBottom: "1px solid #E5E7EB",
    whiteSpace: "nowrap",
    fontWeight: 700
};
const thRight = {
    ...th,
    textAlign: "right"
};
const td = {
    padding: "8px 9px",
    fontSize: 12,
    borderBottom: "1px solid #F1F5F9",
    verticalAlign: "middle"
};
const tdStrong = {
    ...td,
    fontWeight: 700,
    whiteSpace: "nowrap"
};
const tdRight = {
    ...td,
    textAlign: "right",
    whiteSpace: "nowrap"
};
const tdMuted = {
    ...td,
    color: "#64748B",
    maxWidth: 420,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
};
