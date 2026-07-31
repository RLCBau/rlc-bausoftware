import * as FileSystem from "expo-file-system/legacy";
import { getAuthMode, getServerToken } from "./auth";
import { getApiUrl } from "./api";

export type MobilePdfDocumentType =
  | "REGIE"
  | "LIEFERSCHEIN"
  | "FOTOS"
  | "TAGESBERICHT"
  | "BAUTAGEBUCH"
  | "ANGEBOT"
  | "MENGENERMITTLUNG"
  | "ABSCHLAGSRECHNUNG"
  | "RECHNUNG"
  | "SCHLUSSRECHNUNG";

type RenderInput = {
  documentType: MobilePdfDocumentType;
  projectFsKey: string;
  fileName: string;
  payload: unknown;
};

type RenderResult = {
  pdfUri: string;
  fileName: string;
  date: string;
  source: "server";
};

function safePart(value: string) {
  return String(value || "PDF")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "") || "PDF";
}

async function ensureOutputPath(projectFsKey: string, fileName: string) {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!base) throw new Error("Kein lokales PDF-Verzeichnis verfügbar.");

  const dir = `${base}rlc_pdf_core/${safePart(projectFsKey)}/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }

  const normalizedName = safePart(fileName.replace(/\.pdf$/i, "")) + ".pdf";
  return { uri: `${dir}${normalizedName}`, fileName: normalizedName };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  if (typeof globalThis.btoa !== "function") {
    throw new Error("Base64-Konvertierung nicht verfügbar.");
  }
  return globalThis.btoa(binary);
}

async function enrichLocalAssets(value: unknown): Promise<unknown> {
  if (typeof value === "string" && /^file:\/\//i.test(value.trim())) {
    const localUri = value.trim();
    try {
      const info = await FileSystem.getInfoAsync(localUri);
      if (info.exists) {
        return {
          uri: localUri,
          path: localUri,
          name: localUri.split("/").pop() || "Foto",
          mimeType: /\.png$/i.test(localUri) ? "image/png" : "image/jpeg",
          contentBase64: await FileSystem.readAsStringAsync(localUri, {
            encoding: FileSystem.EncodingType.Base64,
          }),
        };
      }
    } catch (error) {
      console.warn("[PDF STRING ASSET BASE64]", localUri, error);
    }
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((entry) => enrichLocalAssets(entry)));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const source = value as Record<string, any>;
  const result: Record<string, any> = { ...source };

  const localUri = String(
    source.uri ||
    source.path ||
    source.filePath ||
    ""
  ).trim();

  const alreadyHasBase64 = Boolean(
    source.contentBase64 ||
    source.base64 ||
    source.dataBase64
  );

  if (
    !alreadyHasBase64 &&
    /^file:\/\//i.test(localUri)
  ) {
    try {
      const info = await FileSystem.getInfoAsync(localUri);

      if (info.exists) {
        result.contentBase64 = await FileSystem.readAsStringAsync(localUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        result.mimeType =
          source.mimeType ||
          source.type ||
          source.contentType ||
          (/\.png$/i.test(localUri) ? "image/png" : "image/jpeg");

        result.name =
          source.name ||
          source.fileName ||
          source.filename ||
          localUri.split("/").pop() ||
          "Foto";
      }
    } catch (error) {
      console.warn("[PDF ASSET BASE64]", localUri, error);
    }
  }

  for (const [key, nestedValue] of Object.entries(result)) {
    if (
      key === "contentBase64" ||
      key === "base64" ||
      key === "dataBase64"
    ) {
      continue;
    }

    if (nestedValue && typeof nestedValue === "object") {
      result[key] = await enrichLocalAssets(nestedValue);
    }
  }

  return result;
}
async function writeBase64Pdf(uri: string, base64: string) {
  const clean = String(base64 || "").replace(/^data:application\/pdf;base64,/i, "");
  if (!clean) throw new Error("Server hat kein PDF geliefert.");
  await FileSystem.writeAsStringAsync(uri, clean, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * Online-first: Server -> /api/pdf/mobile-render -> createRlcPdfDocument().
 * Gilt bewusst für SERVER_SYNC und NUR_APP. NUR_APP darf denselben zentralen
 * Renderer verwenden, sobald eine gültige Serversitzung und Verbindung
 * vorhanden sind. Nur bei echtem Offline-/Auth-Fehler übernimmt der lokale
 * spezialisierte Builder.
 */
export async function renderMobilePdfViaServer(input: RenderInput): Promise<RenderResult> {
  const mode = await getAuthMode();
  const token = String(await getServerToken()).trim();

  if (!token || token.startsWith("local:")) {
    throw new Error(
      "Keine gültige Serversitzung für den zentralen PDF-Renderer. Lokaler PDF-Core wird verwendet."
    );
  }

  console.log("[PDF SERVER AUTH]", {
    mode,
    tokenLength: token.length,
    tokenType: token.split(".").length === 3 ? "JWT" : "UNKNOWN",
  });

  const apiUrl = String(await getApiUrl()).replace(/\/$/, "");
  console.log("[PDF SERVER]", {
    apiUrl,
    tokenLength: token.length,
    tokenType: token.startsWith("local:") ? "LOCAL" : token.split(".").length === 3 ? "JWT" : "UNKNOWN",
  });
  const target = await ensureOutputPath(input.projectFsKey, input.fileName);
  const preparedPayload = await enrichLocalAssets(input.payload);

  console.log("[PDF ASSETS PREPARED]");

  const response = await fetch(`${apiUrl}/api/pdf/mobile-render`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/pdf, application/json",
      "Content-Type": "application/json; charset=utf-8",
      "X-RLC-App-Mode": mode,
    },
    body: JSON.stringify({
      documentType: input.documentType,
      projectFsKey: input.projectFsKey,
      fileName: target.fileName,
      payload: preparedPayload,
    }),
  });

  console.log("[PDF SERVER RESPONSE]", response.status, response.url);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `PDF Server HTTP ${response.status}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/pdf")) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeBase64Pdf(target.uri, bytesToBase64(bytes));
  } else {
    const json: any = await response.json();
    const base64 = json?.pdfBase64 || json?.base64 || json?.data;
    if (base64) {
      await writeBase64Pdf(target.uri, base64);
    } else if (json?.pdfUrl || json?.url) {
      const remoteUrl = String(json.pdfUrl || json.url);
      const absoluteUrl = /^https?:\/\//i.test(remoteUrl)
        ? remoteUrl
        : `${apiUrl}/${remoteUrl.replace(/^\//, "")}`;
      await FileSystem.downloadAsync(absoluteUrl, target.uri, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } else {
      throw new Error(json?.error || "Serverantwort enthält kein PDF.");
    }
  }

  const resultInfo = await FileSystem.getInfoAsync(target.uri);
  if (!resultInfo.exists) throw new Error("Server-PDF wurde nicht gespeichert.");

  return {
    pdfUri: target.uri,
    fileName: target.fileName,
    date: new Date().toISOString().slice(0, 10),
    source: "server",
  };
}

