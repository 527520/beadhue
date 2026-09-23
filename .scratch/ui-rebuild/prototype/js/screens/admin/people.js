// 人员管理与审计记录。
import { icon } from '../../icons.js';
import { $, $$, esc, avatar, toast } from '../../ui.js';
import { users, ROLES, USER_STATUS, audits, fmtDate, fmtAgo, fmtDay, fmtNum } from './data.js';
import { tableCard, mountTable, tableStore } from './table.js';
import { openDrawer, updateDrawer, setDrawerBadges, reasonDialog } from './overlay.js';
import { badge, person, muted, mono, num, titleCell, dl, block } from './cells.js';

const withQuery = (id, ctx) => { if (ctx.query.has('q')) { const state = tableStore(id); state.q = ctx.query.get('q'); state.page = 1; } };

// ================= 人员管理 =================
const roleBadge = (user) => badge(ROLES[user.role]);
const statusBadge = (user) => badge(USER_STATUS[user.status], { dot: true });
const ROLE_HELP = { user: '创作、投稿、评论', reviewer: '处理投稿、评论和举报', admin: '全部后台权限，含人员管理' };

function suspend(user, api, after) {
  reasonDialog({
    title: `暂停「${user.name}」的账号`,
    subject: '暂停后对方立即退出登录，不能发布作品和评论；已公开的作品保持不变。',
    label: '暂停理由',
    hint: '对方登录时会看到这条理由。',
    quick: ['发布广告引流', '多次违规', '疑似被盗号'],
    confirm: '暂停账号',
    onConfirm(reason) {
      const before = user.status;
      user.status = 'suspended';
      user.suspendReason = reason;
      api.changed();
      after?.();
      toast(`已暂停「${user.name}」的账号`, { action: { label: '撤销', onClick() { user.status = before; api.changed(); after?.(); } } });
    },
  });
}
function resume(user, api) {
  user.status = 'active';
  api.changed();
  toast(`已恢复「${user.name}」的账号`);
}

function userBody(user, draftRole) {
  return `<div class="adm-dw-top adm-user-head" tabindex="-1" autofocus>${avatar(user, 'xl')}<div><b class="t-title-3">${esc(user.name)}</b><span class="adm-muted">${esc(user.email)}</span><span class="adm-user-badges">${roleBadge(user)}${statusBadge(user)}</span></div></div>
    ${user.status === 'suspended' ? `<p class="adm-note is-danger">${icon('ban', 's16')}<span>已暂停：${esc(user.suspendReason ?? '多次发布广告引流评论')}</span></p>` : ''}
    ${block('账号信息', dl([
      ['账号编号', mono(user.id)],
      ['注册时间', num(fmtDay(user.joinedMin))],
      ['最近活跃', num(fmtAgo(user.lastSeenMin))],
      ['作品', num(`${user.works} 件`)],
      ['获赞', num(fmtNum(user.likes))],
      ['评论', num(`${user.commentCount} 条`)],
    ]))}
    ${block('角色', `<div class="adm-roles" role="radiogroup" aria-label="角色">${Object.entries(ROLES).map(([value, [label]]) => `<label class="adm-role"><input type="radio" name="adm-role" value="${value}" ${draftRole === value ? 'checked' : ''} ${user.self ? 'disabled' : ''}><span><b>${label}</b><small>${ROLE_HELP[value]}</small></span></label>`).join('')}</div>
      <p class="adm-muted adm-help">${user.self ? '不能修改自己的角色，请让另一位管理员操作。' : '调整角色或暂停账号会让对方立即退出登录。'}</p>`)}`;
}
function userFoot(user, draftRole) {
  const changed = draftRole !== user.role;
  const left = user.self ? '' : user.status === 'suspended'
    ? '<button type="button" class="btn btn-outline" data-dw="resume">恢复账号</button>'
    : `<button type="button" class="btn btn-danger-outline" data-dw="suspend">${icon('ban', 's18')}暂停账号</button>`;
  return `${left}<span class="spacer"></span><button type="button" class="btn btn-primary" data-dw="save" ${changed ? '' : 'disabled'}>保存角色</button>`;
}
function openUser(user, api, done) {
  let draft = user.role;
  const refresh = (dialog) => { updateDrawer(dialog, { badges: '', body: userBody(user, draft), foot: userFoot(user, draft) }); };
  openDrawer({
    title: '账号详情',
    body: userBody(user, draft),
    foot: userFoot(user, draft),
    onClose: done,
    onMount(dialog) {
      setDrawerBadges(dialog, '');
      dialog.addEventListener('change', (event) => {
        if (event.target.name !== 'adm-role') return;
        draft = event.target.value;
        updateDrawer(dialog, { foot: userFoot(user, draft) });
      });
      dialog.addEventListener('click', (event) => {
        const action = event.target.closest('[data-dw]')?.dataset.dw;
        if (action === 'save') {
          const before = user.role;
          user.role = draft;
          api.changed();
          refresh(dialog);
          toast(`已将「${user.name}」调整为${ROLES[draft][0]}`, { action: { label: '撤销', onClick() { user.role = before; draft = before; api.changed(); if (dialog.isConnected) refresh(dialog); } } });
        }
        if (action === 'suspend') suspend(user, api, () => { if (dialog.isConnected) refresh(dialog); });
        if (action === 'resume') { resume(user, api); refresh(dialog); }
      });
    },
  });
}

