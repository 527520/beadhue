// 内容类列表：作品管理、标签管理、官方批次。
import { icon } from '../../icons.js';
import { $, $$, esc, toast, openDialog } from '../../ui.js';
import { patternImage } from '../../beads.js';
import { works, WORK_STATUS, tags, TAG_ICONS, tagIconFor, batches, BATCH_STATUS, fmtDate, fmtAgo, fmtNum } from './data.js';
import { tableCard, mountTable, tableStore } from './table.js';
import { openDrawer, updateDrawer, setDrawerBadges, reasonDialog } from './overlay.js';
import { thumb, pixel, badge, person, muted, mono, num, titleCell, dl, block, timeline } from './cells.js';

const withQuery = (id, ctx) => { if (ctx.query.has('q')) { const state = tableStore(id); state.q = ctx.query.get('q'); state.page = 1; } };
const logOf = (item) => (item.log ??= []);
const addLog = (item, what) => logOf(item).unshift([fmtDate(0), '小鹿拼豆', what]);

// ================= 作品管理 =================
const statusBadge = (work) => badge(WORK_STATUS[work.status], { dot: true });
const publicCell = (work) => (work.isPublic ? badge(['公开', ''], { iconName: 'eye' }) : `<span class="adm-muted adm-inline">${icon('eye-off', 's16')}不公开</span>`);
const tagsCell = (list) => (list.length
  ? `<span class="adm-tagcell">${list.slice(0, 2).map((tag) => `<span class="badge">${esc(tag)}</span>`).join('')}${list.length > 2 ? `<span class="adm-more t-num">+${list.length - 2}</span>` : ''}</span>`
  : muted('—'));
const workFlags = (work) => `${work.featured ? `<span class="badge featured">${icon('star', 'fill')}精选</span>` : ''}${work.commentsLocked ? `<span class="adm-flag" title="评论已锁定">${icon('lock', 's16')}<span class="sr-only">评论已锁定</span></span>` : ''}`;

function workHistory(work) {
  const items = [...logOf(work)];
  if (work.status === 'removed' && work.removedReason) items.push([fmtDate(work.updatedMin), '阿布的豆盒', `下架：${work.removedReason}`]);
  if (work.featured && !logOf(work).length) items.push([fmtDate(work.updatedMin + 600), '小鹿拼豆', '设为精选']);
  items.push([fmtDate(work.publishedMin), '系统', work.status === 'pending' ? '提交审核' : '通过审核并发布']);
  return items;
}

function tagEditor(work) {
  const suggestions = tags.filter((tag) => tag.enabled && !work.tags.includes(tag.name)).slice(0, 5);
  return `<div class="adm-tags" data-tags>${work.tags.length
    ? work.tags.map((tag) => `<span class="chip">${esc(tag)}<button type="button" class="remove" data-tag-remove="${esc(tag)}" aria-label="移除标签「${esc(tag)}」">${icon('x', 's16')}</button></span>`).join('')
    : '<span class="adm-muted">还没有标签</span>'}</div>
  <form class="adm-tag-form" data-tag-form novalidate>
    <div class="field" data-tag-field>
      <div class="adm-tag-row"><input class="input" data-tag-input placeholder="输入标签名" aria-label="添加标签" maxlength="12" autocomplete="off"><button type="submit" class="btn btn-secondary">添加</button></div>
      <span class="error" hidden>${icon('circle-alert', 's16')}<span data-tag-error></span></span>
    </div>
    ${suggestions.length ? `<div class="adm-tag-suggest"><span class="adm-muted">常用</span>${suggestions.map((tag) => `<button type="button" class="chip outline" data-tag-add="${esc(tag.name)}">${icon('plus', 's16')}${esc(tag.name)}</button>`).join('')}</div>` : ''}
  </form>`;
}

function workBody(work) {
  return `<div class="adm-dw-top" tabindex="-1" autofocus>
      <div class="adm-dw-stage"><img src="${patternImage(work.pattern, 320)}" alt="${esc(work.title)}，豆粒预览"></div>
    </div>
    ${work.status === 'pending' ? `<p class="adm-note">${icon('info', 's16')}<span>这件作品还在审核队列里，通过前不会公开。</span></p>` : ''}
    ${work.status === 'removed' ? `<p class="adm-note is-danger">${icon('ban', 's16')}<span>已下架：${esc(work.removedReason ?? '未填写理由')}</span></p>` : ''}
    ${block('基本信息', dl([
      ['作者', person(work.author)],
      ['作品编号', mono(work.id)],
      ['尺寸', num(`${work.pattern.width}×${work.pattern.height}`)],
      ['颜色 / 颗数', num(`${work.colorCount} 色 · ${fmtNum(work.beads)} 颗`)],
      ['点赞 / 评论', num(`${fmtNum(work.likes)} · ${work.comments}`)],
      ['被引用', num(`${work.reuses} 次`)],
      ['发布时间', num(fmtDate(work.publishedMin))],
      ['更新时间', num(fmtDate(work.updatedMin))],
    ]), `<a class="t-link t-body-sm" href="#/works/${work.id}">在社区查看</a>`)}
    ${block('标签', tagEditor(work))}
    ${block('处理记录', timeline(workHistory(work)))}`;
}

