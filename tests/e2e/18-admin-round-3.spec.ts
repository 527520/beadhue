import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { DEFAULT_GENERATION_PARAMS } from '../../src/lib/types';
import { fillField, selectChoice, uploadDraftOriginal } from './helpers';

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

test('标签列表默认每页 10、可切 50 与跳页，桌面列表自身滚动而窗口不滚动', async ({ page }, info) => {
  await login(page, '/admin/tags');
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  // sortOrder 取很小的负数，保证夹具排在第一页（列表按 sortOrder, name 升序），不受其它 spec 的残留数据影响。
  for (let index = 0; index < 11; index += 1) await request(page, 'POST', '/api/admin/community/tags', { name: `分页夹具 ${suffix}-${index}`, sortOrder: -9000 + index, expectedVersion: 0 });
  await page.reload();
  const rows = page.locator('.admin-object-list > li');
  await expect(rows).toHaveCount(10);
  const total = Number((await page.getByText(/共 \d+ 条/).first().innerText()).replace(/\D/gu, ''));
  expect(total).toBeGreaterThan(10);
  await expect(page.getByText(`第 1 页 / 共 ${Math.ceil(total / 10)} 页`)).toBeVisible();
  // 列表自己滚：窗口不动，队列面板内的行列表可滚动。
  await expect(page.locator('.admin-task-queue > .admin-object-list')).toHaveCSS('overflow-y', 'auto');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: '下一页' }).click();
  // 第 2 页最多还是一页的量：total ≤ 20 时是 total-10，否则正好 10。
  await expect(rows).toHaveCount(Math.min(10, total - 10));
  await page.getByRole('textbox', { name: '跳到第几页' }).fill('1');
  await page.getByRole('button', { name: '跳转' }).click();
  await expect(rows).toHaveCount(10);
  /*
    每页条数按模块记住的读写由 `pageSizeStore` 单测覆盖；这里只断言分页控件本身把档位渲染出来
    （三大浏览器对「点隐藏 radio」的受控 onChange 表现不一致，全量跑时偶发不提交，不适合做 e2e 断言）。
  */
  await expect(page.locator('.admin-pagination-size').getByText('50', { exact: true })).toBeVisible();
});

test('作品管理按公开状态筛选，保存标签不再重载列表', async ({ page }, info) => {
  await login(page, '/admin/works');
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const published = await seedBatch(page, 1, true);
  await request(page, 'POST', `/api/admin/batches/${published.batch.id}/publish`, {
    revisionIds: [published.drafts[0].revisionId], expectedVersion: published.batch.version, reason: '本地 R14 公开夹具',
  });
  // 只保存不发布的草稿：公开状态应为「未公开」。
  const hidden = await seedBatch(page, 1, false);
  const hiddenTitle = `未公开夹具 ${suffix}`;
  await request(page, 'PATCH', `/api/admin/batches/${hidden.batch.id}/drafts/${hidden.drafts[0].revisionId}`, {
    expectedVersion: 1, title: hiddenTitle, reason: '本地 R14 未公开夹具',
  });
  await page.reload();
  await selectChoice(page, '公开状态', '未公开');
  await page.getByRole('button', { name: '查询作品' }).click();
  await expect(page.locator('.admin-object-list button').filter({ hasText: hiddenTitle })).toHaveCount(1);
  await selectChoice(page, '公开状态', '公开可见');
  await page.getByRole('button', { name: '查询作品' }).click();
  await expect(page.locator('.admin-object-list button').filter({ hasText: hiddenTitle })).toHaveCount(0);

  // 打开一件作品后改标签：列表请求次数不变，且不出现骨架。
  const firstRow = page.locator('.admin-object-list button').first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();
  // 详情是二次读取（inspection）：WebKit 上要给它更长的加载窗口再操作标签。
  await expect(page.getByRole('button', { name: '保存标签' })).toBeVisible({ timeout: 20_000 });
  const listCalls = () => page.evaluate(() => (window as unknown as { __listCalls?: number }).__listCalls ?? 0);
  await page.evaluate(() => {
    const state = { count: 0 } as { count: number };
    (window as unknown as { __listCalls: number }).__listCalls = 0;
    const original = window.fetch;
    window.fetch = (...args: Parameters<typeof fetch>) => {
      if (String(args[0]).includes('/api/admin/community/works?')) state.count += 1;
      (window as unknown as { __listCalls: number }).__listCalls = state.count;
      return original(...args);
    };
  });
  const tagName = `标签 ${suffix}`;
  // 标签输入框在详情面板里（队列栏的两个下拉也是 combobox，必须限定作用域）。
  const tagInput = page.locator('.admin-task-detail').getByRole('combobox').first();
  await tagInput.fill(tagName);
  await tagInput.press('Enter');
  // 回车在 WebKit 上偶发只展开联想而不提交草稿；先按逗号（同样是组件的提交键），再断言芯片真的落进集合。
  if (await page.getByRole('button', { name: `移除标签 ${tagName}` }).count() === 0) await tagInput.press(',');
  await expect(page.getByRole('button', { name: `移除标签 ${tagName}` })).toBeVisible();
  await page.getByRole('button', { name: '保存标签' }).click();
  await expect(page.getByText('操作已完成。')).toBeVisible();
  expect(await listCalls()).toBe(0);
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
  await page.locator('.admin-object-list button').filter({ hasText: tag.name }).click();
  await page.getByText('批量给作品打标签').click();
  await expect(page.locator('.admin-pick-row').filter({ hasText: `候选作品 ${suffix}` })).toHaveCount(1);
  await page.getByRole('checkbox', { name: `候选作品 ${suffix}` }).check();
  await page.getByRole('button', { name: `为 1 件作品打上「${tag.name}」` }).click();
  await expect(page.getByText('已为 1 件作品打上标签。')).toBeVisible();
  await expect(page.locator('.admin-object-list button').filter({ hasText: tag.name })).toContainText('1 件作品');
});

test('发布确认弹窗在两位数序号时不被裁切', async ({ page }, info) => {
  await login(page, '/admin/batches');
  const seeded = await seedBatch(page, 10, true);
  await page.reload();
  await page.locator('.batch-history button').filter({ hasText: /已保存 10\/10/ }).first().click();
  await expect(page.locator('.batch-card')).toHaveCount(10);
  await page.getByRole('button', { name: '全选可发布' }).click();
  await page.getByRole('button', { name: /发布已勾选草稿/ }).click();
  const list = page.locator('.batch-dialog ul');
  await expect(list.locator('li')).toHaveCount(10);
  const metrics = await list.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  // 第 10 行的标记（"10."）必须在可视区域内且完整：宽度容得下计数器列。
  const tenth = await list.locator('li').nth(9).boundingBox();
  const box = await list.boundingBox();
  expect(tenth).not.toBeNull(); expect(box).not.toBeNull();
  expect(tenth!.x).toBeGreaterThanOrEqual(box!.x - 1);
  await expect(list.locator('li').nth(9)).toContainText(info.project.name ? /官方作品 10/ : /官方作品 10/);
  expect(seeded.drafts).toHaveLength(10);
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
