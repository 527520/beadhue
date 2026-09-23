import { expect, test } from '@playwright/test';

/**
 * admin-round-3 09：豆社标签筛选控件与手机两列小卡片。
 * 两列的判据是计算样式里的 `grid-template-columns` 段数（350 / 390 都必须正好两段）。
 */
const PHONE_WIDTHS = [350, 390];
const EVIDENCE = '.scratch/admin-round-3/evidence';

test('手机 350/390 下豆社作品网格是两列且不横向溢出', async ({ page }) => {
  await page.goto('/community');
  const grid = page.locator('.community-grid');
  test.skip(await grid.count() === 0, '本地库还没有公开作品');
  await expect(grid.locator('.community-card').first()).toBeVisible();
  for (const width of PHONE_WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(
      () => grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length),
      { message: `${width}px 下社区网格必须保持两列` },
    ).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px 不应横向溢出`).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ path: `${EVIDENCE}/community-two-columns-350.png`, fullPage: true });
});

test('标签筛选控件：可搜索、↑↓ 选择、回车应用、可清除', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/community');
  // 控件只在「有带公开作品的公开标签」时渲染；没有标签的库上跳过，不做空跑断言。
  const combobox = page.getByRole('combobox', { name: '按标签筛选' });
  test.skip(await combobox.count() === 0, '本地库还没有带公开作品的标签');
  await expect(combobox).toBeVisible();
  // 热门芯片仍是服务端渲染的 ?tag= 名称链接（可爬），并收敛到前 8 个。
  const shortcuts = page.locator('.community-tag-bar a');
  await expect(shortcuts.first()).toHaveAttribute('href', /^\/community\?tag=/);
  expect(await shortcuts.count()).toBeLessThanOrEqual(8);
  // 输入即本地过滤：没有匹配项时只给提示，不出现候选。
  // WebKit 上仅 fill 不保证展开候选面板（真实用户会先点进输入框），所以显式点一次。
  await combobox.click();
  await combobox.fill('不存在的标签名');
  await expect(page.getByText('没有匹配的标签')).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(0);
  // ↑↓ 选择 + 回车应用：地址栏带上标签（不带游标），并出现可清除的当前标签。
  await combobox.click();
  await combobox.fill('');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBeTruthy();
  expect(new URL(page.url()).searchParams.has('cursor')).toBe(false);
  const chip = page.locator('.tag-filter-chip');
  await expect(chip).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}/community-tag-filter-390.png`, fullPage: false });
  // 当前标签可一键清除。
  await chip.click();
  await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBeNull();
  await expect(chip).toHaveCount(0);
});

test('列表卡片不再展示标签，详情页仍保留标签芯片', async ({ page }) => {
  await page.goto('/community');
  const grid = page.locator('.community-grid');
  test.skip(await grid.count() === 0, '本地库还没有公开作品');
  await expect(page.locator('.community-card .community-tags')).toHaveCount(0);
  const listed = await (await page.request.get('/api/community/works')).json();
  const tagged = listed.items.find((item: { tags: unknown[] }) => item.tags.length > 0);
  if (tagged === undefined) { test.skip(true, '本地库还没有带标签的公开作品'); return; }
  await page.goto(`/community/${tagged.id}`);
  await expect(page.locator('.community-tags').first()).toBeVisible();
});
