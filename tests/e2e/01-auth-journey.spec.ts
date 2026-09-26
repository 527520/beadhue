/**
 * E2E 核心旅程 1：账号（spec §F9）。
 * 注册 → dev 邮件钩子取验证链接 → 验证 → 登录 → 已登录状态。
 */
import { expect, test } from '@playwright/test';
import { fillField, uniqueEmail, waitForMailLink } from './helpers';

// 错误挂在字段下（Field.Error）或提交按钮上方（FormAlert），都以 role="alert" 播报。
const errorAlert = (page: import('@playwright/test').Page) => page.getByRole('alert').filter({ hasText: /\S/ });

test('注册 → 邮箱验证 → 登录 → 首页显示登录态入口', async ({ page }) => {
  const email = uniqueEmail('journey');
  const password = 'e2e-password-123';
  const username = '拼豆小匠';

  // 注册页：客户端校验拦截非法输入
  await page.goto('/register');
  await fillField(page, '邮箱', 'not-an-email');
  await fillField(page, '密码', 'short');
  await fillField(page, '确认密码', 'short');
  await page.getByRole('button', { name: '注册' }).click();
  await expect(errorAlert(page).first()).toBeVisible({ timeout: 10_000 });

  // 合法注册 → 显示「验证邮件已发送」+ 前往登录
  await fillField(page, '用户名（选填）', username);
  await fillField(page, '邮箱', email);
  await fillField(page, '密码', password);
  await fillField(page, '确认密码', password);
  await page.getByRole('button', { name: '注册' }).click();
  await expect(page.getByText(/验证邮件已发送/).first()).toBeVisible({ timeout: 15_000 });

  // 验证邮件 → 成功页
  const link = await waitForMailLink('verify', email);
  await page.goto(link);
  await expect(page.getByText(/邮箱验证成功/).first()).toBeVisible({ timeout: 10_000 });

  // 登录
  await page.goto('/login');
  await fillField(page, '邮箱', email);
  await fillField(page, '密码', password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(/\/me|\/app/, { timeout: 15_000 });

  // 展示名随账号保存，并可在账号页修改；邮箱仍是登录凭据。
  await page.goto('/me/settings');
  const usernameInput = page.getByLabel('用户名');
  await expect(usernameInput).toHaveValue(username);
  await fillField(page, '用户名', '新的拼豆名');
  const save = page.getByRole('button', { name: '保存', exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('[data-slot="toast"]').filter({ hasText: '已保存' })).toBeVisible();
  // 保存后顶栏头像菜单里的展示名随之更新（外壳重新探测登录态）。
  await page.getByRole('button', { name: '账号菜单' }).click();
  await expect(page.getByRole('menu').getByText('新的拼豆名')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByLabel('用户名')).toHaveValue('新的拼豆名');
});

test('登录失败显示统一错误文案（防枚举，E28/E33）', async ({ page }) => {
  await page.goto('/login');
  await fillField(page, '邮箱', uniqueEmail('nouser'));
  await fillField(page, '密码', 'wrong-password-123');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(errorAlert(page).first()).toHaveText(/邮箱或密码错误/, { timeout: 10_000 });
});

test('找回密码恒成功提示（防枚举，E30）', async ({ page }) => {
  await page.goto('/forgot-password');
  await fillField(page, '邮箱', uniqueEmail('forgot'));
  await page.getByRole('button', { name: /提交|发送/ }).click();
  await expect(page.getByText(/若该邮箱已注册|重置邮件已发送/).first()).toBeVisible({ timeout: 10_000 });
});

test('旧路由永久重定向到新地址并保留查询参数（D66）', async ({ request }) => {
  for (const [from, to] of [
    ['/community?tag=%E7%8C%AB%E5%92%AA&sort=featured', '/?tag=%E7%8C%AB%E5%92%AA&sort=featured'],
    ['/designs', '/me'],
    ['/community/mine', '/me/public'],
    ['/account', '/me/settings'],
    ['/create?pick=cat', '/app?pick=cat'],
  ] as const) {
    const response = await request.get(from, { maxRedirects: 0 });
    expect(response.status(), from).toBe(308);
    expect(response.headers().location, from).toBe(to);
  }
});

test('站内需要登录的操作弹出登录弹窗，登录后留在原页面', async ({ page }) => {
  await page.goto('/me/likes');
  await page.getByRole('button', { name: '登录' }).last().click();
  const dialog = page.getByRole('dialog', { name: '登录豆色绘' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '登录', exact: true }).click();
  await expect(dialog.getByText('请输入正确的邮箱地址')).toBeVisible();
  await fillField(page, '邮箱', 'e2e-user@example.com');
  await dialog.getByLabel('密码', { exact: true }).fill('E2e-pass-123!');
  await dialog.getByRole('button', { name: '登录', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/me\/likes$/);
  await expect(page.getByRole('button', { name: '账号菜单' })).toBeVisible();
});
