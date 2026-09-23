// 我的：设计 / 公开作品 / 喜欢 / 色板 / 账号设置；#/u/:id 作者公开主页也由本模块渲染。
// 演示参数：?empty=1 新账号空状态、?storage=full 原图空间将满；设计页签另支持 q / status / sort / view。
import { icon } from '../icons.js';
import { $, $$, esc, avatar, formatCount, workCard, emptyState, openDialog, openPopover, closePopover, toast, isMobile, isLiked } from '../ui.js';
import { ME, DESIGNS, WORKS, AUTHORS, worksBy } from '../data.js';
import { patternImage } from '../beads.js';
import { BEADS } from '../../motifs.js';

const TABS = [['designs', '设计'], ['public', '公开作品'], ['likes', '喜欢'], ['palettes', '色板']];
const STATUSES = [['all', '全部'], ['draft', '草稿'], ['stitching', '跟拼中'], ['published', '已公开']];
const SORTS = [['recent', '最近编辑'], ['name', '名称'], ['size', '尺寸']];
const TITLES = { designs: '我的设计', public: '我的公开作品', likes: '我喜欢的图纸', palettes: '色板', settings: '账号设置' };
const NO_MATCH = { draft: '还没有草稿', stitching: '没有跟拼中的设计', published: '还没有公开的设计' };
const AVATAR_KEYS = ['R', 'O', 'G', 'E', 'B', 'V', 'M', 'K'];
const FULL_MB = 1800;

// ---------- 色板：程序化生成，MARD 色号与 motifs.js 的豆色保持一致 ----------
const FAMILIES = [
  { key: 'A', label: '黄橙', n: 26, h: [56, 18], s: [96, 88], l: [88, 50], names: '奶油黄 浅鹅黄 柠檬黄 杏橙 明黄 向日葵黄 橘橙 蜜橘 芒果黄 蛋黄 金盏黄 南瓜橙 琥珀 姜黄 香槟 稻草黄 焦橙 落日橙 鹅黄 玉米黄 橘黄 柿子橙 蜂蜜 麦芽 橙红 金橙' },
  { key: 'B', label: '绿', n: 32, h: [84, 158], s: [62, 50], l: [84, 22], names: '浅嫩绿 青柠 苹果绿 嫩芽绿 抹茶 草绿 豆绿 叶绿 竹青 橄榄绿 森林绿 墨绿 湖绿 牛油果 松绿 翡翠 苔绿 海藻绿 浅葱 碧绿 荧光绿 芦苇绿 灰绿 军绿 深松绿 黛绿 玉绿 青苹 柳绿 水绿 葱绿 蕨绿' },
  { key: 'C', label: '蓝', n: 29, h: [168, 232], s: [70, 62], l: [88, 26], names: '冰蓝 婴儿蓝 薄荷 水蓝 浅天蓝 天蓝 湖蓝 蔚蓝 晴空蓝 海蓝 宝蓝 钴蓝 藏青 靛蓝 雾蓝 牛仔蓝 孔雀蓝 青蓝 深海蓝 矢车菊蓝 石青 群青 普蓝 灰蓝 薄荷蓝 蒂芙尼蓝 电光蓝 午夜蓝 月光蓝' },
  { key: 'D', label: '紫', n: 26, h: [258, 292], s: [55, 45], l: [86, 28], names: '淡藕 薰衣草 丁香紫 香芋紫 紫罗兰 葡萄紫 藕荷 雪青 茄紫 深紫 梅紫 浅紫 粉紫 灰紫 蓝紫 酱紫 罗兰紫 鸢尾紫 桔梗紫 暮紫 星空紫 紫藤 乌梅 木槿紫 紫水晶 烟紫' },
  { key: 'E', label: '粉', n: 24, h: [350, 318], s: [85, 70], l: [90, 52], names: '浅粉 桃粉 玫瑰粉 珊瑚粉 蜜桃 芭比粉 藕粉 裸粉 水红 胭脂 豆沙粉 烟粉 荧光粉 草莓粉 蔷薇粉 海棠粉 荔枝粉 奶粉 贝壳粉 粉橘 杏粉 粉紫红 玫红 樱花粉' },
  { key: 'F', label: '红', n: 25, h: [352, 372], s: [80, 72], l: [82, 30], names: '浅樱粉 樱粉 大红 中国红 番茄红 朱红 酒红 莓果红 砖红 西瓜红 樱桃红 枣红 绛红 铁锈红 珊瑚红 石榴红 玫瑰红 胭脂红 辣椒红 火红 暗红 柿红 橘红 勃艮第 枫叶红' },
  { key: 'G', label: '棕', n: 21, h: [30, 18], s: [55, 45], l: [84, 22], names: '浅肤 奶茶 肤色 小麦色 驼色 焦糖 卡其 沙色 米色 燕麦 可可棕 咖啡 巧克力 栗棕 榛果 肉桂 赭石 土棕 深咖 红棕 棕褐' },
  { key: 'H', label: '黑白灰', n: 23, names: '奶白 纯白 浅雾灰 银灰 石板灰 珍珠灰 可可黑 水泥灰 烟灰 深灰 炭灰 铁灰 暖灰 冷灰 鼠灰 灰褐 乌木 墨黑 夜黑 象牙白 米白 雪白 透白',
    tones: [[40, 30, 97], [0, 0, 100], [230, 6, 86], [220, 5, 76], [225, 6, 58], [40, 10, 90], [340, 12, 20], [30, 4, 66], [220, 4, 50], [220, 5, 36], [220, 6, 26], [210, 6, 40], [30, 8, 62], [210, 8, 62], [20, 4, 46], [25, 10, 42], [30, 10, 14], [0, 0, 8], [240, 10, 10], [45, 40, 94], [40, 30, 92], [210, 20, 98], [200, 10, 94]] },
  { key: 'M', label: '莫兰迪', n: 15, names: '雾霾蓝 灰豆绿 奶咖 灰粉 燕麦灰 鼠尾草 脏橘 藕灰 雾紫 灰杏 枯玫瑰 苔灰 砂岩 陶土 烟青',
    tones: [[210, 22, 66], [110, 16, 62], [30, 24, 70], [350, 22, 74], [40, 14, 78], [120, 14, 56], [20, 40, 62], [330, 12, 70], [270, 16, 68], [25, 34, 76], [355, 26, 58], [80, 12, 54], [30, 20, 64], [15, 34, 52], [190, 18, 50]] },
];
const SPECIALS = [
  { key: 'P', label: '珠光', names: '珠光白 珠光米 珠光粉 珠光桃 珠光橙 珠光金 珠光黄 珠光柠绿 珠光薄荷 珠光天蓝 珠光湖蓝 珠光宝蓝 珠光薰衣草 珠光紫 珠光玫红 珠光红 珠光咖啡 珠光银 珠光灰 珠光黑 珠光香槟 珠光青 珠光古铜',
    tones: [[0, 0, 96], [40, 40, 90], [345, 70, 86], [15, 80, 82], [28, 85, 68], [45, 70, 58], [52, 90, 72], [78, 60, 68], [160, 45, 78], [200, 70, 82], [190, 60, 58], [222, 65, 48], [260, 50, 84], [275, 45, 58], [330, 65, 60], [355, 70, 50], [25, 45, 36], [220, 6, 78], [220, 5, 55], [240, 8, 16], [42, 55, 82], [182, 45, 52], [28, 48, 40]] },
  { key: 'R', label: '透明', names: '透明白 透明浅黄 透明黄 透明橙 透明红 透明粉 透明玫红 透明紫 透明浅紫 透明蓝 透明浅蓝 透明湖蓝 透明青 透明绿 透明浅绿 透明草绿 透明茶 透明棕 透明灰 透明黑 透明金 透明琥珀 透明樱桃 透明薄荷 透明海蓝 透明葡萄 透明柠檬 透明蜜桃',
    tones: [[0, 0, 94], [52, 80, 84], [50, 90, 66], [30, 90, 64], [0, 80, 58], [345, 80, 82], [330, 75, 60], [275, 50, 58], [270, 50, 82], [220, 70, 56], [205, 70, 82], [190, 65, 58], [180, 55, 56], [140, 55, 46], [120, 50, 80], [95, 60, 58], [30, 45, 52], [22, 50, 36], [220, 5, 62], [240, 8, 18], [45, 75, 56], [35, 85, 48], [350, 75, 42], [160, 50, 78], [210, 70, 40], [280, 45, 40], [58, 90, 70], [20, 85, 80]] },
  { key: 'Q', label: '夜光', names: '夜光绿 夜光蓝 夜光黄 夜光橙 夜光粉', tones: [[95, 70, 78], [190, 70, 80], [58, 85, 80], [30, 90, 78], [340, 80, 86]] },
  { key: 'T', label: '温变', names: '温变紫粉 温变蓝白 温变黑红 温变绿黄 温变橙黄 温变粉白', tones: [[290, 45, 62], [210, 60, 70], [350, 40, 28], [90, 50, 58], [35, 85, 62], [340, 60, 84]] },
  { key: 'Z', label: '闪粉', names: '闪粉金 闪粉银 闪粉粉 闪粉蓝 闪粉紫 闪粉红 闪粉绿 闪粉彩', tones: [[45, 70, 55], [220, 6, 74], [340, 70, 76], [210, 70, 60], [275, 50, 62], [355, 70, 50], [140, 50, 48], [300, 40, 70]] },
];
const CODE = {
  mard: (key, index) => `${key}${index}`,
  coco: (key, index) => `${key}${String(index).padStart(2, '0')}`,
  manman: (key, index, order) => `M${String(order).padStart(3, '0')}`,
  panpan: (key, index, order) => `P${order}`,
  mixiaowo: (key, index) => `${key}-${index}`,
  artkal: (key, index, order) => `C${String(order).padStart(2, '0')}`,
};
const BUILTIN = [
  { id: 'mard-291', name: 'MARD 豆色绘经典', count: 291, specs: ['5mm', '2.6mm'], brand: 'mard', seed: 0, note: '新建设计默认使用' },
  { id: 'mard-221', name: 'MARD 221 核对版', count: 221, specs: ['5mm'], brand: 'mard', seed: 0, note: '按实物色卡逐色核对' },
  { id: 'coco-291', name: 'COCO', count: 291, specs: ['5mm'], brand: 'coco', seed: 1 },
  { id: 'manman-278', name: '漫漫', count: 278, specs: ['5mm', '2.6mm'], brand: 'manman', seed: 2 },
  { id: 'panpan-289', name: '盼盼', count: 289, specs: ['5mm'], brand: 'panpan', seed: 3 },
  { id: 'mixiaowo-290', name: '咪小窝', count: 290, specs: ['5mm', '2.6mm'], brand: 'mixiaowo', seed: 4 },
  { id: 'artkal-c-197', name: 'Artkal C', count: 197, specs: ['2.6mm'], brand: 'artkal', seed: 5 },
];
const BEAD_BY_CODE = Object.fromEntries(Object.values(BEADS).map((bead) => [bead.code, bead]));
FAMILIES.concat(SPECIALS).forEach((family) => { family.names = family.names.split(' '); });

