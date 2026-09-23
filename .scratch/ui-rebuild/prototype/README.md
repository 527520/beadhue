# 豆色绘交互原型

纯 HTML / CSS / JS，无构建、无外部依赖。设计依据见 [../design.md](../design.md)，要解决的问题见 [../audit.md](../audit.md)。

## 打开

在仓库根目录运行 `python3 -m http.server 4180`，然后访问：

- 评审页（桌面 / 手机并排 + 逐屏说明）：<http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/review.html>
- 单独全屏：<http://127.0.0.1:4180/.scratch/ui-rebuild/prototype/index.html>，拖动窗口宽度可看响应式；右下角可切换主色和登录态。

## 目录

- `styles/tokens.css`：设计令牌（与正式实现同名同值）。
- `styles/base.css`、`styles/components.css`、`styles/layout.css`：基础、组件、外壳。**所有页面共用，页面文件不要改它们**。
- `styles/screens/<页面>.css`：各页面自己的样式。
- `js/app.js`：路由与站点外壳（桌面顶栏、手机顶栏 / 底栏、统计同意、原型工具）。
- `js/ui.js`：弹窗（手机自动变底部面板）、弹出层、提示、作品卡、头像、空状态插画。
- `js/beads.js`：图纸渲染（`bead` 豆粒 / `flat` 方格）。`js/data.js`：模拟数据。`motifs.js`：程序化像素图案。
- `js/screens/<页面>.js`：页面模块。

## 页面模块约定

```js
export default {
  shell: 'site',        // 'site' 使用站点外壳；'bare' 自带外壳（编辑器、后台）
  nav: 'discover',      // 顶栏 / 底栏高亮：discover | create | me | null
  tabbar: true,         // 手机底栏；二级页面（详情、编辑器）设为 false
  footer: true,         // 桌面页脚
  title: '发现',        // 或 (ctx) => string
  mobileTop(ctx) {},    // 可选：手机顶栏内容（HTML 字符串）
  render(ctx) {},       // 返回页面 HTML 字符串
  mount(root, ctx) {},  // 绑定交互，可返回清理函数
};
```

`ctx = { path, query, params, session, navigate, rerender, loginDialog }`。`session.loggedIn` 可被原型工具切换。

**页面模块不要 import `app.js`**（入口使用顶层 await，反向引用会造成循环等待）。需要的能力都在 `ctx` 里。

## 设计纪律（评审会逐条检查）

1. 只用令牌：颜色、字号、圆角、阴影、间距全部引用 `tokens.css` 变量；十六进制色值只允许出现在豆色数据里。
2. 只用 7 级字号（`--text-*` 或 `.t-*` 类）；控件高度 32 / 40 / 48，同一行只一种。
3. 每个视区最多一个主色按钮（`.btn-primary`）；选中态用深墨，不用主色。
4. 图标只用 `icon(name)`（Lucide，见 `icons.svg` 里的 `i-*`）；纯图标按钮必须有 `aria-label`，桌面加 `data-tip`。
5. 弹窗统一 `openDialog`，弹出层统一 `openPopover`（传 `sheetTitle` 时手机自动变底部面板）。
6. 响应式按 `sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536`；必须在 1440、1024、768、390、350 宽度下无横向滚动、无文字折断、无遮挡。
7. 文案：动作用动词命名且前后一致（按钮「导出」→ 提示「已导出」）；错误说清原因和解决办法；不写口号、不把规则写进占位符；触屏不显示键盘说明。

## 截图自检

```bash
PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" node .scratch/ui-rebuild/tools/shoot-prototype.mjs [--full] [--w=1440,390] "#/works/w-cat"
```

截图输出到 `.scratch/ui-rebuild/evidence/prototype/`，并打印页面报错。`--click="选择器|选择器"` 可在截图前依次点击，用来截弹层状态。
