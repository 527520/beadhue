import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fillField, openPublishDeepLink } from './helpers';

const BATCH_PHOTO = resolve(process.cwd(), 'tests/fixtures/photo-gradient-64.png');

function dateOffset(days: number) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

async function login(page: Page, email: string, next = '/?sort=new') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await fillField(page, '邮箱', email);
  await fillField(page, '密码', 'E2e-pass-123!');
  await page.getByRole('button', { name: '登录' }).click();
  const target = new URL(next, 'http://local').pathname;
  await page.waitForURL((url) => url.pathname === target);
}

test('游客只能看到已发布版本，后台要求登录', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /E2E 已公开作品|E2E 待审修改版/ })).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect.poll(() => new URL(page.url()).searchParams.get('next')).toBe('/admin');
});

test('已验证用户引用独立副本并发布评论', async ({ page }, testInfo) => {
  await login(page, 'e2e-user@example.com');
  await page.goto('/');
  await page.getByRole('region', { name: '作品' }).getByRole('link', { name: /^查看「/ }).first().click();
  await expect(page).toHaveURL(/\/community\/[0-9a-f-]{36}/);
  const originalWorkUrl = page.url();
  await page.getByRole('button', { name: '用这张制作' }).click();
  // R15：先确认弹窗，再建私人副本进入编辑器。
  await page.getByRole('dialog', { name: '用这张图纸制作' }).getByRole('button', { name: '开始制作' }).click();
  await expect(page).toHaveURL(/\/app\?id=.+&mode=edit/);
  await expect(page.getByRole('group', { name: '模式' }).getByRole('button', { name: '编辑', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('设计名称')).toHaveValue(/（引用）$/);
  await page.goto(originalWorkUrl);
  await fillField(page, '发表评论', `E2E ${testInfo.project.name} 普通评论`);
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page.getByText(/已发布评论|审核通过后公开/).first()).toBeVisible();
  await expect(page.getByRole('list', { name: '评论' }).getByText(`E2E ${testInfo.project.name} 普通评论`).first()).toBeVisible();
});

test('投稿深链打开编辑器公开弹窗，失败保留草稿并可撤回重提', async ({ page }, testInfo) => {
  await login(page, 'e2e-user@example.com', '/me');
  const { designId, dialog } = await openPublishDeepLink(page, BATCH_PHOTO);
  const title = `E2E ${testInfo.project.name} 投稿恢复`;
  await dialog.getByLabel('公开标题').fill(title);
  // D49：公开作品必须附带原图，并确认原图用途与发布权
  await expect(dialog.getByRole('button', { name: '提交审核' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: /同意上传原图/ }).check();
  await dialog.getByRole('checkbox', { name: /合法发布权/ }).check();
  const creationRequests: Array<{ body: string | null; key: string | undefined }> = [];
  await page.route('**/api/community/works', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    creationRequests.push({ body: route.request().postData(), key: route.request().headers()['idempotency-key'] });
    const response = await route.fetch(); expect(response.ok()).toBe(true);
    if (creationRequests.length === 1) await route.fulfill({ status: 408, contentType: 'application/json', body: '{"error":{"message":"模拟已提交后超时"}}' });
    else await route.fulfill({ response });
  });
  let failures = 1;
  await page.route('**/api/community/revisions/*/submit', async (route) => {
    if (failures-- > 0) {
      const response = await route.fetch(); expect(response.ok()).toBe(true);
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '模拟提交故障' } }) });
    }
    else await route.continue();
  });
  await dialog.getByRole('button', { name: '提交审核' }).click();
  await expect(dialog.getByRole('alert')).toContainText('模拟已提交后超时');
  await dialog.getByRole('button', { name: '提交审核' }).click();
  await expect(dialog.getByRole('alert')).toContainText('模拟提交故障');
  await dialog.getByRole('button', { name: '提交审核' }).click();
  await expect(dialog).toHaveCount(0);
  expect(creationRequests).toHaveLength(2); expect(creationRequests[1]).toEqual(creationRequests[0]);
  await page.goto('/me/public');
  const item = page.locator('[data-slot="own-work-card"]').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(item).toHaveCount(1);
  const withdrawalRequests: Array<{ body: string | null; key: string | undefined }> = [];
  await page.route('**/api/community/revisions/*/withdraw', async (route) => {
    withdrawalRequests.push({ body: route.request().postData(), key: route.request().headers()['idempotency-key'] });
    const response = await route.fetch(); expect(response.ok()).toBe(true);
    if (withdrawalRequests.length === 1) await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    else await route.fulfill({ response });
  });
  await item.getByRole('button', { name: `「${title}」的更多操作` }).click();
  await page.getByRole('menuitem', { name: '撤回审核' }).click();
  const confirm = page.getByRole('dialog', { name: '撤回审核？' });
  await confirm.getByRole('button', { name: '撤回审核' }).click();
  await expect(confirm.getByRole('alert')).toBeVisible();
  await expect(confirm.getByRole('button', { name: '取消' })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '重试确认' }).click();
  await expect(confirm).toBeHidden();
  await item.getByRole('button', { name: `「${title}」的更多操作` }).click();
  await page.getByRole('menuitem', { name: '修改后重投' }).click();
  expect(withdrawalRequests).toHaveLength(2); expect(withdrawalRequests[1]).toEqual(withdrawalRequests[0]);
  // 修改后重投走同一深链：回到这张设计的编辑器，弹窗为该作品提交新修订。
  await expect(page).toHaveURL(new RegExp(`/app\\?id=${designId}`));
  const revise = page.getByRole('dialog', { name: '修改并重新投稿' });
  await expect(revise).toBeVisible({ timeout: 30_000 });
  await expect(revise.getByRole('checkbox', { name: /合法发布权/ })).not.toBeChecked();
});