function workFoot(work) {
  if (work.status === 'pending') return '<span class="spacer"></span><a class="btn btn-primary" href="#/admin/reviews" data-close>去审核</a>';
  return `${work.status === 'removed'
    ? '<button type="button" class="btn btn-outline" data-dw="restore">恢复上架</button>'
    : `<button type="button" class="btn btn-danger-outline" data-dw="takedown">${icon('ban', 's18')}下架</button>`}
    <span class="spacer"></span>
    <button type="button" class="btn btn-secondary" data-dw="lock">${icon(work.commentsLocked ? 'unlock' : 'lock', 's18')}${work.commentsLocked ? '解锁评论' : '锁定评论'}</button>
    ${work.status === 'normal' ? `<button type="button" class="btn ${work.featured ? 'btn-secondary' : 'btn-primary'}" data-dw="feature">${icon('star', 's18')}${work.featured ? '取消精选' : '设为精选'}</button>` : ''}`;
}
const workBadges = (work) => `${statusBadge(work)}${work.featured ? `<span class="badge featured">${icon('star', 'fill')}精选</span>` : ''}`;

function takedown(list, api, after) {
  const single = list.length === 1;
  reasonDialog({
    title: single ? `下架「${list[0].title}」` : `下架 ${list.length} 件作品`,
    subject: '下架后作品从发现页和搜索中消失，作者仍能在「我的」里看到。',
    label: '下架理由',
    hint: '作者会在通知里看到这条理由。',
    quick: ['疑似转载他人图纸', '含联系方式或广告', '图纸与原图不符'],
    confirm: single ? '确认下架' : `下架 ${list.length} 件`,
    onConfirm(reason) {
      const before = list.map((work) => ({ work, status: work.status, isPublic: work.isPublic, reason: work.removedReason }));
      list.forEach((work) => { work.status = 'removed'; work.isPublic = false; work.removedReason = reason; addLog(work, `下架：${reason}`); });
      api.clearSelection();
      api.changed();
      after?.();
      toast(single ? `已下架「${list[0].title}」` : `已下架 ${list.length} 件作品`, {
        action: { label: '撤销', onClick() { before.forEach(({ work, status, isPublic, reason: old }) => { work.status = status; work.isPublic = isPublic; work.removedReason = old; logOf(work).shift(); }); api.changed(); after?.(); toast('已撤销下架'); } },
      });
    },
  });
}

function toggleFeature(work, api) {
  work.featured = !work.featured;
  addLog(work, work.featured ? '设为精选' : '取消精选');
  api.changed();
  toast(work.featured ? `已将「${work.title}」设为精选` : `已取消「${work.title}」的精选`, { iconName: 'star' });
}
function toggleLock(work, api) {
  work.commentsLocked = !work.commentsLocked;
  addLog(work, work.commentsLocked ? '锁定评论' : '解锁评论');
  api.changed();
  toast(work.commentsLocked ? '已锁定评论，作品下不能再发新评论' : '已解锁评论', { iconName: work.commentsLocked ? 'lock' : 'unlock' });
}
function restore(work, api) {
  work.status = 'normal';
  work.isPublic = true;
  addLog(work, '恢复上架');
  api.changed();
  toast(`已恢复上架「${work.title}」`);
}

