import path from "path";
import type { Request } from "express";
import multer from "multer";

const ACTIVE_CONTENT_MIME_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/javascript",
  "text/javascript",
  "application/x-javascript",
  "application/ecmascript",
]);

const ACTIVE_CONTENT_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".xhtml",
  ".svg",
  ".js",
  ".mjs",
  ".cjs",
]);

export function activeContentUploadError(filename: string, contentType: string): string | null {
  const ext = path.extname(String(filename || "").trim()).toLowerCase();
  const mime = String(contentType || "").split(";", 1)[0].trim().toLowerCase();

  if (ACTIVE_CONTENT_EXTENSIONS.has(ext) || ACTIVE_CONTENT_MIME_TYPES.has(mime)) {
    return "Aktive HTML/SVG/JavaScript-Dateien sind nicht zulässig.";
  }

  return null;
}

export function rejectActiveContentUpload(
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile?: boolean) => void
) {
  const error = activeContentUploadError(file.originalname, file.mimetype);
  if (error) return cb(new Error(error), false);
  return cb(null, true);
}

/**
 * Validates common binary upload formats after Multer receives the bytes.
 * Unknown formats are intentionally not certified by this check.
 */
export function validateUploadSignature(filename: string, mimeType: string, data: Buffer): string | null {
  const extension = path.extname(String(filename || "")).toLowerCase();
  const mime = String(mimeType || "").split(";", 1)[0].trim().toLowerCase();
  const starts = (bytes: number[]) => bytes.every((value, index) => data[index] === value);
  const ascii = (value: string) => data.subarray(0, value.length).toString("ascii") === value;
  const pdf = ascii("%PDF-");
  const png = starts([137, 80, 78, 71, 13, 10, 26, 10]);
  const jpg = starts([255, 216, 255]);
  const webp = data.length >= 12 && ascii("RIFF") && data.subarray(8, 12).toString("ascii") === "WEBP";
  const gif = ascii("GIF87a") || ascii("GIF89a");
  const zip = starts([0x50, 0x4b, 0x03, 0x04]) || starts([0x50, 0x4b, 0x05, 0x06]);
  const sevenZip = starts([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
  const signatureByExtension: Record<string, boolean> = {
    ".pdf": pdf, ".png": png, ".jpg": jpg, ".jpeg": jpg,
    ".webp": webp, ".gif": gif, ".zip": zip, ".7z": sevenZip,
  };
  if (Object.prototype.hasOwnProperty.call(signatureByExtension, extension) && !signatureByExtension[extension]) {
    return "Dateiinhalt stimmt nicht mit dem Dateiformat überein.";
  }
  const signatureByMime: Record<string, boolean> = {
    "application/pdf": pdf, "image/png": png, "image/jpeg": jpg,
    "image/webp": webp, "image/gif": gif, "application/zip": zip,
    "application/x-7z-compressed": sevenZip,
  };
  if (Object.prototype.hasOwnProperty.call(signatureByMime, mime) && !signatureByMime[mime]) {
    return "Dateiinhalt stimmt nicht mit dem angegebenen MIME-Typ überein.";
  }
  return null;
}

/** Memory-only upload storage that rejects mismatched common file signatures. */
export function signatureCheckedMemoryStorage(): ReturnType<typeof multer.memoryStorage> {
  const memory = multer.memoryStorage();
  const handleFile = memory._handleFile.bind(memory);
  memory._handleFile = (req: Request, file: Express.Multer.File, cb: (error?: any, info?: any) => void) => {
    handleFile(req, file, (error: any, info: any) => {
      if (error) return cb(error);
      const buffer = (info as { buffer?: Buffer } | undefined)?.buffer;
      if (!buffer) return cb(new Error("UPLOAD_BUFFER_MISSING"));
      const violation = validateUploadSignature(file.originalname, file.mimetype, buffer);
      if (violation) return cb(new Error(violation));
      cb(null, info);
    });
  };
  return memory;
}

/** Validates disk uploads before route handlers can use them. */
export function signatureCheckedDiskStorage(storage: ReturnType<typeof multer.diskStorage>): ReturnType<typeof multer.diskStorage> {
  const handleFile = storage._handleFile.bind(storage);
  storage._handleFile = (req: Request, file: Express.Multer.File, cb: (error?: any, info?: any) => void) => {
    handleFile(req, file, (error: any, info: any) => {
      if (error) return cb(error);
      const filePath = String(info?.path || "");
      if (!filePath) return cb(new Error("UPLOAD_PATH_MISSING"));
      try {
        const fs = require("fs") as typeof import("fs");
        const fd = fs.openSync(filePath, "r");
        const header = Buffer.alloc(32);
        let length = 0;
        try { length = fs.readSync(fd, header, 0, 32, 0); }
        finally { fs.closeSync(fd); }
        const violation = validateUploadSignature(file.originalname, file.mimetype, header.subarray(0, length));
        if (violation) {
          fs.unlinkSync(filePath);
          return cb(new Error(violation));
        }
        cb(null, info);
      } catch (validationError: any) {
        try { (require("fs") as typeof import("fs")).unlinkSync(filePath); } catch {}
        cb(validationError);
      }
    });
  };
  return storage;
}
