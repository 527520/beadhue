// 票 03 外壳对照截图：原型与实现同状态、同宽度各截一张，输出到 evidence/impl/03/。
// 用法：
//   node .scratch/ui-rebuild/tools/shoot-shell.mjs proto [状态名…]
//   node .scratch/ui-rebuild/tools/shoot-shell.mjs impl  [状态名…]   （需要实现已在 IMPL_BASE 运行，默认 http://127.0.0.1:3101）
// 实现侧的登录态用 IMPL_STATE 指向 Playwright storageState 文件（shoot-shell-login.mjs 生成）。
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [target = 'proto', ...only] = process.argv.slice(2);
const OUT = resolve('.scratch/ui-rebuild/evidence/impl/03');
mkdirSync(OUT, { recursive: true });
const PROTO = 'http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/index.html';
const IMPL = process.env.IMPL_BASE ?? 'http://127.0.0.1:3101';
const IMPL_STATE = process.env.IMPL_STATE ?? resolve('.scratch/ui-rebuild/evidence/impl/03/login-state.json');
const ALL = [1440, 1024, 768, 390, 350];
const MOBILE = [390, 350];
const DESKTOP = [1440, 1024, 768];

// 每个状态：proto / impl 路由、是否游客、截图前动作（click / focus / type / press / wait）、宽度。
const STATES = [
  { name: 'top', proto: '#/', impl: '/', widths: ALL },
  { name: 'top-guest', proto: '#/', impl: '/', guest: true, widths: ALL },
  { name: 'search-panel', proto: '#/', impl: '/', widths: DESKTOP, proto_actions: [['focus', '[data-search] input']], impl_actions: [['focus', 'header [data-slot=search-input]']] },
  { name: 'search-typed', proto: '#/', impl: '/', widths: [1440, 1024], proto_actions: [['focus', '[data-search] input'], ['type', '[data-search] input', '猫']], impl_actions: [['focus', 'header [data-slot=search-input]'], ['type', 'header [data-slot=search-input]', '猫']] },
  { name: 'account-menu', proto: '#/', impl: '/', widths: DESKTOP, proto_actions: [['click', '[data-account]']], impl_actions: [['click', 'header [data-account]']] },
  { name: 'login', proto: '#/', impl: '/', guest: true, widths: ALL, proto_actions: [['click', 'header [data-login], .m-topbar [data-login]']], impl_actions: [['click', '[data-login]:visible']] },
  { name: 'login-errors', proto: '#/', impl: '/', guest: true, widths: [1440, 390], proto_actions: [['click', 'header [data-login], .m-topbar [data-login]'], ['click', '[data-login-form] button[type="submit"]']], impl_actions: [['click', '[data-login]:visible'], ['click', '[data-login-form] button[type="submit"]']] },
  { name: 'consent', proto: '#/', impl: '/', guest: true, consent: true, widths: ALL },
  { name: 'mobile-search', proto: '#/search', impl: '/', widths: MOBILE, impl_actions: [['click', '[data-mobile-search]:visible']] },
  { name: 'me-top', proto: '#/me', impl: '/me', widths: [1440, 390] },
  { name: 'settings-top', proto: '#/me/settings', impl: '/me/settings', widths: [390] },
  { name: 'detail-top', proto: '#/works/w-cat', impl: process.env.IMPL_WORK ?? '/', widths: [1440, 390] },
  { name: 'create-top', proto: '#/create', impl: '/app', widths: [1440, 1024, 390] },
  { name: 'author-top', proto: '#/u/official', impl: '/u/beadhue-official', widths: [1440, 390] },
  { name: 'footer', proto: '#/?cat=动物', impl: '/help', widths: [1440, 1024, 768], scrollBottom: true },
];

const browser = await chromium.launch();
for (const state of STATES) {
  if (only.length && !only.includes(state.name)) continue;
  for (const width of state.widths) {
    const mobile = width < 768;
    const storageState = target === 'impl' && !state.guest && existsSync(IMPL_STATE) ? IMPL_STATE : undefined;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, storageState });
    if (target === 'proto') {
      await context.addInitScript(([guest, consent]) => {
        if (!consent) sessionStorage.setItem('proto-consent', 'yes');
        sessionStorage.setItem('proto-intro-closed', '1');
        sessionStorage.setItem('proto-guest', guest ? '1' : '0');
        localStorage.setItem('proto-recent', JSON.stringify(['猫咪', '樱花杯垫']));
      }, [Boolean(state.guest), Boolean(state.consent)]);
    } else {
      const host = new URL(IMPL).hostname;
      if (!state.consent) await context.addCookies([{ name: 'beadhue_analytics_consent', value: 'denied', domain: host, path: '/' }]);
      await context.addInitScript(() => {
        localStorage.setItem('beadhue:recent-searches', JSON.stringify(['猫咪', '樱花杯垫']));
        localStorage.setItem('beadhue:intro-closed', '1');
      });
    }
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = target === 'proto' ? `${PROTO}${state.proto}` : `${IMPL}${state.impl}`;
    await page.goto(url, { waitUntil: 'load' });
    if (target === 'impl') await page.waitForFunction(() => document.documentElement.dataset.beadhueHydrated === 'true', undefined, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(target === 'proto' ? 900 : 1500);
    if (state.scrollBottom) { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(400); }
    for (const [kind, selector, value] of state[`${target}_actions`] ?? []) {
      const node = page.locator(selector).first();
      if (!(await node.count())) { console.log(`  跳过（找不到）${state.name} ${width} ${selector}`); continue; }
      if (kind === 'click') await node.click({ timeout: 3000 }).catch(() => node.dispatchEvent('click'));
      if (kind === 'focus') await node.focus();
      if (kind === 'type') await node.pressSequentially(value, { delay: 60 });
      if (kind === 'press') await node.press(value);
      await page.waitForTimeout(700);
    }
    const name = `${target}-${state.name}-${width}.png`;
    await page.screenshot({ path: resolve(OUT, name) });
    console.log('shot', name, errors.length ? `错误：${errors.join(' | ')}` : '');
    await context.close();
  }
}
await browser.close();
