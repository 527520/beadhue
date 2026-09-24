// 删除 zh-CN.ts 中键名在其他源文件（含测试）里一次都没出现的属性；只处理标识符形式的键。反复执行直到没有候选。
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const file = 'src/messages/zh-CN.ts';
let corpus = '';
for (const dir of ['src', 'tests']) (function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|mjs|cjs)$/.test(e.name) && p !== file) corpus += fs.readFileSync(p, 'utf8') + '\n';
  }
})(dir);
const tokens = new Set(corpus.match(/[A-Za-z_$][\w$]*/g));
let removed = 0;
for (;;) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const ranges = [];
  const visit = (obj) => {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop) && !ts.isMethodDeclaration(prop)) continue;
      const name = prop.name.getText(sf).replace(/^['"]|['"]$/g, '');
      if (/^[A-Za-z_$][\w$]*$/.test(name) && !tokens.has(name)) {
        let end = prop.end;
        const rest = text.slice(end);
        const m = rest.match(/^\s*,/);
        if (m) end += m[0].length;
        ranges.push([prop.getFullStart(), end]);
        continue;
      }
      if (ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)) visit(prop.initializer);
    }
  };
  ts.forEachChild(sf, function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === 'zhCN') {
      let init = node.initializer;
      while (init && ts.isAsExpression(init)) init = init.expression;
      visit(init);
    }
    ts.forEachChild(node, find);
  });
  if (!ranges.length) break;
  let out = text;
  for (const [a, b] of ranges.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + out.slice(b);
  fs.writeFileSync(file, out);
  removed += ranges.length;
}
console.log('removed', removed);
