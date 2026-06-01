import type { VercelRequest, VercelResponse } from "@vercel/node";
import express, { Response, NextFunction } from "express";
import type { Request } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "../server/routes";
import { createServer } from "node:http";

let appReady: Promise<express.Express>;

function createApp() {
  const app = express();
  const httpServer = createServer(app);

  app.use(express.json({
    verify: (req: any, _res: any, buf: any) => { req.rawBody = buf; },
  }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  return registerRoutes(httpServer, app).then(() => {
    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      if (res.headersSent) return next(err);
      return res.status(status).json({ message });
    });
    return app;
  });
}

function getApp() {
  if (!appReady) {
    appReady = createApp();
  }
  return appReady;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getApp();
  return app(req as any, res as any);
}
