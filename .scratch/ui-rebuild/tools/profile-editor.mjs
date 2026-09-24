// 临时剖析脚本：在 3101 开发服务上重放「上传 100×8000 → 生成 → 重新裁剪 → 确认」，
// 输出 CPU profile 中自耗时最高的函数（用于定位长任务）。
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3101';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  window.__lt = [];
  new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true });
});
await page.goto(`${BASE}/app?new=1`);
await page.waitForSelector('html[data-beadhue-hydrated="true"]', { timeout: 120_000 });
const reject = page.getByRole('button', { name: '不同意', exact: true });
if (await reject.isVisible().catch(() => false)) await reject.click();
// 预热一轮，避免把按需编译算进来
for (let round = 0; round < 2; round++) {
  const client = await page.context().newCDPSession(page);
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 200 });
  const t0 = await page.evaluate(() => performance.now());
  await page.getByLabel('图片文件选择器').setInputFiles(resolve('tests/fixtures/max-100x8000.png'));
  const dialog = page.getByRole('dialog', { name: '新建图纸' });
  await dialog.getByRole('button', { name: '生成图纸', exact: true }).click({ timeout: 60_000 });
  await page.getByText(/共 20000 颗/).first().waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.getByRole('tab', { name: '调整', exact: true }).click();
  await page.getByRole('button', { name: '重新裁剪', exact: true }).click();
  if (round === 1 && !process.env.NOPROF) await client.send('Profiler.start');
  await page.getByRole('button', { name: '确认并更新' }).click();
  await page.waitForTimeout(1500);
  if (round === 1) {
    const lt = await page.evaluate((t) => window.__lt.filter(([s]) => s >= t), t0);
    console.log('LONGTASKS', JSON.stringify(lt));
    if (process.env.NOPROF) { await browser.close(); process.exit(0); }
    const { profile } = await client.send('Profiler.stop');
    const self = new Map();
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas;
    profile.samples.forEach((id, i) => {
      const n = byId.get(id);
      const f = n.callFrame;
      const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`;
      self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
    });
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
    for (const [k, v] of top) console.log(v.toFixed(1).padStart(8), k);
  }
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('menuitem', { name: '新建图纸' }).click();
  await page.getByLabel('图片文件选择器').waitFor({ state: 'attached' });
}
await browser.close();