const usersTable = {
  id: 'users',
  label: '账号列表',
  rows: () => users,
  rowId: (user) => user.id,
  rowName: (user) => user.name,
  searchText: (user) => `${user.name} ${user.email} ${user.id}`,
  searchPlaceholder: '搜索用户名、邮箱或编号',
  minWidth: 920,
  filters: [
    { key: 'role', label: '角色', multi: true, options: Object.entries(ROLES).map(([value, [label]]) => [value, label]), match: (user, values) => values.includes(user.role) },
    { key: 'status', label: '状态', multi: true, options: Object.entries(USER_STATUS).map(([value, [label]]) => [value, label]), match: (user, values) => values.includes(user.status) },
  ],
  columns: [
    { key: 'name', label: '用户', cls: 'adm-col-main', cell: (user) => titleCell(user.id, user.name, { lead: avatar(user), sub: mono(user.id), extra: user.self ? '<span class="adm-muted">（你）</span>' : '' }) },
    { key: 'email', label: '邮箱', cell: (user) => esc(user.email) },
    { key: 'role', label: '角色', cell: roleBadge },
    { key: 'status', label: '状态', cell: statusBadge },
    { key: 'works', label: '作品', align: 'end', sort: (a, b) => a.works - b.works, cell: (user) => num(user.works) },
    { key: 'joined', label: '注册时间', sort: (a, b) => b.joinedMin - a.joinedMin, cell: (user) => num(fmtDay(user.joinedMin)) },
  ],
  card: (user) => ({
    lead: avatar(user, 'lg'),
    title: user.name,
    meta: `${esc(user.email)} · 注册于 <span class="t-num">${fmtDay(user.joinedMin)}</span>`,
    tail: `${roleBadge(user)}${statusBadge(user)}`,
  }),
  menu: (user) => [
    { id: 'view', label: '查看详情', icon: 'eye' },
    { id: 'role', label: '调整角色…', icon: 'shield-check', disabled: user.self },
    ...(user.status === 'unverified' ? [{ id: 'mail', label: '重发验证邮件', icon: 'send' }] : []),
    { sep: true },
    user.status === 'suspended' ? { id: 'resume', label: '恢复账号', icon: 'refresh-cw' } : { id: 'suspend', label: '暂停账号…', icon: 'ban', danger: true, disabled: user.self },
  ],
  onMenu(action, user, api) {
    if (action === 'view' || action === 'role') openUser(user, api, () => {});
    if (action === 'mail') toast(`已向 ${user.email} 重发验证邮件`, { iconName: 'send' });
    if (action === 'suspend') suspend(user, api);
    if (action === 'resume') resume(user, api);
  },
  onOpen: openUser,
  exportCsv: {
    filename: '豆色绘-人员.csv',
    columns: [['编号', (u) => u.id], ['用户名', (u) => u.name], ['邮箱', (u) => u.email], ['角色', (u) => ROLES[u.role][0]], ['状态', (u) => USER_STATUS[u.status][0]], ['作品', (u) => u.works], ['注册时间', (u) => fmtDay(u.joinedMin)]],
  },
  emptyFiltered: '没有符合条件的账号',
};

