// 票 10 后台截图：node shoot-admin.mjs impl|proto <名称=路径[@动作]>… [--widths=1440,1024,768,390,350] [--full]
// impl：IMPL_BASE（默认 http://127.0.0.1:3111），自动以 e2e-admin 登录；proto：原型静态服务 http://127.0.0.1:4180。
// 动作：@click:<文本> 点击按钮/链接；@row 点击表格第一行；@key:<键>。截图写到 evidence/impl/10/<名称>-<side>-<宽>.png。
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [side, ...rest] = process.argv.slice(2);
const widths = (rest.find((arg) => arg.startsWith('--widths='))?.slice(9) ?? '1440,1024,768,390,350').split(',').map(Number);
const full = rest.includes('--full');
const shots = rest.filter((arg) => !arg.startsWith('--'));
const IMPL = process.env.IMPL_BASE ?? 'http://127.0.0.1:3111';
const PROTO = `${process.env.PROTO_BASE ?? 'http://127.0.0.1:4180'}/.scratch/ui-rebuild/prototype/index.html#`;
const out = resolve('.scratch/ui-rebuild/evidence/impl/10');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 1 });
const page = await context.newPage();
if (side === 'impl') {
  await page.goto(`${IMPL}/login`);
  const status = await page.evaluate(async () => (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'e2e-admin@example.com', password: 'E2e-pass-123!' }) })).status);
  if (status >= 300) throw new Error(`login ${status}`);
}
for (const spec of shots) {
  const [name, target] = spec.split('=');
  const [path, ...actions] = target.split('@');
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.goto(side === 'impl' ? `${IMPL}${path}` : `${PROTO}${path}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(side === 'impl' ? 1200 : 400);
    for (const action of actions) {
      if (action === 'row') await page.locator('tbody tr, [data-row-card]').filter({ visible: true }).first().click();
      else if (action.startsWith('click:')) await page.getByRole('button', { name: action.slice(6) }).filter({ visible: true }).first().click();
      else if (action.startsWith('key:')) await page.keyboard.press(action.slice(4));
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: `${out}/${name}-${side}-${width}.png`, fullPage: full });
    console.log(`${name}-${side}-${width}`);
  }
}
await browser.close();
