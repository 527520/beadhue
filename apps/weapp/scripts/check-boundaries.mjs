import { build } from "esbuild";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
const core = path.resolve("../../packages/core");
const entryPoints = (await readdir(core))
  .filter((n) => n.endsWith(".ts"))
  .map((n) => `${core}/${n}`);
const result = await build({
  entryPoints,
  bundle: true,
  write: false,
  outdir: "/unused",
  metafile: true,
  platform: "browser",
  format: "esm",
  alias: { "@": path.resolve("../../src") },
  logLevel: "silent",
});
const blocked = Object.keys(result.metafile.inputs).filter((p) =>
  /src\/(app\/api|lib\/(auth|community\/.*server|storage\/index))|node_modules\/(next|pg|drizzle-orm|argon2)\//.test(
    p,
  ),
);
if (blocked.length)
  throw new Error(
    `Shared core imports platform/server implementation: ${blocked.join(", ")}`,
  );
async function check(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) await check(p);
    else if (/\.tsx?$/.test(p) && !p.endsWith(".test.ts")) {
      const s = await readFile(p, "utf8");
      if (
        /['"`]\/api\/(community|admin|notifications)|<web-view|SharedArrayBuffer|document\.(createElement|querySelector)|window\.localStorage/.test(
          s,
        )
      )
        throw new Error(`Mini boundary violation: ${p}`);
    }
  }
}
await check("src");
console.log(
  `Shared core boundary checked (${Object.keys(result.metafile.inputs).length} inputs); no community/admin/DOM adapters in mini source.`,
);
