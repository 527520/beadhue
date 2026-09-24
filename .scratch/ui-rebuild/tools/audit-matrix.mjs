// R15 终审对照：场景表 × 宽度，同一场景在原型与实现各截一张，供逐张走查。只截图、记录指标，不评判视觉差异。
// 用法（仓库根目录，先跑 audit-seed.mjs 生成 fixtures.json）：
//   IMPL_BASE=http://127.0.0.1:3160 node .scratch/ui-rebuild/tools/audit-matrix.mjs [--only=名称或前缀,…] [--group=shell,editor,…]
//        [--w=1440,390] [--side=proto|impl] [--jobs=4] [--reuse-state] [--list]
//   PROTO_BASE 默认 http://127.0.0.1:4180（仓库根目录 python3 -m http.server 4180）。
// 输出：evidence/audit/raw/<场景>-<宽度>-proto.png / -impl.png；evidence/audit/report.json（按 场景+宽度+侧 合并更新）。
// --only 支持逗号分隔，匹配场景名全称或以「前缀*」结尾的通配（如 editor*）。
// 实现侧登录态：开跑前生成 evidence/audit/state/<身份>.json（用户态含 IndexedDB：7 份云端设计已拉到本机、「彩虹挂件」带跟拼进度），
// 并给 e2e-user 造一条新通知（管理员评论），让「通知徽标 / 未读」场景每轮都有数据。--reuse-state 跳过这一步。
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (name) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const IMPL = (process.env.IMPL_BASE ?? 'http://127.0.0.1:3160').replace(/\/$/, '');
const PROTO = `${(process.env.PROTO_BASE ?? 'http://127.0.0.1:4180').replace(/\/$/, '')}/.scratch/ui-rebuild/prototype/index.html`;
const OUT = resolve('.scratch/ui-rebuild/evidence/audit');
const RAW = resolve(OUT, 'raw');
const STATE = resolve(OUT, 'state');
for (const dir of [RAW, STATE]) mkdirSync(dir, { recursive: true });
const FIXTURES_PATH = resolve(OUT, 'fixtures.json');
if (!existsSync(FIXTURES_PATH)) throw new Error('缺 evidence/audit/fixtures.json：先运行 audit-seed.mjs');
const F = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
const PASSWORD = F.password ?? 'E2e-pass-123!';

const ALL = [1440, 1024, 768, 390, 350];
const DESK = [1440, 1024, 768];
const MOB = [390, 350];

// ---------- 步骤构造 ----------
// 选择器：sel（Playwright/CSS 选择器）或 role + name（name 为字符串时精确匹配）或 label。
// 公共选项：optional（字符串：找不到时记为「跳过」并写明原因，而不是「找不到」）、force、nth、n（重复次数）、wait（步骤后等待毫秒）。
const click = (sel, o = {}) => ({ do: 'click', sel, ...o });
const btn = (name, o = {}) => ({ do: 'click', role: 'button', name, ...o });
const role = (r, name, o = {}) => ({ do: 'click', role: r, name, ...o });
const hover = (target, o = {}) => ({ do: 'hover', ...(typeof target === 'string' ? { sel: target } : target), ...o });
const fill = (target, value, o = {}) => ({ do: 'fill', ...(typeof target === 'string' ? { sel: target } : target), value, ...o });
const typeIn = (target, value, o = {}) => ({ do: 'type', ...(typeof target === 'string' ? { sel: target } : target), value, ...o });
const focus = (sel, o = {}) => ({ do: 'focus', sel, ...o });
const press = (key) => ({ do: 'press', key });
const wait = (ms) => ({ do: 'wait', ms });
const scrollTo = (target, o = {}) => ({ do: 'scroll', ...(typeof target === 'string' ? { sel: target } : target), ...o });
const scrollY = (y) => ({ do: 'scrollY', y });
const bottom = () => ({ do: 'scrollBottom' });
const mouse = (sel, fx, fy) => ({ do: 'mouse', sel, fx, fy });
const waitFor = (target, o = {}) => ({ do: 'waitFor', ...(typeof target === 'string' ? { sel: target } : target), ...o });
const evalStep = (fn) => ({ do: 'eval', fn });

const EDITOR_READY = waitFor({ label: /图纸编辑画布/ }, { timeout: 40_000 });
const STITCH_READY = waitFor({ label: /^跟拼画布/ }, { timeout: 40_000 });
const design = (key, extra = '') => `/app?id=${encodeURIComponent(F.designs[key].id)}${extra}`;
const work = (key) => `/community/${F.works[key]}`;
const vis = (sel) => `${sel} >> visible=true`;
const designOpen = (name) => new RegExp(`^打开「${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}」`);
const cardMenu = { do: 'click', sel: '[data-slot=design-card] button[aria-label$="的更多操作"]' };

// ---------- 场景表 ----------
// name：场景名（文件名）；group：分组；who：guest | user | admin | moderator（两侧同一身份；原型只有「游客 / 已登录管理员」两态）；
// widths：默认 ALL；full：整页；tags：如 final-05 表示 shoot-final 的第 05 屏；note：走查须知（写进 report）。
// proto / impl：{ route, steps, consent（显示统计同意浮卡）, intro（显示新手条）}；null 表示该侧没有这个页面 / 状态，原因写在 note。
const S = [];
const add = (name, group, o) => S.push({ name, group, who: 'user', widths: ALL, ...o });