function openWork(work, api, done) {
  const refresh = (dialog) => { updateDrawer(dialog, { badges: workBadges(work), body: workBody(work), foot: workFoot(work) }); };
  openDrawer({
    title: work.title,
    body: workBody(work),
    foot: workFoot(work),
    onClose: done,
    onMount(dialog) {
      setDrawerBadges(dialog, workBadges(work));
      const showError = (text) => {
        const field = $('[data-tag-field]', dialog);
        field.classList.toggle('is-invalid', Boolean(text));
        $('.error', field).hidden = !text;
        $('[data-tag-error]', field).textContent = text;
      };
      const addTag = (name) => {
        const value = name.trim();
        if (!value) { showError('请输入标签名'); return; }
        if (work.tags.includes(value)) { showError(`已经有「${value}」这个标签了`); return; }
        work.tags.push(value);
        addLog(work, `添加标签「${value}」`);
        api.changed();
        refresh(dialog);
        $('[data-tag-input]', dialog)?.focus();
        toast(`已添加标签「${value}」`, { iconName: 'tag' });
      };
      dialog.addEventListener('submit', (event) => {
        if (!event.target.closest('[data-tag-form]')) return;
        event.preventDefault();
        addTag($('[data-tag-input]', dialog).value);
      });
      dialog.addEventListener('input', (event) => { if (event.target.closest('[data-tag-input]')) showError(''); });
      dialog.addEventListener('click', (event) => {
        const remove = event.target.closest('[data-tag-remove]');
        if (remove) {
          const name = remove.dataset.tagRemove;
          work.tags = work.tags.filter((tag) => tag !== name);
          addLog(work, `移除标签「${name}」`);
          api.changed();
          refresh(dialog);
          toast(`已移除标签「${name}」`, { action: { label: '撤销', onClick() { work.tags.push(name); logOf(work).shift(); api.changed(); if (dialog.isConnected) refresh(dialog); } } });
          return;
        }
        const add = event.target.closest('[data-tag-add]');
        if (add) { addTag(add.dataset.tagAdd); return; }
        const action = event.target.closest('[data-dw]')?.dataset.dw;
        if (action === 'feature') { toggleFeature(work, api); refresh(dialog); }
        if (action === 'lock') { toggleLock(work, api); refresh(dialog); }
        if (action === 'restore') { restore(work, api); refresh(dialog); }
        if (action === 'takedown') takedown([work], api, () => { if (dialog.isConnected) refresh(dialog); });
      });
    },
  });
}

function batchTagDialog(list, api) {
  const picked = new Set();
  const chips = () => tags.filter((tag) => tag.enabled).map((tag) => `<button type="button" class="chip ${picked.has(tag.name) ? 'is-selected' : ''}" aria-pressed="${picked.has(tag.name)}" data-pick-tag="${esc(tag.name)}">${esc(tag.name)}</button>`).join('');
  openDialog({
    title: `给 ${list.length} 件作品打标签`,
    body: `<p class="adm-confirm-text">选中的标签会追加到每件作品上，已有的标签保持不变。</p><div class="adm-chipgrid" data-chips>${chips()}</div>`,
    foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-apply disabled>添加标签</button>',
    onMount(dialog, close) {
      dialog.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-pick-tag]');
        if (chip) {
          const name = chip.dataset.pickTag;
          if (picked.has(name)) picked.delete(name); else picked.add(name);
          $('[data-chips]', dialog).innerHTML = chips();
          $(`[data-pick-tag="${name}"]`, dialog)?.focus();
          const apply = $('[data-apply]', dialog);
          apply.disabled = !picked.size;
          apply.textContent = picked.size ? `添加 ${picked.size} 个标签` : '添加标签';
          return;
        }
        if (event.target.closest('[data-apply]')) {
          list.forEach((work) => picked.forEach((name) => { if (!work.tags.includes(name)) work.tags.push(name); }));
          close();
          api.clearSelection();
          api.changed();
          toast(`已为 ${list.length} 件作品添加标签「${[...picked].join('、')}」`, { iconName: 'tag' });
        }
      });
    },
  });
}

