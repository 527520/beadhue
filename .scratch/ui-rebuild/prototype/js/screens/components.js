// 组件总览：每个组件的全部变体与状态 + 一两句使用规则（取自 design.md §3）。组件本身只用共享类。
import { icon } from '../icons.js';
import { $, $$, esc, avatar, workCard, skeletonCards, emptyState, openPopover, openDialog, toast, beadDots } from '../ui.js';
import { WORKS, AUTHORS, DESIGNS } from '../data.js';
import { patternImage } from '../beads.js';
import { BEADS } from '../../motifs.js';

const SECTIONS = [
  ['tokens', '令牌'], ['button', '按钮'], ['icon-button', '图标按钮'], ['input', '输入'], ['search', '搜索'], ['chip', '芯片'],
  ['tabs', '页签'], ['seg', '分段'], ['menu', '菜单'], ['popover', '弹出层'], ['dialog', '弹窗'], ['confirm', '危险确认'],
  ['sheet', '抽屉'], ['toast', '提示'], ['badge', '徽标'], ['avatar', '头像'], ['empty', '空状态'], ['skeleton', '骨架'],
  ['pagination', '分页'], ['progress', '进度条'], ['controls', '开关与复选'], ['tooltip', '气泡提示'], ['cards', '作品卡'], ['beads', '色号色块'],
];

const sec = (id, title, rule, body) => `<section class="kit-sec" id="kit-${id}" data-kit-sec="${id}" aria-labelledby="kit-${id}-h">
  <header class="kit-sec-head"><h2 class="t-title-2" id="kit-${id}-h">${title}</h2><p class="kit-rule">${rule}</p></header>
  ${body}
</section>`;
const panel = (body, cls = '') => `<div class="kit-panel ${cls}">${body}</div>`;
const spec = (caption, body, cls = '') => `<figure class="kit-spec ${cls}"><div class="kit-spec-body">${body}</div><figcaption>${caption}</figcaption></figure>`;
const row = (body, cls = '') => `<div class="kit-row ${cls}">${body}</div>`;
const label = (text) => `<p class="kit-label">${text}</p>`;

function tokens() {
  const colors = ['--bg', '--bg-subtle', '--bg-muted', '--bg-emphasis', '--line', '--line-strong', '--ink', '--ink-2', '--ink-3', '--ink-4', '--accent', '--accent-soft', '--success', '--warning', '--danger', '--featured', '--heart'];
  const type = [['display', '创作一张拼豆图纸'], ['title-1', '橘猫团子'], ['title-2', '相似作品'], ['title-3', '色号清单'], ['body', '上传一张喜欢的图片，几秒生成图纸。'], ['body-sm', '32×32 · 7 色 · 812 颗'], ['caption', '2 小时前']];
  return panel(`${label('颜色')}<div class="kit-swatches">${colors.map((name) => `<div class="kit-swatch"><span style="background:var(${name})"></span><b>${name}</b><code class="t-mono" data-token="${name}"></code></div>`).join('')}</div>
    ${label('字号（只有 7 级）')}<div class="kit-type">${type.map(([name, sample]) => `<div><code class="t-mono">${name}</code><span class="t-${name}">${sample}</span></div>`).join('')}</div>`);
}

function buttons() {
  const variants = [['primary', '生成图纸'], ['secondary', '下载 PNG'], ['outline', '筛选'], ['ghost', '取消'], ['danger', '删除']];
  const sizes = [['sm', 'sm · 32'], ['', 'md · 40'], ['lg', 'lg · 48']];
  return `${panel(`<div class="kit-matrix" role="table" aria-label="按钮变体与尺寸">
      <span class="kit-corner"></span>${sizes.map(([, text]) => `<span class="kit-label">${text}</span>`).join('')}
      ${variants.map(([variant, text]) => `<span class="kit-label kit-variant">${variant}</span>${sizes.map(([size]) => `<span><button type="button" class="btn btn-${variant} ${size ? `btn-${size}` : ''}">${text}</button></span>`).join('')}`).join('')}
    </div>`, 'is-specimen')}
    ${panel(row([
      spec('带图标', `<button type="button" class="btn btn-primary">${icon('upload')}上传图片</button>`),
      spec('次按钮 + 图标', `<button type="button" class="btn btn-secondary">${icon('download')}下载 PNG</button>`),
      spec('描边 + 图标', `<button type="button" class="btn btn-outline">${icon('sliders-horizontal')}筛选</button>`),
      spec('幽灵 + 图标', `<button type="button" class="btn btn-ghost">${icon('x', 's18')}清除搜索</button>`),
      spec('加载中（宽度不变）', `<button type="button" class="btn btn-primary is-loading" aria-busy="true">生成图纸</button><button type="button" class="btn btn-secondary is-loading" aria-busy="true">保存</button>`),
      spec('禁用', `<button type="button" class="btn btn-primary" disabled>生成图纸</button><button type="button" class="btn btn-outline" disabled>筛选</button>`),
      spec('点一下看 loading', '<button type="button" class="btn btn-secondary" data-demo-loading>导出 PDF</button>'),
    ].join('')))}`;
}

