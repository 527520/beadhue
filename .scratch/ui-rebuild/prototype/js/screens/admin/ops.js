// 系统类页面：运行日志（数据表格）、匿名分析、系统信息。
import { icon } from '../../icons.js';
import { esc, toast } from '../../ui.js';
import { logs, LOG_LEVEL, LOG_SOURCE, TREND_DAYS, SERVICES, MODERATION, fmtDate, fmtNum } from './data.js';
import { tableCard, mountTable, tableStore } from './table.js';
import { openDrawer } from './overlay.js';
import { badge, mono, num, dl, block } from './cells.js';
import { lineChart, sparkline } from './charts.js';
import { BEADS } from '../../../motifs.js';

// ================= 运行日志 =================
const levelBadge = (log) => badge(LOG_LEVEL[log.level], { dot: true });
function openLog(log, api, done) {
  const related = logs.filter((item) => item.event === log.event && item !== log).slice(0, 3);
  openDrawer({
    title: log.event,
    body: `<div class="adm-dw-top" tabindex="-1" autofocus>${dl([
      ['级别', levelBadge(log)],
      ['来源', esc(LOG_SOURCE[log.source])],
      ['时间', num(fmtDate(log.minutesAgo))],
      ['请求编号', mono(log.request)],
      ['消息', `<span class="adm-prose">${esc(log.message)}</span>`, true],
    ])}</div>
    ${block('同类事件', related.length ? `<ul class="adm-mini-list">${related.map((item) => `<li><span class="t-num adm-muted">${fmtDate(item.minutesAgo)}</span><span class="ellipsis">${esc(item.message)}</span></li>`).join('')}</ul>` : '<p class="adm-muted">最近 7 天没有同类事件。</p>')}
    <p class="adm-note">${icon('lock', 's16')}<span>网络地址已掩码；错误日志保留 30 天。</span></p>`,
    foot: '<span class="spacer"></span><button type="button" class="btn btn-secondary" data-dw="copy">复制请求编号</button>',
    onClose: done,
    onMount(dialog) {
      dialog.addEventListener('click', (event) => {
        if (event.target.closest('[data-dw="copy"]')) { navigator.clipboard?.writeText(log.request).catch(() => {}); toast(`已复制 ${log.request}`, { iconName: 'copy' }); }
      });
    },
  });
}
const logsTable = {
  id: 'logs',
  label: '日志列表',
  rows: () => logs,
  rowId: (log) => log.id,
  rowName: (log) => log.event,
  searchText: (log) => `${log.event} ${log.message} ${log.request}`,
  searchPlaceholder: '搜索事件、消息或请求编号',
  minWidth: 980,
  filters: [
    { key: 'level', label: '级别', multi: true, options: Object.entries(LOG_LEVEL).map(([value, [label]]) => [value, label]), match: (log, values) => values.includes(log.level) },
    { key: 'source', label: '来源', multi: true, options: Object.entries(LOG_SOURCE), match: (log, values) => values.includes(log.source) },
  ],
  columns: [
    { key: 'time', label: '时间', sort: (a, b) => b.minutesAgo - a.minutesAgo, cell: (log) => num(fmtDate(log.minutesAgo)) },
    { key: 'level', label: '级别', cell: levelBadge },
    { key: 'event', label: '事件', cell: (log) => `<button type="button" class="adm-cell-link t-mono adm-mono" data-open="${log.id}">${esc(log.event)}</button>` },
    { key: 'message', label: '消息', cls: 'is-quote', cell: (log) => `<span class="ellipsis adm-clip">${esc(log.message)}</span>` },
    { key: 'source', label: '来源', cell: (log) => esc(LOG_SOURCE[log.source]) },
    { key: 'request', label: '请求编号', cell: (log) => mono(log.request) },
  ],
  card: (log) => ({ title: log.message, meta: `<span class="t-mono adm-mono">${esc(log.event)}</span> · <span class="t-num">${fmtDate(log.minutesAgo)}</span>`, tail: `${levelBadge(log)}<span class="adm-muted">${esc(LOG_SOURCE[log.source])}</span>` }),
  onOpen: openLog,
  exportCsv: {
    filename: '豆色绘-运行日志.csv',
    columns: [['时间', (l) => fmtDate(l.minutesAgo)], ['级别', (l) => LOG_LEVEL[l.level][0]], ['来源', (l) => LOG_SOURCE[l.source]], ['事件', (l) => l.event], ['消息', (l) => l.message], ['请求编号', (l) => l.request]],
  },
  emptyFiltered: '没有符合条件的日志',
};
export const logsSection = {
  id: 'logs',
  label: '运行日志',
  desc: '接口错误、页面报错与定时任务的运行记录。',
  render(ctx) {
    if (ctx.query.has('q')) { const state = tableStore('logs'); state.q = ctx.query.get('q'); state.page = 1; }
    return tableCard(logsTable);
  },
  mount(root, ctx) { return mountTable(root, logsTable, { openId: ctx.query.get('id') }).cleanup; },
};

