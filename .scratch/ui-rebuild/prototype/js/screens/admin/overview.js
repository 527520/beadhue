// 总览：四张紧凑指标卡 + 待办（跨队列前 5 项）+ 近 7 天趋势 + 服务状态。
import { icon } from '../../icons.js';
import { esc } from '../../ui.js';
import { reviews, comments, reports, isCommentPending, VERDICTS, TREND, TREND_DAYS, MODERATION, counts, fmtAgo, fmtNum } from './data.js';
import { thumb, iconTile, badge } from './cells.js';
import { sparkline, lineChart } from './charts.js';
import { serviceList, quota } from './ops.js';

function delta(now, before, { unit = '', backlog = true } = {}) {
  const diff = now - before;
  if (!diff) return '<span class="adm-metric-delta">与昨日持平</span>';
  const tone = !backlog ? '' : diff < 0 ? 'is-good' : 'is-bad';
  return `<span class="adm-metric-delta ${tone}"><span class="adm-arrow ${diff < 0 ? 'is-down' : ''}">${icon('arrow-up-right', 's16')}</span>较昨日 <span class="t-num">${diff > 0 ? '+' : '−'}${Math.abs(diff)}${unit}</span></span>`;
}
function metric({ href, iconName, label, value, spark, deltaHtml }) {
  return `<a class="adm-card adm-metric" href="${href}">
    <span class="adm-metric-label">${icon(iconName, 's16')}${esc(label)}${icon('chevron-right', 's16')}</span>
    <span class="adm-metric-row">${value}${sparkline(spark)}</span>
    ${deltaHtml}
  </a>`;
}

function todoItems() {
  const items = [
    ...reviews.map((item) => ({ minutes: item.submittedMin, lead: thumb(item.pattern), title: item.title, badge: badge([item.revision > 1 ? `投稿 · R${item.revision}` : '投稿', 'info']), meta: `${item.author.name} · ${fmtAgo(item.submittedMin)}`, href: `#/admin/reviews?id=${item.id}` })),
    ...comments.filter(isCommentPending).map((item) => ({ minutes: item.minutesAgo, lead: iconTile('message-circle'), title: `“${item.text}”`, badge: badge([`评论 · ${VERDICTS[item.verdict][0]}`, VERDICTS[item.verdict][1]]), meta: `${item.author.name} · ${fmtAgo(item.minutesAgo)}`, href: `#/admin/comments?id=${item.id}` })),
    ...reports.filter((item) => item.status === 'open').map((item) => ({ minutes: item.minutesAgo, lead: item.kind === 'work' ? thumb(item.work.pattern) : iconTile('flag'), title: item.kind === 'work' ? `作品「${item.work.title}」${item.reason}` : `评论被举报：${item.reason}`, badge: badge(['举报', 'danger']), meta: `${item.reporter.name} 举报 · ${fmtAgo(item.minutesAgo)}`, href: `#/admin/reports?id=${item.id}` })),
  ].sort((a, b) => a.minutes - b.minutes);
  return { total: items.length, top: items.slice(0, 5) };
}

let chart = null;
export default {
  id: 'overview',
  label: '总览',
  desc: '今天要处理的队列、近 7 天趋势和服务状态。',
  render() {
    const c = counts();
    const todo = todoItems();
    chart = lineChart({ days: TREND_DAYS, series: TREND, label: '近 7 天投稿、点赞与新用户' });
    const reviewSpark = [2, 4, 3, 1, 2, 4, c.reviews];
    const commentSpark = [3, 6, 4, 2, 5, 3, c.comments];
    const reportSpark = [1, 0, 2, 3, 1, 2, c.reports];
    return `<div class="adm-ov">
      <div class="adm-metrics">
        ${metric({ href: '#/admin/reviews', iconName: 'inbox', label: '待审投稿', value: `<b class="adm-metric-value t-num">${c.reviews}</b>`, spark: reviewSpark, deltaHtml: delta(c.reviews, reviewSpark[5]) })}
        ${metric({ href: '#/admin/comments', iconName: 'messages-square', label: '待处理评论', value: `<b class="adm-metric-value t-num">${c.comments}</b>`, spark: commentSpark, deltaHtml: delta(c.comments, commentSpark[5]) })}
        ${metric({ href: '#/admin/reports', iconName: 'flag', label: '待处理举报', value: `<b class="adm-metric-value t-num">${c.reports}</b>`, spark: reportSpark, deltaHtml: delta(c.reports, reportSpark[5]) })}
        ${metric({ href: '#/admin/system', iconName: 'shield-check', label: '内容安全服务', value: `<span class="adm-metric-status">${badge(['正常', 'success'], { dot: true })}<span class="adm-muted t-num">今日 ${MODERATION.used} 次</span></span>`, spark: MODERATION.spark, deltaHtml: delta(MODERATION.used, MODERATION.spark[5], { unit: ' 次', backlog: false }) })}
      </div>
      <section class="adm-card adm-todo" aria-labelledby="adm-todo-title">
        <header class="adm-card-head"><h2 id="adm-todo-title">待办</h2><span class="adm-muted">共 <span class="t-num">${todo.total}</span> 项 · 按提交先后</span></header>
        ${todo.top.length ? `<ul class="adm-todo-list" role="list">${todo.top.map((item) => `<li>
          ${item.lead}
          <span class="adm-todo-main"><span class="adm-todo-title ellipsis">${esc(item.title)}</span><span class="adm-todo-meta">${item.badge}<span class="ellipsis">${esc(item.meta)}</span></span></span>
          <a class="btn btn-sm btn-ghost" href="${item.href}" aria-label="处理：${esc(item.title)}">处理</a>
        </li>`).join('')}</ul>` : '<p class="adm-muted adm-card-body">所有队列都清空了。</p>'}
        <footer class="adm-todo-queues">
          <a href="#/admin/reviews">作品审核<b class="t-num">${c.reviews}</b></a>
          <a href="#/admin/comments">评论治理<b class="t-num">${c.comments}</b></a>
          <a href="#/admin/reports">举报案件<b class="t-num">${c.reports}</b></a>
        </footer>
      </section>
      <section class="adm-card adm-trend" aria-labelledby="adm-trend-title">
        <header class="adm-card-head"><h2 id="adm-trend-title">近 7 天</h2><span class="adm-muted t-num">${TREND_DAYS[0].long} – 今天</span></header>
        <div class="adm-legend">${TREND.map((item) => `<span><i style="--c:${item.color}"></i>${item.label}<b class="t-num">${fmtNum(item.values.reduce((sum, v) => sum + v, 0))}</b></span>`).join('')}</div>
        <div class="adm-card-body adm-chart-wrap">${chart.html}</div>
      </section>
      <section class="adm-card adm-svc" aria-labelledby="adm-svc-title">
        <header class="adm-card-head"><h2 id="adm-svc-title">服务状态</h2><span class="adm-muted">更新于 14:32</span></header>
        ${serviceList()}
        <footer class="adm-card-foot">${quota()}<a class="t-link t-body-sm" href="#/admin/system">查看系统信息</a></footer>
      </section>
    </div>`;
  },
  mount(root) {
    chart?.mount(root);
    return null;
  },
};
