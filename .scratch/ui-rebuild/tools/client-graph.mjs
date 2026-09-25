// 票 14：沿静态 import 找出某个路由会打进浏览器的源码模块（进入 'use client' 文件之后的依赖都算客户端），
// 用来定位首屏 JS 变大的来源。动态 import() 本来就是懒加载，不追。
// 用法：node .scratch/ui-rebuild/tools/client-graph.mjs <仓库根> <入口文件...>
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const [root, ...entries] = process.argv.slice(2);
const EXT = ['', '.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts', '/index.tsx', '/index.js'];
function resolveSpec(from, spec) {
  const base = spec.startsWith('@/') ? join(root, 'src', spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null;
  if (!base) return { pkg: spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0] };
  for (const ext of EXT) if (existsSync(base + ext) && statSync(base + ext).isFile()) return { file: base + ext };
  return {};
}
const importRe = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
const client = new Map();
const packages = new Map();
const parent = new Map();
const seen = new Set();
function walk(file, inClient, from = null) {
  const key = `${file}|${inClient}`;
  if (seen.has(key)) return;
  seen.add(key);
  const source = readFileSync(file, 'utf8');
  const nowClient = inClient || /^\s*['"]use client['"]/.test(source);
  if (nowClient) client.set(relative(root, file), source.length);
  if (nowClient && from && !parent.has(relative(root, file))) parent.set(relative(root, file), relative(root, from));
  if (file.endsWith('.json')) return;
  for (const [, spec] of source.matchAll(importRe)) {
    if (spec.endsWith('.css')) continue;
    const target = resolveSpec(file, spec);
    if (target.pkg) { if (nowClient) packages.set(target.pkg, (packages.get(target.pkg) ?? 0) + 1); continue; }
    if (target.file) walk(target.file, nowClient, file);
  }
}
for (const entry of entries) walk(join(root, entry), false);
const total = [...client.values()].reduce((sum, size) => sum + size, 0);
console.log(`客户端源码模块 ${client.size} 个，合计 ${(total / 1024).toFixed(0)} KB（源码字节）`);
const chain = (file) => { const out = [file]; while (parent.has(out.at(-1)) && out.length < 20) out.push(parent.get(out.at(-1))); return out.reverse().join(' → '); };
if (process.env.CHAIN) for (const target of process.env.CHAIN.split(',')) console.log(`引入链：${chain(target)}`);
console.log(JSON.stringify({ files: Object.fromEntries([...client].sort((a, b) => b[1] - a[1])), packages: [...packages.keys()].sort() }));
