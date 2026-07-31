import path from "path";
import fs from "fs";

export const PROJECTS_ROOT =
  process.env.PROJECTS_ROOT || path.join(process.cwd(), "data", "projects");

fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
