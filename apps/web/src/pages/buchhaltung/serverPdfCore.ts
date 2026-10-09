
import {
  openPdfBlobPreview,
  reservePdfPreview
} from "../../lib/pdf/companyPdfHeader";

function apiBase() {
  return String(
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    "https://api.rlcbausoftware.com"
  ).replace(/\/$/, "");
}

function authToken() {
  const keys = [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc_auth_token"
  ];

  for (const storage of [localStorage, sessionStorage]) {
    for (const key of keys) {
      const value = storage.getItem(key);

      if (value && value.trim()) {
        return value.trim();
      }
    }
  }

  return "";
}

export async function renderRlcServerPdf(options: {
  documentType: string;
  projectId: string;
  fileName: string;
  payload: any;
  mode?: "preview" | "download";
}) {
  const mode = options.mode || "preview";

  const preview =
    mode === "preview"
      ? reservePdfPreview(options.fileName)
      : null;

  try {
    const token = authToken();

    const response = await fetch(
      `${apiBase()}/api/pdf/mobile-render`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token
            ? { Authorization: `Bearer ${token}` }
            : {})
        },
        body: JSON.stringify({
          documentType: options.documentType,
          projectFsKey: options.projectId,
          projectId: options.projectId,
          fileName: options.fileName,
          payload: options.payload
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        text || `PDF HTTP ${response.status}`
      );
    }

    const core =
      response.headers.get("X-RLC-PDF-Core");

    if (core !== "server") {
      console.warn(
        "PDF wurde nicht vom Server-Core bestätigt:",
        core
      );
    }

    const blob = await response.blob();

    if (mode === "preview") {
      openPdfBlobPreview(
        blob,
        options.fileName,
        preview
      );
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = options.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  } catch (error) {
    try {
      preview?.close();
    } catch {}

    throw error;
  }
}


export async function renderRlcMahnPdf(options: {
  projectId: string;
  invoiceId: string;
  dunningLevel: number;
  fileName: string;
}) {
  const preview = reservePdfPreview(options.fileName);

  try {
    const token = authToken();
    const response = await fetch(`${apiBase()}/api/pdf/mahnung`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(options)
    });

    if (!response.ok) {
      throw new Error((await response.text()) || `PDF HTTP ${response.status}`);
    }

    openPdfBlobPreview(await response.blob(), options.fileName, preview);
  } catch (error) {
    try { preview?.close(); } catch {}
    throw error;
  }
}
