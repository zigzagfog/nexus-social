"use strict";
// Load env
require("dotenv/config");

const express = require("express");
const cookieParser = require("cookie-parser");
const http = require("http");

let appPromise = null;

async function buildApp() {
  const app = express();
  const httpServer = http.createServer(app);

  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  const { registerRoutes } = await import("../server/routes.js");
  await registerRoutes(httpServer, app);

  app.use((err, _req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (res.headersSent) return next(err);
    return res.status(status).json({ message: err.message || "Internal Server Error" });
  });

  return app;
}

function getApp() {
  if (!appPromise) appPromise = buildApp();
  return appPromise;
}

module.exports = async (req, res) => {
  try {
    const app = await getApp();
    app(req, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
