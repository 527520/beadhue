// 评审页：桌面 / 手机两个画框同步显示同一屏，下方列出「旧问题 → 新设计」。
const OLD = '../evidence/current/';
const OLD_ADMIN = '../evidence/main-r14/';

const SCREENS = [
  {
    group: '发现', id: 'discover', label: '发现 · 首页', route: '#/', old: [`${OLD}a01-home-first-visit-1440.png`, `${OLD}a01-home-first-visit-390.png`],
    summary: '首屏直接是作品。吸顶的像素类目条代替口号和推荐卡，筛选与排序收进类目条右端，作品卡用豆粒渲染并可直接点赞。',
    states: [['打开筛选', ['[data-open-filter]']], ['打开排序', ['[data-open-sort]']], ['点赞第一张', ['[data-like]']]],
    notes: [
      ['§2-1', '首屏被口号和两张推荐卡占满，手机首屏一件作品都看不到', '顶栏下直接是类目条和作品网格；新手引导压成一行可关闭的提示'],
      ['§1-1', '主导航做成分段按钮组，激活项实心蓝块，像表单控件', '文字导航 + 深墨下划线；主色只留给「上传图片」一个按钮'],
      ['§1-2', '未登录也显示「我」头像，看不出登录状态', '未登录显示「登录」按钮；登录后是头像菜单（含原图空间、设置、后台）'],
      ['§1-3', '统计同意横幅插在页头下方，把首屏往下推', '改为左下角浮卡，不占页面流，两个按钮同权重'],
      ['§2-3', '搜索提示漂在输入框外；「更多筛选」展开成页内面板推开网格', '搜索进顶栏并带建议面板；筛选是弹出层（手机底部面板），底部实时显示「显示 N 张」'],
      ['§2-4', '标签区只剩一个孤零零的「全部」芯片', '像素图标类目条：全部、精选、动物、猫咪、星星人、水果……横滑并吸顶'],
      ['§2-5', '缩略图满铺格线与板缝线，右下角「→」与整卡可点重复，手机元信息折行', '豆粒渲染（带孔圆豆 + 钉板），整卡可点，元信息单行不折行'],
      ['§2-6', '卡片心形只是计数，不能点赞', '右上角点赞按钮，心形填红并有一次落位动效；未登录点击弹出登录'],
      ['§2-7', '手机排序面板用方形复选框表示单选', '排序菜单用对勾表示当前项，手机为底部面板'],
    ],
  },
  {
    group: '发现', id: 'search', label: '搜索结果', route: '#/search?q=猫', old: [`${OLD}a05-community-search-focus-1440.png`, `${OLD}a05-community-search-focus-390.png`],
    summary: '回车后进入结果视图：标题说明搜了什么、有多少张，已选筛选以可移除芯片列出；手机点放大镜进入全屏搜索页。',
    states: [['聚焦搜索框（桌面）', ['.topbar-search input']]],
    notes: [
      ['§2-3', '搜索、排序、筛选、标签四套入口叠在一起', '一个搜索入口（标题 / 标签 / 作者都能搜），结果页只保留排序与筛选'],
      ['新增', '没有搜索建议', '聚焦即显示最近搜索、大家在搜；输入时列出匹配图纸与作者（需新接口 search/suggest）'],
    ],
  },
  {
    group: '发现', id: 'empty-search', label: '搜索无结果', route: '#/search?q=恐龙', old: [`${OLD}a04-community-empty-search-1440.png`, `${OLD}a04-community-empty-search-390.png`],
    summary: '空结果给出下一步：清除条件，或点一个热门词。',
    states: [],
    notes: [
      ['三-5', '空结果里出现第二个实心主按钮「清除筛选」，筛选区仍整块展开', '空状态只放次按钮 + 热门搜索芯片；页面上唯一的主按钮仍是「上传图片」'],
      ['根因 4', '标题「没有符合这些条件的作品」圆体与苹方混排', '取消圆体标题，全站标题统一 BeadHue Text'],
    ],
  },
  {
    group: '作品', id: 'detail', label: '作品详情', route: '#/works/w-cat', old: [`${OLD}u02-detail-signed-in-1440.png`, `${OLD}u02-detail-signed-in-390.png`],
    summary: '左边是中性底色的查看器，右边吸顶「制作卡」给出尺寸、颜色、颗数、色号清单和「用这张制作」；讨论、相似作品、作者的更多作品接在下面。手机上操作栏吸底。',
    states: [['显示色号（自动切方格并放大）', ['[data-v="codes"]']], ['全屏查看', ['[data-v="full"]']]],
    notes: [
      ['§3-1', '查看器放在大面积杏黄卡片里，默认满格色号文字', '中性浅灰舞台，默认豆粒渲染；放大到看得清时才出现网格和色号'],
      ['§3-2', '手机缩放条跑到卡片外、图纸框撑出卡片', '工具条浮在舞台内部，手机为右下角迷你工具条'],
      ['§3-3', '许可条款被当作简介显示两次', '只保留一行「仅限个人制作使用 ⓘ」，全文在弹出层'],
      ['§3-4', '登录前后第三项统计口径不同（预计豆量 / 画布格数）', '统一为尺寸 / 颜色 / 颗数'],
      ['§3-5', '赞数显示两遍，举报与更多是一排无字图标', '赞数只在点赞按钮上；举报收进「…」'],
      ['§3-6', '讨论区表单卡 + 大空白卡，右侧留空', '输入框在列表上方，空时只有一句邀请；与左栏同宽'],
      ['§3-7', '没有色号清单与颗数、没有相关作品、作者不可点', '制作卡列出色号与颗数；新增相似作品、作者主页（需新接口）'],
      ['§1-4', '手机底栏遮挡统计区与卡片', '详情页隐藏站点底栏，换成「点赞 + 用这张制作」吸底栏并留出安全区'],
    ],
  },
  {
    group: '作品', id: 'detail-guest', label: '详情 · 未登录', route: '#/works/w-star', guest: true, old: [`${OLD}a09-detail-anonymous-1440.png`, `${OLD}a09-detail-anonymous-390.png`],
    summary: '未登录能看作品全貌与统计；色号清单模糊并说明登录后可见，主按钮变「登录后制作」。',
    states: [],
    notes: [
      ['§3-4', '未登录时统计口径变成「画布格数」', '与登录后完全一致，只隐藏色号细节'],
      ['D53', '内容分级规则只能靠一句提示理解', '被隐藏的部分就地模糊并给出登录入口，规则不再写成长段文字'],
    ],
  },
  {
    group: '创作', id: 'create', label: '创作入口', route: '#/create', old: [`${OLD}a10-create-entry-1440.png`, `${OLD}a10-create-entry-390.png`],
    summary: '一个清楚的落区 + 两个并列的次入口（空白画布、导入项目文件）+ 示例 + 最近的设计。选图后在「新建图纸」弹窗里一次设好裁剪、尺寸、颜色和色板。',
    states: [['点示例图 → 新建图纸', ['[data-sample]']], ['从空白画布开始', ['[data-blank]']]],
    notes: [
      ['§4-1', '标题贴左边线、上传卡居中，两侧各空 400px', '标题与卡片同一左边线，880px 单列'],
      ['§4-2', '「从空白画布开始」只是一行文字按钮', '与「导入项目文件」并列为两张次入口卡'],
      ['§4-3', '裁剪卡只有 310px 宽，「生成图纸」在首屏之外', '新建图纸弹窗左裁剪右设置，底部按钮固定可见；手机为底部面板，按钮吸底'],
      ['§5-8', '「导入项目文件」藏在编辑器的导出页签里', '移到创作入口，与新建并列'],
    ],
  },
  {
    group: '创作', id: 'editor', label: '编辑器', route: '#/editor/d-cat', old: [`${OLD}u06-editor-1440.png`, `${OLD}u06-editor-390.png`],
    summary: '独立的全屏工作区：顶栏放唯一的模式切换和导出，左侧只有绘图工具，画布居中适配，右侧默认是「颜色」面板。',
    states: [['打开导出菜单', ['[data-export]']], ['打开分享', ['[data-share]']], ['切到跟拼', ['[data-mode="stitch"]']]],
    notes: [
      ['§5-1', '全站导航 + 编辑器头两层叠加，整页滚动', '100dvh 固定工作区，没有站点导航'],
      ['§5-2', '预览 / 编辑 / 跟拼 藏在可关闭的设置面板里，面板内还有第二层页签', '顶栏居中「编辑 | 跟拼」，全局唯一的分段控件'],
      ['§5-3', '调色板在设置面板最底部', '右面板默认「颜色」：当前色、图纸用色、全部颜色'],
      ['§5-4', '原图参照窗把错误信息盖在画布上', '右上角原图胶囊，点开才是浮窗；缺少对应关系时胶囊变黄色提示'],
      ['§5-5', '图纸贴左上角，手机只露出一半', '加载即居中适配，底部浮动缩放条'],
      ['§5-6', '撤销、重做、旋转、镜像和画笔混在一列', '左栏只放绘图工具；撤销重做进顶栏，旋转镜像进「调整」'],
      ['§5-7', '头部挤着导出、状态、保存（主按钮）、公开、更多', '自动保存以状态文字呈现；只有「导出」是主按钮'],
      ['§5-8', '下载、PDF、导入、分享、公开混在「导出」页签', '导出菜单只管文件；「分享」弹出层里是只读链接和公开到豆社'],
    ],
  },
  {
    group: '创作', id: 'editor-noorig', label: '编辑器 · 无原图', route: '#/editor/d-heart', old: [`${OLD}u06-editor-1440.png`, `${OLD}u06-editor-390.png`],
    summary: '没有可靠原图时，只提示一次并给出选择原图的入口，其余功能照常可用。',
    states: [['切到「调整」', ['[data-panel-tab="adjust"]']]],
    notes: [
      ['§5-6', '没有原图时整列参数灰掉', '「调整」只显示一张说明卡和「选择原图」按钮，旋转镜像仍可用'],
      ['§5-4', '错误信息常驻画布', '原图胶囊变为黄色「原图未对齐 · 重新选择」，不遮挡画布'],
    ],
  },
  {
    group: '创作', id: 'stitch', label: '跟拼模式', route: '#/editor/d-rainbow?mode=stitch', old: [`${OLD}u09-export-open-1440.png`, `${OLD}u08-stitch-390.png`],
    summary: '进度、板块总览、当前行和「完成本行」集中在右面板；画布高亮当前板与行。',
    states: [],
    notes: [
      ['§5-9', '进度条、定位窗、工具条、提示语分散四处', '右面板一处集中：进度、板块总览、当前行颜色序列、完成本行'],
      ['§5-9', '手机上没有集中的跟拼操作区', '手机底部三等分：上一行 ｜ 完成本行 ｜ 下一行，顶部进度胶囊'],
    ],
  },
  {
    group: '我的', id: 'me', label: '我的设计', route: '#/me', old: [`${OLD}u01-my-designs-1440.png`, `${OLD}u01-my-designs-390.png`],
    summary: '每张设计都有真实缩略图；工具条可搜索、按状态筛选、排序和切换视图；角标只在需要时出现。',
    states: [['打开第一张卡片菜单', ['[data-card-menu]']]],
    notes: [
      ['§6-1', '云端设计全部没有缩略图，只写「44 × 44 格」', '服务端按修订渲染豆粒缩略图（需新接口 GET /api/designs/:id/thumbnail）'],
      ['§6-2', '原图云端空间卡常驻页顶', '移入头像菜单与账号设置，用量超过 80% 才提示'],
      ['§6-3', '每张卡两颗状态标签，手机折行', '只在需要时出现一个角标：已公开 / 跟拼进度环 / 仅本机'],
      ['§6-4', '没有搜索、排序、筛选', '搜索 + 状态芯片 + 排序 + 网格 / 列表'],
    ],
  },
  {
    group: '我的', id: 'me-empty', label: '我的设计 · 空', route: '#/me/designs?empty=1', old: [`${OLD}e01-my-designs-empty-1440.png`, `${OLD}e01-my-designs-empty-390.png`],
    summary: '空状态用豆粒插画和一句说明，给出唯一的主按钮。',
    states: [],
    notes: [['§6-5', '虚线框 + 第二个「新建设计」主按钮', '空状态主按钮「上传图片」+ 次按钮「从空白开始」，工具条的「新建」此时隐藏']],
  },
  {
    group: '我的', id: 'me-palettes', label: '色板', route: '#/me/palettes', old: [`${OLD}a11-palettes-1440.png`, `${OLD}a11-palettes-390.png`],
    summary: '我的色板与内置色板放在「我的」里，点开看完整色块。',
    states: [],
    notes: [['§7-1', '未登录警告贴着标题、原生 select、标题字体混排', '色板卡直接展示色带与规格，点开弹窗可搜索；统一字体']],
  },
  {
    group: '我的', id: 'me-settings', label: '账号设置', route: '#/me/settings', old: [`${OLD}u05-account-1440.png`, `${OLD}u05-account-390.png`],
    summary: '按分区排列，按钮与操作的分量相称，危险操作单独放在最后。',
    states: [],
    notes: [['§7-2', '「保存用户名」全宽实心主按钮，原生折叠三角', '保存为次按钮且未修改时禁用；分区卡片，无原生控件']],
  },
  {
    group: '我的', id: 'author', label: '作者主页', route: '#/u/official', old: [],
    summary: '新增：从作品详情点作者进入，看 TA 的全部作品。',
    states: [],
    notes: [['§3-7', '作者名不可点，看完作品就到底', '新增作者主页（需新接口 authors/:id）']],
  },
  {
    group: '账号', id: 'login', label: '登录', route: '#/', guest: true, old: [`${OLD}a13-login-validation-1440.png`, `${OLD}a13-login-validation-390.png`],
    summary: '登录是弹窗（手机底部面板），错误挂在出错的字段下方。',
    states: [['打开登录并提交空表单', ['[data-login]', '[data-login-form] button[type="submit"]']]],
    notes: [['§7-3', '错误是表单顶部红色横幅，出错字段无标记', '字段红边 + 下方错误文字，并自动聚焦到出错字段']],
  },
  {
    group: '后台', id: 'admin', label: '后台总览', route: '#/admin', old: [`${OLD_ADMIN}m-admin-1440.png`, `${OLD_ADMIN}m-admin-390.png`],
    summary: '同一套令牌的浅色后台：指标卡带趋势、待办列表、7 日趋势与服务状态填满首屏。',
    states: [],
    notes: [
      ['§8-1', '左上角仍是旧品牌缩写「DP」', '换成豆粒标志与「管理后台」'],
      ['§8-2', '总览只有四张卡和重复的常用入口，下方 60% 空白', '指标卡 + 待办 + 趋势图 + 服务状态'],
      ['§8-5', '眉题与侧栏重复，与用户端两套观感', '去掉眉题；卡片、徽标、按钮与用户端同一套'],
    ],
  },
  {
    group: '后台', id: 'admin-works', label: '作品管理', route: '#/admin/works', old: [`${OLD_ADMIN}m-admin-works-1440.png`, `${OLD_ADMIN}m-admin-works-390.png`],
    summary: '通栏数据表格，底部单行分页；点击行从右侧滑出详情抽屉。',
    states: [['打开第一行详情', ['[data-row]']]],
    notes: [
      ['§8-3', '列表栏 310px，分页器挤成三行，跳页输入框被压没', '通栏表格 + 单行分页（总数 · 每页 · 页码 · 跳页）'],
      ['§8-4', '未选中时右侧 60% 宽度空着', '详情改为右侧抽屉，按需出现'],
    ],
  },
  {
    group: '后台', id: 'admin-reviews', label: '作品审核', route: '#/admin/reviews', old: [`${OLD_ADMIN}m-admin-reviews-1440.png`, `${OLD_ADMIN}m-admin-reviews-390.png`],
    summary: '进入即选中第一份投稿，图纸与原图等高并排，快捷键处理。',
    states: [],
    notes: [['§8-4', '审核页三栏中两栏为空', '自动选中第一项；决定栏固定在底部，J/K/A/R 快捷键']],
  },
  {
    group: '组件', id: 'components', label: '组件总览', route: '#/components', old: [],
    summary: '按钮、输入、搜索、芯片、页签、分段、菜单、弹窗、提示、徽标、空状态、骨架、分页的全部变体与使用规则。',
    states: [],
    notes: [['三', '同类控件选中态四种、禁用态半透明、空状态千篇一律', '每个组件只有一套状态规则，统一在此页']],
  },
];

