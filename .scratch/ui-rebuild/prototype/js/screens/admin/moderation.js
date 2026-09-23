// 治理类列表：评论治理、举报案件。
import { icon } from '../../icons.js';
import { esc, toast } from '../../ui.js';
import { comments, VERDICTS, isCommentPending, reports, REPORT_STATUS, REPORT_KIND, fmtDate, fmtAgo } from './data.js';
import { tableCard, mountTable, tableStore } from './table.js';
import { openDrawer, updateDrawer, setDrawerBadges, reasonDialog } from './overlay.js';
import { thumb, iconTile, badge, person, muted, mono, num, titleCell, dl, block } from './cells.js';

const withQuery = (id, ctx) => { if (ctx.query.has('q')) { const state = tableStore(id); state.q = ctx.query.get('q'); state.page = 1; } };
const workRef = (work) => `<span class="adm-person">${thumb(work.pattern, '', 'sm')}<span class="ellipsis">${esc(work.title)}</span></span>`;

// ================= 评论治理 =================
const verdictBadge = (comment) => badge(VERDICTS[comment.verdict], { dot: true });

function setVerdict(list, verdict, api, reason = '') {
  const before = list.map((comment) => [comment, comment.verdict]);
  list.forEach((comment) => { comment.verdict = verdict; if (reason) comment.reason = reason; });
  api.clearSelection();
  api.changed();
  const text = verdict === 'deleted' ? (list.length === 1 ? '已删除这条评论' : `已删除 ${list.length} 条评论`) : (list.length === 1 ? '已保留这条评论，前台正常显示' : `已保留 ${list.length} 条评论`);
  toast(text, { action: { label: '撤销', onClick() { before.forEach(([comment, old]) => { comment.verdict = old; }); api.changed(); } } });
}
function deleteComments(list, api, after) {
  reasonDialog({
    title: list.length === 1 ? '删除这条评论' : `删除 ${list.length} 条评论`,
    subject: '删除后前台不再显示，记录保留在审计里；不会自动封禁作者账号。',
    label: '删除理由',
    hint: '评论作者会收到通知。',
    quick: ['广告引流', '不友善', '无关内容'],
    confirm: list.length === 1 ? '删除评论' : `删除 ${list.length} 条`,
    onConfirm(reason) { setVerdict(list, 'deleted', api, reason); after?.(); },
  });
}

function commentBody(comment) {
  return `<blockquote class="adm-quote-block" tabindex="-1" autofocus>${esc(comment.text)}</blockquote>
    ${block('判定', dl([
      ['当前状态', verdictBadge(comment)],
      ['内容安全', comment.reason ? `${esc(comment.reason)} · 置信度 <span class="t-num">${comment.score.toFixed(2)}</span>` : muted('未命中规则')],
      ['作者', person(comment.author)],
      ['发布时间', num(fmtDate(comment.minutesAgo))],
      ['所在作品', `<a class="adm-link-row" href="#/works/${comment.work.id}">${workRef(comment.work)}</a>`, true],
    ]))}
    <p class="adm-note">${icon('info', 's16')}<span>内容安全判定只作参考；处理结论不会自动封禁账号。</span></p>`;
}
function commentFoot(comment) {
  if (comment.verdict === 'deleted') return '<span class="spacer"></span><button type="button" class="btn btn-secondary" data-dw="restore">恢复评论</button>';
  return `<button type="button" class="btn btn-danger-outline" data-dw="delete">${icon('trash-2', 's18')}删除评论</button><span class="spacer"></span>${isCommentPending(comment) ? `<button type="button" class="btn btn-primary" data-dw="keep">${icon('check', 's18')}保留评论</button>` : ''}`;
}
function openComment(comment, api, done) {
  const refresh = (dialog) => { updateDrawer(dialog, { badges: verdictBadge(comment), body: commentBody(comment), foot: commentFoot(comment) }); };
  openDrawer({
    title: '评论详情',
    body: commentBody(comment),
    foot: commentFoot(comment),
    onClose: done,
    onMount(dialog) {
      setDrawerBadges(dialog, verdictBadge(comment));
      dialog.addEventListener('click', (event) => {
        const action = event.target.closest('[data-dw]')?.dataset.dw;
        if (action === 'keep') { setVerdict([comment], 'passed', api); refresh(dialog); }
        if (action === 'restore') { setVerdict([comment], 'passed', api); refresh(dialog); }
        if (action === 'delete') deleteComments([comment], api, () => { if (dialog.isConnected) refresh(dialog); });
      });
    },
  });
}

