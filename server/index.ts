// Fix for Node.js v18 File API issue - polyfill for undici
if (typeof File === 'undefined') {
  global.File = class File extends Blob {
    constructor(parts: any[], name: string, options?: any) {
      super(parts, options);
      Object.defineProperty(this, 'name', { value: name });
      Object.defineProperty(this, 'lastModified', { value: Date.now() });
    }
  } as any;
}

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeScheduledTasks } from "./scheduler";
import prisma from "./services/database";

/**
 * One-time idempotent DB patches applied on every server start.
 * Safe to run multiple times — each patch only writes if the value is wrong.
 */
async function runStartupPatches(): Promise<void> {
  try {
    // Fix Starbene (weekly_sources): url_pattern was set to the old
    // "previsioni-settimana" path which doesn't include the sign slug or "dal/al".
    // Correct pattern: /oroscopo/{sign}-dal-{start_day}-al-{end_day}-{month}-{year}/
    const starbeneFixed = await prisma.weeklySource.updateMany({
      where: {
        domain: 'starbene.it',
        url_pattern: { not: '/oroscopo/{sign}-dal-{start_day}-al-{end_day}-{month}-{year}/' },
      },
      data: { url_pattern: '/oroscopo/{sign}-dal-{start_day}-al-{end_day}-{month}-{year}/' },
    });
    if (starbeneFixed.count > 0) {
      log(`[startup] patched Starbene url_pattern (${starbeneFixed.count} row)`);
    }
  } catch (err) {
    // Non-fatal: log but don't crash the server
    console.error('[startup] runStartupPatches error:', err);
  }
}

const app = express();

// CORS — must come before all other middleware so OPTIONS preflight is handled first.
// Allows the Capacitor native WebView (https://localhost) and the configured frontend origin.
const ALLOWED_ORIGINS = new Set(
  [
    'https://confrontaoroscopo.it',   // production site & Capacitor server.url
    'https://localhost',              // Capacitor Android local assets (androidScheme: https)
    'capacitor://localhost',          // Capacitor iOS local assets
    'http://localhost:5000',          // local Express dev
    'http://localhost:5173',          // Vite dev server
    process.env.BASE_URL_FRONTEND,
  ].filter((o): o is string => Boolean(o))
);

app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-clerk-user-id,x-admin-secret,Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});

app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await runStartupPatches();
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(port, "0.0.0.0", async () => {
    log(`serving on port ${port}`);
    
    // Initialize scheduled cleanup task
    await initializeScheduledTasks();
  });
})();
