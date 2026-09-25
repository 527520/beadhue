// R15 终审交互走查（票 14）：键盘全流程、触屏、减少动态效果、200% 缩放、慢网骨架与失败重试。
// 用法（仓库根目录；先起实现服务并跑 audit-seed.mjs 生成 fixtures.json）：
//   IMPL_BASE=http://127.0.0.1:3170 node .scratch/ui-rebuild/tools/walkthrough.mjs [--only=keyboard,touch,motion,zoom,network]
// 输出：evidence/walkthrough/<流程>-<序号>-<步骤>.png 与 walkthrough.json（每步：做了什么、焦点落在哪、是否符合预期）。
// 每一步独立判定，失败只记录不中断，便于一次看全。
import { chromium, devices } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = (process.env.IMPL_BASE ?? 'http://127.0.0.1:3170').replace(/\/$/, '');
const OUT = resolve('.scratch/ui-rebuild/evidence/walkthrough');
mkdirSync(OUT, { recursive: true });
const F = JSON.parse(readFileSync(resolve('.scratch/ui-rebuild/evidence/audit/fixtures.json'), 'utf8'));
const PASSWORD = F.password ?? 'E2e-pass-123!';
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7).split(',');
const results = [];
let shot = 0;

function record(flow, step, ok, detail = '') {
  results.push({ flow, step, ok, detail });
  console.log(`${ok ? '✓' : '✘'} [${flow}] ${step}${detail ? ` — ${detail}` : ''}`);
}
async function capture(page, flow, name) {
  shot += 1;
  const file = `${flow}-${String(shot).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: resolve(OUT, file) }).catch(() => {});
  return file;
}
/** 单步：出错记为失败并继续。 */
async function step(flow, name, run) {
  try {
    const outcome = await run();
    const [ok, detail] = Array.isArray(outcome) ? outcome : [outcome !== false, ''];
    record(flow, name, ok, detail);
    return ok;
  } catch (error) {
    record(flow, name, false, String(error?.message ?? error).split('\n')[0].slice(0, 200));
    return false;
  }
}
const focused = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return 'body';
  const name = el.getAttribute('aria-label') || el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 40) || '';
  return `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''}「${name}」`;
});
/** 连按 key 直到焦点满足 test（在页面里执行），返回按键次数（已满足则为 0）；找不到返回 -1。 */
async function pressUntil(page, test, { key = 'Tab', max = 80 } = {}) {
  if (await page.evaluate(test)) return 0;
  for (let count = 1; count <= max; count += 1) {
    await page.keyboard.press(key);
    if (await page.evaluate(test)) return count;
  }
  return -1;
}
/** 焦点元素是否有可见的焦点指示（描边或阴影，含外包一层的焦点环）。 */
const focusVisible = (page) => page.evaluate(() => {
  const visible = (el) => {
    if (!el) return false;
    const style = getComputedStyle(el);
    return (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none';
  };
  const el = document.activeElement;
  return visible(el) || visible(el?.parentElement);
});
async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD);
  await page.getByLabel('密码', { exact: true }).press('Enter');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ---------- 键盘全流程：发现 → 详情 → 用这张制作 → 编辑 → 导出 → 公开 ----------
async function keyboard(browser) {
  const flow = 'keyboard';
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', acceptDownloads: true });
  const page = await context.newPage();
  await login(page, F.accounts.user);
  await page.goto(`${BASE}/`);
  await page.waitForLoadState('networkidle');
  await step(flow, '第一次 Tab 落在「跳到主内容」', async () => {
    await page.keyboard.press('Tab');
    const now = await focused(page);
    await capture(page, flow, 'skip-link');
    return [/跳到主内容/.test(now) && await focusVisible(page), now];
  });
  await step(flow, '回车跳过顶栏，Tab 到第一张作品卡', async () => {
    await page.keyboard.press('Enter');
    const count = await pressUntil(page, () => (document.activeElement?.getAttribute('aria-label') ?? '').startsWith('查看「'));
    await capture(page, flow, 'first-card');
    return [count > 0 && await focusVisible(page), `${count} 次 Tab，${await focused(page)}`];
  });
  await step(flow, '回车打开详情', async () => {
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/community\//);
    const title = await page.getByRole('heading', { level: 1 }).innerText();
    return [Boolean(title), title];
  });
  await step(flow, 'Tab 到「用这张制作」并打开弹窗，焦点进入弹窗', async () => {
    const count = await pressUntil(page, () => document.activeElement?.textContent?.trim() === '用这张制作');
    if (count < 0) return [false, '找不到'];
    await capture(page, flow, 'make-button');
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '用这张图纸制作' });
    await dialog.waitFor();
    const inside = await dialog.evaluate((node) => node.contains(document.activeElement));
    await capture(page, flow, 'make-dialog');
    return [inside, `${count} 次 Tab，弹窗内焦点 ${await focused(page)}`];
  });
  await step(flow, 'Tab 到「开始制作」回车进入编辑器', async () => {
    const count = await pressUntil(page, () => document.activeElement?.textContent?.trim() === '开始制作', { max: 12 });
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/app\?id=/, { timeout: 30_000 });
    await page.getByLabel(/^图纸编辑画布/).waitFor({ timeout: 40_000 });
    return [count >= 0, `${count} 次 Tab`];
  });
  await step(flow, 'Tab 到编辑画布，焦点框可见', async () => {
    const count = await pressUntil(page, () => (document.activeElement?.getAttribute('aria-label') ?? '').startsWith('图纸编辑画布'), { max: 60 });
    // 画布进页时由脚本聚焦，焦点框在第一次按键后才出现：按一下方向键再按回来。
    if (count === 0) { await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); }
    await capture(page, flow, 'canvas-focus');
    return [count >= 0 && await focusVisible(page), `${count} 次 Tab`];
  });
  await step(flow, '方向键移光标、B 选画笔、回车落笔、⌘/Ctrl+Z 撤销', async () => {
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('b');
    await page.keyboard.press('Enter');
    const status = await page.getByRole('status').filter({ hasText: /光标：/ }).first().innerText();
    const undo = page.getByRole('button', { name: '撤销', exact: true });
    const canUndo = await undo.isEnabled();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await capture(page, flow, 'painted');
    return [/光标：第 2 行 第 2 列/.test(status), `${status.replace(/\s+/g, ' ')}；撤销可用：${canUndo}`];
  });
  await step(flow, 'Shift+Tab 回到「导出」，方向键选「下载 PNG…」，回车下载', async () => {
    const count = await pressUntil(page, () => document.activeElement?.textContent?.trim() === '导出', { key: 'Shift+Tab', max: 40 });
    if (count < 0) return [false, '找不到「导出」'];
    await page.keyboard.press('Enter');
    await page.getByRole('menu').waitFor();
    const arrows = await pressUntil(page, () => (document.activeElement?.textContent ?? '').includes('下载 PNG'), { key: 'ArrowDown', max: 8 });
    await capture(page, flow, 'export-menu');
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '下载 PNG' });
    await dialog.waitFor();
    const tabs = await pressUntil(page, () => document.activeElement?.textContent?.trim() === '下载', { max: 20 });
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.keyboard.press('Enter')]);
    if (await dialog.isVisible()) await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    const back = await focused(page);
    return [arrows >= 0 && tabs > 0 && /导出/.test(back), `${download.suggestedFilename()}（菜单 ${arrows} 次方向键，弹窗 ${tabs} 次 Tab；关闭后焦点 ${back}）`];
  });
  await step(flow, 'Esc 关闭弹窗后焦点回到触发按钮', async () => {
    await page.getByRole('button', { name: '导出', exact: true }).focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await menu.waitFor();
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    const now = await focused(page);
    return [/导出/.test(now), now];
  });
  await step(flow, '「分享」→「公开到豆社…」弹窗可用键盘打开，Esc 关闭后焦点回到「分享」', async () => {
    // 引用来的副本不能再公开（菜单项禁用），换成本人自己的设计。
    await page.goto(`${BASE}/app?id=${F.designs.cat.id}`);
    await page.getByLabel(/^图纸编辑画布/).waitFor({ timeout: 40_000 });
    const share = page.getByRole('button', { name: '分享', exact: true });
    await share.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menu').last().waitFor();
    await pressUntil(page, () => (document.activeElement?.textContent ?? '').includes('公开到豆社'), { key: 'ArrowDown', max: 6 });
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: /公开到豆社/ });
    await dialog.waitFor();
    const inside = await dialog.evaluate((node) => node.contains(document.activeElement));
    await capture(page, flow, 'publish-dialog');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    const now = await focused(page);
    return [inside && /分享/.test(now), `弹窗内焦点 ${inside}，关闭后 ${now}`];
  });
  await context.close();
}

// ---------- 触屏：iPhone 13（游客 → 登录 → 手机编辑器） ----------
async function touch(browser) {
  const flow = 'touch';
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  await page.goto(`${BASE}/`);
  await step(flow, '发现页轻点作品卡进入详情', async () => {
    await page.getByRole('link', { name: /^查看「/ }).first().tap();
    await page.waitForURL(/\/community\//);
    await capture(page, flow, 'detail');
    return [await noOverflow(page), await page.getByRole('heading', { level: 1 }).innerText()];
  });
  await step(flow, '游客轻点底栏主按钮弹出登录面板，可关闭', async () => {
    await page.getByRole('button', { name: /登录后制作|用这张制作/ }).last().tap();
    const sheet = page.getByRole('dialog').last();
    await sheet.waitFor();
    await capture(page, flow, 'login-sheet');
    await sheet.getByRole('button', { name: '关闭' }).tap();
    await sheet.waitFor({ state: 'detached' });
    return true;
  });
  await step(flow, '查看器工具条可轻点放大（舞台画面随之改变）', async () => {
    const stage = page.getByRole('region', { name: '图纸查看器' });
    const before = await stage.screenshot();
    await page.getByRole('button', { name: '放大', exact: true }).first().tap();
    await page.waitForTimeout(400);
    const after = await stage.screenshot();
    return [!before.equals(after), `放大前后画面${before.equals(after) ? '相同' : '不同'}`];
  });
  await login(page, F.accounts.user);
  await page.goto(`${BASE}/app`);
  await step(flow, '用示例生成后，轻点画布落笔', async () => {
    await page.getByRole('button', { name: /^用示例「/ }).first().tap();
    const dialog = page.getByRole('dialog', { name: '新建图纸' });
    await dialog.waitFor({ timeout: 20_000 });
    await dialog.getByRole('button', { name: '生成图纸', exact: true }).tap();
    const canvas = page.getByLabel(/^图纸编辑画布/);
    await canvas.waitFor({ timeout: 40_000 });
    const summary = page.getByText(/共 [\d,]+ 颗/).first();
    const before = await summary.innerText();
    await page.getByRole('toolbar', { name: '工具' }).getByRole('button', { name: '橡皮', exact: true }).tap();
    const box = await canvas.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    const after = await summary.innerText();
    await capture(page, flow, 'editor-erase');
    return [before !== after && await noOverflow(page), `${before} → ${after}`];
  });
  await step(flow, '「更多」面板与底部颜色面板可轻点打开、关闭', async () => {
    await page.getByRole('button', { name: '更多', exact: true }).tap();
    await capture(page, flow, 'more-sheet');
    await page.keyboard.press('Escape');
    await page.getByRole('toolbar', { name: '工具' }).getByRole('button', { name: /^当前色/ }).tap();
    const colors = page.getByRole('dialog', { name: '颜色' });
    await colors.waitFor();
    await capture(page, flow, 'colors-sheet');
    await colors.getByRole('button', { name: '关闭' }).tap();
    await colors.waitFor({ state: 'detached' });
    return true;
  });
  await context.close();
}

// ---------- 减少动态效果：弹窗、面板、提示不再做位移 / 缩放动画 ----------
async function motion(browser) {
  const flow = 'motion';
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const longestAnimation = () => page.evaluate(() => Math.max(0, ...document.getAnimations().map((animation) => Number(animation.effect?.getTiming().duration) || 0)));
  await page.goto(`${BASE}/community/${F.works.cat}`);
  await step(flow, '游客点「喜欢」弹出登录弹窗：动画时长 ≤ 1ms', async () => {
    await page.getByRole('button', { name: /喜欢/ }).first().click();
    await page.getByRole('dialog').first().waitFor();
    const longest = await longestAnimation();
    await capture(page, flow, 'login-dialog');
    return [longest <= 1, `最长动画 ${longest}ms`];
  });
  await page.keyboard.press('Escape');
  await step(flow, '「更多」菜单展开：动画时长 ≤ 1ms', async () => {
    await page.getByRole('button', { name: '更多操作', exact: true }).first().click();
    await page.getByRole('menu').waitFor();
    const longest = await longestAnimation();
    return [longest <= 1, `最长动画 ${longest}ms`];
  });
  await context.close();
}

// ---------- 200% 缩放：1280 / 1440 宽窗口放大一倍 = 640 / 720 CSS 像素 ----------
async function zoom(browser) {
  const flow = 'zoom';
  const pages = [['discover', '/'], ['detail', `/community/${F.works.cat}`], ['create', '/app'], ['help', '/help'], ['login', '/login']];
  for (const width of [640, 720]) {
    const context = await browser.newContext({ viewport: { width, height: 450 }, deviceScaleFactor: 2, locale: 'zh-CN' });
    const page = await context.newPage();
    for (const [name, path] of pages) {
      await step(flow, `${width}px（200%）${name} 无横向溢出`, async () => {
        await page.goto(`${BASE}${path}`);
        await page.waitForLoadState('networkidle');
        await capture(page, flow, `${name}-${width}`);
        return noOverflow(page);
      });
    }
    await login(page, F.accounts.admin);
    for (const [name, path] of [['me', '/me'], ['admin', '/admin'], ['admin-works', '/admin/works']]) {
      await step(flow, `${width}px（200%）${name} 无横向溢出`, async () => {
        await page.goto(`${BASE}${path}`);
        await page.waitForLoadState('networkidle');
        await capture(page, flow, `${name}-${width}`);
        return noOverflow(page);
      });
    }
    await context.close();
  }
}

// ---------- 慢网骨架与失败重试 ----------
async function network(browser) {
  const flow = 'network';
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  await login(page, F.accounts.admin);
  // 页面在等待期间跳走时请求已被放弃，continue / fulfill 会抛错，吞掉即可。
  const delay = (pattern, ms) => page.route(pattern, async (route) => { await new Promise((done) => setTimeout(done, ms)); await route.continue().catch(() => {}); });
  const fail = (pattern) => page.route(pattern, (route) => route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: '服务暂时不可用' } } }).catch(() => {}));

  await step(flow, '后台作品表慢网：先显示「正在读取…」骨架，不闪空状态', async () => {
    await delay('**/api/admin/community/works?**', 2500);
    await page.goto(`${BASE}/admin/works`);
    const loading = page.getByRole('status', { name: '正在读取…' });
    await loading.waitFor({ timeout: 2000 });
    const empty = await page.getByText(/没有|暂无/).count();
    await capture(page, flow, 'admin-skeleton');
    await page.unroute('**/api/admin/community/works?**');
    return [empty === 0, `骨架可见，空状态文字 ${empty} 处`];
  });
  await step(flow, '后台作品表接口失败：给出错误与「重新读取」，恢复后可重试', async () => {
    await fail('**/api/admin/community/works?**');
    await page.goto(`${BASE}/admin/works`);
    const retry = page.getByRole('button', { name: '重新读取', exact: true });
    await retry.waitFor({ timeout: 10_000 });
    await capture(page, flow, 'admin-error');
    await page.unroute('**/api/admin/community/works?**');
    await retry.click();
    await page.locator('tbody tr').first().waitFor({ timeout: 10_000 });
    return true;
  });
  await step(flow, '详情评论接口失败：说明没加载出来并可重试', async () => {
    await fail('**/api/community/works/*/comments?**');
    await page.goto(`${BASE}/community/${F.works.cat}`);
    const message = page.getByText('评论没有加载出来');
    await message.waitFor({ timeout: 10_000 });
    await message.scrollIntoViewIfNeeded();
    await capture(page, flow, 'comments-error');
    await page.unroute('**/api/community/works/*/comments?**');
    const retry = page.getByRole('button', { name: '重试', exact: true }).first();
    await retry.click();
    await message.waitFor({ state: 'detached', timeout: 10_000 });
    return true;
  });
  await step(flow, '我的设计云端失败：保留本机列表，给出「重试同步」', async () => {
    await fail(/\/api\/designs(\?|$)/);
    await page.goto(`${BASE}/me`);
    const retry = page.getByRole('button', { name: '重试同步', exact: true });
    await retry.waitFor({ timeout: 15_000 });
    await capture(page, flow, 'me-sync-failed');
    await page.unroute(/\/api\/designs(\?|$)/);
    await retry.click();
    await retry.waitFor({ state: 'detached', timeout: 15_000 });
    return true;
  });
  await context.close();
}

// ---------- axe：全部路由 1440 / 390，只允许 minor / moderate 以下 ----------
async function axe(browser) {
  const flow = 'axe';
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const publicRoutes = ['/', `/?q=${encodeURIComponent('猫')}`, `/community/${F.works.cat}`, `/u/${F.authors.official}`, `/u/${F.authors.user}`, F.share.path, '/palettes', '/app', '/help', '/about', '/privacy', '/community/rules', '/community/copyright', '/login', '/register', '/forgot-password', '/missing-page'];
  const userRoutes = ['/me', '/me/public', '/me/likes', '/me/palettes', '/me/settings', `/app?id=${F.designs.cat.id}`, `/app?id=${F.designs.cat.id}&mode=stitch`];
  const adminRoutes = ['/admin', '/admin/reviews', '/admin/works', '/admin/comments', '/admin/reports', '/admin/users', '/admin/tags', '/admin/batches', '/admin/analytics', '/admin/audit', '/admin/logs', '/admin/system'];
  const serious = async (page) => (await new AxeBuilder({ page }).exclude('[data-base-ui-focus-guard]').analyze()).violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''));
  for (const width of [1440, 390]) {
    for (const [who, routes] of [['guest', publicRoutes], ['user', userRoutes], ['admin', adminRoutes]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', isMobile: width < 768, hasTouch: width < 768 });
      const page = await context.newPage();
      if (who !== 'guest') await login(page, F.accounts[who]);
      for (const route of routes) {
        await step(flow, `${width}px ${who} ${decodeURIComponent(route)}`, async () => {
          await page.goto(`${BASE}${route}`);
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(600);
          const found = await serious(page);
          return [found.length === 0, found.map((item) => `${item.id}×${item.nodes.length}`).join(', ')];
        });
      }
      await context.close();
    }
  }
}

const FLOWS = { keyboard, touch, motion, zoom, network, axe };
const browser = await chromium.launch();
try {
  for (const [name, run] of Object.entries(FLOWS)) {
    if (only && !only.includes(name)) continue;
    await run(browser).catch((error) => record(name, '流程异常中断', false, String(error?.message ?? error).split('\n')[0]));
  }
} finally {
  await browser.close();
}
writeFileSync(resolve(OUT, 'walkthrough.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((item) => !item.ok).length;
console.log(`\n共 ${results.length} 步，未通过 ${failed} 步；截图与记录在 ${OUT}`);
