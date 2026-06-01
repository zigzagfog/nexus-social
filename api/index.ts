import "dotenv/config";
import express, { Response, NextFunction } from "express";
import type { Request } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "../server/routes";
import { createServer } from "node:http";

const app = express();
const httpServer = createServer(app);

app.use(express.json({
  verify: (req: any, _res: any, buf: any) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });
})();

export default app;
