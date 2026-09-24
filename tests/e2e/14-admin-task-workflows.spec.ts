import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { DEFAULT_GENERATION_PARAMS } from '../../src/lib/types';
import { fillField, uploadDraftOriginal } from './helpers';

async function login(page: Page, next: string, email = 'e2e-admin@example.com') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await fillField(page, '邮箱', email); await fillField(page, '密码', 'E2e-pass-123!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replaceAll('/', '\\/')}$`));
  await expect(page.locator('h1')).toBeVisible();
}
async function post(page: Page, url: string, body: unknown) {
  const result = await page.evaluate(async ({ url, body, key }) => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }, { url, body, key: randomUUID() });
  expect(result.status, JSON.stringify(result.body)).toBeLessThan(300);
  return result.body;
}
/** 后台表格（R15-10）：搜索框去抖后按关键字过滤，夹具才一定在第一页。 */
async function searchTable(page: Page, placeholder: string, keyword: string) {
  await page.getByRole('searchbox', { name: placeholder }).fill(keyword);
  await expect(page.locator('tbody tr').filter({ hasText: keyword }).first()).toBeVisible();
}
const row = (page: Page, text: string) => page.locator('tbody tr').filter({ hasText: text });
async function fixtureWork(page: Page, title: string) {
  const batch = await post(page, '/api/admin/batches', { itemCount: 1, defaultParams: DEFAULT_GENERATION_PARAMS, engineVersion: 'e2e', reason: '本地治理任务夹具' });
  const draft = await post(page, `/api/admin/batches/${batch.id}/drafts`, { title, reason: '本地治理任务夹具', snapshot: {
    version: 1, engineVersion: 'e2e', boardProfile: '5mm-29', paletteSelection: { palette: { kind: 'builtin', brand: 'MARD' }, kitTier: 0 }, params: { ...DEFAULT_GENERATION_PARAMS, backgroundPrototype: null },
    pattern: { width: 1, height: 1, cells: [{ hex: '#FAF4C8', code: 'A01', transparent: false }] },
  } });
  await uploadDraftOriginal(page, draft.revisionId);
  await post(page, `/api/admin/batches/${batch.id}/publish`, { revisionIds: [draft.revisionId], expectedVersion: batch.version, reason: '本地治理任务公开夹具' });
  return draft.workId as string;
}

test('每个后台任务页的键盘跳转都定位到主内容', async ({ page, browserName }) => {
  await login(page, '/admin/comments');
  // WebKit ships Safari's form-controls-only Tab order. macOS honours Option+Tab to
  // include links (Playwright's page-focus.spec.ts asserts this on darwin only); the
  // Windows/Linux ports expose no such override, so there Tab can never reach an <a>
  // and we focus the skip link directly, still verifying activation lands on main.
  const tabReachesLinks = browserName !== 'webkit' || process.platform === 'darwin';
  for (const section of ['comments', 'reports', 'tags', 'users', 'batches']) {
    await page.goto(`/admin/${section}`);
    await expect(page.locator('main#main')).toHaveCount(1);
    const skip = page.locator('a[href="#main"]');
    if (tabReachesLinks) await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    else await skip.focus();
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/admin/${section}#main$`));
    await expect(page.locator('main#main')).toBeInViewport();
  }
});

