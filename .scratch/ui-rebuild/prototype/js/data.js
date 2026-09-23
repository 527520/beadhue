// 原型模拟数据：作品、作者、类目、我的设计、评论。全部由 motifs.js 程序化图案生成。
import { BEADS, rasterize, colorUsage } from '../motifs.js';

export const AUTHORS = {
  official: { id: 'official', name: '豆色绘官方', color: '#1c1c1e', official: true, bio: '每周上新官方示范图纸。' },
  lu: { id: 'lu', name: '小鹿拼豆', color: '#e0473f', bio: '上班拼豆，下班也拼豆。' },
  cheng: { id: 'cheng', name: '橙子手作', color: '#f28b2c', bio: '做一些圆滚滚的小东西。' },
  xing: { id: 'xing', name: '星星收集者', color: '#3f7fd9', bio: '收集全世界的星星人。' },
  abu: { id: 'abu', name: '阿布的豆盒', color: '#47a35b', bio: '豆盒里住着一整个夏天。' },
  tang: { id: 'tang', name: '半糖工作室', color: '#8b6cc9', bio: '甜品系列持续更新。' },
};

function makePattern(id, motif, size, swap = null) {
  let keys = rasterize(motif, size);
  if (swap) keys = keys.map((key) => (key && swap[key]) || key);
  return { id, width: size, height: size, keys };
}

const WORK_SPECS = [
  ['w-cat', 'cat', 32, '橘猫团子', 'cheng', 1284, 36, 212, ['动物', '猫咪'], { featured: true }],
  ['w-rainbow', 'rainbow', 36, '云朵彩虹', 'official', 986, 12, 164, ['天气', '可爱'], { official: true }],
  ['w-mushroom', 'mushroom', 29, '红伞蘑菇', 'abu', 742, 9, 98, ['植物'], {}],
  ['w-icecream', 'icecream', 32, '双球冰淇淋', 'tang', 1530, 41, 260, ['甜品', '夏天'], { featured: true }],
  ['w-watermelon', 'watermelon', 32, '夏日西瓜', 'abu', 611, 7, 73, ['水果', '夏天'], {}],
  ['w-heart', 'heart', 24, '心动爱心', 'lu', 2210, 58, 402, ['可爱'], {}],
  ['w-strawberry', 'strawberry', 29, '草莓小甜心', 'lu', 1876, 33, 310, ['水果', '可爱'], { featured: true }],
  ['w-chick', 'chick', 29, '小黄鸡', 'cheng', 530, 5, 61, ['动物', '可爱'], {}],
  ['w-panda', 'panda', 32, '熊猫滚滚', 'official', 1422, 27, 233, ['动物'], { official: true }],
  ['w-frog', 'frog', 29, '呱呱青蛙', 'abu', 403, 4, 38, ['动物'], {}],
  ['w-sakura', 'sakura', 29, '春日樱花', 'xing', 877, 15, 120, ['花草', '春天'], {}],
  ['w-star', 'star', 29, '星星人', 'xing', 1998, 62, 356, ['星星人', '可爱'], { featured: true }],
  ['w-cat-gray', 'cat', 36, '灰猫午睡', 'lu', 688, 11, 84, ['动物', '猫咪'], { swap: { O: 'S', o: 's', T: 'S', P: 'p' } }],
  ['w-star-pink', 'star', 32, '粉色星星人', 'xing', 1204, 20, 171, ['星星人'], { swap: { Y: 'P', y: 'p', M: 'D' } }],
  ['w-mushroom-blue', 'mushroom', 32, '蓝伞蘑菇', 'official', 356, 3, 29, ['植物'], { official: true, swap: { R: 'B' } }],
  ['w-choco', 'icecream', 36, '巧克力甜筒', 'tang', 915, 14, 132, ['甜品'], { swap: { P: 'M', C: 'y' } }],
  ['w-rainbow-soft', 'rainbow', 40, '马卡龙彩虹', 'tang', 1120, 18, 150, ['天气', '可爱'], { swap: { R: 'P', O: 'o', Y: 'y', G: 'g', B: 'b', V: 'v' } }],
  ['w-heart-pink', 'heart', 29, '粉色爱心', 'cheng', 764, 8, 90, ['可爱'], { swap: { R: 'P', D: 'R', P: 'p' } }],
  ['w-sakura-yellow', 'sakura', 32, '迎春花', 'abu', 298, 2, 17, ['花草', '春天'], { swap: { p: 'y', P: 'Y', D: 'O' } }],
  ['w-frog-night', 'frog', 32, '月光青蛙', 'lu', 452, 6, 40, ['动物'], { swap: { G: 'E', g: 'G' } }],
];