function hsl(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => {
    const k = (n + hue / 30) % 12;
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
function tone(family, index, seed) {
  const jitter = seed ? ((seed * 37 + index * 13) % 9) - 4 : 0;
  if (family.tones) {
    const [h, s, l] = family.tones[index];
    return hsl(h + jitter, s, l + jitter / 2);
  }
  const t = index / (family.n - 1);
  const wave = [0, 1, -1][index % 3];
  const lerp = ([a, b]) => a + (b - a) * t;
  return hsl(lerp(family.h) + wave * 4 + jitter, lerp(family.s) - (index % 5 === 4 ? 16 : 0), lerp(family.l) + wave * 3 + jitter / 2);
}
const colorCache = new Map();
function paletteColors(palette) {
  if (colorCache.has(palette.id)) return colorCache.get(palette.id);
  const baseTotal = FAMILIES.reduce((sum, family) => sum + family.n, 0);
  const baseCount = Math.min(palette.count, baseTotal);
  const counts = FAMILIES.map((family) => Math.round((family.n * baseCount) / baseTotal));
  counts[counts.length - 1] += baseCount - counts.reduce((a, b) => a + b, 0);
  const colors = [];
  FAMILIES.forEach((family, fi) => {
    const n = counts[fi];
    for (let i = 0; i < n; i += 1) {
      const source = n === family.n ? i : Math.round((i * (family.n - 1)) / Math.max(1, n - 1));
      colors.push({ family: family.label, key: family.key, index: i + 1, name: family.names[source], hex: tone(family, source, palette.seed) });
    }
  });
  let rest = palette.count - baseCount;
  for (const special of SPECIALS) {
    if (rest <= 0) break;
    const take = Math.min(rest, special.tones.length);
    for (let i = 0; i < take; i += 1) colors.push({ family: special.label, key: special.key, index: i + 1, name: special.names[i], hex: tone(special, i, palette.seed) });
    rest -= take;
  }
  colors.forEach((color, order) => { color.code = CODE[palette.brand](color.key, color.index, order + 1); });
  if (palette.brand === 'mard') {
    for (const color of colors) {
      const bead = BEAD_BY_CODE[color.code];
      if (bead) Object.assign(color, { hex: bead.hex.toUpperCase(), name: bead.name });
    }
  }
  colorCache.set(palette.id, colors);
  return colors;
}
const isLight = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 168;
};

// ---------- 页面状态（原型内存，换页保留） ----------
const store = {
  designs: DESIGNS.map((design, index) => ({ ...design, rank: index })),
  guestDesigns: null,
  withdrawn: new Set(),
  submissions: [
    { id: 'sub-panda', designId: 'd-panda', state: 'review', note: '2 小时前提交 · 通常 1 天内审完' },
    { id: 'sub-cat', designId: 'd-cat', state: 'rejected', note: '昨天审核', reason: '与社区作品「橘猫团子」几乎相同。如果是改编，请在描述里注明原作后重新提交。' },
  ],
  customPalettes: null,
  defaultPalette: 'mard-291',
  devices: [
    { name: 'MacBook Air · Chrome', place: '上海', when: '在线', current: true },
    { name: 'iPhone · Safari', place: '上海', when: '2 天前' },
    { name: 'iPad · Safari', place: '杭州', when: '上周' },
  ],
  originals: [
    { designId: 'd-rainbow', mb: 168, versions: 9 },
    { designId: 'd-cat', mb: 142, versions: 6 },
    { designId: 'd-panda', mb: 128, versions: 5 },
    { designId: 'd-sakura', mb: 96, versions: 4 },
    { designId: 'd-icecream', mb: 86, versions: 3 },
  ],
};
let ui = null;
let page = null;
let rankSeed = 0;
let copySeq = 0;

const isAuthorPath = (ctx) => ctx.path.startsWith('/u/');
function tabOf(ctx) {
  const tab = ctx.params[0];
  return tab === 'settings' || TABS.some(([id]) => id === tab) ? tab : 'designs';
}
function readUi(ctx) {
  const pick = (value, list, fallback) => (list.some(([id]) => id === value) ? value : fallback);
  return {
    q: ctx.query.get('q') ?? '',
    status: pick(ctx.query.get('status'), STATUSES, 'all'),
    sort: pick(ctx.query.get('sort'), SORTS, 'recent'),
    view: ctx.query.get('view') === 'list' ? 'list' : 'grid',
    empty: ctx.query.get('empty') === '1',
    storageFull: ctx.query.get('storage') === 'full',
    section: ctx.query.get('section') ?? '',
    guest: !ctx.session.loggedIn,
  };
}

// 空状态插画是 canvas，先输出占位，挂载后替换。
const emptySpecs = new Map();
let emptySeq = 0;
function emptySlot(spec) {
  emptySeq += 1;
  emptySpecs.set(String(emptySeq), spec);
  return `<div data-empty-slot="${emptySeq}"></div>`;
}
function hydrate(scope) {
  for (const slot of $$('[data-empty-slot]', scope)) {
    const spec = emptySpecs.get(slot.dataset.emptySlot);
    emptySpecs.delete(slot.dataset.emptySlot);
    if (spec) slot.replaceWith(emptyState(spec));
  }
}

const menuHtml = (label, items) => `<div role="menu" aria-label="${esc(label)}">${items.map((item) => (item === '-'
  ? '<div class="menu-sep" role="separator"></div>'
  : `<button type="button" class="menu-item ${item[3] ?? ''}" role="menuitem" data-act="${item[0]}">${icon(item[1])}${item[2]}</button>`)).join('')}</div>`;

function menuKeys(node) {
  node.addEventListener('keydown', (event) => {
    const items = $$('[role^="menuitem"]', node);
    const index = items.indexOf(document.activeElement);
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step) { event.preventDefault(); items[(index + step + items.length) % items.length]?.focus(); }
    if (event.key === 'Home') { event.preventDefault(); items[0]?.focus(); }
    if (event.key === 'End') { event.preventDefault(); items.at(-1)?.focus(); }
  });
}
const bindMenu = (event, run) => (node, close) => {
  menuKeys(node);
  if (event?.detail === 0) requestAnimationFrame(() => $('[role^="menuitem"]', node)?.focus());
  node.addEventListener('click', (inner) => {
    const item = inner.target.closest('[data-act]');
    if (!item) return;
    close();
    run(item.dataset.act);
  });
};
const refocus = (selector) => setTimeout(() => $(selector, page?.root)?.focus(), 0);

function confirmDialog({ title, text, confirm, danger = false, onConfirm, onCancel }) {
  let confirmed = false;
  openDialog({
    title,
    body: `<p class="confirm-text">${esc(text)}</p>`,
    foot: `<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${esc(confirm)}</button>`,
    onMount(dialog, close) {
      $('[data-confirm]', dialog).addEventListener('click', () => { confirmed = true; close(); onConfirm(); });
    },
    onClose() { if (!confirmed) onCancel?.(); },
  });
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); } catch { /* 原型：剪贴板不可用时仍提示 */ }
}

// ---------- 头部与页签 ----------
const publishedWorks = () => (ui.empty ? [] : worksBy(ME.id).filter((work) => !store.withdrawn.has(work.id)));
function guestDesigns() {
  if (!store.guestDesigns) {
    const example = (id, name, rank) => ({ ...DESIGNS.find((design) => design.id === id), name, status: 'draft', progress: 0, cloud: 'local', updated: '', example: true, rank });
    store.guestDesigns = [...store.designs.filter((design) => design.cloud === 'local'), example('d-cat', '示例：橘猫团子', 50), example('d-sakura', '示例：草莓小甜心', 51)];
  }
  return store.guestDesigns;
}
const editableDesigns = () => (ui.guest ? guestDesigns() : store.designs);
const baseDesigns = () => (ui.empty ? [] : editableDesigns());
function stats() {
  const works = publishedWorks();
  return { designs: baseDesigns().length, published: works.length, likes: works.reduce((sum, work) => sum + work.likes, 0) };
}
function updateStats() {
  const values = stats();
  const set = (key, value) => $$(`[data-stat="${key}"]`, page.root).forEach((node) => { node.textContent = value; });
  set('designs', values.designs);
  set('published', values.published);
  set('likes', formatCount(values.likes));
}

