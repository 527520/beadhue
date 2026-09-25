/**
 * 首屏 JS 护栏（spec 质量门禁 6）：根布局、首页、作品详情与后台外壳的客户端静态依赖里，
 * 不能出现整套内置色板数据、服务端配置 config.ts 或 zod（统计队列、原图续传、退出登录都改成按需加载）。
 * 沿静态 import 走：进入 'use client' 文件之后的依赖都会打进浏览器；动态 import() 是懒加载，不算。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const ROOT = process.cwd();
const EXT = ['', '.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts', '/index.tsx', '/index.js'];
const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/g;

function resolveImport(from: string, spec: string): { file?: string; pkg?: string } {
  const base = spec.startsWith('@/') ? join(ROOT, 'src', spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null;
  if (!base) return { pkg: spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0] };
  for (const ext of EXT) if (existsSync(base + ext) && statSync(base + ext).isFile()) return { file: base + ext };
  return {};
}

function clientGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const seen = new Set<string>();
  const walk = (file: string, inClient: boolean) => {
    const key = `${file}|${inClient}`;
    if (seen.has(key)) return;
    seen.add(key);
    const source = readFileSync(file, 'utf8');
    const client = inClient || /^\s*['"]use client['"]/.test(source);
    if (client) files.add(relative(ROOT, file));
    if (file.endsWith('.json')) return;
    for (const [, spec] of source.matchAll(IMPORT)) {
      if (spec.endsWith('.css')) continue;
      const target = resolveImport(file, spec);
      if (target.pkg && client) packages.add(target.pkg);
      if (target.file) walk(target.file, client);
    }
  };
  walk(join(ROOT, entry), false);
  return { files, packages };
}

describe('首屏客户端依赖', () => {
  for (const entry of ['src/app/layout.tsx', 'src/app/page.tsx', 'src/app/community/[id]/page.tsx', 'src/app/admin/layout.tsx']) {
    it(`${entry} 不带色板数据、服务端配置与 zod`, () => {
      const { files, packages } = clientGraph(entry);
      expect(files.size).toBeGreaterThan(5);
      expect([...files].filter((file) => file.startsWith('src/lib/palettes/data/') || file === 'src/lib/config.ts')).toEqual([]);
      expect(packages.has('zod')).toBe(false);
    });
  }
});
