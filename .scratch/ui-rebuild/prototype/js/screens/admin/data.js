// 后台模拟数据：作品、审核队列、评论、举报、人员、标签、批次、日志、审计。
// 全部是会话内存状态：在后台里的操作会保留到刷新页面为止，不影响用户端页面的数据。
import { WORKS, AUTHORS, CATEGORIES } from '../../data.js';
import { BEADS, rasterize, colorUsage } from '../../../motifs.js';

// 原型里的“现在”：2026-09-23 14:32。
const NOW = new Date(2026, 8, 23, 14, 32);
const pad = (n) => String(n).padStart(2, '0');
export function at(minutesAgo) { return new Date(NOW.getTime() - minutesAgo * 60000); }
export function fmtDate(minutesAgo) {
  const d = at(minutesAgo);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtAgo(minutesAgo) {
  if (minutesAgo < 1) return '刚刚';
  if (minutesAgo < 60) return `${minutesAgo} 分钟前`;
  if (minutesAgo < 24 * 60) return `${Math.floor(minutesAgo / 60)} 小时前`;
  const d = at(minutesAgo);
  if (minutesAgo < 48 * 60 && d.getDate() === at(24 * 60).getDate()) return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return fmtDate(minutesAgo);
}
export function fmtDay(minutesAgo) {
  const d = at(minutesAgo);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const fmtNum = (n) => n.toLocaleString('en-US');

const hex = (key) => BEADS[key].hex;
function makePattern(id, motif, size, swap = null) {
  let keys = rasterize(motif, size);
  if (swap) keys = keys.map((key) => (key && swap[key]) || key);
  return { id, width: size, height: size, keys };
}

// ---------- 作品 ----------
const WORK_PATCH = {
  'w-sakura-yellow': { status: 'pending', isPublic: false },
  'w-choco': { status: 'pending', isPublic: false },
  'w-frog-night': { status: 'removed', isPublic: false, removedReason: '疑似转载他人图纸' },
  'w-heart-pink': { status: 'removed', isPublic: false, removedReason: '标题含联系方式' },
  'w-chick': { isPublic: false },
  'w-heart': { commentsLocked: true },
};
export const works = WORKS.map((work, index) => ({
  id: work.id,
  title: work.title,
  author: work.author,
  pattern: work.pattern,
  likes: work.likes,
  comments: work.comments,
  reuses: work.reuses,
  colorCount: work.colorCount,
  beads: work.beads,
  official: work.official,
  featured: work.featured,
  tags: [...work.tags],
  status: 'normal',
  isPublic: true,
  commentsLocked: false,
  publishedMin: work.daysAgo * 1440 + 180 + index * 23,
  updatedMin: Math.max(35, work.daysAgo * 1440 - 300 - index * 41),
  ...WORK_PATCH[work.id],
}));
export const WORK_STATUS = { normal: ['正常', 'success'], removed: ['已下架', 'danger'], pending: ['待审', 'warning'] };

// ---------- 作品审核队列 ----------
export const reviews = [
  {
    id: 'r-sakura', title: '樱花发夹', author: AUTHORS.xing, revision: 2, submittedMin: 12,
    pattern: makePattern('r-sakura', 'sakura', 32, { D: 'V', P: 'v', p: 'W' }), photo: ['b', 'W'],
    tags: ['花草', '春天'], lastReject: '花心颜色与原图不一致', note: '按意见把花心改成了橘色，花瓣换成薰衣草色。',
  },
  {
    id: 'r-chick', title: '戴花小黄鸡', author: AUTHORS.cheng, revision: 1, submittedMin: 38,
    pattern: makePattern('r-chick', 'chick', 29), photo: ['y', 'W'], tags: ['动物', '可爱'], note: '',
  },
  {
    id: 'r-panda', title: '抱竹子的熊猫', author: AUTHORS.abu, revision: 1, submittedMin: 126,
    pattern: makePattern('r-panda', 'panda', 36, { p: 'P' }), photo: ['g', 'W'], tags: ['动物'], note: '给朋友做的生日礼物，欢迎一起拼。',
  },
].map((item) => {
  const usage = colorUsage(item.pattern.keys);
  return { ...item, colorCount: usage.length, beads: usage.reduce((sum, color) => sum + color.count, 0), checks: [false, false, false, false] };
});
export const REVIEW_CHECKS = [
  '图纸与作者原图是同一主体，不是转载他人的图纸',
  '作者已声明原创，或注明了授权来源',
  '标题、标签和图片里没有联系方式、广告或二维码',
  '许可为「仅限个人制作使用」，与作者的选择一致',
];

// ---------- 人员 ----------
const USER_SPECS = [
  ['u-1001', '小鹿拼豆', 'lu', 'admin', 'active', 6, 420, 2, 'R'],
  ['u-1002', '豆色绘官方', 'official', 'admin', 'active', 38, 402, 64, 'K'],
  ['u-1003', '阿布的豆盒', 'abu', 'reviewer', 'active', 12, 380, 25, 'G'],
  ['u-1004', '橙子手作', 'cheng', 'user', 'active', 9, 301, 180, 'O'],
  ['u-1005', '星星收集者', 'xing', 'user', 'active', 14, 262, 12, 'B'],
  ['u-1006', '半糖工作室', 'tang', 'user', 'active', 11, 211, 45, 'V'],
  ['u-1007', '路过的豆子', 'passby', 'user', 'suspended', 0, 3, 1500, 'S'],
  ['u-1008', '糯米团子', 'nuomi', 'user', 'active', 3, 122, 300, 'D'],
  ['u-1009', '像素阿柒', 'aqi', 'user', 'active', 7, 96, 90, 'E'],
  ['u-1010', '一颗豆', 'yikedou', 'user', 'unverified', 0, 1, 30, 'T'],
  ['u-1011', '星河拼豆', 'xinghe', 'user', 'active', 5, 81, 600, 'B'],
  ['u-1012', '橘子汽水', 'juzi', 'user', 'active', 2, 75, 2000, 'O'],
  ['u-1013', '小熊软糖', 'ruantang', 'user', 'active', 4, 60, 150, 'M'],
  ['u-1014', '蓝莓派', 'lanmei', 'user', 'active', 1, 52, 4000, 'V'],
  ['u-1015', '栗子', 'lizi', 'user', 'suspended', 2, 44, 9000, 'M'],
  ['u-1016', '奶盖', 'naigai', 'user', 'active', 0, 30, 800, 'T'],
  ['u-1017', '芒果冰', 'mango', 'user', 'active', 6, 28, 70, 'O'],
  ['u-1018', '森林小屋', 'forest', 'user', 'active', 3, 21, 1300, 'E'],
  ['u-1019', '木木', 'mumu', 'user', 'active', 1, 15, 220, 'S'],
  ['u-1020', '白桃乌龙', 'baitao', 'user', 'active', 2, 9, 40, 'R'],
  ['u-1021', '花卷', 'huajuan', 'user', 'active', 0, 6, 3000, 'G'],
  ['u-1022', '拼豆新手 1024', 'newbie1024', 'user', 'unverified', 0, 2, 100, 'D'],
  ['u-1023', '豆豆爱拼图', 'doudou', 'user', 'active', 8, 140, 5, 'K'],
];
const maskEmail = (local) => `${local[0]}${'*'.repeat(3)}${local.length > 1 ? local.at(-1) : ''}@example.com`;
export const users = USER_SPECS.map(([id, name, local, role, status, workCount, joinedDays, lastSeenMin, colorKey]) => ({
  id, name, email: maskEmail(local), role, status, works: workCount,
  joinedMin: joinedDays * 1440 + 200, lastSeenMin, color: hex(colorKey),
  likes: workCount * 137 + (joinedDays % 97), commentCount: Math.round(joinedDays / 6) + workCount,
  self: local === 'lu',
}));
export const ROLES = { admin: ['管理员', 'official'], reviewer: ['审核员', 'info'], user: ['用户', ''] };
export const USER_STATUS = { active: ['正常', 'success'], suspended: ['已暂停', 'danger'], unverified: ['待验证邮箱', 'warning'] };
const person = (name) => users.find((user) => user.name === name) ?? { name, color: hex('S') };

// ---------- 评论 ----------
const COMMENT_SPECS = [
  ['c-01', '加我 V 领取全套图纸，另有代拼服务，价格私聊～', '路过的豆子', 'w-star', 'blocked', '疑似广告引流', 0.96, 25],
  ['c-02', '配色有点怪，照着拼出来和图完全不一样……', '橘子汽水', 'w-watermelon', 'review', '负面评价', 0.58, 47],
  ['c-03', '同款在某宝卖 9.9，这张是不是搬运的？', '栗子', 'w-heart', 'review', '疑似指控', 0.64, 95],
  ['c-04', '私信我，教你一个月靠拼豆赚两万', '路过的豆子', 'w-panda', 'blocked', '疑似广告', 0.99, 160],
  ['c-05', '太丑了，别再发这种东西了', '蓝莓派', 'w-frog', 'review', '不友善', 0.71, 210],
  ['c-06', '照着拼了一个挂在包上，颜色和图纸几乎一样！', '小鹿拼豆', 'w-cat', 'passed', '', 0.02, 300],
  ['c-07', '耳朵内侧的粉色好可爱，一块 29×29 板刚好放下。', '星星收集者', 'w-cat', 'passed', '', 0.01, 420],
  ['c-08', '新手第一次拼，大概用了 40 分钟，熨的时候注意别烫过头。', '阿布的豆盒', 'w-icecream', 'passed', '', 0.03, 610],
  ['c-09', '求出一个 2.6mm 迷你豆的版本！', '芒果冰', 'w-strawberry', 'passed', '', 0.01, 900],
  ['c-10', '扫码进群领更多图纸', '路过的豆子', 'w-rainbow', 'deleted', '广告引流', 0.98, 1300],
  ['c-11', '这个配色太适合秋天了', '白桃乌龙', 'w-sakura', 'passed', '', 0.02, 1700],
  ['c-12', '熊猫的黑眼圈可以再大一格吗？', '像素阿柒', 'w-panda', 'passed', '', 0.04, 2300],
  ['c-13', '你们这些人真无聊', '栗子', 'w-star', 'deleted', '不友善', 0.83, 3200],
  ['c-14', '已收藏，周末和孩子一起拼', '豆豆爱拼图', 'w-chick', 'passed', '', 0.01, 4100],
];
export const comments = COMMENT_SPECS.map(([id, text, authorName, workId, verdict, reason, score, minutesAgo]) => ({
  id, text, author: person(authorName), work: works.find((work) => work.id === workId), verdict, reason, score, minutesAgo,
}));
export const VERDICTS = { review: ['建议复核', 'warning'], blocked: ['已拦截', 'danger'], passed: ['已通过', 'success'], deleted: ['已删除', ''] };
export const isCommentPending = (comment) => comment.verdict === 'review' || comment.verdict === 'blocked';

// ---------- 举报 ----------
const workById = (id) => works.find((work) => work.id === id);
export const reports = [
  { id: 'rp-208', kind: 'work', work: workById('w-heart'), reason: '疑似搬运', detail: '和另一个平台上一位作者的图纸一模一样，连配色都没改。', reporter: person('星河拼豆'), status: 'open', minutesAgo: 64 },
  { id: 'rp-207', kind: 'comment', comment: comments[0], reason: '广告引流', detail: '评论里留了联系方式，还在其他作品下刷屏。', reporter: person('糯米团子'), status: 'open', minutesAgo: 182 },
  { id: 'rp-206', kind: 'user', user: person('路过的豆子'), reason: '垃圾账号', detail: '注册当天就在十几件作品下发广告。', reporter: person('阿布的豆盒'), status: 'resolved', resolution: '已暂停账号', minutesAgo: 1460 },
  { id: 'rp-205', kind: 'work', work: workById('w-frog-night'), reason: '疑似搬运', detail: '原图来自某个表情包，作者不是原创。', reporter: person('像素阿柒'), status: 'resolved', resolution: '已下架作品', minutesAgo: 2890 },
  { id: 'rp-204', kind: 'comment', comment: comments[12], reason: '不友善', detail: '人身攻击。', reporter: person('白桃乌龙'), status: 'resolved', resolution: '已删除评论', minutesAgo: 3300 },
  { id: 'rp-203', kind: 'work', work: workById('w-star'), reason: '侵权', detail: '星星人是某动画角色，担心侵权。', reporter: person('木木'), status: 'dismissed', resolution: '原创造型，未侵权', minutesAgo: 5200 },
  { id: 'rp-202', kind: 'work', work: workById('w-heart-pink'), reason: '含联系方式', detail: '标题里有微信号。', reporter: person('芒果冰'), status: 'resolved', resolution: '已下架作品', minutesAgo: 7400 },
  { id: 'rp-201', kind: 'comment', comment: comments[1], reason: '不友善', detail: '觉得这条评论在阴阳怪气。', reporter: person('橙子手作'), status: 'dismissed', resolution: '正常评价，保留', minutesAgo: 9100 },
];
export const REPORT_STATUS = { open: ['待处理', 'warning'], resolved: ['已处理', 'success'], dismissed: ['已驳回', ''] };
export const REPORT_KIND = { work: '作品', comment: '评论', user: '账号' };

// ---------- 标签 ----------
const tagIcon = (id, motif, size = 13) => makePattern(`tag-${id}`, motif, size);
const EXTRA_TAGS = [
  { id: '春天', label: '春天', icon: tagIcon('spring', 'sakura', 11) },
  { id: '钥匙扣', label: '钥匙扣', icon: tagIcon('keychain', 'heart', 9) },
  { id: '节日', label: '节日', icon: tagIcon('festival', 'star', 11) },
  { id: '杯垫', label: '杯垫', icon: tagIcon('coaster', 'watermelon', 13) },
];
export const tags = [...CATEGORIES.filter((cat) => !['all', 'featured'].includes(cat.id)), ...EXTRA_TAGS].map((cat, index) => ({
  id: cat.id, name: cat.label, icon: cat.icon, order: index + 1,
  featured: index < 10, enabled: cat.id !== '杯垫',
  count: works.filter((work) => work.tags.includes(cat.id)).length,
}));
export const TAG_ICONS = ['cat', 'panda', 'star', 'strawberry', 'icecream', 'sakura', 'mushroom', 'rainbow', 'watermelon', 'heart', 'chick', 'frog']
  .map((motif) => ({ motif, pattern: tagIcon(`pick-${motif}`, motif, 13) }));
export const tagIconFor = (motif) => TAG_ICONS.find((item) => item.motif === motif)?.pattern;

// ---------- 官方批次 ----------
export const batches = [
  { id: 'b-2609', name: '秋日动物系列', total: 12, done: 9, failed: 0, status: 'running', creator: person('小鹿拼豆'), updatedMin: 40, spec: '5mm · 29×29', sample: ['w-cat', 'w-panda', 'w-frog', 'w-chick', 'w-cat-gray', 'w-frog-night'] },
  { id: 'b-2608', name: '中秋灯笼', total: 8, done: 8, failed: 0, status: 'published', creator: person('豆色绘官方'), updatedMin: 1500, spec: '5mm · 29×29', sample: ['w-star', 'w-star-pink', 'w-heart'] },
  { id: 'b-2607', name: '水果贴纸', total: 20, done: 17, failed: 3, status: 'failed', creator: person('阿布的豆盒'), updatedMin: 2950, spec: '2.6mm · 29×29', sample: ['w-strawberry', 'w-watermelon', 'w-mushroom', 'w-mushroom-blue'] },
  { id: 'b-2606', name: '节气 · 秋分', total: 6, done: 0, failed: 0, status: 'draft', creator: person('小鹿拼豆'), updatedMin: 4400, spec: '5mm · 29×29', sample: [] },
  { id: 'b-2605', name: '夏日甜品', total: 15, done: 15, failed: 0, status: 'published', creator: person('豆色绘官方'), updatedMin: 20100, spec: '5mm · 29×29', sample: ['w-icecream', 'w-choco'] },
  { id: 'b-2604', name: '星星人第二季', total: 10, done: 10, failed: 0, status: 'published', creator: person('豆色绘官方'), updatedMin: 43000, spec: '5mm · 29×29', sample: ['w-star', 'w-star-pink'] },
].map((batch) => ({ ...batch, sample: batch.sample.map(workById).filter(Boolean) }));
export const BATCH_STATUS = { running: ['进行中', 'info'], published: ['已发布', 'success'], failed: ['部分失败', 'danger'], draft: ['草稿', ''] };

// ---------- 运行日志 ----------
const LOG_SPECS = [
  ['warn', 'mail', 'mail.delivery.delayed', '发信服务限流，验证码邮件排队 46 封', 3],
  ['error', 'api', 'api.request.failed', 'POST /api/community/works 返回 502：对象存储上传超时', 9],
  ['info', 'job', 'moderation.quota', '内容安全今日调用 312 / 2000', 15],
  ['warn', 'api', 'comment.moderation.timeout', '内容安全接口 3 秒未响应，评论已转人工复核', 26],
  ['info', 'api', 'review.approved', '投稿「星空杯垫」已通过并发布', 41],
  ['error', 'page', 'page.render.error', '详情页渲染失败：色号清单缺少 colorUsage 字段', 58],
  ['info', 'job', 'job.cleanup.originals', '清理 30 天前的临时原图 128 张，释放 212 MB', 75],
  ['warn', 'api', 'auth.login.throttled', '同一网络地址 5 分钟内登录失败 8 次，已限流', 96],
  ['info', 'api', 'batch.item.generated', '批次「秋日动物系列」生成第 9 / 12 张', 120],
  ['error', 'job', 'job.batch.failed', '批次「水果贴纸」3 张原图无法解码（HEIC）', 150],
  ['info', 'api', 'user.role.changed', '「阿布的豆盒」角色调整为审核员', 190],
  ['warn', 'page', 'page.slow', '发现页首屏 3.4 秒，超过 2.5 秒目标', 240],
  ['info', 'job', 'job.analytics.daily', '匿名统计日汇总完成：昨日访客 1,862', 750],
  ['error', 'api', 'db.query.slow', '作品列表查询 1,280 ms，缺少 tags 索引', 800],
  ['info', 'api', 'work.featured', '「草莓小甜心」被设为精选', 900],
  ['warn', 'mail', 'mail.bounce', '退信 2 封：收件地址不存在', 1100],
  ['info', 'job', 'job.backup.skipped', '备份任务未配置，已跳过', 1440],
  ['info', 'api', 'review.rejected', '投稿「像素奶茶」被驳回：含联系方式', 1560],
  ['error', 'api', 'api.request.failed', 'GET /api/designs/d-cat/thumbnail 返回 500：渲染超时', 1700],
  ['info', 'api', 'user.suspended', '账号「路过的豆子」已暂停', 1900],
  ['warn', 'api', 'storage.quota', '原图私有桶已用 38%', 2100],
  ['info', 'job', 'job.analytics.daily', '匿名统计日汇总完成：访客 1,733', 2190],
  ['info', 'api', 'tag.merged', '标签「猫」合并到「猫咪」', 2500],
  ['error', 'page', 'page.render.error', '编辑器加载字体失败，已回退到系统字体', 2900],
  ['info', 'api', 'batch.published', '批次「中秋灯笼」8 张已发布', 3000],
  ['warn', 'api', 'comment.moderation.timeout', '内容安全接口 3 秒未响应，评论已转人工复核', 3600],
  ['info', 'job', 'job.cleanup.originals', '清理 30 天前的临时原图 96 张，释放 150 MB', 4300],
  ['info', 'api', 'work.removed', '「月光青蛙」已下架：疑似转载', 4400],
  ['warn', 'page', 'page.slow', '编辑器首帧 2.9 秒，超过 2.5 秒目标', 5000],
  ['info', 'job', 'job.analytics.daily', '匿名统计日汇总完成：访客 1,690', 5070],
];
export const logs = LOG_SPECS.map(([level, source, event, message, minutesAgo], index) => ({
  id: `log-${String(9000 - index)}`, level, source, event, message, minutesAgo,
  request: `req_${(0x3fa2c + index * 7919).toString(16)}`,
}));
export const LOG_LEVEL = { error: ['错误', 'danger'], warn: ['警告', 'warning'], info: ['信息', ''] };
export const LOG_SOURCE = { api: '接口', page: '页面', job: '定时任务', mail: '邮件' };

// ---------- 审计记录 ----------
const AUDIT_SPECS = [
  ['小鹿拼豆', '设为精选', '作品「草莓小甜心」', '本周首页推荐', 30],
  ['阿布的豆盒', '通过投稿', '作品「星空杯垫」', '', 41],
  ['小鹿拼豆', '调整角色', '账号「阿布的豆盒」', '用户 → 审核员', 190],
  ['阿布的豆盒', '驳回投稿', '作品「像素奶茶」', '标题含联系方式', 1560],
  ['小鹿拼豆', '暂停账号', '账号「路过的豆子」', '多次发布广告引流评论', 1900],
  ['阿布的豆盒', '删除评论', '评论「扫码进群领更多图纸」', '广告引流', 1310],
  ['小鹿拼豆', '合并标签', '标签「猫」→「猫咪」', '重复标签', 2500],
  ['豆色绘官方', '发布批次', '批次「中秋灯笼」', '8 张', 3000],
  ['阿布的豆盒', '下架作品', '作品「月光青蛙」', '疑似转载他人图纸', 4400],
  ['小鹿拼豆', '锁定评论', '作品「心动爱心」', '评论区争吵', 4700],
  ['阿布的豆盒', '驳回举报', '举报 #rp-203', '原创造型，未侵权', 5200],
  ['小鹿拼豆', '下架作品', '作品「粉色爱心」', '标题含联系方式', 7400],
  ['豆色绘官方', '新建标签', '标签「杯垫」', '', 8800],
  ['阿布的豆盒', '删除评论', '评论「你们这些人真无聊」', '不友善', 3300],
  ['小鹿拼豆', '取消精选', '作品「蓝伞蘑菇」', '轮换精选', 10200],
  ['豆色绘官方', '发布批次', '批次「夏日甜品」', '15 张', 20100],
];
export const audits = AUDIT_SPECS.map(([actor, action, target, note, minutesAgo], index) => ({
  id: `a-${5200 - index}`, actor: person(actor), action, target, note, minutesAgo, ip: `10.0.${(index * 37) % 200}.×××`,
})).sort((a, b) => a.minutesAgo - b.minutesAgo);

// ---------- 总览：趋势、服务 ----------
export const TREND_DAYS = Array.from({ length: 7 }, (_, index) => {
  const d = at((6 - index) * 1440);
  return { short: index === 6 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}`, long: `${d.getMonth() + 1}月${d.getDate()}日` };
});
export const TREND = [
  { key: 'posts', label: '投稿', color: 'var(--ink)', values: [6, 9, 7, 12, 10, 14, 11] },
  { key: 'likes', label: '点赞', color: hex('O'), values: [28, 34, 31, 45, 39, 52, 47] },
  { key: 'users', label: '新用户', color: hex('B'), values: [12, 15, 11, 18, 16, 22, 19] },
];
export const SERVICES = [
  { id: 'db', name: '数据库', icon: 'database', ok: true, detail: '延迟 4 ms' },
  { id: 'storage', name: '对象存储', icon: 'cloud', ok: true, detail: '已用 38%' },
  { id: 'moderation', name: '内容安全', icon: 'shield-check', ok: true, detail: '今日 312 次' },
  { id: 'mail', name: '邮件', icon: 'mail', ok: false, detail: '排队 46 封', reason: '发信服务限流，验证码约晚 3 分钟送达。' },
];
export const MODERATION = { used: 312, quota: 2000, spark: [240, 262, 251, 298, 276, 288, 312] };

// ---------- 计数（侧栏、总览指标共用） ----------
export function counts() {
  return {
    reviews: reviews.length,
    comments: comments.filter(isCommentPending).length,
    reports: reports.filter((report) => report.status === 'open').length,
  };
}
