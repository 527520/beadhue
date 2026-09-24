/**
 * R15 设计令牌护栏（spec 质量门禁 5）：全部页面与组件只用 theme.css 里的令牌。
 * 禁止十六进制 / rgb 色值字面量、Tailwind 调色板颜色、任意字号 / 圆角 / 阴影写法，以及已删除的旧样式类名。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

import { SCANNED, UNSCANNED } from './uiScanned';

export { SCANNED };

/** 令牌文件与豆色数据：十六进制色值只允许出现在这里。 */
const TOKEN_FILES = new Set(['src/lib/render/beadTokens.ts', 'src/lib/render/tagIconArt.ts', 'src/app/dev/ui/motifs.ts']);

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
  .map((file) => relative(ROOT, join(ROOT, file)))
  .filter((file) => !UNSCANNED.some((path) => file.startsWith(path)));

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * 已删除的旧样式类（beadhue.css / 旧 globals.css 组件层）与旧 @theme 令牌工具类（新主题里不存在，写了也不生效）。
 */
const OLD_CLASS = new RegExp('^(?:[a-z0-9-]+:)*(?:' + [
  'btn-[a-z-]+', 'beadhue-(?:ui|workbench|canvas|crop)[a-z-]*', 'workspace-[a-z-]+', 'community-(?:card|page|narrow|empty|filters|grid|form|license)[a-z-]*',
  'admin-(?:shell|panel|card|form|page|nav|table|proof|command|queue|reason)[a-z-]*', 'modal-(?:panel|backdrop|title|copy|actions|form)',
  'notice(?:-[a-z]+)?', 'card-surface', 'info-card', 'link-(?:soft|action)', 'page-title', 'studio-eyebrow', 'input-(?:field|compact)', 'field-input',
  'sync-box', 'site-header', 'skip-link',
  '(?:text|bg|border|ring|from|to|via|decoration|outline|fill|stroke)-(?:ink-(?:soft|muted)|primary(?:-[a-z]+)?|lilac(?:-[a-z]+)?|cream(?:-[a-z]+)?|honey|hairline(?:-strong)?|surface(?:-[a-z]+)?)(?:/\\d+)?',
  'text-(?:xs|sm|base|lg|[2-9]?xl)', 'rounded-(?:2xl|3xl)', 'shadow-(?:soft|card|primary|[1-3])', 'font-display', 'ease-(?:gentle|spring|out)',
].join('|') + ')$');

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

  it('不再出现旧组件目录与旧样式类名（票 13 已删除 beadhue.css 与旧组件类）', () => {
    const bad: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(join(ROOT, file), 'utf8'));
      if (/legacy-ui|LegacyScope/.test(source)) bad.push(`${file}: 旧组件`);
      const tokens = (source.match(/(["'`])(?:(?!\1)[^\n])*\1/g) ?? []).flatMap((literal) => literal.slice(1, -1).split(/[\s{}$]+/));
      const hits = tokens.filter((token) => OLD_CLASS.test(token));
      if (hits.length) bad.push(`${file}: ${[...new Set(hits)].join(', ')}`);
    }
    expect(bad).toEqual([]);
  });

  it('旧类名规则能拦住旧写法、放过新令牌', () => {
    for (const old of ['btn-primary', 'btn-sm', 'beadhue-ui', 'workspace-page', 'modal-panel', 'notice-danger', 'link-soft', 'text-ink-soft', 'bg-primary-soft', 'border-lilac/40', 'text-sm', 'text-2xl', 'rounded-2xl', 'shadow-soft', 'bg-cream']) expect(OLD_CLASS.test(old), old).toBe(true);
    for (const current of ['text-body-sm', 'text-ink-3', 'bg-accent-soft', 'rounded-lg', 'shadow-float', 'text-caption', 'bg-bg-subtle']) expect(OLD_CLASS.test(current), current).toBe(false);
  });

  it('globals.css 是唯一样式入口，theme.css 扫描全部页面与组件', () => {
    const css = readFileSync(join(ROOT, 'src/app/theme.css'), 'utf8');
    const layout = readFileSync(join(ROOT, 'src/app/layout.tsx'), 'utf8');
    expect(layout).toMatch(/import '\.\/globals\.css';/);
    expect(layout).not.toMatch(/import '[^']*(?:beadhue|theme)\.css'/);
    expect(existsSync(join(ROOT, 'src/app/beadhue.css'))).toBe(false);
    expect(css).toMatch(/@import "tailwindcss\/utilities\.css" layer\(utilities\) source\(none\)/);
    for (const path of SCANNED) expect(css, `theme.css 需要 @source 登记 ${path}`).toContain(`@source "${path.replace(/^src\//, '../')}"`);
  });
});