// ================= 匿名分析 =================
const RANGES = [['7', '近 7 天'], ['30', '近 30 天'], ['90', '近 90 天']];
let range = '7';
const ANALYTICS = [
  { key: 'visitors', label: '访客', color: 'var(--ink)', values: [1512, 1604, 1588, 1733, 1690, 1862, 1795] },
  { key: 'generated', label: '生成图纸', color: BEADS.O.hex, values: [520, 566, 540, 612, 598, 638, 601] },
  { key: 'exported', label: '导出文件', color: BEADS.B.hex, values: [210, 236, 228, 260, 251, 284, 270] },
];
const FUNNEL = [['访问页面', 2914], ['选择图片', 1480], ['完成裁剪', 1204], ['生成图纸', 1102], ['保存设计', 684], ['导出文件', 431]];
const DEVICES = [['手机', 62], ['桌面', 34], ['平板', 4]];

export const analyticsSection = {
  id: 'analytics',
  label: '匿名分析',
  desc: '只统计同意匿名统计的访客，不含个人信息。',
  actions: () => `<div class="adm-range" role="group" aria-label="统计时间范围">${RANGES.map(([value, label]) => `<button type="button" class="chip ${value === range ? 'is-selected' : ''}" aria-pressed="${value === range}" data-range="${value}">${label}</button>`).join('')}</div>`,
  render() {
    const scale = Number(range) / 7;
    const chart = lineChart({ days: TREND_DAYS, series: ANALYTICS, label: '近 7 天访客、生成与导出趋势' });
    const kpi = (label, value, spark) => `<div class="adm-card adm-metric is-static"><span class="adm-metric-label">${label}</span><span class="adm-metric-row"><b class="adm-metric-value t-num">${fmtNum(Math.round(value * scale))}</b>${sparkline(spark)}</span><span class="adm-metric-delta">${esc(RANGES.find(([v]) => v === range)[1])}</span></div>`;
    return `<div class="adm-an">
      <div class="adm-metrics">${kpi('访客', 11784, ANALYTICS[0].values)}${kpi('访问次数', 17302, [2400, 2510, 2470, 2690, 2610, 2914, 2800])}${kpi('生成图纸', 4075, ANALYTICS[1].values)}${kpi('导出文件', 1739, ANALYTICS[2].values)}</div>
      <section class="adm-card adm-an-trend"><header class="adm-card-head"><h2>每日趋势</h2><span class="adm-muted">最近 7 天</span></header><div class="adm-legend">${ANALYTICS.map((item) => `<span><i style="--c:${item.color}"></i>${item.label}</span>`).join('')}</div><div class="adm-card-body adm-chart-wrap">${chart.html}</div></section>
      <section class="adm-card adm-an-funnel"><header class="adm-card-head"><h2>制作图纸转化</h2><span class="adm-muted">同一次访问内</span></header>
        <ol class="adm-funnel">${FUNNEL.map(([label, value], index) => `<li><span class="adm-funnel-label">${label}</span><span class="adm-funnel-bar"><i style="width:${(value / FUNNEL[0][1]) * 100}%"></i></span><b class="t-num">${fmtNum(Math.round(value * scale))}</b><span class="t-num adm-muted">${index ? `${Math.round((value / FUNNEL[index - 1][1]) * 100)}%` : '—'}</span></li>`).join('')}</ol>
      </section>
      <section class="adm-card adm-an-devices"><header class="adm-card-head"><h2>设备类型</h2></header>
        <ul class="adm-funnel is-compact">${DEVICES.map(([label, value]) => `<li><span class="adm-funnel-label">${label}</span><span class="adm-funnel-bar"><i style="width:${value}%"></i></span><b class="t-num">${value}%</b></li>`).join('')}</ul>
        <p class="adm-muted adm-card-foot">超过 90 天的查询只保留每日汇总。</p>
      </section>
    </div>`;
  },
  mount(root, ctx) {
    lineChart({ days: TREND_DAYS, series: ANALYTICS, label: '' }).mount(root);
    const onClick = (event) => {
      const chip = event.target.closest('[data-range]');
      if (!chip) return;
      range = chip.dataset.range;
      ctx.rerender();
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  },
};

// ================= 系统信息 =================
const JOBS = [
  ['匿名统计日汇总', 'analytics.daily', '每天 02:00', '今天 02:00', ['正常', 'success']],
  ['清理临时原图', 'cleanup.originals', '每小时', '14:00', ['正常', 'success']],
  ['内容安全配额重置', 'moderation.quota', '每天 00:00', '今天 00:00', ['正常', 'success']],
  ['数据库备份', 'backup.nightly', '—', '从未运行', ['未接入', 'warning']],
];
export function serviceList() {
  return `<ul class="adm-svc-list">${SERVICES.map((service) => `<li class="${service.ok ? '' : 'is-warn'}">
    <span class="adm-icon-tile" aria-hidden="true">${icon(service.icon, 's18')}</span>
    <span class="adm-svc-main"><b>${esc(service.name)}</b><span class="adm-muted">${esc(service.detail)}</span>${service.reason ? `<span class="adm-svc-reason">${esc(service.reason)}</span>` : ''}</span>
    ${badge(service.ok ? ['正常', 'success'] : ['降级', 'warning'], { dot: true })}
  </li>`).join('')}</ul>`;
}
export const quota = () => `<div class="adm-quota"><div class="adm-quota-row"><span>内容安全今日调用</span><span class="t-num"><b>${MODERATION.used}</b> / ${fmtNum(MODERATION.quota)}</span></div><div class="progress"><i style="width:${(MODERATION.used / MODERATION.quota) * 100}%"></i></div></div>`;

export const systemSection = {
  id: 'system',
  label: '系统信息',
  desc: '版本、依赖服务与定时任务的实际运行状态。',
  render() {
    return `<div class="adm-sys">
      <section class="adm-card adm-sys-facts">${[
        ['应用版本', '0.5.0', '构建 3400885 · 09-20 03:10 部署'],
        ['数据库迁移', '0016', 'ops_observability · 已执行'],
        ['24 小时 5xx', '3', '最近一次 14:23 · 对象存储超时'],
        ['原图空间', '38%', '私有桶 · 76 / 200 GB'],
      ].map(([label, value, note]) => `<div class="adm-fact"><span class="adm-metric-label">${label}</span><b class="adm-metric-value t-num">${value}</b><span class="adm-muted">${note}</span></div>`).join('')}</section>
      <section class="adm-card adm-sys-svc"><header class="adm-card-head"><h2>依赖服务</h2><span class="adm-muted">更新于 14:32</span></header>${serviceList()}<div class="adm-card-foot">${quota()}</div></section>
      <section class="adm-card adm-sys-jobs"><header class="adm-card-head"><h2>定时任务</h2><span class="adm-muted">上海时间</span></header>
        <div class="adm-table-wrap"><table class="table adm-table adm-static" style="--min:560px"><thead><tr><th scope="col">任务</th><th scope="col">计划</th><th scope="col">最近运行</th><th scope="col">状态</th></tr></thead><tbody>${JOBS.map(([name, id, plan, last, state]) => `<tr><td><div class="adm-cell-text"><b class="adm-strong">${name}</b><span class="adm-cell-sub t-mono adm-mono">${id}</span></div></td><td>${plan}</td><td class="t-num">${last}</td><td>${badge(state, { dot: true })}</td></tr>`).join('')}</tbody></table></div>
      </section>
    </div>`;
  },
  mount() { return null; },
};
