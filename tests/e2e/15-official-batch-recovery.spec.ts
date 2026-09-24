import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fillField, settledClick } from './helpers';

const photo = readFileSync(resolve('tests/fixtures/photo-gradient-64.png'));
const image = (name: string) => ({ name, mimeType: 'image/png', buffer: photo });
const cards = (page: Page) => page.locator('[data-batch-card]');
async function login(page: Page) {
  await page.goto('/login?next=/admin/batches');
  await fillField(page, '邮箱', 'e2e-admin@example.com'); await fillField(page, '密码', 'E2e-pass-123!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/batches$/); await expect(page.locator('h1')).toBeVisible();
}
/** R15-10：批次页先是历史表格，「新建批次」先起名，再进入四步工作室。 */
async function openStudio(page: Page) {
  await page.getByRole('button', { name: '新建批次' }).click();
  const naming = page.getByRole('dialog', { name: '新建官方批次' });
  await naming.getByLabel('批次名称').fill('E2E 恢复批次');
  await naming.getByRole('button', { name: '开始选图' }).click();
  await expect(page.getByLabel('选择图片', { exact: true })).toBeAttached();
}
async function smallDefault(page: Page) {
  const params = page.getByRole('button', { name: /统一生成参数 ·/ });
  if ((await params.getAttribute('aria-expanded')) !== 'true') await params.click();
  const width = page.getByRole('textbox', { name: '目标宽度' }).first();
  await width.fill('20'); await width.blur();
  await expect(params).toContainText('20 格宽');
}
const status = (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text });
/** 手机卡片只写「创建人 · 时间」不露编号：按编号前缀搜索，等列表只剩这一批再打开（三个浏览器项目的批次同名）。 */
async function restore(page: Page, batchId: string) {
  await page.getByRole('searchbox', { name: '搜索批次名称或编号' }).fill(batchId.slice(0, 8));
  const rows = page.locator('tbody tr, [data-row-card]').filter({ visible: true });
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  await page.getByRole('button', { name: '继续处理' }).click();
}

test('可视裁剪、创建与保存丢响应同键恢复、核对后发布和主动历史恢复', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await login(page); await openStudio(page);
  const privateName = `private-source-${info.project.name}.png`;
  await page.getByLabel('选择图片', { exact: true }).setInputFiles(image(privateName)); await smallDefault(page);
  await page.getByRole('button', { name: '预览并裁剪' }).click();
  const crop = page.getByRole('dialog', { name: '裁剪图片', exact: true }); await expect(crop).toBeVisible();
  await crop.getByRole('group', { name: '取景框，方向键移动' }).focus(); await page.keyboard.press('ArrowLeft');
  await crop.getByRole('button', { name: '确认并更新' }).click(); await expect(crop).toHaveCount(0);
  await expect(page.getByText(/裁剪区域 \d+×\d+ px/)).toBeVisible();
  const requests = new Map<string, Array<{ body: string | null; key: string | undefined }>>();
  let batchId = '';
  await page.route('**/api/admin/batches**', async (route) => {
    const req = route.request(); if (req.method() !== 'POST') return route.continue();
    const kind = req.url().endsWith('/drafts') ? 'draft' : req.url().endsWith('/publish') ? 'publish' : 'create';
    const writes = requests.get(kind) ?? []; writes.push({ body: req.postData(), key: req.headers()['idempotency-key'] }); requests.set(kind, writes);
    expect(req.postData()).not.toContain(privateName);
    const response = await route.fetch(); expect(response.status()).toBeLessThan(300);
    if (kind === 'create') batchId = (await response.json()).id;
    if (writes.length === 1) return route.fulfill({ status: 503, json: { error: { message: '本地模拟已提交后丢响应' } } });
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: '开始生成' }).click();
  await expect(page.getByLabel('选择图片', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '重试确认' }).click();
  const item = cards(page).first();
  await expect(item).toContainText('保存结果待确认');
  await settledClick(item.getByRole('button', { name: '重试确认保存' }));
  await expect(status(page, '生成完成')).toBeVisible();
  await expect(item.getByRole('checkbox', { name: '发布', exact: true })).not.toBeChecked();
  await item.getByRole('button', { name: '完整图纸' }).click();
  const material = page.getByRole('dialog', { name: '完整图纸' });
  await expect(material.locator('canvas').first()).toBeVisible();
  await material.getByRole('button', { name: '关闭', exact: true }).click();
  await item.getByRole('checkbox', { name: '发布', exact: true }).click();
  await page.getByRole('button', { name: /发布已勾选草稿/ }).click();
  const publication = page.getByRole('dialog', { name: '发布已勾选草稿', exact: true });
  await expect(publication.getByRole('button', { name: '确认公开' })).toBeDisabled();
  await publication.getByRole('checkbox').click(); await publication.getByRole('button', { name: '确认公开' }).click();
  await expect(publication.getByRole('button', { name: '返回草稿' })).toBeDisabled();
  await publication.getByRole('button', { name: '重试确认' }).click(); await expect(publication).toHaveCount(0);
  await expect(item.getByRole('link', { name: '查看公开作品' })).toBeVisible();
  for (const kind of ['create', 'draft', 'publish']) { expect(requests.get(kind)).toHaveLength(2); expect(requests.get(kind)![0]).toEqual(requests.get(kind)![1]); }
  const stored = await page.evaluate(async (id) => (await (await fetch('/api/admin/batches?size=100')).json()).items.find((entry: { id: string }) => entry.id === id), batchId);
  expect(stored.successCount).toBe(1); expect(stored.drafts).toHaveLength(1); expect(stored.drafts[0].status).toBe('published');
  await page.unroute('**/api/admin/batches**');
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload(); await expect(cards(page)).toHaveCount(0);
  await restore(page, batchId);
  await expect(cards(page)).toHaveCount(1); await expect(cards(page).getByRole('checkbox')).toHaveCount(0);
});