const worksTable = {
  id: 'works',
  label: '作品列表',
  rows: () => works,
  rowId: (work) => work.id,
  rowName: (work) => work.title,
  searchText: (work) => `${work.title} ${work.author.name} ${work.id} ${work.tags.join(' ')}`,
  searchPlaceholder: '搜索标题、作者或编号',
  minWidth: 1000,
  selectable: true,
  filters: [
    { key: 'status', label: '状态', multi: true, options: Object.entries(WORK_STATUS).map(([value, [label]]) => [value, label]), match: (work, values) => values.includes(work.status) },
    { key: 'public', label: '公开', options: [['yes', '公开'], ['no', '不公开']], match: (work, value) => (value === 'yes') === work.isPublic },
    { key: 'tag', label: '标签', multi: true, options: () => tags.map((tag) => [tag.name, tag.name]), match: (work, values) => values.some((value) => work.tags.includes(value)) },
  ],
  columns: [
    { key: 'work', label: '作品', cls: 'adm-col-main', cell: (work) => titleCell(work.id, work.title, { lead: thumb(work.pattern), sub: mono(work.id), extra: workFlags(work) }) },
    { key: 'author', label: '作者', cell: (work) => person(work.author) },
    { key: 'status', label: '状态', cell: statusBadge },
    { key: 'public', label: '公开', cell: publicCell },
    { key: 'tags', label: '标签', cell: (work) => tagsCell(work.tags) },
    { key: 'likes', label: '点赞', align: 'end', sort: (a, b) => a.likes - b.likes, cell: (work) => num(fmtNum(work.likes)) },
    { key: 'updated', label: '更新时间', sort: (a, b) => b.updatedMin - a.updatedMin, cell: (work) => num(fmtDate(work.updatedMin)) },
  ],
  card: (work) => ({
    lead: thumb(work.pattern, '', 'lg'),
    title: work.title,
    meta: `${esc(work.author.name)} · <span class="t-num">${fmtDate(work.updatedMin)}</span>`,
    tail: `${statusBadge(work)}${work.isPublic ? badge(['公开', ''], { iconName: 'eye' }) : ''}${work.featured ? `<span class="badge featured">${icon('star', 'fill')}精选</span>` : ''}<span class="adm-muted adm-inline">${icon('heart', 's16')}<span class="t-num">${fmtNum(work.likes)}</span></span>`,
  }),
  batch: [
    { id: 'tag', prefix: '批量', label: '打标', icon: 'tag' },
    { id: 'feature', prefix: '设为', label: '精选', icon: 'star' },
    { id: 'takedown', label: '下架', icon: 'ban', danger: true },
  ],
  onBatch(action, list, api) {
    if (action === 'tag') batchTagDialog(list, api);
    if (action === 'takedown') takedown(list.filter((work) => work.status !== 'removed'), api);
    if (action === 'feature') {
      const target = list.filter((work) => work.status === 'normal' && !work.featured);
      if (!target.length) { toast('所选作品都已是精选，或未公开', { iconName: 'info' }); return; }
      target.forEach((work) => { work.featured = true; addLog(work, '设为精选'); });
      api.clearSelection();
      api.changed();
      toast(`已将 ${target.length} 件作品设为精选`, { iconName: 'star', action: { label: '撤销', onClick() { target.forEach((work) => { work.featured = false; logOf(work).shift(); }); api.changed(); } } });
    }
  },
  menu: (work) => [
    { id: 'view', label: '查看详情', icon: 'eye' },
    { id: 'open', label: '在社区打开', icon: 'external-link' },
    ...(work.status === 'normal' ? [{ id: 'feature', label: work.featured ? '取消精选' : '设为精选', icon: 'star' }] : []),
    { id: 'lock', label: work.commentsLocked ? '解锁评论' : '锁定评论', icon: work.commentsLocked ? 'unlock' : 'lock' },
    { sep: true },
    work.status === 'removed' ? { id: 'restore', label: '恢复上架', icon: 'refresh-cw' } : { id: 'takedown', label: '下架…', icon: 'ban', danger: true, disabled: work.status === 'pending' },
  ],
  onMenu(action, work, api) {
    if (action === 'view') openWork(work, api, () => {});
    if (action === 'open') location.hash = `#/works/${work.id}`;
    if (action === 'feature') toggleFeature(work, api);
    if (action === 'lock') toggleLock(work, api);
    if (action === 'restore') restore(work, api);
    if (action === 'takedown') takedown([work], api);
  },
  onOpen: openWork,
  exportCsv: {
    filename: '豆色绘-作品.csv',
    columns: [['编号', (w) => w.id], ['标题', (w) => w.title], ['作者', (w) => w.author.name], ['状态', (w) => WORK_STATUS[w.status][0]], ['公开', (w) => (w.isPublic ? '是' : '否')], ['标签', (w) => w.tags.join('、')], ['点赞', (w) => w.likes], ['更新时间', (w) => fmtDate(w.updatedMin)]],
  },
  emptyFiltered: '没有符合条件的作品',
};

export const worksSection = {
  id: 'works',
  label: '作品管理',
  desc: '查看全部作品，打标签、设为精选或下架。',
  render(ctx) { withQuery('works', ctx); return tableCard(worksTable); },
  mount(root, ctx, shell) {
    const { cleanup } = mountTable(root, worksTable, { onChange: shell.refreshCounts, openId: ctx.query.get('id') });
    return cleanup;
  },
};

