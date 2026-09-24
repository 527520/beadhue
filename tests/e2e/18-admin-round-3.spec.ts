import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { DEFAULT_GENERATION_PARAMS } from '../../src/lib/types';
import { fillField, uploadDraftOriginal } from './helpers';

/**
 * R14（admin-round-3）后台与豆社整改的浏览器验收：
 * 列表分页与内滚动、作品管理公开状态筛选、保存标签不重载列表、
 * 标签管理批量打标、发布确认弹窗两位数序号、后台不直接调用豆社公开接口。
 */

async function login(page: Page, next: string, email = 'e2e-admin@example.com') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  // 用仓库的抗水合助手：WebKit 上 React 挂载可能晚于首次填充，直接 fill 会丢值（登录停在 /login）。
  await fillField(page, '邮箱', email);
  await fillField(page, '密码', 'E2e-pass-123!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replaceAll('/', '\\/')}$`));
  await expect(page.locator('h1')).toBeVisible();
}

async function request(page: Page, method: string, url: string, body?: unknown) {
  const result = await page.evaluate(async ({ method, url, body, key }) => {
    const response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { method, url, body, key: randomUUID() });
  expect(result.status, `${method} ${url} -> ${result.status} ${JSON.stringify(result.body)}`).toBeLessThan(300);
  return result.body;
}

const snapshotFor = (code: string) => ({
  version: 1, engineVersion: 'e2e', boardProfile: '5mm-29',
  paletteSelection: { palette: { kind: 'builtin', brand: 'MARD' }, kitTier: 0 },
  params: { ...DEFAULT_GENERATION_PARAMS, backgroundPrototype: null },
  pattern: { width: 1, height: 1, cells: [{ hex: '#FAF4C8', code, transparent: false }] },
});

/** 建一个官方批次并保存 count 份草稿（可带原图），返回批次与草稿。 */
async function seedBatch(page: Page, count: number, withOriginals = false) {
  const suffix = randomUUID().slice(0, 6);
  const batch = await request(page, 'POST', '/api/admin/batches', {
    itemCount: count, defaultParams: DEFAULT_GENERATION_PARAMS, engineVersion: 'e2e', reason: `本地 R14 夹具 ${suffix}`,
  });
  const drafts: Array<{ revisionId: string; workId: string }> = [];
  for (let index = 0; index < count; index += 1) {
    const draft = await request(page, 'POST', `/api/admin/batches/${batch.id}/drafts`, {
      title: `官方作品 ${String(index + 1).padStart(2, '0')}`, reason: `本地 R14 夹具 ${suffix}`, snapshot: snapshotFor('A01'),
    });
    if (withOriginals) await uploadDraftOriginal(page, draft.revisionId);
    drafts.push({ revisionId: draft.revisionId, workId: draft.workId });
  }
  return { suffix, batch, drafts };
}

const rows = (page: Page) => page.locator('tbody tr');
/** 打开某个官方批次的四步工作室（批次表格 → 抽屉「继续处理」）。 */
async function openBatch(page: Page, batchId: string) {
  await rows(page).filter({ hasText: batchId.slice(0, 8) }).locator('[data-open]').click();
  await page.getByRole('button', { name: '继续处理' }).click();
}

test('标签列表默认每页 10、可翻页与跳页，分页通栏显示总数与每页条数', async ({ page }, info) => {
  await login(page, '/admin/tags');
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  for (let index = 0; index < 11; index += 1) await request(page, 'POST', '/api/admin/community/tags', { name: `分页夹具 ${suffix}-${index}`, sortOrder: -9000 + index, expectedVersion: 0 });
  await page.reload();
  await expect(rows(page)).toHaveCount(10);
  const pager = page.locator('[data-slot=pagination][data-variant=full]');
  const total = Number((await pager.locator('b').first().innerText()).replace(/\D/gu, ''));
  expect(total).toBeGreaterThan(10);
  await expect(pager.getByText('10 条')).toBeVisible();
  await pager.getByRole('button', { name: '下一页' }).click();
  await expect(rows(page)).toHaveCount(Math.min(10, total - 10));
  await pager.getByRole('textbox', { name: '跳到第几页' }).fill('1');
  await pager.getByRole('textbox', { name: '跳到第几页' }).press('Enter');
  await expect(rows(page)).toHaveCount(10);
  await expect(pager.getByRole('button', { name: '第 1 页' })).toHaveAttribute('aria-current', 'page');
});

test('作品管理按公开状态筛选，抽屉里改标签不重载列表', async ({ page }, info) => {
  await login(page, '/admin/works');
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const published = await seedBatch(page, 1, true);
  await request(page, 'POST', `/api/admin/batches/${published.batch.id}/publish`, {
    revisionIds: [published.drafts[0].revisionId], expectedVersion: published.batch.version, reason: '本地 R14 公开夹具',
  });
  const hidden = await seedBatch(page, 1, false);
  const hiddenTitle = `未公开夹具 ${suffix}`;
  await request(page, 'PATCH', `/api/admin/batches/${hidden.batch.id}/drafts/${hidden.drafts[0].revisionId}`, {
    expectedVersion: 1, title: hiddenTitle, reason: '本地 R14 未公开夹具',
  });
  await page.reload();
  const filter = async (option: string) => {
    await page.getByRole('group', { name: '筛选' }).getByRole('button', { name: /^公开/ }).click();
    await page.getByRole('menuitemradio', { name: option, exact: true }).click();
  };
  await filter('不公开');
  await expect(rows(page).filter({ hasText: hiddenTitle })).toHaveCount(1);
  await filter('公开');
  await expect(rows(page).filter({ hasText: hiddenTitle })).toHaveCount(0);

  await rows(page).first().locator('[data-open]').click();
  const drawer = page.getByRole('dialog').filter({ has: page.getByText('基本信息') });
  const tagInput = drawer.getByRole('textbox', { name: '添加标签' });
  await expect(tagInput).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    const state = { count: 0 };
    (window as unknown as { __listCalls: number }).__listCalls = 0;
    const original = window.fetch;
    window.fetch = (...args: Parameters<typeof fetch>) => {
      if (String(args[0]).startsWith('/api/admin/community/works?')) state.count += 1;
      (window as unknown as { __listCalls: number }).__listCalls = state.count;
      return original(...args);
    };
  });
  const tagName = `标签${suffix.slice(-6)}`;
  await tagInput.fill(tagName);
  await tagInput.press('Enter');
  await expect(drawer.getByRole('button', { name: `移除标签「${tagName}」` })).toBeVisible();
  await expect(page.getByText(`已添加标签「${tagName}」`)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __listCalls?: number }).__listCalls ?? 0)).toBe(0);
  await expect(tagInput).toBeEnabled();
});

