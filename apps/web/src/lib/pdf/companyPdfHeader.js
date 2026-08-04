import { apiUrl } from "../apiBase";
let cachedCompany = null;
let pendingCompany = null;
function getToken() {
    try {
        return (localStorage.getItem("rlc_token") ||
            JSON.parse(localStorage.getItem("rlc_auth") || "{}")?.token ||
            "");
    }
    catch {
        return "";
    }
}
function authHeaders() {
    const token = getToken();
    return {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}
async function blobToPngDataUrl(blob) {
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, image.naturalWidth || image.width);
                canvas.height = Math.max(1, image.naturalHeight || image.height);
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    URL.revokeObjectURL(objectUrl);
                    resolve(null);
                    return;
                }
                ctx.drawImage(image, 0, 0);
                const dataUrl = canvas.toDataURL("image/png");
                URL.revokeObjectURL(objectUrl);
                resolve(dataUrl);
            }
            catch {
                URL.revokeObjectURL(objectUrl);
                resolve(null);
            }
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(null);
        };
        image.src = objectUrl;
    });
}
export async function loadCompanyPdfData(force = false) {
    if (!force && cachedCompany)
        return cachedCompany;
    if (!force && pendingCompany)
        return pendingCompany;
    pendingCompany = (async () => {
        try {
            const headerResponse = await fetch(apiUrl("/api/company/header"), {
                method: "GET",
                credentials: "include",
                headers: authHeaders(),
            });
            if (!headerResponse.ok) {
                throw new Error(`Firmendaten HTTP ${headerResponse.status}`);
            }
            const payload = await headerResponse.json();
            const company = payload?.company;
            if (!company)
                return null;
            let logoDataUrl = null;
            if (company.logoPath || company.logoUrl) {
                const logoResponse = await fetch(apiUrl("/api/company/logo"), {
                    method: "GET",
                    credentials: "include",
                    headers: authHeaders(),
                });
                if (logoResponse.ok) {
                    logoDataUrl = await blobToPngDataUrl(await logoResponse.blob());
                }
            }
            cachedCompany = {
                id: String(company.id || ""),
                code: String(company.code || ""),
                name: String(company.name || ""),
                address: String(company.address || ""),
                phone: String(company.phone || ""),
                email: String(company.email || ""),
                logoDataUrl,
            };
            return cachedCompany;
        }
        catch (error) {
            console.error("Firmendaten für PDF konnten nicht geladen werden:", error);
            return null;
        }
        finally {
            pendingCompany = null;
        }
    })();
    return pendingCompany;
}
export function clearCompanyPdfCache() {
    cachedCompany = null;
    pendingCompany = null;
}
export function drawCompanyPdfHeader(doc, company, options) {
    const top = options?.top ?? 8;
    const left = options?.left ?? 14;
    const right = options?.right ?? 14;
    const height = options?.height ?? 22;
    const showCode = options?.showCode ?? true;
    const drawLine = options?.drawLine ?? true;
    const pageWidth = doc.internal.pageSize.getWidth();
    const textRight = pageWidth - right;
    if (!company) {
        return top + height;
    }
    if (company.logoDataUrl) {
        try {
            const maxWidth = 34;
            const maxHeight = 16;
            doc.addImage(company.logoDataUrl, "PNG", left, top, maxWidth, maxHeight, undefined, "FAST");
        }
        catch (error) {
            console.warn("Firmenlogo konnte nicht in PDF eingefügt werden:", error);
        }
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(company.name || "Firma", textRight, top + 4, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const lines = [
        company.address,
        [company.phone, company.email]
            .filter(Boolean)
            .join(" · "),
        showCode && company.code
            ? `Firmencode: ${company.code}`
            : "",
    ].filter(Boolean);
    lines.forEach((line, index) => {
        doc.text(line, textRight, top + 9 + index * 4, { align: "right" });
    });
    if (drawLine) {
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.25);
        doc.line(left, top + height, pageWidth - right, top + height);
    }
    return top + height + 5;
}
export async function addCompanyPdfHeader(doc, options) {
    const company = await loadCompanyPdfData();
    const contentStartY = drawCompanyPdfHeader(doc, company, options);
    return {
        company,
        contentStartY,
    };
}
const preparedDocuments = new WeakSet();
/**
 * Disegna l'intestazione aziendale su tutte le pagine già create.
 * È il punto centrale obbligatorio per ogni PDF RLC.
 */
export async function applyCompanyPdfHeaderToAllPages(doc) {
    if (preparedDocuments.has(doc))
        return;
    const company = await loadCompanyPdfData();
    const currentPage = Number(doc.getCurrentPageInfo?.()?.pageNumber || doc.getNumberOfPages());
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        const pageWidth = doc.internal.pageSize.getWidth();
        const unitScale = pageWidth > 400 ? 2.834645669 : 1;
        const left = 8 * unitScale;
        const right = 8 * unitScale;
        const top = 3 * unitScale;
        const headerHeight = 13 * unitScale;
        const pageHeight = doc.internal.pageSize.getHeight();
        const footerY = pageHeight - 6 * unitScale;
        if (company) {
            // Fondo uniforme: l'intestazione resta leggibile anche su PDF costruiti da canvas.
            doc.setFillColor(255, 255, 255);
            doc.rect(0, 0, pageWidth, headerHeight + 3 * unitScale, "F");
            if (company.logoDataUrl) {
                try {
                    doc.addImage(company.logoDataUrl, "PNG", left, top, 25 * unitScale, 10 * unitScale, undefined, "FAST");
                }
                catch (error) {
                    console.warn("Firmenlogo konnte nicht in PDF eingefügt werden:", error);
                }
            }
            const textRight = pageWidth - right;
            doc.setTextColor(15, 23, 42);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8.5 * unitScale);
            doc.text(company.name || "Firma", textRight, top + 3.5 * unitScale, {
                align: "right",
            });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.2 * unitScale);
            doc.setTextColor(71, 85, 105);
            const contact = [company.phone, company.email].filter(Boolean).join(" · ");
            const lines = [company.address, contact].filter(Boolean);
            lines.forEach((line, index) => {
                doc.text(line, textRight, top + (7 + index * 3.2) * unitScale, {
                    align: "right",
                });
            });
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.2 * unitScale);
            doc.line(left, headerHeight + 2 * unitScale, pageWidth - right, headerHeight + 2 * unitScale);
        }
        // Piè di pagina identico in tutti i moduli Web.
        doc.setFillColor(255, 255, 255);
        doc.rect(0, pageHeight - 10 * unitScale, pageWidth, 10 * unitScale, "F");
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.2 * unitScale);
        doc.line(left, pageHeight - 9 * unitScale, pageWidth - right, pageHeight - 9 * unitScale);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.2 * unitScale);
        doc.setTextColor(100, 116, 139);
        doc.text(company?.name || "RLC Bausoftware", left, footerY);
        doc.text(`Seite ${page}/${pageCount}`, pageWidth - right, footerY, { align: "right" });
    }
    doc.setPage(Math.min(currentPage, pageCount));
    preparedDocuments.add(doc);
}
export function savePdfWithCompanyHeader(doc, fileName) {
    const preview = reservePdfPreview(fileName);
    void applyCompanyPdfHeaderToAllPages(doc)
        .then(() => openPdfBlobPreview(doc.output("blob"), fileName, preview))
        .catch((error) => {
        console.error("PDF-Firmenkopf konnte nicht erzeugt werden:", error);
        openPdfBlobPreview(doc.output("blob"), fileName, preview);
    });
}
export async function outputPdfBlobWithCompanyHeader(doc) {
    await applyCompanyPdfHeaderToAllPages(doc);
    return doc.output("blob");
}
function safeFileName(fileName) {
    const cleaned = String(fileName || "RLC-Dokument.pdf")
        .replace(/[\\/:*?"<>|]+/g, "_")
        .trim();
    return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}
function addPreviewMessage(target, fileName) {
    const doc = target.document;
    doc.title = `PDF wird vorbereitet – ${fileName}`;
    doc.body.replaceChildren();
    doc.body.style.cssText =
        "margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f6fb;color:#0f172a;font:700 16px Inter,system-ui,sans-serif";
    const message = doc.createElement("div");
    message.textContent = "PDF wird vorbereitet …";
    doc.body.appendChild(message);
}
/** Reserviert das Vorschaufenster synchron im Klick-Handler (verhindert Popup-Blocker). */
export function reservePdfPreview(fileName) {
    if (typeof window === "undefined")
        return null;
    const target = window.open("", "_blank");
    if (target) {
        addPreviewMessage(target, safeFileName(fileName));
    }
    return target;
}
function forcePdfDownload(blob, fileName) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = safeFileName(fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
}
/**
 * Anteprima PDF Web uniforme. Il download avviene solo premendo "Herunterladen".
 * Funziona sia con PDF jsPDF locali sia con Blob PDF ricevuti dal server.
 */
export function openPdfBlobPreview(blob, fileName, reservedWindow) {
    const normalizedName = safeFileName(fileName);
    const target = reservedWindow && !reservedWindow.closed
        ? reservedWindow
        : reservePdfPreview(normalizedName);
    if (!target) {
        // Fallback esplicito quando il browser blocca la nuova scheda.
        forcePdfDownload(blob, normalizedName);
        return;
    }
    const objectUrl = URL.createObjectURL(blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" }));
    const doc = target.document;
    doc.title = normalizedName;
    doc.head.replaceChildren();
    doc.body.replaceChildren();
    const meta = doc.createElement("meta");
    meta.name = "viewport";
    meta.content = "width=device-width,initial-scale=1";
    doc.head.appendChild(meta);
    const style = doc.createElement("style");
    style.textContent = `
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0}
    body{display:grid;grid-template-rows:auto 1fr;background:#e9eef5;color:#0f172a;font:600 14px Inter,system-ui,sans-serif}
    header{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;border-bottom:1px solid #dbe4f0;box-shadow:0 5px 18px rgba(15,23,42,.08);z-index:2}
    strong{min-width:0;margin-right:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px}
    button,a{min-height:40px;padding:9px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#0f172a;font:800 14px Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer}
    .primary{border-color:#0b5978;background:#0b5978;color:#fff}
    iframe{width:100%;height:100%;border:0;background:#fff}
    @media(max-width:680px){header{flex-wrap:wrap;padding:8px}strong{flex-basis:100%}button,a{flex:1;padding:8px;font-size:13px}}
  `;
    doc.head.appendChild(style);
    const toolbar = doc.createElement("header");
    const title = doc.createElement("strong");
    title.textContent = normalizedName;
    toolbar.appendChild(title);
    const download = doc.createElement("a");
    download.className = "primary";
    download.href = objectUrl;
    download.download = normalizedName;
    download.textContent = "Herunterladen";
    toolbar.appendChild(download);
    const print = doc.createElement("button");
    print.type = "button";
    print.textContent = "Drucken";
    toolbar.appendChild(print);
    const raw = doc.createElement("a");
    raw.href = objectUrl;
    raw.target = "_blank";
    raw.rel = "noopener";
    raw.textContent = "PDF öffnen";
    toolbar.appendChild(raw);
    const close = doc.createElement("button");
    close.type = "button";
    close.textContent = "Schließen";
    close.addEventListener("click", () => target.close());
    toolbar.appendChild(close);
    const frame = doc.createElement("iframe");
    frame.src = objectUrl;
    frame.title = normalizedName;
    print.addEventListener("click", () => frame.contentWindow?.print());
    doc.body.append(toolbar, frame);
    target.addEventListener("beforeunload", () => URL.revokeObjectURL(objectUrl), { once: true });
    target.focus();
}