// ================= 标签管理 =================
function tagForm(tag) {
  const current = TAG_ICONS.find((item) => item.pattern === tag?.icon)?.motif ?? tag?.iconMotif ?? '';
  return `<form class="adm-form" data-tag-edit novalidate>
    <div class="field" data-name-field>
      <label for="adm-tag-name">名称</label>
      <input class="input" id="adm-tag-name" name="name" value="${esc(tag?.name ?? '')}" maxlength="8" autocomplete="off" ${tag ? '' : 'autofocus'}>
      <span class="hint">发现页类目条上显示的文字，最多 8 个字。</span>
      <span class="error" hidden>${icon('circle-alert', 's16')}<span data-name-error></span></span>
    </div>
    <fieldset class="adm-fieldset">
      <legend class="field-label">像素图标</legend>
      <div class="adm-iconpick" role="radiogroup" aria-label="像素图标">${tag && !current ? `<label class="adm-iconopt"><input type="radio" name="icon" value="" checked>${pixel(tag.icon, '当前图标')}</label>` : ''}${TAG_ICONS.map((item) => `<label class="adm-iconopt"><input type="radio" name="icon" value="${item.motif}" ${item.motif === current ? 'checked' : ''}>${pixel(item.pattern, item.motif)}</label>`).join('')}</div>
    </fieldset>
    <label class="adm-switchrow"><span><b>在类目条显示</b><small>显示在发现页顶部，按排序先后排列</small></span><input type="checkbox" class="switch" name="featured" ${tag?.featured ?? true ? 'checked' : ''}></label>
    <label class="adm-switchrow"><span><b>启用</b><small>停用后作品仍保留标签，但前台不再显示</small></span><input type="checkbox" class="switch" name="enabled" ${tag?.enabled ?? true ? 'checked' : ''}></label>
  </form>`;
}
function readTagForm(dialog, existing) {
  const form = $('[data-tag-edit]', dialog);
  const name = form.name.value.trim();
  const field = $('[data-name-field]', dialog);
  const error = !name ? '请填写标签名称' : tags.some((tag) => tag.name === name && tag !== existing) ? `已经有「${name}」这个标签了` : '';
  field.classList.toggle('is-invalid', Boolean(error));
  $('.error', field).hidden = !error;
  $('.hint', field).hidden = Boolean(error);
  $('[data-name-error]', field).textContent = error;
  if (error) { form.name.focus(); return null; }
  return { name, motif: form.icon.value, featured: form.featured.checked, enabled: form.enabled.checked };
}

function moveTag(tag, delta, api) {
  const sorted = [...tags].sort((a, b) => a.order - b.order);
  const index = sorted.indexOf(tag);
  const other = sorted[index + delta];
  if (!other) return;
  [tag.order, other.order] = [other.order, tag.order];
  api.changed();
  toast(`「${tag.name}」已${delta < 0 ? '上移' : '下移'}到第 ${tag.order} 位`);
}

function openTag(tag, api, done) {
  openDrawer({
    title: `编辑标签「${tag.name}」`,
    body: `<div class="adm-dw-top adm-tag-preview" tabindex="-1" autofocus>${pixel(tag.icon, '')}<div><b>${esc(tag.name)}</b><span class="adm-muted">${tag.count} 件作品 · 排序第 ${tag.order} 位</span></div></div>${tagForm(tag)}`,
    foot: '<button type="button" class="btn btn-danger-outline" data-dw="delete">删除标签</button><span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-dw="save">保存</button>',
    onClose: done,
    onMount(dialog, close) {
      dialog.addEventListener('click', (event) => {
        const action = event.target.closest('[data-dw]')?.dataset.dw;
        if (action === 'save') {
          const value = readTagForm(dialog, tag);
          if (!value) return;
          Object.assign(tag, { name: value.name, featured: value.featured, enabled: value.enabled });
          if (value.motif) tag.icon = tagIconFor(value.motif);
          close();
          api.changed();
          toast(`已保存标签「${tag.name}」`);
        }
        if (action === 'delete') {
          reasonDialog({
            title: `删除标签「${tag.name}」`,
            subject: `${tag.count} 件作品会同时去掉这个标签，删除后无法恢复。`,
            label: '删除原因',
            quick: ['重复标签', '不再使用'],
            confirm: '删除标签',
            onConfirm() {
              tags.splice(tags.indexOf(tag), 1);
              close();
              api.changed();
              toast(`已删除标签「${tag.name}」`);
            },
          });
        }
      });
    },
  });
}

