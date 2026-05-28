import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import type { Connect } from "vite";
import { defineConfig } from "vite";

const ROOT = path.resolve(__dirname, "../..");
const TEMPLATES_JSON_DIR = path.resolve(ROOT, "templates_json");
const TEMPLATE_ASSETS_DIR = path.resolve(ROOT, "public", "template-assets");

function readBinaryAsset(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".png"
    ? "image/png"
    : ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "application/octet-stream";
  return { content: fs.readFileSync(filePath), mime };
}

function serveTemplatesJsonPlugin() {
  return {
    name: "serve-templates-json",
    configureServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use((req, res, next) => {
        const prefix = "/templates_json/";
        if (!req.url?.startsWith(prefix)) { next(); return; }
        if (req.url === prefix.slice(0, -1)) { next(); return; }
        const pathname = new URL(req.url, "http://template-preview.local").pathname;
        const relative = pathname.slice(prefix.length);
        let decoded: string;
        try { decoded = decodeURIComponent(relative); } catch { decoded = relative; }
        if (req.method === "PUT" && decoded === "import-skip-list.json") {
          let body = "";
          req.on("data", (chunk: Buffer) => { body += String(chunk); });
          req.on("end", () => {
            const skipPath = path.resolve(TEMPLATES_JSON_DIR, "import-skip-list.json");
            fs.writeFileSync(skipPath, body, "utf8");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          });
          return;
        }
        const filePath = path.resolve(TEMPLATES_JSON_DIR, decoded.replace(/\//g, path.sep));
        if (!filePath.startsWith(TEMPLATES_JSON_DIR + path.sep)) {
          res.writeHead(403, { "Content-Type": "text/plain" });
          res.end("Forbidden");
          return;
        }
        try {
          if (!fs.statSync(filePath).isFile()) { res.writeHead(404); res.end(); return; }
          const content = fs.readFileSync(filePath, "utf8");
          const mime = filePath.endsWith(".json") ? "application/json" : "text/plain";
          res.writeHead(200, { "Content-Type": mime });
          res.end(content);
        } catch {
          if (decoded === "import-skip-list.json") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end("[]");
            return;
          }
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
        }
      });
      server.middlewares.use((req, res, next) => {
        const prefix = "/template-assets/";
        if (!req.url?.startsWith(prefix)) { next(); return; }
        const pathname = new URL(req.url, "http://template-preview.local").pathname;
        const relative = pathname.slice(prefix.length);
        let decoded: string;
        try { decoded = decodeURIComponent(relative); } catch { decoded = relative; }
        const filePath = path.resolve(TEMPLATE_ASSETS_DIR, decoded.replace(/\//g, path.sep));
        if (!filePath.startsWith(TEMPLATE_ASSETS_DIR + path.sep)) {
          res.writeHead(403, { "Content-Type": "text/plain" });
          res.end("Forbidden");
          return;
        }
        try {
          if (!fs.statSync(filePath).isFile()) { res.writeHead(404); res.end(); return; }
          const { content, mime } = readBinaryAsset(filePath);
          res.writeHead(200, { "Content-Type": mime });
          res.end(content);
        } catch {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveTemplatesJsonPlugin()],
  resolve: {
    alias: {
      "@shared": path.resolve(ROOT, "shared"),
      src: path.resolve(ROOT, "src"),
      base: path.resolve(ROOT, "src/base"),
      hooks: path.resolve(ROOT, "src/hooks"),
      lib: path.resolve(ROOT, "src/lib"),
      services: path.resolve(ROOT, "src/services"),
      types: path.resolve(ROOT, "src/types"),
      ui: path.resolve(ROOT, "src/ui"),
      views: path.resolve(ROOT, "src/views"),
    },
  },
  server: { fs: { allow: [ROOT] } },
  define: { "process.env.NEXT_PUBLIC_ENABLE_AI_WIDGETS": JSON.stringify("true") },
  css: { postcss: { plugins: [] }, modules: { localsConvention: "camelCase" } },
});
