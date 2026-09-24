import { expect, test, type Page } from '@playwright/test';
import { fillField, uploadDraftOriginal } from './helpers';

async function login(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await fillField(page, '邮箱', email);
  await fillField(page, '密码', 'E2e-pass-123!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(next);
}

async function api(page: Page, url: string, body: unknown) {
  const result = await page.evaluate(async ({ url, body }) => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { url, body });
  expect(result.status, JSON.stringify(result.body)).toBeLessThan(300);
  return result.body;
}

test('审核通过后作者看到通知：换页刷新未读数，打开即已读，点击进入作品', async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name !== 'chromium');
  const title = `通知样本 ${Date.now().toString(36)}`;

  // 作者：清掉种子与其他用例留下的未读，经接口投一件新作品（设计 → 草稿 → 原图 → 提交审核）。
  await login(page, 'e2e-user@example.com', '/me');
  await api(page, '/api/me/notifications/read', {});
  const design = await page.evaluate(async () => (await (await fetch('/api/designs')).json()).items.find((item: { name: string }) => item.name === 'E2E 私人设计'));
  const draft = await api(page, '/api/community/works', { designId: design.id, expectedDesignRevision: design.revision, title, licenseVersion: 'limited-platform-license-v1-draft' });
  await uploadDraftOriginal(page, draft.revisionId);
  await api(page, `/api/community/revisions/${draft.revisionId}/submit`, { expectedVersion: draft.version });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '通知', exact: true })).toBeVisible();

  // 审核员在后台通过。
  const moderatorContext = await browser.newContext({ baseURL });
  try {
    const moderator = await moderatorContext.newPage();
    await login(moderator, 'e2e-moderator@example.com', '/admin/reviews');
    await moderator.getByRole('button', { name: new RegExp(title) }).first().click();
    for (const box of await moderator.getByRole('group', { name: '原创与许可核对' }).getByRole('checkbox').all()) await box.click();
    await moderator.getByRole('button', { name: '通过并发布', exact: true }).click();
    const dialog = moderator.getByRole('dialog', { name: `通过并发布「${title}」` });
    await dialog.getByLabel('审核理由').fill('E2E 通知用例：核对通过');
    await dialog.getByRole('button', { name: '通过并发布' }).click();
    await expect(dialog).toHaveCount(0);
  } finally {
    await moderatorContext.close();
  }

  // 作者换页（站内导航，不整页刷新）后铃铛出现未读数。
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '我的' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/me');
  const bell = page.getByRole('button', { name: '有 1 条未读通知' });
  await expect(bell).toBeVisible();
  await expect(bell.locator('[data-slot="unread-badge"]')).toHaveText('1');

  // 打开弹出层：新通知在最上面，露出即标记已读（徽标消失，本次打开仍有未读圆点）。
  await bell.click();
  const panel = page.getByRole('dialog', { name: '通知' });
  const item = panel.getByRole('link').first();
  await expect(item).toContainText(`「${title}」已通过审核并公开`);
  await expect(item.locator('[data-slot="unread-dot"]')).toBeVisible();
  await expect(page.getByRole('button', { name: '通知', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await (await fetch('/api/me/notifications/unread-count')).json()).unreadCount)).toBe(0);

  // 点击进入作品详情。
  await item.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/community/${draft.workId}`);
  await expect(panel).toHaveCount(0);

  // 手机发现页：铃铛在顶栏，打开是底部面板。
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '通知', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '通知' });
  await expect(sheet.getByRole('link').first()).toContainText(`「${title}」已通过审核并公开`);
  await expect(sheet.locator('[data-slot="unread-dot"]')).toHaveCount(0);
});
