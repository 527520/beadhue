import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import {
  BASE_URL,
  fillField,
  uniqueEmail,
  waitForMailLink,
  waitHydrated,
  uploadAndGenerate,
} from './helpers';

const widths = [350, 390, 768, 944, 1180, 1280, 1440] as const;
const PHOTO = resolve(process.cwd(), 'tests/fixtures/photo-gradient-64.png');

async function registerAndLogin(page: Page): Promise<string> {
  const email = uniqueEmail('responsive');
  const password = 'responsive-password-123';
  await page.goto('/register');
  await fillField(page, '邮箱', email);
  await fillField(page, '密码', password);
  await fillField(page, '确认密码', password);
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await expect(page.getByText(/验证邮件已发送/).first()).toBeVisible({ timeout: 15_000 });
  await page.goto(await waitForMailLink('verify', email));
  await expect(page.getByText(/邮箱验证成功/).first()).toBeVisible({ timeout: 10_000 });
  await page.goto('/login');
  await fillField(page, '邮箱', email);
  await fillField(page, '密码', password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/\/me|\/app/, { timeout: 15_000 });
  return email;
}

/** 编辑器顶栏（票 08 / 09）：可见的按钮、输入框互不重叠，都在视口内，页面不横向滚动。 */
async function assertEditorTopbar(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))));
  await expect(page.getByRole('group', { name: '模式' })).toBeVisible();
  const geometry = await page.evaluate(() => {
    const header = document.querySelector('[data-ui] > header');
    const rects = Array.from(header?.querySelectorAll('button, input') ?? [])
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
      })
      .map((element) => element.getBoundingClientRect());
    const intersects = rects.some((first, index) => rects.slice(index + 1).some((second) => first.left < second.right - 0.5 && first.right > second.left + 0.5 && first.top < second.bottom && first.bottom > second.top));
    return {
      count: rects.length,
      intersects,
      left: Math.min(...rects.map((rect) => rect.left)),
      right: Math.max(...rects.map((rect) => rect.right)),
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    };
  });
  expect(geometry.count, `${width}px 顶栏应有可见操作`).toBeGreaterThanOrEqual(4);
  expect(geometry.intersects, `${width}px 顶栏操作不得重叠`).toBe(false);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.page, `${width}px 页面不得横向滚动`).toBeLessThanOrEqual(geometry.viewport);
}

for (const width of widths) {
  test(`工作台 ${width}px 无横向溢出且关键操作可见`, async ({ page }) => {
    const consoleErrors: Array<{ text: string; url: string }> = [];
    const expectedAnonymousResponses = new Set<string>();
    const httpErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push({ text: message.text(), url: message.location().url });
      }
    });
    page.on('response', (response) => {
      const { pathname } = new URL(response.url());
      if (response.status() === 401 && pathname === '/api/auth/me') {
        expectedAnonymousResponses.add(response.url());
      } else if (response.status() >= 400) {
        httpErrors.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/app');

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '选择图片', exact: true })).toBeVisible();
    // 不得带 capture：移动端浏览器一旦带 capture 只允许调用摄像头，相册选择被堵死
    // （0.3.0 真机验收抓到的回归，模拟器发现不了）。
    await expect(page.getByLabel('图片文件选择器')).not.toHaveAttribute('capture');
    if (width < 768) {
      await page.waitForLoadState('networkidle');
      const unexpectedConsoleErrors = consoleErrors.filter(
        (error) => !expectedAnonymousResponses.has(error.url),
      );
      const errors = [
        ...httpErrors,
        ...unexpectedConsoleErrors.map(({ text, url }) => `${text}${url ? ` (${url})` : ''}`),
      ];
      expect(errors, errors.join('\n')).toEqual([]);
      const mobileNav = page.getByRole('navigation', { name: '主导航' });
      for (const [name, href] of [
        ['发现', '/'], ['创作', '/app'], ['我的', '/me'],
      ] as const) {
        const link = mobileNav.getByRole('link', { name, exact: true });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', href);
      }
    }
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
  });
}