function iconButtons() {
  const work = WORKS[0];
  return panel(row([
    spec('普通', `<button type="button" class="icon-btn" aria-label="分享" data-tip="分享">${icon('share-2')}</button><button type="button" class="icon-btn" aria-label="更多" data-tip="更多">${icon('ellipsis')}</button>`),
    spec('实心', `<button type="button" class="icon-btn filled" aria-label="撤销" data-tip="撤销">${icon('undo-2')}</button><button type="button" class="icon-btn filled" aria-label="重做" data-tip="重做">${icon('redo-2')}</button>`),
    spec('选中（深墨）', `<button type="button" class="icon-btn" aria-pressed="true" aria-label="画笔" data-tip="画笔" data-demo-press>${icon('paintbrush')}</button><button type="button" class="icon-btn" aria-pressed="false" aria-label="橡皮" data-tip="橡皮" data-demo-press>${icon('eraser')}</button>`),
    spec('图片上', `<div class="kit-onimage"><img src="${patternImage(work.pattern, 200)}" alt=""><button type="button" class="icon-btn on-image like-btn" aria-pressed="true" aria-label="取消喜欢" data-demo-press>${icon('heart')}</button></div>`),
    spec('尺寸 32 / 40 / 48', `<button type="button" class="icon-btn sm filled" aria-label="小">${icon('plus', 's18')}</button><button type="button" class="icon-btn filled" aria-label="中">${icon('plus')}</button><button type="button" class="icon-btn lg filled" aria-label="大">${icon('plus', 's24')}</button>`),
    spec('禁用', `<button type="button" class="icon-btn filled" disabled aria-label="重做（没有可重做的操作）">${icon('redo-2')}</button>`),
  ].join('')));
}

function inputs() {
  return panel(`<div class="kit-grid-2">
    <div class="field"><label for="kit-in-1">作品名称</label><input class="input" id="kit-in-1" placeholder="例如：橘猫团子"><span class="hint">最多 20 个字</span></div>
    <div class="field"><label for="kit-in-2">作品名称 · 聚焦</label><input class="input kit-force-focus" id="kit-in-2" value="橘猫团子"><span class="hint">聚焦：主色边 + 3px 主色光晕</span></div>
    <div class="field is-invalid"><label for="kit-in-3">邮箱</label><input class="input" id="kit-in-3" value="lu@example" aria-invalid="true" aria-describedby="kit-in-3-e"><span class="error" id="kit-in-3-e">${icon('circle-alert', 's16')}<span>邮箱缺少域名后缀，例如 lu@example.com</span></span></div>
    <div class="field"><label for="kit-in-4">制作规格 · 禁用</label><input class="input" id="kit-in-4" value="5mm · 29×29" disabled><span class="hint">由所选色板决定</span></div>
    <div class="field"><label for="kit-in-5">作品介绍</label><textarea class="textarea" id="kit-in-5" placeholder="说说这张图纸的故事"></textarea></div>
    <div class="field"><span class="field-label" id="kit-sel-l">色板</span><button type="button" class="select" data-demo-select aria-haspopup="menu" aria-labelledby="kit-sel-l kit-sel-v"><span id="kit-sel-v">MARD 豆色绘经典 291 色</span>${icon('chevron-down')}</button><span class="hint">选择按钮打开菜单，不用原生下拉框</span></div>
  </div>`);
}

function search() {
  return panel(`<div class="kit-grid-2">
    ${spec('默认 · 高 48', `<div class="search" role="search">${icon('search', 's18')}<input type="search" placeholder="搜索图纸、标签或作者" aria-label="搜索图纸、标签或作者"></div>`, 'is-block')}
    ${spec('有值 · 右侧清除', `<div class="search has-value" role="search">${icon('search', 's18')}<input type="search" value="猫" aria-label="搜索"><button type="button" class="icon-btn sm clear" aria-label="清除">${icon('x', 's16')}</button></div>`, 'is-block')}
    ${spec('聚焦 · 白底浮起（顶栏 44）', `<div class="search compact kit-force-search" role="search" data-demo-search-anchor>${icon('search', 's18')}<input type="search" value="猫咪" aria-label="搜索"></div>`, 'is-block')}
    ${spec('建议面板', '<button type="button" class="btn btn-secondary" data-demo-suggest>打开建议面板</button>')}
  </div>`);
}

function chips() {
  return panel(row([
    spec('默认', '<button type="button" class="chip" aria-pressed="false" data-demo-chip>动物</button><button type="button" class="chip" aria-pressed="false" data-demo-chip>猫咪</button>'),
    spec('选中（深墨）', '<button type="button" class="chip is-selected" aria-pressed="true" data-demo-chip>可爱</button>'),
    spec('可移除', `<span class="chip is-selected">30–40 格<button type="button" class="remove" aria-label="移除筛选：30–40 格" data-demo-remove>${icon('x', 's16')}</button></span><span class="chip">夏天<button type="button" class="remove" aria-label="移除标签：夏天" data-demo-remove>${icon('x', 's16')}</button></span>`),
    spec('带计数', '<button type="button" class="chip" aria-pressed="false" data-demo-chip>星星人 <span class="count">12</span></button><button type="button" class="chip is-selected" aria-pressed="true" data-demo-chip>水果 <span class="count">8</span></button>'),
    spec('描边', `<button type="button" class="chip outline">${icon('history', 's16')}樱花杯垫</button><button type="button" class="chip outline">${icon('plus', 's16')}添加标签</button>`),
  ].join('')));
}