const commentsTable = {
  id: 'comments',
  label: '评论列表',
  rows: () => [...comments].sort((a, b) => Number(isCommentPending(b)) - Number(isCommentPending(a)) || a.minutesAgo - b.minutesAgo),
  rowId: (comment) => comment.id,
  rowName: (comment) => `${comment.author.name}的评论`,
  searchText: (comment) => `${comment.text} ${comment.author.name} ${comment.work.title}`,
  searchPlaceholder: '搜索评论内容、作者或作品',
  minWidth: 960,
  selectable: true,
  filters: [
    { key: 'verdict', label: '判定', multi: true, options: Object.entries(VERDICTS).map(([value, [label]]) => [value, label]), match: (comment, values) => values.includes(comment.verdict) },
  ],
  columns: [
    { key: 'text', label: '评论', cls: 'adm-col-main is-quote', cell: (comment) => titleCell(comment.id, `“${comment.text}”`) },
    { key: 'author', label: '作者', cell: (comment) => person(comment.author) },
    { key: 'work', label: '作品', cell: (comment) => workRef(comment.work) },
    { key: 'verdict', label: '判定', cell: (comment) => `<span class="adm-stack">${verdictBadge(comment)}${comment.reason ? `<span class="adm-cell-sub">${esc(comment.reason)}</span>` : ''}</span>` },
    { key: 'time', label: '时间', sort: (a, b) => b.minutesAgo - a.minutesAgo, cell: (comment) => num(fmtAgo(comment.minutesAgo)) },
  ],
  card: (comment) => ({
    lead: iconTile('message-circle'),
    title: `“${comment.text}”`,
    meta: `${esc(comment.author.name)} · ${esc(comment.work.title)} · ${fmtAgo(comment.minutesAgo)}`,
    tail: `${verdictBadge(comment)}${comment.reason ? `<span class="adm-muted">${esc(comment.reason)}</span>` : ''}`,
  }),
  batch: [
    { id: 'keep', label: '保留', icon: 'check' },
    { id: 'delete', label: '删除', icon: 'trash-2', danger: true },
  ],
  onBatch(action, list, api) {
    if (action === 'keep') setVerdict(list, 'passed', api);
    if (action === 'delete') deleteComments(list.filter((comment) => comment.verdict !== 'deleted'), api);
  },
  menu: (comment) => [
    { id: 'view', label: '查看详情', icon: 'eye' },
    { id: 'keep', label: '保留评论', icon: 'check', disabled: comment.verdict === 'passed' },
    { sep: true },
    comment.verdict === 'deleted' ? { id: 'restore', label: '恢复评论', icon: 'refresh-cw' } : { id: 'delete', label: '删除评论…', icon: 'trash-2', danger: true },
  ],
  onMenu(action, comment, api) {
    if (action === 'view') openComment(comment, api, () => {});
    if (action === 'keep' || action === 'restore') setVerdict([comment], 'passed', api);
    if (action === 'delete') deleteComments([comment], api);
  },
  onOpen: openComment,
  emptyFiltered: '没有符合条件的评论',
};

export const commentsSection = {
  id: 'comments',
  label: '评论治理',
  desc: '内容安全判定为可疑或已拦截的评论，需要人工确认。',
  render(ctx) { withQuery('comments', ctx); return tableCard(commentsTable); },
  mount(root, ctx, shell) {
    const { cleanup } = mountTable(root, commentsTable, { onChange: shell.refreshCounts, openId: ctx.query.get('id') });
    return cleanup;
  },
};

