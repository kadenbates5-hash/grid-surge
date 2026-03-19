// Vercel serverless function handler for Grid Surge
import { VercelRequest, VercelResponse } from '@vercel/node';
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import MemoryStoreFactory from "memorystore";
import { registerRoutes } from "../server/routes.js";
import { serveStatic } from "../server/static.js";
import { createServer } from "http";

const MemoryStore = MemoryStoreFactory(session);

// Global app instance that persists across requests
let app: express.Application | null = null;
let initPromise: Promise<void> | null = null;
let isInitialized = false;

function log(message: string, source = "vercel") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

async function initializeApp(): Promise<express.Application> {
  if (isInitialized && app) {
    return app;
  }

  if (initPromise) {
    await initPromise;
    return app!;
  }

  initPromise = (async () => {
    log("Initializing Grid Surge app...");
    
    app = express();
    const httpServer = createServer(app);

    // Body parsing middleware
    app.use(
      express.json({
        verify: (req: any, _res, buf) => {
          req.rawBody = buf;
        },
      }),
    );
    app.use(express.urlencoded({ extended: false }));

    // Session middleware
    app.use(session({
      secret: process.env.JWT_SECRET || process.env.SESSION_SECRET || "gridsurge_secret_kjb_2026",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({ checkPeriod: 86400000 }),
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    }));

    // Logging middleware
    app.use((req, res, next) => {
      const start = Date.now();
      const path = req.path;
      let capturedJsonResponse: Record<string, any> | undefined = undefined;

      const originalResJson = res.json;
      res.json = function (bodyJson, ...args) {
        capturedJsonResponse = bodyJson;
        return originalResJson.apply(res, [bodyJson, ...args]);
      };

      res.on("finish", () => {
        const duration = Date.now() - start;
        if (path.startsWith("/api")) {
          let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
          if (capturedJsonResponse) {
            logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
          }
          log(logLine);
        }
      });

      next();
    });

    // Register all routes
    log("Registering routes...");
    await registerRoutes(httpServer, app);
    log("Routes registered successfully");

    // Error handling middleware
    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("Internal Server Error:", err);
      
      if (res.headersSent) {
        return next(err);
      }
      return res.status(status).json({ message });
    });

    // Serve static files in production
    if (process.env.NODE_ENV === "production") {
      log("Setting up static file serving...");
      serveStatic(app);
    }

    isInitialized = true;
    log("Grid Surge app initialized successfully");
  })();

  await initPromise;
  return app!;
}

// Vercel serverless function handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Ensure app is initialized
    const expressApp = await initializeApp();
    
    // Handle the request with Express
    return expressApp(req as any, res as any);
  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({ 
      message: "Internal Server Error",
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