const list = document.querySelector('.rv-list');
const notes = document.querySelector('.rv-notes');
const frames = [...document.querySelectorAll('.rv-viewport iframe')];
const olds = [...document.querySelectorAll('.rv-viewport img.old')];
let accent = localStorage.getItem('proto-accent') ?? 'blue';
let current = SCREENS[0];

const groups = [...new Set(SCREENS.map((screen) => screen.group))];
list.innerHTML = groups.map((group) => `<h3>${group}</h3>${SCREENS.filter((screen) => screen.group === group).map((screen) => `<button data-screen="${screen.id}">${screen.label}</button>`).join('')}`).join('');

function layout() {
  const stage = document.querySelector('.rv-stage');
  const available = stage.clientWidth;
  const stacked = window.innerWidth <= 1100;
  const phoneScale = 0.82;
  const desktopScale = Math.min(1, (stacked ? available : available - 390 * phoneScale - 24 - 16) / 1440);
  frames.forEach((frame) => {
    const w = Number(frame.dataset.w);
    const h = Number(frame.dataset.h);
    const scale = w === 1440 ? desktopScale : phoneScale;
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    frame.style.transform = `scale(${scale})`;
    frame.parentElement.style.width = `${w * scale}px`;
    frame.parentElement.style.height = `${h * scale}px`;
  });
}