function profileHead({ person, badge = '', bio = '', stats: items, actions = '', guest = false }) {
  const face = guest ? `<span class="avatar xl guest-avatar" aria-hidden="true">${icon('user')}</span>` : avatar(person, 'xl');
  return `<header class="profile-head">
    ${face}
    <div class="profile-info">
      <div class="profile-name"><h1 class="t-title-1 ellipsis">${esc(person.name)}</h1>${badge}</div>
      ${bio ? `<p class="profile-bio">${esc(bio)}</p>` : ''}
      <p class="profile-stats">${items.map(([label, value, key]) => (value === null ? `<span>${label}</span>` : `<span>${label} <b class="t-num" ${key ? `data-stat="${key}"` : ''}>${value}</b></span>`)).join('<span class="dot" aria-hidden="true">·</span>')}</p>
    </div>
    ${actions ? `<div class="profile-actions">${actions}</div>` : ''}
  </header>`;
}
function meHead() {
  if (ui.guest) return profileHead({ person: { name: '我的' }, guest: true, stats: [['未登录', null], ['设计只保存在这台设备上', null]] });
  const values = stats();
  return profileHead({
    person: ME,
    stats: [['设计', values.designs, 'designs'], ['公开', values.published, 'published'], ['获赞', formatCount(values.likes), 'likes']],
    actions: `<a class="btn btn-ghost" href="#/u/${ME.id}">公开主页</a><a class="btn btn-secondary" href="#/me/settings">${icon('settings')}账号设置</a>`,
  });
}
function tabsHtml(tab) {
  return `<nav class="tabs me-tabs" aria-label="我的内容">${TABS.map(([id, label]) => `<a class="tab" href="#/me/${id}" ${id === tab ? 'aria-current="page"' : ''}>${label}${id === 'designs' ? `<span class="count" data-stat="designs">${baseDesigns().length}</span>` : ''}</a>`).join('')}</nav>`;
}

// ---------- 设计页签 ----------
function filterDesigns(base) {
  const q = ui.q.trim().toLowerCase();
  const matched = q ? base.filter((design) => design.name.toLowerCase().includes(q)) : base;
  const shown = ui.status === 'all' ? matched : matched.filter((design) => design.status === ui.status);
  const order = {
    recent: (a, b) => a.rank - b.rank,
    name: (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'),
    size: (a, b) => a.size - b.size || a.rank - b.rank,
  }[ui.sort];
  return { matched, shown: [...shown].sort(order) };
}
function statusText(design) {
  const parts = [];
  if (design.example) parts.push('示例');
  else if (design.status === 'draft') parts.push('草稿');
  if (design.status === 'stitching') parts.push(`跟拼中，已完成 ${design.progress}%`);
  if (design.status === 'published') parts.push('已公开');
  if (design.cloud === 'local' && !ui.guest) parts.push('仅本机');
  return parts.join('，');
}
function ring(progress) {
  const c = 2 * Math.PI * 6;
  return `<svg class="ring" viewBox="0 0 16 16" aria-hidden="true"><circle class="ring-track" cx="8" cy="8" r="6"/><circle class="ring-bar" cx="8" cy="8" r="6" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - progress / 100)).toFixed(2)}"/></svg>`;
}
const localBadge = (cls = 'on-image') => `<span class="badge ${cls}">${icon('cloud-off')}仅本机</span>`;
function cardBadges(design) {
  const list = [];
  if (design.example) list.push('<span class="badge on-image">示例</span>');
  if (design.status === 'stitching') list.push(`<span class="badge on-image ring-badge">${ring(design.progress)}<span class="t-num">${design.progress}%</span></span>`);
  if (design.status === 'published') list.push(`<span class="badge success">${icon('check')}已公开</span>`);
  if (design.cloud === 'local' && !ui.guest) list.push(localBadge());
  return list.join('');
}
const moreButton = (attr, id, name, cls = '', extra = '') => `<button type="button" class="icon-btn ${cls} more" ${attr}="${esc(id)}" ${extra} aria-haspopup="menu" aria-expanded="false" aria-label="「${esc(name)}」的更多操作" data-tip="更多操作">${icon('ellipsis')}</button>`;

function designCard(design) {
  const badges = cardBadges(design);
  const state = statusText(design);
  return `<article class="work-card design-card">
    <div class="media">
      <img src="${patternImage(design.pattern, 320)}" alt="" decoding="async">
      ${badges ? `<div class="badges" aria-hidden="true">${badges}</div>` : ''}
    </div>
    <div class="body">
      <h3 class="title ellipsis">${esc(design.name)}</h3>
      <p class="meta"><span class="t-num">${design.size}×${design.size}</span><span class="sep"></span><span class="t-num">${design.colors} 色</span>${design.updated ? `<span class="sep"></span><span class="ellipsis">${esc(design.updated)}</span>` : ''}</p>
    </div>
    <a class="stretched" href="#/editor/${design.id}" aria-label="打开「${esc(design.name)}」${state ? `（${state}）` : ''}"></a>
    ${moreButton('data-more', design.id, design.name, 'on-image', 'data-card-menu')}
  </article>`;
}
function statusCell(design) {
  const main = design.status === 'stitching'
    ? `<span class="ring-cell">${ring(design.progress)}跟拼中 <span class="t-num">${design.progress}%</span></span>`
    : design.status === 'published' ? `<span class="badge success">${icon('check')}已公开</span>` : `<span class="t-muted">${design.example ? '示例' : '草稿'}</span>`;
  return `<div class="status-cell">${main}${design.cloud === 'local' && !ui.guest ? localBadge('') : ''}</div>`;
}
function designTable(list) {
  return `<div class="surface me-table"><table class="table">
    <colgroup><col><col class="c-size"><col class="c-colors"><col class="c-status"><col class="c-time"><col class="c-act"></colgroup>
    <thead><tr><th scope="col">名称</th><th scope="col">尺寸</th><th scope="col">颜色</th><th scope="col">状态</th><th scope="col">更新时间</th><th scope="col"><span class="sr-only">操作</span></th></tr></thead>
    <tbody>${list.map((design) => `<tr data-row="${design.id}">
      <td><div class="row-name"><img class="row-thumb" src="${patternImage(design.pattern, 48)}" alt=""><a class="ellipsis" href="#/editor/${design.id}">${esc(design.name)}</a></div></td>
      <td class="t-num">${design.size}×${design.size}</td>
      <td class="t-num">${design.colors} 色</td>
      <td>${statusCell(design)}</td>
      <td>${esc(design.updated || '—')}</td>
      <td class="cell-act">${moreButton('data-more', design.id, design.name, 'sm')}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}
function resultsHtml(base) {
  if (!base.length) {
    return emptySlot({
      kind: 'designs',
      title: '还没有设计',
      text: '上传一张图片，几秒就能得到第一张图纸。',
      actions: `<a class="btn btn-primary" href="#/create">${icon('upload')}上传图片</a><a class="btn btn-secondary" href="#/create?blank=1">从空白开始</a>`,
    });
  }
  const { shown } = filterDesigns(base);
  if (!shown.length) {
    const q = ui.q.trim();
    const label = STATUSES.find(([id]) => id === ui.status)[1];
    if (q) {
      return emptySlot({
        kind: 'search',
        compact: true,
        title: `没有名为「${q}」的设计`,
        text: ui.status === 'all' ? '' : `当前只看「${label}」的设计。`,
        actions: `<button type="button" class="btn btn-secondary" data-clear-q>清除搜索</button>${ui.status === 'all' ? '' : '<button type="button" class="btn btn-ghost" data-show-all>查看全部状态</button>'}`,
      });
    }
    return emptySlot({ kind: 'designs', compact: true, title: NO_MATCH[ui.status], text: '', actions: '<button type="button" class="btn btn-secondary" data-show-all>查看全部设计</button>' });
  }
  return ui.view === 'list' && !isMobile() ? designTable(shown) : `<div class="work-grid">${shown.map(designCard).join('')}</div>`;
}
function toolbarHtml(base) {
  const { matched } = filterDesigns(base);
  const count = (id) => (id === 'all' ? matched.length : matched.filter((design) => design.status === id).length);
  const statuses = ui.guest ? STATUSES.filter(([id]) => id !== 'published') : STATUSES;
  const sortLabel = SORTS.find(([id]) => id === ui.sort)[1];
  const searching = Boolean(ui.q);
  return `<div class="me-toolbar ${searching ? 'is-searching' : ''}" data-toolbar ${base.length ? '' : 'hidden'}>
    <form class="search me-search ${searching ? 'has-value' : ''}" role="search" data-design-search>
      ${icon('search', 's16')}
      <input type="search" name="q" value="${esc(ui.q)}" placeholder="搜索设计名称" aria-label="搜索设计名称" autocomplete="off" enterkeyhint="search">
      <button type="button" class="icon-btn clear" data-clear-q aria-label="清除搜索">${icon('x', 's16')}</button>
    </form>
    <div class="me-chips" role="group" aria-label="按状态筛选">${statuses.map(([id, label]) => `<button type="button" class="chip" data-status="${id}" aria-pressed="${ui.status === id}">${label}<span class="count">${count(id)}</span></button>`).join('')}</div>
    <div class="me-tools">
      <button type="button" class="icon-btn sm m-only" data-toggle-search aria-expanded="${searching}" aria-label="搜索设计">${icon('search')}</button>
      <button type="button" class="icon-btn sm m-only" data-sort-menu aria-haspopup="menu" aria-label="排序：${sortLabel}">${icon('arrow-up-down')}</button>
      <button type="button" class="btn btn-sm btn-outline d-only" data-sort-menu aria-haspopup="menu">${icon('arrow-up-down')}<span data-sort-label>${sortLabel}</span></button>
      <div class="seg icons me-seg d-only" role="group" aria-label="显示方式">
        <button type="button" class="seg-item" data-view="grid" aria-pressed="${ui.view === 'grid'}" aria-label="网格视图" data-tip="网格视图">${icon('layout-grid')}</button>
        <button type="button" class="seg-item" data-view="list" aria-pressed="${ui.view === 'list'}" aria-label="列表视图" data-tip="列表视图">${icon('list')}</button>
      </div>
      <a class="btn btn-sm btn-primary d-only" href="#/create">${icon('plus')}新建</a>
    </div>
  </div>`;
}
function renderDesigns() {
  const base = baseDesigns();
  const pct = Math.round((FULL_MB / 1000 / ME.storageTotal) * 100);
  return `<section class="me-designs" data-designs aria-label="我的设计">
    ${ui.storageFull && !ui.guest ? `<div class="me-banner warning" role="status">${icon('triangle-alert')}<p><b>原图空间快满了</b>已用 <span class="t-num">${pct}%</span>（${FULL_MB / 1000} / ${ME.storageTotal} GB），用满后新上传的原图只保存在这台设备上。</p><a class="t-link" href="#/me/settings?storage=full&section=storage">管理空间</a></div>` : ''}
    ${ui.guest ? `<div class="me-banner">${icon('cloud-off')}<p>登录后同步到云端，换设备也能继续</p><button type="button" class="btn btn-sm btn-secondary" data-login>登录</button></div>` : ''}
    ${toolbarHtml(base)}
    <div data-results>${resultsHtml(base)}</div>
  </section>`;
}
function syncUrl() {
  const params = new URLSearchParams();
  if (ui.q) params.set('q', ui.q);
  if (ui.status !== 'all') params.set('status', ui.status);
  if (ui.sort !== 'recent') params.set('sort', ui.sort);
  if (ui.view !== 'grid') params.set('view', ui.view);
  if (ui.empty) params.set('empty', '1');
  if (ui.storageFull) params.set('storage', 'full');
  const path = location.hash.replace(/^#/, '').split('?')[0];
  const next = `#${path}${params.toString() ? `?${params}` : ''}`;
  if (next !== location.hash) history.replaceState(history.state, '', next);
}
function refreshDesigns() {
  const section = $('[data-designs]', page.root);
  if (!section) return;
  const base = baseDesigns();
  const { matched } = filterDesigns(base);
  const toolbar = $('[data-toolbar]', section);
  toolbar.hidden = !base.length;
  for (const chip of $$('[data-status]', section)) {
    const id = chip.dataset.status;
    $('.count', chip).textContent = id === 'all' ? matched.length : matched.filter((design) => design.status === id).length;
    chip.setAttribute('aria-pressed', String(id === ui.status));
  }
  const sortLabel = SORTS.find(([id]) => id === ui.sort)[1];
  $$('[data-sort-label]', section).forEach((node) => { node.textContent = sortLabel; });
  $$('.m-only[data-sort-menu]', section).forEach((node) => node.setAttribute('aria-label', `排序：${sortLabel}`));
  $$('[data-view]', section).forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.view === ui.view)));
  const results = $('[data-results]', section);
  results.innerHTML = resultsHtml(base);
  hydrate(results);
  updateStats();
  syncUrl();
}
function clearQuery() {
  const form = $('[data-design-search]', page.root);
  const input = $('input', form);
  ui.q = '';
  input.value = '';
  form.classList.remove('has-value');
  refreshDesigns();
  input.focus();
}
function toggleMobileSearch(button) {
  const toolbar = $('[data-toolbar]', page.root);
  const form = $('[data-design-search]', toolbar);
  const input = $('input', form);
  const open = !toolbar.classList.contains('is-searching');
  toolbar.classList.toggle('is-searching', open);
  button.setAttribute('aria-expanded', String(open));
  if (open) { input.focus(); return; }
  if (ui.q) { ui.q = ''; input.value = ''; form.classList.remove('has-value'); refreshDesigns(); }
  button.focus();
}
function openSortMenu(anchor, event) {
  const html = `<div role="menu" aria-label="排序">${SORTS.map(([id, label]) => `<button type="button" class="menu-item" role="menuitemradio" aria-checked="${ui.sort === id}" data-act="${id}">${label}${ui.sort === id ? `<span class="check">${icon('check', 's18')}</span>` : ''}</button>`).join('')}</div>`;
  openPopover(anchor, html, { align: 'end', sheetTitle: '排序', onMount: bindMenu(event, (id) => { ui.sort = id; refreshDesigns(); }) });
}
function openDesignMenu(anchor, event) {
  const design = editableDesigns().find((item) => item.id === anchor.dataset.more);
  if (!design) return;
  const items = [['open', 'folder-open', '打开'], ['rename', 'pencil', '重命名'], ['duplicate', 'copy', '复制'], ['export', 'file-down', '导出项目文件']];
  if (design.cloud === 'local' && !ui.guest) items.push(['sync', 'cloud', '同步到云端']);
  items.push('-', ['delete', 'trash-2', '删除', 'danger']);
  openPopover(anchor, menuHtml(`「${design.name}」的操作`, items), { align: 'end', sheetTitle: design.name, onMount: bindMenu(event, (act) => designAction(act, design)) });
}
function designAction(act, design) {
  const back = `[data-more="${CSS.escape(design.id)}"]`;
  if (act === 'open') { page.ctx.navigate(`/editor/${design.id}`); return; }
  if (act === 'export') { toast('已导出项目文件', { iconName: 'file-down' }); refocus(back); return; }
  if (act === 'sync') { design.cloud = 'synced'; refreshDesigns(); toast('已同步到云端', { iconName: 'cloud-check' }); refocus(back); return; }
  if (act === 'duplicate') {
    const list = editableDesigns();
    rankSeed += 1;
    copySeq += 1;
    const copy = { ...design, id: `${design.id}-copy${copySeq}`, name: `${design.name} 副本`, status: 'draft', progress: 0, updated: '刚刚', example: false, rank: -rankSeed };
    list.splice(list.indexOf(design) + 1, 0, copy);
    refreshDesigns();
    toast(`已复制为「${copy.name}」`, { iconName: 'copy' });
    refocus(`[data-more="${CSS.escape(copy.id)}"]`);
    return;
  }
  if (act === 'rename') {
    openDialog({
      title: '重命名设计',
      body: `<form data-rename novalidate><div class="field" data-field="name"><label for="rename-input">名称</label><input class="input" id="rename-input" value="${esc(design.name)}" maxlength="40" autocomplete="off" autofocus><span class="error" hidden>${icon('circle-alert', 's16')}<span>请输入名称</span></span></div></form>`,
      foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-save disabled>保存</button>',
      onMount(dialog, close) {
        const input = $('#rename-input', dialog);
        const save = $('[data-save]', dialog);
        const field = $('[data-field]', dialog);
        input.addEventListener('focus', () => input.select(), { once: true });
        input.addEventListener('input', () => {
          save.disabled = input.value.trim() === design.name;
          field.classList.remove('is-invalid');
          $('.error', field).hidden = true;
        });
        const submit = () => {
          const value = input.value.trim();
          if (!value) { field.classList.add('is-invalid'); $('.error', field).hidden = false; input.focus(); return; }
          design.name = value;
          close();
          refreshDesigns();
          toast(`已重命名为「${value}」`);
        };
        save.addEventListener('click', submit);
        $('[data-rename]', dialog).addEventListener('submit', (event) => { event.preventDefault(); if (!save.disabled) submit(); });
      },
      onClose: () => refocus(back),
    });
    return;
  }
  if (act === 'delete') {
    const note = design.status === 'published' ? '已公开的作品不受影响，可以在「公开作品」里单独撤回。' : design.cloud === 'local' ? '它只保存在这台设备上，删除后无法找回。' : '它的原图也会一起删除。';
    confirmDialog({
      title: '删除这个设计？',
      text: `「${design.name}」会被永久删除，无法恢复。${note}`,
      confirm: '删除',
      danger: true,
      onConfirm() {
        const list = editableDesigns();
        list.splice(list.indexOf(design), 1);
        refreshDesigns();
        toast(`已删除「${design.name}」`, { iconName: 'trash-2' });
        refocus('[data-more]');
      },
      onCancel: () => refocus(back),
    });
  }
}