// 外壳：顶栏、搜索、账号菜单、登录弹窗、统计同意、手机搜索、页脚、通知
add('shell-top', 'shell', { tags: ['final-01'], proto: { route: '#/' }, impl: { route: '/' } });
add('shell-top-guest', 'shell', { who: 'guest', proto: { route: '#/' }, impl: { route: '/' } });
add('shell-intro', 'shell', { note: '发现页新手条（首次访问）', proto: { route: '#/', intro: true }, impl: { route: '/', intro: true } });
add('shell-consent', 'shell', { who: 'guest', note: '统计同意浮卡', proto: { route: '#/', consent: true }, impl: { route: '/', consent: true } });
add('shell-search-panel', 'shell', { widths: DESK, note: '搜索建议面板（最近搜索 / 大家在搜）', proto: { route: '#/', steps: [focus('[data-search] input')] }, impl: { route: '/', steps: [focus('header [data-slot=search-input]')] } });
add('shell-search-typed', 'shell', { widths: DESK, note: '输入「猫」后的搜索建议', proto: { route: '#/', steps: [focus('[data-search] input'), typeIn('[data-search] input', '猫')] }, impl: { route: '/', steps: [focus('header [data-slot=search-input]'), typeIn('header [data-slot=search-input]', '猫', { wait: 1200 })] } });
add('shell-mobile-search', 'shell', { widths: MOB, note: '手机全屏搜索页', proto: { route: '#/search' }, impl: { route: '/', steps: [btn('搜索', { wait: 900 })] } });
add('shell-account-menu', 'shell', { widths: DESK, proto: { route: '#/', steps: [click('[data-account]')] }, impl: { route: '/', steps: [btn('账号菜单')] } });
const PROTO_LOGIN = click(vis('header [data-login], .m-topbar [data-login], [data-like]'));
add('shell-login', 'shell', { who: 'guest', note: '登录弹窗（手机为底部面板）；原型手机发现页顶栏没有登录按钮，改点作品卡的喜欢触发登录', proto: { route: '#/', steps: [PROTO_LOGIN] }, impl: { route: '/', steps: [click(vis('[data-login]'))] } });
add('shell-login-errors', 'shell', { who: 'guest', tags: ['final-18'], note: '登录弹窗空提交的字段错误', proto: { route: '#/', steps: [PROTO_LOGIN, click('[data-login-form] button[type="submit"]')] }, impl: { route: '/', steps: [click(vis('[data-login]')), click('[data-login-form] button[type="submit"]')] } });
add('shell-login-sheet', 'shell', { who: 'guest', widths: MOB, note: '实现侧从「我的 · 喜欢」的登录入口打开；原型从顶栏登录', proto: { route: '#/', steps: [PROTO_LOGIN] }, impl: { route: '/me/likes', steps: [click(vis('main button:has-text("登录")'))] } });
add('shell-footer', 'shell', { widths: DESK, note: '页脚（滚到底）；实现侧沿用 shoot-shell 用 /help', proto: { route: '#/?cat=动物', steps: [bottom()] }, impl: { route: '/help', steps: [bottom()] } });
add('shell-notif-badge', 'shell', { note: '原型没有通知中心（票 11 按同组件语言新增）', proto: null, impl: { route: '/' } });
add('shell-notif-open', 'shell', { phase: 2, note: '打开即标为已读，排在最后跑；原型没有通知中心', proto: null, impl: { route: '/', steps: [click(vis('[data-notifications]')), waitFor({ role: 'dialog', name: '通知' }), wait(1200)] } });
add('shell-notif-empty', 'shell', { who: 'moderator', note: '通知空状态（版主账号没有通知）；原型没有通知中心', proto: null, impl: { route: '/', steps: [click(vis('[data-notifications]')), waitFor({ role: 'dialog', name: '通知' }), wait(1200)] } });

// 发现 / 搜索
add('discover-search', 'discover', { tags: ['final-02'], proto: { route: '#/search?q=猫' }, impl: { route: '/?q=猫' } });
add('discover-empty', 'discover', { tags: ['final-03'], note: '搜索无结果空状态', proto: { route: '#/search?q=恐龙' }, impl: { route: '/?q=恐龙' } });
add('discover-category', 'discover', { proto: { route: '#/?cat=动物' }, impl: { route: '/?cat=动物' } });
add('discover-filter', 'discover', { tags: ['final-04'], proto: { route: '#/?cat=动物', steps: [click('[data-open-filter]')] }, impl: { route: '/?cat=动物', steps: [btn(/^筛选/)] } });
add('discover-filter-picked', 'discover', { proto: { route: '#/?cat=动物', steps: [click('[data-open-filter]'), click('[data-filter="colors"][data-value="few"]')] }, impl: { route: '/?cat=动物', steps: [btn(/^筛选/), btn('6 色以内')] } });
add('discover-chips', 'discover', { proto: { route: '#/?cat=动物&size=m&colors=few' }, impl: { route: '/?cat=动物&size=m&colors=few' } });
add('discover-sort', 'discover', { proto: { route: '#/', steps: [click('[data-open-sort]')] }, impl: { route: '/', steps: [btn(/^排序/)] } });
add('discover-scrolled', 'discover', { proto: { route: '#/', steps: [scrollY(600)] }, impl: { route: '/', steps: [scrollY(600)] } });
add('discover-full', 'discover', { full: true, proto: { route: '#/' }, impl: { route: '/' } });

// 作品详情（原型 w-cat ↔ 实现「橘猫团子」；w-rainbow-soft（40 宽 2×2 板）↔ 实现最宽的作品）
add('detail-cat', 'detail', { tags: ['final-05'], proto: { route: '#/works/w-cat' }, impl: { route: work('cat') } });
add('detail-cat-page', 'detail', { full: true, proto: { route: '#/works/w-cat' }, impl: { route: work('cat') } });
add('detail-wide', 'detail', { note: `原型 w-rainbow-soft（40 宽）；实现取最宽的作品「${F.works.widestTitle}」`, proto: { route: '#/works/w-rainbow-soft' }, impl: { route: work('widest') } });
add('detail-guest', 'detail', { who: 'guest', tags: ['final-06'], proto: { route: '#/works/w-star' }, impl: { route: work('star') } });
add('detail-guest-page', 'detail', { who: 'guest', full: true, proto: { route: '#/works/w-cat' }, impl: { route: work('cat') } });
add('detail-nocomments', 'detail', { full: true, note: '没有评论的作品：原型 w-heart?nocomments=1，实现官方「心动爱心」', proto: { route: '#/works/w-heart?nocomments=1' }, impl: { route: work('heart') } });
add('detail-share', 'detail', { proto: { route: '#/works/w-cat', steps: [click(vis('[data-wd-share]'))] }, impl: { route: work('cat'), steps: [btn('分享')] } });
add('detail-more', 'detail', { proto: { route: '#/works/w-cat', steps: [click(vis('[data-wd-more]'))] }, impl: { route: work('cat'), steps: [btn('更多操作')] } });
add('detail-report', 'detail', { note: '举报弹窗：选第 2 个理由并填说明', proto: { route: '#/works/w-cat', steps: [click(vis('[data-wd-more]')), click('[data-pick="report"]'), click('.wd-reason:nth-child(2)'), fill('#wd-report-note', '图纸和另一位作者的作品几乎一样')] }, impl: { route: work('cat'), steps: [btn('更多操作'), click('[role=menuitem]:has-text("举报"), [role=dialog] button:has-text("举报")'), click('[role=dialog] [role=radio] >> nth=1'), fill('[role=dialog] textarea', '图纸和另一位作者的作品几乎一样')] } });
add('detail-make', 'detail', { note: '「用这张制作」确认', proto: { route: '#/works/w-cat', steps: [click(vis('[data-wd-make]'))] }, impl: { route: work('cat'), steps: [btn('用这张制作')] } });
add('detail-license', 'detail', { proto: { route: '#/works/w-cat', steps: [scrollTo('[data-wd-license]'), click('[data-wd-license]')] }, impl: { route: work('cat'), steps: [scrollTo({ role: 'button', name: '查看许可说明' }), btn('查看许可说明')] } });
add('detail-codes', 'detail', { proto: { route: '#/works/w-cat', steps: [click(vis('[data-v="codes"]'))] }, impl: { route: work('cat'), steps: [btn('色号')] } });
add('detail-seams', 'detail', { note: '板块分界：原型 w-rainbow-soft，实现最宽作品', proto: { route: '#/works/w-rainbow-soft', steps: [click(vis('[data-v="seams"]'), { optional: '手机宽度没有「板块」按钮' })] }, impl: { route: work('widest'), steps: [btn('板块', { optional: '手机宽度没有「板块」按钮' })] } });
add('detail-zoom', 'detail', { proto: { route: '#/works/w-cat', steps: [click(vis('[data-v="in"]'), { n: 3 })] }, impl: { route: work('cat'), steps: [btn('放大', { n: 3 })] } });
add('detail-colors', 'detail', { note: '展开全部颜色（原型 6 色时仅手机有此按钮；实现未露出按钮的宽度记为跳过）', proto: { route: '#/works/w-icecream', steps: [click(vis('[data-wd-colors]'), { optional: '该宽度颜色已全部展示，没有「查看全部」' })] }, impl: { route: work('icecream'), steps: [btn(/^查看全部 \d+ 色/, { optional: '该宽度颜色已全部展示，没有「查看全部」' })] } });
add('detail-guest-codes', 'detail', { who: 'guest', note: '游客点被锁的「色号」', proto: { route: '#/works/w-cat', steps: [click(vis('[data-v="codes"]'), { force: true })] }, impl: { route: work('cat'), steps: [btn('色号', { force: true })] } });
add('detail-typed', 'detail', { proto: { route: '#/works/w-cat', steps: [scrollTo('#wd-comment'), fill('#wd-comment', '拼好啦！耳朵用 F2 樱粉比图纸上更显眼，推荐试试。')] }, impl: { route: work('cat'), steps: [scrollTo({ role: 'textbox', name: '发表评论' }), fill({ role: 'textbox', name: '发表评论' }, '拼好啦！耳朵用 F2 樱粉比图纸上更显眼，推荐试试。')] } });
add('detail-scrolled', 'detail', { proto: { route: '#/works/w-cat', steps: [scrollTo('.wd-comments li:last-child')] }, impl: { route: work('cat'), steps: [wait(1500), scrollTo({ role: 'heading', name: /^讨论/ })] } });
add('detail-fullscreen', 'detail', { widths: DESK, proto: { route: '#/works/w-rainbow-soft', steps: [click(vis('[data-v="full"]')), wait(400)] }, impl: { route: work('widest'), steps: [btn('全屏查看'), wait(600)] } });

