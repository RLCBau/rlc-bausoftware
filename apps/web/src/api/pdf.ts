const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function download(resp: Response, name: string) {
  if (!resp.ok) {
    // prova a leggere il testo errore dal server
    const txt = await resp.text().catch(() => "");
    throw new Error(`PDF export failed (${resp.status}). ${txt}`);
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// 🔹 Regiebericht als fertiges PDF zum Server schicken
export async function exportRegieberichtPdf(args: {
  projectId: string;
  fileName: string;
  pdfBase64: string; // NUR der Base64-Teil, ohne "data:application/pdf;base64,"
}) {
  const res = await fetch("/api/regie/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function exportNachtragPdf(payload: any) {
  console.log("[WEB] POST /pdf/nachtrag", payload);
  const r = await fetch(`${API_BASE}/pdf/nachtrag`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await download(r, `Nachtraege_${payload?.projekt?.projektId ?? "Projekt"}.pdf`);
}

export async function exportLieferscheinPdf(payload: any) {
  console.log("[WEB] POST /pdf/lieferschein", payload);
  const r = await fetch(`${API_BASE}/pdf/lieferschein`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await download(r, `Lieferschein_${payload?.ls?.nr ?? "LS"}.pdf`);
}