function tabs() {
  return panel(`${label('页面级页签')}<div class="tabs" role="tablist" data-demo-tabs><button type="button" class="tab" role="tab" aria-selected="true">设计</button><button type="button" class="tab" role="tab" aria-selected="false">公开作品 <span class="count">12</span></button><button type="button" class="tab" role="tab" aria-selected="false">喜欢</button><button type="button" class="tab" role="tab" aria-selected="false">色板</button></div>
    ${label('小号（面板内）')}<div class="tabs sm" role="tablist" data-demo-tabs><button type="button" class="tab" role="tab" aria-selected="false">颜色</button><button type="button" class="tab" role="tab" aria-selected="true">调整</button><button type="button" class="tab" role="tab" aria-selected="false">信息</button></div>`);
}

function segs() {
  return panel(row([
    spec('编辑器模式', '<div class="seg" role="group" aria-label="模式" data-demo-seg><button type="button" class="seg-item" aria-pressed="true">编辑</button><button type="button" class="seg-item" aria-pressed="false">跟拼</button></div>'),
    spec('视图（纯图标）', `<div class="seg icons" role="group" aria-label="视图" data-demo-seg><button type="button" class="seg-item" aria-pressed="true" aria-label="网格视图" data-tip="网格">${icon('layout-grid')}</button><button type="button" class="seg-item" aria-pressed="false" aria-label="列表视图" data-tip="列表">${icon('list')}</button></div>`),
  ].join('')));
}

function menus() {
  return panel(row([
    spec('操作菜单（含危险项）', `<button type="button" class="icon-btn filled" data-demo-menu="actions" aria-haspopup="menu" aria-label="更多操作" data-tip="更多">${icon('ellipsis')}</button>`),
    spec('单选菜单（勾选）', `<button type="button" class="btn btn-outline" data-demo-menu="sort" aria-haspopup="menu">${icon('arrow-up-down')}<span data-demo-sort-label>推荐</span></button>`),
    spec('静态样张', `<div class="popover kit-static" role="menu" aria-label="样张"><button type="button" class="menu-item" role="menuitem">${icon('folder-open')}打开</button><button type="button" class="menu-item" role="menuitem">${icon('pencil')}重命名<span class="trail">F2</span></button><button type="button" class="menu-item" role="menuitemradio" aria-checked="true">${icon('layout-grid')}网格视图<span class="check">${icon('check', 's18')}</span></button><div class="menu-sep"></div><button type="button" class="menu-item danger" role="menuitem">${icon('trash-2')}删除…</button></div>`, 'is-tall'),
  ].join('')));
}

function popovers() {
  return panel(row([
    spec('筛选弹出层（手机为底部面板）', `<button type="button" class="btn btn-outline" data-demo-popover aria-haspopup="dialog">${icon('sliders-horizontal')}筛选</button>`),
    spec('宽度按内容：最小 200、最大 360；宽版 560', '<span class="kit-note">不跟随触发器拉满</span>'),
  ].join('')));
}

function dialogs() {
  return panel(`${row([
    spec('480 · 默认', '<button type="button" class="btn btn-secondary" data-demo-dialog="">打开弹窗</button>'),
    spec('640 · md', '<button type="button" class="btn btn-secondary" data-demo-dialog="md">打开 640</button>'),
    spec('880 · lg', '<button type="button" class="btn btn-secondary" data-demo-dialog="lg">打开 880</button>'),
  ].join(''))}
  <div class="kit-dialog-wrap"><div class="dialog kit-static" role="dialog" aria-label="样张：重命名设计"><header class="dialog-head"><h2>重命名设计</h2><button type="button" class="icon-btn sm" aria-label="关闭">${icon('x')}</button></header><div class="dialog-body"><div class="field"><label for="kit-dlg-in">名称</label><input class="input" id="kit-dlg-in" value="橘猫团子 · 大号"></div></div><footer class="dialog-foot"><button type="button" class="btn btn-secondary">取消</button><button type="button" class="btn btn-primary">保存</button></footer></div></div>`);
}

function confirmDemo() {
  return panel(`${row(spec('危险操作入口 → 确认弹窗', `<button type="button" class="btn btn-danger-ghost" data-demo-confirm>${icon('trash-2', 's18')}删除设计…</button>`))}
  <div class="kit-dialog-wrap"><div class="dialog kit-static" role="dialog" aria-label="样张：删除确认"><header class="dialog-head"><h2>删除「橘猫团子 · 大号」？</h2><button type="button" class="icon-btn sm" aria-label="关闭">${icon('x')}</button></header><div class="dialog-body"><p class="t-body-sm kit-ink2">删除后无法恢复；已公开的作品会同时从发现页移除。</p></div><footer class="dialog-foot"><button type="button" class="btn btn-secondary">取消</button><button type="button" class="btn btn-danger">删除设计</button></footer></div></div>`);
}

function sheet() {
  return panel(row([
    spec('桌面右侧 480px；手机底部面板', '<button type="button" class="btn btn-secondary" data-demo-sheet>打开抽屉</button>'),
    spec('后台实例', '<a class="t-link t-body-sm" href="#/admin/works">作品管理 → 点击任意一行</a>'),
  ].join('')));
}

function toasts() {
  return panel(`${row([
    spec('成功', '<button type="button" class="btn btn-secondary" data-demo-toast="ok">导出</button>'),
    spec('带撤销动作', '<button type="button" class="btn btn-secondary" data-demo-toast="undo">删除设计</button>'),
  ].join(''))}
  <div class="kit-toasts"><div class="toast kit-static">${icon('circle-check')}<span>已导出 PNG</span></div><div class="toast kit-static">${icon('trash-2')}<span>已删除「彩虹挂件」</span><button type="button" class="btn btn-sm">撤销</button></div></div>`);
}