const tagsTable = {
  id: 'tags',
  label: '标签列表',
  rows: () => [...tags].sort((a, b) => a.order - b.order),
  rowId: (tag) => tag.id,
  rowName: (tag) => tag.name,
  searchText: (tag) => tag.name,
  searchPlaceholder: '搜索标签',
  minWidth: 760,
  filters: [
    { key: 'state', label: '状态', options: [['on', '启用'], ['off', '停用']], match: (tag, value) => (value === 'on') === tag.enabled },
  ],
  columns: [
    { key: 'name', label: '标签', cls: 'adm-col-main', cell: (tag) => titleCell(tag.id, tag.name, { lead: `<span class="adm-pixel-tile">${pixel(tag.icon, '')}</span>` }) },
    { key: 'count', label: '作品数', align: 'end', sort: (a, b) => a.count - b.count, cell: (tag) => num(tag.count) },
    { key: 'order', label: '排序', align: 'end', cell: (tag) => num(tag.order) },
    { key: 'featured', label: '类目条', cell: (tag) => `<input type="checkbox" class="switch" data-tag-featured="${esc(tag.id)}" ${tag.featured ? 'checked' : ''} aria-label="在类目条显示「${esc(tag.name)}」">` },
    { key: 'enabled', label: '状态', cell: (tag) => badge(tag.enabled ? ['启用', 'success'] : ['停用', ''], { dot: true }) },
  ],
  card: (tag) => ({
    lead: `<span class="adm-pixel-tile">${pixel(tag.icon, '')}</span>`,
    title: tag.name,
    meta: `<span class="t-num">${tag.count}</span> 件作品 · 排序 <span class="t-num">${tag.order}</span>`,
    tail: `${badge(tag.enabled ? ['启用', 'success'] : ['停用', ''], { dot: true })}${tag.featured ? badge(['类目条', '']) : ''}`,
  }),
  menu: (tag) => [
    { id: 'edit', label: '编辑', icon: 'pencil' },
    { id: 'up', label: '上移', icon: 'chevron-up', disabled: tag.order === 1 },
    { id: 'down', label: '下移', icon: 'chevron-down', disabled: tag.order === tags.length },
    { id: 'toggle', label: tag.enabled ? '停用' : '启用', icon: tag.enabled ? 'eye-off' : 'eye' },
  ],
  onMenu(action, tag, api) {
    if (action === 'edit') openTag(tag, api, () => {});
    if (action === 'up') moveTag(tag, -1, api);
    if (action === 'down') moveTag(tag, 1, api);
    if (action === 'toggle') { tag.enabled = !tag.enabled; api.changed(); toast(tag.enabled ? `已启用「${tag.name}」` : `已停用「${tag.name}」`); }
  },
  onOpen: openTag,
  emptyFiltered: '没有符合条件的标签',
};

function newTagDialog(api) {
  openDialog({
    title: '新建标签',
    body: tagForm(null),
    foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-create>创建标签</button>',
    onMount(dialog, close) {
      $('[data-create]', dialog).addEventListener('click', () => {
        const value = readTagForm(dialog, null);
        if (!value) return;
        tags.push({ id: value.name, name: value.name, icon: tagIconFor(value.motif || 'heart'), order: tags.length + 1, featured: value.featured, enabled: value.enabled, count: 0 });
        close();
        api.changed();
        toast(`已创建标签「${value.name}」`, { iconName: 'tag' });
      });
    },
  });
}

export const tagsSection = {
  id: 'tags',
  label: '标签管理',
  desc: '维护发现页类目：名称、像素图标与排序。',
  actions: () => `<button type="button" class="btn btn-primary" data-new-tag>${icon('plus')}新建标签</button>`,
  render(ctx) { withQuery('tags', ctx); return tableCard(tagsTable); },
  mount(root, ctx, shell) {
    const { api, cleanup } = mountTable(root, tagsTable, { onChange: shell.refreshCounts, openId: ctx.query.get('id') });
    const onClick = (event) => { if (event.target.closest('[data-new-tag]')) newTagDialog(api); };
    const onChange = (event) => {
      const box = event.target.closest('[data-tag-featured]');
      if (!box) return;
      const tag = tags.find((item) => item.id === box.dataset.tagFeatured);
      tag.featured = box.checked;
      toast(box.checked ? `「${tag.name}」已显示在类目条` : `「${tag.name}」已从类目条隐藏`);
    };
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    return () => { cleanup(); root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); };
  },
};

// ================= 官方批次 =================
const batchStatus = (batch) => badge(BATCH_STATUS[batch.status], { dot: true });
const progressCell = (batch) => `<span class="adm-progress"><span class="progress"><i style="width:${Math.round((batch.done / batch.total) * 100)}%"></i></span><span class="t-num">${batch.done} / ${batch.total}</span></span>`;

