import "express";

declare global {
  namespace Express {
    interface Request {
      id?: string;
      auth?: {
        sub: string;
        role?: string;
        company?: string;
      };
      user?: {
        id: string;
        email: string;
        mode: "SERVER_SYNC" | "NUR_APP";
      };
    }
  }
}

export {};