// ================= 举报案件 =================
const reportStatus = (report) => badge(REPORT_STATUS[report.status], { dot: true });
const targetTitle = (report) => (report.kind === 'work' ? `作品「${report.work.title}」` : report.kind === 'comment' ? `评论“${report.comment.text}”` : `账号「${report.user.name}」`);
const targetLead = (report, cls = '') => (report.kind === 'work' ? thumb(report.work.pattern, '', cls) : iconTile(report.kind === 'comment' ? 'message-circle' : 'user'));
const actionLabel = (report) => (report.kind === 'work' ? '下架作品' : report.kind === 'comment' ? '删除评论' : '暂停账号');

function closeReport(report, status, resolution, api) {
  const before = [report.status, report.resolution];
  report.status = status;
  report.resolution = resolution;
  api.changed();
  toast(status === 'dismissed' ? '已驳回举报，举报人会收到通知' : `已处理举报：${resolution}`, { action: { label: '撤销', onClick() { [report.status, report.resolution] = before; api.changed(); } } });
}

function reportBody(report) {
  const target = report.kind === 'work'
    ? `<a class="adm-target" href="#/works/${report.work.id}">${thumb(report.work.pattern, '', 'lg')}<span><b>${esc(report.work.title)}</b><span class="adm-muted">${esc(report.work.author.name)} · ${report.work.likes} 赞</span></span></a>`
    : report.kind === 'comment'
      ? `<blockquote class="adm-quote-block">${esc(report.comment.text)}<footer>— ${esc(report.comment.author.name)}，在「${esc(report.comment.work.title)}」</footer></blockquote>`
      : `<div class="adm-target">${person(report.user, 'lg')}<span class="adm-muted">${esc(report.user.email ?? '')}</span></div>`;
  return `<div class="adm-dw-top" tabindex="-1" autofocus>${block(`被举报的${REPORT_KIND[report.kind]}`, target)}</div>
    ${block('举报信息', dl([
      ['原因', `<b class="adm-strong">${esc(report.reason)}</b>`],
      ['状态', reportStatus(report)],
      ['举报人', person(report.reporter)],
      ['举报时间', num(fmtDate(report.minutesAgo))],
      ['案件编号', mono(report.id)],
      report.resolution ? ['处理结果', esc(report.resolution)] : null,
      ['举报说明', `<span class="adm-prose">${esc(report.detail)}</span>`, true],
    ]))}`;
}
function reportFoot(report) {
  if (report.status !== 'open') return `<span class="spacer"></span><button type="button" class="btn btn-secondary" data-dw="reopen">重新打开</button>`;
  return `<button type="button" class="btn btn-outline" data-dw="dismiss">驳回举报</button><span class="spacer"></span><button type="button" class="btn btn-danger-outline" data-dw="act">${actionLabel(report)}</button><button type="button" class="btn btn-primary" data-dw="resolve">标记已处理</button>`;
}
function openReport(report, api, done) {
  const refresh = (dialog) => { updateDrawer(dialog, { badges: reportStatus(report), body: reportBody(report), foot: reportFoot(report) }); };
  openDrawer({
    title: `举报 · ${report.reason}`,
    body: reportBody(report),
    foot: reportFoot(report),
    onClose: done,
    onMount(dialog) {
      setDrawerBadges(dialog, reportStatus(report));
      dialog.addEventListener('click', (event) => {
        const action = event.target.closest('[data-dw]')?.dataset.dw;
        if (action === 'resolve') { closeReport(report, 'resolved', '已核实并处理', api); refresh(dialog); }
        if (action === 'reopen') { report.status = 'open'; report.resolution = ''; api.changed(); refresh(dialog); toast('已重新打开举报'); }
        if (action === 'dismiss') reasonDialog({ title: '驳回举报', subject: targetTitle(report), label: '驳回理由', hint: '举报人会在通知里看到这条理由。', quick: ['未发现违规', '属于正常评价', '原创作品'], confirm: '驳回举报', onConfirm(reason) { closeReport(report, 'dismissed', reason, api); if (dialog.isConnected) refresh(dialog); } });
        if (action === 'act') reasonDialog({ title: actionLabel(report), subject: targetTitle(report), label: '处理理由', hint: '对方会在通知里看到这条理由。', quick: [report.reason, '多次违规'], confirm: actionLabel(report), onConfirm() { closeReport(report, 'resolved', `已${actionLabel(report)}`, api); if (dialog.isConnected) refresh(dialog); } });
      });
    },
  });
}

