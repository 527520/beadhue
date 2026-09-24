// 列出从 Next 入口（页面 / 路由 / 布局 / proxy / instrumentation）不可达的 src 文件。
// 用法：node .scratch/ui-rebuild/tools/dead-files.mjs [--with-tests]
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const src = path.join(root, 'src');
const withTests = process.argv.includes('--with-tests');
const all = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(tsx?|mjs|js|css)$/.test(e.name)) all.push(p);
    }
})(src);
const isTest = (f) => /\.test\.(tsx?)$/.test(f) || /test-types\.d\.ts$/.test(f);
const special = /^(page|layout|route|error|not-found|global-error|forbidden|unauthorized|loading|template|default|robots|sitemap|manifest|opengraph-image|icon)\.(tsx?|js)$/;
const roots = all.filter((f) => {
    if (withTests && isTest(f)) return true;
    const rel = path.relative(src, f);
    if (rel === 'proxy.ts' || rel === 'instrumentation.ts') return true;
    return rel.startsWith('app' + path.sep) && special.test(path.basename(f));
});
const opts = { baseUrl: root, paths: { '@/*': ['./src/*'] }, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, allowJs: true, jsx: ts.JsxEmit.ReactJSX, resolveJsonModule: true };
const host = ts.createCompilerHost(opts);
function deps(file) {
    const text = fs.readFileSync(file, 'utf8');
    const out = [];
    if (file.endsWith('.css')) {
        for (const m of text.matchAll(/@import\s+["']([^"']+)["']/g)) {
            if (m[1].startsWith('.')) out.push(path.resolve(path.dirname(file), m[1]));
        }
        return out;
    }
    const specs = ts.preProcessFile(text, true, true).importedFiles.map((i) => i.fileName);
    for (const m of text.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g)) specs.push(m[1]);
    for (const m of text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]);
    for (const s of specs) {
        if (s.endsWith('.css')) {
            const p = s.startsWith('@/') ? path.join(src, s.slice(2)) : path.resolve(path.dirname(file), s);
            out.push(p);
            continue;
        }
        const r = ts.resolveModuleName(s, file, opts, host).resolvedModule;
        if (r && !r.isExternalLibraryImport && r.resolvedFileName.startsWith(src)) out.push(r.resolvedFileName);
        else if (!r && (s.startsWith('.') || s.startsWith('@/'))) {
            const base = s.startsWith('@/') ? path.join(src, s.slice(2)) : path.resolve(path.dirname(file), s);
            for (const ext of ['', '.ts', '.tsx']) if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) out.push(base + ext);
        }
    }
    return out;
}
const seen = new Set();
const stack = [...roots];
while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of deps(f)) if (!seen.has(d)) stack.push(d);
}
const dead = all.filter((f) => !seen.has(f) && !isTest(f)).map((f) => path.relative(root, f));
console.log(dead.sort().join('\n'));