test('桌面设计库与色板页不被固定侧栏撑出视口', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium');

  for (const width of [944, 1280, 1440] as const) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of ['/me', '/palettes'] as const) {
      await page.goto(route);
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
      }));
      expect(dimensions.page, `${route} 在 ${width}px 下不得横向溢出`).toBeLessThanOrEqual(dimensions.viewport);
    }
  }
});

test('编辑器顶栏在游客与登录态的全部目标宽度下不重叠', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium');
  await page.setViewportSize({ width: widths[0], height: 800 });
  await page.goto('/app');
  await uploadAndGenerate(page, PHOTO);
  await expect(page.getByLabel(/^图纸编辑画布/)).toBeVisible({ timeout: 20_000 });
  for (const width of widths) await assertEditorTopbar(page, width);

  const email = await registerAndLogin(page);
  await page.goto('/app');
  await uploadAndGenerate(page, PHOTO);
  await expect(page.getByLabel(/^图纸编辑画布/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(email, { exact: true })).toHaveCount(0);
  for (const width of widths) await assertEditorTopbar(page, width);
});

test('手机编辑器：底部工具栏、颜色 / 信息 / 导出底部面板', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app');
  await uploadAndGenerate(page, PHOTO);
  await expect(page.getByRole('status').filter({ hasText: '图纸已生成' })).toBeAttached({ timeout: 20_000 });
  const tools = page.getByRole('toolbar', { name: '工具' });
  for (const name of ['手形', '画笔', '橡皮', '油漆桶', '吸管']) await expect(tools.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(tools.getByRole('button', { name: '画笔', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await tools.getByRole('button', { name: /^当前色 .*打开颜色$/ }).click();
  const colors = page.getByRole('dialog', { name: '颜色' });
  await expect(colors.getByRole('heading', { name: /图纸用色/ })).toBeVisible();
  await colors.getByRole('button', { name: '关闭' }).click();

  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '信息与采购清单', exact: true }).click();
  const info = page.getByRole('dialog', { name: '信息与采购清单' });
  await expect(info.getByText('10,000 颗').first()).toBeVisible();
  await expect(info.getByRole('button', { name: '复制清单', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '导出', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '导出' }).getByRole('button', { name: '下载 PNG…' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const route of ['/', '/app', '/me', '/me/likes', '/palettes', '/community/rules', '/community/copyright', '/privacy', '/me/settings', '/help', '/about', '/login', '/u/beadhue-official', '/missing-beadhue'] as const) {
  test(`${route} 无 axe 严重或关键问题`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    // WebKit can replace the execution context while Next's development
    // runtime finishes hydrating. Inject axe only after the app is stable.
    await waitHydrated(page);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .include('main')
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    const blocking = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}

test('iOS Safari 触屏环境可上传且页面可滚动', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'webkit');
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  const response = await page.goto(`${BASE_URL}/app`);
  expect(response?.status(), await page.locator('body').innerText()).toBe(200);
  await expect(page.getByRole('button', { name: '选择图片', exact: true })).toBeVisible();
  // 不得带 capture（见上方说明）：手机上必须能选相册，相机入口由系统选择器提供。
  await expect(page.getByLabel('图片文件选择器')).not.toHaveAttribute('capture');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  await context.close();
});

test('Android Chrome 触屏环境可上传且页面可滚动', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium');
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  const response = await page.goto(`${BASE_URL}/app`);
  expect(response?.status(), await page.locator('body').innerText()).toBe(200);
  await expect(page.getByRole('button', { name: '选择图片', exact: true })).toBeVisible();
  // 不得带 capture（见上方说明）：手机上必须能选相册，相机入口由系统选择器提供。
  await expect(page.getByLabel('图片文件选择器')).not.toHaveAttribute('capture');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  await context.close();
});
