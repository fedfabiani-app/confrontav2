import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { injectSignMetaTags } from "./seo/signMeta";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      const finalPage = await injectSignMetaTags(page, req);
      res.status(200).set({ "Content-Type": "text/html" }).end(finalPage);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Hashed assets (JS/CSS/fonts/images) are immutable — cache for 1 year.
  // HTML and manifests must revalidate on every request.
  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        if (/\.(js|css|woff2?|ttf|otf)$/.test(filePath)) {
          // JS/CSS/fonts are content-hashed by Vite — safe to cache forever
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (/\.(svg|png|jpg|jpeg|webp|ico)$/.test(filePath)) {
          // Images use fixed filenames (not hashed) — allow revalidation daily
          res.setHeader("Cache-Control", "public, max-age=86400");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    })
  );

  // fall through to index.html if the file doesn't exist. The template is
  // immutable for the life of the process (rebuilt only on redeploy), so
  // read it once here rather than on every request.
  const indexHtmlPath = path.resolve(distPath, "index.html");
  const cachedIndexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

  app.use("*", async (req, res) => {
    // injectSignMetaTags fails open (returns the template unchanged) on
    // any error, so this can never throw.
    const html = await injectSignMetaTags(cachedIndexHtml, req);
    // The body now varies per request (query string dependent for
    // /sign/:sign), so no downstream cache should treat this like a
    // static file the way sendFile()'s default headers implied.
    res.status(200).set({ "Content-Type": "text/html", "Cache-Control": "no-cache" }).end(html);
  });
}