test('评论只能删除不能编辑，待审评论只对本人显示', async ({ page }, testInfo) => {
  await login(page, 'e2e-user@example.com');
  // Earlier browser projects publish other E2E works into this shared fixture
  // database. Select the seeded work, not whichever matching title sorts first.
  const seededWork = page.locator('[data-slot="work-card"]').filter({
    has: page.getByRole('heading', { name: /^E2E (已公开作品|待审修改版)$/ }),
  });
  await expect(seededWork).toHaveCount(1);
  await seededWork.getByRole('link', { name: /^查看「/ }).click();
  const comments = page.getByRole('list', { name: '评论' });
  const comment = (text: string) => comments.getByRole('listitem').filter({ hasText: text });
  // 删除在评论的「更多」菜单里，需二次确认：弹窗里的实心危险按钮才真正发请求。
  const remove = async (item: ReturnType<typeof comment>) => {
    await item.getByRole('button', { name: /的评论：更多操作$/ }).click();
    await page.getByRole('menuitem', { name: '删除评论' }).click();
    await page.getByRole('dialog', { name: '删除这条评论？' }).getByRole('button', { name: '删除', exact: true }).click();
  };
  const expired = comment(`E2E 可删除旧评论 ${testInfo.project.name}`);
  await expect(expired).toBeVisible();
  await expect(expired.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0);
  await remove(expired);
  await expect(expired).toHaveCount(0);
  const pending = comment(`E2E风险词 待审删除 ${testInfo.project.name}`);
  await expect(pending).toContainText('待审核');
  await remove(pending);
  await expect(pending).toHaveCount(0);
  const foreign = comment('E2E 被举报评论');
  await expect(foreign).toBeVisible();
  await foreign.getByRole('button', { name: /的评论：更多操作$/ }).click();
  await expect(page.getByRole('menuitem', { name: '举报…' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '删除评论' })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('无补充说明的举报仍显示图纸或评论内容和定位入口', async ({ page }) => {
  await login(page, 'e2e-moderator@example.com', '/admin/reports');
  const open = async (text: string | RegExp) => {
    await page.locator('tbody tr').filter({ hasText: text }).first().locator('[data-open]').click();
    return page.getByRole('dialog', { name: '举报 · 其他' });
  };
  // 三个浏览器项目共用一个库：前一个项目的审核用例通过修改版后，种子作品的公开标题会变成「E2E 待审修改版」。
  const seedTitle = /E2E (已公开作品|待审修改版)/;
  let drawer = await open(new RegExp(`作品「${seedTitle.source}」`));
  await expect(drawer.getByText('被举报对象编号')).toBeVisible();
  await expect(drawer.getByText(new RegExp(`^${seedTitle.source}$`))).toBeVisible();
  await expect(drawer.locator('canvas').first()).toBeVisible();
  await expect(drawer.getByRole('link', { name: '公开页' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0);
  drawer = await open('评论“E2E 被举报评论”');
  await expect(drawer).toContainText('E2E 被举报评论');
  await expect(drawer.getByRole('link', { name: '公开页' })).toHaveAttribute('href', /#comment-/);
});

test('moderator 只能进入治理模块，管理员模块不出现在导航', async ({ page }, testInfo) => {
  await login(page, 'e2e-moderator@example.com', '/admin/reviews');
  await expect(page.getByRole('heading', { name: '作品审核', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: '匿名分析' })).toHaveCount(0);
  if (testInfo.project.name === 'chromium') {
    const pendingRevision = page.getByRole('button', { name: /E2E 待审修改版/ }).first();
    await pendingRevision.click();
    const checklist = page.getByRole('group', { name: '原创与许可核对' });
    for (const box of await checklist.getByRole('checkbox').all()) await box.click();
    await page.getByRole('button', { name: '通过并发布' }).click();
    const dialog = page.getByRole('dialog', { name: /通过并发布「/ });
    await dialog.getByLabel('审核理由').fill('E2E 人工审核通过修改版');
    await dialog.getByRole('button', { name: '通过并发布' }).click();
    await expect(pendingRevision).toHaveCount(0);
  }
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: '这个模块只对管理员开放', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '后台导航' })).toBeVisible();
  await page.getByRole('link', { name: '返回后台总览' }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test('admin 可读取人员、审计和系统证据；规则页已退役', async ({ page }) => {
  await login(page, 'e2e-admin@example.com', '/admin/users');
  await expect(page.getByRole('heading', { name: '人员管理', level: 1 })).toBeVisible();
  await page.getByRole('searchbox', { name: '搜索用户名、邮箱或编号' }).fill('E2E Admin');
  await expect(page.locator('tbody tr').filter({ hasText: 'E2E Admin' }).first()).toBeVisible();
  await expect(page.getByText('e2e-admin@example.com')).toHaveCount(0);
  const people = await page.evaluate(async () => (await fetch(`/api/admin/users?q=${encodeURIComponent('E2E Admin')}`)).json());
  expect(people.items.find((item: { username: string }) => item.username === 'E2E Admin')).toMatchObject({ maskedEmail: 'e***n@example.com' });
  expect(JSON.stringify(people)).not.toContain('e2e-admin@example.com');
  expect((await page.request.get('/admin/rules')).status()).toBe(404);
  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: '审计记录', exact: true, level: 1 })).toBeVisible();
  await page.goto('/admin/system');
  await expect(page.getByText('未接入').first()).toBeVisible();
  await expect(page.getByText('评论内容安全服务（腾讯云）')).toBeVisible();
  await expect(page.getByText('0021_account_profile_and_batch_names')).toBeVisible();
});

test('分析后台在精确与长期聚合范围间明确切换能力', async ({ page }) => {
  await login(page, 'e2e-admin@example.com', '/admin/analytics');
  await page.goto(`/admin/analytics?start=${dateOffset(-10)}&end=${dateOffset(0)}&device=desktop&actor=user&dimension=device&funnel=communityReuse`);
  await expect(page.getByRole('heading', { name: '匿名分析', level: 1 })).toBeVisible();
  await expect(page.getByText('当前为精确统计（最近 90 天）：可查看去重访客数、组合筛选和转化路径。')).toBeVisible();
  await page.getByRole('button', { name: /^筛选/ }).click();
  await expect(page.getByRole('combobox', { name: '设备类型' })).toHaveText('电脑');
  await expect(page.getByRole('combobox', { name: '访客身份' })).toHaveText('已登录用户');
  await expect(page.getByRole('combobox', { name: '转化路径' })).toContainText('豆社引用');
  await page.keyboard.press('Escape');

  await page.goto(`/admin/analytics?start=${dateOffset(-140)}&end=${dateOffset(0)}&device=desktop&dimension=device&funnel=communityReuse`);
  await expect(page.getByText(/当前为长期趋势（按日汇总）/)).toBeVisible();
  await expect(page.getByText('长期范围不支持组合筛选，已忽略日期和事件名称以外的筛选条件。')).toBeVisible();
  await expect(page.getByText('转化路径只能在最近 90 天的精确统计范围内查看。')).toBeVisible();
});

test('官方批次允许单项失败、保留成功草稿并只发布勾选项', async ({ page }) => {
  await login(page, 'e2e-admin@example.com', '/admin/batches');
  await page.getByRole('button', { name: '新建批次' }).click();
  const naming = page.getByRole('dialog', { name: '新建官方批次' });
  await naming.getByLabel('批次名称').fill('E2E 单项失败批次');
  await naming.getByRole('button', { name: '开始选图' }).click();
  await expect(page.getByRole('heading', { name: 'E2E 单项失败批次' })).toBeVisible();
  await page.getByLabel('选择图片', { exact: true }).setInputFiles([
    { name: 'photo-gradient-64.png', mimeType: 'image/png', buffer: readFileSync(BATCH_PHOTO) },
    { name: 'second-photo.png', mimeType: 'image/png', buffer: readFileSync(BATCH_PHOTO) },
    { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not-an-image') },
  ]);
  await expect(page.getByText('photo-gradient-64.png')).toBeVisible();
  await expect(page.getByText('broken.png')).toBeVisible();
  const card = (name: string) => page.locator('[data-batch-card]', { hasText: name });
  const params = page.getByRole('button', { name: /统一生成参数 ·/ });
  if ((await params.getAttribute('aria-expanded')) !== 'true') await params.click();
  const width = page.getByRole('textbox', { name: '目标宽度' }).first(); await width.fill('30'); await width.blur();
  await expect(params).toContainText('30 格宽');
  await card('photo-gradient-64.png').getByRole('button', { name: /逐项参数覆盖/ }).click();
  const itemWidth = card('photo-gradient-64.png').getByRole('textbox', { name: '目标宽度' }); await itemWidth.fill('24'); await itemWidth.blur();

  await page.getByRole('button', { name: '开始生成' }).click();
  await expect(page.getByRole('status').filter({ hasText: '生成完成，1 项失败' })).toBeVisible({ timeout: 30_000 });
  const savedItem = card('photo-gradient-64.png');
  const failedItem = card('broken.png');
  await expect(savedItem).toContainText('已保存');
  await expect(savedItem.getByRole('img')).toBeVisible();
  await expect(failedItem).toContainText('失败');
  await expect(failedItem.getByRole('button', { name: '重试' })).toBeEnabled();
  const completedBatch = await page.evaluate(async () => (await (await fetch('/api/admin/batches')).json()).items[0]);
  expect(completedBatch).toMatchObject({ status: 'completed', successCount: 2, failureCount: 1 });
  expect(completedBatch.completedAt).not.toBeNull();

  await savedItem.getByRole('checkbox').click();
  await page.getByRole('button', { name: /发布已勾选草稿/ }).click();
  await page.getByRole('checkbox', { name: /我已核对所选图纸与标题/ }).click();
  await page.getByRole('button', { name: '确认公开' }).click();
  await expect(page.getByRole('status').filter({ hasText: '已发布 1 个官方作品。' })).toBeVisible();
  await expect(savedItem.getByRole('checkbox')).toHaveCount(0);
  await expect(card('second-photo.png').getByRole('checkbox')).toBeEnabled();
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.locator('tbody tr').filter({ hasText: completedBatch.id.slice(0, 8) }).locator('[data-open]').click();
  await page.getByRole('button', { name: '继续处理' }).click();
  const restored = page.locator('[data-batch-card]').filter({ has: page.locator('input[value="官方作品 02"]') });
  await restored.getByRole('checkbox').click();
  await page.getByRole('button', { name: /发布已勾选草稿/ }).click();
  await page.getByRole('checkbox', { name: /我已核对所选图纸与标题/ }).click();
  await page.getByRole('button', { name: '确认公开' }).click();
  await expect(page.getByRole('status').filter({ hasText: '已发布 1 个官方作品。' })).toBeVisible();
  await expect(page.locator('[data-batch-card]').getByRole('checkbox')).toHaveCount(0);
  await page.goto('/?sort=new');
  await expect(page.getByRole('heading', { name: '官方作品 01' }).first()).toBeVisible();
  const detail = await page.evaluate(async () => {
    // 三个浏览器项目与别的批次用例都会发布同名的「官方作品 01」，按最新取本用例刚发布的那件。
    const list = await (await fetch('/api/community/works?sort=new&q=' + encodeURIComponent('官方作品 01'))).json();
    return (await fetch(`/api/community/works/${list.items[0].id}`)).json();
  });
  expect(detail.snapshot.params.targetWidth).toBe(24);
});

test('豆社覆盖目标宽度且无严重可访问性问题', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium');
  const widths = [350, 390, 768, 1280, 1440] as const;
  await page.goto('/');
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('heading', { level: 1, name: '发现图纸' })).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: '类目' })).toBeVisible();
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(geometry.page, `发现页在 ${width}px 下不得横向溢出`).toBeLessThanOrEqual(geometry.viewport);
  }
  const communityAxe = await new AxeBuilder({ page }).include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(communityAxe.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
});