function badges() {
  return panel(row([
    spec('中性', '<span class="badge">草稿</span>'),
    spec('信息', '<span class="badge info">跟拼中</span>'),
    spec('成功', '<span class="badge success dot">正常</span>'),
    spec('警告', '<span class="badge warning dot">待审</span>'),
    spec('危险', '<span class="badge danger dot">已下架</span>'),
    spec('精选', `<span class="badge featured">${icon('star', 'fill')}精选</span>`),
    spec('官方', '<span class="badge official">官方</span>'),
    spec('图片上', `<div class="kit-onimage is-small"><img src="${patternImage(WORKS[4].pattern, 160)}" alt=""><span class="badge on-image">已公开</span></div>`),
  ].join('')));
}

function avatars() {
  const people = [AUTHORS.lu, AUTHORS.cheng, AUTHORS.xing, AUTHORS.abu, AUTHORS.tang];
  return panel(row([['xs', 'xs · 20'], ['sm', 'sm · 24'], ['', '默认 · 32'], ['lg', 'lg · 48'], ['xl', 'xl · 72']].map(([size, text], index) => spec(text, avatar(people[index], size))).join('')));
}

function empties() {
  return `<div class="kit-empties">
    ${panel('<div data-empty="designs"></div>', 'is-tight')}${panel('<div data-empty="search"></div>', 'is-tight')}
    ${panel('<div data-empty="likes"></div>', 'is-tight')}${panel('<div data-empty="comments"></div>', 'is-tight')}
  </div>${panel(`${label('紧凑版（卡片、表格内）')}<div data-empty="compact"></div>`)}`;
}

function paginations() {
  return panel(`<p class="kit-label hide-mobile">桌面 · 单行通栏</p><div class="kit-pager-wrap hide-mobile"><nav class="pagination kit-pager" aria-label="分页样张" data-demo-pager>
      <span>共 <b class="kit-strong t-num">128</b> 条</span>
      <span class="kit-inline">每页<button type="button" class="select kit-select-sm" aria-label="每页 20 条">20 条${icon('chevron-down', 's16')}</button></span>
      <div class="pages"><button type="button" class="page-btn" aria-label="上一页" disabled>${icon('chevron-left', 's16')}</button>${[1, 2, 3].map((n) => `<button type="button" class="page-btn" ${n === 1 ? 'aria-current="page"' : ''} data-page="${n}">${n}</button>`).join('')}<span class="kit-ellipsis" aria-hidden="true">…</span><button type="button" class="page-btn" data-page="7">7</button><button type="button" class="page-btn" aria-label="下一页">${icon('chevron-right', 's16')}</button></div>
      <label class="kit-inline">跳至<input class="input kit-jump" inputmode="numeric" aria-label="跳到第几页">页</label>
    </nav></div>
    ${label('窄屏 · 只保留上一页 / 第 n/m 页 / 下一页')}<nav class="pagination kit-pager-m" aria-label="窄屏分页样张"><button type="button" class="btn btn-outline" disabled>${icon('chevron-left', 's16')}上一页</button><span class="t-num">1 / 7</span><button type="button" class="btn btn-outline">下一页${icon('chevron-right', 's16')}</button></nav>`);
}