const reportsTable = {
  id: 'reports',
  label: '举报列表',
  rows: () => [...reports].sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || a.minutesAgo - b.minutesAgo),
  rowId: (report) => report.id,
  rowName: (report) => targetTitle(report),
  searchText: (report) => `${targetTitle(report)} ${report.reason} ${report.reporter.name} ${report.id}`,
  searchPlaceholder: '搜索对象、原因或举报人',
  minWidth: 900,
  filters: [
    { key: 'status', label: '状态', multi: true, options: Object.entries(REPORT_STATUS).map(([value, [label]]) => [value, label]), match: (report, values) => values.includes(report.status) },
    { key: 'kind', label: '类型', multi: true, options: Object.entries(REPORT_KIND), match: (report, values) => values.includes(report.kind) },
  ],
  columns: [
    { key: 'target', label: '对象', cls: 'adm-col-main is-quote', cell: (report) => titleCell(report.id, targetTitle(report), { lead: targetLead(report), sub: esc(REPORT_KIND[report.kind]) }) },
    { key: 'reason', label: '原因', cell: (report) => esc(report.reason) },
    { key: 'reporter', label: '举报人', cell: (report) => person(report.reporter) },
    { key: 'status', label: '状态', cell: reportStatus },
    { key: 'time', label: '时间', sort: (a, b) => b.minutesAgo - a.minutesAgo, cell: (report) => num(fmtAgo(report.minutesAgo)) },
  ],
  card: (report) => ({
    lead: targetLead(report, 'lg'),
    title: targetTitle(report),
    meta: `${esc(report.reason)} · ${esc(report.reporter.name)} · ${fmtAgo(report.minutesAgo)}`,
    tail: reportStatus(report),
  }),
  menu: (report) => [
    { id: 'view', label: '查看详情', icon: 'eye' },
    { id: 'resolve', label: '标记已处理', icon: 'check', disabled: report.status !== 'open' },
    { id: 'dismiss', label: '驳回举报…', icon: 'x', disabled: report.status !== 'open' },
  ],
  onMenu(action, report, api) {
    if (action === 'view') openReport(report, api, () => {});
    if (action === 'resolve') closeReport(report, 'resolved', '已核实并处理', api);
    if (action === 'dismiss') reasonDialog({ title: '驳回举报', subject: targetTitle(report), label: '驳回理由', quick: ['未发现违规', '属于正常评价'], confirm: '驳回举报', onConfirm(reason) { closeReport(report, 'dismissed', reason, api); } });
  },
  onOpen: openReport,
  exportCsv: {
    filename: '豆色绘-举报.csv',
    columns: [['编号', (r) => r.id], ['对象', targetTitle], ['原因', (r) => r.reason], ['举报人', (r) => r.reporter.name], ['状态', (r) => REPORT_STATUS[r.status][0]], ['时间', (r) => fmtDate(r.minutesAgo)]],
  },
  emptyFiltered: '没有符合条件的举报',
};

export const reportsSection = {
  id: 'reports',
  label: '举报案件',
  desc: '用户举报的作品、评论和账号，按时间先后处理。',
  render(ctx) { withQuery('reports', ctx); return tableCard(reportsTable); },
  mount(root, ctx, shell) {
    const { cleanup } = mountTable(root, reportsTable, { onChange: shell.refreshCounts, openId: ctx.query.get('id') });
    return cleanup;
  },
};
