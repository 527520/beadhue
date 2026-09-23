// 票 01 浏览器核查：在 /dev/ui 上以「生产同款」style-src-elem nonce 策略打开所有弹层，
// 记录运行时新增的 <style>、CSP 违规、Tab 焦点圈定，以及旧样式对新组件计算样式的干扰。
// 用法：node .scratch/ui-rebuild/tools/probe-kit.mjs [--app=http://127.0.0.1:3100]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const appArg = process.argv.find((arg) => arg.startsWith('--app='));
const APP = appArg ? appArg.slice(6) : 'http://127.0.0.1:3100';
const OUT = resolve('.scratch/ui-rebuild/evidence/impl/01');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const report = {};

async function open(width, strict = false) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  // 开发环境 style-src-elem 放行 unsafe-inline；这里改写成生产同款的 nonce 策略。
  if (strict) await page.route(`${APP}/dev/ui`, async (route) => {
    const response = await route.fetch();
    const headers = response.headers();
    const csp = headers['content-security-policy'] ?? '';
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    headers['content-security-policy'] = csp.replace(/style-src-elem[^;]*/, `style-src-elem 'self' 'nonce-${nonce}'`);
    await route.fulfill({ response, headers });
  });
  const violations = [];
  
  await page.addInitScript(() => {
    window.__styles = [];
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node.nodeName === 'STYLE') window.__styles.push({ nonce: node.nonce || node.getAttribute('nonce') || '', text: (node.textContent || '').slice(0, 80) });
    }).observe(document, { childList: true, subtree: true });
    document.addEventListener('securitypolicyviolation', (event) => { if (!/next-devtools/.test(event.sourceFile)) window.__styles.push({ violation: event.violatedDirective, source: event.sourceFile, sample: event.sample }); });
  });
  await page.goto(`${APP}/dev/ui`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return { context, page, violations };
}

// 1. 逐个打开弹层（每项新开页面），看运行时 <style>；2. Tab 焦点圈定与归还
{
  const actions = [
    ['select', async (page) => { await page.locator('#kit-input').getByRole('combobox', { name: '色板' }).click(); await page.getByRole('option').nth(1).click(); }],
    ['menu', async (page) => { await page.locator('#kit-menu').getByRole('button', { name: '更多操作' }).click(); await page.waitForTimeout(300); await page.screenshot({ path: resolve(OUT, 'state-menu-1440.png') }); }],
    ['sort', async (page) => { await page.locator('#kit-menu').getByRole('button', { name: '推荐' }).click(); await page.getByRole('menuitemradio').nth(1).click(); }],
    ['popover', async (page) => { await page.locator('#kit-popover').getByRole('button', { name: '筛选' }).click(); await page.waitForTimeout(300); await page.screenshot({ path: resolve(OUT, 'state-filter-1440.png') }); }],
    ['suggest', async (page) => { await page.getByRole('button', { name: '打开建议面板' }).click(); await page.waitForTimeout(300); await page.screenshot({ path: resolve(OUT, 'state-suggest-1440.png') }); }],
    ['dialog', async (page) => { await page.getByRole('button', { name: '打开弹窗' }).click(); await page.waitForTimeout(400); await page.screenshot({ path: resolve(OUT, 'state-dialog-1440.png') }); }],
    ['sheet', async (page) => { await page.getByRole('button', { name: '打开抽屉' }).click(); await page.waitForTimeout(400); await page.screenshot({ path: resolve(OUT, 'state-sheet-1440.png') }); }],
    ['toast', async (page) => { await page.locator('#kit-toast').getByRole('button', { name: '删除设计', exact: true }).click(); await page.waitForTimeout(400); await page.screenshot({ path: resolve(OUT, 'state-toast-1440.png') }); }],
    ['tooltip', async (page) => { await page.getByRole('button', { name: '放大' }).hover(); await page.waitForTimeout(700); report.tooltipVisible = await page.locator('[data-slot="tooltip"]', { hasText: '放大' }).isVisible(); }],
    ['focus', async (page) => {
      const trigger = page.getByRole('button', { name: '打开弹窗' });
      await trigger.click();
      await page.waitForTimeout(400);
      const escaped = [];
      for (let i = 0; i < 8; i += 1) {
        await page.keyboard.press('Tab');
        const where = await page.evaluate(() => { const el = document.activeElement; return el?.closest('[role="dialog"]') || el === document.body || el?.dataset.type === 'inside' ? '' : el?.outerHTML.slice(0, 80); });
        if (where) escaped.push(where);
      }
      report.focusEscapes = escaped;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      report.focusReturned = await trigger.evaluate((node) => node === document.activeElement);
    }],
  ];
  report.actionErrors = [];
  report.runtimeStyles = [];
  for (const [name, run] of actions) {
    const { context, page } = await open(1440);
    try { await run(page); } catch (error) { report.actionErrors.push(`${name}: ${error.message.split('\n').slice(0, 4).join(' / ')}`); }
    const styles = await page.evaluate(() => window.__styles.filter((item) => !/__nextjs-Geist/.test(item.text ?? '')));
    if (styles.length) report.runtimeStyles.push({ name, styles });
    await context.close();
  }
}