test('标签创建丢响应同键恢复，改名停用及具名合并可完成', async ({ page }, info) => {
  await login(page, '/admin/tags');
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const name = `分类 ${suffix}`;
  const writes: Array<{ key: string | null; body: string | null }> = [];
  let loseReply = true;
  await page.route('**/api/admin/community/tags', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    writes.push({ key: route.request().headers()['idempotency-key'] ?? null, body: route.request().postData() });
    const response = await route.fetch();
    if (loseReply) { loseReply = false; await route.fulfill({ status: 503, json: { error: { message: '本地模拟提交后丢失响应' } } }); }
    else await route.fulfill({ response });
  });
  await page.getByRole('button', { name: '新建标签', exact: true }).click();
  const create = page.getByRole('dialog', { name: '新建标签' });
  await create.getByLabel('名称', { exact: true }).fill(name);
  await create.getByRole('button', { name: '新建标签', exact: true }).click();
  await expect(create.getByLabel('名称', { exact: true })).toBeDisabled();
  await create.getByRole('button', { name: '重试确认' }).click();
  await expect(create).toHaveCount(0);
  await searchTable(page, '搜索标签', name);
  await expect(row(page, name)).toHaveCount(1);
  expect(writes).toHaveLength(2); expect(writes[0]).toEqual(writes[1]);
  await row(page, name).getByRole('button', { name, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: `编辑标签「${name}」` });
  await drawer.getByLabel('名称', { exact: true }).fill(`新${name}`);
  const enabled = drawer.getByRole('switch', { name: '启用', exact: true });
  await enabled.focus();
  await page.keyboard.press('Space');
  await expect(enabled).not.toBeChecked();
  await drawer.getByLabel('操作理由').fill('更新名称并暂时停用');
  await drawer.getByRole('button', { name: '保存', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await searchTable(page, '搜索标签', `新${name}`);
  await expect(row(page, `新${name}`)).toContainText('停用');
  await post(page, '/api/admin/community/tags', { name: `归档 ${suffix}`, slug: `target-${suffix}`, reason: '归并重复分类', expectedVersion: 0 });
  await page.reload();
  await searchTable(page, '搜索标签', `新${name}`);
  await row(page, `新${name}`).getByRole('button', { name: `新${name}`, exact: true }).click();
  const edit = page.getByRole('dialog', { name: `编辑标签「新${name}」` });
  await edit.getByText('合并重复标签', { exact: true }).click();
  await edit.getByRole('combobox', { name: '合并到标签' }).click();
  await page.getByRole('option', { name: `归档 ${suffix}`, exact: true }).click();
  await edit.getByRole('checkbox', { name: /我确认将/ }).click();
  await edit.getByRole('button', { name: '确认合并' }).click();
  const confirm = page.getByRole('dialog', { name: '合并重复标签' });
  await confirm.getByLabel('合并理由').fill('核对后合并到具名目标');
  await confirm.getByRole('button', { name: '确认合并' }).click();
  await expect(row(page, `新${name}`)).toContainText('已合并');
});

test('人员二次确认、暂停撤销会话、恢复与角色调整可完成', async ({ page, browser, baseURL }, info) => {
  const email = `e2e-governance-${info.project.name}@example.com`;
  const targetContext = await browser.newContext({ baseURL });
  try {
    const targetPage = await targetContext.newPage();
    await login(targetPage, '/me/settings', email);
    await login(page, '/admin/users');
    await searchTable(page, '搜索用户名、邮箱或编号', email);
    const entry = row(page, `E2E 治理目标 ${info.project.name}`);
    await entry.getByRole('button', { name: `E2E 治理目标 ${info.project.name}` }).click();
    const drawer = page.getByRole('dialog', { name: '账号详情' });
    const userId = await drawer.getByText(/^[0-9a-f]{8}-[0-9a-f-]{27}$/u).innerText();
    const act = async (button: string, dialogName: RegExp, reasonLabel: string, confirm: string) => {
      await drawer.getByRole('button', { name: button }).click();
      const dialog = page.getByRole('dialog', { name: dialogName });
      await dialog.getByLabel(reasonLabel).fill('本地验证账号治理流程');
      await expect(dialog.getByRole('button', { name: confirm, exact: true })).toBeDisabled();
      await dialog.getByLabel('再次输入该账号编号以确认').fill(userId);
      await dialog.getByRole('button', { name: confirm, exact: true }).click();
      await expect(dialog).toHaveCount(0);
    };
    await act('暂停账号', /暂停「/, '暂停理由', '暂停账号');
    await expect(entry).toContainText('已暂停');
    expect(await targetPage.evaluate(async () => (await fetch('/api/auth/me')).status)).toBe(401);
    await act('恢复账号', /恢复「/, '恢复理由', '恢复账号');
    await expect(entry).toContainText('正常');
    for (const role of ['审核员', '用户']) {
      await drawer.getByRole('radio', { name: new RegExp(`^${role}`) }).check();
      await act('保存角色', new RegExp(`调整为${role}`), '操作理由', '确认调整');
      await expect(entry).toContainText(role);
    }
  } finally { await targetContext.close(); }
});

test('被内容安全拦截的评论不公开但进入治理队列，可复核后公开', async ({ page, browser, baseURL }, info) => {
  const workId = (await (await page.request.get('/api/community/works')).json()).items[0].id as string;
  const body = `含 E2E拦截词 的评论 ${info.project.name}`;
  const authorContext = await browser.newContext({ baseURL });
  try {
    const author = await authorContext.newPage();
    await login(author, '/me/settings', `e2e-comment-${info.project.name}@example.com`);
    const response = await author.evaluate(async ({ workId, body }) => {
      const reply = await fetch(`/api/community/works/${workId}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) });
      return { status: reply.status, body: await reply.json() };
    }, { workId, body });
    expect(response.status).toBe(422); expect(response.body.error.code).toBe('COMMENT_BLOCKED');
    const listed = await author.evaluate(async (workId) => (await (await fetch(`/api/community/works/${workId}/comments`)).json()).items, workId);
    expect(JSON.stringify(listed)).not.toContain('E2E拦截词');
  } finally { await authorContext.close(); }
  await login(page, '/admin/comments');
  const entry = row(page, 'E2E拦截词').filter({ hasText: info.project.name });
  await entry.getByRole('button', { name: /E2E拦截词/ }).click();
  const drawer = page.getByRole('dialog', { name: '评论详情' });
  await expect(drawer).toContainText('已拦截');
  await expect(drawer).toContainText('服务建议拦截');
  await expect(drawer.getByRole('button', { name: '隐藏评论' })).toHaveCount(0);
  await drawer.getByRole('button', { name: '复核后公开' }).click();
  const dialog = page.getByRole('dialog', { name: '保留这条评论' });
  await dialog.getByLabel('处置理由').fill('复核确认为误判');
  await dialog.getByRole('button', { name: '复核后公开' }).click();
  await expect(page.getByText('已保留这条评论，前台正常显示')).toBeVisible();
});

test('具名作品下架恢复与评论锁不绕过内容核查和确认', async ({ page }, info) => {
  await login(page, '/admin/works');
  const title = `E2E管理作品${info.project.name}`;
  const workId = await fixtureWork(page, title);
  await page.goto(`/admin/works?work=${workId}`);
  const drawer = page.getByRole('dialog', { name: title });
  await expect(drawer.locator('canvas').first()).toBeVisible();
  const reasonAction = async (button: string, dialogName: RegExp, label: string, confirm: string, check = false) => {
    await drawer.getByRole('button', { name: button, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: dialogName });
    await dialog.getByLabel(label).fill('核对作品后执行管理操作');
    if (check) {
      await expect(dialog.getByRole('button', { name: confirm })).toBeDisabled();
      await dialog.getByRole('checkbox', { name: /我已核对/ }).click();
    }
    await dialog.getByRole('button', { name: confirm }).click();
    await expect(dialog).toHaveCount(0);
  };
  await reasonAction('锁定评论', /锁定「/, '操作理由', '锁定评论');
  await expect(drawer.getByRole('button', { name: '解锁评论' })).toBeVisible();
  await reasonAction('下架', /下架「/, '下架理由', '确认下架', true);
  expect(await page.evaluate(async (id) => (await fetch(`/api/community/works/${id}`)).status, workId)).toBe(404);
  await reasonAction('恢复上架', /恢复上架「/, '恢复理由', '确认恢复', true);
  expect(await page.evaluate(async (id) => (await fetch(`/api/community/works/${id}`)).status, workId)).toBe(200);
  await expect(drawer).toContainText('正常');
});

test('审计可检索与查看状态，分析无效筛选和系统未知证据明示', async ({ page }) => {
  await login(page, '/admin/audit');
  await page.getByRole('searchbox', { name: '搜索动作、对象编号或请求编号' }).fill('community');
  await page.locator('tbody tr').first().locator('[data-open]').click();
  await expect(page.getByRole('heading', { name: '操作前', exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: '操作后', exact: true })).toBeVisible();
  await page.goto('/admin/analytics?start=invalid'); await expect(page.locator('main [role=alert]')).toContainText('部分查询条件无效');
  await page.goto('/admin/analytics'); await expect(page.locator('main [role=alert]')).toHaveCount(0);
  await page.goto('/admin/system'); await expect(page.getByText('数据库实际执行时间', { exact: true })).toBeVisible(); await expect(page.getByText('未接入', { exact: true }).first()).toBeVisible();
});

test('举报先核查当前评论，隐藏内容和案件结案分别留痕', async ({ page, browser, baseURL }, info) => {
  await login(page, '/admin/reports');
  const workId = await fixtureWork(page, `E2E举报作品${info.project.name}`);
  const comment = await post(page, `/api/community/works/${workId}/comments`, { body: `E2E人工核查评论${info.project.name}` });
  const reporter = await browser.newContext({ baseURL });
  try {
    const reporterPage = await reporter.newPage(); await login(reporterPage, '/me/settings', 'e2e-user@example.com');
    const report = await post(reporterPage, '/api/community/reports', { targetType: 'comment', targetId: comment.id, category: 'spam', details: `E2E案件${info.project.name}` });
    await page.goto(`/admin/reports?id=${report.id}`);
    const drawer = page.getByRole('dialog', { name: '举报 · 垃圾推广' });
    await expect(drawer).toContainText(`E2E人工核查评论${info.project.name}`);
    const decide = async (button: string, dialogName: string, label: string, confirm: string) => {
      await drawer.getByRole('button', { name: button, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: dialogName });
      await dialog.getByLabel(label).fill('核对当前评论后处理');
      await dialog.getByRole('button', { name: confirm, exact: true }).click();
      await expect(dialog).toHaveCount(0);
    };
    await decide('受理', '受理举报', '处置理由', '受理');
    await decide('隐藏此版本', '隐藏被举报的评论', '处置理由', '隐藏评论');
    await expect(drawer).toContainText('已隐藏');
    const comments = await reporterPage.evaluate(async (id) => (await (await fetch(`/api/community/works/${id}/comments`)).json()).items, workId);
    expect(comments.some((item: { id: string }) => item.id === comment.id)).toBe(false);
    await decide('结案', '结案', '结案理由', '结案');
    await expect(page.getByText('已结案', { exact: true })).toBeVisible();
  } finally { await reporter.close(); }
});