// ---------- 公开作品 / 喜欢 ----------
const loginGuide = (kind, title, text) => emptySlot({ kind, title, text, actions: '<button type="button" class="btn btn-secondary" data-login>登录</button>' });
function publicItems() {
  if (ui.empty) return [];
  const submissions = store.submissions.map((submission) => {
    const design = DESIGNS.find((item) => item.id === submission.designId);
    return { ...submission, key: submission.id, kind: submission.state, title: design.name, pattern: design.pattern, href: `#/editor/${design.id}` };
  });
  const published = publishedWorks().map((work) => ({ key: work.id, kind: 'published', title: work.title, pattern: work.pattern, href: `#/works/${work.id}`, work }));
  return [...submissions, ...published];
}
function ownCard(item) {
  const badge = { review: `<span class="badge warning">${icon('clock')}审核中</span>`, rejected: `<span class="badge danger">${icon('circle-alert')}未通过</span>` }[item.kind] ?? '';
  const meta = item.kind === 'published'
    ? `<span class="t-num">${formatCount(item.work.likes)} 喜欢</span><span class="sep"></span><span class="t-num">${formatCount(item.work.reuses)} 引用</span>`
    : `<span class="ellipsis">${esc(item.note)}</span>`;
  const label = item.kind === 'published' ? `查看「${esc(item.title)}」的公开页` : `打开「${esc(item.title)}」（${item.kind === 'review' ? '审核中' : '未通过'}）`;
  return `<article class="work-card design-card own-card">
    <div class="media"><img src="${patternImage(item.pattern, 320)}" alt="" decoding="async">${badge ? `<div class="badges" aria-hidden="true">${badge}</div>` : ''}</div>
    <div class="body">
      <h3 class="title ellipsis">${esc(item.title)}</h3>
      <p class="meta">${meta}</p>
      ${item.reason ? `<p class="reason">${icon('circle-alert', 's16')}<span>${esc(item.reason)}</span></p>` : ''}
    </div>
    <a class="stretched" href="${item.href}" aria-label="${label}"></a>
    ${moreButton('data-pub-more', item.key, item.title, 'on-image')}
  </article>`;
}
function renderPublic() {
  if (ui.guest) return loginGuide('designs', '登录后查看你的公开作品', '公开到豆社的图纸和审核进度都在这里。');
  const items = publicItems();
  if (!items.length) {
    return emptySlot({ kind: 'designs', title: '还没有公开作品', text: '在编辑器里选择「分享 → 公开到豆社」，审核通过后会出现在这里。', actions: '<a class="btn btn-secondary" href="#/me/designs">去我的设计</a>' });
  }
  const count = (kind) => items.filter((item) => item.kind === kind).length;
  const summary = [[count('published'), '件已公开'], [count('review'), '件审核中'], [count('rejected'), '件未通过']]
    .filter(([n]) => n).map(([n, label]) => `<span><b class="t-num">${n}</b> ${label}</span>`).join('<span class="dot" aria-hidden="true">·</span>');
  return `<section aria-label="公开作品">
    <div class="me-subhead"><p class="me-summary">${summary}</p><a class="btn btn-sm btn-ghost" href="#/u/${ME.id}">查看公开主页${icon('arrow-right', 's16')}</a></div>
    <div class="work-grid">${items.map(ownCard).join('')}</div>
  </section>`;
}
function openPublicMenu(anchor, event) {
  const item = publicItems().find((entry) => entry.key === anchor.dataset.pubMore);
  if (!item) return;
  const items = {
    published: [['view', 'eye', '查看公开页'], ['link', 'link', '复制链接'], '-', ['withdraw', 'undo-2', '撤回公开', 'danger']],
    review: [['edit', 'folder-open', '打开设计'], '-', ['cancel', 'undo-2', '撤回审核', 'danger']],
    rejected: [['edit', 'pencil', '修改设计'], ['resubmit', 'send', '重新提交'], '-', ['remove', 'trash-2', '删除投稿记录', 'danger']],
  }[item.kind];
  openPopover(anchor, menuHtml(`「${item.title}」的操作`, items), { align: 'end', sheetTitle: item.title, onMount: bindMenu(event, (act) => publicAction(act, item)) });
}
function publicAction(act, item) {
  const back = `[data-pub-more="${CSS.escape(item.key)}"]`;
  const drop = () => { store.submissions = store.submissions.filter((entry) => entry.id !== item.key); };
  if (act === 'view' || act === 'edit') { page.ctx.navigate(item.href.slice(1)); return; }
  if (act === 'link') { copyText(`${location.origin}${location.pathname}#/works/${item.key}`); toast('已复制链接', { iconName: 'link' }); refocus(back); return; }
  if (act === 'resubmit') {
    Object.assign(store.submissions.find((entry) => entry.id === item.key), { state: 'review', note: '刚刚提交 · 通常 1 天内审完', reason: '' });
    refreshPanel();
    toast('已重新提交审核', { iconName: 'send' });
    refocus(back);
    return;
  }
  const flows = {
    withdraw: { title: '撤回公开？', text: `「${item.title}」会从豆社下架，别人将不能查看或引用。已有的 ${formatCount(item.work?.likes ?? 0)} 个喜欢和 ${item.work?.comments ?? 0} 条评论会保留，重新公开后恢复。`, confirm: '撤回公开', done: '已撤回公开', run: () => store.withdrawn.add(item.key) },
    cancel: { title: '撤回审核？', text: `「${item.title}」不会出现在豆社。你可以继续修改，之后重新提交。`, confirm: '撤回审核', done: '已撤回审核', run: drop },
    remove: { title: '删除这条投稿记录？', text: `只删除「${item.title}」的投稿记录，设计本身不受影响。`, confirm: '删除记录', done: '已删除投稿记录', run: drop },
  }[act];
  confirmDialog({
    title: flows.title,
    text: flows.text,
    confirm: flows.confirm,
    danger: true,
    onConfirm() { flows.run(); refreshPanel(); toast(flows.done, { iconName: act === 'remove' ? 'trash-2' : 'undo-2' }); refocus('[data-pub-more]'); },
    onCancel: () => refocus(back),
  });
}
function renderLikes() {
  if (ui.guest) return loginGuide('likes', '登录后查看喜欢的图纸', '在发现页点爱心收藏图纸，换设备也不会丢。');
  const works = ui.empty ? [] : WORKS.filter((work) => isLiked(work.id));
  if (!works.length) {
    return emptySlot({ kind: 'likes', title: '还没有喜欢的图纸', text: '在发现页点爱心，喜欢的图纸会收在这里。', actions: `<a class="btn btn-secondary" href="#/">${icon('compass')}去发现</a>` });
  }
  return `<section aria-label="喜欢的图纸">
    <div class="me-subhead"><p class="me-summary"><span><b class="t-num">${works.length}</b> 张图纸</span></p></div>
    <div class="work-grid">${works.map((work) => workCard(work)).join('')}</div>
  </section>`;
}

