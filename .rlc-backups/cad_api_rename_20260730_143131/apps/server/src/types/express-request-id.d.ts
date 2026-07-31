// apps/server/src/types/express-request-id.d.ts
declare module "express-request-id" {
  import { RequestHandler } from "express";

  export interface RequestIdOptions {
    headerName?: string;
  }

  // default export: middleware Express
  export default function requestId(options?: RequestIdOptions): RequestHandler;
}