function batchBody(batch) {
  const items = batch.sample.length ? batch.sample : [];
  return `<div class="adm-dw-top" tabindex="-1" autofocus>
    ${dl([
      ['状态', batchStatus(batch)],
      ['批次编号', mono(batch.id)],
      ['制作规格', esc(batch.spec)],
      ['创建人', person(batch.creator)],
      ['已生成', num(`${batch.done} / ${batch.total} 张`)],
      ['失败', batch.failed ? `<span class="adm-danger-text t-num">${batch.failed} 张 · 原图无法解码</span>` : num('0')],
    ])}
    <div class="adm-progress is-wide"><span class="progress"><i style="width:${Math.round((batch.done / batch.total) * 100)}%"></i></span><span class="t-num">${Math.round((batch.done / batch.total) * 100)}%</span></div>
  </div>
  ${block('草稿预览', items.length ? `<ul class="adm-batchgrid" role="list">${items.map((work, index) => `<li><img src="${patternImage(work.pattern, 160)}" alt="${esc(work.title)}"><span class="ellipsis">${esc(work.title)}</span>${batch.status === 'failed' && index === items.length - 1 ? badge(['失败', 'danger']) : batch.status === 'published' ? badge(['已发布', 'success']) : badge(['待核对', ''])}</li>`).join('')}</ul>` : '<p class="adm-muted">还没有选择图片。</p>')}`;
}
function batchFoot(batch) {
  const primary = batch.status === 'running' ? `<button type="button" class="btn btn-primary" data-dw="publish">发布已核对的 ${batch.done} 张</button>`
    : batch.status === 'failed' ? '<button type="button" class="btn btn-primary" data-dw="retry">重试失败的 3 张</button>'
    : batch.status === 'draft' ? '<button type="button" class="btn btn-primary" data-dw="start">选择图片</button>' : '';
  return `<button type="button" class="btn btn-danger-outline" data-dw="delete">删除批次</button><span class="spacer"></span>${primary || '<button type="button" class="btn btn-secondary" data-close>关闭</button>'}`;
}
function openBatch(batch, api, done) {
  openDrawer({
    title: batch.name,
    body: batchBody(batch),
    foot: batchFoot(batch),
    onClose: done,
    onMount(dialog, close) {
      dialog.addEventListener('click', (event) => {
        const action = event.target.closest('[data-dw]')?.dataset.dw;
        if (action === 'publish') { batch.status = 'published'; batch.total = batch.done; api.changed(); updateDrawer(dialog, { body: batchBody(batch), foot: batchFoot(batch) }); toast(`已发布 ${batch.done} 张官方作品`); }
        if (action === 'retry') { batch.failed = 0; batch.done = batch.total; batch.status = 'running'; api.changed(); updateDrawer(dialog, { body: batchBody(batch), foot: batchFoot(batch) }); toast('失败的 3 张已重新生成'); }
        if (action === 'start') toast('原型里不打开文件选择；正式版会在这里批量选图', { iconName: 'info' });
        if (action === 'delete') {
          reasonDialog({
            title: `删除批次「${batch.name}」`,
            subject: '未发布的草稿会一起删除，已发布的作品不受影响。',
            label: '删除原因',
            quick: ['重复创建', '素材有问题'],
            confirm: '删除批次',
            onConfirm() { batches.splice(batches.indexOf(batch), 1); close(); api.changed(); toast(`已删除批次「${batch.name}」`); },
          });
        }
      });
    },
  });
}

