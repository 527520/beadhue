import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';
import { fillField } from './helpers';
import { localHttps } from './localHttps';

test('HTTPS 同意初始化失败仍可看到错误并重试，失败期间不发送事件', async ({ browser, baseURL }) => {
  const proxy = await localHttps(baseURL!);
  const context = await browser.newContext({ baseURL: proxy.origin, ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    let grants = 0; let events = 0;
    await page.route('**/api/analytics/consent', async (route) => { grants++; await route.fulfill({ status: 503, json: { error: { code: 'UNKNOWN' } } }); });
    await page.route('**/api/analytics/events', async (route) => { events++; await route.fulfill({ status: 204 }); });
    await page.goto('/');
    const banner = page.getByRole('complementary', { name: '匿名使用统计' });
    await banner.getByRole('button', { name: '同意统计' }).click();
    await expect(banner.getByRole('alert')).toContainText('初始化');
    expect(grants).toBe(1); expect(events).toBe(0);
    await banner.getByRole('button', { name: '同意统计' }).click();
    await expect.poll(() => grants).toBe(2);
    await expect(banner.getByRole('alert')).toBeVisible(); expect(events).toBe(0);
  } finally { await context.close(); await proxy.close(); }
});

test('损坏的批次历史只显示读取失败，不影响新建批次与本地图片，重读后可恢复', async ({ page }) => {
  // 列表是页码分页，GET 会带 ?page=&size=，glob 必须用 * 才能命中（admin-round-3 06）。
  await page.route('**/api/admin/batches*', async (route) => {
    if (route.request().method() === 'GET') await route.fulfill({ json: { items: [{ id: '00000000-0000-4000-8000-000000000001', status: 'completed' }] } });
    else await route.continue();
  });
  await page.goto('/login?next=/admin/batches');
  await fillField(page, '邮箱', 'e2e-admin@example.com'); await fillField(page, '密码', 'E2e-pass-123!');
  await page.getByRole('button', { name: '登录', exact: true }).click(); await expect(page).toHaveURL(/\/admin\/batches$/);
  const history = page.getByRole('region', { name: '批次列表' });
  await expect(history.getByRole('alert')).toContainText('队列加载失败');
  await expect(history.locator('tbody tr')).toHaveCount(0);
  await page.unroute('**/api/admin/batches*');
  await history.getByRole('button', { name: '重新读取' }).click();
  await expect(history.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '新建批次' }).click();
  const naming = page.getByRole('dialog', { name: '新建官方批次' });
  await naming.getByLabel('批次名称').fill('E2E 历史损坏后新建');
  await naming.getByRole('button', { name: '开始选图' }).click();
  await page.getByLabel('选择图片', { exact: true }).setInputFiles(resolve('tests/fixtures/photo-gradient-64.png'));
  await expect(page.locator('[data-batch-card]')).toHaveCount(1);
});

test('发现页：「精选」类目与「最新发布」排序都能直达，五宽度无横向溢出且可访问', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium');
  // 发现页首屏由服务端直接查库渲染，用种子里的公开作品（标题会被前面的审核用例改掉，只认「作品卡」）。
  await page.goto('/');
  await page.getByRole('button', { name: '不同意', exact: true }).click();
  await expect(page.getByRole('link', { name: /^查看「/ }).first()).toBeVisible();
  await page.getByRole('navigation', { name: '类目' }).getByRole('link', { name: '精选' }).click();
  await expect(page).toHaveURL(/[?&]cat=/);
  await expect(page.getByRole('heading', { level: 1, name: '精选' })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: '排序：推荐' }).click();
  await page.getByRole('navigation', { name: '排序' }).getByRole('link', { name: '最新发布' }).click();
  await expect(page).toHaveURL(/[?&]sort=new/);
  await expect(page.getByRole('button', { name: '排序：最新发布' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^查看「/ }).first()).toBeVisible();
  for (const width of [350, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).analyze()).violations.filter((entry) => ['serious', 'critical'].includes(entry.impact ?? ''))).toEqual([]);
    if ([350, 1440].includes(width)) await page.screenshot({ path: resolve(`.scratch/site-ux/home-shelves-${width}.png`), fullPage: true });
  }
});
