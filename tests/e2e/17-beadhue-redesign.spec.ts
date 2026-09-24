import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import {
  BASE_URL,
  fillField,
  uniqueEmail,
  waitForMailLink,
  uploadFile,
  waitHydrated,
  waitSaved,
} from "./helpers";

async function savedProject(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("beadhue");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<{
        id: string;
        project: Record<string, unknown>;
      } | null>((resolve, reject) => {
        const r = db.transaction("designs").objectStore("designs").getAll();
        r.onsuccess = () => {
          const rows = r.result.filter(
            (x: { deletedAt?: string }) => !x.deletedAt,
          );
          resolve(
            rows.length
              ? { id: rows[0].id, project: JSON.parse(rows[0].projectJson) }
              : null,
          );
        };
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  });
}

test("B: discover → crop → neutral editor/reference → save/export → restore, at four widths", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await waitHydrated(page);
  const consent = page.getByRole("button", { name: "不同意", exact: true });
  if (await consent.isVisible()) await consent.click();
  await expect(page.getByRole("navigation", { name: "类目" })).toBeVisible();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "创作" }).click();
  await waitHydrated(page);
  await expect(page.getByRole("heading", { name: "创作一张拼豆图纸" })).toBeVisible();
  await uploadFile(page, resolve("tests/fixtures/photo-gradient-64.png"));
  await expect(page.getByRole("dialog", { name: "新建图纸" })).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: info.outputPath("crop-desktop.png") });
  await page.getByRole("button", { name: "生成图纸", exact: true }).click();
  const canvas = page.getByLabel(/^图纸编辑画布/);
  await expect(canvas).toBeVisible();
  const camera = page.locator("[data-camera][data-viewport]").first();
  await page.getByLabel("设计名称").fill("B 原型验收");
  await waitSaved(page);
  const before = await savedProject(page);
  expect(before?.project.original).toBeTruthy();
  for (const width of [1440, 768, 390, 350]) {
    await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // 原图参照：桌面浮窗、手机上下分屏，都单向跟随画布的同一范围。
    await page.getByRole("button", { name: "打开原图参照" }).click();
    const reference = page.locator('[aria-label="原图 · 跟随画布"][data-camera]');
    await expect(reference).toBeVisible();
    await expect(reference).toHaveAttribute("data-camera", (await camera.getAttribute("data-camera"))!);
    await page.screenshot({ path: info.outputPath(`editor-reference-${width}.png`) });
    await reference.getByRole("button", { name: "关闭原图参照" }).click();
    await page.screenshot({ path: info.outputPath(`editor-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  // 手形平移只改视图，从不写图纸。
  await page.getByRole("button", { name: "手形", exact: true }).click();
  const bounds = (await canvas.boundingBox())!;
  const cameraBefore = await camera.getAttribute("data-camera");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 25, bounds.y + bounds.height / 2 + 20);
  await page.mouse.up();
  await expect(camera).not.toHaveAttribute("data-camera", cameraBefore!);
  expect((await savedProject(page))?.project.pattern).toEqual(before?.project.pattern);
  await page.reload();
  await expect(canvas).toBeVisible();
  await expect(page.getByLabel("设计名称")).toHaveValue("B 原型验收");
  expect((await savedProject(page))?.project.original).toEqual(before?.project.original);
  expect((await savedProject(page))?.project.pattern).toEqual(before?.project.pattern);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("menuitem", { name: /导出项目文件/ }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe("豆色绘-B 原型验收.json");
  const stream = await exported.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(chunks).toString()).format).toBe("beadhue-project");
});

test("B: user pages retain the approved palette and fit phone/tablet/desktop", async ({
  page,
}, info) => {
  for (const width of [1440, 390, 350, 768]) {
    await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 });
    for (const route of [
      "/me",
      "/palettes",
      "/help",
      "/me/settings",
      "/privacy",
      "/about",
      "/login",
      "/missing-beadhue",
    ]) {
      await page.goto(route);
      await waitHydrated(page);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      expect(
        await page
          .locator("button,.btn-primary,.btn-outline,.button")
          .evaluateAll((nodes) =>
            nodes
              .filter((el) => {
                const s = getComputedStyle(el);
                return (
                  s.display !== "none" &&
                  s.boxShadow !== "none" &&
                  !s.boxShadow.startsWith("inset")
                );
              })
              .map((el) => el.textContent),
          ),
      ).toEqual([]);
      // 旧内容仍在 .beadhue-ui（candy）作用域；已重做的页面（账号页）只有新界面区域。
      const legacy = page.locator(".beadhue-ui");
      if (await legacy.count()) expect(await legacy.first().getAttribute("data-theme")).toBe("candy");
      else expect(await page.locator("[data-ui]").count()).toBeGreaterThan(0);
      await page.screenshot({
        path: info.outputPath(`${route.slice(1)}-${width}.png`),
        fullPage: true,
      });
    }
  }
});

test("B: private full original sync restores in a separate browser context without regenerating", async ({
  page,
  browser,
}, info) => {
  const email = uniqueEmail(`beadhue-${info.project.name}`),
    password = "beadhue-test-password-123";
  await page.goto("/register");
  await fillField(page, "邮箱", email);
  await fillField(page, "密码", password, { exact: true });
  await fillField(page, "确认密码", password);
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(page.getByText(/验证邮件已发送/).first()).toBeVisible();
  await page.goto(await waitForMailLink("verify", email));
  await expect(page.getByText(/邮箱验证成功/).first()).toBeVisible();
  await page.goto("/login");
  await fillField(page, "邮箱", email);
  await fillField(page, "密码", password, { exact: true });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/me|\/app/);
  await page.goto("/app?new=1");
  await waitHydrated(page);
  await page
    .getByLabel("图片文件选择器")
    .setInputFiles(resolve("tests/fixtures/photo-gradient-64.png"));
  await page.getByRole("button", { name: "生成图纸", exact: true }).click();
  await expect(page.getByLabel("图纸编辑画布")).toBeVisible();
  await page.getByLabel("设计名称").fill("跨上下文原图恢复");
  // 新编辑器自动保存（登录后自动同步），没有「保存」按钮。
  await expect
    .poll(
      async () =>
        ((await savedProject(page))?.project.original as { assetId?: string })
          ?.assetId,
      { timeout: 30000 },
    )
    .toBeTruthy();
  const saved = await savedProject(page);
  const context = await browser.newContext({
    storageState: await page.context().storageState(),
    viewport: { width: 390, height: 844 },
  });
  try {
    const other = await context.newPage();
    await other.goto(`${BASE_URL}/me`);
    await waitHydrated(other);
    await expect(other.getByText("跨上下文原图恢复").first()).toBeVisible();
    await other.goto(`${BASE_URL}/app?id=${saved!.id}`);
    await expect(other.getByLabel("图纸编辑画布")).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            (await savedProject(other))?.project.original as {
              assetId?: string;
            }
          )?.assetId,
      )
      .toBe((saved!.project.original as { assetId: string }).assetId);
    expect((await savedProject(other))?.project.pattern).toEqual(
      saved!.project.pattern,
    );
    await expect(other.getByText("完整原图尚未载入。")).toHaveCount(0);
    await other.screenshot({
      path: info.outputPath("private-restored-mobile.png"),
    });
  } finally {
    await context.close();
  }
});

test("B: shared pattern uses the approved detail layout; admin buttons stay flat", async ({
  page,
}, info) => {
  await page.goto("/login?next=%2Fadmin");
  await fillField(page, "邮箱", "e2e-admin@example.com");
  await fillField(page, "密码", "E2e-pass-123!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/admin");
  for (const route of [
    "/admin",
    "/admin/tags",
    "/admin/users",
    "/admin/batches",
    "/admin/comments",
    "/admin/reports",
  ]) {
    await page.goto(route);
    await waitHydrated(page);
    expect(await page.locator(".beadhue-ui").count()).toBe(0);
    expect(
      await page
        .locator("button,.btn-primary,.btn-outline,.admin-shortcut")
        .evaluateAll((nodes) =>
          nodes
            .filter((el) => {
              const s = getComputedStyle(el);
              return (
                s.display !== "none" &&
                s.boxShadow !== "none" &&
                !s.boxShadow.startsWith("inset")
              );
            })
            .map((el) => el.textContent),
        ),
    ).toEqual([]);
  }
  await page.screenshot({ path: info.outputPath("admin-flat-buttons.png") });
  await page.goto("/");
  await waitHydrated(page);
  await page.getByRole("region", { name: "作品" }).getByRole("link", { name: /^查看「/ }).first().click();
  // R15 详情：查看器 + 吸顶制作卡；「用这张制作」先确认再建副本。开发服务首次编译详情路由较慢。
  await page.waitForURL(/\/community\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await expect(page.getByRole("region", { name: "图纸查看器" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "制作信息" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("detail-desktop.png") });
  await page.getByRole("button", { name: "用这张制作" }).click();
  await page.getByRole("dialog", { name: "用这张图纸制作" }).getByRole("button", { name: "开始制作" }).click();
  await page.waitForURL("**/app?id=*");
  await expect(page.getByLabel("图纸编辑画布")).toBeVisible();
  const id = new URL(page.url()).searchParams.get("id");
  const shared = await page.request.post(`/api/designs/${id}/share`, {
    headers: { origin: BASE_URL },
  });
  expect(shared.status()).toBe(201);
  const body = await shared.json();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 });
    await page.goto(body.path);
    await waitHydrated(page);
    // R15 分享页：详情页查看器 + 制作卡的只读版，noindex。
    await expect(page.getByText("只读分享", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "图纸查看器" })).toBeVisible();
    const card = page.getByRole("complementary", { name: "图纸信息" });
    await expect(card.getByRole("heading", { name: "色号清单" })).toBeVisible();
    await expect(card.getByRole("link", { name: "做我自己的图纸" })).toHaveAttribute("href", "/app");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // 页脚只有一个（桌面显示、手机隐藏）。
    expect(await page.locator("footer").count()).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`share-${width}.png`),
      fullPage: true,
    });
  }
  const gone = await page.goto("/s/aaaaaaaaaaaaaaaaaaaaaaaa");
  expect(gone?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "这个分享链接已失效" })).toBeVisible();
});
