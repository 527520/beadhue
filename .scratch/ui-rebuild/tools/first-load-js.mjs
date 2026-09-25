// 票 14 质量门禁 6：按构建产物统计首页与作品详情页的首屏 JS，用来和 R15 起点比较。
// 口径与 Next 计算 First Load JS 一致：公共入口 rootMainFiles + 路由客户端清单里各段的 entryJSFiles，去重后累加；
// 「全部段」含 error / not-found 边界（偏保守），「布局 + 页面」只算根布局与页面本身。polyfill 只给不支持 module 的旧浏览器，不计。
// 用法：node .scratch/ui-rebuild/tools/first-load-js.mjs [构建目录，默认 .next]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';

const dir = process.argv[2] ?? '.next';
const { rootMainFiles } = JSON.parse(readFileSync(join(dir, 'build-manifest.json'), 'utf8'));
const routes = [['首页 /', 'page', 'page'], ['作品详情 /community/[id]', 'community/[id]/page', 'community/[id]/page']];

function entries(route) {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(join(dir, 'server/app', `${route}_client-reference-manifest.js`), 'utf8'), context);
  const manifest = Object.values(context.__RSC_MANIFEST)[0];
  return manifest.entryJSFiles;
}
const size = (files) => files.reduce((total, file) => {
  const body = readFileSync(join(dir, file));
  return { raw: total.raw + body.length, gzip: total.gzip + gzipSync(body).length };
}, { raw: 0, gzip: 0 });
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const report = {};
for (const [label, route, page] of routes) {
  const segments = entries(route);
  const all = [...new Set([...rootMainFiles, ...Object.values(segments).flat()])];
  const own = [...new Set([...rootMainFiles, ...(segments['[project]/src/app/layout'] ?? []), ...(segments[`[project]/src/app/${page}`] ?? [])])];
  const a = size(all);
  const o = size(own);
  report[label] = { allSegments: a, layoutAndPage: o, segments: Object.keys(segments) };
  console.log(`${label}\t全部段 ${kb(a.gzip)} gzip（${kb(a.raw)}，${all.length} 个文件）\t布局 + 页面 ${kb(o.gzip)} gzip（${kb(o.raw)}，${own.length} 个文件）`);
}
console.log(JSON.stringify(report));
