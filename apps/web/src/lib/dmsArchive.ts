import {
  listDocuments,
  initDocument,
  uploadFileDirect
} from "../api/files";


function webFileKind(file: File): "PDF" | "CAD" | "IMAGE" | "OTHER" {
  const name = String(file.name || "").toLowerCase();
  const mime = String(file.type || "").toLowerCase();

  if (name.endsWith(".pdf") || mime.includes("pdf")) return "PDF";
  if (name.endsWith(".dxf") || name.endsWith(".dwg")) return "CAD";
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(name)) {
    return "IMAGE";
  }
  return "OTHER";
}

export async function archiveWebFile(
  projectId: string,
  fileName: string,
  blob: Blob
): Promise<{ documentId: string; versioned: boolean } | null> {
  const pid = String(projectId || "").trim();
  const name = String(fileName || "").trim();

  if (!pid || !name || !blob) {
    console.warn("[Web:DMS] Projekt-ID, Dateiname oder Datei fehlt.");
    return null;
  }

  const file = new File(
    [blob],
    name,
    { type: blob.type || "application/octet-stream" }
  );

  const documents: any[] = await listDocuments(pid);
  const normalizedName = name.toLowerCase();

  const existing = (Array.isArray(documents) ? documents : []).find(
    (doc: any) =>
      !doc?.deletedAt &&
      String(doc?.name || "").trim().toLowerCase() === normalizedName
  );

  let documentId = String(existing?.id || "").trim();
  const versioned = Boolean(documentId);

  if (!documentId) {
    const created = await initDocument(pid, webFileKind(file) as any, name);
    documentId = String(created?.documentId || "").trim();

    if (!documentId) {
      throw new Error("Dokumenten-ID wurde nicht erzeugt.");
    }
  }

  await uploadFileDirect(documentId, file);

  console.log("[Web:DMS]", {
    projectId: pid,
    documentId,
    fileName: name,
    versioned
  });

  return { documentId, versioned };
}

export async function archiveWebPdf(
  projectId: string,
  fileName: string,
  blob: Blob
): Promise<{ documentId: string; versioned: boolean } | null> {
  const pid = String(projectId || "").trim();
  const name = String(fileName || "").trim();

  if (!pid || !name || !blob) {
    console.warn("[Web:DMS] Projekt-ID, Dateiname oder PDF fehlt.");
    return null;
  }

  const documents: any[] = await listDocuments(pid);

  const normalizedName = name.toLowerCase();

  const existing = (Array.isArray(documents) ? documents : []).find(
    (doc: any) =>
      !doc?.deletedAt &&
      String(doc?.name || "").trim().toLowerCase() === normalizedName
  );

  let documentId = String(existing?.id || "").trim();
  let versioned = Boolean(documentId);

  if (!documentId) {
    const created = await initDocument(
      pid,
      "PDF" as any,
      name
    );

    documentId = String(created?.documentId || "").trim();

    if (!documentId) {
      throw new Error("Dokumenten-ID wurde nicht erzeugt.");
    }

    versioned = false;
  }

  const file = new File(
    [blob],
    name,
    { type: "application/pdf" }
  );

  await uploadFileDirect(documentId, file);

  console.log("[Web:DMS]", {
    projectId: pid,
    documentId,
    fileName: name,
    versioned
  });

  return {
    documentId,
    versioned
  };
}

export async function archiveWebPdfFromUrl(
  projectId: string,
  fileName: string,
  url: string
) {
  const response = await fetch(url, {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(
      `PDF konnte nicht für das DMS geladen werden (${response.status}).`
    );
  }

  const sourceBlob = await response.blob();

  const blob =
    sourceBlob.type === "application/pdf"
      ? sourceBlob
      : new Blob([sourceBlob], { type: "application/pdf" });

  return archiveWebPdf(
    projectId,
    fileName,
    blob
  );
}
