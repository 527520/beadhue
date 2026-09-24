// R15 终审对照：给 E2E 种子库服务补齐走查数据（尽量贴近原型 prototype/js/data.js），可重复运行（已有就跳过）。
// 用法（仓库根目录）：IMPL_BASE=http://127.0.0.1:3160 node .scratch/ui-rebuild/tools/audit-seed.mjs
// 服务需以 BEADHUE_E2E_SEED=1、内存 PGlite 启动（见 implementation-guide.md「运行应用与种子数据」）。
// 只用公开 / 后台接口。输出 evidence/audit/fixtures.json，供 audit-matrix.mjs 取作品 id、设计 id、作者 id 与账号。
// 官方批次作品 + 标签 + 喜欢 + 用户设计的做法沿用 capture-current.mjs 的 seed()（那个文件导入即运行，故在此复刻并逐步加存在性检查）。
// 补齐：10 个类目标签设为精选并配像素图标；「橘猫团子」3 条评论（用户 / 版主 / 管理员）；e2e-user 的 6 份设计（5 份带已对齐原图，
// 「小黄鸡钥匙扣」无原图）；自定义色板「夏日水果」；投稿「心动爱心」经管理员通过（产生通知 + 普通作者主页有作品）；
// 投稿「草莓小甜心 · 用户投稿」留在审核队列；「熊猫冰箱贴」的只读分享链接（每次运行重建，旧链接失效）；运行日志 2 条。
// 跟拼进度只存浏览器 IndexedDB，由 audit-matrix.mjs 准备阶段在「彩虹挂件」上造。
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { BEADS, MOTIF_IDS, motifTitle, rasterize } from '../prototype/motifs.js';

const BASE = process.env.IMPL_BASE ?? 'http://127.0.0.1:3160';
const OUT = resolve('.scratch/ui-rebuild/evidence/audit');
const PASSWORD = 'E2e-pass-123!';
const ACCOUNTS = { admin: 'e2e-admin@example.com', user: 'e2e-user@example.com', moderator: 'e2e-moderator@example.com' };
const LICENSE = 'limited-platform-license-v1-draft';
const PHOTO = resolve('.scratch/ui-rebuild/evidence/photo-cat.png');
mkdirSync(OUT, { recursive: true });

const log = (...args) => console.log('[seed]', ...args);
const warnings = [];
const warn = (...args) => { const line = args.join(' '); warnings.push(line); console.log('[seed] 警告', line); };

// 原型 data.js 的类目顺序与图标键（与 shoot-discover.mjs setup 一致）。
const CATEGORIES = [['动物', 'panda'], ['猫咪', 'cat'], ['星星人', 'star'], ['水果', 'strawberry'], ['甜品', 'icecream'], ['花草', 'sakura'], ['植物', 'mushroom'], ['天气', 'rainbow'], ['夏天', 'watermelon'], ['可爱', 'heart']];
const TAG_PLAN = { 草莓小甜心: ['水果', '可爱'], 夏日西瓜: ['水果', '夏天'], 橘猫团子: ['动物', '猫咪'], 熊猫滚滚: ['动物'], 呱呱青蛙: ['动物'], 小黄鸡: ['动物', '可爱'], 星星人: ['星星人', '可爱'], 云朵彩虹: ['天气', '可爱'], 春日樱花: ['花草', '春天'], 双球冰淇淋: ['甜品', '夏天'], 红伞蘑菇: ['植物'], 心动爱心: ['可爱'] };
// 原型 DESIGNS：名称、图案、宽度；original 表示补一张原图，progress 表示跟拼进度由截图脚本在浏览器里造（进度只存本机 IndexedDB）。
const DESIGNS = [
  { key: 'cat', name: '橘猫团子 · 大号', motif: 'cat', size: 48, original: true },
  { key: 'rainbow', name: '彩虹挂件', motif: 'rainbow', size: 58, original: true, stitch: true },
  { key: 'strawberry', name: '草莓小甜心', motif: 'strawberry', size: 29, original: true },
  { key: 'chick', name: '小黄鸡钥匙扣', motif: 'chick', size: 24, original: false },
  { key: 'panda', name: '熊猫冰箱贴', motif: 'panda', size: 36, original: true },
  { key: 'heart', name: '心动爱心', motif: 'heart', size: 24, original: true },
];
const COMMENTS = [
  ['user', '照着拼了一个挂在包上，颜色和图纸几乎一样！A4 杏橙换成 A7 会更像橘猫。'],
  ['moderator', '耳朵内侧的粉色好可爱，一块 29×29 板刚好放下。'],
  ['admin', '新手第一次拼，大概用了 40 分钟，熨的时候注意中间别烫过头。'],
];