// ---------- 色板页签 ----------
function customPalettes() {
  if (!store.customPalettes) {
    const base = paletteColors(BUILTIN[0]);
    const byCode = new Map(base.map((color) => [color.code, color]));
    const pick = (codes) => codes.map((code) => byCode.get(code)).filter(Boolean);
    store.customPalettes = [
      { id: 'my-fruit', name: '夏日水果', updated: '昨天', colors: pick(['A1', 'A3', 'A4', 'A7', 'A9', 'B3', 'B4', 'B8', 'B12', 'C3', 'E2', 'E5', 'F1', 'F2', 'F5', 'F8', 'F10', 'H1']) },
      { id: 'my-common', name: '常用 48 色', updated: '3 天前', colors: Array.from({ length: 48 }, (_, i) => base[Math.floor((i * 221) / 48)]) },
      { id: 'my-morandi', name: '莫兰迪灰调', updated: '上个月', colors: pick(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13', 'M14', 'M15', 'H3', 'H4', 'H5', 'H6', 'H8', 'H9', 'G8', 'G9', 'G10']) },
    ];
  }
  return ui.empty ? [] : store.customPalettes;
}
function strip(colors) {
  const slots = 24;
  const picks = colors.length > slots ? Array.from({ length: slots }, (_, i) => colors[Math.floor((i * colors.length) / slots)]) : colors;
  return `<div class="palette-strip" aria-hidden="true">${picks.map((color) => `<i class="pbead" style="--c:${color.hex}"></i>`).join('')}${'<i class="pbead is-hole"></i>'.repeat(slots - picks.length)}</div>`;
}
function customPaletteCard(palette) {
  return `<article class="palette-card is-custom">
    ${strip(palette.colors)}
    <div class="palette-info">
      <h3 class="palette-name ellipsis">${esc(palette.name)}</h3>
      <p class="palette-meta"><span class="t-num">${palette.colors.length} 色</span><span class="dot" aria-hidden="true">·</span><span>${esc(palette.updated)}</span></p>
    </div>
    <button type="button" class="stretched" data-open-palette="${palette.id}" aria-label="查看色板「${esc(palette.name)}」"></button>
    ${moreButton('data-palette-more', palette.id, palette.name, 'sm')}
  </article>`;
}
function builtinCard(palette) {
  const isDefault = store.defaultPalette === palette.id;
  return `<article class="palette-card">
    ${strip(paletteColors(palette))}
    <div class="palette-info">
      <div class="palette-title"><h3 class="palette-name ellipsis">${esc(palette.name)}</h3>${isDefault ? `<span class="badge">${icon('check')}默认</span>` : ''}</div>
      <p class="palette-meta"><span class="t-num">${palette.count} 色</span>${palette.specs.map((spec) => `<span class="spec-tag">${spec}</span>`).join('')}</p>
    </div>
    <button type="button" class="stretched" data-open-palette="${palette.id}" aria-label="查看「${esc(palette.name)}」全部 ${palette.count} 色"></button>
  </article>`;
}
function renderPalettes() {
  const defaultName = BUILTIN.find((palette) => palette.id === store.defaultPalette).name;
  let mine;
  if (ui.guest) {
    mine = `<div class="me-guide">${emptySlot({ kind: 'empty', compact: true, title: '登录后保存自己的色板', text: '把手上有的颜色存成色板，生成图纸时只用这些颜色。', actions: '<button type="button" class="btn btn-secondary" data-login>登录</button>' })}</div>`;
  } else {
    const list = customPalettes();
    mine = list.length
      ? `<div class="palette-grid">${list.map(customPaletteCard).join('')}</div>`
      : `<div class="me-guide">${emptySlot({ kind: 'empty', compact: true, title: '还没有自己的色板', text: '把手上有的颜色存成色板，生成图纸时只用这些颜色。' })}</div>`;
  }
  return `<section class="me-section" aria-labelledby="h-my-palettes">
      <div class="section-head"><h2 id="h-my-palettes">我的色板</h2><span class="grow"></span>${ui.guest ? '' : `<button type="button" class="btn btn-sm btn-secondary" data-new-palette>${icon('plus')}新建色板</button>`}</div>
      ${mine}
    </section>
    <section class="me-section" aria-labelledby="h-builtin">
      <div class="section-head"><h2 id="h-builtin">内置色板</h2><span class="grow"></span><p class="t-body-sm t-muted hide-mobile">新建设计默认使用「${esc(defaultName)}」</p></div>
      <div class="palette-grid">${BUILTIN.map(builtinCard).join('')}</div>
    </section>`;
}
function swatchHtml(color, selectable, on) {
  const inner = `<span class="swatch-color ${isLight(color.hex) ? 'is-light' : ''}" style="--c:${color.hex}">${selectable ? icon('check') : ''}</span><span class="swatch-label"><b>${esc(color.code)}</b><span class="ellipsis">${esc(color.name)}</span></span><span class="swatch-hex">${color.hex}</span>`;
  return selectable
    ? `<button type="button" class="swatch" data-code="${esc(color.code)}" aria-pressed="${on}" aria-label="${esc(color.code)} ${esc(color.name)}">${inner}</button>`
    : `<div class="swatch">${inner}</div>`;
}
function swatchPanel(container, colors, { selectable = false, selected = new Set(), onChange } = {}) {
  const families = [...new Set(colors.map((color) => color.family))];
  const state = { q: '', family: 'all' };
  container.innerHTML = `<div class="swatch-tools">
      <div class="search swatch-search">${icon('search', 's18')}<input type="search" placeholder="搜索色号、名称或 HEX" aria-label="搜索色号、名称或 HEX" autocomplete="off" data-swatch-q><button type="button" class="icon-btn sm clear" data-swatch-clear aria-label="清除搜索">${icon('x', 's16')}</button></div>
      ${families.length > 1 ? `<div class="swatch-families" role="group" aria-label="按色系筛选">${['all', ...families].map((family) => `<button type="button" class="chip" data-family="${family}" aria-pressed="${family === 'all'}">${family === 'all' ? '全部' : family}</button>`).join('')}</div>` : ''}
    </div>
    <div class="swatch-grid" data-swatch-grid></div>`;
  const grid = $('[data-swatch-grid]', container);
  const input = $('[data-swatch-q]', container);
  const draw = () => {
    const raw = state.q.trim();
    const q = raw.toLowerCase();
    const hex = q.replace(/^#/, '');
    const list = colors.filter((color) => (state.family === 'all' || color.family === state.family)
      && (!q || color.code.toLowerCase().includes(q) || color.name.includes(raw) || (hex && color.hex.toLowerCase().includes(hex))));
    grid.innerHTML = list.length
      ? list.map((color) => swatchHtml(color, selectable, selected.has(color.code))).join('')
      : emptySlot({ kind: 'search', compact: true, title: `没有找到「${raw}」`, text: '可以搜索色号、颜色名称或 HEX 值。', actions: '<button type="button" class="btn btn-secondary" data-swatch-clear>清除搜索</button>' });
    hydrate(grid);
  };
  input.addEventListener('input', () => { state.q = input.value; input.parentElement.classList.toggle('has-value', Boolean(input.value)); draw(); });
  container.addEventListener('click', (event) => {
    const family = event.target.closest('[data-family]');
    if (family) {
      state.family = family.dataset.family;
      $$('[data-family]', container).forEach((node) => node.setAttribute('aria-pressed', String(node === family)));
      draw();
      return;
    }
    if (event.target.closest('[data-swatch-clear]')) {
      state.q = '';
      input.value = '';
      input.parentElement.classList.remove('has-value');
      draw();
      input.focus();
      return;
    }
    const swatch = event.target.closest('button.swatch');
    if (swatch && selectable) {
      const on = !selected.has(swatch.dataset.code);
      if (on) selected.add(swatch.dataset.code); else selected.delete(swatch.dataset.code);
      swatch.setAttribute('aria-pressed', String(on));
      onChange?.(selected);
    }
  });
  draw();
}
function openPaletteViewer(id) {
  const custom = customPalettes().find((palette) => palette.id === id);
  const builtin = BUILTIN.find((palette) => palette.id === id);
  const palette = custom ?? builtin;
  if (!palette) return;
  const meta = custom ? `${custom.colors.length} 色 · 基于「MARD 豆色绘经典」` : `${builtin.count} 色 · 适用 ${builtin.specs.join('、')}${builtin.note ? ` · ${builtin.note}` : ''}`;
  const isDefault = store.defaultPalette === id;
  const foot = custom
    ? `<button type="button" class="btn btn-secondary" data-edit-palette>${icon('pencil')}编辑色板</button>`
    : isDefault ? `<button type="button" class="btn btn-secondary" disabled>${icon('check')}当前默认</button>` : '<button type="button" class="btn btn-secondary" data-set-default>设为默认色板</button>';
  openDialog({
    title: palette.name,
    size: 'lg',
    body: `<div class="palette-dialog"><p class="palette-dialog-meta">${esc(meta)}</p><div data-swatches></div></div>`,
    foot,
    onMount(dialog, close) {
      if (isMobile()) $('[data-close]', dialog).setAttribute('autofocus', '');
      swatchPanel($('[data-swatches]', dialog), custom ? custom.colors : paletteColors(builtin));
      $('[data-edit-palette]', dialog)?.addEventListener('click', () => { close(); openPaletteEditor(custom); });
      $('[data-set-default]', dialog)?.addEventListener('click', () => {
        store.defaultPalette = id;
        close();
        refreshPanel();
        toast(`已把「${palette.name}」设为默认色板`);
      });
    },
    onClose: () => refocus(`[data-open-palette="${CSS.escape(id)}"]`),
  });
}
function openPaletteEditor(palette) {
  const base = paletteColors(BUILTIN[0]);
  const selected = new Set(palette ? palette.colors.map((color) => color.code) : []);
  openDialog({
    title: palette ? '编辑色板' : '新建色板',
    size: 'lg',
    body: `<div class="palette-dialog">
      <div class="field" data-field="palette-name"><label for="palette-name">名称</label><input class="input" id="palette-name" value="${esc(palette?.name ?? '')}" maxlength="20" autocomplete="off"><span class="error" hidden>${icon('circle-alert', 's16')}<span>请输入色板名称</span></span></div>
      <p class="palette-dialog-meta">从「MARD 豆色绘经典」291 色里点选你手上有的颜色。</p>
      <div data-swatches></div>
    </div>`,
    foot: `<span class="t-body-sm t-muted t-num palette-picked" data-picked>已选 ${selected.size} 色</span><span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-save-palette ${selected.size ? '' : 'disabled'}>保存</button>`,
    onMount(dialog, close) {
      const name = $('#palette-name', dialog);
      const field = $('[data-field]', dialog);
      const save = $('[data-save-palette]', dialog);
      if (palette && isMobile()) $('[data-close]', dialog).setAttribute('autofocus', '');
      else name.setAttribute('autofocus', '');
      swatchPanel($('[data-swatches]', dialog), base, {
        selectable: true,
        selected,
        onChange(set) { $('[data-picked]', dialog).textContent = `已选 ${set.size} 色`; save.disabled = !set.size; },
      });
      name.addEventListener('input', () => { field.classList.remove('is-invalid'); $('.error', field).hidden = true; });
      save.addEventListener('click', () => {
        const value = name.value.trim();
        if (!value) { field.classList.add('is-invalid'); $('.error', field).hidden = false; name.focus(); return; }
        const colors = base.filter((color) => selected.has(color.code));
        const list = customPalettes();
        if (palette) Object.assign(palette, { name: value, colors, updated: '刚刚' });
        else list.unshift({ id: `my-${Date.now()}`, name: value, colors, updated: '刚刚' });
        close();
        refreshPanel();
        toast(`已保存色板「${value}」`);
      });
    },
  });
}
function openPaletteMenu(anchor, event) {
  const palette = customPalettes().find((item) => item.id === anchor.dataset.paletteMore);
  if (!palette) return;
  const items = [['edit', 'pencil', '编辑'], ['duplicate', 'copy', '复制'], '-', ['delete', 'trash-2', '删除', 'danger']];
  openPopover(anchor, menuHtml(`「${palette.name}」的操作`, items), {
    align: 'end',
    sheetTitle: palette.name,
    onMount: bindMenu(event, (act) => {
      const back = `[data-palette-more="${CSS.escape(palette.id)}"]`;
      const list = customPalettes();
      if (act === 'edit') { openPaletteEditor(palette); return; }
      if (act === 'duplicate') {
        const copy = { ...palette, id: `${palette.id}-copy${Date.now()}`, name: `${palette.name} 副本`, colors: [...palette.colors], updated: '刚刚' };
        list.splice(list.indexOf(palette) + 1, 0, copy);
        refreshPanel();
        toast(`已复制色板「${copy.name}」`, { iconName: 'copy' });
        refocus(`[data-palette-more="${CSS.escape(copy.id)}"]`);
        return;
      }
      confirmDialog({
        title: '删除这个色板？',
        text: `「${palette.name}」会被删除，已经用它生成的图纸不受影响。`,
        confirm: '删除',
        danger: true,
        onConfirm() { list.splice(list.indexOf(palette), 1); refreshPanel(); toast(`已删除色板「${palette.name}」`, { iconName: 'trash-2' }); },
        onCancel: () => refocus(back),
      });
    }),
  });
}

// ---------- 账号设置 ----------
const storageScale = () => (ui.storageFull ? FULL_MB / 620 : 1);
const usedMb = () => Math.round(store.originals.reduce((sum, item) => sum + item.mb, 0) * storageScale());
function settingsCard(id, title, desc, content, cls = '') {
  return `<section class="surface settings-card ${cls}" id="set-${id}" data-section="${id}" aria-labelledby="h-${id}">
    <header class="settings-card-head"><h2 id="h-${id}" tabindex="-1">${title}</h2>${desc ? `<p>${desc}</p>` : ''}</header>
    ${content}
  </section>`;
}
function profileCard() {
  return settingsCard('profile', '个人资料', '会显示在你的公开作品和作者主页上。', `
    <form class="profile-form" data-profile-form novalidate>
      <div class="avatar-edit">
        <span class="avatar xl" data-avatar-preview style="--av:${ME.color}" aria-hidden="true">${esc(ME.name.slice(0, 1))}</span>
        <button type="button" class="btn btn-sm btn-outline" data-avatar-color aria-haspopup="dialog">更换颜色</button>
      </div>
      <div class="field grow" data-field="name">
        <label for="set-name">用户名</label>
        <div class="field-row">
          <input class="input" id="set-name" name="name" value="${esc(ME.name)}" maxlength="24" autocomplete="nickname">
          <button type="submit" class="btn btn-secondary" data-save-profile disabled>保存</button>
        </div>
        <span class="hint">2–20 个字，公开作品上会显示这个名字。</span>
        <span class="error" hidden>${icon('circle-alert', 's16')}<span data-error-text></span></span>
      </div>
    </form>`);
}
function devicesRow() {
  const others = store.devices.length - 1;
  return `<div class="grow"><div class="setting-title">登录设备</div><p class="setting-desc">${others ? `当前在 ${store.devices.length} 台设备上登录` : '只在这台设备上登录'}</p></div>
    <button type="button" class="btn btn-outline" data-signout-others ${others ? '' : 'disabled'}>退出其他设备</button>
    <details class="me-disclosure"><summary>查看设备${icon('chevron-down', 's16')}</summary>
      <ul class="device-list">${store.devices.map((device) => `<li><span class="grow ellipsis">${esc(device.name)}</span>${device.current ? '<span class="badge">当前设备</span>' : ''}<span class="t-muted">${esc(device.place)} · ${esc(device.when)}</span></li>`).join('')}</ul>
    </details>`;
}
function securityCard() {
  return settingsCard('security', '登录与安全', '', `
    <div class="setting-row">
      <div class="grow"><div class="setting-title">邮箱</div><p class="setting-desc">${esc(ME.email)}</p></div>
      <span class="badge success">${icon('badge-check')}已验证</span>
    </div>
    <div class="setting-row">
      <div class="grow"><div class="setting-title">密码</div><p class="setting-desc">上次修改于 3 个月前</p></div>
      <button type="button" class="btn btn-outline" data-change-password>修改密码</button>
    </div>
    <div class="setting-row" data-devices>${devicesRow()}</div>`);
}
function storageCard() {
  const used = usedMb() / 1000;
  const total = ME.storageTotal;
  const pct = Math.round((used / total) * 100);
  const full = pct >= 80;
  return settingsCard('storage', '原图空间', '原图用于重新生成图纸和「原图参照」，只有你自己能看到。', `
    <div class="storage-meter">
      <div class="storage-figures"><span class="t-title-2 t-num">${used.toFixed(2).replace(/0$/, '')} GB</span><span class="t-body-sm t-muted t-num">共 ${total} GB · 已用 ${pct}%</span></div>
      <div class="progress ${full ? 'is-warning' : ''}" role="progressbar" aria-label="原图空间用量" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      <p class="storage-note ${full ? 'is-warning' : ''}">${full ? `${icon('triangle-alert', 's16')}<span>空间快满了。用满后，新上传的原图只保存在这台设备上。</span>` : '<span>删除原图不会删除图纸，只是不能再用它重新生成或对照。</span>'}</p>
    </div>
    <div class="settings-actions"><button type="button" class="btn btn-outline" data-manage-originals>管理原图</button></div>`);
}
function privacyCard() {
  const on = sessionStorage.getItem('proto-consent') === 'yes';
  return settingsCard('privacy', '隐私', '', `
    <div class="setting-row">
      <label class="grow" for="set-analytics"><span class="setting-title">匿名使用统计</span><span class="setting-desc">只统计功能使用次数和设备类型，不记录图片、图纸内容或搜索词。</span></label>
      <input type="checkbox" class="switch" id="set-analytics" role="switch" data-analytics ${on ? 'checked' : ''}>
    </div>`);
}
function dangerCard() {
  return settingsCard('danger', '危险区域', '', `
    <div class="setting-row">
      <div class="grow"><div class="setting-title">注销账号</div><p class="setting-desc">永久删除账号、全部设计和原图，公开作品会从豆社下架。此操作无法撤销。</p></div>
      <button type="button" class="btn btn-outline danger-btn" data-delete-account>注销账号</button>
    </div>`, 'danger');
}
function renderSettings() {
  const sections = [['profile', '个人资料'], ['security', '登录与安全'], ['storage', '原图空间'], ['privacy', '隐私'], ['danger', '危险区域']];
  const guestCard = `<section class="surface settings-card">${emptySlot({ kind: 'empty', compact: true, title: '登录后管理账号', text: '个人资料、登录安全和原图空间需要登录后才能设置。', actions: '<button type="button" class="btn btn-secondary" data-login>登录</button>' })}</section>`;
  return `<div class="container settings">
    <header class="settings-head">
      <a class="btn btn-sm btn-ghost settings-back" href="#/me">${icon('arrow-left', 's16')}我的</a>
      <h1 class="t-title-1">账号设置</h1>
    </header>
    <div class="settings-layout ${ui.guest ? 'no-nav' : ''}">
      ${ui.guest ? '' : `<nav class="settings-nav" aria-label="设置分区">${sections.map(([id, label], index) => `<button type="button" data-jump="${id}" ${index === 0 ? 'aria-current="true"' : ''}>${label}</button>`).join('')}</nav>`}
      <div class="settings-sections">
        ${ui.guest ? guestCard : `${profileCard()}${securityCard()}${storageCard()}`}
        ${privacyCard()}
        ${ui.guest ? '' : dangerCard()}
      </div>
    </div>
  </div>`;
}
function jumpTo(id, smooth = true) {
  const section = $(`[data-section="${id}"]`, page.root);
  if (!section) return;
  section.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  $('h2', section).focus({ preventScroll: true });
  $$('.settings-nav [data-jump]', page.root).forEach((node) => { if (node.dataset.jump === id) node.setAttribute('aria-current', 'true'); else node.removeAttribute('aria-current'); });
}
function bindProfile(root, signal) {
  const form = $('[data-profile-form]', root);
  if (!form) return;
  const input = $('#set-name', form);
  const save = $('[data-save-profile]', form);
  const field = $('[data-field="name"]', form);
  const preview = $('[data-avatar-preview]', form);
  const draft = { color: ME.color };
  const dirty = () => input.value.trim() !== ME.name || draft.color.toLowerCase() !== ME.color.toLowerCase();
  const setError = (message) => {
    field.classList.toggle('is-invalid', Boolean(message));
    $('.error', field).hidden = !message;
    $('.hint', field).hidden = Boolean(message);
    $('[data-error-text]', field).textContent = message;
  };
  const sync = () => {
    save.disabled = !dirty();
    preview.textContent = (input.value.trim() || ME.name).slice(0, 1);
    preview.style.setProperty('--av', draft.color);
  };
  input.addEventListener('input', () => { setError(''); sync(); }, { signal });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = input.value.trim();
    const error = !name ? '请输入用户名' : name.length < 2 ? '用户名至少 2 个字' : name.length > 20 ? '用户名最多 20 个字' : name === '豆色绘官方' ? '这个用户名已被使用，换一个试试' : '';
    if (error) { setError(error); input.focus(); return; }
    save.classList.add('is-loading');
    setTimeout(() => {
      ME.name = name;
      ME.color = draft.color;
      Object.assign(AUTHORS[ME.id], { name, color: draft.color });
      save.classList.remove('is-loading');
      sync();
      toast('已保存');
    }, 600);
  }, { signal });
  page.avatarDraft = { get: () => draft.color, set: (color) => { draft.color = color; sync(); } };
}
function openAvatarColors(anchor) {
  const current = page.avatarDraft.get().toLowerCase();
  const html = `<div class="avatar-colors" role="group" aria-label="头像颜色">${AVATAR_KEYS.map((key) => {
    const bead = BEADS[key];
    return `<button type="button" class="avatar-color" style="--c:${bead.hex}" data-pick-color="${bead.hex}" aria-pressed="${bead.hex.toLowerCase() === current}" aria-label="${bead.name}" data-tip="${bead.name}"></button>`;
  }).join('')}</div>`;
  openPopover(anchor, html, {
    align: 'start',
    sheetTitle: '头像颜色',
    onMount(node, close) {
      node.addEventListener('click', (event) => {
        const button = event.target.closest('[data-pick-color]');
        if (!button) return;
        page.avatarDraft.set(button.dataset.pickColor);
        close();
      });
    },
  });
}
function passwordField(name, label, autocomplete, hint = '') {
  return `<div class="field" data-field="${name}"><label for="pw-${name}">${label}</label><input class="input" id="pw-${name}" name="${name}" type="password" autocomplete="${autocomplete}">${hint ? `<span class="hint">${hint}</span>` : ''}<span class="error" hidden>${icon('circle-alert', 's16')}<span></span></span></div>`;
}
function openPasswordDialog() {
  openDialog({
    title: '修改密码',
    body: `<form class="stack form-stack" data-password novalidate>
      ${passwordField('current', '当前密码', 'current-password')}
      ${passwordField('next', '新密码', 'new-password', '至少 8 位，建议混合字母和数字')}
      ${passwordField('confirm', '确认新密码', 'new-password')}
    </form>`,
    foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-submit>修改密码</button>',
    onMount(dialog, close) {
      const form = $('[data-password]', dialog);
      const submitButton = $('[data-submit]', dialog);
      const value = (name) => $(`[name="${name}"]`, form).value;
      const setError = (name, message) => {
        const field = $(`[data-field="${name}"]`, form);
        field.classList.toggle('is-invalid', Boolean(message));
        const error = $('.error', field);
        error.hidden = !message;
        $('span', error).textContent = message;
        const hint = $('.hint', field);
        if (hint) hint.hidden = Boolean(message);
      };
      const validate = () => ({
        current: value('current') ? '' : '请输入当前密码',
        next: value('next').length < 8 ? '新密码至少需要 8 位' : value('next') === value('current') ? '新密码不能和当前密码相同' : '',
        confirm: !value('confirm') ? '请再输入一次新密码' : value('confirm') !== value('next') ? '两次输入的新密码不一致' : '',
      });
      let tried = false;
      const submit = () => {
        tried = true;
        const errors = validate();
        Object.entries(errors).forEach(([name, message]) => setError(name, message));
        const first = Object.keys(errors).find((name) => errors[name]);
        if (first) { $(`[name="${first}"]`, form).focus(); return; }
        submitButton.classList.add('is-loading');
        setTimeout(() => {
          submitButton.classList.remove('is-loading');
          if (value('current').length < 6) { setError('current', '当前密码不正确，忘记了可以退出后用邮箱重设'); $('[name="current"]', form).focus(); return; }
          close();
          toast('已修改密码，其他设备需要重新登录');
        }, 600);
      };
      form.addEventListener('input', (event) => { if (tried) setError(event.target.name, validate()[event.target.name]); });
      form.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } });
      submitButton.addEventListener('click', submit);
    },
    onClose: () => refocus('[data-change-password]'),
  });
}
function openSignOutOthers() {
  const others = store.devices.length - 1;
  confirmDialog({
    title: '退出其他设备？',
    text: `除了这台设备，其他 ${others} 台设备上的豆色绘都需要重新登录。`,
    confirm: '退出其他设备',
    onConfirm() {
      store.devices = store.devices.filter((device) => device.current);
      $('[data-devices]', page.root).innerHTML = devicesRow();
      toast(`已退出其他 ${others} 台设备`, { iconName: 'log-out' });
      refocus('.me-disclosure summary');
    },
    onCancel: () => refocus('[data-signout-others]'),
  });
}
function openOriginals() {
  openDialog({
    title: '管理原图',
    size: 'md',
    body: '<div class="originals" data-originals></div>',
    onMount(dialog) {
      const box = $('[data-originals]', dialog);
      const draw = () => {
        const scale = storageScale();
        box.innerHTML = `<p class="originals-summary"><b class="t-num">${(usedMb() / 1000).toFixed(2).replace(/0$/, '')} / ${ME.storageTotal} GB</b><span>${store.originals.length} 份原图，用量包含每次重新裁剪保存的版本。</span></p>
          ${store.originals.length ? `<ul class="originals-list">${store.originals.map((item) => {
            const design = DESIGNS.find((entry) => entry.id === item.designId);
            return `<li><img class="row-thumb" src="${patternImage(design.pattern, 48)}" alt=""><div class="grow"><div class="originals-name ellipsis">${esc(design.name)}</div><div class="originals-meta t-num">${Math.round(item.mb * scale)} MB · ${item.versions} 个版本</div></div><button type="button" class="btn btn-sm btn-danger-ghost" data-drop="${item.designId}">删除原图</button></li>`;
          }).join('')}</ul>` : '<p class="originals-empty">没有保存在云端的原图了。</p>'}`;
      };
      box.addEventListener('click', (event) => {
        const button = event.target.closest('[data-drop]');
        if (!button) return;
        const index = store.originals.findIndex((item) => item.designId === button.dataset.drop);
        const [removed] = store.originals.splice(index, 1);
        const refresh = () => { draw(); $('#set-storage', page.root)?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: storageCard() }).firstElementChild); };
        refresh();
        toast('已删除原图', { iconName: 'trash-2', action: { label: '撤销', onClick() { store.originals.splice(index, 0, removed); refresh(); } } });
      });
      draw();
    },
    onClose: () => refocus('[data-manage-originals]'),
  });
}
function openDeleteAccount() {
  const values = stats();
  openDialog({
    title: '注销账号？',
    body: `<div class="stack form-stack">
      <p class="confirm-text">注销后以下内容会被永久删除，无法恢复：</p>
      <ul class="confirm-list"><li>${values.designs} 份设计和全部原图</li><li>${values.published} 件公开作品（会从豆社下架）</li><li>喜欢的图纸和自定义色板</li></ul>
      <div class="field"><label for="confirm-name">输入用户名「${esc(ME.name)}」以确认</label><input class="input" id="confirm-name" autocomplete="off" spellcheck="false"></div>
    </div>`,
    foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-danger" data-confirm disabled>注销账号</button>',
    onMount(dialog, close) {
      const input = $('#confirm-name', dialog);
      const confirm = $('[data-confirm]', dialog);
      input.addEventListener('input', () => { confirm.disabled = input.value.trim() !== ME.name; });
      confirm.addEventListener('click', () => {
        close();
        page.ctx.session.loggedIn = false;
        toast('账号已注销');
        page.ctx.navigate('/');
      });
    },
    onClose: () => refocus('[data-delete-account]'),
  });
}

