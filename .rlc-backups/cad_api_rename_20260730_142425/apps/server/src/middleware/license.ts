// apps/server/src/middleware/license.ts
import type { Response, NextFunction } from "express";
import {
  hasActiveServerLicense,
  isAdminBypassEmail,
  touchLicenseSeen,
} from "../lib/license";

type Mode = "NUR_APP" | "SERVER_SYNC";

function isRlcLocalDevReadOnlyBypass(req: any): boolean {
  const origin = String(req.headers?.origin || "");
  const isLocalDevOrigin =
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:");

  if (!isLocalDevOrigin) return false;
  if (req.method !== "GET") return false;

  const url = String(req.originalUrl || req.url || "");
  return (
    url === "/api/projects" ||
    url.startsWith("/api/projects?") ||
    /^\/api\/projects\/[^/]+\/lv(?:\?|$)/.test(url)
  );
}

// RLC_DEV_LICENSE_LOCALHOST_BYPASS_V3

/**
 * Blocca le funzioni SERVER_SYNC finché non c'è una licenza attiva.
 * Bypass:
 * - DEV_AUTH=on
 * - ADMIN_BYPASS_EMAILS (es. rlcvermessung@gmail.com)
 */
export function requireServerLicense() {
  return (req: any, res: Response, next: NextFunction) => {
      if (isRlcLocalDevReadOnlyBypass(req)) {
        req.license = { mode: "LOCAL_DEV", tier: "DEV", email: "dev@rlc.local" } as any;
        return next();
      }
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
