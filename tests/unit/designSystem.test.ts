/**
 * 设计系统一致性护栏（C-3/C-5/C-6/C-7）。
 *
 * 审查发现的漂移：18 个文件里 101 处硬编码状态色、47 种手抄按钮/输入配方、
 * 8 种圆角混用、window.confirm 与品牌弹窗双轨。这些都不是"改一次就好"的问题，
 * 没有护栏会随新功能重新长出来，所以在这里锁住。
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCANNED } from './uiScanned';

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

  it('按钮与输入走组件类，不再手抄胶囊/描边/输入配方', () => {
    // 允许容器与色块保留描边工具类；这里只拦「带内边距的可点击配方」。
    expect(offenders(/rounded-full bg-primary px-/g)).toEqual([]);
    expect(offenders(/rounded-full border border-lilac\/\d+ px-\d/g)).toEqual([]);
    expect(offenders(/rounded-(?:lg|xl) border border-lilac\/50 px-\d[^"']*text-(?:sm|xs|ink)/g)).toEqual([]);
    expect(offenders(/rounded(?:-full)? border border-danger\/\d+ px-/g)).toEqual([]);
  });

  it('圆角只用 full / 2xl / xl / lg 四档（色块 sm 与裁剪画布 none 为记录在案的例外）', () => {
    const exceptions = /rounded-sm|rounded-none/;
    // R15 新组件与新页面用新的五档圆角（theme.css：sm 8 / md 12 / lg 16 / xl 24 / full），由 uiGuardrails.test.ts 约束。
    const r15 = SCANNED.map((path) => (path.endsWith('.ts') ? path : `${path}/`));
    const bad = offenders(/\brounded(?:-(?:md|3xl))?(?=["'\s])/g)
      .filter((entry) => !r15.some((dir) => entry.startsWith(dir)))
      .filter((entry) => !exceptions.test(entry));
    expect(bad).toEqual([]);
  });

  it('按钮尺寸修饰符定义在所有按钮种类之后（同层同特异性下后定义者覆盖修饰符）', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
    const defIndex = (name: string): number => {
      const match = new RegExp(`^\\s*\\.${name}\\s*\\{`, 'gm').exec(css);
      if (!match) throw new Error(`globals.css 缺少 .${name} 定义`);
      return match.index;
    };
    const baseClasses = ['btn-primary', 'btn-outline', 'btn-tool', 'btn-danger', 'btn-danger-outline', 'btn-danger-quiet'];
    const lastBaseName = baseClasses.reduce((latest, name) => (defIndex(name) > defIndex(latest) ? name : latest));
    const lastBaseIndex = defIndex(lastBaseName);
    for (const modifier of ['btn-sm', 'btn-xs', 'btn-icon']) {
      expect(
        defIndex(modifier),
        `.${modifier} 必须定义在 .${lastBaseName} 之后，否则尺寸修饰符会被基础尺寸覆盖`,
      ).toBeGreaterThan(lastBaseIndex);
    }
  });

  it('文件选择输入不带 capture 属性（移动端带 capture 会堵死相册选择，0.3.0 真机验收回归）', () => {
    const bad: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      if (/capture: 'environment'/.test(source) || /<UploadDropzone[^>]*\bcapture\b/.test(source)) {
        bad.push(file);
      }
    }
    expect(bad).toEqual([]);
  });

  it('破坏性确认统一走品牌弹窗，不用 window.confirm', () => {
    const callers = sourceFiles.filter((file) => {
      if (file.endsWith(join('ui', 'ConfirmDialog.tsx'))) return false; // 文档注释里提到它
      return /window\.confirm\s*\(/.test(readFileSync(file, 'utf8'));
    });
    expect(callers).toEqual([]);
  });

  it('文案不在组件里硬编码中文（统一从 zh-CN.ts 引用）', () => {
    const bad: string[] = [];
    // /dev/ui 组件总览的演示文案只在开发环境渲染；不进 zh-CN.ts，免得增大每个页面的首屏 JS。
    for (const file of sourceFiles.filter((path) => !path.startsWith(join('src', 'app', 'dev') + '/'))) {
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

  /*
    admin-round-3 01：按钮尺寸统一。
    「后台按钮怎么都不一样大」的根因是一条不分层的 `button:not([tabindex="-1"])` 44px 下限，
    它盖掉了 @layer 里 .btn-sm / .btn-xs 的高度——同一套类名在 <button> 上是 44px、
    在 <a> / <label> 上是 36 / 32px。以下四条护栏防止它再长回来。
  */
  const globalsCss = () => readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
  const ruleOf = (css: string, selector: string): string => {
    const match = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`).exec(css);
    if (!match) throw new Error(`globals.css 缺少 ${selector} 的规则`);
    return match[0];
  };

  it('原生按钮的 44px 高度下限不覆盖按钮体系（宽度下限保留给 flex 收缩基准）', () => {
    const css = globalsCss();
    // 高度下限：必须排除按钮体系，否则 .btn-sm / .btn-xs 会被拉回 44px。
    const heightRule = /^button:not\(\[tabindex="-1"\]\)[^{]*\{[^}]*min-height[^}]*\}/mu.exec(css);
    expect(heightRule, 'globals.css 缺少原生按钮高度下限规则').not.toBeNull();
    for (const excluded of [':not([class*="btn-"])', ':not(.chip)', ':not(.disclosure-trigger)']) {
      expect(heightRule![0], `高度下限必须排除 ${excluded}`).toContain(excluded);
    }
    // 宽度下限：按钮体系也要有——flex 容器的收缩基准，去掉会让 200% 布局放大时横向溢出。
    const widthRule = /^button:not\(\[tabindex="-1"\]\)[^{]*\{[^}]*min-width: 44px[^}]*\}/mu.exec(css);
    expect(widthRule, 'globals.css 缺少原生按钮宽度下限规则').not.toBeNull();
  });

  it('按钮尺寸修饰符只从 --control-height-* token 取值', () => {
    const css = globalsCss();
    expect(ruleOf(css, '.btn-sm')).toContain('var(--control-height-sm)');
    expect(ruleOf(css, '.btn-xs')).toContain('var(--control-height-xs)');
  });

  it('后台不手写按钮类名（原生 button 用 <Button>，文件选择 label 用 <FileButton>）', () => {
    const adminFiles = sourceFiles.filter((file) => file.includes(join('src', 'components', 'admin')) || file.includes(join('src', 'app', 'admin')));
    const bad: string[] = [];
    for (const file of adminFiles) {
      const source = readFileSync(file, 'utf8');
      if (/<button[^>]*className="btn-/u.test(source)) bad.push(`${file}: 原生 button 直接套 btn-* 类`);
      if (/<label[^>]*className="btn-/u.test(source)) bad.push(`${file}: label 直接套 btn-* 类`);
    }
    expect(bad).toEqual([]);
  });

  it('动作行容器子项居中（flex 默认 stretch 会把矮按钮拉成同行最高者）', () => {
    const css = globalsCss();
    for (const selector of ['.admin-form-actions', '.modal-actions', '.admin-reason-actions', '.batch-card-actions', '.panel-actions']) {
      expect(ruleOf(css, selector), `${selector} 需要 align-items`).toContain('align-items');
    }
  });
});
