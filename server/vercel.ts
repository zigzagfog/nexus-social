/**
 * Vercel Serverless Entry Point
 * ─────────────────────────────
 * This file is bundled by esbuild into api/server.cjs at build time.
 * It creates the Express app (no listen(), no static files) and exports
 * a standard Vercel serverless handler.
 */
import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import { createServer } from "node:http";
import { registerRoutes } from "./routes";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

let appPromise: Promise<express.Express> | null = null;

async function buildApp(): Promise<express.Express> {
  const app = express();
  const httpServer = createServer(app);

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Serverless error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  return app;
}

function getApp(): Promise<express.Express> {
  if (!appPromise) {
    appPromise = buildApp();
  }
  return appPromise;
}

// Vercel serverless handler
export default async function handler(req: Request, res: Response) {
  try {
    const app = await getApp();
    app(req, res);
  } catch (err: any) {
    console.error("Handler error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}
