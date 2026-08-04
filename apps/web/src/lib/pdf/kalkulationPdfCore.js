import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { outputPdfBlobWithCompanyHeader } from "./companyPdfHeader";
function numberValue(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }
    const normalized = String(value ?? "")
        .trim()
        .replace(/\s/g, "")
        .replace(/\./g, "")
        .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}
function euro(value) {
    return `${numberValue(value).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} €`;
}
function quantity(value) {
    return numberValue(value).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 3,
    });
}
function text(value) {
    return String(value ?? "").trim();
}
function unitPrice(row) {
    return (numberValue(row?.finalUnitPrice) ||
        numberValue(row?.preis) ||
        numberValue(row?.rlcKiUnitPrice) ||
        numberValue(row?.suggestedUnitPrice) ||
        numberValue(row?.angebotUnitPrice) ||
        numberValue(row?.x84UnitPrice));
}
function rowTotal(row) {
    return (numberValue(row?.gesamt) ||
        numberValue(row?.rlcKiTotal) ||
        numberValue(row?.angebotTotal) ||
        numberValue(row?.menge) * unitPrice(row));
}
function breakdownText(row) {
    const lines = Array.isArray(row?.priceBreakdown)
        ? row.priceBreakdown
        : Array.isArray(row?.recipeLines)
            ? row.recipeLines
            : [];
    return lines
        .map((line) => {
        const label = text(line?.group) ||
            text(line?.name) ||
            text(line?.bezeichnung) ||
            "Kosten";
        const total = numberValue(line?.total) ||
            numberValue(line?.gesamt) ||
            numberValue(line?.qty) * numberValue(line?.price);
        return `${label}: ${euro(total)}`;
    })
        .filter(Boolean)
        .join("\n");
}
export async function buildKalkulationPdfCoreBlob(input) {
    const rows = Array.isArray(input.rows) ? input.rows : [];
    const summary = input.summary || {};
    const offer = input.offer || {};
    const client = input.client || {};
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 14;
    const contentWidth = pageWidth - marginX * 2;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(16);
    doc.text("KI-Kalkulation / Angebot", marginX, 35);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const projectLine = [
        `Projekt: ${text(input.projectKey) || "—"}`,
        text(input.projectTitle),
    ]
        .filter(Boolean)
        .join(" · ");
    doc.text(projectLine, marginX, 42);
    const infoRows = [
        ["Angebot", text(offer.number) || "—"],
        ["Kunde", text(client.name) || "—"],
        ["Ort", text(offer.place) || "—"],
        ["Datum", new Date().toLocaleDateString("de-DE")],
    ];
    autoTable(doc, {
        startY: 47,
        margin: { left: marginX, right: marginX },
        tableWidth: contentWidth,
        theme: "plain",
        styles: {
            font: "helvetica",
            fontSize: 8,
            cellPadding: 1.5,
            textColor: [51, 65, 85],
        },
        columnStyles: {
            0: { fontStyle: "bold", cellWidth: 22 },
            1: { cellWidth: 68 },
            2: { fontStyle: "bold", cellWidth: 22 },
            3: { cellWidth: 68 },
        },
        body: [
            [...infoRows[0], ...infoRows[1]],
            [...infoRows[2], ...infoRows[3]],
        ],
    });
    const netto = numberValue(summary.netto) ||
        numberValue(summary.totalNet) ||
        numberValue(summary.summeNetto) ||
        rows.reduce((sum, row) => sum + rowTotal(row), 0);
    const taxRate = numberValue(input.mwst || summary.mwstRate || 19);
    const mwst = numberValue(summary.mwst) ||
        numberValue(summary.tax) ||
        netto * (taxRate / 100);
    const brutto = numberValue(summary.brutto) ||
        numberValue(summary.totalGross) ||
        netto + mwst;
    const summaryY = doc.lastAutoTable?.finalY + 5 || 63;
    autoTable(doc, {
        startY: summaryY,
        margin: { left: marginX, right: marginX },
        tableWidth: contentWidth,
        theme: "grid",
        styles: {
            font: "helvetica",
            fontSize: 8,
            cellPadding: 2,
            lineColor: [214, 223, 235],
            lineWidth: 0.2,
        },
        headStyles: {
            fillColor: [30, 78, 170],
            textColor: [255, 255, 255],
            fontStyle: "bold",
        },
        head: [["Netto", `MwSt ${taxRate}%`, "Brutto"]],
        body: [[euro(netto), euro(mwst), euro(brutto)]],
    });
    const tableY = doc.lastAutoTable?.finalY + 6 || 82;
    autoTable(doc, {
        startY: tableY,
        margin: {
            left: marginX,
            right: marginX,
            top: 28,
            bottom: 20,
        },
        tableWidth: contentWidth,
        theme: "grid",
        showHead: "everyPage",
        pageBreak: "auto",
        rowPageBreak: "avoid",
        styles: {
            font: "helvetica",
            fontSize: 6.8,
            cellPadding: 1.5,
            valign: "top",
            overflow: "linebreak",
            lineColor: [210, 219, 231],
            lineWidth: 0.15,
            textColor: [30, 41, 59],
        },
        headStyles: {
            fillColor: [30, 78, 170],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 7,
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252],
        },
        columnStyles: {
            0: { cellWidth: 18 },
            1: { cellWidth: 82 },
            2: { cellWidth: 13 },
            3: { cellWidth: 18, halign: "right" },
            4: { cellWidth: 23, halign: "right" },
            5: { cellWidth: 25, halign: "right" },
        },
        head: [[
                "Pos.",
                "Leistungsbeschreibung / Preisaufbau",
                "ME",
                "Menge",
                "EP",
                "Gesamt",
            ]],
        body: rows.map((row) => {
            const description = [
                text(row?.kurztext) || text(row?.text) || text(row?.title),
                text(row?.langtext),
                breakdownText(row)
                    ? `Preisaufbau:\n${breakdownText(row)}`
                    : "",
                text(row?.aiReason)
                    ? `KI-Begründung: ${text(row.aiReason)}`
                    : "",
                text(row?.warning)
                    ? `Prüfhinweis: ${text(row.warning)}`
                    : "",
            ]
                .filter(Boolean)
                .join("\n\n");
            return [
                text(row?.posNr) || text(row?.lvPos) || "—",
                description || "—",
                text(row?.einheit) || text(row?.unit) || "—",
                quantity(row?.menge),
                euro(unitPrice(row)),
                euro(rowTotal(row)),
            ];
        }),
        didDrawPage: () => {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(100, 116, 139);
            doc.text(`Projekt ${text(input.projectKey)}`, marginX, doc.internal.pageSize.getHeight() - 9);
        },
    });
    return outputPdfBlobWithCompanyHeader(doc);
}