const batchesTable = {
  id: 'batches',
  label: '批次列表',
  rows: () => batches,
  rowId: (batch) => batch.id,
  rowName: (batch) => batch.name,
  searchText: (batch) => `${batch.name} ${batch.id}`,
  searchPlaceholder: '搜索批次名称或编号',
  minWidth: 900,
  filters: [
    { key: 'status', label: '状态', multi: true, options: Object.entries(BATCH_STATUS).map(([value, [label]]) => [value, label]), match: (batch, values) => values.includes(batch.status) },
  ],
  columns: [
    { key: 'name', label: '批次', cls: 'adm-col-main', cell: (batch) => titleCell(batch.id, batch.name, { lead: batch.sample[0] ? thumb(batch.sample[0].pattern) : `<span class="adm-icon-tile" aria-hidden="true">${icon('layers', 's18')}</span>`, sub: mono(batch.id) }) },
    { key: 'total', label: '数量', align: 'end', cell: (batch) => num(`${batch.total} 张`) },
    { key: 'progress', label: '进度', cell: progressCell },
    { key: 'status', label: '状态', cell: batchStatus },
    { key: 'spec', label: '规格', cell: (batch) => esc(batch.spec) },
    { key: 'creator', label: '创建人', cell: (batch) => person(batch.creator) },
    { key: 'updated', label: '更新时间', sort: (a, b) => b.updatedMin - a.updatedMin, cell: (batch) => num(fmtAgo(batch.updatedMin)) },
  ],
  card: (batch) => ({
    lead: batch.sample[0] ? thumb(batch.sample[0].pattern, '', 'lg') : `<span class="adm-icon-tile lg" aria-hidden="true">${icon('layers', 's18')}</span>`,
    title: batch.name,
    meta: `${esc(batch.creator.name)} · ${fmtAgo(batch.updatedMin)}`,
    tail: `${batchStatus(batch)}${progressCell(batch)}`,
  }),
  menu: (batch) => [
    { id: 'view', label: '查看详情', icon: 'eye' },
    { sep: true },
    { id: 'delete', label: '删除批次…', icon: 'trash-2', danger: true },
  ],
  onMenu(action, batch, api) {
    if (action === 'view') openBatch(batch, api, () => {});
    if (action === 'delete') reasonDialog({ title: `删除批次「${batch.name}」`, subject: '未发布的草稿会一起删除，已发布的作品不受影响。', label: '删除原因', quick: ['重复创建', '素材有问题'], confirm: '删除批次', onConfirm() { batches.splice(batches.indexOf(batch), 1); api.changed(); toast(`已删除批次「${batch.name}」`); } });
  },
  onOpen: openBatch,
  emptyTitle: '还没有官方批次',
  emptyFiltered: '没有符合条件的批次',
};

function newBatchDialog(api) {
  openDialog({
    title: '新建官方批次',
    body: `<form class="adm-form" novalidate>
      <div class="field" data-field><label for="adm-batch-name">批次名称</label><input class="input" id="adm-batch-name" maxlength="20" autofocus autocomplete="off"><span class="hint">例如：秋日动物系列</span><span class="error" hidden>${icon('circle-alert', 's16')}<span>请填写批次名称</span></span></div>
      <div class="field"><span class="field-label">制作规格</span><div class="adm-chipgrid" role="radiogroup" aria-label="制作规格"><button type="button" class="chip is-selected" aria-pressed="true" data-spec>5mm · 29×29</button><button type="button" class="chip" aria-pressed="false" data-spec>2.6mm · 29×29</button></div></div>
      <p class="adm-muted">创建后在批次详情里选图；图纸在本机浏览器生成，每张保存为官方草稿，核对后统一发布。</p>
    </form>`,
    foot: '<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-primary" data-create>创建批次</button>',
    onMount(dialog, close) {
      dialog.addEventListener('click', (event) => {
        const spec = event.target.closest('[data-spec]');
        if (spec) { $$('[data-spec]', dialog).forEach((node) => { node.classList.toggle('is-selected', node === spec); node.setAttribute('aria-pressed', String(node === spec)); }); return; }
        if (!event.target.closest('[data-create]')) return;
        const input = $('#adm-batch-name', dialog);
        const field = $('[data-field]', dialog);
        const ok = Boolean(input.value.trim());
        field.classList.toggle('is-invalid', !ok);
        $('.error', field).hidden = ok;
        $('.hint', field).hidden = !ok;
        if (!ok) { input.focus(); return; }
        batches.unshift({ id: `b-${2610 + batches.length}`, name: input.value.trim(), total: 0, done: 0, failed: 0, status: 'draft', creator: { name: '小鹿拼豆', color: 'var(--ink-3)' }, updatedMin: 0, spec: $('[data-spec].is-selected', dialog).textContent, sample: [] });
        close();
        api.changed();
        toast(`已创建批次「${input.value.trim()}」`);
      });
    },
  });
}

export const batchesSection = {
  id: 'batches',
  label: '官方批次',
  desc: '批量生成官方作品，核对后统一发布。',
  actions: () => `<button type="button" class="btn btn-primary" data-new-batch>${icon('plus')}新建批次</button>`,
  render(ctx) { withQuery('batches', ctx); return tableCard(batchesTable); },
  mount(root, ctx, shell) {
    const { api, cleanup } = mountTable(root, batchesTable, { onChange: shell.refreshCounts, openId: ctx.query.get('id') });
    const onClick = (event) => { if (event.target.closest('[data-new-batch]')) newBatchDialog(api); };
    root.addEventListener('click', onClick);
    return () => { cleanup(); root.removeEventListener('click', onClick); };
  },
};
