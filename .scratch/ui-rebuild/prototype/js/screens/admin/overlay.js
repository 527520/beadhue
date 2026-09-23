// 后台弹层：右侧详情抽屉（手机为底部面板）、填写理由的危险确认弹窗、行操作菜单。
import { icon } from '../../icons.js';
import { $, $$, esc, openDialog, openPopover } from '../../ui.js';

/** 详情抽屉：复用 openDialog 的遮罩、Esc、焦点圈定与手机底部面板，只换成右侧 480px 的版式。 */
export function openDrawer({ title, body, foot = '', label = title, onMount, onClose }) {
  return openDialog({ title, body, foot, size: 'adm-drawer', label, onMount, onClose });
}

/** 就地更新抽屉内容，并把焦点还给同一个动作按钮。 */
export function updateDrawer(dialog, { title, badges, body, foot }) {
  const focusKey = document.activeElement?.closest?.('[data-dw]')?.dataset.dw;
  if (title !== undefined) $('.dialog-head h2', dialog).textContent = title;
  if (badges !== undefined) setDrawerBadges(dialog, badges);
  if (body !== undefined) $('.dialog-body', dialog).innerHTML = body;
  if (foot !== undefined) $('.dialog-foot', dialog).innerHTML = foot;
  if (focusKey) $(`[data-dw="${focusKey}"]`, dialog)?.focus();
}

/** 抽屉标题后面的状态徽标（openDialog 的标题只接受纯文本）。 */
export function setDrawerBadges(dialog, html) {
  const head = $('.dialog-head', dialog);
  let slot = $('.adm-dw-badges', head);
  if (!slot) {
    slot = document.createElement('div');
    slot.className = 'adm-dw-badges';
    $('h2', head).after(slot);
  }
  slot.innerHTML = html;
}

/** 危险操作的确认：理由至少 min 个字，字段下方给出错误，最终按钮用 danger。 */
export function reasonDialog({ title, subject = '', label = '理由', hint = '', quick = [], confirm = '确认', min = 3, onConfirm }) {
  const id = `adm-reason-${Math.random().toString(36).slice(2, 8)}`;
  openDialog({
    title,
    body: `<form class="adm-reason" data-reason-form novalidate>
      ${subject ? `<p class="t-body-sm t-muted">${esc(subject)}</p>` : ''}
      ${quick.length ? `<div class="adm-quick" role="group" aria-label="常用理由">${quick.map((text) => `<button type="button" class="chip outline" data-quick aria-pressed="false">${esc(text)}</button>`).join('')}</div>` : ''}
      <div class="field" data-field>
        <label for="${id}">${esc(label)}</label>
        <textarea class="textarea" id="${id}" rows="3" maxlength="200" autofocus></textarea>
        ${hint ? `<span class="hint" data-hint>${esc(hint)}</span>` : ''}
        <span class="error" hidden>${icon('circle-alert', 's16')}<span>请至少写 ${min} 个字，说明具体原因</span></span>
      </div>
    </form>`,
    foot: `<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn btn-danger" data-reason-submit>${esc(confirm)}</button>`,
    onMount(dialog, close) {
      const area = $('textarea', dialog);
      const field = $('[data-field]', dialog);
      const setInvalid = (invalid) => {
        field.classList.toggle('is-invalid', invalid);
        $('.error', field).hidden = !invalid;
        const hintNode = $('[data-hint]', field);
        if (hintNode) hintNode.hidden = invalid;
        area.setAttribute('aria-invalid', String(invalid));
      };
      const syncQuick = () => $$('[data-quick]', dialog).forEach((chip) => {
        const on = chip.textContent === area.value.trim();
        chip.classList.toggle('is-selected', on);
        chip.setAttribute('aria-pressed', String(on));
      });
      const submit = () => {
        if (area.value.trim().length < min) { setInvalid(true); area.focus(); return; }
        close();
        onConfirm(area.value.trim());
      };
      dialog.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-quick]');
        if (chip) { area.value = chip.textContent; setInvalid(false); syncQuick(); area.focus(); return; }
        if (event.target.closest('[data-reason-submit]')) submit();
      });
      area.addEventListener('input', () => { if (field.classList.contains('is-invalid') && area.value.trim().length >= min) setInvalid(false); syncQuick(); });
      area.addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(); });
      $('[data-reason-form]', dialog).addEventListener('submit', (event) => { event.preventDefault(); submit(); });
    },
  });
}

/** 行操作菜单：桌面锚定弹出层，手机底部面板；危险项红字置底并分隔。 */
export function openMenu(anchor, items, { title = '操作', onPick }) {
  const html = `<div class="adm-menu" role="menu" aria-label="${esc(title)}">${items.map((item) => (item.sep
    ? '<div class="menu-sep" role="separator"></div>'
    : `<button type="button" class="menu-item ${item.danger ? 'danger' : ''}" role="menuitem" data-pick="${item.id}" ${item.disabled ? 'disabled' : ''}>${icon(item.icon)}<span class="grow">${esc(item.label)}</span>${item.trail ? `<span class="trail">${esc(item.trail)}</span>` : ''}</button>`)).join('')}</div>`;
  openPopover(anchor, html, {
    align: 'end',
    sheetTitle: title,
    onMount(node, close) {
      node.addEventListener('click', (event) => {
        const pick = event.target.closest('[data-pick]');
        if (!pick || pick.disabled) return;
        close();
        onPick(pick.dataset.pick);
      });
    },
  });
}

/** 简单确认（非危险）：例如批量设为精选前的说明。 */
export function confirmDialog({ title, text, confirm = '确认', danger = false, onConfirm }) {
  openDialog({
    title,
    body: `<p class="adm-confirm-text">${esc(text)}</p>`,
    foot: `<button type="button" class="btn btn-secondary" data-close>取消</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm ${danger ? '' : 'autofocus'}>${esc(confirm)}</button>`,
    onMount(dialog, close) {
      $('[data-confirm]', dialog).addEventListener('click', () => { close(); onConfirm(); });
    },
  });
}
