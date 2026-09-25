// 票 14：生产构建上用密集统计数据看匿名分析页——近 30 / 90 天精确统计、180 天长期趋势与「按分类查看每日趋势」。
// 由 production-smoke.sh 调用：AFTER_SMOKE="node .scratch/ui-rebuild/tools/analytics-dense.mjs"；
// DATABASE_URL、E2E_BASE_URL、E2E_ADMIN_SESSION_TOKEN 由它导出。数据只写进冒烟用的临时库。
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import pg from 'pg';

const OUT = '.scratch/ui-rebuild/evidence/analytics-dense';
mkdirSync(OUT, { recursive: true });
const BASE = process.env.E2E_BASE_URL;
const DAY = 86_400_000;
const now = Date.now();
const shanghaiDay = (time) => new Date(time + 8 * 3_600_000).toISOString().slice(0, 10);
const today = shanghaiDay(now);
const daysAgo = (n) => shanghaiDay(now - n * DAY);
let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
async function insertRows(table, columns, rows) {
  for (let offset = 0; offset < rows.length; offset += 400) {
    const chunk = rows.slice(offset, offset + 400);
    const values = chunk.map((row, r) => `(${row.map((_, c) => `$${r * row.length + c + 1}`).join(',')})`).join(',');
    await pool.query(`insert into ${table}(${columns.join(',')}) values ${values} on conflict do nothing`, chunk.flat());
  }
}

const visitors = Array.from({ length: 60 }, () => randomUUID());
await insertRows('analytics_visitors', ['id', 'token_hash'], visitors.map((id) => [id, `dense-${id}`]));

const device = () => (rand() < 0.55 ? 'mobile' : rand() < 0.8 ? 'desktop' : 'tablet');
const events = [];
for (let n = 89; n >= 1; n -= 1) {
  const views = 25 + Math.round(18 * Math.sin(n / 9) + 15 * rand());
  for (let i = 0; i < views; i += 1) {
    const at = new Date(now - n * DAY - rand() * 6 * 3_600_000);
    const who = visitors[Math.floor(rand() * visitors.length)];
    const kind = device();
    events.push([randomUUID(), who, randomUUID(), 'page_viewed', at, kind]);
    if (rand() < 0.35) events.push([randomUUID(), who, randomUUID(), 'generation_succeeded', at, kind]);
    if (rand() < 0.15) events.push([randomUUID(), who, randomUUID(), 'design_exported', at, kind]);
  }
}
await insertRows('analytics_events', ['event_id', 'visitor_id', 'session_id', 'name', 'occurred_at', 'device_type'].concat(['app_version', 'actor_type', 'path', 'browser_family', 'os_family']),
  events.map((row) => [...row, '0.5.0', 'anonymous', '/', 'chrome', 'macos']));

const rollups = [];
for (let n = 180; n >= 1; n -= 1) {
  const views = 25 + Math.round(18 * Math.sin(n / 9) + 15 * rand());
  const generated = Math.round(views * (0.25 + 0.15 * rand()));
  const exported = Math.round(views * (0.1 + 0.08 * rand()));
  const day = daysAgo(n);
  rollups.push([day, '__all__', 'all', 'all', views + generated + exported, Math.round(views * 0.6)]);
  rollups.push([day, 'page_viewed', 'all', 'all', views, Math.round(views * 0.6)]);
  rollups.push([day, 'generation_succeeded', 'all', 'all', generated, Math.round(generated * 0.8)]);
  rollups.push([day, 'design_exported', 'all', 'all', exported, Math.round(exported * 0.9)]);
  const mobile = Math.round((views + generated + exported) * (0.5 + 0.1 * rand()));
  const desktop = Math.round((views + generated + exported - mobile) * 0.75);
  rollups.push([day, '__all__', 'device', 'mobile', mobile, Math.round(mobile * 0.6)]);
  rollups.push([day, '__all__', 'device', 'desktop', desktop, Math.round(desktop * 0.6)]);
  rollups.push([day, '__all__', 'device', 'tablet', views + generated + exported - mobile - desktop, 3]);
}
await insertRows('analytics_daily_rollups', ['day', 'event_name', 'dimension_name', 'dimension_value', 'event_count', 'unique_visitors'], rollups);
await pool.end();
console.log(`seeded ${events.length} events (89 days), ${rollups.length} rollup rows (180 days)`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([
  { name: 'beadhue_session', value: process.env.E2E_ADMIN_SESSION_TOKEN, url: BASE, httpOnly: true, sameSite: 'Lax' },
  { name: 'beadhue_analytics_consent', value: 'denied', url: BASE, sameSite: 'Lax' },
]);
const page = await context.newPage();
const failures = [];
const views = [
  ['30', `/admin/analytics?start=${daysAgo(29)}&end=${today}`, [1440, 390]],
  ['90', `/admin/analytics?start=${daysAgo(89)}&end=${today}`, [1440, 350]],
  ['180-device', `/admin/analytics?start=${daysAgo(179)}&end=${today}&dimension=device`, [1440, 1024, 768, 390, 350]],
];
for (const [name, path, widths] of views) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${BASE}${path}`);
    await page.getByRole('heading', { level: 1, name: '匿名分析' }).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) failures.push(`${name}@${width}: 横向溢出 ${overflow}px`);
    const labels = await page.getByRole('group', { name: '每日访客、生成图纸与导出文件' }).evaluate((group) => group.lastElementChild.querySelectorAll('span').length);
    const tabStops = await page.getByRole('group', { name: '每日访客、生成图纸与导出文件' }).locator('button[tabindex="0"]').count();
    if (labels > 7 || tabStops !== 1) failures.push(`${name}@${width}: 横轴 ${labels} 个日期、${tabStops} 个 Tab 位`);
    const serious = (await new AxeBuilder({ page }).exclude('[data-base-ui-focus-guard]').analyze()).violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
    if (serious.length) failures.push(`${name}@${width}: axe ${serious.map((v) => v.id).join(', ')}`);
    await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: true });
    console.log(`${name}@${width}: 横轴 ${labels} 个日期、Tab 位 ${tabStops}、溢出 ${Math.max(0, overflow)}px、axe ${serious.length}`);
  }
}

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/admin/analytics?start=${daysAgo(179)}&end=${today}&dimension=device`);
const card = page.getByRole('region', { name: '按分类查看每日趋势' });
await card.getByRole('combobox', { name: '分类' }).click();
await page.getByRole('option', { name: '手机', exact: true }).click();
const column = card.getByRole('group', { name: '「手机」每日事件数' }).locator('button[tabindex="0"]');
await column.focus();
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowLeft');
const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
console.log(`分类趋势：切到「手机」，方向键后焦点 ${focused}`);
if (!focused?.includes('事件数')) failures.push('分类趋势：方向键没有移到前一天');
await card.screenshot({ path: `${OUT}/dimension-trend-focus-1440.png` });

await browser.close();
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
console.log('analytics dense: all checks passed');
