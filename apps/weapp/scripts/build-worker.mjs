import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir(".workers", { recursive: true });
await build({
  entryPoints: ["src/workers/index.ts"],
  outfile: ".workers/index.js",
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  alias: { "@": new URL("../../../src", import.meta.url).pathname },
  define: { "process.env.NODE_ENV": '"production"' },
});
