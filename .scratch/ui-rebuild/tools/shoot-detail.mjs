// 作品详情页自检（临时）：多状态 × 多宽度截图，并检查页面报错、横向溢出、工具条是否在舞台内、被省略的文字。
// 用法：node .scratch/ui-rebuild/tools/shoot-detail.mjs [--w=1440,390] [--only=cat,guest]
// 需先在仓库根目录运行 python3 -m http.server 4180。输出到 evidence/prototype/detail-*.png。
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const pick = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const widths = (pick('w') ?? '1440,1024,768,390,350').split(',').map(Number);
const only = pick('only')?.split(',');
const OUT = resolve('.scratch/ui-rebuild/evidence/prototype');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/index.html';

const visible = (selector) => `${selector} >> visible=true`;
// 步骤：['click', 选择器] | ['force', 选择器]（aria-disabled 也点）| ['fill', 选择器, 文本] | ['scroll', 选择器] | ['wait', 毫秒]
const SCENES = [
  { name: 'cat', route: '#/works/w-cat' },
  { name: 'cat-page', route: '#/works/w-cat', full: true },
  { name: 'rainbow', route: '#/works/w-rainbow-soft' },
  { name: 'rainbow-page', route: '#/works/w-rainbow-soft', full: true },
  { name: 'guest', route: '#/works/w-cat', guest: true },
  { name: 'guest-page', route: '#/works/w-cat', guest: true, full: true },
  { name: 'nocomments', route: '#/works/w-heart?nocomments=1', full: true },
  { name: 'share', route: '#/works/w-cat', steps: [['click', visible('[data-wd-share]')]] },
  { name: 'more', route: '#/works/w-cat', steps: [['click', visible('[data-wd-more]')]] },
  { name: 'report', route: '#/works/w-cat', steps: [['click', visible('[data-wd-more]')], ['click', '[data-pick="report"]'], ['click', '.wd-reason:nth-child(2)'], ['fill', '#wd-report-note', '图纸和另一位作者的作品几乎一样']] },
  { name: 'make', route: '#/works/w-cat', steps: [['click', visible('[data-wd-make]')]] },
  { name: 'license', route: '#/works/w-cat', steps: [['scroll', '[data-wd-license]'], ['click', '[data-wd-license]']] },
  { name: 'codes', route: '#/works/w-cat', steps: [['click', visible('[data-v="codes"]')]] },
  { name: 'seams', route: '#/works/w-rainbow-soft', steps: [['click', visible('[data-v="seams"]')]] },
  { name: 'zoom', route: '#/works/w-cat', steps: [['click', visible('[data-v="in"]')], ['click', visible('[data-v="in"]')], ['click', visible('[data-v="in"]')]] },
  { name: 'colors', route: '#/works/w-icecream', steps: [['click', visible('[data-wd-colors]')]] },
  { name: 'guest-codes', route: '#/works/w-cat', guest: true, steps: [['force', visible('[data-v="codes"]')]] },
  { name: 'typed', route: '#/works/w-cat', steps: [['scroll', '#wd-comment'], ['fill', '#wd-comment', '拼好啦！耳朵用 F2 樱粉比图纸上更显眼，推荐试试。']] },
  { name: 'scrolled', route: '#/works/w-cat', steps: [['scroll', '.wd-comments li:last-child']] },
  { name: 'fullscreen', route: '#/works/w-rainbow-soft', desktop: true, steps: [['click', visible('[data-v="full"]')], ['wait', 400]] },
];

const browser = await chromium.launch();
const problems = [];
for (const width of widths) {
  const mobile = width < 768;
  const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await context.addInitScript(() => { sessionStorage.setItem('proto-consent', 'yes'); });
  for (const scene of SCENES) {
    if (only && !only.includes(scene.name)) continue;
    if (scene.desktop && mobile) continue;
    const page = await context.newPage();
    const tag = `${scene.name}-${width}`;
    page.on('pageerror', (error) => problems.push(`${tag} 页面报错：${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') problems.push(`${tag} 控制台：${message.text()}`); });
    await page.goto(`${BASE}${scene.guest ? '?guest=1' : ''}${scene.route}`);
    await page.waitForTimeout(900);
    for (const [kind, selector, value] of scene.steps ?? []) {
      if (kind === 'wait') { await page.waitForTimeout(selector); continue; }
      const target = page.locator(selector).first();
      if (!(await target.count())) { problems.push(`${tag} 找不到：${selector}`); continue; }
      try {
        if (kind === 'click') await target.click({ timeout: 5000 });
        if (kind === 'force') await target.click({ force: true, timeout: 5000 });
        if (kind === 'fill') await target.fill(value, { timeout: 5000 });
        if (kind === 'scroll') await target.evaluate((node) => node.scrollIntoView({ block: 'center' }));
      } catch (error) {
        problems.push(`${tag} 操作失败：${kind} ${selector}：${error.message.split('\n')[0]}`);
      }
      await page.waitForTimeout(450);
    }
    const report = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out = [];
      if (document.documentElement.scrollWidth > vw + 1) out.push(`横向滚动：scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
      const clipped = (node) => {
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (/(hidden|auto|scroll|clip)/.test(style.overflowX) && parent !== document.body && parent !== document.documentElement) return true;
        }
        return false;
      };
      const wide = [...document.querySelectorAll('#app *, .overlay *, .popover *')].filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.right > vw + 0.5 || rect.left < -0.5) && !clipped(node) && getComputedStyle(node).position !== 'fixed';
      });
      wide.slice(0, 5).forEach((node) => out.push(`超出视口：${node.tagName.toLowerCase()}.${[...node.classList].join('.')} ${Math.round(node.getBoundingClientRect().left)}→${Math.round(node.getBoundingClientRect().right)}`));
      document.querySelectorAll('.wd-stage').forEach((stage) => {
        const s = stage.getBoundingClientRect();
        const t = stage.querySelector('.wd-toolbar').getBoundingClientRect();
        if (t.left < s.left - 0.5 || t.right > s.right + 0.5 || t.top < s.top - 0.5 || t.bottom > s.bottom + 0.5) out.push(`工具条溢出舞台：舞台 ${Math.round(s.left)}–${Math.round(s.right)}，工具条 ${Math.round(t.left)}–${Math.round(t.right)}`);
      });
      const cut = [...document.querySelectorAll('#app *, .overlay *, .popover *')].filter((node) => {
        const style = getComputedStyle(node);
        return style.textOverflow === 'ellipsis' && node.scrollWidth > node.clientWidth + 1 && node.getBoundingClientRect().width > 0;
      }).map((node) => `「${node.textContent.trim().slice(0, 16)}」`);
      if (cut.length) out.push(`省略号截断：${cut.slice(0, 6).join(' ')}`);
      return out;
    });
    report.forEach((line) => problems.push(`${tag} ${line}`));
    const name = `detail-${tag}.png`;
    await page.screenshot({ path: resolve(OUT, name), fullPage: Boolean(scene.full) });
    console.log('shot', name);
    await page.close();
  }
  await context.close();
}
await browser.close();
console.log(problems.length ? `问题：\n${[...new Set(problems)].join('\n')}` : '没有发现问题');