test('标签管理可以从一个标签批量给尚未打标的作品打标', async ({ page }, info) => {
  await login(page, '/admin/tags');
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const tag = await request(page, 'POST', '/api/admin/community/tags', { name: `批量夹具 ${suffix}`, sortOrder: -9500, expectedVersion: 0 });
  const work = await seedBatch(page, 1, false);
  await request(page, 'PATCH', `/api/admin/batches/${work.batch.id}/drafts/${work.drafts[0].revisionId}`, {
    expectedVersion: 1, title: `候选作品 ${suffix}`, reason: '本地 R14 批量打标夹具',
  });
  await page.reload();
  await page.getByRole('searchbox', { name: '搜索标签' }).fill(tag.name);
  await rows(page).filter({ hasText: tag.name }).getByRole('button', { name: tag.name, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: `编辑标签「${tag.name}」` });
  await drawer.getByText('批量给作品打标签').click();
  await drawer.getByRole('checkbox', { name: new RegExp(`候选作品 ${suffix}`) }).click();
  await drawer.getByRole('button', { name: `为 1 件作品打上「${tag.name}」` }).click();
  await expect(page.getByText('已为 1 件作品打上标签。')).toBeVisible();
  await expect(rows(page).filter({ hasText: tag.name })).toContainText(/1 件/);
});

test('发布确认弹窗在两位数序号时不被裁切', async ({ page }) => {
  await login(page, '/admin/batches');
  const seeded = await seedBatch(page, 10, true);
  await page.reload();
  await openBatch(page, seeded.batch.id);
  await expect(page.locator('[data-batch-card]')).toHaveCount(10);
  await page.getByRole('button', { name: '全选可发布' }).click();
  await page.getByRole('button', { name: /发布已勾选草稿/ }).click();
  const list = page.getByRole('dialog', { name: '发布已勾选草稿' }).locator('ol');
  await expect(list.locator('li')).toHaveCount(10);
  const metrics = await list.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  const tenth = await list.locator('li').nth(9).boundingBox();
  const box = await list.boundingBox();
  expect(tenth).not.toBeNull(); expect(box).not.toBeNull();
  expect(tenth!.x).toBeGreaterThanOrEqual(box!.x - 1);
  await expect(list.locator('li').nth(9)).toContainText(/官方作品 10/);
});

test('后台页面不再直接请求豆社公开接口', async ({ page }) => {
  await login(page, '/admin/works');
  const publicCalls: string[] = [];
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/community/')) publicCalls.push(request.url()); });
  for (const path of ['/admin/works', '/admin/reviews', '/admin/batches']) {
    await page.goto(path);
    await expect(page.locator('main#main')).toBeVisible();
    await page.waitForTimeout(500);
  }
  expect(publicCalls).toEqual([]);
});
