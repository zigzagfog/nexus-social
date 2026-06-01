// Vercel serverless entry point — delegates to the pre-built Express bundle
const path = require("path");

// Load the compiled server bundle
let appPromise;

function getApp() {
  if (!appPromise) {
    appPromise = new Promise((resolve, reject) => {
      try {
        // The dist bundle exports nothing useful for serverless,
        // so we re-create the Express app from compiled modules
        const express = require("express");
        const cookieParser = require("cookie-parser");
        const http = require("http");

        const app = express();
        const httpServer = http.createServer(app);

        app.use(express.json({
          verify: (req, _res, buf) => { req.rawBody = buf; },
        }));
        app.use(express.urlencoded({ extended: false }));
        app.use(cookieParser());

        // Dynamically require compiled routes
        const { registerRoutes } = require("../server/routes");

        registerRoutes(httpServer, app).then(() => {
          app.use((err, _req, res, next) => {
            const status = err.status || err.statusCode || 500;
            const message = err.message || "Internal Server Error";
            if (res.headersSent) return next(err);
            return res.status(status).json({ message });
          });
          resolve(app);
        }).catch(reject);
      } catch (err) {
        reject(err);
      }
    });
  }
  return appPromise;
}

module.exports = async (req, res) => {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err) {
    console.error("Serverless function error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};