// 创作入口
add('create-entry', 'create', { tags: ['final-07'], full: true, proto: { route: '#/create' }, impl: { route: '/app' } });
add('create-drag', 'create', { note: '拖入态（?drag=1）', proto: { route: '#/create?drag=1' }, impl: { route: '/app?drag=1' } });
add('create-new', 'create', { tags: ['final-08'], note: '新建图纸弹窗（示例橘猫 / 橘子小猫）', proto: { route: '#/create?pick=w-cat' }, impl: { route: '/app', steps: [btn('用示例「橘子小猫」新建图纸'), waitFor({ role: 'dialog', name: '新建图纸' }), wait(1500)] } });
add('create-new-board', 'create', { note: '新建图纸：按底板 / 3 板', proto: { route: '#/create', steps: [click('[data-sample]'), click('[data-ratio="board"]'), click('[data-cr-width="87"]')] }, impl: { route: '/app', steps: [btn('用示例「橘子小猫」新建图纸'), waitFor({ role: 'dialog', name: '新建图纸' }), btn('按底板'), btn(/^3 板/, { wait: 1200 })] } });
add('create-new-palette', 'create', { note: '新建图纸：换色板菜单', proto: { route: '#/create', steps: [click('[data-sample]'), click('[data-cr-pick="palette"]')] }, impl: { route: '/app', steps: [btn('用示例「橘子小猫」新建图纸'), waitFor({ role: 'dialog', name: '新建图纸' }), click('[role=dialog] button[aria-label^="色板"], [role=dialog] [role=combobox][aria-label^="色板"]', { wait: 900 })] } });
add('create-blank', 'create', { note: '空白画布弹窗', proto: { route: '#/create?blank=1' }, impl: { route: '/app', steps: [btn(/从空白画布开始/), waitFor({ role: 'dialog', name: '从空白画布开始' })] } });

