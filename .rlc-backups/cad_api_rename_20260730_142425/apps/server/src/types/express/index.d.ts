import "express";

export type AuthPayload = {
  sub?: string;
  company?: string; // companyId
  role?: string;
  projectId?: string;
  [key: string]: any;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export {};
