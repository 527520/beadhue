// 走查脚本报出 axe 问题后，逐页打印违规节点（选择器、HTML、对比度数据），定位到具体组件。
// 用法：IMPL_BASE=http://127.0.0.1:3170 node .scratch/ui-rebuild/tools/axe-detail.mjs <身份 guest|user|admin> <宽度> <路由…>
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = (process.env.IMPL_BASE ?? 'http://127.0.0.1:3170').replace(/\/$/, '');
const F = JSON.parse(readFileSync(resolve('.scratch/ui-rebuild/evidence/audit/fixtures.json'), 'utf8'));
const [who, width, ...routes] = process.argv.slice(2);
const { default: AxeBuilder } = await import('@axe-core/playwright');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: Number(width), height: 900 }, locale: 'zh-CN', isMobile: Number(width) < 768, hasTouch: Number(width) < 768 });
const page = await context.newPage();
if (who !== 'guest') {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('邮箱').fill(F.accounts[who]);
  await page.getByLabel('密码', { exact: true }).fill(F.password ?? 'E2e-pass-123!');
  await page.getByLabel('密码', { exact: true }).press('Enter');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}
for (const route of routes) {
  await page.goto(`${BASE}${route}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  const { violations } = await new AxeBuilder({ page }).analyze();
  for (const item of violations.filter((entry) => ['serious', 'critical'].includes(entry.impact ?? ''))) {
    for (const node of item.nodes) {
      const data = node.any?.[0]?.data;
      console.log(`${route} | ${item.id} | ${node.target.join(' ')} | ${node.html.slice(0, 180)} | ${data ? JSON.stringify({ fg: data.fgColor, bg: data.bgColor, ratio: data.contrastRatio, size: data.fontSize, weight: data.fontWeight }) : ''}`);
    }
  }
}
await browser.close();