export const WORKS = WORK_SPECS.map(([id, motif, size, title, author, likes, comments, reuses, tags, extra], index) => {
  const pattern = makePattern(id, motif, size, extra.swap);
  const usage = colorUsage(pattern.keys);
  return {
    id, motif, title, author: AUTHORS[author], likes, comments, reuses, tags,
    featured: Boolean(extra.featured), official: Boolean(extra.official),
    daysAgo: [1, 2, 2, 3, 4, 5, 6, 8, 9, 11, 12, 14, 15, 18, 20, 22, 25, 27, 30, 33][index],
    pattern, usage,
    colorCount: usage.length,
    beads: usage.reduce((sum, color) => sum + color.count, 0),
    boards: Math.ceil(size / 29) ** 2,
    spec: '5mm · 29×29',
    palette: 'MARD 豆色绘经典 291 色',
  };
});

export function getWork(id) {
  return WORKS.find((work) => work.id === id) ?? WORKS[0];
}
export function relatedWorks(work, limit = 5) {
  return WORKS.filter((item) => item.id !== work.id && item.tags.some((tag) => work.tags.includes(tag))).slice(0, limit);
}
export function worksBy(authorId, exceptId) {
  return WORKS.filter((item) => item.author.id === authorId && item.id !== exceptId);
}

const iconPattern = (id, motif, size = 13) => makePattern(`icon-${id}`, motif, size);
const allIcon = {
  id: 'icon-all', width: 5, height: 5,
  keys: ['R', 'R', null, 'Y', 'Y', 'R', 'R', null, 'Y', 'Y', null, null, null, null, null, 'B', 'B', null, 'G', 'G', 'B', 'B', null, 'G', 'G'],
};
export const CATEGORIES = [
  { id: 'all', label: '全部', icon: allIcon },
  { id: 'featured', label: '精选', icon: iconPattern('featured', 'star') },
  { id: '动物', label: '动物', icon: iconPattern('animal', 'panda') },
  { id: '猫咪', label: '猫咪', icon: iconPattern('cat', 'cat') },
  { id: '星星人', label: '星星人', icon: iconPattern('starman', 'star', 11) },
  { id: '水果', label: '水果', icon: iconPattern('fruit', 'strawberry') },
  { id: '甜品', label: '甜品', icon: iconPattern('dessert', 'icecream') },
  { id: '花草', label: '花草', icon: iconPattern('flower', 'sakura') },
  { id: '植物', label: '植物', icon: iconPattern('plant', 'mushroom') },
  { id: '天气', label: '天气', icon: iconPattern('weather', 'rainbow') },
  { id: '夏天', label: '夏天', icon: iconPattern('summer', 'watermelon') },
  { id: '可爱', label: '可爱', icon: iconPattern('cute', 'heart', 11) },
];

export const ME = { id: 'lu', name: '小鹿拼豆', email: 'lu@example.com', color: '#e0473f', storageUsed: 0.62, storageTotal: 2 };

export const DESIGNS = [
  { id: 'd-cat', name: '橘猫团子 · 大号', motif: 'cat', size: 48, status: 'draft', updated: '12 分钟前', cloud: 'synced' },
  { id: 'd-rainbow', name: '彩虹挂件', motif: 'rainbow', size: 58, status: 'stitching', progress: 32, updated: '2 小时前', cloud: 'synced' },
  { id: 'd-sakura', name: '草莓小甜心', motif: 'strawberry', size: 29, status: 'published', updated: '昨天', cloud: 'synced' },
  { id: 'd-heart', name: '小黄鸡钥匙扣', motif: 'chick', size: 24, status: 'draft', updated: '昨天', cloud: 'local' },
  { id: 'd-panda', name: '熊猫冰箱贴', motif: 'panda', size: 36, status: 'stitching', progress: 78, updated: '3 天前', cloud: 'synced' },
  { id: 'd-icecream', name: '心动爱心', motif: 'heart', size: 24, status: 'published', updated: '上周', cloud: 'synced' },
].map((design) => ({ ...design, pattern: makePattern(design.id, design.motif, design.size), colors: colorUsage(makePattern(design.id, design.motif, design.size).keys).length }));

export const COMMENTS = [
  { author: AUTHORS.lu, text: '照着拼了一个挂在包上，颜色和图纸几乎一样！A4 杏橙换成 A7 会更像橘猫。', when: '2 小时前' },
  { author: AUTHORS.xing, text: '耳朵内侧的粉色好可爱，一块 29×29 板刚好放下。', when: '昨天' },
  { author: AUTHORS.abu, text: '新手第一次拼，大概用了 40 分钟，熨的时候注意中间别烫过头。', when: '3 天前' },
];

export const HOT_SEARCHES = ['星星人', '猫咪', '冰淇淋', '樱花', '彩虹', '钥匙扣'];

export function beadHex(key) {
  return BEADS[key].hex;
}
