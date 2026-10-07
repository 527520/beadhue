import { readdir, stat, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const config = JSON.parse(await readFile("dist/app.json", "utf8"));
const roots = [
  ...(config.subPackages ?? config.subpackages ?? []).map((p) => p.root),
  "workers",
];
const sizes = { main: 0, ...Object.fromEntries(roots.map((r) => [r, 0])) };
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) await walk(file);
    else {
      const relative = path.relative("dist", file).replaceAll("\\", "/");
      const bucket = roots.find((r) => relative.startsWith(`${r}/`)) ?? "main";
      sizes[bucket] += (await stat(file)).size;
    }
  }
}
await walk("dist");
await mkdir("../../.scratch/wechat-miniprogram/evidence", { recursive: true });
await writeFile(
  "../../.scratch/wechat-miniprogram/evidence/package-sizes.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      budget: Math.floor(1.8 * 1024 * 1024),
      sizes,
    },
    null,
    2,
  ) + "\n",
);
console.log("WeChat package bytes:", sizes);
const over = Object.entries(sizes).filter(([, n]) => n > 1.8 * 1024 * 1024);
if (over.length)
  throw new Error(
    `Engineering package budget exceeded: ${over.map(([k]) => k).join(", ")}`,
  );
if (Object.values(sizes).reduce((a, b) => a + b, 0) > 30 * 1024 * 1024)
  throw new Error("Total package limit exceeded");
