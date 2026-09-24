import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { attachSubmissionOriginal, fillField } from './helpers';

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
  await expect(page).toHaveURL(/\/app\?id=.+&mode=edit/);
  await expect(page.getByRole('group', { name: '模式' }).getByRole('button', { name: '编辑', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('设计名称')).toHaveValue(/（引用）$/);
  await page.goto(originalWorkUrl);
  await fillField(page, '发表评论', `E2E ${testInfo.project.name} 普通评论`);
  await page.getByRole('button', { name: '发布评论' }).click();
  await expect(page.getByText(/评论已发布|审核通过后公开/)).toBeVisible();
});

test('投稿从可信云端预览确认，失败保留草稿并可撤回重提', async ({ page }, testInfo) => {
  await login(page, 'e2e-user@example.com', '/community/submit');
  await page.getByRole('button',{name:/选择云端设计/}).click();
  await page.getByRole('option',{name:'E2E 私人设计',exact:true}).click();
  await expect(page.getByLabel('公开作品标题')).toHaveValue('E2E 私人设计');
  const title = `E2E ${testInfo.project.name} 投稿恢复`;
  await page.getByLabel('公开作品标题').fill(title);
  await expect(page.getByRole('checkbox', { name: /合法发布权/ })).not.toBeChecked();
  await page.getByRole('checkbox', { name: /合法发布权/ }).check();
  // D49：公开作品必须附带原图
  await expect(page.getByRole('button', { name: '提交审核' })).toBeDisabled();
  await attachSubmissionOriginal(page, BATCH_PHOTO);
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
  await page.getByRole('button', { name: '提交审核' }).click();
  await expect(page.locator('.community-submit-form').getByRole('alert')).toContainText('模拟已提交后超时');
  await expect(page.getByLabel('公开作品标题')).toBeDisabled();
  await page.getByRole('button', { name: '重试原投稿' }).click();
  await expect(page.locator('.community-submit-form').getByRole('alert')).toContainText('草稿已保留');
  await page.getByRole('button', { name: '重试提交审核' }).click();
  await expect(page).toHaveURL(/\/me\/public$/);
  expect(creationRequests).toHaveLength(2); expect(creationRequests[1]).toEqual(creationRequests[0]);
  const item = page.locator('.community-mine-list > li').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(item).toHaveCount(1);
  const withdrawalRequests: Array<{ body: string | null; key: string | undefined }> = [];
  await page.route('**/api/community/revisions/*/withdraw', async (route) => {
    withdrawalRequests.push({ body: route.request().postData(), key: route.request().headers()['idempotency-key'] });
    const response = await route.fetch(); expect(response.ok()).toBe(true);
    if (withdrawalRequests.length === 1) await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    else await route.fulfill({ response });
  });
  await item.getByRole('button', { name: '撤回审核' }).click();
  await page.getByRole('button', { name: '确认撤回' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: '暂不撤回' })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '重试确认' }).click();
  await item.getByRole('link', { name: '修改后重投' }).click();
  expect(withdrawalRequests).toHaveLength(2); expect(withdrawalRequests[1]).toEqual(withdrawalRequests[0]);
  await expect(page.getByLabel('公开作品标题')).toHaveValue('E2E 私人设计');
  await expect(page.getByRole('checkbox', { name: /合法发布权/ })).not.toBeChecked();
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
  const expired = page.locator('.community-comment-list li', { hasText: `E2E 可删除旧评论 ${testInfo.project.name}` });
  await expect(expired).toBeVisible();
  await expect(expired.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0);
  // 删除需二次确认：弹窗里的实心危险按钮才真正发请求。
  await expired.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click();
  await expect(expired).toHaveCount(0);
  const pending = page.locator('.community-comment-list li', { hasText: `E2E风险词 待审删除 ${testInfo.project.name}` });
  await expect(pending).toContainText('待审核');
  await pending.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click();
  await expect(pending).toHaveCount(0);
  const foreign = page.locator('.community-comment-list li', { hasText: 'E2E 被举报评论' });
  await expect(foreign).toBeVisible();
  await expect(foreign.getByRole('button', { name: '删除', exact: true })).toHaveCount(0);
});

test('无补充说明的举报仍显示图纸或评论内容和定位入口', async ({ page }) => {
  await login(page, 'e2e-moderator@example.com', '/admin/reports');
  const open = async (text: string) => {
    await page.locator('tbody tr').filter({ hasText: text }).first().locator('[data-open]').click();
    return page.getByRole('dialog', { name: '举报 · 其他' });
  };
  let drawer = await open('作品 / 其他');
  await expect(drawer.getByText('被举报对象编号')).toBeVisible();
  await expect(drawer.getByText('E2E 已公开作品', { exact: true })).toBeVisible();
  await expect(drawer.locator('canvas').first()).toBeVisible();
  await expect(drawer.getByRole('link', { name: '公开页' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0);
  drawer = await open('评论 / 其他');
  await expect(drawer).toContainText('E2E 被举报评论');
  await expect(drawer.getByRole('link', { name: '公开页' })).toHaveAttribute('href', /#comment-/);
});

test('moderator 只能进入治理模块，管理员模块不出现在导航', async ({ page }, testInfo) => {
  await login(page, 'e2e-moderator@example.com', '/admin/reviews');
  await expect(page.getByRole('heading', { name: '作品审核', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: '匿名分析' })).toHaveCount(0);
  if (testInfo.project.name === 'chromium') {
    await page.getByRole('button', { name: /E2E 待审修改版/ }).first().click();
    const checklist = page.getByRole('group', { name: '原创与许可核对' });
    for (const box of await checklist.getByRole('checkbox').all()) await box.click();
    await page.getByRole('button', { name: '通过并发布' }).click();
    const dialog = page.getByRole('dialog', { name: /通过并发布「/ });
    await dialog.getByLabel('审核理由').fill('E2E 人工审核通过修改版');
    await dialog.getByRole('button', { name: '通过并发布' }).click();
    await expect(page.getByText('审核队列已清空')).toBeVisible();
  }
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: '这里需要更高权限' })).toBeVisible();
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
  await expect(page.getByText('0020_discovery_notifications')).toBeVisible();
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
    const list = await (await fetch('/api/community/works?q=' + encodeURIComponent('官方作品 01'))).json();
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
