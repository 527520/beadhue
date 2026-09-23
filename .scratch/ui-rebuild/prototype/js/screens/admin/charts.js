// 内联 SVG 图表：指标卡迷你折线、7 日折线图（悬停 / 聚焦显示当日数值）。
import { $, $$, esc } from '../../ui.js';

/** 固定像素尺寸的迷你折线，不做拉伸，线宽与圆点不变形。 */
export function sparkline(values, { width = 88, height = 32 } = {}) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = 3;
  const points = values.map((value, index) => [
    pad + (index / (values.length - 1)) * (width - pad * 2),
    pad + (1 - (value - min) / span) * (height - pad * 2),
  ]);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `M${points[0][0].toFixed(1)},${height} ${points.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} L${points.at(-1)[0].toFixed(1)},${height} Z`;
  const [lx, ly] = points.at(-1);
  return `<svg class="adm-spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false"><path class="area" d="${area}"/><polyline class="line" points="${line}"/><circle class="dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.5"/></svg>`;
}

/** 坐标轴：3 或 4 段，每段取 1 / 2 / 2.5 / 5 × 10ⁿ，选顶端最贴近数据的一种。 */
function niceScale(value) {
  const niceStep = (raw) => {
    const base = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].map((m) => m * base).find((step) => step >= raw);
  };
  return [3, 4].map((count) => ({ count, step: niceStep(Math.max(value, 1) / count) }))
    .map((scale) => ({ ...scale, max: scale.step * scale.count }))
    .sort((a, b) => a.max - b.max)[0];
}

/**
 * 7 日折线：SVG 只画网格与折线（preserveAspectRatio=none + 不缩放描边），
 * 圆点、坐标文字、悬停列用 HTML 按百分比定位，任何宽度下都清晰不变形。
 */
export function lineChart({ days, series, label }) {
  const scale = niceScale(Math.max(...series.flatMap((item) => item.values)));
  const max = scale.max;
  const ticks = Array.from({ length: scale.count + 1 }, (_, index) => scale.step * index);
  const n = days.length;
  const W = 600;
  const H = 240;
  const xp = (index) => (index / (n - 1)) * 100;
  const yp = (value) => (1 - value / max) * 100;
  const grid = ticks.map((tick) => `<line class="grid" x1="0" x2="${W}" y1="${(yp(tick) / 100) * H}" y2="${(yp(tick) / 100) * H}"/>`).join('');
  const lines = series.map((item) => `<polyline class="line" style="stroke:${item.color}" points="${item.values.map((value, index) => `${((xp(index) / 100) * W).toFixed(1)},${((yp(value) / 100) * H).toFixed(1)}`).join(' ')}"/>`).join('');
  const dots = series.map((item) => item.values.map((value, index) => `<i class="adm-chart-dot" data-i="${index}" style="left:${xp(index)}%;top:${yp(value)}%;--c:${item.color}"></i>`).join('')).join('');
  const cols = days.map((day, index) => {
    const left = Math.max(0, xp(index - 0.5));
    const right = Math.min(100, xp(index + 0.5));
    return `<button type="button" class="adm-chart-col" data-col="${index}" style="left:${left}%;width:${right - left}%" aria-label="${esc(`${day.long}：${series.map((item) => `${item.label} ${item.values[index]}`).join('，')}`)}"></button>`;
  }).join('');
  const html = `<div class="adm-chart" data-chart role="group" aria-label="${esc(label)}">
    <div class="adm-chart-y" aria-hidden="true">${ticks.map((tick) => `<span style="top:${yp(tick)}%">${tick}</span>`).join('')}</div>
    <div class="adm-chart-plot">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${grid}${lines}</svg>
      <span class="adm-chart-guide" hidden></span>
      ${dots}
      ${cols}
      <div class="adm-chart-tip" hidden></div>
    </div>
    <div class="adm-chart-x" aria-hidden="true">${days.map((day, index) => `<span style="left:${xp(index)}%">${esc(day.short)}</span>`).join('')}</div>
  </div>`;

  function mount(root) {
    for (const chart of $$('[data-chart]', root)) {
      if (chart.dataset.bound) continue;
      chart.dataset.bound = '1';
      const tip = $('.adm-chart-tip', chart);
      const guide = $('.adm-chart-guide', chart);
      const show = (index) => {
        guide.hidden = false;
        guide.style.left = `${xp(index)}%`;
        tip.hidden = false;
        tip.innerHTML = `<b>${esc(days[index].long)}</b>${series.map((item) => `<span class="row"><i style="--c:${item.color}"></i>${esc(item.label)}<b class="t-num">${item.values[index]}</b></span>`).join('')}`;
        tip.style.left = `${xp(index)}%`;
        tip.classList.toggle('to-left', index > (n - 1) / 2);
        $$('.adm-chart-dot', chart).forEach((dot) => dot.classList.toggle('is-on', Number(dot.dataset.i) === index));
      };
      const hide = () => {
        guide.hidden = true;
        tip.hidden = true;
        $$('.adm-chart-dot.is-on', chart).forEach((dot) => dot.classList.remove('is-on'));
      };
      chart.addEventListener('pointerover', (event) => { const col = event.target.closest('[data-col]'); if (col) show(Number(col.dataset.col)); });
      chart.addEventListener('pointerleave', hide);
      chart.addEventListener('focusin', (event) => { const col = event.target.closest('[data-col]'); if (col) show(Number(col.dataset.col)); });
      chart.addEventListener('focusout', hide);
    }
  }
  return { html, mount };
}