// 编辑器（原型 d-cat 48 宽有原图 ↔ 实现「橘猫团子 · 大号」；d-heart 无原图 ↔「小黄鸡钥匙扣」；d-rainbow 跟拼 ↔「彩虹挂件」）
// 云端拉下来的设计没有本机生成源（调整面板只显示「需要原图才能重新生成」），调参 / 重新裁剪类状态改为游客现场用示例「橘子小猫」按 48 宽 8 色生成。
const SAMPLE_NOTE = '实现侧以游客身份现场用示例「橘子小猫」生成 48 宽 8 色图纸（云端拉取的设计没有本机生成源，调参区不可用）';
const edSample = (steps = []) => ({ route: '/app', steps: [btn('用示例「橘子小猫」新建图纸'), waitFor({ role: 'dialog', name: '新建图纸' }), btn('自定义', { optional: '没有「自定义」宽度档' }), fill({ role: 'spinbutton', name: '自定义宽度（格）' }, '48'), { do: 'focus', role: 'slider' }, { do: 'press', key: 'ArrowLeft', n: 40 }, { do: 'press', key: 'ArrowRight', n: 6 }, btn('生成图纸'), EDITOR_READY, wait(1200), ...steps] });
const edCat = (steps = [], extra = '') => ({ route: design('cat', extra), steps: [EDITOR_READY, wait(800), ...steps] });
add('editor', 'editor', { tags: ['final-09'], proto: { route: '#/editor/d-cat' }, impl: edCat() });
add('editor-export', 'editor', { widths: DESK, tags: ['final-10'], proto: { route: '#/editor/d-cat', steps: [click('[data-export]')] }, impl: edCat([btn('导出')]) });
add('editor-share', 'editor', { widths: DESK, proto: { route: '#/editor/d-cat', steps: [click('[data-share]')] }, impl: edCat([btn('分享')]) });
add('editor-more', 'editor', { widths: DESK, proto: { route: '#/editor/d-cat', steps: [click('[data-act="more"]')] }, impl: edCat([btn('更多')]) });
add('editor-publish', 'editor', { widths: DESK, proto: { route: '#/editor/d-cat', steps: [click('[data-share]'), click('[data-act="publish"]')] }, impl: edCat([btn('分享'), role('menuitem', /公开到豆社/), wait(900)]) });
add('editor-png', 'editor', { widths: DESK, proto: { route: '#/editor/d-cat', steps: [click('[data-export]'), click('[data-act="export-png"]')] }, impl: edCat([btn('导出'), role('menuitem', /^下载 PNG/), wait(900)]) });
add('editor-pdf', 'editor', { widths: DESK, proto: { route: '#/editor/d-cat', steps: [click('[data-export]'), click('[data-act="export-pdf"]')] }, impl: edCat([btn('导出'), role('menuitem', /^打印 PDF/), wait(900)]) });
add('editor-shortcuts', 'editor', { widths: DESK, proto: { route: '#/editor/d-cat', steps: [click('[data-act="more"]'), click('[data-act="shortcuts"]')] }, impl: edCat([btn('更多'), role('menuitem', /快捷键说明/)]) });
add('editor-adjust', 'editor', { widths: DESK, implWho: 'guest', note: SAMPLE_NOTE, proto: { route: '#/editor/d-cat?tab=adjust' }, impl: edSample([role('tab', '调整')]) });
add('editor-adjust-adv', 'editor', { widths: DESK, implWho: 'guest', note: `调整面板展开高级并滚动；${SAMPLE_NOTE}`, proto: { route: '#/editor/d-cat?tab=adjust', steps: [click('[data-act="advanced"]'), evalStep(() => { const node = document.querySelector('[data-panel-body]'); if (node) node.scrollTop = 400; })] }, impl: edSample([role('tab', '调整'), btn(/高级/), evalStep(() => { const node = document.querySelector('[role=tabpanel]'); if (node) { node.scrollTop = 400; node.parentElement.scrollTop = 400; } })]) });
add('editor-info', 'editor', { widths: DESK, proto: { route: '#/editor/d-cat?tab=info' }, impl: edCat([role('tab', '信息')]) });
add('editor-hover', 'editor', { widths: DESK, note: '鼠标停在画布上的格子提示', proto: { route: '#/editor/d-cat', steps: [mouse('[data-canvas]', 0.5, 0.55)] }, impl: edCat([mouse('canvas[aria-label*="图纸编辑画布"], [aria-label*="图纸编辑画布"]', 0.5, 0.55)]) });
add('editor-ref', 'editor', { widths: DESK, note: '原图参照窗 + 放大两档', proto: { route: '#/editor/d-cat?ref=1', steps: [click('[data-act="zoom-in"]'), click('[data-act="zoom-in"]')] }, impl: edCat([btn('打开原图参照', { wait: 900 }), btn('放大', { n: 2 })]) });
add('editor-replace', 'editor', { widths: DESK, note: '颜色列表第 2 行的「替换」', proto: { route: '#/editor/d-cat', steps: [hover('.ed-used-row:nth-child(2)'), click('.ed-used-row:nth-child(2) [data-act="replace-color"]')] }, impl: edCat([hover('[role=tabpanel] li >> nth=1'), click('[role=tabpanel] li >> nth=1 >> button[aria-label^="替换"]')]) });
add('editor-highlight', 'editor', { widths: DESK, note: '颜色列表第 3 行的「高亮」', proto: { route: '#/editor/d-cat', steps: [hover('.ed-used-row:nth-child(3)'), click('.ed-used-row:nth-child(3) [data-act="highlight"]'), mouse('[data-canvas]', 0.05, 0.05)] }, impl: edCat([hover('[role=tabpanel] li >> nth=2'), click('[role=tabpanel] li >> nth=2 >> button[aria-label*="高亮"]')]) });
add('editor-brush', 'editor', { widths: DESK, note: '画笔尺寸浮层', proto: { route: '#/editor/d-cat', steps: [click('.ed-tools [data-tool="brush"]')] }, impl: edCat([btn('画笔'), btn('画笔')]) });
add('editor-panel', 'editor', { widths: DESK, note: '收起右侧面板', proto: { route: '#/editor/d-cat?panel=0' }, impl: edCat([btn('收起右侧面板')]) });
add('editor-recrop', 'editor', { widths: DESK, implWho: 'guest', note: `重新裁剪弹窗：原型没有独立状态；${SAMPLE_NOTE}`, proto: null, impl: edSample([role('tab', '调整'), btn('重新裁剪'), wait(1200)]) });
add('editor-noorig', 'editor', { note: '没有原图的设计', proto: { route: '#/editor/d-heart' }, impl: { route: design('chick'), steps: [EDITOR_READY, wait(800)] } });
add('editor-noorig-adjust', 'editor', { widths: DESK, tags: ['final-11'], proto: { route: '#/editor/d-heart?tab=adjust' }, impl: { route: design('chick'), steps: [EDITOR_READY, role('tab', '调整')] } });
add('editor-noorig-missing', 'editor', { note: '没有原图时点「原图」', proto: { route: '#/editor/d-heart', steps: [click(vis('[data-act="ref-missing"]'))] }, impl: { route: design('chick'), steps: [EDITOR_READY, btn(/原图/, { wait: 900 })] } });
add('editor-blank', 'editor', { note: '空白画布编辑器（24×24）', proto: { route: '#/editor/new-blank' }, impl: { route: '/app', steps: [btn(/从空白画布开始/), waitFor({ role: 'dialog', name: '从空白画布开始' }), btn('创建画布'), EDITOR_READY, wait(900)] } });
add('editor-reuse', 'editor', { widths: DESK, note: '引用公开作品后的编辑器 + 分享菜单：实现侧从「星星人」详情点「用这张制作」', proto: { route: '#/editor/w-star', steps: [click('[data-share]')] }, impl: { route: work('star'), steps: [btn('用这张制作'), btn(/^(确定|继续|用这张制作|开始制作)/, { optional: '没有二次确认' }), EDITOR_READY, wait(1200), btn('分享')] } });
add('stitch', 'editor', { tags: ['final-12'], note: '跟拼：彩虹挂件带进度（实现侧进度在准备阶段造，存本机）', proto: { route: '#/editor/d-rainbow?mode=stitch' }, impl: { route: design('rainbow', '&mode=stitch'), steps: [STITCH_READY, wait(900)] } });
add('stitch-cat', 'editor', { widths: DESK, note: '跟拼：无进度', proto: { route: '#/editor/d-cat?mode=stitch' }, impl: { route: design('cat', '&mode=stitch'), steps: [STITCH_READY, wait(900)] } });
add('stitch-more', 'editor', { widths: DESK, proto: { route: '#/editor/d-rainbow?mode=stitch', steps: [click('[data-act="more"]')] }, impl: { route: design('rainbow', '&mode=stitch'), steps: [STITCH_READY, btn('更多')] } });
add('m-colors', 'editor', { widths: MOB, proto: { route: '#/editor/d-cat', steps: [click('.ed-mcolor', { force: true })] }, impl: edCat([btn(/^当前色 .*打开颜色$/)]) });
add('m-more', 'editor', { widths: MOB, proto: { route: '#/editor/d-cat', steps: [click('[data-act="more"]', { force: true })] }, impl: edCat([btn('更多')]) });
add('m-adjust', 'editor', { widths: MOB, implWho: 'guest', note: SAMPLE_NOTE, proto: { route: '#/editor/d-cat?sheet=adjust' }, impl: edSample([btn('更多'), btn('调整')]) });
add('m-info', 'editor', { widths: MOB, proto: { route: '#/editor/d-cat?sheet=info' }, impl: edCat([btn('更多'), btn('信息与采购清单')]) });
add('m-ref', 'editor', { widths: MOB, proto: { route: '#/editor/d-cat?ref=1' }, impl: edCat([btn('打开原图参照', { wait: 900 })]) });
add('m-brush', 'editor', { widths: MOB, proto: { route: '#/editor/d-cat', steps: [click('.ed-mbar [data-tool="brush"]', { force: true })] }, impl: edCat([btn('画笔')]) });
add('m-publish', 'editor', { widths: MOB, proto: { route: '#/editor/d-cat', steps: [click('[data-act="more"]', { force: true }), click('.dialog [data-act="publish"]', { force: true })] }, impl: edCat([btn('更多'), btn(/^公开到豆社/, { wait: 900 })]) });
add('m-export', 'editor', { widths: MOB, note: '手机「…」→ 导出：原型没有独立状态', proto: null, impl: edCat([btn('更多'), btn('导出')]) });
add('m-recrop', 'editor', { widths: MOB, implWho: 'guest', note: `手机重新裁剪：原型没有独立状态；${SAMPLE_NOTE}`, proto: null, impl: edSample([btn('更多'), btn('调整'), btn('重新裁剪', { wait: 1200 })]) });
add('m-stitch-sheet', 'editor', { widths: MOB, note: '跟拼进度胶囊的底部面板', proto: { route: '#/editor/d-rainbow?mode=stitch', steps: [click('.ed-mprog', { force: true })] }, impl: { route: design('rainbow', '&mode=stitch'), steps: [STITCH_READY, click('button[aria-haspopup="dialog"]:has-text("%")')] } });

