import type { NextFunction, Request, Response } from "express";

export function bearerAuth(expectedToken?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!expectedToken) {
      next();
      return;
    }

    const auth = req.header("authorization");
    if (auth !== `Bearer ${expectedToken}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    next();
  };
}

