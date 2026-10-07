const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const automator = require(
  process.env.WEAPP_AUTOMATOR_MODULE ||
    "/tmp/beadhue-weapp-acceptance/node_modules/miniprogram-automator",
);
const evidence = path.join(__dirname, "evidence/devtools-20261007");
fs.mkdirSync(evidence, { recursive: true });
const result = {
  startedAt: new Date().toISOString(),
  designName: `验收-20261007-彩虹-${Date.now()}`,
  checks: [],
  exceptions: [],
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let mini;
const deadline = setTimeout(() => {
  save();
  process.exit(2);
}, 240000);
function save() {
  fs.writeFileSync(
    path.join(evidence, "local-flow.json"),
    JSON.stringify(result, null, 2),
  );
}
function pass(name, details) {
  result.checks.push({ name, details, status: "passed" });
  save();
  console.log("PASS", name, details || "");
}
async function waitFor(check, label, seconds = 15) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await pause(200);
  }
  throw new Error("Timed out: " + label);
}
async function textElement(page, selector, text) {
  for (const element of await page.$$(selector))
    if ((await element.text()).trim() === text) return element;
  return null;
}
async function tapText(page, selector, text) {
  console.log("ACTION", text);
  const element = await waitFor(() => textElement(page, selector, text), text);
  await element.tap();
  await pause(200);
}
async function screenshot(name) {
  await mini.screenshot({ path: path.join(evidence, name + ".png") });
}
async function readGuest(id) {
  return mini.evaluate((id) => {
    const f = wx.getFileSystemManager(),
      dir = wx.env.USER_DATA_PATH + "/beadhue-guest";
    const names = f
      .readdirSync(dir)
      .filter((n) => /^commit-\d+\.json$/.test(n))
      .sort((a, b) => Number(b.slice(7, -5)) - Number(a.slice(7, -5)));
    const index = JSON.parse(f.readFileSync(dir + "/" + names[0], "utf8"));
    const entry = index.designs[id];
    if (!entry) return null;
    const record = JSON.parse(f.readFileSync(dir + "/" + entry.record, "utf8"));
    return {
      index,
      project: JSON.parse(record.projectJson),
      progress: index.progress[id]
        ? JSON.parse(f.readFileSync(dir + "/" + index.progress[id], "utf8"))
        : null,
    };
  }, id);
}
async function range(page, name, value) {
  for (const field of await page.$$(".field"))
    if ((await field.text()).startsWith(name)) {
      const slider = await field.$("slider");
      if (slider) {
        await slider.trigger("change", { value });
        await pause(200);
        return;
      }
    }
  throw new Error("Missing range: " + name);
}
(async () => {
  mini = await automator.connect({ wsEndpoint: "ws://127.0.0.1:9420" });
  mini.on("exception", (error) => {
    result.exceptions.push(error);
    save();
  });
  const system = await mini.systemInfo();
  result.system = Object.fromEntries(
    [
      "model",
      "platform",
      "SDKVersion",
      "version",
      "windowWidth",
      "windowHeight",
      "pixelRatio",
    ].map((k) => [k, system[k]]),
  );
  save();
  await mini.evaluate(() => {
    globalThis.__weappAcceptanceToasts = [];
    globalThis.__weappAcceptanceShowToast = wx.showToast;
    wx.showToast = (options) => {
      globalThis.__weappAcceptanceToasts.push(options.title);
      return globalThis.__weappAcceptanceShowToast(options);
    };
  });
  let page = await mini.reLaunch("/pages/discover/index");
  await waitFor(
    async () => (await page.$$(".card")).length === 4,
    "four examples",
  );
  pass("首页显示四张自有示例");
  await screenshot("discover");
  let search = await page.$(".search input");
  await search.input("草莓");
  await waitFor(
    async () => (await page.$$(".card")).length === 1,
    "search strawberry",
  );
  assert.equal((await (await page.$(".card-title")).text()).trim(), "草莓");
  pass("搜索筛选示例");
  await search.input("不存在");
  await waitFor(() => page.$(".empty"), "empty search");
  pass("搜索空态");
  await screenshot("discover-empty");
  await search.input("");
  await tapText(page, ".chip", "动物");
  assert.equal((await page.$$(".card")).length, 2);
  pass("动物分类仅显示两张");
  await tapText(page, ".chip", "全部");
  await waitFor(
    async () => (await page.$$(".card")).length === 4,
    "all examples reset",
  );
  await (await page.$(".card")).tap();
  page = await waitFor(async () => {
    const p = await mini.currentPage();
    return p.path === "creation/example/index" && p;
  }, "example details");
  await waitFor(() => page.$("canvas"), "example canvas");
  pass("示例详情与原生 Canvas 打开");
  await screenshot("example");
  await tapText(page, ".button", "用此示例创作");
  page = await waitFor(async () => {
    const p = await mini.currentPage();
    return p.path === "creation/entry/index" && p;
  }, "creation entry");
  await waitFor(() => page.$(".sample-image"), "bundled image");
  await (await page.$(".input")).input(result.designName);
  await range(page, "宽度（格）", 29);
  await range(page, "颜色数", 8);
  await tapText(page, ".button", "生成预览");
  await waitFor(
    () => textElement(page, ".button", "保存并开始编辑"),
    "worker generation",
    40,
  );
  pass("示例解码与 Worker 生成 29 格 / 8 色");
  await screenshot("generation");
  await tapText(page, ".button", "保存并开始编辑");
  page = await waitFor(async () => {
    const p = await mini.currentPage();
    return p.path === "creation/editor/index" && p;
  }, "editor");
  await waitFor(() => page.$("#editor-canvas"), "editor canvas");
  result.designId = page.query.id;
  save();
  const saved = await readGuest(result.designId);
  assert.equal(saved.project.name, result.designName);
  assert.equal(saved.project.pattern.width, 29);
  pass("设计保存到真实微信文件系统", {
    id: result.designId,
    width: saved.project.pattern.width,
    height: saved.project.pattern.height,
  });
  await screenshot("editor");
  const canvas = await page.$("#editor-canvas");
  const canvasSize = await canvas.size();
  const canvasOffset = await canvas.offset();
  const colored = await waitFor(
    async () => {
      await screenshot("editor");
      const picture = sharp(path.join(evidence, "editor.png"));
      const metadata = await picture.metadata();
      const ratio = metadata.width / system.windowWidth;
      const { data: pixels, info: pixelInfo } = await picture
        .extract({
          left: Math.round(Number(canvasOffset.left) * ratio),
          top: Math.round(Number(canvasOffset.top) * ratio),
          width: Math.round(Number(canvasSize.width) * ratio),
          height: Math.round(Number(canvasSize.height) * ratio),
        })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let colored = 0;
      for (let i = 0; i < pixels.length; i += pixelInfo.channels)
        if (
          Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) -
            Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) >
          30
        )
          colored++;
      return colored > 100 ? colored : null;
    },
    "visible editor canvas after initial load",
    5,
  );
  pass("编辑器初次加载后豆粒可见", { coloredPixels: colored });
  const cell = Math.min(
    (Number(canvasSize.width) - 32) / saved.project.pattern.width,
    (Number(canvasSize.height) - 32) / saved.project.pattern.height,
  );
  const x =
    (Number(canvasSize.width) - saved.project.pattern.width * cell) / 2 +
    cell / 2;
  const y =
    (Number(canvasSize.height) - saved.project.pattern.height * cell) / 2 +
    cell / 2;
  const point = {
    identifier: 1,
    x,
    y,
    pageX: x + Number(canvasOffset.left),
    pageY: y + Number(canvasOffset.top),
    clientX: x + Number(canvasOffset.left),
    clientY: y + Number(canvasOffset.top),
  };
  let toolbar = await page.$$(".toolbar .icon-button");
  await toolbar[1].tap();
  const sid = await canvas.attribute("data-sid");
  const touch = (type, touches, changedTouches) =>
    page.callMethod("eh", {
      type,
      timeStamp: Date.now(),
      target: { id: "editor-canvas", dataset: { sid } },
      currentTarget: { id: "editor-canvas", dataset: { sid } },
      touches,
      changedTouches,
      detail: {},
    });
  // SDK touchstart drops canvas-local x/y. Dispatch the exact event shape also
  // captured from a native simulator click; physical input is verified separately.
  await touch("touchstart", [point], [point]);
  assert.deepEqual(
    (await readGuest(result.designId)).project.pattern,
    saved.project.pattern,
  );
  await touch("touchend", [], [point]);
  const painted = await waitFor(async () => {
    const value = await readGuest(result.designId);
    return (
      JSON.stringify(value.project.pattern) !==
        JSON.stringify(saved.project.pattern) && value
    );
  }, "paint on release");
  pass("画笔按下不提交，松手后修改并保存");
  toolbar = await page.$$(".toolbar .icon-button");
  await toolbar[5].tap();
  await pause(250);
  assert.deepEqual(
    (await readGuest(result.designId)).project.pattern,
    saved.project.pattern,
  );
  toolbar = await page.$$(".toolbar .icon-button");
  await toolbar[6].tap();
  await pause(250);
  assert.deepEqual(
    (await readGuest(result.designId)).project.pattern,
    painted.project.pattern,
  );
  pass("撤销与重做还原实际保存内容");
  await tapText(page, ".mode-tabs view", "跟拼");
  await tapText(page, ".button", "完成本行");
  await pause(400);
  const progress = await readGuest(result.designId);
  assert(progress.progress);
  pass("跟拼进度写入本机独立文件");
  await screenshot("stitch");
  page = await mini.reLaunch("/pages/mine/index");
  await waitFor(
    async () => (await page.$$(".card")).length > 0,
    "private designs",
  );
  await (await page.$(".search input")).input(result.designName);
  await waitFor(
    async () => (await page.$$(".card")).length === 1,
    "saved design search",
  );
  pass("我的搜索与页面重开恢复");
  await screenshot("mine");
  page = await mini.navigateTo("/export/output/index?id=" + result.designId);
  await tapText(page, ".button", "项目文件");
  await waitFor(() => page.$(".panel"), "project export");
  const exported = await mini.evaluate(() => {
    const f = wx.getFileSystemManager(),
      dir = wx.env.USER_DATA_PATH;
    return f
      .readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .map((n) => ({
        name: n,
        content: f.readFileSync(dir + "/" + n, "utf8"),
      }));
  });
  result.exported = exported.filter((e) => e.name.includes(result.designName));
  assert(result.exported.length);
  const project = JSON.parse(result.exported[0].content);
  assert.equal(project.version, 3);
  assert.deepEqual(
    project.pattern,
    (await readGuest(result.designId)).project.pattern,
  );
  assert(!("progress" in project));
  pass("项目 v3 文件导出且不含跟拼进度");
  await screenshot("export-project");
  await mini.reLaunch("/pages/discover/index");
  result.finishedAt = new Date().toISOString();
  save();
})()
  .catch(async (error) => {
    result.failure = { message: error.message, stack: error.stack };
    if (mini)
      result.toasts = await mini
        .evaluate(() => globalThis.__weappAcceptanceToasts)
        .catch(() => []);
    save();
    console.error(error);
    console.log("TOASTS", result.toasts);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mini)
      await mini
        .evaluate(() => {
          if (globalThis.__weappAcceptanceShowToast)
            wx.showToast = globalThis.__weappAcceptanceShowToast;
          delete globalThis.__weappAcceptanceShowToast;
          delete globalThis.__weappAcceptanceToasts;
        })
        .catch(() => {});
    mini?.disconnect();
    clearTimeout(deadline);
  });