// ---------- 作者公开主页 ----------
function renderAuthor(ctx) {
  const author = AUTHORS[ctx.params[0]];
  if (!author) {
    return `<div class="container me">${emptySlot({ kind: 'search', title: '找不到这位作者', text: '链接可能已经失效，或者作者注销了账号。', actions: `<a class="btn btn-secondary" href="#/">${icon('compass')}去发现</a>` })}</div>`;
  }
  const own = ctx.session.loggedIn && author.id === ME.id;
  const works = worksBy(author.id).filter((work) => !(author.id === ME.id && store.withdrawn.has(work.id)));
  const sum = (key) => works.reduce((total, work) => total + work[key], 0);
  return `<div class="container me author">
    ${profileHead({
      person: author,
      badge: author.official ? `<span class="badge official">${icon('badge-check')}官方</span>` : '',
      bio: author.bio,
      stats: [['作品', works.length], ['获赞', formatCount(sum('likes'))], ['被引用', formatCount(sum('reuses'))]],
      actions: `${own ? '<a class="btn btn-ghost" href="#/me/public">管理公开作品</a>' : ''}<button type="button" class="btn btn-secondary" data-share>${icon('share-2')}分享</button>`,
    })}
    <section class="me-section author-works" aria-labelledby="h-works">
      <div class="section-head"><h2 id="h-works">作品</h2><span class="t-body-sm t-muted t-num">${works.length}</span></div>
      ${works.length ? `<div class="work-grid">${works.map((work) => workCard(work)).join('')}</div>` : emptySlot({ kind: 'designs', title: '还没有公开作品', text: `${author.name}公开的图纸会出现在这里。` })}
    </section>
  </div>`;
}

