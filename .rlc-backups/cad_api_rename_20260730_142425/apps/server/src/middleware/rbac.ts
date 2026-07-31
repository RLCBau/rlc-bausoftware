// apps/server/src/middleware/rbac.ts
import type { Request, Response, NextFunction } from "express";

const ALLOW: Record<string, string[]> = {
  ADMIN: ["*"],
  BAULEITER: ["project:*","lv:*","aufmass:*","cad:*","docs:*","reports:*","buchhaltung:read"],
  CAPOCANTIERE: ["project:read","aufmass:*","reports:*","docs:read"],
  MITARBEITER: ["project:read","aufmass:write","reports:write","docs:read"],
  KALKULATOR: ["project:read","lv:*","angebote:*","docs:read"],
  BUCHHALTUNG: ["project:read","buchhaltung:*","datev:export","ust:report","mahnwesen:*"],
  GAST: ["project:read"]
};

function can(role: string, action: string) {
  const arr = ALLOW[role] || [];
  return arr.includes("*") || arr.some(a => a === action || (a.endsWith(":*") && action.startsWith(a.slice(0, -2))));
}

export function requirePermission(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 🔓 BYPASS in sviluppo: se DEV_AUTH=on, salta i controlli
    if (process.env.DEV_AUTH === "on") {
      // opzionale: imposta un ruolo fittizio per coerenza
      // @ts-ignore
      req.auth = req.auth || { role: "ADMIN", userId: "dev", companyId: process.env.DEV_COMPANY_ID || "dev-company" };
      return next();
    }

    const role = (req as any).auth?.role as string | undefined;
    if (!role || !can(role, action)) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }
    next();
  };
}
