/**
 * 设计系统一致性护栏（C-3/C-6/C-7）：状态色、文件选择、确认弹窗与文案来源。
 * 令牌、圆角与旧类名由 uiGuardrails.test.ts 约束。
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const sourceFiles: string[] = [];
(function walk(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) sourceFiles.push(full);
  }
})('src');

function offenders(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const file of sourceFiles) {
    const hits = readFileSync(file, 'utf8').match(pattern) ?? [];
    if (hits.length > 0) found.push(`${file}: ${[...new Set(hits)].join(', ')}`);
  }
  return found;
}

describe('设计系统一致性', () => {
  it('状态色只走 success/warning/danger token，不再硬编码 Tailwind 调色板', () => {
    expect(offenders(/(?:text|bg|border|ring)-(?:red|green|amber|emerald|yellow|rose|orange)-\d{2,3}/g)).toEqual([]);
  });

  it('文件选择输入不带 capture 属性（移动端带 capture 会堵死相册选择，0.3.0 真机验收回归）', () => {
    const bad: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      if (/capture: 'environment'/.test(source) || /<input[^>]*type="file"[^>]*\bcapture\b/.test(source)) {
        bad.push(file);
      }
    }
    expect(bad).toEqual([]);
  });

  it('破坏性确认统一走品牌弹窗，不用 window.confirm', () => {
    const callers = sourceFiles.filter((file) => {
      return /window\.confirm\s*\(/.test(readFileSync(file, 'utf8'));
    });
    expect(callers).toEqual([]);
  });

  it('文案不在组件里硬编码中文（统一从 zh-CN.ts 引用）', () => {
    const bad: string[] = [];
    // /dev/ui 组件总览的演示文案只在开发环境渲染；不进 zh-CN.ts，免得增大每个页面的首屏 JS。
    const devDir = join('src', 'app', 'dev');
    for (const file of sourceFiles.filter((path) => !(path === devDir || path.startsWith(devDir + sep)))) {
      // 注释按约定是中文的，先剥掉再检查字符串字面量。
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      for (const match of source.match(/'[^'\n]*[\u4e00-\u9fff][^'\n]*'/g) ?? []) {
        bad.push(`${file}: ${match}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