// 我的
add('me-designs', 'me', { tags: ['final-13'], proto: { route: '#/me' }, impl: { route: '/me' } });
add('me-designs-hover', 'me', { widths: DESK, proto: { route: '#/me', steps: [hover('.design-card')] }, impl: { route: '/me', steps: [hover('[data-slot=design-card]')] } });
add('me-card-menu', 'me', { proto: { route: '#/me', steps: [click('[data-card-menu]')] }, impl: { route: '/me', steps: [cardMenu] } });
add('me-rename', 'me', { proto: { route: '#/me', steps: [click('[data-card-menu]'), click('[data-act="rename"]')] }, impl: { route: '/me', steps: [cardMenu, click('[role=menuitem]:has-text("重命名"), [role=dialog] button:has-text("重命名")', { wait: 700 })] } });
add('me-delete', 'me', { proto: { route: '#/me', steps: [click('[data-card-menu]'), click('[data-act="delete"]')] }, impl: { route: '/me', steps: [cardMenu, click('[role=menuitem]:has-text("删除"), [role=dialog] button:has-text("删除")', { wait: 700 })] } });
add('me-sort', 'me', { proto: { route: '#/me', steps: [click(vis('[data-sort-menu]'))] }, impl: { route: '/me', steps: [click(vis('button[aria-label^="排序："]'))] } });
add('me-list', 'me', { proto: { route: '#/me/designs?view=list' }, impl: { route: '/me?view=list' } });
add('me-search-empty', 'me', { proto: { route: '#/me/designs?q=兔子' }, impl: { route: '/me?q=兔子' } });
add('me-stitching', 'me', { proto: { route: '#/me/designs?status=stitching' }, impl: { route: '/me?status=stitching' } });
add('me-empty', 'me', { who: 'moderator', tags: ['final-14'], note: '实现侧用版主账号（没有设计）', proto: { route: '#/me/designs?empty=1' }, impl: { route: '/me' } });
add('me-storage', 'me', { note: '原图空间已满：实现侧需要真的占满配额，种子造不出，只截原型', proto: { route: '#/me/designs?storage=full' }, impl: null });
add('me-guest', 'me', { who: 'guest', proto: { route: '#/me' }, impl: { route: '/me' } });
add('me-public', 'me', { full: true, proto: { route: '#/me/public' }, impl: { route: '/me/public' } });
add('me-likes', 'me', { proto: { route: '#/me/likes' }, impl: { route: '/me/likes' } });
add('me-likes-empty', 'me', { who: 'moderator', note: '实现侧用版主账号（没有喜欢）', proto: { route: '#/me/likes?empty=1' }, impl: { route: '/me/likes' } });
add('me-palettes', 'me', { tags: ['final-15'], full: true, proto: { route: '#/me/palettes' }, impl: { route: '/me/palettes' } });
add('me-palette-view', 'me', { proto: { route: '#/me/palettes', steps: [click('[data-open-palette="mard-291"]')] }, impl: { route: '/me/palettes', steps: [click('button[aria-label^="查看「MARD（豆色绘经典"]')] } });
add('me-palette-edit', 'me', { proto: { route: '#/me/palettes', steps: [click('[data-new-palette]')] }, impl: { route: '/me/palettes', steps: [click(vis('button:has-text("新建色板")'))] } });
add('me-settings', 'me', { tags: ['final-16'], full: true, proto: { route: '#/me/settings' }, impl: { route: '/me/settings' } });
add('me-settings-full', 'me', { note: '原图空间已满的设置页：实现侧造不出，只截原型', proto: { route: '#/me/settings?storage=full&section=storage' }, impl: null });
add('me-password', 'me', { note: '修改密码弹窗的校验错误', proto: { route: '#/me/settings', steps: [click('[data-change-password]'), fill('#pw-next', 'abc'), fill('#pw-confirm', 'abcd'), click('[data-submit]')] }, impl: { route: '/me/settings', steps: [click(vis('button:has-text("修改密码")')), fill('input[autocomplete=new-password] >> nth=0', 'abc'), fill('input[autocomplete=new-password] >> nth=1', 'abcd', { optional: '只有一个新密码输入框' }), click('[role=dialog] button[type=submit]')] } });
add('me-delete-account', 'me', { proto: { route: '#/me/settings', steps: [click('[data-delete-account]')] }, impl: { route: '/me/settings', steps: [click(vis('section#danger button:has-text("注销账号"), button:has-text("注销账号")'))] } });
add('author-official', 'me', { tags: ['final-17'], full: true, proto: { route: '#/u/official' }, impl: { route: `/u/${F.authors.official}` } });
add('author-user', 'me', { note: '普通作者主页：原型 lu，实现 E2E User', proto: { route: '#/u/lu' }, impl: { route: `/u/${F.authors.user}` } });
add('palettes-public', 'me', { who: 'guest', full: true, note: '公开色板页：原型并入「我的 · 色板」', proto: null, impl: { route: '/palettes' } });