export const usersSection = {
  id: 'users',
  label: '人员管理',
  desc: '查看账号，调整角色或暂停账号。',
  render(ctx) { withQuery('users', ctx); return tableCard(usersTable); },
  mount(root, ctx, shell) {
    const { cleanup } = mountTable(root, usersTable, { onChange: shell.refreshCounts, openId: ctx.query.get('id') });
    return cleanup;
  },
};

// ================= 审计记录 =================
function openAudit(record, api, done) {
  openDrawer({
    title: record.action,
    body: `<div class="adm-dw-top" tabindex="-1" autofocus>${dl([
      ['操作人', person(record.actor)],
      ['时间', num(fmtDate(record.minutesAgo))],
      ['对象', esc(record.target), true],
      ['说明', record.note ? esc(record.note) : muted('—'), true],
      ['来源网络', mono(record.ip)],
      ['记录编号', mono(record.id)],
    ])}</div><p class="adm-note">${icon('lock', 's16')}<span>审计记录只读，保留 180 天，任何人都不能修改或删除。</span></p>`,
    foot: '<span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>关闭</button>',
    onClose: done,
  });
}
const actions = () => [...new Set(audits.map((record) => record.action))].map((action) => [action, action]);
const auditTable = {
  id: 'audit',
  label: '审计记录',
  rows: () => audits,
  rowId: (record) => record.id,
  rowName: (record) => `${record.action} ${record.target}`,
  searchText: (record) => `${record.actor.name} ${record.action} ${record.target} ${record.note}`,
  searchPlaceholder: '搜索操作人、动作或对象',
  minWidth: 900,
  filters: [
    { key: 'action', label: '动作', multi: true, options: actions, match: (record, values) => values.includes(record.action) },
    { key: 'actor', label: '操作人', multi: true, options: () => [...new Set(audits.map((record) => record.actor.name))].map((name) => [name, name]), match: (record, values) => values.includes(record.actor.name) },
  ],
  columns: [
    { key: 'time', label: '时间', sort: (a, b) => b.minutesAgo - a.minutesAgo, cell: (record) => num(fmtDate(record.minutesAgo)) },
    { key: 'actor', label: '操作人', cell: (record) => person(record.actor) },
    { key: 'action', label: '动作', cell: (record) => `<button type="button" class="adm-cell-link" data-open="${record.id}">${esc(record.action)}</button>` },
    { key: 'target', label: '对象', cls: 'is-quote', cell: (record) => `<span class="ellipsis adm-clip">${esc(record.target)}</span>` },
    { key: 'note', label: '说明', cls: 'is-quote', cell: (record) => (record.note ? `<span class="ellipsis adm-clip adm-muted">${esc(record.note)}</span>` : muted('—')) },
    { key: 'ip', label: '来源网络', cell: (record) => mono(record.ip) },
  ],
  card: (record) => ({ title: `${record.action} · ${record.target}`, meta: `${esc(record.actor.name)} · <span class="t-num">${fmtDate(record.minutesAgo)}</span>`, tail: record.note ? `<span class="adm-muted">${esc(record.note)}</span>` : '' }),
  onOpen: openAudit,
  exportCsv: {
    filename: '豆色绘-审计记录.csv',
    columns: [['时间', (r) => fmtDate(r.minutesAgo)], ['操作人', (r) => r.actor.name], ['动作', (r) => r.action], ['对象', (r) => r.target], ['说明', (r) => r.note]],
  },
  emptyFiltered: '没有符合条件的记录',
};
export const auditSection = {
  id: 'audit',
  label: '审计记录',
  desc: '所有后台操作的留痕，保留 180 天。',
  render(ctx) { withQuery('audit', ctx); return tableCard(auditTable); },
  mount(root, ctx) { return mountTable(root, auditTable, { openId: ctx.query.get('id') }).cleanup; },
};
