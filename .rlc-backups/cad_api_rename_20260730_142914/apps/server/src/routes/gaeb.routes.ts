// apps/server/src/routes/gaeb.routes.ts
import express, { type Request, type Response } from "express";
import multer from "multer";
import iconv from "iconv-lite";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Riconosce/decodifica il buffer GAEB provando alcune codifiche tipiche
 * (UTF-16 LE, Latin1, Win1252) e restituisce testo + encoding usato.
 */
function detectAndDecode(
  buf: Buffer
): { encoding: string; text: string } {
  const decodings: [string, string][] = [
    ["utf16-le", iconv.decode(buf, "utf16-le") as string],
    ["latin1", iconv.decode(buf, "latin1") as string],
    ["win1252", iconv.decode(buf, "win1252") as string],
  ];

  // Scegliamo il primo risultato non vuoto, altrimenti il primo in lista
  const best =
    decodings.find(([, txt]) => txt && txt.trim().length > 0) ??
    decodings[0];

  const [encoding, text] = best;
  return { encoding, text };
}

/**
 * POST /api/gaeb/import
 * Body: file GAEB (campo "file" nel FormData)
 *
 * Per ora:
 *  - decodifica il file
 *  - restituisce una preview delle prime 500 righe
 * In futuro qui si potrà fare il parsing vero e proprio.
 */
router.post(
  "/import",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file as Express.Multer.File | undefined;

      if (!file) {
        return res.status(400).json({
          ok: false,
          error: "Keine Datei hochgeladen (Feldname: 'file')",
        });
      }

      const buf = file.buffer;

      const { encoding, text } = detectAndDecode(buf);

      const lines = text.split(/\r?\n/);
      const preview = lines.slice(0, 500);

      return res.json({
        ok: true,
        encoding,
        lineCount: lines.length,
        preview,
      });
    } catch (e: any) {
      console.error("GAEB-Import Fehler:", e);
      return res.status(500).json({
        ok: false,
        error: e?.message || "Fehler beim GAEB-Import",
      });
    }
  }
);

/**
 * GET /api/gaeb/export
 * Placeholder per l’export GAEB – da implementare in seguito.
 */
router.get("/export", (req: Request, res: Response) => {
  return res.status(501).json({
    ok: false,
    error: "GAEB-Export noch nicht implementiert",
  });
});

export default router;
