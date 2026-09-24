// 精确版：沿 zhCN.a.b 访问与别名（const t = zhCN.a; t.b）收集被用到的路径；整体传递或下标访问的路径视为不透明（其子键全部保留）。
// 用法：node prune-messages-precise.mjs [--write]
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const file = 'src/messages/zh-CN.ts';
const files = [];
for (const dir of ['src', 'tests']) (function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|mjs)$/.test(e.name) && p !== file) files.push(p);
  }
})(dir);
const used = new Set();
const opaque = new Set();
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  if (!text.includes('zhCN')) continue;
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
  const aliases = new Map(); // 标识符 → 路径数组
  const pathOf = (node) => {
    const parts = [];
    let n = node;
    while (ts.isPropertyAccessExpression(n)) { parts.unshift(n.name.text); n = n.expression; }
    if (ts.isNonNullExpression(n)) n = n.expression;
    if (ts.isIdentifier(n)) {
      if (n.text === 'zhCN') return parts;
      if (aliases.has(n.text)) return [...aliases.get(n.text), ...parts];
    }
    return null;
  };
  // 两遍：先收别名，再收访问
  for (let pass = 0; pass < 3; pass++) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        let init = node.initializer;
        if (ts.isIdentifier(node.name)) {
          const p = pathOf(init);
          if (p) aliases.set(node.name.text, p);
        } else if (ts.isObjectBindingPattern(node.name)) {
          const p = pathOf(init);
          if (p) for (const el of node.name.elements) {
            const key = (el.propertyName ?? el.name).getText(sf);
            used.add([...p, key].join('.'));
            if (ts.isIdentifier(el.name)) aliases.set(el.name.text, [...p, key]);
          }
        }
      }
      ts.forEachChild(node, visit);
    });
  }
  ts.forEachChild(sf, function visit(node) {
    if ((ts.isPropertyAccessExpression(node) || ts.isIdentifier(node)) && !(node.parent && ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node)) {
      const p = pathOf(node);
      const declaration = ts.isIdentifier(node) && (ts.isImportSpecifier(node.parent) || ts.isImportClause(node.parent) || ts.isExportSpecifier(node.parent) || ts.isVariableDeclaration(node.parent) && node.parent.name === node || ts.isBindingElement(node.parent) || ts.isParameter(node.parent));
      let inType = false;
      for (let a = node.parent; a; a = a.parent) if (ts.isTypeNode(a)) { inType = true; break; }
      if (p && !declaration && !inType) {
        const key = p.join('.');
        used.add(key);
        const parent = node.parent;
        const isCall = parent && ts.isCallExpression(parent) && parent.expression === node;
        const isAliasInit = parent && ts.isVariableDeclaration(parent) && parent.initializer === node;
        if (!isCall && !isAliasInit) opaque.add(key); // 作为值使用：下标、传参、展开……子键全部保留
      }
    }
    ts.forEachChild(node, visit);
  });
}
const keepArg = process.argv.find((arg) => arg.startsWith('--keep='));
const keepLeaves = new Set(keepArg ? keepArg.slice(7).split(',') : []);
const keep = (p) => {
  const segs = p.split('.');
  if (keepLeaves.has(segs.at(-1))) return true;
  for (let i = 0; i <= segs.length; i++) if (opaque.has(segs.slice(0, i).join('.')) && i < segs.length) return true;
  for (const u of used) if (u === p || u.startsWith(p + '.')) return true;
  return false;
};
const text = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
const ranges = [];
const visit = (obj, trail) => {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) && !ts.isMethodDeclaration(prop)) continue;
    const name = prop.name.getText(sf).replace(/^['"]|['"]$/g, '');
    const here = [...trail, name];
    if (!keep(here.join('.'))) {
      let end = prop.end; const m = text.slice(end).match(/^\s*,/); if (m) end += m[0].length;
      ranges.push([prop.getFullStart(), end, here.join('.')]);
      continue;
    }
    if (ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)) visit(prop.initializer, here);
  }
};
ts.forEachChild(sf, function find(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(sf) === 'zhCN') { let init = node.initializer; while (ts.isAsExpression(init)) init = init.expression; visit(init, []); }
  ts.forEachChild(node, find);
});
console.log(ranges.map((r) => r[2]).join('\n'));
console.error(ranges.length, 'unused;', 'opaque roots:', [...opaque].filter((k) => k.split('.').length <= 2).join(' '));
if (process.argv.includes('--write')) {
  let out = text;
  for (const [a, b] of ranges.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + out.slice(b);
  fs.writeFileSync(file, out);
}
