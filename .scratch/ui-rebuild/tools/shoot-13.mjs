// 票 13 清理后的冒烟截图：node .scratch/ui-rebuild/tools/shoot-13.mjs [base]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:3101';
const out = '.scratch/ui-rebuild/evidence/impl/13';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();

async function login(page, email) {
  await page.goto(`${base}/login`);
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill('E2e-pass-123!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function shoot(name, width, run) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  try {
    await run(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true });
    console.log('ok', name, width);
  } catch (error) {
    console.log('FAIL', name, width, String(error).slice(0, 200));
  } finally {
    await context.close();
  }
}

for (const width of [1440, 390]) {
  await shoot('home', width, (page) => page.goto(base));
  await shoot('app', width, (page) => page.goto(`${base}/app`));
  await shoot('help', width, (page) => page.goto(`${base}/help`));
  await shoot('submit', width, async (page) => { await login(page, 'e2e-user@example.com'); await page.goto(`${base}/community/submit`); });
  await shoot('forbidden', width, async (page) => { await login(page, 'e2e-moderator@example.com'); await page.goto(`${base}/admin/users`); });
  await shoot('admin-batches', width, async (page) => { await login(page, 'e2e-admin@example.com'); await page.goto(`${base}/admin/batches`); await page.getByRole('button', { name: '新建批次' }).first().click(); });
  await shoot('admin-reviews', width, async (page) => { await login(page, 'e2e-admin@example.com'); await page.goto(`${base}/admin/reviews`); });
}
await browser.close();
