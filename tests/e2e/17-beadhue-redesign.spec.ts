import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import {
  fillField,
  uniqueEmail,
  waitForMailLink,
  waitHydrated,
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
  const consent = page.getByRole("button", { name: "拒绝", exact: true });
  if (await consent.isVisible()) await consent.click();
  await expect(
    page.getByRole("heading", { name: "下一份喜欢，从这里开始。" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("discover-desktop.png"),
    fullPage: true,
  });
  await page.locator(".main-nav").getByRole("link", { name: "创作" }).click();
  await waitHydrated(page);
  await expect(
    page.getByRole("heading", { name: "创作一张图纸" }),
  ).toBeVisible();
  await page
    .getByLabel("图片文件选择器")
    .setInputFiles(resolve("tests/fixtures/photo-gradient-64.png"));
  await expect(
    page.getByRole("heading", { name: "留住你想拼的部分" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("crop-desktop.png") });
  await page.getByRole("button", { name: "生成图纸", exact: true }).click();
  const canvas = page.getByLabel("图纸编辑画布");
  await expect(canvas).toBeVisible();
  const camera = page.locator(".editor-canvas-viewport[data-camera]").first();
  const reference = page.getByRole("complementary", { name: "原图参照" });
  await expect(reference).toBeVisible();
  await expect(reference.getByText("完整原图尚未载入。")).toHaveCount(0);
  await page.getByLabel("设计名称").fill("B 原型验收");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "你的设计已保存" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续编辑" }).click();
  const before = await savedProject(page);
  expect(before?.project.original).toBeTruthy();
  for (const width of [1440, 768, 390, 350]) {
    await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await expect(reference).toBeVisible();
    const current = await camera.getAttribute("data-camera");
    await expect(reference).toHaveAttribute("data-camera", current!);
    await page.getByRole("button", { name: "放大原图", exact: true }).click();
    await expect(camera).toHaveAttribute("data-camera", current!);
    await page.screenshot({
      path: info.outputPath(`editor-expanded-${width}.png`),
    });
    await page.getByRole("button", { name: "收起原图", exact: true }).click();
    await page.screenshot({ path: info.outputPath(`editor-${width}.png`) });
  }
  // A pan changes the shared camera, never pattern cells.
  const bounds = await canvas.boundingBox();
  expect(bounds).toBeTruthy();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2 + 25,
    bounds!.y + bounds!.height / 2 + 20,
  );
  await page.mouse.up();
  await expect(reference).toHaveAttribute(
    "data-camera",
    (await camera.getAttribute("data-camera"))!,
  );
  expect((await savedProject(page))?.project.pattern).toEqual(
    before?.project.pattern,
  );
  await page.reload();
  await expect(canvas).toBeVisible();
  await expect(page.getByLabel("设计名称")).toHaveValue("B 原型验收");
  expect((await savedProject(page))?.project.original).toEqual(
    before?.project.original,
  );
  expect((await savedProject(page))?.project.pattern).toEqual(
    before?.project.pattern,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(".workspace-project-actions")
    .getByRole("button", { name: "导出", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /导出项目|下载项目/ }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe("豆色绘-B 原型验收.json");
  const stream = await exported.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(chunks).toString()).format).toBe(
    "beadhue-project",
  );
});

test("B: user pages retain the approved palette and fit phone/tablet/desktop", async ({
  page,
}, info) => {
  for (const width of [1440, 390, 350, 768]) {
    await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 });
    for (const route of [
      "/designs",
      "/palettes",
      "/help",
      "/account",
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
      expect(await page.locator(".beadhue-ui").getAttribute("data-theme")).toBe(
        "candy",
      );
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
  await page.waitForURL(/\/designs|\/app/);
  await page.goto("/app?new=1");
  await waitHydrated(page);
  await page
    .getByLabel("图片文件选择器")
    .setInputFiles(resolve("tests/fixtures/photo-gradient-64.png"));
  await page.getByRole("button", { name: "生成图纸", exact: true }).click();
  await expect(page.getByLabel("图纸编辑画布")).toBeVisible();
  await page.getByLabel("设计名称").fill("跨上下文原图恢复");
  await page.getByRole("button", { name: "保存", exact: true }).click();
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
    await other.goto("http://127.0.0.1:3100/designs");
    await waitHydrated(other);
    await expect(other.getByText("跨上下文原图恢复").first()).toBeVisible();
    await other.goto(`http://127.0.0.1:3100/app?id=${saved!.id}`);
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
  await page.locator(".work-card a").first().click();
  await expect(page.locator(".detail-grid")).toBeVisible();
  await page.screenshot({ path: info.outputPath("detail-desktop.png") });
  const reuse = page
    .getByRole("button", { name: /引用.*设计|引用.*图纸|开始制作|用这张制作/ })
    .first();
  await reuse.click();
  await page.waitForURL("**/app?id=*");
  await expect(page.getByLabel("图纸编辑画布")).toBeVisible();
  const id = new URL(page.url()).searchParams.get("id");
  const shared = await page.request.post(`/api/designs/${id}/share`, {
    headers: { origin: "http://127.0.0.1:3100" },
  });
  expect(shared.status()).toBe(201);
  const body = await shared.json();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 });
    await page.goto(body.path);
    await waitHydrated(page);
    await expect(
      page.getByRole("heading", { name: "一颗一颗，拼成喜欢。" }),
    ).toBeVisible();
    expect(await page.locator("footer.footer").count()).toBe(1);
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
});
