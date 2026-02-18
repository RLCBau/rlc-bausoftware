// apps/server/src/lib/companiesRoot.ts
import path from "path";
import fs from "fs";

export const COMPANIES_ROOT =
  process.env.COMPANIES_ROOT || path.join(process.cwd(), "data", "companies");

fs.mkdirSync(COMPANIES_ROOT, { recursive: true });
