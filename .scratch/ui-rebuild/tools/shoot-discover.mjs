// 票 04 发现页对照截图：原型与实现同状态、同宽度各截一张，输出到 evidence/impl/04/。
// 用法：
//   BASE=http://127.0.0.1:3121 node .scratch/ui-rebuild/tools/capture-current.mjs seed   （先补样例作品与标签）
//   node .scratch/ui-rebuild/tools/shoot-discover.mjs setup                             （把原型的类目标签设为 featured + 图标）
//   node .scratch/ui-rebuild/tools/shoot-discover.mjs proto|impl [状态名…]
// 环境变量：IMPL_BASE（默认 http://127.0.0.1:3121）、PROTO_BASE（默认 http://127.0.0.1:4180）。
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [target = 'proto', ...only] = process.argv.slice(2);
const OUT = resolve('.scratch/ui-rebuild/evidence/impl/04');
mkdirSync(OUT, { recursive: true });
const PROTO = `${process.env.PROTO_BASE ?? 'http://127.0.0.1:4180'}/.scratch/ui-rebuild/prototype/index.html`;
const IMPL = process.env.IMPL_BASE ?? 'http://127.0.0.1:3121';
const STATE_FILE = resolve(OUT, 'login-state.json');
const ALL = [1440, 1024, 768, 390, 350];

/** 原型 data.js 的类目顺序与图标键。 */
const CATEGORIES = [['动物', 'panda'], ['猫咪', 'cat'], ['星星人', 'star'], ['水果', 'strawberry'], ['甜品', 'icecream'], ['花草', 'sakura'], ['植物', 'mushroom'], ['天气', 'rainbow'], ['夏天', 'watermelon'], ['可爱', 'heart']];

const filterBtn = { proto: '[data-open-filter]', impl: 'role=button[name=/^筛选/]' };
const sortBtn = { proto: '[data-open-sort]', impl: 'role=button[name=/^排序/]' };
const STATES = [
  { name: 'top', proto: '#/', impl: '/', widths: ALL },
  { name: 'intro', proto: '#/', impl: '/', intro: true, widths: [1440, 768, 390] },
  { name: 'search', proto: '#/search?q=猫', impl: '/?q=猫', widths: ALL },
  { name: 'empty', proto: '#/search?q=恐龙', impl: '/?q=恐龙', widths: [1440, 768, 390, 350] },
  { name: 'filter', proto: '#/?cat=动物', impl: '/?cat=动物', widths: [1440, 1024, 390], actions: [['click', filterBtn]] },
  { name: 'filter-picked', proto: '#/?cat=动物', impl: '/?cat=动物', widths: [1440, 390], actions: [['click', filterBtn], ['click', { proto: '[data-filter="colors"][data-value="few"]', impl: 'role=button[name="6 色以内"]' }]] },
  { name: 'chips', proto: '#/?cat=动物&size=m&colors=few', impl: '/?cat=动物&size=m&colors=few', widths: [1440, 390] },
  { name: 'sort', proto: '#/', impl: '/', widths: [1440, 390], actions: [['click', sortBtn]] },
  { name: 'mobile-search', proto: '#/search', impl: '/', widths: [390], actions: [['click', { impl: '[data-mobile-search]:visible' }]] },
  { name: 'scrolled', proto: '#/', impl: '/', widths: [1440, 390], scroll: 600 },
];

async function login(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${IMPL}/login?next=/`);
  await page.getByLabel('邮箱').first().fill(process.env.LOGIN_EMAIL ?? 'e2e-user@example.com');
  await page.getByLabel('密码').first().fill('E2e-pass-123!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL((url) => new URL(url).pathname === '/');
  await context.storageState({ path: STATE_FILE });
  return { context, page };
}

async function setup(browser) {
  process.env.LOGIN_EMAIL = 'e2e-admin@example.com';
  const { context, page } = await login(browser);
  const result = await page.evaluate(async (categories) => {
    const list = await (await fetch('/api/admin/community/tags?size=100')).json();
    const log = [];
    for (const [index, [name, icon]] of categories.entries()) {
      const tag = list.items.find((item) => item.name === name);
      if (!tag) { log.push(`缺标签 ${name}`); continue; }
      const response = await fetch(`/api/admin/community/tags/${tag.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ expectedVersion: tag.version, icon, featured: true, sortOrder: index + 1 }),
      });
      log.push(`${name} ${response.status}`);
    }
    return log;
  }, CATEGORIES);
  console.log(result.join('\n'));
  await context.close();
  delete process.env.LOGIN_EMAIL;
}

const browser = await chromium.launch();
if (target === 'setup') {
  await setup(browser);
} else {
  if (target === 'impl' && !existsSync(STATE_FILE)) await (await login(browser)).context.close();
  for (const state of STATES) {
    if (only.length && !only.includes(state.name)) continue;
    for (const width of state.widths) {
      const mobile = width < 768;
      const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, storageState: target === 'impl' ? STATE_FILE : undefined });
      if (target === 'proto') {
        await context.addInitScript((intro) => {
          sessionStorage.setItem('proto-consent', 'yes');
          if (!intro) sessionStorage.setItem('proto-intro-closed', '1');
          localStorage.setItem('proto-recent', JSON.stringify(['猫咪', '樱花杯垫']));
        }, Boolean(state.intro));
      } else {
        await context.addCookies([{ name: 'beadhue_analytics_consent', value: 'denied', domain: new URL(IMPL).hostname, path: '/' }]);
        await context.addInitScript((intro) => {
          localStorage.setItem('beadhue:recent-searches', JSON.stringify(['猫咪', '樱花杯垫']));
          if (!intro) localStorage.setItem('beadhue:discover-intro-closed', '1');
        }, Boolean(state.intro));
      }
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(target === 'proto' ? `${PROTO}${state.proto}` : `${IMPL}${state.impl}`, { waitUntil: 'load' });
      if (target === 'impl') await page.waitForFunction(() => document.documentElement.dataset.beadhueHydrated === 'true', undefined, { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(target === 'proto' ? 900 : 1800);
      if (state.scroll) { await page.evaluate((y) => window.scrollTo(0, y), state.scroll); await page.waitForTimeout(500); }
      for (const [kind, selectors] of state.actions ?? []) {
        const selector = selectors[target];
        if (!selector) continue;
        const node = page.locator(selector).first();
        if (!(await node.count())) { console.log(`  跳过（找不到）${state.name} ${width} ${selector}`); continue; }
        if (kind === 'click') await node.click({ timeout: 3000 }).catch(() => node.dispatchEvent('click'));
        await page.waitForTimeout(900);
      }
      const name = `${target}-${state.name}-${width}.png`;
      await page.screenshot({ path: resolve(OUT, name) });
      console.log('shot', name, errors.length ? `错误：${errors.join(' | ')}` : '');
      await context.close();
    }
  }
}
await browser.close();