test('作品详情与作者主页覆盖目标宽度且无严重可访问性问题；未登录不下发色号', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium');
  const list = await (await page.request.get('/api/community/works?sort=new')).json();
  const work = list.items[0] as { id: string; title: string; author: { publicAuthorId: string } };
  const scan = async () => {
    const result = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    expect(result.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
  };
  await page.goto(`/community/${work.id}`);
  await expect(page.getByText('登录后查看完整色号与颗数')).toBeVisible();
  await expect(page.getByRole('button', { name: '色号' })).toHaveAttribute('aria-disabled', 'true');
  for (const width of [350, 390, 768, 1024, 1440] as const) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('heading', { level: 1, name: work.title })).toBeVisible();
    await expect(page.getByRole('region', { name: '图纸查看器' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `详情页在 ${width}px 下不得横向溢出`).toBeLessThanOrEqual(0);
  }
  await scan();
  await page.goto(`/u/${work.author.publicAuthorId}`);
  await expect(page.getByRole('heading', { level: 2, name: '作品' })).toBeVisible();
  for (const width of [350, 1440] as const) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
  await scan();
  const missing = await page.goto('/u/00000000-0000-4000-8000-000000000000');
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: '找不到这位作者' })).toBeVisible();
});

test('审核后台覆盖目标宽度且无严重可访问性问题', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium');
  const widths = [350, 390, 768, 1280, 1440] as const;
  await login(page, 'e2e-moderator@example.com', '/admin/reviews');
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('heading', { name: '作品审核', level: 1 })).toBeVisible();
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(geometry.page, `审核后台在 ${width}px 下不得横向溢出`).toBeLessThanOrEqual(geometry.viewport);
  }
  const adminAxe = await new AxeBuilder({ page }).include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(adminAxe.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
});
