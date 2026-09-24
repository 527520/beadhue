import { expect, test } from '@playwright/test';
import { waitHydrated } from './helpers';

/**
 * 发现页（R15-04，原接 admin-round-3 09 的标签筛选）：手机两列作品卡、筛选 → 已选芯片、排序、
 * 标签并入类目条与搜索（旧 ?tag= 链接仍可用）。两列的判据是计算样式里 `grid-template-columns` 的段数。
 */
const PHONE_WIDTHS = [350, 390];
const EVIDENCE = '.scratch/admin-round-3/evidence';

test('手机 350/390 下发现页作品网格是两列且不横向溢出', async ({ page }) => {
  await page.goto('/');
  const grid = page.getByRole('region', { name: '作品' }).getByRole('list');
  test.skip(await grid.count() === 0, '本地库还没有公开作品');
  await expect(grid.getByRole('link', { name: /^查看「/ }).first()).toBeVisible();
  for (const width of PHONE_WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(
      () => grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length),
      { message: `${width}px 下作品网格必须保持两列` },
    ).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px 不应横向溢出`).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ path: `${EVIDENCE}/community-two-columns-350.png`, fullPage: true });
});

test('筛选实时计数、应用后列出可移除芯片；排序对勾标出当前项', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('/');
  await waitHydrated(page);
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '筛选' });
  await expect(panel).toBeVisible();
  const apply = panel.getByRole('button', { name: /^(显示 \d+ 张图纸|没有符合的图纸)$/ });
  await panel.getByRole('button', { name: '40 格以上', exact: true }).click();
  // 最长边 > 40 的公开作品在种子库里没有：数量实时变成 0，主按钮禁用。
  const api = await (await page.request.get('/api/community/works?size=l')).json();
  if (api.total === 0) await expect(apply).toBeDisabled();
  await panel.getByRole('button', { name: '清除全部' }).click();
  await panel.getByRole('button', { name: '6 色以内', exact: true }).click();
  await expect(panel.getByRole('button', { name: '6 色以内', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const few = await (await page.request.get('/api/community/works?colors=few')).json();
  await expect(apply).toHaveText(few.total ? `显示 ${few.total} 张图纸` : '没有符合的图纸');
  test.skip(few.total === 0, '本地库没有 6 色以内的公开作品');
  await apply.click();
  await expect.poll(() => new URL(page.url()).searchParams.get('colors')).toBe('few');
  await expect(page.getByText(`${few.total} 张图纸`, { exact: true })).toBeVisible();
  const chips = page.getByRole('group', { name: '已选筛选条件' });
  await chips.getByRole('button', { name: '移除筛选：6 色以内' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.has('colors')).toBe(false);
  await expect(chips).toHaveCount(0);

  await page.getByRole('button', { name: '排序：推荐' }).click();
  const sorts = page.getByRole('navigation', { name: '排序' });
  await expect(sorts.getByRole('link', { name: '推荐' })).toHaveAttribute('aria-current', 'true');
  await sorts.getByRole('link', { name: '最新发布' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe('new');
  await expect(page.getByRole('button', { name: '排序：最新发布' })).toBeVisible();
});

test('标签并入类目与搜索：旧 ?tag= 链接落到同名类目，作品卡不展示标签', async ({ page }) => {
  const listed = await (await page.request.get('/api/community/works')).json();
  const tagged = listed.items.find((item: { tags: unknown[] }) => item.tags.length > 0) as { title: string; tags: Array<{ name: string }> } | undefined;
  if (tagged === undefined) { test.skip(true, '本地库还没有带标签的公开作品'); return; }
  const tag = tagged.tags[0].name;
  await page.goto(`/?tag=${encodeURIComponent(tag)}`);
  await expect(page.getByRole('heading', { level: 1, name: tag })).toBeVisible();
  const works = page.getByRole('region', { name: '作品' });
  await expect(works.getByRole('heading', { name: tagged.title, exact: true })).toBeVisible();
  await expect(works.getByText(tag, { exact: true })).toHaveCount(0);
  await page.goto(`/?q=${encodeURIComponent(tag)}`);
  await expect(page.getByRole('heading', { level: 1, name: `“${tag}”` })).toBeVisible();
  await expect(works.getByRole('heading', { name: tagged.title, exact: true })).toBeVisible();
});

test('作品卡直接点喜欢：未登录弹出登录弹窗，登录后继续并同步状态', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('/?sort=new');
  await waitHydrated(page);
  const like = page.getByRole('region', { name: '作品' }).getByRole('button', { name: /^喜欢「/ }).first();
  const label = (await like.getAttribute('aria-label'))!;
  const title = label.slice(3, -1);
  await like.click();
  const dialog = page.getByRole('dialog', { name: '登录豆色绘' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('邮箱').fill('e2e-moderator@example.com');
  await dialog.getByLabel('密码').fill('E2e-pass-123!');
  await dialog.getByRole('button', { name: '登录', exact: true }).click();
  const liked = page.getByRole('button', { name: `取消喜欢「${title}」` }).first();
  await expect(liked).toHaveAttribute('aria-pressed', 'true');
  // 刷新后仍是服务端给出的已喜欢状态；再点一次取消。
  await page.reload();
  await waitHydrated(page);
  await expect(liked).toHaveAttribute('aria-pressed', 'true');
  await liked.click();
  await expect(page.getByRole('button', { name: `喜欢「${title}」` }).first()).toHaveAttribute('aria-pressed', 'false');
});