test('暂停只停止新派发，取消待处理项后继续不丢失正在保存的结果', async ({ page }) => {
  await login(page); await openStudio(page);
  await page.getByLabel('选择图片', { exact: true }).setInputFiles([1, 2, 3, 4].map((n) => image(`pause-${n}.png`))); await smallDefault(page);
  let held = 0; let release!: () => void; const gate = new Promise<void>((done) => { release = done; });
  await page.route('**/api/admin/batches/*/drafts', async (route) => { const response = await route.fetch(); held++; await gate; await route.fulfill({ response }); });
  const summary = page.locator('[data-batch-summary]');
  try {
    await page.getByRole('button', { name: '开始生成' }).click(); await expect.poll(() => held).toBeGreaterThan(0);
    await page.getByRole('button', { name: '暂停派发' }).click(); await expect(summary).toContainText('批次已暂停');
    release(); await expect(cards(page).filter({ hasText: '保存中' })).toHaveCount(0);
    const last = cards(page).filter({ hasText: 'pause-4.png' }); await expect(last).toContainText('待生成');
    await last.getByRole('button', { name: '取消此项' }).click(); await expect(last).toContainText('已取消');
    await page.getByRole('button', { name: '继续', exact: true }).click(); await expect(summary).toContainText('批次已完成');
    await expect(cards(page).getByRole('checkbox')).toHaveCount(3);
    await last.getByRole('button', { name: '重试', exact: true }).click(); await expect(cards(page).getByRole('checkbox')).toHaveCount(4);
  } finally { release(); }
});

test('50 项发布清单在短视口内滚动，取消后保留选择且不发布', async ({ page }) => {
  await login(page); await openStudio(page);
  await page.getByLabel('选择图片', { exact: true }).setInputFiles(Array.from({ length: 50 }, (_, index) => image(`maximum-${index}.png`)));
  await smallDefault(page); await page.getByRole('button', { name: '开始生成' }).click();
  const choices = cards(page).getByRole('checkbox');
  await expect(choices).toHaveCount(50, { timeout: 120_000 });
  await page.getByRole('button', { name: '全选可发布' }).click();
  let publications = 0;
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/publish')) publications++; });
  const opener = page.getByRole('button', { name: /发布已勾选草稿/ });
  await page.setViewportSize({ width: 350, height: 400 }); await opener.click();
  const dialog = page.getByRole('dialog', { name: '发布已勾选草稿', exact: true });
  await expect(dialog.locator('li')).toHaveCount(50);
  // 手机宽度下是底部面板：最高 92dvh，顶边留出空隙，底边贴屏幕底。
  await expect.poll(async () => { const box = await dialog.boundingBox(); return box ? box.y + box.height : Infinity; }).toBeLessThanOrEqual(401);
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(16);
  expect(bounds!.height).toBeLessThanOrEqual(368.5);
  await dialog.locator('li').first().scrollIntoViewIfNeeded(); await expect(dialog.locator('li').first()).toBeInViewport();
  await dialog.locator('li').last().scrollIntoViewIfNeeded(); await expect(dialog.locator('li').last()).toBeInViewport();
  const confirmation = dialog.getByRole('checkbox');
  await expect(confirmation).not.toBeChecked();
  await expect(dialog.getByRole('button', { name: '确认公开' })).toBeDisabled();
  await confirmation.click();
  await expect(dialog.getByRole('button', { name: '确认公开' })).toBeEnabled();
  await dialog.getByRole('button', { name: '返回草稿' }).click();
  await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
  await expect(cards(page).getByRole('checkbox', { checked: true })).toHaveCount(50);
  await page.setViewportSize({ width: 1440, height: 844 }); await opener.click();
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(576);
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  expect(publications).toBe(0);
});

test('批次准备、裁剪、实际草稿和发布确认在五宽度下可访问且不溢出', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium');
  await login(page); await openStudio(page);
  await page.getByLabel('选择图片', { exact: true }).setInputFiles(image('width-check.png')); await smallDefault(page);
  const inspect = async (scene: string) => {
    for (const width of [350, 390, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${scene} ${width}`).toBeLessThanOrEqual(width);
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations.filter((entry) => ['serious', 'critical'].includes(entry.impact ?? '')).map((entry) => ({ id: entry.id, nodes: entry.nodes.map((node) => node.target) }))).toEqual([]);
    }
  };
  const pick = page.locator('[data-batch-pick]');
  await pick.focus(); await expect(pick).toBeFocused();
  await inspect('prepare'); await page.getByRole('button', { name: '预览并裁剪' }).click();
  await expect(page.getByRole('dialog', { name: '裁剪图片', exact: true })).toBeVisible(); await inspect('crop');
  await page.getByRole('button', { name: '确认并更新' }).click(); await page.getByRole('button', { name: '开始生成' }).click();
  await expect(cards(page).getByRole('checkbox')).toBeVisible({ timeout: 60_000 }); await inspect('draft');
  await cards(page).getByRole('checkbox').click(); await page.getByRole('button', { name: /发布已勾选草稿/ }).click(); await inspect('confirm');
  await page.setViewportSize({ width: 350, height: 400 });
  await page.getByRole('dialog').getByRole('checkbox').click();
  await page.getByRole('button', { name: '确认公开' }).scrollIntoViewIfNeeded();
  const bounds = await page.getByRole('button', { name: '确认公开' }).boundingBox(); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(400);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});