async function api(page, method, url, body, headers = {}) {
  return page.evaluate(async ({ method, url, body, headers }) => {
    const init = { method, headers: { ...headers } };
    if (body !== undefined) {
      if (body && body.__bytes) {
        init.body = Uint8Array.from(atob(body.__bytes), (c) => c.charCodeAt(0));
        init.headers['content-type'] = body.type;
      } else {
        init.body = JSON.stringify(body);
        init.headers['content-type'] = 'application/json';
      }
    }
    if (method !== 'GET') init.headers['idempotency-key'] = crypto.randomUUID();
    const response = await fetch(url, init);
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON */ }
    return { status: response.status, json, text: text.slice(0, 300) };
  }, { method, url, body, headers });
}

async function must(label, promise) {
  const result = await promise;
  if (result.status >= 300) throw new Error(`${label} 失败：${result.status} ${result.text}`);
  return result.json;
}

async function session(browser, role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/api/auth/me`);
  await must(`登录 ${role}`, api(page, 'POST', '/api/auth/login', { email: ACCOUNTS[role], password: PASSWORD }));
  const me = await must(`读取 ${role}`, api(page, 'GET', '/api/auth/me'));
  return { context, page, me };
}

function toSnapshot(id, size, base) {
  const keys = rasterize(id, size);
  const used = [...new Set(keys.filter(Boolean))];
  return {
    version: 1,
    engineVersion: base.engineVersion,
    boardProfile: '5mm-29',
    paletteSelection: { palette: { kind: 'custom', colors: used.map((key) => ({ code: BEADS[key].code, hex: BEADS[key].hex })) }, kitTier: 0 },
    params: { ...base.params, targetWidth: size, targetColorCount: Math.max(2, used.length) },
    pattern: { width: size, height: size, cells: keys.map((key) => key ? { hex: BEADS[key].hex, code: BEADS[key].code, transparent: false } : { hex: null, code: null, transparent: true }) },
  };
}

function toProject(design, base, index) {
  const snapshot = toSnapshot(design.motif, design.size, base);
  const now = Date.now();
  return {
    format: 'beadhue-project', version: 3, engineVersion: base.engineVersion, boardProfile: '5mm-29', name: design.name,
    createdAt: new Date(now - (index + 2) * 36e5).toISOString(), updatedAt: new Date(now - index * 18e5).toISOString(),
    paletteSelection: snapshot.paletteSelection, params: snapshot.params, pattern: snapshot.pattern,
  };
}

/** 按图案在浏览器里画一张 PNG（每格一个色块，米色底）作为原图，让原图参照、引用交接都有可解码的图片；1×1 占位图在引用时会报「无法解析」。 */
async function motifPng(page, motif, size) {
  const hexes = rasterize(motif, size).map((key) => (key ? BEADS[key].hex : null));
  return page.evaluate(({ hexes, size }) => {
    const scale = Math.max(8, Math.floor(480 / size));
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size * scale;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f4efe6';
    context.fillRect(0, 0, canvas.width, canvas.height);
    hexes.forEach((hex, index) => { if (!hex) return; context.fillStyle = hex; context.fillRect((index % size) * scale, Math.floor(index / size) * scale, scale, scale); });
    return canvas.toDataURL('image/png').split(',')[1];
  }, { hexes, size });
}

const titleOf = (item) => item?.title ?? item?.currentTitle ?? item?.revision?.title ?? item?.revisions?.[0]?.title;
const isOfficial = (item) => item?.author?.authorType !== 'user';
const listItems = (json) => json?.items ?? json?.designs ?? [];

async function publicWorks(page) {
  const all = [];
  let cursor = null;
  for (let i = 0; i < 6; i += 1) {
    const json = await must('读取公开作品', api(page, 'GET', `/api/community/works?sort=latest${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`));
    all.push(...listItems(json));
    cursor = json.nextCursor;
    if (!cursor) break;
  }
  return all;
}

// ---------- 官方批次作品（capture-current seed 的第一段）----------
async function seedOfficialWorks(admin, base) {
  const existing = await publicWorks(admin.page);
  const have = new Set(existing.filter(isOfficial).map(titleOf));
  const missing = MOTIF_IDS.filter((id) => !have.has(motifTitle(id)));
  if (!missing.length) { log('官方作品：已存在，跳过'); return; }
  const batch = await must('新建批次', api(admin.page, 'POST', '/api/admin/batches', { itemCount: missing.length, defaultParams: base.params, engineVersion: base.engineVersion, reason: '界面走查样例作品' }));
  const revisionIds = [];
  for (const id of missing) {
    const index = MOTIF_IDS.indexOf(id);
    const size = [29, 29, 32, 24, 29, 32, 36, 29, 29, 32, 29, 32][index % 12];
    const draft = await api(admin.page, 'POST', `/api/admin/batches/${batch.id}/drafts`, { title: motifTitle(id), snapshot: toSnapshot(id, size, base), reason: '界面走查样例作品' });
    if (draft.status >= 300) { warn('草稿失败', id, draft.status, draft.text); continue; }
    const original = await api(admin.page, 'PUT', `/api/community/revisions/${draft.json.revisionId}/original`, { __bytes: await motifPng(admin.page, id, size), type: 'image/png' });
    if (original.status >= 300) warn('草稿原图失败', id, original.status, original.text);
    revisionIds.push(draft.json.revisionId);
  }
  const current = await must('读取批次', api(admin.page, 'GET', '/api/admin/batches'));
  const version = listItems(current).find((item) => item.id === batch.id)?.version ?? batch.version;
  await must('发布批次', api(admin.page, 'POST', `/api/admin/batches/${batch.id}/publish`, { revisionIds, expectedVersion: version, reason: '界面走查样例作品' }));
  log('官方作品：发布', revisionIds.length, '件');
}

async function seedWorkTags(admin) {
  const works = await must('后台作品列表', api(admin.page, 'GET', '/api/admin/community/works?size=50'));
  let changed = 0;
  for (const item of listItems(works)) {
    const tags = TAG_PLAN[titleOf(item)];
    if (!tags) continue;
    const current = (item.tags ?? []).map((tag) => (typeof tag === 'string' ? tag : tag.name));
    if (tags.every((tag) => current.includes(tag))) continue;
    const result = await api(admin.page, 'PUT', `/api/admin/community/works/${item.id}/tags`, { expectedVersion: item.version ?? item.workVersion ?? 1, tags: [...new Set([...current, ...tags])] });
    if (result.status >= 300) warn('打标签失败', titleOf(item), result.status, result.text); else { changed += 1; log('作品标签：', titleOf(item), current.join('、') || '（无）', '→', tags.join('、')); }
  }
  log('作品标签：更新', changed, '件');
}

async function seedFeaturedTags(admin) {
  const list = await must('标签列表', api(admin.page, 'GET', '/api/admin/community/tags?size=100'));
  let changed = 0;
  for (const [index, [name, icon]] of CATEGORIES.entries()) {
    const tag = listItems(list).find((item) => item.name === name);
    if (!tag) { warn('缺标签', name); continue; }
    if (tag.featured && tag.icon === icon) continue;
    const result = await api(admin.page, 'PATCH', `/api/admin/community/tags/${tag.id}`, { expectedVersion: tag.version, icon, featured: true, sortOrder: index + 1, reason: '界面走查类目条' });
    if (result.status >= 300) warn('类目标签失败', name, result.status, result.text); else changed += 1;
  }
  log('类目标签：设为精选', changed, '个');
}

async function seedLikes(user) {
  const works = await publicWorks(user.page);
  let liked = 0;
  for (const work of works.filter((item) => isOfficial(item) && MOTIF_IDS.map(motifTitle).includes(titleOf(item))).slice(0, 7)) {
    if (work.liked) continue;
    const result = await api(user.page, 'PUT', `/api/community/works/${work.id}/like`);
    if (result.status >= 300) warn('喜欢失败', titleOf(work), result.status, result.text); else liked += 1;
  }
  log('喜欢：新增', liked, '件');
}

async function seedDesigns(user, base) {
  const existing = listItems(await must('设计列表', api(user.page, 'GET', '/api/designs'))).filter((item) => !item.deleted && !item.deletedAt);
  const out = {};
  for (const [index, design] of DESIGNS.entries()) {
    let found = existing.find((item) => item.name === design.name);
    if (!found) {
      const id = crypto.randomUUID();
      const saved = await must(`保存设计 ${design.name}`, api(user.page, 'PUT', `/api/designs/${id}`, { name: design.name, project: toProject(design, base, index), baseRevision: 0 }));
      found = { id, name: design.name, revision: saved.revision };
      log('设计：新增', design.name);
    }
    const full = await must(`读取设计 ${design.name}`, api(user.page, 'GET', `/api/designs/${found.id}`));
    let revision = full.revision;
    const hasOriginal = Boolean(full.project?.original?.assetId);
    // 原图与图纸同为正方形，整图对齐（单位矩阵）；缺 geometry 时编辑器显示「原图未对齐」。
    if (design.original && hasOriginal && !full.project.original.geometry) {
      const project = { ...full.project, original: { ...full.project.original, geometry: [1, 0, 0, 1, 0, 0] } };
      const bound = await api(user.page, 'PUT', `/api/designs/${found.id}`, { name: design.name, project, baseRevision: revision });
      if (bound.status >= 300) warn('补原图对齐失败', design.name, bound.status, bound.text); else { revision = bound.json.revision; log('设计：补原图对齐', design.name); }
    }
    if (design.original && !hasOriginal) {
      // 橘猫用原型同款照片（evidence/photo-cat.png），其余用图案本身渲染的 PNG。
      const bytes = design.motif === 'cat' && existsSync(PHOTO) ? readFileSync(PHOTO).toString('base64') : await motifPng(user.page, design.motif, design.size);
      const asset = await api(user.page, 'PUT', `/api/designs/${found.id}/original`, { __bytes: bytes, type: 'image/png' }, { 'if-match': String(revision) });
      if (asset.status >= 300) warn('上传设计原图失败', design.name, asset.status, asset.text);
      else {
        const project = { ...full.project, original: { sha256: asset.json.sha256, width: asset.json.width, height: asset.json.height, assetId: asset.json.assetId, geometry: [1, 0, 0, 1, 0, 0] } };
        const bound = await api(user.page, 'PUT', `/api/designs/${found.id}`, { name: design.name, project, baseRevision: revision });
        if (bound.status >= 300) warn('绑定设计原图失败', design.name, bound.status, bound.text);
        else { revision = bound.json.revision; log('设计：补原图', design.name); }
      }
    }
    out[design.key] = { id: found.id, name: design.name, width: design.size, height: design.size, revision, original: design.original, stitch: Boolean(design.stitch) };
  }
  return out;
}

async function seedPalette(user) {
  const palettes = listItems(await must('色板列表', api(user.page, 'GET', '/api/palettes')));
  let palette = palettes.find((item) => item.name === '夏日水果');
  if (!palette) {
    const id = crypto.randomUUID();
    await must('新建色板', api(user.page, 'PUT', `/api/palettes/${id}`, { name: '夏日水果', colors: Object.values(BEADS).slice(0, 18).map((bead) => ({ code: bead.code, hex: bead.hex })), baseRevision: 0 }));
    palette = { id, name: '夏日水果' };
    log('色板：新增 夏日水果');
  } else log('色板：已存在，跳过');
  return { id: palette.id, name: palette.name };
}

async function seedComments(sessions, workId) {
  const existing = listItems(await must('评论列表', api(sessions.user.page, 'GET', `/api/community/works/${workId}/comments?order=desc`)));
  let added = 0;
  for (const [role, body] of COMMENTS) {
    if (existing.some((item) => item.body === body)) continue;
    const result = await api(sessions[role].page, 'POST', `/api/community/works/${workId}/comments`, { body });
    if (result.status >= 300) warn('评论失败', role, result.status, result.text); else added += 1;
  }
  log('评论：新增', added, '条');
}

/** 用户投稿：pending 留在审核队列；approve 由管理员通过，产生「投稿通过」通知与普通用户名下的公开作品。 */
async function seedSubmission(user, admin, design, motif, title, approve) {
  const mine = listItems(await must('我的投稿', api(user.page, 'GET', '/api/community/works/mine')));
  const found = mine.find((item) => (item.revisions ?? []).some((revision) => revision.title === title) || titleOf(item) === title);
  if (found) { log('投稿：已存在，跳过', title); return { workId: found.id, title, status: found.revisions?.[0]?.status }; }
  const created = await must(`投稿 ${title}`, api(user.page, 'POST', '/api/community/works', { designId: design.id, expectedDesignRevision: design.revision, title, licenseVersion: LICENSE }));
  await must('投稿原图', api(user.page, 'PUT', `/api/community/revisions/${created.revisionId}/original`, { __bytes: await motifPng(user.page, motif, design.width), type: 'image/png' }));
  const submitted = await must('提交审核', api(user.page, 'POST', `/api/community/revisions/${created.revisionId}/submit`, { expectedVersion: created.version }));
  if (approve) {
    await must('审核通过', api(admin.page, 'POST', `/api/admin/community/revisions/${created.revisionId}/review`, { decision: 'published', expectedVersion: submitted.version, reason: '走查夹具：原创清楚' }));
    log('投稿：已通过', title);
  } else log('投稿：进入审核队列', title);
  return { workId: created.workId, revisionId: created.revisionId, title, status: approve ? 'published' : 'pending' };
}

async function seedShare(user, design) {
  const share = await api(user.page, 'POST', `/api/designs/${design.id}/share`, {});
  if (share.status >= 300) { warn('分享链接失败', share.status, share.text); return null; }
  log('分享链接：', share.json.path);
  return share.json;
}

/** 运行日志：内存库启动后是空的，经浏览器错误上报接口写两条，让后台「运行日志」有行可点。 */
async function seedLogs(admin) {
  const list = await api(admin.page, 'GET', '/api/admin/logs');
  if (listItems(list.json).length) { log('运行日志：已有记录，跳过'); return; }
  for (const [message, path] of [['图纸预览渲染失败：Canvas 尺寸超出上限', '/app'], ['ChunkLoadError: Loading chunk 734 failed.', '/community']]) {
    const result = await api(admin.page, 'POST', '/api/internal/client-error', { message, path, digest: `audit-${path.slice(1)}` });
    if (result.status >= 300) warn('写运行日志失败', result.status, result.text);
  }
  log('运行日志：写入 2 条');
}

const browser = await chromium.launch();
const fixtures = { base: BASE, generatedAt: new Date().toISOString(), password: PASSWORD, accounts: ACCOUNTS };
try {
  const admin = await session(browser, 'admin');
  const user = await session(browser, 'user');
  const moderator = await session(browser, 'moderator');
  const sessions = { admin, user, moderator };

  const seedList = await publicWorks(admin.page);
  const seedWork = seedList.find((item) => titleOf(item) === 'E2E 已公开作品') ?? seedList[0];
  if (!seedWork) throw new Error('服务里没有 E2E 种子作品：确认以 BEADHUE_E2E_SEED=1 启动');
  const base = (await must('种子作品详情', api(admin.page, 'GET', `/api/community/works/${seedWork.id}`))).snapshot;

  await seedOfficialWorks(admin, base);
  await seedWorkTags(admin);
  await seedFeaturedTags(admin);
  await seedLikes(user);
  const designs = await seedDesigns(user, base);
  const palette = await seedPalette(user);

  const works = await publicWorks(admin.page);
  const byTitle = (title) => works.find((item) => titleOf(item) === title);
  const cat = byTitle('橘猫团子');
  if (!cat) throw new Error('缺少作品「橘猫团子」');
  await seedComments(sessions, cat.id);

  const approved = await seedSubmission(user, admin, designs.heart, 'heart', '心动爱心', true);
  const pending = await seedSubmission(user, admin, designs.strawberry, 'strawberry', '草莓小甜心 · 用户投稿', false);
  const share = await seedShare(user, designs.panda);
  await seedLogs(admin);

  const refreshed = await publicWorks(admin.page);
  // 「心动爱心」官方批次与用户投稿同名：官方作品按作者区分。
  const pick = (title) => refreshed.find((item) => titleOf(item) === title && isOfficial(item));
  const widest = [...refreshed].sort((a, b) => (b.width ?? b.pattern?.width ?? 0) - (a.width ?? a.pattern?.width ?? 0))[0];
  const authorOf = (item) => item?.author?.publicAuthorId ?? item?.author?.id ?? item?.publicAuthorId ?? null;
  const unread = await api(user.page, 'GET', '/api/me/notifications/unread-count');

  fixtures.works = {
    cat: pick('橘猫团子')?.id, rainbow: pick('云朵彩虹')?.id, icecream: pick('双球冰淇淋')?.id, star: pick('星星人')?.id,
    heart: pick('心动爱心')?.id, seed: seedWork.id, widest: widest?.id, widestTitle: titleOf(widest),
    userApproved: approved.workId, userPending: pending.workId,
  };
  fixtures.authors = { official: authorOf(pick('橘猫团子')), user: authorOf(refreshed.find((item) => item.id === approved.workId)) ?? user.me?.publicAuthorId ?? null };
  fixtures.designs = designs;
  fixtures.palette = palette;
  fixtures.share = share ? { token: share.token, path: share.path, design: designs.panda.id } : null;
  fixtures.review = { pendingTitle: pending.title, seedPendingTitle: 'E2E 待审修改版' };
  fixtures.notifications = { userUnread: unread.json?.unreadCount ?? null, emptyAccount: ACCOUNTS.moderator };
  fixtures.counts = { publicWorks: refreshed.length, designs: Object.keys(designs).length + 1 };
  fixtures.warnings = warnings;
  for (const [key, value] of Object.entries(fixtures.works)) if (!value) warn('fixtures 缺作品', key);
  for (const [key, value] of Object.entries(fixtures.authors)) if (!value) warn('fixtures 缺作者', key);
  fixtures.warnings = warnings;
  writeFileSync(resolve(OUT, 'fixtures.json'), JSON.stringify(fixtures, null, 2));
  log('完成：公开作品', refreshed.length, '件；fixtures →', resolve(OUT, 'fixtures.json'));
} finally {
  await browser.close();
}
if (warnings.length) { console.log(`[seed] 共 ${warnings.length} 条警告`); process.exitCode = 1; }
