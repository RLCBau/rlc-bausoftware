import { API_BASE } from "../lib/apiBase";
// apps/web/src/api/pdf.ts
function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return API_BASE ? `${API_BASE}${p}` : p;
}
async function readTextSafe(resp) {
    return resp.text().catch(() => "");
}
async function readJsonSafe(resp) {
    return resp.json().catch(() => null);
}
function safeFilePart(value, fallback) {
    const s = String(value ?? fallback).trim();
    return s.replace(/[\\/:*?"<>|]+/g, "_") || fallback;
}
async function download(resp, name) {
    if (!resp.ok) {
        const txt = await readTextSafe(resp);
        throw new Error(`PDF export failed (${resp.status}). ${txt}`);
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
    finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
/* ---------------- REGIEBERICHT PDF zum Server schicken ---------------- */
export async function exportRegieberichtPdf(args) {
    const res = await fetch(apiUrl("/api/regie/export-pdf"), {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(args),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
        throw new Error(data?.error ||
            (await readTextSafe(res)) ||
            "Regiebericht-Export fehlgeschlagen");
    }
    if (data?.ok === false) {
        throw new Error(data?.error || "Regiebericht-Export fehlgeschlagen");
    }
    return data;
}
/* ---------------- NACHTRAG PDF ---------------- */
export async function exportNachtragPdf(payload) {
    console.log("[WEB] POST /pdf/nachtrag", payload);
    const r = await fetch(apiUrl("/pdf/nachtrag"), {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/pdf",
        },
        body: JSON.stringify(payload),
    });
    const projectPart = safeFilePart(payload?.projekt?.projektId ||
        payload?.projekt?.code ||
        payload?.projekt?.name, "Projekt");
    await download(r, `Nachtraege_${projectPart}.pdf`);
}
/* ---------------- LIEFERSCHEIN PDF ---------------- */
export async function exportLieferscheinPdf(payload) {
    console.log("[WEB] POST /pdf/lieferschein", payload);
    const r = await fetch(apiUrl("/pdf/lieferschein"), {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/pdf",
        },
        body: JSON.stringify(payload),
    });
    const lsPart = safeFilePart(payload?.ls?.nr || payload?.ls?.id, "LS");
    await download(r, `Lieferschein_${lsPart}.pdf`);
}