// 3. 旧样式干扰：同一页面在移除旧 globals / beadhue 样式表前后，新组件计算样式是否一致
for (const [width, mobile] of [[1440, false], [390, true]]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await context.newPage();
  await page.goto(`${APP}/dev/ui`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const props = ['min-width', 'min-height', 'width', 'height', 'font-size', 'line-height', 'font-weight', 'color', 'background-color', 'border-top-width', 'border-radius', 'outline-style', 'opacity', 'padding-left', 'box-shadow', 'font-family'];
  const snap = () => page.evaluate((list) => [...document.querySelectorAll('[data-ui] *')].slice(0, 4000).map((node) => { const style = getComputedStyle(node); return list.map((prop) => style.getPropertyValue(prop)).join('|'); }), props);
  const before = await snap();
  const removed = await page.evaluate(() => {
    let count = 0;
    // 只保留新构建的输出（ui 层工具类、theme 层变量、[data-ui] 基础规则、令牌媒体查询、ui-* 关键帧），删掉其余旧规则。
    const keepTop = (rule) => {
      if (rule instanceof CSSLayerBlockRule) return ['ui', 'theme', 'properties', 'base'].includes(rule.name) ? 'keep' : 'drop';
      if (rule instanceof CSSLayerStatementRule || rule instanceof CSSPropertyRule || rule instanceof CSSFontFaceRule) return 'keep';
      if (rule instanceof CSSKeyframesRule) return rule.name.startsWith('ui-') ? 'keep' : 'drop';
      if (rule instanceof CSSMediaRule) return /--text-display|--spacing-gutter|--spacing-control-md/.test(rule.cssText) ? 'keep' : 'drop';
      if (rule instanceof CSSStyleRule) return /base-ui-disable-scrollbar/.test(rule.selectorText) ? 'keep' : 'drop';
      return 'drop';
    };
    for (const sheet of [...document.styleSheets]) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (let i = rules.length - 1; i >= 0; i -= 1) {
        const verdict = keepTop(rules[i]);
        if (verdict === 'drop') { sheet.deleteRule(i); count += 1; }
        else if (verdict === 'filter') {
          const inner = rules[i].cssRules;
          for (let j = inner.length - 1; j >= 0; j -= 1) if (!(inner[j].selectorText ?? '').includes('data-ui')) rules[i].deleteRule(j);
        }
      }
    }
    return count;
  });
  await page.waitForTimeout(300);
  const after = await snap();
  const diffs = [];
  const nodes = await page.evaluate(() => [...document.querySelectorAll('[data-ui] *')].slice(0, 4000).map((node) => `${node.tagName.toLowerCase()}${node.getAttribute('data-slot') ? `[${node.getAttribute('data-slot')}]` : ''}`));
  before.forEach((value, index) => {
    if (value !== after[index]) {
      const a = value.split('|'); const b = after[index].split('|');
      const changed = props.filter((_, i) => a[i] !== b[i]).map((prop, i) => `${prop}: ${a[props.indexOf(prop)]} → ${b[props.indexOf(prop)]}`);
      diffs.push(`${nodes[index]} ${changed.join('; ')}`);
    }
  });
  report[`legacyInterference${width}`] = { removedSheets: removed, diffCount: diffs.length, sample: [...new Set(diffs)].slice(0, 15) };
  await context.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 1));