// ---------- 渲染与交互 ----------
const PANELS = { designs: renderDesigns, public: renderPublic, likes: renderLikes, palettes: renderPalettes };
function refreshPanel() {
  const panel = $('[data-panel]', page.root);
  if (!panel) return;
  panel.innerHTML = PANELS[tabOf(page.ctx)]();
  hydrate(panel);
  updateStats();
}
function onClick(event) {
  const { target } = event;
  let hit;
  if ((hit = target.closest('[data-more]'))) { openDesignMenu(hit, event); return; }
  if ((hit = target.closest('[data-pub-more]'))) { openPublicMenu(hit, event); return; }
  if ((hit = target.closest('[data-palette-more]'))) { openPaletteMenu(hit, event); return; }
  if ((hit = target.closest('[data-open-palette]'))) { openPaletteViewer(hit.dataset.openPalette); return; }
  if ((hit = target.closest('[data-status]'))) { ui.status = hit.dataset.status; refreshDesigns(); return; }
  if ((hit = target.closest('[data-view]'))) { ui.view = hit.dataset.view; refreshDesigns(); return; }
  if ((hit = target.closest('[data-sort-menu]'))) { openSortMenu(hit, event); return; }
  if ((hit = target.closest('[data-toggle-search]'))) { toggleMobileSearch(hit); return; }
  if (target.closest('[data-clear-q]')) { clearQuery(); return; }
  if (target.closest('[data-show-all]')) { ui.status = 'all'; refreshDesigns(); return; }
  if (target.closest('[data-new-palette]')) { openPaletteEditor(null); return; }
  if (target.closest('[data-back]')) { if (history.length > 1) history.back(); else page.ctx.navigate('/'); return; }
  if (target.closest('[data-share]')) { copyText(location.href); toast('已复制主页链接', { iconName: 'link' }); return; }
  if ((hit = target.closest('[data-jump]'))) { jumpTo(hit.dataset.jump); return; }
  if ((hit = target.closest('[data-avatar-color]'))) { openAvatarColors(hit); return; }
  if (target.closest('[data-change-password]')) { openPasswordDialog(); return; }
  if (target.closest('[data-signout-others]')) { openSignOutOthers(); return; }
  if (target.closest('[data-manage-originals]')) { openOriginals(); return; }
  if (target.closest('[data-delete-account]')) { openDeleteAccount(); return; }
  const row = target.closest('tr[data-row]');
  if (row && !target.closest('a, button')) page.ctx.navigate(`/editor/${row.dataset.row}`);
}