function progresses() {
  return panel(`<div class="kit-progress">${[[0, '未开始'], [32, '跟拼 32%'], [78, '原图空间 78%'], [100, '批次完成']].map(([value, text]) => `<div><span class="kit-progress-label"><span>${text}</span><span class="t-num">${value}%</span></span><div class="progress" role="progressbar" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100" aria-label="${text}"><i style="width:${value}%"></i></div></div>`).join('')}</div>`);
}

function controls() {
  return panel(`<div class="kit-grid-3">
    <div class="kit-stack">${label('开关')}
      <label class="kit-line"><span>显示网格</span><input type="checkbox" class="switch" checked></label>
      <label class="kit-line"><span>显示色号</span><input type="checkbox" class="switch"></label>
      <label class="kit-line kit-disabled"><span>板缝（需先开网格）</span><input type="checkbox" class="switch" disabled></label>
    </div>
    <div class="kit-stack">${label('复选')}
      <label class="checkbox"><input type="checkbox" checked>作者已声明原创</label>
      <label class="checkbox"><input type="checkbox">不含联系方式</label>
      <label class="checkbox kit-disabled"><input type="checkbox" disabled>已锁定的核对项</label>
    </div>
    <div class="kit-stack">${label('滑杆')}
      <label class="kit-line"><span>颜色数</span><output class="t-num kit-strong" data-range-out>12</output></label>
      <input type="range" class="range" min="2" max="40" value="12" data-range aria-label="颜色数">
      <span class="kit-note">旁边实时显示数值</span>
    </div>
  </div>`);
}

function tooltips() {
  return panel(row([
    spec('悬停（下方，默认）', `<button type="button" class="icon-btn filled" aria-label="放大" data-tip="放大">${icon('zoom-in')}</button>`),
    spec('右侧（侧栏图标）', `<button type="button" class="icon-btn filled" aria-label="作品管理" data-tip="作品管理" data-tip-side="right">${icon('grid-3x3')}</button>`),
    spec('上方（底部工具条）', `<button type="button" class="icon-btn filled" aria-label="适配屏幕" data-tip="适配屏幕" data-tip-side="top">${icon('scan')}</button>`),
    spec('样张', `<span class="kit-tip-demo"><button type="button" class="icon-btn filled" aria-label="撤销">${icon('undo-2')}</button><span class="kit-tip" role="tooltip">撤销 ⌘Z</span></span>`),
  ].join('')));
}

function designCard(design, { badgeHtml = '', meta }) {
  return `<article class="work-card kit-design">
    <div class="media"><img src="${patternImage(design.pattern, 320)}" alt="${esc(design.name)}">
      ${badgeHtml ? `<div class="badges">${badgeHtml}</div>` : ''}
      <button type="button" class="icon-btn on-image kit-design-more" aria-label="「${esc(design.name)}」的更多操作">${icon('ellipsis')}</button>
    </div>
    <div class="body"><h3 class="title ellipsis">${esc(design.name)}</h3><p class="meta"><span class="t-num">${meta}</span></p></div>
    <a class="stretched" href="#/editor/${design.id}" aria-label="打开「${esc(design.name)}」"></a>
  </article>`;
}
function cards() {
  const [d1, d2, d3] = [DESIGNS[0], DESIGNS[1], DESIGNS[3]];
  return panel(`<div class="kit-cards">
    ${workCard(WORKS[0], { size: 320 })}${workCard(WORKS[8], { size: 320 })}
    ${designCard(d2, { badgeHtml: `<span class="badge on-image">${icon('circle-dot')}跟拼 ${d2.progress}%</span>`, meta: `${d2.size}×${d2.size} · ${d2.colors} 色 · ${d2.updated}` })}
    ${designCard(d3, { badgeHtml: `<span class="badge on-image">${icon('cloud-off')}仅本机</span>`, meta: `${d3.size}×${d3.size} · ${d3.colors} 色 · ${d3.updated}` })}
  </div><p class="kit-note kit-cards-note">前两张是作品卡（发现页），后两张是设计卡（我的设计）：角标只在需要时出现，悬停出现「…」。${esc(d1.name)} 这类普通草稿不带角标。</p>`);
}

function beads() {
  const keys = ['K', 'W', 'S', 'R', 'P', 'O', 'Y', 'G', 'C', 'B', 'V', 'T'];
  const usage = WORKS[0].usage.slice(0, 5);
  return panel(`${label('色号色块')}<div class="kit-beads">${keys.map((key) => `<div class="kit-bead"><i style="--c:${BEADS[key].hex}" aria-hidden="true"></i><span><b class="t-mono">${BEADS[key].code}</b><small>${BEADS[key].name}</small></span><code class="t-mono">${BEADS[key].hex}</code></div>`).join('')}</div>
    ${label('色号清单行（详情页、编辑器）')}<ul class="kit-usage">${usage.map((color) => `<li><i style="--c:${color.hex}" aria-hidden="true"></i><b class="t-mono">${color.code}</b><span>${color.name}</span><span class="t-num">${color.count} 颗</span></li>`).join('')}</ul>
    ${label('作品卡上的用色小圆豆')}<div class="kit-row">${beadDots(WORKS[0].usage)}</div>`);
}

export default {
  shell: 'site',
  nav: null,
  tabbar: true,
  title: '组件总览',
  mobileTop() {
    return `<a class="icon-btn" href="#/" aria-label="返回发现">${icon('arrow-left')}</a><span class="title">组件总览</span><span class="kit-m-spacer" aria-hidden="true"></span>`;
  },
  render() {
    return `<div class="kit-chipbar" data-kit-chipbar><nav class="kit-chips" aria-label="组件目录">${SECTIONS.map(([id, text]) => `<button type="button" class="chip" data-kit-jump="${id}">${text}</button>`).join('')}</nav></div>
    <div class="container wide kit">
      <header class="kit-head"><h1 class="t-title-1">组件总览</h1><p class="t-body-sm t-muted">用户端与后台共用的一套组件；规格取自设计规格 §3，颜色、字号、圆角、阴影全部来自令牌。</p></header>
      <div class="kit-layout">
        <nav class="kit-toc" aria-label="组件目录"><ul>${SECTIONS.map(([id, text]) => `<li><button type="button" class="kit-toc-item" data-kit-jump="${id}">${text}</button></li>`).join('')}</ul></nav>
        <div class="kit-content">
          ${sec('tokens', '令牌', '组件只引用令牌；十六进制色值只出现在豆色数据里。字号只有 7 级，控件高度只有 32 / 40 / 48。', tokens())}
          ${sec('button', '按钮', '<b>每个视区只有一个主按钮</b>（主色实心）；danger 只用于确认弹窗的最终动作；禁用用 --bg-muted 底 + --ink-4 字，不用半透明；loading 时图标位换成旋转环，宽度不变。下方矩阵是规格样张，不代表真实页面。', buttons())}
          ${sec('icon-button', '图标按钮', '圆形 32 / 40 / 48；必须有 aria-label，桌面加 tooltip；选中态深墨底白图标。', iconButtons())}
          ${sec('input', '输入', '高 40（触屏 44）、圆角 12、白底 + --line-strong；错误态红边 + 字段下方写清原因和改法，不用表单顶部横幅；规则写在说明里，不写进占位符。', inputs())}
          ${sec('search', '搜索', '胶囊，高 48（桌面顶栏 44）；默认 --bg-muted 底，聚焦变白底 + 浮起阴影；左放大镜、右清除；桌面聚焦展开建议面板，手机进入全屏搜索页。', search())}
          ${sec('chip', '芯片', '胶囊高 32；默认 --bg-muted，选中深墨底白字；可带计数；可移除芯片带 ×。', chips())}
          ${sec('tabs', '页签', '页面级页签用「文字 + 2px 深墨下划线」；导航与页签不用分段控件。', tabs())}
          ${sec('seg', '分段', '<b>只用于同一视图的模式切换</b>（编辑 / 跟拼、网格 / 列表）；不用于导航和排序。', segs())}
          ${sec('menu', '菜单', '圆角 16、浮起阴影、项高 36；左图标、右勾选；危险项红字置底并用分隔线隔开；宽度按内容 200–360。', menus())}
          ${sec('popover', '弹出层', '锚定触发器；传入 sheetTitle 时手机自动变底部面板，桌面和手机是同一个组件。', popovers())}
          ${sec('dialog', '弹窗', '圆角 24，最大宽 480 / 640 / 880；标题 title-2 + 右上关闭；底部按钮右对齐（次在左、主在右）；<b>手机上自动变底部面板</b>。', dialogs())}
          ${sec('confirm', '危险确认', '标题直接写后果和对象；正文说明哪些无法恢复；最终按钮用 danger 并写明动作，不写「确定」。', confirmDemo())}
          ${sec('sheet', '抽屉', '后台列表点击行从右侧滑出详情（480px），不常驻空的右栏；Esc 或点遮罩关闭；手机为底部面板。', sheet())}
          ${sec('toast', '提示', '底部居中深墨胶囊：图标 + 一句话 + 可选动作，约 4 秒消失；动作与按钮用同一个动词（导出 → 已导出）。', toasts())}
          ${sec('badge', '徽标', '软底 + 同色字：中性 / 信息 / 成功 / 警告 / 危险；精选为黄底深墨字；图片上用白底。', badges())}
          ${sec('avatar', '头像', '圆形；没有头像时取首字，底色从豆粒色里按 ID 取。', avatars())}
          ${sec('empty', '空状态', '豆粒插画 + 标题 + 一句说明 + 最多一个主按钮；页面上已有同一主按钮时，空状态只放次按钮。', empties())}
          ${sec('skeleton', '骨架', '与真实卡片同尺寸的灰块，是唯一允许循环的动效。', panel(`<div class="kit-skeletons">${skeletonCards(4)}</div>`))}
          ${sec('pagination', '分页', '后台表格底部通栏单行：总数 · 每页条数 · 页码 · 跳页；窄屏只保留「上一页 / 第 n/m 页 / 下一页」。', paginations())}
          ${sec('progress', '进度条', '6px 深墨条，用于跟拼进度、原图空间、批次进度；旁边写出百分比。', progresses())}
          ${sec('controls', '开关与复选', '开关立即生效；复选用于多选和确认；滑杆用于连续参数，旁边实时显示数值。选中统一深墨。', controls())}
          ${sec('tooltip', '气泡提示', '悬停 300ms 后出现，深墨底白字；触屏不显示，必要的说明改成文字或放进帮助页。', tooltips())}
          ${sec('cards', '作品卡与设计卡', '图纸即卡片：正方形豆粒渲染、圆角 16、静置无阴影；右上点赞；标题单行省略；元信息「作者 · 尺寸 · 颜色 + 用色小圆豆」。', cards())}
          ${sec('beads', '色号色块', '色号与 HEX 用等宽字体；豆粒色块只出现在和色号有关的位置，颜色值只来自色板数据。', beads())}
        </div>
      </div>
    </div>`;
  },
  mount(root) {
    for (const slot of $$('[data-token]', root)) slot.textContent = getComputedStyle(document.documentElement).getPropertyValue(slot.dataset.token).trim().toUpperCase();
    const EMPTY = {
      designs: { kind: 'designs', title: '还没有设计', text: '上传一张图片，几秒生成可以照着拼的图纸。', actions: '<button type="button" class="btn btn-primary">上传图片</button><button type="button" class="btn btn-secondary">从空白开始</button>' },
      search: { kind: 'search', title: '没有找到“独角兽”相关的图纸', text: '换个关键词，或去掉一些筛选条件再试试。', actions: '<button type="button" class="btn btn-secondary">清除搜索和筛选</button>' },
      likes: { kind: 'likes', title: '还没有喜欢的作品', text: '在发现页点作品右上角的心，就会收在这里。', actions: '<a class="btn btn-secondary" href="#/">去发现看看</a>' },
      comments: { kind: 'comments', title: '还没有讨论', text: '拼好了？分享一下你的成品和心得。' },
      compact: { kind: 'empty', title: '暂时没有记录', text: '新的操作会出现在这里。', compact: true },
    };
    for (const slot of $$('[data-empty]', root)) slot.replaceWith(emptyState(EMPTY[slot.dataset.empty]));
    $$('.kit img[loading="lazy"]', root).forEach((img) => { img.loading = 'eager'; });

    const topOffset = () => (window.matchMedia('(max-width: 767px)').matches ? 56 + 52 + 12 : 64 + 24);
    const setCurrent = (id) => {
      $$('[data-kit-jump]', root).forEach((node) => {
        const on = node.dataset.kitJump === id;
        if (node.classList.contains('chip')) { node.classList.toggle('is-selected', on); node.setAttribute('aria-pressed', String(on)); } else if (on) node.setAttribute('aria-current', 'true'); else node.removeAttribute('aria-current');
      });
      const chip = $(`.kit-chips [data-kit-jump="${id}"]`, root);
      const bar = $('.kit-chips', root);
      if (chip && bar && bar.offsetParent) bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.offsetWidth / 2, behavior: 'smooth' });
    };
    let lock = 0;
    const onScroll = () => {
      if (Date.now() < lock) return;
      const offset = topOffset() + 40;
      let current = SECTIONS[0][0];
      for (const node of $$('[data-kit-sec]', root)) if (node.getBoundingClientRect().top - offset <= 0) current = node.dataset.kitSec;
      setCurrent(current);
    };
    setCurrent(SECTIONS[0][0]);
    window.addEventListener('scroll', onScroll, { passive: true });

    const sortOptions = [['rec', '推荐'], ['new', '最新发布'], ['likes', '最多喜欢']];
    let sort = 'rec';
    const onClick = (event) => {
      const t = event.target;
      const jump = t.closest('[data-kit-jump]');
      if (jump) {
        const target = $(`#kit-${jump.dataset.kitJump}`, root);
        lock = Date.now() + 700;
        setCurrent(jump.dataset.kitJump);
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - topOffset(), behavior: 'smooth' });
        return;
      }
      const loading = t.closest('[data-demo-loading]');
      if (loading) { loading.classList.add('is-loading'); loading.setAttribute('aria-busy', 'true'); setTimeout(() => { loading.classList.remove('is-loading'); loading.removeAttribute('aria-busy'); toast('已导出 PDF', { iconName: 'file-down' }); }, 1400); return; }
      const press = t.closest('[data-demo-press]');
      if (press) { press.setAttribute('aria-pressed', String(press.getAttribute('aria-pressed') !== 'true')); return; }
      const chip = t.closest('[data-demo-chip]');
      if (chip) { const on = !chip.classList.contains('is-selected'); chip.classList.toggle('is-selected', on); chip.setAttribute('aria-pressed', String(on)); return; }
      const remove = t.closest('[data-demo-remove]');
      if (remove) { const holder = remove.closest('.chip'); holder.remove(); toast(`已移除「${holder.textContent.trim()}」`, { action: { label: '撤销', onClick: () => toast('原型里撤销只做演示') } }); return; }
      const tab = t.closest('[data-demo-tabs] .tab');
      if (tab) { $$('.tab', tab.parentElement).forEach((node) => node.setAttribute('aria-selected', String(node === tab))); return; }
      const seg = t.closest('[data-demo-seg] .seg-item');
      if (seg) { $$('.seg-item', seg.parentElement).forEach((node) => node.setAttribute('aria-pressed', String(node === seg))); return; }
      const select = t.closest('[data-demo-select]');
      if (select) {
        const options = ['MARD 豆色绘经典 291 色', 'COCO 221 色', 'Perler 标准 90 色'];
        const current = $('#kit-sel-v', root).textContent;
        openPopover(select, `<div role="menu" aria-label="色板">${options.map((text) => `<button type="button" class="menu-item" role="menuitemradio" aria-checked="${text === current}" data-pick="${esc(text)}">${esc(text)}${text === current ? `<span class="check">${icon('check', 's18')}</span>` : ''}</button>`).join('')}</div>`, {
          align: 'start', sheetTitle: '色板',
          onMount(node, close) { node.addEventListener('click', (inner) => { const pick = inner.target.closest('[data-pick]'); if (!pick) return; $('#kit-sel-v', root).textContent = pick.dataset.pick; close(); }); },
        });
        return;
      }
      if (t.closest('[data-demo-suggest]')) {
        const anchor = $('[data-demo-search-anchor]', root);
        const node = openPopover(anchor, `<div class="stack">
          <a class="menu-item" href="#/search?q=猫咪">${icon('search')}<span>搜索「<b class="kit-strong">猫咪</b>」</span><span class="trail">回车</span></a>
          <div class="menu-sep"></div><div class="menu-label">图纸</div>
          ${WORKS.filter((work) => work.tags.includes('猫咪')).map((work) => `<a class="menu-item" href="#/works/${work.id}"><img class="kit-sugg-thumb" src="${patternImage(work.pattern, 64)}" alt=""><span class="grow ellipsis">${esc(work.title)}</span><span class="trail t-num">${work.pattern.width}×${work.pattern.height}</span></a>`).join('')}
          <div class="menu-sep"></div><div class="menu-label">作者</div>
          <a class="menu-item" href="#/u/cheng">${avatar(AUTHORS.cheng, 'sm')}<span>橙子手作</span></a>
        </div>`, { align: 'start', wide: true });
        if (node) node.style.width = `${Math.max(anchor.offsetWidth, 360)}px`;
        return;
      }
      const menu = t.closest('[data-demo-menu]');
      if (menu && menu.dataset.demoMenu === 'actions') {
        openPopover(menu, `<div role="menu" aria-label="更多操作"><button type="button" class="menu-item" role="menuitem" data-close-pop>${icon('folder-open')}打开</button><button type="button" class="menu-item" role="menuitem" data-close-pop>${icon('pencil')}重命名</button><button type="button" class="menu-item" role="menuitem" data-close-pop>${icon('copy')}复制为新设计</button><button type="button" class="menu-item" role="menuitem" data-close-pop>${icon('download')}导出…</button><div class="menu-sep"></div><button type="button" class="menu-item danger" role="menuitem" data-close-pop>${icon('trash-2')}删除…</button></div>`, {
          align: 'start', sheetTitle: '更多操作',
          onMount(node, close) { node.addEventListener('click', (inner) => { if (inner.target.closest('[data-close-pop]')) close(); }); },
        });
        return;
      }
      if (menu && menu.dataset.demoMenu === 'sort') {
        openPopover(menu, `<div role="menu" aria-label="排序">${sortOptions.map(([value, text]) => `<button type="button" class="menu-item" role="menuitemradio" aria-checked="${value === sort}" data-sort="${value}">${text}${value === sort ? `<span class="check">${icon('check', 's18')}</span>` : ''}</button>`).join('')}</div>`, {
          align: 'start', sheetTitle: '排序',
          onMount(node, close) { node.addEventListener('click', (inner) => { const pick = inner.target.closest('[data-sort]'); if (!pick) return; sort = pick.dataset.sort; $('[data-demo-sort-label]', root).textContent = sortOptions.find(([v]) => v === sort)[1]; close(); }); },
        });
        return;
      }
      const pop = t.closest('[data-demo-popover]');
      if (pop) {
        const group = (title, items) => `<section class="kit-filter-group"><h3>${title}</h3><div class="kit-row is-tight">${items.map((text, index) => `<button type="button" class="chip outline ${index === 1 ? 'is-selected' : ''}" aria-pressed="${index === 1}" data-demo-chip>${text}</button>`).join('')}</div></section>`;
        openPopover(pop, `<div class="kit-filter">${group('尺寸', ['小于 30 格', '30–40 格', '40 格以上'])}${group('颜色数', ['6 色以内', '7–10 色', '10 色以上'])}<footer class="kit-filter-foot"><button type="button" class="btn btn-ghost" data-close-pop>清除全部</button><button type="button" class="btn btn-primary" data-close-pop>显示 12 张图纸</button></footer></div>`, {
          align: 'start', wide: true, sheetTitle: '筛选',
          onMount(node, close) { node.addEventListener('click', (inner) => { const c = inner.target.closest('[data-demo-chip]'); if (c) { const on = !c.classList.contains('is-selected'); c.classList.toggle('is-selected', on); c.setAttribute('aria-pressed', String(on)); return; } if (inner.target.closest('[data-close-pop]')) close(); }); },
        });
        return;
      }
      const dialog = t.closest('[data-demo-dialog]');
      if (dialog) {
        const size = dialog.dataset.demoDialog;
        openDialog({
          title: size === 'lg' ? '新建图纸' : size === 'md' ? '分享图纸' : '重命名设计',
          size,
          body: `<div class="kit-dialog-body"><p class="t-body-sm kit-ink2">最大宽 ${size === 'lg' ? 880 : size === 'md' ? 640 : 480}px；手机上这是一个带拖动条的底部面板。</p><div class="field"><label for="kit-dd-in">名称</label><input class="input" id="kit-dd-in" value="橘猫团子 · 大号"></div></div>`,
          foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-close>保存</button>',
        });
        return;
      }
      if (t.closest('[data-demo-confirm]')) {
        openDialog({
          title: '删除「橘猫团子 · 大号」？',
          body: '<p class="t-body-sm kit-ink2">删除后无法恢复；已公开的作品会同时从发现页移除。</p>',
          foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-danger" data-confirm-delete>删除设计</button>',
          onMount(node, close) { $('[data-confirm-delete]', node).addEventListener('click', () => { close(); toast('已删除「橘猫团子 · 大号」', { iconName: 'trash-2', action: { label: '撤销', onClick: () => toast('已恢复「橘猫团子 · 大号」') } }); }); },
        });
        return;
      }
      if (t.closest('[data-demo-sheet]')) {
        const work = WORKS[0];
        openDialog({
          title: work.title,
          size: 'adm-drawer',
          body: `<div class="adm-dw-stage" tabindex="-1" autofocus><img src="${patternImage(work.pattern, 320)}" alt="${esc(work.title)}"></div><p class="t-body-sm kit-ink2">详情抽屉复用弹窗的遮罩、Esc 与焦点圈定，只是换成右侧版式。</p>`,
          foot: '<button type="button" class="btn btn-secondary" data-close>关闭</button>',
        });
        return;
      }
      const toastBtn = t.closest('[data-demo-toast]');
      if (toastBtn) {
        if (toastBtn.dataset.demoToast === 'ok') toast('已导出 PNG', { iconName: 'circle-check' });
        else toast('已删除「彩虹挂件」', { iconName: 'trash-2', action: { label: '撤销', onClick: () => toast('已恢复「彩虹挂件」') } });
        return;
      }
      const page = t.closest('[data-demo-pager] [data-page]');
      if (page) { $$('[data-page]', page.parentElement).forEach((node) => { if (node === page) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current'); }); }
    };
    const onInput = (event) => { if (event.target.matches('[data-range]')) $('[data-range-out]', root).textContent = event.target.value; };
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    return () => { window.removeEventListener('scroll', onScroll); root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); };
  },
};