function src(screen) {
  const params = new URLSearchParams({ accent });
  if (screen.guest) params.set('guest', '1');
  return `index.html?${params}${screen.route}`;
}

function show(screen) {
  current = screen;
  if (screen.guest) sessionStorage.setItem('proto-guest', '1'); else sessionStorage.setItem('proto-guest', guestPref());
  document.querySelectorAll('[data-screen]').forEach((button) => button.setAttribute('aria-current', String(button.dataset.screen === screen.id)));
  frames.forEach((frame) => { frame.src = src(screen); });
  olds.forEach((img, index) => { img.src = screen.old[index] ?? ''; img.hidden = !screen.old[index]; });
  document.getElementById('open-standalone').href = src(screen);
  notes.innerHTML = `
    <header><div class="grow"><h2 class="t-title-2">${screen.label}</h2><p>${screen.summary}</p></div></header>
    ${screen.states.length ? `<div class="rv-states"><span class="t-caption t-muted" style="align-self:center">演示状态：</span>${screen.states.map(([label], index) => `<button class="btn btn-sm btn-outline" data-state="${index}">${label}</button>`).join('')}<button class="btn btn-sm btn-ghost" data-state="reset">重置</button></div>` : ''}
    <table class="rv-table"><thead><tr><th>对应审查</th><th>旧问题</th><th>新设计怎么解决</th></tr></thead><tbody>
      ${screen.notes.map(([ref, old, fix]) => `<tr><td>${ref}</td><td class="old">${old}</td><td class="new">${fix}</td></tr>`).join('')}
    </tbody></table>`;
  history.replaceState(null, '', `#${screen.id}`);
}