export default {
  shell: 'site',
  topbarCta: 'secondary',
  get nav() { return location.hash.startsWith('#/u/') ? null : 'me'; },
  tabbar: true,
  title(ctx) {
    if (isAuthorPath(ctx)) {
      const author = AUTHORS[ctx.params[0]];
      return author ? `${author.name}的主页` : '作者主页';
    }
    return TITLES[tabOf(ctx)];
  },
  mobileTop(ctx) {
    if (isAuthorPath(ctx)) {
      const author = AUTHORS[ctx.params[0]];
      return `<button type="button" class="icon-btn" data-back aria-label="返回">${icon('arrow-left')}</button><span class="title ellipsis">${esc(author?.name ?? '作者主页')}</span>${author ? `<button type="button" class="icon-btn" data-share aria-label="分享主页">${icon('share-2')}</button>` : '<span class="m-top-spacer"></span>'}`;
    }
    if (tabOf(ctx) === 'settings') return `<a class="icon-btn" href="#/me" aria-label="返回我的">${icon('arrow-left')}</a><span class="title">账号设置</span><span class="m-top-spacer"></span>`;
    return `<span class="m-top-spacer sm"></span><span class="title">我的</span><a class="icon-btn" href="#/me/settings" aria-label="账号设置">${icon('settings')}</a>`;
  },
  render(ctx) {
    ui = readUi(ctx);
    if (isAuthorPath(ctx)) return renderAuthor(ctx);
    const tab = tabOf(ctx);
    if (tab === 'settings') return renderSettings();
    return `<div class="container me">${meHead()}${tabsHtml(tab)}<div data-panel>${PANELS[tab]()}</div></div>`;
  },
  mount(root, ctx) {
    page = { root, ctx };
    const controller = new AbortController();
    const { signal } = controller;
    const cleanups = [() => controller.abort(), closePopover];
    hydrate(root);
    root.addEventListener('click', onClick, { signal });
    const tab = isAuthorPath(ctx) ? '' : tabOf(ctx);
    if (tab === 'designs') {
      const form = $('[data-design-search]', root);
      const input = $('input', form);
      input.addEventListener('input', () => { ui.q = input.value; form.classList.toggle('has-value', Boolean(input.value)); refreshDesigns(); }, { signal });
      input.addEventListener('keydown', (event) => { if (event.key === 'Escape' && input.value) { event.stopPropagation(); clearQuery(); } }, { signal });
      form.addEventListener('submit', (event) => { event.preventDefault(); input.blur(); }, { signal });
      window.matchMedia('(max-width: 767px)').addEventListener('change', () => { closePopover(); refreshDesigns(); }, { signal });
    }
    if (tab === 'settings') {
      bindProfile(root, signal);
      root.addEventListener('change', (event) => {
        if (!event.target.matches('[data-analytics]')) return;
        sessionStorage.setItem('proto-consent', event.target.checked ? 'yes' : 'no');
        $('.consent', root)?.remove();
        toast(event.target.checked ? '已开启匿名统计' : '已关闭匿名统计');
      }, { signal });
      const nav = $$('.settings-nav [data-jump]', root);
      if (nav.length && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            nav.forEach((node) => { if (node.dataset.jump === entry.target.dataset.section) node.setAttribute('aria-current', 'true'); else node.removeAttribute('aria-current'); });
          }
        }, { rootMargin: '-35% 0px -60% 0px' });
        $$('[data-section]', root).forEach((section) => observer.observe(section));
        cleanups.push(() => observer.disconnect());
      }
      if (ui.section) requestAnimationFrame(() => jumpTo(ui.section, false));
    }
    return () => cleanups.forEach((fn) => fn());
  },
};