// 管理后台（原型只有管理员一种身份）
const ADMIN = [['overview', '', 'final-19'], ['reviews', 'reviews', 'final-21'], ['works', 'works'], ['tags', 'tags'], ['comments', 'comments'], ['reports', 'reports'], ['users', 'users'], ['batches', 'batches'], ['analytics', 'analytics'], ['audit', 'audit'], ['logs', 'logs'], ['system', 'system']];
for (const [id, path, tag] of ADMIN) add(`admin-${id}`, 'admin', { who: 'admin', tags: tag ? [tag] : [], proto: { route: `#/admin${path ? `/${path}` : ''}` }, impl: { route: `/admin${path ? `/${path}` : ''}` } });
const ROW = { proto: click(vis('[data-row]')), impl: click(vis('tbody tr, [data-row-card], [data-slot=row-card]')) };
for (const [id, tag] of [['works', 'final-20'], ['users'], ['comments'], ['reports'], ['logs'], ['audit']]) {
  add(`admin-${id}-row`, 'admin', { who: 'admin', tags: tag ? [tag] : [], note: '点第一行打开详情', proto: { route: `#/admin/${id}`, steps: [ROW.proto] }, impl: { route: `/admin/${id}`, steps: [wait(600), ROW.impl, wait(600)] } });
}
add('admin-drawer', 'admin', { who: 'admin', widths: MOB, proto: { route: '#/admin', steps: [click(vis('[data-adm-drawer]'))] }, impl: { route: '/admin', steps: [btn('打开导航')] } });
add('admin-collapsed', 'admin', { who: 'admin', widths: [1440, 1024], proto: { route: '#/admin', steps: [click(vis('[data-adm-toggle]'))] }, impl: { route: '/admin', steps: [btn('收起侧栏')] } });
add('admin-account', 'admin', { who: 'admin', widths: DESK, proto: { route: '#/admin', steps: [click('[data-adm-account]')] }, impl: { route: '/admin', steps: [btn('管理员账号菜单')] } });
add('admin-search', 'admin', { who: 'admin', widths: DESK, note: '后台搜索范围菜单', proto: { route: '#/admin', steps: [focus('[data-adm-search] input'), typeIn('[data-adm-search] input', '猫')] }, impl: { route: '/admin', steps: [focus('input[type=search][aria-label="搜索作品、用户或评论"]'), typeIn('input[type=search][aria-label="搜索作品、用户或评论"]', '猫')] } });
add('admin-search-mobile', 'admin', { who: 'admin', widths: MOB, proto: { route: '#/admin', steps: [click(vis('[data-adm-search-open]'))] }, impl: { route: '/admin', steps: [btn('搜索后台')] } });
add('admin-batches-new', 'admin', { who: 'admin', proto: { route: '#/admin/batches', steps: [click(vis('[data-new-batch]'))] }, impl: { route: '/admin/batches', steps: [btn('新建批次')] } });
add('admin-tags-new', 'admin', { who: 'admin', proto: { route: '#/admin/tags', steps: [click(vis('[data-new-tag]'))] }, impl: { route: '/admin/tags', steps: [btn(/^(新建|新增)标签/)] } });
add('admin-guard', 'admin', { who: 'guest', note: '未登录进入后台', proto: { route: '#/admin' }, impl: { route: '/admin' } });
add('admin-forbidden', 'admin', { who: 'moderator', note: '审核员进入仅管理员模块（403）：原型没有', proto: null, impl: { route: '/admin/users' } });

// 组件总览
add('components', 'kit', { tags: ['final-22'], full: true, proto: { route: '#/components' }, impl: { route: '/dev/ui' } });

// 只有实现的页面
const implOnly = (name, route, o = {}) => add(name, 'pages', { who: 'guest', proto: null, note: '原型没有此页面', ...o, impl: { route, ...(o.impl ?? {}) } });
if (F.share?.path) implOnly('page-share', F.share.path, { note: '只读分享页（原型没有）' });
implOnly('page-share-invalid', '/s/invalid-token-for-audit', { note: '失效的分享链接' });
implOnly('page-help', '/help', { full: true });
implOnly('page-about', '/about', { full: true });
implOnly('page-privacy', '/privacy', { full: true });
implOnly('page-rules', '/community/rules', { full: true });
implOnly('page-copyright', '/community/copyright', { full: true });
implOnly('page-404', '/audit-no-such-page', { note: '404（整页空状态）' });
implOnly('page-work-missing', '/community/00000000-0000-4000-8000-000000000000', { note: '作品不存在' });
implOnly('page-login', '/login', { note: '独立登录页（原型只有弹窗）' });
implOnly('page-register', '/register');
implOnly('page-forgot', '/forgot-password');
implOnly('page-reset-invalid', '/reset-password?token=invalid', { note: '重置密码：无效令牌' });
implOnly('page-verify-invalid', '/verify-email?token=invalid', { note: '邮箱验证：无效令牌' });
implOnly('page-submit', '/community/submit', { who: 'user', note: '旧投稿入口（D72 深链）' });

// ---------- 参数 ----------
const onlyList = arg('only')?.split(',').filter(Boolean);
const groups = arg('group')?.split(',').filter(Boolean);
const widthsArg = arg('w')?.split(',').map(Number);
const sideArg = arg('side');
const JOBS = Number(arg('jobs') ?? 4);
const matches = (name) => !onlyList || onlyList.some((pattern) => (pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern));
const scenes = S.filter((scene) => matches(scene.name) && (!groups || groups.includes(scene.group)));
if (args.includes('--list')) {
  for (const scene of S) console.log(`${scene.name.padEnd(24)} ${scene.group.padEnd(9)} ${scene.who.padEnd(9)} ${scene.widths.join('/')} ${scene.proto ? 'P' : '-'}${scene.impl ? 'I' : '-'} ${scene.note ?? ''}`);
  console.log(`共 ${S.length} 个场景`);
  process.exit(0);
}

// ---------- 实现侧登录态 ----------
async function apiLogin(page, email) {
  await page.goto(`${IMPL}/api/auth/me`);
  const status = await page.evaluate(async ({ email, password }) => (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })).status, { email, password: PASSWORD });
  if (status >= 300) throw new Error(`登录失败 ${email} ${status}`);
}

