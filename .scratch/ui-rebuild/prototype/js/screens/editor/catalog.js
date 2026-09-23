// 色板、制作规格、套装档位与豆粒小色块：创作入口与编辑器共用。
import { BEADS } from '../../../motifs.js';
import { icon } from '../../icons.js';
import { esc } from '../../ui.js';

export const BEAD_KEYS = Object.keys(BEADS);

// 制作规格：豆径 + 底板行列数（D46）。50 与 52 钉距互不兼容。
export const SPECS = [
  { id: '5-29', label: '5mm · 29×29', mm: '5mm', board: 29 },
  { id: '26-50', label: '2.6mm · 50×50', mm: '2.6mm', board: 50 },
  { id: '26-52', label: '2.6mm · 52×52', mm: '2.6mm', board: 52 },
];

// 内置色板：只列原型需要的七套；specs 为该色板支持的制作规格。band 只用于色带预览。
export const PALETTES = [
  { id: 'mard-291', name: 'MARD 豆色绘经典', count: 291, specs: ['5-29'], band: 'RYGBKPoC' },
  { id: 'mard-221', name: 'MARD 221 核对版', count: 221, specs: ['5-29', '26-50', '26-52'], band: 'DOYEBVtS' },
  { id: 'coco-291', name: 'COCO', count: 291, specs: ['5-29'], band: 'PRoygCbv' },
  { id: 'manman-278', name: '漫漫', count: 278, specs: ['5-29'], band: 'ROYGBVMW' },
  { id: 'panpan-289', name: '盼盼', count: 289, specs: ['5-29'], band: 'pPDoTtKs' },
  { id: 'mixiaowo-290', name: '咪小窝', count: 290, specs: ['5-29'], band: 'CbBgGEyY' },
  { id: 'artkal-c-197', name: 'Artkal C', count: 197, specs: ['26-50', '26-52'], band: 'KSsWBbVv' },
];

// 套装档位（D43）：只显示不超过色板可生成颜色数的档位。
export const KIT_TIERS = [24, 48, 72, 96, 144];

export const specById = (id) => SPECS.find((spec) => spec.id === id) ?? SPECS[0];
export const paletteById = (id) => PALETTES.find((palette) => palette.id === id) ?? PALETTES[0];
export const paletteLabel = (palette) => `${palette.name} · ${palette.count} 色`;
export const kitLabel = (kit, palette) => (kit === 'all' ? `全部 ${palette.count} 色` : `${kit} 色套装`);
export const kitOptions = (palette) => ['all', ...KIT_TIERS.filter((tier) => tier <= palette.count)];

export function paletteSizes(palette) {
  return [...new Set(palette.specs.map((id) => specById(id).mm))].join(' / ');
}

/** 选到不兼容的色板时原子切换到该色板的默认规格。 */
export function fitSpec(paletteId, specId) {
  const palette = paletteById(paletteId);
  return palette.specs.includes(specId) ? specId : palette.specs[0];
}

/** 规格不被当前色板支持时返回说明，否则返回空串。 */
export function specBlockReason(paletteId, specId) {
  const palette = paletteById(paletteId);
  return palette.specs.includes(specId) ? '' : `${palette.name} 只支持 ${paletteSizes(palette)}`;
}

export const boardWidths = (board) => [1, 2, 3].map((boards) => ({ boards, width: boards * board }));
export function boardsOf(width, height, board) {
  const cols = Math.ceil(width / board);
  const rows = Math.ceil(height / board);
  return { cols, rows, total: cols * rows };
}

export const fmt = (value) => Number(value).toLocaleString('zh-CN');
export const bead = (key) => ({ key, ...BEADS[key] });
export const beadLabel = (key) => (key ? `${BEADS[key].code} ${BEADS[key].name}` : '留空');

/** 豆粒色块：带孔圆豆，size 为 CSS 尺寸类（sm / md / lg / xl）。 */
export function swatch(key, size = 'md') {
  return `<span class="bead-sw ${size}" style="--c:${BEADS[key].hex}" aria-hidden="true"></span>`;
}

export function paletteBand(palette) {
  return `<span class="pal-band" aria-hidden="true">${palette.band.split('').map((key) => `<i style="--c:${BEADS[key].hex}"></i>`).join('')}</span>`;
}

/** 色板弹出层：色带 + 名称 + 颜色数 + 适用规格，当前项右侧打勾。 */
export function paletteMenu(currentId) {
  return `<div class="pal-menu" role="listbox" aria-label="选择色板">${PALETTES.map((palette) => `
    <button type="button" class="menu-item pal-item" role="option" data-pick-palette="${palette.id}" aria-selected="${palette.id === currentId}">
      ${paletteBand(palette)}
      <span class="grow"><span class="pal-name">${esc(palette.name)}</span><span class="pal-meta">${palette.count} 色 · ${paletteSizes(palette)}</span></span>
      ${palette.id === currentId ? `<span class="check">${icon('check', 's18')}</span>` : ''}
    </button>`).join('')}</div>`;
}

/** 制作规格弹出层：当前色板不支持的规格保留但禁用，并写明原因。 */
export function specMenu(currentId, paletteId) {
  return `<div role="listbox" aria-label="选择制作规格">${SPECS.map((spec) => {
    const reason = specBlockReason(paletteId, spec.id);
    return `<button type="button" class="menu-item pal-item" role="option" data-pick-spec="${spec.id}" aria-selected="${spec.id === currentId}" ${reason ? 'disabled' : ''}>
      <span class="grow"><span class="pal-name">${spec.label}</span><span class="pal-meta">${reason || `每块底板 ${spec.board}×${spec.board} 格`}</span></span>
      ${spec.id === currentId ? `<span class="check">${icon('check', 's18')}</span>` : ''}
    </button>`;
  }).join('')}</div>`;
}

export function kitMenu(current, paletteId) {
  const palette = paletteById(paletteId);
  return `<div role="listbox" aria-label="选择套装档位">${kitOptions(palette).map((kit) => `
    <button type="button" class="menu-item" role="option" data-pick-kit="${kit}" aria-selected="${String(kit) === String(current)}">
      <span class="grow">${kitLabel(kit, palette)}</span>
      ${String(kit) === String(current) ? `<span class="check">${icon('check', 's18')}</span>` : ''}
    </button>`).join('')}</div>`;
}

/** 选择按钮：白底描边，左侧可选前缀，右侧箭头。 */
export function pickerButton({ attr, label, prefix = '', aria }) {
  return `<button type="button" class="select picker" ${attr} aria-haspopup="listbox" aria-label="${esc(aria)}：${esc(label)}">${prefix}<span class="grow ellipsis">${esc(label)}</span>${icon('chevron-down')}</button>`;
}

/** 弹窗里打开的弹出层要压在遮罩之上。 */
export function liftPopover(node) {
  if (node) node.style.zIndex = '85';
  return node;
}

export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = () => (isMac() ? '⌘' : 'Ctrl+');
export const shiftModKey = () => (isMac() ? '⇧⌘' : 'Ctrl+Shift+');
