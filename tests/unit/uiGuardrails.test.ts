/**
 * R15 设计令牌护栏（spec 质量门禁 5）：新组件与新页面只用 theme.css 里的令牌。
 * 禁止十六进制 / rgb 色值字面量、Tailwind 调色板颜色，以及任意字号 / 圆角 / 阴影写法。
 * 后续各票新建的页面目录登记到 SCANNED（同时登记到 src/app/theme.css 的 @source）。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

import { SCANNED } from './uiScanned';

export { SCANNED };

/** 令牌文件与豆色数据：十六进制色值只允许出现在这里。 */
const TOKEN_FILES = new Set(['src/lib/render/beadTokens.ts', 'src/app/dev/ui/motifs.ts']);

function collect(path: string, out: string[]): string[] {
  const full = join(ROOT, path);
  if (!existsSync(full)) return out;
  if (statSync(full).isFile()) {
    out.push(path);
    return out;
  }
  for (const entry of readdirSync(full)) collect(join(path, entry), out);
  return out;
}

const files = SCANNED.flatMap((path) => collect(path, []))
  .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file))
  .map((file) => relative(ROOT, join(ROOT, file)));

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const RULES: Array<[string, RegExp]> = [
  ['十六进制色值', /#[0-9a-fA-F]{3,8}\b(?![-\w])/g],
  ['rgb()/hsl() 色值字面量', /\b(?:rgba?|hsla?)\(\s*\d/g],
  ['Tailwind 调色板颜色', /\b(?:bg|text|border|ring|fill|stroke|outline|from|to|via|shadow|accent|caret|decoration|divide)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?\b/g],
  ['任意字号', /\btext-(?:\[|\()/g],
  ['任意圆角', /\brounded(?:-[a-z]{1,2})?-(?:\[|\()/g],
  ['任意阴影', /\b(?:shadow|inset-shadow|drop-shadow|ring|inset-ring)-(?:\[|\()/g],
  ['任意颜色', /-\[(?:#|rgb|hsl|color)/g],
  ['内联字号 / 圆角 / 阴影', /\b(?:fontSize|borderRadius|boxShadow)\s*:/g],
];

describe('R15 设计令牌护栏', () => {
  it('扫描清单非空且包含组件库', () => {
    expect(files.some((file) => file.startsWith('src/components/ui/'))).toBe(true);
  });

  for (const [name, pattern] of RULES) {
    it(`新组件与新页面不出现${name}`, () => {
      const bad: string[] = [];
      for (const file of files) {
        if (TOKEN_FILES.has(file) && (name === '十六进制色值')) continue;
        const hits = stripComments(readFileSync(join(ROOT, file), 'utf8')).match(pattern) ?? [];
        if (hits.length) bad.push(`${file}: ${[...new Set(hits)].join(', ')}`);
      }
      expect(bad).toEqual([]);
    });
  }

  it('规则本身能拦住违规写法', () => {
    const sample = 'text-[13px] rounded-[10px] rounded-md-[3px] shadow-[0_1px_2px] bg-red-500 bg-[#fff] color: #3160E6 rgb(1, 2, 3) style={{ fontSize: 13 }}';
    for (const [name, pattern] of RULES) expect(sample.match(pattern), name).not.toBeNull();
    expect('text-title-1 rounded-lg shadow-float bg-accent href="#kit-cards"'.match(RULES[0][1])).toBeNull();
  });

  it('新代码不依赖旧组件目录与旧样式类', () => {
    const bad = files.filter((file) => /legacy-ui|['"`\s](?:btn-primary|btn-outline|btn-quiet|beadhue-ui)['"`\s]/.test(readFileSync(join(ROOT, file), 'utf8')));
    expect(bad).toEqual([]);
  });

  it('theme.css 不引入 preflight，工具类在最后一层 ui', () => {
    const css = readFileSync(join(ROOT, 'src/app/theme.css'), 'utf8');
    expect(css).toMatch(/@layer theme, base, components, utilities, ui;/);
    expect(css).toMatch(/@import "tailwindcss\/utilities\.css" layer\(ui\)/);
    expect(css).not.toMatch(/@import "tailwindcss(?:\/preflight(?:\.css)?)?"/);
    for (const path of SCANNED) expect(css, `theme.css 需要 @source 登记 ${path}`).toContain(`@source "${path.replace(/^src\/(app\/)?/, (_, app) => (app ? './' : '../'))}"`);
  });
});