async function prepareStates(browser) {
  for (const who of ['admin', 'moderator']) {
    const context = await browser.newContext();
    await apiLogin(await context.newPage(), F.accounts[who]);
    await context.storageState({ path: resolve(STATE, `${who}.json`) });
    await context.close();
  }
  // 管理员评论一条 → e2e-user 收到新的未读通知（打开通知面板会标为已读，所以每轮造一条）。
  const adminContext = await browser.newContext({ storageState: resolve(STATE, 'admin.json') });
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`${IMPL}/api/auth/me`);
  const comment = await adminPage.evaluate(async ({ workId, body }) => (await fetch(`/api/community/works/${workId}/comments`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ body }) })).status, { workId: F.works.userApproved, body: `颜色搭得真好看，已经照着拼了一个（走查 ${new Date().toLocaleTimeString('zh-CN')}）` });
  console.log('[prepare] 新通知（管理员评论）', comment);
  await adminContext.close();

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'beadhue_analytics_consent', value: 'denied', domain: new URL(IMPL).hostname, path: '/' }]);
  const page = await context.newPage();
  await apiLogin(page, F.accounts.user);
  // 云端设计要从「我的」打开一次才会拉到本机（/app?id= 只恢复本机已有的设计）。
  for (const item of Object.values(F.designs)) {
    await page.goto(`${IMPL}/me`);
    await page.getByRole('link', { name: designOpen(item.name) }).first().click({ timeout: 30_000 });
    await page.waitForURL(/\/app\?id=/, { timeout: 30_000 });
    await page.getByLabel(/图纸编辑画布/).waitFor({ timeout: 40_000 });
    await page.getByRole('status').filter({ hasText: /^(仅存本机|已保存)$/ }).first().waitFor({ timeout: 20_000 }).catch(() => console.log('[prepare] 未等到「已保存」', item.name));
    await page.waitForTimeout(1500);
    if (item.stitch) {
      await page.getByRole('group', { name: '模式' }).getByRole('button', { name: '跟拼', exact: true }).click();
      const complete = page.getByRole('button', { name: '完成本行', exact: true }).first();
      await complete.waitFor({ timeout: 20_000 });
      for (let i = 0; i < 25; i += 1) await complete.click(); // 与原型 d-rainbow 同到「第 2 块板 · 第 27 行」
      await page.waitForTimeout(800);
      await page.getByRole('group', { name: '模式' }).getByRole('button', { name: '编辑', exact: true }).click();
      await page.waitForTimeout(600);
    }
    console.log('[prepare] 已拉到本机', item.name);
  }
  await page.goto(`${IMPL}/me`);
  await page.waitForTimeout(3000);
  await context.storageState({ path: resolve(STATE, 'user.json'), indexedDB: true });
  await context.close();
}

// ---------- 截图 ----------
function locate(page, step) {
  let locator;
  if (step.role) locator = page.getByRole(step.role, { name: step.name, ...(typeof step.name === 'string' ? { exact: step.exact ?? true } : {}) });
  else if (step.label) locator = page.getByLabel(step.label);
  else locator = page.locator(step.sel);
  return locator.filter({ visible: true }).nth(step.nth ?? 0);
}
const describe = (step) => `${step.do} ${step.role ? `role=${step.role}[name=${step.name}]` : step.label ? `label=${step.label}` : step.sel}`;

async function runSteps(page, steps, record) {
  for (const step of steps ?? []) {
    if (step.do === 'wait') { await page.waitForTimeout(step.ms); continue; }
    if (step.do === 'press') { for (let i = 0; i < (step.n ?? 1); i += 1) await page.keyboard.press(step.key); await page.waitForTimeout(400); continue; }
    if (step.do === 'scrollY') { await page.evaluate((y) => window.scrollTo(0, y), step.y); await page.waitForTimeout(500); continue; }
    if (step.do === 'scrollBottom') { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(500); continue; }
    if (step.do === 'eval') { await page.evaluate(step.fn).catch(() => {}); await page.waitForTimeout(300); continue; }
    const target = locate(page, step);
    const found = await target.waitFor({ state: step.do === 'waitFor' ? 'attached' : 'visible', timeout: step.timeout ?? (step.optional ? 2500 : 6000) }).then(() => true).catch(() => false);
    if (!found) {
      if (step.optional) record.skipped.push(`${describe(step)}：${step.optional}`);
      else record.missing.push(describe(step));
      continue;
    }
    try {
      for (let i = 0; i < (step.n ?? 1); i += 1) {
        if (step.do === 'click') await target.click({ timeout: 5000, force: step.force }).catch(async (error) => { if (step.force) throw error; await target.dispatchEvent('click'); });
        if (step.do === 'hover') await target.hover({ timeout: 5000 });
        if (step.do === 'fill') await target.fill(step.value, { timeout: 5000 });
        if (step.do === 'type') await target.pressSequentially(step.value, { delay: 60 });
        if (step.do === 'focus') await target.focus();
        if (step.do === 'scroll') await target.evaluate((node) => node.scrollIntoView({ block: 'center' }));
        if (step.do === 'mouse') {
          const box = await target.boundingBox();
          if (box) await page.mouse.move(box.x + box.width * step.fx, box.y + box.height * step.fy);
        }
        if ((step.n ?? 1) > 1) await page.waitForTimeout(250);
      }
    } catch (error) {
      record.missing.push(`${describe(step)}（操作失败：${error.message.split('\n')[0].slice(0, 120)}）`);
    }
    await page.waitForTimeout(step.wait ?? 500);
  }
}

async function hideChrome(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.proto-tool, nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button]').forEach((node) => node.style.setProperty('display', 'none', 'important'));
  }).catch(() => {});
}

async function metrics(page, side) {
  return page.evaluate((side) => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth && style.visibility !== 'hidden' && style.display !== 'none' && !node.closest('[hidden], [inert]');
    };
    const overlaySel = side === 'proto' ? '.overlay, .popover' : '[role=dialog], [role=alertdialog]';
    const overlays = [...document.querySelectorAll(overlaySel)].filter(visible);
    const scope = overlays.at(-1) ?? document;
    const primarySel = side === 'proto' ? '.btn-primary' : '[class~="bg-accent"][class~="text-on-accent"]';
    // 手机底栏中间的「创作」圆钮在原型里不是 .btn-primary，实现侧同样不计。
    const primaries = [...scope.querySelectorAll(primarySel)].filter(visible).filter((node) => side === 'proto' || !node.closest('nav[aria-label="主导航"]')).map((node) => (node.getAttribute('aria-label') || node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 16));
    return { overflow, primaries, overlay: overlays.length > 0 };
  }, side);
}