const guestPref = () => localStorage.getItem('proto-review-guest') ?? '0';

list.addEventListener('click', (event) => {
  const button = event.target.closest('[data-screen]');
  if (button) show(SCREENS.find((screen) => screen.id === button.dataset.screen));
});
notes.addEventListener('click', (event) => {
  const button = event.target.closest('[data-state]');
  if (!button) return;
  if (button.dataset.state === 'reset') { show(current); return; }
  const selectors = current.states[Number(button.dataset.state)][1];
  frames.forEach((frame) => frame.contentWindow?.postMessage({ type: 'proto-click', selectors }, '*'));
});
document.querySelectorAll('[data-accent]').forEach((button) => button.addEventListener('click', () => {
  accent = button.dataset.accent;
  localStorage.setItem('proto-accent', accent);
  document.documentElement.dataset.accent = accent;
  document.querySelectorAll('[data-accent]').forEach((node) => node.setAttribute('aria-pressed', String(node === button)));
  frames.forEach((frame) => frame.contentWindow?.postMessage({ type: 'proto-accent', value: accent }, '*'));
}));
document.querySelectorAll('[data-guest]').forEach((button) => button.addEventListener('click', () => {
  localStorage.setItem('proto-review-guest', button.dataset.guest);
  document.querySelectorAll('[data-guest]').forEach((node) => node.setAttribute('aria-pressed', String(node === button)));
  sessionStorage.setItem('proto-guest', button.dataset.guest);
  frames.forEach((frame) => frame.contentWindow?.postMessage({ type: 'proto-guest', value: button.dataset.guest === '1' }, '*'));
}));
document.getElementById('show-old').addEventListener('change', (event) => document.body.classList.toggle('show-old', event.target.checked));

document.documentElement.dataset.accent = accent;
document.querySelectorAll('[data-accent]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.accent === accent)));
document.querySelectorAll('[data-guest]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.guest === guestPref())));
window.addEventListener('resize', layout);
layout();
show(SCREENS.find((screen) => `#${screen.id}` === location.hash) ?? SCREENS[0]);
