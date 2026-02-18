// apps/server/src/middleware/license.ts
import type { Response, NextFunction } from "express";
import {
  hasActiveServerLicense,
  isAdminBypassEmail,
  touchLicenseSeen,
} from "../lib/license";

type Mode = "NUR_APP" | "SERVER_SYNC";

/**
 * Blocca le funzioni SERVER_SYNC finché non c'è una licenza attiva.
 * Bypass:
 * - DEV_AUTH=on
 * - ADMIN_BYPASS_EMAILS (es. rlcvermessung@gmail.com)
 */
export function requireServerLicense() {
  return (req: any, res: Response, next: NextFunction) => {
    // 🔓 DEV bypass totale
    if ((process.env.DEV_AUTH || "").toLowerCase() === "on") return next();

    const mode = String(req?.user?.mode || "NUR_APP") as Mode;

    // 👉 NUR_APP non richiede licenza
    if (mode !== "SERVER_SYNC") return next();

    const email = String(req?.user?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(403).json({
        ok: false,
        error: "LICENSE_REQUIRED_NO_EMAIL",
      });
    }

    // 🔓 Admin bypass (tu sempre sbloccato)
    if (isAdminBypassEmail(email)) return next();

    const lic = hasActiveServerLicense(email);
    if (!lic.ok) {
      return res.status(403).json({
        ok: false,
        error: "LICENSE_REQUIRED",
      });
    }

    // aggiorna last-seen (best effort)
    try {
      touchLicenseSeen(email);
    } catch {
      /* ignore */
    }

    // allega info licenza al request (opzionale)
    req.license = lic.payload;

    return next();
  };
}