async function shoot(browser, scene, width, side) {
  const spec = scene[side];
  const mobile = width < 768;
  const record = { scene: scene.name, group: scene.group, width, side, who: side === 'impl' ? (scene.implWho ?? scene.who) : scene.who, file: `raw/${scene.name}-${width}-${side}.png`, full: Boolean(scene.full), tags: scene.tags ?? [], note: scene.note ?? null, url: null, errors: [], http: [], overflow: 0, primaries: [], missing: [], skipped: [], failed: null, at: new Date().toISOString() };
  const implWho = scene.implWho ?? scene.who;
  const storageState = side === 'impl' && implWho !== 'guest' ? resolve(STATE, `${implWho}.json`) : undefined;
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, storageState, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  const recent = ['猫咪', '樱花杯垫'];
  if (side === 'proto') {
    await context.addInitScript(({ guest, consent, intro, recent }) => {
      if (!consent) sessionStorage.setItem('proto-consent', 'yes');
      if (!intro) sessionStorage.setItem('proto-intro-closed', '1');
      sessionStorage.setItem('proto-guest', guest ? '1' : '0');
      localStorage.setItem('proto-recent', JSON.stringify(recent));
    }, { guest: scene.who === 'guest', consent: Boolean(spec.consent), intro: Boolean(spec.intro), recent });
  } else {
    if (!spec.consent) await context.addCookies([{ name: 'beadhue_analytics_consent', value: 'denied', domain: new URL(IMPL).hostname, path: '/' }]);
    await context.addInitScript(({ intro, recent }) => {
      localStorage.setItem('beadhue:recent-searches', JSON.stringify(recent));
      if (!intro) { localStorage.setItem('beadhue:discover-intro-closed', '1'); localStorage.setItem('beadhue:intro-closed', '1'); }
    }, { intro: Boolean(spec.intro), recent });
  }
  if (side === 'impl') {
    // 打开设计即自动保存一次（修订 +1）。各截图上下文共用同一份本机快照，真写回云端会让后面的上下文判为「其他设备更新」并生成冲突副本，
    // 所以截图期间对设计写入回一个合成的成功响应，不落库；准备阶段的写入是真的。
    await context.route(/\/api\/designs\/[0-9a-f-]{36}$/, async (route) => {
      const request = route.request();
      if (request.method() !== 'PUT') return route.continue();
      let body = {};
      try { body = request.postDataJSON() ?? {}; } catch { /* 非 JSON */ }
      const id = new URL(request.url()).pathname.split('/').pop();
      const pattern = body.project?.pattern ?? {};
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id, name: body.name, width: pattern.width, height: pattern.height, updatedAt: new Date().toISOString(), revision: (body.baseRevision ?? 0) + 1 }) });
    });
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => record.errors.push(`pageerror: ${error.message.slice(0, 200)}`));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) record.errors.push(`console: ${message.text().slice(0, 200)}`); });
  page.on('response', (response) => { if (response.status() >= 400) record.http.push(`${response.status()} ${response.request().method()} ${response.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}`); });
  try {
    const url = side === 'proto' ? `${PROTO}${spec.route}` : `${IMPL}${spec.route}`;
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    if (side === 'impl') await page.waitForFunction(() => document.documentElement.dataset.beadhueHydrated === 'true', undefined, { timeout: 30_000 }).catch(() => record.skipped.push('未等到 data-beadhue-hydrated（按页面已渲染处理）'));
    await page.waitForTimeout(side === 'proto' ? 900 : 1500);
    await page.evaluate(() => document.fonts?.ready.then(() => undefined)).catch(() => {});
    await runSteps(page, spec.steps, record);
    await page.waitForTimeout(400);
    await hideChrome(page);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))).catch(() => {});
    record.url = page.url();
    Object.assign(record, await metrics(page, side));
    if (scene.full) {
      // 整页截图不会让首屏以下进入视区：先分段滚到底再回顶，触发懒加载的图片与 BeadImage 懒绘制。
      await page.evaluate(async () => {
        const step = Math.max(200, Math.round(window.innerHeight * 0.8));
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((done) => setTimeout(done, 120));
        }
        window.scrollTo(0, 0);
        await new Promise((done) => setTimeout(done, 300));
      }).catch(() => {});
    }
    await page.screenshot({ path: resolve(OUT, record.file), fullPage: Boolean(scene.full), timeout: 30_000 });
  } catch (error) {
    record.failed = error.message.split('\n')[0].slice(0, 240);
    await page.screenshot({ path: resolve(OUT, record.file) }).catch(() => {});
  }
  record.errors = [...new Set(record.errors)];
  record.http = [...new Set(record.http)];
  await context.close();
  return record;
}

// ---------- 运行 ----------
const browser = await chromium.launch();
const jobs = [];
for (const scene of scenes) {
  for (const width of scene.widths) {
    if (widthsArg && !widthsArg.includes(width)) continue;
    for (const side of ['proto', 'impl']) {
      if (sideArg && sideArg !== side) continue;
      if (!scene[side]) continue;
      jobs.push({ scene, width, side });
    }
  }
}
const needsImplState = jobs.some((job) => job.side === 'impl' && job.scene.who !== 'guest');
if (needsImplState && !(args.includes('--reuse-state') && ['user', 'admin', 'moderator'].every((who) => existsSync(resolve(STATE, `${who}.json`))))) {
  await prepareStates(browser);
}

const REPORT_PATH = resolve(OUT, 'report.json');
const previous = existsSync(REPORT_PATH) ? JSON.parse(readFileSync(REPORT_PATH, 'utf8')) : { shots: [] };
const key = (item) => `${item.scene}|${item.width}|${item.side}`;
const results = new Map(previous.shots.map((item) => [key(item), item]));
const started = Date.now();
let done = 0;
const phases = [...new Set(jobs.map((job) => job.scene.phase ?? 1))].sort();
for (const phase of phases) {
  const queue = jobs.filter((job) => (job.scene.phase ?? 1) === phase);
  const worker = async () => {
    while (queue.length) {
      const job = queue.shift();
      let record = await shoot(browser, job.scene, job.width, job.side);
      if (record.failed) record = await shoot(browser, job.scene, job.width, job.side);
      results.set(key(record), record);
      done += 1;
      const flags = [record.failed && `失败:${record.failed}`, record.missing.length && `找不到×${record.missing.length}`, record.errors.length && `报错×${record.errors.length}`, record.overflow > 0 && `溢出${record.overflow}px`, record.primaries.length > 1 && `主按钮×${record.primaries.length}`].filter(Boolean);
      console.log(`[${done}/${jobs.length}] ${record.scene}-${record.width}-${record.side} ${flags.join(' ') || 'ok'}`);
      if (done % 20 === 0) writeReport();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, JOBS) }, worker));
}
await browser.close();

function writeReport() {
  const shots = [...results.values()].sort((a, b) => key(a).localeCompare(key(b)));
  const sceneMeta = S.map(({ name, group, who, implWho, widths, full, tags, note, proto, impl }) => ({ name, group, who, implWho: implWho ?? who, widths, full: Boolean(full), tags: tags ?? [], note: note ?? null, proto: proto ? proto.route : null, impl: impl ? impl.route : null }));
  writeFileSync(REPORT_PATH, JSON.stringify({ implBase: IMPL, protoBase: PROTO, generatedAt: new Date().toISOString(), scenes: sceneMeta, shots }, null, 1));
}
writeReport();
const shots = [...results.values()];
const bad = shots.filter((item) => item.failed || item.missing.length);
console.log(`完成 ${done} 张，用时 ${Math.round((Date.now() - started) / 1000)}s；report 共 ${shots.length} 张，失败或找不到选择器 ${bad.length} 张`);
for (const item of bad) console.log(`  ${item.scene}-${item.width}-${item.side}: ${item.failed ?? ''} ${item.missing.join(' | ')}`);
