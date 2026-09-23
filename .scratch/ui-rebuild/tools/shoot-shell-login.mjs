// 为 shoot-shell.mjs 生成实现侧的登录态（管理员账号，头像菜单里有「管理后台」）。
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
const BASE = process.env.IMPL_BASE ?? 'http://127.0.0.1:3101';
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(BASE);
const status = await page.evaluate(async () => (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'e2e-admin@example.com', password: 'E2e-pass-123!' }) })).status);
console.log('login', status);
await context.storageState({ path: resolve('.scratch/ui-rebuild/evidence/impl/03/login-state.json') });
await browser.close();
