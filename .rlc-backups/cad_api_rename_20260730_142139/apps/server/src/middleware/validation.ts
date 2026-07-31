import type { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

export const qList = z.object({
  q: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(200).default(25),
  sort: z.string().optional(), // z.B. "createdAt:desc,name:asc"
  filter: z.string().optional() // JSON DSL { "status":"open", "minDate":"2025-01-01" }
});

export function validate(schema: ZodSchema<any>, source: "body"|"query"|"params"="body") {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      (req as any)[source] = schema.parse((req as any)[source]);
      next();
    } catch (e: any) {
      return res.status(400).json({ error: "Validierung fehlgeschlagen", details: e.errors });
    }
  };
}
